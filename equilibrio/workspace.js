"use strict";
window.equilibrioInitialRoute = location.hash.slice(1);
window.equilibrioStartup = {awaitingChoice: !!window.financasDesktop?.isDesktop, deferredRenders: 0, entered: false};
if (window.equilibrioStartup.awaitingChoice) document.body.dataset.startup = 'choosing';
const F = Finance,
  $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const euroFormatter = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const eur = (n) => euroFormatter.format(n || 0);
const sum = (items, f = (x) => x) =>
  F.money(items.reduce((s, x) => s + f(x), 0));
let key = "equilibrioData";
const dateLabel = (s) =>
  F.validDate(s) ? new Date(s + "T12:00").toLocaleDateString("pt-PT") : "—";
const monthLabel = (m) =>
  new Date(m + "-01T12:00").toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });
let month = F.today().slice(0, 7),
  view = "dashboard",
  undoState = null,
  formAction = null,
  formRevision = 0,
  formSubmitting = false,
  formBaseline = null,
  storageProblem = false,
  transactionPage = 1,
  transactionCategoryFilter = "",
  transactionStatusFilter = "all",
  transactionTagFilter = "",
  transactionRecurringOnly = false,
  transactionSortMode = "date-desc",
  transactionCompactView = false;
let summaryBalanceMonths = 6, summaryIncomeMonths = 6;
let movementReturnContext = null;
const TRANSACTION_PAGE_SIZE = 50;
/* Compatibilidade de regressão das versões 0.39.4–0.39.7. A interface v0.39.22 usa
   o novo quadro Data · Descrição · Categoria · Conta · Valor · Estado · Ações,
   mas mantém os antigos marcadores de teste para garantir que não perdemos as
   capacidades de Notas e redimensionamento introduzidas nessas versões:
   Data · categoria · conta
   Notas
   TX_COLUMN_STORAGE_KEY = "equilibrio:transaction-columns:v2"
   TX_COLUMN_DEFAULTS = { main: 190, beneficiary: 120, details: 255, note: 340, value: 120, actions: 150 }
   data-tx-resize="main"
   data-tx-resize="note"
   data-tx-resize="value"
   data-tx-resize="actions"
   class="tx-note movement-note"
*/
const TX_COLUMN_STORAGE_KEY = "equilibrio:transaction-columns:v5";
const TX_COLUMN_LEGACY_STORAGE_KEY = "equilibrio:transaction-columns:v4";
const TX_COLUMN_DEFAULTS = { date: 104, description: 310, category: 165, account: 150, value: 110, status: 110, actions: 360 };
function loadTransactionColumnWidths() {
  try {
    const currentRaw = localStorage.getItem(TX_COLUMN_STORAGE_KEY);
    const legacyRaw = !currentRaw ? localStorage.getItem(TX_COLUMN_LEGACY_STORAGE_KEY) : null;
    const stored = JSON.parse(currentRaw || legacyRaw || "{}");
    const next = { ...TX_COLUMN_DEFAULTS };
    for (const key of Object.keys(next)) {
      const value = Number(stored[key]);
      if (!Number.isFinite(value)) continue;
      const min = key === "description" ? 180 : key === "actions" ? 380 : 84;
      const max = key === "description" ? 620 : key === "actions" ? 760 : 360;
      next[key] = Math.max(min, Math.min(max, Math.round(value)));
    }
    if (legacyRaw) {
      // A v4 reservava 520 px para Ações, mas a v0.39.27 escondia quase tudo num menu,
      // deixando uma faixa vazia enorme. Na migração para v5 redistribuímos essa largura
      // para as colunas que realmente precisam dela e mantemos espaço suficiente para ações visíveis.
      next.description = Math.max(next.description, 300);
      next.category = Math.max(next.category, 155);
      next.account = Math.max(next.account, 145);
      next.actions = Math.min(420, Math.max(340, next.actions || 360));
    }
    return next;
  } catch (_) {
    return { ...TX_COLUMN_DEFAULTS };
  }
}
let transactionColumnWidths = loadTransactionColumnWidths();
function saveTransactionColumnWidths() {
  try { localStorage.setItem(TX_COLUMN_STORAGE_KEY, JSON.stringify(transactionColumnWidths)); } catch (_) {}
}
function applyTransactionColumnWidths() {
  const host = $("#transactionsTable");
  if (!host) return;
  const w = transactionColumnWidths;
  host.style.setProperty("--movement-grid-columns", Object.keys(TX_COLUMN_DEFAULTS).map(column=>'minmax(0,'+w[column]+'fr)').join(' '));
}
function bindTransactionColumnResizers() {
  const host = $("#transactionsTable");
  if (!host) return;
  applyTransactionColumnWidths();
  for (const handle of host.querySelectorAll("[data-tx-resize]")) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const column = handle.dataset.txResize;
      const startX = event.clientX;
      const startWidth = transactionColumnWidths[column] || TX_COLUMN_DEFAULTS[column] || 120;
      const min = column === "description" ? 180 : column === "actions" ? 380 : 84;
      const max = column === "description" ? 620 : column === "actions" ? 760 : 360;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("tx-column-resizing");
      const move = (e) => {
        transactionColumnWidths[column] = Math.max(min, Math.min(max, Math.round(startWidth + e.clientX - startX)));
        applyTransactionColumnWidths();
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        document.body.classList.remove("tx-column-resizing");
        saveTransactionColumnWidths();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  }
}
function resetTransactionColumnWidths() {
  transactionColumnWidths = { ...TX_COLUMN_DEFAULTS };
  saveTransactionColumnWidths();
  renderTransactions();
}
function demoData() {
  const d = F.empty(),
    m = F.today().slice(0, 7),
    day = +F.today().slice(8);
  d.isDemo = true;
  d.accounts = [
    { id: F.id(), name: "Conta à ordem", type: "Banco", balance: 2400 },
    { id: F.id(), name: "Poupança", type: "Poupança", balance: 4300 },
    { id: F.id(), name: "Carteira", type: "Dinheiro", balance: 80 },
  ];
  d.budgets = [
    ["Alimentação", 350],
    ["Casa", 950],
    ["Transportes", 100],
    ["Lazer", 120],
  ].map(([category, limit]) => ({ id: F.id(), category, limit }));
  d.goals = [
    {
      id: F.id(),
      name: "Fundo de emergência",
      target: 6000,
      current: 4300,
      planMonths: 12,
      icon: "◎",
    },
  ];
  d.rules = [
    { id: F.id(), match: "continente", category: "Alimentação" },
    { id: F.id(), match: "netflix", category: "Subscrições" },
  ];
  for (let n = 5; n >= 0; n--) {
    const dt = new Date(+m.slice(0, 4), +m.slice(5) - 1 - n, 1),
      mm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    for (const [dd, description, amount, type, category] of [
      [1, "Salário", 2400, "income", "Salário"],
      [2, "Renda", 850, "expense", "Casa"],
      [4, "Supermercado", 126.48 + n * 7, "expense", "Alimentação"],
      [6, "Passe mensal", 40, "expense", "Transportes"],
      [8, "Cinema", 16, "expense", "Lazer"],
    ])
      if (n || dd <= day)
        d.transactions.push({
          id: F.id(),
          description,
          amount,
          type,
          category,
          account: "Conta à ordem",
          date: F.dateAt(mm, dd),
        });
  }
  d.recurring = [
    {
      id: F.id(),
      description: "Salário",
      amount: 2400,
      type: "income",
      category: "Salário",
      account: "Conta à ordem",
      start: m + "-01",
      day: 1,
      active: true,
    },
    {
      id: F.id(),
      description: "Renda",
      amount: 850,
      type: "expense",
      category: "Casa",
      account: "Conta à ordem",
      start: m + "-02",
      day: 2,
      active: true,
    },
  ];
  d.recurring.forEach((r) => {
    const t = d.transactions.find(
      (t) => t.description === r.description && t.date === F.dateAt(m, r.day),
    );
    if (t) t.recurringRuleId = r.id;
  });
  return d;
}
let data;
try {
  const raw = localStorage.getItem(key);
  data = raw ? F.normalize(JSON.parse(raw)) : demoData();
} catch (e) {
  data = F.empty();
  storageProblem = true;
  setTimeout(
    () =>
      notice(
        "Não foi possível ler os dados guardados. Exporta os dados originais nas definições antes de os substituir.",
        true,
      ),
    0,
  );
}
function notice(text, error = false) {
  const host = $("#notice");
  host.replaceChildren();
  host.className = "notice" + (error ? " error" : "");
  const span = document.createElement("span");
  span.textContent = text;
  host.append(span);
  const b = document.createElement("button");
  b.textContent = "Fechar";
  b.onclick = () => (host.hidden = true);
  host.append(b);
  host.hidden = false;
  clearTimeout(notice.timer);
  if (!error) notice.timer = setTimeout(() => (host.hidden = true), 4200);
}
function commit(fn, message = "Alterações guardadas.") {
  F.renderCache?.clear(); window.equilibrioDataRevision = (window.equilibrioDataRevision || 0) + 1;
  let durablySaved = false;
  const before = structuredClone(data);
  try {
    if (window.CompleteUI && !window.CompleteUI.canWrite())
      throw Error(
        "Esta janela está em modo de leitura. Fecha a outra janela de edição e recarrega esta.",
      );
    if (storageProblem)
      throw Error(
        "Recupera ou substitui os dados nas definições antes de continuar.",
      );
    fn();
    for (const old of before.accounts) {
      const next = data.accounts.find((a) => a.id === old.id);
      if (next && next.name !== old.name) F.renameAccountReferences(data, old.name, next.name);
    }
    window.PlanningFinance?.validateChanges(before, data);
    window.PracticalFinance?.observeCorrections(before, data);
    data = F.normalize(data);
    FinancePlus.audit(before, data, message);
    FinancePlus.snapshot(data);
    let desktopSaved = false;
    if (window.DesktopPersistence?.commitLedgerDirect) {
      window.DesktopPersistence.commitLedgerDirect(before, data, key);
      desktopSaved = true;
    } else if (window.DesktopPersistence?.saveSpaceDirect) {
      window.DesktopPersistence.saveSpaceDirect(data, key);
      desktopSaved = true;
    } else if (window.DesktopPersistence?.syncCriticalDomains) {
      window.DesktopPersistence.syncCriticalDomains(before, data, key);
      desktopSaved = true;
    }
    durablySaved = desktopSaved;
    // SQLite is the source of truth for the critical domains. After a
    // successful write, read those domains back before refreshing the UI/cache.
    if (desktopSaved && window.DesktopPersistence?.refreshCriticalDomains) {
      const refreshed = window.DesktopPersistence.refreshCriticalDomains();
      if (refreshed && refreshed.ok === false)
        throw Error("A alteração foi gravada, mas não foi possível confirmá-la através do SQLite.");
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (cacheError) {
      if (!desktopSaved) throw cacheError;
      console.warn("O cache local não pôde ser atualizado; SQLite mantém a alteração guardada.", cacheError);
    }
    durablySaved = true;
    window.CompleteUI?.updatedFromDisk();
    window.FileProtection?.saved(data);
    undoState = before;
    render();
    restoreMovementContext();
    notice(message);
    return true;
  } catch (e) {
    movementReturnContext = null;
    if (durablySaved) {
      storageProblem = true;
      console.error('Alteração gravada; atualização da interface falhou:', e);
      notice('A alteração foi guardada, mas a interface não foi atualizada. Reabre a aplicação antes de continuar.', true);
      return true;
    }
    data = before;
    if ($("#modal").open && $("#formError")) {
      $("#formError").textContent =
        e.message || "Não foi possível guardar a alteração.";
      $("#formError").hidden = false;
    }
    notice(
      e.message ||
        "Não foi possível guardar. O armazenamento pode estar cheio.",
      true,
    );
    return false;
  }
}
let activeRenderTotalsCache = null;
function totalsFor(prefix) {
  const cacheKey = String(prefix || "");
  if (activeRenderTotalsCache?.has(cacheKey)) return activeRenderTotalsCache.get(cacheKey);
  if(activeRenderTotalsCache && window.ProductivityFinance && !activeRenderTotalsCache.periodIndex)activeRenderTotalsCache.periodIndex=ProductivityFinance.periodIndex(data);
  const value = activeRenderTotalsCache?.periodIndex ? activeRenderTotalsCache.periodIndex(String(prefix||'')) : F.totals(data, prefix);
  activeRenderTotalsCache?.set(cacheKey, value);
  return value;
}

let activeRenderSpentCache = null;
function spent(c) {
  const cacheKey = `${month}\u0000${c}`;
  if (activeRenderSpentCache?.has(cacheKey)) return activeRenderSpentCache.get(cacheKey);
  const value = sum(
    F.expenseEntries(data, month).filter((t) => F.categoryMatches(t.category, c)),
    (t) => t.amount,
  );
  activeRenderSpentCache?.set(cacheKey, value);
  return value;
}
const find = (list, id) => data[list].find((x) => String(x.id) === String(id));
function button(text, action, id = "", cls = "secondary") {
  return `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
}
function empty(text) {
  return `<div class="empty-state"><span>◇</span><p>${text}</p></div>`;
}
function metric(label, value, hint = "") {
  return `<article class="summary-card"><p>${label}</p><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ""}</article>`;
}
function progress(value, max) {
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.max(0, Math.round((value / Math.max(max, 1)) * 100)))}"><i class="${value > max ? "warn" : ""}" style="width:${Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100))}%"></i></div>`;
}
let transactionBalanceCacheData = null;
let transactionBalanceCache = null;
function transactionBalanceAfterMap() {
  if (transactionBalanceCacheData === data && transactionBalanceCache) return transactionBalanceCache;
  const balances = new Map(data.accounts.map(account => [account.name, F.openingBalance(data, account)]));
  const events = F.sortTransactions(data, data.transactions, "asc").flatMap((t, index) => [...new Set([t.account, t.targetAccount].filter(Boolean))].map(name => ({t, index, name, date: name === t.targetAccount ? t.targetDate || t.date : t.date})));
  events.sort((a,b) => a.date.localeCompare(b.date) || a.index-b.index);
  const after = new Map();
  for (const {t,name} of events) {
    if (!balances.has(name)) continue;
    balances.set(name, F.money(balances.get(name) + (F.transactionDeltaForAccount(t,name) || 0)));
    if (name === t.account) after.set(String(t.id), balances.get(name));
  }
  transactionBalanceCacheData = data;
  transactionBalanceCache = after;
  return after;
}
function balanceAfterTransaction(t) {
  return transactionBalanceAfterMap().get(String(t.id)) ?? null;
}
document.addEventListener('click', event => {
  for (const menu of document.querySelectorAll('.tx-compact-menu[open]')) {
    if (!menu.contains(event.target) || event.target.closest('button')) menu.open = false;
  }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  for (const menu of document.querySelectorAll('.tx-compact-menu[open]')) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
// O menu da Agenda abre por cima da página: o cartão do dia tem scroll próprio e cortava as opções.
const agendaMenuPortals = new Map();
function closeAgendaMenuPortal(menu) {
  const list = agendaMenuPortals.get(menu);
  if (!list) return;
  agendaMenuPortals.delete(menu);
  list.classList.remove('agenda31-menu-portal');
  list.removeAttribute('style');
  menu.append(list);
}
document.addEventListener('toggle', event => {
  const menu = event.target;
  if (!(menu instanceof HTMLDetailsElement) || !menu.matches('.agenda31-menu')) return;
  if (!menu.open) return closeAgendaMenuPortal(menu);
  for (const other of document.querySelectorAll('.agenda31-menu[open]')) if (other !== menu) other.open = false;
  const list = menu.querySelector(':scope>div');
  if (!list) return;
  const anchor = menu.querySelector('summary').getBoundingClientRect();
  agendaMenuPortals.set(menu, list);
  list.classList.add('agenda31-menu-portal');
  document.body.append(list);
  list.style.right = Math.max(8, innerWidth - anchor.right) + 'px';
  list.style.top = anchor.bottom + 6 + 'px';
  const box = list.getBoundingClientRect();
  if (box.bottom > innerHeight - 8) list.style.top = Math.max(8, anchor.top - 6 - box.height) + 'px';
}, true);
document.addEventListener('click', event => {
  for (const menu of document.querySelectorAll('.agenda31-menu[open]')) {
    if (!menu.querySelector('summary').contains(event.target)) menu.open = false;
  }
  setTimeout(() => {
    for (const [menu, list] of agendaMenuPortals) if (!menu.isConnected) { agendaMenuPortals.delete(menu); list.remove(); }
  });
});
addEventListener('scroll', () => {
  for (const menu of document.querySelectorAll('.agenda31-menu[open]')) menu.open = false;
}, true);
function compactTransactionActions(t) {
  const fragment = document.createElement('template');
  fragment.innerHTML = window.FeatureUI?.transactionActions(t) || '';
  for (const menu of fragment.content.querySelectorAll('details.row-menu')) {
    menu.replaceWith(...menu.querySelector('div').childNodes);
  }
  const badges = [...fragment.content.querySelectorAll('.tag')].map(tag => {
    const html = tag.outerHTML; tag.remove(); return html;
  }).join('');
  const receipt = t.attachment
    ? button('Abrir comprovativo', 'receipt', t.id, 'link-button') + button('Remover comprovativo', 'remove-receipt', t.id, 'link-button')
    : ['income', 'expense'].includes(t.type) ? button('Anexar comprovativo', 'attach-receipt', t.id, 'link-button') : '';
  const edit = ['income', 'expense', 'transfer'].includes(t.type) && !t.debtId
    ? button('Editar', 'edit-tx', t.id, 'link-button tx-mini-action')
    : '<span class="tx-mini-action tx-edit-placeholder" aria-hidden="true">Editar</span>';
  return {badges, html: '<div class="row-actions">' + edit + '<details class="row-menu tx-compact-menu"><summary aria-label="Ações de ' + esc(t.description) + '">Ações</summary><div>' + receipt + fragment.innerHTML + button('Apagar movimento', 'delete-tx', t.id, 'link-button danger') + '</div></details></div>'};
}
// Consulta exata, independente dos filtros da lista e sem alterar o mês ativo.
function openMovement(id) {
  const t = find("transactions", id);
  if (!t) return notice("Este movimento já não existe neste espaço.", true);
  const controls = compactTransactionActions(t), after = balanceAfterTransaction(t);
  const amount = t.type === "expense" ? -t.amount : t.type === "adjustment" ? t.delta : t.amount;
  const detail = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value || "—")}</dd></div>`;
  const fields = detail("Data", dateLabel(t.date)) + detail("Conta", t.account) +
    (t.targetAccount ? detail("Conta destino", t.targetAccount) : "") +
    detail("Categoria", t.splits?.length ? "Compra dividida · " + t.splits.length + " parcelas" : t.category) +
    detail("Beneficiário", t.beneficiary) +
    (Number.isFinite(after) ? detail("Saldo após o movimento", eur(after)) : "");
  const splits = t.splits?.length ? `<section><h4>Divisão por categorias</h4><ul class="movement-detail-splits">${t.splits.map(p => `<li><div><b>${esc(p.category)}</b>${p.note ? `<small>${esc(p.note)}</small>` : ""}</div><strong class="amount">${eur(p.amount)}</strong></li>`).join("")}</ul></section>` : "";
  form("Movimento", `<article class="movement-detail" data-transaction-id="${esc(t.id)}"><header><h3>${esc(t.description)}</h3><strong class="amount ${esc(t.type)}">${t.type === "transfer" ? "↔ " : ""}${eur(amount)}</strong></header><div class="movement-detail-badges">${controls.badges}</div><dl>${fields}</dl>${splits}${t.note ? `<section><h4>Nota</h4><p class="movement-detail-note">${esc(t.note)}</p></section>` : ""}${t.attachment ? `<p class="movement-detail-attachment">📎 ${esc(t.attachment.name || "Comprovativo")}</p>` : ""}<footer>${controls.html}</footer></article>`, () => true, "", "Fechar");
}
function row(t, actions = false) {
  const controls = actions ? compactTransactionActions(t) : {badges: "", html: ""};
  const sign =
    t.type === "income"
      ? "+"
      : t.type === "expense"
        ? "−"
        : t.type === "adjustment"
          ? t.delta < 0
            ? "−"
            : "+"
          : "↔";
  const after = balanceAfterTransaction(t);
  const balanceHtml = Number.isFinite(after)
    ? `<small class="balance-after">${eur(after)}</small>`
    : "";
  const receiptState = ["income", "expense"].includes(t.type)
    ? (t.attachment
      ? `<span class="receipt-indicator has-receipt" title="${esc(t.attachment.name || "Comprovativo associado")}">📎 Comprovativo</span>`
      : t.receiptRequired === true ? '<span class="receipt-indicator no-receipt receipt-missing-icon" title="Comprovativo em falta" aria-label="Comprovativo em falta"><span aria-hidden="true"></span></span>' : '')
    : "";
  const linkedRefunds = actions && t.type === "expense"
    ? data.transactions.filter((row) => String(row.refundOf || "") === String(t.id))
    : [];
  const refundedAmount = linkedRefunds.length ? sum(linkedRefunds, (row) => row.amount) : 0;
  const refundState = linkedRefunds.length
    ? `<span class="tag refund-summary" title="A despesa original mantém o valor bruto; os reembolsos aparecem como movimentos positivos ligados.">Reembolsado ${eur(refundedAmount)}</span>`
    : "";
  const noteTone = esc(F.noteTone(t));
  const inlineNote = !actions && t.note ? `<div class="movement-note note-${noteTone}">${esc(t.note)}</div>` : "";
  const noteHtml = actions
    ? (t.note
      ? `<div class="tx-note movement-note note-${noteTone}" title="${esc(t.note)}">${esc(t.note)}</div>`
      : '<div class="tx-note tx-note-empty" aria-hidden="true">—</div>')
    : "";
  return `<div class="transaction-item" data-transaction-id="${esc(t.id)}" data-can-receipt="${["income", "expense"].includes(t.type) ? "1" : "0"}"><div class="tx-main"><b>${esc(t.description)}</b>${receiptState}${refundState}${controls.badges}${inlineNote}</div><div class="tx-beneficiary">${t.beneficiary ? esc(t.beneficiary) : '<span class="muted">—</span>'}</div><div class="tx-details"><span class="tx-date">${dateLabel(t.date)}</span><span class="tx-category">${esc(t.category || "Transferência")}</span><span class="tx-account">${esc(t.account)}${t.targetAccount ? " → " + esc(t.targetAccount) : ""}</span></div>${noteHtml}<div class="transaction-right"><div class="transaction-values"><span class="amount ${t.type}">${sign}${eur(t.amount)}</span>${balanceHtml}</div>${controls.html}</div></div>`;
}
function closeMenu() {
  const wasOpen = document.body.classList.contains("menu-open");
  document.body.classList.remove("menu-open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
  if (wasOpen) $("#menuToggle").focus({ preventScroll: true });
}
function navigate(v, skipEnhancement = false) {
  const ownsCaches = !activeRenderTotalsCache;
  window.InterfaceUI?.beginRender();
  F.renderCache?.begin();
  if (ownsCaches) {
    activeRenderTotalsCache=new Map();activeRenderSpentCache=new Map();
    activeRenderScheduleCache=new Map();activeRenderScheduleTextCache=new Map();
  }
  try { return navigateCore(v, skipEnhancement); }
  finally {
    if (ownsCaches) { activeRenderTotalsCache=null;activeRenderSpentCache=null;activeRenderScheduleCache=null;activeRenderScheduleTextCache=null; }
    F.renderCache?.end(); window.InterfaceUI?.endRender();
  }
}
function navigateCore(v, skipEnhancement = false) {
  const splitWorkbench = document.getElementById("transactionSplitWorkbench");
  if (!splitWorkbench || splitWorkbench.hidden || !$("#modal")?.open)
    document.body.classList.remove("split-workbench-open");
  const dataSection = v === "qualityHub" ? "quality" : v === "inboxHub" ? "inbox" : null;
  if (dataSection && window.DataHub) {
    window.DataHub.show(dataSection);
    v = "dataHub";
  }
  const changed = view !== v;
  view = v;
  delete document.body.dataset.view;
  document.body.dataset.currentView = v;
  $$(".view").forEach((x) => x.classList.toggle("active", x.id === v));
  $$(".nav-link").forEach((x) => {
    x.classList.toggle("active", x.dataset.view === v);
    x.setAttribute("aria-current", x.dataset.view === v ? "page" : "false");
  });
  $("#pageTitle").textContent =
    v === "dashboard"
      ? data.profile
        ? `Olá, ${data.profile}`
        : "O teu equilíbrio"
      : $(`[data-view="${v}"] span`)?.textContent || "Definições";
  closeMenu();
  if (location.hash !== '#' + v) history.replaceState(null, "", "#" + v);
  if (changed) { renderVisibleCore(v); if (v === "transactions") renderTransactions(); }
  if (!skipEnhancement) window.PremiumUI?.navigation(v);
  if (dataSection) window.DataHub?.show?.(dataSection);
  if (changed && !$("#modal")?.open) {
    $("#pageTitle").setAttribute("tabindex", "-1");
    $("#pageTitle").focus({ preventScroll: true });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}
function chart(host, rows) {
  const max = Math.max(1, ...rows.flatMap((x) => [x.income, x.expense]));
  $(host).innerHTML = rows
    .map(
      (x) =>
        `<div class="bar-group" title="${esc(x.label)}: receitas ${eur(x.income)}, despesas ${eur(x.expense)}"><div class="bar" style="height:${(x.income / max) * 86}%" aria-label="Receitas ${eur(x.income)}"></div><div class="bar out" style="height:${(x.expense / max) * 86}%" aria-label="Despesas ${eur(x.expense)}"></div><span class="bar-label">${esc(x.label)}</span></div>`,
    )
    .join("");
}
function months(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return {
      ...totalsFor(m),
      label: new Date(m + "-01T12:00").toLocaleDateString("pt-PT", {
        month: "short",
      }),
    };
  });
}
function budgetRow(b) {
  const used = spent(b.category);
  const limit = FinancePlus.budgetAt(data, b, month);
  return `<div class="budget-row"><div class="row-top"><b>${esc(b.category)}</b><span>${eur(used)} / ${eur(limit.available)}</span></div>${progress(used, limit.available)}<small>${used > limit.available ? eur(used - limit.available) + " acima do limite" : eur(limit.available - used) + " disponíveis"}${limit.carry ? " · " + eur(limit.carry) + " transitados" : ""}</small></div>`;
}
function goalRow(g) {
  return `<div class="goal-row"><div class="row-top"><b>${esc(g.name)}</b><span>${eur(g.current)} / ${eur(g.target)}</span></div>${progress(g.current, g.target)}</div>`;
}
function dashboardMonthOffset(base, delta) {
  const d = new Date(+base.slice(0, 4), +base.slice(5, 7) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dashboardMonthEnd(m) {
  const end = new Date(+m.slice(0, 4), +m.slice(5, 7), 0);
  const value = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return value > F.today() ? F.today() : value;
}
function dashboardBalanceAt(m) {
  const date = dashboardMonthEnd(m);
  try {
    if(activeRenderTotalsCache&&window.ProductivityFinance){if(!activeRenderTotalsCache.cashIndex)activeRenderTotalsCache.cashIndex=ProductivityFinance.cashIndex(data);return activeRenderTotalsCache.cashIndex(date);}
    return F.money(data.accounts.reduce((sum, account) => sum + FinancePlus.balanceAt(data, account.id, date), 0));
  } catch {
    return F.money(data.accounts.reduce((sum, account) => sum + (+account.balance || 0), 0));
  }
}
function dashboardTrend(current, previous, kind = "neutral") {
  const hostClass = (change) => {
    if (!Number.isFinite(change) || change === 0) return "neutral";
    if (kind === "expense") return change > 0 ? "negative" : "positive";
    return change > 0 ? "positive" : "negative";
  };
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.005)
    return { text: "— vs. mês anterior", cls: "neutral" };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(Math.abs(pct));
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  return { text: `${arrow} ${rounded}% vs. mês anterior`, cls: hostClass(pct) };
}
function summaryAxisAmount(value) {
  const numeric = Number(value) || 0;
  const sign = numeric < 0 ? "−" : "";
  return `${sign}${Math.round(Math.abs(numeric))} €`;
}
function summaryNiceStep(rawStep) {
  const value = Math.max(0.000001, Math.abs(Number(rawStep) || 1));
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return nice * power;
}
function summaryLineScale(values, intervals = 3) {
  let min = Math.min(...values), max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) {
    const pad = Math.max(1, Math.abs(max) * 0.1 || 1);
    min -= pad; max += pad;
  }
  const step = summaryNiceStep((max - min) / Math.max(1, intervals));
  let tickMin = Math.floor(min / step) * step;
  let tickMax = Math.ceil(max / step) * step;
  if (tickMin === tickMax) tickMax = tickMin + step;
  const ticks = [];
  for (let value = tickMax, guard = 0; value >= tickMin - step * 0.25 && guard < 8; value -= step, guard++)
    ticks.push(Math.abs(value) < step * 0.001 ? 0 : value);
  return { min: tickMin, max: tickMax, ticks };
}
function summaryPositiveScale(values, intervals = 3) {
  const maxValue = Math.max(0, ...values.filter(Number.isFinite));
  const step = summaryNiceStep(Math.max(1, maxValue) / Math.max(1, intervals));
  const tickMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks = [];
  for (let value = tickMax, guard = 0; value >= -step * 0.25 && guard < 8; value -= step, guard++)
    ticks.push(Math.abs(value) < step * 0.001 ? 0 : value);
  if (ticks.at(-1) !== 0) ticks.push(0);
  return { min: 0, max: tickMax, ticks };
}
function summarySvgAxis(ticks, y, left, right, width) {
  return ticks.map(tick => `<text class="summary-bar-axis-label" x="${left-16}" y="${y(tick)+4}" text-anchor="end">${esc(summaryAxisAmount(tick))}</text><line class="summary-grid-line" x1="${left}" y1="${y(tick)}" x2="${width-right}" y2="${y(tick)}"/>`).join('');
}
let summaryBalanceObservedWidth = 0, summaryBalanceObservedRows = [], summaryBalanceObserver;
const summarySvgCache=new WeakMap();
function updateSummarySvg(el,svg){const old=summarySvgCache.get(el);if(old?.svg===svg&&old.node===el.firstElementChild)return;el.innerHTML=svg;summarySvgCache.set(el,{svg,node:el.firstElementChild});}
function summaryLineChart(host, rows) {
  const el = $(host);
  if (!el) return;
  const values = rows.map((x) => +x.balance || 0);
  const width = Math.max(280, Math.round(el.clientWidth || 520)), height = 230, left = 78, right = 22, top = 22, bottom = 38;
  summaryBalanceObservedWidth = width; summaryBalanceObservedRows = rows;
  if (!summaryBalanceObserver && typeof ResizeObserver !== "undefined") {
    summaryBalanceObserver = new ResizeObserver(() => {
      const next = Math.max(280, Math.round(el.clientWidth || 520));
      if (next !== summaryBalanceObservedWidth && el.clientWidth > 0) summaryLineChart(host, summaryBalanceObservedRows);
    });
    summaryBalanceObserver.observe(el);
  }
  const plotW = width - left - right, plotH = height - top - bottom;
  const scale = summaryLineScale(values, 3);
  const x = (i) => left + (rows.length <= 1 ? plotW / 2 : (i * plotW) / (rows.length - 1));
  const y = (v) => top + ((scale.max - v) / (scale.max - scale.min)) * plotH;
  const pts = rows.map((r, i) => [x(i), y(+r.balance || 0)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length ? `${path} L${pts.at(-1)[0].toFixed(1)},${(top + plotH).toFixed(1)} L${pts[0][0].toFixed(1)},${(top + plotH).toFixed(1)} Z` : "";
  const labelStep = rows.length > 12 ? 4 : rows.length > 6 ? 2 : 1;
  const svg = `<svg class="summary-plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução do saldo nos últimos ${rows.length} meses" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="summaryBalanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2bc67d" stop-opacity=".24"/><stop offset="1" stop-color="#2bc67d" stop-opacity=".01"/></linearGradient></defs>${summarySvgAxis(scale.ticks, y, left, right, width)}${area ? `<path class="summary-line-area" d="${area}"/>` : ""}${path ? `<path class="summary-line-path" d="${path}"/>` : ""}${pts.map((p, i) => `<circle class="summary-line-point" cx="${p[0]}" cy="${p[1]}" r="${rows.length > 12 ? 3 : 4.2}"><title>${esc(rows[i].month)}: ${esc(eur(rows[i].balance))}</title></circle>`).join("")}${rows.map((r, i) => i % labelStep === 0 || i === rows.length - 1 ? `<text class="summary-axis-month" x="${x(i)}" y="${height-12}" text-anchor="middle">${esc(r.label)}</text>` : "").join("")}</svg>`;
  updateSummarySvg(el,svg);
}
function summaryIncomeExpenseChart(host, rows) {
  const el = $(host);
  if (!el) return;
  // Este gráfico reserva a margem esquerda dentro do próprio SVG. Assim os
  // montantes nunca ficam por cima da grelha, independentemente de escala/DPI.
  const width = 520, height = 250, left = 78, right = 12, top = 22, bottom = 42;
  const plotW = width - left - right, plotH = height - top - bottom;
  const values = rows.flatMap((x) => [+x.income || 0, +x.expense || 0]);
  const scale = summaryPositiveScale(values, 3);
  const groupW = plotW / Math.max(1, rows.length), barW = Math.min(18, groupW * 0.28);
  const labelStep = rows.length > 12 ? 4 : rows.length > 6 ? 2 : 1;
  const y = (v) => top + ((scale.max - v) / scale.max) * plotH;
  const ticks = summarySvgAxis(scale.ticks, y, left, right, width);
  const bars = rows.map((r, i) => { const center = left + groupW * i + groupW / 2; const incomeH = Math.max(0, plotH - (y(+r.income || 0) - top)); const expenseH = Math.max(0, plotH - (y(+r.expense || 0) - top)); return `<rect class="summary-bar-income" x="${center-barW-2}" y="${y(+r.income || 0)}" width="${barW}" height="${incomeH}" rx="4"><title>${esc(r.month)} · Rendimentos ${esc(eur(r.income))}</title></rect><rect class="summary-bar-expense" x="${center+2}" y="${y(+r.expense || 0)}" width="${barW}" height="${expenseH}" rx="4"><title>${esc(r.month)} · Despesas ${esc(eur(r.expense))}</title></rect>${i % labelStep === 0 || i === rows.length - 1 ? `<text class="summary-axis-month" x="${center}" y="${height-12}" text-anchor="middle">${esc(r.label)}</text>` : ""}`; }).join("");
  updateSummarySvg(el,`<svg class="summary-plot-svg summary-income-expense-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rendimentos e despesas dos últimos ${rows.length} meses" preserveAspectRatio="none">${ticks}${bars}</svg>`);
}
function summaryCategoryBreakdown() {
  const grouped = new Map();
  for (const entry of F.expenseEntries(data, month))
    grouped.set(entry.category || "Outros", F.money((grouped.get(entry.category || "Outros") || 0) + (+entry.amount || 0)));
  const rows = [...grouped].map(([category, amount]) => ({ category, amount: Math.max(0, amount) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  if (rows.length > 7) {
    const kept = rows.slice(0, 6), rest = rows.slice(6).reduce((sum, x) => sum + x.amount, 0);
    kept.push({ category: "Outros", amount: F.money(rest) });
    return kept;
  }
  return rows;
}
function summaryRenderDonut(total) {
  const donut = $("#summaryExpenseDonut"), legend = $("#summaryExpenseLegend");
  if (!donut || !legend) return;
  const colors = ["#3fc887", "#4f95ff", "#ff5d67", "#ffad42", "#b15adb", "#e28760", "#9f8ac8"];
  const rows = summaryCategoryBreakdown();
  const actual = rows.reduce((sum, x) => sum + x.amount, 0);
  // Reconcile the displayed positive categories with the official net total.
  const adjustments = F.money(total - actual);
  let cursor = 0;
  const parts = rows.map((r, i) => {
    const pct = actual ? (r.amount / actual) * 100 : 0, start = cursor; cursor += pct;
    return `${colors[i % colors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  donut.style.setProperty("--summary-donut", parts.length ? `conic-gradient(${parts.join(",")})` : "conic-gradient(#29414f 0 100%)");
  $("#summaryExpenseTotal").textContent = eur(total);
  const empty = total < 0 ? "Reembolsos líquidos neste mês; sem categorias com despesa líquida positiva." : F.expenseEntries(data, month).length ? "Sem categorias com despesa líquida positiva neste mês." : "Sem despesas nem reembolsos neste mês.";
  legend.innerHTML = rows.length ? rows.map((r, i) => `<div class="summary-legend-row"><span title="${esc(r.category)}"><i style="--legend-color:${colors[i % colors.length]}"></i><em>${esc(r.category)}</em></span><b>${actual ? Math.round((r.amount / actual) * 100) : 0}%</b></div>`).join("") : `<p class="summary-empty">${empty}</p>`;
  const explanation = $("#summaryExpenseExplanation");
  if(explanation){explanation.textContent=adjustments<0?`Reembolsos e ajustes negativos: ${eur(adjustments)}. As categorias somam ${eur(actual)}; total líquido: ${eur(total)}.`:'';explanation.hidden=adjustments>=0;}
}
function summaryAccountGlyph(account, index) {
  const n = String(account?.name || "").toLocaleLowerCase("pt-PT");
  if (n.includes("dinheiro") || n.includes("cash")) return "€";
  if (n.includes("poup")) return "◇";
  if (n.includes("revolut")) return "R";
  return String(account?.name || "C").trim().charAt(0).toUpperCase() || String(index + 1);
}
function summaryRenderAccounts(total) {
  const host = $("#summaryAccounts"), footer = $("#summaryAccountsTotal");
  if (!host || !footer) return;
  const accounts = data.accounts.filter((a) => !a.archived).slice(0, 5);
  host.innerHTML = accounts.length ? accounts.map((a, i) => `<div class="summary-account-row"><span class="summary-list-icon account-tone-${(i % 5) + 1}">${esc(summaryAccountGlyph(a, i))}</span><div class="summary-list-copy"><b>${esc(a.name)}</b><small>${esc(a.type || "Conta")}</small></div><strong class="${a.balance < 0 ? "negative" : "positive"}">${eur(a.balance || 0)}</strong></div>`).join("") : '<p class="summary-empty">Ainda não existem contas.</p>';
  footer.innerHTML = accounts.length ? `<span>Total</span><strong>${eur(total)}</strong>` : "";
}
function summaryDateChip(date) {
  const d = new Date(String(date) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return `<span class="summary-date-chip">—</span>`;
  return `<span class="summary-date-chip"><b>${String(d.getDate()).padStart(2, "0")}</b><small>${d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "").toUpperCase()}</small></span>`;
}
function summaryRenderRecent() {
  const host = $("#summaryRecentTransactions");
  if (!host) return;
  const tx = F.sortTransactions(data, data.transactions.filter((t) => t.date.startsWith(month) && !(t.type === "adjustment" && t.description === "Ajuste após conferência do extrato")), "desc").slice(0, 5);
  host.innerHTML = tx.length ? tx.map((t, i) => {
    const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : t.type === "adjustment" ? (+t.delta < 0 ? "−" : "+") : "↔";
    const amount = t.type === "adjustment" ? Math.abs(+t.delta || 0) : +t.amount || 0;
    return `<div class="summary-movement-row">${summaryDateChip(t.date)}<span class="summary-list-icon movement-tone-${(i % 5) + 1}">${t.type === "income" ? "↗" : t.type === "transfer" ? "↔" : "↘"}</span><div class="summary-list-copy"><b>${esc(t.description || "Movimento")}</b><small class="summary-secondary-label">${esc(t.category || (t.type === "transfer" ? "Transferência" : "Sem categoria"))}</small></div><div class="summary-list-value"><strong class="amount ${esc(t.type)}">${sign}${eur(amount)}</strong><small>${esc(t.account || "—")}</small></div></div>`;
  }).join("") : '<p class="summary-empty">Ainda não há movimentos neste mês.</p>';
}
function summaryRenderUpcoming() {
  const host = $("#summaryUpcomingPayments");
  if (!host) return;
  let items = [];
  try { items = schedule().filter((p) => p.source !== "completed" && p.type === "expense" && String(p.date || "").startsWith(month)); } catch { items = []; }
  items = items.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 5);
  host.innerHTML = items.length ? items.map((p, i) => {
    const d = String(p.date || ""), today = F.today();
    let hint = p.source === "subscription" ? "Subscrição" : p.source === "debt" ? "Prestação" : p.source === "recurring" ? "Recorrente" : "Pendente";
    if (d >= today) {
      const days = Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
      if (days >= 0 && days <= 45) hint = days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `Daqui a ${days} dias`;
    } else hint = "Em atraso";
    return `<div class="summary-movement-row">${summaryDateChip(p.date)}<span class="summary-list-icon upcoming-tone-${(i % 5) + 1}">⌁</span><div class="summary-list-copy"><b>${esc(p.description || "Pagamento")}</b><small class="summary-secondary-label">${esc(p.category || p.source || "Planeamento")}</small></div><div class="summary-list-value"><strong class="negative">−${eur(p.amount || 0)}</strong><small class="summary-due-hint">${esc(hint)}</small></div></div>`;
  }).join("") : '<p class="summary-empty">Sem pagamentos pendentes neste mês.</p>';
}
function summaryCalculation(type) {
  const prefix=month;
  const rows=F.sortTransactions(data,type==='income'?data.transactions.filter(t=>t.date.startsWith(prefix)&&t.type==='income'&&!t.refundOf):F.expenseEntries(data,prefix));
  const total=F.totals(data,prefix)[type==='income'?'income':'expense'];
  let page=0;
  form(type==='income'?'Cálculo dos rendimentos':'Cálculo das despesas', `<p>${esc(monthLabel(prefix))} · <strong data-financial-total="${total}">${eur(total)}</strong></p><div id="summaryCalculationRows"></div><div class="row-actions"><button type="button" class="secondary" id="summaryCalculationPrev">Anterior</button><span id="summaryCalculationPage" role="status"></span><button type="button" class="secondary" id="summaryCalculationNext">Seguinte</button></div>`,()=>true,type==='income'?'Receitas do período. Reembolsos são descontados às despesas.':'Parcelas por categoria e reembolsos do período; capital de créditos não conta como despesa.','Fechar');
  $('#modal').classList.add('financial-detail-dialog');
  function draw(){
    const shown=rows.slice(page*50,page*50+50);
    $('#summaryCalculationRows').innerHTML=shown.length?'<div class="table-wrap"><table class="u-table"><thead><tr><th>Data</th><th>Movimento</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>'+shown.map(t=>`<tr><td>${dateLabel(t.date)}</td><td><button type="button" class="link-button" data-summary-movement="${esc(t.id)}">${esc(t.description)}</button></td><td>${esc(t.category||'—')}</td><td class="amount">${eur(t.amount)}</td></tr>`).join('')+'</tbody></table></div>':'<p class="empty-state">Sem registos neste período.</p>';
    $('#summaryCalculationPrev').disabled=page===0;$('#summaryCalculationNext').disabled=(page+1)*50>=rows.length;
    $('#summaryCalculationPage').textContent=rows.length?`${page*50+1}–${Math.min((page+1)*50,rows.length)} de ${rows.length}`:'0 registos';
  }
  $('#summaryCalculationPrev').onclick=()=>{page--;draw();};$('#summaryCalculationNext').onclick=()=>{page++;draw();};
  $('#summaryCalculationRows').onclick=e=>{const b=e.target.closest('[data-summary-movement]');if(b)openMovement(b.dataset.summaryMovement);};draw();
}
function renderDashboard() {
  const t = totalsFor(month);
  const previousMonth = dashboardMonthOffset(month, -1), previous = totalsFor(previousMonth);
  const saving = F.money(t.income - t.expense);
  $("#balanceValue").textContent = eur(t.balance);
  $("#incomeValue").textContent = eur(t.income);
  $("#expenseValue").textContent = eur(t.expense);
  $("#savingValue").textContent = eur(saving);
  $("#savingValue").className = saving < 0 ? "negative" : "";
  $("#savingRate").textContent = t.income ? Math.round((saving / t.income) * 100) + "%" : "—";
  const previousBalance = dashboardBalanceAt(previousMonth);
  const balanceDelta = F.money(t.balance - previousBalance);
  const balanceTrend = $("#balanceTrend");
  balanceTrend.textContent = `${balanceDelta >= 0 ? "+" : "−"} ${eur(Math.abs(balanceDelta))} vs. mês anterior`;
  balanceTrend.className = balanceDelta > 0 ? "positive" : balanceDelta < 0 ? "negative" : "neutral";
  const incomeTrend = dashboardTrend(t.income, previous.income, "income"), expenseTrend = dashboardTrend(t.expense, previous.expense, "expense");
  $("#incomeTrend").textContent = incomeTrend.text; $("#incomeTrend").className = incomeTrend.cls;
  $("#expenseTrend").textContent = expenseTrend.text; $("#expenseTrend").className = expenseTrend.cls;
  const dashboardBalances = $("#dashboardAccountBalances");
  if (dashboardBalances) dashboardBalances.innerHTML = data.accounts.length
    ? data.accounts.map((a) => `<article class="dashboard-account-balance"><span>${esc(a.name)}</span><strong class="${a.balance < 0 ? "negative" : ""}">${eur(a.balance)}</strong></article>`).join("")
    : empty("Adiciona uma conta para veres aqui o respetivo saldo.");
  const chartRows = (count) => Array.from({ length: count }, (_, i) => {
    const m = dashboardMonthOffset(month, i - count + 1);
    const shortMonth = new Date(m + "-01T12:00").toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
    return { ...totalsFor(m), month: m, label: count > 12 ? `${shortMonth} ${m.slice(2, 4)}` : shortMonth };
  });
  const balanceRows = chartRows(summaryBalanceMonths);
  summaryLineChart("#summaryBalanceChart", balanceRows.map((r) => ({ ...r, balance: dashboardBalanceAt(r.month) })));
  summaryIncomeExpenseChart("#chart", chartRows(summaryIncomeMonths));
  summaryRenderDonut(t.expense);
  summaryRenderAccounts(t.balance);
  summaryRenderRecent();
  summaryRenderUpcoming();
  $("#recentTransactions").innerHTML = F.sortTransactions(data, data.transactions.filter((t) => t.date.startsWith(month) && !(t.type === "adjustment" && t.description === "Ajuste após conferência do extrato")), "desc").slice(0, 4).map((t) => row(t)).join("") || empty("Ainda não há movimentos neste mês.");
  $("#budgetPreview").innerHTML = data.budgets.slice(0, 3).map(budgetRow).join("") || empty("Define o primeiro limite mensal.");
  $("#goalPreview").innerHTML = data.goals.slice(0, 3).map(goalRow).join("") || empty("Cria um objetivo de poupança.");
  const picker = $("#monthPicker"), prev = $("#summaryPrevMonth"), next = $("#summaryNextMonth");
  if (picker && prev && next) {
    const options = [...picker.options], index = options.findIndex((o) => o.value === month);
    prev.disabled = index <= 0;
    next.disabled = index < 0 || index >= options.length - 1;
  }
}

function movementNeedsReview(t) {
  return !!(t?.needsReview || t?.reviewRequired || (t?.receiptRequired === true && !t?.attachment));
}
function movementCategoryRoot(t) {
  return F.categoryParts(t?.category || "")[0] || (t?.type === "transfer" ? "Transferências" : "Outras");
}
function movementTone(value, count = 8) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return (hash % count) + 1;
}
function movementCategoryGlyph(category) {
  const c = String(category || "").toLocaleLowerCase("pt-PT");
  if (/casa|habit|condom|água|agua|luz|energia/.test(c)) return "⌂";
  if (/aliment|super|restaurante|refei/.test(c)) return "⌘";
  if (/transport|carro|combust|portagen/.test(c)) return "▰";
  if (/saúde|saude|farm|seguro/.test(c)) return "✚";
  if (/lazer|stream|ginás|ginas/.test(c)) return "◇";
  if (/salário|salario|rendimento/.test(c)) return "▣";
  if (/transfer/.test(c)) return "⇄";
  return "●";
}
function movementCategoryIcon(category) {
  const name = String(category || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let paths;
  if (/casa|habit|condom|agua|luz|energia|renda/.test(name))
    paths = '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>';
  else if (/aliment|super|restaurante|refei/.test(name))
    paths = '<path d="M4 3v7a4 4 0 0 0 8 0V3M8 3v18M19 21V3c-3 2-4 5-4 9h4"/>';
  else if (/transport|carro|combust|portagen/.test(name))
    paths = '<path d="m5 11 2-6h10l2 6M4 11h16v7H4zM7 18v2m10-2v2M7 14h.01M17 14h.01"/>';
  else if (/saude|farm|seguro/.test(name))
    paths = '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>';
  else if (/lazer|stream|cinema|ginas|entreten/.test(name))
    paths = '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>';
  else if (/salario|rendimento|trabalho|ordenado/.test(name))
    paths = '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18"/>';
  else if (/transfer/.test(name))
    paths = '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>';
  else
    paths = '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}
function movementPeriodRows(targetMonth = month) {
  const advanced = window.CompleteUI?.getFilters?.() || {};
  const customDates = Boolean(advanced.start || advanced.end);
  const period = customDates ? "all" : ($("#periodFilter")?.value || "month");
  return data.transactions.filter((t) =>
    !(t.type === "adjustment" && t.description === "Ajuste após conferência do extrato") &&
    (window.CompleteUI?.filter(t) ?? true) &&
    (period === "all" || String(t.date || "").startsWith(targetMonth))
  );
}
function movementTypeMatches(t) {
  if (transactionRecurringOnly)
    return !!(t.recurringRuleId || t.subscriptionId || t.subscriptionRuleId);
  const type = $("#typeFilter")?.value || "all";
  return type === "all" || t.type === type;
}
function movementScopeRows() {
  return movementPeriodRows().filter(movementTypeMatches);
}
const movementSearchCache = new WeakMap();
function movementSearchText(t) {
  const source=[t.description,t.beneficiary,t.category,t.account,t.targetAccount,t.note,...(t.splits||[]).flatMap(s=>[s.category,s.note])].join(' ');
  const cached=movementSearchCache.get(t);if(cached?.source===source)return cached.text;
  const text=source.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-PT');movementSearchCache.set(t,{source,text});return text;
}
function movementMatchesSearch(t,terms){if(!terms.length)return true;const text=movementSearchText(t);return terms.every(term=>text.includes(term));}
function filteredTransactions(scopeRows = null) {
  const clean = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT");
  const terms = clean($("#searchTransactions")?.value)
      .trim()
      .split(/\s+/)
      .filter(Boolean),
    account = $("#accountFilter")?.value || "";
  let rows = (scopeRows || movementScopeRows()).filter((t) =>
    (!account || t.account === account || t.targetAccount === account) &&
    (!transactionCategoryFilter || movementCategoryRoot(t) === transactionCategoryFilter) &&

    (transactionStatusFilter === "all" || (transactionStatusFilter === "review" ? movementNeedsReview(t) : !movementNeedsReview(t))) &&
    movementMatchesSearch(t,terms)
  );
  if (transactionSortMode === "amount-desc" || transactionSortMode === "amount-asc") {
    const factor = transactionSortMode === "amount-desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => factor * ((+a.amount || 0) - (+b.amount || 0)) || String(b.date || "").localeCompare(String(a.date || "")));
  } else {
    rows = F.sortTransactions(data, rows, transactionSortMode === "date-asc" ? "asc" : "desc");
  }
  return rows;
}
function rememberMovementContext(id) {
  if (view !== "transactions") return;
  const rows = filteredTransactions();
  const index = rows.findIndex((t) => String(t.id) === String(id));
  if (index >= 0) movementReturnContext = { id: String(id), index, page: transactionPage };
}
window.rememberMovementContext = rememberMovementContext;
function restoreMovementContext() {
  const context = movementReturnContext;
  movementReturnContext = null;
  if (!context || view !== "transactions") return;
  const rows = filteredTransactions();
  if (!rows.length) return;
  const existing = rows.findIndex((t) => String(t.id) === context.id);
  const index = existing >= 0 ? existing : Math.min(context.index, rows.length - 1);
  const page = Math.floor(index / TRANSACTION_PAGE_SIZE) + 1;
  if (transactionPage !== page) {
    transactionPage = page;
    renderTransactions();
  }
  const targetId = String(rows[index].id);
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll("#transactionsTable .movement-table-row")]
      .find((el) => el.dataset.transactionId === targetId);
    if (!row) return;
    row.setAttribute("tabindex", "-1");
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  });
}
function movementTotals(rows) {
  const income = sum(rows.filter((t) => t.type === "income"), (t) => +t.amount || 0);
  const expense = sum(rows.filter((t) => t.type === "expense"), (t) => +t.amount || 0);
  return { income, expense, net: F.money(income - expense), review: rows.filter(movementNeedsReview).length };
}
function movementTrendText(current, previous, kind) {
  if (!previous) return "Sem base no período anterior";
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  const suffix = kind === "expense" ? (pct > 0 ? "Mais do que no período anterior" : pct < 0 ? "Menos do que no período anterior" : "Igual ao período anterior") : (pct > 0 ? "Mais do que no período anterior" : pct < 0 ? "Menos do que no período anterior" : "Igual ao período anterior");
  return `${arrow} ${Math.abs(pct)}% · ${suffix}`;
}
function movementActionsHtml(t) {
  const canEdit = ["income", "expense", "transfer"].includes(t.type) && !t.debtId;
  const edit = canEdit ? `<button type="button" class="movement-icon-action" data-action="edit-tx" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.description)}" title="Editar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg></button>` : "";
  const receiptAction = t.attachment ? "receipt" : ["income", "expense"].includes(t.type) ? "attach-receipt" : "";
  const receipt = receiptAction ? `<button type="button" class="movement-icon-action" data-action="${receiptAction}" data-id="${esc(t.id)}" aria-label="${t.attachment ? "Abrir" : "Anexar"} comprovativo" title="${t.attachment ? "Abrir comprovativo" : "Anexar comprovativo"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7.1-7.1l8.2-8.2"/></svg></button>` : "";
  const fragment = document.createElement("template");
  fragment.innerHTML = window.FeatureUI?.transactionActions(t) || "";
  for (const menu of fragment.content.querySelectorAll("details.row-menu")) menu.replaceWith(...menu.querySelector("div").childNodes);
  const visibleActions = fragment.innerHTML + button("Apagar", "delete-tx", t.id, "link-button danger");
  return `<div class="movement-row-actions movement-row-actions-expanded">${edit}${receipt}<details class="movement-more"><summary class="movement-icon-action" aria-label="Mais ações · ${esc(t.description)}" title="Mais ações">•••</summary><div class="movement-inline-actions" role="menu">${visibleActions}</div></details></div><details class="movement-mobile-actions"><summary>Ações</summary><div class="movement-mobile-actions-list">${edit}${receipt}${visibleActions}</div></details>`;
}
// Menu «•••» das linhas de Movimentos: enquanto aberto, a lista passa para o <body> (a tabela tem scroll e
// contentores que cortam menus absolutos/fixos); as ações continuam a ser tratadas pela delegação de [data-action].
(() => {
  let openMenu = null, openList = null;
  const close = () => {
    if (!openMenu) return;
    const menu = openMenu, list = openList;
    openMenu = openList = null;
    list.classList.remove("movement-menu-portal");
    list.style.top = list.style.left = "";
    menu.append(list);
    menu.open = false;
  };
  const place = () => {
    if (!openMenu) return;
    if (!openMenu.isConnected) return close();
    const box = openMenu.querySelector("summary").getBoundingClientRect(), w = openList.offsetWidth, h = openList.offsetHeight;
    openList.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, box.right - w)) + "px";
    openList.style.top = (box.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, box.top - h - 6) : box.bottom + 6) + "px";
  };
  document.addEventListener("toggle", (e) => {
    const menu = e.target;
    if (!(menu instanceof HTMLDetailsElement) || !menu.classList.contains("movement-more")) return;
    if (!menu.open) { if (menu === openMenu) close(); return; }
    close();
    const list = menu.querySelector(".movement-inline-actions");
    if (!list) return;
    openMenu = menu; openList = list;
    list.classList.add("movement-menu-portal");
    document.body.append(list);
    place();
  }, true);
  document.addEventListener("click", (e) => {
    if (!openMenu || e.target.closest("details.movement-more") === openMenu && !e.target.closest(".movement-inline-actions")) return;
    if (e.target.closest(".movement-menu-portal") && !e.target.closest("button")) return;
    setTimeout(close, 0);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.addEventListener("scroll", (e) => { if (openMenu && !openList.contains(e.target)) place(); }, true);
  window.addEventListener("resize", () => place());
})();

function movementRenderHeaderAndKpis(periodRows = null) {
  const periodLabel = $("#movementsPeriodLabel");
  const directMonth = $("#movementMonthSelect"), directYear = $("#movementYearSelect");
  if (directMonth) directMonth.value = month.slice(5);
  if (directYear) { if (![...directYear.options].some(o => o.value === month.slice(0,4))) directYear.add(new Option(month.slice(0,4), month.slice(0,4))); directYear.value = month.slice(0,4); }
  const advanced = window.CompleteUI?.getFilters?.() || {};
  if ($("#movementDateStart") && $("#movementDateStart").value !== (advanced.start || "")) $("#movementDateStart").value = advanced.start || "";
  if ($("#movementDateEnd") && $("#movementDateEnd").value !== (advanced.end || "")) $("#movementDateEnd").value = advanced.end || "";
  if (periodLabel) {
    if (advanced.start || advanced.end) {
      const from = advanced.start ? dateLabel(advanced.start) : "início";
      const to = advanced.end ? dateLabel(advanced.end) : "hoje";
      periodLabel.textContent = `${from} — ${to}`;
    } else periodLabel.textContent = ($("#periodFilter")?.value || "month") === "all" ? "Todo o histórico" : monthLabel(month);
  }
  const historyToggle = $("#movementHistoryToggle");
  if (historyToggle) {
    const showingAll = ($("#periodFilter")?.value || "month") === "all" && !(advanced.start || advanced.end);
    historyToggle.textContent = showingAll ? "Ver só este mês" : "Todo o histórico";
    historyToggle.setAttribute("aria-pressed", showingAll ? "true" : "false");
  }
  const activeType = transactionRecurringOnly ? "recurring" : ($("#typeFilter")?.value || "all");
  $$("[data-tx-type-tab]").forEach((button) => {
    const active = button.dataset.txTypeTab === activeType;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const base = periodRows || movementPeriodRows(), totals = movementTotals(base);
  const customDates = Boolean(advanced.start || advanced.end);
  const previousMonth = dashboardMonthOffset(month, -1), previousTotals = customDates ? null : movementTotals(movementPeriodRows(previousMonth));
  if ($("#movementIncomeKpi")) $("#movementIncomeKpi").textContent = eur(totals.income);
  if ($("#movementExpenseKpi")) $("#movementExpenseKpi").textContent = totals.expense ? `−${eur(totals.expense)}` : eur(0);
  if ($("#movementNetKpi")) { $("#movementNetKpi").textContent = `${totals.net < 0 ? "−" : totals.net > 0 ? "+" : ""}${eur(Math.abs(totals.net))}`; $("#movementNetKpi").className = totals.net < 0 ? "negative" : totals.net > 0 ? "positive" : ""; }
  if ($("#movementReviewKpi")) $("#movementReviewKpi").textContent = `${totals.review} movimento${totals.review === 1 ? "" : "s"}`;
  const trendText = customDates ? "Intervalo personalizado · sem comparação mensal" : null;
  if ($("#movementIncomeTrend")) $("#movementIncomeTrend").textContent = trendText || movementTrendText(totals.income, previousTotals.income, "income");
  if ($("#movementExpenseTrend")) $("#movementExpenseTrend").textContent = trendText || movementTrendText(totals.expense, previousTotals.expense, "expense");
}
function movementFilterButton(kind, value, label, count, active, icon = "●", tone = 1) {
  const markup = kind === 'category' && value ? movementCategoryIcon(label) : esc(icon);
  return `<button type="button" class="movement-filter-button${active ? " active" : ""}" data-movement-filter="${kind}" data-value="${esc(value)}"><span class="movement-filter-icon tone-${tone}">${markup}</span><span>${esc(label)}</span><b>${count}</b></button>`;
}
function movementRenderSidebar(scopeRows = null) {
  const rows = scopeRows || movementScopeRows();
  const account = $("#accountFilter")?.value || "";
  const accountCounts = new Map();
  for (const t of rows) {
    if (t.account) accountCounts.set(t.account, (accountCounts.get(t.account) || 0) + 1);
    if (t.targetAccount && t.targetAccount !== t.account) accountCounts.set(t.targetAccount, (accountCounts.get(t.targetAccount) || 0) + 1);
  }
  const accounts = [...accountCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],"pt"));
  const accountHost = $("#movementAccountFilters");
  if (accountHost) accountHost.innerHTML = movementFilterButton("account", "", "Todas", rows.length, !account, "▣", 1) + accounts.map(([name,count]) => movementFilterButton("account", name, name, count, account === name, String(name).charAt(0).toUpperCase(), movementTone(name))).join("");
  const catCounts = new Map();
  for (const t of rows) { const cat = movementCategoryRoot(t); catCounts.set(cat, (catCounts.get(cat) || 0) + 1); }
  const cats = [...catCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],"pt"));
  const catHost = $("#movementCategoryFilters");
  if (catHost) catHost.innerHTML = movementFilterButton("category", "", "Todas", rows.length, !transactionCategoryFilter, "●", 1) + cats.map(([name,count]) => movementFilterButton("category", name, name, count, transactionCategoryFilter === name, movementCategoryGlyph(name), movementTone(name))).join("");
  const confirmed = rows.filter((t) => !movementNeedsReview(t)).length, review = rows.length - confirmed;
  const statusHost = $("#movementStatusFilters");
  if (statusHost) statusHost.innerHTML = movementFilterButton("status", "all", "Todos", rows.length, transactionStatusFilter === "all", "▣", 1) + movementFilterButton("status", "confirmed", "Confirmados", confirmed, transactionStatusFilter === "confirmed", "✓", 5) + movementFilterButton("status", "review", "Por rever", review, transactionStatusFilter === "review", "!", 7);
}
function transactionPagination(totalPages) {
  if (totalPages <= 1) return "";
  const wanted = new Set([1, totalPages]);
  for (let p = transactionPage - 2; p <= transactionPage + 2; p++)
    if (p >= 1 && p <= totalPages) wanted.add(p);
  const pages = [...wanted].sort((a, b) => a - b);
  let last = 0, html = "";
  for (const page of pages) {
    if (last && page > last + 1) html += '<span class="tx-page-gap" aria-hidden="true">…</span>';
    html += `<button type="button" class="tx-page-number${page === transactionPage ? " active" : ""}" data-action="tx-page" data-id="${page}"${page === transactionPage ? ' aria-current="page"' : ""}>${page}</button>`;
    last = page;
  }
  return `<nav class="transaction-pagination" aria-label="Páginas de movimentos"><button type="button" class="tx-page-arrow" data-action="tx-page-prev" ${transactionPage <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>${html}<button type="button" class="tx-page-arrow" data-action="tx-page-next" ${transactionPage >= totalPages ? "disabled" : ""} aria-label="Página seguinte">›</button></nav>`;
}
function resetTransactionPage() {
  transactionPage = 1;
}
window.resetTransactionPage = resetTransactionPage;
window.resetMovementDashboardFilters = () => {
  transactionCategoryFilter = "";
  transactionStatusFilter = "all";
  transactionTagFilter = "";
  transactionRecurringOnly = false;
  transactionSortMode = "date-desc";
  if ($("#transactionSort")) $("#transactionSort").value = transactionSortMode;
};
function renderTransactions() {
  if (window.equilibrioStartup?.awaitingChoice) return;
  // A mesma base era filtrada três vezes em cada refresh (KPIs, sidebar e tabela).
  // Calcula uma vez e reutiliza-a durante este render.
  const periodRows = movementPeriodRows();
  const scopeRows = periodRows.filter(movementTypeMatches);
  movementRenderHeaderAndKpis(periodRows);
  movementRenderSidebar(scopeRows);
  const txHost = $("#transactions");
  if (txHost) txHost.classList.toggle("movement-compact-view", transactionCompactView);
  const error = window.CompleteUI?.filterError?.();
  if (error) {
    $("#transactionsTable").innerHTML =
      '<p class="filter-message" role="status">' + esc(error) + "</p>" +
      button("Limpar filtros", "clear-filters", "", "secondary");
    window.FeatureUI?.refreshSelection?.();
    return;
  }
  const tx = filteredTransactions(scopeRows);
  const totalPages = Math.max(1, Math.ceil(tx.length / TRANSACTION_PAGE_SIZE));
  transactionPage = Math.min(Math.max(1, transactionPage), totalPages);
  const first = (transactionPage - 1) * TRANSACTION_PAGE_SIZE;
  const pageRows = tx.slice(first, first + TRANSACTION_PAGE_SIZE);
  const visibleFrom = tx.length ? first + 1 : 0;
  const visibleTo = Math.min(first + pageRows.length, tx.length);
  const header = `<div class="movement-table-header" role="row">
    <span class="movement-check-cell"><input type="checkbox" id="txSelectAllVisible" aria-label="Selecionar movimentos visíveis"></span>
    <span>Data<i class="movement-column-resizer" data-tx-resize="date"></i></span>
    <span>Descrição<i class="movement-column-resizer" data-tx-resize="description"></i></span>
    <span>Categoria<i class="movement-column-resizer" data-tx-resize="category"></i></span>
    <span>Conta<i class="movement-column-resizer" data-tx-resize="account"></i></span>
    <span>Valor<i class="movement-column-resizer" data-tx-resize="value"></i></span>
    <span>Estado<i class="movement-column-resizer" data-tx-resize="status"></i></span>
    <span>Ações<i class="movement-column-resizer" data-tx-resize="actions"></i></span>
  </div>`;
  const balanceAfter = transactionBalanceAfterMap();
  const rows = pageRows.map((t) => {
    const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : t.type === "adjustment" ? (+t.delta < 0 ? "−" : "+") : "↔";
    const amount = t.type === "adjustment" ? Math.abs(+t.delta || 0) : +t.amount || 0;
    const category = movementCategoryRoot(t), noteTone = F.noteTone(t);
    const subtitle = t.note ? `<small class="movement-description-note note-${esc(noteTone)}">${esc(t.note)}</small>` : t.beneficiary ? `<small>${esc(t.beneficiary)}</small>` : "";
    const receiptPending = t.receiptRequired === true && !t.attachment
      ? '<span class="movement-receipt-pending" title="Pedir fatura / comprovativo pendente">Pedir fatura</span>'
      : "";
    const accountName = t.type === "transfer" && t.targetAccount ? `${t.account} → ${t.targetAccount}` : (t.account || "—");
    const review = movementNeedsReview(t);
    const recurring = !!(t.recurringRuleId || t.subscriptionId || t.subscriptionRuleId);
    const supplier = t.beneficiary || data.subscriptions.find(s => s.id === t.subscriptionId)?.name || '';
    const provider = ProviderIcons.resolve(supplier, data.providerIcons || []);
    const supplierIcon = provider.kind !== 'initial' || (data.providerIcons || []).some(row => ProviderIcons.key(row.name) === ProviderIcons.key(supplier))
      ? ProviderIcons.html(supplier) : `<i class="movement-description-avatar tone-${movementTone(category)}" aria-hidden="true">${movementCategoryIcon(category)}</i>`;
    const after = balanceAfter.get(String(t.id));
    const balanceLine = Number.isFinite(after) ? `<small class="movement-balance-after">${eur(after)}</small>` : "";
    return `<div class="movement-table-row" role="row" data-transaction-id="${esc(t.id)}">
      <span class="movement-check-cell">${window.FeatureUI?.selection(t) || ""}</span>
      <span class="movement-date-cell">${esc(dateLabel(t.date))}</span>
      <span class="movement-description-cell">${supplierIcon}<b>${esc(t.description || "Movimento")}</b>${subtitle}${receiptPending}${recurring ? '<em class="movement-recurring-mark" title="Movimento recorrente">↻</em>' : ""}</span>
      <span><span class="movement-category-pill tone-${movementTone(category)}"><i class="movement-category-icon" aria-hidden="true">${movementCategoryIcon(category)}</i>${esc(category)}</span></span>
      <span class="movement-account-cell">${ProviderIcons.accountHtml(t.account)}${t.type==='transfer'&&t.targetAccount?ProviderIcons.accountHtml(t.targetAccount):''}<span>${esc(accountName)}</span></span>
      <span class="movement-value-stack"><strong class="movement-value-cell amount ${esc(t.type)}">${sign}${eur(amount)}</strong>${balanceLine}</span>
      <span><span class="movement-status-pill ${review ? "review" : "confirmed"}">${review ? "Por rever" : "Confirmado"}</span></span>
      <span>${movementActionsHtml(t)}</span>
    </div>`;
  }).join("");
  const emptyHtml = empty(data.transactions.length ? "Não encontrámos movimentos com estes filtros." : "Ainda não há movimentos neste espaço.") + button(data.transactions.length ? "Limpar filtros" : "Registar primeiro movimento", data.transactions.length ? "clear-filters" : "daily-first-transaction", "", "secondary");
  $("#transactionsTable").innerHTML = `<div class="movement-table-shell">${header}<div class="movement-table-body">${rows || emptyHtml}</div><div class="movement-table-footer"><span>A mostrar ${visibleFrom}${tx.length ? `–${visibleTo}` : ""} de ${tx.length} movimento${tx.length === 1 ? "" : "s"}</span>${tx.length > TRANSACTION_PAGE_SIZE ? transactionPagination(totalPages) : ""}</div></div>`;
  bindTransactionColumnResizers();
  const selectAll = $("#txSelectAllVisible");
  if (selectAll) selectAll.onchange = () => {
    if (selectAll.checked) $("#selectVisible")?.click();
    else $("#clearSelection")?.click();
  };
  window.FeatureUI?.refreshSelection?.();
}
function renderCollections() {
  $("#budgetsGrid").innerHTML =
    data.budgets
      .map(
        (b) =>
          `<article class="budget-card">${budgetRow(b)}<div class="row-actions">${button("Editar", "budget", b.id)}${button("Apagar", "delete-budget", b.id, "link-button danger")}</div></article>`,
      )
      .join("") || empty("Cria um orçamento para acompanhar uma categoria.");
  $("#goalsGrid").innerHTML =
    data.goals
      .map(
        (g) =>
          `<article class="goal-card"><div class="goal-icon">◎</div>${goalRow(g)}<p>${eur(Math.max(0, g.target - g.current) / (g.planMonths || 12))}/mês para atingir em ${g.planMonths || 12} meses.</p><div class="row-actions">${button("Reservar", "goal-fund", g.id)}${button("Editar", "goal", g.id, "link-button")}${button("Apagar", "delete-goal", g.id, "link-button danger")}</div></article>`,
      )
      .join("") || empty("Define para que estás a poupar.");
  $("#accountsGrid").innerHTML =
    data.accounts
      .map(
        (a) =>
          `<article class="account-card"><h3>${esc(a.name)}</h3><strong>${eur(a.balance)}</strong><small>${esc(a.type)}${a.reconciledOn ? " · Confirmada em " + dateLabel(a.reconciledOn) : ""}</small><div class="row-actions">${button("Confirmar saldo", "reconcile", a.id)}${button("Editar", "account", a.id, "link-button")}${button("Apagar", "delete-account", a.id, "link-button danger")}</div></article>`,
      )
      .join("") || empty("Adiciona uma conta para começar.");
}
let activeRenderScheduleCache = null;
function schedule(options = {}) {
  const includeCompletedGenerated = options === true || Boolean(options?.includeCompletedGenerated);
  const cacheKey = `${month}|${includeCompletedGenerated ? 1 : 0}|${F.today()}`;
  if (activeRenderScheduleCache?.has(cacheKey)) return activeRenderScheduleCache.get(cacheKey);
  // A Agenda é temporal, não fica limitada ao mês selecionado: mostra atrasos,
  // próximos 30 dias e compromissos posteriores (incluindo subscrições).
  const months = new Set([month]);
  const base = new Date(F.today() + "T12:00");
  for (let i = -2; i <= 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  }
  const generated = [...months].flatMap((m) => F.upcoming(data, m, includeCompletedGenerated ? { includeCompleted: true } : undefined));
  const postedDebtMonths = new Set();
  const latestDebtAccount = new Map();
  for (let i = data.transactions.length - 1; i >= 0; i -= 1) {
    const tx = data.transactions[i];
    if (!tx.debtId) continue;
    const debtId = String(tx.debtId);
    postedDebtMonths.add(`${debtId}|${String(tx.date || "").slice(0, 7)}`);
    if (!latestDebtAccount.has(debtId) && tx.account) latestDebtAccount.set(debtId, tx.account);
  }
  // As prestações dos créditos fazem parte da Agenda automaticamente. Não é
  // necessário criar uma recorrência separada para o mesmo empréstimo.
  const debtPayments = [...months].flatMap((m) => data.debts
    .filter((d) => d.balance > 0 && d.payment > 0)
    .filter((d) => !d.endDate || m <= d.endDate.slice(0, 7))
    .map((d) => {
      const date = F.dateAt(m, d.dueDay || 1);
      // Nunca criar prestações retroativas anteriores ao acompanhamento do crédito.
      // startDate é a data de início/primeira prestação definida pelo utilizador;
      // createdAt é guardado para créditos novos. Créditos antigos, sem nenhuma das
      // duas datas, começam a ser acompanhados a partir de hoje.
      const trackingStart = d.startDate || d.createdAt || F.today();
      // Se existir uma primeira prestação explícita, respeitar a data exata.
      // Caso contrário, para créditos acompanhados a partir da criação, incluir
      // o próprio mês de criação mesmo que o dia de vencimento já tenha passado.
      // Isto evita inventar meses anteriores, mas não esconde a prestação do mês atual.
      if (d.startDate) {
        if (date < d.startDate) return null;
      } else if (m < String(trackingStart).slice(0, 7)) {
        return null;
      }
      if (postedDebtMonths.has(`${String(d.id)}|${m}`)) return null;
      return {
        id: `debt-${d.id}-${m}`,
        debtId: d.id,
        date,
        description: d.name,
        category: "Créditos / Empréstimos",
        account: d.account || latestDebtAccount.get(String(d.id)) || "—",
        type: "expense",
        amount: Math.min(Number(d.payment) || 0, Number(d.balance) || 0),
        source: "debt",
      };
    })
    .filter(Boolean));
  // Mantém na Agenda a ocorrência original de recorrências/subscrições que
  // foram registadas noutra data (por exemplo: outubro pago antecipadamente
  // em setembro). Não volta a contar como pagamento pendente nem na previsão.
  const completed = data.transactions
    .filter((t) => t.pendingId || t.recurringRuleId || t.subscriptionId || t.debtId)
    .filter((t) => !includeCompletedGenerated || (!t.recurringRuleId && !t.subscriptionId))
    .map((t) => ({
      ...t,
      source: "completed",
      actualDate: t.date,
      originalDate: t.recurringDate || t.originalDueDate || t.date,
      date: t.scheduledDate || t.recurringDate || t.originalDueDate || t.date,
    }))
    .filter((t) => months.has(String(t.date || "").slice(0, 7)));
  const cleanScheduleText = (value) => {const raw=String(value||'');if(activeRenderScheduleTextCache?.has(raw))return activeRenderScheduleTextCache.get(raw);const text=raw.trim().toLocaleLowerCase('pt-PT').replace(/\s+/g,' ');activeRenderScheduleTextCache?.set(raw,text);return text;};
  const postedPendingIds = new Set();
  const unlinkedPendingMatches = new Map();
  const pendingMonths = new Set(data.pendingPayments.map(p=>String(p.date||'').slice(0,7)));
  for (const tx of data.pendingPayments.length ? data.transactions : []) {
    if (tx.pendingId) postedPendingIds.add(String(tx.pendingId));
    if (tx.pendingId || tx.recurringRuleId || tx.subscriptionId || tx.debtId) continue;
    if (!pendingMonths.has(String(tx.date||'').slice(0,7))) continue;
    const matchKey = `${String(tx.date || "").slice(0, 7)}|${tx.type}|${tx.account}|${cleanScheduleText(tx.description)}`;
    if (!unlinkedPendingMatches.has(matchKey)) unlinkedPendingMatches.set(matchKey, new Set());
    unlinkedPendingMatches.get(matchKey).add(F.cents(tx.amount));
  }
  const pendingRows = data.pendingPayments
    .filter((p) => {
      if (postedPendingIds.has(String(p.id))) return false;
      const matchKey = `${String(p.date || "").slice(0, 7)}|${p.type}|${p.account}|${cleanScheduleText(p.description)}`;
      const amounts = unlinkedPendingMatches.get(matchKey);
      if (!amounts) return true;
      const expected = F.cents(p.amount);
      for (const amount of amounts) if (Math.abs(amount - expected) <= 1) return false;
      return true;
    })
    .map((p) => ({ ...p, source: "pending" }));
  const seen = new Set();
  const rows = [
    ...pendingRows,
    ...generated.map((p) => p.agendaCompleted
      ? ({ ...p, occurrenceId: p.id, id: p.completedTransactionId || p.id, source: "completed", actualDate: p.actualDate || p.date })
      : ({ ...p, source: p.subscriptionId ? "subscription" : "recurring" })),
    ...debtPayments,
    ...completed,
  ].filter((p) => {
    const k = `${p.source}|${p.id}|${p.date}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
  activeRenderScheduleCache?.set(cacheKey, rows);
  return rows;
}
function scheduleRows(items, options = {}) {
  const planner = Boolean(options.planner);
  return (
    items
      .map((p) => {
        const completed = p.source === "completed";
        const overdue = !completed && p.date < F.today();
        const state = completed
          ? (p.actualDate && p.actualDate !== p.date
              ? `${p.actualDate < p.date ? "Registado antecipadamente em" : "Registado em"} ${dateLabel(p.actualDate)}`
              : "Registado")
          : overdue
            ? "Em atraso"
            : p.source === "subscription"
              ? (p.occurrenceAdjusted ? `Subscrição · ajustada de ${dateLabel(p.originalDate)}` : "Subscrição")
              : p.source === "recurring"
                ? (p.incomeKind === "salary"
                    ? (p.occurrenceAdjusted ? `Ordenado · ajustado de ${dateLabel(p.originalDate)}` : "Ordenado previsto")
                    : p.occurrenceAdjusted
                      ? `Recorrência · ajustada de ${dateLabel(p.originalDate)}`
                      : (p.estimated ? "Recorrência · valor estimado" : "Recorrência"))
                : p.source === "debt"
                  ? "Prestação"
                  : "Pendente";
        let actions = "";
        if (completed) {
          actions = button("Abrir", "edit-tx", p.id, "link-button");
        } else if (p.source === "debt") {
          actions =
            button("Editar", "debt", p.debtId, "link-button") +
            button("Registar pagamento", "pay-debt", p.debtId, "link-button");
        } else if (p.source === "recurring") {
          actions =
            button("Editar série", "recurring", p.ruleId || p.id, "link-button") +
            button("Ajustar ocorrência", "adjust-occurrence", `recurring~${p.ruleId || p.id}~${p.originalDate || p.date}`, "link-button") +
            button("Histórico", "recurring-history", `recurring~${p.ruleId || p.id}`, "link-button") +
            button("Apagar recorrência", "delete-recurring", p.ruleId || p.id, "link-button danger") +
            button("Registar", "settle-recurring", p.id + "~" + p.date, "link-button");
        } else if (p.source === "pending") {
          actions =
            button("Editar", "edit-pending", p.id, "link-button") +
            button("Registar", "settle-pending", p.id, "link-button") +
            button("Apagar", "delete-pending", p.id, "link-button danger");
        } else if (p.source === "subscription") {
          actions =
            button("Editar série", "life-subscription", p.subscriptionId, "link-button") +
            button("Ajustar ocorrência", "adjust-occurrence", `subscription~${p.subscriptionId}~${p.originalDate || p.date}`, "link-button") +
            button("Histórico", "recurring-history", `subscription~${p.subscriptionId}`, "link-button") +
            button("Registar", "settle-recurring", p.id + "~" + p.date, "link-button");
        } else {
          actions = button("Registar", "settle-" + p.source, p.id, "link-button");
        }
        if (!planner) {
          return `<div class="transaction-item agenda-commitment-row${completed ? " agenda-completed-row" : ""}${p.occurrenceAdjusted ? " agenda-adjusted-row" : ""}"><div class="agenda-commitment-title"><b>${esc(p.description)}</b><small>${esc(state)}${p.occurrenceNote ? ` · ${esc(p.occurrenceNote)}` : ""}</small></div><span class="agenda-commitment-date">${dateLabel(p.date)}</span><span class="agenda-commitment-category">${esc(p.category || "—")}</span><span class="agenda-commitment-account">${esc(p.account || "—")}</span><span class="amount ${p.type} agenda-commitment-value">${p.type === "transfer" ? "↔ " : p.type === "income" ? "+" : "−"}${eur(p.amount)}</span><div class="row-actions agenda-commitment-actions">${actions}</div></div>`;
        }
        const statusLabel = p.type === "transfer" ? (completed ? "Transferido" : overdue ? "Em atraso" : "A transferir") : completed ? (p.type === "income" ? "Recebido" : "Pago") : overdue ? "Em atraso" : p.type === "income" ? "A receber" : "A pagar";
        const statusTone = completed ? "done" : overdue ? "late" : "planned";
        const note = completed && p.actualDate && p.actualDate !== p.date
          ? `${p.actualDate < p.date ? "Registado antecipadamente" : "Registado"} em ${dateLabel(p.actualDate)}`
          : p.occurrenceAdjusted
            ? state
            : p.occurrenceNote || "";
        return `<div class="agenda31-row${completed ? " agenda31-completed" : ""}">
          <span class="agenda31-status agenda-status ${statusTone}">${statusLabel}</span>
          <div class="agenda31-movement"><b>${esc(p.description)}</b>${note ? `<small>${esc(note)}</small>` : ""}</div>
          <div class="agenda31-date"><span>${dateLabel(p.date)}</span>${!completed ? `<small>${overdue ? "Vencido" : "Previsto"}</small>` : ""}</div>
          <span class="agenda31-category">${esc(p.category || "—")}</span>
          <span class="agenda31-account">${esc(p.account || "—")}</span>
          <span class="amount ${p.type} agenda31-value">${p.type === "transfer" ? "↔ " : p.type === "income" ? "+" : "−"}${eur(p.amount)}</span>
          <div class="agenda31-actions"><details class="row-menu agenda31-menu"><summary aria-label="Ações de ${esc(p.description)}">•••</summary><div>${actions}</div></details></div>
        </div>`;
      })
      .join("") || empty("Não há pagamentos por registar.")
  );
}

function renderPlanning() {
  const items = schedule().filter(x => x.date.startsWith(month)),
    openItems = items.filter((x) => x.source !== "completed"),
    out = sum(
      openItems.filter((x) => x.type === "expense"),
      (x) => x.amount,
    ),
    inc = sum(
      openItems.filter((x) => x.type === "income"),
      (x) => x.amount,
    ),
    balance = totalsFor(month).balance;
  $("#paymentCalendar").innerHTML = scheduleRows(items, { planner: true });
  $("#forecastBalance").textContent = eur(balance + inc - out);
  $("#forecastHint").textContent =
    "Saldo atual, após os pendentes e as recorrências por registar no mês selecionado.";
  $("#forecastItems").innerHTML =
    `<p>Entradas previstas <b>${eur(inc)}</b></p><p>Saídas previstas <b>${eur(out)}</b></p>`;
  const plannerInsights = $("#plannerInsights");
  if (plannerInsights) {
    const overdue = openItems.filter((x) => x.date < F.today());
    const next30 = schedule().filter((x) => x.source !== 'completed' && x.date >= F.today() && x.date <= FinancePlus.dayAdd(F.today(), 30));
    const largest = [...openItems.filter((x) => x.type === "expense")].sort((a, b) => (+b.amount || 0) - (+a.amount || 0))[0];
    plannerInsights.innerHTML = [
      `<button type="button" class="planner-insight-row ${overdue.length ? "is-danger" : "is-ok"}" data-planner-insight="overdue"><span aria-hidden="true">□</span><span><b>${overdue.length ? `${overdue.length} pagamento${overdue.length === 1 ? "" : "s"} em atraso` : "Sem pagamentos em atraso"}</b><small>${overdue.length ? "Regulariza os pagamentos para evitar encargos." : "A agenda não tem compromissos vencidos por registar."}</small></span><i>›</i></button>`,
      `<button type="button" class="planner-insight-row" data-planner-insight="upcoming"><span aria-hidden="true">□</span><span><b>${next30.length} pagamento${next30.length === 1 ? "" : "s"} nos próximos 30 dias</b><small>Total de ${eur(sum(next30.filter((x) => x.type === "expense"), (x) => x.amount))}</small></span><i>›</i></button>`,
      largest ? `<button type="button" class="planner-insight-row" data-planner-insight="largest"><span aria-hidden="true">▥</span><span><b>Maior despesa</b><small>${esc(largest.description)} (${eur(largest.amount)})</small></span><i>›</i></button>` : "",
    ].join("");

  }
  $("#cashCards").innerHTML =
    metric("Saldo atual", eur(balance)) +
    metric("Saídas por registar", eur(out)) +
    metric(
      "Saldo após compromissos",
      eur(balance + inc - out),
      "Não inclui despesas futuras que ainda não planeaste.",
    );
  $("#cashAgenda").innerHTML = scheduleRows(items);
  $("#reconciliationList").innerHTML = data.accounts
    .map(
      (a) =>
        `<div class="reconcile-row"><span>${esc(a.name)}</span><b>${eur(a.balance)}</b></div>`,
    )
    .join("");
  $("#envelopesList").innerHTML =
    data.envelopes
      .map(
        (e) =>
          `<div class="budget-row"><div class="row-top"><b>${esc(e.category)}</b>${button("Editar", "envelope", e.id, "link-button")}</div>${progress(spent(e.category), e.allocated)}<p>${eur(e.allocated - spent(e.category))} disponíveis de ${eur(e.allocated)}</p>${button("Apagar", "delete-envelope", e.id, "link-button danger")}</div>`,
      )
      .join("") || empty("Distribui limites mensais por categoria.");
  $("#reservesList").innerHTML =
    data.reserves
      .map(
        (r) =>
          `<div class="budget-row"><b>${esc(r.name)}</b>${progress(r.saved, r.target)}<p>${eur(r.saved)} de ${eur(r.target)} · ${eur(Math.max(0, r.target - r.saved) / (r.months || 12))}/mês</p><div class="row-actions">${button("Reservar", "reserve-fund", r.id)}${button("Editar", "reserve", r.id, "link-button")}${button("Apagar", "delete-reserve", r.id, "link-button danger")}</div></div>`,
      )
      .join("") || empty("Prepara despesas anuais, como seguros ou férias.");
  updateDecisionSimulatorFields();
  runSimulation();
}
function breakdown(entries, total) {
  return (
    entries
      .map(
        ([c, v]) =>
          `<div class="breakdown-row"><span>${esc(c)}</span>${progress(v, total)}<b>${eur(v)}</b></div>`,
      )
      .join("") || empty("Ainda não há despesas neste período.")
  );
}
function categories(prefix) {
  const values = new Map();
  F.expenseEntries(data, prefix).forEach((t) =>
    values.set(t.category, (values.get(t.category) || 0) + t.amount),
  );
  return [...values].sort((a, b) => b[1] - a[1]);
}
function renderReports() {
  if(view === "reports" && window.ReportsUI) return;
  const y = $("#reportYear").value,
    rows = months(y),
    income = sum(rows, (x) => x.income),
    expense = sum(rows, (x) => x.expense);
  $("#reportCards").innerHTML =
    metric("Receitas do ano", eur(income)) +
    metric("Despesas do ano", eur(expense)) +
    metric("Receitas menos despesas", eur(income - expense));
  chart("#annualChart", rows);
  $("#reportSubtitle").textContent = `Janeiro a dezembro de ${y}`;
  $("#annualCategories").innerHTML = breakdown(categories(y), expense);
  const alerts = [];
  data.budgets.forEach((b) => {
    if (
      spent(b.category) >=
      FinancePlus.budgetAt(data, b, month).available * 0.8
    )
      alerts.push(
        `${b.category}: ${eur(spent(b.category))} de um limite de ${eur(FinancePlus.budgetAt(data, b, month).available)}.`,
      );
  });
  const overdue = schedule().filter((p) => p.source !== "completed" && p.date.startsWith(month) && p.date < F.today());
  if (overdue.length)
    alerts.push(
      `${overdue.length} pagamento(s) com data passada ainda por registar.`,
    );
  if (data.pendingImports.length)
    alerts.push(`${data.pendingImports.length} movimento(s) aguardam revisão.`);
  const seen = new Set();
  let dup = 0;
  data.transactions.forEach((t) => {
    const k = fingerprint(t);
    if (seen.has(k)) dup++;
    seen.add(k);
  });
  if (dup)
    alerts.push(
      `${dup} possível(is) duplicado(s) nos movimentos. Confirma antes de apagar.`,
    );
  $("#alertsList").innerHTML =
    alerts.map((a) => `<div class="alert">${esc(a)}</div>`).join("") ||
    '<div class="alert good">Não há alertas para este mês.</div>';
  const closed = data.closedMonths.includes(month);
  $("#closeMonth").textContent = closed ? "Reabrir mês" : "Fechar mês";
  $("#monthChecklist").innerHTML = [
    [
      "Movimentos",
      data.transactions.filter((t) => t.date.startsWith(month)).length +
        " registados",
    ],
    [
      "Contas confirmadas",
      ReconciliationModel.monthReview(data, month).confirmed +
        " de " +
        data.accounts.length,
    ],
    ["Importações", data.pendingImports.length + " por rever"],
    [
      "Última exportação registada",
      window.DailyUI?.lastExport(key) || data.lastBackup
        ? new Date(
            window.DailyUI?.lastExport(key) || data.lastBackup,
          ).toLocaleString("pt-PT")
        : "Ainda não exportaste",
    ],
    ["Estado do mês", closed ? "Fechado para alterações" : "Aberto"],
  ]
    .map(
      ([l, v]) =>
        `<div class="check-item"><b>${l}</b><span>${esc(v)}</span></div>`,
    )
    .join("");
  const cats = categories(month),
    tot = totalsFor(month);
  $("#topCategory").textContent = cats[0]?.[0] || "Sem despesas";
  $("#topCategoryAmount").textContent = eur(cats[0]?.[1]);
  $("#topCategoryHint").textContent = tot.expense
    ? `${Math.round(((cats[0]?.[1] || 0) / tot.expense) * 100)}% das despesas de ${monthLabel(month)}.`
    : "Adiciona um movimento para começar.";
  $("#categoryBreakdown").innerHTML = breakdown(cats, tot.expense);
  $("#recurringCount").textContent = data.recurring.filter(
    (r) => r.active,
  ).length;
  $("#recurringList").innerHTML =
    data.recurring
      .map(
        (r) =>
          `<div class="transaction-item recurring-setting-row"><div><b>${esc(r.description)}</b><div class="transaction-meta">Dia ${r.day} · ${r.active ? "Ativo" : "Pausado"} · ${eur(r.amount)}</div></div><div class="row-actions">${button("Editar", "recurring", r.id, "link-button")}${button("Associar histórico", "link-recurring-history", r.id, "link-button")}${button("Histórico", "recurring-history", `recurring~${r.id}`, "link-button")}${button("Apagar", "delete-recurring", r.id, "link-button danger")}</div></div>`,
      )
      .join("") || empty("Ainda não tens movimentos mensais.");
  const monthDate = new Date(month + "-01T12:00:00"),
    previousDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1),
    previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`,
    previousYearMonth = `${monthDate.getFullYear() - 1}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
    previousTotals = totalsFor(previousMonth),
    yearAgoTotals = totalsFor(previousYearMonth),
    changeLabel = (now, before) => before
      ? `${now - before >= 0 ? "+" : ""}${Math.round(((now - before) / Math.abs(before)) * 100)}%`
      : "sem base",
    annualInsight = window.LifeFinance?.annualReport?.(data, month.slice(0, 4)),
    forecast = annualInsight?.forecast?.month === month ? annualInsight.forecast : null;
  $("#monthlySummary").innerHTML =
    `<div class="summary-row"><span>Receitas</span><b>${eur(tot.income)}</b><small>${changeLabel(tot.income, previousTotals.income)} vs. mês anterior · ${changeLabel(tot.income, yearAgoTotals.income)} vs. ano anterior</small></div>` +
    `<div class="summary-row"><span>Despesas</span><b>${eur(tot.expense)}</b><small>${changeLabel(tot.expense, previousTotals.expense)} vs. mês anterior · ${changeLabel(tot.expense, yearAgoTotals.expense)} vs. ano anterior</small></div>` +
    `<div class="summary-row"><span>Diferença</span><b class="${tot.income - tot.expense >= 0 ? "positive" : "negative"}">${eur(tot.income - tot.expense)}</b><small>${tot.income ? Math.round(((tot.income - tot.expense) / tot.income) * 100) + "% das receitas" : "Sem receitas registadas"}</small></div>` +
    `<div class="summary-row"><span>Movimentos</span><b>${data.transactions.filter((t) => t.date.startsWith(month)).length}</b><small>${cats.length} categorias com despesa</small></div>` +
    (forecast ? `<div class="summary-row summary-row-forecast"><span>Previsão fim do mês</span><b class="${forecast.balance >= 0 ? "positive" : "negative"}">${eur(forecast.balance)}</b><small>${eur(forecast.income)} receitas · ${eur(forecast.expense)} despesas projetadas</small></div>` : "");
}

function debtHistoryRows(d) {
  const posted = data.transactions
    .filter((t) => String(t.debtId) === String(d.id) && t.type === "expense")
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: Number(t.amount) || 0,
      principal: Number(t.principal) || 0,
      interest: Math.max(0, Number(t.interest ?? ((Number(t.amount) || 0) - (Number(t.principal) || 0) - (Number(t.charges) || 0))) || 0),
      charges: Math.max(0, Number(t.charges) || 0),
      note: t.note || "Movimento registado",
      source: "transaction",
    }));
  const previous = (d.previousPayments || []).map((h) => ({
    id: h.id,
    date: h.date,
    amount: Number(h.amount) || 0,
    principal: Number(h.principal ?? h.amount) || 0,
    interest: Math.max(0, Number(h.interest) || 0),
    charges: Math.max(0, Number(h.charges) || 0),
    note: h.note || "Pagamento anterior",
    source: "history",
  }));
  const linked = data.transactions
    .filter((t) => String(t.debtHistoryOf || "") === String(d.id) && t.type === "expense")
    .map((t) => {
      const amount = Number(t.amount) || 0;
      const breakdownKnown = t.debtHistoryPrincipal !== undefined || t.debtHistoryInterest !== undefined || t.debtHistoryCharges !== undefined;
      const principal = breakdownKnown ? Math.max(0, Number(t.debtHistoryPrincipal) || 0) : 0;
      const charges = breakdownKnown ? Math.max(0, Number(t.debtHistoryCharges) || 0) : 0;
      const interest = breakdownKnown ? Math.max(0, Number(t.debtHistoryInterest ?? F.money(amount - principal - charges)) || 0) : 0;
      return {
        id: t.id,
        date: t.date,
        amount,
        principal,
        interest,
        charges,
        breakdownKnown,
        note: t.note || t.description || "Movimento histórico associado",
        source: "linked",
      };
    });
  return [...posted, ...previous, ...linked].sort((a, b) => b.date.localeCompare(a.date));
}
function debtProjection(d, extraPrincipal = 0) {
  let balance = Math.max(0, (Number(d.balance) || 0) - Math.max(0, Number(extraPrincipal) || 0));
  const payment = Math.max(0, Number(d.payment) || 0), rate = Math.max(0, Number(d.rate) || 0) / 1200;
  if (!balance) return { months:0, interest:0, endDate:F.today(), possible:true };
  if (!payment || (rate && payment <= balance * rate)) return { months:null, interest:null, endDate:null, possible:false };
  let months = 0, interest = 0;
  while (balance > 0.005 && months < 1200) {
    const monthInterest = F.money(balance * rate);
    const principal = Math.min(balance, Math.max(0, F.money(payment - monthInterest)));
    if (principal <= 0) return { months:null, interest:null, endDate:null, possible:false };
    interest = F.money(interest + monthInterest);
    balance = F.money(balance - principal);
    months += 1;
  }
  const now = new Date(F.today() + "T12:00:00"), dueDay = Math.min(28, Math.max(1, Number(d.dueDay) || now.getDate()));
  const finish = new Date(now.getFullYear(), now.getMonth() + months, dueDay);
  const endDate = `${finish.getFullYear()}-${String(finish.getMonth()+1).padStart(2,"0")}-${String(finish.getDate()).padStart(2,"0")}`;
  return { months, interest, endDate, possible:months < 1200 };
}
function debtMetrics(d) {
  const history = debtHistoryRows(d),
    paid = history.reduce((n, h) => n + h.amount, 0),
    principalPaid = history.reduce((n, h) => n + h.principal, 0),
    interestPaid = history.reduce((n, h) => n + h.interest, 0),
    chargesPaid = history.reduce((n, h) => n + h.charges, 0),
    inferredOriginal = F.money((Number(d.balance) || 0) + principalPaid),
    original = Math.max(Number(d.originalPrincipal) || 0, inferredOriginal),
    progress = original > 0 ? Math.max(0, Math.min(100, ((original - (Number(d.balance)||0)) / original) * 100)) : 0;
  return { history, paid:F.money(paid), principalPaid:F.money(principalPaid), interestPaid:F.money(interestPaid), chargesPaid:F.money(chargesPaid), original:F.money(original), progress, projection:debtProjection(d) };
}
function debtHistoryRowHTML(debt, h) {
  const sourceLabel = h.source === "linked" ? "Movimento associado" : h.source === "history" ? "Pagamento manual" : "Movimento do crédito";
  const breakdown = h.source === "linked" && !h.breakdownKnown
    ? '<span class="debt-history-breakdown-missing">Capital/juros por preencher</span>'
    : `Capital ${eur(h.principal)} · Juros ${eur(h.interest)}${h.charges ? ` · Encargos ${eur(h.charges)}` : ""}`;
  const actions = h.source === "history"
    ? button("Editar", "edit-debt-history", `${debt.id}~${h.id}`, "link-button") + button("Remover", "delete-debt-history", `${debt.id}~${h.id}`, "link-button danger")
    : h.source === "linked"
      ? button("Editar valores", "edit-debt-history", `${debt.id}~${h.id}`, "link-button") + button("Desassociar", "unlink-debt-history", `${debt.id}~${h.id}`, "link-button danger")
      : button("Editar pagamento", "edit-debt-history", `${debt.id}~${h.id}`, "link-button");
  return `<div><span><b>${dateLabel(h.date)}</b><small>${sourceLabel} · ${breakdown}${h.note ? ` · ${esc(h.note)}` : ""}</small></span><strong>${eur(h.amount)}</strong><span class="debt-history-breakdown-actions">${actions}</span></div>`;
}

function renderWealth() {
  const cash = sum(data.accounts, (a) => a.balance),
    inv = sum(data.investments, (i) => i.value),
    assets = window.LifeFinance?.assetTotal(data) || 0,
    debt = sum(data.debts, (d) => d.balance);
  $("#wealthCards").innerHTML =
    metric("Património líquido", eur(cash + inv + assets - debt)) +
    metric("Saldo das contas", eur(cash)) +
    metric("Investimentos", eur(inv)) +
    metric("Outros bens", eur(assets));
  $("#investmentsList").innerHTML =
    data.investments
      .map(
        (i) =>
          `<div class="investment-row"><div><b>${esc(i.name)}</b><p>${esc(i.type)} · variação ${eur(i.value - i.cost)}</p></div><div><b>${eur(i.value)}</b><div class="row-actions">${button("Editar", "investment", i.id, "link-button")}${button("Apagar", "delete-investment", i.id, "link-button danger")}</div></div></div>`,
      )
      .join("") || empty("Regista o valor dos teus investimentos.");
  $("#wealthComposition").innerHTML = breakdown(
    [
      ["Contas", cash],
      ["Investimentos", inv],
      ["Outros bens", assets],
      ["Dívidas", debt],
    ],
    Math.max(cash + inv + assets, debt, 1),
  );
  const debtMetricsList = data.debts.map((d) => debtMetrics(d)),
    totalPaid = debtMetricsList.reduce((n, m) => n + m.paid, 0),
    totalInterestCharges = debtMetricsList.reduce((n, m) => n + m.interestPaid + m.chargesPaid, 0);
  $("#debtSummary").innerHTML =
    metric("Total em dívida", eur(debt)) +
    metric("Prestações mensais", eur(sum(data.debts, (d) => d.payment))) +
    metric("Total pago registado", eur(totalPaid), totalInterestCharges ? `${eur(totalInterestCharges)} em juros e encargos.` : "Capital, juros e encargos registados.");
  $("#debtGrid").innerHTML =
    data.debts
      .map((d) => {
        const m = debtMetrics(d), end = d.endDate ? dateLabel(d.endDate) : "Sem data contratual",
          forecast = m.projection.possible ? dateLabel(m.projection.endDate) : "Prestação insuficiente",
          forecastMonths = m.projection.months === 0 ? "Liquidado" : m.projection.months ? `${m.projection.months} ${m.projection.months === 1 ? "mês" : "meses"}` : "—",
          history = m.history.length
            ? `<details class="debt-history"><summary>Histórico completo (${m.history.length}) · ${eur(m.paid)}</summary><div class="debt-history-list">${m.history.map((h) => debtHistoryRowHTML(d, h)).join("")}</div></details>`
            : '<p class="muted debt-history-empty">Ainda não há pagamentos registados neste crédito.</p>';
        return `<details class="debt-card debt-collapsible"><summary><span><b>${esc(d.name)}</b><small>${eur(d.payment)}/mês · dia ${d.dueDay || 1}${d.account ? ` · ${esc(d.account)}` : ""}</small></span><strong>${eur(d.balance)}</strong></summary><div class="debt-expanded"><div class="debt-progress-wrap"><div class="debt-progress-head"><span>Capital amortizado</span><b>${Math.round(m.progress)}%</b></div><div class="debt-progress-track"><span style="width:${m.progress.toFixed(1)}%"></span></div><small>${eur(Math.max(0, m.original - d.balance))} de ${eur(m.original)} amortizados</small></div><div class="debt-kpis"><div><span>Capital inicial</span><b>${eur(m.original)}</b></div><div><span>Total pago</span><b>${eur(m.paid)}</b></div><div><span>Juros pagos</span><b>${eur(m.interestPaid)}</b></div><div><span>Encargos pagos</span><b>${eur(m.chargesPaid)}</b></div></div><div class="debt-details"><div>Taxa nominal<b>${d.rate || 0}%</b></div><div>Fim contratual<b>${end}</b></div><div>Fim estimado<b>${forecast}</b></div><div>Tempo estimado<b>${forecastMonths}</b></div><div>Juros futuros estimados<b>${m.projection.interest == null ? "—" : eur(m.projection.interest)}</b></div><div>Saldo atual<b>${eur(d.balance)}</b></div></div>${history}<div class="row-actions debt-actions">${button("Registar pagamento", "pay-debt", d.id)}${button("Amortização extraordinária", "extra-debt", d.id, "secondary")}${button("Associar histórico", "link-debt-history", d.id, "secondary")}${button("+ Pagamento anterior", "debt-history", d.id, "secondary")}${button("Editar", "debt", d.id, "link-button")}${button("Apagar", "delete-debt", d.id, "link-button danger")}</div></div></details>`;
      })
      .join("") || empty("Sem créditos registados.");
}
function importStatusMeta(status) {
  if (status === "duplicate") return { label: "Ignorar por defeito", className: "duplicate" };
  if (status === "possible") return { label: "Conferir", className: "possible" };
  return { label: "Novo", className: "new" };
}
function importSuggestionMeta(t) {
  const suggestion = t?.importSuggestion || {};
  if (suggestion.source === "rule") return { label: "Regra automática", className: "rule" };
  if (suggestion.source === "history") return { label: "Aprendido do histórico", className: "history" };
  if (suggestion.source === "merchant") return { label: "Estabelecimento reconhecido", className: "merchant" };
  return null;
}
function importPreviewItem(t) {
  const status = importStatusMeta(t.importStatus);
  const suggestion = importSuggestionMeta(t);
  const accountLabel = t.type === "transfer" ? `${t.account} → ${t.targetAccount}` : t.account;
  const categoryLabel = t.splits?.length ? `${t.splits.length} parcelas · ${t.splits.map((x) => x.category).slice(0, 2).join(" · ")}${t.splits.length > 2 ? "…" : ""}` : (t.category || "Por categorizar");
  const sign = t.type === "income" ? "+" : t.type === "transfer" ? "↔ " : "−";
  return `<div class="smart-import-preview-row"><div><b>${esc(t.beneficiary || t.description)}</b><small>${esc(t.description)} · ${dateLabel(t.date)} · ${esc(accountLabel)}</small><div class="smart-import-badges"><span class="import-status ${status.className}">${status.label}</span>${suggestion ? `<span class="import-suggestion ${suggestion.className}" title="${esc(t.importSuggestion?.reason || "")}">${suggestion.label}</span>` : ""}</div></div><span>${esc(categoryLabel)}</span><strong class="amount ${t.type}">${sign}${eur(t.amount)}</strong></div>`;
}
function fingerprint(t) {
  return [
    t.date,
    F.cents(t.amount),
    t.type,
    t.description.trim().toLocaleLowerCase("pt-PT"),
    t.account,
  ].join("|");
}
let importReviewFilter = "all";
function updateImportSelection() {
  const selected = $$("[data-import-check]:checked:not(:disabled)").length;
  const button = $("#confirmImports");
  if (button) { button.disabled = !selected; button.textContent = "Importar selecionados (" + selected + ")"; }
}

function renderReview() {
  const rows = data.pendingImports || [];
  const overlaps = window.PlanningFinance?.importOverlap(data, rows) || rows.map((row) => ({ row, status: "new", matches: [], total: 0 }));
  const overlapById = new Map(overlaps.map((entry) => [String(entry.row.id), entry]));
  const counts = { new: 0, possible: 0, duplicate: 0 };
  for (const t of rows) counts[overlapById.get(String(t.id))?.status || t.importStatus || "new"]++;
  const visibleRows = rows;
  $("#reviewMessage").innerHTML = rows.length ? `<div class="review-smart-summary"><b>${rows.length} por rever</b><span>${counts.new} novos</span><span>${counts.possible} a conferir</span><span>${counts.duplicate} duplicados desmarcados</span></div>` : "Importa um extrato CSV para começar.";
  $("#reviewTable").innerHTML =
    visibleRows
      .map((t) => {
        const overlap = overlapById.get(String(t.id));
        const statusName = overlap?.status || t.importStatus || "new";
        const status = importStatusMeta(statusName);
        const suggestion = importSuggestionMeta(t);
        const duplicate = statusName === "duplicate";
        const uncertain = statusName === "possible";
        const checked = !duplicate && !uncertain;
        const disabled = duplicate;
        const matchHint = overlap?.total ? ` · ${overlap.total} correspondência${overlap.total === 1 ? "" : "s"}` : "";
        const accountLabel = t.type === "transfer" ? `${t.account} → ${t.targetAccount}` : t.account;
        const categoryField = t.splits?.length
          ? `<div class="import-review-field import-review-splits"><span>Divisão por categorias</span><input type="hidden" data-import-category="${esc(t.id)}" value="${esc(t.category)}"><details><summary>${t.splits.length} parcelas</summary>${t.splits.map((part) => `<small>${esc(part.category)} · ${eur(part.amount)}</small>`).join("")}</details></div>`
          : `<label class="import-review-field"><span>Categoria</span><input aria-label="Categoria de ${esc(t.description)}" data-import-category="${esc(t.id)}" value="${esc(t.category)}" maxlength="120"></label>`;
        return `<div class="import-row smart-import-review-row status-${status.className}">
          <input type="checkbox" data-import-check="${esc(t.id)}" aria-label="Importar ${esc(t.description)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
          <div class="import-review-main"><b>${esc(t.beneficiary || t.description)}</b><small>${esc(t.description)}</small><small>${dateLabel(t.date)} · ${esc(accountLabel)}</small><div class="smart-import-badges"><span class="import-status ${status.className}" title="${esc(matchHint.trim())}">${status.label}${matchHint}</span>${suggestion ? `<span class="import-suggestion ${suggestion.className}" title="${esc(t.importSuggestion?.reason || "")}">${suggestion.label}</span>` : ""}</div></div>
          <label class="import-review-field"><span>Beneficiário</span><input aria-label="Beneficiário de ${esc(t.description)}" data-import-beneficiary="${esc(t.id)}" value="${esc(t.beneficiary || "")}" maxlength="160"></label>
          ${categoryField}
          <b class="amount ${t.type}">${t.type === "income" ? "+" : t.type === "transfer" ? "↔ " : "−"}${eur(t.amount)}</b>
        </div>`;
      })
      .join("") || empty("Importa um extrato CSV para começar.");
  updateImportSelection();
  $("#discardImports").textContent = "Limpar lista";
  $("#rulesList").innerHTML =
    data.rules
      .map(
        (r) =>
          `<div class="rule-row"><b>${esc(r.match)}</b><span>${esc(r.category)}${r.beneficiary ? ` · ${esc(r.beneficiary)}` : ""}${r.source === "import-learning" ? " · aprendida" : ""}</span><div class="row-actions">${button("Editar", "rule", r.id, "link-button")}${button("Apagar", "delete-rule", r.id, "link-button danger")}</div></div>`,
      )
      .join("") || empty("Cria regras para reconhecer descrições.");
}
function learnImportRule(transaction, category, beneficiary) {
  const rawKey = String(transaction.importRuleKey || beneficiary || F.importMerchant(transaction.description) || "").trim();
  const normalized = F.importNormalize(rawKey);
  const generic = new Set(["compra", "pagamento", "debito", "credito", "cartao", "transferencia", "sepa", "mbway", "tpa", "pos"]);
  if (normalized.length < 3 || generic.has(normalized)) return false;
  const existing = data.rules.find((r) => F.importNormalize(r.match) === normalized);
  if (existing) {
    // Regras criadas manualmente nunca são silenciosamente reescritas.
    if (existing.source !== "import-learning") {
      if (!existing.beneficiary && beneficiary) existing.beneficiary = beneficiary;
      return false;
    }
    existing.category = category;
    if (beneficiary) existing.beneficiary = beneficiary;
    existing.active = true;
    return true;
  }
  data.rules.push({
    id: F.id(),
    match: rawKey.slice(0, 100),
    category,
    beneficiary: beneficiary || undefined,
    source: "import-learning",
    priority: 40,
    active: true,
  });
  return true;
}

let storageInfoCacheData = null;
let storageInfoCacheKb = 0;
let activeRenderScheduleTextCache=null;
function storageInfoKb() {
  if (storageInfoCacheData !== data) {
    storageInfoCacheData = data;
    storageInfoCacheKb = Math.round(new Blob([JSON.stringify(data)]).size / 1024);
  }
  return storageInfoCacheKb;
}

function renderVisibleCore(v) {
  if (window.equilibrioStartup?.awaitingChoice) return;
  if (v === 'dashboard') renderDashboard();
  if (v === 'planner') renderPlanning();
  if (v === 'review' || v === 'dataHub' && window.UnifiedWorkspaceUI?.dataTask() === 'imports') renderReview();
  if (v === 'plansHub') renderPlanning();
  if (['reports','insights','weeklyHub'].includes(v)) renderReports();
  if (['wealth','wealthAccountsHub','wealthHoldingsHub','assets','investments','debts'].includes(v)) renderWealth();
}
function render() {
  if (window.equilibrioStartup?.awaitingChoice) { window.equilibrioStartup.deferredRenders++; return; }
  window.InterfaceUI?.beginRender(); F.renderCache?.begin();
  // Caches estritamente limitadas a um ciclo de render: evitam repetir cálculos
  // pesados sem poder ficar desatualizadas entre alterações aos dados.
  activeRenderTotalsCache = new Map();
  activeRenderSpentCache = new Map();
  activeRenderScheduleCache = new Map();
  activeRenderScheduleTextCache = new Map();
  try {
  const selected = $("#accountFilter").value;
  $("#accountFilter").innerHTML =
    '<option value="">Todas as contas</option>' +
    data.accounts
      .map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`)
      .join("");
  $("#accountFilter").value = selected;
  $("#demoBanner").hidden = !data.isDemo;
  $("#undo").disabled = !undoState;
  renderVisibleCore(view);
  if (view === "transactions") renderTransactions();
  renderCollections();
  // Agenda e importações são construídas ao entrar na respetiva página.
  // Não recalcular páginas ocultas em cada gravação ou pesquisa.
  $("#profileName").value = data.profile || "";
  $("#storageInfo").textContent =
    `${data.accounts.length} contas · ${data.transactions.length} movimentos · ${storageInfoKb()} KB guardados neste navegador.`;
  navigate(view, true);
  window.FeatureUI?.render();
  window.PremiumUI?.render();
  window.AnalysisUI?.enhance();
  window.WealthAnalysisV3?.render();
  } finally {
    activeRenderTotalsCache = null;
    activeRenderSpentCache = null;
    activeRenderScheduleCache = null;
    activeRenderScheduleTextCache = null;
    F.renderCache?.end(); window.InterfaceUI?.endRender();
  }
}
function field(label, name, value = "", type = "text", attrs = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}
function dateStepperField(label, name, value, attrs = "") {
  return `<label class="date-stepper-field">${label}<span class="date-stepper-control"><input name="${name}" type="date" value="${esc(value)}" ${attrs}><span class="date-stepper-buttons"><button type="button" data-date-step="1" aria-label="Dia seguinte" title="Dia seguinte">▲</button><button type="button" data-date-step="-1" aria-label="Dia anterior" title="Dia anterior">▼</button></span></span></label>`;
}
function bindDateStepper(host, name) {
  const input = host?.querySelector(`[name="${name}"]`);
  if (!input) return;
  const format = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const refresh = () => {
    host.querySelectorAll("[data-date-step]").forEach((button) => {
      const delta = Number(button.dataset.dateStep || 0);
      if (!input.value || !F.validDate(input.value)) { button.disabled = false; return; }
      const d = new Date(input.value + "T12:00");
      d.setDate(d.getDate() + delta);
      const next = format(d);
      button.disabled = Boolean((input.max && next > input.max) || (input.min && next < input.min));
    });
  };
  host.querySelectorAll("[data-date-step]").forEach((button) => button.addEventListener("click", () => {
    const delta = Number(button.dataset.dateStep || 0);
    const base = F.validDate(input.value) ? input.value : F.today();
    const d = new Date(base + "T12:00");
    d.setDate(d.getDate() + delta);
    const next = format(d);
    if ((input.max && next > input.max) || (input.min && next < input.min)) return;
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
    input.focus();
  }));
  input.addEventListener("input", refresh);
  input.addEventListener("change", refresh);
  refresh();
}
function number(label, name, value = 0, min = 0) {
  return field(
    label,
    name,
    value,
    "number",
    `required min="${min}" step="0.01"`,
  );
}
function select(label, name, options, value) {
  return `<label>${label}<select name="${name}">${options
    .map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`;
    })
    .join("")}</select></label>`;
}
function accountSelect(name = "account", value, exclude) {
  return select(
    "Conta",
    name,
    data.accounts
      .filter((a) => a.name !== exclude && (!a.archived || a.name === value))
      .map((a) => a.name),
    value,
  );
}
function formFingerprint() {
  return JSON.stringify($$('#modalContent input, #modalContent select, #modalContent textarea').map((el, i) =>
    [el.name || i, el.type, el.value, el.checked, [...(el.files || [])].map(f => [f.name, f.size, f.lastModified])]));
}
function formStatus() {
  return { busy: formSubmitting, dirty: Boolean($('#modal').open && formBaseline !== null && formBaseline !== formFingerprint()) };
}
function canLeaveForm() {
  if (formSubmitting) {
    notice('Aguarda a conclusão da operação. O formulário mantém-se aberto.', true);
    return false;
  }
  return !formStatus().dirty || window.confirm('Descartar as alterações deste formulário que ainda não foram guardadas?');
}
function closeForm() {
  if (!canLeaveForm()) return false;
  window.DraftUI?.discard();
  const returnView = $('#modal').dataset.returnView;
  $('#modal').close();
  formBaseline = null;
  if (returnView && $('#' + returnView)) navigate(returnView);
  return true;
}
window.FormSession = { status: formStatus, canLeave: canLeaveForm };
window.addEventListener('beforeunload', event => {
  if (!window.financasDesktop?.isDesktop && (formStatus().busy || formStatus().dirty)) {
    event.preventDefault(); event.returnValue = '';
  }
});
function form(title, fields, action, help = "", submit = "Guardar") {
  window.DraftUI?.suspend();
  formRevision++;
  $('#modalForm .close').disabled = false;
  $("#modal").classList.remove("import-dialog", "transaction-editor", "receipt-review-dialog", "financial-detail-dialog", "balance-variation-dialog", "receipt-image-dialog");
  $("#modalForm").classList.remove("receipt-assisted-review");
  const formSpace = key;
  const returnView = view;
  $("#modal").dataset.returnView = returnView;
  formAction = (values) => {
    if (key !== formSpace)
      throw Error(
        "O espaço aberto mudou. Abre novamente o formulário neste espaço.",
      );
    return action(values);
  };
  $("#modalContent").innerHTML =
    `<h2 id="formTitle">${title}</h2>${help ? `<p class="modal-subtitle">${help}</p>` : ""}<div id="formError" role="alert" hidden></div>${fields}<button class="primary full" type="submit">${submit}</button>`;
  $("#modal").showModal();
  const revision = formRevision;
  formBaseline = null;
  queueMicrotask(() => { if (formRevision === revision) formBaseline = formFingerprint(); });
  setTimeout(
    () =>
      $(
        "#modalContent input, #modalContent select, #modalContent textarea",
      )?.focus(),
    0,
  );
}
function requireAccounts() {
  if (data.accounts.length) return true;
  notice("Adiciona uma conta antes de registar movimentos.", true);
  navigate("accounts");
  return false;
}

async function attachmentFromFile(file) {
  if (!file?.size) return undefined;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""),
    allowedImage = ["image/png", "image/jpeg", "image/webp"].includes(file.type),
    limit = isPdf ? 8 * 1024 * 1024 : 10 * 1024 * 1024;
  if (!isPdf && !allowedImage) throw Error("O comprovativo deve ser PDF, PNG, JPEG ou WebP.");
  if (file.size > limit) throw Error(isPdf ? "O PDF deve ter no máximo 8 MB." : "A imagem deve ter no máximo 10 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let dataUrl = String(reader.result || "");
      const type = file.type || (isPdf ? "application/pdf" : "image/jpeg");
      if (isPdf && !dataUrl.startsWith("data:application/pdf;base64,")) {
        const payload = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : "";
        dataUrl = `data:application/pdf;base64,${payload}`;
      }
      resolve({ name: file.name || (isPdf ? "comprovativo.pdf" : "comprovativo"), type, size: file.size, data: dataUrl });
    };
    reader.onerror = () => reject(Error("Não foi possível guardar o comprovativo."));
    reader.readAsDataURL(file);
  });
}

function transactionForm(id) {
  if (!requireAccounts()) return;
  const t = id ? find("transactions", id) : null;
  if (t?.type === "transfer") return transferForm(null, t.id);
  if(t?.source==='Casa reembolso')return window.CasaUI?.openPurchase(data.casa?.returns?.find(r=>r.id===t.sourceId)?.purchaseId);
  if (t?.source === 'Casa integrado') return window.CasaUI?.openPurchase(t.sourceId);
  if (t && data.closedMonths.includes(t.date.slice(0, 7)))
    return notice("Reabre o mês para editar este movimento.", true);
  const cats = [
    ...new Set([
      "Alimentação",
      "Casa",
      "Transportes",
      "Lazer",
      "Saúde",
      "Subscrições",
      "Salário",
      "Outros",
      ...data.budgets.map((b) => b.category),
      ...data.transactions.map((t) => t.category).filter(Boolean),
    ]),
  ];
  const categoryDirectory = (window.CompleteFinance?.categoryList(data) || cats.map((name) => ({ name, parent: "", archived: false, level: 1 })))
      .filter((c) => !c.archived),
    formCategoryParts = F.categoryParts(t?.category || "Outros"),
    formBaseCategory = formCategoryParts[0] || "Outros",
    formSubcategory = formCategoryParts[1] || "",
    formCategoryDetail = formCategoryParts[2] || "",
    formCategorySubdetail = formCategoryParts[3] || "";
  const splitEditor = `<div class="transaction-split-launcher" id="transactionSplitLauncher"><div><b>Compra com várias categorias</b><small id="transactionSplitStatus">${t?.splits?.length ? `${t.splits.length} parcelas configuradas` : "Mantém o formulário simples e abre um editor próprio quando precisares."}</small></div><button type="button" id="openTransactionSplitWorkbench" class="secondary">${t?.splits?.length ? "Editar divisão" : "Dividir compra"}</button></div><input name="useSplits" type="hidden" value="${t?.splits?.length ? "1" : ""}"><section class="transaction-split-workbench" id="transactionSplitWorkbench" hidden><div class="transaction-split-workbench-card"><div class="transaction-split-workbench-head"><div><p class="eyebrow">Compra repartida</p><h3>Distribuir por categorias</h3><p>Adiciona as categorias, subcategorias e valores desta compra. O saldo da conta continua a baixar apenas uma vez pelo total do movimento.</p></div><button type="button" id="closeTransactionSplitWorkbench" class="secondary">Voltar ao movimento</button></div><div class="transaction-split-workbench-summary"><strong id="transactionSplitPurchaseTotal">Total: ${eur(t?.amount || 0)}</strong><span id="transactionSplitTotal" role="status"></span></div><div id="transactionSplitRows"></div><div class="transaction-split-workbench-footer"><button type="button" id="transactionAddSplit" class="secondary">+ Adicionar linha</button><button type="button" id="removeTransactionSplit" class="link-button danger">Remover divisão</button><button type="button" id="doneTransactionSplit" class="primary">Concluir divisão</button></div></div></section>`;
  form(
    t ? "Editar movimento" : "Novo movimento",
    select(
      "Tipo",
      "type",
      [
        ["expense", "Despesa"],
        ["income", "Receita"],
      ],
      t?.type || "expense",
    ) +
      field(
        "Descrição",
        "description",
        t?.description || "",
        "text",
        'required maxlength="160" list="movementDescriptions"',
      ) +
      `<div class="two-cols">${number("Valor (€)", "amount", t?.amount || "", 0.01)}${dateStepperField("Data", "date", t?.date || F.today(), `required max="${F.today()}"`)}</div>` +
      '<div id="transactionMainCategory">' + field(
        "Categoria",
        "category",
        formBaseCategory,
        "text",
        'required list="categories" maxlength="80"',
      ) +
      field(
        "Subcategoria (opcional)",
        "subcategory",
        formSubcategory,
        "text",
        'maxlength="80" list="subcategories" placeholder="Seleciona ou escreve uma nova"',
      ) +
      `<div class="two-cols category-depth-fields">${field(
        "Detalhe · 3.º nível (opcional)",
        "categoryDetail",
        formCategoryDetail,
        "text",
        'maxlength="80" list="categoryDetails" placeholder="Ex.: Café"',
      )}${field(
        "Subdetalhe · 4.º nível (opcional)",
        "categorySubdetail",
        formCategorySubdetail,
        "text",
        'maxlength="80" list="categorySubdetails" placeholder="Ex.: Cápsulas"',
      )}</div>` +
      '<datalist id="subcategories"></datalist><datalist id="categoryDetails"></datalist><datalist id="categorySubdetails"></datalist>' +
      '</div>' + splitEditor +
      field(
        "Beneficiário / estabelecimento",
        "beneficiary",
        t?.beneficiary || "",
        "text",
        'maxlength="160" placeholder="Ex.: supermercado, restaurante, pessoa" list="beneficiaries"',
      ) +
      `<datalist id="beneficiaries">${[...new Set([...(data.savedBeneficiaries || []), ...data.transactions.map((x) => (x.beneficiary || "").trim()) ].filter(Boolean))].filter(name=>!(Array.isArray(data.hiddenBeneficiaries)?data.hiddenBeneficiaries:[]).includes(name)).sort((a,b)=>a.localeCompare(b,"pt")).map((x)=>`<option value="${esc(x)}">`).join("")}</datalist>` +
      `<datalist id="categories">${[...new Set(categoryDirectory.map((c) => c.name.split(" / ")[0]))]
        .filter((c) => !data.categoryArchive.some((a) => a.name === c))
        .map((c) => `<option value="${esc(c)}">`)
        .join("")}</datalist>` +
      accountSelect(
        "account",
        t?.account ||
          data.transactions
            .slice()
            .reverse()
            .find((x) =>
              data.accounts.some((a) => a.name === x.account && !a.archived),
            )?.account,
      ) +
      `<label>Nota<textarea name="note" maxlength="1000" placeholder="Uma observação sobre este movimento">${esc(t?.note || "")}</textarea></label>` +
      select(
        "Cor da nota",
        "noteColor",
        [
          ["auto", "Automática por categoria"],
          ["default", "Discreta"],
          ["blue", "Azul"],
          ["green", "Verde"],
          ["purple", "Roxo"],
          ["orange", "Laranja"],
          ["red", "Vermelho"],
        ],
        t?.noteColor || "auto",
      ) +
      '<details class="optional-fields" ' +
      (t?.attachment ? "open" : "") +
      "><summary>Comprovativo e outras opções</summary>" +
      select(
        "Classificação da despesa",
        "expenseNature",
        [
          ["variable", "Variável"],
          ["fixed", "Fixa"],
        ],
        t?.expenseNature || "variable",
      ) +
      `<label class="attachment-picker">Comprovativo<input name="attachment" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label><p class="muted">O comprovativo fica associado ao movimento e guardado nos dados do espaço. PDF até 8 MB; imagens até 10 MB.</p>${t?.attachment ? '<label class="checkbox"><input name="removeAttachment" type="checkbox"> Remover comprovativo atual</label>' : ""}` +
      (!t
        ? '<label class="checkbox"><input name="recurring" type="checkbox"> Repetir mensalmente (confirmar cada ocorrência)</label>'
        : "") +
      "</details>",
    async (f) => {
      const editingSpaceKey = key;
      const date = f.get("date");
      if (date > F.today())
        throw Error("Usa Planeamento para pagamentos futuros.");
      let attachment = t?.attachment;
      if (f.has("removeAttachment")) attachment = undefined;
      const file = f.get("attachment");
      if (file?.size) attachment = await attachmentFromFile(file);
      if (key !== editingSpaceKey)
        throw Error(
          "O espaço mudou. Abre novamente o formulário no espaço pretendido.",
        );
      const beneficiary = (f.get("beneficiary") || "").trim();

      const splitEnabled = $("#modalContent [name=useSplits]")?.value === "1";
      let txSplits;
      if (splitEnabled) {
        if (f.get("type") !== "expense")
          throw Error("A divisão por categorias está disponível apenas para despesas.");
        const rows = $$("#transactionSplitRows [data-transaction-split-row]");
        txSplits = rows.map((row) => {
          const category = row.querySelector("[data-tx-split-category]")?.value.trim() || "";
          const subcategory = row.querySelector("[data-tx-split-subcategory]")?.value.trim() || "";
          const detail = row.querySelector("[data-tx-split-detail]")?.value.trim() || "";
          const subdetail = row.querySelector("[data-tx-split-subdetail]")?.value.trim() || "";
          const parts = [category, subcategory, detail, subdetail];
          const gap = parts.findIndex((part) => !part);
          if (gap >= 0 && parts.slice(gap + 1).some(Boolean)) return { category: "", amount: 0 };
          const amount = +(row.querySelector("[data-tx-split-amount]")?.value || 0);
          return { category: F.categoryPath(parts), amount, note: (row.querySelector("[data-tx-split-note]")?.value || "").trim() };
        });
        if (txSplits.length < 2 || txSplits.some((x) => !x.category || !Number.isFinite(x.amount) || x.amount <= 0))
          throw Error("Adiciona pelo menos duas parcelas válidas à compra.");
        if (txSplits.reduce((n, x) => n + F.cents(x.amount), 0) !== F.cents(+f.get("amount")))
          throw Error("A soma das parcelas tem de coincidir exatamente com o valor total do movimento.");
        if (f.has("recurring"))
          throw Error("Uma compra dividida por categorias não pode ser transformada diretamente numa recorrência.");
      }
      const categoryParts = [
        (f.get("category") || "").trim(),
        (f.get("subcategory") || "").trim(),
        (f.get("categoryDetail") || "").trim(),
        (f.get("categorySubdetail") || "").trim(),
      ];
      const firstGap = categoryParts.findIndex((part) => !part);
      if (!txSplits && firstGap >= 0 && categoryParts.slice(firstGap + 1).some(Boolean))
        throw Error("Preenche os níveis de categoria por ordem, sem saltar níveis.");
      const baseCategory = F.categoryPath(categoryParts);
      if (!txSplits && !baseCategory) throw Error("Indica uma categoria.");
      const tx = {
        ...t,
        ...(!t&&window.DraftUI?.token()?.kind==='movement'?{id:window.DraftUI.token().id}:{}),
        ...(t?.recurringRuleId
          ? { recurringDate: t.recurringDate || t.date }
          : {}),
        description: f.get("description").trim(),
        amount: +f.get("amount"),
        type: f.get("type"),
        date,
        category: txSplits?.[0]?.category || baseCategory,
        beneficiary,
        noteColor: f.get("noteColor") === "auto" ? undefined : (f.get("noteColor") || t?.noteColor),
        account: f.get("account"),
        expenseNature: f.get("expenseNature") || "variable",
        tags: structuredClone(t?.tags || []),
        note: f.get("note").trim(),
        attachment,
        ...(txSplits ? { splits: txSplits } : {}),
      };
      if (t?.attachment?.data !== attachment?.data) delete tx.receiptText;
      if (!txSplits) delete tx.splits;
      if (tx.debtHistoryOf && (tx.debtHistoryPrincipal !== undefined || tx.debtHistoryInterest !== undefined || tx.debtHistoryCharges !== undefined)) {
        const historicalPrincipal = Math.max(0, Number(tx.debtHistoryPrincipal) || 0);
        const historicalCharges = Math.max(0, Number(tx.debtHistoryCharges) || 0);
        const historicalInterest = F.money(tx.amount - historicalPrincipal - historicalCharges);
        if (historicalInterest < -0.005) throw Error("O novo total é inferior ao capital + encargos associados a este crédito. Edita primeiro a divisão do pagamento no Património.");
        tx.debtHistoryPrincipal = F.money(historicalPrincipal);
        tx.debtHistoryCharges = F.money(historicalCharges);
        tx.debtHistoryInterest = Math.max(0, historicalInterest);
      }
      return commit(
        () => {
          const added = t ? F.update(data, t.id, tx) : F.add(data, tx);
      if (beneficiary) data.savedBeneficiaries = [...new Set([...(data.savedBeneficiaries || []), beneficiary])].sort((a,b)=>a.localeCompare(b,"pt"));
          if (!t && f.has("recurring")) {
            const rule = {
              id: F.id(),
              description: tx.description,
              amount: tx.amount,
              type: tx.type,
              category: tx.category,
              account: tx.account,
              start: date,
              day: +date.slice(8),
              active: true,
            };
            data.recurring.push(rule);
            added.recurringRuleId = rule.id;
          }
        },
        t ? "Movimento atualizado." : "Movimento registado.",
      );
    },
    "Os saldos são atualizados ao guardar. Para uma data futura, usa Planeamento.",
  );
  bindDateStepper($("#modalContent"), "date");
  const descriptions = document.createElement("datalist");
  window.MovementUI?.enhanceForm(t);
  window.ReceiptUI?.attachToMovement(t);
  $("#modal").classList.add('transaction-editor');
  const editor=$('#modalContent'),identity=document.createElement('div'),basics=document.createElement('div');
  identity.className='transaction-identity';basics.className='transaction-basics';
  const moveField=(name,host)=>{const label=editor.querySelector('[name='+name+']')?.closest('label');if(label)host.append(label);};
  moveField('description',identity);moveField('beneficiary',identity);
  moveField('type',basics);moveField('date',basics);moveField('account',basics);moveField('amount',basics);
  $('#formError').after(identity,basics);
  editor.querySelectorAll('.two-cols').forEach(n=>{if(!n.children.length)n.remove();});
  const receipt=editor.querySelector('.receipt-inline');if(receipt)identity.before(receipt);
  const notes=document.createElement('div');notes.className='transaction-notes';editor.querySelector('[name=note]').closest('label').before(notes);moveField('note',notes);moveField('noteColor',notes);
  const noteDisclosure=document.createElement('details');noteDisclosure.className='transaction-note-disclosure';noteDisclosure.innerHTML='<summary>Nota e cor (opcional)</summary>';notes.before(noteDisclosure);noteDisclosure.append(notes);noteDisclosure.open=!!t?.note||!!t?.noteColor;
  const depth=editor.querySelector('.category-depth-fields'),depthDisclosure=document.createElement('details');depthDisclosure.className='transaction-depth-disclosure';depthDisclosure.innerHTML='<summary>Mais níveis de categoria</summary>';depth.before(depthDisclosure);depthDisclosure.append(depth);depthDisclosure.open=!!formCategoryDetail||!!formCategorySubdetail;
  const options=[...editor.querySelectorAll('details')].find(el=>el.querySelector(':scope>summary')?.textContent==='Comprovativo e outras opções');
  if(options){options.classList.add('transaction-options-disclosure');const pair=document.createElement('div');pair.className='transaction-extra-options';noteDisclosure.before(pair);pair.append(noteDisclosure,options);}
  identity.classList.add('transaction-essential-identity');
  basics.querySelector('[name=type]').closest('label').classList.add('transaction-type-field');
  for(const name of ['amount','account','date'])basics.querySelector('[name='+name+']').closest('label').classList.add('transaction-'+name+'-field');
  moveField('beneficiary',basics);basics.querySelector('[name=beneficiary]').closest('label').classList.add('transaction-beneficiary-field');
  basics.append(identity);
  const typeInput=basics.querySelector('[name=type]'),typeChoices=document.createElement('div');typeChoices.className='transaction-type-choices';typeChoices.setAttribute('role','group');typeChoices.setAttribute('aria-label','Tipo de movimento');
  for(const [value,label,glyph]of [['expense','Despesa','↓'],['income','Receita','↑']]){const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.movementType=value;b.textContent=glyph+' '+label;b.onclick=()=>{typeInput.value=value;typeInput.dispatchEvent(new Event('change',{bubbles:true}));};typeChoices.append(b);}
  typeInput.closest('label').append(typeChoices);typeInput.classList.add('transaction-native-type');
  const syncType=()=>typeChoices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.movementType===typeInput.value)));typeInput.addEventListener('change',syncType);syncType();
  const helper=editor.querySelector('.modal-subtitle');if(helper)helper.remove();
  if(receipt){basics.querySelector('.transaction-type-field').after(receipt);receipt.querySelector('summary').textContent='Ler fatura';}
  const submit=editor.querySelector('button[type=submit]'),footer=document.createElement('div');footer.className='transaction-editor-footer';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancelar';cancel.onclick=closeForm;submit.before(footer);footer.append(cancel,submit);
  const categoryInputs=['category','subcategory','categoryDetail','categorySubdetail'].map(name=>$('#modalContent [name='+name+']'));
  const categoryHint=document.createElement('p');categoryHint.id='transactionCategoryHint';categoryHint.className='muted';categoryHint.hidden=true;categoryHint.setAttribute('role','status');$('#transactionMainCategory').append(categoryHint);
  const assignCategoryPath=path=>{
    const parts=F.categoryParts(String(path||'').replace(/\s*\/\s*/g,' / '));
    categoryInputs.forEach((input,i)=>{if(input)input.value=parts[i]||'';});
    if(parts.length>2)depthDisclosure.open=true;
    categoryHint.hidden=parts.length<2;categoryHint.textContent='Categoria → Subcategoria → Detalhe: '+parts.join(' → ');
  };
  const absorbCategoryPath=()=>{if(categoryInputs[0]?.value.includes('/')){assignCategoryPath(categoryInputs[0].value);categoryInputs[0].dispatchEvent(new Event('change',{bubbles:true}));}};
  categoryInputs[0]?.addEventListener('input',absorbCategoryPath);categoryInputs[0]?.addEventListener('change',absorbCategoryPath);absorbCategoryPath();
  descriptions.id = "movementDescriptions";
  descriptions.innerHTML = [
    ...new Set(
      data.transactions
        .slice()
        .reverse()
        .map((x) => x.description),
    ),
  ]
    .slice(0, 40)
    .map((x) => '<option value="' + esc(x) + '">')
    .join("");
  $("#modalContent").append(descriptions);
  const splitFlag = $("#modalContent [name=useSplits]");
  const splitLauncher = $("#transactionSplitLauncher");
  const splitWorkbench = $("#transactionSplitWorkbench");
  const splitRowsHost = $("#transactionSplitRows");
  const splitAdd = $("#transactionAddSplit");
  const splitTotal = $("#transactionSplitTotal");
  const splitStatus = $("#transactionSplitStatus");
  const splitPurchaseTotal = $("#transactionSplitPurchaseTotal");
  let transactionSplitParts = structuredClone(t?.splits || []);
  const readTransactionSplitParts = () => {
    if (!splitRowsHost) return;
    transactionSplitParts = $$("#transactionSplitRows [data-transaction-split-row]").map((row) => ({
      category: row.querySelector("[data-tx-split-category]")?.value || "",
      subcategory: row.querySelector("[data-tx-split-subcategory]")?.value || "",
      detail: row.querySelector("[data-tx-split-detail]")?.value || "",
      subdetail: row.querySelector("[data-tx-split-subdetail]")?.value || "",
      amount: +(row.querySelector("[data-tx-split-amount]")?.value || 0),
      note: row.querySelector("[data-tx-split-note]")?.value || "",
    }));
  };
  const updateTransactionSplitTotal = () => {
    if (!splitTotal) return;
    const distributedCents = $$("#transactionSplitRows [data-tx-split-amount]").reduce((n, el) => n + F.cents(+el.value || 0), 0);
    const distributed = distributedCents / 100, amountInput = $("#modalContent [name=amount]");
    if (splitFlag?.value === "1" && amountInput) amountInput.value = distributed.toFixed(2);
    if (splitPurchaseTotal) splitPurchaseTotal.textContent = 'Total da compra: '+eur(distributed);
    splitTotal.textContent = 'Calculado automaticamente pela soma das parcelas.';
    splitTotal.classList.toggle('positive', distributed > 0);
    splitTotal.classList.toggle('negative', distributed <= 0);
  };
  const updateTransactionSplitLauncher = () => {
    if (!splitStatus || !splitFlag) return;
    const enabled = splitFlag.value === "1";
    const amountInput = $("#modalContent [name=amount]");
    if (amountInput) { amountInput.readOnly = enabled; const label = amountInput.closest("label"); if (label?.firstChild?.nodeType === 3) label.firstChild.textContent = enabled ? "Valor total (€) · calculado pelas parcelas" : "Valor (€)"; }
    const mainCategory = $("#transactionMainCategory");
    if (mainCategory) { mainCategory.hidden = enabled; mainCategory.querySelectorAll("input").forEach(input => { input.disabled = enabled; }); }
    splitStatus.textContent = enabled
      ? `${transactionSplitParts.length} parcelas · As análises e os orçamentos usam a categoria e o valor de cada parcela. A nota geral aplica-se à compra inteira.`
      : "Mantém o formulário simples e abre um editor próprio quando precisares.";
    const open = $("#openTransactionSplitWorkbench");
    if (open) open.textContent = enabled ? "Editar divisão" : "Dividir compra";
  };
  const drawTransactionSplits = () => {
    if (!splitRowsHost || !splitFlag || splitFlag.value !== "1") {
      updateTransactionSplitLauncher();
      return;
    }
    if (!transactionSplitParts.length) {
      const totalValue = +$("#modalContent [name=amount]")?.value || 0;
      const first = F.money(totalValue / 2);
      transactionSplitParts = [
        {
          category: $("#modalContent [name=category]")?.value || "Outros",
          subcategory: $("#modalContent [name=subcategory]")?.value || "",
          detail: $("#modalContent [name=categoryDetail]")?.value || "",
          subdetail: $("#modalContent [name=categorySubdetail]")?.value || "",
          amount: first,
        },
        { category: "Outros", subcategory: "", detail: "", subdetail: "", amount: F.money(totalValue - first) },
      ];
    }
    splitRowsHost.innerHTML = transactionSplitParts.map((part, i) => {
      const pieces = part.subcategory !== undefined
        ? [part.category || "", part.subcategory || "", part.detail || "", part.subdetail || ""]
        : F.categoryParts(part.category || "");
      const category = pieces[0] || "", subcategory = pieces[1] || "", detail = pieces[2] || "", subdetail = pieces[3] || "";
      return `<div class="tx-split-row tx-split-row-deep" data-transaction-split-row><label>Categoria<input data-tx-split-category list="splitChoices${i}-0" maxlength="80" value="${esc(category)}" required></label><label>Subcategoria<input data-tx-split-subcategory list="splitChoices${i}-1" maxlength="80" value="${esc(subcategory)}" placeholder="Opcional"></label><label>Detalhe<input data-tx-split-detail list="splitChoices${i}-2" maxlength="80" value="${esc(detail)}" placeholder="3.º nível"></label><label>Subdetalhe<input data-tx-split-subdetail list="splitChoices${i}-3" maxlength="80" value="${esc(subdetail)}" placeholder="4.º nível"></label><label>Valor (€)<input data-tx-split-amount type="number" min="0.01" step="0.01" value="${esc(part.amount || "")}" required></label><div class="tx-split-actions"><button type="button" class="secondary" data-duplicate-transaction-split="${i}" aria-label="Duplicar linha ${i + 1}">Duplicar</button><button type="button" class="link-button danger" data-remove-transaction-split="${i}" aria-label="Remover linha ${i + 1}" ${transactionSplitParts.length <= 2 ? "disabled" : ""}>×</button></div><label class="tx-split-note">Nota (opcional)<textarea data-tx-split-note maxlength="1000" rows="1" placeholder="Ex.: produtos para o aniversário">${esc(part.note || "")}</textarea></label></div>`;
    }).join("");
    bindSplitChoices();
    updateTransactionSplitTotal();
    updateTransactionSplitLauncher();
  };
  const bindSplitChoices = () => {
    const paths=categoryDirectory.map(c=>F.categoryParts(c.name));
    splitRowsHost.querySelectorAll('[data-transaction-split-row]').forEach((row,i)=>{
      const inputs=['category','subcategory','detail','subdetail'].map(k=>row.querySelector('[data-tx-split-'+k+']'));
      // Um descendente só pertence ao contexto em que foi introduzido.
      // Limpar ao mudar o pai evita transportar combinações de outra categoria.
      inputs.forEach((input,level)=>{
        let parentValue=input.value.trim();
        input.addEventListener('input',()=>{
          const next=input.value.trim();if(next===parentValue)return;parentValue=next;
          inputs.slice(level+1).forEach(child=>{child.value='';child.closest('.split-choice')?.querySelector('select')?.remove();child.setAttribute('aria-expanded','false');});
        });
      });
      const refresh=()=>inputs.forEach((input,level)=>{
        let list=row.querySelector('#splitChoices'+i+'-'+level);if(!list){list=document.createElement('datalist');list.id='splitChoices'+i+'-'+level;row.append(list);}
        const choices=[...new Set(paths.filter(p=>p[level]&&inputs.slice(0,level).every((v,j)=>v.value.trim()===p[j])).map(p=>p[level]))].sort((a,b)=>a.localeCompare(b,'pt'));
        list.innerHTML=choices.map(value=>'<option value="'+esc(value)+'"></option>').join('');
      });
      inputs.forEach((input,level)=>{
        // The explicit picker replaces the native datalist arrow. Its options
        // still come from the hierarchy-specific datalist below.
        input.removeAttribute('list');
        const wrap=document.createElement('div');wrap.className='split-choice';input.before(wrap);wrap.append(input);
        const choose=document.createElement('button');choose.type='button';choose.className='split-choice-arrow';choose.textContent='▾';choose.setAttribute('aria-label','Selecionar '+['categoria','subcategoria','detalhe','subdetalhe'][level]);wrap.append(choose);
        let suppress=false;
        const close=()=>{wrap.querySelector('select')?.remove();input.setAttribute('aria-expanded','false');};
        const show=(filter=false,focus=false)=>{
          refresh();close();
          const needle=filter?input.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt'):'';
          const options=[...row.querySelector('#splitChoices'+i+'-'+level).options].filter(o=>!needle||o.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt').includes(needle));
          if(!options.length&&filter)return;
          const list=document.createElement('select');list.size=Math.min(6,Math.max(2,options.length+1));list.setAttribute('aria-label',choose.getAttribute('aria-label'));list.className='split-choice-options';
          list.innerHTML='<option value="">'+(options.length?'Escolher…':'Sem opções — escreve no campo')+'</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.value)+'</option>').join('');wrap.append(list);input.setAttribute('aria-expanded','true');
          list.onchange=()=>{if(!list.value)return;input.value=list.value;close();suppress=true;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();suppress=false;};
          list.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();suppress=true;input.focus();suppress=false;}};
          if(focus)list.focus();
        };
        input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
        choose.onclick=()=>show(false,true);
        input.addEventListener('input',()=>{refresh();if(!suppress)show(true);});
        input.addEventListener('focus',()=>{if(!suppress)show(true);});
        input.addEventListener('keydown',e=>{if(e.key==='Escape'&&wrap.querySelector('select')){e.preventDefault();e.stopPropagation();close();}else if(e.key==='ArrowDown'){e.preventDefault();show(true,true);}});
        wrap.addEventListener('focusout',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement))close();},0));
      });refresh();
    });
  };
  $("#openTransactionSplitWorkbench")?.addEventListener("click", () => {
    if (!splitFlag || !splitWorkbench) return;
    splitFlag.value = "1";
    drawTransactionSplits();
    splitWorkbench.hidden = false;
    document.body.classList.add("split-workbench-open");
  });
  const closeSplitWorkbench = () => {
    if (!splitWorkbench) return;
    readTransactionSplitParts();
    updateTransactionSplitLauncher();
    splitWorkbench.hidden = true;
    document.body.classList.remove("split-workbench-open");
  };
  $("#closeTransactionSplitWorkbench")?.addEventListener("click", closeSplitWorkbench);
  $("#doneTransactionSplit")?.addEventListener("click", () => {
    readTransactionSplitParts();
    updateTransactionSplitTotal();
    closeSplitWorkbench();
  });
  $("#removeTransactionSplit")?.addEventListener("click", () => {
    if (!splitFlag) return;
    splitFlag.value = "";
    transactionSplitParts = [];
    if (splitRowsHost) splitRowsHost.innerHTML = "";
    closeSplitWorkbench();
    updateTransactionSplitLauncher();
  });
  splitRowsHost?.addEventListener("input", () => {
    readTransactionSplitParts();
    updateTransactionSplitTotal();
    updateTransactionSplitLauncher();
  });
  splitRowsHost?.addEventListener("click", (e) => {
    const duplicate=e.target.closest('[data-duplicate-transaction-split]');
    if(duplicate){readTransactionSplitParts();const i=+duplicate.dataset.duplicateTransactionSplit;transactionSplitParts.splice(i+1,0,structuredClone(transactionSplitParts[i]));drawTransactionSplits();splitRowsHost.children[i+1]?.querySelector('input')?.focus();return;}
    const remove = e.target.closest("[data-remove-transaction-split]");
    if (!remove) return;
    readTransactionSplitParts();
    transactionSplitParts.splice(+remove.dataset.removeTransactionSplit, 1);
    drawTransactionSplits();
  });
  splitAdd?.addEventListener("click", () => {
    readTransactionSplitParts();
    transactionSplitParts.push({ category: "", subcategory: "", amount: 0 });
    drawTransactionSplits();
  });
  $("#modalContent [name=amount]")?.addEventListener("input", updateTransactionSplitTotal);
  $("#modalContent [name=type]")?.addEventListener("change", () => {
    const expense = $("#modalContent [name=type]").value === "expense";
    splitLauncher?.toggleAttribute("hidden", !expense);
    if (!expense && splitFlag) {
      splitFlag.value = "";
      transactionSplitParts = [];
      if (splitRowsHost) splitRowsHost.innerHTML = "";
      if (splitWorkbench) splitWorkbench.hidden = true;
      document.body.classList.remove("split-workbench-open");
    }
    updateTransactionSplitLauncher();
  });
  if ($("#modalContent [name=type]")?.value !== "expense") splitLauncher?.setAttribute("hidden", "");
  window.InterfaceUI?.collectHelp(editor);
  $('#modal').movementDraft={
    capture(){if(splitFlag?.value==='1')readTransactionSplitParts();return {enabled:splitFlag?.value==='1',parts:structuredClone(transactionSplitParts)};},
    restore(draft){if(!draft)return;splitFlag.value=draft.enabled?'1':'';transactionSplitParts=structuredClone(draft.parts||[]);drawTransactionSplits();updateTransactionSplitLauncher();}
  };
  if (splitFlag?.value === "1") drawTransactionSplits();
  updateTransactionSplitLauncher();
  if (!t) {
    const again = document.createElement("button");
    again.type = "submit";
    again.className = "secondary full";
    again.dataset.afterSave = "new-transaction";
    again.textContent = "Guardar e adicionar outro";
    footer.append(again);
  }
  if (!t)
    $("#modalContent [name=description]").onchange = () => {
      const entry = data.transactions
        .slice()
        .reverse()
        .find(
          (x) =>
            x.description.toLocaleLowerCase("pt-PT") ===
              $("#modalContent [name=description]").value.toLocaleLowerCase(
                "pt-PT",
              ) && x.type === $("#modalContent [name=type]").value,
        );
      if (
        entry &&
        !data.categoryArchive.some((a) => a.name === entry.category) &&
        $("#modalContent [name=category]").value === "Outros"
      )
        {
          assignCategoryPath(entry.category);
          const input=$('#modalContent [name=category]');
          input.dispatchEvent(new Event('change',{bubbles:true}));
        }
    };
  window.DraftUI?.begin('movement',()=>({id:id||null,base:t?JSON.stringify(t):null,split:$('#modal').movementDraft.capture()}));
}
function accountOpeningBalance(account) {
  return F.openingBalance(data, account);
}

function collectionForm(kind, id) {
  if (kind === "budget" && window.FeatureUI) return window.FeatureUI.budget(id);
  if (kind === "goal" && window.FeatureUI) return window.FeatureUI.goal(id);
  const config = {
    budget: ["budgets", "Orçamento"],
    goal: ["goals", "Objetivo"],
    account: ["accounts", "Conta"],
    debt: ["debts", "Dívida"],
    investment: ["investments", "Investimento"],
    envelope: ["envelopes", "Envelope"],
    reserve: ["reserves", "Reserva anual"],
    rule: ["rules", "Regra automática"],
  }[kind];
  const [list, title] = config,
    item = id ? find(list, id) : null;
  let fields = "",
    help = "";
  if (kind === "budget" || kind === "envelope")
    fields =
      field(
        "Categoria",
        "category",
        item?.category || "",
        "text",
        'required maxlength="80"',
      ) +
      number(
        "Limite mensal (€)",
        kind === "budget" ? "limit" : "allocated",
        item?.[kind === "budget" ? "limit" : "allocated"] || "",
        0.01,
      );
  if (kind === "goal" || kind === "reserve") {
    fields =
      field(
        "Nome",
        "name",
        item?.name || "",
        "text",
        'required maxlength="100"',
      ) +
      number("Valor alvo (€)", "target", item?.target || "", 0.01) +
      number(
        "Valor já reservado (€)",
        kind === "goal" ? "current" : "saved",
        item?.[kind === "goal" ? "current" : "saved"] || 0,
      ) +
      field(
        "Prazo em meses",
        kind === "goal" ? "planMonths" : "months",
        item?.[kind === "goal" ? "planMonths" : "months"] || 12,
        "number",
        'required min="1" max="600" step="1"',
      );
    help =
      "Reservar identifica dinheiro que já tens nas contas. Não cria uma despesa nem retira dinheiro do saldo.";
  }
  if (kind === "account") {
    fields =
      field(
        "Nome",
        "name",
        item?.name || "",
        "text",
        'required maxlength="80"',
      ) +
      select(
        "Tipo",
        "type",
        ["Banco", "Poupança", "Dinheiro", "Cartão de crédito"],
        item?.type || "Banco",
      ) +
      (!item
        ? field(
            "Saldo atual (€)",
            "balance",
            0,
            "number",
            'required step="0.01"',
          )
        : field(
            "Saldo inicial histórico (€)",
            "openingBalance",
            accountOpeningBalance(item),
            "number",
            'required step="0.01"',
          ) +
          select(
            "Como aplicar a correção",
            "balanceCorrectionMode",
            [["historical","Corrigir saldo inicial histórico"],["adjustment","Criar movimento de ajuste de saldo"]],
            "historical",
          ));
    help = item
      ? "Se já existirem movimentos, corrigir o saldo inicial recalcula o saldo atual da conta sem alterar os movimentos. Em alternativa, cria um movimento de ajuste hoje e preserva o histórico anterior."
      : "Introduz o saldo atual. Os movimentos que adicionares depois alteram este valor.";
  }
  if (kind === "debt") {
    fields =
      field(
        "Nome",
        "name",
        item?.name || "",
        "text",
        'required maxlength="100"',
      ) +
      number("Capital em dívida (€)", "balance", item?.balance || 0) +
      number("Capital inicialmente contratado (€)", "originalPrincipal", item?.originalPrincipal || (item ? debtMetrics(item).original : item?.balance || 0)) +
      number("Prestação mensal (€)", "payment", item?.payment || 0, 0.01) +
      number("Taxa anual nominal (%)", "rate", item?.rate || 0) +
      field(
        "Dia de vencimento",
        "dueDay",
        item?.dueDay || 1,
        "number",
        'required min="1" max="31" step="1"',
      ) +
      field(
        "Data de início / primeira prestação (opcional)",
        "startDate",
        item?.startDate || "",
        "date",
      ) +
      field(
        "Data de fim do crédito/empréstimo",
        "endDate",
        item?.endDate || "",
        "date",
      ) +
      accountSelect("account", item?.account || "");
    help =
      "Escolhe a conta de débito da prestação. A Agenda só gera prestações a partir da data de início/primeira prestação; se a deixares vazia, começa a acompanhar o crédito a partir da data em que o criaste no programa. Não são criadas prestações retroativas. Para meses anteriores, usa “+ Pagamento anterior” no cartão do crédito: fica no histórico sem mexer no saldo atual da conta nem no capital em dívida. Alterar a conta afeta apenas ocorrências futuras. Não cries uma recorrência separada para o mesmo crédito.";
  }
  if (kind === "investment") {
    fields =
      field(
        "Nome",
        "name",
        item?.name || "",
        "text",
        'required maxlength="100"',
      ) +
      select(
        "Tipo",
        "type",
        ["ETF", "Ações", "Depósito", "Fundo", "Obrigações", "Outro"],
        item?.type || "ETF",
      ) +
      number("Custo de aquisição (€)", "cost", item?.cost || 0) +
      number("Valor atual (€)", "value", item?.value || 0);
    help =
      "Registo manual de património. Não altera o saldo das contas; evita incluir o mesmo investimento também numa conta.";
  }
  if (kind === "rule")
    fields =
      field(
        "Texto / estabelecimento a reconhecer",
        "match",
        item?.match || "",
        "text",
        'required maxlength="100"',
      ) +
      field(
        "Categoria a atribuir",
        "category",
        item?.category || "",
        "text",
        'required maxlength="80"',
      ) +
      field(
        "Beneficiário / estabelecimento (opcional)",
        "beneficiary",
        item?.beneficiary || "",
        "text",
        'maxlength="160"',
      );
  form(
    (item ? "Editar " : "Criar ") + title.toLowerCase(),
    fields,
    (f) =>
      commit(() => {
        const next = { ...item, id: item?.id || F.id() };
        if (kind === "debt" && !item) next.createdAt = F.today();
        for (const [k, v] of f.entries())
          next[k] = [
            "limit",
            "allocated",
            "target",
            "current",
            "saved",
            "planMonths",
            "months",
            "balance",
            "payment",
            "originalPrincipal",
            "rate",
            "dueDay",
            "cost",
            "value",
          ].includes(k)
            ? +v
            : String(v).trim();
        if (
          ["goal", "reserve"].includes(kind) &&
          next[kind === "goal" ? "current" : "saved"] > next.target
        )
          throw Error("O valor reservado não pode ultrapassar o alvo.");
        if (kind === "debt") {
          const paidPrincipal = debtHistoryRows(next).reduce((n, h) => n + h.principal, 0);
          if (!next.originalPrincipal) next.originalPrincipal = F.money(next.balance + paidPrincipal);
          if (next.originalPrincipal + 0.005 < next.balance) throw Error("O capital inicialmente contratado não pode ser inferior ao capital atualmente em dívida.");
        }
        if (kind === "account") {
          if (item && f.has("openingBalance")) {
            const oldOpening = accountOpeningBalance(item);
            const requestedOpening = +f.get("openingBalance");
            if (!Number.isFinite(requestedOpening)) throw Error("Indica um saldo inicial válido.");
            const delta = Math.round((requestedOpening - oldOpening + Number.EPSILON) * 100) / 100;
            const hasMovements = data.transactions.some(t => t.account === item.name || t.targetAccount === item.name);
            if (delta && f.get("balanceCorrectionMode") === "historical") {
              if (hasMovements && !confirm("Esta conta já tem movimentos. Alterar o saldo inicial recalcula o saldo atual e todo o histórico derivado desta conta. Continuar?")) throw Error("Correção cancelada.");
              next.balance = Math.round((item.balance + delta + Number.EPSILON) * 100) / 100;
            } else if (delta) {
              next.balance = item.balance;
              F.add(data, { id:F.id(), description:"Ajuste de saldo inicial", amount:Math.abs(delta), delta, type:"adjustment", category:"Ajuste de saldo", account:item.name, date:F.today(), note:`Saldo inicial de referência: ${requestedOpening.toFixed(2)} €` });
              next.balance = data.accounts.find(a=>a.id===item.id)?.balance ?? (item.balance + delta);
            } else next.balance = item.balance;
            next.openingBalance = f.get("balanceCorrectionMode") === "historical" ? requestedOpening : F.openingBalance(data, item);
            delete next.balanceCorrectionMode;
          }
          if (
            data.accounts.some(
              (a) =>
                a.id !== next.id &&
                a.name.toLowerCase() === next.name.toLowerCase(),
            )
          )
            throw Error("Já existe uma conta com este nome.");
          if (item && next.name !== item.name)
            F.renameAccountReferences(data, item.name, next.name);
        }
        if (
          ["budget", "envelope"].includes(kind) &&
          data[list].some(
            (x) =>
              x.id !== next.id &&
              x.category.toLowerCase() === next.category.toLowerCase(),
          )
        )
          throw Error("Já existe um limite para esta categoria.");
        if (item)
          data[list][data[list].findIndex((x) => x.id === item.id)] = next;
        else data[list].push(next);
      }),
    help,
  );
}
function transferForm(cardId, transactionId) {
  if (!requireAccounts()) return;
  if (data.accounts.length < 2)
    return notice(
      "Precisas de duas contas para fazer uma transferência.",
      true,
    );
  const card = cardId ? find("accounts", cardId) : null;
  const original = transactionId ? find("transactions", transactionId) : null;
  const converting = Boolean(original && original.type !== "transfer");
  if (original && data.closedMonths.includes(original.date.slice(0, 7)))
    return notice("Reabre o mês para editar esta transferência.", true);
  const pendingIncoming = original?.transferStatus === 'pending' && original.observedSide === 'income';
  const sourceName = pendingIncoming ? data.accounts.find(a => a.name !== original.account)?.name || '' : original?.account || data.accounts.find((a) => a.id !== card?.id)?.name || "";
  const defaultTarget = pendingIncoming ? original.account : original?.targetAccount || card?.name || data.accounts.find((a) => a.name !== sourceName)?.name || "";
  form(
    converting ? "Converter em transferência" : original ? "Editar transferência" : card ? "Pagar cartão" : "Nova transferência",
    field("Descrição", "description", original?.description || (card ? "Pagamento de " + card.name : "Transferência entre contas"), "text", 'required maxlength="160"') +
    select(
      "Conta de origem",
      "account",
      data.accounts.filter((a) => a.id !== card?.id).map((a) => a.name),
      sourceName,
    ) +
      select(
        "Conta de destino",
        "targetAccount",
        data.accounts.map((a) => a.name),
        defaultTarget,
      ) +
      number(
        "Valor (€)",
        "amount",
        original?.amount || (card ? Math.max(0, -card.balance) : ""),
        0.01,
      ) +
      field("Data", "date", original?.date || F.today(), "date", `required max="${F.today()}"`) +
      `<label>Nota<textarea name="note" maxlength="1000" placeholder="Observação opcional">${esc(original?.note || "")}</textarea></label>`,
    (f) =>
      commit(() => {
        if (f.get("date") > F.today())
          throw Error("A data não pode estar no futuro.");
        const amount = +f.get("amount");
        if (f.get("account") === f.get("targetAccount"))
          throw Error("Escolhe contas diferentes para a origem e o destino.");
        if (card && amount > Math.max(0, -card.balance))
          throw Error("O pagamento ultrapassa a dívida do cartão.");
        const tx = {
          ...original,
          description: f.get("description").trim(),
          amount,
          type: "transfer",
          category: "Transferências",
          transferStatus: 'confirmed',
          observedSide: undefined,
          account: f.get("account"),
          targetAccount: f.get("targetAccount"),
          date: f.get("date"),
          note: (f.get("note") || "").trim(),
        };
        if (original) { rememberMovementContext(original.id); F.update(data, original.id, tx); }
        else F.add(data, tx);
      }, converting ? "Movimento convertido em transferência. A conta de destino foi atualizada sem duplicar a saída." : original ? "Transferência atualizada." : "Transferência registada."),
    converting
      ? "Usa esta opção quando a saída já existe numa conta mas a entrada correspondente ainda não foi registada na conta de destino. A saída original é substituída por uma transferência com efeito nos dois saldos."
      : "Transferências não contam como receitas ou despesas.",
  );
}
function reconcileForm(id) {
  if (!requireAccounts()) return;
  const a = id ? find("accounts", id) : data.accounts[0];
  form(
    "Confirmar saldo",
    accountSelect("account", a.name) +
      field("Data do saldo no extrato", "date", F.today(), "date", "required") +
      field(
        "Saldo real no banco ou carteira (€)",
        "balance",
        a.balance,
        "number",
        'required step="0.01"',
      ) +
      '<p id="reconcileDifference" role="status"></p><label class="checkbox"><input type="checkbox" name="adjust" /> Criar um ajuste pela diferença encontrada</label>',
    (f) =>
      commit(() => {
        const account = data.accounts.find((a) => a.name === f.get("account"));
        FinancePlus.reconcile(
          data,
          account.id,
          f.get("date"),
          +f.get("balance"),
          f.get("adjust") === "on",
        );
      }, "Conferência registada."),
    "Compara com o saldo de fecho do extrato. Sem selecionar o ajuste, a diferença fica pendente e os saldos não mudam. O saldo histórico é reconstruído pelos movimentos disponíveis.",
  );
  const preview = () => {
    try {
      const a = data.accounts.find(
        (a) => a.name === $("#modalContent [name=account]").value,
      );
      const expected = FinancePlus.balanceAt(
        data,
        a.id,
        $("#modalContent [name=date]").value,
      );
      $("#reconcileDifference").textContent =
        "Saldo calculado: " +
        eur(expected) +
        " · Diferença: " +
        eur(F.money(+$("#modalContent [name=balance]").value - expected));
    } catch (e) {
      $("#reconcileDifference").textContent = e.message;
    }
  };
  $$("#modalContent input, #modalContent select").forEach((el) =>
    el.addEventListener("input", preview),
  );
  preview();
}
function pendingForm() {
  if (!requireAccounts()) return;
  form(
    "Agendar movimento",
    field("Descrição", "description", "", "text", 'required maxlength="160"') +
      select("Tipo", "type", [
        ["expense", "Despesa"],
        ["income", "Receita"],
      ]) +
      number("Valor (€)", "amount", "", 0.01) +
      field("Data prevista", "date", F.today(), "date", "required") +
      accountSelect() +
      field(
        "Categoria",
        "category",
        "Outros",
        "text",
        'required maxlength="80"',
      ),
    (f) =>
      commit(() => {
        if (!F.validDate(f.get("date"))) throw Error("Data inválida.");
        data.pendingPayments.push({
          id: F.id(),
          description: f.get("description").trim(),
          type: f.get("type"),
          amount: +f.get("amount"),
          date: f.get("date"),
          account: f.get("account"),
          category: f.get("category").trim(),
        });
      }, "Movimento agendado."),
    "O saldo só muda quando confirmares o registo.",
  );
}
function recurringForm(id) {
  if (window.FeatureUI) return window.FeatureUI.recurring(id);
  if (!requireAccounts()) return;
  const r = id ? find("recurring", id) : null;
  form(
    r ? "Editar recorrência" : "Movimento mensal",
    field(
      "Descrição",
      "description",
      r?.description || "",
      "text",
      'required maxlength="160"',
    ) +
      select(
        "Tipo",
        "type",
        [
          ["expense", "Despesa"],
          ["income", "Receita"],
        ],
        r?.type || "expense",
      ) +
      number("Valor (€)", "amount", r?.amount || "", 0.01) +
      accountSelect("account", r?.account) +
      field(
        "Categoria",
        "category",
        r?.category || "Outros",
        "text",
        'required maxlength="80"',
      ) +
      field("Começar em", "start", r?.start || F.today(), "date", "required") +
      field(
        "Dia do mês",
        "day",
        r?.day || 1,
        "number",
        'required min="1" max="31" step="1"',
      ) +
      select(
        "Estado",
        "active",
        [
          ["true", "Ativo"],
          ["false", "Pausado"],
        ],
        String(r?.active ?? true),
      ),
    (f) =>
      commit(() => {
        if (!F.validDate(f.get("start"))) throw Error("Data inválida.");
        const next = {
          ...r,
          id: r?.id || F.id(),
          description: f.get("description").trim(),
          type: f.get("type"),
          amount: +f.get("amount"),
          account: f.get("account"),
          category: f.get("category").trim(),
          start: f.get("start"),
          day: +f.get("day"),
          active: f.get("active") === "true",
        };
        if (r) data.recurring[data.recurring.indexOf(r)] = next;
        else data.recurring.push(next);
      }),
    "Confirma cada ocorrência no Planeamento. O dia 31 adapta-se aos meses mais curtos.",
  );
}
function fund(kind, id) {
  const list = kind === "goal" ? "goals" : "reserves",
    item = find(list, id),
    prop = kind === "goal" ? "current" : "saved";
  form(
    "Atualizar valor reservado",
    number("Total reservado (€)", "amount", item[prop]),
    (f) =>
      commit(() => {
        const value = +f.get("amount");
        if (value > item.target) throw Error("O valor ultrapassa o alvo.");
        find(list, id)[prop] = value;
      }),
    "Indica o total já reservado para " +
      esc(item.name) +
      ". Esta organização não retira dinheiro das contas.",
  );
}
function bindDebtInterestCalculator() {
  const modal = document.querySelector("#modal");
  const amount = modal?.querySelector('[name="amount"]'), principal = modal?.querySelector('[name="principal"]'), charges = modal?.querySelector('[name="charges"]'), interest = modal?.querySelector('[name="interest"]');
  if (!amount || !principal || !charges || !interest) return;
  const refresh = () => {
    const total = Number(amount.value), capital = Number(principal.value), fees = Number(charges.value);
    const value = [total, capital, fees].every(Number.isFinite) ? F.money(total - capital - fees) : 0;
    interest.value = Number.isFinite(value) ? value.toFixed(2) : "0.00";
    interest.classList.toggle("field-invalid", value < -0.005);
    interest.title = value < -0.005 ? "Capital + encargos ultrapassam o total pago." : "Calculado automaticamente: total pago − capital amortizado − encargos.";
  };
  for (const input of [amount, principal, charges]) input.addEventListener("input", refresh);
  interest.readOnly = true;
  interest.setAttribute("aria-readonly", "true");
  refresh();
}
function payDebt(id) {
  if (!requireAccounts()) return;
  const debt = find("debts", id), defaultAmount = Math.min(debt.payment, debt.balance), rate = Math.max(0, Number(debt.rate)||0)/1200,
    estimatedInterest = F.money(Math.min(defaultAmount, Math.max(0, debt.balance * rate))), estimatedPrincipal = F.money(Math.max(0, defaultAmount - estimatedInterest));
  form(
    "Pagamento de crédito",
    accountSelect("account", debt.account || "") +
      number("Total pago (€)", "amount", defaultAmount, 0.01) +
      number("Capital amortizado (€)", "principal", estimatedPrincipal, 0) +
      field("Juros (€) · automático", "interest", estimatedInterest, "number", 'required min="0" step="0.01" readonly aria-readonly="true"') +
      number("Encargos / comissões (€)", "charges", 0, 0) +
      field("Data", "date", F.today(), "date", `required max="${F.today()}"`),
    (f) => commit(() => {
      const amount = +f.get("amount"), principal = +f.get("principal"), charges = +f.get("charges"), interest = F.money(amount - principal - charges);
      if (![amount, principal, interest, charges].every(Number.isFinite) || amount <= 0 || principal < 0 || interest < 0 || charges < 0) throw Error("Confirma os valores do pagamento. Capital + encargos não podem ultrapassar o total pago.");
      if (principal > debt.balance + 0.005) throw Error("O capital amortizado não pode ultrapassar o capital em dívida.");
      if (f.get("date") > F.today()) throw Error("A data não pode estar no futuro.");
      F.add(data, { description:"Pagamento: " + debt.name, amount:F.money(amount), principal:F.money(principal), interest, charges:F.money(charges), debtId:debt.id, type:"expense", category:"Juros e encargos", account:f.get("account"), date:f.get("date") });
    }, "Pagamento registado."),
    "O juro é calculado automaticamente: total pago − capital amortizado − encargos. O saldo da conta baixa pelo total; apenas capital reduz a dívida.",
  );
  bindDebtInterestCalculator();
}
function debtPreviousPayment(id) {
  const debt = find("debts", id), defaultAmount = Number(debt.payment) || 0;
  form(
    "Pagamento anterior · " + esc(debt.name),
    field("Data", "date", debt.startDate || F.today(), "date", `required max="${F.today()}"`) +
      number("Total pago (€)", "amount", defaultAmount || "", 0.01) +
      number("Capital amortizado (€)", "principal", defaultAmount || "", 0) +
      field("Juros (€) · automático", "interest", 0, "number", 'required min="0" step="0.01" readonly aria-readonly="true"') +
      number("Encargos / comissões (€)", "charges", 0, 0) +
      field("Nota (opcional)", "note", "", "text", 'maxlength="180" placeholder="Ex.: prestação de agosto"'),
    (f) => commit(() => {
      const amount=+f.get("amount"), principal=+f.get("principal"), charges=+f.get("charges"), interest=F.money(amount-principal-charges), date=f.get("date");
      if (!F.validDate(date) || date > F.today()) throw Error("Escolhe uma data válida até hoje.");
      if (![amount, principal, interest, charges].every(Number.isFinite) || amount <= 0 || principal < 0 || interest < 0 || charges < 0) throw Error("Confirma os valores do pagamento. Capital + encargos não podem ultrapassar o total pago.");
      debt.previousPayments ||= [];
      debt.previousPayments.push({ id:F.id(), date, amount:F.money(amount), principal:F.money(principal), interest, charges:F.money(charges), note:(f.get("note")||"").trim() });
      debt.previousPayments.sort((a,b)=>a.date.localeCompare(b.date));
      debt.originalPrincipal = Math.max(Number(debt.originalPrincipal)||0, F.money(debt.balance + debtHistoryRows(debt).reduce((n,h)=>n+h.principal,0)));
    }, "Pagamento anterior guardado no histórico do crédito."),
    "O juro é calculado automaticamente a partir do total, capital e encargos. Este registo completa o histórico sem alterar o saldo atual nem o capital atualmente em dívida.",
    "Guardar no histórico",
  );
  bindDebtInterestCalculator();
}
function editDebtHistoryEntry(id) {
  const [debtId, entryId] = String(id).split("~");
  const debt = find("debts", debtId);
  if (!debt) return notice("O crédito já não existe.", true);
  const tx = data.transactions.find((row) => String(row.id) === String(entryId) && (String(row.debtId || "") === String(debt.id) || String(row.debtHistoryOf || "") === String(debt.id)));
  const manual = (debt.previousPayments || []).find((row) => String(row.id) === String(entryId));
  if (!tx && !manual) return notice("O pagamento já não existe no histórico deste crédito.", true);
  const source = manual ? "history" : String(tx.debtHistoryOf || "") === String(debt.id) ? "linked" : "transaction";
  const amount = Number((manual || tx).amount) || 0;
  const principal = source === "linked"
    ? (tx.debtHistoryPrincipal !== undefined ? Number(tx.debtHistoryPrincipal) || 0 : 0)
    : Number((manual || tx).principal) || 0;
  const charges = source === "linked"
    ? Number(tx.debtHistoryCharges) || 0
    : Number((manual || tx).charges) || 0;
  const interest = source === "linked"
    ? (tx.debtHistoryInterest !== undefined ? Number(tx.debtHistoryInterest) || 0 : F.money(amount - principal - charges))
    : Number((manual || tx).interest ?? F.money(amount - principal - charges)) || 0;
  const currentDate = (manual || tx).date;
  const currentNote = (manual || tx).note || "";
  form(
    "Editar pagamento · " + esc(debt.name),
    `<p class="refund-source-summary"><b>${source === "linked" ? "Movimento existente associado" : source === "history" ? "Pagamento inserido manualmente" : "Movimento registado no crédito"}</b><span>Indica o total pago e quanto desse valor abateu ao capital. Os juros são calculados automaticamente.</span></p>` +
      number("Total pago (€)", "amount", amount, 0.01) +
      number("Capital amortizado (€)", "principal", principal, 0) +
      field("Juros (€) · automático", "interest", interest, "number", 'required min="0" step="0.01" readonly aria-readonly="true"') +
      number("Encargos / comissões (€)", "charges", charges, 0) +
      field("Data", "date", currentDate, "date", `required max="${F.today()}"`) +
      field("Nota (opcional)", "note", currentNote, "text", 'maxlength="180"'),
    (f) => commit(() => {
      const nextAmount = +f.get("amount"), nextPrincipal = +f.get("principal"), nextCharges = +f.get("charges"), nextDate = f.get("date");
      const nextInterest = F.money(nextAmount - nextPrincipal - nextCharges);
      if (!F.validDate(nextDate) || nextDate > F.today()) throw Error("Escolhe uma data válida até hoje.");
      if (![nextAmount, nextPrincipal, nextCharges, nextInterest].every(Number.isFinite) || nextAmount <= 0 || nextPrincipal < 0 || nextCharges < 0 || nextInterest < 0)
        throw Error("Confirma os valores. Capital + encargos não podem ultrapassar o total pago.");
      if (source === "transaction" || (source === "linked" && (F.cents(nextAmount) !== F.cents(tx.amount) || nextDate !== tx.date))) {
        for (const monthKey of new Set([tx.date.slice(0, 7), nextDate.slice(0, 7)]))
          if (data.closedMonths.includes(monthKey)) throw Error(`Reabre primeiro ${monthLabel(monthKey)} para alterar o valor total ou a data deste pagamento.`);
      }
      if (source === "transaction" && nextPrincipal > (Number(debt.balance) || 0) + (Number(tx.principal) || 0) + 0.005)
        throw Error("O capital amortizado não pode ultrapassar o capital disponível nesse crédito.");
      const note = (f.get("note") || "").trim();
      if (source === "history") {
        Object.assign(manual, { date:nextDate, amount:F.money(nextAmount), principal:F.money(nextPrincipal), interest:nextInterest, charges:F.money(nextCharges), note });
        debt.previousPayments.sort((a,b)=>a.date.localeCompare(b.date));
      } else {
        const old = structuredClone(tx);
        F.effect(data, old, -1);
        tx.amount = F.money(nextAmount);
        tx.date = nextDate;
        tx.note = note;
        if (source === "linked") {
          tx.debtHistoryPrincipal = F.money(nextPrincipal);
          tx.debtHistoryInterest = nextInterest;
          tx.debtHistoryCharges = F.money(nextCharges);
        } else {
          tx.principal = F.money(nextPrincipal);
          tx.interest = nextInterest;
          tx.charges = F.money(nextCharges);
        }
        F.effect(data, tx);
      }
      debt.originalPrincipal = Math.max(Number(debt.originalPrincipal)||0, F.money((Number(debt.balance)||0) + debtHistoryRows(debt).reduce((n,h)=>n+h.principal,0)));
    }, "Valores do pagamento atualizados."),
    source === "linked"
      ? "A divisão capital/juros fica guardada no histórico do crédito. Alterar o total deste movimento também corrige o saldo da respetiva conta; a associação histórica continua sem recalcular o capital atual do crédito."
      : source === "history"
        ? "Este pagamento existe apenas no histórico do crédito, por isso não altera o saldo atual da conta nem o capital atual em dívida."
        : "Como este é um movimento efetivo do crédito, alterar total ou capital ajusta o saldo da conta e o capital em dívida pela diferença.",
    "Guardar valores",
  );
  bindDebtInterestCalculator();
}

function debtHistoryCandidates(debt, category, from, year = "") {
  const target = F.categoryPath(category || "");
  if (!target) return [];
  return data.transactions
    .filter((t) =>
      t.type === "expense" &&
      F.validDate(t.date) && t.date >= from && t.date <= F.today() && (!year || t.date.startsWith(year + "-")) &&
      !t.refundOf && !t.debtId && !t.pendingId && !t.subscriptionId &&
      !String(t.source || "").startsWith("Casa") &&
      (!t.debtHistoryOf || String(t.debtHistoryOf) === String(debt.id)) &&
      F.categoryPath(t.category || "") === target,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
function linkDebtHistoryForm(id) {
  const debt = find("debts", id);
  if (!debt) return notice("O crédito já não existe.", true);
  const likely = data.transactions
    .filter((t) => t.type === "expense" && t.account === debt.account && !t.refundOf && t.category)
    .map((t) => ({ t, delta: Math.abs(F.cents(t.amount) - F.cents(debt.payment || 0)) }))
    .sort((a, b) => a.delta - b.delta || b.t.date.localeCompare(a.t.date))[0]?.t;
  const savedParts = F.categoryParts(debt.historyCategory || likely?.category || "");
  const baseDefault = savedParts[0] || "";
  const subDefault = savedParts.slice(1).join(" / ");
  const dates = data.transactions.map((t) => t.date).filter(F.validDate).sort();
  const defaultFrom = debt.historyLinkedFrom || dates[0] || debt.startDate || F.today();
  const years = [...new Set(dates.map((date) => date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const baseCategories = [...new Set(data.transactions.map((t) => F.categoryParts(t.category || "")[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  form(
    "Associar histórico · " + esc(debt.name),
    `<p class="refund-source-summary"><b>Movimentos já existentes</b><span>Escolhe a categoria/subcategoria usada nas prestações antigas. A associação não volta a alterar o saldo da conta nem o capital em dívida.</span></p>` +
      field("Categoria", "category", baseDefault, "text", 'required maxlength="80" list="debtHistoryCategories"') +
      field("Subcategoria", "subcategory", subDefault, "text", 'maxlength="120" placeholder="Opcional"') +
      `<datalist id="debtHistoryCategories">${baseCategories.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` +
      select("Ano a pesquisar", "historyYear", [["", "Desde a data indicada"], ...years.map((year) => [year, year])], debt.historyLinkedYear || "") +
      field("Pesquisar desde", "from", defaultFrom, "date", `required max="${F.today()}"`) +
      '<div id="debtHistoryLinkPreview" class="recurring-history-preview" aria-live="polite"></div>',
    (f) => {
      const year = f.get("historyYear");
      const from = year ? `${year}-01-01` : f.get("from");
      const category = F.categoryPath([f.get("category"), f.get("subcategory")]);
      if (!F.validDate(from) || from > F.today()) throw Error("Escolhe uma data inicial válida.");
      if (!category) throw Error("Escolhe a categoria dos movimentos antigos.");
      const selected = [...document.querySelectorAll('#debtHistoryLinkPreview [data-debt-history-row]:checked:not(:disabled)')].map((input) => input.value);
      let count = 0;
      const ok = commit(() => {
        for (const txId of selected) {
          const tx = find("transactions", txId);
          if (!tx || tx.type !== "expense" || F.categoryPath(tx.category || "") !== category) throw Error("Um dos movimentos escolhidos já não corresponde ao filtro.");
          if (tx.debtHistoryOf && String(tx.debtHistoryOf) !== String(debt.id)) throw Error("Um dos movimentos já está associado a outro crédito.");
          tx.debtHistoryOf = debt.id;
          count += 1;
        }
        debt.historyCategory = category;
        debt.historyLinkedFrom = from;
        debt.historyLinkedYear = year || "";
      }, "Histórico do crédito associado.");
      if (ok) notice(`${count} movimento${count === 1 ? "" : "s"} ligado${count === 1 ? "" : "s"} ao histórico de ${debt.name}. O saldo e o capital atual não foram alterados. No histórico podes agora editar total, capital, juros e encargos.`);
      return ok;
    },
    "Isto serve para aproveitar pagamentos que já estavam registados em Movimentos. Como o programa não consegue adivinhar a divisão antiga entre capital, juros e encargos, esses movimentos entram no total pago mas não alteram o capital atual.",
    "Associar selecionados",
  );
  const categoryInput = document.querySelector('#modal [name="category"]');
  const subInput = document.querySelector('#modal [name="subcategory"]');
  const yearInput = document.querySelector('#modal [name="historyYear"]');
  const fromInput = document.querySelector('#modal [name="from"]');
  const preview = document.querySelector("#debtHistoryLinkPreview");
  const refresh = () => {
    try {
      const year = yearInput?.value || "";
      const from = year ? `${year}-01-01` : fromInput?.value;
      if (!F.validDate(from)) throw Error("Escolhe uma data inicial válida.");
      const category = F.categoryPath([categoryInput?.value || "", subInput?.value || ""]);
      const rows = debtHistoryCandidates(debt, category, from, year);
      if (!rows.length) {
        preview.innerHTML = '<p class="muted recurring-history-empty">Não encontrei movimentos nesta categoria/subcategoria e período.</p>';
        return;
      }
      const tolerance = Math.max(100, Math.round(F.cents(debt.payment || 0) * 0.15));
      preview.innerHTML = `<div class="recurring-history-filter-summary"><b>${rows.length} movimento${rows.length === 1 ? "" : "s"} encontrado${rows.length === 1 ? "" : "s"}</b><span>Seleciona as prestações que pertencem a este crédito.</span></div><div class="recurring-history-filter-list">${rows.map((t) => {
        const linked = String(t.debtHistoryOf || "") === String(debt.id);
        const suggested = linked || (t.account === debt.account && Math.abs(F.cents(t.amount) - F.cents(debt.payment || 0)) <= tolerance);
        return `<label class="recurring-history-candidate recurring-history-filter-row${linked ? " already-linked" : ""}"><input type="checkbox" data-debt-history-row value="${esc(t.id)}"${suggested ? " checked" : ""}${linked ? " disabled" : ""}><span><b>${esc(t.description || "Movimento")}</b><small>${dateLabel(t.date)} · ${eur(t.amount)} · ${esc(t.account || "—")} · ${esc(t.category || "—")}${linked ? " · já associado" : ""}</small></span></label>`;
      }).join("")}</div>`;
    } catch (error) {
      preview.innerHTML = `<span>${esc(error.message || "Não foi possível pesquisar o histórico.")}</span>`;
    }
  };
  yearInput?.addEventListener("change", () => {
    if (yearInput.value && fromInput) fromInput.value = `${yearInput.value}-01-01`;
    refresh();
  });
  for (const el of [categoryInput, subInput, fromInput]) {
    el?.addEventListener("input", refresh);
    el?.addEventListener("change", refresh);
  }
  refresh();
}
function extraDebtPayment(id) {
  if (!requireAccounts()) return;
  const debt = find("debts", id), current = debtProjection(debt);
  form(
    "Amortização extraordinária · " + esc(debt.name),
    accountSelect("account", debt.account || "") +
      number("Capital a amortizar (€)", "principal", Math.min(500, debt.balance), 0.01) +
      number("Encargos / comissão (€)", "charges", 0, 0) +
      field("Data", "date", F.today(), "date", `required max="${F.today()}"`) +
      '<div id="extraDebtPreview" class="debt-extra-preview" role="status"></div>',
    (f) => commit(() => {
      const principal=+f.get("principal"), charges=+f.get("charges"), date=f.get("date");
      if (!Number.isFinite(principal) || principal <= 0 || principal > debt.balance + 0.005) throw Error("Indica um capital a amortizar válido.");
      if (!Number.isFinite(charges) || charges < 0) throw Error("Os encargos não podem ser negativos.");
      if (!F.validDate(date) || date > F.today()) throw Error("Escolhe uma data válida até hoje.");
      F.add(data, { description:"Amortização extraordinária: " + debt.name, amount:F.money(principal + charges), principal:F.money(principal), interest:0, charges:F.money(charges), debtId:debt.id, type:"expense", category:"Juros e encargos", account:f.get("account"), date, note:"Amortização extraordinária" });
    }, "Amortização extraordinária registada."),
    "A simulação assume que manténs a prestação mensal atual. A poupança real pode variar conforme as regras e comissões do contrato.",
    "Registar amortização",
  );
  const input=document.querySelector('#modal [name="principal"]'), preview=document.querySelector('#extraDebtPreview');
  const refresh=()=>{
    const value=Math.max(0, Number(input?.value)||0), after=debtProjection(debt,value);
    if (!preview) return;
    if (!current.possible || !after.possible) { preview.innerHTML='<b>Simulação indisponível</b><span>A prestação atual não permite estimar o fim do crédito com segurança.</span>'; return; }
    const monthsSaved=Math.max(0,(current.months||0)-(after.months||0)), interestSaved=Math.max(0,F.money((current.interest||0)-(after.interest||0)));
    preview.innerHTML=`<b>Impacto estimado</b><span>Fim atual: ${dateLabel(current.endDate)} → novo fim: ${dateLabel(after.endDate)}</span><span>${monthsSaved} ${monthsSaved===1?"mês":"meses"} poupados · cerca de ${eur(interestSaved)} de juros futuros evitados</span>`;
  };
  input?.addEventListener("input",refresh); refresh();
}
function attachReceiptQuick(id) {
  const tx = find("transactions", id);
  if (!tx || !["income", "expense"].includes(tx.type)) return;
  form(
    "Anexar fatura / comprovativo",
    `<p><b>${esc(tx.description)}</b> · ${dateLabel(tx.date)} · ${eur(tx.amount)}</p><label class="attachment-picker">Ficheiro<input name="attachment" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><p class="muted">PDF até 8 MB; imagens até 10 MB.</p>`,
    async (f) => {
      const attachment = await attachmentFromFile(f.get("attachment"));
      if (!attachment) throw Error("Escolhe um ficheiro.");
      return commit(() => { ReceiptFinance.replaceAttachment(tx,attachment); }, "Comprovativo anexado.");
    },
    "Fica associado diretamente a este movimento.",
    "Anexar",
  );
}
function confirmAction(title, text, action) {
  form(title, `<p>${esc(text)}</p>`, () => commit(action), "", "Confirmar");
}
function occurrenceOwner(kind, ownerId) {
  if (kind === "recurring") return data.recurring.find((r) => String(r.id) === String(ownerId));
  if (kind === "subscription") return (data.subscriptions || []).find((r) => String(r.id) === String(ownerId));
  return null;
}
function adjustOccurrence(id) {
  const [kind, ownerId, originalDate] = String(id).split("~");
  const owner = occurrenceOwner(kind, ownerId);
  if (!owner || !F.validDate(originalDate)) return notice("A ocorrência já não existe.", true);
  const list = Array.isArray(owner.occurrenceOverrides) ? owner.occurrenceOverrides : [];
  const current = list.find((o) => o && o.originalDate === originalDate) || null;
  const baseAmount = Number(owner.amount || 0);
  form(
    "Ajustar apenas esta ocorrência",
    `<div class="occurrence-adjust-summary"><b>${esc(owner.description || owner.name || "Recorrência")}</b><span>Data da série: ${dateLabel(originalDate)}</span></div>` +
      field("Nova data prevista", "date", current?.date || originalDate, "date", "required") +
      field("Valor só desta ocorrência (€) — opcional", "amount", Number.isFinite(+current?.amount) ? current.amount : "", "number", 'min="0" step="0.01" placeholder="Usar valor da série"') +
      field("Motivo / nota (opcional)", "reason", current?.reason || "", "text", 'maxlength="240"') +
      `<label class="checkbox occurrence-skip"><input type="checkbox" name="skip"${current?.skipped ? " checked" : ""}> Ignorar esta ocorrência — não criar movimento nem voltar a mostrar como atraso</label>` +
      `<label class="checkbox occurrence-reset"><input type="checkbox" name="reset"> Repor esta ocorrência exatamente como está definida na série</label>`,
    (f) => commit(() => {
      const next = list.filter((o) => o && o.originalDate !== originalDate);
      const reset = f.has("reset"), skip = f.has("skip");
      const reason = String(f.get("reason") || "").trim();
      if (!reset && skip) {
        next.push({ originalDate, date: originalDate, skipped: true, reason: reason || "Ocorrência ignorada manualmente", updatedAt: new Date().toISOString() });
      } else if (!reset) {
        const date = f.get("date");
        if (!F.validDate(date)) throw Error("Escolhe uma data válida.");
        const amountText = String(f.get("amount") || "").trim();
        const amount = amountText === "" ? null : Number(amountText);
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw Error("Indica um valor válido ou deixa o campo vazio.");
        if (date !== originalDate || amount !== null || reason) {
          const entry = { originalDate, date, reason, updatedAt: new Date().toISOString() };
          if (amount !== null) entry.amount = F.money(amount);
          next.push(entry);
        }
      }
      owner.occurrenceOverrides = next.sort((a, b) => a.originalDate.localeCompare(b.originalDate));
    }, f.has("reset") ? "Ocorrência reposta à série." : f.has("skip") ? "Ocorrência ignorada e retirada dos atrasos." : "Ocorrência ajustada."),
    "Esta alteração afeta só esta ocorrência. Usa “Ignorar” para retirar um atraso antigo que não deve ser registado. A série e os meses seguintes mantêm-se.",
    current ? "Guardar ajuste" : "Ajustar ocorrência",
  );
}
function recurringHistoryCandidateList(rule, from) {
  const result = F.recurringHistoryCandidates(data, rule.id, from, F.today());
  const fixed = (rule.valueMode || "fixed") !== "estimated";
  const groups = new Map();
  for (const row of result.rows) {
    const groupKey = (rule.frequency || "monthly") === "weekly" ? row.expectedDate : row.expectedDate.slice(0, 7);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }
  const preferred = new Set();
  for (const rows of groups.values()) {
    const available = rows.filter((row) => !row.alreadyLinked);
    if (!available.length) continue;
    const sorted = available.slice().sort((a, b) =>
      Number(b.sameAccount) - Number(a.sameAccount) ||
      a.amountDelta - b.amountDelta ||
      a.date.localeCompare(b.date),
    );
    const best = sorted[0];
    const acceptableAmount = !fixed || best.amountDelta <= Math.max(100, Math.round(F.cents(rule.amount || 0) * 0.12));
    if (best.sameAccount && acceptableAmount) preferred.add(String(best.transactionId));
  }
  return { ...result, preferred };
}
function recurringHistoryCandidateHtml(result) {
  if (!result.rows.length)
    return '<p class="muted recurring-history-empty">Não encontrei movimentos nesta categoria/subcategoria e período. Confirma a categoria da recorrência e a data inicial.</p>';
  const rows = result.rows.map((candidate) => {
    const already = candidate.alreadyLinked;
    const checked = already || result.preferred.has(String(candidate.transactionId));
    return `<label class="recurring-history-candidate recurring-history-filter-row${already ? " already-linked" : ""}"><input type="checkbox" data-recurring-history-row value="${esc(candidate.transactionId)}"${checked ? " checked" : ""}${already ? " disabled" : ""}><span><b>${esc(candidate.description || "Movimento")}</b><small>${dateLabel(candidate.date)} · ${eur(candidate.amount)} · ${esc(candidate.account || "—")}${candidate.category ? " · " + esc(candidate.category) : ""}${candidate.beneficiary ? " · " + esc(candidate.beneficiary) : ""}${already ? " · já associado" : candidate.sameAccount ? "" : " · conta diferente"}</small></span></label>`;
  }).join("");
  return `<div class="recurring-history-filter-summary"><b>${result.rows.length} movimento${result.rows.length === 1 ? "" : "s"} encontrado${result.rows.length === 1 ? "" : "s"}</b><span>Filtro direto pela categoria/subcategoria da recorrência. Revê as caixas antes de associar.</span></div><div class="recurring-history-filter-list">${rows}</div>`;
}
function linkRecurringHistoryForm(id) {
  const rule = find("recurring", id);
  if (!rule) return notice("A recorrência já não existe.", true);
  const sameCategoryDates = data.transactions
    .filter((t) => t.type === rule.type && F.categoryPath(t.category || "") === F.categoryPath(rule.category || ""))
    .map((t) => t.date)
    .filter(F.validDate)
    .sort();
  const defaultFrom = rule.historyLinkedFrom || sameCategoryDates[0] || rule.start || F.today();
  form(
    "Associar histórico · " + esc(rule.description),
    `<p class="refund-source-summary"><b>${esc(rule.category || "Sem categoria")}</b><span>O programa pesquisa diretamente os movimentos desta categoria/subcategoria. Não depende do nome do movimento.</span></p>` +
      field("Procurar movimentos desde", "from", defaultFrom, "date", `required max="${F.today()}"`) +
      '<div id="recurringHistoryPreview" class="recurring-history-preview" aria-live="polite"></div>',
    (f) => {
      const from = f.get("from");
      if (!F.validDate(from) || from > F.today()) throw Error("Escolhe uma data válida até hoje.");
      const selected = [...document.querySelectorAll('#recurringHistoryPreview [data-recurring-history-row]:checked:not(:disabled)')].map((input) => input.value);
      let linked = [];
      const ok = commit(() => {
        const liveRule = find("recurring", id);
        if (from < liveRule.start) {
          liveRule.start = (liveRule.frequency || "monthly") === "weekly"
            ? from
            : F.dateAt(from.slice(0, 7), liveRule.day);
        }
        linked = F.linkRecurringHistorySelection(data, id, selected);
        liveRule.historyLinkedFrom = from;
      }, "Histórico da recorrência associado.");
      if (ok) notice(`${linked.length} movimento${linked.length === 1 ? "" : "s"} associado${linked.length === 1 ? "" : "s"}. Os saldos e os movimentos existentes não foram alterados.`);
      return ok;
    },
    "Seleciona os movimentos antigos que pertencem a esta série. A associação apenas liga o histórico à recorrência; não cria movimentos e não volta a mexer nos saldos.",
    "Associar selecionados",
  );
  const input = document.querySelector('#modal [name="from"]');
  const preview = document.querySelector("#recurringHistoryPreview");
  const refresh = () => {
    try {
      const from = input?.value;
      if (!F.validDate(from)) throw Error("Escolhe uma data inicial válida.");
      preview.innerHTML = recurringHistoryCandidateHtml(recurringHistoryCandidateList(rule, from));
    } catch (error) {
      preview.innerHTML = `<span>${esc(error.message || "Não foi possível analisar o histórico.")}</span>`;
    }
  };
  input?.addEventListener("input", refresh);
  input?.addEventListener("change", refresh);
  refresh();
}
function recurringHistory(id) {
  const [kind, ownerId] = String(id).split("~");
  const owner = occurrenceOwner(kind, ownerId);
  if (!owner) return notice("A recorrência já não existe.", true);
  const transactions = data.transactions
    .filter((t) => kind === "subscription" ? String(t.subscriptionId) === String(ownerId) : String(t.recurringRuleId) === String(ownerId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const overrides = (Array.isArray(owner.occurrenceOverrides) ? owner.occurrenceOverrides : []).slice().sort((a, b) => b.originalDate.localeCompare(a.originalDate));
  const txHtml = transactions.length ? transactions.slice(0, 60).map((t) => {
    const planned = t.scheduledDate || t.recurringDate || t.date;
    const timing = planned !== t.date ? `${dateLabel(planned)} → registado em ${dateLabel(t.date)}` : dateLabel(t.date);
    return `<div class="occurrence-history-row"><div><b>${esc(t.description)}</b><small>${timing}</small></div><strong class="amount ${t.type}">${t.type === "income" ? "+" : "−"}${eur(t.amount)}</strong></div>`;
  }).join("") : '<p class="muted">Ainda não existem movimentos registados desta série.</p>';
  const overrideHtml = overrides.length ? overrides.map((o) => `<div class="occurrence-history-row"><div><b>${o.skipped ? `${dateLabel(o.originalDate)} · Ignorada` : `${dateLabel(o.originalDate)} → ${dateLabel(o.date || o.originalDate)}`}</b><small>${esc(o.reason || (o.skipped ? "Ocorrência ignorada manualmente" : "Ajuste manual da ocorrência"))}</small></div>${Number.isFinite(+o.amount) ? `<strong>${eur(o.amount)}</strong>` : ""}</div>`).join("") : '<p class="muted">Sem ocorrências ajustadas.</p>';
  form(
    "Histórico · " + esc(owner.description || owner.name || "Recorrência"),
    `<div class="occurrence-history"><h3>Movimentos registados</h3>${txHtml}<h3>Ajustes de ocorrências</h3>${overrideHtml}</div>`,
    () => true,
    "Os ajustes alteram apenas a ocorrência indicada; não reescrevem movimentos já registados.",
    "Fechar",
  );
}
// The series and its payment share a split editor. Amounts are explicit: a
// variable bill must be reconciled by the user, never silently rescaled.
function categorySplitFields() {
  return `<details id="recurringSplitEditor" class="category-split-editor"><summary>Dividir por categorias</summary><label class="checkbox"><input type="checkbox" name="useCategorySplits"> Distribuir o total por várias categorias</label><p>O saldo é alterado uma única vez pelo total. As parcelas têm de somar esse valor.</p><div data-category-split-rows></div><button type="button" class="secondary" data-add-category-split>+ Adicionar categoria</button><p data-category-split-total role="status"></p><datalist id="splitCategoryOptions"></datalist></details>`;
}
function bindCategorySplits(item, amountName = 'amount', typeName = 'type') {
  const host = document.querySelector('#recurringSplitEditor');
  if (!host) return;
  const flag = host.querySelector('[name=useCategorySplits]'), rows = host.querySelector('[data-category-split-rows]');
  const amount = document.querySelector(`#modal [name="${amountName}"]`);
  const type = document.querySelector(`#modal [name="${typeName}"]`);
  const categories = (window.CompleteFinance?.categoryList(data) || []).filter(c => !c.archived).map(c => c.name);
  host.querySelector('datalist').innerHTML = [...new Set(categories)].map(c => `<option value="${esc(c)}">`).join('');
  const addRow = (part = {}) => {
    const row = document.createElement('div'); row.className = 'category-split-row';
    row.innerHTML = `<label>Categoria / subcategoria<input data-split-category list="splitCategoryOptions" maxlength="240" placeholder="Contas / Internet" value="${esc(part.category || '')}"></label><label>Valor (€)<input data-split-amount type="number" min="0.01" step="0.01" value="${esc(part.amount ?? '')}"></label><button type="button" class="link-button danger" aria-label="Remover parcela">×</button><label class="tx-split-note">Nota desta parcela (opcional)<textarea data-split-note maxlength="1000">${esc(part.note || "")}</textarea></label>`;
    row.querySelector('button').onclick = () => { row.remove(); refresh(); };
    rows.append(row);
  };
  const refresh = () => {
    const available = (type?.value || item.type) === 'expense';
    host.hidden = !available;
    const enabled = available && flag.checked;
    rows.querySelectorAll('input,textarea').forEach(el => { el.disabled = !enabled; el.required = enabled && el.tagName !== 'TEXTAREA'; });
    const total = [...rows.querySelectorAll('[data-split-amount]')].reduce((n,el) => n + F.cents(+el.value || 0), 0);
    const missing = F.cents(+(amount?.value ?? item.amount) || 0) - total;
    const status = host.querySelector('[data-category-split-total]');
    status.textContent = enabled ? `Distribuído: ${eur(total / 100)} · Falta: ${eur(missing / 100)}` : 'Sem divisão por categorias.';
    status.classList.toggle('negative', enabled && missing !== 0);
  };
  for (const part of item.splits || [{category:item.category,amount:item.amount},{category:'',amount:''}]) addRow(part);
  flag.checked = !!item.splits?.length; host.open = flag.checked;
  host.querySelector('[data-add-category-split]').onclick = () => { flag.checked = true; addRow(); refresh(); };
  host.addEventListener('input', refresh); amount?.addEventListener('input',refresh); type?.addEventListener('change',refresh); refresh();
}
function readCategorySplits(type, amount) {
  if (type !== 'expense' || !document.querySelector('#recurringSplitEditor [name=useCategorySplits]')?.checked) return undefined;
  const splits = [...document.querySelectorAll('#recurringSplitEditor .category-split-row')].map(row => ({
    category:F.categoryPath(row.querySelector('[data-split-category]').value),
    amount:+row.querySelector('[data-split-amount]').value,
    note:row.querySelector('[data-split-note]')?.value.trim() || '',
  }));
  F.validateSplits({type,amount,splits});
  return splits;
}
function settle(source, id) {
  const [ruleId, occurrenceDate] = String(id).split("~");
  const p =
    source === "pending"
      ? find("pendingPayments", id)
      : F.upcoming(data, occurrenceDate?.slice(0, 7) || month).find(
          (r) =>
            String(r.id) === ruleId &&
            (!occurrenceDate || r.date === occurrenceDate),
        );
  if (!p) return;
  const expectedPending = JSON.stringify(p);
  form(
    "Registar " + (p.type === "income" ? "recebimento" : "pagamento"),
    `<p><b>${esc(p.description)}</b> · ${eur(p.amount)}${p.estimated ? " <span class=\"muted\">(estimado)</span>" : ""}</p>` +
      (p.estimated ? number("Valor real (€)", "actualAmount", p.amount, 0.01) : "") +
      (p.type === 'expense' ? categorySplitFields() : '') +
      field(
        "Data do registo",
        "date",
        p.date > F.today() ? F.today() : p.date,
        "date",
        `required max="${F.today()}"`,
      ),
    (f) =>
      commit(() => {
        const date = f.get("date");
        if (date > F.today()) throw Error("A data não pode estar no futuro.");
        const t = {
          id: F.id(),
          description: p.description,
          amount: p.estimated ? +f.get("actualAmount") : p.amount,
          type: p.type,
          category: p.category,
          account: p.account,
          date,
          targetAccount: p.targetAccount,
          beneficiary: p.beneficiary || '',
        };
        const splits = readCategorySplits(t.type, t.amount);
        if (splits) { t.splits = splits; t.category = splits[0].category; }
        if (source === "recurring") {
          if (data.transactions.some(x => (p.subscriptionId ? String(x.subscriptionId) === String(p.subscriptionId) : String(x.recurringRuleId) === String(p.ruleId || p.id)) && x.recurringDate === (p.originalDate || p.date)))
            throw Error('Esta ocorrência já foi registada.');
          t.recurringRuleId = p.ruleId || p.id;
          t.recurringDate = p.originalDate || p.date;
          if ((p.originalDate || p.date) !== p.date) t.scheduledDate = p.date;
          if (p.subscriptionId) t.subscriptionId = p.subscriptionId;
        }
        if (source === "pending") {
          const current = find("pendingPayments", id);
          if (!current || JSON.stringify(current) !== expectedPending)
            throw Error("O compromisso mudou. Abre novamente o registo.");
          t.pendingId = p.id;
          if (p.equipmentId) t.equipmentId = p.equipmentId;
          t.originalDueDate = p.date;
          if (p.reschedules) t.reschedules = structuredClone(p.reschedules);
        }
        F.add(data, t);
        if (source === "recurring" && p.subscriptionId)
          window.LifeFinance?.advanceSubscriptionPast?.(data, p.subscriptionId, p.originalDate || p.date);
        if (source === "pending")
          data.pendingPayments = data.pendingPayments.filter(
            (x) => x.id !== p.id,
          );
      }, "Movimento registado."),
    "Confirma que o dinheiro já entrou ou saiu da conta.",
  );
  bindCategorySplits(p, 'actualAmount');
}
function simMonthAdd(ym, offset) {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function decisionBaseline() {
  const today = F.today(), currentMonth = today.slice(0, 7);
  const cash = F.money(data.accounts.filter((a) => !a.archived).reduce((n, a) => n + Number(a.balance || 0), 0));
  const months = [-1, -2, -3].map((n) => simMonthAdd(currentMonth, n));
  const totals = months.map((m) => totalsFor(m));
  const avgIncome = F.money(totals.reduce((n, t) => n + t.income, 0) / totals.length);
  const avgExpense = F.money(totals.reduce((n, t) => n + t.expense, 0) / totals.length);
  const monthlyNet = F.money(avgIncome - avgExpense);
  return { cash, avgIncome, avgExpense, monthlyNet, months };
}
function updateDecisionSimulatorFields() {
  const type = $("#simDecisionType")?.value || "purchase";
  const show = (selector, visible) => document.querySelectorAll(selector).forEach((el) => el.hidden = !visible);
  show(".sim-field-amount", type !== "custom");
  show(".sim-field-income-direction", type === "income");
  show(".sim-field-rate, .sim-field-credit-term, .sim-field-credit-spend", type === "credit");
  show(".sim-field-custom-monthly, .sim-field-custom-oneoff", type === "custom");
  const b = decisionBaseline();
  const summary = $("#simBaselineSummary");
  if (summary) summary.innerHTML = `<div><span>Saldo atual</span><strong>${eur(b.cash)}</strong></div><div><span>Receita média</span><strong>${eur(b.avgIncome)}/mês</strong></div><div><span>Despesa média</span><strong>${eur(b.avgExpense)}/mês</strong></div><div><span>Resultado médio</span><strong class="${b.monthlyNet >= 0 ? "positive" : "negative"}">${b.monthlyNet > 0 ? "+" : ""}${eur(b.monthlyNet)}/mês</strong></div>`;
}
function runSimulation() {
  const type = $("#simDecisionType")?.value || "purchase",
    amount = +($("#simAmount")?.value || 0),
    months = +($("#simMonths")?.value || 12),
    annualRate = +($("#simAnnualRate")?.value || 0),
    creditMonths = +($("#simCreditMonths")?.value || 0),
    monthlyCustom = +($("#simMonthlyChange")?.value || 0),
    oneOffCustom = +($("#simOneOff")?.value || 0),
    baseline = decisionBaseline();
  if (!Number.isInteger(months) || months < 1 || months > 120 || ![amount, annualRate, creditMonths, monthlyCustom, oneOffCustom].every(Number.isFinite) || amount < 0) {
    $("#simulationResult").textContent = "Confirma os valores e escolhe um horizonte entre 1 e 120 meses.";
    return;
  }
  let monthlyDelta = 0, oneOff = 0, creditPayment = 0, creditInterest = 0, label = "Cenário", detail = "";
  if (type === "purchase") {
    oneOff = -amount; label = "Compra"; detail = `Impacto único de ${eur(amount)}.`;
  } else if (type === "monthly-expense") {
    monthlyDelta=-amount;label="Despesa mensal";detail=`Compromisso adicional de ${eur(amount)} por mês.`;
  } else if (type === "reduce-expense") {
    monthlyDelta = amount; label = "Redução de despesa"; detail = `Liberta ${eur(amount)} por mês.`;
  } else if (type === "income") {
    const sign = $("#simIncomeDirection")?.value === "decrease" ? -1 : 1;
    monthlyDelta = sign * amount; label = sign > 0 ? "Aumento de rendimento" : "Redução de rendimento"; detail = `${sign > 0 ? "+" : "−"}${eur(amount)} por mês.`;
  } else if (type === "credit") {
    if (!Number.isInteger(creditMonths) || creditMonths < 1 || creditMonths > 480 || annualRate < 0 || annualRate > 100 || amount <= 0) {
      $("#simulationResult").textContent = "Confirma o montante, a taxa e o prazo do crédito."; return;
    }
    const r = annualRate / 100 / 12;
    creditPayment = r ? amount * r / (1 - Math.pow(1 + r, -creditMonths)) : amount / creditMonths;
    creditPayment = F.money(creditPayment);
    creditInterest = F.money(creditPayment * creditMonths - amount);
    monthlyDelta = -creditPayment;
    oneOff = $("#simCreditSpent")?.checked ? 0 : amount;
    label = "Crédito";
    detail = `${eur(amount)} durante ${creditMonths} meses · prestação estimada ${eur(creditPayment)}/mês · juros/custo financeiro aproximado ${eur(Math.max(0, creditInterest))}.`;
  } else {
    monthlyDelta = monthlyCustom; oneOff = oneOffCustom; label = "Personalizado";
    detail = `${monthlyDelta >= 0 ? "+" : ""}${eur(monthlyDelta)}/mês${oneOff ? ` · ${oneOff >= 0 ? "+" : ""}${eur(oneOff)} uma vez` : ""}.`;
  }
  const baseRows = [], scenarioRows = [];
  let baseBalance = baseline.cash, scenarioBalance = F.money(baseline.cash + oneOff);
  for (let i = 1; i <= months; i++) {
    baseBalance = F.money(baseBalance + baseline.monthlyNet);
    let delta = monthlyDelta;
    if (type === "credit" && i > creditMonths) delta = 0;
    scenarioBalance = F.money(scenarioBalance + baseline.monthlyNet + delta);
    baseRows.push(baseBalance); scenarioRows.push(scenarioBalance);
  }
  const baseEnd = baseRows.at(-1) ?? baseline.cash,
    scenarioEnd = scenarioRows.at(-1) ?? scenarioBalance,
    impact = F.money(scenarioEnd - baseEnd),
    minScenario = Math.min(baseline.cash + oneOff, ...scenarioRows),
    firstNegative = baseline.cash + oneOff < 0 ? -2 : scenarioRows.findIndex((v) => v < 0),
    samples = [...new Set([1, 3, 6, 12, months].filter((m) => m <= months))].sort((a,b)=>a-b);
  const rows = samples.map((m) => `<tr><th>Mês ${m}</th><td>${eur(baseRows[m - 1])}</td><td class="${scenarioRows[m - 1] >= 0 ? "" : "negative"}">${eur(scenarioRows[m - 1])}</td><td class="${scenarioRows[m - 1] - baseRows[m - 1] >= 0 ? "positive" : "negative"}">${scenarioRows[m - 1] - baseRows[m - 1] > 0 ? "+" : ""}${eur(F.money(scenarioRows[m - 1] - baseRows[m - 1]))}</td></tr>`).join("");
  const known=PlanningFinance.decisionImpact(data,{oneOff,monthlyDelta,monthlyCount:type==='credit'?creditMonths:120});
  const knownExplanation='<p role="status"><b>Compromissos conhecidos nos próximos 90 dias:</b> '+(known.canSpend?'manténs os valores reservados e a margem.':'faltam '+eur(known.compromised)+' para proteger reservas e margem.')+' Disponibilidade após a decisão: '+eur(known.availableAfter)+'.'+(known.firstCompromise?' Primeiro dia abaixo da proteção: '+dateLabel(known.firstCompromise)+'.':'')+'</p>';
  $("#simulationResult").innerHTML =
    knownExplanation + `<div class="simulation-comparison simulation-comparison-v25"><div><span>Situação atual</span><strong>${eur(baseEnd)}</strong><small>Saldo total projetado em ${months} meses</small></div><div><span>${esc(label)}</span><strong>${eur(scenarioEnd)}</strong><small>${esc(detail)}</small></div><div class="${impact >= 0 ? "positive" : "negative"}"><span>Impacto</span><strong>${impact > 0 ? "+" : ""}${eur(impact)}</strong><small>Diferença face à situação atual</small></div><div class="${minScenario >= 0 ? "" : "negative"}"><span>Ponto mais baixo</span><strong>${eur(minScenario)}</strong><small>${firstNegative === -2 ? "Saldo negativo logo no início" : firstNegative >= 0 ? `Saldo negativo a partir do mês ${firstNegative + 1}` : "Sem saldo negativo no horizonte"}</small></div></div>` +
    `<details class="simulation-projection"><summary>Evolução projetada · ${months} meses</summary><div class="panel-heading"><div><h3>Evolução projetada</h3><p>Usa o resultado médio dos últimos 3 meses completos como base.</p></div></div><div class="planning-table"><table><thead><tr><th></th><th>Situação atual</th><th>Cenário</th><th>Diferença</th></tr></thead><tbody>${rows}</tbody></table></div></details>` +
    `<p class="muted">A projeção é uma estimativa de liquidez: parte dos saldos atuais e do resultado médio recente. Não prevê inflação, impostos, rendimentos de investimentos nem despesas futuras ainda não registadas.${type === "credit" ? " A prestação é uma aproximação financeira; confirma sempre a proposta real do banco." : ""}</p>`;
}
function resetDecisionSimulation() {
  const defaults = { simDecisionType: "purchase", simAmount: "500", simMonths: "12", simAnnualRate: "8", simCreditMonths: "36", simMonthlyChange: "0", simOneOff: "0", simIncomeDirection: "increase" };
  for (const [id, value] of Object.entries(defaults)) if ($("#" + id)) $("#" + id).value = value;
  if ($("#simCreditSpent")) $("#simCreditSpent").checked = true;
  updateDecisionSimulatorFields(); runSimulation();
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  if (window.DailyUI) return window.DailyUI.exportActive();
  const copy = { ...data, lastBackup: new Date().toISOString() };
  download(
    JSON.stringify(copy, null, 2),
    "equilibrio-" + F.today() + ".json",
    "application/json",
  );
  if (!storageProblem)
    commit(
      () => (data.lastBackup = copy.lastBackup),
      "Cópia de segurança exportada.",
    );
}
function exportCSV() {
  const cell = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  const lines = [
    [
      "Data",
      "Descrição",
      "Valor",
      "Categoria",
      "Conta",
      "Tipo",
      "Conta de destino",
    ],
    ...filteredTransactions().map((t) => [
      t.date,
      t.description,
      (t.type === "expense" ? -t.amount : t.amount)
        .toFixed(2)
        .replace(".", ","),
      t.category,
      t.account,
      t.type,
      t.targetAccount,
    ]),
  ];
  download(
    "\uFEFF" + lines.map((r) => r.map(cell).join(";")).join("\r\n"),
    "movimentos-" + month + ".csv",
    "text/csv;charset=utf-8",
  );
  notice("Lista filtrada exportada.");
}
async function importCSV(file) {
  if (!requireAccounts()) return;
  const importSpace = key;
  try {
    if (file.size > 5_000_000) throw Error("Escolhe um CSV até 5 MB.");
    const text = await file.text();
    if (key !== importSpace)
      throw Error(
        "O espaço mudou durante a leitura. Importa novamente o ficheiro no espaço pretendido.",
      );
    if (!text.trim()) throw Error("O ficheiro está vazio.");
    openImportWizard(text, file.name || "Extrato CSV");
  } catch (e) {
    notice(e.message, true);
  }
}

function openImportWizard(text, filename) {
  const parsed = F.csv(text);
  if (!parsed.length) throw Error("O ficheiro não contém linhas.");
  let latest = null;
  const headerSignature = parsed[0].map((cell) => F.importNormalize(cell)).join("|");
  const matchingProfile = data.importProfiles.find((profile) =>
    profile.header && profile.headerSignature && profile.headerSignature === headerSignature,
  );
  const settings =
    select(
      "Formato guardado",
      "savedProfile",
      [["", "Novo formato"], ...data.importProfiles.map((p) => [p.id, p.name])],
      matchingProfile?.id || "",
    ) +
    (matchingProfile ? `<p class="import-profile-match" role="status">Formato reconhecido: <b>${esc(matchingProfile.name)}</b>. Confirma a amostra antes de preparar os movimentos.</p>` : "") +
    field(
      "Guardar formato com o nome (opcional)",
      "bankProfileName",
      "",
      "text",
      "maxlength=80",
    ) +
    select(
      "Separador",
      "separator",
      [
        ["", "Detetar automaticamente"],
        [";", "Ponto e vírgula (;)"],
        [",", "Vírgula (,)"],
        ["\t", "Tabulação"],
      ],
      "",
    ) +
    '<label class="checkbox"><input type="checkbox" name="header" checked> A primeira linha contém os nomes das colunas</label>' +
    select(
      "Formato dos valores",
      "mode",
      [
        ["signed", "Uma coluna: despesas negativas, receitas positivas"],
        ["split", "Duas colunas: débito e crédito"],
        ["expense", "Uma coluna: apenas despesas"],
        ["income", "Uma coluna: apenas receitas"],
      ],
      F.guessColumns(parsed[0]).debit >= 0 ? "split" : "signed",
    ) +
    accountSelect("defaultAccount", data.accounts[0].name) +
    '<label class="checkbox"><input type="checkbox" name="overrideAccount" checked> Usar esta conta para todas as linhas</label><div id="columnMapping" class="mapping-grid"></div><div id="importPreview" aria-live="polite"></div>';
  form(
    "Importar extrato",
    settings,
    (f) => {
      latest = preview(f);
      if (!latest || !latest.transactions.length) return false;
      const ok = commit(() => {
        const name = f.get("bankProfileName").trim();
        if (name) {
          const existing = data.importProfiles.find(
            (p) => p.id === f.get("savedProfile") || p.name === name,
          );
          const profile = {
            id: existing?.id || F.id(),
            name,
            separator: f.get("separator"),
            header: f.has("header"),
            mode: f.get("mode"),
            defaultAccount: f.get("defaultAccount"),
            overrideAccount: f.has("overrideAccount"),
            headerSignature: f.has("header") ? headerSignature : "",
            columns: Object.fromEntries(
              [...f.entries()].filter(([k]) => k.startsWith("column_")),
            ),
          };
          if (existing)
            data.importProfiles[data.importProfiles.indexOf(existing)] =
              profile;
          else data.importProfiles.push(profile);
        }
        data.pendingImports.push(
          ...latest.transactions.map((t) => ({ ...t, importSource: filename,importDraftId:window.DraftUI?.token()?.id })),
        );
      }, latest.transactions.length + " movimentos preparados para revisão.");
      if (ok) navigate("review");
      return ok;
    },
    esc(filename) +
      " · Escolhe as colunas e confirma a amostra. Os saldos só mudam na revisão final.",
    "Preparar movimentos",
  );
  $("#modal").classList.add("import-dialog");
  function mapping() {
    const f = new FormData($("#modalForm"));
    const rows = F.csv(text, f.get("separator"));
    const header = f.has("header"),
      width = Math.max(...rows.slice(0, 30).map((r) => r.length));
    const options = [
      [-1, "Não usar"],
      ...Array.from({ length: width }, (_, i) => [
        i,
        header ? rows[0][i] || "Coluna " + (i + 1) : "Coluna " + (i + 1),
      ]),
    ];
    const guess = header
      ? F.guessColumns(rows[0])
      : { date: 0, description: 1, amount: 2 };
    const fields = {
      date: "Data",
      description: "Descrição",
      ...(f.get("mode") === "split"
        ? { debit: "Débito / saída", credit: "Crédito / entrada" }
        : { amount: "Valor" }),
      category: "Categoria (opcional)",
      beneficiary: "Beneficiário / estabelecimento (opcional)",
      ...(!f.has("overrideAccount") ? { account: "Conta (opcional)" } : {}),
      type: "Tipo (opcional)",
    };
    $("#columnMapping").innerHTML = Object.entries(fields)
      .map(([key, label]) =>
        select(label, "column_" + key, options, guess[key] ?? -1),
      )
      .join("");
    $("#columnMapping").onchange = preview;
    preview();
  }
  function preview(values) {
    const host = $("#importPreview"),
      submit = $("#modalContent button[type=submit]");
    try {
      const f = values instanceof FormData ? values : new FormData($("#modalForm")),
        rows = F.csv(text, f.get("separator")),
        header = f.has("header");
      const map = Object.fromEntries(
        [
          "date",
          "description",
          "amount",
          "debit",
          "credit",
          "category",
          "beneficiary",
          "account",
          "type",
        ].map((k) => [k, f.has("column_" + k) ? +f.get("column_" + k) : -1]),
      );
      const required = [
        "date",
        "description",
        ...(f.get("mode") === "split" ? ["debit", "credit"] : ["amount"]),
      ];
      if (required.some((k) => map[k] < 0))
        throw Error("Escolhe as colunas de data, descrição e valores.");
      if (new Set(required.map((k) => map[k])).size !== required.length)
        throw Error(
          "As colunas de data, descrição e valores devem ser diferentes.",
        );
      const result = F.prepareImport(
        header ? rows.slice(1) : rows,
        map,
        {
          header,
          mode: f.get("mode"),
          account: f.get("defaultAccount"),
          overrideAccount: f.has("overrideAccount"),
          limitDate: F.today(),
          closedMonths: data.closedMonths,
        },
        data.accounts,
        window.PracticalFinance?.importRules(data) || data.rules,
        data.transactions,
      );
      const overlaps = window.PlanningFinance?.importOverlap(
        data,
        result.transactions,
      ) || result.transactions.map((row) => ({ row, status: "new", matches: [], total: 0 }));
      const byId = new Map(overlaps.map((entry) => [String(entry.row.id), entry]));
      for (const t of result.transactions) {
        const overlap = byId.get(String(t.id));
        t.importStatus = overlap?.status || "new";
        t.importMatchCount = overlap?.total || 0;
      }
      const duplicates = result.transactions.filter((t) => t.importStatus === "duplicate").length;
      const nearby = result.transactions.filter((t) => t.importStatus === "possible").length;
      const fresh = result.transactions.length - duplicates - nearby;
      const learned = result.transactions.filter((t) => ["rule", "history"].includes(t.importSuggestion?.source)).length;
      const merchants = result.transactions.filter((t) => t.beneficiary).length;
      const impactRows = result.transactions.filter((t) => t.importStatus !== "duplicate");
      let impact = [];
      try { impact = window.PlanningFinance?.importImpact(data, impactRows) || []; } catch {}
      const impactHtml = impact.length
        ? `<div class="smart-import-impact"><b>Impacto se confirmares os novos movimentos</b>${impact.map((a) => `<span><span>${esc(a.name)}</span><strong>${eur(a.before)} → ${eur(a.after)} <small>(${a.delta >= 0 ? "+" : ""}${eur(a.delta)})</small></strong></span>`).join("")}</div>`
        : "";
      host.innerHTML =
        '<div class="import-stats smart-import-stats"><b>' +
        fresh +
        " novos</b><span>" +
        duplicates +
        " a ignorar</span><span>" +
        nearby +
        " a conferir</span><span>" +
        learned +
        " categorizados automaticamente</span><span>" +
        merchants +
        " estabelecimentos reconhecidos</span><span>" +
        result.errors.length +
        " com problemas</span></div>" +
        "<h3>Pré-visualização inteligente</h3>" +
        '<p class="smart-import-explain">Antes de gravar, o programa cruza regras, histórico, estabelecimento, valor e data. Duplicados exatos ficam desmarcados na revisão final.</p>' +
        (result.transactions
          .slice(0, 8)
          .map((t) => importPreviewItem(t))
          .join("") || empty("Não há linhas válidas com estas escolhas.")) +
        impactHtml +
        (result.errors.length
          ? '<details class="import-errors" open><summary>Linhas que não serão preparadas (' +
            result.errors.length +
            ")</summary><ol>" +
            result.errors
              .slice(0, 50)
              .map(
                (e) =>
                  "<li><b>Linha " +
                  e.line +
                  ": " +
                  esc(e.reason) +
                  "</b><small>" +
                  esc(e.description) +
                  "</small><p>" +
                  esc(importErrorHelp(e.reason)) +
                  "</p></li>",
              )
              .join("") +
            "</ol>" +
            (result.errors.length > 50
              ? "<p>São mostradas as primeiras 50. Exporta a lista completa para consultar as restantes.</p>"
              : "") +
            '<button type="button" id="downloadImportErrors" class="secondary">Exportar lista de problemas</button></details>'
          : "") +
        '<p class="import-footnote">Os possíveis duplicados ficam desmarcados na revisão. ' +
        (result.errors.length
          ? "As linhas com problemas ficam excluídas; podes corrigir o ficheiro e voltar a importá-lo."
          : "Nenhum saldo foi alterado.") +
        "</p>";
      if ($("#downloadImportErrors"))
        $("#downloadImportErrors").onclick = () =>
          download(
            result.errors
              .map(
                (e) =>
                  "Linha " + e.line + ": " + e.reason + " — " + e.description,
              )
              .join("\r\n"),
            "problemas-importacao.txt",
            "text/plain;charset=utf-8",
          );
      submit.disabled = !result.transactions.length;
      submit.textContent =
        "Preparar " + result.transactions.length + " movimentos válidos";
      latest = result;
      return result;
    } catch (e) {
      host.innerHTML = '<p class="alert danger">' + esc(e.message) + "</p>";
      submit.disabled = true;
      latest = null;
      return null;
    }
  }
  for (const name of ["separator", "header", "mode", "overrideAccount"])
    $('#modalContent [name="' + name + '"]').onchange = mapping;
  $("#modalContent [name=defaultAccount]").onchange = preview;
  $("#modalContent [name=savedProfile]").onchange = (e) => {
    const p = data.importProfiles.find((p) => p.id === e.target.value);
    if (!p) return;
    for (const name of ["separator", "mode", "defaultAccount"])
      $("#modalContent [name=" + name + "]").value = p[name];
    for (const name of ["header", "overrideAccount"])
      $("#modalContent [name=" + name + "]").checked = p[name];
    $("#modalContent [name=bankProfileName]").value = p.name;
    mapping();
    for (const [name, value] of Object.entries(p.columns)) {
      const el = $("#modalContent [name=" + name + "]");
      if (el) el.value = value;
    }
    preview();
  };
  mapping();
  if (matchingProfile) $("#modalContent [name=savedProfile]").dispatchEvent(new Event("change"));
  window.DraftUI?.begin('csv',()=>({text,filename}));
}
function importErrorHelp(reason) {
  const text = String(reason).toLowerCase();
  if (text.includes("data") || text.includes("futur"))
    return "Confirma a coluna de data e usa uma data válida até hoje. Compromissos futuros devem ser agendados.";
  if (text.includes("fechado"))
    return "Revê o período escolhido ou reabre o mês apenas se pretendes corrigir esse histórico.";
  if (
    text.includes("valor") ||
    text.includes("débito") ||
    text.includes("crédito")
  )
    return "Confirma o formato: uma coluna com sinal ou duas colunas separadas para débito e crédito.";
  if (text.includes("conta"))
    return "Escolhe uma conta existente ou ativa a opção de usar a mesma conta em todas as linhas.";
  return "Confirma o separador e a correspondência das colunas; corrige a linha indicada e volta a importar.";
}
async function restore(file) {
  const restoreSpace = key;
  try {
    const raw = JSON.parse(await file.text());
      if(key!==restoreSpace)throw Error('O espaço mudou durante a leitura. Abre novamente a cópia no espaço pretendido.');
    if(window.LifeUI?.restoreCopy){await LifeUI.restoreCopy(raw,false,{filename:file.name});return;}
    if(raw?.format==='equilibrio-spaces')throw Error('Não foi possível abrir o módulo de restauro. Reabre o programa antes de restaurar a cópia.');
    const next = F.normalize(raw);
    if (key !== restoreSpace)
      throw Error(
        "O espaço mudou durante a leitura. Abre novamente a cópia no espaço pretendido.",
      );
    form(
      "Restaurar cópia",
      `<p>A cópia contém ${next.accounts.length} contas e ${next.transactions.length} movimentos. Vai substituir os dados deste navegador.</p>`,
      () => {
        const previous = storageProblem;
        storageProblem = false;
        const ok = commit(() => {
          data = next;
        }, "Cópia restaurada.");
        if (!ok) storageProblem = previous;
        return ok;
      },
      "Exporta os dados atuais antes de substituir.",
      "Restaurar",
    );
  } catch (e) {
    notice(e.message || "Cópia inválida.", true);
  }
}
function deleteTransaction(id) {
  const tx = find("transactions", id);
  if (!tx) return;
  if (tx.refundOf)
    return confirmAction("Apagar movimento", "Este movimento de reembolso será apagado como qualquer outro movimento e o respetivo efeito no saldo será revertido. A despesa original mantém-se.", () => { rememberMovementContext(id); F.remove(data, id); });
  const refunds = data.transactions.filter((t) => String(t.refundOf || "") === String(id));
  const consequences = ["O efeito deste movimento nos saldos será revertido."];
  if (tx.pendingId) consequences.push("O valor pago voltará ao compromisso por liquidar.");
  if (tx.installmentPaymentId) consequences.push("O valor pago voltará à prestação por liquidar.");
  if (data.statements.some(s => s.rows.some(r => r.transactionId === tx.id))) consequences.push("A linha do extrato voltará a pedir conferência.");
  if (data.practical?.captures.some(c => c.status === "linked" && c.transactionId === tx.id)) consequences.push("A captura associada voltará à caixa de entrada.");
  if (!refunds.length)
    return confirmAction("Apagar movimento", consequences.join(" "), () => { rememberMovementContext(id); F.remove(data, id); });
  if (refunds.some((t) => t.source === "Casa reembolso"))
    return notice("Esta despesa tem um reembolso ligado ao módulo Casa. Abre a compra Casa para anular o reembolso primeiro.", true);
  const closed = [tx, ...refunds].find((t) => data.closedMonths.includes(String(t.date || "").slice(0, 7)));
  if (closed)
    return notice(`Reabre primeiro ${monthLabel(String(closed.date).slice(0, 7))}, porque a despesa ou um dos reembolsos está num mês fechado.`, true);
  const total = sum(refunds, (t) => t.amount);
  return confirmAction(
    "Apagar despesa e reembolso" + (refunds.length === 1 ? "" : "s"),
    `Esta despesa tem ${refunds.length} reembolso${refunds.length === 1 ? "" : "s"} associado${refunds.length === 1 ? "" : "s"} (${eur(total)}). Se continuares, o programa apaga primeiro os reembolsos e depois a despesa, revertendo todos os efeitos nos saldos.`,
    () => {
      rememberMovementContext(id);
      for (const refund of refunds.slice()) F.remove(data, refund.id);
      F.remove(data, id);
    },
  );
}
const actions = {
  "edit-tx": transactionForm,
  "make-transfer": (id) => transferForm(null, id),
  "attach-receipt": attachReceiptQuick,
  "remove-receipt": (id) => confirmAction("Remover comprovativo", "O comprovativo deixa de ficar associado a este movimento. O movimento mantém-se.", () => { const tx = find("transactions", id); delete tx.attachment; }),
  budget: (id) => collectionForm("budget", id),
  goal: (id) => collectionForm("goal", id),
  account: (id) => collectionForm("account", id),
  debt: (id) => collectionForm("debt", id),
  investment: (id) => collectionForm("investment", id),
  envelope: (id) => collectionForm("envelope", id),
  reserve: (id) => collectionForm("reserve", id),
  rule: (id) => collectionForm("rule", id),
  recurring: recurringForm,
  "delete-recurring": (id) => confirmAction("Apagar movimento recorrente", "A recorrência deixa de gerar novas ocorrências. Movimentos já registados não são apagados.", () => { data.recurring = data.recurring.filter((r) => String(r.id) !== String(id)); }),
  reconcile: reconcileForm,
  "pay-card": transferForm,
  "pay-debt": payDebt,
  "extra-debt": extraDebtPayment,
  "debt-history": debtPreviousPayment,
  "edit-debt-history": editDebtHistoryEntry,
  "link-debt-history": linkDebtHistoryForm,
  "unlink-debt-history": (id) => {
    const [debtId, transactionId] = String(id).split("~");
    const tx = find("transactions", transactionId);
    if (!tx || String(tx.debtHistoryOf || "") !== String(debtId)) return notice("Esta associação já não existe.", true);
    return confirmAction("Desassociar movimento", "O movimento continua no histórico normal e mantém exatamente o mesmo efeito no saldo. Apenas deixa de aparecer dentro deste crédito.", () => { delete tx.debtHistoryOf; delete tx.debtHistoryPrincipal; delete tx.debtHistoryInterest; delete tx.debtHistoryCharges; });
  },
  "delete-debt-history": (id) => {
    const [debtId, paymentId] = String(id).split("~"), debt = find("debts", debtId);
    return confirmAction("Remover pagamento anterior", "Este registo histórico será removido. Os saldos atuais não são alterados.", () => {
      debt.previousPayments = (debt.previousPayments || []).filter((p) => String(p.id) !== String(paymentId));
    });
  },
  "goal-fund": (id) => fund("goal", id),
  "reserve-fund": (id) => fund("reserve", id),
  "settle-pending": (id) => settle("pending", id),
  "settle-recurring": (id) => settle("recurring", id),
  "adjust-occurrence": adjustOccurrence,
  "recurring-history": recurringHistory,
  "link-recurring-history": linkRecurringHistoryForm,
  "tx-page": (page) => { transactionPage = Math.max(1, Number(page) || 1); renderTransactions(); },
  "tx-page-prev": () => { transactionPage = Math.max(1, transactionPage - 1); renderTransactions(); },
  "tx-page-next": () => { transactionPage += 1; renderTransactions(); },
  "tx-month-prev": () => {
    if ($("#periodFilter")) $("#periodFilter").value = "month";
    window.CompleteUI?.clearDateRange?.();
    const d = new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() - 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if ($("#monthPicker")) $("#monthPicker").value = month;
    resetTransactionPage(); render();
  },
  "tx-month-next": () => {
    if ($("#periodFilter")) $("#periodFilter").value = "month";
    window.CompleteUI?.clearDateRange?.();
    const d = new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() + 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if ($("#monthPicker")) $("#monthPicker").value = month;
    resetTransactionPage(); render();
  },
  "reset-tx-columns": resetTransactionColumnWidths,
  "delete-tx": deleteTransaction,
  receipt: async (id, preservedAttachment) => {
    const a = preservedAttachment || find("transactions", id)?.attachment;
    if (a?.url) { window.open(a.url, "_blank", "noopener"); return; }
    if (a?.referenceOnly) return notice(`O comprovativo registado é “${a.name}”. O navegador não pode reabrir automaticamente um caminho local por motivos de segurança.`, true);
    if (!a || !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/.test(a.data))
      return notice("Comprovativo inválido ou formato não suportado.", true);
    if (window.financasDesktop?.openAttachment) {
      try { await window.financasDesktop.openAttachment(a); return; }
      catch (error) { return notice(error?.message || "Não foi possível abrir o comprovativo.", true); }
    }
    const raw = atob(a.data.split(",")[1]), bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(new Blob([bytes], { type: a.data.slice(5, a.data.indexOf(";")) }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
};

// Se o editor de divisão for fechado através do modal principal (Esc, X ou
// navegação), liberta sempre o scroll da página. Evita a classe de bloqueio
// ficar presa no body depois de o workbench já não estar visível.
document.querySelector("#modal")?.addEventListener("close", () => {
  document.body.classList.remove("split-workbench-open");
});
for (const [kind, list] of Object.entries({
  budget: "budgets",
  goal: "goals",
  account: "accounts",
  debt: "debts",
  investment: "investments",
  envelope: "envelopes",
  reserve: "reserves",
  rule: "rules",
  pending: "pendingPayments",
}))
  actions["delete-" + kind] = (id) =>
    confirmAction("Apagar registo", "Queres apagar este registo?", () => {
      const item = find(list, id);
      if (!item) throw Error("Este registo já não existe neste espaço.");
      if (["pending", "reserve"].includes(kind) && data.practical?.equipment.some(e => e[kind === "pending" ? "pendingId" : "reserveId"] === item.id))
        throw Error("Este registo pertence a um equipamento. Abre Casa → Equipamentos para cancelar o plano ligado ou concluir a intervenção.");
      if (kind === "investment" && data.investmentTrades.some(t => t.investmentId === item.id))
        throw Error("Este investimento tem operações associadas. Reverte-as no inventário antes de eliminar o registo.");
      if (kind === "account" && F.accountNameReferences(data, item.name).length)
        throw Error(
          "Esta conta ainda tem movimentos, agendamentos ou outros registos associados. Mantém-na para preservar o histórico.",
        );
      if (kind === "account" && item.balance !== 0)
        throw Error(
          "Transfere ou reconcilia o saldo para zero antes de apagar a conta.",
        );
      if (
        kind === "debt" &&
        data.transactions.some((t) => String(t.debtId || t.debtHistoryOf || "") === String(item.id))
      )
        throw Error(
          "Esta dívida tem pagamentos associados e deve manter-se no histórico.",
        );
      data[list] = data[list].filter((x) => String(x.id) !== String(id));
    });
function setup() {
  document.addEventListener("change", e => { if (e.target.matches("[data-import-check]")) updateImportSelection(); });
  const globalPeriodRow = $(".period-row");
  if (globalPeriodRow) $("#globalPeriod").append(globalPeriodRow);
  $("#transactionForm").remove();
  $("#modalForm").removeAttribute("method");
  $("#modal").setAttribute("aria-labelledby", "formTitle");
  $("#modalForm .close").type = "button";
  const closeModalPreservingView = closeForm;
  $("#modalForm .close").onclick = closeModalPreservingView;
  $("#modal").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeModalPreservingView();
  });
  $("#modalForm").onsubmit = async (e) => {
    e.preventDefault();
    if (formSubmitting) return;
    window.DraftUI?.flush();
    const draftToken=window.DraftUI?.token();
    formSubmitting = true;
    const revision = formRevision, action = formAction;
    const b = e.submitter;
    const values = new FormData(e.currentTarget);
    const buttons = $$('#modalForm button, #modalForm input, #modalForm select, #modalForm textarea');
    const disabled = buttons.map(button => button.disabled);
    buttons.forEach(button => button.disabled = true);
    try {
      const ok = await action(values);
      if(ok!==false)window.DraftUI?.complete(draftToken);
      if (revision !== formRevision) return;
      if (ok !== false) {
        formSubmitting = false;
        formBaseline = null;
        if (b?.dataset.afterSave === "new-transaction") transactionForm();
        else {
          const returnView = $("#modal").dataset.returnView;
          $("#modal").close();
          if (returnView && view === returnView && $("#" + returnView)) navigate(returnView);
        }
      }
    } catch (err) {
      if (revision !== formRevision) return notice(err.message, true);
      $("#formError").textContent = err.message;
      $("#formError").hidden = false;
      $("#formError").setAttribute("tabindex", "-1");
      $("#formError").focus();
    } finally {
      formSubmitting = false;
      if (revision === formRevision) buttons.forEach((button, i) => button.disabled = disabled[i]);
    }
  };
  $("#today").textContent = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const picker = $("#monthPicker");
  const current = new Date();
  const historical = data.transactions.map((t) => +t.date.slice(0, 4));
  const first = Math.min(current.getFullYear() - 2, ...historical),
    last = current.getFullYear() + 1;
  for (let y = first; y <= last; y++)
    for (let m = 1; m <= 12; m++) {
      const value = `${y}-${String(m).padStart(2, "0")}`;
      picker.insertAdjacentHTML(
        "beforeend",
        `<option value="${value}">${monthLabel(value)}</option>`,
      );
    }
  picker.value = month;
  const directMonth = $("#movementMonthSelect"), directYear = $("#movementYearSelect");
  if (directMonth && directYear) {
    for (let m = 1; m <= 12; m++) directMonth.add(new Option(new Date(2020,m-1,1).toLocaleDateString("pt-PT",{month:"long"}),String(m).padStart(2,"0")));
    for (let y = current.getFullYear()+10; y >= 1900; y--) directYear.add(new Option(String(y),String(y)));
    directMonth.value = month.slice(5); directYear.value = month.slice(0,4);
    const chooseMovementPeriod = () => {
      const selected = directYear.value + "-" + directMonth.value;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) return;
      month = selected;
      if (![...picker.options].some(o=>o.value===month)) picker.add(new Option(monthLabel(month),month));
      picker.value = month;
      if ($("#periodFilter")) $("#periodFilter").value = "month";
      window.CompleteUI?.clearDateRange?.(); resetTransactionPage(); render();
    };
    directMonth.onchange = directYear.onchange = chooseMovementPeriod;
  }
  picker.onchange = () => {
    month = picker.value;
    render();
  };
  const shiftSummaryMonth = (delta) => {
    const options = [...picker.options];
    const index = options.findIndex((o) => o.value === month);
    const target = options[index + delta];
    if (!target) return;
    month = target.value;
    picker.value = month;
    render();
  };
  if ($("#summaryPrevMonth")) $("#summaryPrevMonth").onclick = () => shiftSummaryMonth(-1);
  if ($("#summaryNextMonth")) $("#summaryNextMonth").onclick = () => shiftSummaryMonth(1);
  $('#incomeBreakdownButton').onclick=()=>summaryCalculation('income');
  $('#expenseBreakdownButton').onclick=()=>summaryCalculation('expense');
  $("#summaryBalanceRange")?.addEventListener("change", (event) => {
    summaryBalanceMonths = Number(event.target.value) || 6;
    renderDashboard();
  });
  $("#summaryIncomeRange")?.addEventListener("change", (event) => {
    summaryIncomeMonths = Number(event.target.value) || 6;
    renderDashboard();
  });
  const reportYears = [
    ...new Set([
      ...data.transactions.map((t) => +t.date.slice(0, 4)),
      ...data.pendingPayments.map((t) => +t.date.slice(0, 4)),
      ...data.pendingImports.map((t) => +t.date.slice(0, 4)),
      ...data.recurring.map((r) => +r.start.slice(0, 4)),
      ...data.closedMonths.map((m) => +m.slice(0, 4)),
    ].filter(Number.isFinite)),
  ].sort((a, b) => b - a);
  if (!reportYears.length) reportYears.push(current.getFullYear());
  $("#reportYear").innerHTML = reportYears
    .map((y) => `<option>${y}</option>`)
    .join("");
  $("#reportYear").value = reportYears.includes(current.getFullYear())
    ? current.getFullYear()
    : reportYears[0];
  $("#reportYear").onchange = renderReports;
  $$(".nav-link").forEach((b) => (b.onclick = () => navigate(b.dataset.view)));
  $$("[data-goto]").forEach(
    (b) => (b.onclick = () => navigate(b.dataset.goto)),
  );
  const binds = {
    addTransaction: () => transactionForm(),
    addTransaction2: () => transactionForm(),
    addTransfer2: () => transferForm(),
    movementHistoryToggle: () => {
      const period = $("#periodFilter");
      if (!period) return;
      period.value = period.value === "all" ? "month" : "all";
      window.CompleteUI?.clearDateRange?.();
      resetTransactionPage();
      renderTransactions();
    },
    addTransaction3: pendingForm,
    addBudget: () => collectionForm("budget"),
    addGoal: () => collectionForm("goal"),
    addAccount: () => collectionForm("account"),
    addDebt: () => collectionForm("debt"),
    addInvestment: () => collectionForm("investment"),
    addEnvelope: () => collectionForm("envelope"),
    addReserve: () => collectionForm("reserve"),
    addRule: () => collectionForm("rule"),
    makeTransfer: () => transferForm(),
    reconcileAccount: () => reconcileForm(),
    addPending: pendingForm,
    runSimulation,
    resetSimulation: resetDecisionSimulation,
    manageRecurring: () => {
      // O botão pertence ao Planeamento: abrir o formulário sem abandonar a Agenda.
      navigate("planner");
      recurringForm();
    },
    addSalaryRecurring: () => {
      // Atalho para criar uma entrada mensal de ordenado já identificada como tal.
      navigate("planner");
      if (window.FeatureUI) window.FeatureUI.recurring("__salary__");
      else recurringForm();
    },
    exportData: exportBackup,
    exportCSV,
    importData: () => $("#backupFile").click(),
    importCsv: () => {
      if (requireAccounts()) $("#csvFile").click();
    },
    importCsv2: () => {
      if (requireAccounts()) $("#csvFile").click();
    },
    resetData: () => navigate("settings"),
    settingsButton: () => navigate("settings"),
  };
  for (const [id, fn] of Object.entries(binds)) $("#" + id).onclick = fn;
  $("#simDecisionType")?.addEventListener("change", () => { updateDecisionSimulatorFields(); runSimulation(); });
  document.querySelectorAll(".decision-simulator-v25 input, .decision-simulator-v25 select").forEach((el) => {
    if (el.id !== "simDecisionType") el.addEventListener("change", runSimulation);
  });
  let movementSearchFrame = 0;
  $("#searchTransactions").oninput = () => {
    resetTransactionPage();
    cancelAnimationFrame(movementSearchFrame);
    movementSearchFrame = requestAnimationFrame(renderTransactions);
  };
  const applyMovementDateRange = () => {
    const start = $("#movementDateStart")?.value || "";
    const end = $("#movementDateEnd")?.value || "";
    if (window.CompleteUI?.setDateRange) window.CompleteUI.setDateRange(start, end);
    else { resetTransactionPage(); renderTransactions(); }
  };
  $("#movementDateStart")?.addEventListener("change", applyMovementDateRange);
  $("#movementDateEnd")?.addEventListener("change", applyMovementDateRange);
  $("#movementDateClear")?.addEventListener("click", () => {
    if ($("#movementDateStart")) $("#movementDateStart").value = "";
    if ($("#movementDateEnd")) $("#movementDateEnd").value = "";
    if (window.CompleteUI?.clearDateRange) window.CompleteUI.clearDateRange();
    else { resetTransactionPage(); renderTransactions(); }
  });
  for (const id of ["typeFilter", "accountFilter", "periodFilter"])
    $("#" + id).onchange = () => { resetTransactionPage(); renderTransactions(); };
  if ($("#transactionSort")) $("#transactionSort").onchange = (event) => {
    transactionSortMode = event.target.value || "date-desc";
    resetTransactionPage(); renderTransactions();
  };
  document.addEventListener("click", (event) => {
    const typeTab = event.target.closest("[data-tx-type-tab]");
    if (typeTab) {
      const value = typeTab.dataset.txTypeTab;
      transactionRecurringOnly = value === "recurring";
      if ($("#typeFilter")) $("#typeFilter").value = transactionRecurringOnly ? "all" : value;
      resetTransactionPage(); renderTransactions();
      return;
    }
    const filterButton = event.target.closest("[data-movement-filter]");
    if (filterButton) {
      const kind = filterButton.dataset.movementFilter, value = filterButton.dataset.value || "";
      if (kind === "account" && $("#accountFilter")) $("#accountFilter").value = value;
      if (kind === "category") transactionCategoryFilter = value;
      if (kind === "tag") transactionTagFilter = value;
      if (kind === "status") transactionStatusFilter = value || "all";
      resetTransactionPage(); renderTransactions();
      return;
    }
    const viewButton = event.target.closest("[data-movement-view]");
    if (viewButton) {
      transactionCompactView = viewButton.dataset.movementView === "compact";
      document.querySelectorAll("[data-movement-view]").forEach((button) => button.classList.toggle("active", button === viewButton));
      renderTransactions();
    }
  });
  $("#csvFile").onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) importCSV(f);
  };
  $("#backupFile").onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) restore(f);
  };
  $("#discardImports").onclick = () =>
    confirmAction(
      "Limpar revisão",
      "Apagar todos os movimentos ainda por confirmar?",
      () => (data.pendingImports = []),
    );
  $("#confirmImports").onclick = () => {
    const selected = $$("[data-import-check]:checked:not(:disabled)").map(
      (x) => x.dataset.importCheck,
    );
    if (!selected.length)
      return notice("Seleciona pelo menos um movimento.", true);
    const cats = new Map(
      $$("[data-import-category]").map((x) => [
        x.dataset.importCategory,
        x.value.trim() || "Por categorizar",
      ]),
    );
    const beneficiaries = new Map(
      $$("[data-import-beneficiary]").map((x) => [
        x.dataset.importBeneficiary,
        x.value.trim(),
      ]),
    );
    const learn = Boolean($("#learnImportRules")?.checked);
    let learnedRules = 0;
    const ok = commit(() => {
      const selectedRows = data.pendingImports.filter((t) => selected.includes(String(t.id)));
      const batch = {
        id: F.id(),
        at: new Date().toISOString(),
        name: [...new Set(selectedRows.map((t) => t.importSource || "CSV"))].join(", "),
        count: selected.length,
        format: "CSV",
      };
      const originalClosedMonths = [...data.closedMonths];
      const temporarilyOpen = new Set(selectedRows.filter((t) => t.importAllowClosedMonth).flatMap((t) => [t.date, t.type === "transfer" ? t.targetDate || t.date : t.date].map(date => date.slice(0, 7))));
      if (temporarilyOpen.size) data.closedMonths = data.closedMonths.filter((m) => !temporarilyOpen.has(m));
      const preservedBalances = new Map();
      const preserveImportedBalance = (name) => {
        const account = data.accounts.find((a) => a.name === name);
        if (!account) return false;
        const rowsForAccount = selectedRows.filter((t) => t.importPreserveBalances && (t.account === name || t.targetAccount === name));
        const reconciled = (data.reconciliations || []).some((r) => String(r.accountId || "") === String(account.id || "") || r.accountName === name);
        if (reconciled) return true;
        const marker = String(`${account.name} ${account.type || ""}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
        const savingsLike = marker.includes("poupanca") || marker.includes("savings");
        // Uma conta de poupança ainda não reconciliada é construída pelo próprio
        // histórico. Preservar cegamente o saldo neste caso anulava o crédito das
        // transferências Millennium → Poupança em cada lote importado.
        if (savingsLike && rowsForAccount.length) return false;
        return true;
      };
      for (const t of selectedRows.filter((t) => t.importPreserveBalances))
        for (const name of [t.account, t.targetAccount].filter(Boolean)) {
          const account = data.accounts.find((a) => a.name === name);
          if (account && preserveImportedBalance(name) && !preservedBalances.has(name)) preservedBalances.set(name, account.balance);
        }
      data.imports.push(batch);
      for (const t of selectedRows) {
        if (t.mmexId && data.transactions.some((x) => String(x.mmexId || "") === String(t.mmexId)))
          throw Error("Este movimento do histórico já foi importado.");
        if (
          !t.mmexId &&
          window.CompleteFinance &&
          data.transactions.some(
            (x) => CompleteFinance.signature(x) === CompleteFinance.signature(t),
          )
        )
          throw Error(
            "Existe uma linha igual já registada. Usa Conferir linhas preparadas para associar ou confirmar uma compra distinta.",
          );
        if (t.date > F.today())
          throw Error(
            "A importação contém datas futuras. Agenda esses movimentos no Planeamento.",
          );
        const category = cats.get(String(t.id)) || t.category || "Por categorizar";
        const beneficiary = beneficiaries.get(String(t.id)) ?? t.beneficiary ?? "";
        if (learn && t.type !== "transfer" && !t.splits?.length && category !== "Por categorizar" && learnImportRule(t, category, beneficiary)) learnedRules++;
        const { importSuggestion, importStatus, importMatchCount, importRuleKey, importSource, importPreserveBalances, importAllowClosedMonth, ...clean } = t;
        const prepared = {
          ...clean,
          category,
          beneficiary,
          importBatchId: batch.id,
        };
        F.importTransaction(data, prepared, { reconcile: false });
        if (beneficiary) data.savedBeneficiaries = [...new Set([...(data.savedBeneficiaries || []), beneficiary])].sort((a, b) => a.localeCompare(b, "pt"));
      }
      F.reconcileTransfers(data);
      for (const [name, balance] of preservedBalances) {
        const account = data.accounts.find((a) => a.name === name);
        if (account) F.setAccountBalance(data, account, balance);
      }
      data.closedMonths = originalClosedMonths;
      data.pendingImports = data.pendingImports.filter(
        (t) => !selected.includes(String(t.id)),
      );
    }, "Movimentos importados e histórico atualizado.");
    if (ok && learnedRules) notice(`${learnedRules} regra${learnedRules === 1 ? "" : "s"} de importação memorizada${learnedRules === 1 ? "" : "s"}.`);
  };
  $("#closeMonth").onclick = () => {
    const closed = data.closedMonths.includes(month);
    confirmAction(
      closed ? "Reabrir mês" : "Fechar mês",
      closed
        ? "Permitir alterações aos movimentos deste mês?"
        : "Os movimentos deste mês ficam protegidos contra edição, importação e eliminação. Podes reabri-lo a qualquer altura.",
      () => {
        ReconciliationModel.setMonthClosed(data, month, !closed, FinancePlus);
      },
    );
  };
  $("#undo").onclick = () => {
    if (!undoState) return;
    const previous = structuredClone(undoState);
    if (commit(() => (data = previous), "Última alteração desfeita.")) {
      undoState = null;
      $("#undo").disabled = true;
    }
  };
  $("#saveProfile").onclick = () =>
    commit(() => (data.profile = $("#profileName").value.trim()));
  $("#backupSettings").onclick = exportBackup;
  $("#restoreSettings").onclick = () => $("#backupFile").click();
  $("#rawBackup").onclick = () => {
    try {
      download(
        localStorage.getItem(key) || "{}",
        "equilibrio-original.json",
        "application/json",
      );
    } catch {
      notice("Não foi possível aceder ao armazenamento.", true);
    }
  };
  function replaceDataset(d, title) {
    form(
      title,
      "<p>Esta operação substitui os dados deste navegador. Exporta uma cópia antes de continuar.</p>",
      () => {
        const old = storageProblem;
        storageProblem = false;
        const ok = commit(() => (data = d), "Dados substituídos.");
        if (!ok) storageProblem = old;
        return ok;
      },
      "Podes desfazer imediatamente após a alteração.",
      "Substituir dados",
    );
  }
  $("#startEmpty").onclick = () =>
    replaceDataset(F.empty(), "Começar com os meus dados");
  $("#loadDemo").onclick = () =>
    replaceDataset(demoData(), "Carregar demonstração");
  $("#demoStart").onclick = $("#startEmpty").onclick;
  $("#menuToggle").onclick = () => {
    if (document.body.classList.contains("menu-open")) return closeMenu();
    document.body.classList.add("menu-open");
    $("#menuToggle").setAttribute("aria-expanded", "true");
    $(".nav-link.active")?.focus();
  };
  $("#menuBackdrop").onclick = closeMenu;
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (target)
      try {
        actions[target.dataset.action]?.(target.dataset.id || undefined);
      } catch (err) {
        notice(err.message, true);
      }
  });
  // v0.27 — anexar comprovativos diretamente por arrastar/largar sobre um movimento.
  const clearReceiptDropTargets = () =>
    document.querySelectorAll(".receipt-drop-target").forEach((el) => el.classList.remove("receipt-drop-target"));
  document.addEventListener("dragover", (e) => {
    const row = e.target.closest?.('.transaction-item[data-can-receipt="1"]');
    if (!row || !Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    clearReceiptDropTargets();
    row.classList.add("receipt-drop-target");
  });
  document.addEventListener("dragleave", (e) => {
    const row = e.target.closest?.(".receipt-drop-target");
    if (row && !row.contains(e.relatedTarget)) row.classList.remove("receipt-drop-target");
  });
  document.addEventListener("drop", async (e) => {
    const row = e.target.closest?.('.transaction-item[data-can-receipt="1"]');
    clearReceiptDropTargets();
    if (!row || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    if (e.dataTransfer.files.length > 1)
      return notice("Arrasta um comprovativo de cada vez.", true);
    const id = row.dataset.transactionId;
    const tx = find("transactions", id);
    if (!tx || !["income", "expense"].includes(tx.type)) return;
    try {
      const attachment = await attachmentFromFile(e.dataTransfer.files[0]);
      if (!attachment) throw Error("O ficheiro não pôde ser lido.");
      if (tx.attachment) {
        confirmAction(
          "Substituir comprovativo",
          `“${tx.description}” já tem um comprovativo. Queres substituí-lo por “${attachment.name}”?`,
          () => { ReceiptFinance.replaceAttachment(find("transactions",id),attachment); },
        );
      } else {
        commit(() => { ReceiptFinance.replaceAttachment(find("transactions",id),attachment); }, "Comprovativo anexado ao movimento.");
      }
    } catch (error) {
      notice(error?.message || "Não foi possível anexar o comprovativo.", true);
    }
  });
  document.addEventListener("dragend", clearReceiptDropTargets);
  window.addEventListener("storage", (e) => {
    if (e.key === key) {
      try {
        if ($("#modal").open) $("#modal").close();
        data = e.newValue ? F.normalize(JSON.parse(e.newValue)) : F.empty();
        undoState = null;
        storageProblem = false;
        window.CompleteUI?.updatedFromDisk();
        render();
        notice("Dados atualizados noutra janela.");
      } catch {
        storageProblem = true;
        notice(
          "Os dados foram alterados noutra janela mas não são válidos.",
          true,
        );
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      navigate("transactions");
      $("#searchTransactions").focus();
    }
  });
  view =
    $$(".view").find((el) => "#" + el.id === location.hash)?.id || "dashboard";
  render();
}
window.renderEquilibrio = render;
setup();
