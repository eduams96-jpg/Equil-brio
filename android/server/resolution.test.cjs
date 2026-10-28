'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const P=require('../shared/protocol.cjs'),{Client}=require('../shared/client.cjs'),{SqliteStore}=require('./sqlite-store.cjs'),{createService}=require('./service.cjs');
const root=path.resolve(__dirname,'../profiles/resolution-tests',P.id());
const payload=(changes={})=>({id:P.id(),type:'expense',amountCents:1000,description:'Movimento de revisão',accountId:'bank',category:'Outros',date:'2026-10-19',...changes});
async function setup(t){
 const folder=path.join(root,P.id());fs.mkdirSync(folder,{recursive:true});const service=createService(path.join(folder,'server.db')),url=await service.listen(),stores=[];
 async function device(name){const token=service.provision(name);const request=async(method,p,data)=>{const r=await fetch(url+p,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json();if(r.status>=400&&value.status!=='epoch-mismatch')throw Error('HTTP '+r.status);return value;};const bootstrap=await request('GET','/api/v1/spaces/casa/bootstrap');const store=new SqliteStore(path.join(folder,name+'.db'),P.local(bootstrap,name));stores.push(store);return {store,request,client:new Client(store,request),file:path.join(folder,name+'.db')};}
 const a=await device('a'),b=await device('b');t.after(async()=>{for(const store of stores)try{store.close();}catch{}await service.close();});return {service,a,b,folder};
}
async function conflict(t){const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.sync();await x.b.client.sync();const op=await x.a.client.enqueue('movement.update',{...p,amountCents:3000});await x.b.client.enqueue('movement.update',{...p,amountCents:2000});await x.b.client.sync();await x.a.client.sync();return {...x,p,op};}
test('Criar, editar e eliminar offline conserva envelopes e aplica por ordem sem ressuscitar',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.enqueue('movement.update',{...p,amountCents:2345});await x.a.client.enqueue('movement.delete',{id:p.id});const operations=x.a.store.read().state.outbox.map(r=>P.copy(r.operation));assert.equal(P.view(x.a.store.read().state).ledger.transactions.length,0);
 x.a.store.close();const reopened=new SqliteStore(x.a.file);t.after(()=>reopened.close());const client=new Client(reopened,x.a.request);await client.sync();await x.b.client.sync();assert.equal(x.b.store.read().state.confirmed.ledger.transactions.length,0);assert.equal(x.service.store.read().state.spaces.casa.cursor,3);assert.deepEqual(reopened.read().state.outbox.map(r=>r.operation),operations);
});
test('Transferência criada, editada e eliminada altera as duas contas e não cria receitas/despesas',async t=>{
 const x=await setup(t),p=payload({type:'transfer',targetId:'cash',amountCents:10000});await x.a.client.enqueue('transfer.add',p);await x.a.client.sync();assert.deepEqual(x.a.store.read().state.confirmed.ledger.accounts.map(a=>a.balance),[1900,200]);await x.a.client.enqueue('transfer.update',{...p,amountCents:15000});await x.a.client.sync();const ledger=x.a.store.read().state.confirmed.ledger;assert.deepEqual(ledger.accounts.map(a=>a.balance),[1850,250]);assert.equal(ledger.transactions.filter(t=>['income','expense'].includes(t.type)).length,0);await x.a.client.enqueue('movement.delete',{id:p.id});await x.a.client.sync();assert.deepEqual(x.a.store.read().state.confirmed.ledger.accounts.map(a=>a.balance),[2000,100]);
});
test('Falha durante edição da transferência desfaz ambas as contas e recibo',async t=>{
 const x=await setup(t),p=payload({type:'transfer',targetId:'cash',amountCents:10000});await x.a.client.enqueue('transfer.add',p);await x.a.client.sync();const before=P.copy(x.service.store.read().state.spaces.casa),op=await x.a.client.enqueue('transfer.update',{...p,amountCents:15000});x.service.failNextCommit();await assert.rejects(x.a.client.sync());assert.deepEqual(x.service.store.read().state.spaces.casa,before);assert.equal(x.service.store.read().state.spaces.casa.receipts[op.operationId],undefined);await x.a.client.sync();assert.deepEqual(x.a.store.read().state.confirmed.ledger.accounts.map(a=>a.balance),[1850,250]);
});
test('Destino igual à origem é recusado sem criar pendência',async t=>{
 const x=await setup(t),old=x.a.store.read();await assert.rejects(x.a.client.enqueue('transfer.add',payload({targetId:'bank'})),/destino/);assert.deepEqual(x.a.store.read(),old);
});
test('Formulário com revisão antiga não sobrescreve movimento recebido entretanto',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.sync();await x.b.client.sync();const revision=P.view(x.a.store.read().state).revisions['transaction:'+p.id];await x.b.client.enqueue('movement.update',{...p,amountCents:2000});await x.b.client.sync();await x.a.client.sync();const before=x.a.store.read();await assert.rejects(x.a.client.enqueue('movement.update',{...p,amountCents:3000},{expectedEntityRevision:revision}),/mudou entretanto/);assert.deepEqual(x.a.store.read(),before);
});
test('Manter PC é decisão local durável: preserva proposta/recibo e não altera o financeiro',async t=>{
 const x=await conflict(t),before=x.a.store.read(),ledger=P.copy(before.state.confirmed),row=before.state.outbox.at(-1);await x.a.client.resolve(x.op.operationId,'server');const saved=x.a.store.read();assert.deepEqual(saved.state.confirmed,ledger);assert.deepEqual(saved.state.outbox.at(-1).operation,row.operation);assert.deepEqual(saved.state.outbox.at(-1).receipt,row.receipt);assert.equal(saved.state.outbox.at(-1).resolution.choice,'server');assert.equal(x.service.store.read().state.spaces.casa.cursor,2);x.a.store.close();const reopened=new SqliteStore(x.a.file);t.after(()=>reopened.close());assert.equal(reopened.read().state.outbox.at(-1).resolution.choice,'server');
});
test('Rever proposta cria operação nova ligada ao conflito, com repetição idempotente',async t=>{
 const x=await conflict(t),original=P.copy(x.a.store.read().state.outbox.at(-1));const replacement=await x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2500});assert.notEqual(replacement.operationId,x.op.operationId);assert.equal(replacement.resolvesOperationId,x.op.operationId);assert.deepEqual(x.a.store.read().state.outbox.at(-2).operation,original.operation);await x.a.client.sync();assert.equal(x.a.store.read().state.confirmed.ledger.transactions[0].amount,25);assert.equal(x.service.store.read().state.spaces.casa.receipts[x.op.operationId].resolvedBy,replacement.operationId);const cursor=x.service.store.read().state.spaces.casa.cursor;await x.a.request('POST','/api/v1/spaces/casa/operations',replacement);assert.equal(x.service.store.read().state.spaces.casa.cursor,cursor);
});
test('Resolução de proposta de outro dispositivo é recusada',async t=>{
 const x=await conflict(t);await x.b.client.sync();const op=await x.b.client.enqueue('movement.update',{...x.p,amountCents:4000});op.resolvesOperationId=x.op.operationId;const before=x.service.store.read().state.spaces.casa.cursor,result=await x.b.request('POST','/api/v1/spaces/casa/operations',op);assert.equal(result.status,'rejected');assert.equal(result.code,'invalid-resolution');assert.equal(x.service.store.read().state.spaces.casa.cursor,before);
});
test('Ligação a proposta de outra entidade ou comando é recusada',async t=>{
 const x=await conflict(t),other=payload();const op=await x.a.client.enqueue('movement.add',other);op.resolvesOperationId=x.op.operationId;const result=await x.a.request('POST','/api/v1/spaces/casa/operations',op);assert.equal(result.code,'invalid-resolution');assert.equal(result.snapshot.ledger.transactions.length,1);
});
test('Nova concorrência produz novo conflito; revisão seguinte conserva toda a cadeia',async t=>{
 const x=await conflict(t),second=await x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2500});await x.b.client.enqueue('movement.update',{...x.p,amountCents:4000});await x.b.client.sync();await x.a.client.sync();assert.equal(x.a.store.read().state.outbox.at(-1).status,'conflict');const third=await x.a.client.resolve(second.operationId,'local',{...x.p,amountCents:3500});await x.a.client.sync();assert.equal(x.a.store.read().state.confirmed.ledger.transactions[0].amount,35);assert.equal(third.resolvesOperationId,second.operationId);assert.equal(x.a.store.read().state.outbox.find(r=>r.operation.operationId===x.op.operationId).resolution.replacementOperationId,second.operationId);
});
test('Envio por confirmar não admite resolução ou descarte',async t=>{
 const x=await setup(t),op=await x.a.client.enqueue('movement.add',payload());x.service.loseResponse(op.operationId);await assert.rejects(x.a.client.sync());const before=x.a.store.read();await assert.rejects(x.a.client.resolve(op.operationId,'server'),/não pode/);assert.deepEqual(x.a.store.read(),before);await x.a.client.sync();assert.equal(x.a.store.read().state.outbox[0].status,'acknowledged');
});
test('Uma proposta já revista não cria substituições repetidas',async t=>{
 const x=await conflict(t);await x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2500});const before=x.a.store.read();await assert.rejects(x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2600}),/já foi revista/);assert.deepEqual(x.a.store.read(),before);
});
test('Edição após eliminação no PC não pode ressuscitar o movimento',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.sync();await x.b.client.sync();const op=await x.a.client.enqueue('movement.update',{...p,amountCents:2500});await x.b.client.enqueue('movement.delete',{id:p.id});await x.b.client.sync();await x.a.client.sync();const before=x.a.store.read();await assert.rejects(x.a.client.resolve(op.operationId,'local'),/não existe/);assert.deepEqual(x.a.store.read(),before);await x.a.client.resolve(op.operationId,'server');assert.equal(x.a.store.read().state.confirmed.ledger.transactions.length,0);
});
test('Falha SQLite local durante resolução não deixa decisão nem fila parcial',async t=>{
 const x=await conflict(t),before=x.a.store.read(),replace=x.a.store.replace.bind(x.a.store);x.a.store.replace=()=>{throw Error('Injected SQLite failure');};await assert.rejects(x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2500}));assert.deepEqual(x.a.store.read(),before);x.a.store.replace=replace;await x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2500});assert.equal(x.a.store.read().state.outbox.length,before.state.outbox.length+1);
});
test('Falha central não marca conflito como resolvido nem aplica nova proposta',async t=>{
 const x=await conflict(t),op=await x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2500}),before=P.copy(x.service.store.read().state.spaces.casa);x.service.failNextCommit();await assert.rejects(x.a.client.sync());assert.deepEqual(x.service.store.read().state.spaces.casa,before);await x.a.client.sync();assert.equal(x.service.store.read().state.spaces.casa.receipts[x.op.operationId].resolvedBy,op.operationId);
});
test('Outra pendência do mesmo movimento impede resolução que a sobrescreva',async t=>{
 const x=await conflict(t);await x.a.client.enqueue('movement.update',{...x.p,amountCents:2700});const before=x.a.store.read();await assert.rejects(x.a.client.resolve(x.op.operationId,'local',{...x.p,amountCents:2800}),/por confirmar/);assert.deepEqual(x.a.store.read(),before);
});
test('Eliminação genérica recusa movimentos ligados a crédito',()=>{
 const ledger=P.fixture(),p=payload();P.apply(ledger,'movement.add',p);ledger.transactions[0].debtId='credit';const before=P.copy(ledger);assert.throws(()=>P.apply(ledger,'movement.delete',{id:p.id}),/especializado/);assert.deepEqual(ledger,before);
});
test('Ligação bloqueada não retoma envios nem resolve propostas automaticamente',async t=>{
 const x=await conflict(t);await x.a.client.change(s=>{s.blocked='epoch-mismatch';});const before=x.a.store.read();x.a.client.request=()=>{throw Error('Não devia enviar');};await assert.rejects(x.a.client.sync(),/bloqueada/);await assert.rejects(x.a.client.resolve(x.op.operationId,'server'),/revisão/);assert.deepEqual(x.a.store.read(),before);
});
