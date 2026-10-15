const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../finance.js'),C=require('../casa-model.js');
function ledger(){const d=F.empty();d.accounts=[{id:'a',name:'Banco',type:'Conta à ordem',balance:100}];return F.migrateLedgerCore(d);}
const purchase=()=>({id:'purchase',date:F.today(),store:'Loja',items:[{name:'Arroz',total:1.2},{name:'Leite',total:0.3}]});
test('Casa: compra sem débito, ligação única e eliminação repõe saldo',()=>{const d=ledger();C.addPurchase(d,purchase());assert.equal(d.accounts[0].balance,100);const id=C.link(d,'purchase','Banco','Alimentação');assert.equal(C.link(d,'purchase','Banco','Alimentação'),id);assert.equal(d.transactions.length,1);assert.equal(d.accounts[0].balance,98.5);F.normalize(d);C.removePurchase(d,'purchase');assert.equal(d.accounts[0].balance,100);assert.equal(d.transactions.length,0);F.normalize(d);});
test('Casa: criação com movimento é atómica mesmo com conta ou mês inválidos',()=>{const d=ledger(),before=JSON.stringify(d);assert.throws(()=>C.addPurchase(d,{...purchase(),account:'Ausente',category:'Casa'}));assert.equal(JSON.stringify(d),before);d.closedMonths=[F.today().slice(0,7)];const closed=JSON.stringify(d);assert.throws(()=>C.addPurchase(d,purchase()));assert.equal(JSON.stringify(d),closed);});
test('Casa: rejeita totais, artigos inválidos, IDs repetidos e versões futuras',()=>{const d=ledger();for(const items of [[],[{name:'',total:1}],[{name:'x',total:-1}],[{name:'x',total:0.001}]])assert.throws(()=>C.addPurchase(d,{...purchase(),items}));C.addPurchase(d,purchase());assert.throws(()=>C.addPurchase(d,purchase()));d.casa.version=99;assert.throws(()=>F.normalize(d));});
test('Casa: movimentos ligados não podem ser eliminados isoladamente ou adulterados',()=>{const d=ledger();C.addPurchase(d,{...purchase(),account:'Banco',category:'Casa'});assert.throws(()=>F.remove(d,d.transactions[0].id),/compra Casa/);d.transactions[0].amount=3;assert.throws(()=>F.normalize(d),/não coincidem/);delete d.casa;assert.throws(()=>F.normalize(d),/sem compra/);});
test('Casa: falha ao eliminar compra com reembolso preserva compra e saldo',()=>{const d=ledger();C.addPurchase(d,{...purchase(),account:'Banco',category:'Casa'});const tx=d.transactions[0];F.add(d,{date:F.today(),description:'Reembolso',amount:1,type:'income',account:'Banco',refundOf:tx.id});const before=JSON.stringify(d);assert.throws(()=>C.removePurchase(d,'purchase'));assert.equal(JSON.stringify(d),before);});
test('Casa: lista persistida e espaços independentes, sem contaminação do original',()=>{const d=ledger(),other=ledger();C.shopping(d,'add',{name:'Maçãs',qty:'2 kg'});const id=d.casa.shopping[0].id;C.shopping(d,'toggle',{id});const restored=F.normalize(JSON.parse(JSON.stringify(d)));assert.equal(restored.casa.shopping[0].done,true);assert.equal(other.casa,undefined);C.shopping(d,'remove',{id});assert.equal(d.casa.shopping.length,0);assert.equal(restored.casa.shopping.length,1);});
test('Casa: SQLite preserva ligações e rejeita backups/deltas incoerentes sem escrita parcial',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'casa-sqlite-'));let db;
 try{
  db=createSqliteStorage(dir);const d=ledger();C.addPurchase(d,{...purchase(),account:'Banco',category:'Casa'});db.writeSpace('equilibrioData',d);
  const before=db.readState(),bad=structuredClone(d);bad.transactions[0].amount=9;
  assert.throws(()=>db.applyLedgerDelta('equilibrioData',d,bad));assert.deepEqual(db.readState(),before);
  assert.throws(()=>db.writeState({...before,equilibrioData:JSON.stringify(bad)}));assert.deepEqual(db.readState(),before);
  db.close();db=createSqliteStorage(dir);assert.deepEqual(db.readSpace('main').data,d);
 }finally{db?.close();if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('casa-sqlite-'))fs.rmSync(dir,{recursive:true,force:true});}
});
