'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const P=require('../shared/protocol.cjs'),{Client}=require('../shared/client.cjs'),{SqliteStore}=require('./sqlite-store.cjs'),{createService}=require('./service.cjs');
const run=path.resolve(__dirname,'../profiles/node-tests',P.id());fs.mkdirSync(run,{recursive:true});
function payload(changes={}){return {id:P.id(),type:'expense',amountCents:1234,description:'Despesa sintética',accountId:'bank',category:'Outros',date:'2026-10-18',...changes};}
async function setup(t){
 const folder=path.join(run,P.id());const service=createService(path.join(folder,'server.db'));const url=await service.listen();
 const aToken=service.provision('device-a'),bToken=service.provision('device-b');const stores=[];
 function transport(token){return async(method,p,data)=>{const r=await fetch(url+p,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json();if(r.status>=400&&value.status!=='epoch-mismatch')throw Object.assign(Error('HTTP '+r.status),{status:r.status});return value;};}
 async function device(name,token){const request=transport(token),bootstrap=await request('GET','/api/v1/spaces/casa/bootstrap');const store=new SqliteStore(path.join(folder,name+'.db'),P.local(bootstrap,name));stores.push(store);return {client:new Client(store,request),store,request};}
 const a=await device('device-a',aToken),b=await device('device-b',bToken);
 t.after(async()=>{for(const store of stores){try{store.close();}catch{}}await service.close();});
 return {service,url,folder,a,b,aToken,bToken,transport};
}
test('Offline: estado e fila sobrevivem à reabertura SQLite e chegam a outro cliente uma única vez',async t=>{
 const x=await setup(t),p=payload();const op=await x.a.client.enqueue('movement.add',p);assert.equal(P.view(x.a.store.read().state).ledger.transactions.length,1);
 const file=path.join(x.folder,'device-a.db');x.a.store.close();const reopened=new SqliteStore(file);t.after(()=>reopened.close());const client=new Client(reopened,x.a.request);
 assert.equal(reopened.read().state.outbox[0].operation.operationId,op.operationId);await client.sync();await x.b.client.sync();
 assert.equal(x.b.store.read().state.confirmed.ledger.transactions.length,1);assert.equal(x.b.store.read().state.confirmed.ledger.accounts[0].balance,1987.66);
});
test('COMMIT seguido de perda de resposta: repetir o mesmo envio não duplica o débito',async t=>{
 const x=await setup(t);const op=await x.a.client.enqueue('movement.add',payload());x.service.loseResponse(op.operationId);await assert.rejects(x.a.client.sync());
 assert.equal(x.service.store.read().state.spaces.casa.ledger.transactions.length,1);assert.equal(x.a.store.read().state.outbox[0].status,'sending');
 await x.a.client.sync();assert.equal(x.service.store.read().state.spaces.casa.cursor,1);assert.equal(x.a.store.read().state.confirmed.ledger.accounts[0].balance,1987.66);
 const first=await x.a.request('POST','/api/v1/spaces/casa/operations',op),again=await x.a.request('POST','/api/v1/spaces/casa/operations',op);assert.deepEqual(first,again);
});
test('Identificador repetido com conteúdo diferente é recusado',async t=>{
 const x=await setup(t),op=await x.a.client.enqueue('movement.add',payload());await x.a.client.sync();const bad=P.copy(op);bad.payload.amountCents=999;
 const result=await x.a.request('POST','/api/v1/spaces/casa/operations',bad);assert.equal(result.code,'operation-id-reused');assert.equal(x.service.store.read().state.spaces.casa.cursor,1);
});
test('Concorrência: uma edição entra, a outra fica em conflito sem perder a proposta',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.sync();await x.b.client.sync();
 await x.a.client.enqueue('movement.update',{...p,amountCents:2000});await x.b.client.enqueue('movement.update',{...p,amountCents:3000});
 await x.a.client.sync();await x.b.client.sync();const last=x.b.store.read().state.outbox.at(-1);assert.equal(last.status,'conflict');assert.equal(last.operation.payload.amountCents,3000);assert.equal(x.b.store.read().state.confirmed.ledger.transactions[0].amount,20);
});
test('Movimentos independentes offline podem entrar ambos',async t=>{
 const x=await setup(t);await x.a.client.enqueue('movement.add',payload());await x.b.client.enqueue('movement.add',payload());await x.a.client.sync();await x.b.client.sync();await x.a.client.sync();assert.equal(x.a.store.read().state.confirmed.ledger.transactions.length,2);
});
test('Transferência atómica: falha antes de COMMIT não altera nenhuma conta nem deixa recibo',async t=>{
 const x=await setup(t),p=payload({targetId:'cash',amountCents:10000,category:'Transferências'});const op=await x.a.client.enqueue('transfer.add',p);x.service.failNextCommit();await assert.rejects(x.a.client.sync());
 const failed=x.service.store.read().state.spaces.casa;assert.equal(failed.ledger.accounts[0].balance,2000);assert.equal(failed.ledger.accounts[1].balance,100);assert.equal(failed.cursor,0);assert.equal(failed.receipts[op.operationId],undefined);
 await x.a.client.sync();const accepted=x.service.store.read().state.spaces.casa;assert.equal(accepted.ledger.accounts[0].balance,1900);assert.equal(accepted.ledger.accounts[1].balance,200);assert.equal(accepted.ledger.transactions.length,1);
});
test('Eliminar e editar com revisão antiga não ressuscita movimentos',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.sync();await x.b.client.sync();await x.a.client.enqueue('movement.delete',{id:p.id});await x.b.client.enqueue('movement.update',{...p,amountCents:4500});await x.a.client.sync();await x.b.client.sync();const space=x.service.store.read().state.spaces.casa;assert.equal(space.ledger.transactions.length,0);assert.equal(space.revisions['transaction:'+p.id],2);assert.equal(x.b.store.read().state.outbox.at(-1).status,'conflict');
});
test('Falha na gravação local de uma página conserva o cursor; repetição não duplica registos',async t=>{
 const x=await setup(t);await x.a.client.enqueue('movement.add',payload());await x.a.client.enqueue('movement.add',payload());await x.a.client.sync();
 let fail=true;const adapter={read:()=>x.b.store.read(),replace:(s,r)=>{if(fail&&s.confirmed.cursor>0){fail=false;throw Error('Injected local write failure');}return x.b.store.replace(s,r);}};
 const observer=new Client(adapter,x.b.request);await assert.rejects(observer.sync());assert.equal(x.b.store.read().state.confirmed.cursor,0);await observer.sync();assert.equal(x.b.store.read().state.confirmed.cursor,2);assert.equal(x.b.store.read().state.confirmed.ledger.transactions.length,2);await observer.sync();assert.equal(x.b.store.read().state.confirmed.ledger.transactions.length,2);
});
test('Criar e editar offline: dependência usa recibo aceite e mantém o envelope original',async t=>{
 const x=await setup(t),p=payload();const a=await x.a.client.enqueue('movement.add',p),b=await x.a.client.enqueue('movement.update',{...p,amountCents:5000});assert.deepEqual(b.dependsOn,[a.operationId]);assert.equal(P.view(x.a.store.read().state).ledger.transactions[0].amount,50);await x.a.client.sync();assert.equal(x.a.store.read().state.outbox.at(-1).status,'acknowledged');assert.equal(x.service.store.read().state.spaces.casa.ledger.transactions[0].amount,50);assert.equal(typeof x.a.store.read().state.outbox.at(-1).operation.readSet['transaction:'+p.id],'object');
});
test('Predecessor recusado bloqueia as operações dependentes',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);await x.a.client.enqueue('movement.update',{...p,amountCents:4000});x.service.store.transact(s=>{s.spaces.casa.ledger.closedMonths.push('2026-10');});await x.a.client.sync();const rows=x.a.store.read().state.outbox;assert.equal(rows[0].status,'rejected');assert.equal(rows[1].status,'blocked');assert.equal(x.service.store.read().state.spaces.casa.ledger.transactions.length,0);
});
test('Autorização: outro espaço, token inválido e revogação são negados',async t=>{
 const x=await setup(t);await assert.rejects(x.a.request('GET','/api/v1/spaces/privado/bootstrap'),e=>e.status===403);await assert.rejects(x.transport('invalid')('GET','/api/v1/spaces/casa/bootstrap'),e=>e.status===401);x.service.revoke('device-a');await assert.rejects(x.a.request('GET','/api/v1/spaces/casa/bootstrap'),e=>e.status===401);assert.equal(x.service.store.read().state.spaces.casa.cursor,0);
});
test('Nova geração bloqueia a fila antiga e preserva a proposta local',async t=>{
 const x=await setup(t),p=payload();await x.a.client.enqueue('movement.add',p);x.service.rotateEpoch();await assert.rejects(x.a.client.sync(),/epoch-mismatch/);assert.equal(x.a.store.read().state.outbox[0].operation.payload.id,p.id);assert.equal(x.a.store.read().state.blocked,'epoch-mismatch');assert.equal(x.service.store.read().state.spaces.casa.cursor,0);
});
test('Protocolo incompatível impede gravação e conserva os dados locais',async t=>{
 const x=await setup(t);await x.a.client.enqueue('movement.add',payload());x.a.store.transact(s=>{s.outbox[0].operation.protocolVersion=99;});await assert.rejects(x.a.client.sync(),/upgrade-required/);assert.equal(x.service.store.read().state.spaces.casa.ledger.transactions.length,0);assert.equal(x.a.store.read().state.outbox.length,1);
});
test('Recibo aceite mas falha na confirmação local: repetir é seguro',async t=>{
 const x=await setup(t);await x.a.client.enqueue('movement.add',payload());let fail=true;const adapter={read:()=>x.a.store.read(),replace:(s,r)=>{if(fail&&s.outbox.some(x=>x.status==='acknowledged')){fail=false;throw Error('Injected acknowledgement failure');}return x.a.store.replace(s,r);}};const client=new Client(adapter,x.a.request);await assert.rejects(client.sync());assert.equal(x.a.store.read().state.outbox[0].status,'sending');await client.sync();assert.equal(x.a.store.read().state.confirmed.ledger.transactions.length,1);assert.equal(x.service.store.read().state.spaces.casa.cursor,1);
});
test('SQLite local rejeita uma revisão desatualizada sem substituir o estado',async t=>{
 const x=await setup(t),before=x.a.store.read();await x.a.client.enqueue('movement.add',payload());assert.throws(()=>x.a.store.replace(before.state,before.revision),/LOCAL_REVISION_CONFLICT/);assert.equal(x.a.store.read().state.outbox.length,1);
});
test('JSON inválido, envelope nulo e pedidos de navegador são recusados',async t=>{
 const x=await setup(t);let r=await fetch(x.url+'/api/v1/spaces/casa/operations',{method:'POST',headers:{authorization:'Bearer '+x.aToken},body:'null'});assert.equal(r.status,400);r=await fetch(x.url+'/api/v1/spaces/casa/bootstrap',{headers:{authorization:'Bearer '+x.aToken,origin:'http://example.invalid'}});assert.equal(r.status,403);assert.equal(x.service.store.read().state.spaces.casa.cursor,0);
});
test('Recibos e identidade sobrevivem ao reinício real do serviço SQLite',async t=>{
 const folder=path.join(run,P.id()),file=path.join(folder,'server.db');let service=createService(file),url=await service.listen();t.after(()=>service.close());
 const token=service.provision('device-restart');
 const request=async(method,p,data)=>{const r=await fetch(url+p,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});assert.equal(r.status,200);return r.json();};
 const boot=await request('GET','/api/v1/spaces/casa/bootstrap'),op=P.prepare(P.local(boot,'device-restart'),'movement.add',payload());
 const first=await request('POST','/api/v1/spaces/casa/operations',op);await service.close();service=createService(file);url=await service.listen();const repeated=await request('POST','/api/v1/spaces/casa/operations',op);assert.deepEqual(repeated,first);assert.equal(service.store.read().state.spaces.casa.cursor,1);
});
test('Pré-condição obrigatória omitida é recusada sem alterar o ledger',async t=>{
 const x=await setup(t),op=await x.a.client.enqueue('movement.add',payload());delete op.readSet.months;
 const result=await x.a.request('POST','/api/v1/spaces/casa/operations',op);assert.equal(result.status,'conflict');assert.equal(x.service.store.read().state.spaces.casa.cursor,0);
});
test('Uma conta arquivada entretanto impede a operação sem perder a proposta local',async t=>{
 const x=await setup(t);await x.a.client.enqueue('movement.add',payload());x.service.store.transact(s=>{s.spaces.casa.ledger.accounts[0].archived=true;s.spaces.casa.revisions['account:bank']++;});await x.a.client.sync();assert.equal(x.a.store.read().state.outbox[0].status,'rejected');assert.equal(x.service.store.read().state.spaces.casa.cursor,0);
});
test('Identificador de operação não pode ser reutilizado noutro espaço',async t=>{
 const x=await setup(t),op=await x.a.client.enqueue('movement.add',payload());await x.a.client.sync();const token=x.service.provision('both',['casa','privado']);const request=x.transport(token);const boot=await request('GET','/api/v1/spaces/privado/bootstrap');const another=P.prepare(P.local(boot,'both'),'movement.add',payload());another.operationId=op.operationId;const result=await request('POST','/api/v1/spaces/privado/operations',another);assert.equal(result.code,'operation-id-reused');assert.equal(x.service.store.read().state.spaces.privado.cursor,0);
});
