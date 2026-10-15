'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../finance.js'),P=require('../features-model.js'),C=require('../complete-model.js'),Casa=require('../casa-model.js'),Daily=require('../casa-daily-model.js'),R=require('../reconciliation-model.js'),Pr=require('../practical-model.js');
function ledger(){const d=F.empty();d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:1000},{id:'b',name:'Carteira',type:'Dinheiro',balance:0}];return F.migrateLedgerCore(d);}
const expense=(d,id='t',amount=30)=>F.add(d,{id,type:'expense',account:'Banco',date:'2026-08-01',description:'Compra',category:'Casa',amount});
test('Editar pagamento parcial conserva liquidação e aplica apenas a diferença à pendência',()=>{
 const d=ledger();d.pendingPayments=[{id:'p',description:'Manutenção',amount:100,date:'2026-08-01',type:'expense',account:'Banco',category:'Casa',equipmentId:'machine'}];
 const t=C.partial(d,'p',40,'2026-08-01');F.update(d,t.id,{...t,note:'Nota revista'});assert.equal(d.pendingPayments[0].amount,60);assert.equal(d.accounts[0].balance,960);
 F.update(d,t.id,{...d.transactions[0],amount:50});assert.equal(d.pendingPayments[0].amount,50);assert.equal(d.accounts[0].balance,950);
 const before=JSON.stringify(d);assert.throws(()=>F.update(d,t.id,{...d.transactions[0],amount:101}),/liquidar|compromisso/);assert.equal(JSON.stringify(d),before);
 F.update(d,t.id,{...d.transactions[0],amount:100});assert.equal(d.pendingPayments.length,0);F.remove(d,t.id);assert.equal(d.pendingPayments[0].equipmentId,'machine');assert.equal(d.pendingPayments[0].amount,100);
});
test('Editar nota conserva associação ao extrato; corrigir valor volta a pedir conferência',()=>{
 const d=ledger(),t=expense(d);d.statements=[{id:'s',name:'Extrato',fingerprint:'f',rows:[{id:'r',status:'linked',transactionId:t.id,source:{...t}}]}];
 F.update(d,t.id,{...t,note:'Revisto'});assert.equal(d.statements[0].rows[0].transactionId,t.id);assert.equal(d.statements[0].rows[0].status,'linked');
 F.update(d,t.id,{...d.transactions[0],amount:40});assert.equal(d.statements[0].rows[0].status,'pending');assert.equal(d.statements[0].rows[0].transactionId,null);
});
test('Transferência com datas diferentes respeita o mês fechado no destino',()=>{
 const d=ledger();d.closedMonths=['2026-09'];const t={id:'transfer',type:'transfer',account:'Banco',targetAccount:'Carteira',date:'2026-08-31',targetDate:'2026-09-01',amount:20,description:'Transferência',category:'Transferências'};const before=JSON.stringify(d);
 assert.throws(()=>F.add(d,t),/Reabre/);assert.equal(JSON.stringify(d),before);d.closedMonths=[];F.add(d,t);d.closedMonths=['2026-09'];const posted=JSON.stringify(d);assert.throws(()=>F.remove(d,t.id),/Reabre/);assert.equal(JSON.stringify(d),posted);
});
test('Renomear conta acompanha evidência e destino sugerido das transferências',()=>{
 const d=ledger();d.transactions=[{id:'x',account:'Banco',targetAccount:'Carteira',suggestedTargetAccount:'Banco',transferEvidence:[{id:'e',account:'Banco',targetAccount:'Carteira'}]}];
 F.renameAccountReferences(d,'Banco','Banco novo');assert.equal(d.transactions[0].transferEvidence[0].account,'Banco novo');assert.equal(d.transactions[0].suggestedTargetAccount,'Banco novo');assert.ok(F.accountNameReferences(d,'Banco novo').some(r=>r.list==='transferEvidence'));
});
test('Categorias em subscrições, Casa, faturas, regras e autonomia participam na reorganização',()=>{
 const d=ledger();d.subscriptions=[{id:'s',name:'Serviço',category:'Higiene / Sabão',amount:3,frequency:'monthly',status:'active',nextDate:F.today(),reminderDays:7,prices:[]}];
 const product=Casa.saveProduct(d,{name:'Sabão',unit:'un',category:'Higiene / Sabão'});Casa.addPurchase(d,{store:'Loja',date:'2026-08-01',items:[{name:'Sabão',total:3,category:'Higiene / Sabão'}]});
 d.receiptRules=[{id:'rr',kind:'category',name:'sab',merchant:'Loja',category:'Higiene / Sabão',enabled:true,excludedMerchants:[]}];d.practical=Pr.empty();d.practical.rules=[{id:'rule',match:'loja',category:'Higiene / Sabão',exceptions:[],active:true}];d.practical.autonomy={accountIds:['a'],retainedIncome:0,protectedFunds:0,extraordinary:0,extraordinaryMonth:1,essentials:[{category:'Higiene / Sabão',monthly:10,reduction:0}]};
 assert.ok(C.categoryList(d).some(c=>c.name==='Higiene / Sabão'));C.saveCategory(d,'Higiene','Cuidados');
 assert.equal(d.subscriptions[0].category,'Cuidados / Sabão');assert.equal(d.casa.catalog.find(p=>p.id===product).category,'Cuidados / Sabão');assert.equal(d.casa.purchases[0].items[0].category,'Cuidados / Sabão');assert.equal(d.receiptRules[0].category,'Cuidados / Sabão');assert.equal(d.practical.rules[0].category,'Cuidados / Sabão');assert.equal(d.practical.autonomy.essentials[0].category,'Cuidados / Sabão');assert.equal(d.accounts[0].balance,1000);
 const before=JSON.stringify(d);assert.throws(()=>C.deleteCategory(d,'Cuidados / Sabão'),/em uso/);assert.equal(JSON.stringify(d),before);
});
test('Casa analisa a categoria confirmada no artigo, sem depender de um produto de catálogo',()=>{
 const d=ledger();Casa.addPurchase(d,{store:'Loja',date:'2026-08-01',items:[{name:'Sabão',total:10,category:'Higiene'},{name:'Arroz',total:5,category:'Alimentação'}]});const r=Daily.insights(d,'2026-08');assert.equal(r.categories.find(c=>c.name==='Higiene').total,10);assert.equal(r.categories.reduce((n,c)=>n+c.total,0),r.total);
});
test('Estado da conferência reage a correções anteriores e às datas do destino',()=>{
 const d=ledger(),t=expense(d);P.reconcile(d,'a','2026-08-31',970);assert.equal(R.accountState(d,d.accounts[0]).confirmed,true);F.update(d,t.id,{...t,amount:40});assert.equal(R.accountState(d,d.accounts[0]).confirmed,false);
 const t2={id:'transfer',type:'transfer',account:'Banco',targetAccount:'Carteira',date:'2026-08-31',targetDate:'2026-09-02',amount:20,description:'Transferência',category:'Transferências'};F.add(d,t2);P.reconcile(d,'b','2026-09-01',0);assert.equal(R.accountState(d,d.accounts[1]).confirmed,false);
});
test('Arquivar preserva histórico e bloqueia dependências ativas sem mutação parcial',()=>{
 const d=ledger();expense(d);F.setAccountArchived(d,'a',true);assert.equal(d.accounts[0].archived,true);assert.equal(d.transactions.length,1);assert.equal(d.accounts[0].balance,970);F.setAccountArchived(d,'a',false);
 d.pendingImports=[{id:'i',account:'Banco'}];const before=JSON.stringify(d);assert.throws(()=>F.setAccountArchived(d,'a',true),/importa/);assert.equal(JSON.stringify(d),before);
});
test('Uma transferência com comissão inválida e um pagamento de cartão excessivo não deixam débitos parciais',()=>{
 const d=ledger();let before=JSON.stringify(d);assert.throws(()=>C.transfer(d,'a','b',10,.001,'2026-08-01'),/Comissão/);assert.equal(JSON.stringify(d),before);
 const card=C.card(d,{name:'Cartão',balance:100,closingDay:20,dueDay:5});F.migrateLedgerCore(d);before=JSON.stringify(d);assert.throws(()=>C.payCard(d,card.id,'a',200,'2026-08-01',5),/excede/);assert.equal(JSON.stringify(d),before);
});
test('Editar prestação de cartão mantém a amortização registada e pode reduzir o pagamento',()=>{
 const d=ledger(),card=C.card(d,{name:'Cartão',balance:0,closingDay:20,dueDay:5});F.migrateLedgerCore(d);
 const plan=C.purchase(d,{cardId:card.id,amount:100,count:2,date:'2026-08-01',firstDue:'2026-08-10',description:'Equipamento',category:'Casa'});
 const t=C.payCard(d,card.id,'a',40,'2026-08-10',0,plan.id,plan.payments[0].id);F.update(d,t.id,{...t,note:'Confirmado'});assert.equal(d.installmentPlans[0].payments[0].paid,40);
 F.update(d,t.id,{...d.transactions.find(x=>x.id===t.id),amount:30});assert.equal(d.installmentPlans[0].payments[0].paid,30);const before=JSON.stringify(d);assert.throws(()=>F.update(d,t.id,{...d.transactions.find(x=>x.id===t.id),amount:60}),/prestação/);assert.equal(JSON.stringify(d),before);
});
test('Edição em lote com hierarquia inválida não altera as descrições ou contas parcialmente',()=>{
 const d=ledger();expense(d);const before=JSON.stringify(d);assert.throws(()=>P.bulk(d,['t'],{description:'Novo nome',categorySubdetail:'Nível sem pai'}),/nível/);assert.equal(JSON.stringify(d),before);
});
test('Edição em lote limpa descendentes quando muda a categoria pai',()=>{const d=ledger();expense(d);d.transactions[0].category='Casa / Equipamentos / Eletrónica';P.bulk(d,['t'],{category:'Higiene'});assert.equal(d.transactions[0].category,'Higiene');});
test('Cancelar plano de equipamento retira ligações em conjunto; pagamentos registados bloqueiam cancelamento',()=>{
 const d=ledger(),e=Pr.saveEquipment(d,{name:'Máquina',date:'2099-01-01',cost:100,kind:'maintenance',notes:''});Pr.scheduleEquipment(d,e.id,'Banco');d.reserves[0].saved=20;Pr.cancelEquipment(d,e.id);assert.equal(d.pendingPayments.length,0);assert.equal(d.reserves.length,0);assert.equal(d.accounts[0].balance,1000);assert.equal(d.practical.equipment.length,1);
 Pr.scheduleEquipment(d,e.id,'Banco');C.partial(d,d.pendingPayments[0].id,30,F.today());const before=JSON.stringify(d);assert.throws(()=>Pr.cancelEquipment(d,e.id),/pagamentos/);assert.equal(JSON.stringify(d),before);
});
test('Intervenção preserva o pagamento associado; editar notas mantém a ligação e eliminar fica protegido',()=>{
 const d=ledger(),t=expense(d),e=Pr.saveEquipment(d,{name:'Máquina',date:F.today(),cost:30,kind:'maintenance',notes:''});Pr.addIntervention(d,{equipmentId:e.id,date:F.today(),cost:30,description:'Manutenção',transactionId:t.id});F.update(d,t.id,{...t,note:'Nota revista'});assert.equal(d.practical.interventions[0].transactionId,t.id);const before=JSON.stringify(d);assert.throws(()=>F.remove(d,t.id),/intervenção/);assert.equal(JSON.stringify(d),before);assert.throws(()=>F.update(d,t.id,{...d.transactions[0],amount:40}),/intervenção/);assert.equal(JSON.stringify(d),before);
});
test('Apagar movimento associado devolve a captura à caixa de entrada; editar não a reabre',()=>{
 const d=ledger();Pr.importCaptures(d,{format:'equilibrio-captures',version:1,captures:[{id:'capture',date:'2026-08-01',description:'Compra',amount:30}]});const t=Pr.confirmCapture(d,'capture',{type:'expense',date:'2026-08-01',description:'Compra',amount:30,account:'Banco',category:'Casa'});F.update(d,t.id,{...t,note:'Revisto'});assert.equal(d.practical.captures[0].status,'linked');F.remove(d,t.id);assert.equal(d.practical.captures[0].status,'pending');assert.equal(d.practical.captures[0].transactionId,undefined);assert.equal(d.accounts[0].balance,1000);
});
test('Restaurar pagamento eliminado volta a liquidar a pendência exatamente uma vez',()=>{
 const d=ledger();d.pendingPayments=[{id:'p',description:'Conta',amount:100,date:'2026-08-01',type:'expense',account:'Banco',category:'Casa'}];const t=C.partial(d,'p',40,'2026-08-01');const record=structuredClone(t);F.remove(d,t.id);d.trash=[{id:'trash',list:'transactions',record,deletedAt:new Date().toISOString()}];P.restoreDeleted(d,'trash');assert.equal(d.pendingPayments[0].amount,60);assert.equal(d.accounts[0].balance,960);assert.equal(d.trash.length,0);
});
test('Restaurar movimento criado a partir de captura restabelece a associação explícita',()=>{
 const d=ledger();Pr.importCaptures(d,{format:'equilibrio-captures',version:1,captures:[{id:'capture',date:'2026-08-01',description:'Compra',amount:30}]});const t=Pr.confirmCapture(d,'capture',{type:'expense',date:'2026-08-01',description:'Compra',amount:30,account:'Banco',category:'Casa'}),record=structuredClone(t);F.remove(d,t.id);d.trash=[{id:'trash',list:'transactions',record,deletedAt:new Date().toISOString()}];P.restoreDeleted(d,'trash');assert.equal(d.practical.captures[0].status,'linked');assert.equal(d.practical.captures[0].transactionId,t.id);
});
test('Desfazer lote é atómico se um dos movimentos estiver ligado à Casa',()=>{
 const d=ledger();d.imports=[{id:'batch',name:'CSV'}];expense(d,'first',10).importBatchId='batch';const purchase=Casa.addPurchase(d,{store:'Loja',date:'2026-08-01',account:'Banco',category:'Casa',items:[{name:'Artigo',total:20}]});d.transactions.find(t=>t.sourceId===purchase).importBatchId='batch';const before=JSON.stringify(d);assert.throws(()=>P.undoImport(d,'batch'),/Casa/);assert.equal(JSON.stringify(d),before);
});
test('Conferência inclui conta arquivada com saldo zero e crédito cuja data destino pertence ao mês',()=>{
 const d=ledger();d.accounts[1].openingBalance=-20;d.accounts[1].archived=true;F.refreshBalances(d);F.add(d,{id:'transfer',type:'transfer',account:'Banco',targetAccount:'Carteira',date:'2026-07-31',targetDate:'2026-08-01',amount:20,description:'Transferência',category:'Transferências'});assert.equal(d.accounts[1].balance,0);assert.ok(R.monthReview(d,'2026-08').accounts.some(a=>a.id==='b'));
});
test('SQLite, snapshot e restauro conservam os novos percursos de pagamento e ligações',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs'),{buildSqliteSnapshot}=require('../desktop/snapshot-backup.cjs'),{prepareRestoreText}=require('../desktop/restore-validation.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-global-80-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const d=ledger();d.pendingPayments=[{id:'p',description:'Compromisso',date:'2026-08-01',type:'expense',amount:100,account:'Banco',category:'Casa',equipmentId:'e'}];const tx=C.partial(d,'p',40,'2026-08-01');F.update(d,tx.id,{...tx,note:'Corrigido'});
 let db=createSqliteStorage(dir);db.writeSpace('equilibrioData',d);db.close();db=createSqliteStorage(dir);try{const saved=db.readSpace('main').data;assert.equal(saved.pendingPayments[0].amount,60);assert.equal(saved.transactions[0].equipmentId,'e');const text=buildSqliteSnapshot({listSpaces:()=>[{id:'main',name:'Teste'}],readSpace:id=>db.readSpace(id)});const restored=prepareRestoreText(text).document.spaces[0].data;assert.equal(restored.pendingPayments[0].amount,60);assert.equal(restored.transactions[0].note,'Corrigido');assert.equal(restored.accounts[0].balance,960);}finally{db.close();}
});

