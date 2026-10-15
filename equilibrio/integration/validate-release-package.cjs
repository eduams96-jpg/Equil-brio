'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const U=require('../desktop/manual-updater.cjs');
async function waitStatus(userDataPath){for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,100));const s=await U.readUpdateStatus(userDataPath);if(['success','failed-rolled-back','failed-rollback-error','failed-before-install'].includes(s?.state))return s;}throw Error('Update timeout');}
(async()=>{
 const root=path.resolve(__dirname,'..'),baseline=path.resolve(process.argv[2]),artifacts=path.resolve(process.argv[3]);
 const updateFile=path.join(artifacts,'financas-pessoais-v0.39.52.fpupdate'),pkg=JSON.parse(fs.readFileSync(updateFile,'utf8')),context={currentVersion:'0.39.51',schemaVersion:2};
 assert.throws(()=>require(path.join(baseline,'desktop/manual-updater.cjs')).validatePackageObject(pkg,context),/assinatura/);
 const validated=U.validatePackageObject(pkg,context);assert.equal(validated.signatureVerified,false);
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-package-03952-'));const outcomes=[];
 try{
  for(const corrupt of [false,true]){
   const appPath=path.join(base,corrupt?'rollback':'updated'),userDataPath=path.join(base,corrupt?'rollback-profile':'updated-profile');fs.cpSync(baseline,appPath,{recursive:true});
   const staged=await U.stageUpdate({pkg,validated,appPath,userDataPath,currentVersion:context.currentVersion});staged.plan.parentPid=2147483647;fs.writeFileSync(staged.planPath,JSON.stringify(staged.plan));
   if(corrupt)fs.writeFileSync(path.join(staged.stagingDir,...validated.files.at(-1).path.split('/')),'corrompido');
   await U.launchDetachedHelper({planPath:staged.planPath,userDataPath});const status=await waitStatus(userDataPath);assert.equal(status.state,corrupt?'failed-rolled-back':'success');
   for(const file of validated.files){const target=path.join(appPath,file.path),expected=path.join(corrupt?baseline:root,file.path);if(fs.existsSync(expected))assert.equal(U.sha256Buffer(fs.readFileSync(target)),U.sha256Buffer(fs.readFileSync(expected)),file.path);else assert.equal(fs.existsSync(target),false);}
   if(!corrupt){
    const result=spawnSync(process.execPath,[path.join(root,'integration/desktop-core-03952.cjs')],{env:{...process.env,APP_TEST_ROOT:appPath},encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(result.status,0,result.stdout+result.stderr);
    // Follow-on chain uses the installed .52 updater, without any key.
    const installed=require(path.join(appPath,'desktop/manual-updater.cjs'));
    for(const [from,to]of [['0.39.52','0.39.53'],['0.39.53','0.39.54']]){
     const content=Buffer.from("const APP_VERSION = '"+to+"';");const next={...pkg,version:to,minAppVersion:from,maxAppVersion:from,files:[{path:'desktop/version.cjs',size:content.length,sha256:U.sha256Buffer(content),contentBase64:content.toString('base64')}]};next.manifestSha256=U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(next)));
     const prepared=await installed.stageUpdate({pkg:next,validated:installed.validatePackageObject(next,{currentVersion:from,schemaVersion:2}),appPath,userDataPath,currentVersion:from});prepared.plan.parentPid=2147483647;fs.writeFileSync(prepared.planPath,JSON.stringify(prepared.plan));await installed.clearUpdateStatus(userDataPath);await installed.launchDetachedHelper({planPath:prepared.planPath,userDataPath});assert.equal((await waitStatus(userDataPath)).state,'success');
    }
   }
   outcomes.push({corrupt,state:status.state,files:validated.files.length});
  }
  const install=path.join(base,'Instalação €'),appPath=path.join(install,'resources/app'),userDataPath=path.join(base,'Perfil €');
  const electronDirectory=path.dirname(process.env.ELECTRON_PATH);fs.cpSync(electronDirectory,install,{recursive:true});fs.cpSync(baseline,appPath,{recursive:true});
  const store=require('../desktop/storage-sqlite.cjs').createSqliteStorage(userDataPath),F=require('../finance.js'),data=F.empty();data.accounts=[{id:'a',name:'Conta fictícia',type:'Banco',balance:123.45}];store.writeSpace('equilibrioData',F.migrateLedgerCore(data));store.close();const original=fs.readFileSync(path.join(userDataPath,'financas.db'));
  const bootstrap=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'ATUALIZAR-SEM-CHAVE.ps1'),'-AppDirectory',install,'-UserDataDirectory',userDataPath],{windowsHide:true,encoding:'utf8',timeout:90000});assert.equal(bootstrap.status,0,bootstrap.stdout+bootstrap.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(appPath,'package.json'),'utf8')).version,'0.39.52');assert.deepEqual(fs.readFileSync(path.join(userDataPath,'financas.db')),original);
  const report={version:'0.39.52',passed:true,unsigned:true,oldMenuRejectsUnsigned:true,bootstrapPowerShellElectron:true,profileUnchanged:true,updatedAppDesktopTest:true,syntheticChain:['0.39.52','0.39.53','0.39.54'],outcomes};
  fs.writeFileSync(path.join(artifacts,'VALIDACAO-PACOTES.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error('Falha original do teste:',error.stack);throw error;}
 finally{if(path.dirname(base)!==os.tmpdir()||!path.basename(base).startsWith('equilibrio-package-03952-'))throw Error('Destino de limpeza inesperado.');await fs.promises.rm(base,{recursive:true,force:true,maxRetries:30,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
