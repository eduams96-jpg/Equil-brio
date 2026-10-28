'use strict';
const P=require('./protocol.cjs');
const COLORS=['','default','blue','green','purple','orange','red'];
const context=s=>Object.fromEntries(['serverId','epoch','spaceId','deviceId'].map(k=>[k,s[k]]));
const {same}=require('./equality.cjs');
class SerialAdapter{
 constructor(raw){this.raw=raw;this.chain=Promise.resolve();}
 read(){return this.raw.read();}
 replace(state,revision){return this.raw.replace(state,revision);}
 mutate(fn){const next=this.chain.then(async()=>{const current=await this.raw.read(),state=P.copy(current.state),result=fn(state);await this.raw.replace(state,current.revision);return result;});this.chain=next.catch(()=>{});return next;}
 idle(){return this.chain;}
}
function valid(record){
 if(!record||record.format!==1||!P.safeId(record.token)||!record.form||!P.safeId(record.form.id)||!record.context||typeof record.baseline!=='string'||JSON.stringify(record).length>16000)throw Error('O rascunho não pode ser lido nesta versão. Foi preservado.');
 if(!Number.isSafeInteger(record.sequence)||record.sequence<0||Object.values(record.context).some(v=>typeof v!=='string'||v.length>120))throw Error('Revisão ou contexto do rascunho inválidos.');
 const form=record.form;
 if(!['new','movement.update','transfer.update','movement.add','transfer.add'].includes(form.command))throw Error('Tipo de rascunho inválido.');
 for(const k of ['amount','description','type','accountId','targetId','category','subcategory','categoryDetail','categorySubdetail','date','note','beneficiary','noteColor','expenseNature'])if(typeof form[k]!=='string')throw Error('Campo de rascunho inválido: '+k);
 if(!['income','expense','transfer'].includes(form.type)||!COLORS.includes(form.noteColor))throw Error('Rascunho com tipo ou cor inválidos.');
 if(form.note.length>1000||form.beneficiary.length>200||form.description.length>120)throw Error('O rascunho excede o tamanho permitido.');
 return record;
}
function create(state,form,expectedRevision,baseline,resolvingId=null){return {format:1,token:P.id(),context:context(state),form:P.copy(form),expectedRevision:expectedRevision??null,baseline,resolvingId,sequence:0};}
function staleReason(state,record){
 valid(record);if(!same(context(state),record.context))return 'O espaço ou a associação mudou. O rascunho foi preservado para revisão.';
 if(record.resolvingId){const row=state.outbox.find(r=>r.operation.operationId===record.resolvingId);if(!row||row.resolution||!['conflict','rejected','blocked'].includes(row.status))return 'A proposta anterior já não está disponível para esta revisão. O rascunho foi preservado.';}
 const view=P.view(state),t=view.ledger.transactions.find(t=>t.id===record.form.id);
 if(record.form.command==='new')return t?'Já existe um movimento com esta identidade. Revê o rascunho.':'';
 if(!record.form.command.endsWith('.add')&&!t)return 'O movimento original já não existe. O rascunho não pode recriá-lo.';
 if(!same(view.revisions['transaction:'+record.form.id]||0,record.expectedRevision))return 'O movimento mudou depois de abrires o formulário. O rascunho foi preservado para revisão.';
 return '';
}
function consume(state,choice,selected){
 if(!choice)return;
 const record=state.movementDraft;
 if(!record||record.token!==choice.token||record.sequence!==choice.sequence||record.form.id!==selected.id)throw Error('O rascunho mudou entretanto. Reabre-o antes de guardar.');
 const reason=staleReason(state,record);if(reason)throw Error(reason);
 if(!same(payload(record.form),selected))throw Error('O conteúdo do rascunho mudou. Reabre-o antes de guardar.');
 delete state.movementDraft;
}
class Drafts{
 constructor(adapter){this.adapter=adapter;}
 save(record){valid(record);const copy=P.copy(record);return this.adapter.mutate(state=>{
  if(!same(context(state),copy.context))throw Error('O espaço mudou. O rascunho anterior foi preservado.');
  const previous=state.movementDraft;if(previous&&previous.token!==copy.token)throw Error('Existe outro rascunho. Retoma-o ou descarta-o primeiro.');
  copy.sequence=(previous?.sequence||0)+1;copy.savedAt=new Date().toISOString();state.movementDraft=copy;return P.copy(copy);
 });}
 discard(expected){return this.adapter.mutate(state=>{const actual=state.movementDraft;if(!actual)return;if(!expected||!same(actual,expected))throw Error('O rascunho mudou. Confirma novamente antes de descartar.');delete state.movementDraft;});}
}
function categoryParts(category){const parts=P.Finance.categoryParts(category);if(parts.length>4)throw Error('Esta categoria tem mais de quatro níveis. Usa o percurso especializado para a editar.');return [...parts,...Array(4-parts.length).fill('')];}
function category(form){const parts=['category','subcategory','categoryDetail','categorySubdetail'].map(k=>form[k].trim());let gap=false;for(const part of parts){if(!part)gap=true;else if(gap)throw Error('Preenche os níveis de categoria por ordem, sem saltar níveis.');if(part.length>80||part.includes(' / '))throw Error('Cada campo deve conter apenas um nível de categoria.');}const value=P.Finance.categoryPath(parts);if(!value||value.length>120)throw Error('Indica uma categoria com até 120 caracteres no total.');return value;}
function payload(form){
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(form.amount.trim()))throw Error('Indica um valor com até duas casas decimais.');
 const value={id:form.id,type:form.type,amountCents:Math.round(Number(form.amount.replace(',','.'))*100),description:form.description.trim(),accountId:form.accountId,targetId:form.targetId,category:form.type==='transfer'?'Transferências':category(form),date:form.date,note:form.note,beneficiary:form.beneficiary,noteColor:form.noteColor,expenseNature:form.expenseNature,tags:P.copy(form.tags||[])};
 if(value.note.length>1000||value.beneficiary.length>200||!COLORS.includes(value.noteColor))throw Error('Nota, estabelecimento ou cor inválidos.');return value;
}
module.exports={SerialAdapter,Drafts,create,valid,staleReason,consume,categoryParts,category,payload,COLORS,same};
