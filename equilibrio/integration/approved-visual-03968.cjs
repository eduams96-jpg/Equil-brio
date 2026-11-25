'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,browserLaunchOptions}=require('./_browser.cjs');
(async()=>{
 const out=path.resolve(__dirname,'../validacao/approved-03968'),server=require('../serve.cjs').createServer();fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(browserLaunchOptions()),errors=[],states=[];
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(d=>d.close());
   const d=F.empty();d.accounts=[{id:'bank',name:'Conta principal',type:'Banco',balance:3450},{id:'saving',name:'Poupança',type:'Poupança',balance:5000}];F.migrateLedgerCore(d);
   d.accounts[0].reconciledOn=F.today();d.investments=[{id:'etf',name:'ETF global',type:'ETF',value:12530,cost:10000}];
   d.assets=[{id:'car',name:'Automóvel',kind:'Automóvel',valuations:[{date:'2026-01-10',value:18000}]}];
   d.wealthHistory=[{id:'h1',date:'2026-06-01',net:35000},{id:'h2',date:'2026-08-01',net:37000},{id:'h3',date:'2026-09-28',net:39000}];
   for(const [id,name,amount,day] of [['digi','DIGI',10,'12'],['spotify','Spotify',8,'22']])LifeFinance.subscription(d,{name,amount,frequency:'monthly',nextDate:F.today().slice(0,7)+'-'+day,status:'active',reminderDays:7,account:'Conta principal',category:'Subscrições'},undefined);
   d.pendingPayments=[{id:'electricity',date:F.today().slice(0,7)+'-15',type:'expense',amount:65,description:'Eletricidade',account:'Conta principal',category:'Casa'}];
   F.add(d,{id:'receipt',date:F.today(),type:'expense',amount:5,description:'Compra',beneficiary:'DIGI',category:'Casa',account:'Conta principal'});
   commit(()=>{data=d;},'Base de teste');month=F.today().slice(0,7);render();navigate('planner');document.querySelector('#notice').hidden=true;document.activeElement?.blur();
  });
  const ledger=await page.evaluate(()=>JSON.stringify({accounts:data.accounts,transactions:data.transactions,subscriptions:data.subscriptions,assets:data.assets,investments:data.investments}));
  assert.equal(await page.locator('#agendaSummary #agendaMonthFacts .approved-metric').count(),3);
  assert.equal(await page.locator('#agendaSummary #forecastBalance').count(),1);
  assert.equal(await page.locator('#agendaMonthServices .provider-digi').count(),1);
  assert.equal(await page.locator('#agendaMonthServices .provider-spotify').count(),1);
  await page.locator('#agendaMonthPicker').fill('2026-09');assert.equal(await page.evaluate(()=>month),'2026-09');await page.locator('[data-agenda-today]').click();
  await page.locator('[data-agenda-layout=calendar]').click();await page.locator('[data-agenda-day$="-15"]').click();assert.match(await page.locator('#agendaRows').innerText(),/Eletricidade/);
  if(require('./_version.cjs').revision()>=69){await page.locator('#agendaRows .agenda31-menu > summary').first().click();await page.locator('.agenda31-menu-portal [data-action=settle-pending]').click();}else await page.locator('#agendaRows .approved-day-action').click();assert.equal(await page.locator('#modal').evaluate(n=>n.open),true);await page.evaluate(()=>document.querySelector('#modal').close());
  await page.evaluate(()=>navigate('wealth'));assert.equal(await page.locator('#wealth .wl-tiles .ch-tile').count(),4);assert.equal(await page.locator('#wealthInventory').count(),0);
  await page.evaluate(()=>navigate('wealthMoneyHub'));await page.locator('[data-u-wealth="asset:car"] .u-record-button').click();assert.equal(await page.locator('#wealthMoneyHub').isVisible(),true);assert.equal(await page.locator('.u-inspector h3').innerText(),'Automóvel');
  for(const [width,height,scale] of [[390,844,1],[768,900,1],[1024,768,1],[1440,900,1],[1920,1080,1],[1440,900,1.25],[1440,900,1.5]]) {
   await page.setViewportSize({width:Math.floor(width/scale),height:Math.floor(height/scale)});
   for(const view of ['planner','plansHub','decisionsHub','wealth','wealthMoneyHub','wealthHoldingsHub']) {
    await page.evaluate(async v=>{navigate(v);window.scrollTo(0,0);document.activeElement?.blur();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},view);
    const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('#appTopbar button,#appTopbar select,#appTopbar input,.practical-quick>summary')].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {name:n.getAttribute('aria-label')||n.textContent.slice(0,20),left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),forecast:document.querySelector('#forecastItems')&&getComputedStyle(document.querySelector('#forecastItems')).display}));
    assert.ok(state.scrollWidth<=state.width+2,view+' overflow '+JSON.stringify(state));for(const c of state.controls)assert.ok(c.left>=-1&&c.right<=state.width+1&&c.top>=-1&&c.bottom<=Math.floor(height/scale),view+' '+JSON.stringify(c));states.push({view,width,height,scale,...state});
    if(scale===1&&[390,1440].includes(width)&&['planner','wealth'].includes(view))await page.screenshot({path:path.join(out,view+'-'+width+'.png'),fullPage:true});
   }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#topNavigationToggle').click();assert.equal(await page.locator('.top-primary-nav').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.top-primary-nav').isVisible(),false);
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>navigate('settings'));await page.locator('[data-u-settings=appearance]').click();await page.locator('[data-provider-add]').click();await page.locator('[name=providerName]').fill('DIGI');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d');x.fillStyle='#137561';x.fillRect(0,0,24,24);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#providerIconFile').setInputFiles({name:'fornecedor.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>document.querySelector('#providerIconFeedback').textContent==='Imagem pronta para guardar.');
  await page.locator('#modalForm button[type=submit]').click();assert.equal(await page.locator('#modal').evaluate(n=>n.open),false);assert.equal(await page.evaluate(()=>data.providerIcons.length),1);
  await page.evaluate(()=>navigate('planner'));assert.equal(await page.locator('#agendaMonthServices .provider-image img').count(),1);
  await page.evaluate(()=>navigate('transactions'));assert.equal(await page.locator('.movement-description-cell .provider-image img').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify({accounts:data.accounts,transactions:data.transactions,subscriptions:data.subscriptions,assets:data.assets,investments:data.investments})),ledger);
  const config=await page.evaluate(()=>JSON.stringify(data.providerIcons));await page.reload();await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());navigate('settings');});assert.equal(await page.evaluate(()=>JSON.stringify(data.providerIcons)),config);
  await page.locator('[data-u-settings=appearance]').click();await page.locator('[data-provider-edit][data-provider-name=DIGI]').click();await page.locator('#providerIconFile').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.waitForFunction(()=>document.querySelector('#providerIconFeedback').textContent.includes('Escolhe uma imagem'));await page.locator('#modalForm button[type=submit]').click();assert.equal(await page.locator('#modal').evaluate(n=>n.open),true);assert.equal(await page.evaluate(()=>JSON.stringify(data.providerIcons)),config);
  await page.locator('[name=initialOnly]').check();await page.locator('#modalForm button[type=submit]').click();assert.equal(await page.evaluate(()=>ProviderIcons.resolve('DIGI',data.providerIcons).kind),'initial');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,states,calendarNavigation:true,wealthRoutes:true,providerUploadReload:true,rejectedSvg:true,initialFallback:true,unchangedFinancialData:true,errors},null,2));console.log('Visuais aprovados: 42 estados, ícones locais, recarga e dados financeiros preservados: OK');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

