
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const F=require('../finance.js');
const C=require('../complete-model.js');
const P=require('../planning-model.js');
const R=require('../practical-model.js');
const D=require('../dossiers-model.js');
const Casa=require('../casa-model.js');
const Meals=require('../casa-life-model.js');
const Prices=require('../casa-daily-model.js');
const {createSqliteStorage}=require('../desktop/storage-sqlite.cjs');

function ledger(){
 const d=F.empty();
 d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:4000},{id:'b',name:'Refeição',type:'Banco',balance:10}];
 F.migrateLedgerCore(d);
 return d;
}

test('Correções individuais e em grupo persistem em SQLite e não atravessam espaços',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-corrections-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const d=ledger();
 for(const category of ['Subscrições','Mercearia','Outros Despesas'])
  F.add(d,{id:category,type:'expense',date:'2026-05-01',amount:10,description:category,account:'Banco',category});
 d.correctionsDismissed=[{oldValue:7},'tx:water'];
 const before=structuredClone(d.transactions);
 C.dismissCorrections(d,['move:Subscrições']);
 C.dismissCorrections(d,['move:Mercearia','move:Outros Despesas']);
 const first=createSqliteStorage(temp);
 first.writeSpace('equilibrioData',F.normalize(d));first.writeSpace('equilibrioData:other',ledger());first.close();
 const second=createSqliteStorage(temp);
 try{
  const {data:saved}=second.readSpace('main');
  assert.equal(C.suggestedCorrections(saved).length,0);
  assert.deepEqual(saved.transactions,before);
  assert.deepEqual(saved.correctionsDismissedLegacy,[{oldValue:7}]);
  assert.equal(saved.correctionsDismissed.length,4);
  assert.deepEqual(second.readSpace('other').data.correctionsDismissed,[]);
 }finally{second.close();}
});

test('Cobertura virtual agrupa a mesma despesa e acompanha transferências e despesas',()=>{
 const d=ledger(),date='2026-10-15';
 d.goals=[{id:'g',current:1000,target:1500,accountId:'a'}];
 d.reserves=[{id:'r',saved:1000,target:1000}];
 d.budgets=[{id:'bgt',category:'Casa',limit:1000}];
 const amount=()=>P.protection(d,date)[0];
 P.saveProtection(d,'reserve','r','a','');
 P.saveProtection(d,'budget','bgt','a','');
 assert.equal(amount().protectedAmount,3000);
 assert.equal(amount().available,1000);
 F.add(d,{type:'transfer',id:'t',date,account:'Banco',targetAccount:'Refeição',amount:1100,description:'Transferência',category:'Transferência'});
 assert.equal(amount().balance,2900);
 assert.equal(amount().deficit,100);
 assert.equal(D.notices(d,{today:date}).rows.some(n=>n.id.startsWith('protection:a:')),true);
 P.saveProtection(d,'goal','g','a','Seguro');
 P.saveProtection(d,'reserve','r','a','seguro');
 assert.equal(amount().protectedAmount,2000);
 F.add(d,{type:'expense',id:'p',date,account:'Banco',amount:50,description:'Despesa',category:'Casa'});
 assert.equal(amount().protectedAmount,1950);
 assert.equal(amount().balance,2850);
});

test('Consumo mensal é independente de leituras antigas e permite corrigir meses',()=>{
 const d=ledger();
 const save=(date,reading,input={})=>D.saveUtilityReading(d,{utility:'electricity',date,reading,...input});
 save('2026-01-01',1100);
 save('2026-02-01',1250);
 save('2026-01-01',250,{kind:'monthly'});
 const row=save('2026-02-01',220,{kind:'monthly',unitPrice:0.2});
 save('2026-03-01',275,{kind:'monthly'});
 assert.deepEqual(D.monthlyUtility(d,'electricity').rows.map(r=>r.reading),[275,220,250]);
 assert.equal(D.monthlyUtility(d,'electricity').rows[1].cost,44);
 assert.equal(D.utilityComparison(d).monthly[0].consumption,150);
 assert.throws(()=>save('2026-02-01',200,{kind:'monthly'}),/existe/);
 save('2026-02-01',225,{id:row.id,kind:'monthly'});
 assert.equal(D.monthlyUtility(F.normalize(d),'electricity').average,250);
 assert.equal(d.casa.utilityReadings.length,2);
});

test('Rotinas quinzenais e prestações IMI usam as datas registadas',()=>{
 const d=ledger();
 const date=F.today();
 const routine=D.saveRoutine(d,{title:'Filtro',frequency:'fortnightly',nextDate:date});
 assert.equal(D.routineFrequency(routine),'fortnightly');
 D.completeRoutine(d,routine.id);
 const completed=D.routines(d)[0],expected=new Date(date+'T12:00:00Z');
 expected.setUTCDate(expected.getUTCDate()+14);
 assert.equal(completed.nextDate,expected.toISOString().slice(0,10));
 assert.equal(completed.history.length,1);
 const h=D.saveHousing(d,{name:'Apartamento',imiDate:'2026-11-20',imiDates:['2026-11-21','2026-11-20']});
 const rows=D.notices(d,{today:'2026-11-14'}).rows.filter(r=>r.originId===h.id);
 assert.equal(rows.length,2);
 assert.ok(rows.every(r=>r.stage===7));
});

test('Receita eliminada mantém referências de refeições existentes e sai das sugestões',()=>{
 const d=ledger(),id=Casa.saveProduct(d,{name:'Arroz',unit:'kg',category:'Casa'});
 const create=name=>Meals.saveRecipe(d,{name,servings:2,ingredients:[{catalogId:id,qty:1}]});
 const linked=create('Arroz'),loose=create('Arroz simples');
 Meals.plan(d,{recipeId:linked,date:F.today(),meal:'lunch',servings:2});
 assert.equal(Meals.removeRecipe(d,loose),false);
 assert.equal(Meals.removeRecipe(d,linked),true);
 assert.deepEqual(Prices.suggestRecipes(d),[]);
 assert.equal(d.casa.plans[0].recipeId,linked);
 assert.equal(d.casa.recipes[0].archived,true);
 assert.doesNotThrow(()=>F.normalize(d));
});

test('Histórico coerente sugere regras que exigem aprovação e admite rejeições',()=>{
 const d=ledger();
 for(let i=0;i<3;i++)F.add(d,{id:'x'+i,type:'expense',date:'2026-05-01',amount:10,description:'Compra',beneficiary:'Loja Central',account:'Banco',category:'Alimentação'});
 const [s]=R.suggestions(d);
 assert.equal(s.match,'loja central');
 assert.equal(R.state(d).rules.length,0);
 R.rejectSuggestion(d,R.suggestionKey(s));
 assert.deepEqual(R.suggestions(F.normalize(d)),[]);
 R.saveRule(d,{id:'one',match:'Loja Central',category:'Alimentação',active:true,exceptions:[],origin:'manual'});
 assert.throws(()=>R.saveRule(d,{id:'two',match:'Loja',category:'Outros',active:true,exceptions:[]}),/corresponder/);
});

test('Preços verificados pela correspondência de código, loja física, país e unidade são observações separadas',()=>{
 const d=ledger(),store=Casa.saveStore(d,{name:'Loja'}),barcode='3017620422003';
 const id=Casa.saveProduct(d,{name:'Creme',unit:'un',category:'Casa',barcode});
 Casa.setOffer(d,id,store,{price:4,packageQty:1});
 Prices.setPriceWatch(d,[{storeId:store,locationId:6}]);
 const row={id:1,type:'PRODUCT',product_code:barcode,location_id:6,location:{osm_address_country_code:'PT'},date:'2026-11-12',price:3.5,currency:'EUR',price_is_discounted:true,price_without_discount:4};
 const rows=Prices.observedPrices({items:[row,{...row,id:2,location_id:7},{...row,id:3,price_per:'KILOGRAM'}]},barcode,6,'2026-11-18');
 assert.equal(rows.length,1);
 Prices.recordPriceChecks(d,[{barcode,locationId:6,rows,status:'found'}],'2026-11-18');
 assert.equal(Prices.priceWatch(F.normalize(d)).observations[0].price,3.5);
 assert.equal(d.casa.catalog[0].offers[store].price,4);
});


test('Consumos por datas editam os meses antigos e preservam as leituras acumuladas',()=>{
 const d=ledger();
 D.saveUtilityReading(d,{utility:'electricity',date:'2026-10-01',reading:550});
 const october=D.saveUtilityReading(d,{utility:'electricity',kind:'monthly',date:'2026-10-01',reading:90});
 assert.deepEqual(D.utilityPeriod(october),{start:'2026-10-01',end:'2026-10-31'});
 const input={id:october.id,kind:'monthly',periodStart:'2026-09-27',periodEnd:'2026-10-28',supplier:'  Comercializadora de teste  '};
 const updated=D.saveUtilityReading(d,input);
 assert.equal(updated.id,october.id);
 assert.equal(updated.reading,90);
 assert.equal(updated.supplier,'Comercializadora de teste');
 assert.equal(d.casa.utilityMonthly.length,0);
 assert.equal(d.casa.utilityReadings[0].reading,550);
 assert.equal(D.monthlyUtility(F.normalize(d),'electricity').rows[0].period.end,'2026-10-28');
 const water=D.saveUtilityReading(d,{utility:'water',kind:'monthly',periodStart:'2026-10-02',periodEnd:'2026-10-24',reading:8,supplier:'irrelevante'});
 assert.equal(water.supplier,undefined);
 assert.throws(()=>D.saveUtilityReading(d,{...water,id:undefined}),/existe/);
 assert.throws(()=>D.saveUtilityReading(d,{...water,periodEnd:'2026-09-02'}),/data de fim/);
 D.removeUtilityReading(d,water.id);
 assert.deepEqual(D.monthlyUtility(d,'water').rows,[]);
});

test('Quinzena começa na última execução e corrige o prazo semanal herdado',()=>{
 const d=ledger();
 const row=D.saveRoutine(d,{title:'Limpar exaustor',frequency:'weekly',nextDate:'2026-11-14'});
 D.completeRoutine(d,row.id,{date:'2026-11-14'});
 const legacy=d.practical.routines[0];
 legacy.intervalDays=14;
 assert.equal(legacy.nextDate,'2026-11-21');
 assert.equal(D.routines(d)[0].nextDate,'2026-11-28');
 assert.equal(D.notices(d,{today:'2026-11-18'}).rows.find(n=>n.originId===row.id).date,'2026-11-28');
 D.completeRoutine(d,row.id,{date:'2026-11-27'});
 assert.equal(D.routines(d)[0].nextDate,'2026-12-11');
 const weekly=D.saveRoutine(d,{title:'Filtro',frequency:'weekly',nextDate:'2026-11-14'});
 D.completeRoutine(d,weekly.id,{date:'2026-11-14'});
 const fortnight=D.saveRoutine(d,{id:weekly.id,title:'Filtro',frequency:'fortnightly',nextDate:'2026-11-21'});
 assert.equal(fortnight.nextDate,'2026-11-28');
 const manual=D.saveRoutine(d,{id:weekly.id,title:'Filtro',frequency:'weekly',nextDate:'2026-11-28',keepNextDate:true});
 assert.equal(manual.nextDate,'2026-11-28');
});

test('Fatura antiga de água e saneamento soma as parcelas e compara cada serviço com o período anterior',()=>{
 const d=ledger();
 for(const [utility,month,reading,billAmount] of [
  ['water','2025-01',8,12],['water','2025-02',10,15],['sanitation','2025-02',10,5],
 ]) D.saveUtilityReading(d,{kind:'monthly',utility,unit:'m3',periodStart:month+'-01',periodEnd:month+'-28',reading,billAmount});
 const {rows,average}=D.monthlyUtility(F.normalize(d),'water');
 assert.equal(average,9);
 assert.deepEqual(rows.map(r=>[r.utility,r.change]),[['water',2],['sanitation',null],['water',null]]);
 const [february]=D.utilityTotals(rows);
 assert.equal(february.cost,20);
 assert.equal(february.consumption,10);
});
