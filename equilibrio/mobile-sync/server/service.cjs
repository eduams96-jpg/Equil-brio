'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const Compat=require('../shared/compatibility.cjs');
const P=require('../shared/protocol.cjs'),{SqliteStore}=require('./sqlite-store.cjs');
const {validateLedger}=require('../../desktop/ledger-validation.cjs');
const {createPairing}=require('./pairing.cjs');
const {listen}=require('./listen.cjs');
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function snapshot(space){return P.copy({ledger:space.ledger,revisions:space.revisions,cursor:space.cursor});}
function initial(){const ledger=P.fixture();return {format:1,serverId:P.id(),epoch:P.id(),devices:{},spaces:{casa:{ledger,revisions:P.revisions(ledger),cursor:0,events:[],receipts:{}},privado:{ledger:P.fixture(),revisions:P.revisions(ledger),cursor:0,events:[],receipts:{}}}};}
function createService(file,options={}){
 const store=options.store||new SqliteStore(file,initial());let loseResponseFor=null,persistentResponseLoss=false,failBeforeCommit=false;
 const pairing=createPairing(store,options);
 function provision(deviceId,grants=['casa']){if(!P.safeId(deviceId))throw Error('Invalid device');const token=crypto.randomBytes(32).toString('hex');store.transact(s=>{s.devices[deviceId]={hash:hash(token),grants,revoked:false};});return token;}
 function revoke(deviceId){store.transact(s=>{s.devices[deviceId].revoked=true;});}
 function rotateEpoch(){store.transact(s=>{s.generations??=[];s.generations.push({epoch:s.epoch,rotatedAt:new Date().toISOString(),spaces:P.copy(s.spaces)});s.epoch=P.id();s.pairings={};for(const space of Object.values(s.spaces)){space.cursor=0;space.events=[];space.receipts={};space.revisions=P.revisions(space.ledger);}});}
 function authorize(req,state,spaceId){const bearer=req.headers.authorization||'';if(!bearer.startsWith('Bearer '))throw Object.assign(Error('Dispositivo não autorizado.'),{http:401});const value=hash(bearer.slice(7));const entry=Object.entries(state.devices).find(([,d])=>!d.revoked&&crypto.timingSafeEqual(Buffer.from(d.hash),Buffer.from(value)));if(!entry)throw Object.assign(Error('Dispositivo não autorizado.'),{http:401});if(spaceId&&!entry[1].grants.includes(spaceId))throw Object.assign(Error('Sem acesso a este espaço.'),{http:403});return entry[0];}
 function execute(op,deviceId){return store.transact(state=>{
  if(op.protocolVersion!==1)return {status:'upgrade-required',epoch:state.epoch};
  if(op.serverId!==state.serverId||op.epoch!==state.epoch)return {status:'epoch-mismatch',epoch:state.epoch};
  if(op.deviceId!==deviceId||!P.safeId(op.operationId)||!P.safeId(op.spaceId))return {status:'rejected',code:'invalid-envelope',epoch:state.epoch};
  const space=state.spaces[op.spaceId];if(!space)throw Object.assign(Error('Espaço indisponível.'),{http:404});
  const fingerprint=hash(canonical(op));
  if(Object.entries(state.spaces).some(([other,s])=>other!==op.spaceId&&s.receipts[op.operationId]))return {status:'rejected',code:'operation-id-reused',epoch:state.epoch};
  const prior=space.receipts[op.operationId];
  if(prior){if(prior.deviceId!==deviceId||prior.fingerprint!==fingerprint)return {status:'rejected',code:'operation-id-reused',epoch:state.epoch};return P.copy(prior.result);}
  let result={status:'accepted',operationId:op.operationId,epoch:state.epoch};
  try{
   if(op.resolvesOperationId!==undefined){
    const parent=space.receipts[op.resolvesOperationId];
    if(!P.safeId(op.resolvesOperationId)||!parent||parent.deviceId!==deviceId||!['conflict','rejected','dependency-blocked'].includes(parent.result.status)||parent.entityId!==op.payload?.id||parent.command!==op.command){result.code='invalid-resolution';throw Error('Ligação à proposta anterior inválida ou histórico insuficiente.');}
    if(parent.resolvedBy){result.code='resolution-already-accepted';throw Error('A proposta anterior já foi substituída por uma operação aceite.');}
   }
   if(!op.readSet||typeof op.readSet!=='object'||!Array.isArray(op.dependsOn))throw Error('Pré-condições em falta.');
   for(const dependency of op.dependsOn){if(!P.safeId(dependency)||space.receipts[dependency]?.result.status!=='accepted'){result.status='dependency-blocked';throw Error('A operação anterior não foi aceite.');}}
   if(!(options.contractVersion===2?Compat.commands:['movement.add','movement.update','movement.delete','transfer.add','transfer.update']).includes(op.command))throw Error('Comando não suportado pelo serviço de ensaio.');Compat.validatePayload(op);
   for(const key of P.requirements(space.ledger,op.command,op.payload)){
    let expected=op.readSet[key];
    if(expected&&typeof expected==='object'){
     const receipt=space.receipts[expected.fromOperation];
     if(!op.dependsOn.includes(expected.fromOperation)||!receipt||receipt.deviceId!==deviceId||receipt.result.status!=='accepted'||!receipt.result.changedKeys?.includes(key)&&key!=='transaction:'+expected.entityId)throw Error('Referência de dependência inválida.');
     expected=receipt.result.snapshot.revisions[key]||0;
    }
    if(!Number.isSafeInteger(expected)||expected!==(space.revisions[key]||0)){result.status='conflict';throw Error('Os dados de origem foram alterados.');}
   }
   // Validate all additional explicit preconditions, rather than ignoring them.
   for(const [key,expected] of Object.entries(op.readSet))if(typeof expected==='number'&&expected!==(space.revisions[key]||0)){result.status='conflict';throw Error('Uma dependência mudou.');}
   const next=P.copy(space.ledger);P.apply(next,op.command,op.payload);const checked=validateLedger(next);
   result.changedKeys=Compat.changedKeys(space.ledger,op,checked);if(options.applyLedger)options.applyLedger(op.spaceId,space.ledger,checked);space.ledger=checked;for(const key of result.changedKeys)space.revisions[key]=(space.revisions[key]||0)+1;space.cursor++;
   space.events.push({sequence:space.cursor,operationId:op.operationId,snapshot:snapshot(space)});
   if(op.resolvesOperationId)space.receipts[op.resolvesOperationId].resolvedBy=op.operationId;
   if(failBeforeCommit){failBeforeCommit=false;throw Object.assign(Error('Injected transaction failure'),{injected:true});}
  }catch(error){if(error.injected)throw error;if(result.status==='accepted')result.status='rejected';result.message=error.message;}
  result.snapshot=snapshot(space);
  space.receipts[op.operationId]={deviceId,fingerprint,entityId:op.payload?.id,command:op.command,result:P.copy(result)};return result;
 });}
 async function body(req){let length=0,parts=[];for await(const part of req){length+=part.length;if(length>262144)throw Object.assign(Error('Pedido demasiado grande.'),{http:413});parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Object.assign(Error('JSON inválido.'),{http:400});}}
 const requestHandler=async(req,res)=>{
  const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  try{
   if(req.headers.origin)throw Object.assign(Error('Pedidos de navegador não suportados neste ensaio.'),{http:403});
   const url=new URL(req.url,'http://127.0.0.1');if(options.refresh)options.refresh();const state=store.read().state;
   if(req.method==='GET'&&url.pathname==='/api/v1/info')return send(200,{protocolVersion:1,serverId:state.serverId,epoch:state.epoch,prototype:true,capabilities:options.contractVersion===2?Compat.capabilities:{contract:1,commands:['movement.add','movement.update','movement.delete','transfer.add','transfer.update'],fields:[],fullLedger:false}});
   if(req.method==='POST'&&url.pathname==='/api/v1/pair/claim')return send(200,pairing.claim(await body(req)));
   const match=/^\/api\/v1\/spaces\/([a-zA-Z0-9-]+)(?:\/(bootstrap|operations|changes)(?:\/([a-zA-Z0-9-]+))?)?$/.exec(url.pathname);
   const spaceId=match?.[1],deviceId=authorize(req,state,spaceId);
   if(req.method==='GET'&&url.pathname==='/api/v1/identity')return send(200,{deviceId,serverId:state.serverId,epoch:state.epoch,grants:[...state.devices[deviceId].grants]});
   if(req.method==='GET'&&url.pathname==='/api/v1/spaces')return send(200,{spaces:state.devices[deviceId].grants});
   if(!match||!state.spaces[spaceId]||options.isAvailable&&!options.isAvailable(spaceId))return send(404,{status:'not-found'});
   const space=state.spaces[spaceId];
   if(req.method==='GET'&&match[2]==='bootstrap')return send(200,{serverId:state.serverId,epoch:state.epoch,spaceId,snapshot:snapshot(space)});
   if(req.method==='GET'&&match[2]==='operations'&&match[3]){const r=space.receipts[match[3]];if(!r||r.deviceId!==deviceId)return send(404,{status:'not-found'});return send(200,r.result);}
   if(req.method==='POST'&&match[2]==='operations'&&!match[3]){
    const op=await body(req);
    if(!op||typeof op!=='object'||Array.isArray(op))return send(400,{status:'rejected',code:'invalid-envelope'});
    // Recheck permissions after reading the request body; revocation can occur meanwhile.
    authorize(req,store.read().state,spaceId);
    if(op.spaceId!==spaceId)return send(400,{status:'rejected',code:'space-mismatch'});
    const result=execute(op,deviceId);
    if(result.status==='accepted'&&options.onChange){try{options.onChange(spaceId);}catch{}}
    if(loseResponseFor===op.operationId&&result.status==='accepted'){if(!persistentResponseLoss)loseResponseFor=null;req.socket.destroy();return;}
    return send(200,result);
   }
   if(req.method==='GET'&&match[2]==='changes'){
    if(url.searchParams.get('epoch')!==state.epoch)return send(409,{status:'epoch-mismatch',epoch:state.epoch});
    const after=Number(url.searchParams.get('after')),limit=Math.min(10,Number(url.searchParams.get('limit')||10));
    if(!Number.isSafeInteger(after)||after<0||after>space.cursor||!Number.isSafeInteger(limit)||limit<1)return send(400,{status:'invalid-cursor'});
    return send(200,{epoch:state.epoch,events:space.events.filter(e=>e.sequence>after).slice(0,limit)});
   }
   send(405,{status:'method-not-allowed'});
  }catch(error){send(error.http||500,{status:'error',message:error.http?error.message:'Operação de ensaio interrompida.'});}
 };
 const server=options.tls?require('node:https').createServer(options.tls,requestHandler):http.createServer(requestHandler);
 server.requestTimeout=30000;server.headersTimeout=30000;server.keepAliveTimeout=15000;
 return {store,server,provision,revoke,rotateEpoch,approvePairing:pairing.approve,listDevices:pairing.devices,loseResponse:(id,persistent=false)=>{loseResponseFor=id;persistentResponseLoss=persistent;},clearResponseLoss:()=>{loseResponseFor=null;persistentResponseLoss=false;},failNextCommit:()=>{failBeforeCommit=true;},listen:()=>listen(server,options.port??0,options.host||'127.0.0.1',options.tls?'https':'http'),close:async()=>{if(server.listening)await new Promise(resolve=>server.close(resolve));store.close();}};
}
module.exports={createService,canonical,snapshot};
