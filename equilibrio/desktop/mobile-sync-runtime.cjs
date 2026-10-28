 'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),tls=require('node:tls');
const {createDesktopBridge}=require('../mobile-sync/server/desktop-bridge.cjs');
function createMobileRuntime(desktop,profile,{safeStorage,onChange,bridgeFactory=createDesktopBridge}={}){
 let service=null,url='',chain=Promise.resolve();
 const settings=path.join(profile,'mobile-connection.json'),vault=path.join(profile,'mobile-tls.bin'),recoveryMarker=path.join(profile,'mobile-recovery-pending');
 const client=require('./shared-space-client.cjs').createSharedSpaceClient(desktop,{safeStorage,onChange});
 const addresses=()=>['127.0.0.1',...Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>x.address)];
 function status(){return {running:!!service,url,spaces:desktop.listSpaces().map(s=>({id:s.id,name:s.name})),devices:service?.listDevices()||[],addresses:addresses(),networkConfigured:fs.existsSync(settings)&&fs.existsSync(vault),clientLinks:client.status(),clientBackups:client.backups(),scope:'during-window'};}
 async function stop(){if(service){const closing=service;service=null;url='';await closing.close();}return status();}
 async function configure({cert,key,pfx,passphrase,caCert,host,port}){
  if(service)throw Error('Para configurar a rede, pára primeiro a ligação.');
  if(!addresses().includes(host)||host==='127.0.0.1'||!Number.isInteger(port)||port<1024||port>65535)throw Error('Escolhe um endereço deste PC e uma porta entre 1024 e 65535.');
  if(!safeStorage?.isEncryptionAvailable())throw Error('A proteção de chaves do Windows não está disponível.');
  const parsed=new crypto.X509Certificate(cert);if(!parsed.checkIP(host)||Date.parse(parsed.validTo)<=Date.now()||Date.parse(parsed.validFrom)>Date.now())throw Error('O certificado não é válido para este endereço ou está fora da validade.');
  const material=pfx?{pfx:Buffer.from(pfx,'base64'),passphrase}:{cert,key};tls.createSecureContext({...material,minVersion:'TLSv1.2'});
  const protectedBytes=safeStorage.encryptString(JSON.stringify(pfx?{cert,pfx,passphrase,caCert}:{cert,key}));fs.writeFileSync(vault+'.tmp',protectedBytes);fs.renameSync(vault+'.tmp',vault);
  fs.writeFileSync(settings+'.tmp',JSON.stringify({host,port}));fs.renameSync(settings+'.tmp',settings);return status();
 }
 async function action(input={}){
  if(input.type==='status')return status();
  if(input.type==='clientConnect'){if(service)throw Error('Pára a partilha central antes de ligar este PC a outro.');await client.connect(input);return status();}
  if(input.type==='clientResume'){await client.resume(input.localId,input.confirm);return status();}
  if(input.type==='clientSync'){await client.sync(input.localId);return status();}
  if(input.type==='clientResolve'){await client.resolve(input.localId,input.choice);return status();}
  if(input.type==='clientDetach'){client.detach(input.localId,input.confirm);return status();}
  if(input.type==='clientBackup')return input.id?client.backup(input.id):client.currentBackup(input.localId);

  if(input.type==='configure')return configure(input);
  if(input.type==='generate'){
   if(service)throw Error('Pára primeiro a ligação.');if(!addresses().includes(input.host)||input.host==='127.0.0.1')throw Error('Escolhe um endereço deste PC.');
   const passphrase=crypto.randomBytes(32).toString('base64'),r=require('node:child_process').spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'mobile-certificate.ps1')],{input:JSON.stringify({host:input.host,passphrase}),windowsHide:true,encoding:'utf8',timeout:30000,env:{...process.env,PSModulePath:[path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/Modules'),'C:/Program Files/WindowsPowerShell/Modules'].join(';')}});
   if(r.status!==0)throw Error('Não foi possível preparar o certificado neste Windows. A configuração anterior foi conservada.');
   const generated=JSON.parse(r.stdout);await configure({...generated,passphrase,host:input.host,port:input.port});return {...status(),caCert:generated.caCert};
  }
  if(input.type==='certificate'){
   if(!safeStorage?.isEncryptionAvailable()||!fs.existsSync(vault))throw Error('Falta preparar o certificado.');const secret=JSON.parse(safeStorage.decryptString(fs.readFileSync(vault)));if(!secret.caCert)throw Error('O certificado foi configurado externamente. Usa o certificado da entidade que o emitiu.');return {caCert:secret.caCert};
  }
  if(input.type==='stop')return stop();
  if(input.type==='start'){
   if(service)return status();if(client.hasLinks())throw Error('Este PC está associado a um PC central. Desliga essa associação antes de o usar como central.');if(!desktop.listSpaces().length)throw Error('Cria primeiro um espaço financeiro nesta cópia.');
   const options={desktop,onChange,recovered:fs.existsSync(recoveryMarker)};
   if(input.network===true){if(!safeStorage?.isEncryptionAvailable()||!fs.existsSync(settings)||!fs.existsSync(vault))throw Error('Configura primeiro o certificado e o endereço de rede.');const cfg=JSON.parse(fs.readFileSync(settings)),secret=JSON.parse(safeStorage.decryptString(fs.readFileSync(vault)));if(!addresses().includes(cfg.host))throw Error('O endereço deste PC mudou. Revê a configuração.');const cert=new crypto.X509Certificate(secret.cert);if(!cert.checkIP(cfg.host)||Date.parse(cert.validTo)<=Date.now())throw Error('Revê o certificado de rede.');Object.assign(options,{host:cfg.host,port:cfg.port,tls:{...(secret.pfx?{pfx:Buffer.from(secret.pfx,'base64'),passphrase:secret.passphrase}:{cert:secret.cert,key:secret.key}),minVersion:'TLSv1.2'}});}
   const next=bridgeFactory(profile,options);try{url=await next.listen();service=next;if(fs.existsSync(recoveryMarker))fs.unlinkSync(recoveryMarker);}catch(e){await next.close();throw e;}return status();
  }
  if(!service)throw Error('Inicia primeiro a ligação neste PC.');
  if(input.type==='approve'){service.refresh?.();if(!desktop.listSpaces().some(s=>s.id===input.spaceId))throw Error('Escolhe o espaço a partilhar.');return {...service.approvePairing({name:typeof input.name==='string'?input.name.slice(0,60):'Dispositivo',grants:[input.spaceId]}),url};}
  if(input.type==='revoke'){if(!service.listDevices().some(d=>d.deviceId===input.deviceId&&!d.revoked))throw Error('Dispositivo indisponível.');service.revoke(input.deviceId);return status();}
  throw Error('Ação indisponível.');
 }
 return {status,action:input=>{const next=chain.then(()=>action(input));chain=next.catch(()=>{});return next;},close:async()=>{await chain;return stop();},guardReplacement:()=>{if(client.hasLinks())throw Error('Desliga a associação ao PC central antes de restaurar ou substituir os espaços. Os dados locais serão conservados.');if(service)throw Error('Pára a ligação aos dispositivos antes de restaurar ou substituir os espaços.');if(fs.existsSync(path.join(profile,'financas.db')))fs.writeFileSync(recoveryMarker,'recovery required');}};
}
module.exports={createMobileRuntime};
