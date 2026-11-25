(function(root){
 'use strict';
 const F=()=>typeof module==='object'&&module.exports?require('./finance.js'):root.Finance;
 const C=()=>typeof module==='object'&&module.exports?require('./casa-model.js'):root.CasaFinance;
 const E=()=>typeof module==='object'&&module.exports?require('./casa-complete-model.js'):root.CasaComplete;
 const L=()=>typeof module==='object'&&module.exports?require('./casa-life-model.js'):root.CasaLife;
 const validQty=n=>Number.isFinite(n)&&n>0&&Number.isSafeInteger(Math.round(n*1000))&&Math.abs(n*1000-Math.round(n*1000))<1e-6;
 const storeNameKey=s=>String(s||'').trim().normalize('NFC').toLocaleLowerCase('pt');
 function combinedParts(name){
  const parts=String(name||'').split(/\s*\/\/\s*/).map(s=>s.trim()).filter(Boolean);
  const unique=[],seen=new Set();
  for(const part of parts){const key=storeNameKey(part);if(!seen.has(key)){seen.add(key);unique.push(part);}}
  return unique.length>=2?unique:[];
 }
 const isCombinedStoreName=name=>combinedParts(name).length>=2;
 function combinedStores(d){
  const c=C().state(d),byName=new Map(c.stores.map(s=>[storeNameKey(s.name),s]));
  const rows=[];
  for(const s of c.stores){
   const parts=combinedParts(s.name);if(parts.length<2)continue;
   const offers=c.catalog.filter(p=>!p.archived&&p.offers?.[s.id]).map(p=>{
    const o=p.offers[s.id];
    const existingByPart=Object.fromEntries(parts.map(part=>{
     const target=byName.get(storeNameKey(part));
     const ex=target&&p.offers?.[target.id];
     return [part,ex?{storeId:target.id,price:ex.price,packageQty:ex.packageQty,date:ex.date||''}:null];
    }));
    return {catalogId:p.id,productName:p.name,unit:p.unit,packageQty:o.packageQty,price:o.price,date:o.date||'',url:o.url||'',existingByPart};
   }).sort((a,b)=>a.productName.localeCompare(b.productName,'pt-PT'));
   const shoppingCount=c.shopping.filter(r=>r.storeId===s.id).length;
   const purchasesCount=c.purchases.filter(p=>p.storeId===s.id).length;
   const historyCount=c.priceHistory.filter(h=>h.storeId===s.id).length;
   if(!s.archived||offers.length||shoppingCount){
    rows.push({id:s.id,name:s.name,archived:!!s.archived,parts,offers,shoppingCount,purchasesCount,historyCount});
   }
  }
  return rows.sort((a,b)=>Number(a.archived)-Number(b.archived)||a.name.localeCompare(b.name,'pt-PT'));
 }
 function previewSplitStore(d,storeId,decisions={}){
  const info=combinedStores(d).find(x=>x.id===storeId);
  if(!info)throw Error('Loja combinada não encontrada.');
  const c=C().state(d),partByKey=new Map(info.parts.map(p=>[storeNameKey(p),p]));
  const storesByKey=new Map(c.stores.map(s=>[storeNameKey(s.name),s]));
  const assignedOffers=[],skippedOffers=[],usedParts=new Set(),overwrites=[],keptPrices=[];
  for(const offer of info.offers){
   const rawChoice=String(decisions.offers?.[offer.catalogId]??'skip').trim();
   if(!rawChoice||rawChoice==='skip'){skippedOffers.push(offer);continue;}
   const targets=rawChoice==='all'?info.parts:[partByKey.get(storeNameKey(rawChoice))].filter(Boolean);
   if(!targets.length)throw Error('Escolhe uma loja de destino válida para '+offer.productName+'.');
   for(const targetName of targets){
    usedParts.add(targetName);
    const existing=offer.existingByPart[targetName];
    const hasExisting=!!(existing&&existing.price>0);
    // A combined offer without a price must never erase a real price already
    // registered in the individual store; only a missing link is carried over.
    if(hasExisting&&!(offer.price>0)){keptPrices.push({catalogId:offer.catalogId,productName:offer.productName,targetName,price:existing.price,url:offer.url});continue;}
    if(hasExisting)overwrites.push({productName:offer.productName,targetName,oldPrice:existing.price,newPrice:offer.price});
    assignedOffers.push({catalogId:offer.catalogId,productName:offer.productName,unit:offer.unit,packageQty:offer.packageQty,price:offer.price,url:offer.url,targetName,overwritesExisting:hasExisting});
   }
  }
  let defaultPart=null;
  if(info.shoppingCount>0){
   const rawDefault=String(decisions.defaultPart||'').trim();
   if(rawDefault){
    defaultPart=partByKey.get(storeNameKey(rawDefault));
    if(!defaultPart)throw Error('Escolhe uma das lojas individuais para os artigos da lista de compras.');
   }else{
    defaultPart=assignedOffers[0]?.targetName||info.parts[0];
   }
  }
  const shoppingMoved=c.shopping.filter(r=>r.storeId===info.id).map(r=>{
   const offerMatch=r.catalogId?assignedOffers.filter(a=>a.catalogId===r.catalogId):[];
   const targetName=offerMatch.length===1?offerMatch[0].targetName:defaultPart;
   usedParts.add(targetName);
   return {id:r.id,name:r.name,catalogId:r.catalogId||'',targetName,hasOffer:!r.catalogId||offerMatch.some(a=>a.targetName===targetName)||Boolean(storesByKey.get(storeNameKey(targetName))&&c.catalog.find(p=>p.id===r.catalogId)?.offers?.[storesByKey.get(storeNameKey(targetName)).id])};
  });
  const shoppingWithoutOffer=shoppingMoved.filter(s=>!s.hasOffer);
  const createdStores=[],reactivatedStores=[];
  for(const part of usedParts){
   const ex=storesByKey.get(storeNameKey(part));
   if(!ex)createdStores.push(part);
   else if(ex.archived)reactivatedStores.push(ex.name);
  }
  const willDelete=info.purchasesCount===0&&!c.purchases.some(p=>p.storeId===info.id);
  const stamp={storeId:info.id,name:info.name,offers:info.offers.map(o=>[o.catalogId,o.packageQty,o.price]),shopping:shoppingMoved.map(s=>[s.id,s.targetName]),decisions:assignedOffers.map(a=>[a.catalogId,a.targetName]),skipped:skippedOffers.map(s=>s.catalogId),kept:keptPrices.map(k=>[k.catalogId,k.targetName])};
  return {storeId:info.id,storeName:info.name,parts:info.parts,assignedOffers,skippedOffers,overwrites,keptPrices,createdStores,reactivatedStores,shoppingMoved,shoppingWithoutOffer,purchasesCount:info.purchasesCount,willDelete,willArchive:true,token:JSON.stringify(stamp)};
 }
 function applySplitStore(d,storeId,decisions={},expectedToken){
  return C().change(d,(draft,F)=>{
   const preview=previewSplitStore(draft,storeId,decisions);
   if(expectedToken!==undefined&&preview.token!==expectedToken)throw Error('As ofertas ou a escolha mudaram. Revê a pré-visualização antes de guardar.');
   const c=draft.casa,sourceStore=c.stores.find(s=>s.id===storeId);
   const targetByPart=new Map();
   const ensureTarget=partName=>{
    if(targetByPart.has(partName))return targetByPart.get(partName);
    const key=storeNameKey(partName);
    let st=c.stores.find(s=>storeNameKey(s.name)===key);
    if(!st){st={id:F.id(),name:partName.slice(0,160),archived:false};c.stores.push(st);}
    else st.archived=false;
    targetByPart.set(partName,st);
    return st;
   };
   for(const a of preview.assignedOffers){
    const target=ensureTarget(a.targetName),product=c.catalog.find(p=>p.id===a.catalogId),old=product.offers?.[target.id];
    const priceChanged=!old||old.packageQty!==a.packageQty||old.price!==a.price;
    product.offers[target.id]={...old,packageQty:a.packageQty,price:a.price,date:priceChanged?F.today():old.date,url:a.url||old?.url||''};
    if(priceChanged&&a.price>0)c.priceHistory.push({id:F.id(),catalogId:product.id,storeId:target.id,packageQty:a.packageQty,price:a.price,date:F.today(),source:'manual'});
    if(product.storeCategories?.[storeId]&&!product.storeCategories[target.id])product.storeCategories[target.id]=product.storeCategories[storeId];
   }
   for(const k of preview.keptPrices){
    const target=ensureTarget(k.targetName),old=c.catalog.find(p=>p.id===k.catalogId)?.offers?.[target.id];
    if(old&&k.url&&!old.url)old.url=k.url;
   }
   for(const s of preview.shoppingMoved){
    const row=c.shopping.find(r=>r.id===s.id),target=ensureTarget(s.targetName);
    if(row&&row.storeId===storeId){row.storeId=target.id;delete row.purchaseOverride;}
   }
   for(const p of c.catalog){
    if(p.offers&&Object.hasOwn(p.offers,storeId))delete p.offers[storeId];
    if(p.storeCategories&&Object.hasOwn(p.storeCategories,storeId))delete p.storeCategories[storeId];
   }
   if(preview.willDelete){
    c.priceHistory=c.priceHistory.filter(h=>h.storeId!==storeId);
    if(c.priceWatch?.stores)c.priceWatch.stores=c.priceWatch.stores.filter(w=>w.storeId!==storeId);
    c.stores=c.stores.filter(s=>s.id!==storeId);
   }else{
    sourceStore.archived=true;
   }
   return preview;
  });
 }
 const promotionAmounts = ['minimum','discount','coupon','balance','fuel'];
 const validPromotionAmount = value => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(F().cents(value)) && F().money(value) === value;
 function validPromotion(p){
  return p && promotionAmounts.every(key=>validPromotionAmount(p[key])) && p.minimum > 0 &&
    p.discount <= p.minimum && promotionAmounts.slice(1).some(key=>p[key] > 0);
 }
 function savePromotion(d,storeId,values){
  return C().change(d,draft=>{
   const store=draft.casa.stores.find(row=>row.id===storeId&&!row.archived);
   if(!store)throw Error('Escolhe um supermercado ativo.');
   if(values===null)delete store.shoppingPromotion;
   else {
    const promotion=Object.fromEntries(promotionAmounts.map(key=>[key,F().money(Number(values[key]??0))]));
    if(!validPromotion(promotion))throw Error('Indica um mínimo e um benefício válidos.');
    store.shoppingPromotion=promotion;
   }
  });
 }
 function promotionProgress(promotion,subtotal){
  const missing=Math.max(0,F().cents(promotion.minimum)-F().cents(subtotal))/100;
  return {missing,payable:missing?subtotal:F().money(subtotal-promotion.discount)};
 }
 function validate(d){const c=C().state(d),ids=new Set();
  if(c.monthlyBudget!==undefined&&(!Number.isFinite(c.monthlyBudget)||!Number.isSafeInteger(F().cents(c.monthlyBudget))||c.monthlyBudget<0||F().money(c.monthlyBudget)!==c.monthlyBudget))throw Error('Orçamento Casa inválido.');
  if(c.travelCostPerKm!==undefined&&(!Number.isFinite(c.travelCostPerKm)||c.travelCostPerKm<0||c.travelCostPerKm>5))throw Error('Custo por km inválido.');
  if(c.priceWatch!==undefined){
   const w=c.priceWatch;
   if(!w||!Array.isArray(w.stores)||!Array.isArray(w.observations)||!Array.isArray(w.checks)||
    w.stores.some(s=>typeof s.storeId!=='string'||!Number.isSafeInteger(s.locationId)||s.locationId<1)||
    w.checks.some(r=>typeof r.barcode!=='string'||!Number.isSafeInteger(r.locationId)||!F().validDate(r.checked)||!['found','missing','error'].includes(r.status))||
    w.observations.some(r=>!Number.isSafeInteger(r.id)||typeof r.barcode!=='string'||!Number.isSafeInteger(r.locationId)||!F().validDate(r.date)||!Number.isFinite(r.price)||r.price<=0))
    throw Error('Histórico de consulta de preços inválido.');
  }
  if(c.travelOrigin!==undefined&&(typeof c.travelOrigin!=='string'||c.travelOrigin.length>240))throw Error('Ponto de partida inválido.');
  for(const st of c.stores){
   if(st.shoppingPromotion!==undefined&&!validPromotion(st.shoppingPromotion))throw Error('Promoção do supermercado inválida.');
   if([st.address,st.routeOrigin].some(x=>x!==undefined&&(typeof x!=='string'||x.length>240))||
    st.routeKind!==undefined&&!['road','straight','estimate'].includes(st.routeKind)||
    st.durationMinutes!=null&&(!Number.isFinite(st.durationMinutes)||st.durationMinutes<0||st.durationMinutes>720))throw Error('Trajeto da loja inválido.');
  }
  for(const st of c.stores)if(st.distanceKm!==undefined&&(!Number.isFinite(st.distanceKm)||st.distanceKm<=0||st.distanceKm>1000))throw Error('Distância de loja inválida.');
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
  const perKm=travelRate(c);
  const distance=s=>s.routeKind!=='straight'&&(!c.travelOrigin||s.routeOrigin===c.travelOrigin)?s.distanceKm||0:0;
  const trip=s=>Math.round(distance(s)*perKm*100)/100;
  const evaluate=selected=>{const assignments=[],missing=[];for(const row of rows){const p=c.catalog.find(p=>p.id===row.catalogId);const offers=p.archived?[]:selected.filter(s=>p.offers[s.id]?.price>0).map(s=>{const o=p.offers[s.id],packages=Math.ceil(Math.round(row.requestedQty*1000)/Math.round(o.packageQty*1000));return {id:row.id,storeId:s.id,total:packages*F().cents(o.price)/100,packages,packageQty:o.packageQty,date:o.date||''};}).sort((a,b)=>a.total-b.total||a.storeId.localeCompare(b.storeId));if(offers.length)assignments.push(offers[0]);else missing.push(row.name);}const used=selected.filter(s=>assignments.some(a=>a.storeId===s.id)),products=assignments.reduce((n,a)=>n+F().cents(a.total),0)/100,travel=used.reduce((n,s)=>n+F().cents(trip(s)),0)/100;return {stores:selected.map(s=>s.id),products,travel,total:F().money(products+travel),uncertainTravel:perKm>0&&used.some(s=>!distance(s)),assignments,missing};};
  function choose(start,selected){if(selected.length)candidates.push(evaluate(selected));if(selected.length===maxStores)return;for(let n=start;n<stores.length;n++)choose(n+1,[...selected,stores[n]]);}
  if(stores.length>30)throw Error('A comparação suporta até 30 lojas ativas. Arquiva as que não utilizas.');choose(0,[]);
  candidates.sort((a,b)=>a.missing.length-b.missing.length||a.total-b.total||a.stores.length-b.stores.length);
  const complete=candidates.filter(p=>!p.missing.length);
  const best=rows.length?(complete.find(p=>!p.uncertainTravel)||complete[0]):null;
  const single=candidates.filter(x=>x.stores.length===1);
  const relevantCandidates=single.filter(x=>x.assignments.length>0);
  const uncoveredStores=single.filter(x=>x.assignments.length===0).map(x=>stores.find(s=>s.id===x.stores[0])?.name).filter(Boolean);
  const relevantStoreIds=[...new Set([...relevantCandidates.flatMap(x=>x.stores),...(best?.assignments||[]).map(a=>a.storeId)])];
  let current=null;
  if(rows.length){
   const curAssignments=[],curMissing=[],curUsedIds=new Set();
   for(const row of rows){
    const p=c.catalog.find(p=>p.id===row.catalogId),s=stores.find(x=>x.id===row.storeId),o=p&&!p.archived&&s?p.offers?.[s.id]:null;
    if(o&&o.price>0){const packages=Math.ceil(Math.round(row.requestedQty*1000)/Math.round(o.packageQty*1000));curUsedIds.add(s.id);curAssignments.push({total:packages*F().cents(o.price)/100});}
    else curMissing.push(row.name);
   }
   if(!curMissing.length){
    const curUsed=stores.filter(s=>curUsedIds.has(s.id)),products=curAssignments.reduce((n,a)=>n+F().cents(a.total),0)/100,travel=curUsed.reduce((n,s)=>n+F().cents(trip(s)),0)/100;
    current={stores:curUsed.map(s=>s.id),products,travel,total:F().money(products+travel),uncertainTravel:perKm>0&&curUsed.some(s=>!distance(s))};
   }
  }
  return {perKm,best:best||null,candidates:relevantCandidates,uncoveredStores,relevantStoreIds,current,excluded:c.shopping.filter(s=>!s.done&&!s.catalogId).length,rows:rows.length};
 }
 function travelRate(c){const r=c.travelCostPerKm;return Number.isFinite(r)&&r>=0?r:0.2;}
 function setTravelOrigin(d,origin){return C().change(d,draft=>{draft.casa.travelOrigin=String(origin||'').trim();});}
 function setTravelRate(d,value){const r=Number(value);if(!Number.isFinite(r)||r<0||r>5)throw Error('Custo por km inválido (0 a 5 €).');return C().change(d,draft=>{draft.casa.travelCostPerKm=Math.round(r*100)/100;});}
 function applyPlan(d,maxStores,expected){return C().change(d,draft=>{const plan=compare(draft,maxStores).best;if(!plan||JSON.stringify(plan)!==expected)throw Error('A lista ou os preços mudaram. Compara novamente.');for(const a of plan.assignments){const row=draft.casa.shopping.find(s=>s.id===a.id);if(row.storeId!==a.storeId)delete row.purchaseOverride;row.storeId=a.storeId;row.notFound=false;}});}
 function unitCost(c,lot){const p=c.purchases.find(p=>p.id===lot.purchaseId),i=p?.items[lot.line];return i?.qty>0?(i.total/i.qty)*(p.total/p.items.reduce((n,x)=>n+x.total,0)):null;}
 function recipeCost(d,id,servings){const c=C().state(d),r=c.recipes.find(r=>r.id===id);if(!r||!Number.isInteger(servings)||servings<1||servings>1000)throw Error('Receita ou porções inválidas.');let total=0;const missing=[];for(const i of r.ingredients){const p=c.catalog.find(p=>p.id===i.catalogId),offer=L().prices(d,p.id)[0];if(!offer)missing.push(p.name);else total+=Math.round(i.qty*servings/r.servings*1000)/1000*offer.per;}return {total:F().money(total),perServing:F().money(total/servings),missing};}
 function monthShift(month,n){const d=new Date(month+'-15T12:00:00');d.setMonth(d.getMonth()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
 function insights(d,month=F().today().slice(0,7)){
  if(!F().validDate(month+'-01'))throw Error('Mês inválido.');const c=C().state(d),allRefunds=E().refunds(d),purchases=c.purchases.filter(p=>p.date.startsWith(month)),refunds=allRefunds.filter(r=>r.date.startsWith(month)),total=(purchases.reduce((n,p)=>n+F().cents(p.total),0)-refunds.reduce((n,r)=>n+F().cents(r.amount),0))/100;
  const monthly=Array.from({length:6},(_,i)=>{const key=monthShift(month,i-5),rows=c.purchases.filter(p=>p.date.startsWith(key));return {month:key,total:(rows.reduce((n,p)=>n+F().cents(p.total),0)-allRefunds.filter(r=>r.date.startsWith(key)).reduce((n,r)=>n+F().cents(r.amount),0))/100,count:rows.length};});
  let waste=0,unknownWaste=0;for(const e of c.stockEvents.filter(e=>e.type==='waste'&&e.date.startsWith(month))){const lot=c.stock.find(l=>l.id===e.lotId),cost=unitCost(c,lot);if(cost===null)unknownWaste++;else waste+=-e.delta*cost;}
  unknownWaste+=c.legacyActivity.filter(e=>e.type==='waste'&&e.date.startsWith(month)).length;
  const priceChanges=c.catalog.map(p=>{
   const history=[...c.priceHistory.filter(h=>h.catalogId===p.id),...c.purchases.flatMap(r=>r.items.filter(i=>i.catalogId===p.id).map(i=>({...i,storeId:r.storeId||r.store||'',date:r.date})))].filter(h=>h.date.slice(0,7)<=month&&h.price>0&&h.packageQty>0).sort((a,b)=>a.date.localeCompare(b.date));
   if(history.length<2)return null;
   const a=history[0],b=history.at(-1);
   const [factor,unit]=({ml:[1000,'L'],cl:[100,'L'],g:[1000,'kg']})[p.unit]||[1,p.unit];
   const fromRaw=a.price/a.packageQty,toRaw=b.price/b.packageQty;
   const byStoreMap=new Map();
   for(const h of history){const sk=String(h.storeId||'');if(!sk)continue;if(!byStoreMap.has(sk))byStoreMap.set(sk,[]);byStoreMap.get(sk).push(h);}
   const byStore=[...byStoreMap].filter(([,rows])=>rows.length>=2).map(([storeId,rows])=>{const sA=rows[0],sB=rows.at(-1),f0=sA.price/sA.packageQty,t0=sB.price/sB.packageQty;return{storeId,from:f0*factor,to:t0*factor,percent:(t0/f0-1)*100};});
   return {id:p.id,name:p.name,unit,rawUnit:p.unit,from:fromRaw*factor,to:toRaw*factor,percent:(toRaw/fromRaw-1)*100,byStore};
  }).filter(Boolean);
  const stores=new Map(),categories=new Map();
  for(const purchase of purchases){
    stores.set(purchase.store,(stores.get(purchase.store)||0)+F().cents(purchase.total));
    const gross=purchase.items.reduce((n,i)=>n+F().cents(i.total),0);let allocated=0;
    purchase.items.forEach((i,index)=>{const category=i.category||c.catalog.find(p=>p.id===i.catalogId)?.storeCategories?.[purchase.storeId]||c.catalog.find(p=>p.id===i.catalogId)?.category||'Sem categoria';
      const value=index===purchase.items.length-1?F().cents(purchase.total)-allocated:Math.floor(F().cents(i.total)*F().cents(purchase.total)/gross);allocated+=value;categories.set(category,(categories.get(category)||0)+value);
    });
  }
  for(const r of refunds){const p=c.purchases.find(p=>p.id===r.purchaseId);stores.set(p.store,(stores.get(p.store)||0)-F().cents(r.amount));categories.set('Reembolsos',(categories.get('Reembolsos')||0)-F().cents(r.amount));}

  return {stores:[...stores].map(([name,value])=>({name,total:value/100})),categories:[...categories].map(([name,value])=>({name,total:value/100})),month,total,monthly,previous:monthly[4].total,difference:F().money(total-monthly[4].total),budget:c.monthlyBudget||0,remaining:F().money((c.monthlyBudget||0)-total),unlinked:purchases.filter(p=>p.total>0&&!p.transactionId).length,waste:F().money(waste),unknownWaste,priceChanges};
 }
 function suggestRecipes(d){const c=C().state(d),today=F().today();return c.recipes.filter(r=>!r.archived).map(r=>{let feasible=true;try{L().cookQuote(d,r.id,r.servings);}catch{feasible=false;}const lots=c.stock.filter(l=>r.ingredients.some(i=>i.catalogId===l.catalogId)&&L().remaining(c,l)>0&&(!l.expiry||l.expiry>=today));const expiry=lots.filter(l=>l.expiry).map(l=>l.expiry).sort()[0]||'9999';return {id:r.id,name:r.name,feasible,expiry,opened:lots.filter(l=>l.opened).length};}).sort((a,b)=>Number(b.feasible)-Number(a.feasible)||a.expiry.localeCompare(b.expiry)||b.opened-a.opened);}
 function priceWatch(d){
  return C().state(d).priceWatch||{stores:[],observations:[],checks:[]};
 }
 function setPriceWatch(d,stores){
  return C().change(d,draft=>{
   const w=priceWatch(draft);
   if(new Set(stores.map(s=>s.locationId)).size!==stores.length)throw Error('Associa cada loja física a um identificador diferente.');
   draft.casa.priceWatch={...w,stores};
  });
 }
 function observedPrices(payload,barcode,locationId,today=F().today()){
  if(!Array.isArray(payload?.items))throw Error('Resposta de preços inválida.');
  return payload.items.filter(x=>x.type==='PRODUCT'&&x.product_code===barcode&&x.location_id===locationId&&
   x.location?.osm_address_country_code==='PT'&&x.currency==='EUR'&&!x.price_per&&Number.isSafeInteger(x.id)&&
   Number.isFinite(x.price)&&x.price>0&&F().validDate(x.date)&&x.date<=today).map(x=>({
    id:x.id,barcode,locationId,date:x.date,price:x.price,
    promotion:x.price_is_discounted===true,
    regular:Number.isFinite(x.price_without_discount)&&x.price_without_discount>x.price?x.price_without_discount:null,
    proofId:Number.isSafeInteger(x.proof_id)&&x.proof_id>0?x.proof_id:null,
  }));
 }
 function recordPriceChecks(d, results, date=F().today()){
  return C().change(d,draft=>{
   const w=priceWatch(draft),obs=new Map(w.observations.map(r=>[r.id,r])),checks=new Map(w.checks.map(r=>[r.locationId+':'+r.barcode,r]));
   for(const x of results){
    if(!w.stores.some(s=>s.locationId===x.locationId)||!draft.casa.catalog.some(p=>!p.archived&&p.barcode===x.barcode))continue;
    for(const row of x.rows)obs.set(row.id,row);
    checks.set(x.locationId+':'+x.barcode,{barcode:x.barcode,locationId:x.locationId,checked:date,status:x.status});
   }
   draft.casa.priceWatch={stores:w.stores,observations:[...obs.values()],checks:[...checks.values()]};
  });
 }
 const api={isCombinedStoreName,combinedStores,previewSplitStore,applySplitStore,priceWatch,setPriceWatch,observedPrices,recordPriceChecks,validate,savePromotion,promotionProgress,budget,saveList,listNeeds,useList,removeList,compare,applyPlan,setTravelOrigin,setTravelRate,unitCost,recipeCost,insights,suggestRecipes};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.CasaDaily=Object.freeze(api);
})(globalThis);
