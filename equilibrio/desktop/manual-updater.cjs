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
    if (context.requireSignature) throw new Error('A atualização tem de ter uma assinatura digital reconhecida.');
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

const MAX_UPDATE_PACKAGE_BYTES = 128 * 1024 * 1024;

async function readAndValidatePackage(filePath, context) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_UPDATE_PACKAGE_BYTES) {
    throw new Error('O ficheiro .fpupdate tem um tamanho inválido.');
  }
  const text = await fs.readFile(filePath, 'utf8');
  let pkg;
  try { pkg = JSON.parse(text); } catch { throw new Error('O ficheiro .fpupdate não contém JSON válido.'); }
  const validated = validatePackageObject(pkg, context);
  return { pkg, validated };
}

async function ensureWritableDirectory(directory) {
  const probe = path.join(directory, `.financas-update-write-test-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(probe, 'ok', { flag: 'wx' });
    await fs.rm(probe, { force: true });
    return true;
  } catch (error) {
    try { await fs.rm(probe, { force: true }); } catch {}
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

async function stageUpdate({ pkg, validated, appPath, userDataPath, currentVersion, schemaVersion, requireSignature = false }) {
  const effectiveSchema = Number(schemaVersion ?? pkg.minSchemaVersion ?? 0);
  const checked = validatePackageObject(pkg, { currentVersion, schemaVersion: effectiveSchema, requireSignature });
  if (checked.manifestSha256 !== validated.manifestSha256) throw new Error('O pacote mudou depois da validação.');
  validated = checked;
  if (fsSync.existsSync(path.join(userDataPath,'update-pending.json'))) throw new Error('Existe uma atualização pendente; recupera antes de preparar outra.');
  if (!await ensureWritableDirectory(appPath)) {
    throw new Error('Esta instalação está numa pasta protegida. Usa o instalador oficial para atualizar.');
  }
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
    schemaVersion: effectiveSchema,
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
  const marker = path.join(userDataPath,'update-pending.json');
  if (fsSync.existsSync(marker)) throw new Error('Existe uma atualização pendente; recupera antes de preparar outra.');
  await writeVerifiedAtomic(marker, JSON.stringify({planPath,planSha256:Recovery.planHash(plan)}));
  return { root, stagingDir, rollbackDir, planPath, plan };
}

async function launchDetachedHelper({ planPath, userDataPath, requireSignature = false }) {
  const helperPath = path.join(__dirname, 'update-helper.cjs');
  const pointer=JSON.parse(await fs.readFile(path.join(userDataPath,'update-pending.json'),'utf8'));
  if(path.resolve(pointer.planPath)!==path.resolve(planPath))throw new Error('Plano pendente diferente.');
  const expected=JSON.parse(await fs.readFile(planPath,'utf8'));
  Recovery.validatePending(pointer,expected.appPath,userDataPath,(pkg,context) =>
    validatePackageObject(pkg,{...context,requireSignature}));
  const mode = requireSignature ? 'signed' : 'development';
  const child = spawn(process.execPath, [helperPath, planPath, expected.appPath, userDataPath, mode], {
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
