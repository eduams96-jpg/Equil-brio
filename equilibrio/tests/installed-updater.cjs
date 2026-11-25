'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const U = require('../desktop/manual-updater.cjs');

test('Atualizador encaminha instalações protegidas para o instalador oficial', async t => {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-update-protected-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appPath = path.join(root, 'app');
  const userDataPath = path.join(root, 'profile');
  fs.mkdirSync(appPath);
  const content = Buffer.from("const APP_VERSION = '0.2.0';");
  const pkg = {
    format: U.UPDATE_FORMAT, formatVersion: 1, appId: U.UPDATE_APP_ID, version: '0.2.0',
    minSchemaVersion: 2,
    files: [{ path: 'desktop/version.cjs', size: content.length,
      sha256: U.sha256Buffer(content), contentBase64: content.toString('base64') }],
  };
  pkg.manifestSha256 = U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(pkg)));
  const currentVersion = '0.1.0';
  const validated = U.validatePackageObject(pkg, { currentVersion, schemaVersion: 2 });
  const options = { pkg, validated, appPath, userDataPath, currentVersion };

  const write = t.mock.method(fsp, 'writeFile', async () => {
    throw Object.assign(new Error('Acesso recusado'), { code: 'EACCES' });
  });
  await assert.rejects(U.stageUpdate(options), /instalador oficial/);
  assert.equal(fs.existsSync(userDataPath), false);
  assert.deepEqual(fs.readdirSync(appPath), []);

  write.mock.mockImplementation(async () => {
    throw Object.assign(new Error('Disco indisponível'), { code: 'EIO' });
  });
  await assert.rejects(U.stageUpdate(options), error => error.cause?.code === 'EIO');

  write.mock.restore();
  await U.stageUpdate(options);
  assert.deepEqual(fs.readdirSync(appPath), []);
});
