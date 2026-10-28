'use strict';
const P=require('./protocol.cjs');
const Compat=require('./compatibility.cjs');
const D=require('./drafts.cjs');
const K=require('./commitment-drafts.cjs');
const Forms=require('./form-drafts.cjs');
const HouseForm=require('./house-form.cjs');
class Client{
 constructor(adapter,request,options={}){this.adapter=adapter;this.request=request;this.negotiate=options.negotiate===true;}
 async read(){return this.adapter.read();}
 async change(fn){if(this.adapter.mutate)return this.adapter.mutate(fn);const current=await this.read();const state=P.copy(current.state);const result=fn(state);await this.adapter.replace(state,current.revision);return result;}
 checkRevision(state,payload,options,command=''){if(options&&Object.hasOwn(options,'expectedEntityRevision')&&!D.same(P.view(state).revisions[(command.startsWith('account.')?'account:':command.startsWith('commitment.')?'commitment:':'transaction:')+payload.id]||0,options.expectedEntityRevision))throw Error('O registo mudou entretanto. Reabre-o antes de guardar.');}
 async enqueue(command,payload,options){return this.change(state=>{this.checkRevision(state,payload,options,command);D.consume(state,options?.draft,payload);K.consume(state,options?.commitmentDraft,payload);if(options?.accountDraft)Forms.consume(state,'accountDraft',options.accountDraft,payload,Forms.accountPayload,P.view);if(options?.houseDraft)Forms.consume(state,'houseDraft',options.houseDraft,payload,HouseForm.payload,P.view);if(options?.paymentDraft)Forms.consume(state,'paymentDraft',options.paymentDraft,payload,Forms.paymentPayload,P.view);const operation=P.prepare(state,command,payload);state.outbox.push({operation,status:'pending'});return operation;});}
 async resolve(operationId,choice,payload,options){return this.change(state=>{
  if(state.blocked)throw Error('A ligação precisa de revisão antes de resolver propostas.');
  const row=state.outbox.find(r=>r.operation.operationId===operationId);
  if(!row||!['conflict','rejected','blocked'].includes(row.status)||!row.receipt||row.resolution)throw Error('Esta proposta ainda não pode ser resolvida ou já foi revista.');
  if(choice==='server'){row.resolution={choice:'server',basedOnCursor:state.confirmed.cursor};return null;}
  if(choice!=='local')throw Error('Escolha inválida.');
  const selected=payload||row.operation.payload;
  if(selected.id!==row.operation.payload.id)throw Error('A revisão não pode trocar a identidade do movimento.');
  if(state.outbox.some(r=>r!==row&&['pending','sending'].includes(r.status)&&r.operation.payload.id===selected.id))throw Error('Existe uma alteração deste movimento por confirmar. Sincroniza primeiro.');
  this.checkRevision(state,selected,options,row.operation.command);
  D.consume(state,options?.draft,selected);
  const operation=P.prepare(state,row.operation.command,selected);operation.resolvesOperationId=row.operation.operationId;
  row.resolution={choice:'local',replacementOperationId:operation.operationId,basedOnCursor:state.confirmed.cursor};state.outbox.push({operation,status:'pending'});return operation;
 });}
 async sync(){
  const initial=(await this.read()).state;
  if(this.negotiate){if(initial.serverId==='unpaired')throw Error('Dispositivo ainda não associado.');Compat.negotiate(await this.request('GET','/api/v1/info'),initial);const identity=await this.request('GET','/api/v1/identity');if(identity.serverId!==initial.serverId||identity.epoch!==initial.epoch||identity.deviceId!==initial.deviceId||!identity.grants?.includes(initial.spaceId))throw Error('A autorização do dispositivo mudou. As propostas foram preservadas.');}
  if(!this.negotiate){
  if(initial.outbox.some(r=>['pending','sending'].includes(r.status)&&r.operation.command.startsWith('house.')))throw Error('Casa aguarda validação de compatibilidade.');
  if(initial.outbox.some(r=>['pending','sending'].includes(r.status)&&r.operation.command.startsWith('commitment.')))throw Error('A sincronização de compromissos aguarda validação de compatibilidade. Os dados mantêm-se neste dispositivo.');
  if(initial.outbox.some(r=>['pending','sending'].includes(r.status)&&r.operation.command.startsWith('account.')))throw Error('A sincronização de contas aguarda validação de compatibilidade. As contas mantêm-se guardadas neste dispositivo.');
  // Rich form fields need a confirmed compatibility contract before any send.
  // Older experimental services accept the envelope but omit these fields.
  if(initial.outbox.some(r=>['pending','sending'].includes(r.status)&&['note','beneficiary','noteColor','tags','expenseNature'].some(k=>Object.hasOwn(r.operation.payload,k))))throw Error('A sincronização destes campos precisa de validação de compatibilidade. Os movimentos e as notas mantêm-se guardados neste dispositivo.');
  }
  if(initial.blocked)throw Error('A sincronização está bloqueada para revisão. As pendências foram preservadas.');
  if(initial.serverId==='unpaired')throw Error('Protótipo não associado a um servidor de ensaio.');
  for(const row of initial.outbox.filter(x=>['pending','sending'].includes(x.status))){
   await this.change(state=>{state.outbox.find(x=>x.operation.operationId===row.operation.operationId).status='sending';});
   const receipt=await this.request('POST',`/api/v1/spaces/${initial.spaceId}/operations`,row.operation);
   if(['epoch-mismatch','upgrade-required'].includes(receipt.status)){await this.change(state=>{state.blocked=receipt.status;});throw Error('Sincronização bloqueada: '+receipt.status);}
   await this.change(state=>P.applyReceipt(state,receipt));
  }
  for(;;){
   const state=(await this.read()).state;
   const page=await this.request('GET',`/api/v1/spaces/${state.spaceId}/changes?after=${state.confirmed.cursor}&epoch=${encodeURIComponent(state.epoch)}&limit=2`);
   if(page.status||page.epoch!==state.epoch){await this.change(s=>{s.blocked=page.status||'epoch-mismatch';});throw Error('Geração ou protocolo incompatível.');}
   if(!page.events.length)break;
   await this.change(s=>{
    for(const event of page.events){if(event.sequence!==s.confirmed.cursor+1)throw Error('Intervalo de alterações em falta.');s.confirmed=P.copy(event.snapshot);}
   });
  }
  return P.view((await this.read()).state);
 }
}
module.exports={Client};
