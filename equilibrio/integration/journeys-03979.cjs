'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,browserLaunchOptions}=require('./_browser.cjs');
(async()=>{
 const appRoot=process.env.APP_TEST_ROOT||path.resolve(__dirname,'..');
 const server=require(path.join(appRoot,'serve.cjs')).createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(browserLaunchOptions()),errors=[],out=path.resolve(__dirname,'../validacao/journeys-03979');fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(200);
  await page.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(d=>d.close());data=F.empty();
   data.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:2000},{id:'meal',name:'Cartão refeição',type:'Cartão',balance:500}];F.migrateLedgerCore(data);
   data.goals=[{id:'g1',name:'Férias',target:200,current:10},{id:'g2',name:'Curso especial',target:1000,current:30}];
   data.reserves=[{id:'r1',name:'Reserva especial',target:500,saved:20,months:12}];data.budgets=[{id:'b1',category:'Casa',limit:100}];
   data.assets=[{id:'a1',name:'Viatura especial',kind:'Viatura',valuations:[{date:F.today(),value:1000}]}];data.investments=[{id:'i1',name:'Fundo especial',units:1,cost:100,value:105}];
   data.debts=[{id:'d1',name:'Crédito especial',balance:100,payment:10}];
   LifeFinance.subscription(data,{name:'Serviço especial',amount:5,frequency:'monthly',nextDate:F.today(),status:'cancelled',reminderDays:7,account:'Banco',category:'Subscrições'});
   F.add(data,{id:'old',description:'Compra antiga especial',category:'Casa',type:'expense',amount:10,account:'Banco',date:'2025-01-01'});
   F.add(data,{id:'recent',description:'Despesa recente',category:'Outros',type:'expense',amount:1,account:'Banco',date:F.today()});
   data.transactions.find(t=>t.id==='old').attachment={name:'fatura-antiga.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQ='};
   data.transactions.find(t=>t.id==='old').receiptText='Artigo original sabonete especial';
   Object.assign(data.transactions.find(t=>t.id==='old'),{source:'Casa integrado',sourceId:'purchase'});
   data.casa={version:1,purchases:[{id:'purchase',store:'Loja especial',date:'2025-01-01',total:10,transactionId:'old',items:[{name:'Sabonete',total:10,category:'Casa'}]}],shopping:[],catalog:[],stores:[],stock:[]};
   month=F.today().slice(0,7);render();navigate('transactions');$('#searchTransactions').value='sem resultados';
  });
  const before=await page.evaluate(()=>JSON.stringify(data));const monthBefore=await page.evaluate(()=>month);
  const search=async(query,kind)=>{
   await page.locator('#inlineGlobalQuery').fill(query);
   const results=page.locator('#inlineGlobalResults .search-result').filter({hasText:kind});await results.first().waitFor({state:'visible',timeout:5000});assert.ok(await results.count(),kind+' missing');await results.first().click();
  };
  await search('Cartão refeição','Conta');assert.match(await page.locator('.u-inspector').innerText(),/Cartão refeição/);
  await page.locator('#unifiedInventorySearch').fill('nenhum');await search('Viatura especial','Bem');assert.match(await page.locator('.u-inspector').innerText(),/Viatura especial/);
  await search('Fundo especial','Investimento');assert.match(await page.locator('.u-inspector').innerText(),/Fundo especial/);
  await search('Crédito especial','Crédito');assert.match(await page.locator('.u-inspector').innerText(),/Crédito especial/);
  await search('Curso especial','Objetivo');assert.match(await page.locator('#unifiedPlanDetail').innerText(),/Curso especial/);
  await search('Reserva especial','Reserva');assert.match(await page.locator('#unifiedPlanDetail').innerText(),/Reserva especial/);
  await search('Casa','Orçamento');assert.match(await page.locator('#unifiedPlanDetail').innerText(),/Casa/);
  await search('Serviço especial','Subscrição');assert.match(await page.locator('.u-sub-detail').innerText(),/Serviço especial/);await page.locator('#subscriptionsManagerDialog .plan-manager-close').click();
  await search('sabonete especial','Comprovativo');assert.equal(await page.evaluate(()=>view),'dataHub');assert.equal(await page.locator('[data-document-select=old]').getAttribute('aria-pressed'),'true');
  await page.locator('#documentsHub [data-action=life-doc-movement][data-id=old]:visible').click();assert.match(await page.locator('#modalContent').innerText(),/Compra antiga especial/);await page.locator('#modal').evaluate(d=>d.close());
  await search('Loja especial','Compra Casa');await page.locator('#casaOpenMovement').click();await page.screenshot({path:path.join(out,'exact-movement.png'),fullPage:true});assert.match(await page.locator('#modalContent').innerText(),/Compra antiga especial/);await page.locator('#modal').evaluate(d=>d.close());
  await search('Compra antiga especial','Movimento');assert.match(await page.locator('#modalContent').innerText(),/Compra antiga especial/);await page.locator('#modal').evaluate(d=>d.close());
  for(const theme of ['light','dark'])for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.body.dataset.theme=t,theme);
   await search('Casa','Orçamento');assert.match(await page.locator('#unifiedPlanDetail').innerText(),/Casa/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Search journey overflow '+width);
  }
  assert.equal(await page.evaluate(()=>month),monthBefore,'Opening exact movements changed period');assert.equal(await page.locator('#searchTransactions').inputValue(),'sem resultados','Opening exact movements lost search');
  assert.equal(await page.evaluate(()=>JSON.stringify(data)),before,'Read-only journeys changed data');
  await page.evaluate(()=>{const original=UnifiedWorkspaceUI.inventoryRecords().find(r=>r.kind==='account');if(UnifiedWorkspaceUI.openRecord('Conta','deleted'))throw Error('Deleted record accepted');if(!original)throw Error('Fixture missing');});
  await page.evaluate(()=>{actions['life-doc-movement']('deleted');LifeUI.openDocument('deleted');});assert.equal(await page.locator('#modal').evaluate(d=>d.open),false);
  await page.screenshot({path:path.join(out,'selected-budget.png'),fullPage:true});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,exactRecords:true,filteredMovement:true,archivedSubscription:true,receiptTextSearch:true,deletedGuard:true,readOnly:true,errors},null,2));console.log('Journeys 0.39.79: pesquisa, seleções exatas, Casa, comprovativos e consultas sem alterações: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
