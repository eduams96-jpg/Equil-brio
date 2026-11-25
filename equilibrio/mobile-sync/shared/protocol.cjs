'use strict';
const Finance=require('../../finance.js');
const Accounts=require('./accounts.cjs');
const House=require('./house.cjs');
const Commitments=require('./commitments.cjs');
const {editable}=require('./movement-policy.cjs');
const {same}=require('./equality.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const id=()=>globalThis.crypto.randomUUID();
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(value);
function fixture(){
 const ledger=Finance.empty();ledger.ledgerCoreVersion=1;
 ledger.accounts=[{id:'bank',name:'Conta à ordem',type:'Banco',openingBalance:2000,balance:2000},{id:'cash',name:'Carteira',type:'Dinheiro',openingBalance:100,balance:100}];
 return ledger;
}
function emptyOfflineLedger(){
 return {...Finance.empty(),ledgerCoreVersion:1};
}
function isBlankOffline(state){
 if(state?.serverId!=='unpaired'||state.confirmed?.cursor!==0||state.outbox?.length!==0||
    state.blocked||state.transferRecord||['movementDraft','commitmentDraft','paymentDraft','houseDraft','accountDraft'].some(key=>state[key]))return false;
 const ledger=state.confirmed?.ledger;
 if(!Array.isArray(ledger?.accounts)||!Array.isArray(ledger.transactions))return false;
 const baseline=emptyOfflineLedger();
 const candidate={...baseline,...ledger};
 return same(candidate,baseline)||same(candidate,fixture());
}
function revisions(ledger){return Object.fromEntries([['months',1],['categories',1],...ledger.accounts.map(a=>['account:'+a.id,1]),...ledger.transactions.map(t=>['transaction:'+t.id,1]),...(ledger.pendingPayments||[]).map(t=>['commitment:'+t.id,1])]);}
function requirements(ledger,command,payload){
 if(!payload||!safeId(payload.id))throw Error('Identificador de movimento inválido.');
 if(command.startsWith('house.'))return House.requirements(ledger,command,payload);
 if(command.startsWith('commitment.'))return Commitments.requirements(ledger,command,payload);
 if(command.startsWith('account.'))return Accounts.requirements(ledger,command,payload);
 if(!['movement.add','movement.update','movement.delete','transfer.add','transfer.update'].includes(command))throw Error('Comando não suportado neste protótipo.');
 const keys=['months','categories','transaction:'+payload.id];
 const old=ledger.transactions.find(t=>t.id===payload.id);
 if(old){const account=ledger.accounts.find(a=>a.name===old.account);if(account)keys.push('account:'+account.id);if(old.targetAccount){const target=ledger.accounts.find(a=>a.name===old.targetAccount);if(target)keys.push('account:'+target.id);}}
 if(command!=='movement.delete'){
  if(!safeId(payload.accountId)||!ledger.accounts.some(a=>a.id===payload.accountId&&!a.archived))throw Error('Conta indisponível.');
  keys.push('account:'+payload.accountId);
  if(command.startsWith('transfer.')){
   if(!safeId(payload.targetId)||payload.targetId===payload.accountId||!ledger.accounts.some(a=>a.id===payload.targetId&&!a.archived))throw Error('Conta de destino inválida.');
   keys.push('account:'+payload.targetId);
  }
 }
 return [...new Set(keys)];
}
function apply(ledger,command,payload){
 requirements(ledger,command,payload);
 if(command.startsWith('house.'))return House.apply(ledger,command,payload);
 if(command.startsWith('commitment.'))return Commitments.apply(ledger,command,payload);
 if(command.startsWith('account.'))return Accounts.apply(ledger,command,payload);
 if(command==='movement.delete'){
  const old=ledger.transactions.find(t=>t.id===payload.id);
  if(!old)throw Error('O movimento já não existe.');
  if(!editable(old))throw Error('Esta eliminação exige um percurso especializado.');
  Finance.remove(ledger,payload.id);return;
 }
 if(!Number.isSafeInteger(payload.amountCents)||payload.amountCents<=0||payload.amountCents>9999999999)throw Error('Valor inválido em cêntimos.');
 if(typeof payload.description!=='string'||!payload.description.trim()||payload.description.length>120)throw Error('Descrição inválida.');
 if(typeof payload.category!=='string'||payload.category.length>120)throw Error('Categoria inválida.');
 if(!Finance.validDate(payload.date))throw Error('Data inválida.');
 const account=ledger.accounts.find(a=>a.id===payload.accountId);
 const transfer=command.startsWith('transfer.');
 const t={id:payload.id,date:payload.date,type:transfer?'transfer':payload.type,account:account.name,amount:payload.amountCents/100,description:payload.description.trim(),category:payload.category};
 if(!transfer&&!['expense','income'].includes(t.type))throw Error('Tipo de movimento não suportado.');
 if(transfer){t.targetAccount=ledger.accounts.find(a=>a.id===payload.targetId).name;t.targetDate=payload.date;}
 // Optional desktop fields are carried explicitly and retained by older clients.
 for(const key of ['note','beneficiary','noteColor','expenseNature'])if(Object.hasOwn(payload,key)){
  const limit=key==='note'?1000:key==='beneficiary'?160:32;
  if(typeof payload[key]!=='string'||payload[key].length>limit)throw Error('Campo adicional inválido: '+key);
  // Automatic colour is absent in the native ledger; never store an empty string.
  t[key]=key==='noteColor'&&payload[key]===''?undefined:payload[key];
 }
 if(Object.hasOwn(payload,'tags')){if(!Array.isArray(payload.tags)||payload.tags.length>20||payload.tags.some(x=>typeof x!=='string'||x.length>80))throw Error('Etiquetas inválidas.');t.tags=copy(payload.tags);}
 if(t.noteColor&&!['default','green','blue','purple','orange','red'].includes(t.noteColor))throw Error('Cor da nota indisponível neste ensaio.');
 if(t.expenseNature&&!['variable','fixed','exceptional'].includes(t.expenseNature))throw Error('Natureza da despesa inválida.');
 if(command==='movement.update'||command==='transfer.update'){
  const old=ledger.transactions.find(x=>x.id===payload.id);
  if(!old)throw Error('O movimento já não existe.');
  if(!editable(old)||!(transfer?old.type==='transfer':['income','expense'].includes(old.type)))throw Error('Esta correção exige um percurso especializado.');
  for(const key of ['note','beneficiary','noteColor','tags','expenseNature'])if(!Object.hasOwn(payload,key)&&Object.hasOwn(old,key))t[key]=copy(old[key]);
  Finance.update(ledger,payload.id,t);
 }else Finance.add(ledger,t);
 Finance.refreshBalances(ledger);
}
function projected(state){
 const ledger=copy(state.confirmed.ledger),versions=copy(state.confirmed.revisions),issues=[];
 for(const row of state.outbox){
  if(!['pending','sending'].includes(row.status))continue;
  const op=row.operation;
  try{
   for(const key of requirements(ledger,op.command,op.payload)){
    const expected=op.readSet[key],actual=versions[key]||0;
    if(!same(expected,actual))throw Error('A origem mudou; é necessária revisão.');
   }
   const beforeNames=new Map(ledger.accounts.map(a=>[a.id,a.name]));
   apply(ledger,op.command,op.payload);
   const marker={fromOperation:op.operationId,entityId:op.payload.id};
   if(op.command.startsWith('house.')){versions.house=marker;versions['house:'+op.payload.id]=marker;}else if(op.command.startsWith('account.')){
    versions.accounts=marker;versions['account:'+op.payload.id]=marker;
    const oldName=beforeNames.get(op.payload.id),newName=ledger.accounts.find(a=>a.id===op.payload.id)?.name;
    if(oldName&&oldName!==newName)for(const t of ledger.transactions)if(t.account===newName||t.targetAccount===newName)versions['transaction:'+t.id]=marker;
   for(const t of ledger.pendingPayments)if(oldName&&oldName!==newName&&t.account===newName)versions['commitment:'+t.id]=marker;
   }else if(op.command.startsWith('commitment.')){versions.commitments=marker;versions['commitment:'+op.payload.id]=marker;if(op.command==='commitment.settle')versions['transaction:'+op.payload.transactionId]=marker;}else versions['transaction:'+op.payload.id]=marker;
  }catch(error){issues.push({operationId:op.operationId,message:error.message});}
 }
 return {ledger,revisions:versions,issues};
}
function prepare(state,command,payload){
 const p=view(state);apply(copy(p.ledger),command,payload);
 const keys=requirements(p.ledger,command,payload),readSet={};
 for(const key of keys)readSet[key]=p.revisions[key]||0;
 const dependsOn=[...new Set(Object.values(readSet).filter(x=>x&&typeof x==='object').map(x=>x.fromOperation))];
 return {protocolVersion:1,serverId:state.serverId,epoch:state.epoch,spaceId:state.spaceId,deviceId:state.deviceId,operationId:id(),command,payload:copy(payload),readSet,dependsOn};
}
function local(bootstrap,deviceId){return {format:1,serverId:bootstrap.serverId,epoch:bootstrap.epoch,spaceId:bootstrap.spaceId,deviceId,confirmed:copy(bootstrap.snapshot),outbox:[],hidden:false};}
function offlineFixture(deviceId=id()){const ledger=fixture();return local({serverId:'unpaired',epoch:'unpaired',spaceId:'casa',snapshot:{ledger,revisions:revisions(ledger),cursor:0}},deviceId);}
function compactReceipts(state){
 const needed=new Map();
 for(const row of state.outbox||[])for(const [key,value] of Object.entries(row.operation?.readSet||{}))if(value&&typeof value==='object'&&value.fromOperation){if(!needed.has(value.fromOperation))needed.set(value.fromOperation,new Set());needed.get(value.fromOperation).add(key);}
 for(const row of state.outbox||[]){const old=row.receipt?.snapshot;if(!old)continue;const revisions={};const keys=new Set([...(needed.get(row.operation.operationId)||[]),...(row.receipt.changedKeys||Object.keys(old.revisions||{}))]);for(const key of keys)revisions[key]=old.revisions?.[key]||0;row.receipt.snapshot={cursor:old.cursor,revisions};}
 return state;
}
function applyReceipt(state,receipt){
 const row=state.outbox.find(x=>x.operation.operationId===receipt.operationId);if(!row)throw Error('Recibo sem operação local.');
 if(receipt.epoch!==state.epoch)throw Error('Geração incompatível.');
 if(receipt.snapshot&&receipt.snapshot.cursor>=state.confirmed.cursor)state.confirmed=copy(receipt.snapshot);
 row.status=receipt.status==='accepted'?'acknowledged':receipt.status==='conflict'?'conflict':receipt.status==='dependency-blocked'?'blocked':'rejected';row.receipt=copy(receipt);compactReceipts(state);
}
function effectiveReadSet(state,operation){
 return Object.fromEntries(Object.entries(operation.readSet).map(([key,value])=>{
  if(value&&typeof value==='object'){
   const receipt=state.outbox.find(x=>x.operation.operationId===value.fromOperation)?.receipt;
   if(receipt?.status==='accepted')return [key,receipt.snapshot.revisions[key]||0];
  }
  return [key,value];
 }));
}
function view(state){
 // Only live proposals affect the projection. Historical receipt snapshots can be large.
 // projected() owns its ledger/revision copies and never mutates the source rows.
 const derived={confirmed:state.confirmed,outbox:state.outbox.filter(row=>['pending','sending'].includes(row.status)).map(row=>({...row,operation:{...row.operation,readSet:effectiveReadSet(state,row.operation)}}))};
 return projected(derived);
}
module.exports={compactReceipts,Finance,copy,id,safeId,fixture,emptyOfflineLedger,isBlankOffline,revisions,requirements,apply,prepare,local,offlineFixture,applyReceipt,effectiveReadSet,view};
