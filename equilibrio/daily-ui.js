/* Daily workflow and local export receipts. A download receipt is not disk verification. */
(function () {
  "use strict";
  const historyKey = "equilibrioExportReceipts";
  const b = (label, action, id = "") => button(label, action, id, "secondary");
  const center = document.createElement("section");
  center.id = "backupCenter";
  center.className = "panel daily-backups";
  const automaticBackups = document.getElementById("fileProtection");
  if (automaticBackups) {
    const backupGrid = document.createElement("div");
    backupGrid.id = "settingsBackupGrid";
    backupGrid.className = "settings-backup-grid";
    automaticBackups.before(backupGrid);
    backupGrid.append(automaticBackups, center);
  } else {
    $("#settings").append(center);
  }
  const importGuide = document.createElement("section");
  importGuide.id = "importBalanceGuide";
  importGuide.className = "panel daily-import";
  $("#reviewMessage").after(importGuide);
  let generation = 0,
    pending = Promise.resolve(),
    lastStatuses = [],
    disposed = false;
  function history() {
    const raw = localStorage.getItem(historyKey),
      value = raw ? JSON.parse(raw) : {};
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.values(value).some(
        (v) =>
          !v ||
          !/^[a-f0-9]{64}$/.test(v.hash) ||
          !Number.isFinite(Date.parse(v.at)) ||
          typeof v.filename !== "string",
      )
    )
      throw Error("O registo de exportações está inválido e foi preservado.");
    return value;
  }
  async function fingerprint(source) {
    const copy = structuredClone(source);
    delete copy.lastBackup;
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .filter((k) => value[k] !== undefined)
                .map((k) => [k, canonical(value[k])]),
            )
          : value;
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(copy)));
    return Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  }
  async function prepareExport(all = false, id) {
    try {
      const entries = all
        ? LifeUI.spaces()
        : [
            id
              ? LifeUI.spaces().find((s) => s.id === id)
              : LifeUI.activeSpace(),
          ];
      if (entries.some((s) => !s)) throw Error("Espaço inexistente.");
      const snapshots = entries.map((s) => ({
          entry: s,
          data: LifeUI.readSpace(s.id),
        })),
        at = new Date().toISOString();
      const payload = all
        ? {
            format: "equilibrio-spaces",
            version: 1,
            exportedAt: at,
            backupMetadata: BackupInfo.stamp("Todos os espaços"),
            spaces: snapshots.map((s) => ({
              name: s.entry.name,
              data: s.data,
            })),
          }
        : { ...snapshots[0].data, lastBackup: at, backupMetadata: BackupInfo.stamp(snapshots[0].entry.name) };
      const content = JSON.stringify(payload, null, 2),
        filename =
          "equilibrio-" +
          (all
            ? "todos-os-espacos"
            : entries[0].name.replace(/[^a-zA-Z0-9_-]/g, "_")) +
          "-" +
          F.today() +
          ".json";
      if (new Blob([content]).size > 50 * 1024 * 1024)
        throw Error(
          "A cópia excede 50 MB. Exporta os espaços individualmente.",
        );
      const hashes = await Promise.all(
        snapshots.map((s) => fingerprint(s.data)),
      );
      download(content, filename, "application/json");
      try {
        const receipts = history();
        snapshots.forEach(
          (s, i) =>
            (receipts[s.entry.key] = {
              hash: hashes[i],
              at,
              filename,
              kind: all ? "all" : "single",
            }),
        );
        localStorage.setItem(historyKey, JSON.stringify(receipts));
        notice(
          "Exportação preparada. Confirma que o ficheiro ficou guardado na pasta escolhida.",
        );
      } catch (error) {
        notice(
          "A transferência foi iniciada, mas não foi possível registar a exportação: " +
            error.message,
          true,
        );
      }
      window.renderEquilibrio();
      return true;
    } catch (error) {
      notice(error.message, true);
      return false;
    }
  }
  let refreshQueued=false;
  function requestRefresh(){
    if(refreshQueued)return pending;
    refreshQueued=true;
    pending=new Promise(resolve=>queueMicrotask(()=>{refreshQueued=false;resolve(refresh());}));
    return pending;
  }
  async function refresh() {
    const token = ++generation;
    center.innerHTML =
      '<h2>Cópias por espaço</h2><p role="status">A verificar o estado das exportações…</p>';
    pending = (async () => {
      let receipts = {},
        historyError = "";
      try {
        receipts = history();
      } catch (error) {
        historyError = error.message;
      }
      const statuses = await Promise.all(
        LifeUI.spaces().map(async (s) => {
          try {
            const snapshot = LifeUI.readSpace(s.id),
              hash = await fingerprint(snapshot),
              receipt = receipts[s.key];
            return {
              ...s,
              receipt,
              changed: !!receipt && receipt.hash !== hash,
              accounts: snapshot.accounts.length,
              transactions: snapshot.transactions.length,
            };
          } catch (error) {
            return { ...s, error: error.message };
          }
        }),
      );
      if (disposed || token !== generation) return;
      lastStatuses = statuses;
      center.innerHTML =
        "<h2>Cópias por espaço</h2><p>O registo abaixo confirma que uma transferência foi preparada neste navegador. Confirma o ficheiro na pasta onde o guardaste. A recuperação abre uma cópia num espaço novo.</p>" +
        (historyError ? '<p role="alert">' + esc(historyError) + "</p>" : "") +
        '<div class="daily-backup-actions">' +
        b("Exportar todos", "daily-export-all") +
        b("Recuperar uma cópia", "plan-import") +
        "</div>" +
        statuses
          .map(
            (s) =>
              '<article class="daily-backup-row"><div><h3>' +
              esc(s.name) +
              "</h3><p>" +
              (s.error
                ? "Não foi possível ler este espaço: " + esc(s.error)
                : !s.receipt
                  ? "Sem exportação registada neste navegador."
                  : s.changed
                    ? "Há alterações desde a última exportação."
                    : "Sem alterações desde a exportação registada.") +
              "</p>" +
              (s.receipt
                ? '<p class="muted">' +
                  esc(new Date(s.receipt.at).toLocaleString("pt-PT")) +
                  " · " +
                  esc(s.receipt.filename) +
                  "</p>"
                : "") +
              '</div><div class="daily-backup-actions">' +
              b("Abrir espaço", "daily-open-space", s.id) +
              (!s.error
                ? b("Exportar este espaço", "daily-export-space", s.id)
                : "") +
              "</div></article>",
          )
          .join("");
      const current = statuses.find((s) => s.key === LifeUI.activeSpace().key),
        hint = $("#dailyBackupHint");
      if (hint)
        hint.textContent = current?.receipt
          ? current.changed
            ? "Tens alterações por exportar."
            : "Exportação registada: " +
              new Date(current.receipt.at).toLocaleDateString("pt-PT") +
              ". Confirma o ficheiro guardado."
          : "Ainda não há uma exportação registada deste espaço.";
    })();
    return pending;
  }
  
  function render() {
    const lifeOverview = $("#lifeOverview");
    if (lifeOverview) lifeOverview.hidden = true;
    const all = PlanningFinance.reviewInbox(data, month).active,
      indexedAttention = all.map((item, index) => ({ item, index })),
      missingReceipts = indexedAttention.filter(({ item }) => item.title === "Comprovativo em falta"),
      otherAttention = indexedAttention.filter(({ item }) => item.title !== "Comprovativo em falta"),
      host = $("#attentionPanel");
    const receiptBlock = missingReceipts.length
      ? '<div class="attention-row attention-row-grouped"><div><b>' +
        missingReceipts.length +
        ' comprovativo' +
        (missingReceipts.length === 1 ? '' : 's') +
        ' em falta</b><div class="attention-mini-list">' +
        missingReceipts.slice(0, 3).map(({ item, index }) =>
          '<div><span>' + esc(item.detail) + '</span>' + b("Rever", "daily-task", index) + '</div>'
        ).join("") +
        (missingReceipts.length > 3 ? '<small>+' + (missingReceipts.length - 3) + ' na Caixa de entrada</small>' : '') +
        '</div></div></div>'
      : '';
    const otherBlock = otherAttention
      .slice(0, missingReceipts.length ? 1 : 2)
      .map(({ item, index }) =>
        '<div class="attention-row"><div><b>' + esc(item.title) + '</b><p>' + esc(item.detail) + '</p></div>' +
        b("Rever", "daily-task", index) + '</div>'
      ).join("");
    host.innerHTML =
      '<div class="section-head"><h2>A tratar</h2><span>' + all.length + ' pontos</span></div>' +
      (receiptBlock + otherBlock || "<p>Não há pendências detetadas neste momento.</p>") +
      '<div class="daily-backup-actions">' +
      b("Ver caixa de entrada", "life-navigate", "inboxHub") +
      b("Rever a semana", "life-navigate", "weeklyHub") +
      b("Ver cópias", "daily-backups") +
      '</div><p class="muted" id="dailyBackupHint"></p>';

    const pay = PlanningFinance.payday(data);
    $("#decisionPanel").hidden = !!pay;
    $("#salaryPlan").hidden = !pay;
    if (pay) {
      const salaryPanel = $("#salaryPlan");
      const explain = salaryPanel?.querySelector('[data-action="plan-explain"]');
      if (salaryPanel && explain) {
        const actions = document.createElement("div");
        actions.className = "salary-bottom-actions";
        explain.before(actions);
        actions.append(explain);
        actions.insertAdjacentHTML(
          "beforeend",
          b("Definir data", "plan-payday") +
            b("Simular uma decisão", "daily-simulate") +
            b("Definir margem", "daily-margin"),
        );
        const headingPayday = salaryPanel.querySelector('.planning-heading [data-action="plan-payday"]');
        if (headingPayday) headingPayday.remove();
      }
    }
    else
      $("#decisionPanel .decision-actions").insertAdjacentHTML(
        "beforeend",
        '<button type="button" class="link-button" data-action="plan-payday">Usar a data do salário</button>',
      );
    const old = $("#spacesPortability");
    if (old) old.hidden = true;
    for (const id of ["backupReminder"])
      if ($("#" + id)) $("#" + id).hidden = true;
    renderImport();
    if(view==='dashboard'||view==='settings')requestRefresh();
  }
  function renderImport() {
    const ids = new Set(
      $$("[data-import-check]:checked").map((x) => x.dataset.importCheck),
    );
    const selected = data.pendingImports.filter((t) => ids.has(String(t.id)));
    importGuide.hidden = !data.pendingImports.length;
    try {
      const impact = PlanningFinance.importImpact(data, selected);
      importGuide.innerHTML =
        "<h3>Antes de confirmar: o que muda no saldo?</h3><p>" +
        selected.length +
        " movimentos selecionados.</p>" +
        impact
          .map(
            (a) =>
              "<p><b>" +
              esc(a.name) +
              "</b>: " +
              eur(a.before) +
              " + (" +
              eur(a.delta) +
              ") = <b>" +
              eur(a.after) +
              "</b></p>",
          )
          .join("") +
        "<details><summary>Introduzi o saldo atual do banco. Posso importar o histórico?</summary><p>Se esse saldo já inclui os movimentos do ficheiro, a importação volta a aplicar esses valores. Depois de importar, usa Confirmar saldo em Contas e compara com o banco. Se estás a começar a partir de um saldo histórico, usa o saldo imediatamente anterior ao primeiro movimento importado.</p><p>Exemplo: saldo introduzido de 1 000 € e uma despesa importada de 100 € resultam em 900 €. Se o banco já mostrava 1 000 € depois dessa despesa, confirma novamente o saldo após a importação.</p></details>";
    } catch (error) {
      importGuide.innerHTML =
        "<h3>Rever seleção</h3><p>" + esc(error.message) + "</p>";
    }
  }
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-import-check]")) renderImport();
  });
  Object.assign(actions, {
    "daily-first-transaction": () => transactionForm(),
    "daily-task": (i) => {
      const t = PlanningFinance.reviewInbox(data, month).active[+i];
      if (t?.action) actions[t.action](t.id);
      else if (t) navigate(t.route);
    },
    "daily-backups": () => {
      navigate("settings");
      center.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "daily-export-all": () => prepareExport(true),
    "plan-export": () => prepareExport(true),
    "daily-export-space": (id) => prepareExport(false, id),
    "daily-open-space": (id) => LifeUI.switchSpace(id),
    "daily-simulate": () => $("#simulateDecision").click(),
    "daily-margin": () => $("#adjustMargin").click(),
  });
  $("#importData").onclick = () => actions["plan-import"]();
  $("#restoreSettings").onclick = () => actions["plan-import"]();
  const previous = PremiumUI.render;
  PremiumUI.render = () => {
    previous();
    render();
  };
  const backupNavigation=PremiumUI.navigation;PremiumUI.navigation=v=>{backupNavigation?.(v);if(v==='dashboard'||v==='settings')requestRefresh();};
  window.DailyUI = {
    lastExport: (spaceKey) => {
      try {
        return history()[spaceKey]?.at;
      } catch {
        return undefined;
      }
    },
    exportActive: () => prepareExport(false),
    prepareExport,
    fingerprint,
    refresh,
    requestRefresh,
    renderImport,
    settled: () => pending,
    statuses: () => lastStatuses,
    dispose: () => {
      disposed = true;
      generation++;
    },
  };
  if (!window.equilibrioStartup?.awaitingChoice) render();
})();

/* Reviews reuse ledger evidence and never post payments or investment orders. */
(function () {
  "use strict";
  const Q = PlanningFinance,
    P = FinancePlus;
  const b = (label, action, id = "", cls = "secondary") =>
    button(label, action, id, cls);
  const weekly = document.createElement("section");
  weekly.id = "weeklyHub";
  weekly.className = "view review-page";
  $("#mainContent").append(weekly);
  PremiumUI.addPage("Resumo", "weeklyHub", "Revisão");

  const metric = (label, value, detail) =>
    '<article class="review-metric"><span>' +
    label +
    '</span><strong class="amount">' +
    eur(value) +
    "</strong><small>" +
    detail +
    "</small></article>";
  const card = (title, content) =>
    '<section class="panel review-card"><h3>' +
    title +
    "</h3>" +
    content +
    "</section>";
  let active = [],
    deferred = [],
    inboxKindFilter = "all",
    inboxSourceFilter = "all",
    inboxQuery = "",
    inboxSort = "priority";
  const inboxFold = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  function inboxMeta(item, index) {
    const tx = item.id
      ? data.transactions.find((t) => String(t.id) === String(item.id))
      : null;
    const account = item.id
      ? data.accounts.find((a) => String(a.id) === String(item.id))
      : null;
    const title = String(item.title || "");
    const titleFold = inboxFold(title);
    let kind = "other",
      state = "Por rever",
      suggestion = "Rever registo";
    if (titleFold.includes("categorizar")) {
      kind = "uncategorized";
      state = "Por categorizar";
      suggestion = "Escolher categoria";
    } else if (titleFold.includes("duplicado") || titleFold.includes("transferencias")) {
      kind = "duplicate";
      state = "Possível duplicado";
      suggestion = "Comparar movimentos";
    } else if (titleFold.includes("comprovativo") || titleFold.includes("diferenca")) {
      kind = "attention";
      state = "Atenção";
      suggestion = titleFold.includes("comprovativo") ? "Anexar comprovativo" : "Conferir valores";
    } else if (titleFold.startsWith("confirmar ")) {
      kind = "other";
      state = "Confirmar saldo";
      suggestion = "Atualizar confirmação";
    } else if (titleFold.includes("importacao") || titleFold.includes("extrato")) {
      kind = "other";
      state = "Importação";
      suggestion = "Conferir importação";
    }
    const source = tx?.account || account?.name || (item.route === "review" ? "Ficheiros importados" : "Outras fontes");
    const description = tx?.description || tx?.beneficiary || title;
    const date = tx?.date || account?.reconciledOn || "";
    let signedValue = null;
    if (tx && Number.isFinite(Number(tx.amount))) {
      const positive = tx.type === "income" || !!tx.refundOf;
      signedValue = (positive ? 1 : -1) * Number(tx.amount);
    } else if (account && Number.isFinite(Number(account.balance))) signedValue = Number(account.balance);
    const search = inboxFold([title, item.detail, description, source, state, suggestion].join(" "));
    return { item, index, tx, account, kind, state, suggestion, source, sourceKey: inboxFold(source), description, date, signedValue, search };
  }
  function applyInboxView() {
    const host = document.getElementById("dataInboxTableBody");
    if (!host) return;
    let visible = 0;
    host.querySelectorAll("[data-inbox-row]").forEach((row) => {
      const kindOk = inboxKindFilter === "all" || row.dataset.kind === inboxKindFilter;
      const sourceOk = inboxSourceFilter === "all" || row.dataset.source === inboxSourceFilter;
      const queryOk = !inboxQuery || row.dataset.search.includes(inboxFold(inboxQuery));
      row.hidden = !(kindOk && sourceOk && queryOk);
      if (!row.hidden) visible += 1;
    });
    const empty = document.getElementById("dataInboxEmpty");
    if (empty) empty.hidden = visible !== 0;
    window.UnifiedWorkspaceUI?.enhanceInbox?.();
    document.querySelectorAll("[data-inbox-filter]").forEach((button) =>
      button.classList.toggle("active", button.dataset.inboxFilter === inboxKindFilter),
    );
    document.querySelectorAll("[data-inbox-source]").forEach((button) =>
      button.classList.toggle("active", button.dataset.inboxSource === inboxSourceFilter),
    );
  }
  function wireInboxView() {
    document.querySelectorAll("[data-inbox-filter]").forEach((button) => {
      button.onclick = () => {
        inboxKindFilter = button.dataset.inboxFilter || "all";
        applyInboxView();
      };
    });
    document.querySelectorAll("[data-inbox-source]").forEach((button) => {
      button.onclick = () => {
        inboxSourceFilter = button.dataset.inboxSource || "all";
        applyInboxView();
      };
    });
    const search = document.getElementById("dataInboxSearch");
    if (search) {
      search.value = inboxQuery;
      search.oninput = () => {
        inboxQuery = search.value;
        applyInboxView();
      };
    }
    const sort = document.getElementById("dataInboxSort");
    if (sort) {
      sort.value = inboxSort;
      sort.onchange = () => {
        inboxSort = sort.value;
        renderInbox();
      };
    }
    applyInboxView();
  }
  function renderInbox() {
    const metas = active.map(inboxMeta);
    const priority = { duplicate: 0, attention: 1, uncategorized: 2, other: 3 };
    const ordered = metas.slice().sort((a, b) => {
      if (inboxSort === "description") return a.description.localeCompare(b.description, "pt");
      if (inboxSort === "date") return String(b.date || "").localeCompare(String(a.date || ""));
      return (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9) || String(b.date || "").localeCompare(String(a.date || ""));
    });
    const kindDefs = [
      ["all", "Todos"],
      ["uncategorized", "Por categorizar"],
      ["duplicate", "Duplicados"],
      ["attention", "Suspeitos"],
      ["other", "Outros"],
    ];
    const kindCount = (key) => key === "all" ? metas.length : metas.filter((m) => m.kind === key).length;
    const sourceMap = new Map();
    metas.forEach((m) => sourceMap.set(m.source, (sourceMap.get(m.source) || 0) + 1));
    const sources = [...sourceMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt"));
    const sourceTone = (name) => {
      let hash = 0;
      for (const ch of String(name || "")) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
      return Math.abs(hash) % 5;
    };
    const sourceIcon = (name) => {
      const clean = String(name || "").trim();
      if (/ficheiro|import/i.test(clean)) return "⇧";
      if (/todas/i.test(clean)) return "◉";
      return (clean[0] || "?").toUpperCase();
    };
    const rows = ordered.map((m) => {
      const value = m.signedValue === null
        ? '<span class="data-inbox-value muted">—</span>'
        : '<strong class="data-inbox-value ' + (m.signedValue >= 0 ? 'positive' : 'negative') + '">' + (m.signedValue > 0 ? '+' : m.signedValue < 0 ? '−' : '') + eur(Math.abs(m.signedValue)) + '</strong>';
      const date = m.date ? dateLabel(m.date) : "—";
      const stateClass = "state-" + m.kind;
      return '<div class="data-inbox-tr" data-inbox-row data-kind="' + esc(m.kind) + '" data-source="' + esc(m.sourceKey) + '" data-search="' + esc(m.search) + '">' +
        '<div class="data-inbox-cell data-inbox-select"><span aria-hidden="true"></span></div>' +
        '<div class="data-inbox-cell data-inbox-date">' + esc(date) + '</div>' +
        '<div class="data-inbox-cell data-inbox-description"><b>' + esc(m.description) + '</b><small>' + esc(m.item.detail || m.item.title) + '</small><span class="data-inbox-inline-source">' + esc(m.source) + '</span><span class="data-inbox-inline-suggestion">' + esc(m.suggestion) + '</span></div>' +
        '<div class="data-inbox-cell">' + value + '</div>' +
        '<div class="data-inbox-cell data-inbox-source">' + esc(m.source) + '</div>' +
        '<div class="data-inbox-cell"><span class="data-state ' + stateClass + '">' + esc(m.state) + '</span></div>' +
        '<div class="data-inbox-cell data-inbox-suggestion">' + esc(m.suggestion) + '</div>' +
        '<div class="data-inbox-cell data-inbox-actions">' +
          b("Resolver", "review-resolve", m.index, "data-icon-button") +
          '<details class="data-row-menu"><summary aria-label="Mais opções">•••</summary><div>' +
            b("Adiar", "review-snooze", m.index, "link-button") +
            b("Dispensar", "review-dismiss", m.index, "link-button") +
          '</div></details>' +
        '</div></div>';
    }).join("");
    const deferredHtml = deferred.map((item, i) =>
      '<div class="review-line"><div><b>' + esc(item.title) + '</b><p>' +
      (item.state.mode === "snoozed" ? "Volta em " + dateLabel(item.state.until) : "Dispensado enquanto a situação se mantiver") +
      '</p></div>' + b("Voltar a mostrar", "review-restore", i) + '</div>'
    ).join("") || '<p class="muted">Nenhum aviso nesta lista.</p>';
    const deferredCountLabel = deferred.length + ' ' + (deferred.length === 1 ? 'item fora da lista ativa' : 'itens fora da lista ativa');
    $("#inboxHub").innerHTML =
      '<div class="data-section-heading data-inbox-heading"><div class="data-section-title"><span class="data-section-icon">⇧</span><div><h2>Caixa de entrada <span class="data-title-count">' + active.length + '</span></h2><p>Revê, categoriza e resolve as pendências detetadas nos teus dados.</p></div></div></div>' +
      '<div class="data-inbox-filterbar">' + kindDefs.map(([key, label]) => '<button type="button" class="data-filter-chip" data-inbox-filter="' + key + '">' + label + '<span>' + kindCount(key) + '</span></button>').join("") + '</div>' +
      '<div class="data-inbox-layout"><aside class="data-inbox-sources"><h3>Fontes</h3>' +
        '<button type="button" class="data-source-button" data-inbox-source="all"><span class="data-source-label"><i class="data-source-avatar source-tone-all">◉</i><span>Todas</span></span><b>' + metas.length + '</b></button>' +
        sources.map(([name, count]) => '<button type="button" class="data-source-button" data-inbox-source="' + esc(inboxFold(name)) + '"><span class="data-source-label"><i class="data-source-avatar source-tone-' + sourceTone(name) + '">' + esc(sourceIcon(name)) + '</i><span>' + esc(name) + '</span></span><b>' + count + '</b></button>').join("") +
        '</aside><div class="data-inbox-main"><div class="data-inbox-toolbar"><label class="data-search-field"><span>⌕</span><input id="dataInboxSearch" type="search" placeholder="Pesquisar na caixa de entrada…" autocomplete="off"></label><label class="data-sort-field"><span>Ordenar por</span><select id="dataInboxSort"><option value="priority">Prioridade</option><option value="date">Data</option><option value="description">Descrição</option></select></label></div>' +
        '<div class="data-inbox-table"><div class="data-inbox-th"><span></span><span>Data</span><span>Descrição</span><span>Valor</span><span>Fonte</span><span>Estado</span><span>Sugestão</span><span>Ações</span></div><div id="dataInboxTableBody">' + rows + '</div><div id="dataInboxEmpty" class="data-table-empty" hidden>Nenhum item corresponde aos filtros escolhidos.</div></div></div></div>' +
      '<details class="data-deferred data-deferred-archive"><summary><span class="deferred-archive-icon" aria-hidden="true">↶</span><span class="data-deferred-copy"><b>Adiados e dispensados</b><small>' + esc(deferredCountLabel) + '</small></span><span class="data-deferred-count">' + deferred.length + '</span></summary><div class="deferred-archive-content">' + deferredHtml + '</div></details>';
    wireInboxView();
    window.UnifiedWorkspaceUI?.enhanceInbox?.();
  }
  function render() {
    const inbox = Q.reviewInbox(data, month);
    active = inbox.active;
    deferred = inbox.deferred;
    renderInbox();
    window.DataHub?.refresh?.();
    const w = Q.weekly(data),
      hasPrevious = w.previous.transactions.length > 0;
    const todaySaved = data.forecastReviews.some((r) => r.date === F.today());
    const previousExpense = Number(w.previous.expense || 0);
    const currentExpense = Number(w.current.expense || 0);
    const expenseDeltaPct = hasPrevious && previousExpense > 0
      ? Math.round(((currentExpense - previousExpense) / previousExpense) * 100)
      : null;
    const weekTone = !w.current.transactions.length
      ? "quiet"
      : !hasPrevious
        ? "neutral"
        : w.change < -5
          ? "good"
          : w.change > 5
            ? "watch"
            : "neutral";
    const weekVerdict = !w.current.transactions.length
      ? "Semana tranquila"
      : !hasPrevious
        ? "Semana registada"
        : w.change < -5
          ? "Semana controlada"
          : w.change > 5
            ? "Semana a vigiar"
            : "Semana estável";
    const weekVerdictDetail = !w.current.transactions.length
      ? "Ainda não há movimentos suficientes para tirar conclusões úteis."
      : expenseDeltaPct === null
        ? "Já tens uma base desta semana para comparar nas próximas revisões."
        : expenseDeltaPct === 0
          ? "A despesa ficou ao mesmo nível dos sete dias anteriores."
          : `Despesas ${Math.abs(expenseDeltaPct)}% ${expenseDeltaPct < 0 ? "abaixo" : "acima"} da semana anterior.`;

    const categoryTotals = (entries) => {
      const totals = new Map();
      entries.forEach((entry) => {
        const category = entry.category || "Sem categoria";
        totals.set(category, F.money((totals.get(category) || 0) + Number(entry.amount || 0)));
      });
      return totals;
    };
    const currentCategoryTotals = categoryTotals(w.current.expenses);
    const previousCategoryTotals = categoryTotals(w.previous.expenses);
    const risingCategory = [...currentCategoryTotals.entries()]
      .map(([category, amount]) => ({
        category,
        amount,
        delta: F.money(amount - Number(previousCategoryTotals.get(category) || 0)),
      }))
      .filter((entry) => entry.delta > 0.01)
      .sort((a, b) => b.delta - a.delta)[0] || null;
    const topCategory = [...currentCategoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)[0] || null;
    const weekNet = F.money(Number(w.current.income || 0) - Number(w.current.expense || 0));
    const upcomingExpenses = F.money((w.upcoming || [])
      .filter((item) => item.type !== "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0));
    const weekChangeLabel = expenseDeltaPct === null
      ? "Sem comparação"
      : expenseDeltaPct === 0
        ? "Igual à anterior"
        : `${Math.abs(expenseDeltaPct)}% ${expenseDeltaPct < 0 ? "abaixo" : "acima"}`;

    const capitalize = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
    const weekday = (date, format = "long") => capitalize(new Date(date + "T12:00:00").toLocaleDateString("pt-PT", { weekday: format }));
    const shortDate = (date) => new Date(date + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
    const timelineDates = Array.from({ length: 7 }, (_, index) => P.dayAdd(w.from, index));
    const timelineHtml = timelineDates.map((date) => {
      const txs = w.current.transactions.filter((t) => t.date === date);
      const expenses = w.current.expenses.filter((t) => t.date === date);
      const dayIncome = F.money(txs
        .filter((t) => t.type === "income" && !t.refundOf)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0));
      const dayExpense = F.money(expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0));
      const dayNet = F.money(dayIncome - dayExpense);
      const biggest = expenses.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
      let tone = "neutral", icon = "—", summary = "Sem movimentos relevantes.";
      if (dayIncome > 0 && dayExpense === 0) {
        tone = "good";
        icon = "↑";
        summary = `Entradas de ${eur(dayIncome)}.`;
      } else if (dayExpense > 0 && dayIncome === 0) {
        tone = "watch";
        icon = "↓";
        summary = `${biggest?.description || biggest?.beneficiary || "Despesa"} · −${eur(dayExpense)}.`;
      } else if (dayIncome > 0 || dayExpense > 0) {
        tone = dayNet >= 0 ? "good" : "watch";
        icon = "↕";
        summary = `Entradas ${eur(dayIncome)} · saídas ${eur(dayExpense)}.`;
      }
      return '<article class="review30-day review30-tone-' + tone + (date === w.end ? ' is-current' : '') + '">' +
        '<div class="review30-day-node"><span>' + icon + '</span></div>' +
        '<p class="review30-day-date">' + esc(weekday(date, "short").replace(".", "")) + ' ' + esc(shortDate(date)) + '</p>' +
        '<div class="review30-day-card"><b>' + esc(weekday(date)) + '</b><span>' + esc(summary) + '</span></div>' +
      '</article>';
    }).join("");

    const improvedText = !hasPrevious
      ? "Ainda não existe uma semana anterior comparável."
      : currentExpense < previousExpense
        ? `Despesas ${Math.abs(expenseDeltaPct || 0)}% abaixo da semana anterior.`
        : currentExpense === previousExpense
          ? "Despesa total ao mesmo nível da semana anterior."
          : "Não houve redução da despesa face à semana anterior.";
    const worsenedText = risingCategory
      ? `${risingCategory.category} subiu ${eur(risingCategory.delta)} face à semana anterior.`
      : currentExpense > previousExpense
        ? `A despesa total subiu ${Math.abs(expenseDeltaPct || 0)}% face à semana anterior.`
        : "Nenhuma categoria aumentou de forma relevante.";
    const pendingText = active.length
      ? `${active.length} ${active.length === 1 ? "assunto por tratar" : "assuntos por tratar"} na caixa de entrada.`
      : "Sem pendências abertas na caixa de entrada.";

    const attentionIcon = (item) => {
      const text = (item?.title || "").toLowerCase();
      if (text.includes("duplicado")) return "⧉";
      if (text.includes("categor")) return "◇";
      if (text.includes("subscr")) return "▤";
      if (text.includes("saldo") || text.includes("confirmar")) return "▰";
      if (text.includes("atraso") || text.includes("falta")) return "!";
      return "•";
    };
    const attentionHtml = active.slice(1, 4).map((item, offset) =>
      '<button type="button" class="review30-attention-row" data-action="review-resolve" data-id="' + (offset + 1) + '">' +
        '<span class="review30-attention-icon">' + attentionIcon(item) + '</span>' +
        '<span><b>' + esc(item.title) + '</b><small>' + esc(item.detail || "Abre para rever esta situação.") + '</small></span>' +
        '<i aria-hidden="true">›</i>' +
      '</button>'
    ).join("") || '<div class="review30-empty-good"><span>✓</span><div><b>Sem outras ações urgentes</b><small>A ação prioritária está no Próximo passo.</small></div></div>';

    const nextUpcoming = w.upcoming[0] || null;
    const nextStepHtml = active[0]
      ? '<div class="review30-next-step-card"><span class="review30-next-icon">' + attentionIcon(active[0]) + '</span><div><b>' + esc(active[0].title) + '</b><p>' + esc(active[0].detail || "Resolve esta pendência para manter os dados em ordem.") + '</p></div>' + button("Tratar agora", "review-resolve", "0", "primary") + '</div>'
      : nextUpcoming
        ? '<div class="review30-next-step-card"><span class="review30-next-icon">▣</span><div><b>Preparar ' + esc(nextUpcoming.description || "o próximo compromisso") + '</b><p>' + dateLabel(nextUpcoming.date) + ' · ' + (nextUpcoming.type === "income" ? "+" : "−") + eur(nextUpcoming.amount) + '.</p></div>' + button("Abrir planeamento", "life-navigate", "planner", "primary") + '</div>'
        : !todaySaved
          ? '<div class="review30-next-step-card"><span class="review30-next-icon">↗</span><div><b>Guardar a previsão de sete dias</b><p>Cria um ponto de comparação para veres depois se a semana correu como esperavas.</p></div>' + button("Guardar previsão", "review-save-forecast", "", "primary") + '</div>'
          : '<div class="review30-next-step-card"><span class="review30-next-icon">✓</span><div><b>Está tudo tratado por agora</b><p>A previsão está guardada e não há pendências ativas.</p></div>' + button("Abrir planeamento", "life-navigate", "planner", "secondary") + '</div>';

    weekly.innerHTML =
      '<section class="review30-hero review30-tone-' + weekTone + '">' +
        '<div class="review30-hero-title"><p class="eyebrow">Revisão semanal</p><h2>A tua semana</h2><p>' +
          dateLabel(w.from) + ' — ' + dateLabel(w.end) + '</p></div>' +
        '<div class="review30-verdict"><span class="review30-verdict-icon">▥</span><div><b>' + esc(weekVerdict) + '</b><p>' + esc(weekVerdictDetail) + '</p></div></div>' +
        '<div class="review30-hero-action">' + button("Ver pendências →", "life-navigate", "inboxHub", "secondary") + '</div>' +
      '</section>' +
      '<div class="review30-kpi-strip" aria-label="Resumo da semana">' +
        '<article><span>Entradas</span><strong class="positive">' + eur(w.current.income || 0) + '</strong><small>' + w.current.transactions.filter((t) => t.type === "income" && !t.refundOf).length + ' movimentos</small></article>' +
        '<article><span>Despesas</span><strong class="negative">' + eur(w.current.expense || 0) + '</strong><small>' + esc(weekChangeLabel) + '</small></article>' +
        '<article><span>Saldo da semana</span><strong class="' + (weekNet >= 0 ? 'positive' : 'negative') + '">' + eur(weekNet) + '</strong><small>entradas menos despesas</small></article>' +
        '<article><span>Maior categoria</span><strong>' + (topCategory ? eur(topCategory.amount) : '—') + '</strong><small>' + esc(topCategory?.category || 'Sem despesas registadas') + '</small></article>' +
        '<article><span>Próximos 7 dias</span><strong>' + eur(upcomingExpenses) + '</strong><small>saídas previstas</small></article>' +
      '</div>' +
      '<div class="review30-main-grid">' +
        '<section class="panel review30-timeline-panel"><div class="review30-section-head"><div><p class="eyebrow">Como correu a semana</p><h3>Os principais momentos, num olhar</h3></div></div><div class="review30-timeline">' + timelineHtml + '</div></section>' +
        '<section class="panel review30-conclusions"><div class="review30-section-head"><div><p class="eyebrow">Conclusões da semana</p><h3>O que realmente importa</h3></div></div>' +
          '<div class="review30-conclusion-row good"><span>↑</span><div><b>O que melhorou</b><p>' + esc(improvedText) + '</p></div></div>' +
          '<div class="review30-conclusion-row watch"><span>↓</span><div><b>O que piorou</b><p>' + esc(worsenedText) + '</p></div></div>' +
          '<div class="review30-conclusion-row neutral"><span>—</span><div><b>O que fica pendente</b><p>' + esc(pendingText) + '</p></div></div>' +
        '</section>' +
      '</div>' +
      '<div class="review30-bottom-grid">' +
        '<section class="panel review30-attention"><div class="review30-section-head"><div><p class="eyebrow">Pendências</p><h3>O que ainda precisa da tua atenção</h3></div>' +
          (active.length > 4 ? button("Ver todas", "life-navigate", "inboxHub", "secondary") : '') + '</div><div class="review30-attention-list">' + attentionHtml + '</div></section>' +
        '<section class="panel review30-next"><div class="review30-section-head"><div><p class="eyebrow">Próximo passo</p><h3>A ação mais útil agora</h3></div></div>' + nextStepHtml +
          '<p class="review30-footnote">A revisão semanal destaca apenas mudanças e decisões relevantes; o detalhe continua em Movimentos, Planeamento e Análises.</p></section>' +
      '</div>';
    document.querySelectorAll('#weeklyReviewBody').forEach((n)=>n.remove());// a versão anterior pode ter sido movida para outro painel
    const weeklyBody=document.createElement('div');weeklyBody.id='weeklyReviewBody';
    while(weekly.firstChild)weeklyBody.append(weekly.firstChild);weekly.append(weeklyBody);
    const conclusion = data.monthlyConclusions.find((r) => r.month === month);
    $("#monthlyConclusion")?.remove();
    $("#reviewConclusionSlot").insertAdjacentHTML(
      "beforeend",
      '<div id="monthlyConclusion">' +
        (conclusion
          ? '<p class="preserve-lines">' +
            esc(conclusion.summary) +
            '</p><h4>Para o próximo mês</h4><p class="preserve-lines">' +
            esc(conclusion.next || "Sem ações definidas.") +
            "</p>"
          : "<p>Regista o que correu bem, o que precisa de mudar e uma ação concreta para o próximo mês.</p>") +
        "</div>",
    );
    const balanceAction = $("#reviewBalanceAction");
    if (balanceAction)
      balanceAction.innerHTML = b(
        conclusion ? "Editar balanço" : "Guardar balanço",
        "review-month-note",
      );
  }
  
  
  function manage(i, mode) {
    const item = active[+i];
    if (!item) return;
    form(
      mode === "snoozed" ? "Adiar aviso" : "Dispensar aviso",
      "<p>" +
        esc(item.title) +
        "</p>" +
        (mode === "snoozed"
          ? field(
              "Voltar a mostrar em",
              "until",
              P.dayAdd(F.today(), 7),
              "date",
              "required",
            )
          : "<p>Podes voltar a mostrá-lo na lista de avisos dispensados. Se a situação mudar, o novo aviso aparece automaticamente.</p>"),
      (f) =>
        commit(
          () => {
            if (!Q.inbox(data, month).some((r) => r.token === item.token))
              throw Error(
                "Esta situação já mudou. Fecha o formulário e consulta a lista atual.",
              );
            Q.reviewReminder(data, item, mode, f.get("until"));
          },
          mode === "snoozed" ? "Aviso adiado." : "Aviso dispensado.",
        ),
      "Esta ação organiza os avisos; não resolve nem altera os registos.",
      mode === "snoozed" ? "Adiar" : "Dispensar",
    );
  }
  Object.assign(actions, {
    "review-week-movements": () => {
      const w = Q.weekly(data);
      CompleteUI.reviewRange(w.from, w.end);
    },
    "review-category-movements": (category) =>
      CompleteUI.reviewRange(month + "-01", F.dateAt(month, 31), category),
    "review-resolve": (i) => {
      const item = active[+i];
      if (item?.action) actions[item.action](item.id);
      else if (item) navigate(item.route);
    },
    "review-snooze": (i) => manage(i, "snoozed"),
    "review-dismiss": (i) => manage(i, "dismissed"),
    "review-restore": (i) => {
      const item = deferred[+i];
      if (item)
        commit(() => {
          data.reminderReviews = data.reminderReviews.filter(
            (r) => r.id !== item.state.id,
          );
        }, "Aviso novamente visível.");
    },
    "review-save-forecast": () =>
      commit(
        () => Q.saveForecast(data),
        "Previsão guardada para comparar daqui a sete dias.",
      ),
    "review-month-note": () => {
      const selectedMonth = month,
        note = data.monthlyConclusions.find((r) => r.month === selectedMonth);
      form(
        "Balanço de " + esc(monthLabel(selectedMonth)),
        '<label>O que aprendeste este mês?<textarea name="summary" required maxlength="2000" rows="4">' +
          esc(note?.summary || "") +
          '</textarea></label><label>Próximos passos<textarea name="next" maxlength="2000" rows="3">' +
          esc(note?.next || "") +
          "</textarea></label>",
        (f) =>
          commit(() => {
            const record = {
              id: note?.id || F.id(),
              month: selectedMonth,
              summary: f.get("summary").trim(),
              next: f.get("next").trim(),
            };
            data.monthlyConclusions = data.monthlyConclusions.filter(
              (r) => r.month !== selectedMonth,
            );
            data.monthlyConclusions.push(record);
          }, "Balanço mensal guardado."),
        "As notas não alteram os valores nem fecham o mês.",
      );
    },
  });
  const prior = PremiumUI.render;
  PremiumUI.render = () => {
    prior();
    render();
  };
  window.ReviewUI = { render };
  if (!window.equilibrioStartup?.awaitingChoice) render();
  if (window.equilibrioInitialRoute === "weeklyHub") navigate("weeklyHub");
})();

/* A compact working surface: decisions beside the tasks they lead to. */
(function () {

  const Q = PlanningFinance;
  function backupComparison(copy) {
    const result = Q.compareBackup(data, copy);
    const period = (range) =>
      range
        ? `${dateLabel(range.from)} a ${dateLabel(range.to)}`
        : "Sem movimentos";
    return `<details class="workflow-detail"><summary>Ver diferenças face ao espaço aberto</summary><p>${result.added} movimentos só na cópia · ${result.removed} só no espaço atual · ${result.changed} com conteúdo diferente.</p><p>Atual: ${period(result.currentRange)}<br>Cópia: ${period(result.copyRange)}</p><div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Conta</th><th>Atual</th><th>Na cópia</th></tr></thead><tbody>${result.accounts.map((a) => `<tr><th>${esc(a.name)}${a.previousName && a.previousName !== a.name ? `<small>Antes: ${esc(a.previousName)}</small>` : ""}</th><td>${a.before === null ? "—" : eur(a.before)}</td><td>${a.after === null ? "—" : eur(a.after)}</td></tr>`).join("")}</tbody></table></div>${[
      ["added", "Só na cópia"],
      ["removed", "Só no espaço atual"],
      ["changed", "Conteúdo diferente"],
    ]
      .map(([key, label]) =>
        result.samples[key].length
          ? `<p><b>${label} — até 10 exemplos</b></p><ul>${result.samples[key].map((t) => `<li>${dateLabel(t.date)} · ${esc(t.description)} · ${eur(t.amount)}</li>`).join("")}</ul>`
          : "",
      )
      .join(
        "",
      )}<p class="muted">Os movimentos são comparados pelo identificador guardado. As contas são associadas pelo identificador ou pelo nome. Esta comparação não altera dados.</p></details>`;
  }
  function renderImport() {
    const overlaps = Q.importOverlap(data, data.pendingImports);
    for (const match of overlaps) {
      const check = Array.from(
        document.querySelectorAll("[data-import-check]"),
      ).find((el) => el.dataset.importCheck === String(match.row.id));
      const container = check?.closest(".import-row");
      if (!container || container.dataset.overlapDecorated) continue;
      container.dataset.overlapDecorated = "true";
      if (match.status === "new") continue;
      if (match.status === "duplicate") check.checked = false;
      const detail = document.createElement("details");
      detail.className = "import-comparison workflow-detail";
      const candidates = [
        ...match.matches,
        ...(match.repeated
          ? [{ ...match.repeated, overlapOrigin: "Repetido neste extrato" }]
          : []),
      ];
      detail.innerHTML = `<summary>${match.status === "duplicate" ? "Coincidência encontrada — não selecionada" : "Valor igual numa data próxima — confirmar"}</summary><p>Novo: ${dateLabel(match.row.date)} · ${esc(match.row.description)} · ${eur(match.row.amount)} · ${esc(match.row.account)}</p>${candidates.map((t) => `<p><b>${esc(t.overlapOrigin)}</b><br>${dateLabel(t.date)} · ${esc(t.description)} · ${eur(t.amount)} · ${esc(t.account)}</p>`).join("")}<p class="muted">${match.status === "duplicate" ? "Seleciona apenas se confirmaste que é outro movimento." : "Uma semelhança não prova que seja um duplicado. Confirma no extrato antes de importar."}</p>`;
      container.append(detail);
    }
    window.DailyUI?.renderImport();
  }

  let agendaLayout=innerWidth<600?'list':'calendar',agendaStatus='all',agendaDay='',agendaPageScope='',agendaListPage=0,agendaDayPage=0;
  function agendaPager(kind,total,page){const pages=Math.ceil(total/50);return pages>1?'<nav class="ex-agenda-pager" aria-label="Páginas de compromissos"><button type="button" class="secondary" data-agenda-page="'+kind+'-prev" '+(!page?'disabled':'')+'>Anterior</button><span>'+String(page*50+1)+'–'+Math.min(total,(page+1)*50)+' de '+total+'</span><button type="button" class="secondary" data-agenda-page="'+kind+'-next" '+(page>=pages-1?'disabled':'')+'>Seguinte</button></nav>':'';}
  function renderAgenda() {
    const host=document.querySelector('#paymentCalendar');if(!host)return;
    const r=ExperienceFinance.agenda(data,schedule({ includeCompletedGenerated: true }),month,agendaStatus),today=F.today();
    if(!agendaDay.startsWith(month))agendaDay=today.startsWith(month)?today:month+'-01';
    const scope=month+'|'+agendaStatus+'|'+agendaDay;if(scope!==agendaPageScope){agendaListPage=agendaDayPage=0;agendaPageScope=scope;}
    agendaListPage=Math.min(agendaListPage,Math.max(0,Math.ceil(r.rows.length/50)-1));
    const days=new Date(+month.slice(0,4),+month.slice(5,7),0).getDate(),start=(new Date(month+'-01T12:00:00').getDay()+6)%7;
    const done=p=>p.source==='completed'||p.agendaCompleted;
    const allRows=agendaStatus==='all'?r.rows:ExperienceFinance.agenda(data,schedule({ includeCompletedGenerated: true }),month,'all').rows,counts={all:allRows.length,open:allRows.filter(p=>!done(p)).length,overdue:allRows.filter(p=>!done(p)&&p.date<today).length,completed:allRows.filter(done).length};
    const head=document.querySelector('#planner .planner-agenda-head');if(head&&!head.dataset.agendaV2){head.dataset.agendaV2='1';const h=head.querySelector('h2'),p=head.querySelector('h2+p');if(h)h.textContent='Agenda';if(p)p.textContent='O que tens para pagar e receber este mês, e o que já ficou registado.';}
    const tools=document.querySelector('#agendaMonthTools');tools.innerHTML='';
    const monthName=new Date(month+'-01T12:00:00').toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
    const filter=document.querySelector('#plannerAgendaFilters');filter.innerHTML='<div class="ag-month"><button type="button" class="secondary" data-agenda-step="-1" aria-label="Mês anterior">‹</button><label class="ag-month-label"><span>'+esc(monthName.charAt(0).toUpperCase()+monthName.slice(1))+'</span><input id="agendaMonthPicker" type="month" value="'+month+'" aria-label="Mês e ano"></label><button type="button" class="secondary" data-agenda-step="1" aria-label="Mês seguinte">›</button><button type="button" class="secondary" data-agenda-today>Hoje</button></div><div class="ag-chips" role="group" aria-label="Estado">'+[['all','Todos'],['open','Por registar'],['overdue','Em atraso'],['completed','Registados']].map(([id,label])=>'<button type="button" class="secondary'+(id==='overdue'&&counts.overdue?' is-alert':'')+'" data-agenda-status="'+id+'" aria-pressed="'+(agendaStatus===id)+'">'+label+'<small>'+counts[id]+'</small></button>').join('')+'</div><div class="ag-seg" role="group" aria-label="Vista">'+['calendar','list'].map(id=>'<button type="button" class="secondary '+(agendaLayout===id?'active':'')+'" data-agenda-layout="'+id+'" aria-pressed="'+(agendaLayout===id)+'">'+(id==='calendar'?'Calendário':'Lista')+'</button>').join('')+'</div>';
    const byDay=new Map();for(const p of r.rows){if(!byDay.has(p.date))byDay.set(p.date,[]);byDay.get(p.date).push(p);}
    const tone=p=>done(p)?'is-done':p.date<today?'is-late':p.type==='income'?'is-in':'is-out';
    const calendar='<div class="ex-calendar ag-calendar" aria-label="Agenda mensal">'+['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=>'<span class="ex-weekday">'+d+'</span>').join('')+'<span class="ex-calendar-offset" style="grid-column:span '+Math.max(1,start)+';'+(!start?'display:none':'')+'"></span>'+Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),rows=byDay.get(date)||[],weekday=(start+i)%7,out=F.money(rows.filter(p=>p.type==='expense').reduce((n,p)=>n+p.amount,0)),inc=F.money(rows.filter(p=>p.type==='income').reduce((n,p)=>n+p.amount,0));return '<button type="button" class="ex-day ag-day'+(agendaDay===date?' active':'')+(date===today?' is-today':'')+(weekday>4?' is-weekend':'')+(rows.length?' has-items':'')+(rows.some(p=>!done(p)&&p.date<today)?' has-late':'')+'" data-agenda-day="'+date+'" aria-pressed="'+(agendaDay===date)+'" aria-label="'+esc(dateLabel(date))+': '+rows.length+' compromisso(s)"><b>'+String(i+1)+'</b>'+rows.slice(0,3).map(p=>'<span class="ag-pill '+tone(p)+'"><i></i>'+esc(p.description)+'</span>').join('')+(rows.length>3?'<small class="ag-more">+ '+(rows.length-3)+'</small>':'')+(out||inc?'<em class="ag-day-total'+(inc>=out?' positive':'')+'">'+(inc>=out?'+':'−')+eur(Math.abs(F.money(inc-out)))+'</em>':'')+'</button>';}).join('')+'</div>';
    const listGroups=new Map();for(const p of r.rows.slice(agendaListPage*50,(agendaListPage+1)*50)){if(!listGroups.has(p.date))listGroups.set(p.date,[]);listGroups.get(p.date).push(p);}
    const selectedDay=byDay.get(agendaDay)||[];agendaDayPage=Math.min(agendaDayPage,Math.max(0,Math.ceil(selectedDay.length/50)-1));
    const list='<div class="ex-agenda-list">'+[...listGroups].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>'<section><h4>'+dateLabel(date)+'</h4>'+scheduleRows(rows,{planner:true})+'</section>').join('')+'</div>'+agendaPager('list',r.rows.length,agendaListPage);
    host.innerHTML=(agendaLayout==='calendar'?calendar:list)+(!r.rows.length?'<p class="empty-state">Sem compromissos com este filtro.</p>':'')+'<div id="agendaRows" class="ex-selected-day"><div class="ag-day-head"><h4>'+esc((d=>d.charAt(0).toUpperCase()+d.slice(1))(new Date(agendaDay+'T12:00:00').toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})))+'</h4><small>'+(selectedDay.length?selectedDay.length+' compromisso'+(selectedDay.length===1?'':'s')+' · '+eur(F.money(selectedDay.reduce((n,p)=>n+(p.type==='income'?p.amount:p.type==='expense'?-p.amount:0),0))):'Sem compromissos')+'</small></div>'+(selectedDay.length?scheduleRows(selectedDay.slice(agendaDayPage*50,(agendaDayPage+1)*50),{planner:true}):'<p class="ag-day-empty">Nada marcado para este dia.</p>')+agendaPager('day',selectedDay.length,agendaDayPage)+'</div>';
    const dayRows=host.querySelector('#agendaRows');dayRows.hidden=agendaLayout==='list';const sidebar=document.querySelector('.planner-agenda-sidebar');sidebar.querySelector('#agendaRows')?.remove();sidebar.prepend(dayRows);dayRows.classList.add('panel');
    let facts=document.querySelector('#agendaMonthFacts');if(!facts){facts=document.createElement('div');facts.id='agendaMonthFacts';}
    const metrics=document.querySelector('#agendaSummary');if(metrics)metrics.prepend(facts);
    const openIncome=F.money(allRows.filter(p=>!done(p)&&p.type==='income').reduce((n,p)=>n+p.amount,0)),lateValue=F.money(allRows.filter(p=>!done(p)&&p.date<today&&p.type==='expense').reduce((n,p)=>n+p.amount,0));
    facts.innerHTML='<article class="panel approved-metric ag-tile is-out"><span>A pagar</span><strong class="amount">'+eur(r.outgoing)+'</strong><small>'+(counts.overdue?'<b class="negative">'+counts.overdue+' em atraso · '+eur(lateValue)+'</b>':'nada em atraso')+'</small></article><article class="panel approved-metric ag-tile is-in"><span>A receber</span><strong class="amount">'+eur(openIncome)+'</strong><small>entradas por registar</small></article><article class="panel approved-metric ag-tile is-done"><span>Já registado</span><strong class="amount">'+eur(r.registered)+'</strong><small>'+counts.completed+' de '+counts.all+' compromissos</small></article>';
    let services=document.querySelector('#agendaMonthServices');if(!services){services=document.createElement('article');services.id='agendaMonthServices';services.className='panel';document.querySelector('.planner-agenda-grid').after(services);}
    const subscriptions=ExperienceFinance.agenda(data,schedule({includeCompletedGenerated:true}),month,'all').rows.filter(p=>p.source==='subscription'||p.subscriptionId);services.innerHTML='<div class="approved-card-heading"><h3>Subscrições do mês</h3><button type="button" class="secondary" id="agendaManageServices">Gerir subscrições</button></div><div class="table-wrap"><table><thead><tr><th>Serviço</th><th>Valor</th><th>Data de débito</th><th>Estado</th></tr></thead><tbody>'+subscriptions.slice(0,100).map(p=>'<tr><td><span class="provider-name">'+ProviderIcons.html(data.subscriptions.find(s=>s.id===p.subscriptionId)?.name||p.description)+esc(p.description)+'</span></td><td class="amount">'+eur(p.amount)+'</td><td>'+dateLabel(p.date)+'</td><td><span class="approved-state '+(done(p)?'confirmed':'pending')+'">'+(done(p)?'Registada':p.date<today?'Em atraso':'Prevista')+'</span></td></tr>').join('')+'</tbody></table></div>'+(!subscriptions.length?'<p class="empty-state">Sem cobranças com este filtro.</p>':'')+(subscriptions.length>100?'<p>Mostradas 100 de '+subscriptions.length+' cobranças. Usa a vista Lista para consultar as restantes.</p>':'');
    document.querySelector('#agendaManageServices').onclick=()=>PlanningManagerUI.openSubscriptions();window.UnifiedWorkspaceUI?.refreshAgenda();
    filter.querySelectorAll('[data-agenda-step]').forEach(b=>b.onclick=()=>{const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(b.dataset.agendaStep));month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');document.querySelector('#monthPicker').value=month;render();});
    filter.querySelector('#agendaMonthPicker').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){month=e.target.value;document.querySelector('#monthPicker').value=month;render();}};
    filter.querySelector('[data-agenda-today]').onclick=()=>{month=today.slice(0,7);agendaDay=today;document.querySelector('#monthPicker').value=month;render();};
    filter.querySelectorAll('[data-agenda-layout]').forEach(b=>b.onclick=()=>{agendaLayout=b.dataset.agendaLayout;renderAgenda();});filter.querySelectorAll('[data-agenda-status]').forEach(b=>b.onclick=()=>{agendaStatus=b.dataset.agendaStatus;renderAgenda();});host.querySelectorAll('[data-agenda-day]').forEach(b=>b.onclick=()=>{agendaDay=b.dataset.agendaDay;renderAgenda();});
    document.querySelectorAll('#planner [data-agenda-page]').forEach(b=>b.onclick=()=>{const [kind,direction]=b.dataset.agendaPage.split('-');if(kind==='list')agendaListPage+=direction==='next'?1:-1;else agendaDayPage+=direction==='next'?1:-1;renderAgenda();const target=document.querySelector('#planner [data-agenda-page="'+b.dataset.agendaPage+'"]:not(:disabled)')||document.querySelector('#planner [data-agenda-page="'+kind+'-prev"]:not(:disabled)');target?.focus({preventScroll:true});});
    document.querySelectorAll('[data-planner-insight]').forEach(b=>b.onclick=()=>{const mode=b.dataset.plannerInsight;if(mode==='overdue'){agendaStatus='overdue';agendaLayout='list';renderAgenda();return;}const candidates=mode==='largest'?r.open.filter(p=>p.type!=='income').sort((a,b)=>b.amount-a.amount):schedule().filter(p=>p.source!=='completed'&&p.date>=today&&p.date<=FinancePlus.dayAdd(today,30)).sort((a,b)=>a.date.localeCompare(b.date));const item=candidates[0];if(!item)return;agendaStatus='open';agendaLayout='calendar';agendaDay=item.date;month=item.date.slice(0,7);document.querySelector('#monthPicker').value=month;render();document.querySelector('#agendaRows')?.scrollIntoView({block:'center'});});
    document.querySelectorAll('#planner [data-action="settle-pending"]').forEach(b=>{b.insertAdjacentHTML('afterend',button('Pagamento parcial','partial-payment',b.dataset.id,'link-button')+button('Reagendar','workflow-reschedule',b.dataset.id,'link-button'));});
    document.querySelectorAll('#planner [data-action="settle-pending"],#planner [data-action="settle-recurring"],#planner [data-action="pay-debt"]').forEach(b=>{b.textContent=b.closest('.agenda31-row')?.querySelector('.amount.income')?'Registar recebimento':'Registar pagamento';});

  }
  actions["workflow-reschedule"] = (id) => {
    const item = data.pendingPayments.find((p) => String(p.id) === String(id));
    if (!item) return;
    const expected = JSON.stringify(item);
    form(
      "Reagendar compromisso",
      `<p>${esc(item.description)} · ${eur(item.amount)}</p>` +
        field("Nova data", "date", item.date, "date", "required") +
        field("Motivo", "reason", "", "text", 'required maxlength="500"'),
      (f) =>
        commit(() => {
          if (
            JSON.stringify(
              data.pendingPayments.find((p) => String(p.id) === String(id)),
            ) !== expected
          )
            throw Error("O compromisso mudou. Abre novamente o reagendamento.");
          Q.reschedule(data, id, f.get("date"), f.get("reason"));
        }, "Compromisso reagendado."),
      "O saldo não muda. A data anterior e o motivo ficam no histórico.",
    );
  };
  function renderHelp() {
    const topics = {
      accounts: [
        "Como acertar o saldo inicial",
        "Se vais importar movimentos antigos, parte do saldo imediatamente anterior ao primeiro movimento. Depois da importação, compara o saldo final com o banco. Um ajuste de saldo não é um rendimento.",
      ],
      review: [
        "Como rever um extrato",
        "Confirma primeiro a conta e as datas. As coincidências ficam desmarcadas; os valores semelhantes precisam da tua confirmação. Antes de concluir, compara o saldo previsto com o extrato.",
      ],
      cashflow: [
        "Previsão e dinheiro disponível",
        "A previsão inclui compromissos ainda por registar. Só o registo de um recebimento ou pagamento altera o saldo. Revê as datas quando um compromisso for adiado.",
      ],
      budgets: [
        "O que conta para o orçamento",
        "As despesas repartidas contam nas respetivas categorias. As devoluções reduzem a despesa original; transferências entre as tuas contas não são despesas.",
      ],
      wealth: [
        "Saldo e património são diferentes",
        "O saldo é dinheiro nas contas. O património também considera bens, investimentos e dívidas; não significa que esse valor esteja disponível para gastar.",
      ],
    };
    for (const [id, [title, body]] of Object.entries(topics)) {
      const host = document.getElementById(id);
      if (!host || host.querySelector(".context-help")) continue;
      const detail = document.createElement("details");
      detail.className = "context-help";
      detail.innerHTML = `<summary>${title}</summary><p>${body}</p>`;
      host.append(detail);
    }
    document
      .querySelectorAll(
        "#settings .settings-grid > .panel, #settings > .life-settings",
      )
      .forEach((panel) => {
        const heading = panel.querySelector("h2");
        if (!heading) return;
        const detail = document.createElement("details");
        detail.className = "workflow-detail settings-disclosure";
        if (panel.classList.contains("life-settings"))
          detail.classList.add("life-settings-disclosure");
        const summary = document.createElement("summary");
        summary.textContent = heading.textContent;
        detail.append(summary);
        panel.before(detail);
        detail.append(panel);
      });
  }
  function render() {
    const calculation = document.querySelector("#decisionPanel .calculation");
    if (calculation && !calculation.closest("details")) {
      const detail = document.createElement("details");
      detail.className = "decision-explanation";
      detail.innerHTML = "<summary>Como é calculado este valor?</summary>";
      calculation.before(detail);
      detail.append(calculation);
    }
    document.body.classList.add("equilibrio-studio");
    if(view==='review'||view==='dataHub'&&window.UnifiedWorkspaceUI?.dataTask()==='imports')renderImport();
    if(view==='planner')renderAgenda();
    renderHelp();
  }
  const previous = PremiumUI.render;
  PremiumUI.render = () => {
    previous();
    render();
  };
  window.WorkflowsUI = { render, backupComparison };
  const previousNavigation=PremiumUI.navigation;
  PremiumUI.navigation=v=>{previousNavigation(v);if(v==='planner'||v==='review')render();};
  if (!window.equilibrioStartup?.awaitingChoice) render();
})();

/* Personal organization, compatible with existing category paths in the ledger. */
(function () {
  const C = CompleteFinance;
  const period = document.createElement("div");
  period.className = "period-pair";
  period.innerHTML =
    '<label>Ano<select id="periodYear" aria-label="Ano a consultar"></select></label><label>Mês<select id="periodMonth" aria-label="Mês a consultar"></select></label>';
  const original = document.getElementById("monthPicker");
  original.hidden = true;
  original.before(period);
  const year = period.querySelector("#periodYear"),
    mon = period.querySelector("#periodMonth");
  mon.innerHTML = Array.from(
    { length: 12 },
    (_, i) =>
      `<option value="${String(i + 1).padStart(2, "0")}">${new Date(2020, i, 1).toLocaleDateString("pt-PT", { month: "long" })}</option>`,
  ).join("");
  year.onchange = mon.onchange = () => {
    month = year.value + "-" + mon.value;
    original.value = month;
    render();
  };
  function enhanceForm() {
    const category = document.querySelector("#modal [name=category]"),
      sub = document.querySelector("#modal [name=subcategory]"),
      detail = document.querySelector("#modal [name=categoryDetail]"),
      subdetail = document.querySelector("#modal [name=categorySubdetail]");
    if (!category || !sub) return;
    const subList = document.getElementById("subcategories") || (() => { const x=document.createElement("datalist"); x.id="subcategories"; sub.after(x); return x; })(),
      detailList = document.getElementById("categoryDetails") || (() => { const x=document.createElement("datalist"); x.id="categoryDetails"; detail?.after(x); return x; })(),
      subdetailList = document.getElementById("categorySubdetails") || (() => { const x=document.createElement("datalist"); x.id="categorySubdetails"; subdetail?.after(x); return x; })();
    const directory = () => C.categoryList(data).filter((c) => !c.archived);
    const valuesFor = (parent) => directory()
      .filter((c) => c.parent === parent)
      .map((c) => F.categoryParts(c.name).at(-1))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-PT"));
    const fill = (list, values) => { if (list) list.innerHTML = [...new Set(values)].map((value) => `<option value="${esc(value)}">`).join(""); };
    const absorbFullPath = () => {
      const parts = F.categoryParts(category.value);
      if (parts.length <= 1) return;
      category.value = parts[0] || "";
      sub.value = parts[1] || "";
      if (detail) detail.value = parts[2] || "";
      if (subdetail) subdetail.value = parts[3] || "";
    };
    const sync = () => {
      absorbFullPath();
      const base = category.value.trim(), subValue = sub.value.trim(), detailValue = detail?.value.trim() || "";
      fill(subList, valuesFor(F.categoryPath([base])));
      fill(detailList, base && subValue ? valuesFor(F.categoryPath([base, subValue])) : []);
      fill(subdetailList, base && subValue && detailValue ? valuesFor(F.categoryPath([base, subValue, detailValue])) : []);
    };
    category.addEventListener("input", () => { sub.value=""; if(detail) detail.value=""; if(subdetail) subdetail.value=""; sync(); });
    category.addEventListener("change", sync);
    sub.addEventListener("input", () => { if(detail) detail.value=""; if(subdetail) subdetail.value=""; sync(); });
    sub.addEventListener("change", sync);
    detail?.addEventListener("input", () => { if(subdetail) subdetail.value=""; sync(); });
    detail?.addEventListener("change", sync);
    subdetail?.addEventListener("input", sync);
    document.querySelector("#modal [name=description]")?.addEventListener("change", () => queueMicrotask(sync));
    sync();
  }
  function categoryForm(from = "") {
    const parts = F.categoryParts(from),
      parent = parts.length > 1 ? F.categoryPath(parts.slice(0, -1)) : "";
    form(
      from ? "Editar categoria" : "Adicionar categoria",
      field(
        "Nome",
        "categoryName",
        parts.at(-1) || "",
        "text",
        'required maxlength="80"',
      ) +
        select(
          "Categoria superior (opcional)",
          "categoryParent",
          [
            ["", "Sem categoria superior"],
            ...C.categoryList(data)
              .filter((c) => !c.archived && c.level < 4 && c.name !== from && !c.name.startsWith(from + " / "))
              .map((c) => [c.name, `${"— ".repeat(Math.max(0, c.level - 1))}${c.name}`]),
          ],
          parent,
        ),
      (f) =>
        commit(() => {
          const name = f.get("categoryName").trim(),
            root = f.get("categoryParent");
          if (name.includes("/"))
            throw Error("Usa o campo Categoria superior para escolher o nível anterior.");
          C.saveCategory(data, from, F.categoryPath([root, name]));
        }, "Categoria guardada."),
      "Podes usar até quatro níveis. Editar atualiza as referências existentes e preserva os valores. Meses fechados ficam protegidos.",
    );
  }
  actions["category-create"] = () => categoryForm();
  actions["category-edit"] = categoryForm;
  actions["category-toggle"] = (name) =>
    commit(() => {
      const c = C.categoryList(data).find((c) => c.name === name);
      C.archiveCategory(data, name, !c.archived);
    }, "Estado da categoria atualizado.");
  actions["category-delete"] = (name) => {
    const c = C.categoryList(data).find(x => x.name === name);
    if (!c) return notice("Categoria inexistente.", true);
    let replacement = "";
    const isUsed = ["transactions","pendingImports","budgets","envelopes","rules","recurring","pendingPayments","annualPlans"].some(k =>
      (data[k] || []).some(r => r.category === name || (r.splits || []).some(s => s.category === name) || (r.receiptItems || []).some(s => s.category === name))
    );
    if (isUsed) {
      const choices = C.categoryList(data).filter(x => !x.archived && x.name !== name).map(x => x.name);
      replacement = prompt(`A categoria “${name}” tem ${c.count} movimento(s).\n\nAntes de eliminar, escreve a categoria para onde queres transferir os movimentos:\n\n${choices.join(" · ")}`, choices[0] || "") || "";
      if (!replacement) return;
    } else if (!confirm(`Eliminar definitivamente a categoria “${name}”?`)) return;
    commit(() => C.deleteCategory(data, name, replacement), isUsed ? `Referências transferidas para ${replacement} e categoria eliminada.` : "Categoria eliminada.");
  };
  function refresh() {
    const dated = [
      ...(data.transactions || []),
      ...(data.pendingPayments || []),
      ...(data.recurring || []),
    ].map((t) => String(t.date || t.startDate || "").slice(0, 4)).filter((y) => /^\d{4}$/.test(y));
    const years = new Set(dated.length ? dated : [month.slice(0, 4)]);
    year.innerHTML = [...years]
      .filter(Boolean)
      .sort()
      .reverse()
      .map((y) => `<option>${esc(y)}</option>`)
      .join("");
    year.value = month.slice(0, 4);
    mon.value = month.slice(5, 7);
    let host = document.getElementById("categoryDirectory");
    if (!host) {
      host = document.createElement("div");
      host.id = "categoryDirectory";
      document.querySelector("#categoryWorkbench h2").after(host);
    }
    const list = C.categoryList(data);
    const advanced = document.querySelector(
      "#categoryWorkbench .complete-content",
    );
    const parents = list.filter((c) => !c.parent);
    const renderChild = (entry) => {
      const children = list.filter((c) => c.parent === entry.name), label = F.categoryParts(entry.name).at(-1) || entry.name;
      return `<div class="category-directory-branch level-${entry.level}"><div class="category-directory-row is-subcategory"><div><b>${esc(label)}</b><small>${entry.count ? entry.count + " movimentos · Em uso" : "Sem movimentos"}${entry.archived ? " · Arquivada" : ""}${children.length ? ` · ${children.length} nível${children.length === 1 ? "" : "eis"} abaixo` : ""}</small></div><div class="row-actions">${button("Editar", "category-edit", entry.name, "secondary")}${button(entry.archived ? "Reativar" : "Arquivar", "category-toggle", entry.name, "secondary")}${button("Eliminar", "category-delete", entry.name, "secondary danger-action")}</div></div>${children.length ? `<div class="category-children nested-level">${children.map(renderChild).join("")}</div>` : ""}</div>`;
    };
    const families = parents.map((parent) => {
      const children = list.filter((c) => c.parent === parent.name);
      const status = `${parent.count ? parent.count + " movimentos" : "Sem movimentos"}${parent.archived ? " · Arquivada" : ""}`;
      return `<details class="category-family"><summary><span><b>${esc(parent.name)}</b><small>${status}</small></span><span class="category-family-count">${children.length} subcategoria${children.length === 1 ? "" : "s"}</span></summary><div class="category-family-body"><div class="row-actions category-family-actions">${button("Editar categoria", "category-edit", parent.name, "secondary")}${button(parent.archived ? "Reativar" : "Arquivar", "category-toggle", parent.name, "secondary")}${button("Eliminar", "category-delete", parent.name, "secondary danger-action")}</div>${children.length ? `<div class="category-children">${children.map(renderChild).join("")}</div>` : '<p class="muted category-no-children">Sem subcategorias.</p>'}</div></details>`;
    }).join("");
    host.innerHTML =
      '<div class="category-directory-intro"><p>Organiza por categoria. Abre apenas o grupo que queres alterar.</p>' +
      button("+ Adicionar categoria", "category-create", "", "primary") +
      '<button type="button" class="secondary" data-category-cleanup>Arrumar repetidas</button>' +
      (C.suggestedCorrections(data).length ? '<button type="button" class="secondary" data-category-corrections>Correções sugeridas (' + C.suggestedCorrections(data).length + ')</button>' : '') +
      '</div><div class="category-directory category-directory-grouped">' +
      families +
      '</div><details class="category-tools"><summary>Regras e operações avançadas</summary></details>';
    if (advanced) host.querySelector(".category-tools").append(advanced);
  }
  function categoryCleanupForm() {
    const suggestions = C.categoryCleanupSuggestions(data), names = C.categoryList(data).map((c) => c.name);
    const row = (p, i) => `<label class="cleanup-row is-${p.strength}"><input type="checkbox" data-cleanup="${i}" ${p.strength === "strong" ? "checked" : ""}><span class="cleanup-from"><b>${esc(p.from)}</b><small>${p.fromUses} uso${p.fromUses === 1 ? "" : "s"}</small></span><span class="cleanup-arrow" aria-hidden="true">→</span><span class="cleanup-to"><input type="text" list="cleanupCategoryNames" value="${esc(p.to)}" data-cleanup-to="${i}" aria-label="Destino de ${esc(p.from)}"><small>${esc(p.reason)}</small></span></label>`;
    const manual = (i) => `<div class="cleanup-row is-manual" data-cleanup-manual="${i}"><select data-manual-from aria-label="Categoria a mover"><option value="">Categoria a mover…</option>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select><span class="cleanup-arrow" aria-hidden="true">→</span><input type="text" list="cleanupCategoryNames" data-manual-to placeholder="Novo caminho, ex.: Alimentação / Mercearias" aria-label="Destino"><button type="button" class="secondary" data-manual-remove aria-label="Remover linha">×</button></div>`;
    const strong = suggestions.filter((p) => p.strength === "strong").length;
    form("Arrumar categorias",
      `<div class="category-cleanup"><p>Junta categorias repetidas. Os movimentos, regras e orçamentos passam para o destino, com as subcategorias. Nada é apagado e o destino pode ser uma categoria nova.</p>` +
      `<datalist id="cleanupCategoryNames">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>` +
      (suggestions.length ? `<h3>Sugestões <small>${strong} prováveis${suggestions.length - strong ? " · " + (suggestions.length - strong) + " a confirmar (desmarcadas)" : ""}</small></h3><div class="cleanup-list">${suggestions.map(row).join("")}</div>` : `<p class="cleanup-none">Não encontrei repetições óbvias.</p>`) +
      `<h3>Mover ou renomear à mão</h3><p class="muted">Escolhe uma categoria e escreve o caminho novo. Move também as subcategorias; se o destino já existir, junta-as.</p><div class="cleanup-list" id="cleanupManualRows">${manual(0)}</div><button type="button" class="secondary" id="cleanupAddManual">+ Outra mudança</button><p class="cleanup-summary" id="cleanupSummary" role="status"></p></div>`,
      () => {
        const host = document.getElementById("modalContent"), moves = [];
        host.querySelectorAll("[data-cleanup]:checked").forEach((box) => { const i = Number(box.dataset.cleanup), to = host.querySelector(`[data-cleanup-to="${i}"]`).value.trim(); if (to) moves.push({ from: suggestions[i].from, to }); });
        host.querySelectorAll("[data-cleanup-manual]").forEach((r) => { const from = r.querySelector("[data-manual-from]").value, to = r.querySelector("[data-manual-to]").value.trim(); if (from && to) moves.push({ from, to }); });
        if (!moves.length) throw Error("Escolhe pelo menos uma alteração.");
        return commit(() => { const n = C.cleanupCategories(data, moves); return n; }, moves.length + " alteração(ões) aplicada(s) às categorias.");
      },
      "Dica: faz primeiro uma cópia de segurança em Definições → Backup. Meses fechados têm de ser reabertos antes.", "Aplicar");
    const host = document.getElementById("modalContent");
    let n = 1;
    const summary = () => { const checked = host.querySelectorAll("[data-cleanup]:checked").length, manualCount = [...host.querySelectorAll("[data-cleanup-manual]")].filter((r) => r.querySelector("[data-manual-from]").value && r.querySelector("[data-manual-to]").value.trim()).length; host.querySelector("#cleanupSummary").textContent = checked + manualCount ? `Vais aplicar ${checked + manualCount} alteração(ões).` : "Nenhuma alteração escolhida."; };
    host.addEventListener("input", summary); host.addEventListener("change", summary);
    host.querySelector("#cleanupAddManual").onclick = () => { host.querySelector("#cleanupManualRows").insertAdjacentHTML("beforeend", manual(n++)); };
    host.addEventListener("click", (e) => { const b = e.target.closest("[data-manual-remove]"); if (b) { b.closest("[data-cleanup-manual]").remove(); summary(); } });
    summary();
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-category-cleanup]")) categoryCleanupForm(); });
  function correctionsForm() {
    const list = C.suggestedCorrections(data);
    if (!list.length) return;
    const groups = [...new Set(list.map((x) => x.group))];
    form("Correções sugeridas",
      `<div class="category-cleanup"><p>Resultado da revisão dos teus movimentos e categorias. Desmarca o que não quiseres. Nada é apagado: os movimentos só mudam de categoria e as recorrências de frequência.</p><p><button type="button" class="secondary danger-action" data-correction-dismiss>Descartar todas as pendentes</button></p>` +
      groups.map((g) => `<h3>${esc(g)}</h3><div class="cleanup-list">${list.filter((x) => x.group === g).map((x) => `<label class="cleanup-row is-strong"><input type="checkbox" data-correction="${esc(x.id)}" checked><span class="cleanup-from"><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></span></label>`).join("")}</div>`).join("") + `</div>`,
      () => {
        const ids = [...document.querySelectorAll("#modalContent [data-correction]:checked")].map((b) => b.dataset.correction);
        if (!ids.length) throw Error("Escolhe pelo menos uma correção.");
        return commit(() => C.applyCorrections(data, ids), ids.length + " correção(ões) aplicada(s).");
      },
      "Dica: faz primeiro uma cópia de segurança em Definições → Backup.", "Aplicar");
    const dismiss = document.querySelector("#modalContent [data-correction-dismiss]");
    if (dismiss) dismiss.onclick = () => {
      const ids = list.map((x) => x.id);
      if (!window.confirm("Descartar as " + ids.length + " correções pendentes? Não altera movimentos nem categorias.")) return;
      commit(() => C.dismissCorrections(data, ids), "Correções pendentes descartadas.");
    };
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-category-corrections]")) correctionsForm(); });
  const previous = PremiumUI.render;
  PremiumUI.render = () => {
    previous();
    refresh();
  };
  window.MovementUI = { enhanceForm };
  refresh();
})();
