/* Planning, audit and import operations. Functions mutate only their provided draft. */
(function (root) {
  "use strict";
  const F =
    root.Finance ||
    (typeof require !== "undefined" ? require("./finance.js") : null);
  const clone = (x) => structuredClone(x),
    sum = (xs, fn = (x) => x) => F.money(xs.reduce((n, x) => n + fn(x), 0));
  const dayAdd = (s, n) => {
    const dt = new Date(s + "T12:00");
    dt.setDate(dt.getDate() + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const monthAdd = (m, n) => {
    const dt = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  };
  function audit(before, after, message) {
    // Switching between examples and personal data starts a separate ledger.
    // Demo records must never become recoverable personal transactions.
    if (!!before.isDemo !== !!after.isDemo) return;
    const lists = [
      "accounts",
      "transactions",
      "budgets",
      "goals",
      "debts",
      "investments",
      "rules",
      "recurring",
      "pendingPayments",
      "envelopes",
      "reserves",
      "importProfiles",
      "imports",
      "reconciliations",
      "statements",
      "scenarios",
      "annualPlans",
      "savedViews",
      "categoryArchive",
      "installmentPlans",
      "monthReviews",
      "subscriptions",
      "sharedExpenses",
      "assets",
      "investmentTrades",
      "yearNotes",
      "decisionNotes",
      "seasonalCosts",
    ];
    const changes = [];
    const evidence = (x) => {
      if (!x) return null;
      const c = clone(x);
      if (c.attachment?.data)
        c.attachment.data =
          "[Conteúdo do comprovativo: " +
          c.attachment.data.length +
          " caracteres]";
      return c;
    };
    for (const list of lists) {
      const old = new Map((before[list] || []).map((x) => [String(x.id), x])),
        next = new Map((after[list] || []).map((x) => [String(x.id), x]));
      for (const id of new Set([...old.keys(), ...next.keys()])) {
        const a = old.get(id),
          b = next.get(id);
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        changes.push({
          list,
          recordId: id,
          before: evidence(a),
          after: evidence(b),
          kind: !a ? "created" : !b ? "deleted" : "updated",
          name:
            b?.description ||
            b?.name ||
            b?.category ||
            a?.description ||
            a?.name ||
            a?.category ||
            list,
        });
        if (
          a &&
          !b &&
          list !== "imports" &&
          !(
            list === "transactions" &&
            after.transactions.some((t) =>
              t.transferPair?.some((p) => String(p.id) === id),
            )
          )
        ) {
          after.trash.push({
            id: F.id(),
            list,
            record: clone(a),
            deletedAt: new Date().toISOString(),
          });
        }
      }
    }
    if (JSON.stringify(before.practical) !== JSON.stringify(after.practical)) {
      const summary = d => ({ equipment:d.practical?.equipment.length||0, interventions:d.practical?.interventions.length||0, events:d.practical?.events.length||0, captures:d.practical?.captures.map(c=>({id:c.id,status:c.status,transactionId:c.transactionId}))||[], rules:d.practical?.rules.map(r=>({id:r.id,match:r.match,category:r.category,active:r.active}))||[], autonomy:!!d.practical?.autonomy });
      changes.push({list:"practical",recordId:"practical",before:summary(before),after:summary(after),kind:"updated",name:"Planeamento, Casa e dados práticos"});
    }
    after.trash = after.trash.filter(
      (t) => !after[t.list]?.some((x) => String(x.id) === String(t.record.id)),
    );
    if (changes.length || message !== "Alterações guardadas.")
      after.activity.push({
        id: F.id(),
        at: new Date().toISOString(),
        message,
        changes,
      });
    after.activity = after.activity.slice(-150);
  }
  function restoreDeleted(d, id) {
    const entry = d.trash.find((x) => String(x.id) === String(id));
    if (!entry) throw Error("Registo não encontrado.");
    if (d[entry.list].some((x) => String(x.id) === String(entry.record.id)))
      throw Error("O registo já existe.");
    if (entry.list === "transactions") {
      const draft=clone(d),capture=entry.record.captureId?draft.practical?.captures.find(c=>c.id===entry.record.captureId):null;
      if(capture?.status==='linked')throw Error("Esta captura já foi associada a outro movimento. Revê a associação antes de restaurar.");
      const restored=F.add(draft,clone(entry.record));F.applyLinkedPayment(draft,restored);
      if(capture){capture.status='linked';capture.transactionId=restored.id;}
      F.normalize(draft);Object.assign(d,draft);
    }
    else {
      if (
        entry.list === "accounts" &&
        d.accounts.some((a) => a.name === entry.record.name)
      )
        throw Error("Já existe uma conta com este nome.");
      d[entry.list].push(clone(entry.record));
    }
    d.trash = d.trash.filter((x) => x.id !== entry.id);
  }
  function bulk(d, ids, changes) {
    const draft = clone(d);
    bulkDraft(draft, ids, changes);
    F.normalize(draft);
    Object.assign(d, draft);
  }
  function bulkDraft(d, ids, changes) {
    if (
      changes.account &&
      !d.accounts.some((a) => a.name === changes.account && !a.archived)
    )
      throw Error("Seleciona uma conta ativa.");
    const selected = d.transactions.filter((t) => ids.includes(String(t.id)));
    if (!selected.length) throw Error("Seleciona movimentos.");
    const categoryChanges = [changes.category, changes.subcategory, changes.categoryDetail, changes.categorySubdetail].map((value) => String(value || "").trim());
    const hasCategoryChanges = categoryChanges.some(Boolean);
    for (const t of selected) {
      if (d.closedMonths.includes(t.date.slice(0, 7)))
        throw Error("A seleção inclui um mês fechado.");
      if (t.type === "transfer" || t.type === "adjustment" || t.debtId)
        throw Error("Seleciona apenas receitas e despesas simples.");
      if (hasCategoryChanges && t.splits)
        throw Error(
          "Um movimento está dividido por categorias. Edita a divisão individualmente.",
        );
    }
    for (const t of selected) {
      if (changes.description) t.description = String(changes.description).trim();
      if (changes.account && changes.account !== t.account) {
        const old = clone(t);
        F.effect(d, old, -1);
        t.account = changes.account;
        F.effect(d, t);
      }
      if (hasCategoryChanges) {
        const parts = F.categoryParts(t.category || "");
        for (let index = 0; index < categoryChanges.length; index += 1)
          if (categoryChanges[index]) { parts.length = index + 1; parts[index] = categoryChanges[index]; }
        const firstGap = parts.findIndex((part) => !String(part || "").trim());
        if (firstGap >= 0 && parts.slice(firstGap + 1).some((part) => String(part || "").trim()))
          throw Error("Não é possível aplicar um nível de categoria sem os níveis anteriores.");
        t.category = F.categoryPath(parts);
      }
      if (changes.tags)
        t.tags = [...new Set([...(t.tags || []), ...changes.tags])];
      if (changes.expenseNature) t.expenseNature = changes.expenseNature;
    }
  }
  function transferCandidates(items) {
    const incomeIndex=new Map(),matches=[],inbound=new Map();
    for(const t of items)if(t.type==='income'&&!t.refundOf){const token=F.cents(t.amount)+'|'+Date.parse(t.date);if(!incomeIndex.has(token))incomeIndex.set(token,[]);incomeIndex.get(token).push(t);}
    for(const out of items)if(out.type==='expense'&&!out.debtId&&!out.splits){const nearby=[],date=Date.parse(out.date),amount=F.cents(out.amount);for(let offset=-3;offset<=3;offset++)for(const incoming of incomeIndex.get(amount+'|'+(date+offset*86400000))||[])if(incoming.account!==out.account){nearby.push(incoming);inbound.set(incoming,(inbound.get(incoming)||0)+1);}matches.push({out,nearby});}
    return matches.filter(m=>m.nearby.length===1&&inbound.get(m.nearby[0])===1).map(m=>({out:m.out,in:m.nearby[0]}));
  }
  function pairTransfer(d, outId, inId) {
    const out=d.transactions.find(t=>String(t.id)===String(outId)),incoming=d.transactions.find(t=>String(t.id)===String(inId));
    const side=t=>t?.type==='transfer'&&t.transferStatus==='pending'?t.observedSide:t?.type;
    if(!out||!incoming||out===incoming||side(out)!=='expense'||side(incoming)!=='income'||out.account===incoming.account||F.cents(out.amount)!==F.cents(incoming.amount))throw Error('O par não é uma transferência válida.');
    if([out,incoming].some(t=>t.reconciled||d.closedMonths.includes(t.date.slice(0,7))))throw Error('Reabre os meses e retira a conferência antes de alterar o par.');
    if(Math.abs(Date.parse(out.date)-Date.parse(incoming.date))>3*86400000||out.bankReference&&incoming.bankReference&&out.bankReference!==incoming.bankReference)throw Error('As datas ou referências bancárias não correspondem.');
    const ids=new Set([String(out.id),String(incoming.id)]);
    const references=[...d.transactions.flatMap(t=>[t.refundOf,t.transferFeeOf]),...['sharedExpenses','installmentPlans','investmentTrades'].flatMap(k=>(d[k]||[]).map(t=>t.transactionId)),...(d.casa?.purchases||[]).map(t=>t.transactionId),...(d.casa?.returns||[]).map(t=>t.transactionId),...(d.statements||[]).flatMap(s=>(s.rows||[]).map(t=>t.transactionId))];
    if([out,incoming].some(t=>t.refundOf||t.debtId||t.splits?.length||t.pendingId||t.recurringRuleId||t.subscriptionId)||incoming.attachment||references.some(id=>id!=null&&ids.has(String(id))))throw Error('Um movimento tem pagamentos, comprovativos ou outros registos associados. Revê-o individualmente.');
    const original=[clone(out),clone(incoming)];
    out.type='transfer';out.targetAccount=incoming.account;out.targetDate=incoming.date;out.transferStatus='confirmed';delete out.observedSide;
    out.category='Transferências';out.transferPair=original;out.transferEvidence=clone(original);
    out.description='Transferência: '+out.account+' → '+incoming.account;
    d.transactions=d.transactions.filter(t=>t!==incoming);if(d.ledgerCoreVersion===1)F.refreshBalances(d);return out;
  }
  function undoImport(d, id) {
    const draft=clone(d);undoImportDraft(draft,id);F.normalize(draft);Object.assign(d,draft);
  }
  function undoImportDraft(d, id) {
    const batch = d.imports.find((x) => String(x.id) === String(id));
    if (!batch || batch.undone) throw Error("Importação indisponível.");
    const targets = d.transactions.filter(
      (t) =>
        t.importBatchId === batch.id ||
        t.transferPair?.some((p) => p.importBatchId === batch.id),
    );
    if (
      targets.some((t) =>
        t.transferPair?.some((p) => p.importBatchId !== batch.id),
      )
    )
      throw Error(
        "Esta importação tem uma transferência ligada a outra importação. Separa o par antes de desfazer.",
      );
    for (const t of [...targets].sort(
      (a, b) => Number(!!(b.refundOf || b.transferFeeOf)) - Number(!!(a.refundOf || a.transferFeeOf)),
    ))
      F.remove(d, t.id);
    batch.undone = true;
    batch.undoneAt = new Date().toISOString();
  }
  function separateTransfer(d, id) {
    const t = d.transactions.find((row) => String(row.id) === String(id));
    const pair = t?.transferPair;
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(p => p && F.validDate(p.date)))
      throw Error("O movimento não resulta de um par válido.");
    const side = p => p.type === 'transfer' && p.transferStatus === 'pending' ? p.observedSide : p.type;
    if (side(pair[0]) !== 'expense' || side(pair[1]) !== 'income' || pair[0].account === pair[1].account ||
        String(pair[0].id) !== String(t.id) || !pair.every(p => Number.isFinite(p.amount) && p.amount > 0) ||
        F.cents(pair[0].amount) !== F.cents(pair[1].amount))
      throw Error("O par original é inválido. Revê os registos antes de separar.");
    if ([t, ...pair].some(p => p.reconciled))
      throw Error("Retira explicitamente a conferência antes de separar a transferência.");
    if ([t.date, t.targetDate, ...pair.flatMap(p => [p.date, p.targetDate])].filter(Boolean)
        .some(date => d.closedMonths.includes(date.slice(0, 7))))
      throw Error("Reabre os meses atuais e originais envolvidos.");
    const expected = { ...clone(pair[0]), type:'transfer', targetAccount:pair[1].account,
      targetDate:pair[1].date, transferStatus:'confirmed', category:'Transferências',
      transferPair:clone(pair), transferEvidence:clone(pair),
      description:'Transferência: '+pair[0].account+' → '+pair[1].account };
    delete expected.observedSide;
    // Compare every field, including future metadata, without depending on key order.
    const canonical = value => Array.isArray(value) ? value.map(canonical) :
      value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
        .filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])])) : value;
    if (JSON.stringify(canonical(t)) !== JSON.stringify(canonical(expected)))
      throw Error("O par está desatualizado ou tem metadados novos. Revê o movimento antes de separar; a evidência original não será reconstruída.");
    const ids = new Set(pair.map(p => String(p.id)));
    if (ids.size !== 2 || pair.some(p => p.id == null) || d.transactions.some(row => row !== t && ids.has(String(row.id))))
      throw Error("Um identificador original já existe. Revê o par antes de separar.");
    const linked = value => value && typeof value === 'object' && Object.entries(value).some(([k,v]) =>
      (typeof v === 'string' || typeof v === 'number') && (/(Id|Of)$/.test(k) || ['linkedTransaction','transaction','linkedMovement'].includes(k)) && ids.has(String(v)) ||
      Array.isArray(v) && /Ids$/.test(k) && v.some(x => ids.has(String(x))) ||
      v && typeof v === 'object' && linked(v));
    const ignored = new Set(['accounts','transactions','activity','trash','imports','wealthHistory','coreMigration']);
    if (d.transactions.some(row => row !== t && linked(row)) || Object.entries(d).some(([domain,rows]) => !ignored.has(domain) && linked(rows)))
      throw Error("O par tem novas ligações. Revê os registos associados antes de separar.");
    const draft = clone(d);
    draft.transactions = draft.transactions.filter(row => String(row.id) !== String(t.id));
    draft.transactions.push(...clone(pair));
    F.normalize(draft);
    Object.assign(d, draft);
  }
  function budgetAt(d, b, month) {
    if (d.closedMonths.includes(month) && b.frozen?.[month])
      return b.frozen[month];
    const versions = [...(b.versions || [])].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    const conf = (m) =>
      versions.filter((v) => v.month <= m).at(-1) || {
        limit: b.limit,
        carry: false,
      };
    let carry = 0;
    const start = b.carryStart || versions[0]?.month || month;
    for (let m = start, n = 0; m < month && n < 1200; m = monthAdd(m, 1), n++) {
      const config = conf(m);
      carry = config.carry
        ? Math.max(
            0,
            F.money(
              config.limit +
                carry -
                sum(
                  F.expenseEntries(d, m).filter(
                    (t) => F.categoryMatches(t.category, b.category),
                  ),
                  (t) => t.amount,
                ),
            ),
          )
        : 0;
    }
    const config = conf(month);
    return {
      limit: config.limit,
      carry: config.carry ? carry : 0,
      available: F.money(config.limit + (config.carry ? carry : 0)),
      rollover: !!config.carry,
    };
  }
  function saveBudget(d, id, month, values) {
    if (d.closedMonths.includes(month))
      throw Error("Reabre o mês antes de alterar o orçamento.");
    let b = d.budgets.find((x) => String(x.id) === String(id));
    if (!b) {
      if (
        d.budgets.some(
          (x) => x.category.toLowerCase() === values.category.toLowerCase(),
        )
      )
        throw Error("Já existe um orçamento para esta categoria.");
      b = { id: F.id(), category: values.category, limit: 0, versions: [] };
      d.budgets.push(b);
    }
    b.versions ??= [];
    b.versions = b.versions.filter((v) => v.month !== month);
    b.versions.push({ month, limit: values.limit, carry: !!values.carry });
    b.carryStart ??= month;
  }
  function forecast(d, days = 90, start = F.today()) {
    const end = dayAdd(start, days),
      events = d.pendingPayments
        .filter((t) => t.date <= end)
        .map((t) => ({
          ...t,
          date: t.date < start ? start : t.date,
          overdue: t.date < start,
          source: "Pendente",
        }));
    for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = monthAdd(m, 1))
      events.push(
        ...F.upcoming(d, m)
          .filter((t) => t.date <= end)
          .map((t) => ({
            ...t,
            date: t.date < start ? start : t.date,
            overdue: t.date < start,
            source: "Recorrência",
          })),
      );
    for (const debt of d.debts.filter((x) => x.balance > 0 && x.payment > 0)) {
      let remaining = debt.balance;
      for (
        let m = start.slice(0, 7);
        m <= end.slice(0, 7) && remaining > 0;
        m = monthAdd(m, 1)
      ) {
        const date = F.dateAt(m, debt.dueDay || 1);
        if (
          date > end ||
          d.transactions.some(
            (t) => t.debtId === debt.id && t.date.startsWith(m),
          )
        )
          continue;
        const interest = F.money((remaining * (debt.rate || 0)) / 1200),
          amount = Math.min(debt.payment, F.money(remaining + interest));
        events.push({
          id: debt.id + "-" + m,
          date: date < start ? start : date,
          overdue: date < start,
          description: debt.name,
          type: "expense",
          amount,
          source: "Prestação estimada",
        });
        remaining = F.money(remaining - Math.max(0, amount - interest));
      }
    }
    const eventsByDate=new Map();for(const event of events){if(!eventsByDate.has(event.date))eventsByDate.set(event.date,[]);eventsByDate.get(event.date).push(event);}
    let balance = sum(d.accounts, (a) => a.balance);
    const rows = [];
    for (let date = start; date <= end; date = dayAdd(date, 1)) {
      const due = eventsByDate.get(date)||[];
      balance = F.money(
        // This forecast totals every account: internal transfers remain visible,
        // but move money within that total rather than consume it.
        balance + sum(due, (t) => (t.type === "transfer" ? 0 : t.type === "income" ? t.amount : -t.amount)),
      );
      rows.push({ date, balance, events: due });
    }
    return {
      rows,
      events,
      min: Math.min(...rows.map((r) => r.balance)),
      firstNegative: rows.find((r) => r.balance < 0)?.date,
      end: balance,
    };
  }
  function reserves(d) {
    const assigned =
        sum(d.goals, (g) => g.current) + sum(d.reserves, (r) => r.saved),
      cash = sum(d.accounts, (a) => a.balance);
    return { assigned, cash, free: F.money(cash - assigned) };
  }
  function monthlySuggestion(g, start = F.today()) {
    if (!g.deadline)
      return Math.max(0, g.target - g.current) / (g.planMonths || 12);
    const months = Math.max(
      1,
      Math.ceil(
        (new Date(g.deadline + "T12:00") - new Date(start + "T12:00")) /
          (86400000 * 30.4375),
      ),
    );
    return F.money(Math.max(0, g.target - g.current) / months);
  }
  function intelligentInsights(d, month, categories) {
    const percent = (now, before) =>
      before ? ((now - before) / Math.abs(before)) * 100 : null;
    const previousMonths = [-1, -2, -3].map((offset) => monthAdd(month, offset));
    const transactionMerchant = (t) =>
      String(t.beneficiary || t.description || "").trim();
    const cleanExpense = (t) =>
      t.type === "expense" &&
      !t.refundOf &&
      !t.debtId &&
      !t.recurringRuleId &&
      !t.subscriptionId &&
      t.expenseNature !== "fixed";

    const categoryChanges = categories
      .map((c) => ({
        ...c,
        delta: F.money(c.current - c.previous),
        percent: percent(c.current, c.previous),
      }))
      .filter(
        (c) =>
          c.current > 0 &&
          c.previous > 0 &&
          Math.abs(c.delta) >= 10 &&
          Math.abs(c.percent || 0) >= 12,
      )
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);

    const currentVariable = d.transactions.filter(
      (t) => t.date.startsWith(month) && cleanExpense(t),
    );
    const historicalVariable = d.transactions.filter(
      (t) => previousMonths.some((m) => t.date.startsWith(m)) && cleanExpense(t),
    );
    const historicalAverage = historicalVariable.length
      ? F.money(sum(historicalVariable, (t) => t.amount) / historicalVariable.length)
      : 0;
    const unusualExpenses = historicalVariable.length >= 3
      ? currentVariable
          .filter(
            (t) =>
              t.amount >= 20 &&
              t.amount >= Math.max(historicalAverage * 1.6, historicalAverage + 15),
          )
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            description: t.description,
            beneficiary: t.beneficiary || "",
            amount: t.amount,
            average: historicalAverage,
            ratio: historicalAverage ? t.amount / historicalAverage : null,
          }))
      : [];

    const merchantMap = (rows) => {
      const map = new Map();
      for (const t of rows) {
        const name = transactionMerchant(t);
        if (!name) continue;
        const key = name.toLocaleLowerCase("pt-PT");
        const old = map.get(key) || { name, total: 0, count: 0 };
        old.total = F.money(old.total + t.amount);
        old.count += 1;
        map.set(key, old);
      }
      return map;
    };
    const currentMerchants = merchantMap(currentVariable);
    const historicalMerchants = merchantMap(historicalVariable);
    const merchantChanges = [...currentMerchants.entries()]
      .map(([key, now]) => {
        const before = historicalMerchants.get(key);
        if (!before || before.count < 2) return null;
        const currentAverage = F.money(now.total / now.count);
        const previousAverage = F.money(before.total / before.count);
        const change = F.money(currentAverage - previousAverage);
        const changePct = percent(currentAverage, previousAverage);
        return {
          name: now.name,
          currentAverage,
          previousAverage,
          currentCount: now.count,
          previousCount: before.count,
          change,
          percent: changePct,
        };
      })
      .filter(
        (x) =>
          x &&
          Math.abs(x.change) >= 2 &&
          Math.abs(x.percent || 0) >= 12,
      )
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);

    const casaPurchases = Array.isArray(d.casa?.purchases) ? d.casa.purchases : [];
    const currentCasa = casaPurchases.filter((p) => p.date?.startsWith(month));
    const historyCasa = casaPurchases.filter((p) =>
      previousMonths.some((m) => p.date?.startsWith(m)),
    );
    const purchaseGroups = (rows) => {
      const map = new Map();
      for (const p of rows) {
        const name = String(p.store || "").trim();
        if (!name || !Number.isFinite(p.total)) continue;
        const key = name.toLocaleLowerCase("pt-PT");
        const old = map.get(key) || { name, total: 0, count: 0 };
        old.total = F.money(old.total + p.total);
        old.count += 1;
        map.set(key, old);
      }
      return map;
    };
    const currentStores = purchaseGroups(currentCasa);
    const historicalStores = purchaseGroups(historyCasa);
    const casaStoreChanges = [...currentStores.entries()]
      .map(([key, now]) => {
        const before = historicalStores.get(key);
        if (!before || before.count < 2) return null;
        const currentAverage = F.money(now.total / now.count);
        const previousAverage = F.money(before.total / before.count);
        const change = F.money(currentAverage - previousAverage);
        return {
          name: now.name,
          currentAverage,
          previousAverage,
          currentCount: now.count,
          previousCount: before.count,
          change,
          percent: percent(currentAverage, previousAverage),
        };
      })
      .filter(
        (x) =>
          x &&
          Math.abs(x.change) >= 2 &&
          Math.abs(x.percent || 0) >= 10,
      )
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);

    let forecast = null;
    if (month === F.today().slice(0, 7) && root.LifeFinance?.annualReport) {
      try {
        const annual = root.LifeFinance.annualReport(d, month.slice(0, 4));
        if (annual.forecast?.month === month) forecast = annual.forecast;
      } catch {}
    }

    return {
      categoryChanges,
      merchantChanges,
      casaStoreChanges,
      unusualExpenses,
      historicalAverage,
      forecast,
    };
  }

  function insights(d, month) {
    const prev = monthAdd(month, -1),
      current = F.expenseEntries(d, month),
      previous = F.expenseEntries(d, prev),
      cats = [...new Set([...current, ...previous].map((t) => t.category))];
    const categories = cats
      .map((category) => ({
        category,
        current: sum(
          current.filter((t) => t.category === category),
          (t) => t.amount,
        ),
        previous: sum(
          previous.filter((t) => t.category === category),
          (t) => t.amount,
        ),
      }))
      .sort((a, b) => b.current - a.current);
    const merchants = new Map();
    for (const t of current) {
      const key = t.description.trim().toLowerCase();
      const old = merchants.get(key) || {
        name: t.description,
        amount: 0,
        count: 0,
        ids: new Set(),
      };
      old.amount = F.money(old.amount + t.amount);
      old.ids.add(t.id);
      old.count = old.ids.size;
      merchants.set(key, old);
    }
    const subscriptions = [];
    for (const r of d.recurring.filter(
      (r) => r.active && r.type === "expense",
    )) {
      const multiplier = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[
        r.frequency || "monthly"
      ];
      const paid = d.transactions
        .filter(
          (t) =>
            t.type === "expense" &&
            (t.recurringRuleId === r.id ||
              t.description.toLowerCase() === r.description.toLowerCase()),
        )
        .sort((a, b) => b.date.localeCompare(a.date));
      const old = paid.find((t) => t.amount !== r.amount);
      subscriptions.push({
        ...r,
        annual: F.money(r.amount * multiplier),
        previous: old?.amount,
        increase: old ? F.money(r.amount - old.amount) : 0,
      });
    }
    const grouped = new Map();
    for (const t of d.transactions.filter(
      (t) => t.type === "expense" && !t.recurringRuleId && !t.refundOf,
    )) {
      const k = t.description.trim().toLowerCase();
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(t);
    }
    const suggestions = [...grouped.values()]
      .filter(
        (ts) =>
          new Set(ts.map((t) => t.date.slice(0, 7))).size >= 3 &&
          !d.recurring.some(
            (r) =>
              r.description.toLowerCase() === ts[0].description.toLowerCase(),
          ),
      )
      .map((ts) => ({
        description: ts[0].description,
        amount: ts.sort((a, b) => b.date.localeCompare(a.date))[0].amount,
        months: new Set(ts.map((t) => t.date.slice(0, 7))).size,
      }));
    const currentWithoutDebt = current.filter((t) => !t.debtId),
      debtPayments = d.transactions.filter(
        (t) => t.type === "expense" && t.debtId && t.date.startsWith(month),
      );
    return {
      categories,
      merchants: [...merchants.values()].sort((a, b) => b.amount - a.amount),
      subscriptions,
      suggestions,
      fixed: F.money(
        sum(
          currentWithoutDebt.filter((t) => t.expenseNature === "fixed"),
          (t) => t.amount,
        ) + sum(debtPayments, (t) => t.amount),
      ),
      variable: sum(
        currentWithoutDebt.filter((t) => t.expenseNature !== "fixed"),
        (t) => t.amount,
      ),
      fixedDebtPayments: sum(debtPayments, (t) => t.amount),
      smart: intelligentInsights(d, month, categories),
    };
  }
  function snapshot(d) {
    const life = root.LifeFinance || (typeof require === 'function' ? require('./life-model.js') : null);
    const assets = life?.assetTotal(d) || 0;
    const date = F.today(),
      cash = sum(d.accounts, (a) => a.balance),
      investments = sum(d.investments, (i) => i.value),
      debts = sum(d.debts, (x) => x.balance);
    d.wealthHistory = d.wealthHistory.filter((x) => x.date !== date);
    d.wealthHistory.push({
      id: F.id(),
      date,
      cash,
      investments,
      debts,
      assets,
      net: F.money(
        cash + investments + assets - debts,
      ),
    });
    d.wealthHistory = d.wealthHistory.slice(-730);
  }
  const api = {
    balanceAt(d, accountId, date) {
      if (!F.validDate(date) || date > F.today())
        throw Error("Escolhe uma data válida até hoje.");
      const a = d.accounts.find((a) => a.id === accountId);
      if (!a) throw Error("Conta inexistente.");
      return F.balanceAt(d, a, date);
    },
    reconcile(d, accountId, date, actual, adjust = false) {
      if (!Number.isFinite(actual)) throw Error("Indica um saldo válido.");
      const expected = api.balanceAt(d, accountId, date),
        a = d.accounts.find((a) => a.id === accountId);
      const difference = F.money(actual - expected);
      let adjustmentId = null;
      if (adjust && difference) {
        const t = F.add(d, {
          id: F.id(),
          date,
          account: a.name,
          type: "adjustment",
          amount: Math.abs(difference),
          delta: difference,
          category: "Reconciliação",
          description: "Ajuste após conferência do extrato",
        });
        adjustmentId = t.id;
      }
      const record = {
        id: F.id(),
        accountId,
        accountName: a.name,
        date,
        expected,
        actual: F.money(actual),
        difference,
        adjusted: !!(adjust && difference),
        adjustmentId,
        recordedAt: new Date().toISOString(),
      };
      d.reconciliations.push(record);
      if (!difference || adjust) a.reconciledOn = date;
      return record;
    },
    spendingRoom(d, margin = 0, days = 30, start = F.today()) {
      if (!Number.isFinite(margin) || margin < 0)
        throw Error("Margem inválida.");
      const plan = forecast(d, days, start),
        reserved = reserves(d);
      const cash = reserved.cash;
      const low = Math.min(cash, plan.min);
      const available = F.money(low - reserved.assigned - margin);
      return {
        cash,
        reserved: reserved.assigned,
        margin,
        low,
        commitments: F.money(cash - low),
        available,
        days,
        plan,
      };
    },
    simulate(
      d,
      amount,
      date,
      type = "expense",
      monthly = false,
      start = F.today(),
    ) {
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !F.validDate(date) ||
        date < start ||
        date > dayAdd(start, 90)
      )
        throw Error(
          "Indica um valor positivo e uma data nos próximos 90 dias.",
        );
      if (!["expense", "income"].includes(type)) throw Error("Tipo inválido.");
      const draft = clone(d),
        base = forecast(d, 90, start);
      for (
        let m = date.slice(0, 7);
        m <= dayAdd(start, 90).slice(0, 7);
        m = monthAdd(m, 1)
      ) {
        const due = F.dateAt(m, +date.slice(8));
        if (due <= dayAdd(start, 90))
          draft.pendingPayments.push({
            id: F.id(),
            description: "Cenário",
            date: due,
            amount,
            type,
          });
        if (!monthly) break;
      }
      return { base, scenario: forecast(draft, 90, start) };
    },
    audit,
    restoreDeleted,
    bulk,
    transferCandidates,
    pairTransfer,
    separateTransfer,
    undoImport,
    budgetAt,
    saveBudget,
    forecast,
    reserves,
    monthlySuggestion,
    insights,
    snapshot,
    dayAdd,
    monthAdd,
  };
  root.FinancePlus = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

