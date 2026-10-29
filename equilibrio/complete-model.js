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
  function candidateMatches(d, row) {
    const used = new Set(
      (d.statements || []).flatMap((s) =>
        (s.rows || [])
          .filter((r) => r.transactionId && ["linked", "added"].includes(r.status))
          .map((r) => String(r.transactionId)),
      ),
    );
    const rowEntity = entityText(row), rowDescription = String(row?.description || "").trim();
    return (d.transactions || [])
      .filter((t) =>
        !used.has(String(t.id)) &&
        t.account === row.account &&
        t.type === row.type &&
        F.cents(t.amount) === F.cents(row.amount) &&
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
  function safeCandidate(d, row) {
    const matches = candidateMatches(d, row), top = matches[0], next = matches[1];
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
    let linked = 0;
    for (const row of s.rows) {
      if (row.status !== "pending") continue;
      const match = safeCandidate(d, row.source);
      if (!match) continue;
      resolve(d, sid, row.id, "link", match.transaction.id);
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
      balance: -Math.abs(Number(params.balance)),
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
    const c = account(d, cardId),
      a = account(d, from);
    if (c.type !== "Cartão" || a.type === "Cartão")
      throw Error("Escolhe cartão e conta de pagamento.");
    value = amount(value);
    interest = Number(interest);
    if (!Number.isFinite(interest) || interest < 0)
      throw Error("Juros inválidos.");
    const plan = d.installmentPlans.find(
        (p) => p.id === planId && p.cardId === cardId,
      ),
      part = plan?.payments.find((p) => p.id === paymentId);
    if (paymentId && (!part || value > F.money(part.amount - part.paid)))
      throw Error("O pagamento excede a prestação.");
    if (value > F.money(-c.balance + interest)) throw Error("O pagamento excede o saldo em dívida.");
    if (interest)
      F.add(d, {
        id: F.id(),
        type: "expense",
        amount: interest,
        date,
        account: c.name,
        category: "Juros",
        description: "Juros do cartão",
      });
    if (value > -c.balance)
      throw Error("O pagamento excede o saldo em dívida.");
    const t = transfer(d, from, cardId, value, 0, date);
    if (part) {
      part.paid = F.money(part.paid + value);
      t.installmentPaymentId = part.id;
    }
    return t;
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
          !t.splits &&
          !d.closedMonths.includes(t.date.slice(0, 7)),
      )
      .flatMap((t) => {
        const r = rules.find((r) =>
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
    if (!copy.categoryCatalog.some((c) => c.name === to))
      copy.categoryCatalog.push({ id: F.id(), name: to });
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
    if (
      d.transactions.some(
        (t) =>
          d.closedMonths.includes(t.date.slice(0, 7)) &&
          (t.category === from || t.splits?.some((s) => s.category === from)),
      )
    )
      throw Error("Reabre os meses afetados antes de reorganizar a categoria.");
    for (const k of ["budgets", "envelopes"])
      if (
        d[k].some((x) => x.category === from) &&
        d[k].some((x) => x.category === to)
      )
        throw Error(
          "Já existem limites nas duas categorias. Consolida-os primeiro.",
        );
    for (const ref of categoryReferences(d)) if (ref.row[ref.field] === from) ref.row[ref.field] = to;
    for (const r of d.categoryCatalog) if (r.name === from) r.name = to;
    d.categoryArchive = d.categoryArchive.filter((c) => c.name !== from);
    d.categoryCatalog = d.categoryCatalog.filter(
      (c, i, all) => all.findIndex((x) => x.name === c.name) === i,
    );
  }

  function deleteCategory(d, name, replacement = "") {
    name = String(name || "").trim();
    if (!name || !categoryList(d).some((c) => c.name === name)) throw Error("Categoria inexistente.");
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
          c.replaces.some((n) => typeof n !== "string" || n.length > 80))
      )
        throw Error("Histórico de nomes de categoria inválido.");
      if (
        typeof c.name !== "string" ||
        !c.name.trim() ||
        c.name.length > 80 ||
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
      const due = F.dateAt(
        c.dueDay <= c.closingDay ? P.monthAdd(m, 1) : m,
        c.dueDay,
      );
      return {
        start,
        end,
        due,
        purchases,
        total: sum(purchases.map((t) => t.amount)),
      };
    },
    signature,
    candidateMatches,
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
