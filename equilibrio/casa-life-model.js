(function(root){
 'use strict';
 const base=()=>typeof module==='object'&&module.exports?require('./casa-model.js'):root.CasaFinance;
 const finance=()=>typeof module==='object'&&module.exports?require('./finance.js'):root.Finance;
 const units=n=>Math.round(n*1000),q=n=>units(n)/1000;
 const valid=n=>Number.isFinite(n)&&Number.isSafeInteger(units(n))&&Math.abs(n*1000-units(n))<1e-6;
 const MEALS=[['breakfast','Pequeno-almoço'],['morningSnack','Lanche da manhã'],['lunch','Almoço'],['afternoonSnack','Lanche da tarde'],['dinner','Jantar'],['supper','Ceia']];
 const mealLabel=id=>MEALS.find(m=>m[0]===id)?.[1]||String(id);
 const UNIT_SCALE={kg:['mass',1],g:['mass',.001],L:['volume',1],ml:['volume',.001],cl:['volume',.01]};
 const ALL_UNITS=['un','kg','g','L','ml','cl'];
 function ingredientUnits(unit){const kind=UNIT_SCALE[unit]?.[0];return kind?Object.keys(UNIT_SCALE).filter(u=>UNIT_SCALE[u][0]===kind):[unit];}
 function allUnits(unit){return [unit,...ALL_UNITS.filter(u=>u!==unit)];}
 function sameKind(a,b){return a===b||(UNIT_SCALE[a]&&UNIT_SCALE[b]&&UNIT_SCALE[a][0]===UNIT_SCALE[b][0]);}
 function convert(value,from,to){if(from===to)return value;const a=UNIT_SCALE[from],b=UNIT_SCALE[to];if(!a||!b||a[0]!==b[0])throw Error('Unidades incompatíveis.');return Math.round(value*a[1]/b[1]*1e6)/1e6;}
 function ingredientQty(i,productUnit){if(i.unit&&i.per>0&&!sameKind(i.unit,productUnit))return {qty:Math.round(i.qty/i.per*1e6)/1e6,unit:i.unit,per:i.per};const unit=i.unit&&ingredientUnits(productUnit).includes(i.unit)?i.unit:productUnit;return {qty:convert(i.qty,productUnit,unit),unit};}
 function remaining(c,lot){return (units(lot.qty)+c.stockEvents.filter(e=>e.lotId===lot.id).reduce((s,e)=>s+units(e.delta),0))/1000;}
 function available(c,productId,date=finance().today()){return c.stock.filter(l=>l.catalogId===productId&&(!l.expiry||l.expiry>=date)).reduce((s,l)=>s+units(remaining(c,l)),0)/1000;}
 function validate(d){
  const c=base().state(d),F=finance();
  for(const key of ['stockEvents','recipes','plans','priceHistory','imports','legacyActivity']){
   if(!Array.isArray(c[key]))throw Error('Lista Casa inválida: '+key);const ids=new Set();
   for(const x of c[key]){if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id))throw Error('Identificador inválido/repetido: '+key);ids.add(x.id);}
  }
  for(const p of c.catalog){if(p.minimum!==undefined&&(!valid(p.minimum)||p.minimum<0||!valid(p.target)||p.target<p.minimum))throw Error('Limites de reposição inválidos.');}
  const balances=new Map(c.stock.map(l=>[l.id,units(l.qty)]));
  for(const e of c.stockEvents){
   if(!balances.has(e.lotId)||!['consume','waste','adjust','return'].includes(e.type)||!valid(e.delta)||e.delta===0||(e.type!=='adjust'&&e.delta>=0)||!F.validDate(e.date)||typeof e.note!=='string'||e.note.length>500)throw Error('Movimento de stock inválido.');
   if(e.recipeId&&!c.recipes.some(r=>r.id===e.recipeId))throw Error('Receita do consumo não encontrada.');
   if(e.planId&&!c.plans.some(p=>p.id===e.planId&&p.done&&p.recipeId===e.recipeId&&e.type==='consume'))throw Error('Consumo sem refeição planeada coerente.');
   if(e.token!==undefined&&(typeof e.token!=='string'||!e.token))throw Error('Identificação do consumo inválida.');
   const n=balances.get(e.lotId)+units(e.delta);if(!Number.isSafeInteger(n)||n<0)throw Error('O stock não pode ficar negativo.');balances.set(e.lotId,n);
  }
  for(const l of c.stock){if((l.expiry!==undefined&&l.expiry!==''&&!F.validDate(l.expiry))||(l.location!==undefined&&(typeof l.location!=='string'||l.location.length>80))||(l.opened!==undefined&&typeof l.opened!=='boolean'))throw Error('Dados do lote inválidos.');}
  for(const r of c.recipes){
   if(typeof r.name!=='string'||!r.name.trim()||r.name.length>160||!Number.isInteger(r.servings)||r.servings<1||r.servings>1000||typeof r.notes!=='string'||r.notes.length>10000||!Array.isArray(r.ingredients)||!r.ingredients.length)throw Error('Receita inválida.');
   const seen=new Set();for(const i of r.ingredients){if(!c.catalog.some(p=>p.id===i.catalogId)||seen.has(i.catalogId)||!valid(i.qty)||i.qty<=0||(i.unit!==undefined&&(typeof i.unit!=='string'||!i.unit||i.unit.length>20)))throw Error('Ingrediente inválido ou repetido.');seen.add(i.catalogId);}
  }
  const slots=new Set();
  for(const p of c.plans){const key=p.date+':'+p.meal;if(!F.validDate(p.date)||!MEALS.some(m=>m[0]===p.meal)||slots.has(key)||!c.recipes.some(r=>r.id===p.recipeId)||!Number.isInteger(p.servings)||p.servings<1||p.servings>1000||typeof p.done!=='boolean')throw Error('Refeição planeada inválida/repetida.');slots.add(key);if(p.done&&!c.stockEvents.some(e=>e.planId===p.id))throw Error('Refeição sem registo de consumo.');}
  if(c.weekTemplate!==undefined){const t=c.weekTemplate,seen=new Set();if(!t||typeof t!=='object'||!F.validDate(t.since)||!Array.isArray(t.slots)||!Array.isArray(t.skips))throw Error('Semana-tipo inválida.');for(const x of t.slots){const k=x.weekday+':'+x.meal;if(!Number.isInteger(x.weekday)||x.weekday<0||x.weekday>6||!MEALS.some(m=>m[0]===x.meal)||seen.has(k)||!c.recipes.some(r=>r.id===x.recipeId)||!Number.isInteger(x.servings)||x.servings<1||x.servings>1000)throw Error('Semana-tipo inválida.');seen.add(k);}if(t.skips.some(k=>typeof k!=='string'))throw Error('Semana-tipo inválida.');}
  for(const h of c.priceHistory){if(!c.catalog.some(p=>p.id===h.catalogId)||!c.stores.some(s=>s.id===h.storeId)||!valid(h.packageQty)||h.packageQty<=0||!Number.isFinite(h.price)||h.price<=0||F.money(h.price)!==h.price||!F.validDate(h.date))throw Error('Histórico de preço inválido.');}
  for(const i of c.imports)if(!/^[a-f0-9]{64}$/.test(i.fingerprint)||!i.archive||typeof i.archive!=='object')throw Error('Origem da importação inválida.');
  for(const e of c.legacyActivity)if(!['consume','waste'].includes(e.type)||!c.catalog.some(p=>p.id===e.catalogId)||!valid(e.qty)||e.qty<=0||!F.validDate(e.date))throw Error('Histórico Casa importado inválido.');
  const daily=typeof module==='object'&&module.exports?require('./casa-daily-model.js'):root.CasaDaily;
  if(daily)daily.validate(d);
  const complete=typeof module==='object'&&module.exports?require('./casa-complete-model.js'):root.CasaComplete;
  if(complete)complete.validate(d);else if(c.version>=4)throw Error('Falta o módulo de gestão Casa.');
 }
 function lot(d,input){return base().change(d,(draft,F)=>{
  const c=draft.casa,p=c.catalog.find(p=>p.id===input.catalogId);let l=c.stock.find(l=>l.id===input.id);
  if(input.id&&!l)throw Error('Lote não encontrado.');
  if(!l){if(!p||p.archived||!valid(input.qty)||input.qty<=0)throw Error('Escolhe um produto ativo e uma quantidade válida.');l={id:F.id(),catalogId:p.id,unit:p.unit,qty:input.qty,origin:'manual'};c.stock.push(l);}
  l.location=String(input.location||'').trim();l.expiry=String(input.expiry||'');l.opened=input.opened===true;syncPackaging(c,l);return l.id;
 });}
 function record(d,input){return base().change(d,(draft,F)=>{
  const l=draft.casa.stock.find(l=>l.id===input.lotId);if(!l)throw Error('Lote não encontrado.');
  if(!valid(input.qty)||input.qty<0||!['consume','waste','adjust'].includes(input.type))throw Error('Quantidade inválida.');
  const delta=input.type==='adjust'?q(input.qty-remaining(draft.casa,l)):-input.qty;
  if(!delta)throw Error('A quantidade indicada não altera o stock.');
  draft.casa.stockEvents.push({id:F.id(),lotId:l.id,type:input.type,delta,date:F.today(),note:String(input.note||'').trim()});
  if(input.type==='consume')l.opened=true;
  syncPackaging(draft.casa,l);
 });}
 function syncPackaging(c,lot){const complete=typeof module==='object'&&module.exports?require('./casa-complete-model.js'):root.CasaComplete;complete?.syncPackaging(c,lot);}
 function policy(d,id,minimum,target){return base().change(d,draft=>{const p=draft.casa.catalog.find(p=>p.id===id);if(!p)throw Error('Produto não encontrado.');p.minimum=minimum;p.target=target;});}
 function prices(d,id){const c=base().state(d),p=c.catalog.find(p=>p.id===id);if(!p)throw Error('Produto não encontrado.');return Object.entries(p.offers).filter(([sid,o])=>c.stores.some(s=>s.id===sid&&!s.archived)&&Number(o?.price)>0).map(([storeId,o])=>({storeId,...o,per:o.price/o.packageQty})).sort((a,b)=>a.per-b.per);}
 function missingPriceOffers(d,id){const c=base().state(d),p=c.catalog.find(p=>p.id===id);if(!p)return [];return Object.entries(p.offers||{}).filter(([sid,o])=>c.stores.some(s=>s.id===sid&&!s.archived)&&!(Number(o?.price)>0)).map(([storeId,o])=>({storeId,storeName:c.stores.find(s=>s.id===storeId)?.name||storeId,...o}));}
 function pending(c,id){return c.shopping.filter(s=>s.catalogId===id).reduce((sum,s)=>sum+units(s.requestedQty),0)/1000;}
 function suggestions(d){const c=base().state(d);return c.catalog.filter(p=>!p.archived&&p.minimum!==undefined&&available(c,p.id)<=p.minimum).map(p=>({catalogId:p.id,qty:Math.max(0,q(p.target-available(c,p.id)-pending(c,p.id)))})).filter(x=>x.qty>0);}
 function queueNeeds(d,needs){return base().change(d,(draft,F)=>{
  const c=draft.casa;let count=0;
  for(const n of needs){if(!valid(n.qty)||n.qty<=0)throw Error('Quantidade de reposição inválida.');const p=c.catalog.find(p=>p.id===n.catalogId);if(!p||p.archived)throw Error('Produto inativo.');const offer=prices(draft,p.id)[0];
   if(!offer)throw Error('Configura um preço por loja para '+p.name+'.');
   const old=c.shopping.find(s=>s.catalogId===p.id&&!s.done&&s.storeId===offer.storeId);
   if(old){old.requestedQty=q(old.requestedQty+n.qty);old.qty=`${old.requestedQty} ${p.unit}`;}
   else c.shopping.push({id:F.id(),catalogId:p.id,name:p.name,qty:`${n.qty} ${p.unit}`,requestedQty:n.qty,storeId:offer.storeId,done:false});count++;
  }return count;
 });}
 function replenish(d){return queueNeeds(d,suggestions(d));}
 function saveRecipe(d,input){return base().change(d,(draft,F)=>{let r=draft.casa.recipes.find(r=>r.id===input.id);if(input.id&&!r)throw Error('Receita não encontrada.');const next={id:r?.id||F.id(),name:String(input.name||'').trim(),servings:input.servings,notes:String(input.notes||''),ingredients:(input.ingredients||[]).map(i=>{if(i.amount===undefined)return structuredClone(i);const p=draft.casa.catalog.find(p=>p.id===i.catalogId);if(!p)throw Error('Ingrediente inválido ou repetido.');const unit=i.unit||p.unit;if(!ALL_UNITS.includes(unit)&&unit!==p.unit)throw Error('Unidade incompatível com '+p.name+' ('+p.unit+').');if(!sameKind(unit,p.unit)){const per=Number(i.per);if(!(per>0)||!Number.isFinite(per))throw Error('Indica a equivalência de '+unit+' em '+p.unit+' para '+p.name+'.');const n=Math.round(i.amount*per*1000)/1000;if(!valid(n)||n<=0)throw Error('Quantidade de '+p.name+' inválida ou demasiado pequena.');return {catalogId:p.id,qty:n,unit,per:Math.round(per*1e6)/1e6};}const n=convert(i.amount,unit,p.unit);if(!valid(n)||n<=0)throw Error('Quantidade de '+p.name+' inválida ou demasiado pequena.');return unit===p.unit?{catalogId:p.id,qty:n}:{catalogId:p.id,qty:n,unit};})};if(r)Object.assign(r,next);else draft.casa.recipes.push(next);return next.id;});}
 function plan(d,input){return base().change(d,(draft,F)=>{const old=draft.casa.plans.find(p=>p.id===input.id);if(input.id&&!old)throw Error('Refeição não encontrada.');if(old?.done)throw Error('Esta refeição já foi preparada.');if(input.remove){draft.casa.plans=draft.casa.plans.filter(p=>p.id!==input.id);return;}const row={id:old?.id||F.id(),recipeId:input.recipeId,date:input.date,meal:input.meal,servings:input.servings,done:false};if(old)Object.assign(old,row);else draft.casa.plans.push(row);return row.id;});}
 function recipeNeeds(c,id,servings){const r=c.recipes.find(r=>r.id===id);if(!r||!Number.isInteger(servings)||servings<1||servings>1000)throw Error('Receita ou porções inválidas.');return r.ingredients.map(i=>{const n=q(i.qty*servings/r.servings);if(!valid(n)||n<=0)throw Error('Quantidade por porção demasiado pequena.');return {catalogId:i.catalogId,qty:n};});}
 function requirements(d,recipeId,servings){const c=base().state(d);return recipeNeeds(c,recipeId,servings).map(i=>({...i,available:available(c,i.catalogId),missing:Math.max(0,q(i.qty-available(c,i.catalogId)-pending(c,i.catalogId)))}));}
 function cookQuote(d,id,servings){const c=base().state(d),F=finance(),allocations=[];for(const i of recipeNeeds(c,id,servings)){let need=units(i.qty);const lots=c.stock.filter(l=>l.catalogId===i.catalogId&&(!l.expiry||l.expiry>=F.today())).slice().sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999')||Number(b.opened||false)-Number(a.opened||false));for(const l of lots){const take=Math.min(need,units(remaining(c,l)));if(take>0)allocations.push({lotId:l.id,qty:take/1000});need-=take;}if(need>0)throw Error('Stock insuficiente ou expirado: '+c.catalog.find(p=>p.id===i.catalogId)?.name);}return allocations;}
 function cook(d,input){return base().change(d,(draft,F)=>{const c=draft.casa,plan=c.plans.find(p=>p.id===input.planId);if(input.planId&&(!plan||plan.done||plan.recipeId!==input.recipeId||plan.servings!==input.servings))throw Error('Refeição já preparada ou alterada.');if(plan&&plan.date>F.today())throw Error('A refeição está planeada para uma data futura.');if(!input.token||c.stockEvents.some(e=>e.token===input.token))throw Error('Preparação já registada.');const allocation=cookQuote(draft,input.recipeId,input.servings);if(JSON.stringify(allocation)!==input.expected)throw Error('O stock mudou. Confirma novamente.');for(const a of allocation){c.stockEvents.push({id:F.id(),lotId:a.lotId,type:'consume',delta:-a.qty,date:F.today(),note:'Receita: '+c.recipes.find(r=>r.id===input.recipeId).name,recipeId:input.recipeId,planId:input.planId||'',token:input.token});const lot=c.stock.find(l=>l.id===a.lotId);lot.opened=true;syncPackaging(c,lot);}if(plan)plan.done=true;});}
 function weekdayOf(date){return (new Date(date+'T12:00:00Z').getUTCDay()+6)%7;}
 function addDays(date,n){const x=new Date(date+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}
 // Planos concretos + refeições da semana-tipo nos espaços livres (a partir de "since"; um ✕ guarda o dia em skips).
 function weekPlans(c,from,to){const out=c.plans.filter(p=>p.date>=from&&p.date<=to),t=c.weekTemplate;if(!t||!t.slots.length)return out;
  for(let date=from>t.since?from:t.since;date<=to;date=addDays(date,1)){const wd=weekdayOf(date);for(const x of t.slots){if(x.weekday!==wd||!c.recipes.some(r=>r.id===x.recipeId))continue;const key=date+'|'+x.meal;if(t.skips.includes(key)||c.plans.some(p=>p.date===date&&p.meal===x.meal))continue;out.push({id:'tpl|'+key,recipeId:x.recipeId,date,meal:x.meal,servings:x.servings,done:false,template:true});}}
  return out;}
 function saveTemplate(d,monday){return base().change(d,draft=>{const F=finance();if(!F.validDate(monday))throw Error('Semana inválida.');const end=addDays(monday,6),slots=draft.casa.plans.filter(p=>p.date>=monday&&p.date<=end).map(p=>({weekday:weekdayOf(p.date),meal:p.meal,recipeId:p.recipeId,servings:p.servings}));if(!slots.length)throw Error('Planeia pelo menos uma refeição nesta semana antes de a guardar como semana-tipo.');draft.casa.weekTemplate={since:monday,slots,skips:[]};});}
 function clearTemplate(d){return base().change(d,draft=>{delete draft.casa.weekTemplate;});}
 function skipTemplate(d,date,meal){return base().change(d,draft=>{const t=draft.casa.weekTemplate;if(!t)throw Error('Não há semana-tipo.');const k=date+'|'+meal;if(!t.skips.includes(k))t.skips.push(k);t.skips=t.skips.filter(x=>x.slice(0,10)>=addDays(finance().today(),-60));});}
 function planNeeds(d,from,to){
  const c=base().state(d),F=finance();if(!F.validDate(from)||!F.validDate(to)||from>to)throw Error('Período inválido.');
  const left=new Map(c.stock.map(l=>[l.id,units(remaining(c,l))])),missing=new Map();
  for(const p of weekPlans(c,from,to).filter(p=>!p.done).sort((a,b)=>a.date.localeCompare(b.date))){
   const at=p.date<F.today()?F.today():p.date;
   for(const i of recipeNeeds(c,p.recipeId,p.servings)){let need=units(i.qty);for(const l of c.stock.filter(l=>l.catalogId===i.catalogId&&(!l.expiry||l.expiry>=at)).sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999'))){const take=Math.min(need,left.get(l.id));left.set(l.id,left.get(l.id)-take);need-=take;}missing.set(i.catalogId,(missing.get(i.catalogId)||0)+need);}
  }
  return [...missing].map(([catalogId,n])=>({catalogId,qty:Math.max(0,q(n/1000-pending(c,catalogId)))})).filter(n=>n.qty>0);
 }

 const api={meals:MEALS,mealLabel,weekPlans:(d,from,to)=>weekPlans(base().state(d),from,to),saveTemplate,clearTemplate,skipTemplate,ingredientUnits,allUnits,sameKind,ingredientQty,validate,remaining,available,lot,record,policy,prices,missingPriceOffers,pending,suggestions,queueNeeds,replenish,saveRecipe,plan,requirements,cookQuote,cook,planNeeds};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.CasaLife=Object.freeze(api);
})(globalThis);
