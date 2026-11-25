'use strict';
const fs = require('node:fs'), path = require('node:path');
const U = require('../desktop/manual-updater.cjs');
async function applyFromZip(appPath, userDataPath, updatePath, { requireSignature = false } = {}) {
  const currentVersion=JSON.parse(fs.readFileSync(path.join(appPath,'package.json'),'utf8')).version;
  const dbPath=path.join(userDataPath,'financas.db');
  let schemaVersion=2,backupPath=null;
  const {DatabaseSync}=require('node:sqlite');
  const source=fs.existsSync(dbPath)?new DatabaseSync(dbPath,{readOnly:true}):null;
  try {
    if(source)schemaVersion=Number(source.prepare("SELECT value FROM meta WHERE key='db_schema_version'").get()?.value||0);
    const {pkg,validated}=await U.readAndValidatePackage(updatePath,{currentVersion,schemaVersion,requireSignature});
    if(source){
      const directory=path.join(userDataPath,'safety-backups','pre-update-from-zip');
      fs.mkdirSync(directory,{recursive:true});backupPath=path.join(directory,'ledger-'+require('node:crypto').randomUUID()+'.db');
      source.exec("VACUUM INTO '"+backupPath.replace(/'/g,"''")+"'");
      const verify=new DatabaseSync(backupPath,{readOnly:true});
      try{if(verify.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('A cópia SQLite não passou a verificação.');}finally{verify.close();}
      const fd=fs.openSync(backupPath,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    }
    await U.clearUpdateStatus(userDataPath);
    const staged=await U.stageUpdate({pkg,validated,appPath,userDataPath,currentVersion,requireSignature});
    // The PowerShell entrypoint has already required the installed app to close.
    staged.plan.parentPid=2147483647;fs.writeFileSync(staged.planPath,JSON.stringify(staged.plan));
    const marker=path.join(userDataPath,'update-pending.json'),pointer=JSON.parse(fs.readFileSync(marker));
    pointer.planSha256=require('../desktop/update-recovery.cjs').planHash(staged.plan);
    fs.writeFileSync(marker,JSON.stringify(pointer));
    await U.launchDetachedHelper({planPath:staged.planPath,userDataPath,requireSignature});
    let status;
    for(let i=0;i<600;i++){
      await new Promise(r=>setTimeout(r,100));status=await U.readUpdateStatus(userDataPath);
      if(['success','failed-rolled-back','failed-rollback-error','failed-before-install'].includes(status?.state))break;
    }
    if(status?.state!=='success')throw Error('Atualização não concluída: '+JSON.stringify(status));
    return {...status,backupPath};
  }finally{source?.close();}
}
if(require.main===module){
  if(process.argv.length!==5){console.error('Uso: node scripts/apply-update-from-zip.cjs pasta-app pasta-dados ficheiro.fpupdate');process.exitCode=1;}
  else applyFromZip(...process.argv.slice(2),{requireSignature:true}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={applyFromZip};
