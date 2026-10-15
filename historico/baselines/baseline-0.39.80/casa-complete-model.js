(function(root) {
  'use strict';
  const F=()=>typeof module==='object'&&module.exports?require('./finance.js'):root.Finance;
  const C=()=>typeof module==='object'&&module.exports?require('./casa-model.js'):root.CasaFinance;
  const L=()=>typeof module==='object'&&module.exports?require('./casa-life-model.js'):root.CasaLife;
  const units=n=>Math.round(n*1000);
  const quantity=n=>Number.isFinite(n)&&n>0&&Number.isSafeInteger(units(n))&&Math.abs(n*1000-units(n))<1e-6;
  const money=n=>Number.isFinite(n)&&n>=0&&F().money(n)===n&&Number.isSafeInteger(F().cents(n));
  const day=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function refunds(d){const c=C().state(d),byMovement=new Map(c.purchases.filter(p=>p.transactionId).map(p=>[p.transactionId,p]));return [...(c.returns||[]),...d.transactions.filter(t=>t.refundOf&&t.source!=='Casa reembolso').flatMap(t=>{const p=byMovement.get(t.refundOf);return p?[{id:t.id,purchaseId:p.id,date:t.date,amount:t.amount,qty:0,legacy:true}]:[];})];}

  function validate(d) {
    const c=C().state(d),f=F(),ids=new Set(),links=new Set();
    for(const p of c.catalog) if(p.storeCategories!==undefined){
      if(!p.storeCategories||typeof p.storeCategories!=='object'||Array.isArray(p.storeCategories))throw Error('Categorias por loja inválidas.');
      for(const [sid,name] of Object.entries(p.storeCategories))if(!c.stores.some(s=>s.id===sid)||typeof name!=='string'||name.length>160)throw Error('Categoria de supermercado inválida.');
    }
    for(const list of c.lists||[]) {const seen=new Set();for(const i of list.items){const key=i.catalogId||String(i.name).trim().toLocaleLowerCase('pt');if(seen.has(key))throw Error('Produto repetido na lista guardada.');seen.add(key);}}
    for(const row of c.shopping){
      for(const [key,max] of [['note',500],['location',80]])if(row[key]!==undefined&&(typeof row[key]!=='string'||row[key].length>max))throw Error('Detalhes da lista inválidos.');
      if(row.expiry!==undefined&&row.expiry!==''&&!f.validDate(row.expiry))throw Error('Validade inválida.');
      if(row.notFound!==undefined&&(typeof row.notFound!=='boolean'||row.notFound&&row.done))throw Error('Estado do artigo inválido.');
      if(row.storeId&&!c.stores.some(s=>s.id===row.storeId))throw Error('Loja da lista inválida.');
      if(row.purchaseOverride){const o=row.purchaseOverride;if(!row.catalogId||!Number.isSafeInteger(o.packages)||o.packages<1||!money(o.price)||o.price<=0||!quantity(o.packageQty))throw Error('Preço ou embalagens da lista inválidos.');}
    }
    for(const lot of c.stock) if(lot.packaging!==undefined){
      const p=lot.packaging;
      if(!p||!quantity(p.size)||!Number.isSafeInteger(p.closed)||p.closed<0||!Number.isSafeInteger(p.closed*units(p.size))||p.closed*units(p.size)>units(L().remaining(c,lot)))throw Error('Embalagens fechadas excedem o stock ou têm dados inválidos.');
      if(lot.opened!==(units(L().remaining(c,lot))>p.closed*units(p.size)))throw Error('Estado das embalagens incoerente.');
    }
    if(c.returns!==undefined&&!Array.isArray(c.returns))throw Error('Devoluções inválidas.');
    for(const r of c.returns||[]) {
      const p=c.purchases.find(p=>p.id===r.purchaseId);
      if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||!p||!f.validDate(r.date)||r.date<p.date||!money(r.amount)||!Number.isFinite(r.qty)||r.qty<0||(r.qty>0&&!quantity(r.qty))||(!r.qty&&!r.amount)||typeof r.note!=='string'||!r.note.trim()||r.note.length>500)throw Error('Devolução ou reembolso inválido.');
      ids.add(r.id);
      const events=c.stockEvents.filter(e=>e.returnId===r.id);
      if(r.qty){const lot=c.stock.find(l=>l.id===r.lotId);if(!lot||lot.purchaseId!==p.id||events.length!==1||events[0].lotId!==lot.id||events[0].delta!==-r.qty||events[0].date!==r.date||events[0].type!=='return')throw Error('Devolução sem saída de stock coerente.');}
      else if(events.length)throw Error('Reembolso sem devolução não retira stock.');
      if(r.transactionId){const t=d.transactions.find(t=>t.id===r.transactionId);if(!t||links.has(t.id)||!p.transactionId||t.type!=='income'||t.source!=='Casa reembolso'||t.sourceId!==r.id||t.refundOf!==p.transactionId||t.amount!==r.amount||t.date!==r.date)throw Error('Reembolso financeiro incoerente.');links.add(t.id);}
      else if(r.amount&&p.transactionId)throw Error('Falta o reembolso da compra financeira.');
    }
    for(const e of c.stockEvents)if(e.type==='return'&&!(c.returns||[]).some(r=>r.id===e.returnId))throw Error('Saída sem devolução.');
    for(const t of d.transactions)if(t.source==='Casa reembolso'&&!links.has(t.id))throw Error('Movimento sem reembolso Casa.');
    const reimbursements=refunds(d);
    for(const p of c.purchases)if(reimbursements.filter(r=>r.purchaseId===p.id).reduce((n,r)=>n+f.cents(r.amount),0)>f.cents(p.total))throw Error('O reembolso acumulado excede o valor pago.');
  }

  function category(d,productId,storeId,name){return C().change(d,draft=>{
    const p=draft.casa.catalog.find(p=>p.id===productId);
    if(!p||!draft.casa.stores.some(s=>s.id===storeId))throw Error('Produto ou supermercado não encontrado.');
    p.storeCategories=p.storeCategories||{};p.storeCategories[storeId]=String(name||'').trim();
  });}

  function editList(d,id,name,items){return C().change(d,draft=>{
    const list=(draft.casa.lists||[]).find(l=>l.id===id);if(!list)throw Error('Lista não encontrada.');
    list.name=String(name||'').trim();list.items=structuredClone(items);
  });}

  function syncPackaging(c,lot){if(!lot.packaging)return;
    const n=units(L().remaining(c,lot)),size=units(lot.packaging.size);
    lot.packaging.closed=Math.min(lot.packaging.closed,Math.max(0,Math.floor(n/size)));
    lot.opened=n>lot.packaging.closed*size;
  }
  function packaging(d,lotId,size,closed){return C().change(d,draft=>{
    const lot=draft.casa.stock.find(l=>l.id===lotId);if(!lot)throw Error('Lote não encontrado.');
    lot.packaging={size,closed};lot.opened=units(L().remaining(draft.casa,lot))>closed*units(size);
  });}
  function openPackage(d,lotId){return C().change(d,draft=>{
    const lot=draft.casa.stock.find(l=>l.id===lotId);if(!lot?.packaging?.closed)throw Error('Não há embalagens fechadas.');
    lot.packaging.closed--;lot.opened=true;
  });}

  function returnPurchase(d,input){return C().change(d,(draft,f)=>{
    const c=draft.casa,p=c.purchases.find(p=>p.id===input.purchaseId);
    if(!p)throw Error('Compra não encontrada.');
    if(typeof input.id!=='string'||!input.id||(c.returns||[]).some(r=>r.id===input.id))throw Error('Devolução já registada ou sem identificação.');
    if(!f.validDate(input.date)||input.date<p.date||input.date>f.today()||draft.closedMonths.includes(input.date.slice(0,7)))throw Error('Escolhe uma data válida num mês aberto, até hoje.');
    if(!money(input.amount)||!Number.isFinite(input.qty)||input.qty<0||(input.qty&&!quantity(input.qty))||(!input.amount&&!input.qty))throw Error('Indica um valor a receber ou uma quantidade a devolver.');
    const r={id:input.id,purchaseId:p.id,date:input.date,amount:input.amount,qty:input.qty,lotId:input.lotId||'',note:String(input.note||'').trim()};
    if(r.qty){const lot=c.stock.find(l=>l.id===r.lotId&&l.purchaseId===p.id);if(!lot||r.qty>L().remaining(c,lot))throw Error('Não podes devolver stock inexistente ou já consumido.');
      c.stockEvents.push({id:f.id(),lotId:lot.id,type:'return',delta:-r.qty,date:r.date,note:r.note,returnId:r.id});syncPackaging(c,lot);
    }
    if(r.amount&&p.transactionId){const original=draft.transactions.find(t=>t.id===p.transactionId);const account=input.account||original.account;
      const destination=draft.accounts.find(a=>a.name===account);if(!destination||destination.archived&&account!==original.account)throw Error('Escolhe uma conta ativa para receber.');
      const t=f.add(draft,{date:r.date,type:'income',amount:r.amount,account,category:original.category,description:'Reembolso · '+p.store,source:'Casa reembolso',sourceId:r.id,refundOf:p.transactionId});r.transactionId=t.id;
    }
    c.returns=c.returns||[];c.returns.push(r);return r.id;
  });}

  function removeReturn(d,id){return C().change(d,(draft,f)=>{
    const c=draft.casa,r=(c.returns||[]).find(r=>r.id===id);if(!r)throw Error('Reembolso não encontrado.');
    if(draft.closedMonths.includes(r.date.slice(0,7)))throw Error('Reabre o mês antes de anular.');
    c.returns=c.returns.filter(r=>r.id!==id);if(r.transactionId)f.remove(draft,r.transactionId);
    c.stockEvents=c.stockEvents.filter(e=>e.returnId!==id);
    if(r.qty){const lot=c.stock.find(l=>l.id===r.lotId);syncPackaging(c,lot);}
  });}

  function weekly(d,start,servings){
    if(!F().validDate(start)||!Number.isInteger(servings)||servings<1||servings>1000)throw Error('Data ou porções inválidas.');
    const c=C().state(d),recipes=c.recipes.filter(r=>r.ingredients.every(i=>c.catalog.some(p=>p.id===i.catalogId&&!p.archived))),draft=structuredClone(d),rows=[],counts=new Map();
    draft.casa=structuredClone(c);
    if(!recipes.length)throw Error('Cria pelo menos uma receita com produtos ativos.');
    for(let n=0;n<7;n++)for(const meal of ['lunch','dinner']){
      const date=day(start,n);if(date<F().today()||c.plans.some(p=>p.date===date&&p.meal===meal))continue;
      const before=L().planNeeds(draft,start,day(start,6)).reduce((sum,x)=>sum+x.qty,0);
      const ranked=recipes.map(r=>{
        const row={id:'preview-'+n+'-'+meal,date,meal,recipeId:r.id,servings,done:false};draft.casa.plans.push(row);
        const needs=L().planNeeds(draft,start,day(start,6));draft.casa.plans.pop();
        const missing=needs.reduce((sum,x)=>sum+x.qty,0)-before;
        const lots=c.stock.filter(l=>r.ingredients.some(i=>i.catalogId===l.catalogId)&&L().remaining(c,l)>0&&(!l.expiry||l.expiry>=date));
        return {row,missing,expiry:lots.map(l=>l.expiry||'9999').sort()[0]||'9999',opened:lots.filter(l=>l.opened).length,used:counts.get(r.id)||0};
      }).sort((a,b)=>Number(a.missing>0)-Number(b.missing>0)||a.used-b.used||a.expiry.localeCompare(b.expiry)||b.opened-a.opened||a.row.recipeId.localeCompare(b.row.recipeId));
      const row=ranked[0].row;draft.casa.plans.push(row);rows.push(row);counts.set(row.recipeId,(counts.get(row.recipeId)||0)+1);
    }
    return {start,servings,rows,needs:L().planNeeds(draft,start,day(start,6))};
  }
  function applyWeek(d,start,servings,expected){return C().change(d,(draft,f)=>{
    const preview=weekly(draft,start,servings);if(JSON.stringify(preview)!==expected)throw Error('O plano, as receitas ou o stock mudaram. Revê a sugestão.');
    for(const row of preview.rows)draft.casa.plans.push({...row,id:f.id()});return preview.rows.length;
  });}

  function forecasts(d,at=F().today()){
    if(!F().validDate(at))throw Error('Data inválida.');const c=C().state(d),since=day(at,-90);
    return c.catalog.filter(p=>!p.archived).map(p=>{
      const dates=new Map();for(const e of c.stockEvents.filter(e=>e.type==='consume'&&e.date>=since&&e.date<=at&&c.stock.find(l=>l.id===e.lotId)?.catalogId===p.id))dates.set(e.date,(dates.get(e.date)||0)-e.delta);
      const entries=[...dates].sort((a,b)=>a[0].localeCompare(b[0]));
      const span=entries.length?Math.round((new Date(at+'T12:00:00')-new Date(entries[0][0]+'T12:00:00'))/86400000)+1:0;
      const recent=entries.length&&entries.at(-1)[0]>=day(at,-30);
      const stock=L().available(c,p.id,at),pending=L().pending(c,p.id);
      if(entries.length<3||span<14||!recent)return {catalogId:p.id,confidence:'insuficiente',days:null,qty:0,observations:entries.length,stock,pending};
      const rate=entries.reduce((sum,e)=>sum+e[1],0)/span;
      const confidence=entries.length>=8&&span>=30?'moderada':'baixa';
      return {catalogId:p.id,confidence,days:Math.floor(stock/rate),qty:Math.max(0,Math.ceil((rate*14-stock-pending)*1000)/1000),observations:entries.length,stock,pending,rate};
    });
  }

  function updateShopping(d,id,input){return C().change(d,draft=>{
    const c=draft.casa,row=c.shopping.find(r=>r.id===id);if(!row)throw Error('Artigo não encontrado.');
    if(input.storeId!==undefined){const store=c.stores.find(s=>s.id===input.storeId&&!s.archived);if(!store)throw Error('Escolhe uma loja ativa.');
      if(row.catalogId&&!c.catalog.find(p=>p.id===row.catalogId)?.offers[store.id])throw Error('Configura o preço deste produto na loja.');
      if(row.storeId!==store.id)delete row.purchaseOverride;row.storeId=store.id;
    }
    for(const key of ['note','location','expiry'])if(input[key]!==undefined)row[key]=input[key];
    if(input.notFound!==undefined){row.notFound=input.notFound;if(input.notFound)row.done=false;}
    if(!row.catalogId){if(input.name!==undefined)row.name=String(input.name).trim();if(input.qty!==undefined)row.qty=String(input.qty).trim();}
    if(input.purchaseOverride===null)delete row.purchaseOverride;
    else if(input.purchaseOverride!==undefined){const offer=c.catalog.find(p=>p.id===row.catalogId)?.offers[row.storeId];if(!offer)throw Error('Associa primeiro o produto e a loja.');row.purchaseOverride={...input.purchaseOverride,packageQty:offer.packageQty};}
  });}

  const api={updateShopping,validate,category,editList,packaging,openPackage,syncPackaging,returnPurchase,removeReturn,weekly,applyWeek,forecasts,day,refunds};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CasaComplete=Object.freeze(api);
})(globalThis);
