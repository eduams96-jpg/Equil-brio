const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8');
const snapshot=fs.readFileSync(path.join(root,'desktop/snapshot-backup.cjs'),'utf8');

test('v0.39.47: fechar cria backup fresco do SQLite e não usa latestSnapshot',()=>{
  assert.match(main,/createNativeBackup\('', \{ force: false, reason: 'close' \}\)/);
  assert.doesNotMatch(main,/createNativeBackup\(latestSnapshot, \{ force: false, reason: 'close' \}\)/);
});

test('v0.39.47: pré-update não passa o snapshot do renderer para a cópia de segurança',()=>{
  assert.match(main,/prepareSafetyBackup\('', \{/);
  assert.doesNotMatch(main,/resolveBackupText\(\{ preferred: latestSnapshot, dataService/);
});

test('v0.39.47: SQLite tem prioridade sobre JSON do renderer',()=>{
  const sqliteIndex=snapshot.indexOf('buildSqliteSnapshot(dataService, now, metadata)');
  const preferredIndex=snapshot.indexOf('if (isValidJsonText(preferred)) return preferred;');
  assert.ok(sqliteIndex>=0 && preferredIndex>sqliteIndex);
});

test('v0.39.47: arranque repara browser-state.json inválido a partir do SQLite',()=>{
  assert.match(main,/repairJsonRecoveryMirrorFromSqlite\(\)/);
  assert.match(main,/browser-state-corrupt-/);
});
