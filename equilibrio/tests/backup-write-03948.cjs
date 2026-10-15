const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeVerifiedAtomic, sha256 } = require('../desktop/verified-backup.cjs');
const { createSqliteStorage } = require('../desktop/storage-sqlite.cjs');

test('v0.39.48: escrita verificada preserva um JSON grande sem truncar', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-backup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const payload = JSON.stringify({ rows: Array.from({ length: 26000 }, (_, i) => ({ i, text: 'x'.repeat(70) })) });
  assert.ok(Buffer.byteLength(payload) > 2_000_000);
  const target = path.join(dir, 'backup.json');
  const result = await writeVerifiedAtomic(target, payload, { stageDirectory: path.join(dir, 'stage'), retries: 3 });
  assert.equal(result.ok, true);
  const written = fs.readFileSync(target);
  assert.equal(written.length, Buffer.byteLength(payload));
  assert.equal(sha256(written), sha256(Buffer.from(payload)));
  assert.deepEqual(JSON.parse(written.toString('utf8')).rows.length, 26000);
});

test('v0.39.48: SQLite consegue produzir uma cópia consistente e verificável', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-sqlite-backup-'));
  const store = createSqliteStorage(dir);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const state = store.readState();
  const key = Object.keys(state).find((k) => k.startsWith('financas:space:')) || 'financas:space:test';
  const sample = { spaceName: 'Teste', accounts: [{ id: 'a1', name: 'Poupança', balance: 4476.34 }], transactions: [], debts: [], recurring: [], categoryCatalog: [], categoryArchive: [] };
  store.writeState({ ...state, [key]: JSON.stringify(sample) });
  const target = path.join(dir, 'safety', 'backup.db');
  const result = store.createConsistentBackup(target);
  assert.equal(result.ok, true);
  assert.ok(result.size > 0);
  assert.ok(fs.existsSync(target));
});

test('v0.39.48: o fecho e o pré-update têm fallback e já não dependem de writeFile+JSON.parse imediato', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  assert.match(main, /automatic-fallback/);
  assert.match(main, /writeVerifiedAtomic/);
  assert.match(main, /createConsistentBackup/);
  assert.doesNotMatch(main, /A cópia de segurança ficou incompleta durante a escrita\./);
});
