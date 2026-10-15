'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function planHash(plan){return hash(Buffer.from(JSON.stringify(plan)));}
function safe(root,relative){
 if(typeof relative!=='string'||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Caminho inseguro na recuperação.');
 const target=path.resolve(root,relative),base=path.resolve(root);if(!target.startsWith(base+path.sep))throw Error('Destino fora da raiz.');
 // Reject links in every ancestor, including the root itself.
 let p=target;for(;;){if(fs.existsSync(p)){const st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error('Ligação na recuperação.');if(p===target&&st.isDirectory())throw Error('Destino não é ficheiro.');}const up=path.dirname(p);if(up===p)break;p=up;}return target;
}
function atomic(file,bytes){const tmp=file+'.recovery-'+crypto.randomUUID()+'.tmp';try{const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(hash(fs.readFileSync(tmp))!==hash(bytes))throw Error('Escrita de recuperação inválida.');fs.renameSync(tmp,file);if(hash(fs.readFileSync(file))!==hash(bytes))throw Error('Recuperação não confirmada.');}finally{if(fs.existsSync(tmp))fs.rmSync(tmp);}}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
function validatePending(pointer,appPath,userDataPath,validatePackage){
 const profile=path.resolve(userDataPath),updates=path.join(profile,'updates'),planPath=path.resolve(pointer.planPath||'');
 if(!planPath.startsWith(updates+path.sep)||path.basename(planPath)!=='update-plan.json')throw Error('Plano fora da área de atualização.');
 safe(updates,path.relative(updates,planPath).split(path.sep).join('/'));
 const plan=JSON.parse(fs.readFileSync(planPath));if(pointer.planSha256!==planHash(plan))throw Error('Integridade do plano inválida.');
 const root=path.dirname(planPath);
 if(plan.format!=='financas-pessoais-update-plan'||plan.version!==2||path.resolve(plan.appPath)!==path.resolve(appPath)||plan.stagingDir!==path.join(root,'staged')||plan.rollbackDir!==path.join(root,'rollback')||plan.statusPath!==path.join(profile,'update-status.json')||plan.versionFile!=='desktop/version.cjs'||!Number.isSafeInteger(plan.parentPid)||plan.parentPid<=0)throw Error('Destinos do plano inválidos.');
 const pkg=JSON.parse(fs.readFileSync(safe(root,'package.json'))),checked=validatePackage(pkg,{currentVersion:plan.currentVersion,schemaVersion:plan.schemaVersion});
 const files=checked.files.map(f=>({path:f.path,sha256:f.sha256.toLowerCase()}));if(JSON.stringify(files)!==JSON.stringify(plan.files)||checked.manifestSha256!==plan.manifestSha256||checked.version!==plan.expectedVersion)throw Error('O plano não corresponde ao pacote verificado.');
 if(!Array.isArray(plan.rollbackManifest)||plan.rollbackManifest.length!==files.length)throw Error('Manifesto de reversão incompleto.');
 for(let i=0;i<files.length;i++){const item=plan.rollbackManifest[i];if(item.path!==files[i].path||typeof item.existed!=='boolean'||(item.existed&&!/^[a-f0-9]{64}$/.test(item.sha256||'')))throw Error('Manifesto de reversão inválido.');safe(plan.appPath,item.path);if(item.existed){const backup=safe(plan.rollbackDir,item.path);if(hash(fs.readFileSync(backup))!==item.sha256)throw Error('Cópia de reversão corrompida: '+item.path);}}
 return plan;
}
function status(plan,state,extra={}){atomic(plan.statusPath,Buffer.from(JSON.stringify({state,fromVersion:plan.currentVersion,toVersion:plan.expectedVersion,rollbackDir:plan.rollbackDir,...extra,at:new Date().toISOString()},null,2)));}
function restoreVerified(plan){
 // Preflight every source and destination before touching any application file.
 for(const item of plan.rollbackManifest){safe(plan.appPath,item.path);if(item.existed&&hash(fs.readFileSync(safe(plan.rollbackDir,item.path)))!==item.sha256)throw Error('Cópia de reversão corrompida: '+item.path);}
 for(const item of plan.rollbackManifest){const target=safe(plan.appPath,item.path);if(item.existed){fs.mkdirSync(path.dirname(target),{recursive:true});atomic(target,fs.readFileSync(safe(plan.rollbackDir,item.path)));}else if(fs.existsSync(target))fs.rmSync(target);}
 for(const item of plan.rollbackManifest){const target=safe(plan.appPath,item.path);if(item.existed?hash(fs.readFileSync(target))!==item.sha256:fs.existsSync(target))throw Error('Reversão incompleta: '+item.path);}
}
function finish(pointer,plan,userDataPath){
 // Keep journal, package and rollback evidence; only resolve the active pointer.
 atomic(path.join(path.dirname(pointer.planPath),'resolved-pointer.json'),Buffer.from(JSON.stringify(pointer,null,2)));
 for(const item of plan.files){const temp=safe(plan.appPath,item.path+'.update-tmp');if(fs.existsSync(temp))fs.rmSync(temp);}
 fs.rmSync(path.join(userDataPath,'update-pending.json'),{force:true});
}
function recover(pointer,appPath,userDataPath,validatePackage){
 if(alive(pointer.helperPid))throw Error('A atualização ainda está em curso. Aguarda o fecho do atualizador.');
 const plan=validatePending(pointer,appPath,userDataPath,validatePackage);
 if(alive(plan.parentPid))throw Error('A aplicação anterior ainda está em execução.');
 const oldStatus=fs.existsSync(plan.statusPath)?fs.readFileSync(plan.statusPath):null;
 if(oldStatus)atomic(path.join(path.dirname(pointer.planPath),'status-before-recovery-'+Date.now()+'.json'),oldStatus);
 status(plan,'recovering');try{restoreVerified(plan);status(plan,'failed-rolled-back',{recoveredInterruption:true});finish(pointer,plan,userDataPath);}catch(e){status(plan,'failed-rollback-error',{rollbackError:e.message});throw e;}
 return {state:'failed-rolled-back',recoveredInterruption:true};
}
// This function is embedded in main; it uses core modules only before loading application modules.
function recoverBeforeLoad(appPath,userDataPath){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const marker=path.join(userDataPath,'update-pending.json');
 if(!fs.existsSync(marker)){
   const statusPath=path.join(userDataPath,'update-status.json');
   if(fs.existsSync(statusPath)){
     const status=JSON.parse(fs.readFileSync(statusPath));
     if(['installing','recovering','waiting-for-close','failed-rollback-error'].includes(status.state))throw Error('Atualização histórica pendente. Recuperação controlada necessária antes de abrir a aplicação.');
   }
   return null;
 }
 const pointer=JSON.parse(fs.readFileSync(marker)),root=path.dirname(path.resolve(pointer.planPath||'')),updates=path.join(path.resolve(userDataPath),'updates');
 if(!root.startsWith(updates+path.sep)||path.basename(pointer.planPath)!=='update-plan.json')throw Error('Plano de recuperação fora do perfil.');
 const runtime=path.join(root,'runtime');
 for(const name of ['manual-updater.cjs','update-recovery.cjs','verified-backup.cjs']){
 const file=path.join(runtime,name);let p=file;for(;;){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Ligação no runtime de recuperação.');const up=path.dirname(p);if(up===p)break;p=up;}
 if(!pointer.runtimeHashes||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==pointer.runtimeHashes[name])throw Error('Runtime de recuperação inválido.');}
 const recovery=require(path.join(runtime,'update-recovery.cjs')),updater=require(path.join(runtime,'manual-updater.cjs'));
 try{return recovery.recover(pointer,appPath,userDataPath,updater.validatePackageObject);}
 catch(error){
   if(process.platform!=='win32'||!['EACCES','EPERM'].includes(error.code)||!updater.recoverElevatedSync)throw error;
   updater.recoverElevatedSync({planPath:pointer.planPath,userDataPath,appPath});
   return {state:'failed-rolled-back',recoveredInterruption:true,elevated:true};
 }
}
module.exports={hash,planHash,safe,atomic,alive,validatePending,status,restoreVerified,finish,recover,recoverBeforeLoad};
