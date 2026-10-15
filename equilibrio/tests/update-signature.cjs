'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const U = require('../desktop/manual-updater.cjs');

const LEGACY_SIGNED_VALUE = '8YPtRJCoyTewhnYVHLlJht3V9MNIX8dIcp8zCGTk/adk401uCKLJmDLySWR8LK6L+REBrFNAgIeYZDplF7TOAA==';
const PRIMARY_SIGNED_VALUE = 'Er1r56Q0HzogIjzdEIT9k5ybcp2bmDG5UDg1u8T+IuCKl2Ppv26vs6UKTP7l+fJAPqApKFKyRUKZLueCsOfcAQ==';
const RECOVERY_SIGNED_VALUE = 'Ad5kYS52q49uvlm0n/6Hdm5AZ2DTCuMrkt8G6GAfaLGZgBRT2Y2w8KWMBx5FBgNcqQjSw8CPaFfRuwg+GieFDg==';
const OLD_VERSION = "const APP_VERSION = '0.39.37';";
const NEW_VERSION = "const APP_VERSION = '0.39.38';";
const context = { currentVersion: '0.39.37', schemaVersion: 2 };

function packageOf(keyId = U.UPDATE_SIGNATURE_PRIMARY_KEY_ID, signatureValue = PRIMARY_SIGNED_VALUE) {
  const content = Buffer.from(NEW_VERSION);
  const pkg = {
    format: U.UPDATE_FORMAT,
    formatVersion: U.UPDATE_FORMAT_VERSION,
    appId: U.UPDATE_APP_ID,
    version: '0.39.38',
    displayVersion: 'v0.39.38',
    minAppVersion: '0.39.37',
    maxAppVersion: '0.39.37',
    minSchemaVersion: 2,
    maxSchemaVersion: 2,
    files: [{ path: 'desktop/version.cjs', size: content.length, sha256: U.sha256Buffer(content), contentBase64: content.toString('base64') }],
  };
  pkg.manifestSha256 = U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(pkg)));
  pkg.signature = { algorithm: 'Ed25519', keyId, value: signatureValue };
  return pkg;
}

test('Ed25519: chaves principal, recuperação e histórica são aceites', () => {
  assert.equal(U.validatePackageObject(packageOf(), context).signatureVerified, true);
  assert.equal(U.validatePackageObject(packageOf(U.UPDATE_SIGNATURE_RECOVERY_KEY_ID, RECOVERY_SIGNED_VALUE), context).signatureVerified, true);
  assert.equal(U.validatePackageObject(packageOf(U.UPDATE_LEGACY_SIGNATURE_KEY_ID, LEGACY_SIGNED_VALUE), context).signatureVerified, true);
  const legacy = packageOf();
  delete legacy.signature;
  legacy.minAppVersion = '0.39.36';
  legacy.manifestSha256 = U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(legacy)));
  assert.equal(U.validatePackageObject(legacy, { currentVersion: '0.39.36', schemaVersion: 2 }).signatureVerified, false);
});

test('v0.39.52: atualizações verificadas por integridade não exigem chave de assinatura', () => {
  const pkg = packageOf();
  delete pkg.signature;
  assert.equal(U.validatePackageObject(pkg, context).signatureVerified, false);
});

test('Ed25519: manifesto e ficheiros alterados são rejeitados mesmo com checksums refeitos', () => {
  const metadata = packageOf();
  metadata.displayVersion = 'v0.39.38 alterada';
  metadata.manifestSha256 = U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(metadata)));
  assert.throws(() => U.validatePackageObject(metadata, context), /assinatura digital/i);

  const content = packageOf();
  const changed = Buffer.from('ficheiro alterado');
  content.files[0].contentBase64 = changed.toString('base64');
  content.files[0].sha256 = U.sha256Buffer(changed);
  content.files[0].size = changed.length;
  content.manifestSha256 = U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(content)));
  assert.throws(() => U.validatePackageObject(content, context), /assinatura digital/i);

  const checksum = packageOf();
  checksum.files[0].contentBase64 = changed.toString('base64');
  assert.throws(() => U.validatePackageObject(checksum, context), /Tamanho|Checksum inválido/);
});

test('Ed25519: assinatura falsa, chave desconhecida e formato inválido são rejeitados', () => {
  const wrong = packageOf();
  wrong.signature.value = Buffer.alloc(64, 1).toString('base64');
  assert.throws(() => U.validatePackageObject(wrong, context), /assinatura digital/i);
  const unknown = packageOf();
  unknown.signature.keyId = 'outra-chave';
  assert.throws(() => U.validatePackageObject(unknown, context), /assinatura digital/i);
  const malformed = packageOf();
  malformed.signature.value = 'abc';
  assert.throws(() => U.validatePackageObject(malformed, context), /assinatura digital/i);
});

test('Ed25519: rollback restaura a versão anterior após corrupção do staging', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-signed-update-'));
  const baseResolved = path.resolve(base);
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!baseResolved.startsWith(tempRoot)) throw new Error('Pasta de teste fora da área temporária.');
  t.after(() => fs.rmSync(baseResolved, { recursive: true, force: true }));
  const appPath = path.join(baseResolved, 'app');
  const userDataPath = path.join(baseResolved, 'data');
  fs.mkdirSync(path.join(appPath, 'desktop'), { recursive: true });
  fs.writeFileSync(path.join(appPath, 'desktop', 'version.cjs'), OLD_VERSION);
  const pkg = packageOf();
  const validated = U.validatePackageObject(pkg, context);
  const staged = await U.stageUpdate({ pkg, validated, appPath, userDataPath, currentVersion: context.currentVersion });
  staged.plan.parentPid = 2147483647;
  fs.writeFileSync(staged.planPath, JSON.stringify(staged.plan));{const receiptPath=path.join(path.dirname(path.dirname(path.dirname(staged.planPath))),'update-pending.json');const receipt=JSON.parse(fs.readFileSync(receiptPath));receipt.planSha256=require('../desktop/update-recovery.cjs').planHash(staged.plan);fs.writeFileSync(receiptPath,JSON.stringify(receipt));}
  fs.writeFileSync(path.join(staged.stagingDir, 'desktop', 'version.cjs'), 'ficheiro corrompido');
  await U.launchDetachedHelper({ planPath: staged.planPath, userDataPath });
  let status;
  for (let index = 0; index < 120; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    status = await U.readUpdateStatus(userDataPath);
    if (['success', 'failed-rolled-back', 'failed-rollback-error'].includes(status?.state)) break;
  }
  assert.equal(status?.state, 'failed-rolled-back');
  assert.equal(fs.readFileSync(path.join(appPath, 'desktop', 'version.cjs'), 'utf8'), OLD_VERSION);
});
