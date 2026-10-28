'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../finance.js'),D=require('../dossiers-model.js'),G=require('../gifts-model.js'),C=require('../casa-model.js');
function fixture(){const d=F.empty();d.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:1000}];F.migrateLedgerCore(d);return d;}
test('Avisos: pagamento ligado ao crédito elimina o atraso, sem confundir outro crédito ou mês',()=>{
 const d=fixture();d.debts=[{id:'loan',name:'Habitação',balance:1000,payment:100,interest:0,dueDay:25,startDate:'2026-01-01'},{id:'other',name:'Habitação',balance:1000,payment:100,interest:0,dueDay:25,startDate:'2026-01-01'}];
 F.add(d,{id:'paid',debtId:'loan',principal:100,interest:0,charges:0,amount:100,type:'expense',date:'2026-10-25',account:'Banco',category:'Juros e encargos',description:'Pagamento'});
 const before=JSON.stringify(d),r=D.notices(d,{today:'2026-10-27'});assert(!r.items.some(n=>n.id==='debt:loan:2026-10-25'));assert(r.items.some(n=>n.id==='debt:other:2026-10-25'));assert(r.items.some(n=>n.id==='debt:loan:2026-11-25'));assert.equal(JSON.stringify(d),before);
 const paid=D.notices(d,{today:'2026-10-27',status:'resolved'});assert(paid.items.some(n=>n.id==='debt:loan:2026-10-25'));
});
test('Avisos: planos a prestações usam pagamentos reais e o saldo por liquidar',()=>{
 const d=fixture();d.installmentPlans=[{id:'plan',name:'Computador',payments:[{id:'p1',due:'2026-10-25',amount:100,paid:100},{id:'p2',due:'2026-10-26',amount:100,paid:40}]}];
 const r=D.notices(d,{today:'2026-10-27'});assert(!r.items.some(n=>n.id==='installment:plan:p1'));assert.equal(r.items.find(n=>n.id==='installment:plan:p2').amount,60);
});
test('Avisos: configuração por espaço, prazos e desativação sem alterar movimentos',()=>{
 const d=fixture(),other=fixture(),p=D.noticePreferences(d);d.pendingPayments=[{id:'p',description:'Água',amount:20,type:'expense',date:'2027-01-10',account:'Banco'}];p.days.payments=90;D.saveNoticePreferences(d,p);
 assert(D.notices(d,{today:'2026-10-27'}).items.some(n=>n.originId==='p'));assert.equal(D.noticePreferences(other).days.payments,30);
 p.enabled.payments=false;D.saveNoticePreferences(d,p);assert(!D.notices(d,{today:'2026-10-27'}).items.some(n=>n.originId==='p'));assert.equal(d.pendingPayments.length,1);assert.equal(d.transactions.length,0);
 const before=JSON.stringify(d);p.days.payments=-1;assert.throws(()=>D.saveNoticePreferences(d,p));assert.equal(JSON.stringify(d),before);
});
test('Prendas: planeamento independente por ano, data e orçamento, preservando o histórico',()=>{
 const d=fixture();G.saveTarget(d,{person:'Ana',occasion:'Formatura',year:2027,date:'2027-07-01',budget:50});G.saveTarget(d,{person:'Ana',occasion:'Formatura',year:2028,budget:80});
 assert.equal(G.yearChecklist(d,2026).all.length,0);assert.equal(G.yearChecklist(d,2027).all[0].budget,50);assert.equal(G.yearChecklist(d,2028).all[0].budget,80);assert.deepEqual(G.people(d),['Ana']);
 const before=JSON.stringify(d);assert.throws(()=>G.saveTarget(d,{person:'Ana',occasion:'Natal',year:2027,date:'2028-12-25',budget:10}));assert.equal(JSON.stringify(d),before);
});
test('Prendas: guardar várias ocasiões é atómico quando uma linha é inválida',()=>{
 const d=fixture(),before=JSON.stringify(d);assert.throws(()=>G.savePersonOccasions(d,{person:'Ana',occasions:['Natal','a'.repeat(161)],budget:20,year:2027}));assert.equal(JSON.stringify(d),before);
});
test('Importador: embalagens compatíveis somam stock, links pertencem às ofertas e reimportar não duplica lotes',()=>{
 const d=fixture(),rows=[{name:'Vinagre',category:'Alimentação',unitQty:'750 ml',brand:'Marca A',storeName:'Loja A',price:'1,20',stock:1,url:'https://example.com/a'},{name:'Vinagre',unitQty:'1 L',brand:'Marca B',storeName:'Loja B',price:'',stock:1,url:'https://example.com/b'}];
 C.importCatalogTable(d,rows);const p=d.casa.catalog[0];assert.equal(p.unit,'ml');assert.equal(d.casa.stock[0].qty,1750);assert.equal(p.url,'');assert.equal(Object.values(p.offers).filter(o=>o.price===0).length,1);assert(Object.values(p.offers).some(o=>o.url==='https://example.com/b'));
 C.importCatalogTable(d,rows);assert.equal(d.casa.stock.length,1);assert.equal(d.casa.stock[0].qty,1750);assert.equal(d.casa.catalog.length,1);assert.equal(d.transactions.length,0);
});
for(const bad of [{unitQty:'1 kg'},{unitQty:'0 ml'},{unitQty:'2 desconhecida'},{stock:-1},{price:'inválido'},{url:'javascript:alert(1)'}])test('Importação inválida preserva todos os dados: '+JSON.stringify(bad),()=>{
 const d=fixture();C.importCatalogTable(d,[{name:'Leite',unitQty:'1 L',storeName:'Loja',price:1,stock:1}]);const before=JSON.stringify(d);assert.throws(()=>C.importCatalogTable(d,[{name:'Novo',unitQty:'1 un',storeName:'Outra',price:1},{name:'Leite',unitQty:'1 L',storeName:'Loja',price:1,stock:1,...bad}]));assert.equal(JSON.stringify(d),before);
});
