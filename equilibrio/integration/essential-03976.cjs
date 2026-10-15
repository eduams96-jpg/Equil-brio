'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,browserLaunchOptions}=require('./_browser.cjs');
(async()=>{
 const server=require('../serve.cjs').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(browserLaunchOptions()),errors=[],out=path.resolve(__dirname,'../validacao/essential-03976');fs.mkdirSync(out,{recursive:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(150);
 await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());data=F.empty();data.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:1000},{id:'saving',name:'Poupança',type:'Poupança',balance:500}];F.migrateLedgerCore(data);F.add(data,{id:'old',description:'Compra anterior',date:F.today(),account:'Banco',type:'expense',amount:10,category:'Alimentação / Carne / Fresca / Frango'});F.add(data,{id:'other',description:'Produto de casa',date:F.today(),account:'Banco',type:'expense',amount:5,category:'Casa / Limpeza / Roupa / Detergente'});render();navigate('wealthMoneyHub');});
 const before=await page.evaluate(()=>JSON.stringify(data));
 const row=page.locator('#wealthMoneyHub .desk-table tbody tr').filter({hasText:'Poupança'});await row.locator('td').nth(1).click();
 assert.equal(await page.locator('#wealthMoneyHub .desk-inspector-heading h3').innerText(),'Poupança');assert.match(await page.locator('#wealthMoneyHub .u-inspector').innerText(),/Poupança/);
 await page.evaluate(()=>render());assert.equal(await page.locator('#wealthMoneyHub .desk-inspector-heading h3').innerText(),'Poupança');assert.equal(await page.evaluate(()=>JSON.stringify(data)),before);
 for(const theme of ['light','dark'])for(const width of [390,768,1440,1920]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>{document.body.dataset.theme=t;navigate('transactions');transactionForm();},theme);
  assert.equal(await page.locator('#transactions .movements-hero-actions .area-tabs').count(),1);
  assert.ok(await page.locator('#transactions .movement-create-actions .interface-icon').count()>=2);
  assert.equal(await page.locator('#modal .transaction-note-disclosure').getAttribute('open'),null);
  assert.equal(await page.locator('#modal .transaction-depth-disclosure').getAttribute('open'),null);
  await page.locator('[data-movement-type=income]').click();assert.equal(await page.locator('#modal [name=type]').inputValue(),'income');
  await page.locator('[data-movement-type=expense]').click();assert.equal(await page.locator('#modal [name=type]').inputValue(),'expense');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Overflow '+width);
  if(width===1440&&theme==='dark')await page.screenshot({path:path.join(out,'novo-movimento.png')});
  await page.locator('#modal').evaluate(d=>d.close());
  if(width===1440&&theme==='dark')await page.screenshot({path:path.join(out,'movimentos.png'),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>transactionForm());await page.locator('#modal [name=description]').fill('Compra repartida');await page.locator('#modal [name=amount]').fill('12');await page.locator('#openTransactionSplitWorkbench').click();
 const first=page.locator('[data-transaction-split-row]').first();
 await first.locator('[data-tx-split-category]').fill('Alimentação');await first.locator('[data-tx-split-subcategory]').fill('Carne');await first.locator('[data-tx-split-detail]').fill('Fresca');await first.locator('[data-tx-split-subdetail]').fill('Frango');await first.locator('[data-tx-split-note]').fill('Nota preservada');
 await first.locator('[data-tx-split-category]').fill('Casa');
 for(const name of ['subcategory','detail','subdetail'])assert.equal(await first.locator('[data-tx-split-'+name+']').inputValue(),'');
 assert.equal(await first.locator('[data-tx-split-note]').inputValue(),'Nota preservada');
 await first.locator('[data-tx-split-subcategory]').fill('Limpeza');await first.locator('[data-tx-split-detail]').fill('Roupa');await first.locator('[data-tx-split-subdetail]').fill('Detergente');await first.locator('[data-tx-split-subcategory]').fill('Outra');
 assert.equal(await first.locator('[data-tx-split-detail]').inputValue(),'');assert.equal(await first.locator('[data-tx-split-subdetail]').inputValue(),'');
 await first.locator('[data-tx-split-subcategory]').fill('Limpeza');await first.locator('[data-tx-split-detail]').fill('Roupa');await first.locator('[data-tx-split-amount]').fill('7');
 const second=page.locator('[data-transaction-split-row]').nth(1);await second.locator('[data-tx-split-category]').fill('Alimentação');await second.locator('[data-tx-split-subcategory]').fill('Carne');await second.locator('[data-tx-split-amount]').fill('5');
 await page.locator('#doneTransactionSplit').click();assert.equal(Number(await page.locator('#modal [name=amount]').inputValue()),12);const balance=await page.evaluate(()=>data.accounts[0].balance);await page.locator('#modal button.primary[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 const saved=await page.evaluate(()=>data.transactions.find(t=>t.description==='Compra repartida'));assert.equal(saved.splits.length,2);assert.equal(saved.splits[0].category,'Casa / Limpeza / Roupa');assert.equal(saved.splits[0].note,'Nota preservada');assert.equal(await page.evaluate(()=>data.accounts[0].balance),balance-12);
 await page.locator('#faqButton').click();await page.locator('#faqDialog input').fill('barras');assert.equal(await page.locator('#faqDialog details:not([hidden])').count(),1);await page.locator('#faqDialog summary').filter({hasText:'barras'}).click();assert.match(await page.locator('#faqDialog details:not([hidden])').innerText(),/subcategoria/);await page.locator('#faqDialog button').click();
 await page.evaluate(()=>navigate('dashboard'));assert.ok(await page.locator('#periodYear').evaluate(e=>e.getBoundingClientRect().width)>=96);await page.evaluate(()=>navigate('settings'));assert.equal(await page.locator('#settings .help-list').count(),0);
 const cache=await page.evaluate(()=>{const d=F.empty(),stats=InterfaceUI.cacheStats();InterfaceUI.beginRender();let length,second;try{const first=CompleteFinance.categoryList(d);length=first.length;first.pop();second=CompleteFinance.categoryList(d).length;}finally{InterfaceUI.endRender();}d.transactions.push({id:'cache',date:F.today(),description:'Teste de invalidação',category:'Categoria nova após o ciclo',type:'expense',amount:1,account:'Banco'});return{length,second,changed:CompleteFinance.categoryList(d).some(c=>c.name==='Categoria nova após o ciclo'),hits:InterfaceUI.cacheStats().hits-stats.hits,active:InterfaceUI.cacheStats().active};});assert.equal(cache.second,cache.length);assert.equal(cache.changed,true);assert.ok(cache.hits>=1);assert.equal(cache.active,false);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,rowSelection:true,parentChangeClearsDescendants:true,notesPreserved:true,singleDebit:true,essentialForm:true,unifiedToolbar:true,faq:true,yearWidth:true,responsiveStates:8,errors},null,2));console.log('Essencial 0.39.76: seleção da linha, hierarquia, gravação dividida, FAQ e 8 estados responsivos: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
