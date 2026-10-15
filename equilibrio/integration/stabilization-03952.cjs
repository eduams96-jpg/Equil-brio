'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,browserLaunchOptions}=require('./_browser.cjs');
const output=path.resolve(__dirname,'../validacao/performance-'+require('../package.json').version.replaceAll('.',''));
async function measure(browser,root){
 const {createServer}=require(path.join(root,'serve.cjs'));const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  const result=await page.evaluate(()=>{
   const d=F.empty();d.ledgerCoreVersion=1;d.coreMigration={version:'0.39.50',savingsCredit051:{corrections:[]}};
   d.accounts=Array.from({length:200},(_,i)=>({id:'a'+i,name:'Conta '+i,type:'Banco',balance:1000,openingBalance:1000}));
   d.transactions=Array.from({length:10000},(_,i)=>({id:'t'+i,date:F.today(),type:i%2?'income':'expense',account:'Conta '+(i%200),description:'Movimento '+i,category:'Casa',amount:(i%90+1)/100}));
   const times=[];for(let i=0;i<7;i++){const at=performance.now();F.refreshBalances(d);times.push(performance.now()-at);}
   d.accounts=d.accounts.slice(0,5);d.transactions=d.transactions.filter(t=>d.accounts.some(a=>a.name===t.account));
   d.transactions=Array.from({length:5000},(_,i)=>({...d.transactions[i%d.transactions.length],id:'big-'+i}));F.refreshBalances(d);data=F.normalize(d);render();navigate('transactions');
   const renders=[];for(let i=0;i<3;i++){const at=performance.now();render();renders.push(performance.now()-at);}
   return {core:{accounts:200,movements:10000,times,medianMs:times.slice().sort((a,b)=>a-b)[3]},ui:{movements:5000,renders,medianMs:renders.slice().sort((a,b)=>a-b)[1],visibleRows:document.querySelectorAll('.movement-table-row').length}};
  });
  assert.equal(result.ui.visibleRows,50);assert.ok(result.ui.medianMs<10000,'Render excede 10 segundos');
  await page.locator('[data-action="tx-page"][data-id="2"]').click();const first=await page.locator('.movement-table-row').first().getAttribute('data-transaction-id');
  await page.locator(`.movement-table-row[data-transaction-id="${first}"] .movement-inline-actions [data-action="plan-receipt"]`).click();
  assert.equal(await page.locator('.tx-page-number[aria-current="page"]').innerText(),'2');
  await page.locator('#searchTransactions').fill('Movimento 1');await page.waitForTimeout(150);assert.ok(await page.locator('.movement-table-row').count()<=50);
  await page.evaluate(()=>{data=F.normalize(F.migrateLedgerCore(demoData()));render();navigate('dashboard');document.querySelector('#notice').hidden=true;window.scrollTo(0,0);});
  await page.screenshot({path:path.join(output,root.endsWith('equilibrio')?'after.png':'before.png'),fullPage:true,animations:'disabled',mask:[page.locator('#appBuildBadge')]});
  assert.deepEqual(errors,[]);return result;
 }finally{await page.close();await new Promise(r=>server.close(r));}
}
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch(browserLaunchOptions());
 try{
  const baseline=path.resolve(process.argv[2]||path.join(__dirname,'../../historico/baselines/baseline-0.39.51'));
  const before=await measure(browser,baseline),after=await measure(browser,path.resolve(__dirname,'..'));
  const result={before,after,coreSpeedup:before.core.medianMs/after.core.medianMs};
  fs.writeFileSync(path.join(output,'performance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(output,'before.png'))).digest('hex'),require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(output,'after.png'))).digest('hex'),'O Resumo deve conservar o aspeto da baseline');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
