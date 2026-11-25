/* Complete local workflows. All mutations use the application's atomic draft save. */
(function (root) {
  "use strict";
  const F =
      root.Finance ||
      (typeof require !== "undefined" ? require("./finance.js") : null),
    P =
      root.FinancePlus ||
      (typeof require !== "undefined" ? require("./features-model.js") : null);
  const amount = (n) => {
      n = F.money(Number(n));
      if (!Number.isFinite(n) || n <= 0)
        throw Error("Indica um valor positivo.");
      return n;
    },
    sum = (xs) => F.money(xs.reduce((a, b) => a + b, 0));
  const account = (d, id) => {
    const a = d.accounts.find((a) => a.id === id);
    if (!a || a.archived) throw Error("Escolhe uma conta ativa.");
    return a;
  };
  const signature = (t) =>
    JSON.stringify([
      t.date,
      t.account,
      t.type,
      F.money(t.amount),
      t.description.trim().toLocaleLowerCase("pt-PT"),
    ]);
  const dayDistance = (a, b) =>
    Math.round(Math.abs(new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 86400000);
  const entityText = (t) => String(t?.beneficiary || t?.description || "").trim();
  const exactText = (a, b) => {
    const aa = F.importNormalize(a), bb = F.importNormalize(b);
    return !!aa && aa === bb;
  };
  // Índice dos movimentos por conta, tipo e valor, e dos já associados a extratos.
  // Construído uma vez por conferência; candidateMatches aceita-o para não repetir
  // o varrimento completo do livro por cada linha do extrato.
  function matchKey(account, type, amount) {
    const cents = F.cents(amount);
    return Number.isFinite(cents) ? String(account) + "\u0000" + String(type) + "\u0000" + cents : null;
  }
  function matchIndex(d) {
    const used = new Set(
      (d.statements || []).flatMap((s) =>
        (s.rows || [])
          .filter((r) => r.transactionId && ["linked", "added"].includes(r.status))
          .map((r) => String(r.transactionId)),
      ),
    ), byKey = new Map();
    for (const t of d.transactions || []) {
      const k = matchKey(t.account, t.type, t.amount);
      if (k === null) continue;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }
    return { used, byKey };
  }
  function candidateMatches(d, row, index = matchIndex(d)) {
    const used = index.used, k = matchKey(row?.account, row?.type, row?.amount);
    if (k === null) return [];
    const rowEntity = entityText(row), rowDescription = String(row?.description || "").trim();
    return (index.byKey.get(k) || [])
      .filter((t) =>
        !used.has(String(t.id)) &&
        dayDistance(t.date, row.date) <= 7,
      )
      .map((transaction) => {
        const distance = dayDistance(transaction.date, row.date);
        const transactionEntity = entityText(transaction);
        const descriptionExact = exactText(transaction.description, rowDescription);
        const entityExact = exactText(transactionEntity, rowEntity);
        const similarity = Math.max(
          F.importSimilarity(rowDescription, transaction.description),
          F.importSimilarity(rowEntity, transactionEntity),
        );
        let score = distance === 0 ? 34 : distance === 1 ? 28 : distance === 2 ? 21 : distance === 3 ? 15 : 7;
        const reasons = ["mesma conta", "mesmo valor"];
        if (distance === 0) reasons.push("mesma data");
        else reasons.push(`${distance} dia${distance === 1 ? "" : "s"} de diferença`);
        if (row.mmexId && transaction.mmexId && String(row.mmexId) === String(transaction.mmexId)) {
          score += 60; reasons.push("mesma referência histórica");
        }
        if (entityExact) { score += 36; reasons.push("beneficiário coincidente"); }
        else if (descriptionExact) { score += 32; reasons.push("descrição coincidente"); }
        else if (similarity >= 0.8) { score += 30; reasons.push("texto muito semelhante"); }
        else if (similarity >= 0.6) { score += 24; reasons.push("texto semelhante"); }
        else if (similarity >= 0.4) { score += 16; reasons.push("texto parcialmente semelhante"); }
        else if (similarity >= 0.2) { score += 7; reasons.push("alguma semelhança no texto"); }
        for (const key of ["recurringRuleId", "subscriptionId", "debtId", "pendingId"])
          if (row[key] && transaction[key] && String(row[key]) === String(transaction[key])) {
            score += 28; reasons.push("mesma origem planeada"); break;
          }
        const confidence =
          score >= 62 && distance <= 3 && (entityExact || descriptionExact || similarity >= 0.55 || (row.mmexId && transaction.mmexId && String(row.mmexId) === String(transaction.mmexId)))
            ? "high"
            : score >= 44
              ? "medium"
              : "low";
        return { transaction, score, confidence, distance, similarity, reason: reasons.join(" · ") };
      })
      .sort((a, b) => b.score - a.score || a.distance - b.distance || String(a.transaction.date).localeCompare(String(b.transaction.date)));
  }
  function safeCandidate(d, row, index, matches = candidateMatches(d, row, index)) {
    const top = matches[0], next = matches[1];
    if (!top || top.confidence !== "high") return null;
    if (next && next.score >= top.score - 9) return null;
    return top;
  }
  function candidates(d, row) {
    return candidateMatches(d, row).map((match) => match.transaction);
  }
  function linkSafeMatches(d, sid) {
    const s = d.statements.find((statement) => statement.id === sid);
    if (!s) throw Error("Conferência inexistente.");
    const index = matchIndex(d);
    let linked = 0;
    for (const row of s.rows) {
      if (row.status !== "pending") continue;
      const match = safeCandidate(d, row.source, index);
      if (!match) continue;
      resolve(d, sid, row.id, "link", match.transaction.id);
      index.used.add(String(match.transaction.id));
      linked++;
    }
    if (!linked) throw Error("Já não existem correspondências seguras por associar.");
    return linked;
  }
  function statement(d, rows, name) {
    if (!rows.length) throw Error("Não há linhas para conferir.");
    const fingerprint = JSON.stringify(rows.map(signature).sort());
    if (d.statements.some((s) => s.fingerprint === fingerprint))
      throw Error(
        "Este conjunto de linhas já foi preparado. Consulta a conferência existente.",
      );
    const s = {
      id: F.id(),
      name,
      date: F.today(),
      fingerprint,
      rows: rows.map((t) => ({
        id: F.id(),
        source: { ...t },
        status: "pending",
        transactionId: null,
      })),
    };
    d.statements.push(s);
    return s;
  }
  function resolve(d, sid, rid, mode, tid, allowDuplicate = false) {
    const s = d.statements.find((s) => s.id === sid),
      r = s?.rows.find((r) => r.id === rid);
    if (!r || r.status !== "pending")
      throw Error("Esta linha já foi resolvida.");
    if (mode === "link") {
      const t = d.transactions.find((t) => t.id === tid);
      if (
        !t ||
        t.account !== r.source.account ||
        t.type !== r.source.type ||
        t.amount !== r.source.amount
      )
        throw Error("A conta, o tipo e o valor devem coincidir.");
      if (d.statements.some((s) => s.rows.some((x) => x.transactionId === tid)))
        throw Error("Este movimento já está associado a uma linha.");
      r.transactionId = tid;
      r.status = "linked";
    } else if (mode === "add") {
      if (
        !allowDuplicate &&
        d.transactions.some((t) => signature(t) === signature(r.source))
      )
        throw Error(
          "Já existe um movimento igual. Associa-o em vez de o repetir.",
        );
      const t = F.add(d, { ...r.source, id: F.id(), statementId: s.id });
      r.transactionId = t.id;
      r.status = "added";
    } else if (mode === "ignore") r.status = "ignored";
    else throw Error("Ação inválida.");
  }
  function partial(d, id, value, date) {
    const p = d.pendingPayments.find((p) => p.id === id);
    if (!p) throw Error("Compromisso inexistente.");
    value = amount(value);
    if (value > p.amount)
      throw Error("O valor excede o montante por liquidar.");
    const t = F.add(d, {
      ...p,
      id: F.id(),
      date,
      amount: value,
      pendingId: p.id,
      description: p.description,
      originalDueDate: p.date,
      ...(p.reschedules ? { reschedules: structuredClone(p.reschedules) } : {}),
    });
    p.amount = F.money(p.amount - value);
    if (!p.amount)
      d.pendingPayments = d.pendingPayments.filter((x) => x.id !== id);
    return t;
  }
  function transfer(d, from, to, value, fee, date) {
    const a = account(d, from),
      b = account(d, to);
    if (a === b) throw Error("Escolhe contas diferentes.");
    value = amount(value);
    fee = Number(fee);
    if (!Number.isFinite(fee) || fee < 0 || !Number.isSafeInteger(F.cents(fee)) || (fee && F.money(fee) <= 0)) throw Error("Comissão inválida.");
    const t = F.add(d, {
      id: F.id(),
      type: "transfer",
      amount: value,
      date,
      account: a.name,
      targetAccount: b.name,
      description: "Transferência para " + b.name,
      category: "Transferência",
    });
    if (fee)
      F.add(d, {
        id: F.id(),
        type: "expense",
        amount: fee,
        date,
        account: a.name,
        description: "Comissão de transferência",
        category: "Comissões",
        transferFeeOf: t.id,
      });
    return t;
  }
  function card(d, params) {
    const a = {
      id: F.id(),
      name: params.name.trim(),
      type: "Cartão",
      balance: F.money(-Math.abs(Number(params.balance))) || 0,
      closingDay: +params.closingDay,
      dueDay: +params.dueDay,
    };
    if (
      !a.name ||
      d.accounts.some((x) => String(x.name || "").trim().toLocaleLowerCase("pt-PT") === a.name.toLocaleLowerCase("pt-PT")) ||
      !Number.isFinite(a.balance) ||
      ![a.closingDay, a.dueDay].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 31,
      )
    )
      throw Error("Verifica nome, saldo e dias do cartão.");
    d.accounts.push(a);
    return a;
  }
  function purchase(d, p) {
    const a = account(d, p.cardId);
    if (a.type !== "Cartão") throw Error("Escolhe um cartão.");
    const value = amount(p.amount),
      count = +p.count;
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 120 ||
      Math.round(value * 100) < count ||
      !F.validDate(p.firstDue)
    )
      throw Error("Prestações ou vencimento inválidos.");
    const t = F.add(d, {
      id: F.id(),
      type: "expense",
      date: p.date,
      amount: value,
      account: a.name,
      category: p.category || "Outros",
      description: p.description,
    });
    let remaining = Math.round(value * 100),
      base = Math.floor(remaining / count);
    const payments = Array.from({ length: count }, (_, i) => {
      const cents = i === count - 1 ? remaining : base;
      remaining -= cents;
      return {
        id: F.id(),
        date: F.dateAt(
          P.monthAdd(p.firstDue.slice(0, 7), i),
          +p.firstDue.slice(8),
        ),
        amount: cents / 100,
        paid: 0,
      };
    });
    const plan = {
      id: F.id(),
      transactionId: t.id,
      cardId: a.id,
      description: p.description,
      payments,
    };
    d.installmentPlans.push(plan);
    return plan;
  }
  function payCard(
    d,
    cardId,
    from,
    value,
    date,
    interest = 0,
    planId,
    paymentId,
  ) {
    const run = (target) => {
      const c = account(target, cardId),
        a = account(target, from);
      if (c.type !== "Cartão" || a.type === "Cartão")
        throw Error("Escolhe cartão e conta de pagamento.");
      const payValue = amount(value);
      const rawInterest = Number(interest);
      if (!Number.isFinite(rawInterest) || rawInterest < 0)
        throw Error("Juros inválidos.");
      const safeInterest = F.money(rawInterest) || 0;
      const plan = target.installmentPlans.find(
          (p) => String(p.id) === String(planId) && String(p.cardId) === String(cardId),
        ),
        part = plan?.payments.find((p) => String(p.id) === String(paymentId));
      if (paymentId && (!part || payValue > F.money(part.amount - part.paid)))
        throw Error("O pagamento excede a prestação.");
      if (payValue > F.money(-c.balance + safeInterest)) throw Error("O pagamento excede o saldo em dívida.");
      if (safeInterest)
        F.add(target, {
          id: F.id(),
          type: "expense",
          amount: safeInterest,
          date,
          account: c.name,
          category: "Juros",
          description: "Juros do cartão",
        });
      if (payValue > F.money(-c.balance))
        throw Error("O pagamento excede o saldo em dívida.");
      const t = transfer(target, from, cardId, payValue, 0, date);
      if (part) {
        part.paid = F.money(part.paid + payValue);
        t.installmentPaymentId = part.id;
      }
      return t;
    };
    run(structuredClone(d));
    return run(d);
  }
  function annual(d, year) {
    return Array.from({ length: 12 }, (_, i) => {
      const m = year + "-" + String(i + 1).padStart(2, "0");
      const plans = d.annualPlans.filter((p) => p.month === i + 1);
      return {
        month: m,
        planned: sum(plans.map((p) => p.amount)),
        actual: F.totals(d, m).expense,
        plans,
      };
    });
  }
  function rulesPreview(d) {
    const rules = d.rules
      .filter((r) => r.active !== false)
      .slice()
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    return d.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          !t.reconciled &&
          !t.debtId &&
          !t.receiptItems?.length &&
          !t.splits &&
          !d.closedMonths.includes(t.date.slice(0, 7)),
      )
      .flatMap((t) => {
        const r = rules.find((r) =>
          (!r.type || r.type === t.type) &&
          t.description
            .toLocaleLowerCase("pt-PT")
            .includes(r.match.toLocaleLowerCase("pt-PT")),
        );
        return r && r.category !== t.category
          ? [
              {
                id: t.id,
                description: t.description,
                before: t.category,
                after: r.category,
              },
            ]
          : [];
      });
  }
  // Referências atuais, incluindo módulos opcionais; não reescreve o histórico de auditoria.
  function categoryReferences(d, includeCasa = true) {
    const refs = [];
    const add = (row, field = "category") => { if (row && typeof row[field] === "string" && row[field]) refs.push({row, field}); };
    for (const list of ["transactions", "pendingImports", "budgets", "envelopes", "rules", "recurring", "pendingPayments", "annualPlans", "subscriptions", "receiptRules"])
      for (const row of d[list] || []) { add(row); for (const part of [...(row.splits || []), ...(row.receiptItems || [])]) add(part); }
    if (includeCasa) for (const row of d.casa?.catalog || []) { add(row); for (const field of Object.keys(row.storeCategories || {})) add(row.storeCategories, field); }
    if (includeCasa) for (const purchase of d.casa?.purchases || []) for (const item of purchase.items || []) add(item);
    for (const row of [...(d.practical?.rules || []), ...(d.practical?.corrections || []), ...(d.practical?.autonomy?.essentials || [])]) add(row);
    for (const statement of d.statements || []) for (const row of statement.rows || []) { add(row.source); for (const part of [...(row.source?.splits || []), ...(row.source?.receiptItems || [])]) add(part); }
    return refs;
  }
  function categoryList(d) {
    const names = new Set([
      "Alimentação",
      "Casa",
      "Transportes",
      "Lazer",
      "Saúde",
      "Subscrições",
      "Salário",
      "Outros",
      "Mercearia / Cerveja",
    ]);
    const deletedCategories = new Set(
      (d.categoryCatalog || []).filter((c) => c.deleted).map((c) => c.name),
    );
    for (const c of d.categoryCatalog || []) {
      for (const old of c.replaces || []) names.delete(old);
      if (c.deleted) names.delete(c.name);
    }
    for (const name of [
      ...(d.categoryCatalog || []).filter((c) => !c.deleted).map((c) => c.name),
      ...d.categoryArchive.map((c) => c.name),
    ])
      names.add(name);
    for (const key of [
      "transactions",
      "pendingImports",
      "budgets",
      "envelopes",
      "rules",
      "recurring",
      "pendingPayments",
      "annualPlans",
    ])
      for (const r of d[key]) {
        if (r.category) names.add(r.category);
        for (const s of [...(r.splits || []), ...(r.receiptItems || [])])
          if (s.category) names.add(s.category);
      }
    // As categorias dos produtos da Casa são do catálogo, não dos movimentos.
    for (const ref of categoryReferences(d, false)) names.add(ref.row[ref.field]);
    for (const name of [...names]) {
      const parts = F.categoryParts(name);
      for (let level = 1; level < parts.length; level++)
        names.add(F.categoryPath(parts.slice(0, level)));
    }
    for (const name of deletedCategories) names.delete(name);
    // Count every transaction once per ancestor, even when several splits
    // share that ancestor. Avoid rescanning the ledger for every category.
    const counts = new Map(), ancestors = new Map();
    for (const t of d.transactions) {
      const seen = new Set();
      for (const category of [t.category, ...(t.splits || []).map(s => s.category)]) {
        const token = String(category || '');
        let paths = ancestors.get(token);
        if (!paths) { const parts=F.categoryParts(token); paths=parts.map((_,i)=>F.categoryPath(parts.slice(0,i+1))); ancestors.set(token,paths); }
        for (const path of paths) seen.add(path);
      }
      for (const path of seen) counts.set(path,(counts.get(path)||0)+1);
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b, "pt-PT"))
      .map((name) => {
        const parts = F.categoryParts(name);
        return {
          name,
          parent: parts.length > 1 ? F.categoryPath(parts.slice(0, -1)) : "",
          level: Math.max(1, parts.length),
          archived: d.categoryArchive.some(
            (c) => name === c.name || name.startsWith(c.name + " / "),
          ),
          count: counts.get(F.categoryPath(name)) || 0,
        };
      });
  }
  function saveCategory(d, from, to) {
    to = String(to || "").trim();
    const toParts = F.categoryParts(to);
    if (
      !to ||
      to.length > 120 ||
      !toParts.length ||
      toParts.some((n) => !n.trim() || n.length > 80) ||
      toParts.length > 4
    )
      throw Error(
        "Usa até quatro níveis de categoria (Categoria / Subcategoria / Detalhe / Subdetalhe), até 120 caracteres no total.",
      );
    to = F.categoryPath(toParts);
    const list = categoryList(d),
      same = (n) => n.toLocaleLowerCase("pt-PT");
    if (to === from) return;
    if (list.some((c) => same(c.name) === same(to) && c.name !== from))
      throw Error(
        "Já existe esta categoria. Usa Renomear / fundir para juntar históricos.",
      );
    const copy = structuredClone(d);
    copy.categoryCatalog ||= [];
    if (from) {
      const affected = list.filter(
        (c) => c.name === from || c.name.startsWith(from + " / "),
      );
      if (!affected.length) throw Error("Categoria inexistente.");
      for (const c of affected) {
        const target = to + c.name.slice(from.length);
        if (target.length > 120 || F.categoryParts(target).length > 4)
          throw Error("A alteração faria uma categoria ultrapassar quatro níveis ou 120 caracteres.");
        if (
          list.some(
            (x) =>
              same(x.name) === same(target) &&
              !affected.some((y) => y.name === x.name),
          )
        )
          throw Error("O destino já tem uma subcategoria com esse nome.");
        mergeCategory(copy, c.name, target);
        let entry = copy.categoryCatalog.find((x) => x.name === target);
        if (!entry) {
          entry = { id: F.id(), name: target };
          copy.categoryCatalog.push(entry);
        }
        entry.replaces = [...new Set([...(entry.replaces || []), c.name])];
        if (c.archived && !copy.categoryArchive.some((x) => x.name === target))
          copy.categoryArchive.push({ id: F.id(), name: target });
      }
    }
    const existingTarget = copy.categoryCatalog.find((c) => c.name === to);
    if (existingTarget) delete existingTarget.deleted;
    else copy.categoryCatalog.push({ id: F.id(), name: to });
    F.normalize(copy);
    Object.assign(d, copy);
  }
  function archiveCategory(d, name, archived) {
    if (!categoryList(d).some((c) => c.name === name))
      throw Error("Categoria inexistente.");
    if (archived) {
      if (!d.categoryArchive.some((c) => c.name === name))
        d.categoryArchive.push({ id: F.id(), name });
    } else
      d.categoryArchive = d.categoryArchive.filter(
        (c) =>
          c.name !== name &&
          !c.name.startsWith(name + " / ") &&
          !name.startsWith(c.name + " / "),
      );
  }
  function mergeCategory(d, from, to) {
    from = from.trim();
    to = to.trim();
    if (!from || !to || from === to)
      throw Error("Indica duas categorias diferentes.");
    const sameKey = (s) => String(s || "").trim().toLocaleLowerCase("pt-PT");
    const fromKey = sameKey(from), toKey = sameKey(to);
    if (
      d.transactions.some(
        (t) =>
          d.closedMonths.includes(t.date.slice(0, 7)) &&
          (sameKey(t.category) === fromKey || t.splits?.some((s) => sameKey(s.category) === fromKey)),
      )
    )
      throw Error("Reabre os meses afetados antes de reorganizar a categoria.");
    for (const k of ["budgets", "envelopes"])
      if (
        fromKey !== toKey &&
        d[k].some((x) => sameKey(x.category) === fromKey) &&
        d[k].some((x) => sameKey(x.category) === toKey)
      )
        throw Error(
          "Já existem limites nas duas categorias. Consolida-os primeiro.",
        );
    for (const ref of categoryReferences(d)) if (sameKey(ref.row[ref.field]) === fromKey) ref.row[ref.field] = to;
    for (const r of d.categoryCatalog) {
      if (sameKey(r.name) === fromKey) r.name = to;
      if (sameKey(r.name) === toKey) delete r.deleted;
    }
    d.categoryArchive = d.categoryArchive.filter((c) => sameKey(c.name) !== fromKey);
    d.categoryCatalog = d.categoryCatalog.filter(
      (c, i, all) => all.findIndex((x) => sameKey(x.name) === sameKey(c.name)) === i,
    );
  }

  // Arrumar categorias: sugere pares repetidos (plural, acentos, maiúsculas,
  // a mesma subcategoria debaixo de categorias equivalentes) e move ramos
  // inteiros. Nunca apaga movimentos; só troca a categoria nas referências.
  function categoryKey(part) {
    let s = String(part || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-PT").replace(/[^a-z0-9]+/g, " ").trim();
    s = s.split(" ").map((w) => (w.length > 4 && /oes$/.test(w) ? w.slice(0, -3) + "ao" : w.length > 4 && /aes$/.test(w) ? w.slice(0, -3) + "ao" : w.length > 4 && /res$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w)).join(" ");
    return s;
  }
  function categoryUsage(d) {
    const own = new Map();
    for (const ref of categoryReferences(d)) {
      const name = F.categoryPath(ref.row[ref.field] || "");
      if (name) own.set(name, (own.get(name) || 0) + 1);
    }
    return own;
  }
  function categoryCleanupSuggestions(d) {
    const list = categoryList(d).filter((c) => !c.archived), own = categoryUsage(d);
    const subtree = (name) => [...own].filter(([n]) => n === name || n.startsWith(name + " / ")).reduce((s, [, v]) => s + v, 0);
    const info = list.map((c) => { const parts = F.categoryParts(c.name); return { name: c.name, parts, keys: parts.map(categoryKey), uses: subtree(c.name), own: own.get(c.name) || 0 }; });
    const pairs = new Map();
    const add = (a, b, strength, reason) => {
      if (a.name === b.name || a.name.startsWith(b.name + " / ") || b.name.startsWith(a.name + " / ")) return;
      // Destino: o mais usado; em empate, o caminho mais completo.
      const [from, to] = a.uses > b.uses || (a.uses === b.uses && (a.parts.length > b.parts.length || (a.parts.length === b.parts.length && a.name.localeCompare(b.name, "pt") < 0))) ? [b, a] : [a, b];
      const key = from.name + "\u0000" + to.name, old = pairs.get(key);
      if (!old || (old.strength === "possible" && strength === "strong")) pairs.set(key, { from: from.name, to: to.name, fromUses: from.uses, toUses: to.uses, strength, reason });
    };
    for (let i = 0; i < info.length; i++)
      for (let j = i + 1; j < info.length; j++) {
        const a = info[i], b = info[j], la = a.keys.length, lb = b.keys.length;
        const sameParent = la === lb && a.keys.slice(0, -1).join("/") === b.keys.slice(0, -1).join("/") && a.parts.slice(0, -1).join("/") === b.parts.slice(0, -1).join("/");
        if (sameParent && a.keys[la - 1] === b.keys[lb - 1]) add(a, b, "strong", "Mesmo nome com diferenças de plural, acentos ou maiúsculas");
        else if (la >= 2 && lb >= 2 && a.keys.slice(-2).join("/") === b.keys.slice(-2).join("/")) add(a, b, "strong", "A mesma subcategoria em dois sítios");
        else if (la >= 2 && lb >= 2 && a.keys[0] === b.keys[0] && a.keys[la - 1] === b.keys[lb - 1] && Math.abs(la - lb) === 1) add(a, b, "strong", "Subcategoria repetida dentro de «" + a.parts[0] + "»");
        else if (la >= 2 && lb >= 2 && a.keys[0] === b.keys[0] && a.keys[la - 1] === b.keys[lb - 1]) add(a, b, "possible", "Mesmo nome em ramos diferentes de «" + a.parts[0] + "» — confirma se é o mesmo");
      }
    // Um ramo mais curto já coberto por um par do ramo pai não precisa de aparecer.
    const all = [...pairs.values()];
    const covered = (p) => all.some((q) => q !== p && p.from.startsWith(q.from + " / ") && p.to === q.to + p.from.slice(q.from.length));
    return all.filter((p) => !covered(p)).sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1) || a.from.localeCompare(b.from, "pt"));
  }
  function moveCategoryTree(d, from, to) {
    from = F.categoryPath(from || ""); to = F.categoryPath(to || "");
    if (!from || !to || from === to) throw Error("Indica duas categorias diferentes.");
    if (to.startsWith(from + " / ")) throw Error("Não podes mover uma categoria para dentro dela própria.");
    const names = categoryList(d).map((c) => c.name).filter((n) => n === from || n.startsWith(from + " / ")).sort((a, b) => b.length - a.length);
    if (!names.length) throw Error("Categoria inexistente: " + from);
    let moved = 0;
    for (const name of names) {
      const target = to + name.slice(from.length);
      if (F.categoryParts(target).length > 4 || target.length > 120) throw Error("«" + target + "» ultrapassaria quatro níveis ou 120 caracteres.");
      mergeCategory(d, name, target);
      d.categoryCatalog = (d.categoryCatalog || []).filter((c) => !(c.deleted && c.name === target));
      // Marca a origem como substituída para que as categorias de base não voltem a aparecer.
      let entry = d.categoryCatalog.find((c) => c.name === target);
      if (!entry) { entry = { id: F.id(), name: target }; d.categoryCatalog.push(entry); }
      entry.replaces = [...new Set([...(entry.replaces || []), name])];
      moved++;
    }
    return moved;
  }
  function cleanupCategories(d, moves) {
    if (!Array.isArray(moves) || !moves.length) throw Error("Escolhe pelo menos uma alteração.");
    const copy = structuredClone(d);
    let done = 0;
    for (const m of moves) {
      const from = F.categoryPath(m.from || ""), to = F.categoryPath(m.to || "");
      if (!from || from === to) continue;
      if (!categoryList(copy).some((c) => c.name === from)) continue; // já foi movida com o ramo pai
      done += moveCategoryTree(copy, from, to);
    }
    F.normalize(copy);
    Object.assign(d, copy);
    return done;
  }

  // Correções sugeridas pela análise dos dados de 12/11/2026. Reconhecidas pelo conteúdo
  // (nunca por identificadores), só aparecem quando ainda se aplicam e nada é apagado.
  const CORRECTION_MOVES = [
    ["Subscrições", "Lazer / Subscrições", "Netflix, Spotify e ChatGPT estavam em duas categorias"],
    ["Mercearia", "Alimentação / Mercearias", "Categoria solta fora de Alimentação"],
    ["Saúde", "Cuidados de Saúde", "Taxas moderadoras fora de Cuidados de Saúde"],
    ["Outros Despesas", "Outras Despesas", "Corrige o nome"],
    ["Bebidas / Espirituosa / Licor Beirão", "Bebidas / Espirituosa", "Subcategoria com um só movimento"],
    ["Alimentação / Carne / Pizza", "Alimentação / Mercearias / Pizza", "Pizza não é carne"],
    ["Alimentação / Carne / Bifanas", "Alimentação / Carne", "Subcategoria com um só movimento"],
    ["Alimentação / Frutas e Legumes / Frutas / Bananas", "Alimentação / Frutas e Legumes / Frutas", "Subcategoria com um só movimento"],
    ["Casa / Produtos / Cozinha / Isqueiro", "Casa / Produtos / Cozinha", "Subcategoria com um só movimento"],
    ["Casa / Produtos / Dispensa / Lanterna", "Casa / Produtos / Dispensa", "Subcategoria com um só movimento"],
    ["Casa / Produtos / Dispensa", "Casa / Produtos / Despensa", "Corrige «Dispensa» para «Despensa»"],
    ["Casa / Produtos / Sala / Suporte TV", "Casa / Produtos / Sala", "Subcategoria com um só movimento"],
    ["Contas / TV", "Contas / Internet", "Os dois movimentos são da fatura de telemóvel e internet"],
  ];
  const SUPERMARKETS = /^(lidl|pingo doce|continente|intermarch[eé]|mercadona|auchan|maiskoportuno|minipre[cç]o|aldi)$/i;
  function correctionTargets(d) {
    const tx = d.transactions || [], closed = new Set(d.closedMonths || []), names = new Set([...categoryUsage(d)].filter(([, n]) => n > 0).map(([name]) => name)), out = [];
    const canMutateTx = (t) => !t.reconciled && !t.debtId && !t.receiptItems?.length && !closed.has(String(t.date || "").slice(0, 7));
    for (const [from, to, why] of CORRECTION_MOVES)
      if (names.has(from) || [...names].some((n) => n.startsWith(from + " / ")))
        out.push({ id: "move:" + from, group: "Categorias", label: from + " → " + to, detail: why, run: (c) => moveCategoryTree(c, from, to) });
    const iuc = (d.recurring || []).filter((r) => /^Impostos \/ IUC/.test(r.category || "") && r.frequency === "monthly");
    if (iuc.length) out.push({ id: "recurring:iuc", group: "Recorrências", label: "IUC passa de mensal a anual (" + iuc.map((r) => r.description).join(", ") + ")", detail: "Como mensal somava " + F.money(iuc.reduce((n, r) => n + r.amount, 0)) + " € por mês às previsões", run: (c) => { for (const r of c.recurring) if (/^Impostos \/ IUC/.test(r.category || "") && r.frequency === "monthly") r.frequency = "yearly"; } });
    const isWater = (t) => canMutateTx(t) && /^contas?: água$/i.test((t.description || "").trim()) && t.category !== "Contas / Água" && !t.splits?.length;
    const water = tx.filter(isWater);
    if (water.length) out.push({ id: "tx:water", group: "Movimentos", label: water.length + " conta(s) da água fora de Contas / Água", detail: water.map((t) => t.date + " em " + t.category).join("; "), run: (c) => { for (const t of c.transactions) if (isWater(t)) t.category = "Contas / Água"; } });
    const isSale = (t) => canMutateTx(t) && t.type === "income" && /^Lazer \//.test(t.category || "") && !t.splits?.length;
    const sale = tx.filter(isSale);
    if (sale.length) out.push({ id: "tx:sales", group: "Movimentos", label: sale.length + " receita(s) de vendas em Lazer → Receita / Vendas", detail: sale.map((t) => t.date + " " + t.description).join("; "), run: (c) => { for (const t of c.transactions) if (isSale(t)) t.category = "Receita / Vendas"; } });
    const isTrip = (t) => canMutateTx(t) && t.type === "expense" && !t.splits?.length && SUPERMARKETS.test((t.description || "").trim()) && /^(Alimentação|Bebidas|Mercearia)( \/|$)/.test(t.category || "") && t.category !== "Alimentação / Supermercado" && Math.abs(t.amount) >= 20;
    const trips = tx.filter(isTrip);
    if (trips.length) out.push({ id: "tx:supermarket", group: "Movimentos", label: trips.length + " ida(s) ao supermercado (≥ 20 €) sem divisão por artigos → Alimentação / Supermercado", detail: "Estavam com a categoria de um só artigo (ex.: " + trips.slice(0, 3).map((t) => t.description + " " + F.money(Math.abs(t.amount)) + " € em " + t.category).join("; ") + "). A categoria antiga fica na nota de cada movimento.", run: (c) => { for (const t of c.transactions) if (isTrip(t)) { t.note = ((t.note ? t.note + " · " : "") + "Antes: " + t.category).slice(0, 1000); t.category = "Alimentação / Supermercado"; } } });
    return out;
  }
  function suggestedCorrections(d) {
    const dismissed = new Set((d.correctionsDismissed || []).map(value=>value?.id ?? value));
    return correctionTargets(d).filter((x) => !dismissed.has(x.id)).map(({ run, ...rest }) => rest);
  }
  // Descarta sugestões pendentes sem mexer em movimentos, categorias ou recorrências.
  function dismissCorrections(d, ids) {
    if (!Array.isArray(ids) || !ids.length) throw Error("Escolhe pelo menos uma correção.");
    const known = new Set(correctionTargets(d).map((x) => x.id));
    const add = ids.filter((id) => known.has(id));
    const previous = d.correctionsDismissed || [];
    const dismissed = new Set(previous.map(value=>value?.id ?? value));
    d.correctionsDismissed = [...previous, ...[...new Set(add)].filter(id=>!dismissed.has(id)).map(id=>({id}))];
    return add.length;
  }
  function applyCorrections(d, ids) {
    if (!Array.isArray(ids) || !ids.length) throw Error("Escolhe pelo menos uma correção.");
    const copy = structuredClone(d);
    let done = 0;
    for (const id of ids) {
      const item = correctionTargets(copy).find((x) => x.id === id);
      if (!item) continue;
      item.run(copy);
      done++;
    }
    F.normalize(copy);
    Object.assign(d, copy);
    return done;
  }

  function deleteCategory(d, name, replacement = "") {
    name = String(name || "").trim();
    const list = categoryList(d);
    if (!name || !list.some((c) => c.name === name)) throw Error("Categoria inexistente.");
    if (list.some((c) => c.name.startsWith(name + " / ")))
      throw Error("Existem subcategorias associadas. Move ou elimina primeiro as subcategorias.");
    const usedIn = [];
    for (const ref of categoryReferences(d)) if (ref.row[ref.field] === name) usedIn.push(ref);
    if (usedIn.length) {
      replacement = String(replacement || "").trim();
      if (!replacement || replacement === name) throw Error("Esta categoria está em uso. Escolhe outra categoria para transferir as referências antes de eliminar.");
      if (!categoryList(d).some(c => c.name === replacement)) throw Error("A categoria de destino não existe.");
      mergeCategory(d, name, replacement);
    }
    d.categoryCatalog = (d.categoryCatalog || []).filter(c => c.name !== name && !(c.replaces || []).includes(name));
    d.categoryArchive = (d.categoryArchive || []).filter(c => c.name !== name);
    // As categorias base são reconstruídas por categoryList(). Guardamos um marcador
    // persistente para que uma categoria eliminada sem utilização não reapareça no reload.
    if (!usedIn.length) d.categoryCatalog.push({ id: F.id(), name, deleted: true });
    return { transferred: usedIn.length > 0, references: usedIn.length };
  }
  function estimatedForecast(
    d,
    days = 90,
    start = F.today(),
    useHistory = true,
  ) {
    // Only proposed payments change. Keep the input untouched without cloning
    // the entire ledger and attachments. Aggregate expense history once.
    const draft = { ...d, pendingPayments: [...d.pendingPayments] };
    const variableByMonth = new Map();
    for (const t of F.expenseEntries(d)) if (t.expenseNature !== 'fixed' && !t.recurringRuleId && !t.subscriptionId && !t.debtId) {
      const m=t.date.slice(0,7);variableByMonth.set(m,(variableByMonth.get(m)||0)+F.cents(t.amount));
    }
    const variableTotal = m => (variableByMonth.get(m)||0)/100;
    const history = [];
    for (let n = 1; n <= 12 && history.length < 3; n += 1) {
      const m = P.monthAdd(start.slice(0, 7), -n), total = variableTotal(m);
      if (total > 0) history.push({ month: m, total });
    }
    const currentMonth = start.slice(0, 7), currentSpent = variableTotal(currentMonth);
    const daysInMonth = new Date(+currentMonth.slice(0, 4), +currentMonth.slice(5, 7), 0).getDate();
    const elapsedDays = Math.max(1, Math.min(daysInMonth, +start.slice(8, 10) || 1));
    const currentPace = currentSpent > 0 ? F.money((currentSpent / elapsedDays) * daysInMonth) : 0;
    let samples = history.map((x) => x.total), basis = "";
    if (samples.length >= 2) {
      basis = `média de ${samples.length} meses anteriores com despesas variáveis registadas`;
    } else if (samples.length === 1 && currentPace > 0) {
      samples = [samples[0], currentPace];
      basis = "um mês anterior com dados + ritmo observado no mês atual";
    } else if (samples.length === 1) {
      basis = "último mês anterior com despesas variáveis registadas";
    } else if (currentPace > 0) {
      samples = [currentPace];
      basis = `ritmo do mês atual (${elapsedDays} de ${daysInMonth} dias)`;
    } else {
      samples = [0];
      basis = "sem histórico de despesas variáveis suficiente";
    }
    const avg = samples.length ? sum(samples) / samples.length : 0;
    const daily = Math.max(0, avg / 30.4375);
    if (useHistory && daily > 0)
      for (let n = 1; n <= days; n++)
        draft.pendingPayments.push({
          id: "estimate-" + n,
          date: P.dayAdd(start, n),
          amount: F.money(daily),
          type: "expense",
          description: "Despesa variável estimada",
          estimated: true,
        });
    const result = P.forecast(draft, days, start), baseline = P.forecast(d, days, start);
    return {
      ...result,
      monthlyEstimate: F.money(avg),
      baseline,
      currentVariableSpent: F.money(currentSpent),
      currentPace: F.money(currentPace),
      historyMonths: history,
      estimateBasis: basis,
      estimateImpact: F.money(result.end - baseline.end),
      assumption:
        `Estimativa baseada em ${basis}. Só projeta despesa variável futura; os compromissos conhecidos continuam a ser calculados separadamente.`,
    };
  }
  function validate(d) {
    const catalogNames = new Set();
    for (const c of d.categoryCatalog || []) {
      if (
        c.replaces !== undefined &&
        (!Array.isArray(c.replaces) ||
          c.replaces.some((n) => typeof n !== "string" || n.length > 120))
      )
        throw Error("Histórico de nomes de categoria inválido.");
      if (
        typeof c.name !== "string" ||
        !c.name.trim() ||
        c.name.length > 120 ||
        catalogNames.has(c.name.toLocaleLowerCase("pt-PT"))
      )
        throw Error("Lista de categorias inválida ou repetida.");
      catalogNames.add(c.name.toLocaleLowerCase("pt-PT"));
    }
    for (const t of d.transactions) {
      if (
        t.beneficiary !== undefined &&
        (typeof t.beneficiary !== "string" || t.beneficiary.length > 160)
      )
        throw Error("Beneficiário inválido.");
      if (
        t.noteColor !== undefined &&
        !["default", "blue", "green", "purple", "orange", "red"].includes(
          t.noteColor,
        )
      )
        throw Error("Cor da nota inválida.");
    }
    for (const r of d.monthReviews)
      if (
        !F.validDate(r.month + "-01") ||
        !F.validDate(r.date) ||
        r.completed !== true
      )
        throw Error("Revisão mensal inválida.");
    for (const s of d.scenarios)
      if (
        typeof s.name !== "string" ||
        !Number.isFinite(s.amount) ||
        s.amount <= 0 ||
        !F.validDate(s.date) ||
        !["expense", "income"].includes(s.type) ||
        !["once", "monthly"].includes(s.repeat)
      )
        throw Error("Cenário inválido.");
    for (const v of d.savedViews)
      if (
        typeof v.name !== "string" ||
        !v.filters ||
        typeof v.filters !== "object" ||
        Array.isArray(v.filters)
      )
        throw Error("Pesquisa guardada inválida.");
    for (const c of d.categoryArchive)
      if (typeof c.name !== "string")
        throw Error("Categoria arquivada inválida.");
    for (const a of d.accounts)
      if (a.type === "Cartão") {
        a.closingDay ??= 20;
        a.dueDay ??= 5;
        if (
          ![a.closingDay, a.dueDay].every(
            (n) => Number.isInteger(n) && n >= 1 && n <= 31,
          )
        )
          throw Error("Dias de faturação do cartão inválidos.");
      }
    for (const s of d.statements) {
      if (
        !Array.isArray(s.rows) ||
        typeof s.name !== "string" ||
        typeof s.fingerprint !== "string"
      )
        throw Error("Conferência inválida.");
      for (const r of s.rows)
        if (
          !["pending", "added", "linked", "ignored"].includes(r.status) ||
          !F.validDate(r.source?.date) ||
          !Number.isFinite(r.source?.amount)
        )
          throw Error("Linha de extrato inválida.");
    }
    for (const p of d.annualPlans)
      if (
        typeof p.name !== "string" ||
        !Number.isInteger(p.month) ||
        p.month < 1 ||
        p.month > 12 ||
        !Number.isFinite(p.amount) ||
        p.amount <= 0
      )
        throw Error("Plano anual inválido.");
    for (const p of d.installmentPlans)
      if (
        !Array.isArray(p.payments) ||
        p.payments.some(
          (x) =>
            !F.validDate(x.date) ||
            !Number.isFinite(x.amount) ||
            x.amount < 0 ||
            !Number.isFinite(x.paid) ||
            x.paid < 0 ||
            x.paid > x.amount,
        )
      )
        throw Error("Plano de prestações inválido.");
    for (const t of d.transactions)
      for (const k of ["purchaseDate", "postedDate", "dueDate"])
        if (t[k] && !F.validDate(t[k]))
          throw Error("Data do movimento inválida.");
    return d;
  }
  const api = {
    undoStatement(d, id) {
      const s = d.statements.find((s) => s.id === id);
      if (!s) throw Error("Conferência inexistente.");
      for (const r of s.rows.slice())
        if (r.status === "added" && r.transactionId)
          F.remove(d, r.transactionId);
      for (const r of s.rows) {
        r.status = "pending";
        r.transactionId = null;
      }
    },
    cardCycle(d, cardId, m) {
      const c = account(d, cardId),
        end = F.dateAt(m, c.closingDay),
        start = P.dayAdd(F.dateAt(P.monthAdd(m, -1), c.closingDay), 1);
      const purchases = d.transactions.filter(
        (t) =>
          t.account === c.name &&
          t.date >= start &&
          t.date <= end &&
          t.type === "expense",
      );
      const refunds = d.transactions.filter(
        (t) =>
          t.account === c.name &&
          t.date >= start &&
          t.date <= end &&
          t.type === "income" &&
          t.refundOf,
      );
      const due = F.dateAt(
        c.dueDay <= c.closingDay ? P.monthAdd(m, 1) : m,
        c.dueDay,
      );
      return {
        start,
        end,
        due,
        purchases,
        refunds,
        total: F.money(sum(purchases.map((t) => t.amount)) - sum(refunds.map((t) => t.amount))),
      };
    },
    signature,
    candidateMatches,
    matchIndex,
    safeCandidate,
    candidates,
    linkSafeMatches,
    statement,
    resolve,
    partial,
    transfer,
    card,
    purchase,
    payCard,
    annual,
    rulesPreview,
    categoryCleanupSuggestions,
    suggestedCorrections,
    applyCorrections,
    dismissCorrections,
    cleanupCategories,
    moveCategoryTree,
    mergeCategory,
    categoryList,
    saveCategory,
    archiveCategory,
    deleteCategory,
    estimatedForecast,
    validate,
  };
  root.CompleteFinance = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
