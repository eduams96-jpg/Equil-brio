let accountDraftRecord=null;

import Recovery from '../../shared/recovery.cjs';

let recoveryFile=null,recoveryCandidate=null,recoveryExpected=null,recoveryPoints=[],portableMode=false;

const backupFiles=registerPlugin('BackupFiles');

import House from '../../shared/house.cjs';

import HouseForm from '../../shared/house-form.cjs';

import Casa from './screens/casa.cjs';

let houseTab='produtos',houseId=null,hf=null,hr=null,houseDiscard=null;

let shopFilters={status:'todo',storeId:'',query:'',inStore:false},shopId=null,shopForm=null,shopAdd={query:'',qty:'1',name:''},shopTimer=null;

import Forms from '../../shared/form-drafts.cjs';

let pf=null,pr=null,paymentDiscard=null;

import {registerPlugin,Capacitor,CapacitorHttp} from '@capacitor/core';

import P from '../../shared/protocol.cjs';

import C from '../../shared/client.cjs';

import A from '../../shared/association.cjs';

import V from './view-model.cjs';

import D from '../../shared/drafts.cjs';

import Accounts from '../../shared/accounts.cjs';

import Policy from '../../shared/movement-policy.cjs';

import Agenda from './screens/agenda.cjs';

import K from '../../shared/commitment-drafts.cjs';

import Commitments from '../../shared/commitments.cjs';

import Nav from './nav.cjs';

import Mais from './screens/mais.cjs';

import Resumo from './screens/resumo.cjs';

import Movimentos from './screens/movimentos.cjs';

import Compras from './screens/compras.cjs';
import Relatorios from './screens/relatorios.cjs';
import Patrimonio from './screens/patrimonio.cjs';
import Avisos from './screens/avisos.cjs';
import Notifier from './notifier.cjs';
import {LocalNotifications} from '@capacitor/local-notifications';
import Dossiers from '../../../equilibrio/dossiers-model.js';

import Contas from './screens/contas.cjs';

import Ligacao from './screens/ligacao.cjs';

const LAST_SYNC_KEY='equilibrio.mobile.lastSync';

function readLastSync(){try{return localStorage.getItem(LAST_SYNC_KEY);}catch{return null;}}

function markSynced(){try{localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());}catch{}}

let cf=null,cr=null,cfBaseline=null,commitmentId=null,commitDiscard=null,commitWrite=0;

let showCompletedAgenda=false;

let repSel=null;

let accountForm=null,accountRevision=null,accountBaseline=null,accountNext=null,archiveRevision=null;

if(typeof globalThis.structuredClone!=='function')globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));

const store=registerPlugin('PrototypeStore');

const protectedStore=registerPlugin('ConnectionVault');

const vault={read:async()=>(await protectedStore.read()).connection,write:connection=>protectedStore.write({connection}),clear:()=>protectedStore.clear()};

const adapter=new D.SerialAdapter({read:()=>store.read(),replace:(state,revision)=>store.compareAndSet({state,expectedRevision:revision})});

const drafts=new D.Drafts(adapter);

const commitmentDrafts=new K.Drafts(adapter);

const main=document.getElementById('main'),message=document.getElementById('message');

let page='resumo',renderedPage=null,busy=false,connection=null,savedConnection=null,current;

let selectedId=null,draft=null,formRevision=null,resolvingId=null,conflictId=null,deleteRevision=null,draftRecord=null,draftWriteId=0,discardCandidate=null;

let summaryPeriod=today().slice(0,7),filters={query:'',period:'',accountId:'',type:'',status:''},visibleLimit=40,selectedAccount=null,detailReturn='movimentos',draftBaseline=null,pendingPage=null;

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function rawRequest(url,method,path,data,credential){

 url=A.endpoint(url);

 const result=await CapacitorHttp.request({url:url+path,method,headers:{...(credential?{Authorization:'Bearer '+credential}:{}),'Content-Type':'application/json'},...(data?{data}:{}),connectTimeout:4000,readTimeout:4000,responseType:'json',disableRedirects:true});

 if(result.status>=400&&result.data?.status!=='epoch-mismatch')throw Object.assign(Error(result.data?.message||`Ligação recusada (${result.status}).`),{status:result.status});

 return result.data;

}

async function request(method,path,data){if(!connection)throw Error('Sem PC associado.');return rawRequest(connection.url,method,path,data,connection.credential);}

const client=new C.Client(adapter,request,{negotiate:true});

// Avisos calculados uma vez por estado: a cache cai em cada gravação ou sincronização e quando muda o dia ou a revisão.
let noticesCache=null;
// Definições locais (a Tarefa 13 trá-las para o ecrã); a notificação diária fica dormente enquanto `notifications` for falso.
const settings={notifications:false,hour:9,theme:'auto',hideOnOpen:false};
// Reagenda a notificação diária: em série, só se ativa, e uma falha nunca estraga a app.
let notifyChain=Promise.resolve();
function rescheduleNotifications(){if(!settings.notifications)return notifyChain;notifyChain=notifyChain.then(async()=>{const saved=await adapter.read();if(!saved.state)return;await Notifier.schedule(P.view(saved.state).ledger,settings,{hidden:!!saved.state.hidden,now:new Date()},LocalNotifications);}).catch(()=>{});return notifyChain;}
for(const name of ['enqueue','sync','resolve']){const original=client[name]&&client[name].bind(client);if(original)client[name]=async(...args)=>{noticesCache=null;try{return await original(...args);}finally{noticesCache=null;rescheduleNotifications();}};}
try{LocalNotifications.addListener('localNotificationActionPerformed',event=>{const target=event&&event.notification&&event.notification.extra&&event.notification.extra.page;if(typeof target!=='string'||!target)return;const go=n=>{if(!busy)run(async()=>{renderedPage=null;page=target;});else if(n>0)setTimeout(()=>go(n-1),300);};go(20);}).catch(()=>{});}catch{}
function noticesFor(ledger,day,revision){const key=day+':'+String(revision??'');if(noticesCache&&noticesCache.key===key)return noticesCache.value;let value=null;try{value=Dossiers.notices(ledger,{today:day});}catch{value=null;}noticesCache={key,value};return value;}

const association=new A.Association({read:()=>adapter.read(),replace:(s,r)=>adapter.replace(s,r),restoreWithCheckpoint:(state,revision)=>store.compareAndSet({state,expectedRevision:revision,preservePrevious:true}),importWithArchive:(state,archiveSource,revision)=>store.compareAndSet({state,archiveSource,expectedRevision:revision,preservePrevious:true})},vault,rawRequest);

function money(cents){return current.state.hidden?'•••• €':new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(cents/100);}

function simple(t){return Policy.editable(t);}

function today(){const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}

function metadata(t={}){const [category,subcategory,categoryDetail,categorySubdetail]=D.categoryParts(t.category||'Outros');return {category,subcategory,categoryDetail,categorySubdetail,note:t.note||'',beneficiary:t.beneficiary||'',noteColor:t.noteColor||'',expenseNature:t.expenseNature||'variable',tags:P.copy(t.tags||[])};}

function fromMovement(t,ledger){return {id:t.id,type:t.type,amount:String(t.amount).replace('.',','),description:t.description,accountId:ledger.accounts.find(a=>a.name===t.account)?.id||'',targetId:ledger.accounts.find(a=>a.name===t.targetAccount)?.id||'',...metadata(t),date:t.date,command:t.type==='transfer'?'transfer.update':'movement.update'};}

function newDraft(ledger){return {id:P.id(),type:'expense',amount:'',description:'',accountId:ledger.accounts.filter(a=>!a.archived)[0]?.id||'',targetId:ledger.accounts.filter(a=>!a.archived)[1]?.id||'',...metadata(),date:today(),command:'new'};}

function openEdit(t){if(current.state.movementDraft){page='rascunho';return;}if(!simple(t))throw Error('Este movimento exige o percurso especializado do programa.');const view=P.view(current.state);draft=fromMovement(t,view.ledger);formRevision=view.revisions['transaction:'+t.id]||0;resolvingId=null;draftRecord=null;draftBaseline=null;page='novo';}



function movementForm(ledger){

 if(!draft)draft=newDraft(ledger);if(!draftRecord)draftRecord=D.create(current.state,draft,formRevision,'',resolvingId);

 return Movimentos.form({ledger,state:current.state},{draft,draftRecord,resolvingId});

}

function preserveAccount(){const form=document.getElementById('account-form');if(page!=='editar-conta'||!form||!accountForm)return;const values=new FormData(form);accountForm.name=String(values.get('name')||'');accountForm.type=String(values.get('type')||'');if(accountForm.command==='account.add')accountForm.opening=String(values.get('opening')||'');}

function accountFingerprint(){preserveAccount();return JSON.stringify(accountForm);}

async function saveAccount(){const form=document.getElementById('account-form');if(!form||!form.reportValidity())return;preserveAccount();await run(async()=>{const a=accountForm,p={id:a.id,name:a.name,type:a.type};if(a.command==='account.add')p.openingCents=Accounts.openingCents(a.opening);const record=await persistAccount();await client.enqueue(a.command,p,{expectedEntityRevision:accountRevision,accountDraft:{token:record.token,sequence:record.sequence}});accountDraftRecord=null;selectedAccount=a.id;accountForm=null;page='conta';message.textContent='Conta guardada neste dispositivo.';});}

function preserveCommit(){const form=document.getElementById('commitment-form');if(page!=='novo-compromisso'||!form||!cf)return;const values=new FormData(form);for(const k of ['type','amount','description','accountId','date','category','reason'])cf[k]=String(values.get(k)??'');}

async function persistCommit(){preserveCommit();if(!cf||!cr)return null;const saved=await commitmentDrafts.save({...cr,form:P.copy(cf)});if(cr?.token===saved.token)cr=saved;return saved;}

function autoCommit(){if(page!=='novo-compromisso'||busy||!cr)return;preserveCommit();if(!cr.sequence&&JSON.stringify(cf)===cfBaseline)return;const number=++commitWrite,token=cr.token;const status=document.getElementById('commitment-status');if(status)status.textContent='A guardar rascunho…';persistCommit().then(()=>{if(cr?.token===token&&number===commitWrite&&document.getElementById('commitment-status'))document.getElementById('commitment-status').textContent='Rascunho guardado neste dispositivo.';}).catch(e=>{message.textContent=e.message;if(document.getElementById('commitment-status'))document.getElementById('commitment-status').textContent='Não foi possível guardar. Mantém o formulário aberto.';});}

async function resumeCommit(){await adapter.idle();const state=(await adapter.read()).state,record=state.commitmentDraft;K.valid(record);cf=P.copy(record.form);cr=P.copy(record);cfBaseline=JSON.stringify(cf);page='novo-compromisso';}

async function openCommitForm(id=null,action='edit'){await adapter.idle();const state=(await adapter.read()).state;if(state.commitmentDraft){await resumeCommit();return;}const v=P.view(state),old=id?v.ledger.pendingPayments.find(t=>t.id===id):null;if(id&&!Commitments.editable(v.ledger,old))throw Error('Este compromisso exige gestão especializada.');cf=old?{id:old.id,command:'commitment.update',action,type:old.type,amount:String(old.amount).replace('.',','),description:old.description,accountId:v.ledger.accounts.find(a=>a.name===old.account)?.id||'',date:old.date,category:old.category||'Outros',reason:'',changedOn:today()}:{id:P.id(),command:'commitment.add',action:'new',type:'expense',amount:'',description:'',accountId:v.ledger.accounts.find(a=>!a.archived)?.id||'',date:today(),category:'Outros',reason:'',changedOn:today()};cr=K.create(state,cf,v.revisions['commitment:'+cf.id]||0);cfBaseline=JSON.stringify(cf);page='novo-compromisso';}

async function saveCommit(){const form=document.getElementById('commitment-form');if(!form||!form.reportValidity())return;preserveCommit();await run(async()=>{await adapter.idle();cf.changedOn=today();const record=await persistCommit(),p=K.payload(cf);await client.enqueue(cf.command,p,{expectedEntityRevision:cr.expectedRevision,commitmentDraft:{token:record.token,sequence:record.sequence}});commitmentId=p.id;summaryPeriod=p.date.slice(0,7);cf=null;cr=null;cfBaseline=null;page='compromisso';message.textContent='Compromisso guardado. O saldo não foi alterado.';});}

async function leaveCommit(next){await adapter.idle();const s=(await adapter.read()).state;if(cf&&cr&&!K.reason(s,cr)&&(cr.sequence||JSON.stringify(cf)!==cfBaseline))await persistCommit();cf=null;cr=null;cfBaseline=null;page=next==='novo'&&current.state.movementDraft?'rascunho':next;renderedPage=null;}

async function render(){

 preserveHouse();

 preservePayment();

 preserveCommit();

 preserveAccount();

 current=await adapter.read();const state=current.state;if(!state)throw Error('SQLite não devolveu dados.');

 const view=P.view(state),ledger=view.ledger,notices=noticesFor(ledger,today(),current.revision),pending=state.outbox.filter(x=>['pending','sending'].includes(x.status)).length;

 document.getElementById('storage').textContent=`SQLite local · ${pending?pending+' por sincronizar':'dados guardados'}${state.blocked?' · revisão necessária':''}`;

 const privacy=document.getElementById('privacy');privacy.textContent=state.hidden?'Mostrar valores':'Ocultar valores';privacy.setAttribute('aria-pressed',String(state.hidden));

 const activeTab=Nav.tabFor(page);document.querySelectorAll('nav button').forEach(b=>{b.removeAttribute('aria-current');if(b.dataset.page===activeTab)b.setAttribute('aria-current','page');});





 const ctx={ledger,state,notices,today:today(),lastSync:readLastSync(),settings,money,go:target=>run(async()=>{renderedPage=null;page=target;}),commit:(command,payload,options)=>client.enqueue(command,payload,options),counts:{notices:notices?notices.counts.high+notices.counts.medium:null,shopping:ledger.casa?.shopping?ledger.casa.shopping.filter(s=>!s.done).length:null},pending,release:__RELEASE__,setFilter:(field,value)=>{if(busy)return;filters[field]=value;visibleLimit=40;run(async()=>{});}};

 if(page==='mais')main.innerHTML=Mais.render(ctx);

 if(Nav.isPlaceholder(page))main.innerHTML=Nav.placeholder(page);

 if(page==='resumo')main.innerHTML=Resumo.render(ctx,{period:summaryPeriod});

 if(page==='movimentos'){main.innerHTML=Movimentos.render(ctx,{filters,visibleLimit});Movimentos.bind(ctx,main);}

 if(page==='casa')main.innerHTML=Casa.render(ctx,{tab:houseTab,id:houseId});

 if(page==='casa-form')main.innerHTML=Casa.form(ctx,{form:hf,record:hr});

 if(page==='compras')main.innerHTML=Compras.render(ctx,shopFilters);

 if(page==='compras-artigo')main.innerHTML=Compras.item(ctx,{id:shopId,form:shopForm});

 if(page==='compras-novo')main.innerHTML=Compras.add(ctx,shopAdd);

 if(page==='patrimonio')main.innerHTML=Patrimonio.render(ctx);

 if(page==='avisos')main.innerHTML=Avisos.render(ctx);

 if(page==='relatorios'){repSel=repSel||{...Relatorios.initial(ctx.today),open:''};main.innerHTML=Relatorios.render(ctx,repSel);}

 if(page==='descartar-casa')main.innerHTML=Casa.discard();

 if(page==='recuperacao')main.innerHTML=Ligacao.recovery(ctx,{points:recoveryPoints,file:recoveryFile});

 if(page==='confirmar-recuperacao')main.innerHTML=Ligacao.confirmRecovery();

 if(page==='confirmar-desligar')main.innerHTML=Ligacao.confirmDetach();
 if(page==='confirmar-passagem')main.innerHTML=Ligacao.confirmPassage();

 if(page==='agenda')main.innerHTML=Agenda.render(ctx,{period:summaryPeriod,showCompleted:showCompletedAgenda});

 if(page==='pagar-compromisso')main.innerHTML=Agenda.payment(ctx,{form:pf,record:pr});

 if(page==='descartar-pagamento')main.innerHTML=Agenda.discardPayment();

 if(page==='novo-compromisso')main.innerHTML=Agenda.form(ctx,{form:cf,record:cr});

 if(page==='compromisso')main.innerHTML=Agenda.commitment(ctx,{commitmentId});

 if(page==='descartar-compromisso')main.innerHTML=Agenda.discardCommitment();

 if(page==='rascunho')main.innerHTML=Movimentos.recovery(ctx);

 if(page==='descartar-rascunho')main.innerHTML=Movimentos.discardDraft();

 if(page==='novo')main.innerHTML=movementForm(ledger);

 if(page==='contas')main.innerHTML=Contas.render(ctx);

 if(page==='editar-conta')main.innerHTML=Contas.editor(ctx,{form:accountForm});

 if(page==='sair-conta')main.innerHTML=Contas.leave();

 if(page==='arquivar-conta')main.innerHTML=Contas.archive(ctx,{accountId:selectedAccount});

 if(page==='conta')main.innerHTML=Contas.detail(ctx,{accountId:selectedAccount,visibleLimit});

 if(page==='consulta-financeira')main.innerHTML=Resumo.financial(ctx,{period:summaryPeriod});

 if(page==='detalhe'){

  main.innerHTML=Movimentos.detail(ctx,{movementId:selectedId,returnPage:detailReturn});
 }



 if(page==='eliminar')main.innerHTML=Movimentos.remove(ctx,{movementId:selectedId});

 if(page==='conflito')main.innerHTML=Ligacao.conflict(ctx,{conflictId});

 if(page==='sync')main.innerHTML=Ligacao.render(ctx,{connection,savedConnection});

 main.querySelectorAll('.cs-pills').forEach(p=>{const b=p.querySelector('[aria-pressed="true"]');if(!b)return;const r=b.getBoundingClientRect(),c=p.getBoundingClientRect();if(r.right>c.right||r.left<c.left)p.scrollLeft+=r.left-c.left-8;});

 if(page==='novo'&&draftBaseline===null){draftBaseline=formFingerprint();draftRecord.baseline=draftBaseline;}

 main.setAttribute('aria-busy',String(busy));document.getElementById('app').classList.toggle('has-shop-footer',page==='compras');

 if(renderedPage!==page){renderedPage=page;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.scrollTo(0,0);}

}

function formFingerprint(){const form=document.getElementById('movement');return form?JSON.stringify([...new FormData(form).entries()]):null;}

function preserveDraft(){const form=document.getElementById('movement');if(page!=='novo'||!draft||!form)return;const values=new FormData(form);for(const key of ['amount','description','type','category','subcategory','categoryDetail','categorySubdetail','date','note','beneficiary','noteColor','expenseNature'])draft[key]=String(values.get(key)??'');draft.accountId=String(values.get('account')||'');draft.targetId=String(values.get('target')||'');}

async function persistDraft(){preserveDraft();if(!draftRecord||!draft)return null;const record={...draftRecord,form:P.copy(draft),baseline:draftBaseline||draftRecord.baseline};const saved=await drafts.save(record);draftRecord=saved;return saved;}

function autoSaveDraft(){if(page!=='novo'||!draftRecord||busy)return;preserveDraft();if(!draftRecord.sequence&&formFingerprint()===draftBaseline)return;const id=++draftWriteId;const status=document.getElementById('draft-status');if(status)status.textContent='A guardar rascunho…';persistDraft().then(()=>{if(id===draftWriteId&&document.getElementById('draft-status'))document.getElementById('draft-status').textContent='Rascunho guardado neste dispositivo.';}).catch(error=>{if(document.getElementById('draft-status'))document.getElementById('draft-status').textContent='Não foi possível guardar o rascunho. Mantém este formulário aberto.';message.textContent=error.message;});}

async function leaveForm(next,discard){await adapter.idle();const s=(await adapter.read()).state,saved=s.movementDraft;if(discard&&saved){if(!draftRecord||saved.token!==draftRecord.token)throw Error('Existe outro rascunho. Foi preservado.');await drafts.discard(saved);}else if(!discard&&draftRecord&&!D.staleReason(s,draftRecord))await persistDraft();draft=null;draftRecord=null;draftBaseline=null;formRevision=null;resolvingId=null;renderedPage=null;page=next;}

async function run(fn){if(busy)return;preserveHouse();preserveShop();preservePayment();preserveCommit();preserveAccount();preserveDraft();busy=true;main.inert=true;main.setAttribute('aria-busy','true');message.textContent='';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();await render();}catch(error){message.textContent=error.message;try{await render();}catch{main.textContent='Não foi possível abrir os dados. Nenhum ficheiro foi substituído.';}}finally{busy=false;main.inert=false;main.setAttribute('aria-busy','false');document.getElementById('privacy').disabled=false;document.querySelectorAll('nav button,#leaveDialog button,#shopLeaveDialog button').forEach(b=>b.disabled=false);}}

async function save(){

 const form=document.getElementById('movement');if(!form||!form.reportValidity())return;

 preserveDraft();let payload;try{payload=D.payload(draft);}catch(error){message.textContent=error.message;return;}

 const command=draft.command==='new'?(payload.type==='transfer'?'transfer.add':'movement.add'):draft.command;

 await run(async()=>{const record=await persistDraft();const options={...(formRevision===null?{}:{expectedEntityRevision:formRevision}),draft:{token:record.token,sequence:record.sequence}};if(resolvingId)await client.resolve(resolvingId,'local',payload,options);else await client.enqueue(command,payload,options);page='movimentos';draft=null;draftRecord=null;draftBaseline=null;resolvingId=null;formRevision=null;message.textContent='Movimento guardado neste dispositivo.';});

}

document.addEventListener('click',event=>{

 const b=event.target.closest('button');if(!b||busy)return;

 if(b.id==='leave-cancel'){document.getElementById('leaveDialog').close();pendingPage=null;return;}

 if(b.id==='leave-discard'||b.id==='leave-save'){document.getElementById('leaveDialog').close();const next=pendingPage;pendingPage=null;if(next)run(()=>leaveForm(next,b.id==='leave-discard'));return;}

 if(b.id==='resume-draft'){run(async()=>{page='rascunho';});return;}

 if(b.id==='resume-edit'){run(async()=>{await adapter.idle();const record=(await adapter.read()).state.movementDraft;D.valid(record);draftRecord=P.copy(record);draft=P.copy(record.form);formRevision=P.copy(record.expectedRevision);draftBaseline=record.baseline;resolvingId=record.resolvingId;page='novo';});return;}

 if(b.id==='ask-discard-draft'){run(async()=>{discardCandidate=P.copy((await adapter.read()).state.movementDraft);page='descartar-rascunho';});return;}

 if(b.id==='cancel-discard-draft'){run(async()=>{page='rascunho';});return;}

 if(b.id==='confirm-discard-draft'){run(async()=>{await drafts.discard(discardCandidate);discardCandidate=null;draft=null;draftRecord=null;page='resumo';});return;}

 if(b.dataset.page){

  if(page==='novo-compromisso'){run(()=>leaveCommit(b.dataset.page));return;}

  if(page==='sair-conta'){message.textContent='Escolhe continuar a preencher ou sair sem guardar.';return;}

  if(page==='editar-conta'&&accountFingerprint()!==accountBaseline){accountNext=b.dataset.page;run(async()=>{page='sair-conta';});return;}

  if(page==='novo'&&draftBaseline!==null&&formFingerprint()!==draftBaseline){preserveDraft();pendingPage=b.dataset.page;document.getElementById('leaveDialog').showModal();return;}

  renderedPage=null;const target=b.dataset.page;page=target==='novo'&&current.state.movementDraft?'rascunho':target;draft=null;draftRecord=null;draftBaseline=null;formRevision=null;resolvingId=null;message.textContent='';run(async()=>{});return;

 }

 if(b.id==='new-commitment'){run(()=>openCommitForm());return;}

 if(b.id==='resume-commitment'){run(()=>resumeCommit());return;}

 if(b.dataset.commitment){run(async()=>{commitmentId=b.dataset.commitment;page='compromisso';});return;}

 if(b.id==='edit-commitment'||b.id==='reschedule-commitment'){run(()=>openCommitForm(commitmentId,b.id==='reschedule-commitment'?'reschedule':'edit'));return;}

 if(b.id==='save-commitment'){saveCommit();return;}

 if(b.id==='ask-discard-commitment'){run(async()=>{await adapter.idle();commitDiscard=P.copy((await adapter.read()).state.commitmentDraft);page='descartar-compromisso';});return;}

 if(b.id==='confirm-discard-commitment'){run(async()=>{await commitmentDrafts.discard(commitDiscard);commitDiscard=null;cf=null;cr=null;page='agenda';});return;}

 if(b.id==='new-account'||b.id==='edit-account'){run(async()=>{const saved=(await adapter.read()).state.accountDraft;if(saved){await resumeAccount();return;}const view=P.view(current.state),a=b.id==='edit-account'?view.ledger.accounts.find(a=>a.id===selectedAccount):null;if(b.id==='edit-account'&&!a)throw Error('Conta indisponível.');accountForm=a?{id:a.id,name:a.name,type:a.type,command:'account.update',opening:''}:{id:P.id(),name:'',type:'Banco',command:'account.add',opening:'0,00'};accountRevision=view.revisions['account:'+accountForm.id]||0;accountBaseline=JSON.stringify(accountForm);accountDraftRecord=Forms.create(current.state,accountForm,'account:'+accountForm.id,accountRevision);page='editar-conta';});return;}

 if(b.id==='save-account'){saveAccount();return;}

 if(b.id==='stay-account'){run(async()=>{page='editar-conta';});return;}

 if(b.id==='leave-account'){run(async()=>{await adapter.idle();const saved=(await adapter.read()).state.accountDraft;if(saved){if(saved.token!==accountDraftRecord?.token)throw Error('O rascunho mudou. Reabre antes de descartar.');await Forms.discard(adapter,'accountDraft',saved);}accountDraftRecord=null;accountForm=null;page=accountNext||'contas';});return;}

 if(b.id==='ask-archive'){run(async()=>{archiveRevision=P.view(current.state).revisions['account:'+selectedAccount]||0;page='arquivar-conta';});return;}

 if(b.id==='confirm-archive'){run(async()=>{const a=P.view((await client.read()).state).ledger.accounts.find(a=>a.id===selectedAccount);if(!a)throw Error('Conta indisponível.');await client.enqueue('account.archive',{id:a.id,archived:!a.archived},{expectedEntityRevision:archiveRevision});page='conta';message.textContent=a.archived?'Conta reativada.':'Conta arquivada. O histórico foi conservado.';});return;}

 if(b.dataset.open){run(async()=>{detailReturn=page==='conta'?'conta':'movimentos';selectedId=b.dataset.open;page='detalhe';});return;}

 if(b.dataset.review){run(async()=>{conflictId=b.dataset.review;page='conflito';});return;}

 if(b.dataset.account){run(async()=>{selectedAccount=b.dataset.account;visibleLimit=40;page='conta';});return;}

 if(b.id==='period-prev'||b.id==='period-next'){run(async()=>{summaryPeriod=V.shiftMonth(summaryPeriod,b.id==='period-prev'?-1:1);});return;}

 if(b.id==='see-month'){run(async()=>{filters={query:'',period:'',accountId:'',type:'',status:''};visibleLimit=40;page='movimentos';});return;}

 if(b.id==='clear-filters'){run(async()=>{filters={query:'',period:'',accountId:'',type:'',status:''};visibleLimit=40;});return;}

 if(b.id==='show-more'){const y=window.scrollY;run(async()=>{visibleLimit+=40;}).then(()=>window.scrollTo(0,y));return;}

 if(b.id==='edit-movement')run(async()=>openEdit(P.view(current.state).ledger.transactions.find(t=>t.id===selectedId)));

 if(b.id==='ask-delete')run(async()=>{const view=P.view(current.state);deleteRevision=view.revisions['transaction:'+selectedId]||0;page='eliminar';});

 if(b.id==='confirm-delete')run(async()=>{const t=P.view(current.state).ledger.transactions.find(t=>t.id===selectedId);await client.enqueue('movement.delete',{id:selectedId,description:t?.description||'Movimento',amountCents:P.Finance.cents(t?.amount)},{expectedEntityRevision:deleteRevision});page='movimentos';message.textContent='Eliminação guardada. Aguarda sincronização.';});

 if(b.id==='keep-server')run(async()=>{await client.resolve(conflictId,'server');page='sync';message.textContent='Versão do PC mantida. A proposta anterior ficou no histórico.';});

 if(b.id==='revise-local')run(async()=>{

  const entry=current.state.outbox.find(r=>r.operation.operationId===conflictId);const p=entry.operation.payload;

  if(entry.operation.command==='movement.delete'){await client.resolve(conflictId,'local');page='sync';message.textContent='Nova proposta de eliminação guardada.';return;}

  if(current.state.movementDraft){page='rascunho';return;}draftRecord=null;

  draft={...P.copy(p),...metadata(p),amount:String(p.amountCents/100).replace('.',','),type:entry.operation.command.startsWith('transfer.')?'transfer':p.type,command:entry.operation.command};draftBaseline=null;resolvingId=conflictId;formRevision=P.view(current.state).revisions['transaction:'+p.id]||0;page='novo';

 });

 if(b.id==='privacy')run(()=>client.change(state=>{state.hidden=!state.hidden;}));

 if(b.id==='save')save();

 if(b.id==='sync')run(async()=>{await client.sync();markSynced();message.textContent='Sincronização de ensaio concluída.';});

 if(b.id==='pair'){

  const form=document.getElementById('pairing');if(!form.reportValidity())return;

  const values=new FormData(form);

  run(async()=>{try{connection=await association.start(String(values.get('server')).trim(),String(values.get('code')),{replaceLocal:values.get('replaceLocal')==='yes',expectedRevision:current.revision});message.textContent='Dispositivo associado. A ligação mantém-se depois de fechar a aplicação.';}finally{savedConnection=await vault.read();}});

 }

 if(b.id==='resume-pair')run(async()=>{try{connection=await association.resume();message.textContent='Associação concluída.';}finally{savedConnection=await vault.read();}});

 if(b.id==='cancel-pair')run(async()=>{await association.cancel();savedConnection=await vault.read();message.textContent='Tentativa cancelada. Os movimentos foram preservados.';});

});

document.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='pairing')document.getElementById('pair').click();else if(e.target.id==='account-form')saveAccount();else if(e.target.id==='commitment-form')saveCommit();else if(e.target.id==='payment-form')document.getElementById('save-payment').click();else if(e.target.id==='house-form')document.getElementById('save-house').click();else save();});

document.addEventListener('change',e=>{if(e.target.id==='movement-type'){const transfer=e.target.value==='transfer';document.getElementById('target-field').hidden=!transfer;document.getElementById('category-field').hidden=transfer;document.getElementById('account-label').textContent=transfer?'De':'Conta';}});

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&page==='novo'&&e.target.matches('input')){e.preventDefault();save();}});

if(!__RELEASE__)window.EquilibrioTest={

 inspect:()=>adapter.read(),flushDraft:()=>adapter.idle(),view:async()=>P.view((await adapter.read()).state),

 enqueue:async(command,payload)=>{const op=await client.enqueue(command,payload);await render();return op;},

 sync:async()=>{const result=await client.sync();markSynced();await render();return result;},

 resolve:async(id,choice,payload)=>{const result=await client.resolve(id,choice,payload);await render();return result;},

 connectionStatus:()=>({associated:!!connection,pending:savedConnection?.kind==='pairing',deviceId:connection?.deviceId||null,protection:'AndroidKeyStore/AES-GCM'}),

 async staleWrite(){const old=await adapter.read();try{await adapter.replace(old.state,old.revision-1);return false;}catch{return true;}}

};

run(async()=>{

 if(Capacitor.getPlatform()!=='android')throw Error('Este protótipo requer Android com SQLite nativo.');

 const saved=await adapter.read();if(!saved.state)await adapter.replace(__RELEASE__?P.local({serverId:'unpaired',epoch:'unpaired',spaceId:'casa',snapshot:{ledger:{...P.Finance.empty(),ledgerCoreVersion:1},revisions:{},cursor:0}},P.id()):P.offlineFixture(),0);

 savedConnection=await association.restore();if(savedConnection?.kind==='paired')connection=savedConnection;

 rescheduleNotifications();

});

let searchTimer;

document.addEventListener('input',event=>{if(event.target.id!=='movement-search')return;const value=event.target.value;filters.query=value;const start=event.target.selectionStart,end=event.target.selectionEnd;clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{if(busy||page!=='movimentos')return;filters.query=value;visibleLimit=40;const y=window.scrollY;await run(async()=>{});const input=document.getElementById('movement-search');if(input){input.focus({preventScroll:true});input.setSelectionRange(start,end);window.scrollTo(0,y);}},180);});

document.addEventListener('change',event=>{

 const id=event.target.id;if(busy)return;

 if(id==='agenda-completed'){showCompletedAgenda=event.target.checked;run(async()=>{});return;}

 if(id==='period-year'||id==='period-month'){const y=document.getElementById('period-year').value,m=document.getElementById('period-month').value;run(async()=>{summaryPeriod=y.padStart(4,'0')+'-'+m;});}

 const field={'filter-period':'period','filter-account':'accountId'}[id];if(field){filters[field]=event.target.value;visibleLimit=40;run(async()=>{});}

});

document.addEventListener('input',event=>{if(event.target.closest('#movement'))autoSaveDraft();});

document.addEventListener('change',event=>{if(event.target.closest('#movement'))autoSaveDraft();});

document.addEventListener('input',e=>{if(e.target.closest('#commitment-form'))autoCommit();});

document.addEventListener('change',e=>{if(e.target.closest('#commitment-form'))autoCommit();});

function preservePayment(){const f=document.getElementById('payment-form');if(page==='pagar-compromisso'&&pf&&f){const d=new FormData(f);pf.amount=String(d.get('amount')||'');pf.date=String(d.get('date')||'');}}

async function persistPayment(){preservePayment();if(!pr)return;const saved=await Forms.save(adapter,'paymentDraft',{...pr,form:P.copy(pf)});if(pr?.token===saved.token)pr=saved;return saved;}

async function openPayment(){await adapter.idle();const s=(await adapter.read()).state;if(s.paymentDraft){pr=P.copy(s.paymentDraft);pf=P.copy(pr.form);}else{const v=P.view(s),t=v.ledger.pendingPayments.find(t=>t.id===commitmentId);if(!Commitments.payable(v.ledger,t))throw Error('Compromisso indisponível ou especializado.');pf={id:t.id,transactionId:P.id(),amount:String(t.amount).replace('.',','),date:today(),changedOn:today()};pr=Forms.create(s,pf,'commitment:'+t.id,v.revisions['commitment:'+t.id]||0);}page='pagar-compromisso';}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.id==='open-payment'||b.id==='resume-payment'){e.stopImmediatePropagation();run(()=>openPayment());}else if(b.id==='save-payment'){e.stopImmediatePropagation();const f=document.getElementById('payment-form');if(!f.reportValidity())return;run(async()=>{const r=await persistPayment(),p=Forms.paymentPayload(pf);await client.enqueue('commitment.settle',p,{expectedEntityRevision:pr.expectedRevision,paymentDraft:{token:r.token,sequence:r.sequence}});commitmentId=p.id;pf=null;pr=null;page='compromisso';message.textContent='Registo guardado. O saldo e o restante foram atualizados em conjunto.';});}else if(b.id==='ask-discard-payment'){e.stopImmediatePropagation();run(async()=>{paymentDiscard=P.copy((await adapter.read()).state.paymentDraft);page='descartar-pagamento';});}else if(b.id==='confirm-discard-payment'){e.stopImmediatePropagation();run(async()=>{await Forms.discard(adapter,'paymentDraft',paymentDiscard);pf=null;pr=null;page='agenda';});}else if(page==='pagar-compromisso'&&b.dataset.page){e.stopImmediatePropagation();run(async()=>{if(pr&&!Forms.staleReason((await adapter.read()).state,pr))await persistPayment();pf=null;pr=null;page=b.dataset.page;});}},true);

for(const name of ['input','change'])document.addEventListener(name,e=>{if(e.target.closest('#payment-form')&&!busy)persistPayment().then(()=>{const el=document.getElementById('payment-status');if(el)el.textContent='Rascunho guardado neste dispositivo.';}).catch(e=>message.textContent=e.message);});

// The Android back action follows the same form exits as the visible controls.

window.EquilibrioBack=()=>{if(busy)return true;const dialog=document.getElementById('leaveDialog');if(dialog.open){dialog.close();pendingPage=null;return true;}if(page==='resumo')return false;const visibleBack=main.querySelector('button.back,button[data-page]');if(visibleBack){visibleBack.click();return true;}document.querySelector('nav [data-page="resumo"]').click();return true;};

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(page==='novo')persistDraft().catch(e=>message.textContent=e.message);if(page==='novo-compromisso')persistCommit().catch(e=>message.textContent=e.message);if(page==='pagar-compromisso')persistPayment().catch(e=>message.textContent=e.message);}});



function preserveHouse(){const f=document.getElementById('house-form');if(page!=='casa-form'||!hf||!f)return;const d=new FormData(f);for(const [k,v] of d.entries())if(!k.startsWith('offer-'))hf[k]=String(v);if(hf.command==='house.product')hf.offers=[...f.querySelectorAll('[data-offer-row]')].map(el=>({...Object.fromEntries(['storeName','packageQty','price','url'].map(k=>[k,el.querySelector('[data-offer-field="'+k+'"]').value]))}));}

async function persistHouse(){preserveHouse();if(!hr)return;const r=await Forms.save(adapter,'houseDraft',{...hr,form:P.copy(hf)});if(hr?.token===r.token)hr=r;return r;}

async function openHouseForm(kind,id=null){await adapter.idle();const s=(await adapter.read()).state;if(s.houseDraft){hr=P.copy(s.houseDraft);hf=P.copy(hr.form);page='casa-form';return;}const v=P.view(s),c=House.Casa.state(v.ledger),old=kind==='product'?c.catalog.find(x=>x.id===id):c.stock.find(x=>x.id===id);hf={id:old?.id||P.id(),command:'house.'+kind,mode:old?'update':'create',seed:P.id(),changedOn:today()};if(kind==='product'){const cats=P.Finance.categoryParts(old?.category||'');Object.assign(hf,{name:old?.name||'',brand:old?.brand||'',category:cats[0]||'',sub1:cats[1]||'',sub2:cats[2]||'',sub3:cats[3]||'',unit:old?.unit||'un',url:old?.url||'',offers:old?Object.entries(old.offers).map(([storeId,o])=>({storeName:c.stores.find(s=>s.id===storeId)?.name||'',packageQty:String(o.packageQty),price:String(o.price).replace('.',','),...(o.url?{url:o.url}:{})})) :[]});}else if(kind==='lot'){Object.assign(hf,{catalogId:old?.catalogId||id||'',qty:String(old?.qty||''),location:old?.location||'',expiry:old?.expiry||'',opened:old?.opened===true});}else {if(!old)throw Error('Lote indisponível.');Object.assign(hf,{id:old.id,qty:'',type:'consume',note:''});}hr=Forms.create(s,hf,'house',v.revisions.house||0);page='casa-form';}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;let task=null;if(b.dataset.houseTab)task=async()=>{houseTab=b.dataset.houseTab;page='casa';};if(b.dataset.product)task=async()=>{houseId=b.dataset.product;houseTab='produto';page='casa';};if(b.dataset.lot)task=async()=>{houseId=b.dataset.lot;houseTab='lote';page='casa';};if(b.id==='new-product'||b.dataset.editProduct)task=()=>openHouseForm('product',b.dataset.editProduct||null);if(b.dataset.newLot)task=()=>openHouseForm('lot',b.dataset.newLot);if(b.dataset.editLot)task=()=>openHouseForm('lot',b.dataset.editLot);if(b.dataset.consumeLot)task=()=>openHouseForm('consume',b.dataset.consumeLot);if(b.id==='resume-house')task=()=>openHouseForm('product');if(b.id==='add-offer')task=async()=>{preserveHouse();hf.offers.push({storeName:'',packageQty:'',price:''});document.getElementById('house-form').remove();await persistHouse();};if(b.dataset.removeOffer!==undefined)task=async()=>{preserveHouse();hf.offers.splice(Number(b.dataset.removeOffer),1);document.getElementById('house-form').remove();await persistHouse();};if(b.id==='ask-discard-house')task=async()=>{houseDiscard=P.copy((await adapter.read()).state.houseDraft);page='descartar-casa';};if(b.id==='confirm-discard-house')task=async()=>{await Forms.discard(adapter,'houseDraft',houseDiscard);hr=null;hf=null;page='casa';};if(b.id==='save-house'){if(!document.getElementById('house-form').reportValidity())return;task=async()=>{const r=await persistHouse(),p=HouseForm.payload(hf);await client.enqueue(hf.command,p,{houseDraft:{token:r.token,sequence:r.sequence}});houseId=p.id;houseTab=hf.command==='house.product'?'produto':hf.command==='house.lot'?'lote':'stock';hf=null;hr=null;page='casa';message.textContent='Casa guardada neste dispositivo.';};}if(page==='casa-form'&&b.dataset.page)task=async()=>{if(hr&&!Forms.staleReason((await adapter.read()).state,hr))await persistHouse();hf=null;hr=null;page=b.dataset.page;};if(task){e.stopImmediatePropagation();run(task);}},true);

for(const name of ['input','change'])document.addEventListener(name,e=>{if(e.target.closest('#house-form')&&!busy)persistHouse().then(()=>{const el=document.getElementById('house-status');if(el)el.textContent='Rascunho guardado neste dispositivo.';}).catch(e=>message.textContent=e.message);});

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&page==='casa-form')persistHouse().catch(e=>message.textContent=e.message);});

document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='repeat-extended'&&!busy){e.stopImmediatePropagation();run(async()=>{await client.resolve(conflictId,'local');page='sync';message.textContent='Nova proposta guardada; a anterior ficou no histórico.';});}},true);

const recoveryAdapter={read:()=>adapter.read(),restoreWithCheckpoint:(state,revision)=>store.compareAndSet({state,expectedRevision:revision,preservePrevious:true})};

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;let task=null;const password=()=>document.getElementById('backup-password')?.value||'';if(b.id==='export-backup'){const pass=password();task=async()=>{await adapter.idle();const s=(await adapter.read()).state,data=await Recovery.encrypt(s,pass);await backupFiles.exportBackup({data});message.textContent='Cópia encriptada guardada.';};}if(b.id==='choose-backup')task=async()=>{recoveryFile=(await backupFiles.importBackup()).data;message.textContent='Cópia escolhida. Indica a palavra-passe e abre-a para rever o restauro.';};if(b.id==='review-detach')task=async()=>{recoveryExpected=await adapter.read();page='confirmar-desligar';};if(b.id==='confirm-detach')task=async()=>{await adapter.idle();await association.detach(recoveryExpected.revision);connection=null;savedConnection=null;recoveryExpected=null;page='sync';message.textContent='Dados conservados offline. Podes preparar a nova associação.';};if(b.id==='list-checkpoints')task=async()=>{recoveryPoints=(await store.listCheckpoints()).checkpoints;};if(b.dataset.checkpoint)task=async()=>{recoveryCandidate=(await store.readCheckpoint({id:Number(b.dataset.checkpoint)})).state;recoveryExpected=await adapter.read();portableMode=false;page='confirmar-recuperacao';};if(b.id==='portable-import')task=async()=>{Recovery.portable(recoveryCandidate,(await adapter.read()).state);recoveryExpected=await adapter.read();portableMode=true;page='confirmar-passagem';};if(b.id==='export-recovery-candidate'){const pass=password();task=async()=>{await backupFiles.exportBackup({data:await Recovery.encrypt(recoveryCandidate,pass)});message.textContent='Origem exportada com encriptação.';};}if(b.id==='confirm-portable')task=async()=>{await adapter.idle();await Recovery.transfer({...recoveryAdapter,importWithArchive:(state,archiveSource,revision)=>store.compareAndSet({state,archiveSource,expectedRevision:revision,preservePrevious:true})},recoveryCandidate,recoveryExpected);recoveryCandidate=null;recoveryExpected=null;page='resumo';message.textContent='Dados recuperados para consulta e uso offline. A origem ficou arquivada; as operações antigas não serão reenviadas ao PC.';};if(b.id==='open-backup'){const pass=password();task=async()=>{recoveryCandidate=await Recovery.decrypt(recoveryFile,pass);recoveryExpected=await adapter.read();page='confirmar-recuperacao';recoveryFile=null;};}if(b.id==='confirm-recovery')task=async()=>{await adapter.idle();await Recovery.restore(recoveryAdapter,recoveryCandidate,recoveryExpected);recoveryCandidate=null;recoveryExpected=null;draft=null;cf=null;pf=null;hf=null;draftRecord=null;cr=null;pr=null;hr=null;page='resumo';message.textContent='Cópia recuperada. O estado anterior foi conservado neste dispositivo.';};if(task){e.stopImmediatePropagation();run(task);}},true);

if(!__RELEASE__)window.EquilibrioRecoveryTest={encrypt:Recovery.encrypt,decrypt:Recovery.decrypt,restore:async(state,expected)=>{await Recovery.restore(recoveryAdapter,state,expected);await render();}};

async function persistAccount(){preserveAccount();if(!accountForm||!accountDraftRecord)return null;const r=await Forms.save(adapter,'accountDraft',{...accountDraftRecord,form:P.copy(accountForm)});if(accountDraftRecord?.token===r.token)accountDraftRecord=r;return r;}

async function resumeAccount(){await adapter.idle();const s=(await adapter.read()).state,r=s.accountDraft;Forms.valid('accountDraft',r);accountDraftRecord=P.copy(r);accountForm=P.copy(r.form);accountRevision=P.copy(r.expectedRevision);accountBaseline=JSON.stringify(accountForm);page='editar-conta';}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='resume-account'&&!busy){e.stopImmediatePropagation();run(()=>resumeAccount());}},true);

for(const event of ['input','change'])document.addEventListener(event,e=>{if(e.target.closest('#account-form')&&!busy)persistAccount().catch(e=>message.textContent=e.message);});

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&page==='editar-conta')persistAccount().catch(e=>message.textContent=e.message);});


let shopSkipGuard=false,shopPendingButton=null;

function shopDirty(){if(page==='compras-artigo'){const f=shopRead();if(!f||!shopId)return false;const l=P.view(current.state).ledger,c=House.Casa.state(l),s=c.shopping.find(x=>x.id===shopId);return s?Compras.isDirty(Compras.initial(s,s.catalogId?Compras.pricing(l,c)(s.id):null),f):false;}if(page==='compras-novo')return Compras.isDirty({qty:'1',name:''},{qty:shopAdd.qty,name:shopAdd.name});return false;}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='shop-leave-cancel'){document.getElementById('shopLeaveDialog').close();shopPendingButton=null;return;}if(b.id==='shop-leave-discard'){document.getElementById('shopLeaveDialog').close();const next=shopPendingButton;shopPendingButton=null;shopSkipGuard=true;if(next)next.click();shopSkipGuard=false;return;}if(busy||(page!=='compras-artigo'&&page!=='compras-novo')||!b.dataset.page&&!b.closest('nav')&&b.id!=='quickAdd')return;if(shopSkipGuard){shopForm=null;shopAdd={query:'',qty:'1',name:''};return;}if(shopDirty()){e.stopImmediatePropagation();preserveShop();shopPendingButton=b;document.getElementById('shopLeaveDialog').showModal();}},true);

const shopSend=(id,values)=>client.enqueue('house.shopping',{id,seed:P.id(),changedOn:today(),values});

function shopRead(){const f=document.getElementById('shop-item-form');return f?Object.fromEntries([...new FormData(f).entries()].map(([k,v])=>[k,String(v)])):null;}

function preserveShop(){if(page!=='compras-artigo')return;const f=shopRead();if(f)shopForm=f;}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;const d=b.dataset;let task=null;if(d.shoppingDone)task=()=>shopSend(d.shoppingDone,Compras.setDone(d.next==='true'));else if(d.pillShopstatus!==undefined)task=async()=>{shopFilters.status=d.pillShopstatus;};else if(d.pillShopstore!==undefined)task=async()=>{shopFilters.storeId=d.pillShopstore;};else if(b.id==='shop-instore')task=async()=>{shopFilters.inStore=!shopFilters.inStore;if(!shopFilters.inStore)shopFilters.storeId='';};else if(b.id==='shop-add')task=async()=>{shopAdd={query:'',qty:'1',name:''};page='compras-novo';};else if(d.shoppingOpen)task=async()=>{shopId=d.shoppingOpen;shopForm=null;page='compras-artigo';};else if(b.id==='shop-item-save')task=async()=>{const f=shopRead(),id=shopId;try{const defaults=f.packages===undefined?null:Compras.offerDefaults(P.view((await adapter.read()).state).ledger,id);await shopSend(id,Compras.updateValues(f,f.packages!==undefined,defaults));}catch(error){shopForm=f;throw error;}shopForm=null;page='compras';message.textContent='Artigo guardado neste dispositivo.';};else if(b.id==='shop-item-remove')task=async()=>{await shopSend(shopId,{operation:'remove'});shopId=null;shopForm=null;page='compras';message.textContent='Artigo retirado da lista.';};else if(d.queueCatalog)task=async()=>{const values=Compras.queueValues({catalogId:d.queueCatalog,storeId:d.queueStore,qty:document.getElementById('shop-add-qty').value});await shopSend(P.id(),values);shopFilters.status='todo';page='compras';message.textContent='Artigo acrescentado à lista.';};else if(b.id==='shop-add-free')task=async()=>{const values=Compras.addValues({name:document.getElementById('shop-add-name').value,qty:document.getElementById('shop-add-qty').value});await shopSend(P.id(),values);shopFilters.status='todo';page='compras';message.textContent='Artigo acrescentado à lista.';};if(task){e.stopImmediatePropagation();run(task);}},true);

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy||page!=='relatorios')return;const d=b.dataset;let task=null;if(d.pillRepkind!==undefined)task=async()=>{repSel={...Relatorios.switchKind(repSel,d.pillRepkind,today()),open:''};};else if(b.id==='rep-prev'||b.id==='rep-next')task=async()=>{repSel={...Relatorios.shift(repSel,b.id==='rep-prev'?-1:1),open:''};};else if(d.pillRepaccount!==undefined)task=async()=>{repSel={...repSel,account:d.pillRepaccount};};else if(d.repCat!==undefined)task=async()=>{repSel={...repSel,open:repSel.open===d.repCat?'':d.repCat};};if(task){e.stopImmediatePropagation();run(task);}},true);

document.addEventListener('input',event=>{const id=event.target.id,value=event.target.value;if(id==='shop-add-qty'){shopAdd.qty=value;return;}if(id==='shop-add-name'){shopAdd.name=value;return;}if(id!=='shop-search'&&id!=='shop-add-query')return;if(id==='shop-search')shopFilters.query=value;else shopAdd.query=value;const start=event.target.selectionStart,end=event.target.selectionEnd;clearTimeout(shopTimer);shopTimer=setTimeout(async()=>{if(busy||(page!=='compras'&&page!=='compras-novo'))return;const y=window.scrollY;await run(async()=>{});const input=document.getElementById(id);if(input){input.focus({preventScroll:true});input.setSelectionRange(start,end);window.scrollTo(0,y);}},180);});

// Avisos: o botão de um aviso leva ao ecrã certo com o estado já preparado.
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy||page!=='avisos')return;if(b.dataset.noticePay){e.stopImmediatePropagation();run(async()=>{commitmentId=b.dataset.noticePay;await openPayment();});}else if(b.dataset.noticeTab){e.stopImmediatePropagation();run(async()=>{houseTab=b.dataset.noticeTab;houseId=null;page='casa';});}},true);
