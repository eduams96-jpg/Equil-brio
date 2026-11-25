'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { backup, DatabaseSync } = require('node:sqlite');
const { sha256Buffer, validatePackageObject } = require('../desktop/manual-updater.cjs');
const { browserLaunchOptions } = require('./_browser.cjs');

const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const temp = os.tmpdir();

function verifyVersions(baseline) {
  const previous = require(path.join(baseline, 'package.json')).version;
  const release = path.join(root, '..', 'entrega-v' + version);
  const update = JSON.parse(fs.readFileSync(path.join(release, 'financas-pessoais-v' + version + '.fpupdate'), 'utf8'));
  const validated = validatePackageObject(update, { currentVersion: previous, schemaVersion: 2 });
  const originalRelease = path.join(root, '..', 'entrega-v' + previous);
  const baselineFiles = JSON.parse(fs.readFileSync(path.join(originalRelease, 'update-files-v' + previous + '.json'), 'utf8'));
  for (const file of baselineFiles) {
    assert.equal(sha256Buffer(fs.readFileSync(path.join(baseline, file.path))), file.sha256, file.path);
  }
  for (const file of validated.files) {
    assert.equal(sha256Buffer(fs.readFileSync(path.join(root, file.path))), file.sha256, file.path);
  }
  return previous;
}

async function main() {
  const baseline = path.resolve(process.argv[2] || fs.readFileSync(path.join(temp, 'equilibrio-baseline-1029.txt'), 'utf8').trim());
  const previous = verifyVersions(baseline);
  const electron = require('electron');
  const browser = browserLaunchOptions().executablePath;
  assert.ok(fs.statSync(electron).isFile(), 'Electron indisponível');
  assert.ok(browser && fs.statSync(browser).isFile(), 'Navegador indisponível');
  assert.ok(process.env.APPDATA, 'Pasta de dados do Windows indisponível');

  const directory = fs.mkdtempSync(path.join(temp, 'equilibrio-fluidez-'));
  const snapshot = path.join(directory, 'origem-teste.db');
  const production = path.join(process.env.APPDATA, 'Financas Pessoais', 'financas.db');
  const source = new DatabaseSync(production, { readOnly: true });
  try {
    await backup(source, snapshot);
  } finally {
    source.close();
  }
  const copied = new DatabaseSync(snapshot, { readOnly: true });
  try {
    assert.equal(copied.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  } finally {
    copied.close();
  }

  for (const name of ['referencia', 'atual']) {
    const profile = path.join(directory, name);
    const data = path.join(profile, 'Financas Pessoais');
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(profile, '.equilibrio-validation'), '');
    fs.copyFileSync(snapshot, path.join(data, 'financas.db'));
  }
  const manifest = {
    preparedAt: new Date().toISOString(),
    previous,
    version,
    baseline,
    current: root,
    snapshot,
    profiles: {
      reference: path.join(directory, 'referencia'),
      current: path.join(directory, 'atual'),
    },
  };
  const manifestPath = path.join(directory, 'preparacao.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ previous, version, manifestPath, sqliteCheck: 'ok' }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
