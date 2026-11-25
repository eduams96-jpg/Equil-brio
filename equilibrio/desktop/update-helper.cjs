'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const [planPath, expectedAppPath, profile, mode] = process.argv.slice(2);
const Recovery = require('./update-recovery.cjs');
const Updater = require('./manual-updater.cjs');
const { writeVerifiedAtomic } = require('./verified-backup.cjs');
const validatePackage = (pkg, context) => Updater.validatePackageObject(pkg, {
  ...context,
  requireSignature: mode !== 'development',
});
function sha256(buffer){ return crypto.createHash('sha256').update(buffer).digest('hex'); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function pidAlive(pid){ if(!Number.isSafeInteger(pid)||pid<=0)return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } }
async function targetFor(root, relative){
  if(typeof relative!=='string'||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)))throw Error('Caminho inseguro no plano.');
  let target=path.resolve(root);
  for(const part of relative.split('/')){
    const stat=await fsp.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(stat?.isSymbolicLink())throw Error('Ligação no destino da atualização.');
    target=path.join(target,part);
  }
  const stat=await fsp.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(stat?.isSymbolicLink()||stat?.isDirectory())throw Error('Destino inválido.');
  return target;
}
async function ensureParent(file){ await fsp.mkdir(path.dirname(file), { recursive:true }); }
async function writeStatus(plan, status){
  await ensureParent(plan.statusPath);
  await writeVerifiedAtomic(plan.statusPath, JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2), { retries: 5 });
}
(async()=>{
  let plan;
  let installationStarted = false;
  try {
    const marker=path.join(profile,'update-pending.json');
    const pointer=JSON.parse(await fsp.readFile(marker,'utf8'));
    if(path.resolve(pointer.planPath)!==path.resolve(planPath))throw Error('Plano pendente diferente.');
    plan=Recovery.validatePending(pointer,expectedAppPath,profile,validatePackage);
    pointer.helperPid=process.pid;await writeVerifiedAtomic(marker,JSON.stringify(pointer),{retries:5});
    await writeStatus(plan, { state:'waiting-for-close', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion });
    const deadline = Date.now() + 120000;
    while (pidAlive(Number(plan.parentPid)) && Date.now() < deadline) await sleep(500);
    if (pidAlive(Number(plan.parentPid))) throw new Error('A aplicação não fechou dentro do tempo limite.');
    await sleep(700);
    for(const item of plan.rollbackManifest){
      await targetFor(plan.appPath,item.path);
      if(item.existed && item.sha256){
        const backup=await targetFor(plan.rollbackDir,item.path);
        if(sha256(await fsp.readFile(backup))!==item.sha256)throw Error('Cópia de reversão corrompida: '+item.path);
      }
    }
    await writeStatus(plan, { state:'installing', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion });
    installationStarted = true;
    for (const file of plan.files) {
      const source = await targetFor(plan.stagingDir, file.path);
      const target = await targetFor(plan.appPath, file.path);
      const content = await fsp.readFile(source);
      if (sha256(content) !== file.sha256) throw new Error('Checksum do staging inválido: ' + file.path);
      await ensureParent(target);
      const tempTarget = target + '.update-tmp';
      try {
        const handle=await fsp.open(tempTarget,'wx');
        try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
        if (sha256(await fsp.readFile(tempTarget)) !== file.sha256) throw new Error('Falha ao validar escrita: ' + file.path);
        await fsp.rename(tempTarget, target);
        if(sha256(await fsp.readFile(target))!==file.sha256)throw Error('Ficheiro instalado não confirmado: '+file.path);
      }finally{await fsp.rm(tempTarget,{force:true}).catch(()=>{});}
    }
    const versionText = await fsp.readFile(path.join(plan.appPath, ...plan.versionFile.split('/')), 'utf8');
    const match = versionText.match(/APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]/);
    if (!match || match[1] !== plan.expectedVersion) throw new Error('A versão instalada não corresponde à esperada.');
    await writeStatus(plan, { state:'success', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion, rollbackDir:plan.rollbackDir });
    Recovery.finish(pointer,plan,profile);
  } catch (error) {
    try { if (plan && installationStarted) { await writeStatus(plan,{state:'installing',rollbackStarted:true,fromVersion:plan.currentVersion,toVersion:plan.expectedVersion,error:String(error?.message||error)}); Recovery.restoreVerified(plan); } } catch (rollbackError) {
      if (plan) await writeStatus(plan, { state:'failed-rollback-error', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion, error:String(error?.message||error), rollbackError:String(rollbackError?.message||rollbackError) });
      process.exit(2);
    }
    if (plan) await writeStatus(plan, { state:installationStarted?'failed-rolled-back':'failed-before-install', fromVersion:plan.currentVersion, toVersion:plan.expectedVersion, error:String(error?.message||error), rollbackDir:plan.rollbackDir });
    if (plan) {
      try {
        const markerPath = path.join(profile, 'update-pending.json');
        if (fs.existsSync(markerPath)) {
          const pointer = JSON.parse(await fsp.readFile(markerPath, 'utf8'));
          Recovery.finish(pointer, plan, profile);
        }
      } catch {}
    }
    process.exit(1);
  }
})();
