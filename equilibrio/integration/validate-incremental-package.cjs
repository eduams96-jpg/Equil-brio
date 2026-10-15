'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const U=require('../desktop/manual-updater.cjs');
async function status(dir){for(let n=0;n<300;n++){await new Promise(r=>setTimeout(r,100));const s=await U.readUpdateStatus(dir);if(['success','failed-rolled-back','failed-rollback-error','failed-before-install'].includes(s?.state))return s;}throw Error('Timeout de atualização.');}
(async()=>{
 const root=path.resolve(__dirname,'..'),baseline=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),version=require('../package.json').version;
 const previous=JSON.parse(fs.readFileSync(path.join(baseline,'package.json'))).version,pkg=JSON.parse(fs.readFileSync(path.join(out,`financas-pessoais-v${version}.fpupdate`))),context={currentVersion:previous,schemaVersion:2};
 const installedUpdater=require(path.join(baseline,'desktop/manual-updater.cjs')),validated=installedUpdater.validatePackageObject(pkg,context);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-incremental-')),outcomes=[];
 try{for(const corrupt of [false,true]){
  const appPath=path.join(directory,corrupt?'rollback':'updated'),userDataPath=path.join(directory,corrupt?'rollback-profile':'updated-profile');fs.cpSync(baseline,appPath,{recursive:true});
  const staged=await installedUpdater.stageUpdate({pkg,validated,appPath,userDataPath,currentVersion:previous});staged.plan.parentPid=2147483647;fs.writeFileSync(staged.planPath,JSON.stringify(staged.plan));
  if(corrupt)fs.writeFileSync(path.join(staged.stagingDir,...validated.files.at(-1).path.split('/')),'corrompido');
  await installedUpdater.launchDetachedHelper({planPath:staged.planPath,userDataPath});const result=await status(userDataPath);assert.equal(result.state,corrupt?'failed-rolled-back':'success');
  for(const file of validated.files){const target=path.join(appPath,file.path),expected=path.join(corrupt?baseline:root,file.path);if(fs.existsSync(expected))assert.equal(U.sha256Buffer(fs.readFileSync(target)),U.sha256Buffer(fs.readFileSync(expected)),file.path);else assert.equal(fs.existsSync(target),false,file.path);}
  if(!corrupt){const r=spawnSync(process.execPath,[path.join(root,'integration/desktop-core-03952.cjs')],{env:{...process.env,APP_TEST_ROOT:appPath},windowsHide:true,encoding:'utf8',timeout:90000});fs.writeFileSync(path.join(out,'installed-desktop.log'),(r.stdout||'')+(r.stderr||''));assert.equal(r.status,0,r.stdout+r.stderr);if(Number(version.split('.')[1])>41||Number(version.split('.')[1])===41&&Number(version.split('.')[2])>=3){const linked=spawnSync(process.execPath,[path.join(root,'integration/native-spaces-0413.cjs')],{env:{...process.env,APP_TEST_ROOT:appPath},windowsHide:true,encoding:'utf8',timeout:90000});fs.writeFileSync(path.join(out,'installed-spaces.log'),(linked.stdout||'')+(linked.stderr||''));assert.equal(linked.status,0,linked.stdout+linked.stderr);}}
  outcomes.push({corrupt,state:result.state,files:validated.files.length});
 }
 const report={version,baseline:previous,passed:true,installedDesktop:true,installedSpaceTransfer:Number(version.split('.')[1])>=41&&Number(version.split('.')[2])>=3,hashesVerified:true,outcomes};fs.writeFileSync(path.join(out,'VALIDACAO-PACOTES.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(path.dirname(directory)!==os.tmpdir()||!path.basename(directory).startsWith('equilibrio-incremental-'))throw Error('Diretório inesperado.');await fs.promises.rm(directory,{recursive:true,force:true,maxRetries:30,retryDelay:100});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
