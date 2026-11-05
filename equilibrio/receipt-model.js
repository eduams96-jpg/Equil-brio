/* Comprovativos: validação de dados guardados, pesquisa de texto e troca de anexo.
 * A leitura de faturas (Ler fatura) foi retirada na 1.0.21. Os movimentos e as
 * compras Casa já preenchidos por essa leitura continuam válidos e pesquisáveis;
 * as antigas sugestões de artigos (receiptRules) são preservadas sem uso. */
(function (root) {
  const F =
    root.Finance ||
    (typeof require === "function" ? require("./finance.js") : null);
  const clean = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
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
  // Products saved on a movement by an earlier reading must stay coherent with
  // the movement's total and categories.
  function validateItems(t) {
    if (!t.receiptMerchant?.trim() || t.receiptMerchant.length > 200) throw Error("Confirma o nome da loja.");
    if (!F.validDate(t.receiptDate) || t.receiptDate > F.today()) throw Error("Confirma uma data válida, até hoje.");
    if (!Number.isFinite(t.amount) || t.amount <= 0) throw Error("Confirma o total da fatura.");
    const items = t.receiptItems;
    if (!Array.isArray(items) || !items.length || items.length > 200) throw Error("Indica entre 1 e 200 produtos.");
    for (const item of items)
      if (!item.name?.trim() || item.name.length > 200 ||
          (item.sourceName !== undefined && (typeof item.sourceName !== 'string' || item.sourceName.length > 200)) ||
          !item.category?.trim() || item.category.length > 80 ||
          !Number.isFinite(item.quantity) || item.quantity <= 0 ||
          !Number.isFinite(item.amount) || item.amount <= 0)
        throw Error("Confirma nome, quantidade, valor e categoria de cada produto.");
    if (items.reduce((n, i) => n + F.cents(i.amount), 0) !== F.cents(t.amount))
      throw Error("A soma dos produtos tem de coincidir com o total. Corrige também descontos e linhas não reconhecidas.");
    const totals = rows => {
      const result = new Map();
      for (const row of rows) result.set(row.category, (result.get(row.category) || 0) + F.cents(row.amount));
      return JSON.stringify([...result].sort(([a],[b])=>a.localeCompare(b)));
    };
    if (totals(items) !== totals(t.splits || [{category:t.category,amount:t.amount}])) throw Error('As categorias têm de coincidir com os produtos da fatura. Esta versão mantém a classificação confirmada na leitura.');
  }
  function validate(d) {
    if (d.receiptRules !== undefined) validateRules(d.receiptRules);
    for (const t of d.transactions) validateText(t.receiptText);
    for (const p of d.casa?.purchases || []) validateText(p.receiptText);
    for (const t of d.transactions) if (t.receiptItems !== undefined) validateItems(t);
  }
  root.ReceiptFinance = { validate, validateText, nameKey, searchText, replaceAttachment };
  if (typeof module !== "undefined") module.exports = root.ReceiptFinance;
})(globalThis);
