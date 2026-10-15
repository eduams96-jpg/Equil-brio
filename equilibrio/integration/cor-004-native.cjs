'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),lot=path.dirname(root),F=require('../finance.js'),P=require('../features-model.js'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
async function exercise(){
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 document.getElementById('welcomeContinue')?.click();document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 const before=DesktopPersistence.readSpace('main').data,inputBefore=JSON.stringify(data);
 navigate('cashflow');window.renderEquilibrio();
 const horizon=document.getElementById('forecastHorizon');horizon.value='30';horizon.dispatchEvent(new Event('change',{bubbles:true}));
 const forecast=FinancePlus.forecast(data,30),metrics=document.getElementById('forecastMetrics').textContent,calendar=document.getElementById('forecastCalendar').textContent;
 check(forecast.end===1000&&forecast.min===1000,'Transferência reduziu a previsão');check(metrics.includes(eur(1000)),'UI não mostra saldo 1000: '+JSON.stringify({metrics,expected:eur(1000)}));check(calendar.includes('Transferência COR-004'),'Evento desapareceu da UI');
 const decisions=FinancePlus.simulate(data,50,FinancePlus.dayAdd(F.today(),2),'expense',false),protection=PlanningFinance.decisionImpact(data,{oneOff:-50,date:FinancePlus.dayAdd(F.today(),2)});
 check(decisions.base.end===1000&&decisions.scenario.end===950,'Cenário incorreto');check(protection.availableAfter===750,'Reserva não preservada');
 navigate('planningPlus');window.renderEquilibrio();document.getElementById('simulateDecision').click();
 const set=(name,value)=>{const el=document.querySelector('#modalForm [name="'+name+'"]');check(el,'Campo ausente '+name);el.value=value;};
 set('amount','50');set('date',FinancePlus.dayAdd(F.today(),2));set('type','expense');set('repeat','once');document.getElementById('modalForm').requestSubmit();
 for(let n=0;n<100&&!document.querySelector('.scenario-result');n++)await new Promise(r=>setTimeout(r,30));
 const simulation=document.querySelector('.scenario-result')?.innerText||'';check(simulation.includes(eur(950)),'Resultado UI da simulação ausente');document.getElementById('modalForm').requestSubmit();
 navigate('cashflow');window.renderEquilibrio();
 const after=DesktopPersistence.readSpace('main').data;check(JSON.stringify(before)===JSON.stringify(after),'Consulta alterou SQLite');check(JSON.stringify(data)===inputBefore,'Consulta alterou input');
 return {before,after,forecast,metrics,calendar,simulation,readViaIpc:true,uiForecast:true,uiSimulation:true};
}
(async()=>{
 const run='cor004-'+Date.now(),profile=path.join(lot,'perfis',run,'Financas Pessoais'),resultFile=path.join(lot,'evidencia','desktop-'+run+'.json'),launcher=path.join(lot,'fixtures',run+'.cjs');
 const seed=F.empty();seed.accounts=[{id:'b',name:'Banco',type:'Banco',balance:1000},{id:'s',name:'Poupança',type:'Poupança',balance:0}];F.migrateLedgerCore(seed);const due=P.dayAdd(F.today(),1);
 seed.recurring=[{id:'r',active:true,start:due,day:Number(due.slice(8)),frequency:'monthly',end:due,type:'transfer',account:'Banco',targetAccount:'Poupança',amount:100,description:'Transferência COR-004'}];seed.reserves=[{id:'reserve',name:'Emergência',target:200,saved:200}];seed.spaceName='COR-004 sintético';
 const validated=require('../desktop/ledger-validation.cjs').validateLedger(seed),db=createSqliteStorage(profile);db.writeState({equilibrioSpaces:JSON.stringify([{id:'main',name:'COR-004 sintético',key:'equilibrioData'}]),equilibrioData:JSON.stringify(validated)});db.close();
 const exerciseText='('+exercise.toString()+')()';
 fs.writeFileSync(launcher,["const fs=require('node:fs');const {app,BrowserWindow,ipcMain}=require('electron');",'const isolation=require('+JSON.stringify(path.join(lot,'isolar-perfil.cjs'))+')(app,'+JSON.stringify(run)+');','BrowserWindow.prototype.show=function(){this.showInactive();};BrowserWindow.prototype.maximize=function(){};',
 'let phase=0,result,counting=false;const writes=[];const on=ipcMain.on.bind(ipcMain);ipcMain.on=(channel,handler)=>on(channel,(...args)=>{if(counting&&/financas:(storage:save|data:(commit|ledger|entity)|.*write)/.test(channel))writes.push(channel);return handler(...args);});',
 'app.on("browser-window-created",(_,win)=>{win.webContents.setBackgroundThrottling(false);win.webContents.on("did-finish-load",async()=>{try{',
 'if(phase===0){phase=1;counting=true;result=await win.webContents.executeJavaScript('+JSON.stringify(exerciseText)+');counting=false;result.writeChannels=writes;win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));fs.writeFileSync('+JSON.stringify(path.join(lot,'evidencia','forecast-'+run+'.png'))+', (await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());win.reload();}',
 'else if(phase===1){phase=2;result.reloaded=await win.webContents.executeJavaScript("DesktopPersistence.readSpace(\'main\').data");result.profile=app.getPath("userData");isolation.verify();fs.writeFileSync('+JSON.stringify(resultFile)+',JSON.stringify(result,null,2));app.exit(0);}',
 '}catch(e){fs.writeFileSync('+JSON.stringify(resultFile)+',JSON.stringify({error:e.stack}));app.exit(1);}});});','require('+JSON.stringify(path.join(root,'desktop/main.cjs'))+');isolation.verify();'].join('\n'));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let output='';await new Promise((resolve,reject)=>{const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),['--no-sandbox','--in-process-gpu',launcher],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(Error('Timeout'));},45000);child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);fs.writeFileSync(path.join(lot,'evidencia','desktop-'+run+'.log'),output);code===0?resolve():reject(Error(fs.existsSync(resultFile)?fs.readFileSync(resultFile,'utf8'):output));});});
 const result=JSON.parse(fs.readFileSync(resultFile));assert.deepEqual(result.before,result.after);assert.deepEqual(result.after,result.reloaded);assert.deepEqual(result.writeChannels,[]);const reopened=createSqliteStorage(profile);try{assert.deepEqual(reopened.readSpace('main').data,result.after);}finally{reopened.close();}
 const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');fs.writeFileSync(path.join(lot,'evidencia','desktop-resumo.json'),JSON.stringify({passed:true,run,profile,resultFile,uiForecast:true,uiSimulation:true,ipcRead:true,sqliteReopened:true,rendererReloaded:true,writeChannels:result.writeChannels,beforeHash:hash(result.before),afterHash:hash(result.after),transactions:result.after.transactions.length},null,2));console.log('COR-004 desktop UI + IPC + SQLite + recarga/reabertura: OK');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});






