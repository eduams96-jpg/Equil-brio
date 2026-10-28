'use strict';

const test=require('node:test'),assert=require('node:assert/strict'),P=require('./protocol.cjs'),R=require('./recovery.cjs');

const password='Ensaio-Equilibrio-2026';

test('Cópia encriptada conserva dados, privacidade e rascunhos integralmente',async()=>{const s=P.offlineFixture('recovery');s.hidden=true;s.movementDraft={format:99,text:'Preenchimento sintético'};const text=await R.encrypt(s,password);assert.ok(!text.includes('Preenchimento'));assert.ok(!text.includes('Conta à ordem'));assert.deepEqual(await R.decrypt(text,password),s);});

test('Palavra-passe errada, conteúdo adulterado e versão desconhecida recusados',async()=>{const text=await R.encrypt(P.offlineFixture('recovery'),password),r=JSON.parse(text);await assert.rejects(R.decrypt(text,'palavra-passe-errada'));r.cipher=(r.cipher[0]==='A'?'B':'A')+r.cipher.slice(1);await assert.rejects(R.decrypt(JSON.stringify(r),password));r.version=2;await assert.rejects(R.decrypt(JSON.stringify(r),password));await assert.rejects(R.encrypt(P.offlineFixture(),'curta'));});

test('Restauro exige revisão apresentada e ponto de recuperação atómico',async()=>{const s=P.offlineFixture('recovery'),before={state:P.copy(s),revision:7};let checkpoint=null,saved=null;const adapter={read:async()=>P.copy(before),restoreWithCheckpoint:async(state,revision)=>{assert.equal(revision,7);checkpoint=P.copy(before);saved=state;}};const next=P.copy(s);next.hidden=true;await R.restore(adapter,next,before);assert.deepEqual(checkpoint,before);assert.deepEqual(saved,next);await assert.rejects(R.restore(adapter,next,{...before,revision:6}),/mudaram/);assert.deepEqual(saved,next);});

test('Cópia de outra associação não substitui base nem credenciais',async()=>{const current={state:P.offlineFixture('phone1'),revision:1},other=P.offlineFixture('phone2');other.serverId='server';let writes=0;await assert.rejects(R.restore({read:async()=>current,restoreWithCheckpoint:async()=>writes++},other,current),/outra associação/);assert.equal(writes,0);});

test('Passagem para aparelho vazio materializa saldo uma vez e arquiva origem sem reutilizar identidade',async()=>{

 const source=P.offlineFixture('old-device');source.serverId='old-server';source.epoch='old-epoch';

 const op=P.prepare(source,'movement.add',{id:'paid',type:'expense',description:'Pagamento',amountCents:1234,date:'2026-10-20',category:'Outros',accountId:'bank'});source.outbox.push({operation:op,status:'sending'});source.hidden=true;

 const current={revision:1,state:P.offlineFixture('new-device')};let written,archive;

 await R.transfer({read:async()=>P.copy(current),importWithArchive:async(s,a,r)=>{assert.equal(r,1);written=s;archive=a;}},source,current);

 assert.equal(written.serverId,'unpaired');assert.equal(written.deviceId,'new-device');assert.equal(written.outbox.length,0);assert.equal(written.confirmed.ledger.transactions.length,1);assert.equal(written.confirmed.ledger.accounts[0].balance,1987.66);assert.equal(written.hidden,true);assert.deepEqual(archive,source);assert.equal(written.transferRecord.operationCount,1);

});

test('Passagem recusa destino preenchido, associado ou origem em conflito sem escrita',async()=>{

 const source=P.offlineFixture('old'),target=P.offlineFixture('new');

 for(const alter of [s=>s.serverId='server',s=>s.movementDraft={form:{}},s=>P.Finance.add(s.confirmed.ledger,{id:'existing',type:'expense',description:'Existente',amount:1,date:'2026-10-20',category:'Outros',account:s.confirmed.ledger.accounts[0].name})]){const current=P.copy(target);alter(current);assert.throws(()=>R.portable(source,current),/vazio/);}

 source.outbox.push({operation:{operationId:'operation',payload:{id:'item'}},status:'conflict'});assert.throws(()=>R.portable(source,target));

});

test('Passagem recusa captura obsoleta e ausência do arquivo atómico',async()=>{

 const state=P.offlineFixture('new'),expected={revision:1,state};await assert.rejects(R.transfer({read:async()=>({revision:2,state})},state,expected),/mudaram/);

 await assert.rejects(R.transfer({read:async()=>expected},state,expected),/segura/);

});

