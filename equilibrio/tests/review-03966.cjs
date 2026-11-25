'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../finance.js');require('../features-model.js');const P=globalThis.FinancePlus,R=require('../reconciliation-model.js');
const ledger=()=>{const d=F.empty();d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:1000}];F.migrateLedgerCore(d);return d;};
const purchase=(d)=>F.add(d,{id:'buy',date:'2026-08-15',type:'expense',amount:100,account:'Banco',description:'Compra',category:'Casa',note:'Nota geral',splits:[{category:'Casa',amount:30,note:'Peças da máquina'},{category:'Alimentação',amount:70,note:'Jantar de família'}]});
test('Parcelas: notas sobrevivem à validação nativa, edição e serialização sem duplicar débito',()=>{const d=ledger();purchase(d);assert.equal(d.accounts[0].balance,900);const n=require('../desktop/ledger-validation.cjs').validateLedger(JSON.parse(JSON.stringify(d)));assert.deepEqual(n.transactions[0].splits,d.transactions[0].splits);F.update(n,'buy',{...n.transactions[0],note:'Outra nota geral'});assert.equal(n.accounts[0].balance,900);assert.equal(n.transactions[0].splits[1].note,'Jantar de família');});
test('Parcelas: análise e devolução preservam nota geral e nota própria sem repetir total',()=>{const d=ledger();purchase(d);F.add(d,{id:'refund',date:'2026-08-16',type:'income',amount:50,account:'Banco',description:'Devolução',category:'Casa',refundOf:'buy'});const rows=F.expenseEntries(d,'2026-08');assert.deepEqual(rows.map(r=>r.amount),[30,70,-15,-35]);assert.equal(rows[0].note,'Nota geral');assert.equal(rows[0].splitNote,'Peças da máquina');assert.equal(rows[3].splitNote,'Jantar de família');assert.equal(F.totals(d,'2026-08').expense,50);});
test('Parcelas: notas inválidas são recusadas antes de qualquer mutação',()=>{for(const note of [5,{},'x'.repeat(1001)]){const d=ledger(),before=JSON.stringify(d);assert.throws(()=>F.add(d,{id:'bad',date:'2026-08-01',type:'expense',account:'Banco',description:'Inválido',amount:2,category:'Casa',splits:[{category:'Casa',amount:1,note},{category:'Outros',amount:1}]}));assert.equal(JSON.stringify(d),before);}});
test('Revisão: saldo é reconstruído na data de fecho, não pelo saldo atual; leitura não altera dados',()=>{const d=ledger();purchase(d);F.add(d,{id:'later',date:'2026-09-05',type:'expense',amount:20,account:'Banco',description:'Outro',category:'Casa'});const before=JSON.stringify(d),r=R.monthReview(d,'2026-08');assert.equal(r.date,'2026-08-31');assert.equal(r.accounts[0].expected,900);assert.equal(d.accounts[0].balance,880);assert.equal(JSON.stringify(d),before);P.reconcile(d,'a','2026-08-15',900);assert.equal(R.monthReview(d,'2026-08').confirmed,0);P.reconcile(d,'a','2026-08-31',900);assert.equal(R.monthReview(d,'2026-08').ready,true);});
test('Revisão: diferença ou alterações posteriores invalidam conferência; não há ajustes automáticos',()=>{const d=ledger();purchase(d);P.reconcile(d,'a','2026-08-31',850);assert.equal(R.monthReview(d,'2026-08').accounts[0].difference,-50);assert.equal(d.transactions.length,1);P.reconcile(d,'a','2026-08-31',900);F.update(d,'buy',{...d.transactions[0],amount:120,splits:[{category:'Casa',amount:50},{category:'Alimentação',amount:70}]});const r=R.monthReview(d,'2026-08');assert.equal(r.confirmed,0);assert.equal(r.accounts[0].difference,20);assert.equal(d.transactions.length,1);});
test('Revisão: fecho é explícito, bloqueia CRUD e reabertura permite corrigir',()=>{const d=ledger();purchase(d);let before=JSON.stringify(d);assert.throws(()=>R.setMonthClosed(d,'2026-08',true,P),/Confere/);assert.equal(JSON.stringify(d),before);P.reconcile(d,'a','2026-08-31',900);R.setMonthClosed(d,'2026-08',true,P);assert.deepEqual(d.closedMonths,['2026-08']);assert.throws(()=>F.update(d,'buy',{...d.transactions[0],description:'Editado'}),/Reabre/);R.setMonthClosed(d,'2026-08',false,P);F.update(d,'buy',{...d.transactions[0],description:'Editado'});assert.equal(d.transactions[0].description,'Editado');});
test('Revisão: pendências anteriores bloqueiam fecho; posteriores pertencem a outro período',()=>{const d=ledger();P.reconcile(d,'a','2026-08-31',1000);d.pendingImports=[{date:'2026-09-01'}];assert.equal(R.monthReview(d,'2026-08').ready,true);d.pendingImports.push({date:'2026-07-01'});assert.equal(R.monthReview(d,'2026-08').ready,false);d.pendingImports=[];F.importTransaction(d,{id:'trf',date:'2026-08-02',type:'expense',account:'Banco',amount:10,description:'TRF',category:'Transferências'},{reconcile:false});assert.equal(R.monthReview(d,'2026-08').transfers.length,1);});
test('Revisão: não fecha meses futuros, sem contas ou com conta arquivada ainda relevante',()=>{const d=ledger();assert.equal(R.monthReview(d,'2099-01').ready,false);d.accounts[0].archived=true;assert.equal(R.monthReview(d,'2026-08').accounts.length,1);d.accounts=[];assert.equal(R.monthReview(d,'2026-08').ready,false);assert.throws(()=>R.monthReview(d,'2026-13'),/válido/);});

test('Revisão: o fecho recusa linhas de extrato pendentes no próprio mês', () => {
  const d = ledger();
  purchase(d);
  P.reconcile(d, 'a', '2026-08-31', 900);
  d.statements.push({rows:[{source:{date:'2026-08-10'},status:'pending'}]});
  assert.throws(() => R.setMonthClosed(d, '2026-08', true, P), /linha\(s\) de extrato por conferir/);
  assert.deepEqual(d.closedMonths, []);
  d.statements[0].rows[0].status = 'matched';
  R.setMonthClosed(d, '2026-08', true, P);
  assert.deepEqual(d.closedMonths, ['2026-08']);
});

test('A tratar distingue pedidos de fatura e os dois trabalhos de importação',()=>{
  const Q=require('../planning-model.js'),d=ledger();
  const row={date:'2026-08-10',account:'Banco',description:'Teste',category:'Casa',amount:10,receiptRequired:true};
  F.add(d,{...row,id:'expense',type:'expense'});
  F.add(d,{...row,id:'income',type:'income'});
  d.pendingImports=[{id:'csv',date:row.date,amount:2}];
  d.statements=[{id:'s',name:'Extrato',rows:[{id:'open',status:'pending'},{id:'done',status:'linked'}]}];
  const items=Q.reviewInbox(d,'2026-08','2026-08-19').active;
  assert.deepEqual(items.filter(item=>item.kind==='receipt').map(item=>item.id),['expense']);
  assert.deepEqual(Q.importWork(d),{prepared:1,statementLines:1});
  assert.equal(items.find(item=>item.kind==='statement').sourceName,'Extrato');
});

test('Uma nova conferência na mesma data resolve a diferença anterior',()=>{
  const Q=require('../planning-model.js'),d=ledger();
  P.reconcile(d,'a','2026-08-10',950,false);
  const mismatches=()=>Q.reviewInbox(d,'2026-08','2026-08-19').active.filter(item=>item.difference!==undefined);
  assert.equal(mismatches()[0].difference,-50);
  assert.equal(mismatches()[0].sourceName,'Banco');
  P.reconcile(d,'a','2026-08-10',1000,false);
  assert.deepEqual(mismatches(),[]);
});

test('Agenda separa previsão e histórico de subscrições sem duplicar pagamentos',()=>{
  const E=require('../experience-model.js'),d=ledger();
  const row={date:'2026-08-10',account:'Banco',type:'expense',amount:10,category:'Lazer / Subscrições'};
  F.add(d,{...row,id:'a',description:'Associada no calendário'});
  F.add(d,{...row,id:'b',description:'Histórico',splits:[{category:'Lazer / Subscrições',amount:7},{category:'Casa',amount:3}]});
  const rows=E.agendaSubscriptions(d,[
    {id:'a',date:row.date,amount:10,source:'completed',subscriptionId:'service'},
    {id:'future',date:'2026-08-27',amount:10,source:'subscription',subscriptionId:'service'}
  ],'2026-08');
  assert.deepEqual(rows.map(r=>[r.id,r.amount,Boolean(r.historyOnly)]),[['a',10,false],['b',7,true],['future',10,false]]);

  d.subscriptions=[{id:'sub1',name:'Ginásio',amount:35,frequency:'monthly',nextDate:'2026-09-05',account:'Banco',category:'Saúde'}];
  F.add(d,{id:'subpay1',date:'2026-08-05',account:'Banco',type:'expense',amount:35,category:'Saúde',description:'Ginásio',subscriptionId:'sub1'});
  const paidSameMonth=E.agendaSubscriptions(d,[],'2026-08');
  assert.ok(paidSameMonth.some(r=>r.id==='subpay1'&&r.subscriptionId==='sub1'&&r.source==='completed'&&r.agendaCompleted));
});

test('Idade das cópias usa a data mais recente e ignora datas inválidas',()=>{
  require('../backup-info.js');
  const now=Date.now(),automatic=new Date(now-60_000),manual=new Date(now-8*86_400_000);
  assert.equal(globalThis.BackupInfo.latestTimestamp(manual.toISOString(),automatic.toISOString(),'inválida',new Date(now+600_000).toISOString()),automatic.getTime());
  assert.equal(globalThis.BackupInfo.latestTimestamp('',undefined),null);
});

test('Planos: seguro anual, objetivo e orçamento contam o mesmo valor uma única vez',()=>{
  const Q=require('../planning-model.js'),d=ledger();
  d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:2000}];
  F.migrateLedgerCore(d);
  d.safetyMargin=100;
  d.goals=[{id:'g',name:'Reserva Seguro',target:1000,current:400,planMonths:12,accountId:'a'}];
  d.reserves=[{id:'r',name:'Seguro anual',target:600,saved:600,months:12}];
  d.budgets=[{id:'b',category:'Seguros',limit:150}];
  // Planos distintos sem partilha: reserva + objetivo = 1000; orçamento é limite de despesa (não reserva).
  assert.equal(P.reserves(d).assigned,1000);
  assert.equal(P.spendingRoom(d,100,30,'2026-08-19').available,900);
  assert.equal(Q.decisionImpact(d,{oneOff:-200},'2026-08-19').availableAfter,700);
  assert.equal(Q.protectionOverview(d,'2026-08-19').accounts[0].protectedAmount,400);

  // Quando objetivo e reserva protegem a mesma despesa na mesma conta, conta apenas o maior valor em todas as vistas.
  Q.saveProtection(d,'goal','g','a','Seguro');
  Q.saveProtection(d,'reserve','r','a','seguro');
  assert.equal(P.reserves(d).assigned,600);
  assert.equal(P.spendingRoom(d,100,30,'2026-08-19').available,1300);
  assert.equal(Q.decisionImpact(d,{oneOff:-200},'2026-08-19').availableAfter,1100);
  assert.equal(Q.protectionOverview(d,'2026-08-19').accounts[0].protectedAmount,600);
});

test('Planos: mapeamento e consolidação de envelopes, planos anuais e sazonais sem duplicar poupança',()=>{
  const Q=require('../planning-model.js'),d=ledger();
  d.budgets=[{id:'b',category:'Alimentação',limit:300}];
  d.reserves=[{id:'r',name:'Seguro automóvel',target:350,saved:150,months:6}];
  d.envelopes=[
    {id:'e1',category:'Alimentação',allocated:400},
    {id:'e2',category:'Lazer',allocated:120},
  ];
  d.annualPlans=[
    {id:'ap1',name:'Seguro automóvel',amount:420,month:12,category:'Seguros'},
    {id:'ap2',name:'IMI',amount:280,month:5,category:'Habitação'},
  ];
  d.seasonalCosts=[
    {id:'sc1',name:'Seguro automóvel',date:'2026-12-01',amount:450,saved:180},
    {id:'sc2',name:'Férias',date:'2027-02-01',amount:900,saved:300},
  ];
  const mapped=Q.legacyPlanSummary(d,'2026-11');
  assert.equal(mapped.total,6);
  assert.equal(mapped.envelopes[0].existingBudgetId,'b');
  assert.equal(mapped.envelopes[1].existingBudgetId,null);
  assert.equal(mapped.annualPlans[0].existingReserveId,'r');
  assert.equal(mapped.annualPlans[1].months,7);
  assert.equal(mapped.seasonalCosts[0].existingReserveId,'r');
  assert.equal(mapped.seasonalCosts[1].months,4);

  assert.equal(Q.consolidateAllLegacyPlans(d,'2026-11'),6);
  assert.equal(d.envelopes.length,0);
  assert.equal(d.annualPlans.length,0);
  assert.equal(d.seasonalCosts.length,0);
  assert.equal(P.budgetAt(d,d.budgets.find(x=>x.category==='Alimentação'),'2026-11').limit,400);
  assert.equal(P.budgetAt(d,d.budgets.find(x=>x.category==='Lazer'),'2026-11').limit,120);
  const auto=d.reserves.find(x=>x.name==='Seguro automóvel');
  assert.equal(auto.target,450);
  assert.equal(auto.saved,180);
  assert.equal(d.reserves.find(x=>x.name==='IMI').months,7);
  assert.equal(d.reserves.find(x=>x.name==='Férias').saved,300);
});

test('Casa: lojas combinadas revêem-se com pré-visualização sem atribuir preços ignorados',()=>{
  const Casa=require('../casa-model.js'),CD=require('../casa-daily-model.js'),d=ledger();
  const comb=Casa.saveStore(d,{name:'Continente // LIDL'});
  const pingo=Casa.saveStore(d,{name:'Pingo Doce'});
  const arroz=Casa.saveProduct(d,{name:'Arroz',unit:'kg'});
  const spray=Casa.saveProduct(d,{name:'Spray',unit:'ml'});
  Casa.setOffer(d,arroz,comb,{packageQty:1,price:1.29});
  Casa.setOffer(d,spray,comb,{packageQty:750,price:1.75});
  Casa.setOffer(d,spray,pingo,{packageQty:750,price:1.50});
  Casa.queueProduct(d,{catalogId:arroz,storeId:comb,requestedQty:1});
  const snap=JSON.stringify(d);
  const preview=CD.previewSplitStore(d,comb,{offers:{[arroz]:'Continente',[spray]:'skip'},defaultPart:'LIDL'});
  assert.equal(JSON.stringify(d),snap);
  assert.deepEqual(preview.createdStores,['Continente']);
  assert.equal(preview.assignedOffers.length,1);
  assert.equal(preview.skippedOffers.length,1);
  assert.equal(preview.shoppingMoved.length,1);
  assert.equal(preview.willDelete,true);
  assert.throws(()=>CD.applySplitStore(d,comb,{offers:{[arroz]:'Continente',[spray]:'skip'},defaultPart:'LIDL'},'wrong-token'),/mudaram/);
  assert.equal(JSON.stringify(d),snap);
  CD.applySplitStore(d,comb,{offers:{[arroz]:'Continente',[spray]:'skip'},defaultPart:'LIDL'},preview.token);
  assert.equal(d.casa.stores.some(s=>s.id===comb),false);
  const cont=d.casa.stores.find(s=>s.name==='Continente');
  assert.equal(d.casa.stores.some(s=>s.name==='LIDL'),false);
  assert.equal(d.casa.catalog.find(p=>p.id===arroz).offers[cont.id].price,1.29);
  assert.equal(d.casa.catalog.find(p=>p.id===spray).offers[cont.id],undefined);
  assert.equal(d.casa.shopping[0].storeId,cont.id);

  // Quando há artigo pendente cujo preço foi ignorado, cria/usa defaultPart para esse artigo.
  const combLidl=Casa.saveStore(d,{name:'Pingo Doce // LIDL'});
  Casa.setOffer(d,arroz,combLidl,{packageQty:1,price:1.39});
  Casa.queueProduct(d,{catalogId:arroz,storeId:combLidl,requestedQty:1});
  const prevLidl=CD.previewSplitStore(d,combLidl,{offers:{[arroz]:'skip'},defaultPart:'LIDL'});
  assert.deepEqual(prevLidl.createdStores,['LIDL']);
  CD.applySplitStore(d,combLidl,{offers:{[arroz]:'skip'},defaultPart:'LIDL'},prevLidl.token);
  const lidl=d.casa.stores.find(s=>s.name==='LIDL');
  assert.ok(lidl);
  assert.equal(d.casa.catalog.find(p=>p.id===arroz).offers[lidl.id],undefined);

  // Quando há compras históricas na loja combinada, ela é arquivada para preservar o histórico.
  const comb2=Casa.saveStore(d,{name:'Aldi // Mercadona'});
  Casa.setOffer(d,arroz,comb2,{packageQty:1,price:1.19});
  const q=Casa.queueProduct(d,{catalogId:arroz,storeId:comb2,requestedQty:1});
  Casa.shopping(d,'toggle',{id:q});
  Casa.checkout(d,{ids:[q],expected:JSON.stringify(Casa.quote(d,[q])),date:F.today(),account:'Banco',category:'Alimentação',batchId:'b-comb'});
  const prev2=CD.previewSplitStore(d,comb2,{offers:{[arroz]:'Aldi'}});
  assert.equal(prev2.willDelete,false);
  CD.applySplitStore(d,comb2,{offers:{[arroz]:'Aldi'}},prev2.token);
  assert.equal(d.casa.stores.find(s=>s.id===comb2).archived,true);
  F.normalize(d);
});

test('Casa: comparador separa lojas sem artigos e evolução escala ml/g para L/kg',()=>{
  const Casa=require('../casa-model.js'),CD=require('../casa-daily-model.js'),d=ledger();
  const s1=Casa.saveStore(d,{name:'Loja A'}),s2=Casa.saveStore(d,{name:'Loja B'}),empty=Casa.saveStore(d,{name:'Vazia'});
  const spray=Casa.saveProduct(d,{name:'Spray',unit:'ml'});
  Casa.setOffer(d,spray,s2,{packageQty:750,price:1.80});
  Casa.setOffer(d,spray,s1,{packageQty:750,price:1.89});
  Casa.setOffer(d,spray,s1,{packageQty:750,price:1.50});
  d.casa.priceHistory[0].date='2026-08-15';
  d.casa.priceHistory[1].date='2026-09-01';
  Casa.queueProduct(d,{catalogId:spray,storeId:s2,requestedQty:750});
  const cmp=CD.compare(d,2);
  assert.deepEqual(cmp.uncoveredStores,['Vazia']);
  assert.equal(cmp.candidates.length,2);
  assert.equal(cmp.best.products,1.50);
  assert.equal(cmp.current.products,1.80);
  const ch=CD.insights(d,F.today().slice(0,7)).priceChanges.find(x=>x.id===spray);
  assert.equal(ch.unit,'L');
  assert.equal(Math.round(ch.from*100)/100,2.4);
  assert.equal(Math.round(ch.to*100)/100,2);
});

test('Casa: consumos recusam períodos futuros ou superiores a um ano e rotina quinzenal recalcula pela última execução',()=>{
  const Casa=require('../casa-model.js'),D=require('../dossiers-model.js'),d=ledger();
  d.casa=Casa.state(d);
  assert.throws(()=>D.saveUtilityReading(d,{utility:'electricity',kind:'monthly',periodStart:'2099-01-01',periodEnd:'2099-02-01',reading:50}),/futura/);
  assert.throws(()=>D.saveUtilityReading(d,{utility:'electricity',kind:'monthly',periodStart:'2024-01-01',periodEnd:'2026-01-01',reading:500}),/exceder um ano/);
  d.casa.utilityPeriods=[{id:'old_bad',utility:'electricity',meter:'Contador principal',unit:'kWh',date:'2028-04-30',reading:316,kind:'monthly',unitPrice:null,periodStart:'2026-04-01',periodEnd:'2028-04-30',supplier:'EDP',note:''}];
  const listed=D.monthlyUtility(d,'electricity').rows;
  assert.ok(listed[0].future);
  assert.ok(listed[0].anomaly);
  D.saveUtilityReading(d,{id:'old_bad',utility:'electricity',kind:'monthly',periodStart:'2026-04-01',periodEnd:'2026-04-30',reading:316,supplier:'EDP'});
  assert.equal(D.monthlyUtility(d,'electricity').rows[0].anomaly,'');

  const r=D.saveRoutine(d,{title:'Limpar filtro',frequency:'fortnightly',nextDate:'2026-11-08'});
  d.practical.routines[0].history.push({id:'run1',date:'2026-11-01',nextDate:'2026-11-08',completedItems:0,totalItems:0,checkedLabels:[],note:''});
  d.practical.routines[0].nextDate='2026-11-08';
  const recalc=D.saveRoutine(d,{id:r.id,title:'Limpar filtro',frequency:'fortnightly',nextDate:'2026-11-08',recalculateFromLast:true});
  assert.equal(recalc.nextDate,'2026-11-15');
  d.practical.routines[0].nextDate='2026-11-09';
  assert.equal(D.recalculateRoutine(d,r.id).nextDate,'2026-11-15');
});

test('Apresentação e navegação: padrões de modais, barra superior, atalhos e ajuda alinhada',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const read=(f)=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
  const workspace=read('workspace.js');
  assert.match(workspace,/modal-form-footer/);
  assert.match(workspace,/data-modal-cancel/);
  assert.match(workspace,/isDestructive/);
  assert.doesNotMatch(read('practical-ui.js'),/quick\.querySelector\("div"\)\.append\(undo\)/);
  assert.match(read('life-ui.js'),/>Espaço: '/);
  assert.doesNotMatch(read('casa-home-ui.js'),/class="ch-shortcuts"/);
  assert.match(read('space-transfer-ui.js'),/function formatCopyOption/);
  const help=read('interface-ui.js');
  assert.doesNotMatch(help,/Ajuda e recuperação/);
  assert.doesNotMatch(help,/no lista de adiados/);
  assert.match(help,/na lista de adiados/);
  assert.match(help,/faq-topic-count/);
});

