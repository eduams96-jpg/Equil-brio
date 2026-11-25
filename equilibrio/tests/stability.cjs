'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const F = require('../finance.js');
const Life = require('../life-model.js');
const { createSqliteStorage } = require('../desktop/storage-sqlite.cjs');
function ledger(){const d=F.empty();d.accounts=[{id:'bank',name:'Banco',type:'Conta',balance:1000},{id:'cash',name:'Carteira',type:'Dinheiro',balance:100}];return d;}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-stability-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function expectedBalances(d){let bank=1000,cash=100;for(const t of d.transactions){const amount=+t.amount;if(t.type==='income'){if(t.account==='Banco')bank+=amount;else cash+=amount;}else if(t.type==='expense'){if(t.account==='Banco')bank-=amount;else cash-=amount;}else if(t.type==='transfer'){if(t.account==='Banco'){bank-=amount;cash+=amount;}else{cash-=amount;bank+=amount;}}}return{bank:F.money(bank),cash:F.money(cash)};}
test('v0.39.26: identidade de subscrição não aceita um pagamento com valor diferente',()=>{const d=ledger();d.subscriptions=[{id:'netflix',name:'Netflix',amount:7,frequency:'monthly',nextDate:'2026-09-21',renewalDay:21,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];F.add(d,{id:'wrong',date:'2026-09-10',type:'expense',amount:35,account:'Banco',description:'Pagamento Netflix',beneficiary:'NETFLÍX',category:'Lazer'});assert.equal(F.upcoming(d,'2026-09').filter(x=>x.subscriptionId==='netflix').length,1);F.add(d,{id:'right',date:'2026-09-12',type:'expense',amount:7,account:'Banco',description:'Pagamento Netflix',beneficiary:'Netflix',category:'Lazer'});assert.equal(F.upcoming(d,'2026-09').filter(x=>x.subscriptionId==='netflix').length,0);});
test('v0.39.26: avanço de subscrição antiga não fica preso ao limite de 120 renovações',()=>{const d=ledger();d.subscriptions=[{id:'old',name:'Serviço antigo',amount:5,frequency:'monthly',nextDate:'2014-01-31',renewalDay:31,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];Life.advanceSubscriptionPast(d,'old','2026-09-30');assert.equal(d.subscriptions[0].nextDate,'2026-10-31');assert.equal(d.subscriptions[0].renewalDay,31);});
test('v0.39.26: stress financeiro mantém saldos coerentes após milhares de mutações',()=>{const d=ledger();let seed=0x39262026;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};for(let i=0;i<1800;i++){const amount=F.money(0.5+rnd()*250);const r=rnd();const type=r<0.16?'transfer':r<0.44?'income':'expense';const account=rnd()<0.78?'Banco':'Carteira';const targetAccount=account==='Banco'?'Carteira':'Banco';F.add(d,{id:`stress-${i}`,date:`2026-${String(1+(i%12)).padStart(2,'0')}-${String(1+(i%27)).padStart(2,'0')}`,description:`Stress ${i}`,type,amount,account,...(type==='transfer'?{targetAccount}:{})});if(i%47===0&&d.transactions.length>25)F.remove(d,d.transactions[Math.floor(rnd()*Math.max(1,d.transactions.length-10))].id);if(i%200===0){const expected=expectedBalances(d);assert.equal(d.accounts.find(a=>a.name==='Banco').balance,expected.bank);assert.equal(d.accounts.find(a=>a.name==='Carteira').balance,expected.cash);assert.doesNotThrow(()=>F.normalize(d));}}const expected=expectedBalances(d);assert.equal(d.accounts.find(a=>a.name==='Banco').balance,expected.bank);assert.equal(d.accounts.find(a=>a.name==='Carteira').balance,expected.cash);});
test('v0.39.26: SQLite preserva 10000 movimentos e reabre sem perda',t=>{const d=ledger();d.transactions=Array.from({length:10000},(_,i)=>({id:`bulk-${i}`,date:`2026-${String(1+(i%12)).padStart(2,'0')}-${String(1+(i%27)).padStart(2,'0')}`,description:`Movimento ${i}`,type:i%5===0?'income':'expense',amount:F.money((i%997+1)/10),account:i%7===0?'Carteira':'Banco',category:'Stress / Persistência'}));const dir=temp(t);let db=createSqliteStorage(dir);db.writeSpace('equilibrioData',d);assert.equal(db.readSpace('main').data.transactions.length,10000);db.close();db=createSqliteStorage(dir);const restored=db.readSpace('main').data;assert.equal(restored.transactions.length,10000);assert.equal(restored.transactions[0].id,'bulk-0');assert.equal(restored.transactions.at(-1).id,'bulk-9999');assert.equal(db.info().lastIntegrityResult,'ok');db.close();});
test('v0.39.26: planeamento volumoso não cria ocorrências duplicadas',()=>{const d=ledger();d.recurring=Array.from({length:300},(_,i)=>({id:`r-${i}`,active:true,start:'2026-01-01',day:1+(i%28),amount:10+(i%20),type:'expense',account:'Banco',description:`Recorrente ${i}`,category:'Stress'}));d.subscriptions=Array.from({length:300},(_,i)=>({id:`s-${i}`,name:`Subscrição ${i}`,amount:5+(i%15),frequency:'monthly',nextDate:`2026-01-${String(1+(i%28)).padStart(2,'0')}`,renewalDay:1+(i%28),status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}));let count=0;for(let m=1;m<=12;m++){const month=`2026-${String(m).padStart(2,'0')}`;const rows=F.upcoming(d,month);const keys=rows.map(x=>`${x.subscriptionId?'s':'r'}:${x.subscriptionId||x.ruleId}:${x.originalDate||x.date}`);assert.equal(new Set(keys).size,keys.length);count+=rows.length;}assert.equal(count,7200);});
test('v0.39.26: intervalo personalizado não finge comparação mensal e a tabela contém o overflow',()=>{const root=path.join(__dirname,'..');const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');const css=fs.readFileSync(path.join(root,'ui.css'),'utf8');assert.match(workspace,/const customDates = Boolean\(advanced\.start \|\| advanced\.end\)/);assert.match(workspace,/previousTotals = trendText \? null : movementTotals/);assert.match(workspace,/Intervalo personalizado · sem comparação mensal/);assert.match(css,/\.movement-table-pane\{min-width:0;padding:10px 12px 12px;overflow-x:auto;\}/);});


test('v0.39.27: Agenda reconhece pagamento por categoria e valor quando o banco usa outra descrição',()=>{
 const d=ledger();
 d.subscriptions=[{id:'gym',name:'Ginásio',amount:60,frequency:'monthly',nextDate:'2026-09-01',renewalDay:1,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Lazer / Ginásio',prices:[]}];
 F.add(d,{id:'gym-paid',date:'2026-09-02',type:'expense',amount:60,account:'Banco',description:'FITNESS CLUB PORTO',beneficiary:'FITNESS CLUB',category:'Lazer / Ginásio'});
 assert.equal(F.upcoming(d,'2026-09').filter(x=>x.subscriptionId==='gym').length,0);
 const all=F.upcoming(d,'2026-09',{includeCompleted:true});
 const row=all.find(x=>x.subscriptionId==='gym');
 assert.ok(row);
 assert.equal(row.agendaCompleted,true);
 assert.equal(row.completedTransactionId,'gym-paid');
 assert.equal(row.actualDate,'2026-09-02');
});

test('v0.39.27: fallback por categoria não aceita um movimento demasiado afastado da data prevista',()=>{
 const d=ledger();
 d.subscriptions=[{id:'insurance',name:'Seguro Casa',amount:12.94,frequency:'monthly',nextDate:'2026-09-01',renewalDay:1,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Seguros / Casa',prices:[]}];
 F.add(d,{id:'other',date:'2026-09-25',type:'expense',amount:12.94,account:'Banco',description:'OUTRA COMPRA',category:'Seguros / Casa'});
 assert.equal(F.upcoming(d,'2026-09').filter(x=>x.subscriptionId==='insurance').length,1);
});

test('v0.39.27: Movimentos recupera saldo após movimento e compacta ações',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'ui.css'),'utf8');
 assert.match(workspace,/transactionBalanceAfterMap/);
 assert.match(workspace,/movement-balance-after/);
 assert.match(workspace,/movement-inline-actions/);
 assert.match(css,/\.movement-balance-after\{/);
 assert.match(css,/grid-template-columns:40px var\(--movement-grid-columns,104px/);
});

test('v0.39.27: Subscrições usa delegação estável nos botões de seleção histórica',()=>{
 const root=path.join(__dirname,'..');
 const life=fs.readFileSync(path.join(root,'life-ui.js'),'utf8');
 assert.match(life,/likelyButton\.onclick = selectLikely/);
 assert.match(life,/clearButton\.onclick = clearSelection/);
 assert.match(life,/bindPreviewControls\(\)/);
 assert.match(life,/data-subscription-history-likely/);
 assert.match(life,/data-subscription-history-clear/);
 assert.match(life,/currentRows/);
});

test('v0.39.27: Agenda mensal inclui ocorrências pagas e retira-as dos totais previstos',()=>{
 const root=path.join(__dirname,'..');
 const daily=fs.readFileSync(path.join(root,'daily-ui.js'),'utf8');
 assert.match(daily,/schedule\(\{ includeCompletedGenerated: true \}\)/);
 const E=require('../experience-model.js'),F=require('../finance.js');const r=E.agenda(F.empty(),[{id:'paid',date:'2026-09-01',source:'completed',type:'expense',amount:100},{id:'next',date:'2026-09-02',source:'pending',type:'expense',amount:25}],'2026-09');assert.equal(r.outgoing,25);assert.equal(r.registered,100);
 assert.match(daily,/ExperienceFinance\.agenda/);
});
