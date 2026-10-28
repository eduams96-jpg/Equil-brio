/* Suggestions from local OCR are drafts. Only reviewed totals reach the ledger. */
(function (root) {
  const F =
    root.Finance ||
    (typeof require === "function" ? require("./finance.js") : null);
  const clean = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  // Exact local aliases only. A suggestion never changes a reviewed line.
  const nameKey = value => clean(value || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const ruleValue = rule => rule.kind === 'product' ? rule.catalogId : rule.category;
  function validateRules(rules) {
    if (!Array.isArray(rules) || rules.length > 2000) throw Error('Lista de sugestões de artigos inválida (máximo 2000).');
    const ids = new Set();
    for (const r of rules) {
      if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) || !['category','product'].includes(r.kind) ||
          typeof r.name !== 'string' || !nameKey(r.name) || r.name.length > 200 ||
          typeof r.merchant !== 'string' || r.merchant.length > 200 || typeof r.enabled !== 'boolean' ||
          !Array.isArray(r.excludedMerchants) || r.excludedMerchants.length > 50 || r.excludedMerchants.some(s => typeof s !== 'string' || !nameKey(s) || s.length > 200) ||
          typeof ruleValue(r) !== 'string' || !ruleValue(r).trim() || ruleValue(r).length > (r.kind === 'category' ? 80 : 200))
        throw Error('Sugestão de artigo inválida.');
      ids.add(r.id);
    }
  }
  function suggest(d, merchant, name, kind = 'category') {
    const store = nameKey(merchant), article = nameKey(name);
    if (!article || !store) return null;
    let matches = (d.receiptRules || []).filter(r => r.enabled && r.kind === kind && nameKey(r.name) === article &&
      (!r.merchant || nameKey(r.merchant) === store) && !r.excludedMerchants.some(s => nameKey(s) === store));
    const local = matches.filter(r => r.merchant);
    if (local.length) matches = local;
    if (kind === 'product') matches = matches.filter(r => d.casa?.catalog?.some(p => p.id === r.catalogId && !p.archived));
    if (!matches.length) return null;
    if (new Set(matches.map(ruleValue)).size !== 1) return { conflict: true, rules: structuredClone(matches) };
    return { ...structuredClone(matches[0]), conflict: false };
  }
  function learningPreview(d, merchant, items, kind = 'category', allStores = false) {
    if (typeof merchant !== 'string' || !nameKey(merchant) || merchant.length > 200) throw Error('Confirma a loja antes de memorizar os artigos.');
    if (!Array.isArray(items) || items.length > 200) throw Error('Artigos inválidos para memorizar.');
    const proposed = new Map();
    for (const item of items) {
      const name = String(item.sourceName || item.name || '').trim();
      const value = kind === 'product' ? item.catalogId : item.category;
      if (!value) continue;
      const token = nameKey(name);
      if (proposed.has(token) && ruleValue(proposed.get(token)) !== value)
        throw Error('O artigo “' + name + '” tem duas associações diferentes. Separa os nomes antes de memorizar.');
      proposed.set(token, { name, merchant: allStores ? '' : merchant.trim(), kind,
        ...(kind === 'product' ? { catalogId: value } : { category: value }), enabled: true, excludedMerchants: [] });
    }
    return [...proposed.values()].map(row=>{const old=(d.receiptRules||[]).find(r=>r.kind===row.kind&&nameKey(r.name)===nameKey(row.name)&&nameKey(r.merchant)===nameKey(row.merchant));return {...row,excludedMerchants:structuredClone(old?.excludedMerchants||[])};});
  }
  function remember(d, merchant, items, kind = 'category', allStores = false) {
    const preview = learningPreview(d, merchant, items, kind, allStores), rules = structuredClone(d.receiptRules || []);
    for (const row of preview) {
      const old = rules.find(r => r.kind === row.kind && nameKey(r.name) === nameKey(row.name) && nameKey(r.merchant) === nameKey(row.merchant));
      if (old) Object.assign(old, row); else rules.push({ id: F.id(), ...row });
    }
    validateRules(rules);
    d.receiptRules = rules;
    return preview.length;
  }
  function updateRule(d, id, changes) {
    const rules = structuredClone(d.receiptRules || []), rule = rules.find(r => r.id === id);
    if (!rule) throw Error('A sugestão já não existe.');
    // Only reviewed fields are editable; identity and kind stay fixed.
    for (const k of ['name','merchant','category','catalogId','enabled','excludedMerchants']) if (Object.hasOwn(changes,k)) rule[k] = structuredClone(changes[k]);
    validateRules(rules); d.receiptRules = rules;
  }
  function removeRule(d, id) { d.receiptRules = (d.receiptRules || []).filter(r => r.id !== id); }
  function validateText(text) {
    if (text !== undefined && (typeof text !== 'string' || text.length > 200000)) throw Error('Texto do comprovativo inválido (máximo 200 000 caracteres).');
  }
  const searchCache = new WeakMap();
  function replaceAttachment(t, attachment) {
    // Text read from a different file must never remain in the search index.
    if(t.attachment?.data !== attachment?.data) delete t.receiptText;
    t.attachment = attachment;
  }
  function searchText(t) {
    const signature = JSON.stringify([t.documentEntity,t.receiptMerchant,t.beneficiary,t.description,t.attachment?.name,t.category,t.receiptText,t.receiptItems]);
    const cached = searchCache.get(t); if (cached?.signature === signature) return cached.text;
    const text = nameKey([t.documentEntity,t.receiptMerchant,t.beneficiary,t.description,t.attachment?.name,t.category,t.receiptText,
      ...(t.receiptItems || []).map(i => [i.name,i.sourceName,i.category].filter(Boolean).join(' '))].filter(Boolean).join(' '));
    searchCache.set(t,{signature,text}); return text;
  }
  function category(name) {
    const s = clean(name);
    if (/\b(detergente|lixivia|limpeza|esponja)\b/.test(s)) return "Casa";
    if (
      /\b(champo|shampoo|sabonete|dentifrico|higiene|desodorizante)\b/.test(s)
    )
      return "Higiene";
    if (
      /\b(leite|pao|arroz|massa|fruta|maca|banana|carne|peixe|iogurte|queijo|cafe|azeite|ovos|agua)\b/.test(
        s,
      )
    )
      return "Alimentação";
    return "Outros";
  }
  function parse(text) {
    const lines = String(text)
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/[−–]/g, '-').replace(/\u00a0/g, ' '))
      .filter(Boolean);
    const items = [],
      unresolved = [];
    const totals = [], dates = new Set();
    const adjustments=[];
    let total = null,
      date = "";
    let adjacent=null;
    for (const line of lines) {
      const continuation=line.match(/^(\d+(?:[,.]\d+)?)\s*(?:kg|g|l|ml|un)?\s*[x×]\s*(\d+[,.]\d{2})\s*(?:€|EUR)?(?:\s*\/\s*(?:kg|g|l|ml|un))?$/i);
      if(continuation&&adjacent){adjacent.quantity=Number(continuation[1].replace(',','.'));adjacent.unitPrice=Number(continuation[2].replace(',','.'));adjacent.sourceLine+='\n'+line;adjacent=null;continue;}
      adjacent=null;
      const day = line.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})\b/);
      if (day && F.validDate(`${day[3]}-${day[2]}-${day[1]}`)) {
        date = `${day[3]}-${day[2]}-${day[1]}`;
        dates.add(date);
      }
      const iso=line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if(iso&&F.validDate(iso[0])){date=iso[0];dates.add(date);}
      const price = line.match(
        /(-?\d+(?:[ .]\d{3})*[,.]\d{2})\s*(?:€|EUR)?\s*(?:[ABC])?$/i,
      );
      if (!price) continue;
      const amount = F.parseAmount(price[1]);
      const name = line.slice(0, price.index).trim();
      if(/\b(desconto|portes|arredondamento)\b/.test(clean(name)))adjustments.push({kind:clean(name).includes('desconto')?'discount':clean(name).includes('portes')?'shipping':'rounding',amount,line});
      if (
        /^(?:total(?: a pagar| documento)?(?: eur)?|valor total)\s*[:€()]*\s*$/i.test(clean(name).replace(/\(eur\)/g,'eur'))
      ) {
        total = amount;
        totals.push(amount);
        continue;
      }
      if (
        /\b(iva|nif|subtotal|troco|multibanco|dinheiro|cartao|taxa|base|incidencia|desconto|poupou|portes|arredondamento)\b/.test(
          clean(name),
        ) ||
        amount <= 0
      ) {
        unresolved.push(line);
        continue;
      }
      if (!/[a-zÀ-ÿ]/i.test(name)) {
        unresolved.push(line);
        continue;
      }
      const detail = name.match(
        /^(.*?)\s+(\d+(?:[,.]\d+)?)\s*(?:kg|g|l|ml|un)?\s*[x×]\s*(\d+[,.]\d{2})\s*$/i,
      );
      items.push({
        name: detail ? detail[1] : name,
        quantity: detail ? Number(detail[2].replace(",", ".")) : 1,
        amount,
        category: category(detail ? detail[1] : name),
        sourceLine: line,
        unitPrice: detail ? Number(detail[3].replace(",", ".")) : null,
      });
      adjacent=detail?null:items.at(-1);
    }
    const warnings = [];
    if (new Set(totals.map(F.cents)).size > 1) { total = null; warnings.push('Foram lidos totais diferentes. Confirma o total do documento.'); }
    if (dates.size > 1) { date = ''; warnings.push('Foram lidas datas diferentes. Confirma a data da compra.'); }
    const itemTotal=F.money(items.reduce((n,item)=>n+item.amount,0));
    if(total!==null&&F.cents(itemTotal)!==F.cents(total))warnings.push('A soma dos artigos lidos ('+itemTotal.toFixed(2).replace('.',',')+' €) difere do total ('+total.toFixed(2).replace('.',',')+' €). Confere descontos e linhas em falta; os valores não foram ajustados automaticamente.');
    for(const item of items)if(item.unitPrice!==null&&F.cents(item.quantity*item.unitPrice)!==F.cents(item.amount))warnings.push('Confere quantidade e preço na linha «'+item.name+'»: a multiplicação não coincide com o total lido.');
    if (unresolved.length) warnings.push('Existem linhas não reconhecidas, descontos ou valores negativos a conferir.');
    return {
      merchant: lines.find((l) => /[a-zÀ-ÿ]/i.test(l)) || "",
      date,
      total,
      items,
      unresolved,
      warnings,
      adjustments,
      text: String(text),
    };
  }
  function inspect(draft) {
    const issues=[],items=draft.items||[],total=draft.total;
    if(!draft.merchant?.trim())issues.push({field:'merchant',message:'Confirma a loja.'});
    if(!F.validDate(draft.date)||draft.date>F.today())issues.push({field:'date',message:'Confirma uma data válida, até hoje.'});
    if(!Number.isFinite(total)||total<=0)issues.push({field:'total',message:'Confirma o total do documento.'});
    if(!items.length)issues.push({field:'items',message:'Não há artigos incluídos. Adiciona as linhas em falta.'});
    let cents=0;
    for(let index=0;index<items.length;index++){
      const item=items[index];if(!item.name?.trim()||!Number.isFinite(item.quantity)||item.quantity<=0||!Number.isFinite(item.amount)||item.amount<=0)issues.push({field:'item',index,message:'Confere nome, quantidade e total desta linha.'});
      if(Number.isFinite(item.amount))cents+=F.cents(item.amount);
      if(Number.isFinite(item.unitPrice)&&Number.isFinite(item.quantity)&&Number.isFinite(item.amount)&&F.cents(item.quantity*item.unitPrice)!==F.cents(item.amount))issues.push({field:'item',index,message:'Quantidade × preço lido não coincide com o total; confere descontos e arredondamentos.'});
    }
    if(Number.isFinite(total)&&total>0&&cents!==F.cents(total))issues.push({field:'balance',message:'A soma dos artigos difere do total. Confere descontos ou linhas em falta.'});
    return{issues,itemTotal:cents/100,total:Number.isFinite(total)?total:null,difference:Number.isFinite(total)?F.money(total-cents/100):null};
  }
  function review(d, draft) {
    validateText(draft.text);
    if (!draft.merchant?.trim() || draft.merchant.length > 200)
      throw Error("Confirma o nome da loja.");
    if (!F.validDate(draft.date) || draft.date > F.today())
      throw Error("Confirma uma data válida, até hoje.");
    if (!Number.isFinite(draft.total) || draft.total <= 0)
      throw Error("Confirma o total da fatura.");
    if (
      !Array.isArray(draft.items) ||
      !draft.items.length ||
      draft.items.length > 200
    )
      throw Error("Indica entre 1 e 200 produtos.");
    for (const item of draft.items)
      if (
        !item.name?.trim() ||
        item.name.length > 200 ||
        (item.sourceName !== undefined && (typeof item.sourceName !== 'string' || item.sourceName.length > 200)) ||
        !item.category?.trim() ||
        item.category.length > 80 ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0
      )
        throw Error(
          "Confirma nome, quantidade, valor e categoria de cada produto.",
        );
    if (
      draft.items.reduce((n, i) => n + F.cents(i.amount), 0) !==
      F.cents(draft.total)
    )
      throw Error(
        "A soma dos produtos tem de coincidir com o total. Corrige também descontos e linhas não reconhecidas.",
      );
    return draft;
  }
  function apply(d, draft, account, targetId, attachment) {
    review(d, draft);
    const target = targetId
      ? d.transactions.find((t) => String(t.id) === String(targetId))
      : null;
    if (targetId && !target)
      throw Error("O movimento escolhido já não existe.");
    if (
      target &&
      (target.type !== "expense" ||
        target.debtId ||
        target.refundOf ||
        target.pendingId ||
        target.recurringRuleId ||
        target.receiptItems ||
        target.attachment ||
        target.amount !== draft.total ||
        target.account !== account)
    )
      throw Error(
        "Escolhe uma despesa simples, sem comprovativo, na mesma conta e com o mesmo total.",
      );
    const date = target?.date || draft.date;
    if (d.closedMonths.includes(date.slice(0, 7)))
      throw Error("Reabre o mês antes de associar a fatura.");
    const groups = new Map();
    for (const i of draft.items)
      groups.set(i.category, (groups.get(i.category) || 0) + F.cents(i.amount));
    const fields = {
      receiptItems: structuredClone(draft.items),
      receiptMerchant: draft.merchant,
      receiptDate: draft.date,
      ...(draft.text !== undefined ? { receiptText: draft.text } : {}),
      attachment,
      category: groups.size === 1 ? [...groups.keys()][0] : "Várias categorias",
    };
    const splits = [...groups].map(([category, amount]) => ({
      category,
      amount: amount / 100,
    }));
    if (target) {
      Object.assign(target, fields);
      if (groups.size > 1) target.splits = splits;
      else delete target.splits;
      return target;
    }
    return F.add(d, {
      id: draft.transactionId || F.id(),
      description: draft.merchant,
      type: "expense",
      account,
      date,
      amount: draft.total,
      ...fields,
      ...(groups.size > 1 ? { splits } : {}),
    });
  }
  function validate(d) {
    if (d.receiptRules !== undefined) validateRules(d.receiptRules);
    for (const t of d.transactions) validateText(t.receiptText);
    for (const p of d.casa?.purchases || []) validateText(p.receiptText);
    for (const t of d.transactions)
      if (t.receiptItems !== undefined) {
        review(d, {
          merchant: t.receiptMerchant,
          date: t.receiptDate,
          total: t.amount,
          items: t.receiptItems,
        });
        const totals = rows => {
          const result = new Map();
          for (const row of rows) result.set(row.category, (result.get(row.category) || 0) + F.cents(row.amount));
          return JSON.stringify([...result].sort(([a],[b])=>a.localeCompare(b)));
        };
        if(totals(t.receiptItems)!==totals(t.splits || [{category:t.category,amount:t.amount}])) throw Error('As categorias têm de coincidir com os produtos da fatura. Esta versão mantém a classificação confirmada na leitura.');
      }
  }
  root.ReceiptFinance = { parse, inspect, category, review, apply, validate, nameKey, suggest, learningPreview, remember, updateRule, removeRule, searchText, validateText, replaceAttachment };
  if (typeof module !== "undefined") module.exports = root.ReceiptFinance;
})(globalThis);
