/* Money and ledger rules shared by the application and its regression tests. */
(function (root) {
  "use strict";
  const cents = (n) => Math.round((Number(n) + Number.EPSILON) * 100);
  const money = (n) => cents(n) / 100;
  const id = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
    const d = new Date(s + "T12:00:00");
    return (
      !isNaN(d) &&
      d.getFullYear() === +s.slice(0, 4) &&
      d.getMonth() + 1 === +s.slice(5, 7) &&
      d.getDate() === +s.slice(8)
    );
  }
  function dateAt(month, day) {
    const [y, m] = month.split("-").map(Number);
    return `${month}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
  }
  function sortTransactions(d, rows = d?.transactions || [], direction = "asc") {
    const all = Array.isArray(d?.transactions) ? d.transactions : [];
    const positions = new Map(all.map((t, index) => [String(t?.id ?? ""), index]));
    const factor = direction === "desc" ? -1 : 1;
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
      const dateOrder = String(a?.date || "").localeCompare(String(b?.date || ""));
      const aPos = positions.has(String(a?.id ?? "")) ? positions.get(String(a?.id ?? "")) : Number.MAX_SAFE_INTEGER;
      const bPos = positions.has(String(b?.id ?? "")) ? positions.get(String(b?.id ?? "")) : Number.MAX_SAFE_INTEGER;
      const stableOrder = aPos - bPos || String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
      return factor * (dateOrder || stableOrder);
    });
  }
  function categoryParts(value) {
    return String(value || "")
      .split(" / ")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  function categoryPath(parts) {
    return (Array.isArray(parts) ? parts : categoryParts(parts))
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  function categoryMatches(value, category) {
    const item = categoryPath(value), target = categoryPath(category);
    return !!target && (item === target || item.startsWith(target + " / "));
  }
  function empty() {
    return {
      version: 2,
      profile: "",
      accounts: [],
      transactions: [],
      budgets: [],
      goals: [],
      debts: [],
      investments: [],
      rules: [],
      pendingImports: [],
      pendingPayments: [],
      envelopes: [],
      reserves: [],
      closedMonths: [],
      recurring: [],
      importProfiles: [],
      imports: [],
      activity: [],
      trash: [],
      wealthHistory: [],
      reconciliations: [],
      statements: [],
      scenarios: [],
      annualPlans: [],
      savedViews: [],
      categoryArchive: [],
      categoryCatalog: [],
      installmentPlans: [],
      monthReviews: [],
      subscriptions: [],
      sharedExpenses: [],
      assets: [],
      investmentTrades: [],
      yearNotes: [],
      decisionNotes: [],
      seasonalCosts: [],
      reminderReviews: [],
      forecastReviews: [],
      monthlyConclusions: [],
      lastBackup: null,
    };
  }
  const arrays = Object.keys(empty()).filter((k) => Array.isArray(empty()[k]));
  function normalize(raw) {
    if (raw?.ledgerCoreVersion !== undefined && raw.ledgerCoreVersion !== 1)
      throw Error('Versão do núcleo financeiro não suportada.');
    if (raw?.version > 2)
      throw Error(
        "Esta cópia pertence a uma versão mais recente. Atualiza a aplicação antes de a abrir.",
      );
    if (
      !raw ||
      !Array.isArray(raw.accounts) ||
      !Array.isArray(raw.transactions)
    )
      throw Error("A cópia não contém contas e movimentos válidos.");
    const d = { ...empty(), ...structuredClone(raw) };
    arrays.forEach((k) => {
      if (!Array.isArray(d[k])) throw Error(`A lista ${k} é inválida.`);
    });
    if (typeof d.profile !== "string")
      throw Error("O nome do perfil é inválido.");
    for (const r of d.reconciliations) {
      if (
        !validDate(r.date) ||
        typeof r.accountId !== "string" ||
        ![r.expected, r.actual, r.difference].every(Number.isFinite) ||
        money(r.actual - r.expected) !== r.difference ||
        typeof r.adjusted !== "boolean"
      )
        throw Error("Confirmação de saldo inválida.");
    }
    if (
      d.safetyMargin !== undefined &&
      (!Number.isFinite(d.safetyMargin) || d.safetyMargin < 0)
    )
      throw Error("A margem de segurança é inválida.");
    for (const k of arrays.filter((k) => k !== "closedMonths")) {
      const seen = new Set();
      for (const row of d[k]) {
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw Error(`Registo inválido em ${k}.`);
        row.id ??= id();
        if (
          !["string", "number"].includes(typeof row.id) ||
          seen.has(String(row.id))
        )
          throw Error(`Identificador inválido ou repetido em ${k}.`);
        seen.add(String(row.id));
      }
    }
    if (
      d.closedMonths.some((m) => typeof m !== "string" || !validDate(m + "-01"))
    )
      throw Error("Existe um mês fechado inválido.");
    for (const [list, fields] of Object.entries({
      accounts: ["name"],
      transactions: ["description", "account"],
      budgets: ["category"],
      goals: ["name"],
      debts: ["name"],
      investments: ["name"],
      rules: ["match", "category"],
      envelopes: ["category"],
      reserves: ["name"],
      pendingImports: ["description", "account"],
      pendingPayments: ["description", "account"],
    })) {
      for (const row of d[list])
        for (const field of fields)
          if (typeof row[field] !== "string" || !row[field].trim())
            throw Error(`Texto inválido em ${list}.`);
    }
    for (const a of d.accounts) {
      if (
        !a.name ||
        !Number.isFinite(a.balance) ||
        !Number.isSafeInteger(cents(a.balance))
      )
        throw Error("Existe uma conta inválida.");
      a.balance = money(a.balance);
    }
    if (new Set(d.accounts.map((a) => a.name)).size !== d.accounts.length)
      throw Error("Existem contas com nomes repetidos.");
    for (const t of [
      ...d.transactions,
      ...d.pendingImports,
      ...d.pendingPayments,
    ]) {
      if (
        !validDate(t.date) ||
        !Number.isFinite(t.amount) ||
        t.amount < 0 ||
        !["income", "expense", "transfer", "adjustment"].includes(t.type)
      )
        throw Error("Existe um movimento com data ou valor inválido.");
      if (t.type === 'transfer' && t.targetDate !== undefined && !validDate(t.targetDate))
        throw Error('A data de destino da transferência é inválida.');
      t.amount = money(t.amount);
      if (!Number.isSafeInteger(cents(t.amount)))
        throw Error("O valor do movimento é demasiado elevado.");
      if (
        t.tags !== undefined &&
        (!Array.isArray(t.tags) || t.tags.some((x) => typeof x !== "string"))
      )
        throw Error("As etiquetas do movimento são inválidas.");
      if (t.note !== undefined && typeof t.note !== "string")
        throw Error("A nota do movimento é inválida.");
      if (
        t.principal !== undefined &&
        (!Number.isFinite(t.principal) ||
          t.principal < 0 ||
          t.principal > t.amount)
      )
        throw Error("Capital amortizado inválido.");
      if (t.debtHistoryPrincipal !== undefined || t.debtHistoryInterest !== undefined || t.debtHistoryCharges !== undefined) {
        const principal = Number(t.debtHistoryPrincipal) || 0;
        const interest = Number(t.debtHistoryInterest) || 0;
        const charges = Number(t.debtHistoryCharges) || 0;
        if (![principal, interest, charges].every(Number.isFinite) || principal < 0 || interest < 0 || charges < 0 || Math.abs(money(principal + interest + charges) - t.amount) > 0.005)
          throw Error("Divisão histórica do crédito inválida.");
        t.debtHistoryPrincipal = money(principal);
        t.debtHistoryInterest = money(interest);
        t.debtHistoryCharges = money(charges);
      }
      if (
        t.delta !== undefined &&
        (!Number.isFinite(t.delta) || Math.abs(money(t.delta)) !== t.amount)
      )
        throw Error("Ajuste de saldo inválido.");
      if (t.splits !== undefined) {
        if (
          t.type !== "expense" ||
          t.debtId ||
          !Array.isArray(t.splits) ||
          t.splits.length < 2 ||
          t.splits.some(
            (s) =>
              typeof s.category !== "string" ||
              !s.category.trim() ||
              !Number.isFinite(s.amount) ||
              s.amount <= 0,
          ) ||
          t.splits.reduce((n, s) => n + cents(s.amount), 0) !== cents(t.amount)
        )
          throw Error(
            "A divisão por categorias deve somar exatamente o valor do movimento.",
          );
      }
    }
    for (const t of d.transactions.filter((t) => t.refundOf)) {
      const original = d.transactions.find(
        (x) => String(x.id) === String(t.refundOf),
      );
      if (
        t.type !== "income" ||
        !original ||
        original.type !== "expense" ||
        original.debtId
      )
        throw Error("O reembolso precisa de uma despesa original válida.");
      const refunded = d.transactions
        .filter((x) => String(x.refundOf) === String(original.id))
        .reduce((n, x) => n + cents(x.amount), 0);
      if (refunded > cents(original.amount))
        throw Error("Os reembolsos ultrapassam a despesa original.");
    }
    for (const b of d.budgets) {
      if (
        b.versions !== undefined &&
        (!Array.isArray(b.versions) ||
          b.versions.some(
            (v) =>
              !validDate(v.month + "-01") ||
              !Number.isFinite(v.limit) ||
              v.limit < 0,
          ))
      )
        throw Error("Histórico de orçamento inválido.");
    }
    for (const g of d.goals) {
      if (g.deadline && !validDate(g.deadline))
        throw Error("Data do objetivo inválida.");
    }
    for (const [key, fields] of Object.entries({
      budgets: ["limit"],
      goals: ["target", "current"],
      debts: ["balance", "payment"],
      investments: ["value", "cost"],
      envelopes: ["allocated"],
      reserves: ["target", "saved"],
      pendingPayments: ["amount"],
    }))
      for (const row of d[key])
        for (const f of fields)
          if (!Number.isFinite(row[f]) || row[f] < 0)
            throw Error(`Valor inválido em ${key}.`);
    for (const debt of d.debts) {
      if (
        debt.rate !== undefined &&
        (!Number.isFinite(debt.rate) || debt.rate < 0)
      )
        throw Error("Taxa de juro inválida.");
      if (
        debt.dueDay !== undefined &&
        (!Number.isInteger(debt.dueDay) || debt.dueDay < 1 || debt.dueDay > 31)
      )
        throw Error("Dia de vencimento inválido.");
    }
    if (raw.version !== 2) {
      d.recurring = d.transactions
        .filter((t) => t.recurring && !t.recurringParent)
        .map((t) => ({
          id: id(),
          description: t.description,
          amount: t.amount,
          type: t.type,
          category: t.category,
          account: t.account,
          start: t.date,
          day: +t.date.slice(8),
          active: true,
          legacyId: t.id,
        }));
      d.version = 2;
    }
    for (const r of d.recurring) {
      validateSplits(r);
      if (
        !validDate(r.start) ||
        !Number.isInteger(r.day) ||
        r.day < 1 ||
        r.day > 31 ||
        typeof r.description !== "string" ||
        typeof r.account !== "string" ||
        !Number.isFinite(r.amount) ||
        r.amount <= 0 ||
        !["income", "expense", "transfer"].includes(r.type) ||
        (r.type === "transfer" && (!r.targetAccount || r.targetAccount === r.account))
      )
        throw Error("Existe uma recorrência inválida.");
      if (
        r.frequency &&
        !["weekly", "monthly", "quarterly", "yearly"].includes(r.frequency)
      )
        throw Error("Frequência inválida.");
      if (r.end && (!validDate(r.end) || r.end < r.start))
        throw Error("Data final da recorrência inválida.");
      if (r.occurrenceOverrides !== undefined) {
        if (!Array.isArray(r.occurrenceOverrides)) throw Error("Ajustes de ocorrência inválidos.");
        const occurrenceDates = new Set();
        for (const o of r.occurrenceOverrides) {
          if (!o || typeof o !== "object" || Array.isArray(o) || !validDate(o.originalDate) || (o.date !== undefined && !validDate(o.date)) || (o.amount !== undefined && (!Number.isFinite(Number(o.amount)) || Number(o.amount) < 0)) || (o.skipped !== undefined && typeof o.skipped !== "boolean") || (o.reason !== undefined && (typeof o.reason !== "string" || o.reason.length > 500)) || occurrenceDates.has(o.originalDate))
            throw Error("Ajustes de ocorrência inválidos.");
          occurrenceDates.add(o.originalDate);
        }
      }
    }
    root.CompleteFinance?.validate(d);
    root.LifeFinance?.validate(d);
    root.PlanningFinance?.validate(d);
    root.ReceiptFinance?.validate(d);
    if (d.casa !== undefined || d.transactions.some(t => ['Casa integrado','Casa reembolso'].includes(t.source))) {
      const casa = typeof module === 'object' && module.exports ? require('./casa-model.js') : root.CasaFinance;
      if (!casa) throw Error('O módulo Casa não está disponível para validar estes dados.');
      casa.validate(d);
    }
    if (d.ledgerCoreVersion === 1) refreshBalances(d);
    return d;
  }
  function accountNameReferences(d, name) {
    name = String(name || "");
    const refs = [];
    const add = (list, row, field, detail = "") => {
      if (row && row[field] === name) refs.push({ list, id: row.id ?? null, field, detail });
    };
    for (const list of ["transactions", "recurring", "pendingPayments", "pendingImports", "annualPlans"]) {
      for (const row of d[list] || []) {
        add(list, row, "account");
        add(list, row, "targetAccount");
      }
    }
    for (const row of d.subscriptions || []) add("subscriptions", row, "account");
    for (const row of d.debts || []) add("debts", row, "account");
    for (const row of d.importProfiles || []) add("importProfiles", row, "defaultAccount");
    for (const statement of d.statements || []) {
      for (const row of statement.rows || []) {
        add("statements", row.source, "account", String(statement.id || ""));
        add("statements", row.source, "targetAccount", String(statement.id || ""));
      }
    }
    for (const row of d.reconciliations || []) {
      if (row.accountName === name) refs.push({ list: "reconciliations", id: row.id ?? null, field: "accountName", detail: "" });
    }
    return refs;
  }
  function renameAccountReferences(d, oldName, newName) {
    oldName = String(oldName || "");
    newName = String(newName || "").trim();
    if (!oldName || !newName) throw Error("Indica um nome de conta válido.");
    if (oldName === newName) return 0;
    let changed = 0;
    const replace = (row, field) => {
      if (row && row[field] === oldName) { row[field] = newName; changed += 1; }
    };
    for (const list of ["transactions", "recurring", "pendingPayments", "pendingImports", "annualPlans"]) {
      for (const row of d[list] || []) {
        replace(row, "account");
        replace(row, "targetAccount");
      }
    }
    for (const row of d.subscriptions || []) replace(row, "account");
    for (const row of d.debts || []) replace(row, "account");
    for (const row of d.importProfiles || []) replace(row, "defaultAccount");
    for (const statement of d.statements || []) for (const row of statement.rows || []) {
      replace(row.source, "account");
      replace(row.source, "targetAccount");
    }
    for (const row of d.reconciliations || []) replace(row, "accountName");
    return changed;
  }
  function activeAccountDependencies(d, name) {
    name = String(name || "");
    const out = [];
    for (const row of d.pendingPayments || []) if (row.account === name || row.targetAccount === name) out.push("pagamentos agendados");
    for (const row of d.recurring || []) if (row.active !== false && (row.account === name || row.targetAccount === name)) out.push("recorrências ativas");
    for (const row of d.subscriptions || []) if (row.status !== "cancelled" && row.account === name) out.push("subscrições ativas");
    for (const row of d.debts || []) if (row.account === name && Number(row.balance || 0) > 0 && Number(row.payment || 0) > 0) out.push("créditos ativos");
    return [...new Set(out)];
  }
  function transferFold(value) {
    return String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function transferAccountKey(value) {
    const generic = new Set(["conta", "account", "banco", "bank", "cartao", "cartao", "de", "da", "do"]);
    return transferFold(value).split(" ").filter((token) => token && !generic.has(token)).join(" ");
  }
  function resolveTransferAccount(d, rawName) {
    const raw = String(rawName || "").trim();
    if (!raw) return null;
    const accounts = (d.accounts || []).filter((account) => !account.archived);
    const exact = accounts.find((account) => account.name === raw);
    if (exact) return exact;
    const folded = transferFold(raw);
    const foldedMatches = accounts.filter((account) => transferFold(account.name) === folded);
    if (foldedMatches.length === 1) return foldedMatches[0];
    const key = transferAccountKey(raw);
    if (!key) return null;
    const keyMatches = accounts.filter((account) => transferAccountKey(account.name) === key);
    return keyMatches.length === 1 ? keyMatches[0] : null;
  }
  function repairTransferAccountAliases(d) {
    const repairs = [];
    for (const tx of d.transactions || []) {
      if (tx.type !== "transfer") continue;
      for (const field of ["account", "targetAccount"]) {
        const original = tx[field];
        if (!original || (d.accounts || []).some((account) => account.name === original)) continue;
        const resolved = resolveTransferAccount(d, original);
        if (!resolved || resolved.name === original) continue;
        tx[field] = resolved.name;
        repairs.push({ transactionId: tx.id, account: resolved.name, from: original, field, kind: "account-alias" });
      }
    }
    return repairs;
  }
  function transactionDeltaForAccount(t, accountName) {
    const amount = Number(t?.amount) || 0;
    if (t?.type === "transfer") {
      if (t.transferStatus === "pending")
        return t.account === accountName ? money(t.observedSide === 'income' ? amount : -amount) : 0;
      let delta = 0;
      if (t.targetAccount === accountName && t.account !== accountName) delta += amount;
      if (t.account === accountName && t.targetAccount !== accountName) delta -= amount;
      return money(delta);
    }
    if (t?.account !== accountName) return 0;
    if (t.type === "income") return money(amount);
    if (t.type === "expense") return money(-amount);
    if (t.type === "adjustment") return Number.isFinite(Number(t.delta)) ? money(Number(t.delta)) : null;
    return 0;
  }

  // The saved balance is a projection. Only the opening balance and the ledger
  // determine it; reconciliation adjustments are ordinary ledger entries.
  function netForAccount(d, name, predicate = () => true) {
    let total = 0;
    for (const t of d.transactions || []) {
      if (!predicate(t)) continue;
      const delta = transactionDeltaForAccount(t, name);
      if (delta === null) throw Error('Um ajuste antigo sem direção impede reconstruir este saldo.');
      total += cents(delta);
      if (!Number.isSafeInteger(total)) throw Error('Saldo fora dos limites permitidos.');
    }
    return total / 100;
  }
  function openingBalance(d, account) {
    return Number.isFinite(account.openingBalance) ? account.openingBalance : money(account.balance - netForAccount(d, account.name));
  }
  function balanceAt(d, account, date = '9999-12-31') {
    return money(openingBalance(d, account) + netForAccount(d, account.name, t => (t.targetAccount === account.name ? t.targetDate || t.date : t.date) <= date));
  }
  function refreshBalances(d) {
    const totals = new Map((d.accounts || []).map(a => [a.name, 0]));
    const names = new Set(totals.keys());
    const accumulate = (name, delta) => {
      if (delta === null) throw Error('Um ajuste antigo sem direção impede reconstruir este saldo.');
      const total = totals.get(name) + cents(delta);
      if (!Number.isSafeInteger(total)) throw Error('Saldo fora dos limites permitidos.');
      totals.set(name, total);
    };
    for (const t of d.transactions || []) {
      if (!names.has(t.account)) throw Error('A conta do movimento já não existe.');
      if (t.type === 'transfer') {
        if (t.transferStatus === 'pending') {
          if (!['income','expense'].includes(t.observedSide) || t.targetAccount) throw Error('Transferência por confirmar inválida.');
        } else if (!names.has(t.targetAccount) || t.account === t.targetAccount) throw Error('Transferência sem contas distintas válidas.');
      }
      accumulate(t.account, transactionDeltaForAccount(t, t.account));
      if (t.type === 'transfer' && t.transferStatus !== 'pending')
        accumulate(t.targetAccount, transactionDeltaForAccount(t, t.targetAccount));
    }
    for (const a of d.accounts || []) {
      const net = totals.get(a.name) / 100;
      if (a.openingBalance === undefined) a.openingBalance = money(a.balance - net);
      if (!Number.isFinite(a.openingBalance) || !Number.isSafeInteger(cents(a.openingBalance))) throw Error('Saldo inicial inválido.');
      const total = cents(a.openingBalance) + totals.get(a.name);
      if (!Number.isSafeInteger(total)) throw Error('Saldo fora dos limites permitidos.');
      a.balance = total / 100;
    }
    return d;
  }
  function setAccountBalance(d, account, balance) {
    if (!Number.isFinite(balance)) throw Error('Saldo inválido.');
    account.openingBalance = money(balance - netForAccount(d, account.name));
    account.balance = money(balance);
  }
  function transferCandidate(t) {
    return ['income', 'expense'].includes(t.type) && !t.refundOf && !t.debtId && !t.splits?.length &&
      /(^| )(transferencia|transferencias|transfer|transf|trf)( |$)/.test(transferFold([t.category, t.description].filter(Boolean).join(' ')));
  }
  function prepareTransfer(t) {
    if (transferCandidate(t)) {
      t.observedSide = t.type;
      t.type = 'transfer';
      t.transferStatus = 'pending';
      t.targetAccount = '';
      t.category = 'Transferência por confirmar';
    } else if (t.type === 'transfer' && !t.transferStatus) t.transferStatus = 'confirmed';
    return t;
  }
  function reconcileTransfers(d) {
    const pending = d.transactions.filter(t => t.type === 'transfer' && t.transferStatus === 'pending');
    const outs = pending.filter(t => t.observedSide === 'expense');
    const ins = pending.filter(t => t.observedSide === 'income');
    const compatible = (a, b) => a.account !== b.account && cents(a.amount) === cents(b.amount) &&
      Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= 3 * 86400000 &&
      (!a.bankReference || !b.bankReference || a.bankReference === b.bankReference);
    const matches = outs.map(out => ({ out, candidates: ins.filter(incoming => compatible(out, incoming)) }));
    const inboundMatches = new Map();
    for (const row of matches) for (const incoming of row.candidates)
      inboundMatches.set(incoming, (inboundMatches.get(incoming) || 0) + 1);
    const referenced = new Set([
      ...d.transactions.flatMap(t => [t.refundOf, t.transferFeeOf]),
      ...['sharedExpenses','installmentPlans','investmentTrades'].flatMap(list => (d[list] || []).map(t => t.transactionId)),
      ...(d.casa?.purchases || []).map(t => t.transactionId),
      ...(d.casa?.returns || []).map(t => t.transactionId),
      ...(d.statements || []).flatMap(s => (s.rows || []).map(r => r.transactionId)),
    ].filter(v => v != null).map(String));
    const removed = new Set(), paired = [];
    for (const { out, candidates } of matches) {
      if (candidates.length !== 1) continue;
      const incoming = candidates[0];
      // Both directions must be unambiguous, independently of iteration order.
      if (inboundMatches.get(incoming) !== 1) continue;
      if ((d.closedMonths || []).some(m => out.date.startsWith(m) || incoming.date.startsWith(m))) continue;
      if (out.reconciled || incoming.reconciled || referenced.has(String(incoming.id))) continue;
      out.transferEvidence = [structuredClone(out), structuredClone(incoming)];
      out.targetAccount = incoming.account;
      out.targetDate = incoming.date;
      out.transferStatus = 'confirmed';
      out.category = 'Transferência';
      delete out.observedSide;
      removed.add(incoming.id);
      paired.push(out.id);
    }
    d.transactions = d.transactions.filter(t => !removed.has(t.id));
    if (d.ledgerCoreVersion === 1) refreshBalances(d);
    return paired;
  }
  function repairCancelledSavingsCredits(d) {
    if(d.coreMigration?.savingsCredit051) return d;
    const corrections=[];
    if(d.coreMigration?.version==='0.39.50') for(const a of d.accounts){
      if(!/poupanca|savings/.test(transferFold(a.name+' '+a.type)) || a.reconciledOn || (d.reconciliations||[]).some(r=>r.accountId===a.id||r.accountName===a.name))continue;
      const rows=d.transactions.filter(t=>t.account===a.name||t.targetAccount===a.name);
      if(!rows.length||!rows.every(t=>t.type==='transfer'&&t.transferStatus==='confirmed'&&t.targetAccount===a.name&&!t.reconciled))continue;
      const imported=rows.filter(t=>t.mmexBalanceAfter!==undefined&&t.mmexBalanceAfter!==null&&Number.isFinite(Number(t.mmexBalanceAfter)));
      const missing=money(imported.reduce((n,t)=>n+cents(t.amount),0)/100);
      const prior=d.coreMigration.previousBalances?.find(p=>p.id===a.id);
      // Exact signature of .50 preserving a stale cache: the synthetic opening
      // cancels precisely the imported destination legs, while the old balance
      // already includes every manually entered leg. Never infer from zero alone.
      if(missing>0&&prior&&cents(a.openingBalance)===-cents(missing)&&cents(prior.balance)===cents(netForAccount(d,a.name))-cents(missing)){
        corrections.push({accountId:a.id,previousOpening:a.openingBalance,credited:missing,transactionIds:imported.map(t=>t.id)});
        a.openingBalance=0;
      }
    }
    d.coreMigration={...d.coreMigration,savingsCredit051:{version:'0.39.51',corrections}};
    return d;
  }
  function migrateLedgerCore(d) {
    if (d.ledgerCoreVersion === 1) return refreshBalances(repairCancelledSavingsCredits(d));
    if (d.ledgerCoreVersion !== undefined) throw Error('Versão do núcleo financeiro não suportada.');
    repairTransferAccountAliases(d);
    const before = d.accounts.map(a => ({ id: a.id, balance: a.balance }));
    const linkedIds = new Set([
      ...d.transactions.flatMap(t => [t.refundOf,t.transferFeeOf]),
      ...['sharedExpenses','installmentPlans','investmentTrades'].flatMap(list => (d[list] || []).map(t => t.transactionId)),
      ...(d.casa?.purchases || []).map(t => t.transactionId), ...(d.casa?.returns || []).map(t => t.transactionId),
    ].filter(value => value !== undefined && value !== null).map(String));
    for (const t of d.transactions) {
      // Linked business operations keep their meaning and references.
      const linked = linkedIds.has(String(t.id));
      if (!linked) prepareTransfer(t);
      if (t.type === 'transfer' && t.transferStatus !== 'pending' && !(d.accounts || []).some(a => a.name === t.targetAccount && a.name !== t.account)) {
        t.suggestedTargetAccount = t.targetAccount || '';
        t.targetAccount = ''; t.transferStatus = 'pending'; t.observedSide = 'expense'; t.category = 'Transferência por confirmar';
      }
    }
    reconcileTransfers(d);
    for (const a of d.accounts) {
      const related = d.transactions.filter(t => t.account === a.name || t.targetAccount === a.name);
      const reconciled = (d.reconciliations || []).some(r => r.accountId === a.id || r.accountName === a.name);
      // A zero savings cache may be repaired only from explicit, complete
      // transfer records. Missing counterparts never create money.
      const incomingOnly = related.length && related.every(t => t.type === 'transfer' && t.transferStatus === 'confirmed' && t.targetAccount === a.name);
      if (a.balance === 0 && !reconciled) {
        const ordered = sortTransactions(d);
        const reference = ordered.findLastIndex(t => t.account === a.name && t.mmexBalanceAfter !== undefined && t.mmexBalanceAfter !== null && Number.isFinite(Number(t.mmexBalanceAfter)));
        if (reference >= 0) {
          a.balance = money(Number(ordered[reference].mmexBalanceAfter) + ordered.slice(reference+1).reduce((sum,t) => sum + (transactionDeltaForAccount(t,a.name) || 0),0));
        } else if (incomingOnly && /poupanca|savings/.test(transferFold(a.name + ' ' + a.type))) a.balance = netForAccount(d, a.name);
      }
      a.openingBalance = money(a.balance - netForAccount(d, a.name));
    }
    d.ledgerCoreVersion = 1;
    d.coreMigration = { version: '0.39.50', previousBalances: before, pending: d.transactions.filter(t => t.transferStatus === 'pending').map(t => t.id) };
    return refreshBalances(repairCancelledSavingsCredits(d));
  }
  function importTransaction(d, row, options = {}) {
    const duplicate = d.transactions.some(t => [t, ...(t.transferEvidence || [])].some(e =>
      (row.id != null && String(e.id) === String(row.id)) || (row.mmexId && String(e.mmexId || '') === String(row.mmexId))));
    if (duplicate) throw Error('Este movimento já foi importado.');
    const prepared = prepareTransfer({ ...row });
    if (prepared.transferStatus === 'pending') {
      const incoming = prepared.observedSide === 'income';
      const matches = d.transactions.filter(t => t.type === 'transfer' && t.transferStatus !== 'pending' &&
        !t.reconciled && !(d.closedMonths || []).some(m => [t.date,t.targetDate || t.date,row.date].some(date => date.startsWith(m))) &&
        (incoming ? t.targetAccount : t.account) === row.account && cents(t.amount) === cents(row.amount) &&
        Math.abs(Date.parse(incoming ? t.targetDate || t.date : t.date) - Date.parse(row.date)) <= 3 * 86400000 &&
        (!t.bankReference || !row.bankReference || t.bankReference === row.bankReference) &&
        !(t.transferEvidence || []).some(e => e.account === row.account && (e.observedSide || e.type) === prepared.observedSide) &&
        (incoming || !(t.mmexId || t.importBatchId)));
      if (matches.length === 1) {
        const matched = matches[0];
        matched.transferEvidence = [...(matched.transferEvidence || []), structuredClone(row)];
        if (incoming) matched.targetDate = row.date;
        if (d.ledgerCoreVersion === 1) refreshBalances(d);
        return matched;
      }
    }
    const result = add(d, prepared);
    if (options.reconcile !== false) reconcileTransfers(d);
    return result;
  }

  function effect(d, t, sign = 1) {
    const a = d.accounts.find(a => a.name === t.account);
    if (!a) throw Error("A conta do movimento já não existe.");
    if (t.type === 'transfer') {
      if (t.transferStatus === 'pending') {
        if (!['income','expense'].includes(t.observedSide) || t.targetAccount) throw Error('Transferência por confirmar inválida.');
      } else if (!d.accounts.some(b => b.name === t.targetAccount && b !== a)) throw Error('Escolhe duas contas diferentes.');
    }
    const affected = d.accounts.filter(a => a.name === t.account || (t.type === 'transfer' && t.transferStatus !== 'pending' && a.name === t.targetAccount));
    const deltas = affected.map(a => transactionDeltaForAccount(t, a.name));
    if (deltas.some(delta => delta === null)) throw Error('Este ajuste antigo não pode ser revertido automaticamente.');
    affected.forEach((a,i) => { a.balance = money(a.balance + sign * deltas[i]); });
    if (t.debtId) {
      const debt = d.debts.find((x) => String(x.id) === String(t.debtId));
      if (debt) debt.balance = money(debt.balance - sign * (t.principal || 0));
    }
  }
  function noteTone(t) {
    const colors = ['blue','green','purple','orange','red'];
    if (t.noteColor === 'default' || colors.includes(t.noteColor)) return t.noteColor;
    const text = categoryPath(t.category || 'Outros');
    let hash = 0;
    for (const character of text) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
    return colors[hash % colors.length];
  }
  function validateSplits(t) {
    if (t.splits === undefined) return;
    if (t.type !== 'expense' || t.debtId || !Array.isArray(t.splits) || t.splits.length < 2 ||
        t.splits.some(s => !s || typeof s.category !== 'string' || !s.category.trim() ||
          !Number.isFinite(s.amount) || s.amount <= 0 || !Number.isSafeInteger(cents(s.amount))) ||
        t.splits.reduce((n,s) => n + cents(s.amount), 0) !== cents(t.amount))
      throw Error('A divisão por categorias deve somar exatamente o valor do movimento.');
  }
  function add(d, t) {
    validateSplits(t);
    if (!validDate(t.date) || !Number.isFinite(+t.amount) || +t.amount <= 0)
      throw Error("Preenche uma data e um valor superiores a zero.");
    if (!["income", "expense", "transfer", "adjustment"].includes(t.type))
      throw Error("Tipo de movimento inválido.");
    if (!Number.isSafeInteger(cents(t.amount)) || money(t.amount) <= 0)
      throw Error("Valor fora dos limites permitidos.");
    if (t.id && d.transactions.some((x) => String(x.id) === String(t.id)))
      throw Error("Este movimento já foi registado.");
    if (d.closedMonths.includes(t.date.slice(0, 7)))
      throw Error("Reabre o mês antes de alterar os movimentos.");
    t = { ...t, id: t.id || id(), amount: money(t.amount), ...(t.splits ? {splits:structuredClone(t.splits)} : {}) };
    if (d.ledgerCoreVersion === 1) refreshBalances(d);
    effect(d, t);
    if (t.refundOf) {
      const plan = d.installmentPlans.find(
          (p) => p.transactionId === t.refundOf,
        ),
        card = d.accounts.find((a) => a.id === plan?.cardId);
      if (plan && card?.name === t.account) {
        let left = t.amount;
        t.installmentCredits = [];
        for (const p of plan.payments.slice().reverse()) {
          const reduction = money(Math.min(left, p.amount - p.paid));
          if (reduction) {
            p.amount = money(p.amount - reduction);
            left = money(left - reduction);
            t.installmentCredits.push({ id: p.id, amount: reduction });
          }
        }
      }
    }
    d.transactions.push(t);
    if (d.ledgerCoreVersion === 1) refreshBalances(d);
    return t;
  }
  function remove(d, tid) {
    if(d.casa?.returns?.some(r=>r.transactionId===tid))throw Error('Abre a compra Casa para anular o reembolso com o stock associado.');
    if (d.casa?.purchases?.some(p => p.transactionId === tid))
      throw Error('Este movimento pertence a uma compra Casa. Abre a compra para a eliminar com o respetivo movimento.');
    const i = d.transactions.findIndex((t) => String(t.id) === String(tid));
    if (i < 0) return;
    if (d.sharedExpenses.some((s) => s.transactionId === tid))
      throw Error("Remove primeiro a partilha associada.");
    if (d.investmentTrades.some((s) => s.transactionId === tid))
      throw Error("Reverte a operação no módulo Investimentos.");
    if (d.transactions.some((t) => t.transferFeeOf === tid))
      throw Error("Remove primeiro a comissão associada à transferência.");
    if (d.installmentPlans.some((p) => p.transactionId === tid))
      throw Error("Cancela o plano de prestações antes de apagar a compra.");
    if (d.transactions.some((t) => String(t.refundOf) === String(tid)))
      throw Error("Remove primeiro os reembolsos associados a esta despesa.");
    if (d.closedMonths.includes(d.transactions[i].date.slice(0, 7)))
      throw Error("Reabre o mês antes de apagar movimentos.");
    const removed = d.transactions[i];
    if (removed.installmentPaymentId)
      for (const plan of d.installmentPlans) {
        const part = plan.payments.find(
          (p) => p.id === removed.installmentPaymentId,
        );
        if (part) part.paid = money(part.paid - removed.amount);
      }
    effect(d, d.transactions[i], -1);
    for (const credit of removed.installmentCredits || [])
      for (const plan of d.installmentPlans) {
        const part = plan.payments.find((p) => p.id === credit.id);
        if (part) part.amount = money(part.amount + credit.amount);
      }
    if (removed.pendingId) {
      let p = d.pendingPayments.find((p) => p.id === removed.pendingId);
      if (p) {
        p.amount = money(p.amount + removed.amount);
        const oldHistory = p.reschedules || [],
          history = removed.reschedules || [];
        if (
          history.length > oldHistory.length &&
          history[oldHistory.length].from === p.date &&
          oldHistory.every(
            (r, index) => JSON.stringify(r) === JSON.stringify(history[index]),
          )
        ) {
          p.reschedules = structuredClone(history);
          p.date = removed.originalDueDate;
        }
      } else
        d.pendingPayments.push({
          id: removed.pendingId,
          description: removed.description,
          account: removed.account,
          type: removed.type,
          amount: removed.amount,
          date: removed.originalDueDate,
          category: removed.category,
          ...(removed.reschedules
            ? { reschedules: structuredClone(removed.reschedules) }
            : {}),
        });
    }
    for (const s of d.statements)
      for (const r of s.rows)
        if (r.transactionId === tid) {
          r.transactionId = null;
          r.status = "pending";
        }
    d.transactions.splice(i, 1);
    if (d.ledgerCoreVersion === 1) refreshBalances(d);
  }
  function update(d, tid, replacement) {
    const original = (d.transactions || []).find((t) => String(t.id) === String(tid));
    if (!original) throw Error("O movimento já não existe.");
    const draft = structuredClone(d);
    const draftOriginal = draft.transactions.find((t) => String(t.id) === String(tid));
    const linkedRefunds = draft.transactions.filter((t) => String(t.refundOf || "") === String(tid));
    if (linkedRefunds.length) {
      if ((replacement?.type || draftOriginal.type) !== "expense")
        throw Error("Uma despesa com reembolsos associados tem de continuar a ser uma despesa.");
      const refunded = linkedRefunds.reduce((n, t) => n + cents(t.amount), 0);
      if (refunded > cents(replacement?.amount ?? draftOriginal.amount))
        throw Error("O novo valor da despesa é inferior ao total já reembolsado. Ajusta primeiro o valor ou os reembolsos.");
      for (const refund of linkedRefunds) delete refund.refundOf;
    }
    remove(draft, tid);
    const added = add(draft, { ...replacement, id: draftOriginal.id });
    for (const refund of linkedRefunds) refund.refundOf = added.id;
    // Valida a coerência completa antes de substituir o ledger original.
    normalize(draft);
    for (const key of Object.keys(d)) delete d[key];
    Object.assign(d, draft);
    return d.transactions.find((t) => String(t.id) === String(added.id));
  }
  function totals(d, month) {
    let income = 0;
    for (const t of d.transactions) {
      if (!t.date.startsWith(month)) continue;
      if (t.type === "income" && !t.refundOf) income += t.amount;
    }
    return {
      income: money(income),
      expense: money(
        expenseEntries(d, month).reduce((s, t) => s + t.amount, 0),
      ),
      balance: money(d.accounts.reduce((s, a) => s + a.balance, 0)),
    };
  }
  function upcoming(d, month, options = {}) {
    const includeCompleted = options === true || Boolean(options?.includeCompleted);
    const overridesOf = (owner) => Array.isArray(owner?.occurrenceOverrides)
      ? owner.occurrenceOverrides.filter((o) => o && validDate(o.originalDate) && validDate(o.date || o.originalDate))
      : [];
    const overrideFor = (owner, originalDate) => overridesOf(owner).find((o) => o.originalDate === originalDate) || null;
    const legacyMatched = new Set();
    const cleanText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-PT").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const identityTokens = (value) => cleanText(value).split(" ").filter(Boolean).map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token);
    const strongIdentityMatch = (ownerName, tx) => {
      const wanted = identityTokens(ownerName);
      const got = new Set(identityTokens([tx?.description, tx?.beneficiary].filter(Boolean).join(" ")));
      if (!wanted.length || !got.size) return false;
      return wanted.every((token) => got.has(token)) || [...got].every((token) => wanted.includes(token));
    };
    const dayDistance = (a, b) => Math.abs((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
    const sameCategoryIdentity = (owner, tx) => {
      const ownerCategory = cleanText(categoryPath(owner?.category || ""));
      const txCategory = cleanText(categoryPath(tx?.category || ""));
      if (!ownerCategory || !txCategory) return false;
      return ownerCategory === txCategory || ownerCategory.startsWith(txCategory + " ") || txCategory.startsWith(ownerCategory + " ");
    };
    const legacyOccurrencePosted = (owner, kind, originalDate, scheduledDate, expectedAmount, estimated = false) => {
      const ownerId = String(owner.id);
      const description = cleanText(owner.description || owner.name);
      const type = kind === "subscription" ? "expense" : owner.type;
      const months = new Set([originalDate.slice(0, 7), scheduledDate.slice(0, 7)]);
      const candidates = d.transactions
        .filter((t) => !legacyMatched.has(String(t.id)) && months.has(String(t.date || "").slice(0, 7)))
        .filter((t) => t.type === type && !t.debtId && !t.pendingId)
        .filter((t) => !owner.account || !t.account || t.account === owner.account)
        .filter((t) => {
          const linkedSame = kind === "subscription"
            ? String(t.subscriptionId || "") === ownerId
            : String(t.recurringRuleId || "") === ownerId;
          const linkedOther = kind === "subscription"
            ? Boolean(t.subscriptionId && String(t.subscriptionId) !== ownerId) || Boolean(t.recurringRuleId)
            : Boolean(t.recurringRuleId && String(t.recurringRuleId) !== ownerId) || Boolean(t.subscriptionId);
          if (linkedOther) return false;
          if (linkedSame) return !t.recurringDate || t.recurringDate.slice(0, 7) === originalDate.slice(0, 7);
          if (t.recurringRuleId || t.subscriptionId) return false;
          const txDescription = cleanText(t.description);
          const txIdentity = cleanText([t.description, t.beneficiary].filter(Boolean).join(" "));
          const identityMatch = kind === "subscription"
            ? Boolean(description && (txIdentity.includes(description) || description.includes(txDescription) || strongIdentityMatch(owner.name || owner.description, t)))
            : txDescription === description;
          const categoryMatch = sameCategoryIdentity(owner, t);
          if (!identityMatch && !categoryMatch) return false;
          if (!estimated && Number.isFinite(+expectedAmount) && Math.abs(cents(t.amount) - cents(expectedAmount)) > 1) return false;
          // A categoria é um fallback útil quando o banco usa outro nome de comerciante.
          // Para reduzir falsos positivos, só a aceitamos perto da data esperada.
          if (!identityMatch && categoryMatch && dayDistance(t.date, scheduledDate) > 14) return false;
          return true;
        })
        .sort((a, b) => dayDistance(a.date, scheduledDate) - dayDistance(b.date, scheduledDate));
      const match = candidates[0] || null;
      if (!match) return null;
      legacyMatched.add(String(match.id));
      return match;
    };
    const postedRecurring = (rule, originalDate, scheduledDate, expectedAmount, estimated) => {
      const exact = d.transactions.find((t) =>
        (String(t.recurringRuleId) === String(rule.id) && t.recurringDate === originalDate) ||
        (rule.legacyId && (t.id === rule.legacyId || t.recurringParent === rule.legacyId) && (t.recurringDate || t.date) === originalDate)
      );
      return exact || legacyOccurrencePosted(rule, "recurring", originalDate, scheduledDate, expectedAmount, estimated);
    };
    const postedSubscription = (subscription, originalDate, scheduledDate, expectedAmount) => {
      const occurrenceMonth = String(originalDate || scheduledDate || "").slice(0, 7);
      const exact = d.transactions.find((t) => {
        if (String(t.subscriptionId || "") !== String(subscription.id)) return false;
        if (t.recurringDate === originalDate || t.scheduledDate === originalDate || t.originalDueDate === originalDate) return true;
        const linkedMonth = String(t.recurringDate || t.scheduledDate || t.originalDueDate || t.date || "").slice(0, 7);
        return Boolean(occurrenceMonth && linkedMonth === occurrenceMonth);
      });
      return exact || legacyOccurrencePosted(subscription, "subscription", originalDate, scheduledDate, expectedAmount, false);
    };
    const estimateRecurringAmount = (rule, originalDate) => {
      let amount = rule.amount, estimated = rule.valueMode === "estimated";
      if (estimated && rule.estimateMode === "average") {
        const n = Math.max(1, Math.min(24, +rule.averageMonths || 3));
        const actuals = d.transactions
          .filter((t) => String(t.recurringRuleId) === String(rule.id) && t.date < originalDate && Number.isFinite(+t.amount))
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
        if (actuals.length) amount = money(actuals.reduce((sum, t) => sum + +t.amount, 0) / actuals.length);
      }
      return { amount, estimated };
    };
    const recurring = d.recurring
      .filter((r) => r.active && (r.start.slice(0, 7) <= month || overridesOf(r).some((o) => (o.date || o.originalDate).slice(0, 7) === month)))
      .flatMap((r) => {
        const frequency = r.frequency || "monthly", nominalDates = [];
        if (frequency === "weekly") {
          const start = new Date(r.start + "T12:00"), first = new Date(month + "-01T12:00");
          const offset = (start.getDay() - first.getDay() + 7) % 7;
          for (let day = 1 + offset; day <= new Date(+month.slice(0, 4), +month.slice(5), 0).getDate(); day += 7) nominalDates.push(dateAt(month, day));
        } else {
          const diff = (+month.slice(0, 4) - +r.start.slice(0, 4)) * 12 + (+month.slice(5) - +r.start.slice(5, 7));
          const step = frequency === "yearly" ? 12 : frequency === "quarterly" ? 3 : 1;
          if (diff >= 0 && diff % step === 0) nominalDates.push(dateAt(month, r.day));
        }
        const originalDates = new Set(nominalDates);
        const movedIntoMonth = overridesOf(r)
          .filter((o) => (o.date || o.originalDate).slice(0, 7) === month && !originalDates.has(o.originalDate))
          .map((o) => o.originalDate);
        return [...nominalDates, ...movedIntoMonth].map((originalDate) => {
          if (originalDate < r.start || (r.end && originalDate > r.end)) return null;
          const override = overrideFor(r, originalDate);
          if (override?.skipped) return null;
          const scheduledDate = override?.date || originalDate;
          if (scheduledDate.slice(0, 7) !== month) return null;
          const calculated = estimateRecurringAmount(r, originalDate);
          const amount = Number.isFinite(+override?.amount) && +override.amount >= 0 ? money(+override.amount) : calculated.amount;
          const completedTransaction = postedRecurring(r, originalDate, scheduledDate, amount, calculated.estimated);
          if (completedTransaction && !includeCompleted) return null;
          return {
            ...r,
            amount,
            estimated: calculated.estimated,
            date: scheduledDate,
            agendaCompleted: Boolean(completedTransaction),
            completedTransactionId: completedTransaction?.id || "",
            actualDate: completedTransaction?.date || "",
            originalDate,
            occurrenceAdjusted: scheduledDate !== originalDate || amount !== calculated.amount,
            occurrenceNote: override?.reason || "",
            ruleId: r.id,
          };
        }).filter(Boolean);
      });

    const subscriptions = (d.subscriptions || [])
      .filter((s) => s.status !== "cancelled" && s.nextDate && (s.nextDate.slice(0, 7) <= month || overridesOf(s).some((o) => (o.date || o.originalDate).slice(0, 7) === month)))
      .flatMap((s) => {
        const nominalDates = [];
        const firstMonth = s.nextDate.slice(0, 7);
        const diff = (+month.slice(0,4) - +firstMonth.slice(0,4)) * 12 + (+month.slice(5) - +firstMonth.slice(5,7));
        const step = s.frequency === "yearly" ? 12 : 1;
        if (diff >= 0 && diff % step === 0) nominalDates.push(dateAt(month, +(s.nextDate.slice(8) || 1)));
        const originalDates = new Set(nominalDates);
        const movedIntoMonth = overridesOf(s)
          .filter((o) => (o.date || o.originalDate).slice(0, 7) === month && !originalDates.has(o.originalDate))
          .map((o) => o.originalDate);
        return [...nominalDates, ...movedIntoMonth].map((originalDate) => {
          const override = overrideFor(s, originalDate);
          if (override?.skipped) return null;
          const scheduledDate = override?.date || originalDate;
          if (scheduledDate.slice(0, 7) !== month) return null;
          const amount = Number.isFinite(+override?.amount) && +override.amount >= 0 ? money(+override.amount) : s.amount;
          const completedTransaction = postedSubscription(s, originalDate, scheduledDate, amount);
          if (completedTransaction && !includeCompleted) return null;
          return {
            id: `subscription-${s.id}-${originalDate}`,
            agendaCompleted: Boolean(completedTransaction),
            completedTransactionId: completedTransaction?.id || "",
            actualDate: completedTransaction?.date || "",
            ruleId: `subscription-${s.id}`,
            subscriptionId: s.id,
            description: s.name,
            type: "expense",
            amount,
            account: s.account || d.accounts.find((a)=>!a.archived)?.name || "",
            category: s.category || "Subscrições",
            date: scheduledDate,
            originalDate,
            occurrenceAdjusted: scheduledDate !== originalDate || amount !== s.amount,
            occurrenceNote: override?.reason || "",
            source: "Subscrição",
            frequency: s.frequency,
            active: true,
          };
        }).filter(Boolean);
      });
    return [...recurring, ...subscriptions].sort((a,b)=>a.date.localeCompare(b.date) || String(a.description || "").localeCompare(String(b.description || ""), "pt-PT"));
  }
  function expenseEntries(d, prefix = "") {
    const result = [];
    let byId;
    for (const t of d.transactions) {
      if (!t.date.startsWith(prefix)) continue;
      if (t.type === "expense")
        for (const part of t.splits || [
          {
            category: t.category || "Outros",
            amount: money(t.amount - (t.principal || 0)),
          },
        ])
          result.push({ ...t, category: part.category, amount: part.amount });
      if (t.refundOf) {
        byId ??= new Map(d.transactions.map((x) => [String(x.id), x]));
        const original = byId.get(String(t.refundOf));
        if (!original) continue;
        const parts = original.splits || [
          { category: original.category || "Outros", amount: original.amount },
        ];
        let remaining = cents(t.amount);
        parts.forEach((p, i) => {
          const value =
            i === parts.length - 1
              ? remaining
              : Math.min(
                  remaining,
                  Math.round((cents(t.amount) * p.amount) / original.amount),
                );
          remaining -= value;
          result.push({
            ...t,
            category: p.category,
            amount: -value / 100,
            expenseNature: original.expenseNature,
          });
        });
      }
    }
    return result;
  }
  function parseAmount(input) {
    let s = String(input ?? "")
      .trim()
      .replace(/[€\s\u00a0]/g, "");
    let negative = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, "");
    if (s.includes(",") && s.includes("."))
      s =
        s.lastIndexOf(",") > s.lastIndexOf(".")
          ? s.replace(/\./g, "").replace(",", ".")
          : s.replace(/,/g, "");
    else if (s.includes(",")) s = s.replace(",", ".");
    if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s))
      throw Error("Valor inválido: " + input);
    return money(Number(s) * (negative ? -1 : 1));
  }
  function csv(text, separator) {
    text = String(text).replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/)[0];
    const sep = separator || [";", ",", "\t"].sort((a, b) =>
      first.split(b).length - first.split(a).length,
    )[0];
    let rows = [],
      row = [],
      cell = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === sep && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (quoted) throw Error("O CSV tem aspas por fechar.");
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  }
  function guessColumns(header) {
    const clean = (s) =>
      String(s)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const names = header.map(clean);
    const aliases = {
      date: [
        "data",
        "date",
        "data movimento",
        "data do movimento",
        "data operacao",
        "data de operacao",
        "booking date",
      ],
      description: [
        "descricao",
        "description",
        "descritivo",
        "movimento",
        "detalhes",
        "details",
      ],
      beneficiary: [
        "beneficiario",
        "beneficiary",
        "estabelecimento",
        "merchant",
        "comerciante",
      ],
      amount: ["valor", "amount", "montante", "importe"],
      debit: ["debito", "debitos", "saidas", "debit"],
      credit: ["credito", "creditos", "entradas", "credit"],
      category: ["categoria", "category"],
      account: ["conta", "account"],
      type: ["tipo", "type"],
    };
    return Object.fromEntries(
      Object.entries(aliases).map(([field, options]) => [
        field,
        names.findIndex((h) => options.includes(h)),
      ]),
    );
  }
  function importNormalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT")
      .replace(/\bpt\d{2}[a-z0-9]{10,}\b/gi, " ")
      .replace(/\b(?:ref|referencia|aut|autorizacao|cartao|card)\s*[:#-]?\s*[a-z0-9-]{4,}\b/gi, " ")
      .replace(/\b\d{5,}\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const importNoiseWords = new Set([
    "compra", "pagamento", "pag", "debito", "credito", "movimento", "operacao",
    "cartao", "visa", "mastercard", "tpa", "pos", "sepa", "transferencia", "transf",
    "trf", "mbway", "mb", "online", "contactless", "ref", "referencia", "aut",
    "autorizacao", "de", "do", "da", "dos", "das", "em", "no", "na", "por"
  ]);
  function importTokens(value) {
    return importNormalize(value)
      .split(" ")
      .filter((token) => token.length > 1 && !importNoiseWords.has(token) && !/^\d+$/.test(token));
  }
  function importMerchant(description) {
    const original = String(description || "").replace(/\s+/g, " ").trim();
    if (!original) return "";
    let cleaned = original
      .replace(/^\s*(?:compra(?:\s+cart[aã]o)?|pagamento|pag\.?|d[eé]bito|cr[eé]dito|t\.?p\.?a\.?|pos|sepa|transfer[eê]ncia|transf\.?|trf|mb\s*way)\s*[-:·]*\s*/i, "")
      .replace(/\bPT\d{2}[A-Z0-9]{10,}\b/gi, " ")
      .replace(/\b(?:REF|REFER[EÊ]NCIA|AUT|AUTORIZA[CÇ][AÃ]O|CART[AÃ]O)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, " ")
      .replace(/\b\d{6,}\b/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s*\-–—·:;,.]+|[\s*\-–—·:;,.]+$/g, "")
      .trim();
    const tokens = importTokens(cleaned);
    if (!tokens.length) return cleaned.slice(0, 100) || original.slice(0, 100);
    // Evita usar texto bancário genérico como regra aprendida.
    if (tokens.every((token) => importNoiseWords.has(token))) return "";
    return cleaned.slice(0, 100);
  }
  function importSimilarity(a, b) {
    const aa = new Set(importTokens(a)), bb = new Set(importTokens(b));
    if (!aa.size || !bb.size) return 0;
    let common = 0;
    for (const token of aa) if (bb.has(token)) common++;
    return common / new Set([...aa, ...bb]).size;
  }
  function importRuleFor(description, rules = []) {
    const haystack = importNormalize(description);
    return rules
      .filter((r) => r?.active !== false && String(r?.match || "").trim())
      .slice()
      .sort((a, b) => (a.priority || 0) - (b.priority || 0))
      .find((r) => {
        const match = importNormalize(r.match);
        return match && (haystack.includes(match) || importNormalize(importMerchant(description)).includes(match));
      });
  }
  function smartImportSuggestion(transaction, history = [], rules = []) {
    const description = String(transaction?.description || "").trim();
    const detectedMerchant = String(transaction?.beneficiary || importMerchant(description)).trim();
    const merchantKey = importNormalize(detectedMerchant);
    const rule = importRuleFor(description, rules);
    if (rule) {
      return {
        category: String(rule.category || transaction.category || "Por categorizar").trim(),
        beneficiary: String(rule.beneficiary || detectedMerchant || "").trim(),
        source: "rule",
        confidence: "high",
        reason: `Regra “${rule.match}”`,
        ruleKey: String(rule.match || detectedMerchant || "").trim().slice(0, 100),
      };
    }
    const categoryScores = new Map(), beneficiaryScores = new Map();
    let bestScore = 0, examples = 0;
    for (const previous of Array.isArray(history) ? history : []) {
      if (!previous || previous.type !== transaction.type || previous.type === "transfer") continue;
      const prevDesc = String(previous.description || "");
      const prevBeneficiary = String(previous.beneficiary || importMerchant(prevDesc) || "").trim();
      const prevMerchantKey = importNormalize(prevBeneficiary);
      let score = 0;
      if (importNormalize(prevDesc) === importNormalize(description)) score = 6;
      else if (merchantKey && prevMerchantKey && merchantKey === prevMerchantKey) score = 4.5;
      else {
        const similarity = Math.max(importSimilarity(description, prevDesc), importSimilarity(detectedMerchant, prevBeneficiary));
        if (similarity >= 0.55) score = 1 + similarity * 4;
      }
      if (!score) continue;
      if (previous.account === transaction.account) score += 0.35;
      bestScore = Math.max(bestScore, score);
      examples++;
      const category = String(previous.category || "").trim();
      if (category && category !== "Por categorizar" && category !== "Transferência")
        categoryScores.set(category, (categoryScores.get(category) || 0) + score);
      if (prevBeneficiary)
        beneficiaryScores.set(prevBeneficiary, (beneficiaryScores.get(prevBeneficiary) || 0) + score);
    }
    const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0];
    const categoryTop = top(categoryScores), beneficiaryTop = top(beneficiaryScores);
    const suggestedCategory = categoryTop && categoryTop[1] >= 3.25 ? categoryTop[0] : "";
    const suggestedBeneficiary = beneficiaryTop && beneficiaryTop[1] >= 3.25 ? beneficiaryTop[0] : detectedMerchant;
    const confidence = bestScore >= 5 ? "high" : bestScore >= 3.25 ? "medium" : "low";
    return {
      category: suggestedCategory || String(transaction.category || "Por categorizar").trim(),
      beneficiary: String(suggestedBeneficiary || "").trim(),
      source: suggestedCategory ? "history" : detectedMerchant ? "merchant" : "none",
      confidence,
      reason: suggestedCategory ? `${examples} movimento${examples === 1 ? "" : "s"} semelhante${examples === 1 ? "" : "s"} no histórico` : detectedMerchant ? "Estabelecimento extraído da descrição" : "Sem histórico semelhante",
      ruleKey: String(suggestedBeneficiary || detectedMerchant || "").trim().slice(0, 100),
    };
  }
  function mmexHeaderIndex(header) {
    const clean = (value) => String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const names = header.map(clean), index = {};
    for (const [key, aliases] of Object.entries({
      id: ["id"], date: ["data"], status: ["estado"], type: ["tipo"], account: ["conta"],
      beneficiary: ["beneficiario"], amount: ["valor"], currency: ["moeda"],
      category: ["categoria"], subcategory: ["subcategoria"], tags: ["etiquetas"],
      number: ["numero"], note: ["observacoes"], debit: ["levantamento"],
      credit: ["deposito"], balance: ["saldo"], fee: ["comissao"]
    })) index[key] = names.findIndex((name) => aliases.includes(name));
    return index;
  }
  function isMMEXHeader(header) {
    const map = mmexHeaderIndex(header || []);
    return ["id", "date", "type", "account", "amount", "category", "subcategory"]
      .every((key) => map[key] >= 0);
  }
  function mmexDate(value) {
    const raw = String(value || "").trim();
    if (validDate(raw)) return raw;
    const match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!match) return "";
    let year = +match[3];
    if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
    const date = `${year}-${String(+match[2]).padStart(2, "0")}-${String(+match[1]).padStart(2, "0")}`;
    return validDate(date) ? date : "";
  }
  function mmexCategory(category, subcategory) {
    const parts = String(category || "").split(":")
      .concat(String(subcategory || "").split(":"))
      .map((part) => part.trim()).filter(Boolean);
    return categoryPath(parts) || "Por categorizar";
  }
  function mmexTransferAccounts(accountValue, beneficiaryValue = "") {
    const account = String(accountValue || "").trim(), beneficiary = String(beneficiaryValue || "").trim();
    const compact = beneficiary.match(/^([<>])\s*(.+)$/);
    if (account && compact) {
      const other = compact[2].trim();
      return compact[1] === ">"
        ? { source: account, target: other }
        : { source: other, target: account };
    }
    const raw = [account, beneficiary].filter(Boolean).join(" ");
    const out = raw.match(/^(.+?)\s*([<>])\s*(.+)$/);
    if (!out) return null;
    const left = out[1].trim(), right = out[3].trim();
    return out[2] === ">"
      ? { source: left, target: right }
      : { source: right, target: left };
  }
  function mmexAccountNames(rows, header) {
    const map = mmexHeaderIndex(header || []), names = new Set();
    if (map.account < 0) return [];
    for (const row of rows || []) {
      const raw = String(row[map.account] || "").trim();
      const beneficiary = map.beneficiary >= 0 ? String(row[map.beneficiary] || "").trim() : "";
      const transfer = mmexTransferAccounts(raw, beneficiary);
      if (transfer) { names.add(transfer.source); names.add(transfer.target); }
      else if (raw) names.add(raw);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-PT"));
  }
  function prepareMMEXImport(rows, header, options, accounts, history = []) {
    const map = mmexHeaderIndex(header || []), transactions = [], errors = [];
    if (!isMMEXHeader(header)) throw Error("Este ficheiro não tem a estrutura de exportação CSV do Money Manager Ex.");
    const accountMap = options?.accountMap || {};
    const normalizeAccount = (name) => importNormalize(name).replace(/\s+/g, " ");
    const resolveAccount = (name) => {
      const mapped = String(accountMap[name] || "").trim();
      if (mapped) return mapped;
      const token = normalizeAccount(name);
      return accounts.find((account) => normalizeAccount(account.name) === token)?.name || "";
    };
    const groups = new Map();
    rows.forEach((row, rowIndex) => {
      const recordId = String(row[map.id] || "").trim() || `linha-${rowIndex + 2}`;
      if (!groups.has(recordId)) groups.set(recordId, []);
      groups.get(recordId).push({ row, rowIndex });
    });
    const existingMMEX = new Set((history || []).map((t) => String(t.mmexId || "")).filter(Boolean));
    let splitTransactions = 0, transferTransactions = 0, zeroRows = 0, importedRows = 0;
    const pathDepths = new Map();
    for (const [recordId, entries] of groups) {
      try {
        const first = entries[0].row;
        const date = mmexDate(first[map.date]);
        if (!date) throw Error("Data MMEX inválida.");
        if (options?.limitDate && date > options.limitDate)
          throw Error("Data futura: agenda este movimento no Planeamento.");
        const rawType = String(first[map.type] || "").trim().toLowerCase();
        const type = rawType === "withdrawal" ? "expense" : rawType === "deposit" ? "income" : rawType === "transfer" ? "transfer" : "";
        if (!type) throw Error("Tipo MMEX desconhecido: " + (first[map.type] || "vazio") + ".");
        const rawAccount = String(first[map.account] || "").trim();
        const transfer = type === "transfer" ? mmexTransferAccounts(rawAccount, first[map.beneficiary]) : null;
        let account, targetAccount;
        if (type === "transfer") {
          if (!transfer) throw Error("Transferência MMEX sem contas de origem/destino reconhecíveis.");
          account = resolveAccount(transfer.source);
          targetAccount = resolveAccount(transfer.target);
          if (!account) throw Error("Mapeia a conta MMEX “" + transfer.source + "”.");
          if (!targetAccount) throw Error("Mapeia a conta MMEX “" + transfer.target + "”.");
          if (account === targetAccount) throw Error("A transferência está mapeada para a mesma conta nos dois lados.");
        } else {
          account = resolveAccount(rawAccount);
          if (!account) throw Error("Mapeia a conta MMEX “" + rawAccount + "”.");
        }
        const nonZero = [];
        for (const entry of entries) {
          const amount = parseAmount(entry.row[map.amount]);
          if (!amount) { zeroRows++; continue; }
          nonZero.push({ ...entry, amount });
        }
        if (!nonZero.length) throw Error("O movimento MMEX tem valor zero.");
        if (type === "expense" && nonZero.some((entry) => entry.amount > 0)) throw Error("Despesa MMEX com valor positivo inesperado.");
        if (type === "income" && nonZero.some((entry) => entry.amount < 0)) throw Error("Receita MMEX com valor negativo inesperado.");
        const signedTotal = money(nonZero.reduce((sum, entry) => sum + entry.amount, 0));
        if (!signedTotal) throw Error("A soma das parcelas MMEX é zero.");
        const amount = Math.abs(signedTotal);
        const beneficiary = String(first[map.beneficiary] || "").trim();
        const notes = [...new Set(nonZero.map((entry) => String(entry.row[map.note] || "").trim()).filter(Boolean))];
        const tags = [...new Set(nonZero.flatMap((entry) => String(entry.row[map.tags] || "").split(/[;,]/).map((tag) => tag.trim()).filter(Boolean)))];
        const categories = nonZero.map((entry) => mmexCategory(entry.row[map.category], entry.row[map.subcategory]));
        for (const category of categories) pathDepths.set(categoryParts(category).length, (pathDepths.get(categoryParts(category).length) || 0) + 1);
        let splits;
        if (type !== "transfer" && nonZero.length > 1) {
          splits = nonZero.map((entry, index) => ({
            category: categories[index],
            amount: Math.abs(entry.amount),
            ...(String(entry.row[map.note] || "").trim() ? { note: String(entry.row[map.note] || "").trim() } : {}),
          }));
          splitTransactions++;
        }
        if (type === "transfer") transferTransactions++;
        importedRows += nonZero.length;
        const description = type === "transfer"
          ? `Transferência ${account} → ${targetAccount}`
          : beneficiary || String(first[map.category] || "Movimento MMEX").trim() || "Movimento MMEX";
        const tx = {
          id: id(), date, description, type, amount, account,
          ...(type === "transfer" ? { targetAccount, category: "Transferência" } : { category: categories[0] || "Por categorizar" }),
          ...(beneficiary && type !== "transfer" ? { beneficiary } : {}),
          ...(notes.length ? { note: notes.join("\n\n") } : {}),
          ...(tags.length ? { tags } : {}),
          ...(splits ? { splits } : {}),
          mmexId: recordId,
          mmexAccount: rawAccount,
          mmexCurrency: String(first[map.currency] || "").trim() || undefined,
          mmexNumber: String(first[map.number] || "").trim() || undefined,
          mmexStatus: map.status >= 0 ? (String(first[map.status] || "").trim() || undefined) : undefined,
          mmexBalanceAfter: map.balance >= 0 && String(nonZero.at(-1).row[map.balance] || "").trim() ? parseAmount(nonZero.at(-1).row[map.balance]) : undefined,
          importFormat: "mmex",
          importStatus: existingMMEX.has(recordId) ? "duplicate" : "new",
        };
        transactions.push(tx);
      } catch (error) {
        const first = entries[0].row;
        errors.push({
          line: entries[0].rowIndex + 2,
          reason: error.message,
          description: String(first[map.beneficiary] || first[map.account] || `ID ${recordId}`).trim(),
          mmexId: recordId,
          rows: entries.length,
        });
      }
    }
    return {
      transactions, errors,
      meta: {
        rows: rows.length,
        groups: groups.size,
        validTransactions: transactions.length,
        importedRows,
        splitTransactions,
        transferTransactions,
        zeroRows,
        accountNames: mmexAccountNames(rows, header),
        depthCounts: Object.fromEntries([...pathDepths].sort((a, b) => a[0] - b[0])),
      },
    };
  }
  function prepareImport(rows, mapping, options, accounts, rules = [], history = []) {
    const transactions = [],
      errors = [];
    const value = (cells, field) =>
      mapping[field] >= 0 ? String(cells[mapping[field]] ?? "").trim() : "";
    rows.forEach((cells, i) => {
      try {
        let date = value(cells, "date");
        if (/^\d{2}[/.\-]\d{2}[/.\-]\d{4}$/.test(date))
          date = date
            .split(/[/.\-]/)
            .reverse()
            .join("-");
        if (!validDate(date))
          throw Error("Data inválida. Usa AAAA-MM-DD ou DD/MM/AAAA.");
        if (options.limitDate && date > options.limitDate)
          throw Error("Data futura: agenda este movimento no Planeamento.");
        if (options.closedMonths?.includes(date.slice(0, 7)))
          throw Error("O mês está fechado. Reabre-o antes de importar.");
        const description = value(cells, "description");
        if (!description) throw Error("Descrição vazia.");
        const kind = value(cells, "type").toLowerCase();
        if (
          ["transfer", "adjustment", "transferencia", "ajuste"].includes(kind)
        )
          throw Error(
            "Transferência ou ajuste: usa uma cópia JSON para recuperar estes registos.",
          );
        let amount;
        if (options.mode === "split") {
          const debit = value(cells, "debit")
            ? Math.abs(parseAmount(value(cells, "debit")))
            : 0;
          const credit = value(cells, "credit")
            ? Math.abs(parseAmount(value(cells, "credit")))
            : 0;
          if (debit && credit)
            throw Error("A linha tem débito e crédito preenchidos.");
          amount = credit - debit;
        } else {
          amount = parseAmount(value(cells, "amount"));
          if (options.mode === "expense") amount = -Math.abs(amount);
          if (options.mode === "income") amount = Math.abs(amount);
        }
        if (!amount) throw Error("O valor é zero.");
        if (!Number.isSafeInteger(cents(amount)))
          throw Error("O valor é demasiado elevado.");
        const account = options.overrideAccount
          ? options.account
          : value(cells, "account") || options.account;
        if (!accounts.some((a) => a.name === account))
          throw Error("Conta desconhecida: " + (account || "sem conta") + ".");
        const explicitCategory = value(cells, "category");
        const explicitBeneficiary = value(cells, "beneficiary");
        const draft = {
          id: id(),
          date,
          description,
          amount: Math.abs(amount),
          type: amount < 0 ? "expense" : "income",
          category:
            explicitCategory ||
            (amount < 0 && /\bcerveja\b/i.test(description)
              ? "Mercearia / Cerveja"
              : "Por categorizar"),
          beneficiary: explicitBeneficiary,
          account,
        };
        const suggestion = smartImportSuggestion(draft, history, rules);
        if (!explicitCategory && suggestion.category) draft.category = suggestion.category;
        if (!explicitBeneficiary && suggestion.beneficiary) draft.beneficiary = suggestion.beneficiary;
        draft.importSuggestion = {
          source: suggestion.source,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
          category: suggestion.category,
          beneficiary: suggestion.beneficiary,
        };
        draft.importRuleKey = suggestion.ruleKey;
        transactions.push(draft);
      } catch (e) {
        errors.push({
          line: i + (options.header ? 2 : 1),
          reason: e.message,
          description: value(cells, "description") || cells.join(" · "),
        });
      }
    });
    return { transactions, errors };
  }

  function recurringOccurrenceDates(rule, from = rule?.start, to = today()) {
    if (!rule || !validDate(rule.start)) return [];
    const lower = validDate(from) && from > rule.start ? from : rule.start;
    const upperCandidate = validDate(to) ? to : today();
    const upper = rule.end && rule.end < upperCandidate ? rule.end : upperCandidate;
    if (lower > upper) return [];
    const frequency = rule.frequency || "monthly";
    const out = [];
    if (frequency === "weekly") {
      let cursor = new Date(rule.start + "T12:00:00Z");
      const lowerDate = new Date(lower + "T12:00:00Z");
      const upperDate = new Date(upper + "T12:00:00Z");
      while (cursor < lowerDate) cursor.setUTCDate(cursor.getUTCDate() + 7);
      while (cursor <= upperDate) {
        out.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
      return out;
    }
    const step = frequency === "yearly" ? 12 : frequency === "quarterly" ? 3 : 1;
    const [sy, sm] = rule.start.slice(0, 7).split("-").map(Number);
    const [ly, lm] = lower.slice(0, 7).split("-").map(Number);
    const [uy, um] = upper.slice(0, 7).split("-").map(Number);
    const firstDiff = Math.max(0, (ly - sy) * 12 + (lm - sm));
    let diff = firstDiff + ((step - (firstDiff % step)) % step);
    const lastDiff = (uy - sy) * 12 + (um - sm);
    for (; diff <= lastDiff; diff += step) {
      const absolute = sy * 12 + (sm - 1) + diff;
      const y = Math.floor(absolute / 12), m = (absolute % 12) + 1;
      const month = `${y}-${String(m).padStart(2, "0")}`;
      const due = dateAt(month, rule.day);
      if (due >= lower && due <= upper) out.push(due);
    }
    return out;
  }
  function dayDistance(a, b) {
    return Math.abs((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 86400000);
  }
  function recurringHistoryMatches(d, ruleId, from, to = today()) {
    const rule = (d.recurring || []).find((r) => String(r.id) === String(ruleId));
    if (!rule) throw Error("A recorrência já não existe.");
    if (!validDate(from)) throw Error("Indica uma data inicial válida.");
    if (!validDate(to) || to < from) throw Error("O intervalo de histórico é inválido.");
    const dates = recurringOccurrenceDates(rule, from, to);
    const used = new Set();
    const matches = [], alreadyLinked = [], unmatched = [], ambiguous = [];
    const clean = (v) => String(v || "").trim().toLocaleLowerCase("pt-PT").replace(/\s+/g, " ");
    const tolerance = (rule.frequency || "monthly") === "weekly" ? 3 : 10;
    const fixed = (rule.valueMode || "fixed") !== "estimated";
    for (const due of dates) {
      const existing = d.transactions.find((t) => String(t.recurringRuleId || "") === String(rule.id) && (t.recurringDate || t.scheduledDate || t.date) === due);
      if (existing) {
        used.add(String(existing.id));
        alreadyLinked.push({ due, transactionId: existing.id });
        continue;
      }
      const candidates = d.transactions
        .filter((t) => {
          if (used.has(String(t.id)) || t.refundOf || t.debtId || t.subscriptionId || t.pendingId) return false;
          if (t.recurringRuleId && String(t.recurringRuleId) !== String(rule.id)) return false;
          if (t.type !== rule.type || t.account !== rule.account) return false;
          if (rule.type === "transfer" && t.targetAccount !== rule.targetAccount) return false;
          if (dayDistance(t.date, due) > tolerance) return false;
          if (fixed && Math.abs(cents(t.amount) - cents(rule.amount)) > 1) return false;
          if (rule.type !== "transfer" && rule.category && t.category && !categoryMatches(t.category, rule.category) && !categoryMatches(rule.category, t.category)) return false;
          return true;
        })
        .map((t) => {
          const identity = Math.max(importSimilarity(rule.beneficiary, t.beneficiary), importSimilarity(rule.description, t.description), importSimilarity(rule.beneficiary, t.description), importSimilarity(rule.description, t.beneficiary));
          const distance = dayDistance(t.date, due);
          const categoryCompatible = rule.type === "transfer" || !rule.category || !t.category || categoryMatches(t.category, rule.category) || categoryMatches(rule.category, t.category);
          const categoryExact = Boolean(rule.category && t.category && clean(rule.category) === clean(t.category));
          const amountDelta = Math.abs(cents(t.amount) - cents(rule.amount));
          const structural = categoryCompatible && fixed && amountDelta <= 1 && Boolean(rule.category && t.category);
          const exactText = [clean(rule.description), clean(rule.beneficiary)].filter(Boolean).some((x) => x === clean(t.description) || x === clean(t.beneficiary));
          const textual = exactText || identity >= 0.72;
          if (!structural && !textual) return null;
          const score = (structural ? 55 : 0) + (categoryExact ? 18 : categoryCompatible ? 8 : 0) + (fixed && amountDelta <= 1 ? 25 : 0) + identity * 40 + (exactText ? 14 : 0) - distance * 1.5;
          return { t, identity, distance, structural, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.distance - b.distance || String(a.t.id).localeCompare(String(b.t.id)));
      if (!candidates.length) {
        unmatched.push({ due });
        continue;
      }
      if (candidates[1] && Math.abs(candidates[0].score - candidates[1].score) < 6) {
        ambiguous.push({
          due,
          candidates: candidates.slice(0, 4).map((x) => ({
            transactionId: x.t.id,
            date: x.t.date,
            description: x.t.description,
            beneficiary: x.t.beneficiary || "",
            amount: x.t.amount,
            category: x.t.category || "",
            score: Math.round(x.score),
          })),
        });
        continue;
      }
      const best = candidates[0];
      used.add(String(best.t.id));
      matches.push({ due, transactionId: best.t.id, date: best.t.date, score: Math.round(best.score) });
    }
    return { rule, from, to, dates, matches, alreadyLinked, unmatched, ambiguous };
  }
  function recurringExpectedDate(rule, transactionDate) {
    if (!rule || !validDate(transactionDate)) return transactionDate;
    const frequency = rule.frequency || "monthly";
    if (frequency === "weekly") {
      const occurrences = recurringOccurrenceDates(rule, rule.start, transactionDate);
      if (!occurrences.length) return transactionDate;
      let best = occurrences[occurrences.length - 1];
      const next = recurringOccurrenceDates(rule, transactionDate, new Date(new Date(transactionDate + "T12:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10))[0];
      if (next && dayDistance(next, transactionDate) < dayDistance(best, transactionDate)) best = next;
      return best;
    }
    return dateAt(transactionDate.slice(0, 7), Number(rule.day) || Number(rule.start?.slice(8)) || 1);
  }
  function recurringHistoryCandidates(d, ruleId, from, to = today()) {
    const rule = (d.recurring || []).find((r) => String(r.id) === String(ruleId));
    if (!rule) throw Error("A recorrência já não existe.");
    if (!validDate(from)) throw Error("Indica uma data inicial válida.");
    if (!validDate(to) || to < from) throw Error("O intervalo de histórico é inválido.");
    const targetCategory = categoryPath(rule.category || "");
    const rows = (d.transactions || [])
      .filter((t) => {
        if (!validDate(t.date) || t.date < from || t.date > to) return false;
        if (t.refundOf || t.debtId || t.subscriptionId || t.pendingId) return false;
        if (t.recurringRuleId && String(t.recurringRuleId) !== String(rule.id)) return false;
        if (t.type !== rule.type) return false;
        if (rule.type === "transfer") {
          if (t.account !== rule.account || t.targetAccount !== rule.targetAccount) return false;
        } else {
          if (targetCategory && categoryPath(t.category || "") !== targetCategory) return false;
        }
        return true;
      })
      .map((t) => ({
        transactionId: t.id,
        date: t.date,
        expectedDate: recurringExpectedDate(rule, t.date),
        description: t.description || "",
        beneficiary: t.beneficiary || "",
        amount: t.amount,
        category: t.category || "",
        account: t.account || "",
        alreadyLinked: String(t.recurringRuleId || "") === String(rule.id),
        sameAccount: !rule.account || t.account === rule.account,
        amountDelta: Math.abs(cents(t.amount) - cents(rule.amount || 0)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.transactionId).localeCompare(String(b.transactionId)));
    return { rule, from, to, rows };
  }
  function linkRecurringHistorySelection(d, ruleId, transactionIds = []) {
    const rule = (d.recurring || []).find((r) => String(r.id) === String(ruleId));
    if (!rule) throw Error("A recorrência já não existe.");
    const ids = new Set((transactionIds || []).map(String));
    const linked = [];
    for (const t of d.transactions || []) {
      if (!ids.has(String(t.id))) continue;
      if (t.refundOf || t.debtId || t.subscriptionId || t.pendingId) throw Error("Um dos movimentos escolhidos não pode ser associado a esta recorrência.");
      if (t.type !== rule.type) throw Error("Um dos movimentos escolhidos tem um tipo diferente da recorrência.");
      if (rule.type !== "transfer" && categoryPath(t.category || "") !== categoryPath(rule.category || "")) throw Error("Um dos movimentos escolhidos já não pertence à categoria/subcategoria da recorrência.");
      if (t.recurringRuleId && String(t.recurringRuleId) !== String(rule.id)) throw Error("Um dos movimentos escolhidos já pertence a outra recorrência.");
      const due = recurringExpectedDate(rule, t.date);
      t.recurringRuleId = rule.id;
      t.recurringDate = due;
      if (t.date !== due) t.scheduledDate = due;
      else delete t.scheduledDate;
      linked.push({ transactionId: t.id, date: t.date, due });
    }
    return linked;
  }
  function subscriptionExpectedDate(subscription, transactionDate) {
    if (!subscription || !validDate(transactionDate)) return transactionDate;
    const day = Number(subscription.renewalDay) || Number(subscription.nextDate?.slice(8)) || 1;
    if ((subscription.frequency || "monthly") === "yearly") {
      const month = String(subscription.nextDate || transactionDate).slice(5, 7);
      const candidateMonth = `${transactionDate.slice(0, 4)}-${month}`;
      return dateAt(candidateMonth, day);
    }
    return dateAt(transactionDate.slice(0, 7), day);
  }
  function subscriptionHistoryCandidates(d, subscriptionOrId, from, to = today()) {
    const subscription = typeof subscriptionOrId === "object" && subscriptionOrId
      ? subscriptionOrId
      : (d.subscriptions || []).find((s) => String(s.id) === String(subscriptionOrId));
    if (!subscription) throw Error("A subscrição já não existe.");
    if (!validDate(from)) throw Error("Indica uma data inicial válida.");
    if (!validDate(to) || to < from) throw Error("O intervalo de histórico é inválido.");
    const targetCategory = categoryPath(subscription.category || "Subscrições");
    const yearlyMonth = String(subscription.nextDate || "").slice(5, 7);
    const rows = (d.transactions || [])
      .filter((t) => {
        if (!validDate(t.date) || t.date < from || t.date > to) return false;
        if (t.type !== "expense" || t.refundOf || t.debtId || t.pendingId) return false;
        if (t.recurringRuleId) return false;
        if (t.subscriptionId && String(t.subscriptionId) !== String(subscription.id || "")) return false;
        if ((subscription.frequency || "monthly") === "yearly" && yearlyMonth && t.date.slice(5, 7) !== yearlyMonth) return false;
        return true;
      })
      .map((t) => ({
        transactionId: t.id,
        date: t.date,
        expectedDate: subscriptionExpectedDate(subscription, t.date),
        description: t.description || "",
        beneficiary: t.beneficiary || "",
        amount: t.amount,
        category: t.category || "",
        account: t.account || "",
        alreadyLinked: Boolean(subscription.id) && String(t.subscriptionId || "") === String(subscription.id),
        sameCategory: !targetCategory || categoryPath(t.category || "") === targetCategory,
        sameAccount: !subscription.account || t.account === subscription.account,
        amountDelta: Math.abs(cents(t.amount) - cents(subscription.amount || 0)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.transactionId).localeCompare(String(b.transactionId)));
    return { subscription, from, to, rows };
  }
  function linkSubscriptionHistorySelection(d, subscriptionId, transactionIds = []) {
    const subscription = (d.subscriptions || []).find((s) => String(s.id) === String(subscriptionId));
    if (!subscription) throw Error("A subscrição já não existe.");
    const ids = new Set((transactionIds || []).map(String));
    const linked = [];
    for (const t of d.transactions || []) {
      if (!ids.has(String(t.id))) continue;
      if (t.type !== "expense" || t.refundOf || t.debtId || t.pendingId || t.recurringRuleId)
        throw Error("Um dos movimentos escolhidos não pode ser associado a esta subscrição.");
      if (t.subscriptionId && String(t.subscriptionId) !== String(subscription.id))
        throw Error("Um dos movimentos escolhidos já pertence a outra subscrição.");
      const due = subscriptionExpectedDate(subscription, t.date);
      t.subscriptionId = subscription.id;
      t.recurringDate = due;
      if (t.date !== due) t.scheduledDate = due;
      else delete t.scheduledDate;
      linked.push({ transactionId: t.id, date: t.date, due });
      subscription.prices ??= [];
      const priceKey = `${t.date}|${cents(t.amount)}`;
      const exists = subscription.prices.some((p) => `${p.date}|${cents(p.amount)}` === priceKey);
      if (!exists) subscription.prices.push({ date: t.date, amount: money(t.amount), source: "history" });
    }
    if (Array.isArray(subscription.prices)) subscription.prices.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return linked;
  }
  function linkRecurringHistory(d, ruleId, from, to = today(), selections = {}) {
    const result = recurringHistoryMatches(d, ruleId, from, to);
    const used = new Set([...result.matches, ...result.alreadyLinked].map((row) => String(row.transactionId)));
    const manualMatches = [];
    for (const group of result.ambiguous) {
      const selectedId = selections && selections[group.due] != null ? String(selections[group.due]) : "";
      if (!selectedId) continue;
      const candidate = group.candidates.find((row) => String(row.transactionId) === selectedId);
      if (!candidate || used.has(selectedId)) continue;
      used.add(selectedId);
      manualMatches.push({ due: group.due, transactionId: candidate.transactionId, date: candidate.date, score: candidate.score, manual: true });
    }
    const linked = [...result.matches, ...manualMatches];
    for (const match of linked) {
      const t = d.transactions.find((row) => String(row.id) === String(match.transactionId));
      if (!t) continue;
      t.recurringRuleId = result.rule.id;
      t.recurringDate = match.due;
      if (t.date !== match.due) t.scheduledDate = match.due;
      else delete t.scheduledDate;
    }
    result.manualMatches = manualMatches;
    result.linked = linked;
    result.rule.historyLinkedFrom = from;
    return result;
  }
  const api = {
    cents,
    money,
    id,
    today,
    validDate,
    dateAt,
    sortTransactions,
    categoryParts,
    categoryPath,
    categoryMatches,
    empty,
    normalize,
    effect,
    transactionDeltaForAccount,
    openingBalance,
    balanceAt,
    refreshBalances,
    setAccountBalance,
    migrateLedgerCore,
    prepareTransfer,
    reconcileTransfers,
    importTransaction,
    repairTransferAccountAliases,
    add,
    remove,
    update,
    totals,
    upcoming,
    expenseEntries,
    parseAmount,
    csv,
    guessColumns,
    importNormalize,
    importMerchant,
    importSimilarity,
    smartImportSuggestion,
    mmexHeaderIndex,
    isMMEXHeader,
    mmexDate,
    mmexCategory,
    mmexTransferAccounts,
    mmexAccountNames,
    prepareMMEXImport,
    prepareImport,
    recurringOccurrenceDates,
    validateSplits,
    noteTone,
    recurringExpectedDate,
    recurringHistoryCandidates,
    recurringHistoryMatches,
    linkRecurringHistory,
    linkRecurringHistorySelection,
    subscriptionExpectedDate,
    subscriptionHistoryCandidates,
    linkSubscriptionHistorySelection,
    accountNameReferences,
    renameAccountReferences,
    activeAccountDependencies,
  };
  root.Finance = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
