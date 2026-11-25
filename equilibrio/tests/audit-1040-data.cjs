'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { prepareDatabase, initializeFreshSchema } = require('../desktop/schema-migrations.cjs');
const P = require('../mobile-sync/shared/protocol.cjs');
const Recovery = require('../mobile-sync/shared/recovery.cjs');
const { Association } = require('../mobile-sync/shared/association.cjs');
const Casa = require('../casa-model.js');

function sqliteFixture(t, version = 2) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-swap-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const main = path.join(directory, 'financas.db');
  const db = new DatabaseSync(main);
  try {
    initializeFreshSchema(db);
    db.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('preservar');");
    db.prepare("UPDATE meta SET value=? WHERE key='db_schema_version'").run(String(version));
  } finally {
    db.close();
  }
  return { directory, main, previous: main + '.pre-migration-swap' };
}

function assertDataPreserved(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(db.prepare('SELECT value FROM sample').get().value, 'preservar');
  } finally {
    db.close();
  }
}

test('SQLite recupera a base após interrupção entre as duas renomeações', t => {
  const { directory, main, previous } = sqliteFixture(t, 1);
  fs.renameSync(main, previous);
  const result = prepareDatabase(main, directory);
  assert.equal(result.fresh, false);
  assert.equal(result.migrated, true);
  assert.equal(result.fromVersion, 1);
  assertDataPreserved(main);
  assertDataPreserved(result.backupPath);
  assert.equal(fs.existsSync(previous), false);
});

test('SQLite mantém a base original se a primeira renomeação falhar', t => {
  const { directory, main, previous } = sqliteFixture(t, 1);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    if (source === main && target === previous) throw new Error('falha de renomeação');
    return rename(source, target);
  });
  assert.throws(() => prepareDatabase(main, directory), /falha de renomeação/);
  assertDataPreserved(main);
  assert.equal(fs.existsSync(previous), false);
});

test('SQLite recupera na abertura seguinte se a reposição imediata também falhar', t => {
  const { directory, main, previous } = sqliteFixture(t, 1);
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === main) throw new Error('destino temporariamente indisponível');
    return rename(source, target);
  });
  assert.throws(() => prepareDatabase(main, directory), /reposição da base ficou pendente/);
  assert.equal(fs.existsSync(main), false);
  assertDataPreserved(previous);

  mock.mock.restore();
  assert.equal(prepareDatabase(main, directory).migrated, true);
  assertDataPreserved(main);
});

test('Passagem e emparelhamento protegem uma Lista de compras sem movimentos', async () => {
  const destination = P.offlineFixture('destination');
  Casa.shopping(destination.confirmed.ledger, 'add', { name: 'Pão', qty: '1' });
  const before = structuredClone(destination);
  const source = P.offlineFixture('source');
  assert.throws(() => Recovery.portable(source, destination), /dispositivo vazio/);

  const adapter = { read: async () => ({ state: destination, revision: 5 }) };
  const vault = { read: async () => null };
  const association = new Association(adapter, vault, () => assert.fail('Pedido de rede inesperado'));
  await assert.rejects(association.start('https://pc.example', '0123456789abcdef'), /contém dados/);
  assert.deepEqual(destination, before);

  const blank = P.offlineFixture('blank');
  blank.confirmed.ledger = P.emptyOfflineLedger();
  assert.equal(P.isBlankOffline(blank), true);
  blank.confirmed.ledger.openingSettings = { custom: true };
  assert.equal(P.isBlankOffline(blank), false);
});

