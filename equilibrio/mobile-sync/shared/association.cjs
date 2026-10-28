'use strict';

const P=require('./protocol.cjs');

function blank(state){return state?.serverId==='unpaired'&&!state.movementDraft&&!(state.commitmentDraft||state.paymentDraft||state.houseDraft||state.accountDraft)&&!(state.confirmed.ledger.pendingPayments||[]).length&&!(state.confirmed.ledger.casa?.catalog||[]).length&&!(state.confirmed.ledger.casa?.stock||[]).length&&state.outbox.length===0&&state.confirmed.ledger.transactions.length===0;}

function endpoint(url){if(typeof url==='string'){try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash&&u.port!=='0')return u.origin;}catch{}}if(typeof url!=='string'||!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(url)||new URL(url).port==='0')throw Error('Neste ensaio usa o endereço local apresentado no PC.');return url;}

function credential(){return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}

async function fingerprint(state){const bytes=new TextEncoder().encode(JSON.stringify(state));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}

class Association{

 constructor(adapter,vault,request){Object.assign(this,{adapter,vault,request});}

 async restore(){

  const saved=await this.vault.read();if(!saved)return null;

  if(saved.kind==='pairing')return saved;
  if(saved.kind==='disconnecting'){
   const state=(await this.adapter.read()).state;
   if(state.serverId==='unpaired'&&state.detachmentToken===saved.token){await this.vault.clear();return null;}
   const previous=saved.previousConnection;
   if(previous?.kind==='paired'&&['serverId','epoch','deviceId','spaceId'].every(k=>state[k]===previous[k])){await this.vault.write(previous);return previous;}
   throw Error('A passagem da ligação foi interrompida. Os dados e a credencial foram conservados para recuperação.');
  }

  const state=(await this.adapter.read()).state;

  if(saved.kind!=='paired'||state.serverId!==saved.serverId||state.epoch!==saved.epoch||state.deviceId!==saved.deviceId||state.spaceId!==saved.spaceId)throw Error('A ligação protegida não corresponde à base local. Os dados foram preservados.');

  endpoint(saved.url);return saved;

 }

 async start(url,code,options={}){

  url=endpoint(url);

  if(await this.vault.read())throw Error('Já existe uma ligação ou associação por concluir.');

  const captured=await this.adapter.read(),before=captured.state;

  const allowReplace=options.replaceLocal===true&&options.expectedRevision===captured.revision&&!!this.adapter.restoreWithCheckpoint;
  if(!allowReplace&&['movementDraft','commitmentDraft','paymentDraft','houseDraft','accountDraft'].some(k=>before[k]))throw Error('Conclui ou descarta o rascunho antes de associar este dispositivo.');

  if(!blank(before)&&!allowReplace)throw Error('A base local contém dados. Os dados existentes foram preservados. Revê a substituição pelos dados do PC; o estado local será conservado num ponto anterior.');

  const normalized=String(code).replace(/[-\s]/g,'').toUpperCase();if(!/^[A-F0-9]{16}$/.test(normalized))throw Error('Indica o código apresentado no PC.');

  const info=await this.request(url,'GET','/api/v1/info');

  if(info.protocolVersion!==1||!P.safeId(info.serverId)||!P.safeId(info.epoch))throw Error('Servidor incompatível.');

  await this.vault.write({kind:'pairing',url,code:normalized,requestId:P.id(),credential:credential(),serverId:info.serverId,epoch:info.epoch,...(!blank(before)?{replaceRevision:captured.revision,replaceFingerprint:await fingerprint(before)}:{})});

  return this.resume();

 }

 async resume(){

  const attempt=await this.vault.read();
  const local=(await this.adapter.read()).state;if(!Number.isSafeInteger(attempt?.replaceRevision)&&local.serverId==='unpaired'&&(local.movementDraft||local.commitmentDraft||local.paymentDraft||local.houseDraft||local.accountDraft))throw Error('Conclui ou descarta o rascunho antes de retomar a associação.');

  const pending=await this.vault.read();if(pending?.kind!=='pairing')throw Error('Não existe uma associação por concluir.');

  endpoint(pending.url);

  const paired=await this.request(pending.url,'POST','/api/v1/pair/claim',{protocolVersion:1,serverId:pending.serverId,epoch:pending.epoch,code:pending.code,requestId:pending.requestId,credential:pending.credential});

  if(paired.serverId!==pending.serverId||paired.epoch!==pending.epoch||!P.safeId(paired.deviceId)||!Array.isArray(paired.grants)||!paired.grants.length||paired.grants.some(id=>!P.safeId(id)))throw Error('Resposta de associação incompatível.');

  const spaceId=paired.grants[0];

  const bootstrap=await this.request(pending.url,'GET',`/api/v1/spaces/${spaceId}/bootstrap`,undefined,pending.credential);

  if(bootstrap.serverId!==pending.serverId||bootstrap.epoch!==pending.epoch||bootstrap.spaceId!==spaceId||!bootstrap.snapshot?.ledger||!Number.isSafeInteger(bootstrap.snapshot.cursor))throw Error('Base inicial incompatível.');

  const old=await this.adapter.read();

  if(blank(old.state)||pending.replaceRevision===old.revision&&pending.replaceFingerprint===await fingerprint(old.state)){

   const next=P.local(bootstrap,paired.deviceId);next.hidden=old.state.hidden;

   if(!blank(old.state)){if(!this.adapter.restoreWithCheckpoint)throw Error('A recuperação segura não está disponível.');await this.adapter.restoreWithCheckpoint(next,old.revision);}else await this.adapter.replace(next,old.revision);

  }else if(old.state.serverId!==paired.serverId||old.state.epoch!==paired.epoch||old.state.deviceId!==paired.deviceId||old.state.spaceId!==spaceId){

   throw Error('A base local mudou durante a associação. Os dados e a ligação pendente foram preservados.');

  }

  const connection={kind:'paired',url:pending.url,credential:pending.credential,serverId:paired.serverId,epoch:paired.epoch,deviceId:paired.deviceId,spaceId};

  await this.vault.write(connection);return connection;

 }

 async detach(expectedRevision){
  const current=await this.adapter.read(),saved=await this.restore();
  if(current.revision!==expectedRevision||saved?.kind!=='paired')throw Error('A ligação ou os dados mudaram. Confirma novamente.');
  if(!this.adapter.importWithArchive)throw Error('A recuperação segura não está disponível.');
  const view=P.view(current.state);if(view.issues.length)throw Error('Revê as propostas pendentes antes de mudar a ligação.');
  const next=P.local({serverId:'unpaired',epoch:'unpaired',spaceId:current.state.spaceId,snapshot:{ledger:P.copy(view.ledger),revisions:P.revisions(view.ledger),cursor:0}},P.id());
  next.hidden=current.state.hidden===true;for(const key of ['movementDraft','commitmentDraft','paymentDraft','houseDraft','accountDraft'])if(current.state[key])next[key]=P.copy(current.state[key]);
  next.detachmentToken=P.id();
  await this.vault.write({kind:'disconnecting',token:next.detachmentToken,previousConnection:saved});
  try{await this.adapter.importWithArchive(next,P.copy(current.state),current.revision);}catch(error){try{await this.vault.write(saved);}catch{}throw error;}
  await this.vault.clear();return next;
 }
 async cancel(){

  const pending=await this.vault.read();if(pending?.kind!=='pairing')throw Error('Não existe uma tentativa por cancelar.');

  if((await this.adapter.read()).state.serverId!=='unpaired')throw Error('A base já está associada. Usa Retomar associação.');

  const info=await this.request(pending.url,'GET','/api/v1/info');

  if(info.serverId!==pending.serverId||info.epoch!==pending.epoch)throw Error('A identidade do servidor mudou; a tentativa foi preservada.');

  try{await this.request(pending.url,'GET','/api/v1/identity',undefined,pending.credential);}

  catch(error){if(error.status===401){await this.vault.clear();return;}throw error;}

  throw Error('O PC já aprovou esta associação. Usa Retomar associação.');

 }

}

module.exports={Association,endpoint};

