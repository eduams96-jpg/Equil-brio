const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance.js');
require('../complete-model.js');
function ledger(){const d=F.empty();d.accounts=[{id:'b',name:'Banco',type:'Conta',balance:1000}];return d;}
function rule(){return {id:'digi',description:'DIGI',type:'expense',amount:30,account:'Banco',category:'Contas / Internet',start:'2026-09-01',day:1,active:true,splits:[{category:'Contas / Internet',amount:20},{category:'Contas / Telemóveis',amount:10}]};}
test('v0.39.32: invalid splits fail before changing balances',()=>{
 for(const splits of [[{category:'A',amount:30}], [{category:'A',amount:20},{category:'B',amount:11}], [{category:'A',amount:30},{category:'B',amount:0}], [null,null]]){
  const d=ledger(), before=JSON.stringify(d);
  assert.throws(()=>F.add(d,{...rule(),date:'2026-09-01',splits}));
  assert.equal(JSON.stringify(d),before);
 }
});
test('v0.39.32: recurring split pays once, preserves identity and reverses',()=>{
 const d=ledger();d.recurring=[rule()];
 const due=F.upcoming(d,'2026-09')[0]; assert.deepEqual(due.splits,rule().splits);
 const tx=F.add(d,{...due,id:'paid',recurringRuleId:'digi',recurringDate:due.date});
 assert.equal(d.accounts[0].balance,970); assert.equal(F.upcoming(d,'2026-09').length,0);
 assert.equal(F.totals(d,'2026-09').expense,30);
 d.recurring[0].splits[0].amount=19;
 assert.equal(tx.splits[0].amount,20);
 d.recurring[0].splits=[{category:'Contas / Internet',amount:15},{category:'Contas / Telemóveis',amount:15}];
 assert.deepEqual(tx.splits,rule().splits);
 F.remove(d,tx.id);assert.equal(d.accounts[0].balance,1000);assert.equal(F.upcoming(d,'2026-09').length,1);
});
test('v0.39.32: SQLite roundtrip preserves splits, notes and recurrence links without schema change',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-03932-'));
 const d=ledger();d.recurring=[rule()];
 F.add(d,{...rule(),id:'paid',date:'2026-09-01',note:'Fatura',noteColor:'purple',recurringRuleId:'digi',recurringDate:'2026-09-01'});
 let storage=createSqliteStorage(dir);storage.writeSpace('equilibrioData',d);storage.close();
 storage=createSqliteStorage(dir);
 try{const restored=storage.readSpace('main').data;assert.deepEqual(restored.recurring[0].splits,rule().splits);assert.equal(restored.transactions[0].noteColor,'purple');assert.equal(restored.transactions[0].recurringRuleId,'digi');assert.equal(storage.info().dbSchemaVersion,2);F.normalize(restored);}finally{storage.close();}
});
test('v0.39.32: variable split does not silently alter historical allocation',()=>{
 const d=ledger();d.recurring=[{...rule(),occurrenceOverrides:[{originalDate:'2026-09-01',amount:31}]}];
 const due=F.upcoming(d,'2026-09')[0];assert.equal(due.amount,31);
 assert.throws(()=>F.add(d,{...due,id:'invalid'}));assert.equal(d.accounts[0].balance,1000);
 const tx=F.add(d,{...due,id:'paid',splits:[{category:'Contas / Internet',amount:21},{category:'Contas / Telemóveis',amount:10}]});
 assert.equal(d.accounts[0].balance,969);assert.equal(tx.splits[0].amount,21);assert.equal(d.recurring[0].splits[0].amount,20);
});
test('v0.39.32: note color is stable and explicit choices win',()=>{
 for(const color of ['default','blue','green','purple','orange','red']) assert.equal(F.noteTone({noteColor:color,category:'Casa'}),color);
 assert.equal(F.noteTone({category:'Contas / Internet'}),F.noteTone({category:'Contas / Internet',note:'Alterada'}));
 assert.ok(new Set(['Casa','Saúde','Transportes','Contas / Internet','Lazer'].map(category=>F.noteTone({category}))).size>1);
});
