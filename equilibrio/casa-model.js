(function (root) {
  'use strict';
  const finance = () => typeof module === 'object' && module.exports ? require('./finance.js') : root.Finance;
  const state = d => ({version:1,purchases:[],shopping:[],catalog:[],stores:[],stock:[],stockEvents:[],recipes:[],plans:[],priceHistory:[],imports:[],legacyActivity:[],...d.casa});
  const stockUnits=Object.freeze([["un","Unidades"],["kg","Quilogramas"],["g","Gramas"],["L","Litros"],["ml","Mililitros"],["cl","Centilitros"],["pack","Packs"],["caixa","Caixas"],["garrafa","Garrafas"],["lata","Latas"],["frasco","Frascos"],["saco","Sacos"],["dose","Doses"],["rolo","Rolos"],["par","Pares"],["m","Metros"]].map(r=>Object.freeze(r)));
  const validUnit=u=>stockUnits.some(([id])=>id===u);
  const quantity = n => Number.isFinite(n) && n > 0 && Number.isSafeInteger(Math.round(n*1000)) && Math.abs(n*1000-Math.round(n*1000)) < 1e-6;
  const nameKey = s => String(s).trim().normalize('NFC').toLocaleLowerCase('pt');
  // Preserve existing attachment metadata; opening remains governed by the existing viewer.
  function validatePreservedAttachment(a) {
    if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.name!=='string'||!a.name.trim())throw Error('Comprovativo preservado inválido.');
    if(a.referenceOnly!==undefined&&typeof a.referenceOnly!=='boolean')throw Error('Referência do comprovativo inválida.');
    if(a.url!==undefined){if(typeof a.url!=='string'||!/^https?:\/\/[^\s]+$/i.test(a.url))throw Error('URL do comprovativo inválida.');}
    if(a.data!==undefined){
      const m=typeof a.data==='string'&&a.data.match(/^data:([a-z0-9!#$&^_.+\/-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
      if(!m)throw Error('Comprovativo preservado inválido.');
      const payload=m[2].replace(/[\r\n]/g,''),bytes=Math.floor(payload.replace(/=+$/,'').length*3/4),limit=(m[1]==='application/pdf'?8:10)*1024*1024;
      if(!bytes||bytes>limit||a.size!==undefined&&(!Number.isFinite(Number(a.size))||Number(a.size)<=0||Number(a.size)>limit))throw Error('Tamanho do comprovativo inválido.');
    }
    if(a.data===undefined&&!a.url&&a.referenceOnly!==true)throw Error('Comprovativo preservado inválido.');
  }
  function validate(d) {
    if (d.casa === undefined) {
      if (d.transactions?.some(t => ['Casa integrado','Casa reembolso'].includes(t.source))) throw Error('Movimento Casa sem compra associada.');
      return;
    }
    const c = state(d), F = finance();
    const productsById=new Map(c.catalog.map(p=>[p.id,p])), storesById=new Map(c.stores.map(s=>[s.id,s])), purchasesById=new Map(c.purchases.map(p=>[p.id,p])), transactionsById=new Map((d.transactions||[]).map(t=>[t.id,t]));
    if (!d.casa || typeof d.casa!=='object' || Array.isArray(d.casa) || ![1,2,3,4].includes(d.casa.version) || !Array.isArray(d.casa.purchases) || !Array.isArray(d.casa.shopping) || !['purchases','shopping','catalog','stores','stock'].every(k=>Array.isArray(c[k]))) throw Error('Dados Casa inválidos ou de uma versão não suportada.');
    for (const rows of [c.purchases, c.shopping,c.catalog,c.stores,c.stock]) {
      const ids = new Set();
      for (const r of rows) {
        if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id)) throw Error('Identificador Casa inválido ou repetido.');
        ids.add(r.id);
      }
    }
    const links = new Set();
    for(const rows of [c.catalog,c.stores]) {
      const names=new Set();
      for(const r of rows){if(typeof r.name!=='string'||!r.name.trim()||r.name.length>160||names.has(nameKey(r.name)))throw Error('Nome de produto ou supermercado inválido/repetido.');names.add(nameKey(r.name));if(typeof r.archived!=='boolean')throw Error('Estado de catálogo inválido.');}
    }
    for(const p of c.catalog){
      if(!validUnit(p.unit)||typeof p.category!=='string'||p.category.length>400||!p.offers||typeof p.offers!=='object'||Array.isArray(p.offers))throw Error('Produto inválido.');
      for(const [storeId,o] of Object.entries(p.offers))if(!storesById.has(storeId)||!o||!quantity(o.packageQty)||!Number.isFinite(o.price)||o.price<=0||F.money(o.price)!==o.price||!Number.isSafeInteger(F.cents(o.price)))throw Error('Embalagem ou preço de supermercado inválido.');
    }
    for (const p of c.purchases) {
      if(p.preservedPayment!==undefined){
        // Historical payment metadata is retained on the purchase, never counted as ledger.
        const saved=p.preservedPayment;
        if(!saved||typeof saved!=='object'||Array.isArray(saved)||typeof saved.id!=='string'||!saved.id||saved.type!=='expense'||saved.source!=='Casa integrado'||saved.sourceId!==p.id||saved.date!==p.date||typeof saved.account!=='string'||typeof saved.category!=='string'||!Number.isFinite(saved.amount)||saved.amount<=0||F.money(saved.amount)!==saved.amount||!Number.isSafeInteger(F.cents(saved.amount)))throw Error('Proveniência da compra inválida.');
        if(saved.splits&&(!Array.isArray(saved.splits)||saved.splits.length<2||saved.splits.some(x=>!x||typeof x.category!=='string'||!x.category.trim()||!Number.isFinite(x.amount)||x.amount<=0||F.money(x.amount)!==x.amount)||saved.splits.reduce((n,x)=>n+F.cents(x.amount),0)!==F.cents(saved.amount)))throw Error('Divisão preservada inválida.');
        if(saved.attachment)validatePreservedAttachment(saved.attachment);
      }
      if(p.receiptText!==undefined && (typeof p.receiptText!=="string"||p.receiptText.length>200000))throw Error("Texto da fatura Casa inválido.");
      if (!F.validDate(p.date) || typeof p.store !== 'string' || !p.store.trim() || p.store.length > 160 || !Array.isArray(p.items) || !p.items.length) throw Error('Compra Casa inválida.');
      let total = 0;
      for (const item of p.items) {
        if(item.category!==undefined && (typeof item.category!=='string'||!item.category.trim()||item.category.length>400)) throw Error('Categoria do artigo inválida.');
        if(item.sourceName!==undefined && (typeof item.sourceName!=='string'||item.sourceName.length>200))throw Error('Nome original do artigo inválido.');
        if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 160 || !Number.isFinite(item.total) || item.total < 0 || F.money(item.total) !== item.total) throw Error('Artigo da compra inválido.');
        total += F.cents(item.total);
        if(item.catalogId){
          const product=productsById.get(item.catalogId);
          if(!p.stockPosted||!p.storeId||!product||item.unit!==product.unit||!quantity(item.qty)||!quantity(item.packageQty)||!quantity(item.requestedQty)||!Number.isSafeInteger(item.packages)||item.packages<1||item.packages!==Math.ceil(Math.round(item.requestedQty*1000)/Math.round(item.packageQty*1000))||Math.round(item.qty*1000)!==item.packages*Math.round(item.packageQty*1000)||!Number.isFinite(item.price)||item.price<=0||F.money(item.price)!==item.price||F.cents(item.total)!==item.packages*F.cents(item.price))throw Error('Quantidade ou valor do artigo de catálogo incoerente.');
        }
      }
      if(p.storeId&&!storesById.has(p.storeId))throw Error('Supermercado da compra em falta.');
      if (!Number.isSafeInteger(total) || total <= 0 || !Number.isFinite(p.discount??0) || (p.discount??0)<0 || F.money(p.discount??0)!==(p.discount??0) || F.cents(p.discount??0)>total || !Number.isFinite(p.total) || F.cents(p.total) !== total-F.cents(p.discount??0) || F.money(p.total) !== p.total) throw Error('Total da compra incoerente.');
      if (p.transactionId) {
        const t = transactionsById.get(p.transactionId);
        if (links.has(p.transactionId) || !t || t.source !== 'Casa integrado' || t.sourceId !== p.id || t.type !== 'expense' || t.amount !== p.total || t.date !== p.date) throw Error('A compra e o movimento associado não coincidem.');
        links.add(p.transactionId);
      }
    }
    for(const capture of d.practical?.captures||[])if(capture.purchaseId){const purchase=purchasesById.get(capture.purchaseId);if(!purchase||!purchase.preservedPayment||purchase.transactionId||capture.status!=='linked'||capture.transactionId)throw Error('Captura sem compra preservada coerente.');}
    for (const t of d.transactions) if (t.source === 'Casa integrado' && !links.has(t.id)) throw Error('Movimento Casa sem compra associada.');
    for (const s of c.shopping) if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 160 || typeof s.qty !== 'string' || s.qty.length > 80 || typeof s.done !== 'boolean') throw Error('Artigo da lista inválido.');
    for(const s of c.shopping)if(s.catalogId&&(!productsById.has(s.catalogId)||!storesById.has(s.storeId)||!quantity(s.requestedQty)))throw Error('Produto, loja ou quantidade da lista inválidos.');
    const lotKeys=new Set();
    for(const lot of c.stock){
      if(lot.origin==='manual'||lot.origin==='import'){
        if(productsById.get(lot.catalogId)?.unit!==lot.unit||!quantity(lot.qty))throw Error('Lote inicial inválido.');
        continue;
      }
      const p=purchasesById.get(lot.purchaseId),item=p?.items[lot.line];
      const key=JSON.stringify([lot.purchaseId,lot.line]);
      if(lotKeys.has(key)||!Number.isInteger(lot.line)||!item?.catalogId||item.catalogId!==lot.catalogId||item.qty!==lot.qty||item.unit!==lot.unit)throw Error('Entrada de stock sem compra ou quantidade coerente.');lotKeys.add(key);
    }
    for(const p of c.purchases)if(p.stockPosted){p.items.forEach((item,line)=>{if(item.catalogId&&!lotKeys.has(JSON.stringify([p.id,line])))throw Error('Compra sem entrada de stock.');});}
    const life=typeof module==='object'&&module.exports?require('./casa-life-model.js'):root.CasaLife;
    if(life)life.validate(d);else if(c.version>=3)throw Error('Falta o módulo de gestão da despensa.');
  }
  function change(d, action) {
    validate(d);
    const draft = structuredClone(d);
    draft.casa = structuredClone(state(d));
    validate(draft);
    draft.casa.version = 4;
    const result = action(draft, finance());
    validate(draft);
    Object.assign(d, draft);
    return result;
  }
  function linkDraft(d, F, p, account, category) {
    if (p.transactionId) return p.transactionId;
    if(!p.total)return null;
    if((d.casa.returns||[]).some(r=>r.purchaseId===p.id))throw Error('Esta compra tem devoluções. Anula-as antes de criar a ligação financeira.');
    if (!d.accounts.some(a => a.name === account && !a.archived)) throw Error('Escolhe uma conta ativa.');
    if (!String(category || '').trim()) throw Error('Indica a categoria financeira.');
    if (p.date > F.today()) throw Error('A compra tem uma data futura.');
    const saved=p.preservedPayment?structuredClone(p.preservedPayment):null;
    if(saved?.splits){let allocated=0;const total=F.cents(p.total);saved.splits=saved.splits.map((part,index)=>{const value=index===saved.splits.length-1?total-allocated:Math.floor(F.cents(part.amount)*total/F.cents(saved.amount));allocated+=value;return {...part,amount:value/100};}).filter(part=>part.amount>0);if(saved.splits.length<2){saved.category=saved.splits[0]?.category||saved.category;delete saved.splits;}}
    if(saved&&d.transactions.some(t=>t.id===saved.id))throw Error('O movimento preservado já está em uso.');
    const t = F.add(d, {...(saved?structuredClone(saved):{}), date:p.date, description:saved?.description||p.store, beneficiary:saved?.beneficiary||p.store, type:'expense', amount:p.total, account, category:String(category).trim(), source:'Casa integrado', sourceId:p.id});
    p.transactionId = t.id;
    for(const capture of d.practical?.captures||[])if(capture.purchaseId===p.id){capture.status='linked';capture.transactionId=t.id;delete capture.purchaseId;}
    return t.id;
  }
  function addPurchase(d, input) {
    return change(d, (draft,F) => {
      const p = {id:input.id || F.id(), date:input.date, store:String(input.store || '').trim(), items:structuredClone(input.items || []), total:0};
      if (draft.casa.purchases.some(x => x.id === p.id)) throw Error('Esta compra já foi registada.');
      p.total = p.items.reduce((sum,item) => sum + F.cents(item.total),0) / 100;
      if (p.date > F.today() || draft.closedMonths.includes(p.date.slice(0,7))) throw Error('Escolhe uma data num mês aberto, até hoje.');
      draft.casa.purchases.push(p);
      validate(draft);
      if (input.account) linkDraft(draft,F,p,input.account,input.category);
      return p.id;
    });
  }
  // An OCR result is only a proposal. This method receives reviewed values and
  // writes the purchase, catalogue prices, lots and optional debit together.
  function addReceiptPurchase(d, input) {
    if(input.text!==undefined && (typeof input.text!=="string"||input.text.length>200000))throw Error("Texto da fatura Casa inválido.");
    return change(d, (draft, F) => {
      const c = draft.casa;
      const storeName = String(input.store || '').trim();
      if (!storeName || storeName.length > 160) throw Error('Confirma o nome do supermercado.');
      if (!F.validDate(input.date) || input.date > F.today() || draft.closedMonths.includes(input.date.slice(0, 7)))
        throw Error('Escolhe uma data válida num mês aberto, até hoje.');
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200)
        throw Error('Confirma entre 1 e 200 artigos da fatura.');
      if (!Number.isFinite(input.total) || input.total <= 0 || F.money(input.total) !== input.total || !Number.isSafeInteger(F.cents(input.total)))
        throw Error('Confirma o total da fatura em cêntimos.');
      let store = c.stores.find(s => nameKey(s.name) === nameKey(storeName));
      if (store?.archived) throw Error('O supermercado está arquivado. Reativa-o antes de guardar esta fatura.');
      if (!store) {
        store = {id:F.id(), name:storeName, archived:false};
        c.stores.push(store);
      }
      const items = [];
      let totalCents = 0;
      for (const raw of input.items) {
        const name = String(raw.name || '').trim();
        const total = Number(raw.total);
        if (!name || name.length > 160 || !Number.isFinite(total) || total <= 0 || F.money(total) !== total || !Number.isSafeInteger(F.cents(total)))
          throw Error('Confirma o nome e o valor de cada artigo.');
        totalCents += F.cents(total);
        if (!raw.stock) {
          const category=String(raw.productCategory||raw.category||input.category||'Outros').trim();
          items.push({name,total,category,...(raw.sourceName?{sourceName:raw.sourceName}:{})});
          continue;
        }
        const unit = String(raw.unit || '');
        const productCategory = String(raw.productCategory || '').trim();
        const packages = Number(raw.packages);
        const packageQty = Number(raw.packageQty);
        if (!validUnit(unit) || !productCategory || productCategory.length > 400 ||
            !Number.isSafeInteger(packages) || packages < 1 || !quantity(packageQty) ||
            !Number.isSafeInteger(packages * Math.round(packageQty * 1000)) ||
            F.cents(total) % packages !== 0)
          throw Error('Confirma a unidade, quantidade e preço por embalagem de cada artigo para o stock.');
        let product = raw.catalogId
          ? c.catalog.find(p => p.id === raw.catalogId)
          : c.catalog.find(p => nameKey(p.name) === nameKey(name));
        if (raw.catalogId && !product) throw Error('O produto escolhido para o stock já não existe.');
        if (product?.archived) throw Error('O produto está arquivado. Reativa-o antes de o adicionar ao stock.');
        if (product && product.unit !== unit) throw Error('A unidade do produto existente não coincide com o stock indicado.');
        if (!product) {
          product = {id:F.id(), name, category:productCategory, brand:'', barcode:'', notes:'', unit, archived:false, offers:{}};
          c.catalog.push(product);
        }
        const price = F.cents(total) / packages / 100;
        const qty = packages * Math.round(packageQty * 1000) / 1000;
        if (!quantity(qty) || !Number.isSafeInteger(F.cents(price)))
          throw Error('A quantidade ou o preço do artigo excede o limite permitido.');
        const previous = product.offers[store.id];
        if (!previous || previous.price !== price || previous.packageQty !== packageQty) {
          product.offers[store.id] = {packageQty,price,date:input.date};
          c.priceHistory.push({id:F.id(),catalogId:product.id,storeId:store.id,packageQty,price,date:input.date,source:'fatura confirmada'});
        }
        items.push({name,category:productCategory,catalogId:product.id,unit,requestedQty:qty,packages,packageQty,qty,price,total,...(raw.sourceName?{sourceName:raw.sourceName}:{})});
      }
      if (!Number.isSafeInteger(totalCents) || totalCents !== F.cents(input.total))
        throw Error('A soma dos artigos tem de coincidir com o total da fatura. Revê descontos e linhas não reconhecidas.');
      const purchase = {id:F.id(),date:input.date,storeId:store.id,store:store.name,items,discount:0,total:input.total,stockPosted:items.some(i => !!i.catalogId),...(input.text!==undefined?{receiptText:input.text}:{})};
      c.purchases.push(purchase);
      items.forEach((item,line) => {
        if (item.catalogId) c.stock.push({id:F.id(),purchaseId:purchase.id,line,catalogId:item.catalogId,qty:item.qty,unit:item.unit});
      });
      if (input.account) linkDraft(draft,F,purchase,input.account,input.category);
      return purchase.id;
    });
  }
  function link(d,id,account,category) {
    return change(d,(draft,F) => {
      const p = draft.casa.purchases.find(p => p.id === id);
      if (!p) throw Error('Compra não encontrada.');
      return linkDraft(draft,F,p,account,category);
    });
  }
  function removePurchase(d,id) {
    return change(d,(draft,F) => {
      const p = draft.casa.purchases.find(p => p.id === id);
      if (!p) throw Error('Compra não encontrada.');
      if (draft.closedMonths.includes(p.date.slice(0,7))) throw Error('Reabre o mês antes de eliminar a compra.');
      if((draft.casa.returns||[]).some(r=>r.purchaseId===id))throw Error('Anula as devoluções antes de eliminar a compra.');
      if(draft.casa.stock.some(l=>l.purchaseId===id&&draft.casa.stockEvents.some(e=>e.lotId===l.id)))throw Error('Esta compra já tem consumo ou acertos de stock. Mantém a compra e corrige o stock na despensa.');
      const tx = p.transactionId;
      delete p.transactionId;
      if (tx) F.remove(draft,tx);
      draft.casa.stock = draft.casa.stock.filter(lot=>lot.purchaseId!==id);
      draft.casa.purchases = draft.casa.purchases.filter(p => p.id !== id);
      for(const capture of draft.practical?.captures||[])if(capture.purchaseId===id){capture.status='pending';delete capture.purchaseId;}
    });
  }
  function shopping(d,operation,input) {
    return change(d,(draft,F) => {
      if (operation === 'add') draft.casa.shopping.push({id:F.id(),name:String(input.name || '').trim(),qty:String(input.qty || '').trim(),done:false});
      else {
        const s = draft.casa.shopping.find(s => s.id === input.id);
        if (!s) throw Error('Artigo não encontrado.');
        if (operation === 'toggle') { s.done = !s.done; if(s.done)s.notFound=false; }
        else if (operation === 'remove') draft.casa.shopping = draft.casa.shopping.filter(s => s.id !== input.id);
        else throw Error('Operação inválida.');
      }
    });
  }
  function saveStore(d,input){return change(d,(draft,F)=>{
    const old=draft.casa.stores.find(s=>s.id===input.id);
    if(input.id&&!old)throw Error('Supermercado não encontrado.');
    const store={id:old?.id||F.id(),name:String(input.name||'').trim(),archived:input.archived===true};
    if(old)Object.assign(old,store);else draft.casa.stores.push(store);return store.id;
  });}
  function productUrl(value){
    const text=String(value??'').trim();if(!text)return '';
    if(text.length>2048)throw Error('O link do produto é demasiado longo.');
    let url;try{url=new URL(text);}catch{throw Error('Indica um link completo, começado por https:// ou http://.');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('O link do produto deve usar https:// ou http://, sem credenciais.');
    return url.href;
  }
  function writeProduct(draft,F,input){
    const old=draft.casa.catalog.find(p=>p.id===input.id);
    if(input.id&&!old)throw Error('Produto não encontrado.');
    if(old&&old.unit!==input.unit&&(draft.casa.priceHistory.some(s=>s.catalogId===old.id)||(draft.casa.lists||[]).some(l=>l.items.some(i=>i.catalogId===old.id))||draft.casa.stock.some(s=>s.catalogId===old.id)||draft.casa.recipes.some(r=>r.ingredients.some(i=>i.catalogId===old.id))||draft.casa.shopping.some(s=>s.catalogId===old.id)||draft.casa.purchases.some(p=>p.items.some(i=>i.catalogId===old.id))))throw Error('A unidade já está em uso. Cria outro produto para usar uma unidade diferente.');
    const product={id:old?.id||F.id(),brand:String(input.brand??old?.brand??'').trim(),url:productUrl(input.url??old?.url),barcode:String(input.barcode??old?.barcode??'').trim(),notes:String(input.notes??old?.notes??'').trim(),name:String(input.name||'').trim(),category:F.categoryPath(input.category||''),unit:input.unit,archived:input.archived===true,offers:structuredClone(input.offers||old?.offers||{})};
    if(old)Object.assign(old,product);else draft.casa.catalog.push(product);return product.id;
  }
  function saveProduct(d,input){return change(d,(draft,F)=>writeProduct(draft,F,input));}
  function saveProductOffers(d,input,rows){return change(d,(draft,F)=>{
    if(!Array.isArray(rows)||rows.length>500)throw Error('Preços por supermercado inválidos.');
    const id=writeProduct(draft,F,input),product=draft.casa.catalog.find(p=>p.id===id),seen=new Set();
    for(const row of rows){
      if(!row||typeof row!=="object"||typeof row.storeName!=="string")throw Error("Preços por supermercado inválidos.");
      const name=String(row.storeName||'').trim(),key=nameKey(name);
      if(!name||name.length>160||seen.has(key)||!quantity(row.packageQty)||!Number.isFinite(row.price)||row.price<=0||F.money(row.price)!==row.price||!Number.isSafeInteger(F.cents(row.price)))throw Error('Confirma loja, quantidade e preço; não repitas supermercados.');
      seen.add(key);let store=draft.casa.stores.find(s=>nameKey(s.name)===key);
      if(store?.archived)throw Error('O supermercado '+name+' está arquivado. Reativa-o em Supermercados.');
      if(!store){store={id:F.id(),name,archived:false};draft.casa.stores.push(store);}
      const old=product.offers[store.id];if(old&&old.packageQty===row.packageQty&&old.price===row.price)continue;
      product.offers[store.id]={packageQty:row.packageQty,price:row.price,date:F.today()};
      draft.casa.priceHistory.push({id:F.id(),catalogId:id,storeId:store.id,packageQty:row.packageQty,price:row.price,date:F.today(),source:'manual'});
    }
    return id;
  });}
  function setOffer(d,productId,storeId,input){return change(d,(draft,F)=>{
    const p=draft.casa.catalog.find(p=>p.id===productId),s=draft.casa.stores.find(s=>s.id===storeId);
    if(!p||p.archived||!s||s.archived)throw Error('Escolhe produto e supermercado ativos.');
    p.offers[storeId]={packageQty:input.packageQty,price:input.price,date:F.today()};
    draft.casa.priceHistory.push({id:F.id(),catalogId:productId,storeId,packageQty:input.packageQty,price:input.price,date:F.today(),source:'manual'});
  });}
  function queueProduct(d,input){return change(d,(draft,F)=>{
    const p=draft.casa.catalog.find(p=>p.id===input.catalogId),s=draft.casa.stores.find(s=>s.id===input.storeId);
    if(!p||p.archived||!s||s.archived||!p.offers[s.id])throw Error('Configura primeiro o preço e a embalagem deste produto na loja.');
    const old=draft.casa.shopping.find(s=>s.id===input.id);
    if(input.id&&!old)throw Error('Artigo não encontrado.');
    const row={id:old?.id||F.id(),name:p.name,qty:`${input.requestedQty} ${p.unit}`,catalogId:p.id,storeId:s.id,requestedQty:input.requestedQty,done:old?.done||false};
    if(old){if(old.catalogId!==row.catalogId||old.storeId!==row.storeId||old.requestedQty!==row.requestedQty)delete old.purchaseOverride;Object.assign(old,row);old.notFound=false;}else draft.casa.shopping.push(row);return row.id;
  });}
  function quote(d,ids,adjustments={}){
    validate(d);const c=state(d),F=finance();
    if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('Seleciona artigos para concluir a compra.');
    const groups=new Map();
    for(const id of ids){
      const row=c.shopping.find(s=>s.id===id),p=c.catalog.find(p=>p.id===row?.catalogId),s=c.stores.find(s=>s.id===row?.storeId),offer=p?.offers[s?.id];
      if(!row?.done||!p||p.archived||!s||s.archived||!offer)throw Error('Associa os artigos marcados a um produto e loja ativos antes de concluir.');
      const edit=adjustments[id] || row.purchaseOverride;
      if(row.purchaseOverride && row.purchaseOverride.packageQty!==offer.packageQty)throw Error('A embalagem mudou. Revê o artigo na lista antes de concluir.');
      const packages=edit ? edit.packages : Math.ceil(Math.round(row.requestedQty*1000)/Math.round(offer.packageQty*1000));
      const price=edit ? edit.price : offer.price;
      if(!Number.isSafeInteger(packages)||packages<1||!Number.isFinite(price)||price<=0||F.money(price)!==price)throw Error('Confirma a quantidade de embalagens e o preço de cada artigo.');
      const actualQty=packages*Math.round(offer.packageQty*1000)/1000;
      const item={name:p.name,catalogId:p.id,unit:p.unit,requestedQty:edit?actualQty:row.requestedQty,packages,packageQty:offer.packageQty,qty:actualQty,price,total:packages*F.cents(price)/100,location:row.location||'',expiry:row.expiry||''};
      if(!Number.isSafeInteger(F.cents(item.total))||!quantity(item.qty))throw Error('Quantidade ou total fora dos limites.');
      if(!groups.has(s.id))groups.set(s.id,{storeId:s.id,store:s.name,items:[],total:0});
      const g=groups.get(s.id);g.items.push(item);g.total=F.money(g.total+item.total);
    }
    return [...groups.values()];
  }
  function checkout(d,input){return change(d,(draft,F)=>{
    if(typeof input.batchId!=='string'||!input.batchId)throw Error('Identificação da compra em falta.');
    if(draft.casa.purchases.some(p=>p.batchId===input.batchId))throw Error('Esta compra já foi concluída.');
    if(input.expected!==JSON.stringify(quote(draft,input.ids)))throw Error('A lista ou os preços mudaram. Abre novamente a confirmação.');
    const groups=quote(draft,input.ids,input.adjustments);
    if(!F.validDate(input.date)||input.date>F.today()||draft.closedMonths.includes(input.date.slice(0,7)))throw Error('Escolhe uma data válida num mês aberto, até hoje.');
    const ids=[];
    for(const group of groups){
      const discount=input.discounts?.[group.storeId]??0;
      if(!Number.isFinite(discount)||discount<0||F.money(discount)!==discount||discount>group.total)throw Error('O desconto deve estar entre zero e o total do talão.');
      const p={...group,discount,total:F.money(group.total-discount),id:F.id(),date:input.date,batchId:input.batchId,stockPosted:true};
      draft.casa.purchases.push(p);
      if(input.account)linkDraft(draft,F,p,input.account,input.category);
      for(const i of p.items){const offer=draft.casa.catalog.find(product=>product.id===i.catalogId).offers[p.storeId];if(offer.price===i.price&&(!offer.date||offer.date<input.date))offer.date=input.date;}
      p.items.forEach((i,line)=>draft.casa.stock.push({id:F.id(),purchaseId:p.id,line,catalogId:i.catalogId,qty:i.qty,unit:i.unit,location:i.location,expiry:i.expiry}));ids.push(p.id);
    }
    draft.casa.shopping=draft.casa.shopping.filter(s=>!input.ids.includes(s.id));return ids;
  });}
  function attachMovement(d,id,transactionId){return change(d,(draft)=>{
    const p=draft.casa.purchases.find(p=>p.id===id),t=draft.transactions.find(t=>t.id===transactionId);
    if(!p||p.transactionId)throw Error('Compra inexistente ou já associada.');
    if((draft.casa.returns||[]).some(r=>r.purchaseId===id))throw Error('Anula as devoluções antes de associar uma despesa.');
    if(!t||t.type!=='expense'||t.amount!==p.total||t.date!==p.date||t.source==='Casa integrado'||t.debtId||t.refundOf||t.recurringRuleId||t.pendingId||t.installmentPaymentId)throw Error('Escolhe uma despesa simples com a mesma data e valor da compra.');
    if(draft.closedMonths.includes(p.date.slice(0,7)))throw Error('Reabre o mês antes de associar a compra.');
    if(draft.installmentPlans.some(x=>x.transactionId===t.id)||draft.sharedExpenses.some(x=>x.transactionId===t.id)||draft.investmentTrades.some(x=>x.transactionId===t.id)||draft.transactions.some(x=>x.refundOf===t.id))throw Error('O movimento já pertence a outra operação.');
    p.previousSource={source:t.source,sourceId:t.sourceId};p.transactionId=t.id;t.source='Casa integrado';t.sourceId=p.id;
  });}
  function correctPurchase(d,id,prices,discount){return change(d,(draft,F)=>{
    const p=draft.casa.purchases.find(p=>p.id===id);
    if(!p||!Array.isArray(prices)||prices.length!==p.items.length)throw Error('Compra ou valores inválidos.');
    if(draft.closedMonths.includes(p.date.slice(0,7)))throw Error('Reabre o mês antes de corrigir a compra.');
    if((draft.casa.returns||[]).some(r=>r.purchaseId===id))throw Error('Anula os reembolsos antes de alterar os valores da compra.');
    const oldTotal=p.total;
    if(discount!==undefined)p.discount=discount;
    p.items.forEach((i,n)=>{const value=prices[n];if(!Number.isFinite(value)||value<0||F.money(value)!==value)throw Error('Preço inválido.');if(i.catalogId){if(!value)throw Error('O preço da embalagem tem de ser positivo.');i.price=value;i.total=i.packages*F.cents(value)/100;}else i.total=value;});
    p.total=(p.items.reduce((sum,i)=>sum+F.cents(i.total),0)-F.cents(p.discount??0))/100;
    if(p.transactionId&&oldTotal!==p.total){const t=draft.transactions.find(t=>t.id===p.transactionId);const account=draft.accounts.find(a=>a.name===t.account);if(account?.reconciledOn>=p.date)delete account.reconciledOn;if(t.reconciled)throw Error('Desfaz a conciliação antes de corrigir o valor.');const captures=(draft.practical?.captures||[]).filter(c=>c.status==='linked'&&c.transactionId===t.id).map(c=>c.id);
      if(!p.total)p.preservedPayment=structuredClone(t);delete p.transactionId;F.remove(draft,t.id);if(p.total>0){if(t.splits){let allocated=0;const total=F.cents(p.total);t.splits=t.splits.map((part,index)=>{const value=index===t.splits.length-1?total-allocated:Math.floor(F.cents(part.amount)*total/F.cents(t.amount));allocated+=value;return {...part,amount:value/100};}).filter(part=>part.amount>0);if(t.splits.length<2){t.category=t.splits[0]?.category||t.category;delete t.splits;}}F.add(draft,{...t,amount:p.total});p.transactionId=t.id;}
      for(const capture of draft.practical?.captures||[])if(captures.includes(capture.id)){capture.status='linked';if(p.transactionId)capture.transactionId=p.transactionId;else{delete capture.transactionId;capture.purchaseId=p.id;}}
    }
    if(oldTotal!==p.total){p.corrections=p.corrections||[];p.corrections.push({date:F.today(),from:oldTotal,to:p.total});}
  });}
  function categoryPaths(d){const paths=new Set();for(const p of state(d).catalog){const parts=finance().categoryParts(p.category);for(let i=1;i<=parts.length;i++)paths.add(finance().categoryPath(parts.slice(0,i)));}return [...paths].sort((a,b)=>a.localeCompare(b,'pt'));}
  const api = {productUrl,stockUnits,validatePreservedAttachment,categoryPaths,state,validate,addPurchase,addReceiptPurchase,link,removePurchase,shopping,saveStore,saveProduct,saveProductOffers,setOffer,queueProduct,quote,checkout,change,attachMovement,correctPurchase};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CasaFinance = Object.freeze(api);
})(typeof globalThis === 'object' ? globalThis : this);
