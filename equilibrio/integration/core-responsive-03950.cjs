'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,browserLaunchOptions}=require('./_browser.cjs');
const {createServer}=require('../serve.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(browserLaunchOptions());const results=[];
 const output=path.resolve(__dirname,'../../audit/core-03950');fs.mkdirSync(output,{recursive:true});
 try {
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[2560,1440]])for(const scale of [1,1.25,1.5]){
   const page=await browser.newPage({viewport:{width:Math.floor(width/scale),height:Math.floor(height/scale)},deviceScaleFactor:scale});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.evaluate(()=>{data=demoData();data=F.migrateLedgerCore(data);render();navigate('dashboard');});
   const views=[];
   for(const view of ['dashboard','transactions','weeklyHub','decisionsHub']){
    await page.evaluate(v=>{navigate(v);window.scrollTo(0,0);},view);
    const state=await page.evaluate(()=>{
     const nav=document.querySelector('#appTopbar');
     const buttons=[...(nav?.querySelectorAll('button,select,input')||[])].filter(b=>b.getClientRects().length);
     return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      nav:buttons.map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),
      scrollable:[...document.querySelectorAll('main,.workspace,.content,body,html')].some(el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY!=='hidden')};
    });
    assert.ok(state.scrollWidth<=state.width+2,`${width}x${height}@${scale} ${view}: overflow ${state.scrollWidth}`);
    for(const b of state.nav)assert.ok(b.left>=-1&&b.right<=state.width+1&&b.top>=-1&&b.bottom<=state.height,`${view}: botão fora do ecrã ${JSON.stringify(b)}`);
    if(view==='dashboard') {
     await page.screenshot({path:path.join(output,'current.png')});
     const geometry=await page.evaluate(()=>({
      labels:[...document.querySelectorAll('#summaryBalanceChart .summary-bar-axis-label,#chart .summary-bar-axis-label')].map(n=>{const b=n.getBBox();return {x:b.x,right:b.x+b.width};}),
      arrows:[...document.querySelectorAll('.summary-month-arrow')].map(n=>n.getBoundingClientRect().bottom),
      selectors:[...document.querySelectorAll('.summary-month-picker-wrap select')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().bottom)
     }));
     assert.ok(geometry.labels.length>2);
     assert.ok(geometry.labels.every(b=>b.x>=0&&b.right>0&&b.right<78),'Rótulo invisível ou atravessa a grelha');
     for(const bottom of geometry.arrows)for(const selector of geometry.selectors)assert.ok(Math.abs(bottom-selector)<2,'Seta desalinhada '+JSON.stringify({width,height,scale,geometry}));
     assert.deepEqual(await page.evaluate(()=>['#summaryBalanceChart','#chart'].map(id=>getComputedStyle(document.querySelector(id)).backgroundImage)),['none','none']);
     if(width===1920&&scale===1){
      await page.getByRole('button',{name:'Ocultar valores',exact:true}).click();
      const privacy=await page.evaluate(()=>{const n=document.querySelector('.summary-bar-axis-label .sensitive-value');return {tag:n.tagName,namespace:n.namespaceURI,filter:getComputedStyle(n).filter};});
      assert.equal(privacy.tag,'tspan');assert.equal(privacy.namespace,'http://www.w3.org/2000/svg');assert.match(privacy.filter,/blur/);
      await page.getByRole('button',{name:'Mostrar valores',exact:true}).click();
     }
    }
    const scroll=await page.evaluate(()=>{const el=document.scrollingElement;const max=el.scrollHeight-el.clientHeight;window.scrollTo(0,max);const actual=el.scrollTop;window.scrollTo(0,0);return {max,actual};});
    assert.ok(scroll.max<1||scroll.actual>0,`${view}: scroll bloqueado`);
    views.push({view,...state});
   }
   await page.evaluate(()=>navigate('dashboard'));
   if(scale===1.5||width===1920)await page.screenshot({path:path.join(output,`${width}x${height}-${scale}.png`),fullPage:true});
   assert.deepEqual(errors,[]);results.push({width,height,scale,views});await page.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'responsive.json'),JSON.stringify(results,null,2));}
 console.log(`${results.length} combinações de resolução/escala, quatro páginas por combinação.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
