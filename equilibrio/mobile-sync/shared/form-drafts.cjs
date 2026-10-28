'use strict';
// Independent durable forms. Mutations consume only the displayed draft revision.
const {same}=require('./equality.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const context=s=>['serverId','epoch','spaceId','deviceId'].map(k=>s[k]);
const keys=new Set(['paymentDraft','houseDraft','accountDraft']);
function valid(key,r){if(!keys.has(key)||!r||r.format!==1||typeof r.token!=='string'||!r.form||!Array.isArray(r.context)||!Number.isSafeInteger(r.sequence)||r.sequence<0||JSON.stringify(r).length>40000)throw Error('Rascunho desconhecido; foi preservado.');}
function staleReason(state,r){if(!r)return '';if(!same(r.context,context(state)))return 'Este rascunho pertence a outra associação ou espaço; descarta-o para criar um novo registo.';return '';}
function create(state,form,revisionKey,revision){return {format:1,token:crypto.randomUUID(),context:context(state),form:clone(form),revisionKey,expectedRevision:clone(revision??0),sequence:0};}
function save(adapter,key,record){valid(key,record);const r=clone(record);return adapter.mutate(s=>{if(!same(r.context,context(s)))throw Error('O espaço mudou; o preenchimento foi preservado.');if(s[key]&&s[key].token!==r.token)throw Error('Existe outro rascunho por concluir.');r.sequence=(s[key]?.sequence||0)+1;s[key]=r;return clone(r);});}
function consume(state,key,expected,payload,convert,view){const r=state[key];valid(key,r);if(!same(expected,{token:r.token,sequence:r.sequence})||!same(context(state),r.context)||!same(payload,convert(r.form)))throw Error('O rascunho mudou. Reabre antes de guardar.');if(r.revisionKey&&!same(view(state).revisions[r.revisionKey]||0,r.expectedRevision))throw Error('O registo mudou. O rascunho foi preservado.');delete state[key];}
function discard(adapter,key,expected){return adapter.mutate(s=>{if(!same(s[key],expected))throw Error('O rascunho mudou; confirma novamente.');delete s[key];});}
function paymentPayload(f){if(!/^\d+(?:[.,]\d{1,2})?$/.test(f.amount.trim()))throw Error('Indica um valor com até duas casas decimais.');return {id:f.id,transactionId:f.transactionId,amountCents:Math.round(Number(f.amount.replace(',','.'))*100),date:f.date,changedOn:f.changedOn};}
function accountPayload(f){const p={id:f.id,name:f.name,type:f.type};if(f.command==='account.add')p.openingCents=require('./accounts.cjs').openingCents(f.opening);return p;}
module.exports={create,save,consume,discard,paymentPayload,accountPayload,valid,staleReason};
