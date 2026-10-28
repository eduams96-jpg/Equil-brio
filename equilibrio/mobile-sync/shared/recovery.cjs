'use strict';

const P=require('./protocol.cjs'),Casa=require('../../casa-model.js'),{same}=require('./equality.cjs');

const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});

const limit=8*1024*1024;

function base64(a){let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);}

function bytes(s){if(typeof s!=='string'||s.length>limit*2||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Cópia inválida.');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}

async function key(password,salt){if(typeof password!=='string'||password.length<10||password.length>512)throw Error('Usa uma palavra-passe com pelo menos 10 caracteres.');const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}

function validate(state){if(!state||state.format!==1||!state.confirmed?.ledger||!state.confirmed.revisions||!Number.isSafeInteger(state.confirmed.cursor)||state.confirmed.cursor<0||!Array.isArray(state.outbox)||!['serverId','epoch','spaceId','deviceId'].every(k=>typeof state[k]==='string'&&state[k].length<=120))throw Error('Formato de dados não suportado.');P.Finance.normalize(P.copy(state.confirmed.ledger));Casa.validate(state.confirmed.ledger);for(const row of state.outbox)if(!row?.operation||!P.safeId(row.operation.operationId)||!P.safeId(row.operation.payload?.id)||!['pending','sending','acknowledged','conflict','rejected','blocked'].includes(row.status))throw Error('Histórico da cópia inválido.');const v=P.view(state);if(v.issues.length)throw Error('A cópia tem propostas por rever que não podem ser projetadas nesta versão.');return state;}

async function encrypt(state,password){state=P.compactReceipts(P.copy(state));validate(state);const data=encoder.encode(JSON.stringify(state));if(data.length>limit)throw Error('A cópia excede o limite de 8 MB.');const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),k=await key(password,salt),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('Equilibrio.Android.Backup.1')},k,data));return JSON.stringify({format:'Equilibrio.Android.Backup',version:1,algorithm:'PBKDF2-SHA256-210000/AES-256-GCM',salt:base64(salt),iv:base64(iv),cipher:base64(cipher)});}

async function decrypt(text,password){try{if(typeof text!=='string'||text.length>limit*2)throw Error();const r=JSON.parse(text);if(r.format!=='Equilibrio.Android.Backup'||r.version!==1||r.algorithm!=='PBKDF2-SHA256-210000/AES-256-GCM')throw Error();const salt=bytes(r.salt),iv=bytes(r.iv);if(salt.length!==16||iv.length!==12)throw Error();const k=await key(password,salt),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode('Equilibrio.Android.Backup.1')},k,bytes(r.cipher));if(plain.byteLength>limit)throw Error();return validate(JSON.parse(decoder.decode(plain)));}catch{throw Error('Não foi possível abrir a cópia: palavra-passe, conteúdo ou versão inválidos. Nenhum dado foi substituído.');}}

async function restore(adapter,state,expected){validate(state);const current=await adapter.read();if(current.revision!==expected.revision||!same(current.state,expected.state))throw Error('Os dados mudaram entretanto. Confirma novamente o restauro.');if(state.serverId!=='unpaired'&&['serverId','epoch','spaceId','deviceId'].some(k=>state[k]!==current.state[k]))throw Error('Esta cópia pertence a outra associação. Os dados locais foram preservados.');if(current.state.serverId!=='unpaired'&&state.serverId==='unpaired')throw Error('Não substituas uma associação ativa por uma base offline.');if(!adapter.restoreWithCheckpoint)throw Error('A recuperação segura não está disponível.');await adapter.restoreWithCheckpoint(P.copy(state),expected.revision);}

function portable(source,current){

 validate(source);validate(current);

 if(current.serverId!=='unpaired'||current.outbox.length||current.confirmed.ledger.transactions.length||['movementDraft','commitmentDraft','paymentDraft','houseDraft','accountDraft'].some(k=>current[k])||(current.confirmed.ledger.casa?.catalog||[]).length||(current.confirmed.ledger.pendingPayments||[]).length)throw Error('A passagem exige um dispositivo vazio e sem associação. Os dados existentes foram preservados.');

 if(source.blocked||source.outbox.some(r=>['conflict','rejected','blocked'].includes(r.status)&&!r.resolution))throw Error('Resolve as propostas em revisão no aparelho de origem antes da passagem.');

 const projected=P.view(source);if(projected.issues.length)throw Error('Existem propostas por rever na origem.');

 const ledger=P.copy(projected.ledger),next=P.local({serverId:'unpaired',epoch:'unpaired',spaceId:source.spaceId,snapshot:{ledger,revisions:P.revisions(ledger),cursor:0}},current.deviceId);

 next.hidden=source.hidden===true;

 for(const key of ['movementDraft','commitmentDraft','paymentDraft','houseDraft','accountDraft'])if(source[key])next[key]=P.copy(source[key]);

 next.transferRecord={sourceDeviceId:source.deviceId,sourceServerId:source.serverId,sourceCursor:source.confirmed.cursor,operationCount:source.outbox.length,createdAt:new Date().toISOString()};

 return validate(next);

}

async function transfer(adapter,source,expected){

 const current=await adapter.read();if(current.revision!==expected.revision||!same(current.state,expected.state))throw Error('Os dados mudaram entretanto. Confirma novamente a passagem.');

 const next=portable(source,current.state);if(!adapter.importWithArchive)throw Error('A passagem segura não está disponível.');

 await adapter.importWithArchive(next,P.copy(source),expected.revision);return next;

}

module.exports={encrypt,decrypt,restore,validate,portable,transfer};

