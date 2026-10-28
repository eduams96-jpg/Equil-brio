'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../shared/protocol.cjs'),{Association}=require('../shared/association.cjs'),{Client}=require('../shared/client.cjs'),{SqliteStore}=require('./sqlite-store.cjs'),{createService}=require('./service.cjs');
const root=path.resolve(__dirname,'../profiles/pairing-tests',P.id());
async function setup(t){
 const folder=path.join(root,P.id());fs.mkdirSync(folder,{recursive:true});let clock=Date.now();
 const ctx={folder,file:path.join(folder,'server.db'),options:{now:()=>clock},advance:ms=>{clock+=ms;}};
 ctx.service=createService(ctx.file,ctx.options);ctx.url=await ctx.service.listen();
 ctx.store=new SqliteStore(path.join(folder,'client.db'),P.offlineFixture());
 let saved=null,failKind=null;
 ctx.vault={read:async()=>saved?P.copy(saved):null,write:async value=>{if(value.kind===failKind){failKind=null;throw Error('Injected vault commit failure');}saved=P.copy(value);},clear:async()=>{saved=null;},fail:kind=>{failKind=kind;}};
 ctx.raw=async(url,method,p,data,credential)=>{const response=await fetch(url+p,{method,headers:{'content-type':'application/json',...(credential?{authorization:'Bearer '+credential}:{})},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(response.status>=400)throw Object.assign(Error('HTTP '+response.status),{status:response.status});return result;};
 ctx.association=new Association(ctx.store,ctx.vault,(...args)=>ctx.raw(...args));
 ctx.input=approval=>({protocolVersion:1,serverId:approval.serverId,epoch:approval.epoch,code:approval.code,requestId:P.id(),credential:crypto.randomBytes(32).toString('hex')});
 ctx.claim=input=>ctx.raw(ctx.url,'POST','/api/v1/pair/claim',input);
 t.after(async()=>{ctx.store.close();await ctx.service.close();});return ctx;
}
test('Apenas código aprovado concede os espaços escolhidos; código e credencial não ficam em claro no servidor',async t=>{
 const x=await setup(t),approval=x.service.approvePairing({name:'Android',grants:['casa']}),input=x.input(approval);
 const result=await x.claim({...input,grants:['privado']});assert.deepEqual(result.grants,['casa']);assert.equal(x.service.listDevices().length,1);
 const state=JSON.stringify(x.service.store.read().state);assert.equal(state.includes(input.credential),false);assert.equal(state.includes(approval.code.replaceAll('-','')),false);
 await assert.rejects(x.raw(x.url,'GET','/api/v1/spaces/privado/bootstrap',undefined,input.credential),{status:403});
});
test('Código não aprovado ou expirado não cria dispositivo',async t=>{
 const x=await setup(t),approval=x.service.approvePairing(),input=x.input(approval);
 await assert.rejects(x.claim({...input,code:'0000-0000-0000-0000'}),{status:403});x.advance(120001);await assert.rejects(x.claim(input),{status:403});assert.equal(x.service.listDevices().length,0);
});
test('Código é de uso único; repetição exata conserva identidade após reinício e fim do prazo',async t=>{
 const x=await setup(t),approval=x.service.approvePairing(),input=x.input(approval),first=await x.claim(input);
 await assert.rejects(x.claim({...input,requestId:P.id(),credential:crypto.randomBytes(32).toString('hex')}),{status:409});
 await x.service.close();x.advance(180000);x.service=createService(x.file,x.options);x.url=await x.service.listen();const repeated=await x.claim(input);assert.equal(repeated.deviceId,first.deviceId);assert.equal(x.service.listDevices().length,1);
});
test('Mesma credencial ou pedido não pode criar outra identidade com outro código',async t=>{
 const x=await setup(t),a=x.service.approvePairing(),input=x.input(a);await x.claim(input);const b=x.service.approvePairing();
 await assert.rejects(x.claim({...input,code:b.code}),{status:409});await assert.rejects(x.claim({...input,code:b.code,credential:crypto.randomBytes(32).toString('hex')}),{status:409});assert.equal(x.service.listDevices().length,1);
});
test('Tentativas inválidas têm limite e voltam a estar disponíveis depois de um minuto',async t=>{
 const x=await setup(t),approval=x.service.approvePairing(),input=x.input(approval);for(let i=0;i<8;i++)await assert.rejects(x.claim({...input,code:'0000000000000000'}));
 await assert.rejects(x.claim(input),{status:429});x.advance(60001);assert.ok((await x.claim(input)).deviceId);
});
test('Revogação bloqueia a credencial e a repetição da associação; nova geração invalida códigos antigos',async t=>{
 const x=await setup(t),a=x.service.approvePairing(),input=x.input(a),result=await x.claim(input);x.service.revoke(result.deviceId);
 await assert.rejects(x.claim(input),{status:401});await assert.rejects(x.raw(x.url,'GET','/api/v1/identity',undefined,input.credential),{status:401});
 const next=x.service.approvePairing(),old=x.input(next);x.service.rotateEpoch();await assert.rejects(x.claim(old),{status:409});
});
test('Falha do armazenamento protegido antes do envio não reclama o código',async t=>{
 const x=await setup(t),approval=x.service.approvePairing();x.vault.fail('pairing');await assert.rejects(x.association.start(x.url,approval.code));assert.equal(x.service.listDevices().length,0);assert.equal(await x.vault.read(),null);
});
test('Perda da resposta após aprovação conserva pedido e retoma sem criar outro dispositivo',async t=>{
 const x=await setup(t),approval=x.service.approvePairing();let lose=true;const raw=x.raw;x.raw=async(...args)=>{const result=await raw(...args);if(args[2]==='/api/v1/pair/claim'&&lose){lose=false;throw Error('Injected response loss');}return result;};
 await assert.rejects(x.association.start(x.url,approval.code));assert.equal((await x.vault.read()).kind,'pairing');assert.equal(x.service.listDevices().length,1);
 await assert.rejects(x.association.cancel(),/já aprovou/);x.advance(180000);const paired=await x.association.resume();assert.equal(paired.kind,'paired');assert.equal(x.service.listDevices().length,1);
});
test('Falha SQLite depois da aprovação preserva associação pendente e base; retoma mais tarde',async t=>{
 const x=await setup(t),approval=x.service.approvePairing(),replace=x.store.replace.bind(x.store);let fail=true;x.store.replace=(...args)=>{if(fail){fail=false;throw Error('Injected SQLite commit failure');}return replace(...args);};
 await assert.rejects(x.association.start(x.url,approval.code));assert.equal(x.store.read().state.serverId,'unpaired');assert.equal((await x.vault.read()).kind,'pairing');await x.association.resume();assert.equal(x.service.listDevices().length,1);
});
test('Falha do cofre após COMMIT SQLite: reiniciar e retomar preserva movimentos entretanto guardados',async t=>{
 const x=await setup(t),approval=x.service.approvePairing();x.vault.fail('paired');await assert.rejects(x.association.start(x.url,approval.code));assert.notEqual(x.store.read().state.serverId,'unpaired');
 const before=x.store.read().state;const client=new Client(x.store,()=>{});const op=await client.enqueue('movement.add',{id:P.id(),type:'expense',amountCents:765,description:'Offline durante associação',accountId:'bank',category:'Outros',date:'2026-10-18'});
 x.advance(180000);const recreated=new Association(x.store,x.vault,(...a)=>x.raw(...a));await recreated.resume();const after=x.store.read().state;assert.equal(after.deviceId,before.deviceId);assert.equal(after.outbox[0].operation.operationId,op.operationId);assert.equal(after.outbox[0].operation.payload.amountCents,765);assert.equal((await x.vault.read()).code,undefined);
});
test('Associação nunca substitui movimentos existentes ou base já associada',async t=>{
 const x=await setup(t),approval=x.service.approvePairing(),client=new Client(x.store,()=>{});await client.enqueue('movement.add',{id:P.id(),type:'expense',amountCents:100,description:'Existente',accountId:'bank',category:'Outros',date:'2026-10-18'});
 const old=x.store.read();await assert.rejects(x.association.start(x.url,approval.code),/preservados/);assert.deepEqual(x.store.read(),old);assert.equal(await x.vault.read(),null);
});
test('Código inválido pode ser cancelado após confirmar que o PC não aprovou; não apaga movimentos',async t=>{
 const x=await setup(t);await assert.rejects(x.association.start(x.url,'0000000000000000'),{status:403});const old=x.store.read();await x.association.cancel();assert.equal(await x.vault.read(),null);assert.deepEqual(x.store.read(),old);
 const approval=x.service.approvePairing();const paired=await x.association.start(x.url,approval.code);assert.equal(paired.kind,'paired');assert.equal((await x.association.restore()).deviceId,paired.deviceId);
});
test('Credencial protegida e base com identidade incompatível bloqueiam abertura sem substituição',async t=>{
 const x=await setup(t),approval=x.service.approvePairing();await x.association.start(x.url,approval.code);const old=x.store.read();const saved=await x.vault.read();await x.vault.write({...saved,deviceId:P.id()});await assert.rejects(x.association.restore(),/preservados/);assert.deepEqual(x.store.read(),old);
});
test('Porta incompatível com Fetch é recusada antes de abrir o serviço',async t=>{
 const x=await setup(t),service=createService(path.join(x.folder,'blocked.db'),{port:10080});t.after(()=>service.close());await assert.rejects(service.listen(),/bloqueada/);assert.equal(service.server.listening,false);
});
test('Porta ocupada não termina nem substitui o serviço que já a utiliza',async t=>{
 const x=await setup(t),service=createService(path.join(x.folder,'occupied.db'),{port:Number(new URL(x.url).port)});t.after(()=>service.close());await assert.rejects(service.listen(),{code:'EADDRINUSE'});const info=await x.raw(x.url,'GET','/api/v1/info');assert.equal(info.serverId,x.service.store.read().state.serverId);
});


test('Associação preenchida exige confirmação e conserva integralmente o estado anterior',async t=>{
 const x=await setup(t);x.store.transact(s=>{const op=P.prepare(s,'movement.add',{id:'local-only',type:'expense',description:'Só local',amountCents:500,date:'2026-10-20',category:'Outros',accountId:'bank'});s.outbox.push({operation:op,status:'pending'});});const before=x.store.read();let checkpoint;
 x.store.restoreWithCheckpoint=async(s,r)=>{checkpoint=x.store.read();x.store.replace(s,r);};
 const approval=x.service.approvePairing({grants:['casa']});await assert.rejects(x.association.start(x.url,approval.code),/contém dados/);assert.deepEqual(x.store.read(),before);assert.equal(await x.vault.read(),null);
 await x.association.start(x.url,approval.code,{replaceLocal:true,expectedRevision:before.revision});assert.deepEqual(checkpoint,before);assert.equal(x.store.read().state.outbox.length,0);assert.equal(x.store.read().state.serverId,approval.serverId);assert.equal(checkpoint.state.outbox[0].operation.payload.description,'Só local');
});
test('Alteração local durante associação confirmada recusa substituição e mantém tentativa recuperável',async t=>{
 const x=await setup(t);x.store.transact(s=>s.confirmed.ledger.pendingPayments.push({id:'due',description:'Seguro',type:'expense',amount:20,date:'2026-10-20',account:'Conta à ordem',status:'pending'}));x.store.restoreWithCheckpoint=async(s,r)=>x.store.replace(s,r);const approval=x.service.approvePairing({grants:['casa']}),raw=x.raw;let interrupted=false;
 x.raw=async(...args)=>{const result=await raw(...args);if(args[2].endsWith('/bootstrap')&&!interrupted){interrupted=true;x.store.transact(s=>s.hidden=true);}return result;};
 const before=x.store.read();await assert.rejects(x.association.start(x.url,approval.code,{replaceLocal:true,expectedRevision:before.revision}),/mudou/);assert.equal(x.store.read().state.serverId,'unpaired');assert.equal(x.store.read().state.hidden,true);assert.equal((await x.vault.read()).kind,'pairing');
});


test('Desligar associação arquiva operações e recupera falha depois da escrita SQLite',async t=>{
 const x=await setup(t),approval=x.service.approvePairing({grants:['casa']});await x.association.start(x.url,approval.code);const original=x.store.read();let archive;
 x.store.importWithArchive=async(state,source,revision)=>{archive=source;x.store.replace(state,revision);};
 const clear=x.vault.clear;x.vault.clear=async()=>{throw Error('Injected clear failure');};await assert.rejects(x.association.detach(original.revision),/clear failure/);assert.equal(x.store.read().state.serverId,'unpaired');assert.deepEqual(archive,original.state);assert.equal((await x.vault.read()).kind,'disconnecting');x.vault.clear=clear;assert.equal(await x.association.restore(),null);assert.equal(await x.vault.read(),null);
});
test('Falha SQLite ao desligar mantém credencial e estado utilizáveis',async t=>{
 const x=await setup(t),approval=x.service.approvePairing({grants:['casa']});const connection=await x.association.start(x.url,approval.code),before=x.store.read();x.store.importWithArchive=async()=>{throw Error('Injected storage failure');};await assert.rejects(x.association.detach(before.revision),/storage failure/);assert.deepEqual(x.store.read(),before);assert.deepEqual(await x.association.restore(),connection);
});
