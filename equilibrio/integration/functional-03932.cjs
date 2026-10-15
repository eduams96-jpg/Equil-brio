const assert=require('node:assert/strict');
const fs=require('node:fs');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
(async()=>{
 const browser=await chromium.launch(browserLaunchOptions());
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}), errors=[], checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.EQUILIBRIO_TEST_URL||'http://127.0.0.1:4173'));
 await page.evaluate(()=>{
  data=F.empty(); data.accounts=[{id:'bank',name:'Banco',type:'Conta',balance:1500},{id:'save',name:'Poupança',type:'Conta',balance:100}];
  month=F.today().slice(0,7); const date=month+'-01';
  for(const [i,color] of ['blue','green','purple','orange','red'].entries()) F.add(data,{id:'t'+i,description:'Movimento '+color,amount:10,type:'expense',date,account:'Banco',category:'Casa',note:'Nota '+color,noteColor:color});
  data.recurring=[{id:'digi',description:'DIGI · Internet e telemóveis',type:'expense',amount:30,account:'Banco',category:'Contas / Internet',start:date,day:1,active:true,frequency:'monthly'}];
  for(let i=0;i<7;i++) data.pendingPayments.push({id:'p'+i,description:['Eletricidade','Água','Seguro da casa','Ginásio','Condomínio','Consulta','Transportes'][i],type:'expense',amount:15+i*7,account:'Banco',category:['Contas / Eletricidade','Contas / Água','Seguros / Casa','Saúde','Casa','Saúde','Transportes'][i],date:month+'-'+String(2+i*4).padStart(2,'0')});
  data.pendingPayments.push({id:'future',description:'Despesa de outro mês',type:'expense',amount:9999,account:'Banco',category:'Outros',date:FinancePlus.dayAdd(F.today(),60)});
  data=F.normalize(data); render(); navigate('planner');
 });
 await page.screenshot({path:'integration/agenda-desktop.png',fullPage:true});
 assert.equal(await page.locator('#planner').evaluate(e=>getComputedStyle(e).display),'grid');
 assert.equal(await page.locator('#forecastBalance').innerText(),await page.evaluate(()=>eur(1550-30-252)));checks.push('Monthly summary excludes other months');
 const boxes=await page.evaluate(()=>['.planner-commitments-panel','.planner-agenda-sidebar','#pendingEditor'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,b:r.bottom}}));
 assert.ok(boxes[0].x<boxes[1].x && boxes[0].w>boxes[1].w);assert.ok(boxes[2].y>=boxes[0].b);checks.push('Desktop layout left/right and monthly section below');
 for(const id of ['dashboard','transactions','accounts','subscriptions','cashflow','goals','settings']){
  await page.evaluate(id=>navigate(id),id);assert.equal(await page.locator('#planner').evaluate(e=>getComputedStyle(e).display),'none',id);
 } checks.push('Agenda hidden across seven other pages');
 await page.evaluate(()=>navigate('transactions'));
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
  const colors=await page.locator('.movement-description-note').evaluateAll(els=>els.map(e=>getComputedStyle(e).color));assert.equal(new Set(colors).size,5);
 } checks.push('Five distinct note colors in light and dark');
 await page.evaluate(()=>transactionForm('t0'));
 assert.equal(await page.locator('[name=noteColor]').inputValue(),'blue');
 await page.locator('#modalContent button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.id==='t0').noteColor),'blue');checks.push('Editing preserves explicit note color');
 await page.evaluate(()=>actions.refund('t0'));
 assert.equal(await page.locator('#modal [name=date]').inputValue(),await page.evaluate(()=>month+'-01'));
 await page.locator('#modal [name=amount]').fill('3');await page.locator('#modalContent button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.refundOf==='t0').date),await page.evaluate(()=>month+'-01'));checks.push('Refund defaults to original date and saves');
 await page.evaluate(()=>{navigate('planner');FeatureUI.recurring('digi')});
 await page.locator('#recurringSplitEditor summary').click();await page.locator('[name=useCategorySplits]').check();
 await page.locator('[data-split-category]').nth(0).fill('Contas / Internet');await page.locator('[data-split-amount]').nth(0).fill('20');
 await page.locator('[data-split-category]').nth(1).fill('Contas / Telemóveis');await page.locator('[data-split-amount]').nth(1).fill('10');
 await page.locator('#modalContent button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal(await page.evaluate(()=>data.recurring[0].splits.length),2);
 const before=await page.evaluate(()=>data.accounts[0].balance);
 await page.evaluate(()=>settle('recurring','digi~'+month+'-01'));
 await page.screenshot({path:'integration/recorrencia-dividida.png',fullPage:true});
 await page.locator('[data-split-amount]').nth(0).fill('21');await page.locator('#modalContent button[type=submit]').click();
 assert.ok(await page.locator('#formError').isVisible());assert.equal(await page.evaluate(()=>data.accounts[0].balance),before);
 await page.locator('[data-split-amount]').nth(0).fill('20');await page.locator('#modalContent button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal(await page.evaluate(()=>data.accounts[0].balance),before-30);
 const paid=await page.evaluate(()=>data.transactions.find(t=>t.recurringRuleId==='digi'));assert.equal(paid.splits.length,2);assert.equal(paid.recurringDate,await page.evaluate(()=>month+'-01'));
 await page.evaluate(()=>FeatureUI.recurring('digi'));
 await page.locator('[data-split-amount]').nth(0).fill('18');await page.locator('[data-split-amount]').nth(1).fill('12');
 await page.locator('#modalContent button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.recurringRuleId==='digi').splits[0].amount),20);
 checks.push('Series split saved, invalid sum blocked, payment debited once, historical split preserved');
 await page.evaluate(()=>{localStorage.setItem(key,JSON.stringify(data));navigate('planner')});
 for(const width of [1280,1024,768,390]){
  await page.setViewportSize({width,height:1000});
  const overflow=await page.locator('#planner').evaluate(e=>e.scrollWidth>e.clientWidth+2);
  assert.equal(overflow,false,'Agenda overflow at '+width);
  await page.screenshot({path:`integration/agenda-${width}.png`,fullPage:true});
 }checks.push('Agenda responsive at 1280, 1024, 768, 390 px');
 await page.reload();assert.equal(await page.evaluate(()=>data.recurring.find(r=>r.id==='digi').splits[0].amount),18);
 checks.push('Saved splits survive reload');assert.deepEqual(errors,[]);
 fs.writeFileSync('integration/functional-results.json',JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
