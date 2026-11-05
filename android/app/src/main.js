let accountDraftRecord=null;

import Recovery from '../../shared/recovery.cjs';

let recoveryFile=null,recoveryCandidate=null,recoveryExpected=null,recoveryPoints=[],portableMode=false;

const backupFiles=registerPlugin('BackupFiles');

import House from '../../shared/house.cjs';

import HouseForm from '../../shared/house-form.cjs';

import HouseUI from './house-ui.cjs';

let houseTab='produtos',houseId=null,hf=null,hr=null,houseDiscard=null;

import Consult from './financial-consultation.cjs';

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

import Agenda from './agenda.cjs';

import K from '../../shared/commitment-drafts.cjs';

import Commitments from '../../shared/commitments.cjs';

import Nav from './nav.cjs';

import Mais from './screens/mais.cjs';

import Resumo from './screens/resumo.cjs';

import Movimentos from './screens/movimentos.cjs';

const LAST_SYNC_KEY='equilibrio.mobile.lastSync';

function readLastSync(){try{return localStorage.getItem(LAST_SYNC_KEY);}catch{return null;}}

function markSynced(){try{localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());}catch{}}

let cf=null,cr=null,cfBaseline=null,commitmentId=null,commitDiscard=null,commitWrite=0;

let showCompletedAgenda=false;

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

const association=new A.Association({read:()=>adapter.read(),replace:(s,r)=>adapter.replace(s,r),restoreWithCheckpoint:(state,revision)=>store.compareAndSet({state,expectedRevision:revision,preservePrevious:true}),importWithArchive:(state,archiveSource,revision)=>store.compareAndSet({state,archiveSource,expectedRevision:revision,preservePrevious:true})},vault,rawRequest);

function money(cents){return current.state.hidden?'•••• €':new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(cents/100);}

function row(t,accountName=''){return Movimentos.row({state:current.state},t,accountName);}

function periodControls(ledger){return Resumo.periodControls(ledger,summaryPeriod,today());}

function simple(t){return Policy.editable(t);}

function today(){const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}

function metadata(t={}){const [category,subcategory,categoryDetail,categorySubdetail]=D.categoryParts(t.category||'Outros');return {category,subcategory,categoryDetail,categorySubdetail,note:t.note||'',beneficiary:t.beneficiary||'',noteColor:t.noteColor||'',expenseNature:t.expenseNature||'variable',tags:P.copy(t.tags||[])};}

function fromMovement(t,ledger){return {id:t.id,type:t.type,amount:String(t.amount).replace('.',','),description:t.description,accountId:ledger.accounts.find(a=>a.name===t.account)?.id||'',targetId:ledger.accounts.find(a=>a.name===t.targetAccount)?.id||'',...metadata(t),date:t.date,command:t.type==='transfer'?'transfer.update':'movement.update'};}

function newDraft(ledger){return {id:P.id(),type:'expense',amount:'',description:'',accountId:ledger.accounts.filter(a=>!a.archived)[0]?.id||'',targetId:ledger.accounts.filter(a=>!a.archived)[1]?.id||'',...metadata(),date:today(),command:'new'};}

function openEdit(t){if(current.state.movementDraft){page='rascunho';return;}if(!simple(t))throw Error('Este movimento exige o percurso especializado do programa.');const view=P.view(current.state);draft=fromMovement(t,view.ledger);formRevision=view.revisions['transaction:'+t.id]||0;resolvingId=null;draftRecord=null;draftBaseline=null;page='novo';}

function draftBanner(){return current.state.movementDraft?'<section class="draft-banner"><strong>Tens um movimento por concluir</strong><p>O rascunho está guardado neste dispositivo.</p><button type="button" id="resume-draft">Retomar rascunho</button></section>':'';}

function recovery(){const record=current.state.movementDraft;if(!record)return '<h1>Sem rascunho</h1><button data-page="movimentos">Voltar aos movimentos</button>';let error='',reason='';try{D.valid(record);reason=D.staleReason(current.state,record);}catch(e){error=e.message;}return `<h1>Movimento por concluir</h1><p class="sub">Guardado neste dispositivo. Ainda não é um movimento financeiro.</p>${error?`<p class="note">${escape(error)}</p>`:`<section class="review-card"><h2>${escape(record.form.description||'Descrição por preencher')}</h2><p>${record.form.command==='new'?'Novo movimento':'Edição de movimento'}</p><small>${escape(record.savedAt?V.dateLabel(record.savedAt.slice(0,10)):'')}</small></section>${reason?`<p class="note">${escape(reason)}</p>`:''}`}<div class="review-actions">${!error?'<button id="resume-edit" class="primary">Retomar preenchimento</button>':''}<button id="ask-discard-draft">Descartar rascunho</button><button data-page="resumo">Voltar ao Resumo</button></div>`;}



function movementForm(ledger){

 if(!draft)draft=newDraft(ledger);if(!draftRecord)draftRecord=D.create(current.state,draft,formRevision,'',resolvingId);

 return Movimentos.form({ledger,state:current.state},{draft,draftRecord,resolvingId});

}

function conflictPanel(state){

 const entry=state.outbox.find(r=>r.operation.operationId===conflictId);if(!entry||entry.resolution)return '<h1>Proposta já revista</h1><button data-page="sync">Voltar à ligação</button>';

 const proposed=entry.operation.payload,confirmed=state.confirmed.ledger.transactions.find(t=>t.id===proposed.id);

 const canRevise=entry.operation.command.endsWith('.add')||!!confirmed;

 return `<button class="back" data-page="sync">‹ Voltar</button><h1>Rever diferença</h1><p class="sub">Escolhe explicitamente o que queres manter. As propostas anteriores ficam no histórico.</p><div class="comparison"><section class="review-card"><h2>Versão confirmada no PC</h2>${confirmed?`<strong>${escape(confirmed.description)}</strong><p class="review-value">${money(P.Finance.cents(confirmed.amount))}</p><small>${escape(confirmed.date)} · ${escape(confirmed.account)}${confirmed.targetAccount?' → '+escape(confirmed.targetAccount):''}</small>`:'<p>O movimento não existe no estado confirmado.</p>'}</section><section class="review-card"><h2>A tua proposta</h2><strong>${escape(proposed.description||'Movimento')}</strong><p class="review-value">${entry.operation.command==='movement.delete'?'Eliminar movimento':money(proposed.amountCents)}</p><small>${escape(proposed.date||'')}</small></section></div><p class="sub">${escape(entry.receipt?.message||'A alteração precisa de revisão.')}</p><div class="review-actions"><button class="primary" id="keep-server">Manter versão do PC</button>${canRevise?`<button id="revise-local">${entry.operation.command==='movement.delete'?'Repetir eliminação':'Rever minha proposta'}</button>`:'<p class="sub">Uma edição antiga não pode recriar um movimento eliminado.</p>'}</div>`;

}

function accountCard(a,state,ledger){const confirmed=state.confirmed.ledger.accounts.find(c=>c.id===a.id);return `<button type="button" class="review-card account-card" data-account="${escape(a.id)}"><div><h2>${escape(a.name)}</h2><small>${escape(a.type)}${a.archived?' · Arquivada':''}</small></div><div><strong class="review-value" data-balance="${escape(a.id)}">${money(P.Finance.cents(P.Finance.balanceAt(ledger,a)))}</strong><small>${confirmed?'Confirmado: '+money(P.Finance.cents(P.Finance.balanceAt(state.confirmed.ledger,confirmed))):'Criada neste dispositivo'}</small></div></button>`;}

function preserveAccount(){const form=document.getElementById('account-form');if(page!=='editar-conta'||!form||!accountForm)return;const values=new FormData(form);accountForm.name=String(values.get('name')||'');accountForm.type=String(values.get('type')||'');if(accountForm.command==='account.add')accountForm.opening=String(values.get('opening')||'');}

function accountFingerprint(){preserveAccount();return JSON.stringify(accountForm);}

function accountEditor(){const a=accountForm;if(!a)return '<h1>Conta indisponível</h1><button data-page="contas">Voltar</button>';return `<button class="back" data-page="contas">‹ Contas</button><h1>${a.command==='account.add'?'Nova conta':'Editar conta'}</h1><p class="sub">${a.command==='account.add'?'Define o saldo anterior aos movimentos que vais registar.':'Mudar o nome mantém os movimentos e os saldos desta conta.'}</p><form id="account-form"><label>Nome<input name="name" value="${escape(a.name)}" maxlength="80" required autocomplete="off"></label><label>Tipo<select name="type">${[...new Set([...Accounts.types,a.type])].map(t=>`<option ${t===a.type?'selected':''}>${escape(t)}</option>`).join('')}</select></label>${a.command==='account.add'?`<label>Saldo inicial (€)<input name="opening" value="${escape(a.opening)}" inputmode="decimal" required></label>`:'<p class="note">O saldo inicial é conservado. Esta edição não altera valores.</p>'}<p class="sub">Só fica guardado depois de tocares em Guardar conta.</p><button class="primary full" id="save-account" type="button">Guardar conta</button></form>`;}

async function saveAccount(){const form=document.getElementById('account-form');if(!form||!form.reportValidity())return;preserveAccount();await run(async()=>{const a=accountForm,p={id:a.id,name:a.name,type:a.type};if(a.command==='account.add')p.openingCents=Accounts.openingCents(a.opening);const record=await persistAccount();await client.enqueue(a.command,p,{expectedEntityRevision:accountRevision,accountDraft:{token:record.token,sequence:record.sequence}});accountDraftRecord=null;selectedAccount=a.id;accountForm=null;page='conta';message.textContent='Conta guardada neste dispositivo.';});}

function agendaPage(ledger){const result=Agenda.agenda(ledger,summaryPeriod,today(),showCompletedAgenda);return `<button class="back" data-page="resumo">‹ Resumo</button><h1>Agenda</h1><p class="sub">Compromissos, recorrências e subscrições deste mês.</p>${periodControls(ledger)}<button type="button" id="new-commitment" class="primary full">+ Novo compromisso</button>${commitBanner()}<div class="pair"><section class="stat"><small>A pagar</small><strong data-agenda-pay>${money(result.payCents)}</strong></section><section class="stat"><small>A receber</small><strong data-agenda-receive>${money(result.receiveCents)}</strong></section></div><p class="sub">${result.pendingCount} por concluir${result.estimated?' · Inclui estimativas':''}. Valores previstos; o saldo só muda com movimentos registados.</p><label class="agenda-check"><input id="agenda-completed" type="checkbox" ${showCompletedAgenda?'checked':''}> Mostrar recorrências e subscrições concluídas</label><div class="agenda-list">${result.rows.map(t=>`<article class="review-card agenda-entry"><div><strong>${escape(t.description||'Compromisso')}</strong><small>${escape(V.dateLabel(t.date))} · ${escape(t.agendaSource)}</small><small>${escape(t.account||'Conta não indicada')}${t.targetAccount?' → '+escape(t.targetAccount):''}</small><small class="agenda-state">${escape(t.status)}${t.estimated?' · Estimativa':''}</small>${t.occurrenceNote?`<p class="sub">${escape(t.occurrenceNote)}</p>`:''}${t.agendaSource==='Compromisso'?`<button type="button" class="commit-open" data-commitment="${escape(t.id)}">Abrir compromisso</button>`:''}</div><span class="amount">${t.type==='transfer'?'↔ ':t.type==='expense'?'−':'+'}${money(t.amountCents)}</span></article>`).join('')||'<p class="empty">Sem compromissos previstos neste mês.</p>'}</div>`;}

function commitBanner(){return current.state.commitmentDraft?'<section class="draft-banner"><strong>Tens um compromisso por concluir</strong><p>O preenchimento está guardado neste dispositivo.</p><button type="button" id="resume-commitment">Retomar compromisso</button><button type="button" id="ask-discard-commitment">Descartar rascunho</button></section>':'';}

function preserveCommit(){const form=document.getElementById('commitment-form');if(page!=='novo-compromisso'||!form||!cf)return;const values=new FormData(form);for(const k of ['type','amount','description','accountId','date','category','reason'])cf[k]=String(values.get(k)??'');}

async function persistCommit(){preserveCommit();if(!cf||!cr)return null;const saved=await commitmentDrafts.save({...cr,form:P.copy(cf)});if(cr?.token===saved.token)cr=saved;return saved;}

function autoCommit(){if(page!=='novo-compromisso'||busy||!cr)return;preserveCommit();if(!cr.sequence&&JSON.stringify(cf)===cfBaseline)return;const number=++commitWrite,token=cr.token;const status=document.getElementById('commitment-status');if(status)status.textContent='A guardar rascunho…';persistCommit().then(()=>{if(cr?.token===token&&number===commitWrite&&document.getElementById('commitment-status'))document.getElementById('commitment-status').textContent='Rascunho guardado neste dispositivo.';}).catch(e=>{message.textContent=e.message;if(document.getElementById('commitment-status'))document.getElementById('commitment-status').textContent='Não foi possível guardar. Mantém o formulário aberto.';});}

async function resumeCommit(){await adapter.idle();const state=(await adapter.read()).state,record=state.commitmentDraft;K.valid(record);cf=P.copy(record.form);cr=P.copy(record);cfBaseline=JSON.stringify(cf);page='novo-compromisso';}

async function openCommitForm(id=null,action='edit'){await adapter.idle();const state=(await adapter.read()).state;if(state.commitmentDraft){await resumeCommit();return;}const v=P.view(state),old=id?v.ledger.pendingPayments.find(t=>t.id===id):null;if(id&&!Commitments.editable(v.ledger,old))throw Error('Este compromisso exige gestão especializada.');cf=old?{id:old.id,command:'commitment.update',action,type:old.type,amount:String(old.amount).replace('.',','),description:old.description,accountId:v.ledger.accounts.find(a=>a.name===old.account)?.id||'',date:old.date,category:old.category||'Outros',reason:'',changedOn:today()}:{id:P.id(),command:'commitment.add',action:'new',type:'expense',amount:'',description:'',accountId:v.ledger.accounts.find(a=>!a.archived)?.id||'',date:today(),category:'Outros',reason:'',changedOn:today()};cr=K.create(state,cf,v.revisions['commitment:'+cf.id]||0);cfBaseline=JSON.stringify(cf);page='novo-compromisso';}

function commitForm(ledger){if(!cf||!cr)return '<p>Compromisso indisponível.</p>';const accounts=ledger.accounts.filter(a=>!a.archived),available=accounts.some(a=>a.id===cf.accountId),reason=K.reason(current.state,cr);return `<button class="back" data-page="agenda">‹ Agenda</button><h1>${cf.command==='commitment.add'?'Novo compromisso':cf.action==='reschedule'?'Reagendar compromisso':'Editar compromisso'}</h1><p class="sub">Guardar atualiza a previsão. O saldo mantém-se até registares o pagamento ou recebimento.</p><form id="commitment-form"><label>Tipo<select name="type"><option value="expense" ${cf.type==='expense'?'selected':''}>Despesa</option><option value="income" ${cf.type==='income'?'selected':''}>Receita</option></select></label><label>Descrição<input name="description" maxlength="120" required value="${escape(cf.description)}"></label><label>Valor (€)<input name="amount" inputmode="decimal" required value="${escape(cf.amount)}"></label><label>Conta<select name="accountId">${!available?`<option value="${escape(cf.accountId)}" selected>Conta indisponível · escolhe outra</option>`:''}${accounts.map(a=>`<option value="${escape(a.id)}" ${a.id===cf.accountId?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label><label>Data prevista<input name="date" type="date" required value="${escape(cf.date)}"></label><label>Categoria<input name="category" maxlength="120" required value="${escape(cf.category)}" placeholder="Ex.: Casa / Renda"></label>${cf.command==='commitment.update'?`<label>Motivo do reagendamento (se mudares a data)<textarea name="reason" maxlength="500" rows="3">${escape(cf.reason)}</textarea></label>`:'<input name="reason" type="hidden" value="">'}<p id="commitment-status" role="status">${cr.sequence?'Rascunho guardado neste dispositivo.':'O preenchimento é guardado como rascunho.'}</p>${reason?`<p class="note">${escape(reason)}</p>`:''}<button type="button" class="primary full" id="save-commitment">Guardar compromisso</button><button id="ask-discard-commitment" class="full" type="button">Descartar rascunho</button></form>`;}

function originalCommitmentDetail(ledger){const row=ledger.pendingPayments.find(t=>t.id===commitmentId);if(!row)return '<button data-page="agenda">‹ Agenda</button><h1>Compromisso indisponível</h1>';return `<button class="back" data-page="agenda">‹ Agenda</button><h1>${escape(row.description)}</h1><section class="review-card"><p class="review-value">${money(P.Finance.cents(row.amount))}</p><p>${escape(V.dateLabel(row.date))} · ${escape(row.account||'Conta não indicada')}</p><small>${escape(row.category||'Outros')}</small></section>${Commitments.editable(ledger,row)?'<div class="review-actions"><button id="edit-commitment" class="primary">Editar compromisso</button><button id="reschedule-commitment">Reagendar</button></div>':'<p class="note">Este compromisso exige gestão especializada.</p>'}${row.reschedules?.length?`<h2>Histórico de reagendamento</h2><ul class="commit-history">${row.reschedules.map(r=>`<li>${escape(V.dateLabel(r.from))} → ${escape(V.dateLabel(r.to))}<p>${escape(r.reason)}</p></li>`).join('')}</ul>`:''}`;}

async function saveCommit(){const form=document.getElementById('commitment-form');if(!form||!form.reportValidity())return;preserveCommit();await run(async()=>{await adapter.idle();cf.changedOn=today();const record=await persistCommit(),p=K.payload(cf);await client.enqueue(cf.command,p,{expectedEntityRevision:cr.expectedRevision,commitmentDraft:{token:record.token,sequence:record.sequence}});commitmentId=p.id;summaryPeriod=p.date.slice(0,7);cf=null;cr=null;cfBaseline=null;page='compromisso';message.textContent='Compromisso guardado. O saldo não foi alterado.';});}

async function leaveCommit(next){await adapter.idle();const s=(await adapter.read()).state;if(cf&&cr&&!K.reason(s,cr)&&(cr.sequence||JSON.stringify(cf)!==cfBaseline))await persistCommit();cf=null;cr=null;cfBaseline=null;page=next==='novo'&&current.state.movementDraft?'rascunho':next;renderedPage=null;}

async function render(){

 preserveHouse();

 preservePayment();

 preserveCommit();

 preserveAccount();

 current=await adapter.read();const state=current.state;if(!state)throw Error('SQLite não devolveu dados.');

 const view=P.view(state),ledger=view.ledger,pending=state.outbox.filter(x=>['pending','sending'].includes(x.status)).length;

 document.getElementById('storage').textContent=`SQLite local · ${pending?pending+' por sincronizar':'dados guardados'}${state.blocked?' · revisão necessária':''}`;

 const privacy=document.getElementById('privacy');privacy.textContent=state.hidden?'Mostrar valores':'Ocultar valores';privacy.setAttribute('aria-pressed',String(state.hidden));

 const activeTab=Nav.tabFor(page);document.querySelectorAll('nav button').forEach(b=>{b.removeAttribute('aria-current');if(b.dataset.page===activeTab)b.setAttribute('aria-current','page');});





 const ctx={ledger,state,today:today(),lastSync:readLastSync(),settings:{notifications:false,hour:9,theme:'auto',hideOnOpen:false},money,go:target=>run(async()=>{renderedPage=null;page=target;}),commit:(command,payload,options)=>client.enqueue(command,payload,options),counts:{notices:null,shopping:ledger.casa?.shopping?ledger.casa.shopping.filter(s=>!s.done).length:null},pending,release:__RELEASE__,setFilter:(field,value)=>{if(busy)return;filters[field]=value;visibleLimit=40;run(async()=>{});}};

 if(page==='mais')main.innerHTML=Mais.render(ctx);

 if(Nav.isPlaceholder(page))main.innerHTML=Nav.placeholder(page);

 if(page==='resumo')main.innerHTML=Resumo.render(ctx,{period:summaryPeriod});

 if(page==='movimentos'){main.innerHTML=Movimentos.render(ctx,{filters,visibleLimit});Movimentos.bind(ctx,main);}

 if(page==='casa')main.innerHTML=HouseUI.render(ledger,houseTab,houseId,{escape,money,dateLabel:V.dateLabel});

 if(page==='casa-form')main.innerHTML=houseForm(ledger);

 if(page==='casa'&&state.houseDraft)main.insertAdjacentHTML('afterbegin','<section class="draft-banner"><strong>Tens um artigo Casa por concluir</strong><button id="resume-house">Retomar preenchimento</button><button id="ask-discard-house">Descartar rascunho</button></section>');

 if(page==='descartar-casa')main.innerHTML='<h1>Descartar o preenchimento Casa?</h1><p>Os produtos e o stock guardados mantêm-se.</p><button data-page="casa">Manter rascunho</button><button id="confirm-discard-house">Descartar rascunho</button>';

 if(page==='recuperacao')main.innerHTML=recoveryPage();

 if(page==='confirmar-recuperacao')main.innerHTML='<button class="back" data-page="recuperacao">‹ Cancelar</button><h1>Rever recuperação</h1><p>O restauro substitui os dados locais e guarda o estado anterior. Só é permitido diretamente na mesma associação.</p><button id="confirm-recovery" class="primary full">Restaurar nesta associação</button><h2>Outro aparelho</h2><p>Num aparelho vazio, podes importar os dados para uso offline. Os registos antigos não são reenviados ao PC. A origem completa fica arquivada e os rascunhos que dependiam da associação anterior exigem revisão.</p><button id="portable-import" class="full">Preparar passagem para este aparelho</button><label>Palavra-passe para exportar a origem<input id="backup-password" type="password" minlength="10" maxlength="512" autocomplete="off"></label><button id="export-recovery-candidate">Guardar esta origem encriptada</button>';

 if(page==='confirmar-desligar')main.innerHTML='<button class="back" data-page="sync">‹ Cancelar</button><h1>Preparar nova ligação?</h1><p>Os dados atuais ficam disponíveis offline. O histórico original fica num ponto anterior e as operações antigas não serão reenviadas. A ligação antiga deixa de ser usada neste aparelho; revoga-a no PC se já não for necessária. A associação seguinte exige escolher os dados do PC.</p><button id="confirm-detach" class="primary full">Conservar dados e desligar associação</button>';
 if(page==='confirmar-passagem')main.innerHTML='<button class="back" data-page="recuperacao">‹ Cancelar</button><h1>Confirmar passagem offline?</h1><p>Os dados da cópia passam a ser a base local deste aparelho. O histórico original fica arquivado, sem credenciais e sem reenviar operações antigas. A ligação ao PC é feita separadamente e exige escolher os dados do PC.</p><button id="confirm-portable" class="primary full">Confirmar passagem</button>';

 if(page==='agenda')main.innerHTML=agendaPage(ledger);

 if(page==='pagar-compromisso')main.innerHTML=paymentForm(ledger);

 if(page==='descartar-pagamento')main.innerHTML='<h1>Descartar o pagamento por concluir?</h1><p>O compromisso e os pagamentos guardados mantêm-se.</p><button data-page="agenda">Manter rascunho</button><button id="confirm-discard-payment">Descartar rascunho</button>';

 if(['agenda','resumo'].includes(page)&&state.paymentDraft)main.insertAdjacentHTML('afterbegin','<section class="draft-banner"><strong>Tens um pagamento por concluir</strong><button id="resume-payment">Retomar pagamento</button><button id="ask-discard-payment">Descartar rascunho</button></section>');

 if(page==='novo-compromisso')main.innerHTML=commitForm(ledger);

 if(page==='compromisso')main.innerHTML=commitmentDetail(ledger);

 if(page==='descartar-compromisso')main.innerHTML='<h1>Descartar o rascunho do compromisso?</h1><p>O preenchimento por concluir será removido. Os compromissos e movimentos guardados mantêm-se.</p><div class="review-actions"><button data-page="agenda">Manter rascunho</button><button id="confirm-discard-commitment">Descartar rascunho</button></div>';

 if(page==='resumo'&&state.commitmentDraft)main.insertAdjacentHTML('afterbegin','<section class="draft-banner"><strong>Tens um compromisso por concluir</strong><button data-page="agenda">Abrir Agenda</button></section>');

 if(['resumo','movimentos'].includes(page)&&state.movementDraft)main.insertAdjacentHTML('afterbegin',draftBanner());

 if(page==='rascunho')main.innerHTML=recovery();

 if(page==='descartar-rascunho')main.innerHTML='<h1>Descartar o rascunho?</h1><p>O texto por concluir será removido deste dispositivo. Os movimentos guardados mantêm-se.</p><div class="review-actions"><button id="cancel-discard-draft" class="primary">Manter rascunho</button><button id="confirm-discard-draft">Descartar rascunho</button></div>';

 if(page==='novo')main.innerHTML=movementForm(ledger);

 if(page==='contas')main.innerHTML=`<h1>Contas</h1><p class="sub">Os saldos incluem alterações locais. Arquivar conserva o histórico e o saldo.</p><button class="primary full" id="new-account">+ Nova conta</button>${ledger.accounts.filter(a=>!a.archived).map(a=>accountCard(a,state,ledger)).join('')||'<p class="empty">Sem contas ativas. Cria ou reativa uma conta.</p>'}${ledger.accounts.some(a=>a.archived)?`<details class="archived-accounts"><summary>Contas arquivadas · ${ledger.accounts.filter(a=>a.archived).length}</summary>${ledger.accounts.filter(a=>a.archived).map(a=>accountCard(a,state,ledger)).join('')}</details>`:''}`;

 if(page==='contas'&&state.accountDraft)main.insertAdjacentHTML('afterbegin','<section class="draft-banner"><strong>Tens uma conta por concluir</strong><button id="resume-account">Retomar conta</button></section>');

 if(page==='editar-conta')main.innerHTML=accountEditor();

 if(page==='sair-conta')main.innerHTML='<h1>Sair sem guardar a conta?</h1><p>O preenchimento desta conta ainda não foi guardado. Os movimentos e os rascunhos existentes mantêm-se.</p><div class="review-actions"><button id="stay-account" class="primary">Continuar a preencher</button><button id="leave-account">Sair sem guardar</button></div>';

 if(page==='arquivar-conta'){const a=ledger.accounts.find(a=>a.id===selectedAccount);main.innerHTML=`<h1>${a?.archived?'Reativar':'Arquivar'} conta?</h1><p>${escape(a?.name||'Conta indisponível')}</p><p>O saldo e todos os movimentos são conservados. Uma conta arquivada deixa de estar disponível para novos movimentos.</p><div class="review-actions"><button data-page="conta">Cancelar</button><button id="confirm-archive" class="primary">${a?.archived?'Reativar':'Arquivar'} conta</button></div>`;}

 if(page==='conta'){

  const account=ledger.accounts.find(a=>a.id===selectedAccount);

  const rows=account?V.movements(ledger,state,{accountId:account.id},visibleLimit):{rows:[],total:0};

  main.innerHTML=`<button class="back" data-page="contas">‹ Contas</button><h1>${account?escape(account.name):'Conta indisponível'}</h1>${account?`<section class="balance"><span>Saldo atual</span><strong>${money(P.Finance.cents(P.Finance.balanceAt(ledger,account)))}</strong><small>${escape(account.type)}${account.archived?' · Arquivada':''}</small></section><div class="review-actions"><button id="edit-account">Editar conta</button><button id="ask-archive">${account.archived?'Reativar conta':'Arquivar conta'}</button></div><h2>Movimentos desta conta</h2><p class="sub">Transferências mostram o efeito nesta conta.</p>${rows.rows.map(t=>row(t,account.name)).join('')||'<p class="empty">Ainda não existem movimentos nesta conta.</p>'}${rows.rows.length<rows.total?'<button id="show-more" class="full">Mostrar mais movimentos</button>':''}`:''}`;

 }

 if(page==='consulta-financeira')main.innerHTML=financialConsultation(ledger);

 if(page==='resumo')main.insertAdjacentHTML('beforeend','<button class="full agenda-shortcut" data-page="consulta-financeira">Créditos e prestações · consulta</button>');

 if(page==='detalhe'){

  main.innerHTML=Movimentos.detail(ctx,{movementId:selectedId,returnPage:detailReturn});
 }



 if(page==='eliminar'){

  const t=ledger.transactions.find(t=>t.id===selectedId);

  main.innerHTML=`<button class="back" data-page="movimentos">‹ Cancelar</button><h1>Eliminar movimento?</h1>${t?`<section class="review-card"><h2>${escape(t.description)}</h2><p>${money(P.Finance.cents(t.amount))}</p><small>${t.type==='transfer'?'O efeito nas duas contas será retirado em conjunto.':'A alteração fica por confirmar até sincronizares.'}</small></section><button id="confirm-delete" class="primary full">Eliminar movimento</button>`:'<p>O movimento já foi eliminado.</p>'}`;

 }

 if(page==='conflito')main.innerHTML=conflictPanel(state);

 if(page==='sync'){

  const pairing=connection?`<div class="note">PC associado · ligação guardada com proteção do Android. Podes continuar a registar sem rede.</div><button type="button" id="sync" class="primary full">Sincronizar</button><button type="button" id="review-detach" class="full">Preparar nova ligação</button>`:savedConnection?.kind==='pairing'?`<div class="note">Existe uma associação por concluir. O código e a credencial estão guardados com proteção do Android.</div><button type="button" id="resume-pair" class="primary full">Retomar associação</button><button type="button" id="cancel-pair" class="full">Cancelar tentativa</button>`:`<div class="note">No PC de ensaio, cria um código para este dispositivo. Podes associar uma base vazia ou confirmar a substituição pelos dados do PC. Nesse caso, o estado local fica conservado num ponto anterior.</div><form id="pairing"><label>Endereço apresentado no PC<input name="server" id="pair-server" type="url" placeholder="https://pc:…" required autocomplete="off"></label><label>Código do PC<input name="code" id="pair-code" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" required autocomplete="off" autocapitalize="characters"></label><label class="note"><input type="checkbox" name="replaceLocal" value="yes" ${state.outbox.length||state.confirmed.ledger.transactions.length||state.confirmed.ledger.pendingPayments?.length||state.confirmed.ledger.casa?.catalog?.length||state.movementDraft||state.commitmentDraft||state.paymentDraft||state.accountDraft||state.houseDraft?'required':''}> Se este aparelho já tiver dados, confirmo substituí-los pelos dados do PC e conservar o estado local num ponto anterior. Esta ação não junta as duas bases.</label><button type="button" id="pair" class="primary">Associar este dispositivo</button></form>`;

  main.innerHTML=`<h1>Ligação</h1><p class="sub">Ensaio local · associação e sincronização</p>${pairing}<h2>Alterações deste dispositivo</h2><div class="queue">${state.outbox.map(x=>`<section class="queue-entry"><strong>${escape(x.operation.payload.description||x.operation.payload.name||(x.operation.command.startsWith('account.')?'Conta':'Movimento'))}</strong><small>${x.resolution?(x.resolution.choice==='server'?'Revisto · versão do PC mantida':'Revisto · nova proposta conservada'):({pending:'Por enviar',sending:'Envio por confirmar',acknowledged:'Confirmado pelo servidor',conflict:'Conflito — proposta local preservada',rejected:'Recusado — proposta local preservada',blocked:'Bloqueado por dependência'})[x.status]||'Revisão necessária'}</small>${!x.resolution&&['conflict','rejected','blocked'].includes(x.status)?`<button data-review="${escape(x.operation.operationId)}">Rever</button>`:''}</section>`).join('')||'<p class="sub">Sem alterações pendentes.</p>'}</div>`;

 }

 if(page==='conflito'){const entry=state.outbox.find(x=>x.operation.operationId===conflictId);if(entry&&(entry.operation.command.startsWith('commitment.')||entry.operation.command.startsWith('house.')||entry.operation.command.startsWith('account.'))){const p=entry.operation.payload;main.innerHTML=`<button class="back" data-page="sync">‹ Ligação</button><h1>Rever proposta</h1><p>${escape(entry.receipt?.message||'Os dados mudaram.')}</p><h2>Proposta conservada</h2><pre class="proposal">${state.hidden?'Valores ocultos':escape(JSON.stringify(p,null,2))}</pre><p class="sub">Manter a versão do PC conserva a proposta no histórico. Repetir envia os mesmos campos apresentados com novas pré-condições; um pagamento nunca pode exceder o restante.</p><div class="review-actions"><button id="keep-server">Manter versão do PC</button><button id="repeat-extended">Repetir proposta apresentada</button></div>`;}}

 if(page==='sync')main.insertAdjacentHTML('afterbegin','<button data-page="recuperacao" class="full">Cópia e recuperação</button>');

 if(page==='novo'&&draftBaseline===null){draftBaseline=formFingerprint();draftRecord.baseline=draftBaseline;}

 main.setAttribute('aria-busy',String(busy));

 if(renderedPage!==page){renderedPage=page;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.scrollTo(0,0);}

}

function formFingerprint(){const form=document.getElementById('movement');return form?JSON.stringify([...new FormData(form).entries()]):null;}

function preserveDraft(){const form=document.getElementById('movement');if(page!=='novo'||!draft||!form)return;const values=new FormData(form);for(const key of ['amount','description','type','category','subcategory','categoryDetail','categorySubdetail','date','note','beneficiary','noteColor','expenseNature'])draft[key]=String(values.get(key)??'');draft.accountId=String(values.get('account')||'');draft.targetId=String(values.get('target')||'');}

async function persistDraft(){preserveDraft();if(!draftRecord||!draft)return null;const record={...draftRecord,form:P.copy(draft),baseline:draftBaseline||draftRecord.baseline};const saved=await drafts.save(record);draftRecord=saved;return saved;}

function autoSaveDraft(){if(page!=='novo'||!draftRecord||busy)return;preserveDraft();if(!draftRecord.sequence&&formFingerprint()===draftBaseline)return;const id=++draftWriteId;const status=document.getElementById('draft-status');if(status)status.textContent='A guardar rascunho…';persistDraft().then(()=>{if(id===draftWriteId&&document.getElementById('draft-status'))document.getElementById('draft-status').textContent='Rascunho guardado neste dispositivo.';}).catch(error=>{if(document.getElementById('draft-status'))document.getElementById('draft-status').textContent='Não foi possível guardar o rascunho. Mantém este formulário aberto.';message.textContent=error.message;});}

async function leaveForm(next,discard){await adapter.idle();const s=(await adapter.read()).state,saved=s.movementDraft;if(discard&&saved){if(!draftRecord||saved.token!==draftRecord.token)throw Error('Existe outro rascunho. Foi preservado.');await drafts.discard(saved);}else if(!discard&&draftRecord&&!D.staleReason(s,draftRecord))await persistDraft();draft=null;draftRecord=null;draftBaseline=null;formRevision=null;resolvingId=null;renderedPage=null;page=next;}

async function run(fn){if(busy)return;preserveHouse();preservePayment();preserveCommit();preserveAccount();preserveDraft();busy=true;main.inert=true;main.setAttribute('aria-busy','true');message.textContent='';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();await render();}catch(error){message.textContent=error.message;try{await render();}catch{main.textContent='Não foi possível abrir os dados. Nenhum ficheiro foi substituído.';}}finally{busy=false;main.inert=false;main.setAttribute('aria-busy','false');document.getElementById('privacy').disabled=false;document.querySelectorAll('nav button,#leaveDialog button').forEach(b=>b.disabled=false);}}

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

function paymentForm(ledger){if(!pf)return '<p>Pagamento indisponível.</p>';const t=ledger.pendingPayments.find(t=>t.id===pf.id),reason=Forms.staleReason(current.state,pr);return `<button class="back" data-page="agenda">‹ Agenda</button><h1>${t?.type==='income'?'Registar recebimento':'Registar pagamento'}</h1><p>${escape(t?.description||'Compromisso indisponível')}</p><p>Por liquidar: <strong>${t?money(P.Finance.cents(t.amount)):'Indisponível'}</strong></p><p class="sub">Confirma apenas dinheiro que já entrou ou saiu. Num pagamento parcial, o restante continua na Agenda.</p><form id="payment-form"><label>Valor (€)<input name="amount" inputmode="decimal" required value="${escape(pf.amount)}"></label><label>Data efetiva<input name="date" type="date" required max="${today()}" value="${escape(pf.date)}"></label><p id="payment-status" role="status">${pr.sequence?'Rascunho guardado neste dispositivo.':'O preenchimento será guardado neste dispositivo.'}</p>${reason?`<p class="note">${escape(reason)}</p>`:''}<button id="save-payment" type="button" class="primary full">Confirmar registo</button><button id="ask-discard-payment" class="full" type="button">Descartar rascunho</button></form>`;}

function commitmentDetail(ledger){const t=ledger.pendingPayments.find(t=>t.id===commitmentId),paid=ledger.transactions.filter(t=>t.pendingId===commitmentId);let html=t?originalCommitmentDetail(ledger):`<button data-page="agenda">‹ Agenda</button><h1>${paid.length?'Compromisso liquidado':'Compromisso indisponível'}</h1>`;if(t&&Commitments.payable(ledger,t))html+='<button id="open-payment" class="primary full">'+(t.type==='income'?'Registar recebimento':'Registar pagamento')+'</button>';if(paid.length)html+='<h2>Pagamentos registados</h2>'+paid.map(t=>row(t)).join('');return html;}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.id==='open-payment'||b.id==='resume-payment'){e.stopImmediatePropagation();run(()=>openPayment());}else if(b.id==='save-payment'){e.stopImmediatePropagation();const f=document.getElementById('payment-form');if(!f.reportValidity())return;run(async()=>{const r=await persistPayment(),p=Forms.paymentPayload(pf);await client.enqueue('commitment.settle',p,{expectedEntityRevision:pr.expectedRevision,paymentDraft:{token:r.token,sequence:r.sequence}});commitmentId=p.id;pf=null;pr=null;page='compromisso';message.textContent='Registo guardado. O saldo e o restante foram atualizados em conjunto.';});}else if(b.id==='ask-discard-payment'){e.stopImmediatePropagation();run(async()=>{paymentDiscard=P.copy((await adapter.read()).state.paymentDraft);page='descartar-pagamento';});}else if(b.id==='confirm-discard-payment'){e.stopImmediatePropagation();run(async()=>{await Forms.discard(adapter,'paymentDraft',paymentDiscard);pf=null;pr=null;page='agenda';});}else if(page==='pagar-compromisso'&&b.dataset.page){e.stopImmediatePropagation();run(async()=>{if(pr&&!Forms.staleReason((await adapter.read()).state,pr))await persistPayment();pf=null;pr=null;page=b.dataset.page;});}},true);

for(const name of ['input','change'])document.addEventListener(name,e=>{if(e.target.closest('#payment-form')&&!busy)persistPayment().then(()=>{const el=document.getElementById('payment-status');if(el)el.textContent='Rascunho guardado neste dispositivo.';}).catch(e=>message.textContent=e.message);});

// The Android back action follows the same form exits as the visible controls.

window.EquilibrioBack=()=>{if(busy)return true;const dialog=document.getElementById('leaveDialog');if(dialog.open){dialog.close();pendingPage=null;return true;}if(page==='resumo')return false;const visibleBack=main.querySelector('button.back,button[data-page]');if(visibleBack){visibleBack.click();return true;}document.querySelector('nav [data-page="resumo"]').click();return true;};

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(page==='novo')persistDraft().catch(e=>message.textContent=e.message);if(page==='novo-compromisso')persistCommit().catch(e=>message.textContent=e.message);if(page==='pagar-compromisso')persistPayment().catch(e=>message.textContent=e.message);}});



function financialConsultation(ledger){const c=Consult.debts(ledger,summaryPeriod);return `<button class="back" data-page="resumo">‹ Resumo</button><h1>Créditos e prestações</h1><p class="sub">Consulta dos registos existentes. Alterações e pagamentos especializados mantêm o percurso no PC.</p>${periodControls(ledger)}<h2>Créditos</h2>${c.debts.map(d=>`<section class="review-card"><h3>${escape(d.name)}</h3><small>Capital em dívida</small><p class="review-value">${money(d.balanceCents)}</p><p>Prestação: ${money(d.paymentCents)}</p></section>`).join('')||'<p class="empty">Sem créditos registados.</p>'}<h2>Prestações estimadas do mês</h2><p class="sub">Estimativas do modelo Windows; não são pagamentos registados.</p>${c.estimates.map(e=>`<section class="review-card"><strong>${escape(e.description)}</strong><p>${escape(V.dateLabel(e.date))} · ${money(P.Finance.cents(e.amount))}</p></section>`).join('')||'<p class="empty">Sem prestações estimadas neste mês.</p>'}<h2>Compras em prestações</h2>${c.plans.map(p=>`<section class="review-card"><h3>${escape(p.description)}</h3>${p.payments.map(x=>`<div class="info-line"><span>${escape(V.dateLabel(x.date))}</span><strong>${money(x.remainingCents)} por liquidar</strong></div>`).join('')}</section>`).join('')||'<p class="empty">Sem planos de prestações.</p>'}`;}

function preserveHouse(){const f=document.getElementById('house-form');if(page!=='casa-form'||!hf||!f)return;const d=new FormData(f);for(const [k,v] of d.entries())if(!k.startsWith('offer-'))hf[k]=String(v);if(hf.command==='house.product')hf.offers=[...f.querySelectorAll('[data-offer-row]')].map(el=>({...Object.fromEntries(['storeName','packageQty','price','url'].map(k=>[k,el.querySelector('[data-offer-field="'+k+'"]').value]))}));}

async function persistHouse(){preserveHouse();if(!hr)return;const r=await Forms.save(adapter,'houseDraft',{...hr,form:P.copy(hf)});if(hr?.token===r.token)hr=r;return r;}

async function openHouseForm(kind,id=null){await adapter.idle();const s=(await adapter.read()).state;if(s.houseDraft){hr=P.copy(s.houseDraft);hf=P.copy(hr.form);page='casa-form';return;}const v=P.view(s),c=House.Casa.state(v.ledger),old=kind==='product'?c.catalog.find(x=>x.id===id):c.stock.find(x=>x.id===id);hf={id:old?.id||P.id(),command:'house.'+kind,mode:old?'update':'create',seed:P.id(),changedOn:today()};if(kind==='product'){const cats=P.Finance.categoryParts(old?.category||'');Object.assign(hf,{name:old?.name||'',brand:old?.brand||'',category:cats[0]||'',sub1:cats[1]||'',sub2:cats[2]||'',sub3:cats[3]||'',unit:old?.unit||'un',url:old?.url||'',offers:old?Object.entries(old.offers).map(([storeId,o])=>({storeName:c.stores.find(s=>s.id===storeId)?.name||'',packageQty:String(o.packageQty),price:String(o.price).replace('.',','),...(o.url?{url:o.url}:{})})) :[]});}else if(kind==='lot'){Object.assign(hf,{catalogId:old?.catalogId||id||'',qty:String(old?.qty||''),location:old?.location||'',expiry:old?.expiry||'',opened:old?.opened===true});}else {if(!old)throw Error('Lote indisponível.');Object.assign(hf,{id:old.id,qty:'',type:'consume',note:''});}hr=Forms.create(s,hf,'house',v.revisions.house||0);page='casa-form';}

function houseForm(ledger){if(!hf)return '<p>Formulário indisponível.</p>';const f=hf,reason=Forms.staleReason(current.state,hr),field=(name,label,extra='')=>`<label>${label}<input name="${name}" value="${escape(f[name]||'')}" ${extra}></label>`;let body='';if(f.command==='house.product'){body=field('name','Nome','required maxlength="160"')+field('brand','Marca','maxlength="80"')+field('category','Categoria','required')+field('sub1','Subcategoria 1')+field('sub2','Subcategoria 2')+field('sub3','Subcategoria 3')+`<label>Unidade de stock<select name="unit">${House.Casa.stockUnits.map(([id,label])=>`<option value="${id}" ${f.unit===id?'selected':''}>${escape(label)}</option>`).join('')}</select></label>`+`<h2>Preços por supermercado</h2><p class="sub">A quantidade usa a unidade de stock escolhida. Deixa o preço vazio se ainda não o sabes; o link pertence a este supermercado.</p>${f.offers.map((o,i)=>`<fieldset data-offer-row><legend>Preço ${i+1}</legend>${[['storeName','Supermercado'],['packageQty','Quantidade da embalagem'],['price','Preço (€), opcional'],['url','Link neste supermercado']].map(([k,label])=>`<label>${label}<input name="offer-${i}-${k}" data-offer-field="${k}" value="${escape(o[k]??'')}" ${k==='storeName'?'maxlength="160"':k==='url'?'type="url" maxlength="2048" placeholder="https://…"':'inputmode="decimal"'}></label>`).join('')}<button data-remove-offer="${i}" type="button">Retirar este preço do formulário</button></fieldset>`).join('')}<button id="add-offer" type="button">+ Adicionar supermercado</button>`;}else if(f.command==='house.lot'){body=(f.mode==='create'?field('qty','Quantidade','inputmode="decimal" required'):'<p>Alterar o destino mantém a quantidade original e os consumos.</p>')+field('location','Destino do produto','required maxlength="80" list="stock-places"')+'<datalist id="stock-places"><option>Despensa</option><option>Frigorífico</option><option>Congelador</option></datalist>'+field('expiry','Validade (opcional)','type="date"');}else body='<label>Registo<select name="type"><option value="consume" '+(f.type==='consume'?'selected':'')+'>Consumo</option><option value="waste" '+(f.type==='waste'?'selected':'')+'>Desperdício</option></select></label>'+field('qty','Quantidade','inputmode="decimal" required')+field('note','Motivo (opcional)','maxlength="500"');return `<button class="back" data-page="casa">‹ Casa</button><h1>${f.command==='house.product'?'Produto e preços':f.command==='house.lot'?'Lote de stock':'Registar consumo'}</h1><form id="house-form">${body}<p id="house-status" role="status">${hr.sequence?'Rascunho guardado neste dispositivo.':'O preenchimento será guardado neste dispositivo.'}</p>${reason?`<p class="note">${escape(reason)}</p>`:''}<button class="primary full" id="save-house" type="button">Guardar</button><button id="ask-discard-house" class="full" type="button">Descartar rascunho</button></form>`;}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;let task=null;if(b.dataset.houseTab)task=async()=>{houseTab=b.dataset.houseTab;page='casa';};if(b.dataset.product)task=async()=>{houseId=b.dataset.product;houseTab='produto';page='casa';};if(b.dataset.lot)task=async()=>{houseId=b.dataset.lot;houseTab='lote';page='casa';};if(b.id==='new-product'||b.dataset.editProduct)task=()=>openHouseForm('product',b.dataset.editProduct||null);if(b.dataset.newLot)task=()=>openHouseForm('lot',b.dataset.newLot);if(b.dataset.editLot)task=()=>openHouseForm('lot',b.dataset.editLot);if(b.dataset.consumeLot)task=()=>openHouseForm('consume',b.dataset.consumeLot);if(b.id==='resume-house')task=()=>openHouseForm('product');if(b.id==='add-offer')task=async()=>{preserveHouse();hf.offers.push({storeName:'',packageQty:'',price:''});document.getElementById('house-form').remove();await persistHouse();};if(b.dataset.removeOffer!==undefined)task=async()=>{preserveHouse();hf.offers.splice(Number(b.dataset.removeOffer),1);document.getElementById('house-form').remove();await persistHouse();};if(b.id==='ask-discard-house')task=async()=>{houseDiscard=P.copy((await adapter.read()).state.houseDraft);page='descartar-casa';};if(b.id==='confirm-discard-house')task=async()=>{await Forms.discard(adapter,'houseDraft',houseDiscard);hr=null;hf=null;page='casa';};if(b.dataset.shopping)task=async()=>{const p={id:b.dataset.shopping,seed:P.id(),changedOn:today(),values:{operation:'toggle'}};await client.enqueue('house.shopping',p);};if(b.id==='save-house'){if(!document.getElementById('house-form').reportValidity())return;task=async()=>{const r=await persistHouse(),p=HouseForm.payload(hf);await client.enqueue(hf.command,p,{houseDraft:{token:r.token,sequence:r.sequence}});houseId=p.id;houseTab=hf.command==='house.product'?'produto':hf.command==='house.lot'?'lote':'despensa';hf=null;hr=null;page='casa';message.textContent='Casa guardada neste dispositivo.';};}if(page==='casa-form'&&b.dataset.page)task=async()=>{if(hr&&!Forms.staleReason((await adapter.read()).state,hr))await persistHouse();hf=null;hr=null;page=b.dataset.page;};if(task){e.stopImmediatePropagation();run(task);}},true);

for(const name of ['input','change'])document.addEventListener(name,e=>{if(e.target.closest('#house-form')&&!busy)persistHouse().then(()=>{const el=document.getElementById('house-status');if(el)el.textContent='Rascunho guardado neste dispositivo.';}).catch(e=>message.textContent=e.message);});

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&page==='casa-form')persistHouse().catch(e=>message.textContent=e.message);});

document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='repeat-extended'&&!busy){e.stopImmediatePropagation();run(async()=>{await client.resolve(conflictId,'local');page='sync';message.textContent='Nova proposta guardada; a anterior ficou no histórico.';});}},true);

function recoveryPage(){return `<section><h2>Estados anteriores</h2><p class="sub">Conservamos até três pontos. Uma origem importada pode ser exportada novamente; só se restaura diretamente a mesma associação.</p><button id="list-checkpoints">Ver pontos guardados</button>${recoveryPoints.map(r=>`<article class="review-card"><strong>${r.revision===0?'Origem da passagem':'Estado anterior · revisão '+r.revision}</strong><p>${r.transactions} movimentos confirmados · ${r.operations} operações no histórico</p><button data-checkpoint="${r.id}">Abrir e rever</button></article>`).join('')}</section>`+`<button class="back" data-page="sync">‹ Ligação</button><h1>Cópia e recuperação</h1><p class="sub">Cópia encriptada dos dados e rascunhos locais. Guarda a palavra-passe: será necessária para recuperar. As credenciais da ligação ficam na proteção do Android e não são exportadas.</p><label>Palavra-passe da cópia<input id="backup-password" type="password" minlength="10" maxlength="512" autocomplete="off"></label><div class="review-actions"><button id="export-backup" class="primary">Guardar cópia encriptada</button><button id="choose-backup">Escolher cópia para recuperar</button>${recoveryFile?'<button id="open-backup">Abrir cópia escolhida</button>':''}</div>`;}

const recoveryAdapter={read:()=>adapter.read(),restoreWithCheckpoint:(state,revision)=>store.compareAndSet({state,expectedRevision:revision,preservePrevious:true})};

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;let task=null;const password=()=>document.getElementById('backup-password')?.value||'';if(b.id==='export-backup'){const pass=password();task=async()=>{await adapter.idle();const s=(await adapter.read()).state,data=await Recovery.encrypt(s,pass);await backupFiles.exportBackup({data});message.textContent='Cópia encriptada guardada.';};}if(b.id==='choose-backup')task=async()=>{recoveryFile=(await backupFiles.importBackup()).data;message.textContent='Cópia escolhida. Indica a palavra-passe e abre-a para rever o restauro.';};if(b.id==='review-detach')task=async()=>{recoveryExpected=await adapter.read();page='confirmar-desligar';};if(b.id==='confirm-detach')task=async()=>{await adapter.idle();await association.detach(recoveryExpected.revision);connection=null;savedConnection=null;recoveryExpected=null;page='sync';message.textContent='Dados conservados offline. Podes preparar a nova associação.';};if(b.id==='list-checkpoints')task=async()=>{recoveryPoints=(await store.listCheckpoints()).checkpoints;};if(b.dataset.checkpoint)task=async()=>{recoveryCandidate=(await store.readCheckpoint({id:Number(b.dataset.checkpoint)})).state;recoveryExpected=await adapter.read();portableMode=false;page='confirmar-recuperacao';};if(b.id==='portable-import')task=async()=>{Recovery.portable(recoveryCandidate,(await adapter.read()).state);recoveryExpected=await adapter.read();portableMode=true;page='confirmar-passagem';};if(b.id==='export-recovery-candidate'){const pass=password();task=async()=>{await backupFiles.exportBackup({data:await Recovery.encrypt(recoveryCandidate,pass)});message.textContent='Origem exportada com encriptação.';};}if(b.id==='confirm-portable')task=async()=>{await adapter.idle();await Recovery.transfer({...recoveryAdapter,importWithArchive:(state,archiveSource,revision)=>store.compareAndSet({state,archiveSource,expectedRevision:revision,preservePrevious:true})},recoveryCandidate,recoveryExpected);recoveryCandidate=null;recoveryExpected=null;page='resumo';message.textContent='Dados recuperados para consulta e uso offline. A origem ficou arquivada; as operações antigas não serão reenviadas ao PC.';};if(b.id==='open-backup'){const pass=password();task=async()=>{recoveryCandidate=await Recovery.decrypt(recoveryFile,pass);recoveryExpected=await adapter.read();page='confirmar-recuperacao';recoveryFile=null;};}if(b.id==='confirm-recovery')task=async()=>{await adapter.idle();await Recovery.restore(recoveryAdapter,recoveryCandidate,recoveryExpected);recoveryCandidate=null;recoveryExpected=null;draft=null;cf=null;pf=null;hf=null;draftRecord=null;cr=null;pr=null;hr=null;page='resumo';message.textContent='Cópia recuperada. O estado anterior foi conservado neste dispositivo.';};if(task){e.stopImmediatePropagation();run(task);}},true);

if(!__RELEASE__)window.EquilibrioRecoveryTest={encrypt:Recovery.encrypt,decrypt:Recovery.decrypt,restore:async(state,expected)=>{await Recovery.restore(recoveryAdapter,state,expected);await render();}};

async function persistAccount(){preserveAccount();if(!accountForm||!accountDraftRecord)return null;const r=await Forms.save(adapter,'accountDraft',{...accountDraftRecord,form:P.copy(accountForm)});if(accountDraftRecord?.token===r.token)accountDraftRecord=r;return r;}

async function resumeAccount(){await adapter.idle();const s=(await adapter.read()).state,r=s.accountDraft;Forms.valid('accountDraft',r);accountDraftRecord=P.copy(r);accountForm=P.copy(r.form);accountRevision=P.copy(r.expectedRevision);accountBaseline=JSON.stringify(accountForm);page='editar-conta';}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='resume-account'&&!busy){e.stopImmediatePropagation();run(()=>resumeAccount());}},true);

for(const event of ['input','change'])document.addEventListener(event,e=>{if(e.target.closest('#account-form')&&!busy)persistAccount().catch(e=>message.textContent=e.message);});

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&page==='editar-conta')persistAccount().catch(e=>message.textContent=e.message);});

