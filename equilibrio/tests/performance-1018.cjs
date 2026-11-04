'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../finance.js');
globalThis.Finance=F;
const C=require('../complete-model.js'),{seed}=require('./fixtures/cor-007.cjs');

function ledger(){const d=seed();
 d.recurring=[{id:'r1',active:true,start:'2026-01-05',day:5,frequency:'monthly',type:'expense',account:'Banco',amount:30,description:'Ginásio',category:'Lazer'},{id:'r2',active:true,start:'2026-01-25',day:25,frequency:'monthly',type:'income',account:'Banco',amount:1500,description:'Ordenado',category:'Receita / Vencimento',incomeKind:'salary'}];
 F.add(d,{id:'g1',date:'2026-02-05',type:'expense',amount:30,account:'Banco',description:'Ginásio',category:'Lazer',recurringRuleId:'r1',recurringDate:'2026-02-05'});
 F.add(d,{id:'g2',date:'2026-03-06',type:'expense',amount:30,account:'Banco',description:'Ginásio',category:'Lazer'});
 F.add(d,{id:'s1',date:'2026-02-25',type:'income',amount:1500,account:'Banco',description:'Ordenado',category:'Receita / Vencimento'});
 for(let i=0;i<40;i++)F.add(d,{id:'x'+i,date:'2026-0'+(1+i%6)+'-1'+(i%9),type:'expense',amount:5+i,account:i%2?'Banco':'Outra',description:'Compra '+i,category:'Casa'});
 return d;}

test('Compromissos: a memória do desenho devolve o mesmo resultado e cópias independentes',()=>{const d=ledger(),plain=['2026-02','2026-03','2026-07'].map(m=>F.upcoming(d,m));
 F.renderCache.begin();try{const first=F.upcoming(d,'2026-03'),second=F.upcoming(d,'2026-03');assert.deepEqual(first,plain[1]);assert.deepEqual(second,plain[1]);first[0].amount=999;assert.notEqual(F.upcoming(d,'2026-03')[0].amount,999,'alterar uma cópia não estraga a memória');assert.deepEqual(F.upcoming(d,'2026-07'),plain[2]);
  const before=F.expenseEntries(d,'2026-02');F.add(d,{id:'novo',date:'2026-02-09',type:'expense',amount:1,account:'Banco',description:'Novo',category:'Casa'});F.renderCache.clear();assert.equal(F.expenseEntries(d,'2026-02').length,before.length+1,'gravar limpa a memória');}
 finally{F.renderCache.end();}
 assert.equal(F.renderCache.active(),false);});

test('Compromissos: memória aninhada só termina no último fim',()=>{F.renderCache.begin();F.renderCache.begin();F.renderCache.end();assert.equal(F.renderCache.active(),true);F.renderCache.end();assert.equal(F.renderCache.active(),false);F.renderCache.end();assert.equal(F.renderCache.active(),false);});

test('Extrato: correspondências com índice são iguais às calculadas linha a linha',()=>{const d=ledger(),rows=d.transactions.slice(0,25).map((t,i)=>({account:t.account,type:t.type,amount:t.amount,date:i%3?t.date:'2026-0'+(1+i%6)+'-20',description:t.description}));rows.push({account:'Banco',type:'expense',amount:NaN,date:'2026-01-01',description:'x'});
 const index=C.matchIndex(d);for(const row of rows){const a=C.candidateMatches(d,row),b=C.candidateMatches(d,row,index);assert.deepEqual(b.map(m=>[m.transaction.id,m.score]),a.map(m=>[m.transaction.id,m.score]));assert.equal(C.safeCandidate(d,row,index)?.transaction.id,C.safeCandidate(d,row)?.transaction.id);}
 assert.deepEqual(C.candidateMatches(d,rows.at(-1)),[]);});
