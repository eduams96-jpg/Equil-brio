/* Household modules: explicit records, no remote services or inferred postings. */
(function (root) {
  "use strict";
  const F =
      root.Finance ||
      (typeof require !== "undefined" ? require("./finance.js") : null),
    P =
      root.FinancePlus ||
      (typeof require !== "undefined" ? require("./features-model.js") : null);
  const sum = (xs) => F.money(xs.reduce((a, b) => a + b, 0)),
    nonnegative = (n) => Number.isFinite(n) && n >= 0,
    text = (s) => typeof s === "string" && !!s.trim(),
    date = (s) => F.validDate(s),
    requireDate = (s) => {
      if (!date(s) || s > F.today())
        throw Error("Escolhe uma data válida até hoje.");
    },
    clone = (x) => structuredClone(x);
  function assetValue(a, at = F.today()) {
    return (
      a.valuations
        .filter((v) => v.date <= at)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.value || 0
    );
  }
  function assetTotal(d, at = F.today()) {
    return sum(d.assets.map((a) => assetValue(a, at)));
  }
  function valuation(d, id, when, value) {
    requireDate(when);
    if (!nonnegative(value)) throw Error("Avaliação inválida.");
    const a = d.assets.find((a) => a.id === id);
    if (!a) throw Error("Bem inexistente.");
    a.valuations = a.valuations.filter((v) => v.date !== when);
    a.valuations.push({ date: when, value: F.money(value) });
  }
  function received(d, id) {
    return sum(
      d.transactions
        .filter((t) => t.sharedExpenseId === id)
        .map((t) => t.amount),
    );
  }
  function sharedOutstanding(d) {
    return sum(d.sharedExpenses.map((s) => s.amount - received(d, s.id)));
  }
  function totalRefundedFor(d, transactionId, excludeSharedId) {
    const shared = sum(
      (d.sharedExpenses || [])
        .filter((s) => String(s.transactionId) === String(transactionId) && String(s.id) !== String(excludeSharedId))
        .map((s) => s.amount),
    );
    const directRefunds = sum(
      (d.transactions || [])
        .filter((t) => t.type === "income" && String(t.refundOf || "") === String(transactionId) && !t.sharedExpenseId)
        .map((t) => t.amount),
    );
    return F.money(shared + directRefunds);
  }
  function share(d, transactionId, person, amount, id) {
    const original = d.transactions.find(
      (t) => String(t.id) === String(transactionId) && t.type === "expense" && !t.debtId,
    );
    if (!original || !text(person) || !Number.isFinite(amount) || amount <= 0)
      throw Error("Escolhe uma despesa, uma pessoa e um valor positivo.");
    if (d.closedMonths.includes(original.date.slice(0, 7)))
      throw Error("Reabre o mês antes de alterar a partilha.");
    if (F.money(totalRefundedFor(d, transactionId, id) + amount) > original.amount)
      throw Error("As partes a receber excedem o valor da compra.");
    if (id && received(d, id) > amount)
      throw Error("O valor não pode ser inferior ao que já recebeste.");
    const record = {
      id: id || F.id(),
      transactionId: original.id,
      person: person.trim(),
      amount: F.money(amount),
    };
    if (id) {
      const index = d.sharedExpenses.findIndex((s) => String(s.id) === String(id));
      if (index < 0) throw Error("Partilha inexistente.");
      d.sharedExpenses[index] = record;
    } else d.sharedExpenses.push(record);
    return record;
  }
  function receiveShare(d, id, amount, account, when) {
    const s = d.sharedExpenses.find((s) => String(s.id) === String(id));
    if (
      !s ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > F.money(s.amount - received(d, id))
    )
      throw Error("O recebimento excede o valor por receber.");
    const original = d.transactions.find((t) => String(t.id) === String(s.transactionId));
    if (original) {
      const alreadyRefunded = sum(
        (d.transactions || [])
          .filter((t) => t.type === "income" && String(t.refundOf || "") === String(original.id))
          .map((t) => t.amount),
      );
      if (F.money(alreadyRefunded + amount) > original.amount)
        throw Error("Os reembolsos excedem o valor da despesa original.");
    }
    requireDate(when);
    return F.add(d, {
      id: F.id(),
      type: "income",
      amount,
      date: when,
      account,
      description: "Reembolso de " + s.person,
      category: "Partilhas",
      refundOf: s.transactionId,
      sharedExpenseId: id,
    });
  }
  function subscription(d, p, id) {
    const current = d.subscriptions.find((s) => s.id === id);
    const entry = {
      ...(current ? clone(current) : {}),
      id: id || F.id(),
      name: p.name.trim(),
      amount: Number(p.amount),
      frequency: p.frequency,
      nextDate: p.nextDate,
      status: p.status,
      trialEnd: p.trialEnd || "",
      reminderDays: Number(p.reminderDays),
      account: p.account || current?.account || d.accounts.find((a) => !a.archived)?.name || "",
      category: p.category || current?.category || "Subscrições",
      prices: current?.prices ? clone(current.prices) : [],
    };
    if (!current || entry.nextDate !== current.nextDate) entry.renewalDay = +entry.nextDate.slice(8);
    else entry.renewalDay ??= +entry.nextDate.slice(8);
    if (
      !text(entry.name) ||
      !nonnegative(entry.amount) ||
      !["monthly", "yearly"].includes(entry.frequency) ||
      !date(entry.nextDate) ||
      !["active", "trial", "cancelled"].includes(entry.status) ||
      !Number.isInteger(entry.reminderDays) ||
      entry.reminderDays < 0 ||
      entry.reminderDays > 90 ||
      (entry.trialEnd && !date(entry.trialEnd))
    )
      throw Error("Verifica valor, datas e estado da subscrição.");
    if (!current || current.amount !== entry.amount)
      entry.prices.push({ date: F.today(), amount: entry.amount });
    if (current) d.subscriptions[d.subscriptions.indexOf(current)] = entry;
    else d.subscriptions.push(entry);
    return entry;
  }
  function renew(d, id) {
    const s = d.subscriptions.find((s) => s.id === id);
    if (!s || s.status === "cancelled")
      throw Error("Esta subscrição está cancelada.");
    const old = s.nextDate;
    s.nextDate = F.dateAt(
      P.monthAdd(old.slice(0, 7), s.frequency === "yearly" ? 12 : 1),
      s.renewalDay || +old.slice(8),
    );
    s.renewalDay ??= +old.slice(8);
    s.status = "active";
    return s;
  }
  function advanceSubscriptionPast(d, id, occurrenceDate) {
    const s = d.subscriptions.find((item) => String(item.id) === String(id));
    if (!s || s.status === "cancelled" || !date(occurrenceDate) || !date(s.nextDate) || s.nextDate > occurrenceDate) return s;
    const startMonth = s.nextDate.slice(0, 7);
    const targetMonth = occurrenceDate.slice(0, 7);
    const startIndex = +startMonth.slice(0, 4) * 12 + (+startMonth.slice(5) - 1);
    const targetIndex = +targetMonth.slice(0, 4) * 12 + (+targetMonth.slice(5) - 1);
    const step = s.frequency === "yearly" ? 12 : 1;
    const renewalDay = s.renewalDay || +s.nextDate.slice(8);
    let jumps = Math.max(1, Math.floor((targetIndex - startIndex) / step));
    let candidate = F.dateAt(P.monthAdd(startMonth, jumps * step), renewalDay);
    if (candidate <= occurrenceDate) {
      jumps += 1;
      candidate = F.dateAt(P.monthAdd(startMonth, jumps * step), renewalDay);
    }
    s.renewalDay ??= renewalDay;
    s.nextDate = candidate;
    s.status = "active";
    return s;
  }
  function reminders(d, at = F.today()) {
    return d.subscriptions
      .filter((s) => s.status !== "cancelled")
      .flatMap((s) => {
        const dates = [{ date: s.nextDate, label: "Renovação" }];
        if (s.status === "trial" && s.trialEnd)
          dates.push({
            date: s.trialEnd,
            label: "Fim do período experimental",
          });
        return dates
          .filter((x) => x.date <= P.dayAdd(at, s.reminderDays))
          .map((x) => ({
            ...x,
            id: s.id,
            name: s.name,
            overdue: x.date < at,
            amount: s.amount,
          }));
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function quality(d, month, at = F.today()) {
    const issues = [];
    for (const a of d.accounts.filter((a) => !a.archived)) {
      if (!a.reconciledOn)
        issues.push({
          kind: "account",
          id: a.id,
          title: a.name + " sem saldo confirmado",
          route: "accounts",
        });
      else if (a.reconciledOn < P.dayAdd(at, -30))
        issues.push({
          kind: "account",
          id: a.id,
          title: a.name + ": confirmação com mais de 30 dias",
          route: "accounts",
        });
    }
    const unc = d.transactions.filter(
      (t) =>
        t.date.startsWith(month) &&
        t.type === "expense" &&
        !t.splits &&
        (!t.category || ["Outros", "Por categorizar"].includes(t.category)),
    );
    if (unc.length)
      issues.push({
        kind: "category",
        title: unc.length + " despesas com categoria genérica",
        route: "transactions",
      });
    const absent = [];
    for (let n = 1; n <= 12; n++) {
      const m = month.slice(0, 4) + "-" + String(n).padStart(2, "0");
      if (m > at.slice(0, 7)) break;
      if (!d.transactions.some((t) => t.date.startsWith(m))) absent.push(m);
    }
    if (absent.length)
      issues.push({
        kind: "history",
        title: absent.length + " meses sem movimentos neste ano",
        detail: absent.join(", "),
        route: "transactions",
      });
    if (!d.closedMonths.includes(month))
      issues.push({
        kind: "review",
        title: "O mês selecionado ainda não foi fechado",
        route: "reports",
      });
    const pendingReview =
      d.statements.reduce(
        (n, s) => n + s.rows.filter((r) => r.status === "pending").length,
        0,
      ) + d.pendingImports.length;
    // Linhas ainda por rever pertencem à Caixa de entrada: por si só não são
    // defeitos de qualidade. Só contam aqui quando falta um valor obrigatório.
    const invalidAmount = (row) =>
      !row || row.amount === "" || row.amount === null || row.amount === undefined || !Number.isFinite(Number(row.amount));
    const missingValues =
      d.pendingImports.filter((row) => invalidAmount(row)).length +
      d.statements.reduce(
        (n, statement) =>
          n + statement.rows.filter((row) => row.status === "pending" && invalidAmount(row.source)).length,
        0,
      );
    if (missingValues)
      issues.push({
        kind: "value",
        count: missingValues,
        title: missingValues + " valores obrigatórios em falta",
        detail: "Existem linhas importadas ainda por rever sem um valor numérico válido.",
        route: "review",
      });
    return {
      issues,
      absent,
      pendingReview,
      missingValues,
      transactions: d.transactions.filter((t) => t.date.startsWith(month))
        .length,
      confirmedAccounts: d.accounts.filter(
        (a) => !a.archived && a.reconciledOn >= P.dayAdd(at, -30),
      ).length,
      totalAccounts: d.accounts.filter((a) => !a.archived).length,
    };
  }
  function search(d, query) {
    const fold = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const q = fold(query).trim();
    if (q.length < 2) return [];
    const groups = new Map();
    const add = (kind, id, label, detail, route, indexed = "") => {
      if (!fold(label + " " + detail + " " + indexed).includes(q)) return;
      if (!groups.has(kind)) groups.set(kind, []);
      const group = groups.get(kind);
      // Uma lista longa de movimentos não esconde contas, planos ou documentos.
      if (group.length < 100) group.push({ kind, id, label, detail, route });
    };
    for (const t of (d.transactions || []).slice().sort((a, b) => b.date.localeCompare(a.date))) {
      const receiptIndex = root.ReceiptFinance?.searchText(t) ||
        [t.receiptText || "", ...(t.receiptItems || []).map(i => [i.name, i.sourceName, i.category].join(" "))].join(" ");
      const detail = [t.date, t.account, t.category, t.note, t.beneficiary].filter(Boolean).join(" ");
      const splits = (t.splits || []).map(i => [i.category, i.note].join(" ")).join(" ");
      add("Movimento", t.id, t.description, detail, "transactions", receiptIndex + " " + splits);
      if (t.attachment) add("Comprovativo", t.id, t.attachment.name,
        [t.documentEntity || t.description, t.date].join(" "), "documentsHub", receiptIndex);
    }
    for (const [list, kind, route] of [
      ["accounts", "Conta", "accounts"], ["debts", "Crédito", "debts"],
      ["goals", "Objetivo", "goals"], ["reserves", "Reserva", "planningPlus"],
      ["budgets", "Orçamento", "budgets"],
      ["subscriptions", "Subscrição", "subscriptionsHub"],
      ["assets", "Bem", "assetsHub"], ["investments", "Investimento", "investmentsHub"],
    ]) for (const item of d[list] || []) add(kind, item.id, item.name || item.category, item.type || "", route);
    for (const p of d.casa?.purchases || []) add("Compra Casa", p.id, p.store,
      p.date, "casaPurchases", [p.receiptText || "", ...p.items.map(i => [i.name, i.sourceName, i.category].join(" "))].join(" "));
    for (const e of d.practical?.equipment || []) {
      add("Equipamento", e.id, e.name, [e.notes, e.warranty ? "Garantia " + e.warranty : ""].filter(Boolean).join(" "), "casaEquipment", [e.document?.name || "", e.document?.text || ""].join(" "));
      if (e.document) add("Comprovativo", e.id, e.document.name, e.name + (e.purchaseDate ? " " + e.purchaseDate : ""), "documentsHub", e.document.text || "");
    }
    for (const r of d.practical?.routines || [])
      add("Rotina", r.id, r.title || r.name, r.nextDate || "", "casaEquipment", [r.notes || "", ...(r.checklist || []).map(c => c.label || c.text)].join(" "));
    for (const v of d.practical?.vehicles || []) {
      add("Veículo", v.id, v.name, [v.plate, v.makeModel || v.brandModel].filter(Boolean).join(" "), "casaVehicles", [v.notes || "", ...(v.maintenance || []).map(m => m.description), ...(v.documents || []).map(doc => [doc.title, doc.document?.name || doc.name, doc.document?.text || doc.text].join(" "))].join(" "));
      for (const doc of v.documents || []) add("Comprovativo", doc.id, doc.title || doc.document?.name || doc.name, v.name + " " + (doc.date || ""), "documentsHub", [doc.document?.name || doc.name, doc.document?.text || doc.text || ""].join(" "));
    }
    for (const h of d.practical?.housing || []) {
      add("Habitação", h.id, h.name, [h.addressNote || h.address, h.taxId || h.reference].filter(Boolean).join(" "), "casaHousing", [h.notes || "", ...(h.documents || []).map(doc => [doc.title, doc.document?.name || doc.name, doc.document?.text || doc.text].join(" "))].join(" "));
      for (const doc of h.documents || []) add("Comprovativo", doc.id, doc.title || doc.document?.name || doc.name, h.name + " " + (doc.date || ""), "documentsHub", [doc.document?.name || doc.name, doc.document?.text || doc.text || ""].join(" "));
    }
    for (const u of [...(d.casa?.utilityReadings || []), ...(d.casa?.utilityMonthly || []), ...(d.casa?.utilityPeriods || [])])
      add("Consumo", u.id, ({ water: "Água", electricity: "Eletricidade", gas: "Gás", sanitation: "Saneamento" }[u.utility] || u.utility) + " · " + (u.reading ?? u.consumption ?? "") + " " + (u.unit || ""), u.date || u.periodEnd || u.month || "", "casaConsumos", [u.meter || u.meterLabel || "", u.supplier || "", u.note || ""].join(" "));
    // Intercalar os tipos mantém resultados relevantes visíveis dentro do limite.
    const matches = [], lists = [...groups.values()];
    for (let i = 0; matches.length < 100 && lists.some(xs => i < xs.length); i++)
      for (const xs of lists) if (xs[i] && matches.length < 100) matches.push(xs[i]);
    return matches;
  }
  function trade(d, p) {
    requireDate(p.date);
    const holding = d.investments.find((i) => String(i.id) === String(p.investmentId)),
      a = d.accounts.find(
        (a) =>
          a.name === p.account &&
          !a.archived &&
          !["Cartão", "Cartão de crédito"].includes(a.type),
      );
    if (!holding || !a)
      throw Error("Escolhe investimento e conta de dinheiro.");
    const i = clone(holding);
    if (!["buy", "sell", "dividend"].includes(p.kind))
      throw Error("Operação inválida.");
    const units = Number(p.units),
      price = Number(p.price),
      rawFee = Number(p.fee);
    if (
      !nonnegative(rawFee) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      (p.kind !== "dividend" &&
        (!Number.isFinite(units) || units <= 0 || units !== +units.toFixed(8)))
    )
      throw Error("Quantidade, preço ou comissão inválidos.");
    const fee = F.money(rawFee);
    if ((!i.units || i.units < 0) && i.cost > 0)
      throw Error("Define primeiro as unidades iniciais desta posição.");
    if (
      d.investmentTrades.some((t) => String(t.investmentId) === String(i.id) && t.date > p.date)
    )
      throw Error(
        "Regista as operações por ordem de data. Reverte primeiro as operações posteriores.",
      );
    const before = clone(i);
    const held = i.units || 0,
      gross = F.money(p.kind === "dividend" ? price : units * price);
    if (!(gross > 0)) throw Error("O valor bruto da operação tem de ser positivo.");
    let delta,
      realized = 0,
      costReleased = 0;
    if (p.kind === "buy") {
      delta = -F.money(gross + fee);
      i.cost = F.money(i.cost - delta);
      i.units = +(held + units).toFixed(8);
      i.value = F.money(i.units * price);
    } else if (p.kind === "sell") {
      if (units > held) throw Error("A venda excede as unidades disponíveis.");
      if (gross <= fee)
        throw Error("A comissão deve ser inferior ao produto da venda.");
      costReleased = F.money((i.cost * units) / held);
      delta = F.money(gross - fee);
      realized = F.money(delta - costReleased);
      i.cost = F.money(i.cost - costReleased);
      i.units = +(held - units).toFixed(8);
      i.value = F.money(i.units * price);
    } else {
      if (gross <= fee)
        throw Error("A comissão deve ser inferior ao dividendo.");
      delta = F.money(gross - fee);
    }
    const id = F.id();
    const posting = F.add(d, {
      id: F.id(),
      date: p.date,
      type: p.kind === "dividend" ? "income" : "adjustment",
      amount: Math.abs(delta),
      ...(p.kind === "dividend" ? {} : { delta }),
      account: a.name,
      description:
        { buy: "Compra", sell: "Venda", dividend: "Dividendo" }[p.kind] +
        " · " +
        i.name,
      category: "Investimentos",
      investmentTradeId: id,
    });
    const record = {
      id,
      investmentId: i.id,
      transactionId: posting.id,
      kind: p.kind,
      date: p.date,
      units: p.kind === "dividend" ? 0 : units,
      price,
      fee,
      gross,
      net: delta,
      realized,
      costReleased,
      before,
      after: clone(i),
    };
    Object.assign(holding, i);
    d.investmentTrades.push(record);
    return record;
  }
  function undoTrade(d, id) {
    const draft = clone(d);
    undoTradeDraft(draft, id);
    Object.assign(d, draft);
  }
  function undoTradeDraft(d, id) {
    const t = d.investmentTrades.find((t) => t.id === id);
    if (!t) throw Error("Operação inexistente.");
    const history = d.investmentTrades.filter(
      (x) => x.investmentId === t.investmentId,
    );
    if (history[history.length - 1].id !== id)
      throw Error("Reverte primeiro as operações mais recentes desta posição.");
    const i = d.investments.find((i) => i.id === t.investmentId);
    if (["cost", "value", "units"].some((key) => i[key] !== t.after[key]))
      throw Error(
        "A posição foi editada entretanto. Repõe a avaliação anterior antes de reverter.",
      );
    d.investmentTrades = d.investmentTrades.filter((x) => x.id !== id);
    F.remove(d, t.transactionId);
    for (const key of ["cost", "value", "units"])
      if (key in t.before) i[key] = t.before[key];
      else delete i[key];
  }
  function performance(d, year) {
    const trades = d.investmentTrades.filter(
      (t) => !year || t.date.startsWith(String(year)),
    );
    return {
      purchases: sum(trades.filter((t) => t.kind === "buy").map((t) => -t.net)),
      sales: sum(trades.filter((t) => t.kind === "sell").map((t) => t.net)),
      dividends: sum(
        trades.filter((t) => t.kind === "dividend").map((t) => t.net),
      ),
      fees: sum(trades.map((t) => t.fee)),
      realized: sum(trades.map((t) => t.realized)),
      unrealized: sum(d.investments.map((i) => i.value - i.cost)),
      value: sum(d.investments.map((i) => i.value)),
    };
  }
  function documents(d, year = "", entity = "", extra = {}) {
    // v0.27 keeps the old (year, entity) signature while adding richer filters.
    if (year && typeof year === "object") {
      extra = year;
      year = extra.year || "";
      entity = extra.query || extra.entity || "";
    }
    const filters = extra && typeof extra === "object" ? extra : {};
    const fold = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT");
    const q = fold(filters.query ?? entity).trim();
    const from = String(filters.from || "");
    const to = String(filters.to || "");
    const min = filters.min === "" || filters.min == null ? null : Number(filters.min);
    const max = filters.max === "" || filters.max == null ? null : Number(filters.max);
    const type = String(filters.type || "all");
    return d.transactions
      .filter((t) => {
        if (!t.attachment) return false;
        if (year && !String(t.date || "").startsWith(String(year))) return false;
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (Number.isFinite(min) && Number(t.amount) < min) return false;
        if (Number.isFinite(max) && Number(t.amount) > max) return false;
        const mime = String(t.attachment.type || "");
        if (type === "pdf" && mime !== "application/pdf") return false;
        if (type === "image" && !mime.startsWith("image/")) return false;
        if (q) {
          const haystack = root.ReceiptFinance ? root.ReceiptFinance.searchText(t) : fold([
            t.documentEntity,
            t.receiptMerchant,
            t.beneficiary,
            t.description,
            t.attachment.name,
            t.category,
          ].filter(Boolean).join(" "));
          const terms = root.ReceiptFinance ? root.ReceiptFinance.nameKey(q).split(" ").filter(Boolean) : [q];
          if (!terms.every(term=>haystack.includes(term))) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  }
  function annualReport(d, year) {
    year = String(year);
    if (!/^\d{4}$/.test(year)) throw Error("Ano inválido.");
    const currentMonth = F.today().slice(0, 7),
      currentYear = currentMonth.slice(0, 4),
      selectedMonthCount = year < currentYear ? 12 : year > currentYear ? 0 : +currentMonth.slice(5),
      months = Array.from({ length: 12 }, (_, i) => {
        const month = year + "-" + String(i + 1).padStart(2, "0");
        return { month, ...F.totals(d, month) };
      }),
      cats = new Map(),
      entries = F.expenseEntries(d, year),
      entriesByMonth = new Map(),
      sumRows = (rows) => F.money(rows.reduce((n, x) => n + (+x.amount || 0), 0));
    for (const e of entries) {
      cats.set(e.category, F.money((cats.get(e.category) || 0) + e.amount));
      const em = String(e.date || "").slice(0, 7);
      if (!entriesByMonth.has(em)) entriesByMonth.set(em, []);
      entriesByMonth.get(em).push(e);
    }

    const comparableMonths = selectedMonthCount,
      ytdMonths = months.slice(0, comparableMonths),
      previousYear = String(+year - 1),
      previousMonths = Array.from({ length: comparableMonths }, (_, i) => {
        const month = previousYear + "-" + String(i + 1).padStart(2, "0");
        return { month, ...F.totals(d, month) };
      }),
      ytdIncome = sum(ytdMonths.map((m) => m.income)),
      ytdExpense = sum(ytdMonths.map((m) => m.expense)),
      previousIncome = sum(previousMonths.map((m) => m.income)),
      previousExpense = sum(previousMonths.map((m) => m.expense)),
      deltaPct = (now, before) => before ? ((now - before) / Math.abs(before)) * 100 : null;

    const categorySeries = [...cats]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, total]) => ({
        category,
        total,
        months: months.map((m) => sumRows((entriesByMonth.get(m.month) || []).filter((e) => e.category === category))),
      }));

    const recentEnd = year === currentYear ? +currentMonth.slice(5) : 12,
      recent = months.slice(Math.max(0, recentEnd - 3), recentEnd),
      prior = months.slice(Math.max(0, recentEnd - 6), Math.max(0, recentEnd - 3)),
      recentCats = new Map(), priorCats = new Map();
    for (const m of recent)
      for (const e of entriesByMonth.get(m.month) || []) recentCats.set(e.category, F.money((recentCats.get(e.category) || 0) + e.amount));
    for (const m of prior)
      for (const e of entriesByMonth.get(m.month) || []) priorCats.set(e.category, F.money((priorCats.get(e.category) || 0) + e.amount));
    const risingCategories = [...new Set([...recentCats.keys(), ...priorCats.keys()])]
      .map((category) => {
        const recentAverage = F.money((recentCats.get(category) || 0) / Math.max(1, recent.length)),
          previousAverage = F.money((priorCats.get(category) || 0) / Math.max(1, prior.length));
        return { category, recentAverage, previousAverage, change: F.money(recentAverage - previousAverage), changePct: deltaPct(recentAverage, previousAverage) };
      })
      .filter((x) => x.change > 0 && x.recentAverage > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 6);

    // Refund classification is analytical only; never add payment links to the refund.
    const transactionsById = new Map(d.transactions.map(t => [String(t.id), t])),
      ytdEnd = ytdMonths.at(-1)?.month || null,
      regularEntries = entries.filter(e => {
        if (!ytdEnd || e.date.slice(0, 7) > ytdEnd) return false;
        const source = e.refundOf ? transactionsById.get(String(e.refundOf)) : e;
        return Boolean(source && (source.recurringRuleId || source.subscriptionId || source.debtId || source.expenseNature === "fixed"));
      }),
      regular = sumRows(regularEntries),
      occasional = F.money(ytdExpense - regular),
      history = d.wealthHistory.filter((h) => h.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date)),
      latestHistoryByMonth = months.map((m) => history.filter((h) => h.date.startsWith(m.month)).at(-1)).filter(Boolean),
      wealthChange = latestHistoryByMonth.length > 1 ? F.money(latestHistoryByMonth.at(-1).net - latestHistoryByMonth[0].net) : 0;

    let forecast = null;
    if (year === currentYear) {
      const monthKey = currentMonth,
        [yy, mm] = monthKey.split("-").map(Number),
        daysInMonth = new Date(yy, mm, 0).getDate(),
        elapsedDays = Math.max(1, +F.today().slice(8)),
        actual = F.totals(d, monthKey),
        remainingKnown = F.upcoming(d, monthKey).filter((x) => x.date > F.today()),
        knownIncome = sum(remainingKnown.filter((x) => x.type === "income").map((x) => x.amount)),
        knownExpense = sum(remainingKnown.filter((x) => x.type === "expense").map((x) => x.amount)),
        monthEntries = entriesByMonth.get(monthKey) || [],
        isFixedExpense = (e) => {
          const src = e.refundOf ? transactionsById.get(String(e.refundOf)) : e;
          return Boolean(src && (src.recurringRuleId || src.subscriptionId || src.debtId || src.expenseNature === "fixed"));
        },
        fixedActualExpense = sumRows(monthEntries.filter(isFixedExpense)),
        variableActualExpense = Math.max(0, F.money(actual.expense - fixedActualExpense)),
        fixedActualIncome = sum((d.transactions || []).filter((t) => t.date.startsWith(monthKey) && t.type === "income" && !t.refundOf && (t.recurringRuleId || t.expenseNature === "fixed")).map((t) => t.amount)),
        variableActualIncome = Math.max(0, F.money(actual.income - fixedActualIncome)),
        runRateExpense = F.money(fixedActualExpense + knownExpense + variableActualExpense / elapsedDays * daysInMonth),
        runRateIncome = F.money(fixedActualIncome + knownIncome + variableActualIncome / elapsedDays * daysInMonth);
      forecast = {
        month: monthKey,
        actualIncome: actual.income,
        actualExpense: actual.expense,
        income: F.money(Math.max(actual.income + knownIncome, runRateIncome)),
        expense: F.money(Math.max(actual.expense + knownExpense, runRateExpense)),
        knownIncome,
        knownExpense,
        elapsedDays,
        daysInMonth,
      };
      forecast.balance = F.money(forecast.income - forecast.expense);
    }

    return {
      year,
      months,
      income: sum(months.map((m) => m.income)),
      expense: sum(months.map((m) => m.expense)),
      ytdIncome,
      ytdExpense,
      averageIncome: F.money(ytdIncome / Math.max(1, comparableMonths)),
      averageExpense: F.money(ytdExpense / Math.max(1, comparableMonths)),
      previousYear: { year: previousYear, income: previousIncome, expense: previousExpense },
      yearChange: { incomePct: deltaPct(ytdIncome, previousIncome), expensePct: deltaPct(ytdExpense, previousExpense) },
      categories: [...cats].sort((a, b) => b[1] - a[1]),
      categorySeries,
      risingCategories,
      regularVsOccasional: { from: year + "-01", until: ytdEnd, regular, occasional, regularPct: ytdExpense ? Math.round((regular / ytdExpense) * 100) : 0 },
      history,
      wealthByMonth: latestHistoryByMonth,
      wealthChange,
      forecast,
      performance: performance(d, year),
      notes: d.yearNotes.filter((n) => n.date.startsWith(year)),
      closed: months.filter((m) => d.closedMonths.includes(m.month)).length,
      comparableMonths,
    };
  }
  function validate(d) {
    for (const i of d.investments)
      if (i.units !== undefined && !nonnegative(i.units))
        throw Error("Unidades de investimento inválidas.");
    for (const s of d.subscriptions) {
      if (
        !text(s.name) ||
        !nonnegative(s.amount) ||
        !["monthly", "yearly"].includes(s.frequency) ||
        !date(s.nextDate) ||
        !["active", "trial", "cancelled"].includes(s.status) ||
        !Number.isInteger(s.reminderDays) ||
        s.reminderDays < 0 ||
        s.reminderDays > 90 ||
        !Array.isArray(s.prices) ||
        s.prices.some((p) => !date(p.date) || !nonnegative(p.amount)) ||
        (s.trialEnd && !date(s.trialEnd)) ||
        (s.renewalDay !== undefined && (!Number.isInteger(Number(s.renewalDay)) || Number(s.renewalDay) < 1 || Number(s.renewalDay) > 31))
      )
        throw Error("Subscrição inválida.");
      if (s.occurrenceOverrides !== undefined) {
        if (!Array.isArray(s.occurrenceOverrides)) throw Error("Ajustes de ocorrência da subscrição inválidos.");
        const occurrenceDates = new Set();
        for (const o of s.occurrenceOverrides) {
          if (!o || typeof o !== "object" || Array.isArray(o) || !date(o.originalDate) || (o.date !== undefined && !date(o.date)) || (o.amount !== undefined && !nonnegative(Number(o.amount))) || (o.skipped !== undefined && typeof o.skipped !== "boolean") || (o.reason !== undefined && (typeof o.reason !== "string" || o.reason.length > 500)) || occurrenceDates.has(o.originalDate))
            throw Error("Ajustes de ocorrência da subscrição inválidos.");
          occurrenceDates.add(o.originalDate);
        }
      }
    }
    for (const a of d.assets)
      if (
        !text(a.name) ||
        typeof a.kind !== "string" ||
        !Array.isArray(a.valuations) ||
        a.valuations.some((v) => !date(v.date) || !nonnegative(v.value))
      )
        throw Error("Bem ou avaliação inválidos.");
    const totals = new Map();
    for (const s of d.sharedExpenses) {
      const t = d.transactions.find(
        (t) => t.id === s.transactionId && t.type === "expense" && !t.debtId,
      );
      if (
        !t ||
        !text(s.person) ||
        !Number.isFinite(s.amount) ||
        s.amount <= 0 ||
        received(d, s.id) > s.amount
      )
        throw Error("Partilha inválida.");
      totals.set(t.id, F.money((totals.get(t.id) || 0) + s.amount));
      if (totals.get(t.id) > t.amount)
        throw Error("As partilhas excedem a compra.");
    }
    for (const t of d.transactions)
      if (
        t.sharedExpenseId &&
        !d.sharedExpenses.some(
          (s) => s.id === t.sharedExpenseId && s.transactionId === t.refundOf,
        )
      )
        throw Error("Recebimento sem partilha válida.");
    for (const t of d.investmentTrades) {
      if (
        !d.investments.some((i) => i.id === t.investmentId) ||
        !d.transactions.some(
          (x) => x.id === t.transactionId && x.investmentTradeId === t.id,
        ) ||
        !["buy", "sell", "dividend"].includes(t.kind) ||
        !date(t.date) ||
        ![
          t.units,
          t.price,
          t.fee,
          t.gross,
          t.net,
          t.realized,
          t.costReleased,
        ].every(Number.isFinite) ||
        !t.before ||
        !t.after
      )
        throw Error("Operação de investimento inválida.");
      const posting = d.transactions.find((x) => x.id === t.transactionId);
      const validPosition = (p) =>
        p &&
        p.id === t.investmentId &&
        nonnegative(p.cost) &&
        nonnegative(p.value) &&
        (p.units === undefined || nonnegative(p.units));
      if (
        !validPosition(t.before) ||
        !validPosition(t.after) ||
        !nonnegative(t.fee) ||
        t.price <= 0 ||
        t.units < 0 ||
        t.costReleased < 0
      )
        throw Error("Histórico da posição inválido.");
      const held = t.before.units || 0,
        gross = F.money(t.kind === "dividend" ? t.price : t.units * t.price);
      const net =
        t.kind === "buy" ? -F.money(gross + t.fee) : F.money(gross - t.fee);
      const costReleased =
        t.kind === "sell" ? F.money((t.before.cost * t.units) / held) : 0;
      const units =
        t.kind === "dividend"
          ? held
          : +(held + (t.kind === "buy" ? t.units : -t.units)).toFixed(8);
      const cost =
        t.kind === "buy"
          ? F.money(t.before.cost - net)
          : t.kind === "sell"
            ? F.money(t.before.cost - costReleased)
            : t.before.cost;
      const value =
        t.kind === "dividend" ? t.before.value : F.money(units * t.price);
      if (
        (t.kind === "dividend" ? t.units !== 0 : t.units <= 0) ||
        units < 0 ||
        gross <= 0 ||
        (t.kind !== "buy" && net <= 0) ||
        t.gross !== gross ||
        t.net !== net ||
        t.costReleased !== costReleased ||
        t.realized !== (t.kind === "sell" ? F.money(net - costReleased) : 0) ||
        t.after.cost !== cost ||
        (t.after.units || 0) !== units ||
        t.after.value !== value ||
        posting.date !== t.date ||
        posting.amount !== Math.abs(net) ||
        posting.type !== (t.kind === "dividend" ? "income" : "adjustment") ||
        (t.kind !== "dividend" && posting.delta !== net) ||
        posting.refundOf
      )
        throw Error("A operação e o movimento na conta não correspondem.");
    }
    for (const t of d.transactions)
      if (
        t.investmentTradeId &&
        !d.investmentTrades.some(
          (r) => r.id === t.investmentTradeId && r.transactionId === t.id,
        )
      )
        throw Error("Movimento sem operação de investimento válida.");
    for (const n of d.yearNotes)
      if (!date(n.date) || !text(n.title) || typeof n.description !== "string")
        throw Error("Acontecimento anual inválido.");
    if (d.presentation) {
      const p = d.presentation;
      if (
        !["light", "dark"].includes(p.theme) ||
        !["comfortable", "compact"].includes(p.density) ||
        !Array.isArray(p.hiddenMetrics) ||
        p.hiddenMetrics.some(
          (x) =>
            ![
              "balanceValue",
              "incomeValue",
              "expenseValue",
              "savingRate",
            ].includes(x),
        )
      )
        throw Error("Apresentação inválida.");
    }
    return d;
  }
  const api = {
    assetValue,
    assetTotal,
    valuation,
    share,
    received,
    sharedOutstanding,
    receiveShare,
    subscription,
    renew,
    advanceSubscriptionPast,
    reminders,
    quality,
    search,
    trade,
    undoTrade,
    performance,
    documents,
    annualReport,
    validate,
  };
  root.LifeFinance = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

/* Store-only ZIP writer, kept dependency-free for local document export. */
(function (root) {
  root.LifeFinance.zip = function (files) {
    const encoder = new TextEncoder(),
      chunks = [],
      central = [];
    let offset = 0,
      total = 0;
    const crc = (bytes) => {
      let c = 0xffffffff;
      for (const b of bytes) {
        c ^= b;
        for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
      return (c ^ 0xffffffff) >>> 0;
    };
    const header = (size, fn) => {
      const bytes = new Uint8Array(size);
      fn(new DataView(bytes.buffer));
      return bytes;
    };
    for (const file of files) {
      const name = encoder.encode(file.name),
        bytes = file.bytes;
      total += bytes.length;
      if (total > 50 * 1024 * 1024)
        throw Error("A seleção excede 50 MB. Exporta por ano ou entidade.");
      const checksum = crc(bytes),
        local = header(30, (v) => {
          v.setUint32(0, 0x04034b50, true);
          v.setUint16(4, 20, true);
          v.setUint16(6, 0x800, true);
          v.setUint16(12, 33, true);
          v.setUint32(14, checksum, true);
          v.setUint32(18, bytes.length, true);
          v.setUint32(22, bytes.length, true);
          v.setUint16(26, name.length, true);
        });
      chunks.push(local, name, bytes);
      central.push(
        header(46, (v) => {
          v.setUint32(0, 0x02014b50, true);
          v.setUint16(4, 20, true);
          v.setUint16(6, 20, true);
          v.setUint16(8, 0x800, true);
          v.setUint16(14, 33, true);
          v.setUint32(16, checksum, true);
          v.setUint32(20, bytes.length, true);
          v.setUint32(24, bytes.length, true);
          v.setUint16(28, name.length, true);
          v.setUint32(42, offset, true);
        }),
        name,
      );
      offset += 30 + name.length + bytes.length;
    }
    const centralSize = central.reduce((n, b) => n + b.length, 0),
      end = header(22, (v) => {
        v.setUint32(0, 0x06054b50, true);
        v.setUint16(8, files.length, true);
        v.setUint16(10, files.length, true);
        v.setUint32(12, centralSize, true);
        v.setUint32(16, offset, true);
      });
    const out = new Uint8Array(offset + centralSize + 22);
    let i = 0;
    for (const b of [...chunks, ...central, end]) {
      out.set(b, i);
      i += b.length;
    }
    return out;
  };
})(globalThis);
