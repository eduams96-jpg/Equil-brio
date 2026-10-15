const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidJsonText, buildSqliteSnapshot, resolveBackupText } = require('../desktop/snapshot-backup.cjs');

function fakeService() {
  return {
    listSpaces: () => [{ id: 'main', name: 'Pessoal' }, { id: 'work', name: 'Trabalho' }],
    readSpace: (id) => ({ id, name: id === 'main' ? 'Pessoal' : 'Trabalho', data: { spaceName: id, accounts: [], transactions: [] } }),
  };
}

test('v0.39.47: SQLite prevalece mesmo quando existe snapshot JSON válido', () => {
  const original = JSON.stringify({ stale: true, value: 'x'.repeat(1024) });
  const resolved = JSON.parse(resolveBackupText({ preferred: original, dataService: fakeService(), now: () => '2026-09-25T14:00:00.000Z' }));
  assert.equal(resolved.format, 'equilibrio-spaces');
  assert.equal(resolved.spaces.length, 2);
  assert.equal(resolved.stale, undefined);
});

test('v0.39.43: snapshot truncado é reconstruído diretamente do SQLite', () => {
  const broken = '{"format":"equilibrio-spaces","spaces":[{"name":"Pessoal","data":{"note":"unterminated';
  assert.equal(isValidJsonText(broken), false);
  const text = resolveBackupText({ preferred: broken, dataService: fakeService(), now: () => '2026-09-25T12:00:00.000Z' });
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'equilibrio-spaces');
  assert.equal(parsed.spaces.length, 2);
  assert.equal(parsed.spaces[0].name, 'Pessoal');
});

test('v0.39.43: sem SQLite usa o armazenamento de compatibilidade como último recurso', () => {
  const text = resolveBackupText({ preferred: 'not json', dataService: null, readStorage: () => ({ equilibrioSpaces: '[]' }) });
  assert.deepEqual(JSON.parse(text), { equilibrioSpaces: '[]' });
});

test('v0.39.43: buildSqliteSnapshot falha se um espaço não puder ser lido', () => {
  const service = { listSpaces: () => [{ id: 'main', name: 'Pessoal' }], readSpace: () => null };
  assert.throws(() => buildSqliteSnapshot(service), /Não foi possível ler o espaço/);
});
