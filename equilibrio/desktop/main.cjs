const { app, BrowserWindow, shell, dialog, ipcMain, session } = require('electron');
const path = require('node:path');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
// Explicit, marked temporary profiles for validating the packaged executable.
if(process.argv.includes('--equilibrio-validation')) {
 const temporary=require('node:os').tmpdir(),profile=path.resolve(process.env.EQUILIBRIO_VALIDATION_ROOT||'');
 if(!profile.startsWith(path.resolve(temporary)+path.sep)||!fsSync.existsSync(path.join(profile,'.equilibrio-validation')))throw Error('Perfil de validação temporário não autorizado.');
 app.setPath('appData',profile);
}
// Keep user data outside the application installation directory and stable
// between reinstallations/updates. This is deliberately set before ready.
const persistentUserData = path.join(app.getPath('appData'), 'Financas Pessoais');
app.setPath('userData', persistentUserData);
const gotSingleInstanceLock = app.requestSingleInstanceLock();

// Recover pending file replacement before importing any application module or opening SQLite.
const { recoverBeforeLoad } = require('./update-recovery.cjs');
const requireUpdateSignature = app.isPackaged;
try {
  if (gotSingleInstanceLock) recoverBeforeLoad(path.resolve(__dirname,'..'),persistentUserData,{
    requireSignature: requireUpdateSignature,
  });
} catch (error) {
  dialog.showErrorBox('Equilíbrio - Recuperação da atualização', error.message);
  app.exit(1);
  throw error;
}
const { createServer } = require('../serve.cjs');
const { createTrustedIpc } = require('./ipc-guard.cjs');
const { draftStore } = require('./drafts.cjs');
const { decodeAttachment } = require('./attachment.cjs');
const { encryptBackup, decryptBackup } = require('./encrypted-backup.cjs');
const { APP_VERSION, APP_DISPLAY_VERSION, WEB_VERSION } = require('./version.cjs');
const { CURRENT_SCHEMA_VERSION } = require('./migrations.cjs');
const { CURRENT_DB_SCHEMA_VERSION } = require('./schema-migrations.cjs');
const { createSqliteStorage } = require('./storage-sqlite.cjs');
const { createDataService } = require('./data-service.cjs');
const { readAndValidatePackage, stageUpdate, launchDetachedHelper, readUpdateStatus, clearUpdateStatus } = require('./manual-updater.cjs');
const { isValidJsonText, resolveBackupText } = require('./snapshot-backup.cjs');
const { writeVerifiedAtomic } = require('./verified-backup.cjs');
const { prepareRestoreText } = require('./restore-validation.cjs');

// v0.39.5: prefer software rendering over Chromium GPU compositing. On some
// Windows drivers the previous accelerated path caused visible flicker while
// scrolling long views. This must be set before the app becomes ready.
app.disableHardwareAcceleration();

// Desktop v0.16: SQLite remains the durable source; access is centralized
// through data-service.cjs so storage rules no longer leak across the app.
// The renderer keeps localStorage only as a compatibility/cache layer while
// accounts, transactions, categories, debts and recurring items are re-read
// from their normalized SQLite tables before rendering after writes.
let sqliteStorage = null;
let dataService = null;
let sqliteInitError = null;
let mobileRuntime = null;
try {
  if (gotSingleInstanceLock) {
    sqliteStorage = createSqliteStorage(persistentUserData);
    dataService = createDataService(sqliteStorage);
    mobileRuntime = require('./mobile-sync-runtime.cjs').createMobileRuntime(sqliteStorage,persistentUserData,{safeStorage:require('electron').safeStorage,onChange:spaceId=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('equilibrio:mobile:changed',spaceId);}});
  }
} catch (error) {
  sqliteInitError = error;
  console.error('Não foi possível iniciar SQLite; o arranque foi interrompido para preservar os dados:', error);
}

const HOST = '127.0.0.1';
const AUTO_PREFIX = 'financas-pessoais-auto-';
let mainWindow = null;
let localServer = null;
let port = null;
let latestSnapshot = '';
let closingAfterBackup = false;
let updateInstallPending = false;
let updateDialogBusy = false;
let backupQueue = Promise.resolve();
let backupSettingsQueue = Promise.resolve();
const RUN_INSTANCE_TOKEN = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

function serializeBackupSettings(task) {
  const result = backupSettingsQueue.then(task);
  backupSettingsQueue = result.catch(() => {});
  return result;
}

function attachmentsTempDir() {
  return path.join(app.getPath('temp'), 'Financas-Pessoais', `comprovativos-${RUN_INSTANCE_TOKEN}`);
}

function cleanupStaleAttachmentTempDirs() {
  const base = path.join(app.getPath('temp'), 'Financas-Pessoais');
  const own = path.basename(attachmentsTempDir());
  try {
    const now = Date.now();
    for (const entry of fsSync.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === own) continue;
      if (entry.name === 'comprovativos' || entry.name.startsWith('comprovativos-')) {
        const full = path.join(base, entry.name);
        try {
          const st = fsSync.statSync(full);
          if (now - st.mtimeMs > 24 * 60 * 60 * 1000) fsSync.rmSync(full, { recursive: true, force: true });
        } catch {}
      }
    }
  } catch {}
}

// Only one installed instance should manipulate the same persistent state.
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function backupSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop-backup-settings.json');
}

function persistentStoragePath() {
  return path.join(app.getPath('userData'), 'browser-state.json');
}

function sanitizeStorageMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    if (key.length > 200) continue;
    clean[key] = value;
  }
  return clean;
}

function readLegacyStorageSync() {
  try {
    return sanitizeStorageMap(JSON.parse(fsSync.readFileSync(persistentStoragePath(), 'utf8')));
  } catch {
    return {};
  }
}

function readPersistentStorageSync() {
  if (sqliteStorage) return sanitizeStorageMap(sqliteStorage.readState());
  if (sqliteInitError) throw new Error('SQLite indisponível. Os dados foram preservados: ' + sqliteInitError);
  return readLegacyStorageSync();
}

async function writeJsonRecoveryMirror(clean) {
  // Share the synchronous writer: async IPC and unload IPC cannot interleave
  // writes to the same temporary file or overwrite a newer recovery snapshot.
  writeJsonRecoveryMirrorSync(clean);
}

function writeJsonRecoveryMirrorSync(clean) {
  const target = persistentStoragePath();
  const temp = `${target}.${crypto.randomUUID()}.tmp`;
  fsSync.mkdirSync(path.dirname(target), { recursive: true });
  try {
    const payload = JSON.stringify(sqliteStorage ? sqliteStorage.readState() : clean, null, 2);
    fsSync.writeFileSync(temp, payload, 'utf8');
    const written = fsSync.readFileSync(temp, 'utf8');
    if (Buffer.byteLength(written, 'utf8') !== Buffer.byteLength(payload, 'utf8') || !isValidJsonText(written)) {
      throw new Error('A cópia de recuperação JSON ficou incompleta durante a escrita.');
    }
    fsSync.renameSync(temp, target);
  } finally { fsSync.rmSync(temp, { force: true }); }
}

function repairJsonRecoveryMirrorFromSqlite() {
  if (!sqliteStorage) return { skipped: true, reason: 'sqlite-unavailable' };
  const target = persistentStoragePath();
  let current = '';
  try { current = fsSync.readFileSync(target, 'utf8'); } catch {}
  if (isValidJsonText(current)) return { skipped: true, reason: 'already-valid' };

  // O espelho JSON não é a base de dados. Se estiver truncado/corrompido,
  // preservamo-lo para diagnóstico e recriamo-lo a partir do SQLite.
  if (current) {
    try {
      const dir = path.join(app.getPath('userData'), 'safety-backups', 'corrupt-json-mirror');
      fsSync.mkdirSync(dir, { recursive: true });
      fsSync.copyFileSync(target, path.join(dir, `browser-state-corrupt-${timestampPart()}.json`));
    } catch (error) {
      console.warn('Não foi possível arquivar o espelho JSON corrompido:', error);
    }
  }
  writeJsonRecoveryMirrorSync(sqliteStorage.readState());
  return { repaired: true, path: target };
}

async function writePersistentStorage(raw) {
  const clean = sanitizeStorageMap(raw);
  if (sqliteStorage) sqliteStorage.writeCacheState ? sqliteStorage.writeCacheState(clean) : sqliteStorage.writeState(clean);
  else if (sqliteInitError) console.error('SQLite indisponível:', sqliteInitError);
  // Keep a human-readable recovery mirror. It is not the primary store.
  await writeJsonRecoveryMirror(clean);
  return {
    ok: true,
    keys: Object.keys(clean).length,
    path: sqliteStorage?.dbPath || persistentStoragePath(),
    mode: sqliteStorage ? 'SQLite' : 'JSON recovery fallback',
  };
}

function writePersistentStorageSync(raw) {
  try {
    const clean = sanitizeStorageMap(raw);
    if (sqliteStorage) sqliteStorage.writeCacheState ? sqliteStorage.writeCacheState(clean) : sqliteStorage.writeState(clean);
    writeJsonRecoveryMirrorSync(clean);
    return true;
  } catch (error) {
    console.error('Persistência síncrona falhou:', error);
    return false;
  }
}


async function replacePersistentStorage(raw) {
  mobileRuntime?.guardReplacement();
  const clean = sanitizeStorageMap(raw);
  if (sqliteStorage) sqliteStorage.writeState(clean);
  await writeJsonRecoveryMirror(clean);
  return {
    ok: true,
    keys: Object.keys(clean).length,
    path: sqliteStorage?.dbPath || persistentStoragePath(),
    mode: sqliteStorage ? 'SQLite full replace' : 'JSON recovery fallback',
  };
}

function replacePersistentStorageSync(raw) {
  mobileRuntime?.guardReplacement();
  let sqliteCommitted = false;
  try {
    const clean = sanitizeStorageMap(raw);
    if (sqliteStorage) { sqliteStorage.writeState(clean); sqliteCommitted = true; }
    writeJsonRecoveryMirrorSync(clean);
    return true;
  } catch (error) {
    console.error('Substituição completa síncrona falhou:', error);
    if (sqliteCommitted) return { ok: true, warning: 'Os dados foram guardados em SQLite, mas a cópia de recuperação JSON falhou: ' + error.message };
    return false;
  }
}

function sanitizeBackupSettings(raw = {}) {
  return {
    directory: typeof raw.directory === 'string' ? raw.directory : '',
    frequency: ['manual', 'daily', 'weekly'].includes(raw.frequency) ? raw.frequency : 'daily',
    retention: Math.max(1, Math.min(100, Math.floor(Number(raw.retention) || 30))),
    onClose: raw.onClose !== false,
    lastBackupAt: typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : '',
    lastBackupPath: typeof raw.lastBackupPath === 'string' ? raw.lastBackupPath : '',
  };
}

async function readBackupSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(backupSettingsPath(), 'utf8'));
    return sanitizeBackupSettings(raw);
  } catch {
    return sanitizeBackupSettings();
  }
}

async function writeBackupSettingsRaw(next) {
  const clean = sanitizeBackupSettings(next);
  await writeVerifiedAtomic(backupSettingsPath(), JSON.stringify(clean, null, 2), {
    stageDirectory: backupStagingDirectory(),
    retries: 2,
  });
  return clean;
}

async function writeBackupSettings(next) {
  return serializeBackupSettings(() => writeBackupSettingsRaw(next));
}

async function updateBackupSettings(mutator) {
  return serializeBackupSettings(async () => {
    const current = await readBackupSettings();
    const next = await mutator(current);
    return writeBackupSettingsRaw(next);
  });
}

function backupDue(settings) {
  if (!settings.directory || settings.frequency === 'manual') return false;
  const last = Date.parse(settings.lastBackupAt || '');
  if (!Number.isFinite(last)) return true;
  const interval = settings.frequency === 'weekly' ? 7 * 864e5 : 864e5;
  return Date.now() - last >= interval;
}

function timestampPart() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function pruneBackups(directory, retention) {
  let entries = [];
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
  const names = entries
    .filter((e) => e.isFile() && e.name.startsWith(AUTO_PREFIX) && (e.name.endsWith('.json') || e.name.endsWith('.db')))
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const name of names.slice(retention)) {
    try { await fs.unlink(path.join(directory, name)); } catch {}
  }
}

function createNativeBackup(content, options = {}) {
  const result = backupQueue.then(() => writeNativeBackup(content, options));
  backupQueue = result.catch(() => {});
  return result;
}

function backupStagingDirectory() {
  return path.join(app.getPath('userData'), 'safety-backups', 'write-staging');
}

function backupFallbackDirectory() {
  return path.join(app.getPath('userData'), 'safety-backups', 'automatic-fallback');
}

async function writeJsonBackupTo(filePath, safeContent) {
  return writeVerifiedAtomic(filePath, safeContent, {
    stageDirectory: backupStagingDirectory(),
    retries: 3,
  });
}

async function writeNativeBackup(content, { force = false, reason = 'automatic', fromSqlite = false, device = '' } = {}) {
  const settings = await readBackupSettings();
  if (!settings.directory) {
    if (force) throw new Error('Escolhe primeiro uma pasta para as cópias automáticas.');
    return { skipped: true, reason: 'no-directory', settings };
  }
  if (!force && reason !== 'close' && !backupDue(settings)) return { skipped: true, reason: 'not-due', settings };
  if (!force && reason === 'close' && !settings.onClose) return { skipped: true, reason: 'close-disabled', settings };

  if (fromSqlite && !dataService) throw new Error('A base de dados não está disponível para criar a cópia.');
  const safeContent = resolveBackupText({
    preferred: fromSqlite ? JSON.stringify({ backupMetadata: { device } }) : content,
    dataService,
    readStorage: readPersistentStorageSync,
  });

  const name = `${AUTO_PREFIX}${timestampPart()}-${crypto.randomUUID().slice(0, 8)}.json`;
  const requestedPath = path.join(settings.directory, name);
  let filePath = requestedPath;
  let warning = '';
  let fallback = false;

  try {
    await fs.mkdir(settings.directory, { recursive: true });
    await writeJsonBackupTo(requestedPath, safeContent);
  } catch (error) {
    // A pasta escolhida pode estar num volume sincronizado, removível ou com
    // filtros do antivírus. Nunca impedir o fecho/update por causa disso:
    // cria uma cópia local verificada e regista claramente o fallback.
    const fallbackDir = backupFallbackDirectory();
    await fs.mkdir(fallbackDir, { recursive: true });
    filePath = path.join(fallbackDir, name);
    await writeJsonBackupTo(filePath, safeContent);
    fallback = true;
    warning = `A pasta escolhida recusou uma gravação íntegra (${error.message}). Foi criada uma cópia local de segurança.`;
    console.warn(warning, { requestedPath, fallbackPath: filePath });
  }

  const updatedSettings = await updateBackupSettings((current) => {
    if (current.directory !== settings.directory) return current;
    return {
      ...current,
      lastBackupAt: new Date().toISOString(),
      lastBackupPath: filePath,
    };
  });
  if (!fallback) await pruneBackups(settings.directory, updatedSettings.retention);
  else await pruneBackups(path.dirname(filePath), updatedSettings.retention);
  return { ok: true, filePath, requestedPath, name: path.basename(filePath), settings: updatedSettings, reason, fallback, warning };
}

async function prepareSafetyBackup(content, { kind = 'migrations', reason = 'safety' } = {}) {
  const directory = path.join(app.getPath('userData'), 'safety-backups', kind);
  await fs.mkdir(directory, { recursive: true });
  try {
    const safeContent = resolveBackupText({ preferred: content, dataService, readStorage: readPersistentStorageSync });
    const settings = await readBackupSettings();
    if (settings.directory) {
      try {
        const result = await createNativeBackup(safeContent, { force: true, reason });
        if (result?.ok) return result.filePath;
      } catch (error) { console.warn('Cópia configurada indisponível; a criar cópia interna:', error.message); }
    }
    const filePath = path.join(directory, 'financas-pessoais-' + reason + '-' + timestampPart() + '.json');
    await writeJsonBackupTo(filePath, safeContent);
    return filePath;
  } catch (jsonError) {
    if (!sqliteStorage?.createConsistentBackup) throw jsonError;
    const dbPath = path.join(directory, 'financas-pessoais-' + reason + '-' + timestampPart() + '.db');
    sqliteStorage.createConsistentBackup(dbPath);
    return dbPath;
  }
}

async function listNativeBackups() {
  const settings=await readBackupSettings(),base=path.join(app.getPath('userData'),'safety-backups');
  const directories=[settings.directory,...['automatic-fallback','migrations','pre-update','spaces'].map(name=>path.join(base,name))].filter(Boolean),backups=[],seen=new Set();
  for(const directory of directories){try{for(const e of await fs.readdir(directory,{withFileTypes:true})){if(!e.isFile()||!e.name.startsWith('financas-pessoais-')||!(/\.(json|db)$/i.test(e.name)))continue;const filePath=path.resolve(directory,e.name),identity=filePath.toLocaleLowerCase('en');if(seen.has(identity))continue;try{const stat=await fs.stat(filePath);backups.push({name:e.name,filePath,size:stat.size,modifiedAt:stat.mtime.toISOString(),internal:directory!==settings.directory});seen.add(identity);}catch{}}}catch{}}
  backups.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));return {settings,backups};
}

async function startLocalServer() {
  localServer = createServer();
  await new Promise((resolve, reject) => {
    localServer.once('error', reject);
    localServer.listen(0, HOST, () => {
      port = localServer.address().port;
      resolve();
    });
  });
}

function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && parsed.hostname === HOST && Number(parsed.port) === Number(port);
  } catch { return false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '..', 'Equilibrio.ico'),
    title: `Equilíbrio ${APP_DISPLAY_VERSION}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(`Equilíbrio ${APP_DISPLAY_VERSION}`);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: 'allow' };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isMaximized()) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadURL(`http://${HOST}:${port}/`).catch((error) => {
    dialog.showErrorBox('Finanças Pessoais', `Não foi possível carregar a interface.\n\n${error.message}`);
    app.quit();
  });

  mainWindow.on('close', (event) => {
    if (updateInstallPending) return;
    event.preventDefault();
    if (closingAfterBackup) return;
    closingAfterBackup = true;
    (async () => {
      let closeWindow = true;
      try {
        const state = await mainWindow.webContents.executeJavaScript('({...(typeof window.FormSession?.status==="function"?window.FormSession.status():{}),recoverable:Boolean(typeof window.DraftUI?.token==="function"?window.DraftUI.token():false)})');
        if (state.busy) {
          closeWindow = false;
          await dialog.showMessageBox(mainWindow, { type:'info', title:'Operação em curso', message:'Aguarda a conclusão da operação antes de fechar.', buttons:['Voltar à aplicação'] });
          return;
        }
        if (state.dirty) {
          const answer = await dialog.showMessageBox(mainWindow, { type:'question', title:'Alterações por guardar', message:'Este formulário tem alterações que ainda não foram guardadas.', buttons:state.recoverable?['Voltar ao formulário','Guardar rascunho e fechar','Descartar e fechar']:['Voltar ao formulário','Descartar e fechar'], defaultId:0, cancelId:0 });
          if (answer.response === 0) { closeWindow = false; return; }
          if(state.recoverable&&answer.response===1){const saved=await mainWindow.webContents.executeJavaScript('window.DraftUI.flush()');if(saved!==true){closeWindow=false;return;}}
          else if(state.recoverable)await mainWindow.webContents.executeJavaScript('window.DraftUI.discard()');
        }
        const settings = await readBackupSettings();
        if (settings.onClose && settings.directory) {
          await createNativeBackup('', { force: false, reason: 'close' });
        }
      } catch (error) {
        console.error('Backup ao fechar falhou:', error);
        const answer = await dialog.showMessageBox(mainWindow, {
          type: 'error', title: 'Cópia de segurança não criada',
          message: 'Não foi possível criar a cópia ao fechar.',
          detail: String(error?.message || error),
          buttons: ['Voltar à aplicação', 'Fechar sem esta cópia'], defaultId: 0, cancelId: 0,
        });
        closeWindow = answer.response === 1;
      } finally {
        if (closeWindow && mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
        if (!closeWindow) closingAfterBackup = false;
      }
    })();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function restoreMainWindowFocus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.focus();
  } catch {}
  setImmediate(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.focus();
      mainWindow.webContents.focus();
    } catch {}
  });
}

async function runWindowDialog(fn) {
  try {
    return await fn();
  } finally {
    restoreMainWindowFocus();
  }
}

const trustedIpc = createTrustedIpc(ipcMain, (event) => Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && isInternalUrl(event.senderFrame.url)));
trustedIpc.on('financas:confirm', (event, message) => {
  if (typeof message !== 'string' || message.length > 4000) { event.returnValue = false; return; }
  let confirmed = false;
  try {
    confirmed = dialog.showMessageBoxSync(mainWindow, {
      type: 'question', message, buttons: ['Cancelar', 'Confirmar'],
      defaultId: 0, cancelId: 0, noLink: true,
    }) === 1;
  } finally {
    event.returnValue = confirmed;
    restoreMainWindowFocus();
  }
});


// Single source of truth for the renderer/preload build identity.
// The sandboxed preload must not require local modules directly.
trustedIpc.on('financas:build-info', (event) => {
  event.returnValue = {
    appVersion: APP_VERSION,
    displayVersion: APP_DISPLAY_VERSION,
    webVersion: WEB_VERSION,
  };
});

// Bootstrap localStorage before the web application's scripts execute.
for(const operation of ['read','write','remove'])trustedIpc.on('financas:draft:'+operation,(event,raw)=>{
  try{const store=draftStore(app.getPath('userData'));event.returnValue=operation==='write'?store.write(raw?.space,raw?.value):store[operation](raw);}
  catch(error){event.returnValue={error:error.message};}
});
trustedIpc.handle('equilibrio:mobile:action', async (_event,input={})=>{
 if(!mobileRuntime)throw Error('A ligação não está disponível.');
 if(['generate','certificate'].includes(input.type)){
  const result=await mobileRuntime.action({type:input.type,host:input.host,port:input.port});const chosen=await runWindowDialog(()=>dialog.showSaveDialog(mainWindow,{title:'Guardar certificado público para o Android',defaultPath:'Equilibrio-PC.cer',filters:[{name:'Certificado público',extensions:['cer']}]}));if(!chosen.canceled){await fs.writeFile(chosen.filePath,result.caCert,'utf8');}return mobileRuntime.status();
 }
 if(input.type==='configure'){
  const cert=await runWindowDialog(()=>dialog.showOpenDialog(mainWindow,{title:'Certificado HTTPS deste PC',properties:['openFile'],filters:[{name:'Certificado PEM',extensions:['pem','crt']}]}));if(cert.canceled)return mobileRuntime.status();
  const key=await runWindowDialog(()=>dialog.showOpenDialog(mainWindow,{title:'Chave privada do certificado',properties:['openFile'],filters:[{name:'Chave PEM',extensions:['pem','key']}]}));if(key.canceled)return mobileRuntime.status();
  const read=async file=>{const st=await fs.stat(file);if(!st.isFile()||st.size>1024*1024)throw Error('Ficheiro de certificado inválido.');return fs.readFile(file,'utf8');};
  return mobileRuntime.action({type:'configure',host:input.host,port:input.port,cert:await read(cert.filePaths[0]),key:await read(key.filePaths[0])});
 }
 if(input.type==='clientConnect'&&!input.ca){
  const chosen=await runWindowDialog(()=>dialog.showOpenDialog(mainWindow,{title:'Certificado público do PC central',properties:['openFile'],filters:[{name:'Certificado público',extensions:['cer','crt','pem']}]}));
  if(chosen.canceled)return mobileRuntime.status();
  const stat=await fs.stat(chosen.filePaths[0]);if(!stat.isFile()||stat.size>1048576)throw Error('Certificado público inválido.');
  input={...input,ca:new crypto.X509Certificate(await fs.readFile(chosen.filePaths[0])).toString()};
 }
 if(input.type==='clientBackup'){
  const state=await mobileRuntime.action(input),content=JSON.stringify(state,null,2);
  const chosen=await runWindowDialog(()=>dialog.showSaveDialog(mainWindow,{title:'Guardar cópia anterior à partilha',defaultPath:'Equilibrio-antes-da-partilha.json',filters:[{name:'Cópia JSON',extensions:['json']}]}));
  if(!chosen.canceled)await writeVerifiedAtomic(chosen.filePath,content);
  return mobileRuntime.status();
 }
 if(!['status','start','stop','approve','revoke','clientConnect','clientResume','clientSync','clientResolve','clientDetach'].includes(input.type))throw Error('Ação indisponível.');
 return mobileRuntime.action(input);
});
trustedIpc.on('financas:storage:bootstrap', (event) => {
  event.returnValue = readPersistentStorageSync();
});
trustedIpc.on('financas:storage:save-sync', (event, raw) => {
  event.returnValue = writePersistentStorageSync(raw);
});
trustedIpc.handle('financas:storage:save', async (_event, raw) => writePersistentStorage(raw));
trustedIpc.handle('financas:storage:replace', async (_event, raw) => replacePersistentStorage(raw));
trustedIpc.on('financas:storage:replace-sync', (event, raw) => { event.returnValue = replacePersistentStorageSync(raw); });
trustedIpc.on('financas:storage:replace-guarded-sync', (event, raw) => {
  mobileRuntime?.guardReplacement();
  if (!sqliteStorage || !raw?.expected || typeof raw.expected !== 'object') throw Error('Estado de comparação em falta.');
  const clean = sanitizeStorageMap(raw.state);
  sqliteStorage.writeState(clean, raw.expected);
  try { writeJsonRecoveryMirrorSync(clean); event.returnValue = {ok:true}; }
  catch(error) { event.returnValue = {ok:true,warning:'SQLite guardado; espelho JSON falhou: '+error.message}; }
});

trustedIpc.handle('financas:save-json', async (_event, { defaultName, content }) => {
  if (typeof content !== 'string') throw new Error('Conteúdo de cópia inválido.');
  const result = await runWindowDialog(() => dialog.showSaveDialog(mainWindow, {
    title: 'Exportar cópia de segurança',
    defaultPath: defaultName || 'financas-pessoais.json',
    filters: [{ name: 'Cópia JSON', extensions: ['json'] }],
  }));
  if (result.canceled || !result.filePath) return null;
  await writeVerifiedAtomic(result.filePath, content, { stageDirectory: backupStagingDirectory() });
  return result.filePath;
});

trustedIpc.handle('financas:open-json', async () => {
  const result = await runWindowDialog(() => dialog.showOpenDialog(mainWindow, {
    title: 'Restaurar cópia de segurança',
    properties: ['openFile'],
    filters: [{ name: 'Cópia JSON', extensions: ['json'] }],
  }));
  if (result.canceled || !result.filePaths?.[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 96 * 1024 * 1024) throw new Error('A cópia selecionada é inválida ou excede o limite de 96 MB.');
  return { filePath, name: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
});

trustedIpc.handle('financas:backup:encrypted-save', async (_event, { defaultName, content, passphrase } = {}) => {
  if (typeof content !== 'string' || typeof passphrase !== 'string') throw new Error('Dados de cópia encriptada inválidos.');
  const result = await runWindowDialog(() => dialog.showSaveDialog(mainWindow, {
    title: 'Guardar cópia encriptada',
    defaultPath: String(defaultName || 'equilibrio-copia-encriptada.fpbackup').replace(/[\\/]/g, '-'),
    filters: [{ name: 'Cópia encriptada Equilíbrio', extensions: ['fpbackup'] }],
  }));
  if (result.canceled || !result.filePath) return null;
  content = resolveBackupText({ preferred: content, dataService, readStorage: readPersistentStorageSync });
  const sealed = await encryptBackup(content, passphrase);
  await writeVerifiedAtomic(result.filePath, sealed, { stageDirectory: backupStagingDirectory() });
  return result.filePath;
});

trustedIpc.handle('financas:backup:encrypted-open', async (_event, passphrase) => {
  if (typeof passphrase !== 'string') throw new Error('Indica a frase-passe da cópia.');
  const result = await runWindowDialog(() => dialog.showOpenDialog(mainWindow, {
    title: 'Abrir cópia encriptada', properties: ['openFile'],
    filters: [{ name: 'Cópia encriptada Equilíbrio', extensions: ['fpbackup'] }],
  }));
  if (result.canceled || !result.filePaths?.[0]) return null;
  const filePath = result.filePaths[0];
  if ((await fs.stat(filePath)).size > 96 * 1024 * 1024) throw new Error('A cópia encriptada excede o limite permitido.');
  const content = await decryptBackup(await fs.readFile(filePath, 'utf8'), passphrase);
  return { filePath, name: path.basename(filePath), content };
});

trustedIpc.handle('financas:backup-settings:get', async () => readBackupSettings());
trustedIpc.handle('financas:backup-settings:set', async (_event, patch = {}) => {
  const safePatch = {};
  if (patch && typeof patch === 'object') {
    if (Object.hasOwn(patch, 'frequency')) safePatch.frequency = patch.frequency;
    if (Object.hasOwn(patch, 'retention')) safePatch.retention = patch.retention;
    if (Object.hasOwn(patch, 'onClose')) safePatch.onClose = patch.onClose;
  }
  return updateBackupSettings((current) => ({ ...current, ...safePatch }));
});
trustedIpc.handle('financas:backup-directory:choose', async () => {
  const current = await readBackupSettings();
  const result = await runWindowDialog(() => dialog.showOpenDialog(mainWindow, {
    title: 'Escolher pasta para cópias automáticas',
    defaultPath: current.directory || undefined,
    properties: ['openDirectory', 'createDirectory'],
  }));
  if (result.canceled || !result.filePaths?.[0]) return null;
  return updateBackupSettings((latest) => ({ ...latest, directory: result.filePaths[0] }));
});
trustedIpc.handle('financas:backup-directory:disable', async () => {
  return updateBackupSettings((current) => ({ ...current, directory: '' }));
});
trustedIpc.handle('financas:backup:run', async (_event, { content, force = false, reason = 'automatic', fromSqlite = false, device = '' } = {}) => {
  if (fromSqlite === true) {
    return createNativeBackup('', {
      force: Boolean(force), reason, fromSqlite: true, device: String(device || '').slice(0, 80),
    });
  }
  if (isValidJsonText(content)) latestSnapshot = content;
  return createNativeBackup(latestSnapshot, { force: Boolean(force), reason });
});
trustedIpc.handle('financas:backup:list', async () => listNativeBackups());
trustedIpc.handle('financas:spaces:protect',async (_event,content='')=>({ok:true,filePath:await prepareSafetyBackup(content,{kind:'spaces',reason:'before-space-transfer'})}));
trustedIpc.handle('financas:backup:read',async (_event,filePath)=>{const entry=(await listNativeBackups()).backups.find(b=>b.filePath===filePath);if(!entry||!entry.name.endsWith('.json'))throw Error('Seleciona uma cópia JSON da lista disponível.');if(entry.size>96*1024*1024)throw Error('A cópia excede o limite permitido.');return {name:entry.name,filePath:entry.filePath,content:await fs.readFile(entry.filePath,'utf8')};});
trustedIpc.handle('financas:attachment:open', async (_event, attachment = {}) => {
  const { mime, buffer, ext } = decodeAttachment(attachment);
  const original = path.basename(String(attachment.name || 'comprovativo'), path.extname(String(attachment.name || '')));
  const safe = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'comprovativo';
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const dir = attachmentsTempDir();
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${safe}-${hash}${ext}`);
  await fs.writeFile(target, buffer);
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
  return { ok: true };
});
trustedIpc.handle('financas:attachment:save', async (_event, attachment = {}) => {
  const { mime, buffer, ext } = decodeAttachment(attachment);
  const rawName = path.basename(String(attachment.name || `comprovativo${ext}`));
  const base = path.basename(rawName, path.extname(rawName)).trim() || 'comprovativo';
  const defaultName = `${base}${ext}`;
  const filters = mime === 'application/pdf'
    ? [{ name: 'Documento PDF', extensions: ['pdf'] }]
    : [{ name: 'Imagem', extensions: [ext.slice(1)] }];
  const result = await runWindowDialog(() => dialog.showSaveDialog(mainWindow, {
    title: 'Guardar cópia do comprovativo',
    defaultPath: defaultName,
    filters,
  }));
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, buffer);
  return { canceled: false, filePath: result.filePath };
});
trustedIpc.on('financas:snapshot:update', (_event, content) => {
  if (isValidJsonText(content)) latestSnapshot = content;
  else if (typeof content === 'string' && content.trim()) console.warn('Snapshot Desktop inválido recebido; a cópia será reconstruída diretamente do SQLite.');
});


trustedIpc.on('financas:sqlite:spaces-sync', (event) => {
  try {
    event.returnValue = dataService?.listSpaces?.() || sqliteStorage?.listSpaces?.() || [];
  } catch (error) {
    console.error('Leitura direta do catálogo SQLite falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:sqlite:space-sync', (event, spaceId) => {
  try {
    event.returnValue = dataService?.readSpace?.(String(spaceId || '')) || sqliteStorage?.readSpace?.(String(spaceId || '')) || null;
  } catch (error) {
    console.error('Leitura direta de espaço SQLite falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:sqlite:space-write-sync', (event, payload = {}) => {
  try {
    if (!sqliteStorage?.writeSpace) {
      event.returnValue = { ok: false, error: 'SQLite indisponível.' };
      return;
    }
    event.returnValue = dataService?.writeSpace(String(payload.storageKey || ''), payload.ledger || {}) || sqliteStorage.writeSpace(String(payload.storageKey || ''), payload.ledger || {});
  } catch (error) {
    console.error('Escrita direta do Espaço Financeiro falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:sqlite:domain-sync', (event, payload = {}) => {
  try {
    event.returnValue = dataService?.readDomain?.(String(payload.spaceId || ''), String(payload.domain || '')) || sqliteStorage?.readDomain?.(String(payload.spaceId || ''), String(payload.domain || '')) || [];
  } catch (error) {
    console.error('Leitura direta de domínio SQLite falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.handle('financas:sqlite:spaces', async () => {
  if (!sqliteStorage) return [];
  return dataService?.listSpaces?.() || sqliteStorage.listSpaces?.() || [];
});

trustedIpc.handle('financas:sqlite:space', async (_event, spaceId) => {
  if (!sqliteStorage) return null;
  return dataService?.readSpace?.(String(spaceId || '')) || sqliteStorage.readSpace?.(String(spaceId || '')) || null;
});

trustedIpc.on('financas:sqlite:ledger-delta-sync', (event, payload = {}) => {
  try {
    if (!sqliteStorage?.applyLedgerDelta) {
      event.returnValue = { ok: false, error: 'SQLite indisponível.' };
      return;
    }
    event.returnValue = (dataService?.commitLedger || sqliteStorage.applyLedgerDelta.bind(sqliteStorage))(
      String(payload.storageKey || ''),
      payload.beforeLedger || {},
      payload.afterLedger || {},
    );
  } catch (error) {
    console.error('Persistência incremental SQLite falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:sqlite:critical-sync', (event, payload = {}) => {
  try {
    if (!sqliteStorage?.applyCriticalChanges) {
      event.returnValue = { ok: false, error: 'SQLite indisponível.' };
      return;
    }
    event.returnValue = sqliteStorage.applyCriticalChanges(
      String(payload.storageKey || ''),
      payload.beforeLedger || {},
      payload.afterLedger || {},
    );
  } catch (error) {
    console.error('CRUD direto SQLite falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});


trustedIpc.on('financas:data:spaces-sync', (event) => {
  try {
    event.returnValue = dataService?.listSpaces?.() || [];
  } catch (error) {
    console.error('Data service: catálogo indisponível:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:data:space-sync', (event, spaceId) => {
  try {
    event.returnValue = dataService?.readSpace?.(String(spaceId || '')) || null;
  } catch (error) {
    console.error('Data service: espaço indisponível:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:data:domain-sync', (event, payload = {}) => {
  try {
    event.returnValue = dataService?.readDomain?.(String(payload.spaceId || ''), String(payload.domain || '')) || [];
  } catch (error) {
    console.error('Data service: domínio indisponível:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:data:commit-ledger-sync', (event, payload = {}) => {
  try {
    if (!dataService) {
      event.returnValue = { ok: false, error: 'Camada de dados indisponível.' };
      return;
    }
    const key = String(payload.storageKey || '');
    event.returnValue = payload.patchText !== undefined
      ? dataService.commitLedgerPatch(key, payload.patchText)
      : payload.beforeText !== undefined || payload.afterText !== undefined
        ? dataService.commitLedgerConfirmed(key, payload.beforeText, payload.afterText)
        : dataService.commitLedger(key, payload.beforeLedger || {}, payload.afterLedger || {});
  } catch (error) {
    console.error('Data service: commit falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:data:entity-upsert-sync', (event, payload = {}) => {
  try {
    if (!dataService) {
      event.returnValue = { ok: false, error: 'Camada de dados indisponível.' };
      return;
    }
    event.returnValue = dataService.upsertEntity(
      String(payload.spaceId || ''),
      String(payload.domain || ''),
      payload.entity || {},
    );
  } catch (error) {
    console.error('Data service: gravação de entidade falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.on('financas:data:entity-delete-sync', (event, payload = {}) => {
  try {
    if (!dataService) {
      event.returnValue = { ok: false, error: 'Camada de dados indisponível.' };
      return;
    }
    event.returnValue = dataService.deleteEntity(
      String(payload.spaceId || ''),
      String(payload.domain || ''),
      String(payload.entityId || ''),
    );
  } catch (error) {
    console.error('Data service: eliminação de entidade falhou:', error);
    event.returnValue = { ok: false, error: error?.message || String(error) };
  }
});

trustedIpc.handle('financas:update:status', async () => readUpdateStatus(app.getPath('userData')));
trustedIpc.handle('financas:update:status-clear', async () => {
  await clearUpdateStatus(app.getPath('userData'));
  return true;
});
trustedIpc.handle('financas:update:install-file', async () => {
  if (updateDialogBusy || updateInstallPending) throw new Error('Já existe uma atualização em curso.');
  updateDialogBusy = true;
  try {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Instalar atualização do Finanças Pessoais',
    properties: ['openFile'],
    filters: [{ name: 'Atualização Finanças Pessoais', extensions: ['fpupdate'] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;

  const filePath = result.filePaths[0];
  const updateSchemaVersion = sqliteStorage?.info?.().dbSchemaVersion ?? (sqliteStorage ? CURRENT_DB_SCHEMA_VERSION : 0);
  const { pkg, validated } = await readAndValidatePackage(filePath, {
    currentVersion: APP_VERSION,
    schemaVersion: updateSchemaVersion,
    requireSignature: requireUpdateSignature,
  });
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Instalar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    title: 'Instalar atualização',
    message: `Atualizar ${APP_DISPLAY_VERSION} para ${validated.displayVersion}?`,
    detail: 'Antes de atualizar será criada uma cópia de segurança dos teus dados e uma cópia de rollback dos ficheiros da aplicação. A aplicação vai fechar e não volta a abrir automaticamente.',
    noLink: true,
  });
  if (confirmation.response !== 0) return null;

  const backupPath = await prepareSafetyBackup('', {
    kind: 'pre-update',
    reason: `pre-update-${APP_VERSION}-to-${validated.version}`,
  });
  const staged = await stageUpdate({
    pkg,
    validated,
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData'),
    currentVersion: APP_VERSION,
    schemaVersion: updateSchemaVersion,
    requireSignature: requireUpdateSignature,
  });
  const helper = await launchDetachedHelper({ planPath: staged.planPath, userDataPath: app.getPath('userData'), requireSignature: requireUpdateSignature });
  updateInstallPending = true;
  setTimeout(() => app.quit(), 450);
  return {
    ok: true,
    fromVersion: APP_VERSION,
    toVersion: validated.version,
    displayVersion: validated.displayVersion,
    backupPath,
    rollbackDir: staged.rollbackDir,
    helperPid: helper.pid,
    closing: true,
  };
  } finally {
    updateDialogBusy = false;
    if (!updateInstallPending) restoreMainWindowFocus();
  }
});

trustedIpc.handle('financas:app-info', async () => {
  const storage = sqliteStorage?.info?.() || {
    mode: 'JSON recovery fallback',
    dbPath: '',
    legacyPath: persistentStoragePath(),
    keys: Object.keys(readLegacyStorageSync()).length,
    spaces: 0,
    storageSchema: 0,
    lastWriteAt: '',
    migratedAt: '',
  };
  const updateStatus = await readUpdateStatus(app.getPath('userData'));
  return {
    appVersion: APP_VERSION,
    displayVersion: APP_DISPLAY_VERSION,
    webVersion: WEB_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dbSchemaVersion: storage.dbSchemaVersion ?? (sqliteStorage ? CURRENT_DB_SCHEMA_VERSION : 0),
    platform: process.platform,
    packaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
    statePath: storage.dbPath || persistentStoragePath(),
    executablePath: app.getPath('exe'),
    appPath: app.getAppPath(),
    storage,
    updateStatus,
  };
});

trustedIpc.handle('financas:migration:apply', async (_event, { incomingContent, currentContent } = {}) => {
  if (typeof incomingContent !== 'string' || !incomingContent.trim()) throw new Error('A cópia a migrar é inválida.');
  const migrated = prepareRestoreText(incomingContent);
  let backupPath = '';
  if (typeof currentContent === 'string' && currentContent.trim()) {
    backupPath = await prepareSafetyBackup(currentContent, { kind: 'migrations', reason: 'pre-migration' });
  }
  return { content: migrated.content, changed: migrated.changed, plan: migrated.plan, backupPath };
});

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('pt.financaspessoais.desktop');
    try {
      if (sqliteInitError) throw sqliteInitError;
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      cleanupStaleAttachmentTempDirs();
      try { repairJsonRecoveryMirrorFromSqlite(); } catch (error) { console.error('Reparação do espelho JSON falhou:', error); }
      await startLocalServer();
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (!isInternalUrl(details.url)) return callback({ responseHeaders: details.responseHeaders });
        const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' data: blob:; connect-src 'self' data: blob: http://127.0.0.1:* https://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self'";
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [csp],
          },
        });
      });
      createWindow();
    } catch (error) {
      dialog.showErrorBox('Finanças Pessoais', `Não foi possível iniciar a aplicação.\n\n${error?.message || error}`);
      app.quit();
    }
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && port) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let mobileQuitReady=false;
app.on('before-quit', event=>{if(mobileRuntime&&!mobileQuitReady){event.preventDefault();mobileRuntime.close().finally(()=>{mobileQuitReady=true;app.quit();});}});
app.on('will-quit', () => {
  try { fsSync.rmSync(attachmentsTempDir(), { recursive: true, force: true }); } catch {}
  if (sqliteStorage) { try { sqliteStorage.close(); } catch {} }
  if (localServer) {
    try { localServer.close(); } catch {}
  }
});

