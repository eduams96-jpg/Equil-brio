'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const F = require('../finance.js');
const {createSqliteStorage} = require('../desktop/storage-sqlite.cjs');
const {resolveBackupText} = require('../desktop/snapshot-backup.cjs');
const {writeVerifiedAtomic, writeBufferCompletely} = require('../desktop/verified-backup.cjs');
function ledger() {
 const d = F.empty(); d.accounts = [{id:'m',name:'Millennium',type:'Banco',balance:5000},{id:'p',name:'Poupança',type:'Poupança',balance:0}];
 return F.migrateLedgerCore(d);
}
const row = (id,type,account,amount=250,date='2026-09-01') => ({id,type,account,amount,date,description:'TRF interna',category:'Transferências'});
function temp(t) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'core-03950-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('Core: Millennium → Poupança, lado único não inventa crédito; par tem um só movimento',()=>{
 const d=ledger();F.importTransaction(d,row('out','expense','Millennium'));
 assert.deepEqual(d.accounts.map(a=>a.balance),[4750,0]);assert.equal(d.transactions[0].transferStatus,'pending');
 F.importTransaction(d,row('in','income','Poupança'));
 assert.equal(d.transactions.length,1);assert.equal(d.transactions[0].targetAccount,'Poupança');
 assert.equal(d.transactions[0].transferStatus,'confirmed');assert.equal(d.transactions[0].transferEvidence.length,2);
 assert.deepEqual(d.accounts.map(a=>a.balance),[4750,250]);assert.equal(F.totals(d,'2026-09').expense,0);
 assert.throws(()=>F.importTransaction(d,row('in','income','Poupança')),/já foi importado/);
 F.remove(d,'out');assert.deepEqual(d.accounts.map(a=>a.balance),[5000,0]);
});
test('Core: importação em ordem inversa e com datas distintas preserva saldos diários',()=>{
 const d=ledger();F.importTransaction(d,row('in','income','Poupança',250,'2026-09-03'));
 F.importTransaction(d,row('out','expense','Millennium'));
 assert.equal(d.transactions.length,1);assert.equal(F.balanceAt(d,d.accounts[1],'2026-09-02'),0);
 assert.equal(F.balanceAt(d,d.accounts[1],'2026-09-03'),250);
});
test('Core: extrato da outra conta confirma transferência já registada sem novo crédito',()=>{
 const d=ledger();F.add(d,{...row('manual','transfer','Millennium'),targetAccount:'Poupança'});
 F.importTransaction(d,row('bank-in','income','Poupança'));
 assert.equal(d.transactions.length,1);assert.deepEqual(d.accounts.map(a=>a.balance),[4750,250]);
 assert.throws(()=>F.importTransaction(d,row('bank-in','income','Poupança')),/já foi importado/);
});
test('Core: lote completo é emparelhado só depois de todas as linhas serem conhecidas',()=>{
 const d=ledger();for(const r of [row('o1','expense','Millennium'),row('i','income','Poupança'),row('o2','expense','Millennium')])F.importTransaction(d,r,{reconcile:false});
 F.reconcileTransfers(d);assert.equal(d.transactions.length,3);assert.ok(d.transactions.every(t=>t.transferStatus==='pending'));
});
test('Core: correspondência ambígua, valor diferente e referência incompatível ficam pendentes',()=>{
 for(const mode of ['ambiguous','amount','reference']) {
  const d=ledger();
  const out=row('out','expense','Millennium');if(mode==='reference')out.bankReference='A';
  F.importTransaction(d,out);
  if(mode==='ambiguous')F.importTransaction(d,row('out2','expense','Millennium'));
  const incoming=row('in','income','Poupança',mode==='amount'?250.01:250);if(mode==='reference')incoming.bankReference='B';
  F.importTransaction(d,incoming);assert.ok(d.transactions.every(t=>t.transferStatus==='pending'));
 }
});
test('Core: saldo inicial e reconciliação sobrevivem a CRUD e cache adulterado',()=>{
 const d=ledger();F.add(d,{...row('adjust','adjustment','Millennium',12),delta:-12});
 F.add(d,{...row('expense','expense','Millennium',20),description:'Compra'});
 d.accounts[0].balance=0;F.refreshBalances(d);assert.equal(d.accounts[0].balance,4968);
 F.update(d,'expense',{...row('expense','expense','Millennium',30),description:'Compra'});
 assert.equal(d.accounts[0].balance,4958);F.remove(d,'expense');assert.equal(d.accounts[0].balance,4988);
});
test('Core: migração uma só vez corrige cache zero apenas com destino explícito',()=>{
 const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>a);
 d.transactions=[{...row('t','transfer','Millennium'),targetAccount:'Poupança'}];
 F.migrateLedgerCore(d);assert.equal(d.accounts[1].balance,250);
 const first=structuredClone(d);F.migrateLedgerCore(d);assert.deepEqual(d,first);
 const ambiguous=F.empty();ambiguous.accounts=first.accounts.map(({openingBalance,...a})=>({...a,balance:0}));
 ambiguous.transactions=[row('t','expense','Millennium')];F.migrateLedgerCore(ambiguous);
 assert.equal(ambiguous.accounts[1].balance,0);assert.equal(ambiguous.transactions[0].transferStatus,'pending');
});
test('Core: uma poupança reconciliada legitimamente a zero não é reparada',()=>{
 const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>a);
 d.transactions=[{...row('t','transfer','Millennium'),targetAccount:'Poupança'}];
 d.reconciliations=[{accountId:'p'}];F.migrateLedgerCore(d);assert.equal(d.accounts[1].balance,0);
});
test('Migração: alias explícito de conta é resolvido uma vez antes de calcular Poupança',()=>{
 const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>a);
 d.transactions=[{...row('t','transfer','Millennium'),targetAccount:'Conta Poupança'}];
 F.migrateLedgerCore(d);assert.equal(d.transactions[0].targetAccount,'Poupança');assert.equal(d.accounts[1].balance,250);
});
test('Migração: saldo explícito do extrato MMEX mais movimentos seguintes',()=>{
 const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>({...a,balance:0}));
 d.transactions=[{...row('a','income','Millennium',10),description:'Entrada',mmexBalanceAfter:100}, {...row('b','expense','Millennium',20,'2026-09-02'),description:'Compra',category:'Casa'}];
 F.migrateLedgerCore(d);assert.equal(d.accounts[0].balance,80);assert.equal(d.accounts[1].balance,0);
});
test('Migração: saída e entrada já existentes unem-se sem duplicar saldos não nulos',()=>{
 const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>a);d.accounts[0].balance=4750;d.accounts[1].balance=250;
 d.transactions=[row('out','expense','Millennium'),row('in','income','Poupança')];F.migrateLedgerCore(d);
 assert.equal(d.transactions.length,1);assert.deepEqual(d.accounts.map(a=>a.balance),[4750,250]);
});
test('Core: confirmar transferência pendente pela edição não duplica a saída',()=>{
 const d=ledger();F.importTransaction(d,row('out','expense','Millennium'));
 F.update(d,'out',{...d.transactions[0],targetAccount:'Poupança',transferStatus:'confirmed',observedSide:undefined});
 assert.deepEqual(d.accounts.map(a=>a.balance),[4750,250]);assert.equal(d.transactions.length,1);
});
test('Core: migração conserva despesas com reembolso e referências de negócio',()=>{
 const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>a);
 d.transactions=[row('out','expense','Millennium'),{...row('refund','income','Millennium',10),refundOf:'out'}];
 F.migrateLedgerCore(d);assert.equal(d.transactions[0].type,'expense');F.normalize(d);
});
test('Backup SQLite: destino inválido não apaga base aberta ou cópia anterior',t=>{
 const dir=temp(t),db=createSqliteStorage(dir);try{
  db.writeSpace('equilibrioData',ledger());assert.throws(()=>db.createConsistentBackup(db.dbPath),/base de dados aberta/);
  const target=path.join(dir,'backup.db');fs.writeFileSync(target,'previous');
  t.mock.method(fs,'renameSync',()=>{throw Error('volume indisponível');});
  assert.throws(()=>db.createConsistentBackup(target),/volume indisponível/);
  assert.equal(fs.readFileSync(target,'utf8'),'previous');assert.equal(db.readSpace('main').data.accounts[0].balance,5000);
 }finally{db.close();}
});
test('Core: reabertura migra com backup SQLite e reinstalação noutro perfil conserva os saldos',t=>{
 const dir=temp(t),other=temp(t);let db=createSqliteStorage(dir);
 try {
  const d=F.empty();d.accounts=ledger().accounts.map(({openingBalance,...a})=>a);d.transactions=[{...row('t','transfer','Millennium'),targetAccount:'Poupança'}];
  db.writeSpace('equilibrioData',d);db.close();db=createSqliteStorage(dir);
  const after=db.readSpace('main').data;assert.equal(after.ledgerCoreVersion,1);assert.equal(after.accounts[1].balance,250);
  assert.equal(fs.readdirSync(path.join(dir,'safety-backups','pre-core-03950')).length,1);
  db.createConsistentBackup(path.join(other,'financas.db'));db.close();db=createSqliteStorage(other);
  assert.deepEqual(db.readSpace('main').data,after);
  db.writeCacheState({equilibrioData:'{"truncated":"'});assert.deepEqual(JSON.parse(db.readState().equilibrioData),after);
 }finally{db.close();}
});
test('Core: uma gravação obsoleta não substitui movimentos mais recentes',t=>{
 const db=createSqliteStorage(temp(t));try{
  const before=ledger();db.writeSpace('equilibrioData',before);const first=structuredClone(before),stale=structuredClone(before);
  F.add(first,{...row('one','expense','Millennium'),description:'Compra'});db.applyLedgerDelta('equilibrioData',before,first);
  F.add(stale,{...row('two','expense','Millennium'),description:'Outra compra'});
  assert.throws(()=>db.applyLedgerDelta('equilibrioData',before,stale),/Recarrega/);
  assert.deepEqual(db.readSpace('main').data,first);
 }finally{db.close();}
});
test('Backup: erro SQLite nunca é disfarçado por JSON válido mas obsoleto ou parcial',()=>{
 const service={listSpaces:()=>[{id:'a'},{id:'b'}],readSpace:id=>id==='a'?{data:ledger()}:null};
 assert.throws(()=>resolveBackupText({dataService:service,preferred:JSON.stringify(ledger()),readStorage:()=>({})}),/Não foi possível ler/);
});
test('Backup: escritas parciais são repetidas até gravar todos os bytes',async t=>{
 const dir=temp(t),fsp=require('node:fs/promises'),open=fsp.open;
 t.mock.method(fsp,'open',async(...args)=>{
  const h=await open(...args),write=h.write.bind(h);
  h.write=(buffer,offset,length,position)=>write(buffer,offset,Math.min(length,7),position);return h;
 });
 const value=Buffer.from('contéudo € '.repeat(200));await writeBufferCompletely(path.join(dir,'partial'),value);
 assert.deepEqual(fs.readFileSync(path.join(dir,'partial')),value);
});
test('Backup: pasta recusada conserva cópia anterior e limpa temporários',async t=>{
 const dir=temp(t),fsp=require('node:fs/promises'),target=path.join(dir,'cópia € antiga.json');fs.writeFileSync(target,'old');
 t.mock.method(fsp,'copyFile',async()=>{throw Object.assign(Error('disco recusou'),{code:'EACCES'});});
 await assert.rejects(writeVerifiedAtomic(target,'new',{retries:1}),/disco recusou/);
 assert.equal(fs.readFileSync(target,'utf8'),'old');assert.deepEqual(fs.readdirSync(dir),['cópia € antiga.json']);
});
