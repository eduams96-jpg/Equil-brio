'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const F=require('../finance.js'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-desktop-native-'));
 const profile=path.join(dir,'Financas Pessoais'),resultPath=path.join(dir,'result.json');
 const db=createSqliteStorage(profile);const d=F.empty();d.accounts=[{id:'m',name:'Millennium',type:'Banco',balance:5000},{id:'p',name:'Poupança',type:'Poupança',balance:0}];db.writeSpace('equilibrioData',d);db.close();
 fs.writeFileSync(path.join(profile,'browser-state.json'),'{"truncated":"');
 const blocked=path.join(dir,'not-a-directory');fs.writeFileSync(blocked,'block');
 const exercise=async function(backupDir,blocked){
  const make=(id,type,account)=>({id,type,account,description:'TRF',category:'Transferências',amount:250,date:'2026-09-01'});
  const first=commit(()=>F.importTransaction(data,make('out','expense','Millennium')));
  const pending=structuredClone(data.transactions);
  const second=commit(()=>F.importTransaction(data,make('in','income','Poupança')));
  const saved=DesktopPersistence.readSpace('main').data;
  await financasDesktop.setBackupSettings({directory:backupDir,onClose:false});
  const backup=await financasDesktop.runBackup('{"stale":true}',{force:true});
  await financasDesktop.setBackupSettings({directory:blocked});
  const fallback=await financasDesktop.runBackup('',{force:true});
  return {first,second,pending,saved,backup,fallback,version:financasDesktop.desktopVersion};
 };
 const code='('+exercise.toString()+')('+JSON.stringify(path.join(dir,'Cópias €'))+','+JSON.stringify(blocked)+')';
 const launcher=path.join(dir,'launch.cjs');
 fs.writeFileSync(launcher,[
 "const fs=require('fs');const {app,BrowserWindow}=require('electron');",
 'app.setPath("appData",'+JSON.stringify(dir)+');BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.maximize=function(){};',
 'let phase=0,result;console.log("test-main-ready");',
 "app.on('browser-window-created',(_,win)=>win.webContents.on('did-finish-load',async()=>{try{",
 'if(phase===0){console.log("test-renderer-ready");phase=1;result=await win.webContents.executeJavaScript('+JSON.stringify(code)+');win.reload();}',
 "else{result.reloaded=await win.webContents.executeJavaScript('data.accounts.map(a=>a.balance)');fs.writeFileSync("+JSON.stringify(resultPath)+',JSON.stringify(result));app.exit(0);}',
 '}catch(e){fs.writeFileSync('+JSON.stringify(resultPath)+',JSON.stringify({error:e.stack}));app.exit(1);}}));',
 'require('+JSON.stringify(path.resolve(process.env.APP_TEST_ROOT||path.join(__dirname,'..'),'desktop/main.cjs'))+');'
 ].join('\n'));
 let output='';const childEnv={...process.env};delete childEnv.ELECTRON_RUN_AS_NODE;
 try{
  await new Promise((resolve,reject)=>{const child=spawn(process.env.ELECTRON_PATH,['--no-sandbox','--in-process-gpu',launcher],{windowsHide:true,env:childEnv,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(Error('Electron excedeu 30 segundos: '+output));},30000);child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('Electron '+code+': '+output+' '+(fs.existsSync(resultPath)?fs.readFileSync(resultPath,'utf8'):'')));});});
  const r=JSON.parse(fs.readFileSync(resultPath));assert.equal(r.version,'0.39.51');assert.equal(r.first,true);assert.equal(r.second,true);assert.equal(r.pending[0].transferStatus,'pending');
  assert.equal(r.saved.transactions.length,1);assert.equal(r.saved.ledgerCoreVersion,1);assert.deepEqual(r.reloaded,[4750,250]);assert.equal(r.backup.ok,true);assert.equal(r.fallback.fallback,true);
  const saved=JSON.parse(fs.readFileSync(r.backup.filePath));assert.equal(saved.spaces[0].data.transactions.length,1);
  const out=path.resolve(__dirname,'../../audit/product-03951');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'desktop.json'),JSON.stringify({ok:true,version:r.version,ipcCommit:true,reload:true,truncatedMirror:true,backupFromSqlite:true,blockedDirectoryFallback:true},null,2));
  console.log('Electron real: migração, IPC, transferência, recarga, JSON truncado e fallback de backup OK.');
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
