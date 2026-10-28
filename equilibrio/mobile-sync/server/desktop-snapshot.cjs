'use strict';
const crypto=require('node:crypto'),P=require('../shared/protocol.cjs');
const {validateLedger}=require('../../desktop/ledger-validation.cjs');
const {same}=require('../shared/equality.cjs');
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
const snapshot=space=>P.copy({ledger:space.ledger,revisions:space.revisions,cursor:space.cursor});
function executeDesktopSnapshot(store,op,deviceId,spaceId,{applyLedger}={}){
 return store.transact(state=>{
  if(!op||op.protocolVersion!==1)return {status:'upgrade-required',epoch:state.epoch};
  if(op.serverId!==state.serverId||op.epoch!==state.epoch)return {status:'epoch-mismatch',epoch:state.epoch};
  if(op.deviceId!==deviceId||op.spaceId!==spaceId||!P.safeId(op.operationId))throw Object.assign(Error('Pedido de partilha inválido.'),{http:400});
  const space=state.spaces[spaceId];
  const fingerprint=crypto.createHash('sha256').update(canonical(op)).digest('hex');
  const prior=space.receipts[op.operationId];
  if(prior){if(prior.deviceId!==deviceId||prior.fingerprint!==fingerprint)return {status:'rejected',code:'operation-id-reused',epoch:state.epoch};return P.copy(prior.result);}
  if(Object.entries(state.spaces).some(([id,s])=>id!==spaceId&&s.receipts[op.operationId]))return {status:'rejected',code:'operation-id-reused',epoch:state.epoch};
  let result={status:'accepted',operationId:op.operationId,epoch:state.epoch};
  let checked;
  if(!Number.isSafeInteger(op.baseCursor)||op.baseCursor!==space.cursor){result.status='conflict';result.message='O espaço foi alterado noutro dispositivo. Escolhe a versão a conservar.';}
  else {
   try{checked=validateLedger(op.ledger);if(!op.ledger||!Array.isArray(op.ledger.accounts)||!Array.isArray(op.ledger.transactions))throw Error('O espaço está incompleto.');}
   catch(e){result.status='rejected';result.message=e.message;}
  }
  if(result.status==='accepted'){
   // Native writes and receipt share the same outer SQLite transaction. Do not
   // turn a partial native failure into a committed rejection.
   if(applyLedger)applyLedger(spaceId,space.ledger,checked);
   const keys=new Set(['months','categories','accounts','commitments','house',...Object.keys(space.revisions),...Object.keys(P.revisions(checked)),...['catalog','stock','shopping'].flatMap(k=>[...(space.ledger.casa?.[k]||[]),...(checked.casa?.[k]||[])].map(x=>'house:'+x.id))]);
   if(!same(space.ledger,checked)){for(const key of keys)space.revisions[key]=(space.revisions[key]||0)+1;space.ledger=P.copy(checked);space.cursor++;space.events.push({sequence:space.cursor,operationId:op.operationId,source:'windows-client',snapshot:snapshot(space)});}
  }
  result.snapshot=snapshot(space);
  space.receipts[op.operationId]={deviceId,fingerprint,command:'desktop.snapshot',result:P.copy(result)};
  return result;
 });
}
module.exports={executeDesktopSnapshot};
