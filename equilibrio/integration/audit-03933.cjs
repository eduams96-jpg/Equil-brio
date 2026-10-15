const fs=require('node:fs');
const assert=require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
(async()=>{
 const browser=await chromium.launch(browserLaunchOptions());
 const results=[];
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto((process.env.EQUILIBRIO_TEST_URL||'http://127.0.0.1:4173'));
  await page.evaluate(()=>{
    data=F.empty();data.accounts=[{id:'b',name:'Banco',type:'Conta',balance:1920},{id:'c',name:'Carteira',type:'Dinheiro',balance:80}];
    const today=F.today(),month=today.slice(0,7);window.auditMonth=month;window.auditDate=today;
    const expense=[['Supermercado',48,'Alimentação / Supermercado'],['Internet e telemóveis',34,'Contas / Comunicações'],['Transportes',22,'Transportes'],['Saúde',18,'Saúde'],['Restaurante',27,'Lazer']];
    for(let i=0;i<25;i++){const [description,amount,category]=expense[i%expense.length];F.add(data,{id:'audit-'+i,description,amount:amount+i/10,type:'expense',date:month+'-'+String(i%25+1).padStart(2,'0'),account:'Banco',category,note:i%3===0?'Nota de teste '+i:'',beneficiary:'Loja de exemplo'});}
    F.add(data,{id:'salary',description:'Ordenado',amount:2350,type:'income',date:today,account:'Banco',category:'Salário'});
    data.recurring=[{id:'bill',description:'Serviço mensal',type:'expense',amount:34,account:'Banco',category:'Contas / Comunicações',start:month+'-01',day:1,active:true,frequency:'monthly'}];
    data.pendingPayments=[{id:'rent',description:'Renda',amount:650,type:'expense',category:'Casa / Renda',account:'Banco',date:today}];
    data=F.normalize(data);render();
  });
  const views=['dashboard','dataHub','transactions','planner','cashflow','goals','budgets','planningPlus','wealth','accounts','debts','casaHome','casaPurchases','casaShopping','casaProducts','casaStock','casaStores','casaAnalytics','casaRecipes','casaMeals','casaPrices','casaImport','insights','reports','settings'];
  for(const width of [1600,768,390]){
    await page.setViewportSize({width,height:1000});
    for(const id of views){
      try{await page.evaluate(id=>navigate(id),id);await page.waitForTimeout(50);
      const state=await page.evaluate(id=>{const view=document.getElementById(id),r=view?.getBoundingClientRect();const candidates=[...view?.querySelectorAll('*')||[]].filter(el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();if(!b.width||s.visibility==='hidden'||s.display==='none')return false;let a=el.parentElement;while(a&&a!==view){const o=getComputedStyle(a);if(['auto','scroll'].includes(o.overflowX)&&a.scrollWidth>a.clientWidth+2)return false;a=a.parentElement;}return b.right>innerWidth+8 || b.left<-8;}).slice(0,5).map(el=>({tag:el.tagName,cls:el.className?.toString().slice(0,80),parent:el.parentElement?.className?.toString().slice(0,80),grandparent:el.parentElement?.parentElement?.className?.toString().slice(0,80),text:el.textContent?.trim().slice(0,30),right:Math.round(el.getBoundingClientRect().right)}));return {id,visible:getComputedStyle(view).display!=='none',docScroll:document.documentElement.scrollWidth,width:innerWidth,viewScroll:view.scrollWidth,viewWidth:view.clientWidth,overflow:candidates,viewX:r?.x};},id);
      results.push(state);
      if(['dashboard','transactions','planner','cashflow','casaHome','insights','settings'].includes(id))await page.screenshot({path:`integration/audit-${id}-${width}.png`,fullPage:true});
      }catch(e){results.push({id,width,error:e.message})}
    }
  }
  assert.deepEqual(errors,[],'Erros de execução no navegador');
  assert.equal(results.length,75,'Cobertura de 25 áreas em três larguras');
  assert.deepEqual(results.filter(r=>r.docScroll>r.width+2||r.overflow?.length||r.error),[],'Conteúdo fora do ecrã');
  await page.evaluate(()=>navigate('transactions'));
  assert.notEqual(await page.locator('.movement-table-row').first().evaluate(e=>getComputedStyle(e).gridTemplateAreas),'none');
  const actionMenu=page.locator('.movement-mobile-actions').first();
  await actionMenu.locator('summary').click();
  assert.equal(await actionMenu.evaluate(e=>e.open),true);
  assert.ok(await actionMenu.locator('button').count()>=4);
  await actionMenu.locator('[data-action="edit-tx"]').click();
  assert.equal(await page.locator('#modal').evaluate(e=>e.open),true);
  await page.locator('#modal').evaluate(e=>e.close());
  fs.writeFileSync('integration/audit-03933.json',JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({errors,overflow:results.filter(r=>r.docScroll>r.width+2||r.overflow?.length||r.error)},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
