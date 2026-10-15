'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),lot=path.resolve(root,'..'),{paired,cards}=require('../tests/fixtures/cor-001.cjs'),F=require('../finance.js'),P=require('../features-model.js'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
async function exercise(mode,selected){
 const check=(x,m)=>{if(!x)throw Error(m);};
 const snapshots=()=>Object.fromEntries(LifeUI.spaces().map(s=>[s.id,DesktopPersistence.readSpace(s.id).data]));
 const set=(name,value)=>{const el=document.querySelector('[name="'+name+'"]');check(el,'Campo '+name+' ausente');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
 const submitted=async()=>{document.getElementById('modalForm').requestSubmit();for(let i=0;i<200&&formSubmitting;i++)await new Promise(r=>setTimeout(r,25));};
 document.getElementById('welcomeContinue')?.click();for(let n=0;n<80&&!CompleteUI.canWrite();n++)await new Promise(r=>setTimeout(r,25));
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 if(mode.startsWith('separate')){
  month='2026-08';navigate('transactions');window.renderEquilibrio();
  if(mode==='separate-edited'){
   const edit=document.querySelector('[data-action="edit-tx"][data-id="out"]');check(edit,'Editar ausente');edit.click();set('amount','120');await submitted();check(!document.getElementById('modal').open,'Edição recusada: '+document.getElementById('formError').textContent);
   check(DesktopPersistence.readSpace('main').data.accounts.map(a=>a.balance).join(',')==='880,120','Edição não persistiu via IPC');
  }
  const before=snapshots(),button=document.querySelector('[data-action="unpair"][data-id="out"]');check(button,'Separar ausente');button.click();await submitted();const after=snapshots();
  if(mode==='separate-normal'){check(!document.getElementById('modal').open,'Separação normal recusada');check(after.main.transactions.length===2,'Par normal não separado');check(after.main.accounts.map(a=>a.balance).join(',')==='900,100','Saldo normal alterado');}
  else{check(document.getElementById('modal').open,'Separação deveria bloquear');check(!document.getElementById('formError').hidden,'Erro ausente');check(JSON.stringify(before)===JSON.stringify(after),'Rejeição alterou SQLite');}
  return {mode,before,after,message:document.getElementById('formError').textContent};
 }
 const before=snapshots();SpaceTransferUI.open();set('moveSpaceTarget','other');set('moveSpaceRecord',selected);set('moveAccount_0','bankB');set('moveAccount_1','bankB');document.getElementById('moveSpacePreview').click();
 check(/Cartão/i.test(document.getElementById('moveSpaceSummary').textContent),'Mapeamento inválido não rejeitado');check(JSON.stringify(before)===JSON.stringify(snapshots()),'Prévia inválida alterou dados');
 set('moveAccount_1','cb');document.getElementById('moveSpacePreview').click();const preview=document.getElementById('moveSpaceSummary').textContent;check(preview.includes('2 movimentos'),'Pagamento ligado não consta da prévia');document.querySelector('[name=confirmSpaceMove]').checked=true;
 const current=DesktopPersistence.readSpace('other').data,concurrent={...structuredClone(current),profile:'Alteração concorrente'};
 const write=financasDesktop.dataCommitLedgerSync('equilibrioData:other',current,concurrent);check(!write?.error,'Não foi possível simular concorrência');const concurrentSnapshot=snapshots();await submitted();check(document.getElementById('modal').open&&!document.getElementById('formError').hidden,'Prévia obsoleta não bloqueada');check(JSON.stringify(concurrentSnapshot)===JSON.stringify(snapshots()),'Conflito alterou espaços');
 document.getElementById('moveSpacePreview').click();document.querySelector('[name=confirmSpaceMove]').checked=true;await submitted();check(!document.getElementById('modal').open,document.getElementById('formError').textContent||'Passagem incompleta');
 const after=snapshots();check(after.main.transactions.length===0&&after.main.installmentPlans.length===0,'Origem retém conjunto');check(after.other.transactions.length===2,'Destino incompleto');check(after.other.installmentPlans[0].cardId==='cb','cardId errado');check(after.other.installmentPlans[0].payments[0].paid===40,'paid alterado');check(after.other.accounts.map(a=>a.balance).join(',')==='960,-60','Saldos destino errados');check(after.main.accounts.map(a=>a.balance).join(',')==='1000,0','Saldos origem errados');check(after.other.transactions.some(t=>t.attachment&&t.note==='Preservar'),'Prova/nota perdida');
 const backups=await financasDesktop.listBackups();check(backups.backups.length>0,'Proteção anterior ausente'); LifeUI.switchSpace('other');month='2026-08';navigate('transactions');window.renderEquilibrio();const payment=after.other.transactions.find(t=>t.installmentPaymentId);const edit=document.querySelector('[data-action="edit-tx"][data-id="'+payment.id+'"]');check(edit,'Editar pagamento movido ausente');edit.click();set('amount','30');await submitted();check(!document.getElementById('modal').open,'Editar pagamento movido falhou');
 const final=snapshots();check(final.other.installmentPlans[0].payments[0].paid===30,'Ligação da parcela não atualizou paid');check(final.other.accounts.map(a=>a.balance).join(',')==='970,-70','Saldos após edição incorretos');
 return {mode,before,after:final,moved:after,preview,conflictBlocked:true,editedPayment:true,backupCount:backups.backups.length};
}
(async()=>{
 const results=[];
 for(const mode of ['separate-edited','separate-protected','separate-normal','move-purchase','move-payment']){
  const run='cor001-'+mode+'-'+Date.now(),profile=path.join(lot,'perfis',run,'Financas Pessoais'),resultFile=path.join(lot,'evidencia',mode+'.json'),launcher=path.join(lot,'fixtures',run+'.cjs');let selected='';
  let source,target=F.empty();if(mode.startsWith('separate')){source=paired();if(mode==='separate-protected'){source.transactions[0].reconciled=true;source.transactions[0].note='Nota nova';}}else{const f=cards();source=f.a;target=f.b;selected=mode==='move-payment'?f.payment.id:f.plan.transactionId;}
  source.spaceName='Origem';target.spaceName='Destino';source=require('../desktop/ledger-validation.cjs').validateLedger(source);target=require('../desktop/ledger-validation.cjs').validateLedger(target);const db=createSqliteStorage(profile);db.writeState({equilibrioSpaces:JSON.stringify([{id:'main',name:'Origem',key:'equilibrioData'},{id:'other',name:'Destino',key:'equilibrioData:other'}]),equilibrioData:JSON.stringify(source),'equilibrioData:other':JSON.stringify(target)});db.close();
  const exerciseText='('+exercise.toString()+')('+JSON.stringify(mode)+','+JSON.stringify(selected)+')';
  fs.writeFileSync(launcher,["const fs=require('node:fs');const {app,BrowserWindow}=require('electron');",'const isolation=require('+JSON.stringify(path.join(lot,'isolar-perfil.cjs'))+')(app,'+JSON.stringify(run)+');','BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.maximize=function(){};','let phase=0,result;','app.on("browser-window-created",(_,win)=>win.webContents.on("did-finish-load",async()=>{try{','if(phase===0){phase=1;result=await win.webContents.executeJavaScript('+JSON.stringify(exerciseText)+');fs.writeFileSync('+JSON.stringify(path.join(lot,'evidencia',mode+'.png'))+', (await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());win.reload();}', 'else if(phase===1){phase=2;result.reloaded=await win.webContents.executeJavaScript("LifeUI.exportSpaces()");result.profile=app.getPath("userData");fs.writeFileSync('+JSON.stringify(resultFile)+',JSON.stringify(result,null,2));app.exit(0);}', '}catch(e){fs.writeFileSync('+JSON.stringify(resultFile)+',JSON.stringify({error:e.stack}));app.exit(1);}}));','require('+JSON.stringify(path.join(root,'desktop/main.cjs'))+');isolation.verify();'].join('\n'));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let output='';await new Promise((resolve,reject)=>{const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),['--no-sandbox','--in-process-gpu',launcher],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(Error('Timeout '+mode));},45000);child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);fs.writeFileSync(path.join(lot,'evidencia',mode+'.log'),output);code===0?resolve():reject(Error(mode+': '+fs.readFileSync(resultFile,'utf8')));});});
  const result=JSON.parse(fs.readFileSync(resultFile));const reopened=createSqliteStorage(profile);try{for(const [id,data]of Object.entries(result.after))assert.deepEqual(reopened.readSpace(id).data,data);}finally{reopened.close();}for(const space of result.reloaded.spaces){const id=space.data.spaceName==='Origem'?'main':'other';assert.deepEqual(space.data,result.after[id]);}const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');results.push({mode,passed:true,profile,beforeHash:hash(result.before),afterHash:hash(result.after),ui:true,ipcRead:true,sqliteReopened:true,rendererReloaded:true});console.log(mode+': OK');
 }
 fs.writeFileSync(path.join(lot,'evidencia','desktop-resumo.json'),JSON.stringify({passed:true,results},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});






