'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,browserLaunchOptions}=require('./_browser.cjs');
const root=path.resolve(__dirname,'..'),baseline=path.resolve(process.env.FRONTEND_BASELINE||path.join(root,'../historico/baselines/baseline-0.39.52'));
const output=path.join(root,'validacao/frontend-'+require('../package.json').version.replaceAll('.',''));fs.mkdirSync(output,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const servers=[require(path.join(baseline,'serve.cjs')).createServer(),require('../serve.cjs').createServer()];
 await Promise.all(servers.map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));const browser=await chromium.launch(browserLaunchOptions());const results=[],errors=[];
 try{
 const pages=await Promise.all(servers.map(async s=>{const p=await browser.newPage({viewport:{width:1366,height:768}});p.on('pageerror',e=>errors.push(e.message));await p.route('https://fonts.googleapis.com/**',r=>r.abort());await p.goto(`http://127.0.0.1:${s.address().port}`);return p;}));
 const ledger=await pages[0].evaluate(()=>JSON.parse(JSON.stringify(data)));
 for(const p of pages){await p.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'});await p.evaluate(d=>{document.querySelectorAll('dialog[open]').forEach(n=>n.close());data=F.migrateLedgerCore(d);render();document.querySelector('#appBuildBadge').textContent='Comparação visual';},ledger);}
 const views=['dashboard','transactions','planner','weeklyHub','decisionsHub','subscriptionsHub','wealth','insights','dataHub','casaHome','casaPurchases','casaProducts','casaStores','casaStock','casaRecipes','casaMeals','casaPrices','casaAnalytics','casaImport','casaShopping'];
 for(const size of [[1366,768],[910,512],[390,844]])for(const view of views){
  const snapshots=[];
  for(const p of pages){await p.setViewportSize({width:size[0],height:size[1]});await p.evaluate(v=>{if(!document.getElementById(v))throw Error('Página inexistente: '+v);navigate(v);document.querySelector('#notice').hidden=true;document.querySelector('#appBuildBadge').textContent='Comparação visual';window.scrollTo(0,0);},view);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(60);
   snapshots.push(await p.evaluate(()=>{const props=['display','position','overflow','overflow-x','overflow-y','color','background-color','font-family','font-size','font-weight','line-height','padding','margin','border','border-radius','grid-template-columns','gap','align-items','justify-content','width','height','min-width','max-width','white-space','visibility'];return [...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&e.tagName!=='SCRIPT'&&e.id!=='appBuildBadge').map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return [e.tagName,e.id,e.className?.baseVal??e.className,...['x','y','width','height'].map(k=>Math.round(r[k]*100)/100),...props.map(k=>s.getPropertyValue(k))];});}));
  }
  const same=JSON.stringify(snapshots[0])===JSON.stringify(snapshots[1]);results.push({view,width:size[0],height:size[1],same});
  if(!same){fs.writeFileSync(path.join(output,view+'-'+size[0]+'.json'),JSON.stringify(snapshots));for(let i=0;i<2;i++)await pages[i].screenshot({path:path.join(output,view+'-'+size[0]+'-'+i+'.png'),fullPage:true});throw Error('Diferença visual: '+view+' '+size[0]);}
  if(size[0]===1366&&['dashboard','planner','casaShopping'].includes(view)){const buffers=await Promise.all(pages.map(p=>p.screenshot({animations:'disabled',mask:[p.locator('#appBuildBadge')]})));assert.equal(hash(buffers[0]),hash(buffers[1]),'Pixels diferentes: '+view);fs.writeFileSync(path.join(output,view+'.png'),buffers[1]);}
 }
 assert.deepEqual(errors,[]);console.log('60 comparações de geometria/estilos e 3 capturas idênticas: OK');
 }finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({version:require('../package.json').version,results,errors,passed:results.length===60&&results.every(r=>r.same)&&!errors.length},null,2));await browser.close();servers.forEach(s=>s.close());}
})().catch(e=>{console.error(e);process.exitCode=1;});
