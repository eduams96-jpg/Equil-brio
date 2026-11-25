'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../finance.js'),R=require('../reports-model.js');
function seed(){const d=F.empty();d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:1000},{id:'b',name:'Cartão',type:'Banco',balance:50}];F.migrateLedgerCore(d);const add=(id,type,amount,date,account='Banco',extra={})=>F.add(d,{id,type,amount,date,account,description:id,category:'Casa',...extra});add('income','income',1000,'2026-01-01');add('old','expense',100,'2025-12-01','Banco',{splits:[{category:'Casa',amount:60,note:'A'},{category:'Comida',amount:40,note:'B'}]});add('refund','income',20,'2026-04-01','Cartão',{refundOf:'old'});add('expense','expense',80,'2026-02-01','Banco',{splits:[{category:'Casa',amount:30,note:'Nota'},{category:'Comida',amount:50}]});add('credit','expense',200,'2026-07-01','Banco',{principal:150});add('card','expense',12.34,'2026-08-01','Cartão');return d;}
test('relatório mantém os totais históricos e os dados intactos',()=>{const d=seed(),before=JSON.stringify(d),r=R.analyse(d,{year:'2026'}),f=F.totals(d,'2026');assert.equal(r.income,f.income);assert.equal(r.expense,f.expense);assert.equal(r.saving,F.money(f.income-f.expense));assert.equal(JSON.stringify(d),before);assert.equal(r.months.length,12);assert.equal(r.rate,r.saving/r.income*100);});
test('semestres e trimestres somam os meses do ledger',()=>{const d=seed();for(const period of Object.keys(R.ranges)){const r=R.analyse(d,{year:'2026',period}),rows=r.months.map(m=>F.totals(d,m.month));assert.equal(r.income,F.money(rows.reduce((n,m)=>n+m.income,0)));assert.equal(r.expense,F.money(rows.reduce((n,m)=>n+m.expense,0)));}});
test('reembolso mantém categorias da compra fora do período e noutra conta',()=>{const r=R.analyse(seed(),{year:'2026',period:'q2',account:'b'});assert.equal(r.income,0);assert.equal(r.expense,-20);assert.deepEqual(r.categories.map(c=>[c.name,c.amount]),[['Comida',-8],['Casa',-12]]);assert.equal(r.entries[0].refundOf,'old');assert.equal(r.rate,null);});
test('parcelas conservam notas e capital de crédito é excluído da despesa',()=>{const r=R.analyse(seed(),{year:'2026',account:'a'});assert.equal(r.expense,130);assert.equal(r.entries.find(t=>t.id==='expense'&&t.category==='Casa').splitNote,'Nota');assert.equal(r.entries.find(t=>t.id==='credit').amount,50);});
test('saldo usa openingBalance mais ledger na data e conta arquivada é consultável',()=>{const d=seed();d.accounts[1].archived=true;const r=R.analyse(d,{year:'2026',period:'q1',account:'b'});assert.equal(r.accounts[0].balance,F.balanceAt(d,d.accounts[1],r.asAt));assert.equal(r.income,0);assert.equal(r.rate,null);assert.equal(r.accounts.length,1);});
test('filtros inválidos falham e ano vazio fica consultável',()=>{const d=seed();assert.throws(()=>R.analyse(d,{account:'gone'}),/conta/);assert.throws(()=>R.analyse(d,{year:'bad'}),/inválido/);assert.throws(()=>R.analyse(d,{period:'bad'}),/inválido/);const r=R.analyse(d,{year:'2024'});assert.equal(r.income,0);assert.equal(r.expense,0);assert.equal(r.months.length,12);});

test('Saldos de Relatórios: cálculo linear equivale a balanceAt para muitas contas e datas',()=>{const d=F.empty();d.ledgerCoreVersion=1;d.accounts=Array.from({length:40},(_,i)=>({id:'a'+i,name:'Conta '+i,openingBalance:100,balance:100,type:'Banco'}));d.transactions=Array.from({length:2000},(_,i)=>({id:'t'+i,account:'Conta '+i%40,type:i%3?'expense':'transfer',targetAccount:i%3?undefined:'Conta '+(i+1)%40,transferStatus:i%3?undefined:'confirmed',date:'2026-03-31',targetDate:'2026-04-01',amount:(i%99+1)/100,description:'Teste',category:'Casa'}));F.refreshBalances(d);for(const period of ['q1','q2','year'])for(const r of R.analyse(d,{year:'2026',period}).accounts)assert.equal(r.balance,F.balanceAt(d,d.accounts.find(a=>a.id===r.id),R.analyse(d,{year:'2026',period}).asAt));});

test('períodos parciais comparam o mesmo dia e as médias usam apenas meses completos',()=>{
  const d=seed();
  F.add(d,{id:'prior-early',type:'income',amount:80,date:'2025-04-05',account:'Banco',description:'Abril anterior',category:'Salário'});
  F.add(d,{id:'prior-late',type:'income',amount:200,date:'2025-04-25',account:'Banco',description:'Fim de abril anterior',category:'Salário'});
  F.add(d,{id:'this-early',type:'income',amount:0.2,date:'2026-04-05',account:'Banco',description:'Abril atual',category:'Salário'});
  F.add(d,{id:'this-late',type:'income',amount:300,date:'2026-04-25',account:'Banco',description:'Fim de abril atual',category:'Salário'});

  const cut=R.analyse(d,{year:'2026',asOf:'2026-04-19'});
  const detail=R.detail(d,{year:'2026',result:cut});
  assert.equal(cut.income,1000.2);
  assert.equal(cut.months[3].status,'partial');
  assert.equal(cut.months[4].status,'future');
  assert.equal(detail.elapsed,3);
  assert.equal(detail.averageIncome,333.33);
  assert.equal(detail.averageExpense,26.67);
  assert.equal(detail.previous.asAt,'2025-04-19');
  assert.equal(detail.previous.income,80);
  assert.equal(detail.coverageComplete,false);
  assert.equal(R.detail(d,{year:'2026',period:'m04',asOf:'2026-04-19'}).averageIncome,null);
});

test('percentagens financeiras com bases residuais ou negativas ficam indisponíveis',()=>{
  const d=seed();
  F.add(d,{id:'residual',type:'income',amount:0.2,date:'2026-02-10',account:'Banco',description:'Receita residual',category:'Juros'});
  const result=R.analyse(d,{year:'2026',period:'m02',asOf:'2026-02-19'});
  assert.equal(result.saving,-79.8);
  assert.equal(result.rate,null);
  assert.equal(F.percentageChange(100,-50),null);
  assert.equal(F.percentageChange(80,0.2),null);
  assert.equal(F.percentageChange(80,40),100);
});

test('saldo por conta explica a ponte entre início e fim do período',()=>{
  const d=seed();
  F.add(d,{id:'transfer',type:'transfer',amount:50,date:'2026-02-11',account:'Banco',targetAccount:'Cartão',description:'Transferência'});
  const [bank,card]=R.analyse(d,{year:'2026',period:'m02',asOf:'2026-02-28'}).accounts;
  assert.equal(bank.startBalance,1900);
  assert.equal(bank.balanceChange,-130);
  assert.equal(bank.expense,80);
  assert.equal(bank.balance,1770);
  assert.equal(card.balanceChange,50);
  assert.equal(card.expense,0);
});
