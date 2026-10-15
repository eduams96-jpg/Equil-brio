'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const U=require('../desktop/manual-updater.cjs');
(async()=>{
 const baseline=path.resolve(process.argv[2]),release=path.resolve(process.argv[3]);
 const pkg=JSON.parse(fs.readFileSync(path.join(release,'financas-pessoais-v0.39.50.fpupdate'),'utf8'));
 const context={currentVersion:'0.39.49',schemaVersion:2};
 const previous=require(path.join(baseline,'desktop/manual-updater.cjs'));
 assert.throws(()=>previous.validatePackageObject(pkg,context),/assinatura|chave/i);
 const validated=U.validatePackageObject(pkg,context);assert.equal(validated.signatureVerified,true);
 const outcomes=[];
 for(const corrupt of [false,true]){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-release-03950-'));
  const appPath=path.join(base,'Instalação €'),userDataPath=path.join(base,'outro-utilizador');
  try{
   fs.cpSync(baseline,appPath,{recursive:true});
   const staged=await U.stageUpdate({pkg,validated,appPath,userDataPath,currentVersion:'0.39.49'});
   staged.plan.parentPid=2147483647;fs.writeFileSync(staged.planPath,JSON.stringify(staged.plan));
   if(corrupt)fs.writeFileSync(path.join(staged.stagingDir,...validated.files.at(-1).path.split('/')),'broken');
   await U.launchDetachedHelper({planPath:staged.planPath,userDataPath});
   let status;
   for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,100));status=await U.readUpdateStatus(userDataPath);if(['success','failed-rolled-back','failed-rollback-error'].includes(status?.state))break;}
   assert.equal(status?.state,corrupt?'failed-rolled-back':'success');
   const expectedRoot=corrupt?baseline:path.resolve(__dirname,'..');
   for(const file of validated.files) {
    const target=path.join(appPath,...file.path.split('/')),expected=path.join(expectedRoot,...file.path.split('/'));
    if(fs.existsSync(expected))assert.equal(U.sha256Buffer(fs.readFileSync(target)),U.sha256Buffer(fs.readFileSync(expected)),file.path);
    else assert.equal(fs.existsSync(target),false);
   }
   outcomes.push({corrupt,files:validated.files.length,state:status.state});
  }finally{fs.rmSync(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 }
 const result={version:'0.39.50',signatureVerified:true,unmodified03949RejectsNewKey:true,requiresZipTrustBootstrap:true,outcomes};
 fs.writeFileSync(path.join(release,'VALIDACAO-UPDATE.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
