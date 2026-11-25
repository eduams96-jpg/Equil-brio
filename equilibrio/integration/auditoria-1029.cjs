
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium,browserLaunchOptions}=require('./_browser.cjs');

const routes=[
 'dashboard','transactions','planner','plansHub','decisionsHub','weeklyHub','reports',
 'wealth','wealthMoneyHub','accounts','debts','assetsHub','investmentsHub','wealthHoldingsHub',
 'dataHub','review','documentsHub','personalRules','qualityHub','noticesHub','settings',
 'casaHome','casaShopping','casaPurchases','casaStock','casaAnalytics','casaConsumos',
 'casaProducts','casaStores','casaPrices','casaMeals','casaRecipes',
 'casaEquipment','casaVehicles','casaHousing','casaGifts',
];
const repetitions=Number(process.env.EQUILIBRIO_AUDIT_REPETITIONS||0);
assert.ok(Number.isInteger(repetitions)&&repetitions>=0&&repetitions<=30,'Número de repetições inválido');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

async function exercise(browser,directory,out,label){
 const server=require(path.join(directory,'serve.cjs')).createServer();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],failedResources=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:')&&r.status()>=400)failedResources.push(new URL(r.url()).pathname);});
 try{
  const start=performance.now();
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>typeof window.UnifiedWorkspaceUI==='object');
  if(await page.locator('#welcomeContinue').isVisible()){
   await page.locator('[name=welcomeSpace]').first().check();
   await page.locator('#welcomeContinue').click();
  }
  const ready=Math.round(performance.now()-start);
  await page.evaluate(()=>{
   data=demoData();
   F.migrateLedgerCore(data);
   for(let i=0;i<2500;i++){
    const account=data.accounts[i%data.accounts.length].name;
    const date=F.today().slice(0,7)+'-'+String(i%15+1).padStart(2,'0');
    data.transactions.push({id:'audit-tx-'+i,date,type:i%2?'expense':'income',amount:1+(i%40),account,
     description:'Movimento de auditoria '+i,category:i%3?'Casa / Compras':'Transporte'});
   }
   F.refreshBalances(data);
   if(data.goals.length)PlanningFinance.saveProtection(data,'goal',data.goals[0].id,String(data.accounts[0].id),'');
   render();
  });
  const result={ready,routes:{},routeSamples:{},issues:[],resources:[],errors:[],growth:[]};
  for(const width of [1440,768,390]){
   await page.setViewportSize({width,height:900});
   const samples=await page.evaluate(async({routes,width,repetitions})=>{
    const results={},issues=[];
    for(let cycle=0;cycle<(repetitions?repetitions+1:width===1440?4:1);cycle++){
     for(const route of routes){
      const start=performance.now();
      try{navigate(route);}catch(error){issues.push({route,kind:'navigation',message:error.message});continue;}
      const elapsed=performance.now()-start;
      const host=document.getElementById(view);
      if(!host||!host.classList.contains('active')||!host.getClientRects().length)issues.push({route,kind:'view'});
      const excess=document.documentElement.scrollWidth-innerWidth;
      if(excess>2)issues.push({route,kind:'overflow',excess});
      if(cycle||!repetitions&&width!==1440)(results[route]??=[]).push(elapsed);
      await new Promise(r=>requestAnimationFrame(r));
     }
    }
    return {results,issues};
   },{routes,width,repetitions});
   result.routeSamples[width]=samples.results;
   result.routes[width]=Object.fromEntries(Object.entries(samples.results).map(([route,times])=>[route,median(times)]));
   for(const issue of samples.issues){
    if(!result.issues.some(row=>row.width===width&&row.route===issue.route&&row.kind===issue.kind))result.issues.push({width,...issue});
   }
  }
  // Observe attached DOM across repeated route changes. This is not a heap-retention test.
  const cdp=await page.context().newCDPSession(page);
  result.heap=[];
  for(let cycle=0;cycle<4;cycle++){
   const count=await page.evaluate(async routes=>{
    for(const route of routes)try{navigate(route);}catch{}
    navigate('dashboard');
    await new Promise(r=>requestAnimationFrame(r));
    return document.querySelectorAll('*').length;
   },routes);
   result.growth.push(count);
   await cdp.send('HeapProfiler.collectGarbage');
   result.heap.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
  }
  await cdp.detach();
  if(label==='updated'){
   await page.setViewportSize({width:1440,height:900});
   await page.evaluate(()=>{navigate('planner');navigate('plansHub');});
   await page.locator('.plan-navigation [data-plan-pane=funding]').click();
   await page.screenshot({path:path.join(out,'planos-cobertura.png'),fullPage:false});
   await page.locator('.plan-navigation [data-plan-pane=records]').click();
   const first=page.locator('.plan-record summary').first();
   if(await first.count())await first.click();
   await page.screenshot({path:path.join(out,'planos-lista.png'),fullPage:false});
   await page.setViewportSize({width:390,height:844});
   await page.locator('.plan-navigation [data-plan-pane=funding]').click();
   await page.screenshot({path:path.join(out,'planos-telemovel.png'),fullPage:false});
   const buttons=await page.locator('.plan-navigation [data-plan-pane]').all();
   const action=await page.locator('.plan-masthead>.u-add-menu').boundingBox();
   for(const button of buttons){
    const tab=await button.boundingBox();
    assert.ok(tab.y>=action.y+action.height-1,'Menu de criação e navegação sobrepostos em 390 px');
   }
   await page.setViewportSize({width:1440,height:900});
   await page.evaluate(()=>{data.presentation={density:'comfortable',hiddenMetrics:[],...data.presentation,theme:'dark'};render();});
   await page.screenshot({path:path.join(out,'planos-escuro.png'),fullPage:false});
  }
  result.errors=[...new Set(errors)];
  result.resources=[...new Set(failedResources)];
  return result;
 }finally{
  await page.close();
  await new Promise(r=>server.close(r));
 }
}

function accountingBenchmark(base,current){
 const make=root=>({F:require(path.join(root,'finance.js')),P:require(path.join(root,'features-model.js'))});
 const input={accounts:[{id:'bank',name:'Banco',openingBalance:1500}],transactions:Array.from({length:20000},(_,i)=>({
  id:'t'+i,date:i%3?'2026-10-01':'2026-12-01',account:'Banco',type:i%2?'expense':'income',amount:i%7+1,
 })),closedMonths:[]};
 const budgets=Array.from({length:120},(_,i)=>({category:'Despesas '+i,limit:100,carryStart:'2010-01',versions:[{month:'2010-01',limit:100,carry:false},{month:'2022-01',limit:125,carry:false}]}));
 const candidates=Array.from({length:1800},(_,i)=>({id:'ambiguous'+i,date:'2026-11-10',account:i%2?'Banco':'Carteira',
  amount:20,type:i%2?'expense':'income'}));
 candidates.push({id:'unique-out',date:'2026-11-06',account:'Banco',amount:125,type:'expense'},
  {id:'unique-in',date:'2026-11-09',account:'Poupança',amount:125,type:'income'});
 const run=root=>{
  const {F,P}=make(root),times=[],budgetTimes=[],transferTimes=[];
  let balance,values,pairs;
  for(let i=0;i<8;i++){
   let start=performance.now();
   F.renderCache.begin();
   try{for(let j=0;j<30;j++)balance=F.balanceAt(input,input.accounts[0],'2026-11-18');}
   finally{F.renderCache.end();}
   if(i>1)times.push(performance.now()-start);
   start=performance.now();
   values=budgets.map(b=>P.budgetAt(input,b,'2026-11'));
   if(i>1)budgetTimes.push(performance.now()-start);
   start=performance.now();
   pairs=P.transferCandidates(candidates);
   if(i>1)transferTimes.push(performance.now()-start);
  }
  return {balance,values,pairs,balancesMs:median(times),budgetsMs:median(budgetTimes),transfersMs:median(transferTimes)};
 };
 const original=run(base),updated=run(current);
 assert.equal(updated.balance,original.balance);
 assert.deepEqual(updated.values,original.values);
 assert.deepEqual(updated.pairs,original.pairs);
 assert.equal(updated.pairs.length,1);
 return {balances:{originalMs:original.balancesMs,updatedMs:updated.balancesMs,transactions:20000,repeats:30},
  budgets:{originalMs:original.budgetsMs,updatedMs:updated.budgetsMs,records:budgets.length},
  transfers:{originalMs:original.transfersMs,updatedMs:updated.transfersMs,records:candidates.length}};
}

async function main(){
 const current=path.resolve(__dirname,'..');
 const base=process.argv[2]||fs.readFileSync(path.join(os.tmpdir(),'equilibrio-auditoria-baseline.txt'),'utf8').trim();
 const out=path.resolve(process.argv[3]||path.join(os.tmpdir(),'equilibrio-auditoria-1029'));
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(browserLaunchOptions());
 try{
  const original=await exercise(browser,base,out,'original');
  const updated=await exercise(browser,current,out,'updated');
  const accounting=accountingBenchmark(base,current);
  const report={routes:routes.length,original,updated,accounting};
  fs.writeFileSync(path.join(out,'auditoria-navegacao.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({routes:routes.length,baseline:original.issues,current:updated.issues,errors:updated.errors,resources:updated.resources,accounting,growth:updated.growth,output:out}));
  assert.deepEqual(updated.errors,[]);
  assert.deepEqual(updated.resources,[]);
  assert.deepEqual(updated.issues.filter(i=>i.kind==='navigation'||i.kind==='view'),[]);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

