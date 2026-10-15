const path = require('node:path');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Recovery = require('./update-recovery.cjs');
const { writeVerifiedAtomic } = require('./verified-backup.cjs');

const UPDATE_FORMAT = 'financas-pessoais-update';
const UPDATE_FORMAT_VERSION = 1;
const UPDATE_APP_ID = 'pt.financaspessoais.desktop';
const UPDATE_SIGNATURE_MIN_VERSION = '0.39.37';
const UPDATE_LEGACY_SIGNATURE_KEY_ID = 'equilibrio-ed25519-2026-09';
const UPDATE_SIGNATURE_PRIMARY_KEY_ID = 'equilibrio-ed25519-2026-09-r2';
const UPDATE_SIGNATURE_RECOVERY_KEY_ID = 'equilibrio-ed25519-2026-09-recovery';
const UPDATE_SIGNATURE_KEY_ID = UPDATE_SIGNATURE_PRIMARY_KEY_ID;
const UPDATE_TRUSTED_KEYS = Object.freeze({
  'equilibrio-ed25519-2026-09-r3': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+ddYJ6JNsOWUEP/LumjSvxcpwGYdJADlEfOpGaeupws=
-----END PUBLIC KEY-----`,
  [UPDATE_LEGACY_SIGNATURE_KEY_ID]: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAhSJTK79vvEYGPBb5Z3Q3I5fkzHxZQB9Oj3Trf022RDs=
-----END PUBLIC KEY-----`,
  [UPDATE_SIGNATURE_PRIMARY_KEY_ID]: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEArb+Am87y6EUdHWcaSvfwH7YhGkmJjCFbPRwfJUYA52s=
-----END PUBLIC KEY-----`,
  [UPDATE_SIGNATURE_RECOVERY_KEY_ID]: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAmS6NfvhaNkobqEBpVwqLYA+H5FljuZeLR66zvcVTH84=
-----END PUBLIC KEY-----`,
});
const UPDATE_PUBLIC_KEY = UPDATE_TRUSTED_KEYS[UPDATE_SIGNATURE_PRIMARY_KEY_ID];

function versionParts(value) {
  return String(value || '0')
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
    .slice(0, 4);
}

function compareVersions(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const size = Math.max(aa.length, bb.length, 3);
  for (let i = 0; i < size; i += 1) {
    const diff = (aa[i] || 0) - (bb[i] || 0);
    if (diff) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeRelativeFilePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').trim();
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) throw new Error(`Caminho inválido na atualização: ${raw || '(vazio)'}`);
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Caminho inseguro na atualização: ${raw}`);
  }
  if (normalized.split('/').some(part => !part || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Caminho inválido na atualização.');
  return normalized;
}

function canonicalManifestForHash(pkg) {
  const files = (Array.isArray(pkg.files) ? pkg.files : []).map((file) => ({
    path: normalizeRelativeFilePath(file.path),
    sha256: String(file.sha256 || '').toLowerCase(),
    size: Number(file.size) || 0,
  }));
  return JSON.stringify({
    format: pkg.format,
    formatVersion: pkg.formatVersion,
    appId: pkg.appId,
    version: pkg.version,
    displayVersion: pkg.displayVersion || '',
    minAppVersion: pkg.minAppVersion || '',
    maxAppVersion: pkg.maxAppVersion || '',
    minSchemaVersion: Number(pkg.minSchemaVersion ?? 0),
    maxSchemaVersion: Number(pkg.maxSchemaVersion ?? Number.MAX_SAFE_INTEGER),
    files,
  });
}

function signPackageObject(pkg, privateKey, keyId = UPDATE_SIGNATURE_KEY_ID) {
  if (!privateKey) throw new Error('Chave privada de atualização em falta.');
  const trustedPublicKey = UPDATE_TRUSTED_KEYS[keyId];
  if (!trustedPublicKey) throw new Error(`Identificador de chave de atualização desconhecido: ${keyId}`);
  const canonical = Buffer.from(canonicalManifestForHash(pkg), 'utf8');
  const value = crypto.sign(null, canonical, privateKey).toString('base64');
  if (!crypto.verify(null, canonical, trustedPublicKey, Buffer.from(value, 'base64'))) {
    throw new Error(`A chave privada não corresponde à chave pública autorizada (${keyId}).`);
  }
  pkg.signature = {
    algorithm: 'Ed25519',
    keyId,
    value,
  };
  return pkg;
}

function verifyPackageSignature(pkg, context = {}) {
  if (pkg.signature == null) {
    return false;
  }
  const signature = pkg.signature;
  const publicKey = signature && typeof signature === 'object' && !Array.isArray(signature)
    ? UPDATE_TRUSTED_KEYS[signature.keyId]
    : null;
  if (!signature || typeof signature !== 'object' || Array.isArray(signature) ||
      signature.algorithm !== 'Ed25519' || !publicKey ||
      typeof signature.value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature.value)) {
    throw new Error('Assinatura digital da atualização inválida ou não reconhecida.');
  }
  const signatureBytes = Buffer.from(signature.value, 'base64');
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64') !== signature.value ||
      !crypto.verify(null, Buffer.from(canonicalManifestForHash(pkg), 'utf8'), publicKey, signatureBytes)) {
    throw new Error('A assinatura digital da atualização não é válida.');
  }
  return true;
}

function validatePackageObject(pkg, context = {}) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('O ficheiro de atualização não contém um pacote válido.');
  if (pkg.format !== UPDATE_FORMAT || Number(pkg.formatVersion) !== UPDATE_FORMAT_VERSION) throw new Error('Formato de atualização incompatível.');
  if (pkg.appId !== UPDATE_APP_ID) throw new Error('Esta atualização não pertence ao Finanças Pessoais Desktop.');
  if (!pkg.version || compareVersions(pkg.version, context.currentVersion || '0.0.0') <= 0) {
    throw new Error(`A atualização (${pkg.version || '?'}) não é mais recente do que a versão instalada (${context.currentVersion || '?'}).`);
  }
  if (pkg.minAppVersion && compareVersions(context.currentVersion, pkg.minAppVersion) < 0) {
    throw new Error(`Esta atualização exige pelo menos a versão ${pkg.minAppVersion}.`);
  }
  if (pkg.maxAppVersion && compareVersions(context.currentVersion, pkg.maxAppVersion) > 0) {
    throw new Error(`Esta atualização só pode ser instalada até à versão ${pkg.maxAppVersion}.`);
  }
  const schema = Number(context.schemaVersion || 0);
  if (Number.isFinite(Number(pkg.minSchemaVersion)) && schema < Number(pkg.minSchemaVersion)) {
    throw new Error(`Esta atualização exige schema ${pkg.minSchemaVersion} ou superior.`);
  }
  if (Number.isFinite(Number(pkg.maxSchemaVersion)) && schema > Number(pkg.maxSchemaVersion)) {
    throw new Error(`Esta atualização não é compatível com o schema ${schema}.`);
  }
  if (!Array.isArray(pkg.files) || !pkg.files.length) throw new Error('A atualização não contém ficheiros.');
  const seen = new Set();
  for (const file of pkg.files) {
    const relative = normalizeRelativeFilePath(file.path);
    if (seen.has(relative.toLowerCase())) throw new Error(`Ficheiro duplicado na atualização: ${relative}`);
    seen.add(relative.toLowerCase());
    if (typeof file.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) throw new Error(`Conteúdo inválido: ${relative}`);
    const content = Buffer.from(file.contentBase64, 'base64');
    const expectedSize = Number(file.size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || content.length !== expectedSize || content.toString('base64') !== file.contentBase64) throw new Error(`Tamanho ou conteúdo inválido em ${relative}.`);
    const actual = sha256Buffer(content);
    if (!file.sha256 || actual !== String(file.sha256).toLowerCase()) throw new Error(`Checksum inválido em ${relative}.`);
  }
  const canonical = canonicalManifestForHash(pkg);
  const manifestHash = sha256Buffer(Buffer.from(canonical, 'utf8'));
  if (!pkg.manifestSha256 || manifestHash !== String(pkg.manifestSha256).toLowerCase()) throw new Error('A assinatura de integridade do manifest não é válida.');
  const signatureVerified = verifyPackageSignature(pkg, context);
  return {
    version: String(pkg.version),
    displayVersion: String(pkg.displayVersion || `v${pkg.version}`),
    files: pkg.files.map((file) => ({ ...file, path: normalizeRelativeFilePath(file.path) })),
    manifestSha256: manifestHash,
    signatureVerified,
  };
}

async function readAndValidatePackage(filePath, context) {
  const text = await fs.readFile(filePath, 'utf8');
  let pkg;
  try { pkg = JSON.parse(text); } catch { throw new Error('O ficheiro .fpupdate não contém JSON válido.'); }
  const validated = validatePackageObject(pkg, context);
  return { pkg, validated };
}

async function ensureWritableDirectory(directory) {
  const probe = path.join(directory, `.financas-update-write-test-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.rm(probe, { force: true });
    return true;
  } catch (error) {
    try { await fs.rm(probe, { force: true }); } catch {}
    // Staging and rollback are written to the profile. Only file replacement
    // needs administrator rights, requested after staging has been verified.
    if(process.platform==='win32'&&['EACCES','EPERM'].includes(error.code))return false;
    const wrapped = new Error('Não foi possível verificar o acesso à pasta da aplicação.');
    wrapped.cause = error;
    throw wrapped;
  }
}

async function copyFileSafe(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function safeUpdateTarget(root, relative) {
  const normalized = normalizeRelativeFilePath(relative);
  let current = path.resolve(root);
  for (const part of normalized.split('/')) {
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('A atualização não pode atravessar ligações: ' + relative);
    current = path.join(current, part);
  }
  const final = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (final?.isSymbolicLink() || final?.isDirectory()) throw new Error('Destino inválido na atualização: ' + relative);
  return current;
}

async function stageUpdate({ pkg, validated, appPath, userDataPath, currentVersion }) {
  const checked = validatePackageObject(pkg, { currentVersion, schemaVersion: Number(pkg.minSchemaVersion || 0) });
  if (checked.manifestSha256 !== validated.manifestSha256) throw new Error('O pacote mudou depois da validação.');
  validated = checked;
  if (fsSync.existsSync(path.join(userDataPath,'update-pending.json'))) throw new Error('Existe uma atualização pendente; recupera antes de preparar outra.');
  await ensureWritableDirectory(appPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const root = path.join(userDataPath, 'updates', `from-${currentVersion}-to-${validated.version}-${stamp}`);
  const stagingDir = path.join(root, 'staged');
  const rollbackDir = path.join(root, 'rollback');
  await fs.mkdir(stagingDir, { recursive: true });
  await fs.mkdir(rollbackDir, { recursive: true });

  const rollbackManifest = [];
  for (const file of validated.files) {
    const relative = file.path;
    const stagedPath = path.join(stagingDir, ...relative.split('/'));
    const targetPath = await safeUpdateTarget(appPath, relative);
    const targetResolved = path.resolve(targetPath);
    if (!targetResolved.startsWith(path.resolve(appPath) + path.sep) && targetResolved !== path.resolve(appPath)) throw new Error(`Destino inseguro: ${relative}`);
    const content = Buffer.from(file.contentBase64, 'base64');
    await fs.mkdir(path.dirname(stagedPath), { recursive: true });
    await fs.writeFile(stagedPath, content);
    if (sha256Buffer(await fs.readFile(stagedPath)) !== String(file.sha256).toLowerCase()) throw new Error(`Falha ao validar ficheiro preparado: ${relative}`);
    const existed = fsSync.existsSync(targetPath);
    const item = { path: relative, existed };
    if (existed) {
      const original = await fs.readFile(targetPath);
      item.sha256 = sha256Buffer(original);
      const rollbackPath = path.join(rollbackDir, ...relative.split('/'));
      await copyFileSafe(targetPath, rollbackPath);
      if (sha256Buffer(await fs.readFile(rollbackPath)) !== item.sha256) throw new Error('A cópia de reversão não corresponde ao original: ' + relative);
    }
    rollbackManifest.push(item);
  }

  const plan = {
    format: 'financas-pessoais-update-plan',
    version: 2,
    schemaVersion: Number(pkg.minSchemaVersion || 0),
    manifestSha256: validated.manifestSha256,
    createdAt: new Date().toISOString(),
    parentPid: process.pid,
    appPath,
    stagingDir,
    rollbackDir,
    statusPath: path.join(userDataPath, 'update-status.json'),
    expectedVersion: validated.version,
    currentVersion,
    files: validated.files.map((file) => ({ path: file.path, sha256: String(file.sha256).toLowerCase() })),
    rollbackManifest,
    versionFile: 'desktop/version.cjs',
  };
  const planPath = path.join(root, 'update-plan.json');
  await writeVerifiedAtomic(planPath, JSON.stringify(plan, null, 2));
  await writeVerifiedAtomic(path.join(root, 'package.json'), JSON.stringify(pkg));
  const runtimeHashes = {};
  for (const name of ['manual-updater.cjs','update-recovery.cjs','verified-backup.cjs']) {
    const bytes = await fs.readFile(path.join(__dirname,name));
    await writeVerifiedAtomic(path.join(root,'runtime',name), bytes);
    runtimeHashes[name] = sha256Buffer(bytes);
  }
  const marker = path.join(userDataPath,'update-pending.json');
  if (fsSync.existsSync(marker)) throw new Error('Existe uma atualização pendente; recupera antes de preparar outra.');
  await writeVerifiedAtomic(marker, JSON.stringify({planPath,planSha256:Recovery.planHash(plan),runtimeHashes}));
  return { root, stagingDir, rollbackDir, planPath, plan };
}

function helperSource(expectedAppPath, expectedProfile, recoveryOnly = false) {
  return String.raw`const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const planPath = process.argv[2];
const EXPECTED_APP_PATH = ${JSON.stringify(expectedAppPath)};
const EXPECTED_PROFILE = ${JSON.stringify(expectedProfile)};
function sha256(buffer){ return crypto.createHash('sha256').update(buffer).digest('hex'); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function pidAlive(pid){ try { process.kill(pid, 0); return true; } catch { return false; } }
async function targetFor(root, relative){
  if(typeof relative!=='string'||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)))throw Error('Caminho inseguro no plano.');
  let target=path.resolve(root);
  for(const part of relative.split('/')){
    const stat=await fsp.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(stat?.isSymbolicLink())throw Error('Ligação no destino da atualização.');
    target=path.join(target,part);
  }
  const stat=await fsp.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(stat?.isSymbolicLink()||stat?.isDirectory())throw Error('Destino inválido.');
  return target;
}
async function ensureParent(file){ await fsp.mkdir(path.dirname(file), { recursive:true }); }
async function writeStatus(plan, status){
  await ensureParent(plan.statusPath);
  const tmp = plan.statusPath + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify({ ...status, at:new Date().toISOString() }, null, 2), 'utf8');
  await fsp.rename(tmp, plan.statusPath).catch(async()=>{ await fsp.rm(plan.statusPath,{force:true}); await fsp.rename(tmp, plan.statusPath); });
}
async function restore(plan){
  const Recovery=require(path.join(path.dirname(planPath),'runtime','update-recovery.cjs'));
  Recovery.restoreVerified(plan);
}
(async()=>{
  let plan;
  let installationStarted = false;
  try {
    const rawPlan = JSON.parse(await fsp.readFile(planPath, 'utf8'));
    const profile=EXPECTED_PROFILE,marker=path.join(profile,'update-pending.json');
    const pointer=JSON.parse(await fsp.readFile(marker,'utf8'));
    if(path.resolve(pointer.planPath)!==path.resolve(planPath))throw Error('Plano pendente diferente.');
    for(const name of ['manual-updater.cjs','update-recovery.cjs','verified-backup.cjs']){
      const file=path.join(path.dirname(planPath),'runtime',name);
      if(fs.lstatSync(file).isSymbolicLink()||sha256(await fsp.readFile(file))!==pointer.runtimeHashes?.[name])throw Error('Runtime de recuperação inválido.');
    }
    const Recovery=require(path.join(path.dirname(planPath),'runtime','update-recovery.cjs'));
    const Updater=require(path.join(path.dirname(planPath),'runtime','manual-updater.cjs'));
    plan=Recovery.validatePending(pointer,EXPECTED_APP_PATH,profile,Updater.validatePackageObject);
    if (${JSON.stringify(recoveryOnly)}) {
      Recovery.recover(pointer,EXPECTED_APP_PATH,profile,Updater.validatePackageObject);
      process.exit(0);
    }
    pointer.helperPid=process.pid;Recovery.atomic(marker,Buffer.from(JSON.stringify(pointer)));
    await writeStatus(plan, { state:'waiting-for-close', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion });
    const deadline = Date.now() + 120000;
    while (pidAlive(Number(plan.parentPid)) && Date.now() < deadline) await sleep(500);
    if (pidAlive(Number(plan.parentPid))) throw new Error('A aplicação não fechou dentro do tempo limite.');
    await sleep(700);
    for(const item of plan.rollbackManifest){
      await targetFor(plan.appPath,item.path);
      if(item.existed && item.sha256){
        const backup=await targetFor(plan.rollbackDir,item.path);
        if(sha256(await fsp.readFile(backup))!==item.sha256)throw Error('Cópia de reversão corrompida: '+item.path);
      }
    }
    await writeStatus(plan, { state:'installing', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion });
    installationStarted = true;
    for (const file of plan.files) {
      const source = await targetFor(plan.stagingDir, file.path);
      const target = await targetFor(plan.appPath, file.path);
      const content = await fsp.readFile(source);
      if (sha256(content) !== file.sha256) throw new Error('Checksum do staging inválido: ' + file.path);
      await ensureParent(target);
      const tempTarget = target + '.update-tmp';
      try {
        const handle=await fsp.open(tempTarget,'wx');
        try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
        if (sha256(await fsp.readFile(tempTarget)) !== file.sha256) throw new Error('Falha ao validar escrita: ' + file.path);
        await fsp.rename(tempTarget, target);
        if(sha256(await fsp.readFile(target))!==file.sha256)throw Error('Ficheiro instalado não confirmado: '+file.path);
      }finally{await fsp.rm(tempTarget,{force:true}).catch(()=>{});}
    }
    const versionText = await fsp.readFile(path.join(plan.appPath, ...plan.versionFile.split('/')), 'utf8');
    const match = versionText.match(/APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]/);
    if (!match || match[1] !== plan.expectedVersion) throw new Error('A versão instalada não corresponde à esperada.');
    await writeStatus(plan, { state:'success', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion, rollbackDir:plan.rollbackDir });
    Recovery.finish(pointer,plan,profile);
  } catch (error) {
    try { if (plan && installationStarted) { await writeStatus(plan,{state:'installing',rollbackStarted:true,fromVersion:plan.currentVersion,toVersion:plan.expectedVersion,error:String(error?.message||error)}); await restore(plan); } } catch (rollbackError) {
      if (plan) await writeStatus(plan, { state:'failed-rollback-error', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion, error:String(error?.message||error), rollbackError:String(rollbackError?.message||rollbackError) });
      process.exit(2);
    }
    if (plan) await writeStatus(plan, { state:installationStarted?'failed-rolled-back':'failed-before-install', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion, error:String(error?.message||error), rollbackDir:plan.rollbackDir });
    if(plan && installationStarted){
      const Recovery=require(path.join(path.dirname(planPath),'runtime','update-recovery.cjs'));
      const profile=path.dirname(plan.statusPath),pointer=JSON.parse(await fsp.readFile(path.join(profile,'update-pending.json'),'utf8'));
      Recovery.finish(pointer,plan,profile);
    }
    process.exit(1);
  }
})();`;
}

function powershellLiteral(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function elevationCommand(helperPath, planPath, acknowledgement, wait = false) {
  const inner = "$ErrorActionPreference='Stop';$env:ELECTRON_RUN_AS_NODE='1';" +
    '$p=Start-Process -FilePath ' + powershellLiteral(process.execPath) +
    " -ArgumentList @(" + powershellLiteral('"'+helperPath+'"') + ',' + powershellLiteral('"'+planPath+'"') +
    ") -WindowStyle Hidden -PassThru" + (wait ? ' -Wait' : '') + ';' +
    (wait ? 'exit $p.ExitCode' : '[System.IO.File]::WriteAllText('+powershellLiteral(acknowledgement)+', [string]$p.Id)');
  const encoded = Buffer.from(inner,'utf16le').toString('base64');
  const outer = "$ErrorActionPreference='Stop';try{$p=Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand'," +
    powershellLiteral(encoded) + ') -Wait -PassThru;exit $p.ExitCode}catch{exit 1}';
  return ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(outer,'utf16le').toString('base64')];
}
async function needsElevation(appPath) {
  if(process.platform!=='win32')return false;
  const probe=path.join(appPath,'.update-access-'+crypto.randomUUID());
  try{const file=await fs.open(probe,'wx');await file.close();await fs.rm(probe);return false;}
  catch(error){if(['EACCES','EPERM'].includes(error.code))return true;throw error;}
}
// Interrupted replacement in Program Files must be recovered before SQLite opens.
function recoverElevatedSync({planPath,userDataPath,appPath}) {
  const pointer=JSON.parse(fsSync.readFileSync(path.join(userDataPath,'update-pending.json'),'utf8'));
  Recovery.validatePending(pointer,appPath,userDataPath,validatePackageObject);
  if(Recovery.alive(pointer.helperPid)||Recovery.alive(JSON.parse(fsSync.readFileSync(planPath)).parentPid))throw Error('A atualização ainda está em curso.');
  const helperPath=path.join(path.dirname(planPath),'recover-elevated.cjs');
  fsSync.writeFileSync(helperPath,helperSource(appPath,userDataPath,true));
  const result=require('node:child_process').spawnSync('powershell.exe',elevationCommand(helperPath,planPath,null,true),{windowsHide:true,encoding:'utf8'});
  if(result.status!==0||fsSync.existsSync(path.join(userDataPath,'update-pending.json')))throw Error('A recuperação requer autorização de administrador do Windows.');
}
async function launchDetachedHelper({ planPath, userDataPath }) {
  const helperDir = path.join(userDataPath, 'update-runtime');
  await fs.mkdir(helperDir, { recursive: true });
  const helperPath = path.join(helperDir, 'update-helper.cjs');
  const pointer=JSON.parse(await fs.readFile(path.join(userDataPath,'update-pending.json'),'utf8'));
  if(path.resolve(pointer.planPath)!==path.resolve(planPath))throw new Error('Plano pendente diferente.');
  const expected=JSON.parse(await fs.readFile(planPath,'utf8'));
  Recovery.validatePending(pointer,expected.appPath,userDataPath,validatePackageObject);
  await writeVerifiedAtomic(helperPath, helperSource(expected.appPath,userDataPath));
  if(await needsElevation(expected.appPath)) {
    const acknowledgement=path.join(helperDir,'launched-'+crypto.randomUUID()+'.txt');
    const launcher=spawn('powershell.exe',elevationCommand(helperPath,planPath,acknowledgement),{windowsHide:true,stdio:'ignore'});
    const code=await new Promise((resolve,reject)=>{launcher.once('error',reject);launcher.once('exit',resolve);});
    if(code!==0||!fsSync.existsSync(acknowledgement)) {
      await writeVerifiedAtomic(expected.statusPath,JSON.stringify({state:'failed-before-install',fromVersion:expected.currentVersion,toVersion:expected.expectedVersion,error:'Autorização de administrador cancelada. Nenhum ficheiro instalado.'}));
      await fs.rm(path.join(userDataPath,'update-pending.json'),{force:true});
      throw Error('A atualização não foi iniciada. Autoriza o pedido do Windows para atualizar a instalação.');
    }
    const pid=Number(await fs.readFile(acknowledgement,'utf8'));await fs.rm(acknowledgement,{force:true});
    if(!Number.isSafeInteger(pid)||pid<=0)throw Error('O Windows não confirmou o arranque do atualizador.');
    return {pid,helperPath,elevated:true};
  }
  const child = spawn(process.execPath, [helperPath, planPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  return { pid: child.pid, helperPath };
}

async function readUpdateStatus(userDataPath) {
  const statusPath = path.join(userDataPath, 'update-status.json');
  try { return JSON.parse(await fs.readFile(statusPath, 'utf8')); } catch { return null; }
}

async function clearUpdateStatus(userDataPath) {
  if(fsSync.existsSync(path.join(userDataPath,'update-pending.json')))throw new Error('Não é possível limpar uma atualização pendente.');
  try { await fs.rm(path.join(userDataPath, 'update-status.json'), { force: true }); } catch {}
}

module.exports = {
  needsElevation,
  elevationCommand,
  recoverElevatedSync,
  UPDATE_FORMAT,
  UPDATE_FORMAT_VERSION,
  UPDATE_APP_ID,
  UPDATE_SIGNATURE_MIN_VERSION,
  UPDATE_LEGACY_SIGNATURE_KEY_ID,
  UPDATE_SIGNATURE_PRIMARY_KEY_ID,
  UPDATE_SIGNATURE_RECOVERY_KEY_ID,
  UPDATE_SIGNATURE_KEY_ID,
  UPDATE_TRUSTED_KEYS,
  UPDATE_PUBLIC_KEY,
  compareVersions,
  sha256Buffer,
  canonicalManifestForHash,
  signPackageObject,
  verifyPackageSignature,
  validatePackageObject,
  readAndValidatePackage,
  stageUpdate,
  launchDetachedHelper,
  readUpdateStatus,
  clearUpdateStatus,
};
