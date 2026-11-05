'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const F=require('../finance.js'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-desktop-native-'));
 const profile=path.join(dir,'Financas Pessoais'),resultPath=path.join(dir,'result.json');
 const db=createSqliteStorage(profile);const d=F.empty();d.accounts=[{id:'m',name:'Millennium',type:'Banco',balance:5000},{id:'p',name:'Poupança',type:'Poupança',balance:0}];if(require('./_version.cjs').revision()>=70){delete d.providerIcons;delete d.monthlyConclusions;}db.writeSpace('equilibrioData',d);db.close();
 fs.writeFileSync(path.join(profile,'browser-state.json'),'{"truncated":"');
 const blocked=path.join(dir,'not-a-directory');fs.writeFileSync(blocked,'block');
 const exercise=async function(backupDir,blocked){
  for(let n=0;n<80&&window.CompleteUI&&!window.CompleteUI.canWrite();n++)await new Promise(resolve=>setTimeout(resolve,25));
  if(window.CompleteUI&&!window.CompleteUI.canWrite())throw Error('Editor não ficou pronto após a aquisição assíncrona do acesso exclusivo.');

  const revision=v=>{const [a,b,c]=v.split('.').map(Number);return a>0||b>39?Infinity:b===39?c:-1;};
  const make=(id,type,account)=>({id,type,account,description:'TRF',category:'Transferências',amount:250,date:'2026-09-01'});
  if(financasDesktop.writeDraft){const beforeDraft=JSON.stringify(data),draft={format:1,space:'native-test',kind:'movement',savedAt:new Date().toISOString(),fields:[{name:'description',value:'Rascunho nativo',checked:false}],payload:{split:{enabled:true,parts:[{category:'Casa',amount:1,note:'Preservar'}]}}};if(financasDesktop.writeDraft('native-test',draft)!==true)throw Error('Rascunho nativo não foi guardado');if(financasDesktop.readDraft('native-test').fields[0].value!=='Rascunho nativo'||financasDesktop.readDraft('another-test')!==null)throw Error('Rascunhos não estão isolados');if(JSON.stringify(data)!==beforeDraft)throw Error('Rascunho alterou ledger');if(financasDesktop.writeDraft('other',draft)?.error===undefined)throw Error('IPC aceitou espaço incompatível');financasDesktop.removeDraft('native-test');if(financasDesktop.readDraft('native-test')!==null)throw Error('Rascunho não eliminado');}
  if (window.PracticalFinance) commit(()=>{const s=PracticalFinance.writable(data);s.events.push({id:'native-event',title:'Teste nativo',date:'2026-09-01',note:'Preservar no backup',includeInExports:false});s.captures.push({id:'native-capture',date:'2026-09-01',amount:12,description:'Recibo',note:'',status:'pending'});const e=PracticalFinance.saveEquipment(data,{name:'Máquina nativa',date:'2099-01-01',cost:600,notes:''});PracticalFinance.scheduleEquipment(data,e.id,'Millennium');PracticalFinance.writable(data).rules.push({id:'native-rule',match:'digi',category:'Telecomunicações',exceptions:[],active:true});PracticalFinance.writable(data).autonomy={accountIds:['m'],protectedFunds:0,retainedIncome:0,essentials:[{category:'Essenciais',monthly:1000,reduction:0}],extraordinary:0,extraordinaryMonth:1};});
  const first=commit(()=>F.importTransaction(data,make('out','expense','Millennium')));
  const pending=structuredClone(data.transactions);
  const second=commit(()=>F.importTransaction(data,make('in','income','Poupança')));
  let splitNotes=false,splitId='native-split';
  if(typeof window.ReconciliationModel?.monthReview==='function'){
   if(revision(financasDesktop.desktopVersion)>=67){
    transactionForm();const input=(selector,value)=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
    input('#modal [name=description]','Compra nativa repartida');input('#modal [name=date]','2026-09-02');input('#modal [name=beneficiary]','Fornecedor novo nativo');input('#modal [name=note]','Compra inteira');
    document.querySelector('#openTransactionSplitWorkbench').click();const rows=document.querySelectorAll('[data-transaction-split-row]');for(let i=0;i<2;i++){input('[data-transaction-split-row]:nth-child('+(i+1)+') [data-tx-split-category]',i?'Alimentação':'Casa');input('[data-transaction-split-row]:nth-child('+(i+1)+') [data-tx-split-amount]',i?'15':'5');input('[data-transaction-split-row]:nth-child('+(i+1)+') [data-tx-split-note]',i?'Parcela nativa B':'Parcela nativa A');}
    if(document.querySelector('#modal [name=amount]').valueAsNumber!==20||!document.querySelector('#modal [name=amount]').readOnly)throw Error('Total dividido não é automático');
    document.querySelector('#doneTransactionSplit').click();document.querySelector('#modalForm').requestSubmit();await new Promise(r=>setTimeout(r,50));if(!document.querySelector('#formError').hidden)throw Error(document.querySelector('#formError').textContent);if(document.querySelector('#modal').open)throw Error('Compra não foi guardada');
    const added=data.transactions.find(t=>t.description==='Compra nativa repartida');if(!added)throw Error('Compra ausente');splitId=added.id;
    transactionForm(added.id);input('#modal [name=beneficiary]','Fornecedor editado nativo');document.querySelector('#modalForm').requestSubmit();await new Promise(r=>setTimeout(r,50));if(!document.querySelector('#formError').hidden)throw Error(document.querySelector('#formError').textContent);if(document.querySelector('#modal').open)throw Error('Edição não foi guardada');
   }else commit(()=>F.add(data,{id:'native-split',date:'2026-09-02',type:'expense',account:'Millennium',amount:20,description:'Compra nativa repartida',category:'Casa',note:'Compra inteira',splits:[{category:'Casa',amount:5,note:'Parcela nativa A'},{category:'Alimentação',amount:15,note:'Parcela nativa B'}]}));splitNotes=true;
   splitNotes=true;
  }
  if(revision(financasDesktop.desktopVersion)>=68)commit(()=>{data.providerIcons=[{id:'native-provider',name:'DIGI',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',initialOnly:false}];});
  let nativeReceipt=null;
  if(revision(financasDesktop.desktopVersion)>=69){
   const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,700);ctx.fillStyle='black';ctx.font='40px monospace';['LOJA TESTE','01/10/2026','Leite 1,50','Pao 2,00','TOTAL 3,50'].forEach((line,i)=>ctx.fillText(line,60,90+i*110));const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
   const result=await ReceiptReader.read(new File([blob],'teste-nativo.png',{type:'image/png'}),()=>{});if(!/TOTAL/i.test(result.text)||!result.attachment)throw Error('Leitura real nativa inválida: '+result.text);nativeReceipt={text:true,local:true};
  }
  if(revision(financasDesktop.desktopVersion)>=78)commit(()=>{data.receiptRules=[{id:'native-rule',kind:'category',name:'Artigo nativo',merchant:'Mercado nativo',category:'Casa / Limpeza',enabled:true,excludedMerchants:[]}];data.transactions.find(t=>t.id===splitId).receiptText='Texto nativo: detergente 888777666';});
  const saved=DesktopPersistence.readSpace('main').data;
  await financasDesktop.setBackupSettings({directory:backupDir,onClose:false});
  const backup=await financasDesktop.runBackup('{"stale":true}',{force:true});
  const encrypted=await financasDesktop.saveEncryptedBackup('test.fpbackup','{"stale":true}','frase de teste permanente 03952');
  let invalidRestoreRejected=false;
  try{await financasDesktop.migrateJson(JSON.stringify({accounts:[],transactions:[{id:'broken'}]}),'{}');}catch{invalidRestoreRejected=true;}
  const changed=commit(()=>F.add(data,{id:'expense',date:'2026-09-04',type:'expense',account:'Millennium',amount:10,description:'Teste',category:'Casa'}));
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  await FinancasDesktopIO.restoreNative();
  const restoreDialogOpen=document.querySelector('#modal').open;
  const confirmReplacement=document.querySelector('[name=confirmReplaceSpace]');if(confirmReplacement)confirmReplacement.checked=true;
  document.querySelector('#modalForm').requestSubmit();
  const restored=DesktopPersistence.readSpace('main').data;
  await financasDesktop.setBackupSettings({directory:blocked});
  const fallback=await financasDesktop.runBackup('',{force:true});
  return {nativeReceipt,splitNotes,splitId,first,second,pending,saved,backup,encrypted,invalidRestoreRejected,changed,restoreDialogOpen,restored,fallback,version:financasDesktop.desktopVersion};
 };
 const code='('+exercise.toString()+')('+JSON.stringify(path.join(dir,'Cópias €'))+','+JSON.stringify(blocked)+')';
 const launcher=path.join(dir,'launch.cjs');
 fs.writeFileSync(launcher,[
 "const fs=require('fs');const {app,BrowserWindow,dialog}=require('electron');",
  'app.setPath("appData",'+JSON.stringify(dir)+');BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.maximize=function(){};',
  'dialog.showSaveDialog=async()=>({canceled:false,filePath:'+JSON.stringify(path.join(dir,'sealed.fpbackup'))+'});',
  'dialog.showOpenDialog=async()=>({canceled:false,filePaths:[require("path").join('+JSON.stringify(path.join(dir,'Cópias €'))+',fs.readdirSync('+JSON.stringify(path.join(dir,'Cópias €'))+').filter(f=>f.endsWith(".json"))[0])]});',
 'let phase=0,result;console.log("test-main-ready");',
 "app.on('browser-window-created',(_,win)=>win.webContents.on('did-finish-load',async()=>{try{",
 'if(phase===0){console.log("test-renderer-ready");phase=1;result=await win.webContents.executeJavaScript('+JSON.stringify(code)+');win.reload();}',
 "else{result.reloaded=await win.webContents.executeJavaScript('data.accounts.map(a=>a.balance)');result.reloadedSplits=await win.webContents.executeJavaScript('data.transactions.find(t=>t.description===\"Compra nativa repartida\")?.splits');fs.writeFileSync("+JSON.stringify(resultPath)+',JSON.stringify(result));app.exit(0);}',
 '}catch(e){fs.writeFileSync('+JSON.stringify(resultPath)+',JSON.stringify({error:e.stack}));app.exit(1);}}));',
 'require('+JSON.stringify(path.resolve(process.env.APP_TEST_ROOT||path.join(__dirname,'..'),'desktop/main.cjs'))+');'
 ].join('\n'));
 let output='';const childEnv={...process.env};delete childEnv.ELECTRON_RUN_AS_NODE;
 try{
  await new Promise((resolve,reject)=>{const child=spawn(process.env.ELECTRON_PATH,['--no-sandbox','--in-process-gpu',launcher],{windowsHide:true,env:childEnv,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(Error('Electron excedeu 90 segundos: '+output));},90000);child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('Electron '+code+': '+output+' '+(fs.existsSync(resultPath)?fs.readFileSync(resultPath,'utf8'):'')));});});
  const r=JSON.parse(fs.readFileSync(resultPath));assert.equal(r.version,process.env.APP_TEST_VERSION||require('../package.json').version);assert.equal(r.first,true);assert.equal(r.second,true);assert.equal(r.pending[0].transferStatus,'pending');
   if(r.saved.practical){assert.equal(r.saved.practical.events[0].id,'native-event');assert.equal(r.saved.practical.captures[0].status,'pending');assert.deepEqual(r.restored.practical,r.saved.practical);}
   if(r.saved.providerIcons?.length){assert.deepEqual(r.restored.providerIcons,r.saved.providerIcons);assert.equal(r.saved.providerIcons[0].name,'DIGI');}
  assert.equal(r.saved.transactions.length,r.splitNotes?2:1);assert.equal(r.saved.ledgerCoreVersion,1);assert.deepEqual(r.reloaded,r.splitNotes?[4730,250]:[4750,250]);assert.equal(r.backup.ok,true);assert.equal(r.fallback.fallback,true);
  const saved=JSON.parse(fs.readFileSync(r.backup.filePath));assert.equal(saved.spaces[0].data.transactions.length,r.splitNotes?2:1);if(r.saved.practical)assert.deepEqual(saved.spaces[0].data.practical,r.saved.practical);
  if(r.splitNotes){assert.deepEqual(r.reloadedSplits,r.saved.transactions.find(t=>t.id===r.splitId).splits);assert.equal(r.saved.transactions.find(t=>t.id===r.splitId).splits[1].note,'Parcela nativa B');assert.deepEqual(r.restored.transactions.find(t=>t.id===r.splitId).splits,r.saved.transactions.find(t=>t.id===r.splitId).splits);assert.deepEqual(saved.spaces[0].data.transactions.find(t=>t.id===r.splitId).splits,r.saved.transactions.find(t=>t.id===r.splitId).splits);}
   const decrypted=JSON.parse(await require('../desktop/encrypted-backup.cjs').decryptBackup(fs.readFileSync(r.encrypted,'utf8'),'frase de teste permanente 03952'));
   if(r.saved.providerIcons?.length){assert.deepEqual(saved.spaces[0].data.providerIcons,r.saved.providerIcons);assert.deepEqual(decrypted.spaces[0].data.providerIcons,r.saved.providerIcons);}
  if(r.saved.receiptRules){assert.deepEqual(r.restored.receiptRules,r.saved.receiptRules);assert.deepEqual(saved.spaces[0].data.receiptRules,r.saved.receiptRules);assert.deepEqual(decrypted.spaces[0].data.receiptRules,r.saved.receiptRules);for(const d of [r.restored,saved.spaces[0].data,decrypted.spaces[0].data])assert.equal(d.transactions.find(t=>t.id===r.splitId).receiptText,'Texto nativo: detergente 888777666');}
  if(r.splitNotes)assert.equal(decrypted.spaces[0].data.transactions.find(t=>t.id===r.splitId).splits[0].note,'Parcela nativa A');
  assert.equal(decrypted.spaces[0].data.transactions.length,r.splitNotes?2:1);assert.equal(r.invalidRestoreRejected,true);assert.equal(r.changed,true);assert.equal(r.restoreDialogOpen,true);assert.equal(r.restored.transactions.length,r.splitNotes?2:1);assert.deepEqual(r.restored.accounts.map(a=>a.balance),r.splitNotes?[4730,250]:[4750,250]);
  const out=path.resolve(__dirname,'../../audit/product-03952');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'desktop.json'),JSON.stringify({ok:true,version:r.version,ipcCommit:true,reload:true,truncatedMirror:true,backupFromSqlite:true,encryptedFromSqlite:true,restoreThroughUI:true,invalidRestoreRejected:true,blockedDirectoryFallback:true},null,2));
  console.log('Electron real: migração, IPC, transferência, recarga, JSON truncado e fallback de backup OK.');
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
