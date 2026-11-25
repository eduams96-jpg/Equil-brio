'use strict';
const crypto=require('node:crypto'),https=require('node:https'),http=require('node:http');
const P=require('../mobile-sync/shared/protocol.cjs');
const {same}=require('../mobile-sync/shared/equality.cjs');
const {validateLedger}=require('./ledger-validation.cjs');
const MAX=96*1024*1024;
function networkError(error){const code=error?.code||'';if(['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','CERT_NOT_YET_VALID','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(code))return Object.assign(Error('O certificado do PC central não é válido para esta ligação. Confirma o endereço e escolhe o certificado público correto.'),{code});if(['ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EHOSTUNREACH','ENETUNREACH','ECONNRESET','EPIPE','ERR_STREAM_PREMATURE_CLOSE'].includes(code))return Object.assign(Error('Não foi possível confirmar a ligação ao PC central. Os dados locais foram conservados; tenta sincronizar novamente.'),{code});return error;}
function endpoint(raw,{allowLocalHttp=false}={}){
 const u=new URL(raw);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||allowLocalHttp&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Indica apenas o endereço HTTPS apresentado no PC central.');
 return u.origin;
}
function network(config,method,route,value){
 return new Promise((resolve,reject)=>{
  const url=new URL(route,config.url),content=value===undefined?null:Buffer.from(JSON.stringify(value));
  if(content&&content.length>MAX)return reject(Error('O espaço excede o limite desta ligação. Os dados locais foram conservados.'));
  const req=(url.protocol==='https:'?https:http).request(url,{method,headers:{...(config.credential?{authorization:'Bearer '+config.credential}:{}),'content-type':'application/json',...(content?{'content-length':content.length}:{})},...(config.ca?{ca:config.ca}:{}),minVersion:'TLSv1.2',timeout:20000},res=>{
   let length=0;const parts=[];res.on('data',part=>{length+=part.length;if(length>MAX){res.destroy(Error('Resposta demasiado grande.'));return;}parts.push(part);});
   res.on('error',e=>reject(networkError(e)));res.on('end',()=>{try{const body=JSON.parse(Buffer.concat(parts));if(res.statusCode>=400)throw Object.assign(Error(body.message||'A ligação ao PC central foi recusada.'),{status:res.statusCode,code:body.status});resolve(body);}catch(e){reject(e);}});
  });
  req.on('timeout',()=>req.destroy(Error('O PC central não respondeu. Os dados locais foram conservados.')));req.on('error',e=>reject(networkError(e)));if(content)req.write(content);req.end();
 });
}
function createSharedSpaceClient(desktop,{safeStorage,onChange,request=network,allowLocalHttp=false}={}){
 const db=desktop.bridgeDatabase;
 const exists=()=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_space_clients'").get();
 const ensure=()=>db.exec('CREATE TABLE IF NOT EXISTS shared_space_clients(local_id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS shared_space_recovery(id TEXT PRIMARY KEY,local_id TEXT NOT NULL,created_at TEXT NOT NULL,reason TEXT NOT NULL,payload TEXT NOT NULL)');
 const rows=()=>exists()?db.prepare('SELECT payload FROM shared_space_clients').all().map(x=>JSON.parse(x.payload)):[];
 const get=id=>{const row=rows().find(x=>x.localId===id);if(!row)throw Error('Associação não encontrada.');return row;};
 function save(row){ensure();db.prepare('INSERT INTO shared_space_clients VALUES(?,?) ON CONFLICT(local_id) DO UPDATE SET payload=excluded.payload').run(row.localId,JSON.stringify(row));}
 function atomic(fn){db.exec('SAVEPOINT shared_client_write');try{const result=fn();db.exec('RELEASE shared_client_write');return result;}catch(e){db.exec('ROLLBACK TO shared_client_write; RELEASE shared_client_write');throw e;}}
 function local(id){const entry=desktop.listSpaces().find(s=>s.id===id);if(!entry)throw Error('O espaço local deixou de estar disponível.');const data=desktop.readSpace(id)?.data;if(!data)throw Error('Espaço local indisponível.');return {entry,ledger:data};}
 function write(id,ledger){const {entry}=local(id);desktop.writeSpace(entry.storageKey||entry.key||('equilibrioData'+(id==='main'?'':':'+id)),ledger);}
 function archive(id,reason,replacement){ensure();const recoveryId=P.id(),state=desktop.readState();if(replacement){const {entry}=local(id);state[entry.storageKey||entry.key||('equilibrioData'+(id==='main'?'':':'+id))]=JSON.stringify(replacement);}db.prepare('INSERT INTO shared_space_recovery VALUES(?,?,?,?,?)').run(recoveryId,id,new Date().toISOString(),reason,JSON.stringify(state));return recoveryId;}
 function protect(value){if(!safeStorage?.isEncryptionAvailable())throw Error('A proteção de credenciais do Windows não está disponível.');return safeStorage.encryptString(JSON.stringify(value)).toString('base64');}
 function secret(row){if(!safeStorage?.isEncryptionAvailable())throw Error('A proteção de credenciais do Windows não está disponível.');return JSON.parse(safeStorage.decryptString(Buffer.from(row.secret,'base64')));}
 const call=(row,method,route,value)=>request(secret(row),method,route,value);
 function status(){return rows().map(row=>{let value;try{value=local(row.localId);}catch{}return {localId:row.localId,name:value?.entry.name||'Espaço local indisponível',url:row.url,kind:row.kind,spaceId:row.spaceId,deviceId:row.deviceId,conflict:!!row.conflict,blocked:!value?'local-space-missing':row.blocked||'',pending:row.kind==='linked'&&(!value||!same(value.ledger,row.confirmed.ledger)||!!row.flight),lastSync:row.lastSync||null};});}
 async function identity(row){const info=await call(row,'GET','/api/v1/info');if(info.desktopSharing!==1||info.protocolVersion!==1)throw Error('Atualiza o programa do PC central antes de ligar este Windows.');if(info.serverId!==row.serverId||info.epoch!==row.epoch){row.blocked='epoch-mismatch';save(row);throw Error('A base central foi restaurada ou mudou. Os dados locais foram conservados; revê a associação.');}const id=await call(row,'GET','/api/v1/identity');if(id.deviceId!==row.deviceId||id.serverId!==row.serverId||id.epoch!==row.epoch||!id.grants?.includes(row.spaceId))throw Error('A autorização deste PC mudou. Os dados locais foram conservados.');}
 async function bootstrap(row){const b=await call(row,'GET',`/api/v1/spaces/${row.spaceId}/bootstrap`);if(b.serverId!==row.serverId||b.epoch!==row.epoch||b.spaceId!==row.spaceId||!Number.isSafeInteger(b.snapshot?.cursor)||b.snapshot.cursor<0)throw Error('A base central mudou. Os dados locais foram conservados.');if(!Array.isArray(b.snapshot?.ledger?.accounts)||!Array.isArray(b.snapshot?.ledger?.transactions)||!b.snapshot?.revisions||typeof b.snapshot.revisions!=='object'||Array.isArray(b.snapshot.revisions))throw Error('O PC central devolveu um espaço incompleto.');validateLedger(b.snapshot.ledger);return b.snapshot;}
 async function finishPairing(row){
  const info=await call(row,'GET','/api/v1/info');if(info.desktopSharing!==1||info.protocolVersion!==1)throw Error('O PC central ainda não suporta esta ligação Windows.');
  let cfg=secret(row);
  if(!row.deviceId){
   if(row.serverId&& (row.serverId!==info.serverId||row.epoch!==info.epoch))throw Error('A identidade do PC central mudou durante a associação.');
   row.serverId=info.serverId;row.epoch=info.epoch;save(row);
   const claim=await call(row,'POST','/api/v1/pair/claim',{protocolVersion:1,serverId:row.serverId,epoch:row.epoch,requestId:row.requestId,credential:cfg.credential,code:cfg.code});
   if(claim.serverId!==row.serverId||claim.epoch!==row.epoch||!P.safeId(claim.deviceId)||!claim.grants?.length)throw Error('Resposta de associação inválida.');
   row.deviceId=claim.deviceId;row.spaceId=claim.grants[0];save(row);
  }
  await identity(row);const snap=await bootstrap(row);
  atomic(()=>{if(!same(local(row.localId).ledger,row.expectedLocal))throw Error('Os dados locais mudaram durante a associação. Confirma novamente antes de continuar.');archive(row.localId,'before-association');write(row.localId,snap.ledger);row.kind='linked';row.confirmed=P.copy(snap);delete row.expectedLocal;delete cfg.code;row.secret=protect(cfg);row.lastSync=new Date().toISOString();save(row);});
  onChange?.(row.localId);return status();
 }
 async function connect({localId,url,code,ca='',confirm=false}){
  if(confirm!==true)throw Error('Confirma a substituição deste espaço local pelos dados do PC central.');
  if(rows().some(r=>r.localId===localId))throw Error('Este espaço já tem uma associação. Retoma ou desliga a existente.');
  const origin=endpoint(url,{allowLocalHttp}),expectedLocal=P.copy(local(localId).ledger);
  if(typeof code!=='string'||!/^[A-Fa-f0-9\s-]{16,24}$/.test(code))throw Error('Indica o código temporário apresentado no PC central.');
  if(ca){if(typeof ca!=='string'||ca.length>1048576)throw Error('Certificado inválido.');new crypto.X509Certificate(ca);}
  const row={localId,url:origin,kind:'pairing',requestId:P.id(),expectedLocal,secret:protect({url:origin,code,credential:crypto.randomBytes(32).toString('hex'),ca})};
  save(row);return finishPairing(row);
 }
 async function resume(localId,confirm){const row=get(localId);if(row.kind!=='pairing'||confirm!==true)throw Error('Confirma novamente a associação por concluir.');row.expectedLocal=P.copy(local(localId).ledger);save(row);return finishPairing(row);}
 async function sync(localId){
  let row=get(localId);if(row.kind!=='linked')throw Error('Conclui primeiro a associação.');if(row.conflict||row.blocked)throw Error('Revê o conflito ou a associação antes de sincronizar.');
  await identity(row);
  if(!row.flight&&!same(local(localId).ledger,row.confirmed.ledger)){row.flight={protocolVersion:1,serverId:row.serverId,epoch:row.epoch,deviceId:row.deviceId,spaceId:row.spaceId,operationId:P.id(),baseCursor:row.confirmed.cursor,ledger:P.copy(local(localId).ledger)};save(row);}
  if(row.flight){
   const result=await call(row,'POST',`/api/v1/spaces/${row.spaceId}/desktop-sync`,row.flight);
   if(['epoch-mismatch','upgrade-required'].includes(result.status)){row.blocked=result.status;save(row);throw Error('A base central ou a versão mudou. As alterações locais foram conservadas.');}
   if(result.status!=='accepted'){row.conflict=true;row.lastError=result.message||'A proposta não foi aceite.';save(row);throw Error(row.lastError);}
   if(result.operationId!==row.flight.operationId||result.epoch!==row.epoch||!result.snapshot||result.snapshot.cursor<row.confirmed.cursor)throw Error('Confirmação inválida; a proposta foi conservada.');
   if(!Array.isArray(result.snapshot.ledger?.accounts)||!Array.isArray(result.snapshot.ledger?.transactions))throw Error('Confirmação incompleta; a proposta foi conservada.');validateLedger(result.snapshot.ledger);
   atomic(()=>{if(same(local(localId).ledger,row.flight.ledger))write(localId,result.snapshot.ledger);row.confirmed=P.copy(result.snapshot);row.flight=null;save(row);});
  }
  const before=P.copy(local(localId).ledger),snap=await bootstrap(row);
  if(snap.cursor<row.confirmed.cursor)throw Error('A resposta central está desatualizada.');
  atomic(()=>{
   // Never overwrite a local save which happened while awaiting the network.
   if(same(before,row.confirmed.ledger)&&same(local(localId).ledger,before)){write(localId,snap.ledger);row.confirmed=P.copy(snap);}
   row.lastSync=new Date().toISOString();save(row);
  });
  onChange?.(localId);return status();
 }
 async function resolve(localId,choice){
  const row=get(localId);if(!row.conflict||!['server','local'].includes(choice))throw Error('Não existe um conflito para resolver.');
  await identity(row);const before=P.copy(local(localId).ledger),snap=await bootstrap(row);
  atomic(()=>{if(!same(local(localId).ledger,before))throw Error('Os dados locais mudaram durante a revisão. Repete a escolha.');archive(localId,'before-conflict-'+choice);if(choice==='local')archive(localId,'central-before-conflict-local',snap.ledger);if(choice==='server')write(localId,snap.ledger);row.confirmed=P.copy(snap);row.flight=null;row.conflict=false;save(row);});
  if(choice==='local')return sync(localId);onChange?.(localId);return status();
 }
 function detach(localId,confirm){if(confirm!==true)throw Error('Confirma que queres desligar este espaço, conservando os seus dados locais.');get(localId);atomic(()=>{archive(localId,'before-detach');db.prepare('DELETE FROM shared_space_clients WHERE local_id=?').run(localId);});return status();}
 function backups(){return exists()?db.prepare('SELECT id,local_id AS localId,created_at AS createdAt,reason FROM shared_space_recovery ORDER BY created_at DESC').all():[];}
 function backup(id){const row=exists()&&db.prepare('SELECT payload FROM shared_space_recovery WHERE id=?').get(id);if(!row)throw Error('Cópia anterior indisponível.');return JSON.parse(row.payload);}
 return {status,connect,resume,sync,resolve,detach,backups,backup,currentBackup:localId=>{local(localId);return desktop.readState();},hasLinks:()=>rows().length>0};
}
module.exports={createSharedSpaceClient,endpoint,network};
