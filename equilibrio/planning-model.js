/* Explicit plans and explanations; forecasts never post ledger entries. */
(function (root) {
  "use strict";
  const F = root.Finance || require("./finance.js"),
    P = root.FinancePlus || require("./features-model.js"),
    L = root.LifeFinance || require("./life-model.js");
  const sum = (xs) => F.money(xs.reduce((a, b) => a + b, 0)),
    positive = (n) => Number.isFinite(n) && n > 0,
    nonnegative = (n) => Number.isFinite(n) && n >= 0;
  function monthlyReview(d, selected, today=F.today()) {
    if(!F.validDate(selected+'-01')||!F.validDate(today))throw Error('Período inválido.');
    const date=new Date(selected+'-15T12:00:00');date.setMonth(date.getMonth()-1);
    const previous=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const partial=selected===today.slice(0,7),day=partial?Number(today.slice(8)):31;
    const end=m=>m+'-'+String(Math.min(day,new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate())).padStart(2,'0');
    // Resolve linked refunds against the full ledger before cutting either period.
    const expenses=F.expenseEntries(d);
    const period=m=>{const until=end(m),transactions=d.transactions.filter(t=>t.date>=m+'-01'&&t.date<=until),rows=expenses.filter(t=>t.date>=m+'-01'&&t.date<=until),income=sum(transactions.filter(t=>t.type==='income'&&!t.refundOf).map(t=>t.amount)),expense=sum(rows.map(t=>t.amount)),categories=new Map();for(const row of rows){const key=F.categoryParts(row.category)[0]||'Outros';categories.set(key,F.money((categories.get(key)||0)+row.amount));}return {month:m,until,income,expense,net:F.money(income-expense),count:transactions.filter(t=>['income','expense'].includes(t.type)).length,categories:Object.fromEntries(categories)};};
    const current=period(selected),prior=period(previous);
    const changes=[...new Set([...Object.keys(current.categories),...Object.keys(prior.categories)])].map(category=>({category,current:current.categories[category]||0,previous:prior.categories[category]||0,difference:F.money((current.categories[category]||0)-(prior.categories[category]||0))})).sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference));
    return {current,previous:prior,partial,changes};
  }
  function payday(d, start = F.today()) {
    const salaryOccurrence = () => {
      const isSalaryRule = (r) =>
        r && r.active && r.type === "income" &&
        (r.incomeKind === "salary" || /(?:sal[aá]rio|ordenado)/i.test(String(r.category || "") + " " + String(r.description || "")));
      const candidates = [];
      const base = new Date(start + "T12:00:00Z");
      for (let offset = 0; offset < 14; offset++) {
        const d0 = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
        const m = `${d0.getUTCFullYear()}-${String(d0.getUTCMonth() + 1).padStart(2, "0")}`;
        for (const occurrence of F.upcoming(d, m)) {
          if (occurrence.date > start && isSalaryRule(occurrence)) candidates.push(occurrence);
        }
      }
      return candidates.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    };
    const salary = salaryOccurrence();
    const nextPayday = () => {
      const startDate = new Date(start + "T12:00:00Z");
      const rawDay = d.paydayDay;
      const parsedDay = rawDay == null || rawDay === "" ? 0 : Math.trunc(Number(rawDay));
      const preferredDay = Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : 0;
      for (let offset = 0; offset < 14; offset++) {
        const y = startDate.getUTCFullYear(), m = startDate.getUTCMonth() + offset;
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const day = preferredDay > 0 ? Math.min(preferredDay, last) : last;
        const candidate = `${new Date(Date.UTC(y, m, day)).getUTCFullYear()}-${String(new Date(Date.UTC(y, m, day)).getUTCMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        if (candidate > start) return candidate;
      }
      return "";
    };
    // Um ordenado recorrente definido na Agenda é a fonte principal da data.
    // A data manual fica apenas como fallback para quem ainda não configurou o ordenado.
    const date = salary?.date || (d.paydayDate && d.paydayDate > start ? d.paydayDate : nextPayday());
    if (!date) return null;
    const days = Math.round(
      (Date.parse(date + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
        86400000,
    );
    if (days > 366) return null;
    const room = P.spendingRoom(d, d.safetyMargin || 0, days - 1, start);
    const allowance = Math.max(0, room.available),
      daily = allowance / days;
    const weeks = [];
    let allocated = 0;
    for (let n = 0; n < days; n += 7) {
      const length = Math.min(7, days - n),
        amount =
          n + length === days
            ? F.money(allowance - allocated)
            : F.money(daily * length);
      allocated = F.money(allocated + amount);
      weeks.push({
        from: P.dayAdd(start, n),
        to: P.dayAdd(start, n + length - 1),
        amount,
      });
    }
    return {
      ...room,
      date,
      weeks,
      days,
      allowance,
      deficit: Math.max(0, -room.available),
      salaryRuleId: salary?.ruleId || salary?.id || null,
      salaryAmount: salary ? salary.amount : null,
      salaryDescription: salary?.description || null,
      salaryAccount: salary?.account || null,
    };
  }
  function comparison(d, month) {
    const entries = F.expenseEntries(d, month),
      categories = new Set([
        ...d.budgets.map((b) => b.category),
        ...entries
          .map((t) => t.category)
          .filter((cat) => !d.budgets.some((b) => F.categoryMatches(cat, b.category))),
      ]);
    return [...categories].map((category) => {
      const budget = d.budgets.find((b) => b.category === category),
        plan = budget ? P.budgetAt(d, budget, month) : null,
        limit = plan ? (plan.rollover ? plan.available : plan.limit) : null,
        matched = entries.filter((t) =>
          budget ? F.categoryMatches(t.category, budget.category) : t.category === category,
        ),
        actual = sum(matched.map((t) => t.amount));
      return {
        category,
        planned: limit,
        actual,
        difference: limit !== null ? F.money(actual - limit) : null,
        transactions: matched,
      };
    });
  }
  function seasonal(d, start = F.today()) {
    return d.seasonalCosts
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => {
        const months = Math.max(
          1,
          (+s.date.slice(0, 4) - +start.slice(0, 4)) * 12 +
            (+s.date.slice(5, 7) - +start.slice(5, 7)) +
            1,
        );
        return {
          ...s,
          remaining: F.money(Math.max(0, s.amount - s.saved)),
          monthly: F.money(Math.max(0, s.amount - s.saved) / months),
          overdue: s.date < start,
        };
      });
  }
  function allocation(d, goalId, accountId) {
    const g = d.goals.find((g) => g.id === goalId),
      a = d.accounts.find((a) => a.id === accountId && !a.archived);
    if (!g) throw Error("Objetivo inexistente.");
    if (!accountId) {
      delete g.accountId;
      return;
    }
    if (!a || ["Cartão", "Cartão de crédito"].includes(a.type))
      throw Error("Escolhe uma conta de dinheiro ativa.");
    const used = sum(
      d.goals
        .filter((x) => x.id !== g.id && x.accountId === accountId)
        .map((x) => x.current),
    );
    if (F.money(used + g.current) > a.balance)
      throw Error("O saldo desta conta não cobre os objetivos associados.");
    g.accountId = accountId;
  }
  function protectionOverview(d, date = F.today()) {
    const month = date.slice(0, 7);
    const expenses = d.budgets.some(b => b.protectionAccountId) ? F.expenseEntries(d, month) : [];
    const accounts = d.accounts.filter(a => !a.archived && !["Cartão", "Cartão de crédito"].includes(a.type));
    const byAccount = new Map(accounts.map(a => [String(a.id), {account:a,pots:new Map()}]));
    const items = new Map();
    for (const [kind, rows] of Object.entries({goal:d.goals,reserve:d.reserves,budget:d.budgets})) {
      for (const row of rows) {
        const id = kind + ":" + row.id;
        const accountId = row.protectionAccountId ?? (kind === "goal" ? row.accountId : "");
        const target = byAccount.get(String(accountId));
        if (!target) continue;
        const {account,pots}=target;
        let amount = kind === "goal" ? row.current : row.saved;
        if (kind === "budget") {
          const spent = sum(expenses.filter(t => t.date <= date && t.account === account.name &&
            F.categoryMatches(t.category, row.category)).map(t => t.amount));
          amount = P.budgetAt(d, row, month).available - spent;
        }
        amount = Math.max(0, F.money(amount || 0));
        const group = row.protectionGroup?.trim();
        const itemKey = group ? "group:" + group.toLocaleLowerCase("pt-PT") : id;
        pots.set(itemKey, Math.max(pots.get(itemKey) || 0, amount));
        items.set(id, {account,amount,group,itemKey});
      }
    }
    for (const item of items.values()) {
      item.groupAmount = byAccount.get(String(item.account.id)).pots.get(item.itemKey);
    }
    return {items,accounts:accounts.map(a => {
      const balance = F.balanceAt(d, a, date);
      const protectedAmount = sum([...byAccount.get(String(a.id)).pots.values()]);
      const available = F.money(balance - protectedAmount);
      const deficit = protectedAmount ? Math.max(0, -available) : 0;
      return {id:a.id,name:a.name,balance,protectedAmount,available,deficit,
        low:protectedAmount > 0 && available >= 0 && available <= protectedAmount * 0.1};
    })};
  }

  function protection(d, date = F.today()) {
    return protectionOverview(d,date).accounts;
  }

  function saveProtection(d, kind, id, accountId, group) {
    const row = ({goal:d.goals,reserve:d.reserves,budget:d.budgets})[kind]?.find(r=>String(r.id)===String(id));
    if (!row) throw Error("Plano inexistente.");
    if (accountId && !d.accounts.some(a=>String(a.id)===String(accountId) && !a.archived && !["Cartão","Cartão de crédito"].includes(a.type)))
      throw Error("Escolhe uma conta ativa de dinheiro.");
    if (typeof group !== "string" || group.length > 100) throw Error("Identificação da despesa inválida.");
    row.protectionAccountId = accountId;
    row.protectionGroup = accountId ? group.trim() : "";
  }

  function normName(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-PT");
  }
  function legacyMonthsUntil(month, targetYearMonth) {
    return Math.max(
      1,
      (+targetYearMonth.slice(0, 4) - +month.slice(0, 4)) * 12 +
        (+targetYearMonth.slice(5, 7) - +month.slice(5, 7)) +
        1,
    );
  }
  function annualPlanMonths(month, targetMonthNumber) {
    const currentMonth = Number(month.slice(5, 7)) || 1;
    const target = Number(targetMonthNumber) || currentMonth;
    return target >= currentMonth
      ? target - currentMonth + 1
      : 12 - currentMonth + target + 1;
  }
  function legacyPlanSummary(d, month = F.today().slice(0, 7)) {
    const budgetsByCat = new Map(
      (d.budgets || []).map((b) => [normName(b.category), b]),
    );
    const reservesByName = new Map(
      (d.reserves || []).map((r) => [normName(r.name), r]),
    );
    const envelopes = (d.envelopes || []).map((e) => {
      const existing = budgetsByCat.get(normName(e.category)) || null;
      return {
        ...e,
        existingBudgetId: existing?.id || null,
        existingLimit: existing ? P.budgetAt(d, existing, month).limit : null,
      };
    });
    const annualPlans = (d.annualPlans || []).map((p) => {
      const existing = reservesByName.get(normName(p.name)) || null;
      return {
        ...p,
        months: annualPlanMonths(month, p.month),
        existingReserveId: existing?.id || null,
      };
    });
    const seasonalCosts = (d.seasonalCosts || []).map((s) => {
      const existing = reservesByName.get(normName(s.name)) || null;
      return {
        ...s,
        months: F.validDate(s.date) ? legacyMonthsUntil(month, s.date.slice(0, 7)) : 12,
        existingReserveId: existing?.id || null,
      };
    });
    return {
      envelopes,
      annualPlans,
      seasonalCosts,
      total: envelopes.length + annualPlans.length + seasonalCosts.length,
    };
  }
  function consolidateLegacyPlan(d, kind, id, month = F.today().slice(0, 7)) {
    if (!F.validDate(month + "-01")) throw Error("Mês inválido.");
    if (kind === "envelope") {
      const env = (d.envelopes || []).find((e) => String(e.id) === String(id));
      if (!env) throw Error("Envelope inexistente.");
      const existing = (d.budgets || []).find(
        (b) => normName(b.category) === normName(env.category),
      );
      const allocated = F.money(Math.max(0, Number(env.allocated) || 0));
      if (!existing) {
        P.saveBudget(d, null, month, {
          category: String(env.category || "").trim(),
          limit: allocated,
          carry: false,
        });
      } else {
        const current = P.budgetAt(d, existing, month);
        if (allocated > current.limit) {
          P.saveBudget(d, existing.id, month, {
            category: existing.category,
            limit: allocated,
            carry: current.rollover,
          });
        }
      }
      d.envelopes = d.envelopes.filter((e) => String(e.id) !== String(id));
      return { kind: "budget" };
    }
    if (kind === "annualPlan") {
      const plan = (d.annualPlans || []).find((p) => String(p.id) === String(id));
      if (!plan) throw Error("Plano anual inexistente.");
      const months = annualPlanMonths(month, plan.month);
      const target = F.money(Math.max(0, Number(plan.amount) || 0));
      const existing = (d.reserves || []).find(
        (r) => normName(r.name) === normName(plan.name),
      );
      if (existing) {
        existing.target = F.money(Math.max(Number(existing.target) || 0, target));
        existing.months ||= months;
      } else {
        d.reserves.push({
          id: F.id(),
          name: String(plan.name || "").trim(),
          target,
          saved: 0,
          months,
        });
      }
      d.annualPlans = d.annualPlans.filter((p) => String(p.id) !== String(id));
      return { kind: "reserve" };
    }
    if (kind === "seasonalCost") {
      const item = (d.seasonalCosts || []).find((s) => String(s.id) === String(id));
      if (!item) throw Error("Despesa sazonal inexistente.");
      const months = F.validDate(item.date)
        ? legacyMonthsUntil(month, item.date.slice(0, 7))
        : 12;
      const target = F.money(Math.max(0, Number(item.amount) || 0));
      const saved = F.money(Math.max(0, Number(item.saved) || 0));
      const existing = (d.reserves || []).find(
        (r) => normName(r.name) === normName(item.name),
      );
      if (existing) {
        existing.target = F.money(Math.max(Number(existing.target) || 0, target));
        existing.saved = F.money(Math.max(Number(existing.saved) || 0, saved));
        existing.months ||= months;
      } else {
        d.reserves.push({
          id: F.id(),
          name: String(item.name || "").trim(),
          target,
          saved,
          months,
        });
      }
      d.seasonalCosts = d.seasonalCosts.filter((s) => String(s.id) !== String(id));
      return { kind: "reserve" };
    }
    throw Error("Tipo de plano antigo inválido.");
  }
  function consolidateAllLegacyPlans(d, month = F.today().slice(0, 7)) {
    const draft = structuredClone(d);
    let count = 0;
    for (const e of (draft.envelopes || []).slice()) {
      consolidateLegacyPlan(draft, "envelope", e.id, month);
      count++;
    }
    for (const p of (draft.annualPlans || []).slice()) {
      consolidateLegacyPlan(draft, "annualPlan", p.id, month);
      count++;
    }
    for (const s of (draft.seasonalCosts || []).slice()) {
      consolidateLegacyPlan(draft, "seasonalCost", s.id, month);
      count++;
    }
    d.budgets = draft.budgets;
    d.reserves = draft.reserves;
    d.envelopes = draft.envelopes;
    d.annualPlans = draft.annualPlans;
    d.seasonalCosts = draft.seasonalCosts;
    return count;
  }

  function importWork(d) {
    return {
      prepared: d.pendingImports.length,
      statementLines: d.statements.reduce((count, statement) =>
        count + statement.rows.filter(row => row.status === "pending").length, 0),
    };
  }
  function inbox(d, month, start = F.today()) {
    const items = [];
    const evidenceKey = (evidence) => {
      const text = JSON.stringify(evidence ?? null);
      let a = 2166136261,
        b = 3339675911;
      for (let i = 0; i < text.length; i++) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619);
        b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
      }
      return (a >>> 0).toString(16) + ":" + (b >>> 0).toString(16);
    };
    const add = (title, detail, route, action, id, evidence, context) =>
      items.push({
        title,
        detail,
        route,
        action,
        id,
        evidence: evidenceKey(evidence),
        ...context,
      });
    for (const a of d.accounts.filter(
      (a) =>
        !a.archived &&
        (!a.reconciledOn || a.reconciledOn < P.dayAdd(start, -30)),
    ))
      add(
        "Confirmar " + a.name,
        "Saldo sem confirmação recente.",
        "accounts",
        undefined,
        a.id,
        [a.balance, a.reconciledOn],
        { kind: "balance", accountId: a.id, sourceName: a.name, date: a.reconciledOn },
      );
    for (const a of d.accounts) {
      const assigned = sum(
        d.goals.filter((g) => g.protectionAccountId===undefined && g.accountId === a.id).map((g) => g.current),
      );
      if (assigned > Math.max(0, a.balance))
        add(
          "Rever reservas em " + a.name,
          "Os objetivos ligados excedem o saldo atual.",
          "goals",
          undefined,
          a.id,
          [assigned, a.balance],
        );
    }
    for (const t of d.transactions.filter(
      (t) => t.date.startsWith(month) && t.type === "expense",
    )) {
      if (
        (t.splits || [{ category: t.category }]).some(
          (s) =>
            !s.category || ["Outros", "Sem categoria", "Por categorizar"].includes(s.category),
        )
      )
        add(
          "Categorizar " + t.description,
          t.date,
          "transactions",
          "edit-tx",
          t.id,
          [t.amount, t.category, t.splits],
        );
      if (F.missingReceipt(t))
        add(
          "Comprovativo em falta",
          t.description,
          "transactions",
          "edit-tx",
          t.id,
          [t.date, t.amount],
          { kind: "receipt" },
        );
    }
    if (d.pendingImports.length)
      add(
        "Rever importação",
        d.pendingImports.length + " movimentos por decidir.",
        "review",
        undefined,
        undefined,
        d.pendingImports.map((t) => [t.id, t.date, t.amount]),
        { kind: "import" },
      );
    for (const s of d.statements)
      if (s.rows.some((r) => r.status === "pending"))
        add(
          "Conferir extrato",
          "Existem linhas por decidir.",
          "review",
          undefined,
          s.id,
          s.rows.filter((r) => r.status === "pending").map((r) => r.id),
          { kind: "statement", sourceName: s.name },
        );
    for (const s of d.sharedExpenses)
      if (s.amount > L.received(d, s.id))
        add(
          "Receber de " + s.person,
          F.money(s.amount - L.received(d, s.id)) + " € por receber.",
          "sharedHub",
          "life-receive",
          s.id,
        );
    for (const s of L.reminders(d, start))
      add(
        "Rever subscrição " + s.name,
        "Data de renovação ou fim de experiência próxima.",
        "subscriptionsHub",
        undefined,
        s.id,
        [s.date, s.label, s.amount],
      );
    const seen = new Map();
    for (const p of d.pendingPayments.filter((p) => p.date < start))
      add(
        "Compromisso em atraso: " + p.description,
        p.date,
        "planner",
        undefined,
        p.id,
        p.amount,
      );
    const latestReconciliations = new Map();
    for (const r of d.reconciliations) {
      const k = String(r.accountId || r.accountName || "");
      const prev = latestReconciliations.get(k);
      if (!prev || String(r.date || "") > String(prev.date || "") || (r.date === prev.date && String(r.recordedAt || "") >= String(prev.recordedAt || ""))) {
        latestReconciliations.set(k, r);
      }
    }
    for (const r of latestReconciliations.values()) {
      try {
        const expected = P.balanceAt(d, r.accountId, r.date);
        const difference = F.money(r.actual - expected);
        if (difference !== 0)
          add(
            "Conferência com diferença",
            r.accountName + " · " + r.date,
            "accounts",
            undefined,
            r.id,
            [r.actual, expected],
            { kind: "balance", accountId: r.accountId, sourceName: r.accountName, date: r.date, difference },
          );
      } catch {}
    }
    const transfers = P.transferCandidates(d.transactions);
    if (transfers.length)
      add(
        "Possíveis transferências",
        "Confirma se as entradas e saídas pertencem à mesma operação.",
        "review",
        undefined,
        undefined,
        transfers.map((pair) => [pair.out.id, pair.in.id, pair.out.amount]),
      );
    for (const t of d.transactions.filter(
      (t) => t.date.startsWith(month) && ["income", "expense"].includes(t.type),
    )) {
      const key = [
        t.date,
        t.amount,
        t.type,
        t.account,
        t.description.trim().toLowerCase(),
      ].join("|");
      if (seen.has(key))
        add(
          "Possível duplicado: " + t.description,
          "Mesmo dia, valor, conta e descrição. Confirma antes de apagar.",
          "transactions",
          "edit-tx",
          t.id,
          [t.date, t.amount, t.account],
        );
      else seen.set(key, t.id);
    }
    return items.map((item) => ({
      ...item,
      token: JSON.stringify([
        item.route,
        item.action || "",
        item.id || "",
        item.title,
        item.detail,
        item.evidence,
      ]),
    }));
  }
  function reviewInbox(d, month, start = F.today()) {
    const all = inbox(d, month, start),
      active = [],
      deferred = [];
    for (const item of all) {
      const state = d.reminderReviews.find((r) => r.token === item.token);
      if (state && (state.mode === "dismissed" || state.until > start))
        deferred.push({ ...item, state });
      else active.push(item);
    }
    return { active, deferred };
  }
  function reviewReminder(d, item, mode, until, start = F.today()) {
    if (!item?.token || !["snoozed", "dismissed"].includes(mode))
      throw Error("Aviso inválido.");
    if (
      mode === "snoozed" &&
      (!F.validDate(until) || until <= start || until > P.dayAdd(start, 366))
    )
      throw Error("Escolhe uma data futura dentro de um ano.");
    const next = {
      id: F.id(),
      token: item.token,
      title: item.title,
      mode,
      date: start,
      until: mode === "snoozed" ? until : null,
    };
    d.reminderReviews = d.reminderReviews.filter((r) => r.token !== item.token);
    d.reminderReviews.push(next);
    return next;
  }
  function weekly(d, end = F.today()) {
    if (!F.validDate(end)) throw Error("Data inválida.");
    const from = P.dayAdd(end, -6),
      previousFrom = P.dayAdd(end, -13),
      previousTo = P.dayAdd(end, -7);
    const entries = F.expenseEntries(d);
    const period = (start, stop) => {
      const transactions = d.transactions.filter(
        (t) => t.date >= start && t.date <= stop,
      );
      const expenses = entries.filter((t) => t.date >= start && t.date <= stop);
      return {
        income: sum(
          transactions
            .filter((t) => t.type === "income" && !t.refundOf)
            .map((t) => t.amount),
        ),
        expense: sum(expenses.map((t) => t.amount)),
        transactions,
        expenses,
      };
    };
    const current = period(from, end),
      previous = period(previousFrom, previousTo);
    const forecast = P.forecast(d, 6, P.dayAdd(end, 1));
    const categories = [...new Set(current.expenses.map((t) => t.category))]
      .map((category) => ({
        category,
        amount: sum(
          current.expenses
            .filter((t) => t.category === category)
            .map((t) => t.amount),
        ),
      }))
      .sort((a, b) => b.amount - a.amount);
    return {
      from,
      end,
      previousFrom,
      previousTo,
      current,
      previous,
      categories,
      change: F.money(current.expense - previous.expense),
      upcoming: forecast.events,
      expected: forecast.end,
    };
  }
  function saveForecast(d, start = F.today()) {
    if (!F.validDate(start) || !d.accounts.length)
      throw Error("Adiciona uma conta antes de guardar uma previsão.");
    if (d.forecastReviews.some((r) => r.date === start))
      throw Error(
        "Já guardaste a previsão de hoje. Mantém-se a versão original para comparação.",
      );
    const forecast = P.forecast(d, 6, P.dayAdd(start, 1));
    const record = {
      id: F.id(),
      date: start,
      until: P.dayAdd(start, 7),
      accountIds: d.accounts.map((a) => String(a.id)),
      opening: sum(d.accounts.map((a) => a.balance)),
      expected: forecast.end,
      events: forecast.events.map((e) => ({
        date: e.date,
        description: e.description || "Compromisso",
        amount: e.amount,
        type: e.type,
        source: e.source || "Agendamento",
      })),
    };
    d.forecastReviews.push(record);
    return record;
  }
  function forecastResult(d, record, today = F.today()) {
    if (record.until >= today) return { ready: false };
    if (
      record.accountIds.some(
        (id) => !d.accounts.some((a) => String(a.id) === id),
      )
    )
      return {
        ready: true,
        error:
          "Uma conta da previsão já não existe; não é possível comparar o mesmo conjunto.",
      };
    try {
      const actual = sum(
        record.accountIds.map((id) =>
          P.balanceAt(
            d,
            d.accounts.find((a) => String(a.id) === id).id,
            record.until,
          ),
        ),
      );
      return {
        ready: true,
        actual,
        difference: F.money(actual - record.expected),
      };
    } catch (error) {
      return { ready: true, error: error.message };
    }
  }
  function subscriptionReview(d) {
    return d.subscriptions.map((s) => {
      const previous =
        s.prices.length > 1 ? s.prices[s.prices.length - 2].amount : null;
      return {
        ...s,
        annual:
          s.status === "cancelled"
            ? 0
            : F.money(s.amount * (s.frequency === "monthly" ? 12 : 1)),
        increase: previous === null ? null : F.money(s.amount - previous),
        usage: s.usage || "unknown",
      };
    });
  }
  function validate(d) {
    for (const p of [...d.pendingPayments, ...d.transactions])
      if (p.reschedules !== undefined) {
        if (
          !Array.isArray(p.reschedules) ||
          p.reschedules.some(
            (r, i) =>
              !r ||
              !F.validDate(r.from) ||
              !F.validDate(r.to) ||
              !F.validDate(r.on) ||
              r.from === r.to ||
              typeof r.reason !== "string" ||
              !r.reason.trim() ||
              r.reason.length > 500 ||
              (i > 0 && r.from !== p.reschedules[i - 1].to),
          ) ||
          (p.reschedules.length &&
            p.reschedules.at(-1).to !==
              (p.pendingId ? p.originalDueDate : p.date))
        )
          throw Error("Histórico de reagendamento inválido.");
      }
    const tokens = new Set(),
      dates = new Set(),
      months = new Set();
    for (const r of d.reminderReviews) {
      if (
        typeof r.token !== "string" ||
        !r.token ||
        r.token.length > 10000 ||
        tokens.has(r.token) ||
        typeof r.title !== "string" ||
        !F.validDate(r.date) ||
        !["snoozed", "dismissed"].includes(r.mode) ||
        (r.mode === "snoozed" &&
          (!F.validDate(r.until) ||
            r.until <= r.date ||
            r.until > P.dayAdd(r.date, 366))) ||
        (r.mode === "dismissed" && r.until !== null)
      )
        throw Error("Estado de aviso inválido.");
      tokens.add(r.token);
    }
    for (const r of d.forecastReviews) {
      if (
        !F.validDate(r.date) ||
        r.until !== P.dayAdd(r.date, 7) ||
        dates.has(r.date) ||
        ![r.opening, r.expected].every(Number.isFinite) ||
        !Array.isArray(r.accountIds) ||
        !r.accountIds.length ||
        new Set(r.accountIds).size !== r.accountIds.length ||
        r.accountIds.some((id) => typeof id !== "string" || !id) ||
        !Array.isArray(r.events) ||
        r.events.some(
          (e) =>
            !e ||
            !F.validDate(e.date) ||
            e.date <= r.date ||
            e.date > r.until ||
            !nonnegative(e.amount) ||
            !["income", "expense", "transfer"].includes(e.type) ||
            typeof e.description !== "string" ||
            typeof e.source !== "string",
        ) ||
        F.money(
          r.opening +
            sum(
              r.events.map((e) => (e.type === "transfer" ? 0 : e.type === "income" ? e.amount : -e.amount)),
            ),
        ) !== r.expected
      )
        throw Error("Previsão guardada inválida.");
      dates.add(r.date);
    }
    for (const r of d.monthlyConclusions) {
      if (
        !F.validDate(r.month + "-01") ||
        months.has(r.month) ||
        typeof r.summary !== "string" ||
        typeof r.next !== "string" ||
        !r.summary.trim() ||
        r.summary.length > 2000 ||
        r.next.length > 2000
      )
        throw Error("Conclusão mensal inválida.");
      months.add(r.month);
    }
    if (d.paydayDate !== undefined && !F.validDate(d.paydayDate))
      throw Error("Data de salário inválida.");
    for (const g of d.goals)
      if (g.accountId && !d.accounts.some((a) => a.id === g.accountId))
        throw Error("Objetivo ligado a conta inexistente.");
    for (const s of d.seasonalCosts)
      if (
        !s.name?.trim() ||
        !F.validDate(s.date) ||
        !positive(s.amount) ||
        !nonnegative(s.saved) ||
        s.saved > s.amount
      )
        throw Error("Despesa sazonal inválida.");
    for (const n of d.decisionNotes)
      if (
        !n.title?.trim() ||
        typeof n.reason !== "string" ||
        typeof n.result !== "string" ||
        !F.validDate(n.date)
      )
        throw Error("Decisão inválida.");
    for (const s of d.subscriptions)
      if (
        s.usage !== undefined &&
        !["unknown", "often", "rarely", "never"].includes(s.usage)
      )
        throw Error("Utilização de subscrição inválida.");
    for (const t of d.transactions) {
      if (
        t.receiptRequired !== undefined &&
        typeof t.receiptRequired !== "boolean"
      )
        throw Error("Pedido de comprovativo inválido.");
      if (t.attachment && t.source==='Casa integrado' && d.casa?.purchases.some(p=>p.transactionId===t.id&&p.preservedPayment)) {
        const casa=root.CasaFinance||(typeof require==='function'?require('./casa-model.js'):null);
        casa.validatePreservedAttachment(t.attachment);
      } else if (t.attachment) {
        const a = t.attachment;
        if (typeof a.name !== "string" || !a.name.trim() || typeof a.data !== "string")
          throw Error("Comprovativo inválido.");
        const match = a.data.match(/^data:(application\/pdf|image\/(png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/);
        if (!match) throw Error("Comprovativo inválido ou formato não suportado.");
        const mime = match[1];
        const payload = match[3];
        const estimatedBytes = Math.floor(payload.length * 3 / 4) - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0);
        const limit = mime === "application/pdf" ? 8 * 1024 * 1024 : 10 * 1024 * 1024;
        if (!estimatedBytes || estimatedBytes > limit)
          throw Error(mime === "application/pdf" ? "O PDF deve ter no máximo 8 MB." : "A imagem deve ter no máximo 10 MB.");
        if (a.size !== undefined && (!Number.isFinite(Number(a.size)) || Number(a.size) <= 0 || Number(a.size) > limit))
          throw Error("Tamanho do comprovativo inválido.");
      }
    }
    return d;
  }
  function unpack(raw) {
    if (
      raw?.format !== "equilibrio-spaces" ||
      raw.version !== 1 ||
      !Array.isArray(raw.spaces) ||
      !raw.spaces.length ||
      raw.spaces.length > 100
    )
      throw Error("Pacote de espaços inválido.");
    return raw.spaces.map((s) => {
      if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 100)
        throw Error("Nome de espaço inválido.");
      return { name: s.name, data: F.normalize(s.data) };
    });
  }
  function validateChanges(before, after) {
    for (const g of after.goals) {
      const old = before.goals.find((x) => x.id === g.id);
      if (
        g.protectionAccountId===undefined && g.accountId &&
        (!old || old.accountId !== g.accountId || g.current > old.current)
      )
        allocation(after, g.id, g.accountId);
    }
  }
  function importImpact(d, rows) {
    if(!rows.length)return [];
    const draft = structuredClone(d);
    for (const row of rows) F.add(draft, structuredClone(row));
    return draft.accounts
      .map((a) => ({
        name: a.name,
        before: d.accounts.find((x) => x.id === a.id).balance,
        after: a.balance,
        delta: F.money(
          a.balance - d.accounts.find((x) => x.id === a.id).balance,
        ),
      }))
      .filter((a) => a.delta !== 0);
  }
  function importOverlap(d, rows) {
    const clean = (v) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const exact = (t) =>
      JSON.stringify([
        t.date,
        t.type,
        t.account,
        F.cents(t.amount),
        clean(t.description),
      ]);
    const loose = (t, date = t.date) =>
      JSON.stringify([date, t.type, t.account, F.cents(t.amount)]);
    const exactIndex = new Map(),
      looseIndex = new Map(),
      batch = new Map();
    const included = new Set(rows.map((t) => String(t.id)));
    for (const t of [
      ...d.transactions.map((t) => ({
        ...t,
        overlapOrigin: "Registo existente",
      })),
      ...d.pendingImports
        .filter((t) => !included.has(String(t.id)))
        .map((t) => ({ ...t, overlapOrigin: "Outra importação por rever" })),
    ]) {
      for (const [index, token] of [
        [exactIndex, exact(t)],
        [looseIndex, loose(t)],
      ]) {
        if (!index.has(token)) index.set(token, []);
        index.get(token).push(t);
      }

    }
    return rows.map((row) => {
      const token = exact(row),
        matches = exactIndex.get(token) || [];
      const repeated = batch.get(token);
      batch.set(token, row);
      if (matches.length || repeated)
        return {
          row,
          status: "duplicate",
          matches: matches.slice(0, 5),
          repeated,
          total: matches.length + (repeated ? 1 : 0),
        };
      const nearby = [];
      if (F.validDate(row.date))
        for (let n = -2; n <= 2; n++)
          nearby.push(
            ...(looseIndex.get(loose(row, P.dayAdd(row.date, n))) || []),
          );
      return {
        row,
        status: nearby.length ? "possible" : "new",
        matches: nearby.slice(0, 5),
        total: nearby.length,
      };
    });
  }
  function bulkPreview(d, ids, changes) {
    const selected = new Set(ids.map(String));
    const available = new Set(d.transactions.map((t) => String(t.id)));
    if (
      selected.size !== ids.length ||
      ids.some((id) => !available.has(String(id)))
    )
      throw Error("A seleção mudou. Seleciona novamente os movimentos.");
    const draft = structuredClone(d);
    P.bulk(draft, ids.map(String), changes);
    const checked = F.normalize(draft),
      before = new Map(d.transactions.map((t) => [String(t.id), t]));
    const changedFields = (t) =>
      JSON.stringify([
        t.description,
        t.category,
        t.account,
        t.tags || [],
        t.expenseNature || "",
      ]);
    const rows = checked.transactions
      .filter((t) => selected.has(String(t.id)))
      .map((after) => ({ before: before.get(String(after.id)), after }))
      .filter((r) => changedFields(r.before) !== changedFields(r.after));
    return {
      count: ids.length,
      changed: rows.length,
      rows,
      accounts: checked.accounts
        .map((a) => ({
          name: a.name,
          before: d.accounts.find((x) => x.id === a.id).balance,
          after: a.balance,
        }))
        .filter((a) => a.before !== a.after),
    };
  }
  function compareBackup(current, copy) {
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((k) => [k, canonical(value[k])]),
            )
          : value;
    const before = new Map(current.transactions.map((t) => [String(t.id), t]));
    const incoming = new Map(copy.transactions.map((t) => [String(t.id), t]));
    const added = copy.transactions.filter((t) => !before.has(String(t.id)));
    const removed = current.transactions.filter(
      (t) => !incoming.has(String(t.id)),
    );
    const changed = copy.transactions.filter(
      (t) =>
        before.has(String(t.id)) &&
        JSON.stringify(canonical(t)) !==
          JSON.stringify(canonical(before.get(String(t.id)))),
    );
    const remaining = new Set(current.accounts),
      accounts = [];
    for (const a of copy.accounts) {
      const old =
        [...remaining].find((x) => String(x.id) === String(a.id)) ||
        [...remaining].find((x) => x.name === a.name);
      if (old) remaining.delete(old);
      accounts.push({
        name: a.name,
        previousName: old?.name,
        before: old?.balance ?? null,
        after: a.balance,
        status: old ? "both" : "copy",
      });
    }
    for (const old of remaining)
      accounts.push({
        name: old.name,
        before: old.balance,
        after: null,
        status: "current",
      });
    const range = (list) =>
      list.length
        ? {
            from: list.reduce(
              (v, t) => (t.date < v ? t.date : v),
              list[0].date,
            ),
            to: list.reduce((v, t) => (t.date > v ? t.date : v), list[0].date),
          }
        : null;
    return {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      accounts,
      currentRange: range(current.transactions),
      copyRange: range(copy.transactions),
      samples: {
        added: added.slice(0, 10),
        removed: removed.slice(0, 10),
        changed: changed.slice(0, 10),
      },
    };
  }
  function reschedule(d, id, date, reason) {
    const item = d.pendingPayments.find((p) => String(p.id) === String(id));
    if (!item) throw Error("Este compromisso já não está pendente.");
    if (!F.validDate(date) || d.closedMonths.includes(date.slice(0, 7)))
      throw Error("Escolhe uma data num mês aberto.");
    if (d.closedMonths.includes(item.date.slice(0, 7)))
      throw Error("Reabre o mês do compromisso antes de o reagendar.");
    if (date === item.date) throw Error("Escolhe uma data diferente da atual.");
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500)
      throw Error("Indica um motivo até 500 caracteres.");
    item.reschedules ??= [];
    item.reschedules.push({
      from: item.date,
      to: date,
      reason: reason.trim(),
      on: F.today(),
    });
    item.date = date;
  }
  function decisionImpact(d, options={}, start=F.today()) {
    const oneOff=Number(options.oneOff||0),monthlyDelta=Number(options.monthlyDelta||0),date=options.date||start;
    if(![oneOff,monthlyDelta].every(Number.isFinite)||!F.validDate(start)||!F.validDate(date)||date<start||date>P.dayAdd(start,90))throw Error('Valores ou data de decisão inválidos.');
    const limit=options.monthlyCount??120;if(!Number.isInteger(limit)||limit<0||limit>480)throw Error('Número de prestações inválido.');
    const draft=structuredClone(d),base=P.forecast(d,90,start),end=P.dayAdd(start,90);
    const add=(amount,date)=>{if(amount)draft.pendingPayments.push({id:F.id(),description:'Simulação de decisão',date,type:amount>0?'income':'expense',amount:F.money(Math.abs(amount))});};
    add(oneOff,date);
    for(let i=0,m=date.slice(0,7);i<limit;i++,m=P.monthAdd(m,1)){const due=F.dateAt(m,Number(date.slice(8)));if(due>end)break;add(monthlyDelta,due);}
    const scenario=P.forecast(draft,90,start),reserve=P.reserves(d),margin=d.safetyMargin||0,protectedAmount=F.money(reserve.assigned+margin),before=F.money(Math.min(reserve.cash,base.min)-protectedAmount),after=F.money(Math.min(reserve.cash+(date===start?oneOff:0),scenario.min)-protectedAmount);
    return {base,scenario,protectedAmount,reserved:reserve.assigned,margin,availableBefore:before,availableAfter:after,canSpend:after>=0,compromised:F.money(Math.max(0,-after)),firstCompromise:scenario.rows.find(r=>r.balance<protectedAmount)?.date||null};
  }
  root.PlanningFinance = {
    decisionImpact,
    importOverlap,
    bulkPreview,
    compareBackup,
    reschedule,
    payday,
    comparison,
    seasonal,
    allocation,
    protection,
    protectionOverview,
    saveProtection,
    legacyPlanSummary,
    consolidateLegacyPlan,
    consolidateAllLegacyPlans,
    inbox,
    subscriptionReview,
    validate,
    unpack,
    validateChanges,
    importImpact,
    reviewInbox,
    importWork,
    reviewReminder,
    weekly,
    monthlyReview,
    saveForecast,
    forecastResult,
  };
  if (typeof module !== "undefined") module.exports = root.PlanningFinance;
})(globalThis);
