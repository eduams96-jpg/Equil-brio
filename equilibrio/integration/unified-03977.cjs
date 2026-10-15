'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,browserLaunchOptions}=require('./_browser.cjs');
(async()=>{const server=require('../serve.cjs').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(browserLaunchOptions()),errors=[],out=path.resolve(__dirname,'../validacao/unified-03977');fs.mkdirSync(out,{recursive:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Alteração gravada'))errors.push(m.text());});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR: '+e.stack);});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(250);
await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());data=F.empty();data.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:2500},{id:'saving',name:'Poupança',type:'Poupança',balance:4400}];F.migrateLedgerCore(data);month=FinancePlus.monthAdd(F.today().slice(0,7),-1);data.goals=[{id:'holiday',name:'Férias',target:1200,current:780,planMonths:12}];data.reserves=[{id:'fund',name:'Fundo de emergência',target:3200,saved:1280,months:12}];data.budgets=[{id:'food',category:'Alimentação',limit:400}];data.assets=[{id:'car',name:'Automóvel',kind:'Viatura',valuations:[{date:'2025-01-01',value:12000}]}];data.investments=[{id:'etf',name:'ETF de teste',units:10,cost:100,value:110}];data.wealthHistory=[{id:'h1',date:month+'-01',net:16000},{id:'h2',date:month+'-20',net:18000}];for(const [id,name,amount]of [['netflix','Netflix',7],['spotify','Spotify',3.87]])LifeFinance.subscription(data,{name,amount,frequency:'monthly',nextDate:F.today().slice(0,7)+'-15',status:'active',reminderDays:7,account:'Banco',category:'Subscrições'},undefined);F.add(data,{id:'food1',description:'Supermercado',category:'Alimentação',type:'expense',amount:30,account:'Banco',date:month+'-05'});data.pendingImports=[{id:'import1',date:month+'-10',description:'Loja teste',type:'expense',amount:4,account:'Banco',category:'Casa'},{id:'import2',date:month+'-11',description:'Outro teste',type:'expense',amount:5,account:'Banco',category:'Casa'}];render();navigate('weeklyHub');});
console.log('Errors',errors);assert.deepEqual(errors,[]);
const before=await page.evaluate(()=>JSON.stringify(data));for(const v of ['weeklyHub','plansHub','planner','wealth','wealthMoneyHub','dataHub','settings']){await page.evaluate(v=>navigate(v),v);await page.screenshot({path:path.join(out,v+'.png'),fullPage:true});console.log(v,await page.locator('#'+v).innerText().then(s=>s.slice(0,100)));}
assert.equal(await page.evaluate(()=>JSON.stringify(data)),before,'Presentation modified data');assert.deepEqual(errors,[]);
await page.evaluate(()=>navigate('wealthMoneyHub'));await page.locator('[data-u-wealth="account:saving"] td').nth(1).click();assert.equal(await page.locator('.u-inspector .desk-inspector-heading h3').innerText(),'Poupança');await page.evaluate(()=>render());assert.equal(await page.locator('.u-inspector .desk-inspector-heading h3').innerText(),'Poupança');
await page.evaluate(()=>navigate('plansHub'));await page.locator('[data-u-plan-kind=reserve]').click();assert.equal(await page.locator('[data-u-plan]').count(),1);assert.match(await page.locator('#unifiedPlanDetail').innerText(),/Fundo de emergência/);await page.locator('[data-u-plan-kind=all]').click();await page.locator('#simAmount').fill('250');await page.locator('#runSimulation').click();assert.match(await page.locator('#simulationResult').innerText(),/90 dias/);
await page.evaluate(()=>navigate('planner'));assert.equal(await page.locator('.planner-agenda-sidebar #agendaMonthServices').count(),1);await page.locator('#agendaManageServices').click();assert.equal(await page.locator('#unifiedSubscriptions').count(),1);await page.locator('[data-u-sub]').last().locator('td').nth(1).click();await page.screenshot({path:path.join(out,'subscriptions.png')});await page.locator('#subscriptionsManagerDialog .plan-manager-close').click();
await page.evaluate(()=>navigate('review'));assert.equal(await page.evaluate(()=>view),'dataHub');assert.equal(await page.locator('[data-u-task=imports]').getAttribute('aria-current'),'page');await page.locator('.u-import-inspector [data-import-category]').fill('Alimentação');await page.locator('[data-u-import=import2] .u-record-button').click();await page.locator('[data-u-import=import1] .u-record-button').click();assert.equal(await page.locator('.u-import-inspector [data-import-category]').inputValue(),'Alimentação');await page.screenshot({path:path.join(out,'imports.png'),fullPage:true});
await page.evaluate(()=>navigate('settings'));await page.locator('[data-u-settings=icons]').click();assert.equal(await page.locator('#unifiedSettings #providerIconSettings').count(),1);await page.screenshot({path:path.join(out,'icons.png'),fullPage:true});

// Drafts survive global renders, task switches and unrelated writes; only selected rows post.
await page.evaluate(()=>navigate('review'));
await page.locator('[data-u-import=import1] .u-record-button').click();
await page.locator('.u-import-inspector [data-import-beneficiary]').fill('Fornecedor confirmado');
await page.locator('[data-import-check=import2]').uncheck();
await page.evaluate(()=>render());
assert.equal(await page.locator('.u-import-inspector [data-import-category]').inputValue(),'Alimentação');
assert.equal(await page.locator('.u-import-inspector [data-import-beneficiary]').inputValue(),'Fornecedor confirmado');
assert.equal(await page.locator('[data-import-check=import2]').isChecked(),false);
await page.locator('[data-u-import=import1] .u-record-button').focus();await page.keyboard.press('ArrowDown');
assert.equal(await page.locator('[data-u-import=import2] .u-record-button').getAttribute('aria-pressed'),'true');
await page.locator('[data-u-import=import1] .u-record-button').click();
await page.evaluate(()=>{commit(()=>{data.profile='Perfil sintético';});navigate('settings');navigate('review');});
assert.equal(await page.locator('.u-import-inspector [data-import-category]').inputValue(),'Alimentação');
assert.equal(await page.locator('[data-import-check=import2]').isChecked(),false);
const balance=await page.evaluate(()=>F.balanceAt(data,data.accounts[0],F.today()));
await page.locator('#confirmImports').click();
assert.equal(await page.evaluate(()=>data.transactions.filter(t=>t.id==='import1').length),1);
assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.id==='import1').category),'Alimentação');
assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.id==='import1').beneficiary),'Fornecedor confirmado');
assert.equal(await page.evaluate(()=>F.balanceAt(data,data.accounts[0],F.today())),balance-4);
assert.equal(await page.evaluate(()=>data.pendingImports.length),1);
// Route aliases and all actual settings/data panes retain one owner each.
const states=[];
for(const theme of ['light','dark'])for(const width of [390,768,1024,1440,1920]){
 await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.body.dataset.theme=t,theme);
 for(const v of ['weeklyHub','plansHub','planner','wealth','wealthMoneyHub','dataHub','settings']){
  await page.evaluate(v=>navigate(v),v);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),v+' overflow '+width);
  assert.equal(await page.locator('#'+v).isVisible(),true);states.push({theme,width,view:v});
  if(theme==='dark'&&width===1440)await page.screenshot({path:path.join(out,v+'-dark.png'),fullPage:true});
 }
}
await page.setViewportSize({width:1440,height:1000});
await page.evaluate(()=>navigate('settings'));
for(const topic of ['general','categories','icons','backup']){
 await page.locator('[data-u-settings='+topic+']').click();assert.ok((await page.locator('.u-settings-content').innerText()).trim().length>10,topic+' missing settings');
}
await page.locator('#unifiedSettings [data-u-settings=backup]').click();assert.equal(await page.locator('#unifiedSettings #backupSettings').isVisible(),true);
await page.evaluate(()=>navigate('dataHub'));
for(const task of ['inbox','imports','quality','rules','documents']){
 await page.locator('[data-u-task='+task+']').click();assert.ok((await page.locator('#unifiedData .u-task-content').innerText()).trim().length>0,task+' missing controls');
}
await page.evaluate(()=>navigate('accounts'));assert.equal(await page.locator('[data-reconcile-account=bank]').isVisible(),true);
await page.evaluate(()=>navigate('documentsHub'));assert.equal(await page.evaluate(()=>view),'dataHub');assert.equal(await page.locator('[data-u-task=documents]').getAttribute('aria-current'),'page');
const duplicates=await page.evaluate(()=>{const count=new Map();for(const n of document.querySelectorAll('[id]'))count.set(n.id,(count.get(n.id)||0)+1);return [...count].filter(([,n])=>n>1);});assert.deepEqual(duplicates,[]);
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,states,draftPreservation:true,importOnce:true,unchangedNavigation:true,selectionRetained:true,uniqueOwners:true,errors},null,2));console.log('Unified 0.39.77: 70 estados, tarefas, seleções, importação única e rascunhos preservados: OK');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
