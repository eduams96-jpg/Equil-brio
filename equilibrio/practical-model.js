/* Domínios práticos: operações explícitas, simulações sem mutação. */
(function(root){'use strict';const F=root.Finance||(typeof require==='function'?require('./finance.js'):null),clone=x=>structuredClone(x),money=n=>F.money(n),text=(s,max=500)=>typeof s==='string'&&s.length<=max,positive=n=>Number.isFinite(n)&&n>=0&&Number.isSafeInteger(F.cents(n)),norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const empty=()=>({version:1,equipment:[],interventions:[],events:[],captures:[],corrections:[],rules:[],ruleAudit:[],autonomy:null});const state=d=>d.practical||empty();function writable(d){return d.practical||(d.practical=empty());}
function validate(d){if(d.practical===undefined)return;const s=d.practical;if(!s||s.version!==1)throw Error('Versão dos dados práticos não suportada.');for(const k of ['equipment','interventions','events','captures','corrections','rules','ruleAudit']){if(!Array.isArray(s[k])||s[k].length>10000)throw Error('Lista prática inválida: '+k);const ids=new Set();for(const r of s[k]){if(!r||!text(r.id,100)||!r.id||ids.has(r.id))throw Error('Identificador prático inválido ou repetido.');ids.add(r.id);}}
for(const e of s.equipment)if(!text(e.name,160)||!e.name.trim()||!positive(e.cost)||(e.date!==''&&!F.validDate(e.date))||(e.pendingId||e.reserveId||e.planStatus==='completed')&&!F.validDate(e.date)||e.purchasePrice!==undefined&&!positive(e.purchasePrice)||!['maintenance','replacement'].includes(e.kind)||!text(e.notes,2000)||e.warranty&& !F.validDate(e.warranty)||e.purchaseDate&&!F.validDate(e.purchaseDate)||e.reserveId&&!text(e.reserveId,100)||e.pendingId&&!text(e.pendingId,100))throw Error('Equipamento ou plano inválido.');
for(const e of s.equipment){if(e.document!==undefined)validateEquipmentDocument(e.document);if(e.planStatus!==undefined&&!['planned','completed'].includes(e.planStatus))throw Error('Estado do plano inválido.');if(e.planHistory!==undefined&&(!Array.isArray(e.planHistory)||e.planHistory.length>1000||new Set(e.planHistory.map(p=>p.id)).size!==e.planHistory.length||e.planHistory.some(p=>!text(p.id,100)||!p.id||!F.validDate(p.date)||!F.validDate(p.completedOn)||!positive(p.cost)||!['maintenance','replacement'].includes(p.kind)||!text(p.interventionId,100)||!text(p.transactionId,100)||!text(p.pendingId,100)||!text(p.reserveId,100))))throw Error('Histórico do plano inválido.');}
for(const i of s.interventions)if(!s.equipment.some(e=>e.id===i.equipmentId)||!F.validDate(i.date)||!positive(i.cost)||!text(i.description,500)||!i.description.trim()||i.transactionId&&!text(i.transactionId,100))throw Error('Intervenção inválida.');
for(const e of s.events)if(!text(e.title,160)||!e.title.trim()||!F.validDate(e.date)||!text(e.note,2000)||typeof e.includeInExports!=='boolean')throw Error('Acontecimento inválido.');
for(const c of s.captures){if(!['pending','linked','discarded'].includes(c.status)||!F.validDate(c.date)||!text(c.description,160)||c.amount!==null&&!positive(c.amount)||!text(c.note,2000)||c.transactionId&&!text(c.transactionId,100))throw Error('Captura inválida.');if(c.attachment&&(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c.attachment.data||'')||c.attachment.data.length>4000000||!text(c.attachment.name,160)))throw Error('Imagem da captura inválida ou demasiado grande.');}
for(const c of s.corrections)if(!text(c.match,160)||!c.match||!text(c.category,400)||!text(c.transactionId,100)||!F.validDate(c.date))throw Error('Correção inválida.');
for(const r of s.rules)if(!text(r.match,160)||r.match.trim().length<3||!text(r.category,400)||!r.category.trim()||!Array.isArray(r.exceptions)||r.exceptions.some(e=>!text(e,160))||typeof r.active!=='boolean')throw Error('Regra pessoal inválida.');
for(const a of s.ruleAudit)if(!F.validDate(a.date)||!text(a.ruleId,100)||!Array.isArray(a.changes)||a.changes.some(c=>!text(c.id,100)||!text(c.before,400)||!text(c.after,400)||!text(c.fingerprint,20000000)))throw Error('Histórico de regra inválido.');
if(s.autonomy)validateAutonomy(s.autonomy);
}
function validateAutonomy(c){if(!Array.isArray(c.accountIds)||c.accountIds.some(id=>!text(id,100))||new Set(c.accountIds).size!==c.accountIds.length||!positive(c.retainedIncome)||!positive(c.protectedFunds)||!positive(c.extraordinary)||!Number.isInteger(c.extraordinaryMonth)||c.extraordinaryMonth<1||c.extraordinaryMonth>120||!Array.isArray(c.essentials)||c.essentials.length>100||!c.essentials.some(e=>Number(e.monthly)>0)||c.essentials.some(e=>!text(e.category,400)||!e.category.trim()||!positive(e.monthly)||!Number.isFinite(e.reduction)||e.reduction<0||e.reduction>100))throw Error('Premissas da autonomia inválidas.');}
function autonomy(d,c=state(d).autonomy){
 if(!c)return null;validateAutonomy(c);
 if(c.accountIds.some(id=>!d.accounts.some(a=>a.id===id)))throw Error('Uma conta do cenário foi removida. Revê as premissas.');
 const gross=money(d.accounts.filter(a=>c.accountIds.includes(a.id)).reduce((n,a)=>n+F.balanceAt(d,a,F.today()),0)),available=money(Math.max(0,gross-c.protectedFunds)),essential=money(c.essentials.reduce((n,e)=>n+e.monthly*(1-e.reduction/100),0)),deficit=money(essential-c.retainedIncome),rows=[];
 let balance=available,coverage=0,initialShortfall=false;
 for(let m=1;m<=120;m++){
  const extra=m===c.extraordinaryMonth?c.extraordinary:0;
  // An upfront expense must be payable before the month's income arrives.
  if(extra>balance){rows.push({month:m,opening:balance,income:0,outgoing:extra,balance:money(balance-extra),initialShortfall:true});coverage=m-1;initialShortfall=true;break;}
  const out=money(essential+extra),next=money(balance+c.retainedIncome-out);
  rows.push({month:m,opening:balance,income:c.retainedIncome,outgoing:out,balance:next});
  if(next<0){coverage=money(m-1+(deficit>0?Math.min(1,Math.max(0,balance-extra)/deficit):0));break;}
  balance=next;coverage=m;
 }
 return{gross,available,protectedFunds:c.protectedFunds,essential,retainedIncome:c.retainedIncome,deficit,coverage,beyondHorizon:coverage===120,initialShortfall,rows};
}
function validateEquipmentDocument(a){
 if(!a||typeof a.name!=='string'||!a.name.trim()||a.name.length>160||a.type!=='application/pdf'||typeof a.data!=='string'||!/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.data))throw Error('Anexa um PDF válido até 8 MB.');
 let raw;try{raw=atob(a.data.slice(a.data.indexOf(',')+1));}catch{throw Error('PDF inválido.');}
 if(!raw.startsWith('%PDF-')||raw.length>8*1024*1024||a.size!==raw.length)throw Error('O ficheiro deve ser um PDF válido até 8 MB.');
 if(a.text!==undefined&&(typeof a.text!=='string'||a.text.length>200000))throw Error('Texto extraído do PDF do equipamento inválido.');
 if(a.ocrStatus!==undefined&&!['none','text','ocr','failed','pending','empty'].includes(a.ocrStatus))throw Error('Estado de leitura do PDF do equipamento inválido.');
}
function equipmentWarranty(e,at=F.today()){
 if(!e.warranty)return {status:'unknown',days:null};
 if(!F.validDate(at)||!F.validDate(e.warranty))throw Error('Data de garantia inválida.');
 const days=Math.round((Date.parse(e.warranty+'T00:00:00Z')-Date.parse(at+'T00:00:00Z'))/86400000);
 return {status:days<0?'expired':days<=30?'soon':'active',days};
}
function saveEquipment(d,e){const s=state(d),row={id:e.id||F.id(),name:String(e.name||'').trim(),cost:Number(e.cost??0),date:e.date??'',kind:e.kind||'maintenance',notes:e.notes||'',purchaseDate:e.purchaseDate||'',warranty:e.warranty||''};const old=s.equipment.find(x=>x.id===row.id);if(old&&(old.pendingId||old.reserveId||old.planStatus==='completed')&&(old.cost!==row.cost||old.date!==row.date||old.kind!==row.kind))throw Error('Revê primeiro o compromisso e a reserva associados; o plano já está ligado.');if(e.purchasePrice!==undefined&&e.purchasePrice!=='')row.purchasePrice=Number(e.purchasePrice);else if(e.purchasePrice===undefined&&old?.purchasePrice!==undefined)row.purchasePrice=old.purchasePrice;if(e.document!==undefined){if(e.document!==null){row.document=clone(e.document);if(old?.document?.data===row.document.data){if(row.document.text===undefined&&old.document.text!==undefined)row.document.text=old.document.text;if(row.document.ocrStatus===undefined&&old.document.ocrStatus!==undefined)row.document.ocrStatus=old.document.ocrStatus;}}}else if(old?.document)row.document=clone(old.document);Object.assign(row,old?{pendingId:old.pendingId,reserveId:old.reserveId,planStatus:old.planStatus,planHistory:old.planHistory}:{});const draft=clone(d),list=writable(draft).equipment,index=list.findIndex(x=>x.id===row.id);if(index<0)list.push(row);else list[index]=row;validate(draft);d.practical=draft.practical;return row;}
function removeEquipment(d,id){const draft=clone(d),s=state(draft),e=s.equipment.find(e=>e.id===id);if(!e)throw Error('Equipamento inexistente.');if(e.pendingId||e.reserveId||e.planHistory?.length||e.planStatus==='completed'||s.interventions.some(i=>i.equipmentId===id))throw Error('Este equipamento tem planos ou histórico associado. Resolve as ligações antes de eliminar; os pagamentos e intervenções são preservados.');let referenced=false;const visit=v=>{if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(k==='equipmentId'&&x===id||k==='equipmentIds'&&Array.isArray(x)&&x.includes(id))referenced=true;else if(x&&typeof x==='object')visit(x);}};visit(draft);if(referenced)throw Error('Este equipamento ainda tem registos associados. Resolve as ligações antes de eliminar.');s.equipment=s.equipment.filter(row=>row.id!==id);validate(draft);d.practical=draft.practical;}
function duplicateEquipment(d,id){const e=state(d).equipment.find(e=>e.id===id);if(!e)throw Error('Equipamento inexistente.');return saveEquipment(d,{name:e.name.slice(0,152)+' (cópia)',purchaseDate:e.purchaseDate,warranty:e.warranty,purchasePrice:e.purchasePrice,notes:e.notes,document:e.document?clone(e.document):undefined});}
function scheduleEquipment(d,id,account){const s=state(d),e=s.equipment.find(x=>x.id===id);if(!e)throw Error('Equipamento inexistente.');if(!positive(e.cost)||e.cost<=0)throw Error('Indica um custo positivo para criar compromisso e reserva.');if(e.planStatus==='completed')throw Error('Prepara primeiro o plano seguinte.');if(e.pendingId||e.reserveId)throw Error('Este plano já tem ligações.');if(!d.accounts.some(a=>a.name===account&&!a.archived))throw Error('Escolhe uma conta ativa.');if(!F.validDate(e.date)||e.date<=F.today())throw Error('Escolhe uma data futura para preparar a reserva.');const start=F.today(),months=Math.max(1,(+e.date.slice(0,4)- +start.slice(0,4))*12+ +e.date.slice(5,7)- +start.slice(5,7)),reserveId=F.id(),pendingId=F.id();d.reserves.push({id:reserveId,name:e.name+' · '+(e.kind==='replacement'?'Substituição':'Manutenção'),target:e.cost,saved:0,months});d.pendingPayments.push({id:pendingId,description:e.name+' · '+(e.kind==='replacement'?'Substituição':'Manutenção'),type:'expense',amount:e.cost,date:e.date,account,category:'Casa',equipmentId:e.id});e.reserveId=reserveId;e.pendingId=pendingId;return e;}

function cancelEquipment(d,id){
 const draft=clone(d),e=writable(draft).equipment.find(e=>e.id===id);
 if(!e||e.planStatus==='completed'||!e.pendingId&&!e.reserveId)throw Error('Este equipamento não tem um plano ativo para cancelar.');
 if(draft.transactions.some(t=>e.pendingId&&t.pendingId===e.pendingId))throw Error('Este plano já tem pagamentos. Resolve o compromisso e a intervenção antes de o concluir.');
 draft.pendingPayments=draft.pendingPayments.filter(p=>p.id!==e.pendingId);
 draft.reserves=draft.reserves.filter(r=>r.id!==e.reserveId);
 delete e.pendingId;delete e.reserveId;validate(draft);Object.assign(d,draft);return e;
}
// Diagnose saved associations without changing or rejecting historical data.
function paymentIndex(d){const owners=new Map();for(const i of state(d).interventions)if(i.transactionId){const id=String(i.transactionId);if(!owners.has(id))owners.set(id,new Set());owners.get(id).add(i);}return {transactions:new Map(d.transactions.map(t=>[String(t.id),t])),owners};}
function paymentDiagnostic(d,i,index=paymentIndex(d)){
 const issues=[],linked=!!i.transactionId,id=String(i.transactionId),t=index.transactions.get(id),owners=index.owners.get(id);
 if(linked){
  if(!t)issues.push({code:'missing',message:'Pagamento removido ou inexistente; revê a associação.'});
  else{if(t.type!=='expense')issues.push({code:'type',message:'Pagamento associado não é uma despesa; revê o tipo.'});if(F.cents(t.amount)!==F.cents(i.cost))issues.push({code:'amount',message:'Pagamento e intervenção não têm o mesmo valor; revê a associação.'});}
  if(owners&&owners.size>(owners.has(i)?1:0))issues.push({code:'duplicate',message:'Este pagamento já está ligado a outra intervenção; revê a associação duplicada.'});
 }
 return {id:i.id,linked,valid:issues.length===0,issues};
}
function interventionPayments(d){const index=paymentIndex(d);return state(d).interventions.map(i=>paymentDiagnostic(d,i,index));}
function completeEquipment(d,id,interventionId){
 const draft=clone(d),s=writable(draft),e=s.equipment.find(e=>e.id===id);if(!e||e.planStatus==='completed')throw Error('Plano inexistente ou já concluído.');
 if(e.pendingId&&draft.pendingPayments.some(p=>p.id===e.pendingId))throw Error('Regista ou resolve o compromisso na Agenda antes de concluir.');
 const i=s.interventions.find(i=>i.id===interventionId&&i.equipmentId===id);if(!i)throw Error('Escolhe uma intervenção deste equipamento.');
 const t=i.transactionId?draft.transactions.find(t=>t.id===i.transactionId):null;
 const diagnostic=paymentDiagnostic(draft,i);if(diagnostic.issues.length)throw Error(diagnostic.issues.map(x=>x.message).join(' '));
 if(i.cost>0&&!diagnostic.linked)throw Error('Associa o pagamento existente à intervenção antes de concluir.');
 if(e.pendingId&&(!t||t.pendingId!==e.pendingId))throw Error('A intervenção deve usar o pagamento deste compromisso.');
 if(i.date>F.today())throw Error('Uma intervenção futura ainda não está concluída.');
 const record={id:F.id(),date:e.date,cost:e.cost,kind:e.kind,completedOn:i.date,interventionId:i.id,transactionId:i.transactionId||'',pendingId:e.pendingId||'',reserveId:e.reserveId||''};
 e.planHistory=[...(e.planHistory||[]),record];e.planStatus='completed';validate(draft);d.practical=draft.practical;return record;
}
function nextEquipmentPlan(d,id,values){const draft=clone(d),e=writable(draft).equipment.find(e=>e.id===id);if(!e||e.planStatus!=='completed')throw Error('Conclui primeiro o plano atual.');if(!F.validDate(values.date)||values.date<=F.today()||!positive(Number(values.cost))||!['maintenance','replacement'].includes(values.kind))throw Error('Confirma a data futura, o custo e o tipo.');Object.assign(e,{date:values.date,cost:Number(values.cost),kind:values.kind,planStatus:'planned'});delete e.pendingId;delete e.reserveId;validate(draft);d.practical=draft.practical;return e;}
function addIntervention(d,row){const i={id:F.id(),equipmentId:row.equipmentId,date:row.date,cost:Number(row.cost),description:row.description,transactionId:row.transactionId||''},diagnostic=paymentDiagnostic(d,i);if(diagnostic.issues.length)throw Error(diagnostic.issues.map(x=>x.message).join(' '));const draft=clone(d);writable(draft).interventions.push(i);validate(draft);d.practical=draft.practical;return i;}
function compareEvent(d,id){const e=state(d).events.find(x=>x.id===id);if(!e)throw Error('Acontecimento inexistente.');const pivot=e.date.slice(0,7),shift=n=>{const dt=new Date(+pivot.slice(0,4),+pivot.slice(5)-1+n,1);return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');},sum=months=>{const ts=d.transactions.filter(t=>months.includes(t.date.slice(0,7)));const totals=months.map(m=>F.totals(d,m));return{months,income:money(totals.reduce((n,t)=>n+t.income,0)),expense:money(totals.reduce((n,t)=>n+t.expense,0)),observedMonths:new Set(ts.filter(t=>t.type==='income'||t.type==='expense').map(t=>t.date.slice(0,7))).size};};return{event:e,before:sum([-3,-2,-1].map(shift)),after:sum([1,2,3].map(shift)),excludedEventMonth:pivot};}
function matchesRule(t,r){
 const sources=[norm(t.description),norm(t.beneficiary)],phrase=norm(r.match);
 return !!phrase&&sources.some(value=>(' '+value+' ').includes(' '+phrase+' '))&&!r.exceptions.some(e=>norm(e)&&sources.some(value=>value.includes(norm(e))));
}
function observeCorrections(before,after){
 const previous=new Map(before.transactions.map(t=>[t.id,t]));
 const audits=new Map(state(before).ruleAudit.map(a=>[a.id,a])),automatic=new Set();
 for(const a of state(after).ruleAudit){const old=audits.get(a.id);if(!old||old.undone!==a.undone)for(const c of a.changes)automatic.add(c.id);}
 const changes=after.transactions.filter(t=>{const b=previous.get(t.id);return b&&!automatic.has(t.id)&&b.category!==t.category&&b.description===t.description&&t.type==='expense'&&!t.splits?.length&&!t.receiptItems?.length&&!t.reconciled&&!after.closedMonths.includes(t.date.slice(0,7));});
 if(!changes.length)return;
 const s=writable(after);for(const t of changes){const match=norm(t.beneficiary||t.description);if(match.length<3)continue;s.corrections=s.corrections.filter(c=>c.transactionId!==t.id);s.corrections.push({id:F.id(),transactionId:t.id,match,category:t.category,date:F.today()});}s.corrections=s.corrections.slice(-1000);
}
function suggestions(d){
 const s=state(d),transactions=new Map(d.transactions.map(t=>[t.id,t])),groups=new Map();
 for(const c of s.corrections){const t=transactions.get(c.transactionId);if(!t||t.type!=='expense'||t.category!==c.category||norm(t.beneficiary||t.description)!==c.match)continue;if(!groups.has(c.match))groups.set(c.match,new Map());groups.get(c.match).set(c.transactionId,c);}
 return[...groups].filter(([match,cs])=>cs.size>=3&&new Set([...cs.values()].map(c=>c.category)).size===1&&!s.rules.some(r=>norm(r.match)===match)).map(([match,cs])=>({match,category:[...cs.values()][0].category,examples:[...cs.keys()].map(id=>transactions.get(id))}));
}
function previewRule(d,r){
 const closed=new Set(d.closedMonths);
 return d.transactions.filter(t=>t.type==='expense'&&matchesRule(t,r)).map(t=>({id:t.id,before:t.category,after:r.category,description:t.description,blocked:!!(t.reconciled||closed.has(t.date.slice(0,7))||t.splits?.length||t.receiptItems?.length||t.debtId||t.debtHistoryOf||t.category===r.category),fingerprint:JSON.stringify(t)}));
}
function applyRule(d,id,preview){
 const r=state(d).rules.find(r=>r.id===id&&r.active);if(!r)throw Error('Regra inativa ou inexistente.');
 const current=previewRule(d,r);if(JSON.stringify(current)!==JSON.stringify(preview))throw Error('Os movimentos mudaram; refaz a pré-visualização.');
 const changes=current.filter(c=>!c.blocked);if(!changes.length)return 0;
 const transactions=new Map(d.transactions.map(t=>[t.id,t]));
 for(const c of changes)transactions.get(c.id).category=c.after;
 writable(d).ruleAudit.push({id:F.id(),ruleId:id,date:F.today(),changes:changes.map(c=>({...c,fingerprint:JSON.stringify(transactions.get(c.id))})),undone:false});return changes.length;
}
function undoRule(d,id){
 const a=state(d).ruleAudit.find(a=>a.id===id&&!a.undone);if(!a)throw Error('Aplicação indisponível.');
 const transactions=new Map(d.transactions.map(t=>[t.id,t])),closed=new Set(d.closedMonths);
 for(const c of a.changes){const t=transactions.get(c.id);if(!t||JSON.stringify(t)!==c.fingerprint||t.reconciled||closed.has(t.date.slice(0,7)))throw Error('Um movimento mudou ou está protegido; revê-o individualmente.');}
 for(const c of a.changes)transactions.get(c.id).category=c.before;a.undone=true;
}

function importCaptures(d,packet){if(!packet||packet.format!=='equilibrio-captures'||packet.version!==1||!Array.isArray(packet.captures)||packet.captures.length>200)throw Error('Ficheiro de capturas inválido.');const draft=clone(d),s=writable(draft);let added=0;for(const r of packet.captures){if(s.captures.some(c=>c.id===r.id)){const existing=s.captures.find(c=>c.id===r.id);if(JSON.stringify([existing.date,existing.amount,existing.description,existing.note,existing.attachment])!==JSON.stringify([r.date,r.amount,r.description,r.note||'',r.attachment]))throw Error('Identificador de captura reutilizado com conteúdo diferente.');continue;}s.captures.push({id:r.id,date:r.date,amount:r.amount,description:r.description,note:r.note||'',...(r.attachment?{attachment:clone(r.attachment)}:{}),status:'pending'});added++;}validate(draft);d.practical=draft.practical;return added;}
function confirmCapture(d,id,choice){const c=state(d).captures.find(c=>c.id===id&&c.status==='pending');if(!c)throw Error('Captura já tratada.');const draft=clone(d),next=writable(draft).captures.find(c=>c.id===id);let t;if(choice.transactionId){t=draft.transactions.find(t=>t.id===choice.transactionId);if(!t)throw Error('Movimento inexistente.');if(t.reconciled||draft.closedMonths.includes(t.date.slice(0,7)))throw Error('Movimento protegido.');if(c.amount!==null&&F.cents(c.amount)!==F.cents(t.amount))throw Error('O valor da captura difere do movimento.');if(t.attachment&&c.attachment)throw Error('O movimento já tem comprovativo.');if(c.attachment)t.attachment=clone(c.attachment);}else{if(!choice.description?.trim()||!positive(choice.amount)||choice.amount<=0||!F.validDate(choice.date)||choice.date>F.today())throw Error('Confirma descrição, valor e data do movimento.');if(c.attachment&&choice.skipAttachment!==true)choice={...choice,attachment:clone(c.attachment)};t=F.add(draft,{id:F.id(),type:choice.type||'expense',account:choice.account,amount:choice.amount,date:choice.date,description:choice.description,category:choice.category||'Outros',...(choice.attachment?{attachment:choice.attachment}:{}),captureId:c.id});}next.status='linked';next.transactionId=t.id;F.normalize(draft);Object.assign(d,draft);return t;}
function importRules(d){return [...state(d).rules.filter(r=>r.active).map(r=>({...r,matchMode:'phrase',type:'expense'})),...(d.rules||[])];}
const api={removeEquipment,duplicateEquipment,equipmentWarranty,validateEquipmentDocument,interventionPayments,cancelEquipment,completeEquipment,nextEquipmentPlan,matchesRule,importRules,empty,state,writable,validate,autonomy,saveEquipment,scheduleEquipment,addIntervention,compareEvent,observeCorrections,suggestions,previewRule,applyRule,undoRule,importCaptures,confirmCapture,norm};root.PracticalFinance=api;if(typeof module==='object')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
