/* Prendas: planeamento, lista anual de pessoas/ocasiões e memória, sem criar ou alterar movimentos financeiros. */
(function(root){'use strict';
 const finance=()=>root.Finance||(typeof require==='function'?require('./finance.js'):null),clone=x=>structuredClone(x);
 const states=['idea','shopping','bought','delivered'],paid=g=>['bought','delivered'].includes(g.status),rows=d=>d.practical?.gifts||[],targets=d=>d.practical?.giftTargets||[];
 const commonOccasions=['Natal','Aniversário','Dia da Mãe','Dia do Pai','Dia dos Namorados','Páscoa','Aniversário de Casamento','Casamento','Batizado','Amigo Secreto','Santos Populares','Fim de Ano'];
 const normKey=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 function url(value){const raw=String(value||'').trim();if(!raw)return '';let u;try{u=new URL(raw);}catch{throw Error('Indica um link http ou https válido.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||raw.length>2048)throw Error('Indica um link http ou https válido.');return u.href;}
 function occasions(d){
  const seen=new Set(),out=[];
  const add=v=>{const s=String(v||'').trim();if(!s)return;const k=normKey(s);if(seen.has(k))return;seen.add(k);out.push(s);};
  commonOccasions.forEach(add);
  for(const t of targets(d))add(t.occasion);
  for(const g of rows(d))add(g.occasion);
  return out;
 }
 function people(d){
  const seen=new Map();
  for(const t of targets(d)){const s=String(t.person||'').trim();if(s&&!seen.has(normKey(s)))seen.set(normKey(s),s);}
  for(const g of rows(d)){const s=String(g.person||'').trim();if(s&&!seen.has(normKey(s)))seen.set(normKey(s),s);}
  return [...seen.values()].sort((a,b)=>a.localeCompare(b,'pt'));
 }
 function validate(d){const list=d.practical?.gifts===undefined?[]:d.practical.gifts;if(!Array.isArray(list)||list.length>10000)throw Error('Lista de prendas inválida.');const ids=new Set(),F=finance(),text=(v,n)=>typeof v==='string'&&v.length<=n,amount=v=>Number.isFinite(v)&&v>=0&&Number.isSafeInteger(F.cents(v))&&F.money(v)===v;
  for(const g of list){if(!g||!text(g.id,100)||!g.id||ids.has(g.id)||!text(g.person,160)||!g.person.trim()||!text(g.title,160)||!g.title.trim()||!text(g.occasion,160)||!text(g.notes,2000)||!Number.isInteger(g.year)||g.year<1900||g.year>2200||!text(g.date,10)||g.date&&(!F.validDate(g.date)||Number(g.date.slice(0,4))!==g.year)||!states.includes(g.status)||!amount(g.budget)||g.actualCost!==null&&!amount(g.actualCost)||!paid(g)&&g.actualCost!==null||!text(g.url,2048)||url(g.url)!==g.url||!text(g.transactionId,100)||!text(g.purchaseId,100)||g.transactionId&&g.purchaseId||!text(g.catalogId,100)||!text(g.sourceFingerprint,2000)||!paid(g)&&(g.transactionId||g.purchaseId)||g.purchaseItem!==null&&(!Number.isInteger(g.purchaseItem)||g.purchaseItem<0)||g.purchaseItem!==null&&!g.purchaseId)throw Error('Confirma os dados da prenda, os valores e as ligações.');ids.add(g.id);}
  const tList=d.practical?.giftTargets;
  if(tList!==undefined){
   if(!Array.isArray(tList)||tList.length>5000)throw Error('Lista de pessoas e ocasiões inválida.');
   const tIds=new Set();
   for(const t of tList){
    if(!t||!text(t.id,100)||!t.id||tIds.has(t.id)||!text(t.person,160)||!t.person.trim()||!text(t.occasion,160)||!t.occasion.trim()||!amount(t.budget??0)||!text(t.notes||'',1000)||t.year!==undefined&&(!Number.isInteger(t.year)||t.year<1900||t.year>2200)||t.date&&(!finance().validDate(t.date)||t.year&&Number(t.date.slice(0,4))!==t.year))throw Error('Registo de pessoa e ocasião inválido.');
    tIds.add(t.id);
   }
  }
 }
 function source(d,g){if(g.transactionId){const t=d.transactions.find(t=>t.id===g.transactionId);if(!t||t.type!=='expense')return null;return{limit:Number(t.amount),fundingKey:'tx:'+t.id,fingerprint:JSON.stringify([t.type,t.date,t.amount,t.description]),label:t.description};}if(g.purchaseId){const p=d.casa?.purchases?.find(p=>p.id===g.purchaseId),item=g.purchaseItem===null?null:p?.items[g.purchaseItem];if(!p||g.purchaseItem!==null&&!item)return null;const limit=Number(item?item.total:p.total),fingerprint=JSON.stringify([p.date,p.total,g.purchaseItem,item?[item.name,item.total,item.qty]:null]);return{limit,fundingKey:p.transactionId?'tx:'+p.transactionId:'purchase:'+p.id,purchaseLimit:Number(p.total),purchaseKey:p.id,itemKey:item?p.id+':'+g.purchaseItem:null,fingerprint,label:item?item.name:p.store};}return null;}
 function diagnostic(d,g){if(!g.transactionId&&!g.purchaseId)return{linked:false,changed:false,missing:false};const s=source(d,g);return{linked:true,missing:!s,changed:!!s&&s.fingerprint!==g.sourceFingerprint,label:s?.label||'',currentLimit:s?.limit??null};}
 function save(d,input){const F=finance(),draft=clone(d),old=rows(d).find(g=>g.id===input.id);if(input.id&&!old)throw Error('Prenda inexistente.');const g={id:old?.id||F.id(),person:String(input.person||'').trim(),title:String(input.title||'').trim(),occasion:String(input.occasion||'').trim(),year:Number(input.year),date:String(input.date||''),status:input.status||'idea',budget:Number(input.budget??0),actualCost:input.actualCost===''||input.actualCost==null?null:Number(input.actualCost),url:url(input.url),notes:String(input.notes||''),transactionId:String(input.transactionId||''),purchaseId:String(input.purchaseId||''),purchaseItem:input.purchaseItem===''||input.purchaseItem==null?null:Number(input.purchaseItem),catalogId:String(input.catalogId||''),sourceFingerprint:''};
  if(g.catalogId&&!d.casa?.catalog?.some(p=>p.id===g.catalogId))throw Error('O produto associado já não existe.');
  if(g.transactionId||g.purchaseId){const s=source(d,g);if(!s)throw Error('A despesa ou compra associada já não existe ou não é válida.');if(g.actualCost===null)throw Error('Indica quanto desta despesa corresponde à prenda.');if(g.actualCost>s.limit)throw Error('O custo da prenda excede o valor do registo associado.');g.sourceFingerprint=s.fingerprint;
   const other=rows(d).filter(x=>x.id!==g.id&&paid(x));const total=F.cents(g.actualCost)+other.filter(x=>source(d,x)?.fundingKey===s.fundingKey).reduce((n,x)=>n+F.cents(x.actualCost||0),0);const tx=s.fundingKey.startsWith('tx:')?d.transactions.find(t=>'tx:'+t.id===s.fundingKey):null;if(tx&&total>F.cents(tx.amount)||!tx&&s.fundingKey.startsWith('purchase:')&&total>F.cents(s.purchaseLimit))throw Error('O valor já foi repartido por outras prendas. Revê as parcelas para não duplicar custos.');
   if(s.purchaseKey){const same=other.filter(x=>x.purchaseId===s.purchaseKey),purchaseTotal=F.cents(g.actualCost)+same.reduce((n,x)=>n+F.cents(x.actualCost||0),0);if(purchaseTotal>F.cents(s.purchaseLimit)||s.itemKey&&F.cents(g.actualCost)+same.filter(x=>x.purchaseItem===g.purchaseItem).reduce((n,x)=>n+F.cents(x.actualCost||0),0)>F.cents(s.limit))throw Error('O valor da compra ou artigo já foi repartido por outras prendas.');}
  }
  draft.practical??={version:1,equipment:[],interventions:[],events:[],captures:[],corrections:[],rules:[],ruleAudit:[],autonomy:null};draft.practical.gifts??=[];const at=draft.practical.gifts.findIndex(x=>x.id===g.id);if(at<0)draft.practical.gifts.push(g);else draft.practical.gifts[at]=g;validate(draft);d.practical=draft.practical;return g;
 }
 function remove(d,id){if(!rows(d).some(g=>g.id===id))throw Error('Prenda inexistente.');d.practical.gifts=d.practical.gifts.filter(g=>g.id!==id);}
 function saveTarget(d,input){
  const F=finance(),draft=clone(d);
  draft.practical??={version:1,equipment:[],interventions:[],events:[],captures:[],corrections:[],rules:[],ruleAudit:[],autonomy:null};
  draft.practical.gifts??=[];
  draft.practical.giftTargets??=[];
  const person=String(input.person||'').trim();
  const occasion=String(input.occasion||'').trim();
  if(!person||!occasion)throw Error('Indica a pessoa e a ocasião.');
  const existing=draft.practical.giftTargets.find(t=>t.id===input.id||(normKey(t.person)===normKey(person)&&normKey(t.occasion)===normKey(occasion)&&Number(t.year||0)===Number(input.year||0)));
  const rec={
   id:existing?.id||String(input.id||F.id()),
   person,
   occasion,
   ...(input.year?{year:Number(input.year)}:existing?.year?{year:existing.year}:{}),
   date:input.date!==undefined?String(input.date||''):String(existing?.date||''),
   budget:F.money(Number(input.budget??existing?.budget??0)),
   notes:String(input.notes??existing?.notes??'').trim().slice(0,1000)
  };
  const at=draft.practical.giftTargets.findIndex(t=>t.id===rec.id);
  if(at<0)draft.practical.giftTargets.push(rec);else draft.practical.giftTargets[at]=rec;
  validate(draft);
  d.practical=draft.practical;
  return rec;
 }
 function savePersonOccasions(d,input){
  const person=String(input.person||'').trim();
  const occList=(Array.isArray(input.occasions)?input.occasions:[input.occasion]).map(o=>String(o||'').trim()).filter(Boolean);
  if(!person)throw Error('Indica o nome da pessoa.');
  if(!occList.length)throw Error('Seleciona pelo menos uma ocasião.');
  const draft=clone(d),saved=[];
  for(const occ of occList)saved.push(saveTarget(draft,{person,occasion:occ,budget:input.budget??0,notes:input.notes?input.notes:undefined,year:input.year,date:input.date}));
  d.practical=draft.practical;return saved;
 }
 function removeTarget(d,id){
  if(!d.practical?.giftTargets)return;
  d.practical.giftTargets=d.practical.giftTargets.filter(t=>String(t.id)!==String(id));
 }
 function yearChecklist(d,year=new Date().getFullYear()){
  const F=finance(),yr=Number(year)||new Date().getFullYear();
  const map=new Map();
  for(const t of targets(d).filter(t=>!t.year||t.year===yr)){
   const k=normKey(t.person)+'|'+normKey(t.occasion);
   map.set(k,{targetId:t.id,person:t.person,occasion:t.occasion,budget:F.money(t.budget||0),notes:t.notes||'',date:t.date||'',explicit:true});
  }
  for(const g of rows(d).filter(g=>g.year===yr)){
   if(!g.occasion)continue;
   const k=normKey(g.person)+'|'+normKey(g.occasion);
   if(!map.has(k)){
    map.set(k,{targetId:'',person:g.person,occasion:g.occasion,budget:F.money(g.budget||0),notes:'',explicit:false});
   }
  }
  const yearGifts=rows(d).filter(g=>g.year===yr);
  const all=[...map.values()].map(item=>{
   const matches=yearGifts.filter(g=>normKey(g.person)===normKey(item.person)&&normKey(g.occasion)===normKey(item.occasion));
   const boughtGift=matches.find(g=>paid(g));
   const plannedGift=matches[0]||null;
   let stage='missing',stageLabel='Sem prenda definida';
   if(boughtGift){
    stage='ready';
    stageLabel=boughtGift.status==='delivered'?'Entregue':'Comprado';
   }else if(plannedGift){
    stage='pending';
    stageLabel=plannedGift.status==='shopping'?'Falta comprar':'Em ideia (falta comprar)';
   }
   return{
    ...item,
    year:yr,
    gift:boughtGift||plannedGift,
    stage,
    stageLabel,
    missingOrPending:stage!=='ready'
   };
  }).sort((a,b)=>{
   const order={missing:0,pending:1,ready:2};
   return (order[a.stage]-order[b.stage])||a.occasion.localeCompare(b.occasion,'pt')||a.person.localeCompare(b.person,'pt');
  });
  return{
   year:yr,
   all,
   missing:all.filter(x=>x.stage==='missing'),
   pending:all.filter(x=>x.stage==='pending'),
   ready:all.filter(x=>x.stage==='ready'),
   incomplete:all.filter(x=>x.stage!=='ready')
  };
 }
 function summary(d,year=null,person=''){const F=finance(),list=rows(d).filter(g=>(year===null||g.year===Number(year))&&(!person||normKey(g.person)===normKey(person))),actual=list.filter(paid),missing=actual.filter(g=>g.actualCost===null).length;return{count:list.length,budget:F.money(list.reduce((n,g)=>n+g.budget,0)),spent:F.money(actual.reduce((n,g)=>n+(g.actualCost||0),0)),missing,byYear:[...new Set(list.map(g=>g.year))].sort((a,b)=>b-a).map(y=>({year:y,count:actual.filter(g=>g.year===y).length,spent:F.money(actual.filter(g=>g.year===y).reduce((n,g)=>n+(g.actualCost||0),0))}))};}
 const api={states,paid,rows,targets,commonOccasions,occasions,people,url,validate,source,diagnostic,save,remove,saveTarget,savePersonOccasions,removeTarget,yearChecklist,summary};root.GiftFinance=api;if(typeof module==='object')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
