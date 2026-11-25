'use strict';
const crypto=require('node:crypto'),P=require('../shared/protocol.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(message,http=400)=>Object.assign(Error(message),{http});
function createPairing(store,{now=Date.now}={}){
 const attempts=[];
 function approve({name='Telemóvel',grants=['casa']}={}){
  if(typeof name!=='string'||!name.trim()||name.length>60||/[\x00-\x1f]/.test(name))throw fail('Nome inválido.');
  return store.transact(state=>{
   if(!Array.isArray(grants)||!grants.length||new Set(grants).size!==grants.length||grants.some(id=>!Object.hasOwn(state.spaces,id)))throw fail('Espaços inválidos.');
   state.pairings??={};
   for(const [k,p] of Object.entries(state.pairings))if(!p?.claim&&p?.expiresAt<=now())delete state.pairings[k];
   if(Object.values(state.pairings).filter(p=>!p.claim&&p.expiresAt>now()).length>=20)throw fail('Já existem demasiados códigos ativos.',429);
   let code;do{code=crypto.randomBytes(8).toString('hex').toUpperCase();}while(state.pairings[hash(code)]);
   const expiresAt=now()+120000;
   state.pairings[hash(code)]={name:name.trim(),grants:[...grants],expiresAt};
   return {code:code.match(/.{4}/g).join('-'),expiresAt,serverId:state.serverId,epoch:state.epoch};
  });
 }
 function claim(input){
  while(attempts.length&&attempts[0]<=now()-60000)attempts.shift();
  if(attempts.length>=8)throw fail('Demasiadas tentativas. Aguarda um minuto.',429);
  try{
   if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Pedido de associação inválido.');
   const {requestId,credential,serverId,epoch}=input;
   const code=typeof input.code==='string'?input.code.replace(/[-\s]/g,'').toUpperCase():'';
   if(!/^[A-F0-9]{16}$/.test(code)||!P.safeId(requestId)||typeof credential!=='string'||!/^[a-f0-9]{64}$/.test(credential))throw fail('Código ou pedido inválido.');
   return store.transact(state=>{
    if(input.protocolVersion!==1)throw fail('Versão de associação incompatível.',426);
    if(serverId!==state.serverId||epoch!==state.epoch)throw fail('A identidade do servidor mudou. Associação preservada para revisão.',409);
    const pairing=state.pairings?.[hash(code)],credentialHash=hash(credential);
    if(!pairing)throw fail('Código inválido, expirado ou indisponível.',403);
    if(pairing.claim){
     if(pairing.claim.requestId!==requestId||pairing.claim.credentialHash!==credentialHash)throw fail('Código já utilizado.',409);
     const device=state.devices[pairing.claim.deviceId];
     if(!device||device.revoked||device.hash!==credentialHash)throw fail('Dispositivo revogado.',401);
    }else{
     if(pairing.expiresAt<=now())throw fail('Código inválido, expirado ou indisponível.',403);
     if(Object.values(state.devices).some(d=>d.hash===credentialHash)||Object.values(state.pairings).some(p=>p.claim?.requestId===requestId))throw fail('Pedido já associado a outro código.',409);
     const deviceId=P.id();
     state.devices[deviceId]={hash:credentialHash,name:pairing.name,grants:[...pairing.grants],revoked:false};
     pairing.claim={requestId,credentialHash,deviceId};
    }
    return {deviceId:pairing.claim.deviceId,serverId:state.serverId,epoch:state.epoch,grants:[...pairing.grants],prototype:true};
   });
  }catch(error){attempts.push(now());throw error;}
 }
 function devices(){return Object.entries(store.read().state.devices).map(([deviceId,d])=>({deviceId,name:d.name||deviceId,grants:[...d.grants],revoked:d.revoked}));}
 return {approve,claim,devices};
}
module.exports={createPairing};
