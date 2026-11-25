'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const F = require('../finance.js');
const { createDataService } = require('../desktop/data-service.cjs');
const { createSqliteStorage } = require('../desktop/storage-sqlite.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-confirmacao-'));
  const db = createSqliteStorage(dir);
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const input = F.empty();
  input.accounts = [{ id: 'bank', name: 'Banco', type: 'Banco', balance: 1000 }];
  const before = F.normalize(F.migrateLedgerCore(input));
  db.writeSpace('equilibrioData', before);
  const service = createDataService(db);
  const commit = (from, to) => service.commitLedgerConfirmed('equilibrioData', JSON.stringify(from), JSON.stringify(to));
  return { dir, db, before, commit };
}

function expense(ledger) {
  const after = structuredClone(ledger);
  F.add(after, { id: 'purchase', date: F.today(), type: 'expense', account: 'Banco', amount: 15, description: 'Compra' });
  return F.normalize(after);
}

test('confirma o estado persistido e devolve os dados quando o nome ou saldo são corrigidos', (t) => {
  const { db, before, commit } = fixture(t);
  const after = expense(before);
  after.accounts[0].balance = 400;
  const result = commit(before, after);
  const persisted = db.readSpace('main');
  assert.ok(result.confirmed);
  assert.equal(persisted.data.accounts[0].balance, 985);
  assert.deepEqual(JSON.parse(result.confirmedLedgerText), { ...persisted.data, spaceName: persisted.name });
  assert.throws(() => commit(before, after), /noutra operação/);
  assert.deepEqual(db.readSpace('main'), persisted);
});

test('responde de forma compacta quando os dados enviados já correspondem ao SQLite', (t) => {
  const { db, before, commit } = fixture(t);
  const after = expense(before);
  after.spaceName = db.readSpace('main').name;
  const result = commit(before, after);
  assert.ok(result.confirmed);
  assert.equal(result.confirmedLedgerText, undefined);
  assert.deepEqual(db.readSpace('main').data, after);
});

test('reverte a gravação inteira quando a confirmação deteta um resultado diferente', (t) => {
  const { dir, db, before, commit } = fixture(t);
  const persisted = db.readSpace('main');
  const cache = db.readState();
  const connection = new DatabaseSync(path.join(dir, 'financas.db'));
  try {
    connection.exec(`
      CREATE TRIGGER test_change_transaction AFTER INSERT ON transactions
      WHEN NEW.id = 'purchase' BEGIN
        UPDATE transactions SET payload_json = json_set(payload_json, '$.amount', 1)
        WHERE id = NEW.id AND space_id = NEW.space_id;
      END;
    `);
  } finally {
    connection.close();
  }
  assert.throws(() => commit(before, expense(before)), /confirmação dos dados/);
  assert.deepEqual(db.readSpace('main'), persisted);
  assert.deepEqual(db.readState(), cache);
});

test('o primeiro espaço pode ser gravado e uma chave ausente num perfil existente é recusada', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-primeira-gravacao-'));
  const db = createSqliteStorage(dir);
  t.after(() => { db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
  const service = createDataService(db);
  const before = F.normalize(F.migrateLedgerCore(F.empty()));
  const next = structuredClone(before);
  next.profile = 'Ensaio';
  const beforeText = JSON.stringify(before), afterText = JSON.stringify(next);
  const result = service.commitLedgerConfirmed('equilibrioData', beforeText, afterText);
  assert.equal(result.mode,'full-create');
  assert.equal(result.confirmed,true);
  assert.equal(db.readSpace('main').data.profile,'Ensaio');
  assert.throws(() => service.commitLedgerConfirmed('equilibrioData:apagado', beforeText, afterText), /já não existe/);
  assert.equal(db.listSpaces().length,1);
});

test('commitLedgerPatch confirma escrita, bloqueia conflito e reverte adulteração SQLite', (t) => {
  const { db } = fixture(t);
  const service = createDataService(db);
  const before = db.readSpace('main').data;
  const tx = { id: 'p1', date: '2026-09-02', type: 'expense', account: 'Banco', amount: 25, description: 'Café', category: 'Alimentação', note: 'inicial' };
  const afterAdd = structuredClone(before);
  F.add(afterAdd, tx);
  const added = service.commitLedgerConfirmed('equilibrioData', JSON.stringify(before), JSON.stringify(afterAdd));
  assert.equal(added.confirmed, true);

  // Patch edit happy path
  const storedTx = db.readSpace('main').data.transactions[0];
  const editedTx = { ...storedTx, note: 'editado' };
  const patchOk = {
    version: 2,
    baseUpdatedAt: added.updatedAt,
    spaceName: before.spaceName,
    domains: {
      transactions: {
        countBefore: 1,
        countAfter: 1,
        deleted: [],
        changed: [{ id: 'p1', order: 0, oldOrder: 0, hadBefore: true, before: storedTx, after: editedTx }],
      },
    },
    remainder: {
      activity: {
        op: 'activity',
        beforeLen: db.readSpace('main').data.activity.length,
        lastBeforeId: db.readSpace('main').data.activity.at(-1)?.id ?? null,
        pushed: [{ id: 'act-1', message: 'Movimento atualizado.', changes: [] }],
        maxLen: 150,
      },
    },
  };
  const res = service.commitLedgerPatch('equilibrioData', JSON.stringify(patchOk));
  assert.equal(res.confirmed, true);
  assert.equal(res.mode, 'patch');
  assert.equal(db.readSpace('main').data.transactions[0].note, 'editado');
  assert.equal(db.readSpace('main').data.activity.at(-1).id, 'act-1');

  // Stale baseUpdatedAt conflict must fail and not mutate
  assert.throws(() => service.commitLedgerPatch('equilibrioData', JSON.stringify(patchOk)), /alterados noutra operação/);

  // SQLite trigger corruption must fail confirmation and roll back
  const persisted = db.readSpace('main');
  const connection = new DatabaseSync(db.dbPath);
  try {
    connection.exec(`
      CREATE TRIGGER test_patch_corrupt AFTER UPDATE ON transactions
      WHEN NEW.id = 'p1' BEGIN
        UPDATE transactions SET payload_json = json_set(payload_json, '$.amount', 999)
        WHERE id = NEW.id AND space_id = NEW.space_id;
      END;
    `);
  } finally {
    connection.close();
  }
  const patchCorrupt = {
    version: 2,
    baseUpdatedAt: res.updatedAt,
    spaceName: before.spaceName,
    domains: {
      transactions: {
        countBefore: 1,
        countAfter: 1,
        deleted: [],
        changed: [{ id: 'p1', order: 0, oldOrder: 0, hadBefore: true, before: editedTx, after: { ...editedTx, note: 'adulterado' } }],
      },
    },
    remainder: {},
  };
  assert.throws(() => service.commitLedgerPatch('equilibrioData', JSON.stringify(patchCorrupt)), /confirmação dos dados/);
  assert.deepEqual(db.readSpace('main'), persisted);
});
