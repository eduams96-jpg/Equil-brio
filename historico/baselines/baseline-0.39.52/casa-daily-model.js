(function(root){
 'use strict';
 const F=()=>typeof module==='object'&&module.exports?require('./finance.js'):root.Finance;
 const C=()=>typeof module==='object'&&module.exports?require('./casa-model.js'):root.CasaFinance;
 const E=()=>typeof module==='object'&&module.exports?require('./casa-complete-model.js'):root.CasaComplete;
 const L=()=>typeof module==='object'&&module.exports?require('./casa-life-model.js'):root.CasaLife;
 const validQty=n=>Number.isFinite(n)&&n>0&&Number.isSafeInteger(Math.round(n*1000))&&Math.abs(n*1000-Math.round(n*1000))<1e-6;
 function validate(d){const c=C().state(d),ids=new Set();
  if(c.monthlyBudget!==undefined&&(!Number.isFinite(c.monthlyBudget)||!Number.isSafeInteger(F().cents(c.monthlyBudget))||c.monthlyBudget<0||F().money(c.monthlyBudget)!==c.monthlyBudget))throw Error('Orçamento Casa inválido.');
  for(const list of c.lists||[])for(const item of list.items||[])if(item.quantityLabel!==undefined&&(typeof item.quantityLabel!=='string'||item.quantityLabel.length>80))throw Error('Quantidade da lista inválida.');
  if(c.lists!==undefined&&!Array.isArray(c.lists))throw Error('Listas Casa inválidas.');
  for(const list of c.lists||[]){if(!list||typeof list.id!=='string'||!list.id||ids.has(list.id)||typeof list.name!=='string'||!list.name.trim()||list.name.length>80||!Array.isArray(list.items)||!list.items.length)throw Error('Lista guardada inválida.');ids.add(list.id);for(const i of list.items)if((i.catalogId?!c.catalog.some(p=>p.id===i.catalogId):typeof i.name!=='string'||!i.name.trim()||i.name.length>160)||!validQty(i.qty))throw Error('Produto ou quantidade da lista guardada inválidos.');}
  for(const p of c.catalog)for(const key of ['brand','barcode','notes'])if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key].length>(key==='notes'?1000:80)))throw Error('Ficha do produto inválida.');
 }
 function budget(d,value){return C().change(d,draft=>{draft.casa.monthlyBudget=value;});}
 function saveList(d,name){return C().change(d,(draft,f)=>{const rows=draft.casa.shopping.filter(s=>!s.done);if(!rows.length)throw Error('Adiciona artigos à lista antes de a guardar.');const items=[];for(const r of rows){const old=items.find(i=>r.catalogId?i.catalogId===r.catalogId:!i.catalogId&&i.name===r.name);const n=r.catalogId?r.requestedQty:1;if(old)old.qty=Math.round((old.qty+n)*1000)/1000;else items.push(r.catalogId?{catalogId:r.catalogId,qty:n}:{name:r.name,qty:n,quantityLabel:r.qty});}draft.casa.lists=draft.casa.lists||[];const id=f.id();draft.casa.lists.push({id,name:String(name||'').trim(),items});return id;});}
 function listNeeds(d,id){const c=C().state(d),list=(c.lists||[]).find(x=>x.id===id);if(!list)throw Error('Lista não encontrada.');return list.items.map(i=>({...i,qty:Math.max(0,Math.round((i.qty-(i.catalogId?L().pending(c,i.catalogId):0))*1000)/1000)})).filter(i=>i.qty>0);}
 function useList(d,id){return C().change(d,draft=>{
   const needs=listNeeds(draft,id),catalog=needs.filter(i=>i.catalogId);if(catalog.length)L().queueNeeds(draft,catalog);
   for(const item of needs.filter(i=>!i.catalogId))if(!draft.casa.shopping.some(r=>!r.done&&r.name.trim().toLocaleLowerCase('pt')===item.name.trim().toLocaleLowerCase('pt')))C().shopping(draft,'add',{name:item.name,qty:item.quantityLabel||String(item.qty)});
   return needs.length;
 });}
 function removeList(d,id){return C().change(d,draft=>{draft.casa.lists=(draft.casa.lists||[]).filter(x=>x.id!==id);});}
 function compare(d,maxStores=2){
  const c=C().state(d),rows=c.shopping.filter(s=>!s.done&&s.catalogId),stores=c.stores.filter(s=>!s.archived);if(![1,2,3].includes(maxStores))throw Error('Escolhe entre uma e três lojas.');
  const candidates=[];
  const evaluate=selected=>{const assignments=[],missing=[];for(const row of rows){const p=c.catalog.find(p=>p.id===row.catalogId);const offers=p.archived?[]:selected.filter(s=>p.offers[s.id]).map(s=>{const o=p.offers[s.id],packages=Math.ceil(Math.round(row.requestedQty*1000)/Math.round(o.packageQty*1000));return {id:row.id,storeId:s.id,total:packages*F().cents(o.price)/100,packages,packageQty:o.packageQty,date:o.date||''};}).sort((a,b)=>a.total-b.total||a.storeId.localeCompare(b.storeId));if(offers.length)assignments.push(offers[0]);else missing.push(row.name);}return {stores:selected.map(s=>s.id),total:assignments.reduce((n,a)=>n+F().cents(a.total),0)/100,assignments,missing};};
  function choose(start,selected){if(selected.length)candidates.push(evaluate(selected));if(selected.length===maxStores)return;for(let n=start;n<stores.length;n++)choose(n+1,[...selected,stores[n]]);}
  if(stores.length>30)throw Error('A comparação suporta até 30 lojas ativas. Arquiva as que não utilizas.');choose(0,[]);
  candidates.sort((a,b)=>a.missing.length-b.missing.length||a.total-b.total||a.stores.length-b.stores.length);
  const best=rows.length?candidates.find(p=>!p.missing.length):null;
  return {best:best||null,candidates:candidates.filter(x=>x.stores.length===1),excluded:c.shopping.filter(s=>!s.done&&!s.catalogId).length,rows:rows.length};
 }
 function applyPlan(d,maxStores,expected){return C().change(d,draft=>{const plan=compare(draft,maxStores).best;if(!plan||JSON.stringify(plan)!==expected)throw Error('A lista ou os preços mudaram. Compara novamente.');for(const a of plan.assignments){const row=draft.casa.shopping.find(s=>s.id===a.id);if(row.storeId!==a.storeId)delete row.purchaseOverride;row.storeId=a.storeId;row.notFound=false;}});}
 function unitCost(c,lot){const p=c.purchases.find(p=>p.id===lot.purchaseId),i=p?.items[lot.line];return i?.qty>0?(i.total/i.qty)*(p.total/p.items.reduce((n,x)=>n+x.total,0)):null;}
 function recipeCost(d,id,servings){const c=C().state(d),r=c.recipes.find(r=>r.id===id);if(!r||!Number.isInteger(servings)||servings<1||servings>1000)throw Error('Receita ou porções inválidas.');let total=0;const missing=[];for(const i of r.ingredients){const p=c.catalog.find(p=>p.id===i.catalogId),offer=L().prices(d,p.id)[0];if(!offer)missing.push(p.name);else total+=Math.round(i.qty*servings/r.servings*1000)/1000*offer.per;}return {total:F().money(total),perServing:F().money(total/servings),missing};}
 function monthShift(month,n){const d=new Date(month+'-15T12:00:00');d.setMonth(d.getMonth()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
 function insights(d,month=F().today().slice(0,7)){
  if(!F().validDate(month+'-01'))throw Error('Mês inválido.');const c=C().state(d),purchases=c.purchases.filter(p=>p.date.startsWith(month)),refunds=E().refunds(d).filter(r=>r.date.startsWith(month)),total=(purchases.reduce((n,p)=>n+F().cents(p.total),0)-refunds.reduce((n,r)=>n+F().cents(r.amount),0))/100;
  const monthly=Array.from({length:6},(_,i)=>{const key=monthShift(month,i-5),rows=c.purchases.filter(p=>p.date.startsWith(key));return {month:key,total:(rows.reduce((n,p)=>n+F().cents(p.total),0)-E().refunds(d).filter(r=>r.date.startsWith(key)).reduce((n,r)=>n+F().cents(r.amount),0))/100,count:rows.length};});
  let waste=0,unknownWaste=0;for(const e of c.stockEvents.filter(e=>e.type==='waste'&&e.date.startsWith(month))){const lot=c.stock.find(l=>l.id===e.lotId),cost=unitCost(c,lot);if(cost===null)unknownWaste++;else waste+=-e.delta*cost;}
  unknownWaste+=c.legacyActivity.filter(e=>e.type==='waste'&&e.date.startsWith(month)).length;
  const priceChanges=c.catalog.map(p=>{const history=[...c.priceHistory.filter(h=>h.catalogId===p.id),...c.purchases.flatMap(r=>r.items.filter(i=>i.catalogId===p.id).map(i=>({...i,date:r.date})))].filter(h=>h.date.slice(0,7)<=month).sort((a,b)=>a.date.localeCompare(b.date));if(history.length<2)return null;const a=history[0],b=history.at(-1);return {id:p.id,name:p.name,unit:p.unit,from:a.price/a.packageQty,to:b.price/b.packageQty,percent:(b.price/b.packageQty/(a.price/a.packageQty)-1)*100};}).filter(Boolean);
  const stores=new Map(),categories=new Map();
  for(const purchase of purchases){
    stores.set(purchase.store,(stores.get(purchase.store)||0)+F().cents(purchase.total));
    const gross=purchase.items.reduce((n,i)=>n+F().cents(i.total),0);let allocated=0;
    purchase.items.forEach((i,index)=>{const category=c.catalog.find(p=>p.id===i.catalogId)?.storeCategories?.[purchase.storeId]||c.catalog.find(p=>p.id===i.catalogId)?.category||'Sem categoria';
      const value=index===purchase.items.length-1?F().cents(purchase.total)-allocated:Math.floor(F().cents(i.total)*F().cents(purchase.total)/gross);allocated+=value;categories.set(category,(categories.get(category)||0)+value);
    });
  }
  for(const r of refunds){const p=c.purchases.find(p=>p.id===r.purchaseId);stores.set(p.store,(stores.get(p.store)||0)-F().cents(r.amount));categories.set('Reembolsos',(categories.get('Reembolsos')||0)-F().cents(r.amount));}

  return {stores:[...stores].map(([name,value])=>({name,total:value/100})),categories:[...categories].map(([name,value])=>({name,total:value/100})),month,total,monthly,previous:monthly[4].total,difference:F().money(total-monthly[4].total),budget:c.monthlyBudget||0,remaining:F().money((c.monthlyBudget||0)-total),unlinked:purchases.filter(p=>p.total>0&&!p.transactionId).length,waste:F().money(waste),unknownWaste,priceChanges};
 }
 function suggestRecipes(d){const c=C().state(d),today=F().today();return c.recipes.map(r=>{let feasible=true;try{L().cookQuote(d,r.id,r.servings);}catch{feasible=false;}const lots=c.stock.filter(l=>r.ingredients.some(i=>i.catalogId===l.catalogId)&&L().remaining(c,l)>0&&(!l.expiry||l.expiry>=today));const expiry=lots.filter(l=>l.expiry).map(l=>l.expiry).sort()[0]||'9999';return {id:r.id,name:r.name,feasible,expiry,opened:lots.filter(l=>l.opened).length};}).sort((a,b)=>Number(b.feasible)-Number(a.feasible)||a.expiry.localeCompare(b.expiry)||b.opened-a.opened);}
 const api={validate,budget,saveList,listNeeds,useList,removeList,compare,applyPlan,unitCost,recipeCost,insights,suggestRecipes};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.CasaDaily=Object.freeze(api);
})(globalThis);
