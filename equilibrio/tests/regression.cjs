const LegacyMMEX=require('../../historico/baselines/baseline-0.41.2/finance.js');
const LegacyPlanning=require('../../historico/baselines/baseline-0.41.2/planning-model.js');
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const F = require('../finance.js');
const P = require('../features-model.js');
require('../complete-model.js');
const L = require('../life-model.js');
require('../planning-model.js');
require('../receipt-model.js');
const { createSqliteStorage } = require('../desktop/storage-sqlite.cjs');
const U = require('../desktop/manual-updater.cjs');
function ledger() {
 const d=F.empty(); d.accounts=[{id:'bank',name:'Banco',type:'Conta',balance:1000},{id:'cash',name:'Carteira',type:'Dinheiro',balance:100}]; return F.migrateLedgerCore(d);
}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'financas-regression-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})); return dir;}
function packageOf(files){
 const pkg={format:U.UPDATE_FORMAT,formatVersion:1,appId:U.UPDATE_APP_ID,version:'0.28.1',minAppVersion:'0.28.0',files:Object.entries(files).map(([name,text])=>{const b=Buffer.from(text);return {path:name,size:b.length,sha256:U.sha256Buffer(b),contentBase64:b.toString('base64')};})};
 pkg.manifestSha256=U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(pkg))); return pkg;
}
const context={currentVersion:'0.28.0',schemaVersion:1};
test('Importação: deteta separadores tabulados sem mapeamento manual',()=>{
 assert.deepEqual(F.csv('Data\tDescrição\tValor\n2026-09-01\tCompra\t-12,50'),[
  ['Data','Descrição','Valor'],['2026-09-01','Compra','-12,50'],
 ]);
});
test('Movimentos: adicionar, transferir, reverter; duplicados e mês fechado',()=>{
 const d=ledger(); const tx=F.add(d,{date:'2026-09-01',type:'expense',amount:12.34,account:'Banco',description:'Compra'});
 assert.equal(d.accounts[0].balance,987.66); assert.throws(()=>F.add(d,tx));
 const transfer=F.add(d,{date:'2026-09-01',type:'transfer',amount:50,account:'Banco',targetAccount:'Carteira',description:'Transferência'});
 assert.equal(F.totals(d,'2026-09').expense,12.34); F.remove(d,transfer.id); F.remove(d,tx.id); assert.equal(d.accounts[0].balance,1000); assert.equal(d.accounts[1].balance,100);
 d.closedMonths=['2026-09']; assert.throws(()=>F.add(d,tx));
});
test('Crédito: conta paga total, dívida apenas capital, eliminação reverte',()=>{
 const d=ledger();d.debts=[{id:'loan',name:'Crédito',balance:5000}];
 const tx=F.add(d,{date:'2026-09-01',description:'Prestação',type:'expense',amount:120,account:'Banco',debtId:'loan',principal:100,interest:15,charges:5});
 assert.equal(d.accounts[0].balance,880);assert.equal(d.debts[0].balance,4900);assert.equal(F.totals(d,'2026-09').expense,20);
 F.remove(d,tx.id);assert.equal(d.accounts[0].balance,1000);assert.equal(d.debts[0].balance,5000);
});
test('Recorrências: fim de fevereiro e pagamento sem duplicação',()=>{
 const d=ledger();d.recurring=[{id:'r',active:true,start:'2026-01-31',day:31,amount:20,type:'expense',account:'Banco',description:'Mensal'}];
 assert.equal(F.upcoming(d,'2026-02')[0].date,'2026-02-28');
 F.add(d,{...d.recurring[0],id:'paid',date:'2026-02-28',recurringRuleId:'r',recurringDate:'2026-02-28'});
 assert.equal(F.upcoming(d,'2026-02').length,0);
});
test('Subscrições: registo antecipado avança a próxima ocorrência e preserva o mês previsto',()=>{
 const d=ledger();
 d.subscriptions=[{id:'sub',name:'Serviço',amount:12,frequency:'monthly',nextDate:'2026-10-15',status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
 const occurrence=F.upcoming(d,'2026-10').find(x=>x.subscriptionId==='sub');
 assert.equal(occurrence.date,'2026-10-15');
 F.add(d,{id:'paid-sub',description:occurrence.description,amount:occurrence.amount,type:'expense',category:occurrence.category,account:'Banco',date:'2026-09-19',recurringRuleId:occurrence.ruleId,recurringDate:occurrence.date,subscriptionId:'sub'});
 L.advanceSubscriptionPast(d,'sub',occurrence.date);
 assert.equal(d.subscriptions[0].nextDate,'2026-11-15');
 assert.equal(F.upcoming(d,'2026-10').filter(x=>x.subscriptionId==='sub').length,0);
 assert.equal(F.upcoming(d,'2026-11').find(x=>x.subscriptionId==='sub').date,'2026-11-15');
});
test('Planeamento: simulação isolada preserva dados',()=>{
 const d=ledger(),before=JSON.stringify(d);const result=P.simulate(d,100,'2026-09-20','expense',false,'2026-09-19');
 assert.equal(result.base.end-result.scenario.end,100);assert.equal(JSON.stringify(d),before);
});
test('Comprovativos: filtros e conteúdo PDF preservado',()=>{
 const d=ledger();const attachment={name:'teste.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQ='};
 F.add(d,{date:'2026-09-01',description:'Mercado',type:'expense',amount:10,account:'Banco',attachment});
 assert.equal(L.documents(d).length,1);assert.equal(d.transactions[0].attachment.data,attachment.data);
});
test('SQLite: round-trip, delta, cache obsoleto, reabertura e restauro',t=>{
 const dir=temp(t);let db=createSqliteStorage(dir);const d=ledger();d.futureExtension={keep:true};
 db.writeSpace('equilibrioData',d); const next=structuredClone(d);F.add(next,{date:'2026-09-01',description:'Compra',account:'Banco',type:'expense',amount:20});
 db.applyLedgerDelta('equilibrioData',d,next);db.writeCacheState({equilibrioData:JSON.stringify(d)});
 assert.deepEqual(db.readSpace('main').data,next);assert.deepEqual(JSON.parse(db.readState().equilibrioData),next);
 const backup=db.readState();db.close();db=createSqliteStorage(dir);assert.deepEqual(db.readSpace('main').data,next);
 db.writeState({});assert.equal(db.listSpaces().length,0);db.writeState(backup);assert.deepEqual(db.readSpace('main').data,next);
 assert.equal(db.info().dbSchemaVersion,2);db.close();
});
test('SQLite: falha no novo espaço não deixa registo parcial',t=>{
 const db=createSqliteStorage(temp(t));try{const d=ledger();d.accounts.push({...d.accounts[0]});assert.throws(()=>db.writeSpace('equilibrioData',d));assert.equal(db.listSpaces().length,0);}finally{db.close();}
});
test('SQLite: restauro inválido é revertido integralmente',t=>{
 const db=createSqliteStorage(temp(t));try{db.writeSpace('equilibrioData',ledger());const before=db.readState();assert.throws(()=>db.writeState({equilibrioSpaces:JSON.stringify([{id:'main',key:'equilibrioData',name:'Pessoal'}]),equilibrioData:'broken'}));assert.deepEqual(db.readState(),before);}finally{db.close();}
});
test('SQLite: catálogo inválido não apaga espaços',t=>{
 const db=createSqliteStorage(temp(t));try{db.writeSpace('equilibrioData',ledger());const before=db.readState();for(const registry of ['broken','{}',JSON.stringify([{id:'main',name:'Pessoal',key:'wrong'}])]){assert.throws(()=>db.writeState({...before,equilibrioSpaces:registry}));assert.deepEqual(db.readState(),before);}}finally{db.close();}
});
test('Migrações: rejeita JSON inválido e schema futuro',()=>{
 const M=require('../desktop/migrations.cjs');for(const x of [null,[],5,{schemaVersion:999}])assert.throws(()=>M.migrateDocument(x));assert.equal(M.migrateDocument(ledger()).document.schemaVersion,1);
});
test('SQLite: delta rejeita duplicados sem alterar o estado persistido',t=>{
 const db=createSqliteStorage(temp(t));try{const d=ledger();db.writeSpace('equilibrioData',d);const next=structuredClone(d);next.accounts.push({...next.accounts[0],balance:999});assert.throws(()=>db.applyLedgerDelta('equilibrioData',d,next));assert.deepEqual(db.readSpace('main').data,d);}finally{db.close();}
});
test('Comprovativos: abrir/guardar partilham limite PDF de 8 MB',()=>{
 const {decodeAttachment}=require('../desktop/attachment.cjs');
 assert.equal(decodeAttachment({data:'data:application/pdf;base64,JVBERi0xLjQ='}).ext,'.pdf');
 assert.throws(()=>decodeAttachment({data:'data:text/html;base64,AAAA'}));
 assert.throws(()=>decodeAttachment({data:'data:application/pdf;base64,'+Buffer.alloc(8*1024*1024+1).toString('base64')}));
});
test('IPC: rejeita remetente externo em canais async e sync',()=>{
 const handlers={};const raw={handle:(c,h)=>handlers[c]=h,on:(c,h)=>handlers[c]=h};
 const ipc=require('../desktop/ipc-guard.cjs').createTrustedIpc(raw,e=>e.trusted===true);
 ipc.handle('read',()=>42);assert.equal(handlers.read({trusted:true}),42);assert.throws(()=>handlers.read({trusted:false}));
 ipc.on('write',e=>e.returnValue=42);const e={trusted:false};handlers.write(e);assert.equal(e.returnValue,null);
});
test('Atualizador: versão, checksum, caminhos Windows e duplicados',()=>{
 const pkg=packageOf({'desktop/version.cjs':"const APP_VERSION = '0.28.1';"});assert.equal(U.validatePackageObject(pkg,context).version,'0.28.1');
 const tampered=structuredClone(pkg);tampered.files[0].contentBase64='AAAA';assert.throws(()=>U.validatePackageObject(tampered,context));
 for(const name of ['../escape','C:/escape','file:stream','CON.txt','trailing.'])assert.throws(()=>U.validatePackageObject(packageOf({[name]:'x'}),context));
 assert.throws(()=>U.validatePackageObject(packageOf({'A.js':'x','a.js':'y'}),context));
 assert.throws(()=>U.validatePackageObject(pkg,{...context,currentVersion:'0.28.1'}));
});
test('UI Movimentos, Agenda, Resumo e Análises: regressões da v0.34.4',()=>{
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const casa=fs.readFileSync(path.join(__dirname,'..','casa-ui.js'),'utf8');
 const life=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 assert.match(workspace,/Beneficiário/);
 assert.match(workspace,/Data · categoria · conta/);
 assert.match(workspace,/receipt-missing-icon/);
 assert.match(workspace,/dateStepperField\("Data contabilística", "date"/);
 assert.match(workspace,/source: "completed"/);
 assert.match(workspace,/actualDate: t\.date/);
 assert.match(index,/planner-commitments-panel/);
 assert.match(casa,/casaDashboardStrip'\)\?\.remove/);
 assert.doesNotMatch(casa,/strip\.innerHTML=.*CASA · ESTE MÊS/);
 assert.match(life,/annual-analysis-grid annual-analysis-grid-balanced/);
 assert.doesNotMatch(features,/Dividido em/);
 assert.doesNotMatch(features,/expenseNature === "fixed" \? '<span class="tag">Fixa/);
});

test('UI Análises e Resumo: regressões da v0.34.5',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/#lifeAnnualReport \.annual-analysis-grid-balanced\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/);
 assert.match(css,/#salaryPlan>p:first-of-type\{[\s\S]*white-space:nowrap!important/);
});


test('v0.36: ocorrência recorrente pode mudar de mês sem alterar a série',()=>{
 const d=ledger();
 d.recurring=[{id:'chat',active:true,start:'2026-01-15',day:15,frequency:'monthly',amount:23,type:'expense',account:'Banco',description:'ChatGPT',occurrenceOverrides:[{originalDate:'2026-10-15',date:'2026-09-28',reason:'Cobrança antecipada'}]}];
 assert.equal(F.upcoming(d,'2026-10').filter(x=>x.ruleId==='chat').length,0);
 const moved=F.upcoming(d,'2026-09').find(x=>x.ruleId==='chat'&&x.originalDate==='2026-10-15');
 assert.equal(moved.date,'2026-09-28');
 assert.equal(moved.originalDate,'2026-10-15');
 assert.equal(F.upcoming(d,'2026-11').find(x=>x.ruleId==='chat').date,'2026-11-15');
 const future=ledger();
 future.recurring=[{id:'future',active:true,start:'2026-10-15',day:15,frequency:'monthly',amount:5,type:'expense',account:'Banco',description:'Futuro',occurrenceOverrides:[{originalDate:'2026-10-15',date:'2026-09-30'}]}];
 assert.equal(F.upcoming(future,'2026-09').find(x=>x.ruleId==='future').originalDate,'2026-10-15');
 future.subscriptions=[{id:'sub-future',name:'Sub futuro',amount:9,frequency:'monthly',nextDate:'2026-10-20',status:'active',account:'Banco',category:'Subscrições',occurrenceOverrides:[{originalDate:'2026-10-20',date:'2026-09-29'}]}];
 assert.equal(F.upcoming(future,'2026-09').find(x=>x.subscriptionId==='sub-future').originalDate,'2026-10-20');
 F.add(d,{id:'chat-paid',description:'ChatGPT',amount:23,type:'expense',account:'Banco',category:'Subscrições',date:'2026-09-28',recurringRuleId:'chat',recurringDate:moved.originalDate,scheduledDate:moved.date});
 assert.equal(F.upcoming(d,'2026-09').filter(x=>x.ruleId==='chat'&&x.originalDate==='2026-10-15').length,0);
 assert.equal(F.upcoming(d,'2026-11').find(x=>x.ruleId==='chat').date,'2026-11-15');
});

test('v0.36: agenda usa data prevista e separa editar série de ajustar ocorrência',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const daily=fs.readFileSync(path.join(root,'daily-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const version=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
 assert.match(workspace,/Editar série/);
 assert.match(workspace,/Ajustar ocorrência/);
 assert.match(workspace,/scheduledDate \|\| t\.recurringDate/);
 assert.match(workspace,/recurring-history/);
 assert.match(daily,/Mês e ano/);
 assert.match(daily,/data-agenda-layout/);
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(version,/APP_VERSION = '\d+\.\d+\.\d+'/ );
});


test('Casa: resumo próprio, compras independentes e ligações históricas conservadas',()=>{
 const root=path.join(__dirname,'..');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const home=fs.readFileSync(path.join(root,'casa-home-ui.js'),'utf8');
 const casa=fs.readFileSync(path.join(root,'casa-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const version=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
 assert.match(index,/id="casaHome"/);
 assert.ok(index.indexOf('casa-home-ui.js') > index.indexOf('casa-ui.js'));
 assert.match(features,/\["casaHome", "Resumo"\]/);
 if(require('../integration/_version.cjs').revision(pkg.version)>=71)assert.doesNotMatch(features,/\["casaImport", "Importação Casa antiga"\]/);else assert.match(features,/\["casaImport", "Importação Casa antiga"\]/);
 assert.match(home,/Compras, lista, despensa e refeições num só lugar/);
 assert.match(home,/Talões e artigos registados na Casa/);
 assert.match(home,/A tratar/);
 assert.match(home,/Compras recentes/);
 if(require('../integration/_version.cjs').revision(pkg.version)>=71)assert.doesNotMatch(home,/Importar Casa\+/);else assert.match(home,/Importar Casa\+/);
 assert.match(casa,/casaOpenMovement/);
 assert.ok(pkg.build.files.includes('casa-home-ui.js'));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(version,/APP_VERSION = '\d+\.\d+\.\d+'/ );
});

test('Servidor: todos os scripts/estilos HTML e bloqueio de ficheiros privados',async t=>{
 const http=require('node:http');
 const {once}=require('node:events');
 const {listenForTest}=require('./helpers/local-http.cjs');
 const server=require('../serve.cjs').createServer();
 t.after(async()=>{
   server.closeAllConnections();
   if(server.listening)await new Promise(resolve=>server.close(resolve));
 });
 const base=await listenForTest(t,server,async()=>{
   const listening=once(server,'listening');
   server.listen(0,'127.0.0.1');
   await listening;
   return 'http://127.0.0.1:'+server.address().port;
 });
 function get(route){
   return new Promise((resolve,reject)=>{
     http.get(new URL(route,base),async response=>{
       try {
         const chunks=[];
         for await(const chunk of response)chunks.push(chunk);
         resolve({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')});
       } catch(error){reject(error);}
     }).on('error',reject);
   });
 }
 const index=await get('/');
 assert.equal(index.status,200);
 const assets=Array.from(index.body.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g),m=>m[1]);
 assert.ok(assets.includes('ui.css'));
 for(const asset of assets)assert.equal((await get('/'+asset)).status,200,asset);
 assert.equal((await get('/desktop/main.cjs')).status,404);
});
for(const fail of [false,true])test('Atualização real em sandbox: '+(fail?'rollback após checksum inválido':'instalação'),async t=>{
 const dir=temp(t),appPath=path.join(dir,'app'),userDataPath=path.join(dir,'data');fs.mkdirSync(path.join(appPath,'desktop'),{recursive:true});fs.writeFileSync(path.join(appPath,'desktop/version.cjs'),"const APP_VERSION = '0.28.0';");
 const pkg=packageOf({'desktop/version.cjs':"const APP_VERSION = '0.28.1';",'new.js':'new'}),validated=U.validatePackageObject(pkg,context);
 const staged=await U.stageUpdate({pkg,validated,appPath,userDataPath,currentVersion:'0.28.0'});staged.plan.parentPid=2147483647;fs.writeFileSync(staged.planPath,JSON.stringify(staged.plan));{const receiptPath=path.join(path.dirname(path.dirname(path.dirname(staged.planPath))),'update-pending.json');const receipt=JSON.parse(fs.readFileSync(receiptPath));receipt.planSha256=require('../desktop/update-recovery.cjs').planHash(staged.plan);fs.writeFileSync(receiptPath,JSON.stringify(receipt));}
 if(fail)fs.writeFileSync(path.join(staged.stagingDir,'new.js'),'corrupted');
 await U.launchDetachedHelper({planPath:staged.planPath,userDataPath});let status;
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));status=await U.readUpdateStatus(userDataPath);if(['success','failed-rolled-back','failed-rollback-error'].includes(status?.state))break;}
 assert.equal(status?.state,fail?'failed-rolled-back':'success');assert.match(fs.readFileSync(path.join(appPath,'desktop/version.cjs'),'utf8'),fail?/0\.28\.0/:/0\.28\.1/);assert.equal(fs.existsSync(path.join(appPath,'new.js')),!fail);
});

test('Frontend: build verificável e bundle visual canónico único',()=>{
 const root=path.join(__dirname,'..');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const serve=fs.readFileSync(path.join(root,'serve.cjs'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const preload=fs.readFileSync(path.join(root,'desktop','preload.cjs'),'utf8');
 const main=fs.readFileSync(path.join(root,'desktop','main.cjs'),'utf8');
 const bridge=fs.readFileSync(path.join(root,'desktop-bridge.js'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const version=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
 assert.deepEqual([...index.matchAll(/href="([^"?#]+\.css)"/g)].map(m=>m[1]), ['ui.css']);
 assert.match(index,/id="appBuildBadge"/);
 assert.match(serve,/"ui\.css"/);
 assert.ok(pkg.build.files.includes('ui.css'));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(version,/APP_VERSION = '\d+\.\d+\.\d+'/ );
 assert.match(preload,/sendSync\('financas:build-info'\)/);
 assert.doesNotMatch(preload,/desktopVersion:\s*'0\.34\.1'/);
 assert.match(main,/financas:build-info/);
 assert.match(bridge,/ui\.css carregado/);
 assert.doesNotMatch(bridge,/desktopAboutStyles/);
 assert.match(stable,/annual-analysis-grid\.annual-analysis-grid-balanced[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(stable,/#dashboard #salaryPlan>p:first-of-type[\s\S]*white-space:nowrap!important/);
});

test('v0.35: conteúdo Casa fica fora do Resumo financeiro',()=>{
 const root=path.join(__dirname,'..');
 const casa=fs.readFileSync(path.join(root,'casa-complete-ui.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(casa,/function dashboard\(\)\{[\s\S]*casaDashboardStrip'[\s\S]*remove\(\)/);
 assert.doesNotMatch(casa,/ORÇAMENTO DA CASA/);
 assert.match(stable,/#dashboard #casaDashboardStrip/);
});

test('v0.37.1: recorrências antigas já registadas no mesmo mês não voltam a aparecer em atraso',()=>{
 const d=ledger();
 d.recurring=[{id:'r-old',active:true,start:'2026-01-01',day:1,frequency:'monthly',amount:60,type:'expense',account:'Banco',description:'Ginásio'}];
 F.add(d,{id:'old-linked',date:'2026-09-18',type:'expense',amount:60,account:'Banco',description:'Ginásio',recurringRuleId:'r-old'});
 assert.equal(F.upcoming(d,'2026-09').filter(x=>x.ruleId==='r-old').length,0);
 const d2=ledger();
 d2.recurring=[{id:'r-manual',active:true,start:'2026-01-01',day:3,frequency:'monthly',amount:15.21,type:'expense',account:'Banco',description:'Telemóveis + Internet'}];
 F.add(d2,{id:'manual-paid',date:'2026-09-12',type:'expense',amount:15.21,account:'Banco',description:'Telemóveis + Internet'});
 assert.equal(F.upcoming(d2,'2026-09').filter(x=>x.ruleId==='r-manual').length,0);
});

test('v0.37.1: uma ocorrência ignorada deixa de ser gerada sem alterar a série',()=>{
 const d=ledger();
 d.recurring=[{id:'old',active:true,start:'2026-01-01',day:5,frequency:'monthly',amount:20,type:'expense',account:'Banco',description:'Antigo',occurrenceOverrides:[{originalDate:'2026-08-05',date:'2026-08-05',skipped:true,reason:'Não se aplica'}]}];
 assert.equal(F.upcoming(d,'2026-08').length,0);
 assert.equal(F.upcoming(d,'2026-09').find(x=>x.ruleId==='old').date,'2026-09-05');
});

test('v0.37.1: previsão usa o ritmo do mês atual quando não há histórico suficiente',()=>{
 const d=ledger();
 F.add(d,{id:'var',date:'2026-09-10',type:'expense',amount:300,account:'Banco',description:'Compras',category:'Outros'});
 const r=global.CompleteFinance.estimatedForecast(d,90,'2026-09-20',true);
 assert.ok(r.monthlyEstimate>0);
 assert.match(r.estimateBasis,/ritmo do mês atual/);
 assert.ok(r.end<r.baseline.end);
});

test('v0.37.1: UI compacta património, caixa de entrada e mantém análises lado a lado',()=>{
 const root=path.join(__dirname,'..');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const life=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const complete=fs.readFileSync(path.join(root,'complete-ui.js'),'utf8');
 const planning=fs.readFileSync(path.join(__dirname,'..','planning-ui.js'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const version=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
 assert.match(stable,/#inboxHub \.inbox-item[\s\S]*padding:10px 14px!important/);
 assert.match(stable,/#assetsHub \.assets-compact-grid/);
 assert.match(stable,/@media\(min-width:640px\)[\s\S]*annual-analysis-grid\.annual-analysis-grid-balanced/);
 assert.match(life,/asset-compact-card/);
 assert.match(workspace,/Juros \(€\) · automático/);
 assert.match(workspace,/Ignorar esta ocorrência/);
 assert.match(complete,/Despesa variável usada/);
 assert.match(planning,/o salário desse dia fica fora do cálculo/);
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(version,/APP_VERSION = '\d+\.\d+\.\d+'/ );
});


test('v0.37.2: atrasos respeitam o mês selecionado e os quatro ajustes visuais são estruturais',()=>{
 const root=path.join(__dirname,'..');
 const daily=fs.readFileSync(path.join(root,'daily-ui.js'),'utf8');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const version=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
 const E=require('../experience-model.js');const rows=[{date:'2026-08-01',source:'pending',amount:10},{date:'2026-09-01',source:'pending',amount:20},{date:'2026-09-01',source:'completed',amount:30}];assert.equal(E.agenda(F.empty(),rows,'2026-09','overdue').rows.length,1);assert.equal(E.agenda(F.empty(),rows,'2026-09','overdue').rows[0].amount,20);
 assert.match(workspace,/schedule\(\)\.filter\(\(p\) => p\.source !== "completed" && p\.date\.startsWith\(month\) && p\.date < F\.today\(\)\)/);
 assert.match(features,/id = "insightsNatureGrid"/);
 assert.match(features,/panel\("spendingNature", "#insightsNatureGrid"/);
 assert.match(features,/panel\("subscriptionsPanel", "#insightsNatureGrid"/);
 assert.match(stable,/#insights #insightsNatureGrid\.insights-nature-grid[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/);
 assert.match(stable,/#inboxHub details\.review-card[\s\S]*padding:0!important/);
 assert.match(stable,/inline-global-search[\s\S]*border-bottom:1px solid/);
 assert.match(stable,/#salaryPlan,[\s\S]*height:auto!important/);
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(version,/APP_VERSION = '\d+\.\d+\.\d+'/ );
});


test('v0.38: leituras inteligentes detetam categoria, estabelecimento, despesa fora do padrão e previsão',t=>{
 t.mock.method(F,'today',()=> '2026-09-15');
 const d=ledger();
 for(const [date,amount] of [['2026-06-10',20],['2026-07-10',20],['2026-08-10',20]])
   F.add(d,{id:'hist-'+date,date,type:'expense',amount,account:'Banco',description:'Continente',beneficiary:'Continente',category:'Alimentação',expenseNature:'variable'});
 F.add(d,{id:'now-big',date:'2026-09-10',type:'expense',amount:60,account:'Banco',description:'Continente',beneficiary:'Continente',category:'Alimentação',expenseNature:'variable'});
 const info=P.insights(d,'2026-09');
 assert.equal(info.smart.categoryChanges[0].category,'Alimentação');
 assert.equal(info.smart.categoryChanges[0].delta,40);
 assert.equal(info.smart.merchantChanges[0].name,'Continente');
 assert.equal(info.smart.unusualExpenses[0].amount,60);
 assert.ok(info.smart.forecast && info.smart.forecast.month==='2026-09');
});

test('v0.38: Resumo e Análises expõem leituras automáticas e a pesquisa não tem fundo',()=>{
 const root=path.join(__dirname,'..');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const version=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
 assert.match(features,/id = "smartSummaryPanel"/);
 assert.match(features,/panel\("smartInsightsPanel", "#insights"/);
 assert.match(features,/Leituras deste mês/);
 assert.match(features,/Leituras automáticas/);
 assert.match(stable,/\.workspace-bar \.inline-global-search,[\s\S]*background:none!important/);
 assert.ok(index.includes(`data-build="${pkg.version}"`));
 assert.ok(index.includes(`>v${pkg.version}</div>`));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(version,/APP_VERSION = '\d+\.\d+\.\d+'/ );
});


test('v0.38.1: dashboard usa o renderer de insights exportado ao trocar de espaço',()=>{
 const root=path.join(__dirname,'..');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 assert.match(features,/window\.FeatureUI = \{[\s\S]*smartInsightsHTML,/);
 assert.match(features,/window\.FeatureUI\.smartInsightsHTML\(dashboardInsights, true\)/);
 const secondShell=features.slice(features.indexOf('\/\* Product shell:'));
 assert.doesNotMatch(secondShell,/(?<!FeatureUI\.)smartInsightsHTML\(dashboardInsights, true\)/);
});


test('v0.38.3: atualizador distingue schema JSON do schema SQLite',()=>{
 const root=path.join(__dirname,'..');
 const main=fs.readFileSync(path.join(root,'desktop','main.cjs'),'utf8');
 assert.match(main,/CURRENT_DB_SCHEMA_VERSION/);
 assert.match(main,/const updateSchemaVersion = sqliteStorage\?\.info\?\.\(\)\.dbSchemaVersion/);
 assert.match(main,/schemaVersion: updateSchemaVersion/);
 assert.doesNotMatch(main,/readAndValidatePackage\(filePath,[\s\S]{0,180}schemaVersion: CURRENT_SCHEMA_VERSION/);
 assert.match(main,/dbSchemaVersion: storage\.dbSchemaVersion/);
 const pkg=packageOf({'desktop/version.cjs':"const APP_VERSION = '0.28.1';"});
 pkg.minSchemaVersion=2; pkg.maxSchemaVersion=2;
 pkg.manifestSha256=U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(pkg)));
 assert.throws(()=>U.validatePackageObject(pkg,{currentVersion:'0.28.0',schemaVersion:1}),/schema 2 ou superior/);
 assert.equal(U.validatePackageObject(pkg,{currentVersion:'0.28.0',schemaVersion:2}).version,'0.28.1');
});

test('v0.39: importação aprende categoria e beneficiário com o histórico',()=>{
 const d=ledger();
 F.add(d,{id:'old-openai',date:'2026-08-12',description:'PAGAMENTO CARTAO OPENAI CHATGPT 12345678',beneficiary:'OpenAI',type:'expense',amount:23,category:'Subscrições',account:'Banco'});
 const rows=[['2026-09-12','COMPRA CARTAO OPENAI CHATGPT 98765432','-23']];
 const mapping={date:0,description:1,amount:2,debit:-1,credit:-1,category:-1,beneficiary:-1,account:-1,type:-1};
 const result=F.prepareImport(rows,mapping,{header:false,mode:'signed',account:'Banco',overrideAccount:true},d.accounts,d.rules,d.transactions);
 assert.equal(result.errors.length,0);
 assert.equal(result.transactions[0].category,'Subscrições');
 assert.equal(result.transactions[0].beneficiary,'OpenAI');
 assert.equal(result.transactions[0].importSuggestion.source,'history');
 assert.equal(result.transactions[0].importSuggestion.confidence,'high');
});

test('v0.39: regra explícita ganha ao histórico e pode preencher beneficiário',()=>{
 const d=ledger();
 d.rules=[{id:'r',match:'OPENAI',category:'Software',beneficiary:'OpenAI',active:true,priority:10}];
 F.add(d,{id:'old',date:'2026-08-01',description:'OPENAI CHATGPT',beneficiary:'OpenAI',type:'expense',amount:20,category:'Subscrições',account:'Banco'});
 const rows=[['2026-09-01','PAGAMENTO OPENAI CHATGPT 123456','-21']];
 const mapping={date:0,description:1,amount:2,debit:-1,credit:-1,category:-1,beneficiary:-1,account:-1,type:-1};
 const result=F.prepareImport(rows,mapping,{header:false,mode:'signed',account:'Banco',overrideAccount:true},d.accounts,d.rules,d.transactions);
 assert.equal(result.transactions[0].category,'Software');
 assert.equal(result.transactions[0].beneficiary,'OpenAI');
 assert.equal(result.transactions[0].importSuggestion.source,'rule');
});

test('v0.39: coluna de beneficiário do extrato é preservada e reconhecida automaticamente',()=>{
 const header=['Data','Descrição','Beneficiário','Valor'];
 const guessed=F.guessColumns(header);
 assert.equal(guessed.beneficiary,2);
 const rows=[['2026-09-01','Compra 123','Continente','-42,50']];
 const mapping={date:0,description:1,beneficiary:2,amount:3,debit:-1,credit:-1,category:-1,account:-1,type:-1};
 const result=F.prepareImport(rows,mapping,{header:false,mode:'signed',account:'Banco',overrideAccount:true},ledger().accounts,[],[]);
 assert.equal(result.transactions[0].beneficiary,'Continente');
});

test('v0.39: interface de importação mostra preview inteligente, aprendizagem e campos editáveis',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(workspace,/Pré-visualização inteligente/);
 assert.match(workspace,/data-import-beneficiary/);
 assert.match(workspace,/learnImportRule/);
 assert.match(workspace,/importSuggestion/);
 assert.match(index,/id="learnImportRules"/);
});

test('v0.39.1: categorias suportam quatro níveis e preservam a hierarquia',()=>{
 const d=ledger();
 F.add(d,{id:'deep',date:'2026-09-01',type:'expense',amount:10,account:'Banco',description:'Café',category:'Alimentação / Mercearias / Café / Cápsulas'});
 const list=global.CompleteFinance.categoryList(d);
 const root=list.find(c=>c.name==='Alimentação');
 const second=list.find(c=>c.name==='Alimentação / Mercearias');
 const third=list.find(c=>c.name==='Alimentação / Mercearias / Café');
 const fourth=list.find(c=>c.name==='Alimentação / Mercearias / Café / Cápsulas');
 assert.equal(root.parent,''); assert.equal(root.level,1);
 assert.equal(second.parent,'Alimentação'); assert.equal(second.level,2);
 assert.equal(third.parent,'Alimentação / Mercearias'); assert.equal(third.level,3);
 assert.equal(fourth.parent,'Alimentação / Mercearias / Café'); assert.equal(fourth.level,4);
 assert.equal(root.count,1); assert.equal(second.count,1); assert.equal(third.count,1); assert.equal(fourth.count,1);
 assert.equal(F.categoryMatches(fourth.name,'Alimentação / Mercearias'),true);
});

test('v0.39.1: parser MMEX converte categorias profundas e datas portuguesas',()=>{
 assert.equal(LegacyMMEX.mmexDate('05-01-26'),'2026-01-05');
 assert.equal(LegacyMMEX.mmexCategory('Alimentação:Mercearias:Café','Cápsulas'),'Alimentação / Mercearias / Café / Cápsulas');
 assert.deepEqual(LegacyMMEX.mmexTransferAccounts('MILLENIUM','> Conta Poupança'),{source:'MILLENIUM',target:'Conta Poupança'});
 assert.deepEqual(LegacyMMEX.mmexTransferAccounts('MILLENIUM','< Cofre'),{source:'Cofre',target:'MILLENIUM'});
});

test('v0.39.1: importador MMEX agrupa splits e converte transferências reais',()=>{
 const header=['ID','Data','Estado','Tipo','Conta','Beneficiário','Valor','Moeda','Categoria','Subcategoria','Etiquetas','Número','Observações','Levantamento','Depósito','Saldo','Comissão'];
 const rows=[
  ['1','05-01-26','','Withdrawal','MILLENIUM','LIDL','-3.55','EUR','Alimentação:Laticínios','Leite','','','', '3.55','','100.00',''],
  ['1','05-01-26','','Withdrawal','MILLENIUM','LIDL','-2.65','EUR','Alimentação:Mercearias','Arroz','','','', '2.65','','97.35',''],
  ['2','06-01-26','','Transfer','MILLENIUM','> Conta Poupança','-50.00','EUR','Investimentos','Conta Poupança','','','', '50.00','','47.35',''],
 ];
 const accounts=[{name:'Millenium'},{name:'Conta Poupança'}];
 const result=LegacyMMEX.prepareMMEXImport(rows,header,{accountMap:{MILLENIUM:'Millenium','Conta Poupança':'Conta Poupança'},limitDate:'2026-09-21'},accounts,[]);
 assert.equal(result.errors.length,0);
 assert.equal(result.transactions.length,2);
 const split=result.transactions.find(t=>t.mmexId==='1');
 assert.equal(split.amount,6.20); assert.equal(split.splits.length,2);
 assert.deepEqual(split.splits.map(s=>s.category),['Alimentação / Laticínios / Leite','Alimentação / Mercearias / Arroz']);
 const transfer=result.transactions.find(t=>t.mmexId==='2');
 assert.equal(transfer.type,'transfer'); assert.equal(transfer.account,'Millenium'); assert.equal(transfer.targetAccount,'Conta Poupança'); assert.equal(transfer.amount,50);
 assert.equal(result.meta.splitTransactions,1); assert.equal(result.meta.transferTransactions,1);
});

test('v0.39.1: reimportar ID MMEX editado apresenta comparação explícita sem criar outro registo',()=>{
 const d=ledger();
 F.add(d,{id:'existing',mmexId:'abc',date:'2026-09-01',type:'expense',amount:20,account:'Banco',description:'Descrição alterada',category:'Outros'});
 const row={id:'pending',mmexId:'abc',date:'2026-09-01',type:'expense',amount:20,account:'Banco',description:'Original MMEX',category:'Casa'};
 const overlap=LegacyPlanning.importOverlap(d,[row])[0];
 assert.equal(overlap.status,'possible');assert.equal(overlap.correction,true); assert.equal(overlap.matches[0].id,'existing');assert.equal(d.transactions.length,1);
});

test('v0.39.1: UI permite escrever subcategoria e retira assistente MMEX',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const daily=fs.readFileSync(path.join(root,'daily-ui.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(workspace,/"Subcategoria \(opcional\)"[\s\S]{0,220}"subcategory"[\s\S]{0,220}"text"/);
 assert.doesNotMatch(workspace,/function openMMEXWizard/);
 assert.match(workspace,/function openImportWizard/);
 assert.match(workspace,/importAllowClosedMonth/);
 assert.match(daily,/categorySubdetail/);
 assert.match(daily,/c\.level < 4/);
});

test('v0.39.2: conferência encontra correspondência forte por conta, valor, data e beneficiário',()=>{
 const C=require('../complete-model.js'),d=ledger();
 const tx=F.add(d,{id:'tx-lidl',date:'2026-09-08',type:'expense',amount:10,account:'Banco',description:'Compra cartão LIDL 12345',beneficiary:'LIDL',category:'Alimentação'});
 const row={date:'2026-09-09',type:'expense',amount:10,account:'Banco',description:'PAGAMENTO LIDL',beneficiary:'LIDL'};
 const matches=C.candidateMatches(d,row),safe=C.safeCandidate(d,row);
 assert.equal(matches[0].transaction.id,tx.id);
 assert.equal(matches[0].confidence,'high');
 assert.equal(safe.transaction.id,tx.id);
 assert.match(matches[0].reason,/mesmo valor/);
 assert.match(matches[0].reason,/beneficiário coincidente/);
});

test('v0.39.2: conferência não associa automaticamente quando há duas opções equivalentes',()=>{
 const C=require('../complete-model.js'),d=ledger();
 F.add(d,{id:'tx-a',date:'2026-09-08',type:'expense',amount:10,account:'Banco',description:'LIDL',beneficiary:'LIDL'});
 F.add(d,{id:'tx-b',date:'2026-09-08',type:'expense',amount:10,account:'Banco',description:'LIDL',beneficiary:'LIDL'});
 const row={date:'2026-09-08',type:'expense',amount:10,account:'Banco',description:'LIDL',beneficiary:'LIDL'};
 assert.equal(C.candidateMatches(d,row).length,2);
 assert.equal(C.safeCandidate(d,row),null);
});

test('v0.39.2: mesmo valor e data sem texto semelhante aparece para revisão mas não é seguro',()=>{
 const C=require('../complete-model.js'),d=ledger();
 F.add(d,{id:'tx-x',date:'2026-09-08',type:'expense',amount:84.14,account:'Banco',description:'Oficina Auto',beneficiary:'Oficina Auto'});
 const row={date:'2026-09-08',type:'expense',amount:84.14,account:'Banco',description:'Farmácia',beneficiary:'Farmácia'};
 const matches=C.candidateMatches(d,row);
 assert.equal(matches.length,1);
 assert.notEqual(matches[0].confidence,'high');
 assert.equal(C.safeCandidate(d,row),null);
});

test('v0.39.2: associação em lote só liga correspondências seguras e não altera saldos',()=>{
 const C=require('../complete-model.js'),d=ledger();
 F.add(d,{id:'tx-safe',date:'2026-09-08',type:'expense',amount:10,account:'Banco',description:'LIDL',beneficiary:'LIDL'});
 F.add(d,{id:'tx-amb1',date:'2026-09-10',type:'expense',amount:5,account:'Banco',description:'Café',beneficiary:'Café'});
 F.add(d,{id:'tx-amb2',date:'2026-09-10',type:'expense',amount:5,account:'Banco',description:'Café',beneficiary:'Café'});
 const before=d.accounts[0].balance;
 const s=C.statement(d,[
   {date:'2026-09-08',type:'expense',amount:10,account:'Banco',description:'Pagamento LIDL',beneficiary:'LIDL'},
   {date:'2026-09-10',type:'expense',amount:5,account:'Banco',description:'Café',beneficiary:'Café'},
 ],'Teste');
 const linked=C.linkSafeMatches(d,s.id);
 assert.equal(linked,1);
 assert.equal(s.rows[0].status,'linked');
 assert.equal(s.rows[0].transactionId,'tx-safe');
 assert.equal(s.rows[1].status,'pending');
 assert.equal(d.accounts[0].balance,before);
});

test('v0.39.2: interface mostra correspondência inteligente e associação segura',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','complete-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(ui,/Correspondência muito provável/);
 assert.match(ui,/Possível correspondência/);
 assert.match(ui,/Associar seguras/);
 assert.match(ui,/link-statement-direct/);
});


test('v0.41.3: importador MMEX e estilos retirados; CSV permanece',()=>{const root=path.join(__dirname,'..'),workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8'),css=fs.readFileSync(path.join(root,'ui.css'),'utf8');assert.doesNotMatch(workspace,/openMMEXWizard|mmex-review-mode/);assert.doesNotMatch(css,/mmex-review-mode|mmex-account-map/);assert.match(workspace,/Importar selecionados/);assert.equal(F.prepareMMEXImport,undefined);});

test('v0.39.4: histórico de recorrência associa movimentos existentes sem alterar saldos',()=>{
 const d=ledger();
 d.recurring=[{id:'gym',active:true,start:'2025-01-15',day:15,frequency:'monthly',amount:60,type:'expense',account:'Banco',description:'CFit',beneficiary:'CFit',category:'Ginásio'}];
 for(const [id,date] of [['a','2025-01-15'],['b','2025-02-14'],['c','2025-03-16']])
   F.add(d,{id,date,type:'expense',amount:60,account:'Banco',description:'CFit',beneficiary:'CFit',category:'Ginásio'});
 F.add(d,{id:'other',date:'2025-02-15',type:'expense',amount:60,account:'Banco',description:'Outro ginásio',beneficiary:'Outro',category:'Ginásio'});
 const before=d.accounts[0].balance;
 const preview=F.recurringHistoryMatches(d,'gym','2025-01-01','2025-03-31');
 assert.equal(preview.matches.length,3);
 const result=F.linkRecurringHistory(d,'gym','2025-01-01','2025-03-31');
 assert.equal(result.matches.length,3);
 assert.equal(d.accounts[0].balance,before);
 assert.equal(d.transactions.filter(t=>t.recurringRuleId==='gym').length,3);
 assert.equal(d.transactions.find(t=>t.id==='b').recurringDate,'2025-02-15');
 assert.equal(d.transactions.find(t=>t.id==='other').recurringRuleId,undefined);
 assert.equal(F.upcoming(d,'2025-02').filter(x=>x.ruleId==='gym').length,0);
});

test('v0.39.4: associação histórica deixa coincidências ambíguas por rever',()=>{
 const d=ledger();
 d.recurring=[{id:'r',active:true,start:'2025-01-10',day:10,frequency:'monthly',amount:20,type:'expense',account:'Banco',description:'Serviço',category:'Subscrições'}];
 F.add(d,{id:'x1',date:'2025-01-09',type:'expense',amount:20,account:'Banco',description:'Serviço',category:'Subscrições'});
 F.add(d,{id:'x2',date:'2025-01-11',type:'expense',amount:20,account:'Banco',description:'Serviço',category:'Subscrições'});
 const result=F.recurringHistoryMatches(d,'r','2025-01-01','2025-01-31');
 assert.equal(result.matches.length,0);
 assert.equal(result.ambiguous.length,1);
});

test('v0.39.4: Movimentos usa paginação numerada, coluna de notas e scroll sem animação',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(workspace,/TRANSACTION_PAGE_SIZE = 50/);
 assert.match(workspace,/class="transaction-pagination"/);
 assert.match(workspace,/data-action="tx-page"/);
 assert.doesNotMatch(workspace,/Mostrar mais movimentos/);
 assert.match(workspace,/Data · categoria · conta/);
 assert.match(workspace,/Notas/);
 assert.match(workspace,/data-tx-resize="actions"/);
 assert.match(workspace,/class="tx-note movement-note/);
 assert.match(css,/html\{scroll-behavior:auto!important;\}/);
 assert.match(css,/\.view\.active\{animation:none!important;transform:none!important;\}/);
});

test('v0.39.4: eliminar despesa com reembolso oferece remoção conjunta segura',()=>{
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(workspace,/function deleteTransaction\(id\)/);
 assert.match(workspace,/Apagar despesa e reembolso/);
 assert.match(workspace,/for \(const refund of refunds\.slice\(\)\) F\.remove\(data, refund\.id\)/);
 assert.match(workspace,/F\.remove\(data, id\)/);
 assert.match(workspace,/Associar histórico/);
});


test('v0.39.5: histórico recorrente reconhece estrutura forte mesmo com descrição diferente',()=>{
 const d=ledger();
 d.recurring=[{id:'home',active:true,start:'2025-01-05',day:5,frequency:'monthly',amount:422.35,type:'expense',account:'Banco',description:'Crédito: Habitação',category:'Créditos / Habitação'}];
 F.add(d,{id:'jan',date:'2025-01-06',type:'expense',amount:422.35,account:'Banco',description:'PREST EMPRESTIMO 000123',category:'Créditos / Habitação'});
 F.add(d,{id:'feb',date:'2025-02-05',type:'expense',amount:422.35,account:'Banco',description:'DEBITO BANCO CREDITO',category:'Créditos / Habitação'});
 const before=d.accounts[0].balance;
 const preview=F.recurringHistoryMatches(d,'home','2025-01-01','2025-02-28');
 assert.equal(preview.matches.length,2);
 const linked=F.linkRecurringHistory(d,'home','2025-01-01','2025-02-28');
 assert.equal(linked.linked.length,2);
 assert.equal(d.accounts[0].balance,before);
 assert.equal(d.transactions.filter(t=>t.recurringRuleId==='home').length,2);
});

test('v0.39.5: coincidência ambígua pode ser escolhida manualmente sem alterar saldo',()=>{
 const d=ledger();
 d.recurring=[{id:'r',active:true,start:'2025-01-10',day:10,frequency:'monthly',amount:20,type:'expense',account:'Banco',description:'Serviço',category:'Subscrições'}];
 F.add(d,{id:'x1',date:'2025-01-09',type:'expense',amount:20,account:'Banco',description:'Serviço A',category:'Subscrições'});
 F.add(d,{id:'x2',date:'2025-01-11',type:'expense',amount:20,account:'Banco',description:'Serviço B',category:'Subscrições'});
 const before=d.accounts[0].balance;
 const preview=F.recurringHistoryMatches(d,'r','2025-01-01','2025-01-31');
 assert.equal(preview.ambiguous.length,1);
 assert.equal(typeof preview.ambiguous[0].candidates[0].transactionId,'string');
 const chosen=preview.ambiguous[0].candidates[1].transactionId;
 const result=F.linkRecurringHistory(d,'r','2025-01-01','2025-01-31',{'2025-01-10':chosen});
 assert.equal(result.manualMatches.length,1);
 assert.equal(d.transactions.find(t=>t.id===chosen).recurringRuleId,'r');
 assert.equal(d.accounts[0].balance,before);
});

test('v0.39.5: reembolso é movimento real, altera saldo, reduz despesa líquida e pode ser anulado',()=>{
 const d=ledger();
 const expense=F.add(d,{id:'expense',date:'2026-09-02',type:'expense',amount:100,account:'Banco',description:'Compra',category:'Casa'});
 assert.equal(d.accounts[0].balance,900);
 const refund=F.add(d,{id:'refund',date:'2026-09-03',type:'income',amount:30,account:'Banco',description:'Reembolso: Compra',category:'Casa',refundOf:expense.id,source:'Reembolso'});
 assert.equal(d.accounts[0].balance,930);
 assert.equal(F.totals(d,'2026-09').income,0);
 assert.equal(F.totals(d,'2026-09').expense,70);
 F.remove(d,refund.id);
 assert.equal(d.accounts[0].balance,900);
 assert.equal(F.totals(d,'2026-09').expense,100);
});

test('v0.39.5: UI de reembolso, recorrências e movimentos expõe os novos fluxos',()=>{
 const root=path.join(__dirname,'..');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(features,/Procurar movimentos antigos desta categoria\/subcategoria/);
 assert.doesNotMatch(features,/source: "Reembolso"/);
 assert.match(features,/Comprovativo do reembolso/);
 assert.match(workspace,/if \(tx\.refundOf\)[\s\S]*confirmAction\("Apagar movimento"/);
 assert.match(workspace,/data-recurring-history-row/);
 assert.match(workspace,/data-tx-resize="actions"/);
 assert.match(css,/minmax\(320px,1\.65fr\)/);
});

test('v0.39.5: Desktop abre maximizado e usa renderização estável sem aceleração gráfica',()=>{
 const main=fs.readFileSync(path.join(__dirname,'..','desktop','main.cjs'),'utf8');
 assert.match(main,/app\.disableHardwareAcceleration\(\)/);
 assert.match(main,/mainWindow\.maximize\(\)/);
});


test('v0.39.6: histórico recorrente pode ser escolhido diretamente por categoria e subcategoria',()=>{
 const d=ledger();
 d.accounts.push({id:'other-account',name:'Outra',type:'Banco',balance:500});
 d.recurring=[{id:'home',active:true,start:'2025-01-05',day:5,frequency:'monthly',amount:335.10,type:'expense',account:'Banco',description:'Crédito: Habitação',category:'Banco / Crédito Habitação'}];
 F.add(d,{id:'jan',date:'2025-01-25',type:'expense',amount:334.82,account:'Banco',description:'PRESTACAO 001',category:'Banco / Crédito Habitação'});
 F.add(d,{id:'feb',date:'2025-02-25',type:'expense',amount:336.31,account:'Outra',description:'DEBITO EMPRESTIMO',category:'Banco / Crédito Habitação'});
 F.add(d,{id:'other',date:'2025-02-20',type:'expense',amount:335.10,account:'Banco',description:'Outro',category:'Banco / Outro Crédito'});
 const before=d.accounts.map(a=>a.balance);
 const candidates=F.recurringHistoryCandidates(d,'home','2025-01-01','2025-02-28');
 assert.deepEqual(candidates.rows.map(x=>x.transactionId),['jan','feb']);
 const linked=F.linkRecurringHistorySelection(d,'home',['jan','feb']);
 assert.equal(linked.length,2);
 assert.deepEqual(d.accounts.map(a=>a.balance),before);
 assert.equal(d.transactions.find(t=>t.id==='jan').recurringDate,'2025-01-05');
 assert.equal(d.transactions.find(t=>t.id==='feb').recurringDate,'2025-02-05');
 assert.equal(d.transactions.find(t=>t.id==='other').recurringRuleId,undefined);
});

test('v0.39.6: Movimentos permite redimensionar colunas e guardar larguras',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(workspace,/TX_COLUMN_STORAGE_KEY = "equilibrio:transaction-columns:v2"/);
 assert.match(workspace,/data-tx-resize="main"/);
 assert.match(workspace,/data-tx-resize="note"/);
 assert.match(workspace,/data-tx-resize="value"/);
 assert.match(workspace,/data-tx-resize="actions"/);
 assert.match(workspace,/reset-tx-columns/);
 assert.match(css,/grid-template-columns:var\(--tx-grid-columns/);
 assert.match(css,/cursor:col-resize/);
});

test('v0.39.6: reembolso normal usa movimento editável, apagável e visível',()=>{
 const root=path.join(__dirname,'..');
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(features,/Descrição do movimento/);
 assert.match(features,/refundMovement = F\.add/);
 assert.match(features,/typeFilter\.value = "all"/);
 assert.match(features,/Saldo atual de/);
 assert.doesNotMatch(workspace,/Anular reembolso/);
 assert.match(workspace,/button\('Apagar movimento', 'delete-tx'/);
 assert.match(workspace,/"attach-receipt": attachReceiptQuick/);
});

test('v0.39.6: créditos de Património podem associar movimentos históricos sem mexer no saldo',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(workspace,/function linkDebtHistoryForm\(id\)/);
 assert.match(workspace,/Associar histórico", "link-debt-history"/);
 assert.match(workspace,/tx\.debtHistoryOf = debt\.id/);
 assert.match(workspace,/delete tx\.debtHistoryOf/);
 assert.match(workspace,/A associação não volta a alterar o saldo da conta nem o capital em dívida/);
 const d=ledger();
 d.debts=[{id:'mortgage',name:'Habitação',balance:100000,payment:335.10,rate:2,account:'Banco'}];
 F.add(d,{id:'oldpay',date:'2025-01-25',type:'expense',amount:335.10,account:'Banco',description:'Prestação',category:'Banco / Crédito Habitação'});
 const before=d.accounts[0].balance;
 d.transactions[0].debtHistoryOf='mortgage';
 const normalized=F.normalize(d);
 assert.equal(normalized.transactions[0].debtHistoryOf,'mortgage');
 assert.equal(normalized.accounts[0].balance,before);
 assert.equal(normalized.debts[0].balance,100000);
});

test('v0.39.6: Agenda permite apagar recorrência diretamente',()=>{
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(workspace,/button\("Apagar recorrência", "delete-recurring", p\.ruleId \|\| p\.id/);
 assert.match(workspace,/"delete-recurring": \(id\) => confirmAction\("Apagar movimento recorrente"/);
});

test('v0.39.7: edição em grupo altera subcategoria e níveis inferiores sem perder os restantes campos',()=>{
 const d=ledger();
 F.add(d,{id:'a',date:'2026-09-01',type:'expense',amount:10,account:'Banco',description:'A',category:'Casa / Obras / Material'});
 F.add(d,{id:'b',date:'2026-09-02',type:'expense',amount:20,account:'Banco',description:'B',category:'Casa / Obras / Ferramentas'});
 P.bulk(d,['a','b'],{subcategory:'Manutenção',categoryDetail:'Renovação',categorySubdetail:'Interior',account:'',tags:[],expenseNature:''});
 assert.equal(d.transactions.find(t=>t.id==='a').category,'Casa / Manutenção / Renovação / Interior');
 assert.equal(d.transactions.find(t=>t.id==='b').category,'Casa / Manutenção / Renovação / Interior');
});

test('v0.39.7: Movimentos usa seis colunas reais, redimensionáveis e alinhadas à esquerda',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(workspace,/TX_COLUMN_DEFAULTS = \{ main: 190, beneficiary: 120, details: 255, note: 340, value: 120, actions: 150 \}/);
 assert.match(workspace,/data-tx-resize="actions"/);
 assert.doesNotMatch(workspace,/data-tx-resize="right"/);
 assert.match(css,/190px 120px 255px 340px 120px 150px/);
 assert.match(css,/#transactionsTable \.transaction-right\{[\s\S]*display:contents!important/);
 assert.match(css,/text-align:left!important/);
});

test('v0.39.7: Editar seleção expõe subcategoria, terceiro e quarto níveis',()=>{
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const model=fs.readFileSync(path.join(__dirname,'..','features-model.js'),'utf8');
 assert.match(features,/Nova subcategoria \(vazio mantém a atual\)/);
 assert.match(features,/Novo detalhe · 3\.º nível/);
 assert.match(features,/Novo subdetalhe · 4\.º nível/);
 assert.match(model,/changes\.subcategory/);
 assert.match(model,/changes\.categoryDetail/);
 assert.match(model,/changes\.categorySubdetail/);
});

test('v0.39.7: associação de crédito permite ano 2024 e divisão capital juros editável',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(workspace,/Ano a pesquisar/);
 assert.match(workspace,/historyYear/);
 assert.match(workspace,/Editar valores", "edit-debt-history"/);
 assert.match(workspace,/Editar pagamento", "edit-debt-history"/);
 assert.match(workspace,/debtHistoryPrincipal/);
 assert.match(workspace,/debtHistoryInterest/);
 assert.match(workspace,/Juros \(€\) · automático/);
 const d=ledger();
 d.debts=[{id:'mortgage',name:'Habitação',balance:100000,payment:350,rate:2,account:'Banco'}];
 F.add(d,{id:'old',date:'2024-02-10',type:'expense',amount:350,account:'Banco',description:'Prestação',category:'Banco / Crédito Habitação'});
 d.transactions[0].debtHistoryOf='mortgage';
 d.transactions[0].debtHistoryPrincipal=300;
 d.transactions[0].debtHistoryInterest=50;
 d.transactions[0].debtHistoryCharges=0;
 const normalized=F.normalize(d);
 assert.equal(normalized.transactions[0].debtHistoryPrincipal,300);
 assert.equal(normalized.transactions[0].debtHistoryInterest,50);
 assert.throws(()=>F.normalize({...d,transactions:[{...d.transactions[0],debtHistoryPrincipal:360,debtHistoryInterest:0}]}));
});


test('v0.39.8: movimentos do mesmo dia usam a mesma ordem na lista, saldo e CSV',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const d={transactions:[
  {id:'agua',date:'2025-01-30',type:'expense',amount:24.06,account:'Millenium'},
  {id:'leroy',date:'2025-02-01',type:'expense',amount:1.68,account:'Millenium'},
  {id:'deposito',date:'2025-02-01',type:'income',amount:612.22,account:'Millenium'},
 ]};
 assert.deepEqual(F.sortTransactions(d,d.transactions,'asc').map(t=>t.id),['agua','leroy','deposito']);
 assert.deepEqual(F.sortTransactions(d,d.transactions,'desc').map(t=>t.id),['deposito','leroy','agua']);
 let balance=4247.69;
 const after={};
 for(const t of F.sortTransactions(d,d.transactions,'asc')){
  balance=F.money(balance+(t.type==='income'?t.amount:-t.amount));
  after[t.id]=balance;
 }
 assert.deepEqual(after,{agua:4223.63,leroy:4221.95,deposito:4834.17});
 assert.match(workspace,/F\.sortTransactions\(data, data\.transactions, "asc"\)/);
 assert.match(workspace,/function filteredTransactions\([^)]*\)[\s\S]*F\.sortTransactions\([\s\S]*"desc"/);
 assert.match(workspace,/function exportCSV\(\)[\s\S]*filteredTransactions\(\)\.map/);
});

test('v0.39.9: editar despesa com reembolso preserva ligação e atualiza o saldo',()=>{
 const d=ledger();
 d.debts=[{id:'mortgage',name:'Habitação',balance:100000,payment:100,rate:2,account:'Banco'}];
 const expense=F.add(d,{id:'credit-payment',date:'2026-09-01',type:'expense',amount:100,account:'Banco',description:'Prestação antiga',category:'Casa / Crédito',debtHistoryOf:'mortgage'});
 const refund=F.add(d,{id:'refund',date:'2026-09-02',type:'income',amount:20,account:'Banco',description:'Reembolso',category:'Casa / Crédito',refundOf:expense.id});
 assert.equal(d.accounts[0].balance,920);
 const updated=F.update(d,expense.id,{...expense,description:'Prestação corrigida',amount:120,note:'corrigido'});
 assert.equal(updated.id,'credit-payment');
 assert.equal(updated.description,'Prestação corrigida');
 assert.equal(d.transactions.find(t=>t.id===refund.id).refundOf,'credit-payment');
 assert.equal(d.accounts[0].balance,900);
 const before=JSON.stringify(d);
 assert.throws(()=>F.update(d,expense.id,{...updated,amount:10}),/inferior ao total já reembolsado/);
 assert.equal(JSON.stringify(d),before);
});

test('v0.39.9: notas mantêm a cor escolhida apesar do layout estável',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/#transactionsTable \.tx-note\.note-blue\{color:#195ba4!important;\}/);
 assert.match(css,/#transactionsTable \.tx-note\.note-green\{color:#15704b!important;\}/);
 assert.match(css,/body\[data-theme="dark"\] #transactionsTable \.tx-note\.note-red\{color:#ff9eab!important;\}/);
});

test('v0.39.9: subscrições filtram e associam histórico sem alterar saldos',()=>{
 const d=ledger();
 d.subscriptions=[{id:'stream',name:'Streaming',amount:12.99,frequency:'monthly',nextDate:'2026-10-15',renewalDay:15,status:'active',trialEnd:'',reminderDays:7,account:'Banco',category:'Lazer / Streaming',prices:[]}];
 F.add(d,{id:'jan',date:'2025-01-14',type:'expense',amount:12.99,account:'Banco',description:'Serviço vídeo',beneficiary:'Streaming',category:'Lazer / Streaming'});
 F.add(d,{id:'feb',date:'2025-02-15',type:'expense',amount:12.99,account:'Banco',description:'Serviço vídeo',beneficiary:'Streaming',category:'Lazer / Streaming'});
 F.add(d,{id:'other',date:'2025-02-15',type:'expense',amount:12.99,account:'Banco',description:'Outro',category:'Lazer / Jogos'});
 const before=d.accounts[0].balance;
 const candidates=F.subscriptionHistoryCandidates(d,'stream','2025-01-01','2025-12-31');
 assert.deepEqual(candidates.rows.filter(r=>r.sameCategory).map(r=>r.transactionId),['jan','feb']);
 const linked=F.linkSubscriptionHistorySelection(d,'stream',['jan','feb']);
 assert.equal(linked.length,2);
 assert.equal(d.accounts[0].balance,before);
 assert.equal(d.transactions.find(t=>t.id==='jan').subscriptionId,'stream');
 assert.equal(d.transactions.find(t=>t.id==='jan').recurringDate,'2025-01-15');
 assert.equal(d.transactions.find(t=>t.id==='jan').scheduledDate,'2025-01-15');
 assert.equal(d.transactions.find(t=>t.id==='feb').recurringDate,'2025-02-15');
 const ui=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 assert.match(ui,/Associar movimentos antigos/);
 assert.match(ui,/life-subscription-history/);
 assert.match(ui,/subscriptionHistoryCandidates/);
 assert.match(ui,/recurring-history", `subscription~\$\{s\.id\}`/);
});


test('v0.39.11: Resumo mantém o redesign sem colidir com a navegação data-view',()=>{
 const root=path.join(__dirname,'..');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(index,/class="view active summary-dashboard"/);
 assert.match(index,/id="summaryBalanceChart"/);
 assert.match(index,/id="summaryExpenseDonut"/);
 assert.match(index,/id="summaryAccounts"/);
 assert.match(index,/id="summaryRecentTransactions"/);
 assert.match(index,/id="summaryUpcomingPayments"/);
 assert.match(workspace,/function summaryLineChart/);
 assert.match(workspace,/function summaryIncomeExpenseChart/);
 assert.match(workspace,/function summaryRenderDonut/);
 assert.match(workspace,/function summaryRenderUpcoming/);
 assert.match(workspace,/document\.body\.dataset\.currentView = v/);
 assert.doesNotMatch(workspace,/document\.body\.dataset\.view = v/);
 assert.match(stable,/body\[data-current-view=\"dashboard\"\]/);
});


test('v0.39.12: Resumo fica mais compacto e robusto com dados reais',()=>{
 const root=path.join(__dirname,'..');
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(workspace,/function summaryPositiveScale/);
 assert.match(workspace,/summary-secondary-label/);
 assert.match(workspace,/summary-due-hint/);
 assert.match(stable,/\.summary-list-panel\{[\s\S]*height:272px/);
 assert.match(stable,/body\[data-current-view="dashboard"\] \.notice\{/);
});


test('v0.39.13: Resumo elimina caixa dentro de caixa e adota ícone oficial',()=>{
 const root=path.join(__dirname,'..');
 const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 const main=fs.readFileSync(path.join(root,'desktop','main.cjs'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.ok(fs.existsSync(path.join(root,'Equilibrio.ico')));
 assert.ok(pkg.build.files.includes('Equilibrio.ico'));
 assert.equal(pkg.build.win.icon,'Equilibrio.ico');
 assert.match(main,/icon:\s*path\.join\(__dirname, '\.\.', 'Equilibrio\.ico'\)/);
 assert.match(stable,/\.summary-month-picker-wrap\{[\s\S]*border:0!important/);
 assert.match(stable,/\.summary-list::-webkit-scrollbar-button\{display:none!important/);
});


test('v0.39.14: edição em grupo pode alterar o nome de vários movimentos',()=>{
 const d=ledger();
 F.add(d,{id:'a',date:'2026-09-01',type:'expense',amount:10,account:'Banco',description:'Nome A',category:'Lazer'});
 F.add(d,{id:'b',date:'2026-09-02',type:'expense',amount:20,account:'Banco',description:'Nome B',category:'Lazer'});
 const preview=global.PlanningFinance.bulkPreview(d,['a','b'],{description:'Netflix'});
 assert.equal(preview.changed,2);
 P.bulk(d,['a','b'],{description:'Netflix'});
 assert.deepEqual(d.transactions.filter(t=>['a','b'].includes(String(t.id))).map(t=>t.description),['Netflix','Netflix']);
 const ui=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 assert.match(ui,/Novo nome\/descrição \(vazio mantém a atual\)/);
});

test('v0.39.14: apagar vista guardada pede confirmação',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','complete-ui.js'),'utf8');
 assert.match(ui,/"remove-view": \(id\) => \{[\s\S]*confirm\(`Apagar a vista guardada/);
 assert.match(ui,/Vista guardada apagada\./);
});

test('v0.39.14: histórico de subscrição encontra beneficiário mesmo noutra categoria',()=>{
 const d=ledger();
 d.subscriptions=[{id:'netflix',name:'Netflix',amount:15.99,frequency:'monthly',nextDate:'2026-10-10',renewalDay:10,status:'active',account:'Banco',category:'Subscrições / Streaming',prices:[]}];
 F.add(d,{id:'old-netflix',date:'2025-01-10',type:'expense',amount:15.99,account:'Banco',description:'Pagamento cartão',beneficiary:'NETFLÍX',category:'Lazer / Vídeo'});
 const before=d.accounts[0].balance;
 const candidates=F.subscriptionHistoryCandidates(d,'netflix','2025-01-01','2025-12-31');
 const row=candidates.rows.find(r=>r.transactionId==='old-netflix');
 assert.ok(row);
 assert.equal(row.sameCategory,false);
 const linked=F.linkSubscriptionHistorySelection(d,'netflix',['old-netflix']);
 assert.equal(linked.length,1);
 assert.equal(d.transactions.find(t=>t.id==='old-netflix').subscriptionId,'netflix');
 assert.equal(d.transactions.find(t=>t.id==='old-netflix').category,'Lazer / Vídeo');
 assert.equal(d.accounts[0].balance,before);
 const ui=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 assert.match(ui,/normalize\('NFD'\)/);
 assert.match(ui,/row\.beneficiary/);
});

test('v0.39.14: Pesquisar Tudo não herda fundo branco no modo escuro',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/input\[type="search"\][\s\S]*-webkit-appearance:none!important/);
 assert.match(css,/body\[data-theme="dark"\] \.workspace-bar \.inline-search-label[\s\S]*background:#071c25!important/);
});

test('v0.39.17: Caixa de entrada e Qualidade de dados vivem numa única área Dados',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 assert.match(ui,/name:\s*"Dados"[\s\S]*?\[\["dataHub",\s*"Dados"\]/);
 assert.match(ui,/id = "dataHub"/);
 assert.match(ui,/id="inboxHub"/);
 assert.match(ui,/id="qualityHub"/);
 assert.match(ui,/data-data-pane="inbox"/);
 assert.match(ui,/data-data-pane="quality"/);
});

test('v0.39.17: rotas antigas de Caixa de entrada e Qualidade abrem a secção correta em Dados',()=>{
 const ws=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(ws,/v === "qualityHub" \? "quality" : v === "inboxHub" \? "inbox"/);
 assert.match(ws,/v = "dataHub"/);
 const life=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 const planning=fs.readFileSync(path.join(__dirname,'..','planning-ui.js'),'utf8');
 assert.match(life,/id === "qualityHub"[\s\S]*DataHub\.pane\("quality"\)/);
 assert.match(planning,/id === "inboxHub"[\s\S]*DataHub\.pane\("inbox"\)/);
});

test('v0.39.17: Dados mantém identidade visual própria no modo escuro',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/\.data-hub-pane\.active/);
 assert.match(css,/body\[data-theme="dark"\] \.data-hub-body/);
});


test('v0.39.17: Caixa de entrada usa filtros, fontes, pesquisa e tabela em vez de cartões antigos',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','daily-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(ui,/data-inbox-filterbar/);
 assert.match(ui,/data-inbox-sources/);
 assert.match(ui,/dataInboxSearch/);
 assert.match(ui,/data-inbox-table/);
 assert.doesNotMatch(ui,/Importar ficheiros/);
 assert.match(css,/grid-template-columns:220px minmax\(0,1fr\)/);
});

test('v0.39.17: Qualidade de dados mostra score, métricas e tabela de problemas',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(ui,/data-quality-ring/);
 assert.match(ui,/data-quality-metrics/);
 assert.match(ui,/data-quality-table/);
 assert.match(ui,/Executar verificação/);
 assert.match(css,/conic-gradient/);
});

test('v0.39.17: barra global não escreve null e Dados mantém um único título',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const ws=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.equal((ui.match(/<h2>Dados<\/h2>/g)||[]).length,1);
 assert.match(ws,/globalPeriodRow[\s\S]*if \(globalPeriodRow\)/);
});


test('v0.39.18: linhas de conferência válidas não contam como valores em falta',()=>{
 const d=F.empty();
 d.closedMonths=['2026-09'];
 d.statements=[{id:'s1',name:'Extrato',date:'2026-09-22',fingerprint:'f',rows:[{id:'r1',source:{amount:12.34},status:'pending',transactionId:null}]}];
 const q=L.quality(d,'2026-09','2026-09-22');
 assert.equal(q.pendingReview,1);
 assert.equal(q.missingValues,0);
 assert.equal(q.issues.some(x=>x.kind==='import'),false);
 assert.equal(q.issues.some(x=>x.kind==='value'),false);
 d.statements[0].rows[0].source.amount='';
 const broken=L.quality(d,'2026-09','2026-09-22');
 assert.equal(broken.missingValues,1);
 assert.equal(broken.issues.find(x=>x.kind==='value')?.count,1);
});

test('v0.39.18: score de qualidade ignora volume de revisão e usa problemas reais',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 assert.doesNotMatch(ui,/pendingImportCount/);
 assert.match(ui,/Math\.min\(25, missingValueCount \* 8\)/);
 assert.match(ui,/O score penaliza apenas problemas reais/);
 assert.match(ui,/problemas'\) \+ ' a rever/);
});

test('v0.39.18: Dados compacta filtros, amplia descrição e corrige Resolver no modo escuro',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/grid-template-columns:28px 78px minmax\(240px,2fr\) 84px 104px 102px minmax\(135px,1fr\) 86px/);
 assert.match(css,/body\[data-theme="dark"\] \.data-inbox-actions \.data-icon-button/);
 assert.match(css,/min-height:30px!important;[\s\S]*padding:5px 9px!important/);
 assert.match(css,/body\[data-current-view="dataHub"\] \.workspace-bar\{[\s\S]*margin-bottom:12px!important/);
});


test('v0.39.19: Dados recupera título forte, fontes visuais e score com estado',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const daily=fs.readFileSync(path.join(__dirname,'..','daily-ui.js'),'utf8');
 const life=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(ui,/<h2>Dados<\/h2>/);
 assert.match(daily,/data-source-avatar/);
 assert.match(daily,/sourceTone/);
 assert.match(life,/scoreClass/);
 assert.match(life,/data-quality-metric metric-/);
 assert.match(css,/data-quality-ring\.score-good/);
 assert.match(css,/source-tone-all/);
});


test('v0.39.20: navegação principal passa ao topo e manutenção sai da sidebar',()=>{
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const life=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 const desktop=fs.readFileSync(path.join(__dirname,'..','desktop-bridge.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(features,/id = "appTopbar"/);
 assert.match(features,/top-primary-nav/);
 assert.match(features,/top-settings-button/);
 assert.match(features,/navigate\("settings"\)/);
 assert.match(features,/maintenanceDataPanel/);
 assert.match(features,/desktopUpdateButton[\s\S]*exportData[\s\S]*importData/);
 assert.match(life,/topSpaceSlot/);
 assert.match(life,/topSearchSlot/);
 assert.match(desktop,/getElementById\("faqDesktopDiagnostics"\)/);
 assert.match(fs.readFileSync(path.join(__dirname,"..","interface-ui.js"),"utf8"),/<summary>Diagnóstico técnico<\/summary>/);
 assert.match(css,/\.sidebar\{[\s\S]*display:none!important/);
 assert.match(css,/body\[data-current-view="dataHub"\] #mainContent>header/);
});


test('v0.39.21: topo usa o ícone oficial e pesquisa global sem fundo preenchido',()=>{
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(features,/top-brand[\s\S]*Equilibrio\.ico/);
 assert.match(index,/rel="icon" href="Equilibrio\.ico"/);
 assert.match(css,/\.top-brand img/);
 assert.match(css,/\.top-search-slot \.inline-search-label\{[\s\S]*background:transparent!important/);
});

test('Dados: separadores acessíveis mantêm a seleção explícita de painel',()=>{
 const features=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 assert.match(features,/role="tablist" aria-label="Organizar dados"/);
 assert.match(features,/pane.hidden = !active/);
 assert.match(features,/aria-labelledby="dataInboxTab"/);
 assert.match(features,/ArrowLeft/);
});

test('Revisão semanal: mantém a revisão narrativa v0.39.30 sem repetir o dashboard',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','daily-ui.js'),'utf8');
 for(const part of ['review30-hero','review30-day','review30-attention-row','review30-next-step-card']) assert.ok(ui.includes(part));
 assert.match(ui,/Como correu a semana/);
 assert.match(ui,/Conclusões da semana/);
});

test('Resumo: navegação comum da v0.39.63 preserva cartões compactos',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/\.area-tabs\{display:flex!important[\s\S]*min-height:48px!important/);
 assert.match(css,/\.area-tabs button\{display:flex!important[\s\S]*min-height:38px!important/);
 assert.match(css,/\.summary-kpi\{[\s\S]*min-height:110px!important/);
 assert.match(css,/\.summary-panel\{[\s\S]*border-radius:14px!important/);
});


test('v0.39.24: Movimentos usa o espaço para ações visíveis e remove painéis redundantes',()=>{
 const root=path.join(__dirname,'..');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'ui.css'),'utf8');
 const pkg=require(path.join(root,'package.json'));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(index,/movement-kpi-grid/);
 assert.match(index,/movement-filter-sidebar/);
 assert.doesNotMatch(index,/movementCategorySummary/);
 assert.doesNotMatch(index,/movementRecurringSummary/);
 assert.doesNotMatch(index,/movementUpcomingSummary/);
 assert.match(workspace,/movement-inline-actions/);
 assert.match(workspace,/movement-receipt-pending/);
 assert.doesNotMatch(workspace,/movementRenderInsights\(\);/);
 assert.match(css,/movement-row-actions-expanded/);
 assert.match(css,/movement-receipt-pending/);
});

test('v0.39.24: subscrições recuperam histórico de preços e a Agenda não duplica pagamentos registados',()=>{
 const d=ledger();
 d.subscriptions=[{id:'netflix',name:'Netflix',amount:7,frequency:'monthly',nextDate:'2026-09-21',renewalDay:21,status:'active',account:'Banco',category:'Subscrições / Streaming',prices:[]}];
 F.add(d,{id:'old',date:'2025-01-21',type:'expense',amount:6.5,account:'Banco',description:'Pagamento cartão',beneficiary:'Netflix',category:'Lazer / Streaming'});
 F.linkSubscriptionHistorySelection(d,'netflix',['old']);
 assert.ok(d.subscriptions[0].prices.some(p=>p.date==='2025-01-21'&&p.amount===6.5));
 F.add(d,{id:'paid',date:'2026-09-20',type:'expense',amount:7,account:'Banco',description:'Pagamento cartão',beneficiary:'NETFLÍX',category:'Lazer / Streaming'});
 assert.equal(F.upcoming(d,'2026-09').filter(x=>x.subscriptionId==='netflix').length,0);
 const ui=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 assert.match(ui,/data-subscription-history-likely/);
 assert.match(ui,/subscriptionPriceHistory/);
});

test('v0.39.24: Resumo recebe polimento clean sem alterar a estrutura',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(css,/body\[data-current-view="dashboard"\] \.summary-kpi\{[\s\S]*min-height:102px!important/);
 assert.match(css,/body\[data-current-view="dashboard"\] \.summary-panel\{[\s\S]*border-color:color-mix/);
});

test('v0.39.24: servidor local continua a servir o ícone PNG com MIME válido',()=>{
 const root=path.join(__dirname,'..');
 const serve=fs.readFileSync(path.join(root,'serve.cjs'),'utf8');
 const pkg=require(path.join(root,'package.json'));
 assert.equal(pkg.version,require('../desktop/version.cjs').APP_VERSION);
 assert.match(serve,/"\.png": "image\/png"/);
 assert.match(serve,/"\.ico": "image\/x-icon"/);
 assert.match(serve,/"Equilibrio\.png"/);
});

test('v0.39.25: Agenda não marca como pendentes subscrições/recorrências já registadas por identidade no período',()=>{
 const d=ledger();
 d.subscriptions=[
  {id:'netflix',name:'Netflix',amount:7,frequency:'monthly',nextDate:'2026-09-01',renewalDay:1,status:'active',account:'Banco',category:'Lazer / Subscrições',prices:[]},
  {id:'casa',name:'Seguros Casa',amount:12.94,frequency:'monthly',nextDate:'2026-09-13',renewalDay:13,status:'active',account:'Banco',category:'Seguros / Casa',prices:[]},
 ];
 d.recurring=[{id:'vida',active:true,start:'2026-01-01',day:1,amount:16.46,type:'expense',account:'Banco',description:'Seguros Vida',category:'Seguros / Vida'}];
 F.add(d,{id:'n-paid',date:'2026-09-01',type:'expense',amount:7,account:'Banco',description:'Pagamento cartão',beneficiary:'NETFLÍX',category:'Lazer / Streaming'});
 F.add(d,{id:'c-paid',date:'2026-09-13',type:'expense',amount:12.94,account:'Banco',description:'Seguros: Casa',category:'Seguros / Casa'});
 F.add(d,{id:'v-paid',date:'2026-09-01',type:'expense',amount:16.46,account:'Banco',description:'Seguros: Vida',category:'Seguros / Vida'});
 const open=F.upcoming(d,'2026-09');
 assert.equal(open.filter(x=>x.subscriptionId==='netflix').length,0);
 assert.equal(open.filter(x=>x.subscriptionId==='casa').length,0);
 assert.equal(open.filter(x=>x.ruleId==='vida'||x.id==='vida').length,0);
});

test('v0.39.25: Movimentos expõe intervalo de datas e ações numa única fila',()=>{
 const root=path.join(__dirname,'..');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 const complete=fs.readFileSync(path.join(root,'complete-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'ui.css'),'utf8');
 assert.match(index,/id="movementDateStart"/);
 assert.match(index,/id="movementDateEnd"/);
 assert.match(complete,/setDateRange/);
 assert.match(workspace,/customDates = Boolean\(advanced\.start \|\| advanced\.end\)/);
 assert.match(workspace,/transaction-columns:v4/);
 assert.match(css,/movement-row-actions-expanded/);
});

test('v0.39.25: Subscrições e Previsão semanal usam o novo layout e Dados tem pesquisa transparente',()=>{
 const root=path.join(__dirname,'..');
 const life=fs.readFileSync(path.join(root,'life-ui.js'),'utf8');
 const features=fs.readFileSync(path.join(root,'features-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'ui.css'),'utf8');
 assert.match(life,/subscription-dashboard/);
 assert.match(life,/subscription-history-card/);
 if(require('../integration/_version.cjs').revision()>=69){
  assert.doesNotMatch(life,/<section class="subscription-agenda-card"/);
  assert.match(features,/subscriptionsManagerDialog/);
  assert.match(fs.readFileSync(path.join(root,'daily-ui.js'),'utf8'),/agendaMonthServices/);
 }else assert.match(life,/subscription-agenda-card/);
 assert.match(life,/row\.likely&&!row\.alreadyLinked&&!row\.blocked/);
 assert.match(features,/weeklyForecastDashboard/);
 assert.match(features,/Previsão semanal/);
 assert.match(css,/#dataHub \.data-search-field\{[\s\S]*background:transparent!important/);
});

test('v0.39.39: converter uma saída importada em transferência credita o destino sem duplicar o débito',()=>{
 const d=ledger();
 const outgoing=F.add(d,{id:'outgoing',date:'2026-09-23',type:'expense',amount:100,account:'Banco',description:'Transferência poupança',category:'Outros'});
 assert.equal(d.accounts.find(a=>a.name==='Banco').balance,900);
 assert.equal(d.accounts.find(a=>a.name==='Carteira').balance,100);
 F.update(d,outgoing.id,{...outgoing,type:'transfer',targetAccount:'Carteira',category:'Transferências'});
 assert.equal(d.accounts.find(a=>a.name==='Banco').balance,900);
 assert.equal(d.accounts.find(a=>a.name==='Carteira').balance,200);
 assert.equal(F.totals(d,'2026-09').expense,0);
});

test('v0.39.39: a barra inferior desaparece e Planos/Agenda/Dados usam a nova organização',()=>{
 const root=path.join(__dirname,'..');
 const features=fs.readFileSync(path.join(root,'features-ui.js'),'utf8');
 const complete=fs.readFileSync(path.join(root,'complete-ui.js'),'utf8');
 const life=fs.readFileSync(path.join(root,'life-ui.js'),'utf8');
 const daily=fs.readFileSync(path.join(root,'daily-ui.js'),'utf8');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const stable=fs.readFileSync(path.join(root,'ui.css'),'utf8');
 assert.match(features,/id="topFinanceSlot"/);
 assert.match(features,/plan-manager-dialog/);
 assert.match(features,/openPlanManager/);
 assert.match(complete,/topFinanceSlot/);
 assert.doesNotMatch(life,/toolbarAccountBalances/);
 assert.match(stable,/\.workspace-bar\{display:none!important;\}/);
 assert.doesNotMatch(daily,/Importar ficheiros/);
 assert.match(index,/planner-recurring-actions[\s\S]*id="addTransaction3"[\s\S]*id="manageRecurring"/);
});
