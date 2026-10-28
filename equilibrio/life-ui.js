/* Spaces use separate local-storage records. Switching never copies a ledger. */
(function () {
  "use strict";
  const L = LifeFinance,
    P = FinancePlus;
  function page(id, area, label) {
    if (id === "qualityHub" && window.DataHub) return window.DataHub.pane("quality");
    const el = document.createElement("section");
    el.id = id;
    el.className = "view";
    el.innerHTML =
      '<div class="life-page"><div class="life-heading"><h2>' +
      label +
      '</h2></div><div class="life-content"></div></div>';
    $("#mainContent").append(el);
    PremiumUI.addPage(area, id, label);
    return el.querySelector(".life-content");
  }
  const subscriptions = page("subscriptionsHub", "Planeamento", "Subscrições"),
    quality = page("qualityHub", "Resumo", "Qualidade dos dados"),
    docs = page("documentsHub", "Movimentos", "Comprovativos"),
    assets = page("assetsHub", "Património", "Bens e avaliações"),
    investments = page(
      "investmentsHub",
      "Património",
      "Investimentos",
    );
  const b = (label, action, id = "") => button(label, action, id, "secondary"),
    simple = (title, fields, fn, help = "") =>
      form(title, fields, (f) => commit(() => fn(f)), help),
    metricCard = (title, value) =>
      '<article class="panel"><p>' +
      title +
      '</p><strong class="amount life-number">' +
      eur(value) +
      "</strong></article>";
  let registry,
    registryBroken = false;
  try {
    const directRegistry = window.DesktopPersistence?.listSpaces?.() || window.financasDesktop?.dataListSpacesSync?.() || window.financasDesktop?.listSqliteSpacesSync?.();
    const raw = localStorage.getItem("equilibrioSpaces");
    registry = Array.isArray(directRegistry) && directRegistry.length
      ? directRegistry.map((s) => ({ id: String(s.id || ""), name: String(s.name || ""), key: String(s.key || "") }))
      : raw
        ? JSON.parse(raw)
        : [{ id: "main", name: "Pessoal", key: "equilibrioData" }];
    if (
      !Array.isArray(registry) ||
      !registry.some((s) => s.id === "main") ||
      new Set(registry.map((s) => s.id)).size !== registry.length ||
      registry.some(
        (s) =>
          typeof s.name !== "string" ||
          !/^[A-Za-z0-9-]+$/.test(s.id) ||
          s.key !==
            (s.id === "main" ? "equilibrioData" : "equilibrioData:" + s.id),
      )
    )
      throw Error("Catálogo de espaços inválido.");
  } catch {
    registry = [{ id: "main", name: "Pessoal", key: "equilibrioData" }];
    registryBroken = true;
  }
  const space = document.createElement("div");
  space.className = "space-picker";
  space.innerHTML =
    '<label for="activeSpace">Espaço financeiro</label><select id="activeSpace"></select>';
  const topSpaceSlot = document.getElementById("topSpaceSlot");
  if (topSpaceSlot) topSpaceSlot.append(space);
  else $(".sidebar nav")?.before(space);
  function spaceOptions() {
    const el = $("#activeSpace");
    el.innerHTML = registry
      .map((s) => '<option value="' + s.id + '">' + esc(s.name) + "</option>")
      .join("");
    el.value = registry.find((s) => s.key === key)?.id || "main";
  }

  function readPersistedSpace(entry) {
    if (!entry) throw Error("Espaço inexistente.");
    const direct = window.DesktopPersistence?.readSpace?.(entry.id) || window.financasDesktop?.dataReadSpaceSync?.(entry.id) || window.financasDesktop?.readSqliteSpaceSync?.(entry.id);
    if (direct?.data) return F.normalize(direct.data);
    if (entry.key === key) return F.normalize(structuredClone(data));
    const raw = localStorage.getItem(entry.key);
    if (!raw) throw Error("Não existem dados guardados para este espaço.");
    return F.normalize(JSON.parse(raw));
  }
  function syncDesktopSpaceCatalog(expected) {
    if (!window.DesktopPersistence?.persistFullStateSync) return true;
    const ok = window.DesktopPersistence.persistFullStateSync(expected);
    if (!ok) throw Error("Não foi possível sincronizar os Espaços Financeiros com SQLite.");
    return true;
  }
  function assertSpaceWritable() {
    if (registryBroken || storageProblem || !CompleteUI.canWrite())
      throw Error("Não é possível alterar espaços nesta janela. Resolve o problema de armazenamento ou usa a janela de edição.");
  }
  function commitSpaceCatalog(nextRegistry, supplied = {}) {
    assertSpaceWritable();
    // Prepare all ledgers from the authoritative source before touching cache.
    // A failed cache write or SQLite transaction must not leave a ghost space.
    const expected = Object.fromEntries(registry.map(entry => [entry.key, JSON.stringify(readPersistedSpace(entry))]));
    expected.equilibrioSpaces = JSON.stringify(registry);
    const ledgers = new Map(nextRegistry.map(entry => {
      const source = supplied[entry.key] ?? readPersistedSpace(registry.find(s => s.key === entry.key));
      return [entry.key, F.normalize({ ...structuredClone(source), spaceName: entry.name })];
    }));
    const keys = new Set(['equilibrioSpaces', ...registry.map(s => s.key), ...nextRegistry.map(s => s.key)]);
    const before = new Map([...keys].map(k => [k, localStorage.getItem(k)]));
    try {
      for (const [k, ledger] of ledgers) localStorage.setItem(k, JSON.stringify(ledger));
      for (const entry of registry) if (!ledgers.has(entry.key)) localStorage.removeItem(entry.key);
      localStorage.setItem('equilibrioSpaces', JSON.stringify(nextRegistry));
      syncDesktopSpaceCatalog(expected);
    } catch (error) {
      try {
        for (const [k, value] of before) {
          if (value === null) localStorage.removeItem(k);
          else localStorage.setItem(k, value);
        }
      } catch {
        storageProblem = true;
        throw Error('A operação falhou e não foi possível recuperar o cache. Reabre a aplicação antes de continuar.');
      }
      throw error;
    }
    registry = nextRegistry;
    if (ledgers.has(key)) data = ledgers.get(key);
    CompleteUI.updatedFromDisk();
    spaceOptions();
  }
  function switchSpace(id) {
    const target = registry.find((s) => s.id === id);
    if (!target) throw Error("Espaço inexistente.");
    if (target.key === key) return;
    const next = readPersistedSpace(target);
    if (window.FormSession && !window.FormSession.canLeave()) { spaceOptions(); return false; }
    if ($("#modal").open) $("#modal").close();
    if (!window.financasDesktop?.isDesktop) $("#pauseFileBackup")?.click();
    key = target.key;
    data = next;
    // Reconfirm critical arrays from the normalized SQLite tables.
    const refreshed = window.DesktopPersistence?.refreshCriticalDomains?.(target.id);
    if (refreshed?.ok === false) {
      storageProblem = true;
      throw Error('Não foi possível confirmar o espaço em SQLite. Reabre a aplicação antes de continuar.');
    }
    storageProblem = false;
    undoState = null;
    CompleteUI.updatedFromDisk();
    window.renderEquilibrio();
    spaceOptions();
    notice(
      "Espaço " +
        target.name +
        (window.financasDesktop?.isDesktop
          ? " aberto. A configuração das cópias Desktop foi mantida."
          : " aberto. As cópias em pasta ficam desligadas; liga a pasta deste espaço quando precisares."),
    );
  }
  $("#activeSpace").onchange = (e) => {
    try {
      switchSpace(e.target.value);
    } catch (error) {
      spaceOptions();
      notice(error.message, true);
    }
  };
  function addSpace() {
    if (registryBroken)
      return notice(
        "O catálogo de espaços está inválido. Os dados existentes foram preservados.",
        true,
      );
    form(
      "Criar espaço financeiro",
      field("Nome do espaço", "name", "", "text", "required maxlength=60"),
      (f) => {
        if (!CompleteUI.canWrite())
          throw Error("Usa a janela de edição para criar espaços.");
        const name = f.get("name").trim();
        if (
          !name ||
          registry.some((s) => s.name.toLowerCase() === name.toLowerCase())
        )
          throw Error("Escolhe um nome diferente.");
        if (storageProblem)
          throw Error(
            "Resolve primeiro o problema de armazenamento deste espaço.",
          );
        if (
          localStorage.getItem(key) === null &&
          !commit(() => {}, "Espaço atual guardado.")
        )
          return false;
        const id = F.id(),
          next = { id, name, key: "equilibrioData:" + id },
          ledger = F.empty();
        ledger.spaceName = name;
        commitSpaceCatalog([...registry, next], { [next.key]: ledger });
        setTimeout(() => switchSpace(id), 0);
        return true;
      },
      "Cria dados separados. As exportações e relatórios correspondem apenas ao espaço aberto.",
      "Criar espaço",
    );
  }
  function duplicateSpace() {
    if (registryBroken) return notice("O catálogo de espaços está inválido.", true);
    const active = registry.find((s) => s.key === key);
    if (!active) return notice("Não foi possível identificar o espaço aberto.", true);
    form('Duplicar espaço financeiro', field('Nome do novo espaço', 'name', active.name + ' — cópia', 'text', 'required maxlength=60'), (values) => {
      assertSpaceWritable();
      const name = values.get('name').trim();
      if (!name || registry.some(s => s.name.toLowerCase() === name.toLowerCase())) throw Error('Escolhe um nome diferente.');
      const clone = readPersistedSpace(active);
      const id = F.id(), next = {id, name, key:"equilibrioData:"+id};
      clone.spaceName = name;
      commitSpaceCatalog([...registry, next], { [next.key]: clone });
      notice(`Espaço “${name}” duplicado com todos os dados do espaço atual.`);
      return true;
    }, 'Cria uma cópia independente dos dados do espaço atual.', 'Duplicar espaço');
  }
  function deleteSpace() {
    if (registryBroken)
      return notice(
        "O catálogo de espaços está inválido. Os dados existentes foram preservados.",
        true,
      );
    const active = registry.find((s) => s.key === key);
    if (!active) return notice("Não foi possível identificar o espaço aberto.", true);
    const alternatives = registry.filter((s) => s.id !== active.id);
    if (!alternatives.length)
      return notice("Não podes eliminar o único espaço financeiro. Cria outro espaço primeiro.", true);

    const replacementFields =
      select(
        "Espaço que fica ativo/principal",
        "replacement",
        alternatives.map((s) => [s.id, s.name]),
        alternatives[0].id,
      ) +
      `<div class="form-note danger-note"><b>Esta ação elimina “${esc(active.name)}” e todos os dados guardados apenas nesse espaço.</b><br>Os restantes espaços não são alterados.</div>`;

    form(
      "Eliminar espaço financeiro",
      replacementFields,
      (f) => {
        const replacementId = f.get("replacement"),
          replacement = registry.find((s) => s.id === replacementId);
        if (!replacement || replacement.id === active.id)
          throw Error("Escolhe outro espaço para continuar.");
        const replacementData = readPersistedSpace(replacement);

        if (active.id === "main") {
          // O formato da aplicação exige um registo canónico `main`. Ao eliminar
          // o espaço principal atual, promovemos a escolha do utilizador para
          // esse lugar sem misturar os dados dos restantes espaços.
          replacementData.spaceName = replacement.name;
          const nextRegistry = registry
            .filter((s) => s.id !== active.id && s.id !== replacement.id)
            .concat([{ id: "main", name: replacement.name, key: "equilibrioData" }]);
          commitSpaceCatalog(nextRegistry, { equilibrioData: replacementData });
          notice(`Espaço “${active.name}” apagado. “${replacement.name}” passou a ser o espaço principal.`);
          setTimeout(() => location.reload(), 0);
          return true;
        }

        const nextRegistry = registry.filter((s) => s.id !== active.id);
        commitSpaceCatalog(nextRegistry);
        notice(`Espaço “${active.name}” apagado.`);
        setTimeout(() => switchSpace(replacement.id), 0);
        return true;
      },
      "Para eliminar um espaço tem de existir pelo menos outro. Escolhe qual queres abrir a seguir; se eliminares o espaço principal, o escolhido passa a ser o novo principal.",
      "Eliminar espaço",
    );
  }
  function renameSpace() {
    const active = registry.find((s) => s.key === key);
    if (!active) return notice("Não foi possível identificar o espaço aberto.", true);
    form("Renomear espaço financeiro", field("Nome do espaço", "name", active.name, "text", "required maxlength=60"), (f) => {
      const name = f.get("name").trim();
      if (!name || registry.some((x) => x.id !== active.id && x.name.toLowerCase() === name.toLowerCase())) throw Error("Escolhe um nome diferente.");
      commitSpaceCatalog(registry.map(s => s.id === active.id ? { ...s, name } : s));
      CompleteUI.updatedFromDisk();
      window.renderEquilibrio();
      notice('Nome do espaço atualizado.');
      return true;
    }, "Altera apenas o nome; os dados mantêm-se no mesmo espaço.", "Guardar nome");
  }
  const settingsGrid = document.querySelector("#settings .settings-grid");
  if (settingsGrid) {
    const card = document.createElement("article"); card.className = "panel space-settings";
    card.innerHTML = '<h2>Espaços financeiros</h2><p>Gere o espaço atual: cria, edita o nome, duplica ou elimina. Podes eliminar qualquer espaço desde que exista pelo menos outro; escolhes qual fica ativo e, se necessário, qual passa a ser o novo principal.</p><div class="settings-space-actions"><button type="button" class="secondary" id="settingsAddSpace">+ Novo espaço</button><button type="button" class="secondary" id="settingsRenameSpace">Editar nome</button><button type="button" class="secondary" id="settingsDuplicateSpace">Duplicar espaço</button><button type="button" class="secondary danger-action" id="settingsDeleteSpace">Eliminar espaço</button></div>';
    settingsGrid.prepend(card);
    $("#settingsAddSpace").onclick = addSpace; $("#settingsRenameSpace").onclick = renameSpace; $("#settingsDuplicateSpace").onclick = duplicateSpace; $("#settingsDeleteSpace").onclick = deleteSpace;
    const beneficiaries = document.createElement("article"); beneficiaries.className = "panel beneficiary-settings"; beneficiaries.innerHTML = '<h2>Beneficiários / estabelecimentos</h2><p>Lista usada nas sugestões ao criar movimentos.</p><div id="beneficiarySettingsList"></div><button type="button" class="secondary full" id="addBeneficiarySetting">+ Adicionar beneficiário</button>'; settingsGrid.append(beneficiaries);
    const renderBeneficiaries = () => { const list = [...new Set([...(data.savedBeneficiaries || []), ...(data.transactions || []).map(t => (t.beneficiary || "").trim())].filter(Boolean))].filter(name=>!(Array.isArray(data.hiddenBeneficiaries)?data.hiddenBeneficiaries:[]).includes(name)).sort((a,b)=>a.localeCompare(b,"pt")); $("#beneficiarySettingsList").innerHTML = list.length ? list.map((name)=>`<div class="beneficiary-setting-row"><span>${esc(name)}</span><button type="button" class="link-button danger" data-remove-beneficiary="${esc(name)}">Remover da lista</button></div>`).join("") : '<p class="muted">Ainda não existem beneficiários memorizados.</p>'; document.querySelectorAll("[data-remove-beneficiary]").forEach((b)=>b.onclick=()=>commit(()=>{ data.savedBeneficiaries=(data.savedBeneficiaries||[]).filter(x=>x!==b.dataset.removeBeneficiary); data.hiddenBeneficiaries=[...new Set([...(Array.isArray(data.hiddenBeneficiaries)?data.hiddenBeneficiaries:[]),b.dataset.removeBeneficiary])]; },"Beneficiário ocultado nas sugestões; histórico preservado.")); };
    $("#addBeneficiarySetting").onclick = () => form("Adicionar beneficiário", field("Nome", "beneficiaryName", "", "text", "required maxlength=160"), (f)=>commit(()=>{ const name=f.get("beneficiaryName").trim(); if(!name) throw Error("Indica um nome."); data.savedBeneficiaries=[...new Set([...(data.savedBeneficiaries||[]),name])]; data.hiddenBeneficiaries=(Array.isArray(data.hiddenBeneficiaries)?data.hiddenBeneficiaries:[]).filter(x=>x!==name); },"Beneficiário guardado."));
    setTimeout(renderBeneficiaries,0); document.addEventListener("click", (e)=>{ if(e.target?.id === "settingsButton" || e.target?.dataset?.view === "settings") setTimeout(renderBeneficiaries,0); });
  }
  spaceOptions();
  const globalButton = document.createElement("div");
  globalButton.className = "inline-global-search";
  globalButton.innerHTML =
    '<label class="inline-search-label"><span aria-hidden="true">⌕</span><input id="inlineGlobalQuery" type="search" aria-label="Pesquisar tudo" placeholder="Pesquisar tudo…" autocomplete="off" aria-controls="inlineGlobalResults"></label><div id="inlineGlobalResults" class="inline-search-results" aria-live="polite" hidden></div>';
  const topSearchSlot = document.getElementById("topSearchSlot");
  (topSearchSlot || $(".workspace-bar")).append(globalButton);
  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        globalSearch();
      }
    },
    true,
  );
  let searchResults = [];
  let searchSpace = key;
  const inlineQuery = globalButton.querySelector("input"),
    inlineResults = globalButton.querySelector("#inlineGlobalResults");
  const inlineUpdate = () => {
    inlineResults.hidden = inlineQuery.value.trim().length < 2;
    inlineResults.innerHTML = inlineResults.hidden
      ? ""
      : searchHTML(inlineQuery.value);
  };
  inlineQuery.oninput = inlineUpdate;
  inlineQuery.onfocus = inlineUpdate;
  inlineQuery.onkeydown = (e) => {
    if (e.key === "Escape") {
      inlineResults.hidden = true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      inlineResults.querySelector("button")?.focus();
    }
  };
  globalButton.addEventListener("keydown", (e) => {
    if (!e.target.closest(".search-result") || inlineResults.hidden) return;
    const buttons = [...inlineResults.querySelectorAll(".search-result")], index = buttons.indexOf(e.target.closest(".search-result"));
    if (e.key === "Escape") { e.preventDefault(); inlineResults.hidden = true; inlineQuery.focus(); return; }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
    buttons[next]?.focus();
  });
  document.addEventListener("click", (e) => {
    if (!globalButton.contains(e.target)) inlineResults.hidden = true;
  });
  function searchHTML(query) {
    searchSpace = key;
    searchResults = L.search(data, query);
    return (
      searchResults
        .map(
          (r, i) =>
            '<button type="button" class="search-result" data-action="global-result" data-id="' +
            i +
            '"><span><b>' +
            esc(r.label) +
            "</b><small>" +
            esc(r.kind) +
            " · " +
            esc(r.detail) +
            '</small></span><span aria-hidden="true">→</span></button>',
        )
        .join("") || "<p>Sem resultados neste espaço.</p>"
    );
  }
  function globalSearch() {
    inlineResults.hidden = true;
    form(
      "Pesquisar neste espaço",
      field(
        "Movimento, conta, objetivo ou documento",
        "globalQuery",
        "",
        "search",
        "autocomplete=off",
      ) +
        '<div id="globalResults" class="life-results" aria-live="polite"><p>Escreve pelo menos dois caracteres.</p></div>',
      () => true,
      "A pesquisa inclui subscrições, bens e investimentos.",
      "Fechar",
    );
    $("#modalContent [name=globalQuery]").oninput = (e) => {
      searchSpace = key;
      searchResults = L.search(data, e.target.value);
      $("#globalResults").innerHTML =
        searchResults
          .map(
            (r, i) =>
              '<button type="button" class="search-result" data-action="global-result" data-id="' +
              i +
              '"><span><b>' +
              esc(r.label) +
              "</b><small>" +
              esc(r.kind) +
              " · " +
              esc(r.detail) +
              '</small></span><span aria-hidden="true">→</span></button>',
          )
          .join("") || "<p>Sem resultados neste espaço.</p>";
    };
  }
  function presentation() {
    const p = data.presentation || {
      theme: "light",
      density: "comfortable",
      hiddenMetrics: [],
    };
    document.body.dataset.theme = p.theme;
    document.body.dataset.density = p.density;
    for (const id of [
      "balanceValue",
      "incomeValue",
      "expenseValue",
      "savingRate",
    ])
      $("#" + id).closest("article").dataset.metricHidden = String(
        p.hiddenMetrics.includes(id),
      );
  }
  const settings = document.createElement("section");
  settings.className = "panel life-settings";
  settings.innerHTML =
    "<h2>O teu espaço de trabalho</h2><p>Escolhe o tema, a densidade e os indicadores do Resumo. Estas preferências pertencem ao espaço aberto.</p>" +
    b("Personalizar apresentação", "life-presentation");
  $("#settings").append(settings);
  const report = document.createElement("section");
  report.className = "panel";
  report.id = "lifeAnnualReport";
  $("#reports").append(report);
  let documentYear = "",
    documentQuery = "",
    documentFrom = "",
    documentTo = "",
    subscriptionHistoryFocus = "",
    documentMin = "",
    documentMax = "",
    documentType = "all";
  function render() {
    if (searchSpace !== key) {
      searchResults = [];
      inlineQuery.value = "";
      inlineResults.hidden = true;
      inlineResults.innerHTML = "";
      searchSpace = key;
    }
    presentation();
    spaceOptions();
    const q = L.quality(data, month),
      forecast = CompleteFinance.estimatedForecast(data, 30),
      reminders = L.reminders(data);
    const qualityFold = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const issueCount = (issue) => {
      if (Number.isFinite(Number(issue?.count)) && Number(issue.count) > 0) return Number(issue.count);
      const match = String(issue?.title || "").match(/^(\d+)/);
      return match ? Number(match[1]) : 1;
    };
    const inboxIssues = PlanningFinance.reviewInbox(data, month).active;
    const duplicateCount = inboxIssues.filter((x) => qualityFold(x.title).includes("duplicado")).length;
    const uncategorizedIssue = q.issues.find((x) => x.kind === "category");
    const uncategorizedCount = uncategorizedIssue ? issueCount(uncategorizedIssue) : 0;
    const staleAccounts = q.issues.filter((x) => x.kind === "account").length;
    const beneficiaryGroups = new Map();
    data.transactions.forEach((t) => {
      const name = String(t.beneficiary || "").trim();
      if (!name) return;
      const key = qualityFold(name);
      if (!beneficiaryGroups.has(key)) beneficiaryGroups.set(key, new Set());
      beneficiaryGroups.get(key).add(name);
    });
    const beneficiaryVariantCount = [...beneficiaryGroups.values()].filter((names) => names.size > 1).length;
    const missingValueCount = Number(q.missingValues || 0);
    const openMonthPenalty = q.issues.some((x) => x.kind === "review") ? 2 : 0;
    const qualityPenalty =
      Math.min(18, duplicateCount * 4) +
      Math.min(18, uncategorizedCount * 2) +
      Math.min(12, staleAccounts * 3) +
      Math.min(10, q.absent.length * 2) +
      Math.min(10, beneficiaryVariantCount * 3) +
      Math.min(25, missingValueCount * 8) +
      openMonthPenalty;
    const qualityScore = Math.max(0, Math.min(100, Math.round(100 - qualityPenalty)));
    const qualityRows = [
      ...q.issues.map((x) => ({
        kind: x.kind || "other",
        title: x.title,
        detail: x.detail || ({ account: "Confirma o saldo para manter o património coerente.", category: "Há movimentos que precisam de uma categoria mais específica.", history: "Existem períodos sem movimentos registados.", review: "O período continua aberto a alterações.", value: "Falta um valor obrigatório numa linha importada ainda por rever." }[x.kind] || "Ponto detetado pela verificação automática."),
        route: x.route,
        count: issueCount(x),
        impact: x.kind === "value" ? "Alto" : ["category", "account"].includes(x.kind) ? "Médio" : "Baixo",
      })),
      ...(duplicateCount ? [{ kind: "duplicate", title: "Movimentos possivelmente duplicados", detail: "Mesmo dia, valor, conta e descrição merecem confirmação antes de apagar.", route: "transactions", count: duplicateCount, impact: "Médio" }] : []),
      ...(beneficiaryVariantCount ? [{ kind: "beneficiary", title: "Beneficiários com nomes semelhantes", detail: "Existem variantes de escrita que podem fragmentar análises por estabelecimento.", route: "transactions", count: beneficiaryVariantCount, impact: "Baixo" }] : []),
    ];
    const kindLabels = { account: "Contas", category: "Sem categoria", history: "Histórico", review: "Fecho", import: "Importações", duplicate: "Duplicado", beneficiary: "Beneficiários", value: "Valores", other: "Outros" };
    const metricCards = [
      ["duplicate", "Movimentos duplicados", duplicateCount, "↔"],
      ["category", "Movimentos sem categoria", uncategorizedCount, "⌁"],
      ["beneficiary", "Beneficiários semelhantes", beneficiaryVariantCount, "◎"],
      ["history", "Meses sem movimentos", q.absent.length, "◷"],
      ["value", "Valores em falta", missingValueCount, "!"],
    ];
    const filterKinds = [["all", "Todos"], ["duplicate", "Duplicados"], ["category", "Sem categoria"], ["beneficiary", "Beneficiários semelhantes"], ["other", "Outros"]];
    const countForFilter = (kind) => {
      if (kind === "all") return qualityRows.reduce((sum, row) => sum + row.count, 0);
      if (kind === "other") return qualityRows.filter((row) => !["duplicate", "category", "beneficiary"].includes(row.kind)).reduce((sum, row) => sum + row.count, 0);
      return qualityRows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.count, 0);
    };
    const scoreClass = qualityScore >= 85 ? "score-good" : qualityScore >= 70 ? "score-warn" : "score-bad";
    quality.innerHTML =
      '<div class="data-section-heading data-quality-heading"><div class="data-section-title"><span class="data-section-icon">✓</span><div><h2>Qualidade de dados</h2><p>Identifica e corrige problemas antes de influenciarem análises, previsões e saldos.</p></div></div><div class="data-section-heading-actions">' +
        b("Ver relatório", "life-navigate", "reports", "secondary data-report-button") +
        b("Executar verificação", "data-quality-refresh", "", "primary data-refresh-button") +
      '</div></div>' +
      '<div class="data-quality-layout"><aside class="data-quality-score"><div class="data-quality-ring ' + scoreClass + '" style="--quality-score:' + qualityScore + '"><div><strong>' + qualityScore + '%</strong><span>Qualidade geral</span><em>' + qualityRows.length + ' ' + (qualityRows.length === 1 ? 'problema' : 'problemas') + ' a rever</em></div></div><p>' + (qualityScore >= 90 ? "Os teus dados estão em muito bom estado." : qualityScore >= 75 ? "A base está consistente, mas ainda há pontos para rever." : "Há vários pontos que merecem revisão para melhorar a consistência.") + '</p><small>O score penaliza apenas problemas reais; linhas ainda por rever ficam na Caixa de entrada.</small></aside><div class="data-quality-main"><div class="data-quality-metrics">' +
        metricCards.map(([kind, label, count, icon]) => '<article class="data-quality-metric metric-' + kind + '" data-quality-jump="' + kind + '"><span class="data-quality-metric-icon">' + icon + '</span><div><strong>' + count + '</strong><span>' + label + '</span></div></article>').join("") +
      '</div><div class="data-quality-toolbar"><div class="data-quality-filters">' +
        filterKinds.map(([kind, label]) => '<button type="button" class="data-filter-chip" data-quality-filter="' + kind + '">' + label + '<span>' + countForFilter(kind) + '</span></button>').join("") +
      '</div><span class="data-quality-lastcheck">Verificação atual · ' + esc(monthLabel(month)) + '</span></div>' +
      '<div class="data-quality-table"><div class="data-quality-th"><span>Tipo</span><span>Descrição</span><span>Ocorrências</span><span>Impacto</span><span>Ações</span></div><div id="dataQualityRows">' +
        qualityRows.map((row) => '<div class="data-quality-tr" data-quality-row data-kind="' + esc(["duplicate", "category", "beneficiary"].includes(row.kind) ? row.kind : "other") + '"><div><span class="data-quality-kind kind-' + esc(row.kind) + '">' + esc(kindLabels[row.kind] || "Outro") + '</span></div><div class="data-quality-description"><b>' + esc(row.title) + '</b><small>' + esc(row.detail) + '</small></div><div class="data-quality-count">' + row.count + '</div><div><span class="data-impact impact-' + row.impact.toLowerCase() + '">' + row.impact + '</span></div><div>' + b("Rever", "life-navigate", row.route, "secondary") + '</div></div>').join("") +
        (qualityRows.length ? "" : '<div class="data-table-empty">Sem alertas nestas verificações. Isto não certifica a exatidão dos extratos.</div>') +
      '</div></div><details class="data-quality-context"><summary><span class="data-quality-context-copy"><b>Contexto das previsões</b><small>Base usada no cálculo atual</small></span><span class="data-quality-context-badge">30 dias</span></summary><div class="data-quality-context-body"><p>' + forecast.baseline.events.length + ' compromissos conhecidos nos próximos 30 dias · despesa variável média estimada: <b>' + eur(forecast.monthlyEstimate) + '/mês</b>.</p><p>' + esc(forecast.assumption) + '</p>' + b("Consultar previsões", "life-navigate", "cashflow") + '</div></details></div></div>';
    const applyQualityFilter = (kind) => {
      document.querySelectorAll("[data-quality-filter]").forEach((button) => button.classList.toggle("active", button.dataset.qualityFilter === kind));
      document.querySelectorAll("[data-quality-row]").forEach((row) => {
        row.hidden = kind !== "all" && row.dataset.kind !== kind && !(kind === "other" && row.dataset.kind === "other");
      });
    };
    document.querySelectorAll("[data-quality-filter]").forEach((button) => button.onclick = () => applyQualityFilter(button.dataset.qualityFilter || "all"));
    document.querySelectorAll("[data-quality-jump]").forEach((card) => card.onclick = () => {
      const kind = card.dataset.qualityJump;
      applyQualityFilter(["duplicate", "category", "beneficiary"].includes(kind) ? kind : "other");
      quality.querySelector(".data-quality-table")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    applyQualityFilter("all");
    window.DataHub?.refresh?.();
    const subscriptionPriceHistory = (subscription) => {
      const rows = [], seen = new Set();
      const addPrice = (date, amount, source = "stored") => {
        if (!F.validDate(date) || !Number.isFinite(+amount)) return;
        const key = `${date}|${F.cents(+amount)}`;
        if (seen.has(key)) return;
        seen.add(key); rows.push({ date, amount: +amount, source });
      };
      for (const price of subscription.prices || []) addPrice(price.date, price.amount, "stored");
      for (const tx of data.transactions || []) {
        if (String(tx.subscriptionId || "") !== String(subscription.id) || tx.type !== "expense") continue;
        addPrice(tx.date, tx.amount, "movement");
      }
      return rows.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
    };
    const subscriptionRows = (data.subscriptions || []).slice().sort((a, b) => {
      const rank = (value) => value === "active" ? 0 : value === "trial" ? 1 : 2;
      return rank(a.status) - rank(b.status) || String(a.name || "").localeCompare(String(b.name || ""), "pt");
    });
    if (!subscriptionHistoryFocus || !subscriptionRows.some((s) => String(s.id) === String(subscriptionHistoryFocus))) {
      subscriptionHistoryFocus = String(subscriptionRows.find((s) => s.status !== "cancelled")?.id || subscriptionRows[0]?.id || "");
    }
    const focusedSubscription = subscriptionRows.find((s) => String(s.id) === String(subscriptionHistoryFocus)) || null;
    const focusedHistory = focusedSubscription ? subscriptionPriceHistory(focusedSubscription).slice().sort((a,b) => b.date.localeCompare(a.date)) : [];
    const lastLinkedCharge = (subscription) => (data.transactions || [])
      .filter((t) => t.type === "expense" && String(t.subscriptionId || "") === String(subscription.id))
      .sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
    const subscriptionStatus = (s) => s.status === "cancelled" ? ["Cancelada", "cancelled"] : s.status === "trial" ? ["Experimental", "trial"] : ["Confirmada", "confirmed"];
    const frequencyLabel = (s) => s.frequency === 'yearly' ? 'Anual' : 'Mensal';
    const subscriptionCard = (s) => {
      const last = lastLinkedCharge(s);
      const [statusLabel, statusClass] = subscriptionStatus(s);
      return `<article class="subscription-table-row" data-subscription-id="${esc(s.id)}">
        <span class="subscription-service-main">${ProviderIcons.html(s.name)}<span class="subscription-service-copy"><b>${esc(s.name)}</b><small>${frequencyLabel(s)} · ${esc(s.category || "Subscrições")}</small></span></span>
        <span class="subscription-service-next"><small>Próxima cobrança</small><b>${dateLabel(s.nextDate)}</b></span>
        <span class="subscription-service-value"><strong class="amount expense">−${eur(s.amount)}</strong><em class="subscription-state ${statusClass}">${statusLabel}</em></span>
        ${s.status!=='cancelled'?b('Cancelar subscrição','life-cancel-subscription',s.id):''}<details class="subscription-actions-menu"><summary aria-label="Ações para ${esc(s.name)}">⋯</summary><div class="subscription-actions">${b("Editar", "life-subscription", s.id)}${b("Associar histórico", "life-subscription-history", s.id)}${b("Histórico", "recurring-history", `subscription~${s.id}`)}${b("Apagar", "life-delete-subscription", s.id)}</div></details>
        <div class="subscription-service-meta">Última cobrança: ${last ? dateLabel(last.date) : "—"}</div>
      </article>`;
    };
    const historyRows = focusedHistory.map((row, index) => {
      const older = focusedHistory[index + 1];
      const delta = older ? F.money(row.amount - older.amount) : 0;
      const pct = older?.amount ? (delta / older.amount) * 100 : 0;
      return `<div class="subscription-history-row"><span>${dateLabel(row.date)}</span><strong>${eur(row.amount)}</strong><span class="${delta > 0 ? "negative" : delta < 0 ? "positive" : ""}">${delta > 0 ? "+" : ""}${eur(delta)}${older ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%)` : ""}</span></div>`;
    });
    const latestPrice = focusedHistory[0];
    const oldestPrice = focusedHistory.at(-1);
    const priceChange = latestPrice && oldestPrice && latestPrice !== oldestPrice && oldestPrice.amount
      ? (latestPrice.amount - oldestPrice.amount) / oldestPrice.amount * 100 : null;
    const priceSummary = latestPrice ? `<div class="subscription-history-summary"><strong>${eur(latestPrice.amount)}</strong><span class="${priceChange > 0 ? "negative" : priceChange < 0 ? "positive" : ""}">${priceChange === null ? "Preço atual" : `${priceChange > 0 ? "↑" : priceChange < 0 ? "↓" : "→"} ${Math.abs(priceChange).toFixed(1).replace(".", ",")}% desde ${dateLabel(oldestPrice.date)}`}</span></div>` : "";
    subscriptions.innerHTML =
      '<div class="subscription-dashboard">' +
        '<div class="subscription-page-head"><div><h3>Os teus serviços</h3><p>Valor, próxima cobrança e estado de cada subscrição.</p></div><div class="subscription-page-actions">' + b("+ Adicionar subscrição", "life-subscription") + '</div></div>' +
        '<section class="subscription-table-card"><div class="subscription-table-body">' +
        (subscriptionRows.length ? subscriptionRows.map(subscriptionCard).join("") : '<div class="subscription-empty">Ainda não tens subscrições registadas.</div>') +
        '</div></section>' +
        '<div class="subscription-lower-grid"><section class="subscription-history-card"><div class="subscription-card-head"><div><h3>Histórico de preços</h3><p>' + (focusedSubscription ? 'Evolução dos valores cobrados por ' + esc(focusedSubscription.name) + '.' : 'Seleciona uma subscrição para consultar o histórico.') + '</p></div>' +
        (subscriptionRows.length ? '<select id="subscriptionHistoryFocus" aria-label="Subscrição do histórico">' + subscriptionRows.map((s) => '<option value="' + esc(s.id) + '"' + (String(s.id) === String(subscriptionHistoryFocus) ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' : '') + '</div>' +
        priceSummary + '<div class="subscription-history-table"><div class="subscription-history-th"><span>Data</span><span>Valor</span><span>Variação</span></div>' +
        (focusedHistory.length ? historyRows.slice(0, 3).join('') : '<p class="subscription-history-empty">Sem histórico associado. Usa “Associar histórico” para ligar cobranças antigas.</p>') + '</div>' +
        (historyRows.length > 3 ? '<details class="subscription-history-more"><summary>Ver histórico completo (' + historyRows.length + ' registos)</summary><div class="subscription-history-table">' + historyRows.slice(3).join('') + '</div></details>' : '') + '</section>' +
        '</div>' +
        (reminders.length ? '<details class="subscription-reminders"><summary>Lembretes (' + reminders.length + ')</summary>' + reminders.map((r) => '<div class="attention-row"><div><b>' + esc(r.name) + '</b><p>' + esc(r.label) + ' · ' + dateLabel(r.date) + (r.overdue ? ' · Data ultrapassada' : '') + '</p></div>' + b('Rever','life-subscription',r.id) + '</div>').join('') + '</details>' : '') +
      '</div>';
    const historyFocus = document.getElementById('subscriptionHistoryFocus');
    if (historyFocus) historyFocus.onchange = () => { subscriptionHistoryFocus = historyFocus.value; render(); };
    assets.innerHTML =
      '<div class="assets-compact-head"><div class="life-toolbar">' +
      b("Adicionar bem", "life-asset") +
      '</div><article class="panel assets-total-card"><span>Avaliação atual dos bens</span><strong class="amount life-number">' +
      eur(L.assetTotal(data)) +
      '</strong></article></div>' +
      '<div class="life-card-grid assets-compact-grid">' +
      data.assets
        .map(
          (a) =>
            '<article class="panel asset-compact-card"><div class="asset-compact-main"><div><h3>' +
            esc(a.name) +
            '</h3><small>' +
            esc(a.kind) +
            '</small></div><strong class="amount life-number">' +
            eur(L.assetValue(a)) +
            '</strong></div><div class="decision-actions asset-compact-actions">' +
            b("Registar avaliação", "life-valuation", a.id) +
            b("Editar", "life-asset", a.id) +
            b("Remover", "life-remove-asset", a.id) +
            '</div><details class="asset-history"><summary>Histórico de avaliações</summary>' +
            a.valuations
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(
                (v) =>
                  '<p class="amount">' +
                  dateLabel(v.date) +
                  " · " +
                  eur(v.value) +
                  "</p>",
              )
              .join("") +
            "</details></article>",
        )
        .join("") +
      "</div><p class=\"muted assets-footnote\">Avaliações manuais, separadas do dinheiro disponível. Não registes o mesmo bem como investimento ou saldo de conta.</p>";
    const perf = L.performance(data);
    investments.innerHTML =
      '<div class="life-toolbar">' +
      button(
        "Nova posição",
        "life-holding",
        "",
        data.investments.length ? "secondary" : "primary",
      ) +
      button(
        "Registar operação",
        "life-trade",
        "",
        data.investments.length ? "primary" : "secondary",
      ) +
      '</div><div class="life-metrics">' +
      metricCard("Valor atual das posições", perf.value) +
      metricCard("Resultado realizado em vendas", perf.realized) +
      metricCard("Dividendos líquidos", perf.dividends) +
      metricCard("Variação ainda não realizada", perf.unrealized) +
      '</div><section class="panel"><h3>Posições</h3>' +
      (!data.investments.length
        ? "<p>Começa por criar uma posição. Se já tens investimentos, indica as unidades e o custo de aquisição atuais.</p>"
        : "") +
      data.investments
        .map(
          (i) =>
            '<div class="attention-row"><div><b>' +
            esc(i.name) +
            "</b><p>" +
            (i.units === undefined
              ? "Unidades iniciais por definir"
              : i.units + " unidades") +
            ' · <span class="amount">Custo: ' +
            eur(i.cost) +
            " · Valor: " +
            eur(i.value) +
            "</span></p></div>" +
            b("Editar posição / avaliação", "life-holding", i.id) +
            "</div>",
        )
        .join("") +
      '</section><section class="panel"><h3>Operações</h3>' +
      data.investmentTrades
        .slice()
        .reverse()
        .map(
          (t) =>
            '<div class="attention-row"><div><b>' +
            esc(data.investments.find((i) => i.id === t.investmentId).name) +
            " · " +
            { buy: "Compra", sell: "Venda", dividend: "Dividendo" }[t.kind] +
            '</b><p class="amount">' +
            dateLabel(t.date) +
            " · Fluxo na conta: " +
            eur(t.net) +
            " · Comissão: " +
            eur(t.fee) +
            "</p></div>" +
            '<details class="trade-details"><summary>Detalhes</summary><p>' +
            (t.kind === "dividend"
              ? "Dividendo bruto: " + eur(t.gross)
              : t.units + " unidades a " + eur(t.price)) +
            "</p><p>Resultado realizado: " +
            eur(t.realized) +
            "</p>" +
            b("Reverter operação", "life-undo-trade", t.id) +
            "</details>" +
            "</div>",
        )
        .join("") +
      (!data.investmentTrades.length
        ? "<p>Ainda não há operações registadas. Adicionar uma posição inicial não cria movimentos na conta.</p>"
        : "") +
      "<p>Compras e vendas movem dinheiro através de ajustes ligados à posição; não contam como despesa de consumo ou rendimento bruto. Dividendos líquidos contam como receita. Resultados usam custo médio e não calculam impostos.</p></section>";
    renderDocuments();
    if (view === 'reports') {
    const annual = L.annualReport(data, document.getElementById('reportYear')?.value || month.slice(0, 4)),
      pct = (value) => value === null || !Number.isFinite(value) ? "sem base" : `${value >= 0 ? "+" : ""}${Math.round(value)}%`,
      maxMonthlyExpense = Math.max(1, ...annual.months.map((m) => m.expense)),
      maxCategory = Math.max(1, ...annual.categorySeries.flatMap((c) => c.months));
    const annualReportWasOpen = report.querySelector('.annual-report-details')?.open || false;
    report.innerHTML =
      "<h2>O teu ano em perspetiva</h2><p>Relatório do ano " +
      annual.year +
      ', com comparação, tendências, categorias e património observado.</p><div class="decision-actions">' +
      b("Ver e imprimir relatório anual", "life-annual-print") +
      b("Exportar relatório HTML", "life-annual-export") +
      b("Registar acontecimento", "life-year-note") +
      '</div><div class="annual-analytics-metrics">' +
      '<article><span>Receitas médias / mês</span><strong class="amount">' + eur(annual.averageIncome) + '</strong><small>Até ao período comparável</small></article>' +
      '<article><span>Despesas médias / mês</span><strong class="amount">' + eur(annual.averageExpense) + '</strong><small>Até ao período comparável</small></article>' +
      '<article><span>Diferença acumulada</span><strong class="amount ' + (annual.ytdIncome - annual.ytdExpense >= 0 ? 'positive' : 'negative') + '">' + eur(annual.ytdIncome - annual.ytdExpense) + '</strong><small>Receitas − despesas</small></article>' +
      '<article><span>Património observado</span><strong class="amount ' + (annual.wealthChange >= 0 ? 'positive' : 'negative') + '">' + (annual.wealthByMonth.length > 1 ? (annual.wealthChange >= 0 ? '+' : '') + eur(annual.wealthChange) : '—') + '</strong><small>' + (annual.wealthByMonth.length > 1 ? 'Variação entre registos do ano' : 'Faltam pelo menos 2 registos') + '</small></article>' +
      '</div>' +
      '<details class="annual-report-details"><summary>Explorar relatório anual</summary><div class="annual-report-detail-content">' +
      '<div class="annual-analysis-grid">' +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Ano vs. ano anterior</h3><p>Mesmo número de meses para uma comparação justa.</p></div></div>' +
      '<div class="annual-comparison"><div><span>Receitas</span><b>' + eur(annual.ytdIncome) + '</b><small>' + pct(annual.yearChange.incomePct) + ' vs. ' + annual.previousYear.year + '</small></div><div><span>Despesas</span><b>' + eur(annual.ytdExpense) + '</b><small class="' + ((annual.yearChange.expensePct || 0) > 0 ? 'negative' : 'positive') + '">' + pct(annual.yearChange.expensePct) + ' vs. ' + annual.previousYear.year + '</small></div></div></section>' +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Regulares vs. ocasionais</h3><p>' + (annual.regularVsOccasional.until ? 'Período: ' + esc(monthLabel(annual.regularVsOccasional.from)) + ' a ' + esc(monthLabel(annual.regularVsOccasional.until)) + '. ' : 'Sem meses acumulados neste ano. ') + 'Regulares incluem recorrências, subscrições, dívidas e despesas marcadas como fixas.</p></div></div><div class="expense-mix"><div class="expense-mix-bar"><i style="width:' + annual.regularVsOccasional.regularPct + '%"></i></div><div class="annual-comparison"><div><span>Regulares</span><b>' + eur(annual.regularVsOccasional.regular) + '</b><small>' + annual.regularVsOccasional.regularPct + '% das despesas</small></div><div><span>Ocasionais</span><b>' + eur(annual.regularVsOccasional.occasional) + '</b><small>' + (annual.ytdExpense ? 100 - annual.regularVsOccasional.regularPct : 0) + '% das despesas</small></div></div></section>' +
      '</div>' +
      '<div class="annual-analysis-grid annual-analysis-grid-balanced">' +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Evolução mensal</h3><p>Receitas e despesas registadas em cada mês.</p></div></div><div class="annual-month-bars">' +
      annual.months.map((m) => '<div class="annual-month-bar"><div class="annual-bar-pair"><i class="income" style="height:' + Math.max(2, (m.income / Math.max(1, ...annual.months.map(x => Math.max(x.income, x.expense)))) * 100) + '%" title="Receitas: ' + eur(m.income) + '"></i><i class="expense" style="height:' + Math.max(2, (m.expense / Math.max(1, ...annual.months.map(x => Math.max(x.income, x.expense)))) * 100) + '%" title="Despesas: ' + eur(m.expense) + '"></i></div><small>' + monthLabel(m.month).slice(0,3) + '</small></div>').join('') +
      '</div><div class="annual-chart-legend"><span><i class="income"></i>Receitas</span><span><i class="expense"></i>Despesas</span></div></section>' +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Principais categorias</h3><p>Como as categorias com mais despesa evoluíram ao longo do ano.</p></div></div>' +
      (annual.categorySeries.length ? '<div class="category-trend-list">' + annual.categorySeries.map((c) => '<div class="category-trend-row"><div><b>' + esc(c.category) + '</b><small>' + eur(c.total) + ' no ano</small></div><div class="category-spark">' + c.months.map((v) => '<i style="height:' + Math.max(3, (v / maxCategory) * 100) + '%" title="' + eur(v) + '"></i>').join('') + '</div></div>').join('') + '</div>' : '<p>Ainda não existem despesas suficientes para mostrar categorias.</p>') +
      '</section></div>' +
      '<div class="annual-analysis-grid">' +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Despesas a aumentar</h3><p>Média dos últimos 3 meses disponíveis vs. os 3 anteriores.</p></div></div>' +
      (annual.risingCategories.length ? annual.risingCategories.map((c) => '<div class="annual-rise-row"><div><b>' + esc(c.category) + '</b><small>' + eur(c.previousAverage) + ' → ' + eur(c.recentAverage) + ' / mês</small></div><strong class="negative">+' + eur(c.change) + '</strong></div>').join('') : '<p>Não há aumentos consistentes suficientes para destacar.</p>') + '</section>' +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Previsão de fim do mês</h3><p>Combina ritmo observado com compromissos conhecidos ainda por registar.</p></div></div>' +
      (annual.forecast ? '<div class="annual-forecast"><div><span>Receitas projetadas</span><b>' + eur(annual.forecast.income) + '</b></div><div><span>Despesas projetadas</span><b>' + eur(annual.forecast.expense) + '</b></div><div><span>Diferença projetada</span><b class="' + (annual.forecast.balance >= 0 ? 'positive' : 'negative') + '">' + eur(annual.forecast.balance) + '</b></div></div><small>Estimativa baseada em ' + annual.forecast.elapsedDays + ' de ' + annual.forecast.daysInMonth + ' dias; não é uma garantia.</small>' : '<p>A previsão só é apresentada para o ano atual.</p>') + '</section></div>' +
      (annual.wealthByMonth.length ? '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Património líquido ao longo do tempo</h3><p>Usa apenas os retratos que guardaste; não inventa valores entre datas.</p></div></div><div class="wealth-year-line">' + annual.wealthByMonth.map((h) => '<div><i class="' + (h.net < 0 ? 'negative' : '') + '" style="height:' + Math.max(4, Math.abs(h.net) / Math.max(1, ...annual.wealthByMonth.map(x => Math.abs(x.net))) * 100) + '%"></i><small>' + h.date.slice(5,7) + '</small><b>' + eur(h.net) + '</b></div>').join('') + '</div></section>' : '') +
      '<section class="panel annual-analysis-card"><div class="annual-card-head"><div><h3>Acontecimentos do ano</h3><p>Notas que ajudam a explicar mudanças fora dos números.</p></div></div>' +
      (data.yearNotes.filter((n) => n.date.startsWith(annual.year)).map((n) => '<div class="attention-row"><div><b>' + dateLabel(n.date) + ' · ' + esc(n.title) + '</b><p>' + esc(n.description) + '</p></div>' + b("Remover", "life-remove-note", n.id) + '</div>').join('') || '<p>Sem acontecimentos registados neste ano.</p>') + '</section></div></details>';
    report.querySelector('.annual-report-details').open = annualReportWasOpen;
    }
    let overview = $("#lifeOverview");
    if (!overview) {
      overview = document.createElement("div");
      overview.id = "lifeOverview";
      overview.className = "life-overview";
      $("#decisionPanel").after(overview);
    }
    overview.innerHTML =
      b(q.issues.length + " pontos de revisão", "life-navigate", "qualityHub") +
      b(
        reminders.length + " lembretes de subscrições",
        "life-navigate",
        "subscriptionsHub",
      );
  }
  let selectedDocument='';
  function openDocument(id) {
    const t = find("transactions", id);
    if (!t?.attachment) return notice("Este movimento já não tem comprovativo.", true);
    selectedDocument = t.id;
    documentYear = documentQuery = documentFrom = documentTo = documentMin = documentMax = "";
    documentType = "all";
    renderDocuments();
    navigate("documentsHub");
  }

  function renderDocuments() {
    const filtersOpen=docs.querySelector('.document-filter-toggle')?.open||false,queryFocused=document.activeElement?.name==='documentQuery',queryCursor=queryFocused?document.activeElement.selectionStart:null;
    const records = L.documents(data, {
      year: documentYear,
      query: documentQuery,
      from: documentFrom,
      to: documentTo,
      min: documentMin,
      max: documentMax,
      type: documentType,
    });
    const eligible = data.transactions
      .filter((t) => ["income", "expense"].includes(t.type) && t.receiptRequired === true && !t.attachment)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const total = records.reduce((n, t) => n + (+t.amount || 0), 0);
    const pdfs = records.filter((t) => t.attachment?.type === "application/pdf").length;
    const images = records.length - pdfs;
    const sizeLabel = (bytes) => {
      bytes = Number(bytes) || 0;
      if (!bytes) return "";
      if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
      return (bytes / 1024 / 1024).toFixed(1).replace(".0", "") + " MB";
    };
    docs.innerHTML =
      '<div class="panel documents-panel"><div class="panel-heading documents-heading"><div><h2>Comprovativos</h2><p>Arquivo pesquisável dos ficheiros associados aos movimentos. PDFs são guardados no formato original; abrir, guardar uma cópia ou exportar não altera os saldos.</p></div></div>' +
      '<div class="document-metrics"><article><span>Na seleção</span><strong>' + records.length + '</strong><small>comprovativos</small></article><article><span>Valor associado</span><strong>' + eur(total) + '</strong><small>dos movimentos</small></article><article><span>PDF / imagem</span><strong>' + pdfs + ' / ' + images + '</strong><small>ficheiros</small></article><article><span>Sem comprovativo</span><strong>' + eligible.length + '</strong><small>movimentos</small></article></div>' +
      '<div class="document-filter-grid">' +
      field("Pesquisa", "documentQuery", documentQuery, "search", 'placeholder="Loja, artigo, texto da fatura ou ficheiro"') +
      field("Ano", "documentYear", documentYear, "text", 'inputmode="numeric" maxlength="4" placeholder="Todos"') +
      field("De", "documentFrom", documentFrom, "date") +
      field("Até", "documentTo", documentTo, "date") +
      field("Valor mín. (€)", "documentMin", documentMin, "number", 'min="0" step="0.01"') +
      field("Valor máx. (€)", "documentMax", documentMax, "number", 'min="0" step="0.01"') +
      select("Tipo", "documentType", [["all","Todos"],["pdf","PDF"],["image","Imagem"]], documentType) +
      '</div><div class="decision-actions document-toolbar">' +
      b("Limpar filtros", "life-doc-clear") +
      b("Exportar seleção em ZIP", "life-doc-zip") +
      '</div>' +
      (records.length ? '<div id="documentRows" class="document-list">' + records.map((t) => {
        const a = t.attachment || {};
        const type = a.type === "application/pdf" ? "PDF" : "Imagem";
        const entity = t.documentEntity || t.receiptMerchant || t.beneficiary || t.description;
        const meta = [dateLabel(t.date), entity, eur(t.amount), type, sizeLabel(a.size)].filter(Boolean).join(" · ");
        return '<div class="attention-row document-row"><div class="document-main"><div class="document-title"><span class="document-type-badge ' + (type === "PDF" ? 'pdf' : 'image') + '">' + type + '</span><b>' + esc(a.name || "Comprovativo") + '</b></div><p>' + esc(meta) + '</p></div><div class="decision-actions">' +
          b("Abrir", "receipt", t.id) +
          b("Guardar cópia", "life-doc-save", t.id) +
          b("Movimento", "life-doc-movement", t.id) +
          b("Entidade", "life-doc-entity", t.id) +
          '</div></div>';
      }).join("") + '</div>' : '<div class="empty">Nenhum comprovativo corresponde aos filtros.</div>') +
      '<details class="documents-missing"><summary>Movimentos sem comprovativo <span class="pill">' + eligible.length + '</span></summary><p>Apenas movimentos com “Pedir fatura” ativo e sem ficheiro anexado. Arrasta um PDF ou imagem para o movimento, ou anexa aqui.</p><div>' +
      eligible.slice(0, 30).map((t) => '<div class="attention-row"><div><b>' + esc(t.description) + '</b><p>' + dateLabel(t.date) + ' · ' + esc(t.account) + ' · ' + eur(t.amount) + '</p></div><div class="decision-actions">' + b("Anexar", "attach-receipt", t.id) + b("Ver movimento", "life-doc-movement", t.id) + '</div></div>').join("") +
      (eligible.length > 30 ? '<p class="muted">A mostrar os 30 movimentos mais recentes sem comprovativo.</p>' : '') +
      '</div></details></div>';

    const rows=docs.querySelectorAll('#documentRows>.document-row');
    if(rows.length){
      const library=document.createElement('div');library.className='document-library';
      const list=document.createElement('div');list.className='document-library-list';list.setAttribute('aria-label','Comprovativos guardados');list.innerHTML='<h3 class="document-library-title">Comprovativos guardados</h3>';
      const inspector=document.createElement('aside');inspector.className='document-inspector';inspector.setAttribute('aria-label','Comprovativo selecionado');
      const previews=document.createElement('div'),owned=document.createElement('div');previews.className='document-preview';owned.className='document-selected-actions';const heading=document.createElement('div');heading.className='document-inspector-heading';heading.innerHTML='<h3>Comprovativo selecionado</h3><p>Consulta o original e as ações do registo.</p>';inspector.append(heading,previews,owned);
      docs.querySelector('#documentRows').before(library);library.append(list,inspector);
      const entries=[...rows].map((row,i)=>{const tx=records[i],button=document.createElement('button');button.type='button';button.className='document-select';button.dataset.documentSelect=tx.id;button.innerHTML='<b>'+esc(tx.documentEntity||tx.receiptMerchant||tx.beneficiary||tx.description)+'</b><span>'+dateLabel(tx.date)+' · '+eur(tx.amount)+'</span><small>'+esc(tx.attachment?.name||'Comprovativo')+'</small>';list.append(button);owned.append(row);return {row,button,tx};});
      const select=(id)=>{selectedDocument=id;previews.replaceChildren();for(const e of entries){const active=e.tx.id===id;e.row.hidden=!active;e.button.setAttribute('aria-pressed',String(active));if(active){const a=e.tx.attachment,valid=/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(a?.data||'');if(valid){const media=document.createElement(a.type==='application/pdf'?'iframe':'img');if(media.tagName==='IFRAME')media.title='Pré-visualização de '+(a.name||'PDF');else media.alt='Comprovativo de '+e.tx.description;media.src=a.data;previews.append(media);}else{const p=document.createElement('p');p.textContent='Pré-visualização indisponível. Usa Abrir para consultar o ficheiro.';previews.append(p);}}}};
      entries.forEach((e,i)=>{e.button.onclick=()=>select(e.tx.id);e.button.onkeydown=event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const n=event.key==='Home'?0:event.key==='End'?entries.length-1:Math.max(0,Math.min(entries.length-1,i+(event.key==='ArrowDown'?1:-1)));select(entries[n].tx.id);entries[n].button.focus();};});
      select(entries.some(e=>e.tx.id===selectedDocument)?selectedDocument:entries[0].tx.id);
      docs.querySelector('#documentRows').remove();
    }
    const filterGrid=docs.querySelector('.document-filter-grid');
    if(filterGrid){const queryField=filterGrid.querySelector('[name=documentQuery]').closest('label'),filterToggle=document.createElement('details'),summary=document.createElement('summary'),toolbar=docs.querySelector('.document-toolbar');summary.textContent='Filtros';filterToggle.className='document-filter-toggle';filterToggle.append(summary);const extraFilters=document.createElement('div');extraFilters.className='document-extra-filters';[...filterGrid.children].filter(n=>n!==queryField).forEach(n=>extraFilters.append(n));filterToggle.append(extraFilters);filterGrid.append(filterToggle);if(toolbar)filterGrid.append(toolbar);}
    if(docs.querySelector('.document-filter-toggle'))docs.querySelector('.document-filter-toggle').open=filtersOpen;
    if(queryFocused){const q=docs.querySelector('[name=documentQuery]');q?.focus({preventScroll:true});q?.setSelectionRange(queryCursor,queryCursor);}
    const rerenderOnChange = (name, setter, event = "change") => {
      const el = docs.querySelector(`[name=${name}]`);
      if (!el) return;
      el.addEventListener(event, (e) => { setter(e.target.value); renderDocuments(); });
    };
    rerenderOnChange("documentYear", (v) => (documentYear = v));
    rerenderOnChange("documentFrom", (v) => (documentFrom = v));
    rerenderOnChange("documentTo", (v) => (documentTo = v));
    rerenderOnChange("documentMin", (v) => (documentMin = v));
    rerenderOnChange("documentMax", (v) => (documentMax = v));
    rerenderOnChange("documentType", (v) => (documentType = v));
    const query = docs.querySelector('[name=documentQuery]');
    if (query) {
      let timer;
      query.addEventListener("input", (e) => {
        documentQuery = e.target.value;
        clearTimeout(timer);
        timer = setTimeout(renderDocuments, 180);
      });
    }
    window.ReceiptAssistanceUI?.refreshDocuments();
  }
  function reportHTML() {
    const r = L.annualReport(data, document.getElementById('reportYear')?.value || month.slice(0, 4)),
      amount = eur;
    return (
      '<!doctype html><html lang="pt"><meta charset="utf-8"><title>Equilíbrio — ' +
      r.year +
      "</title><style>body{font:16px/1.6 system-ui;color:#173b35;max-width:900px;margin:40px auto;padding:24px}h1{font-size:38px}h2{margin-top:32px}table{width:100%;border-collapse:collapse}td,th{padding:9px;text-align:left;border-bottom:1px solid #ddd}th:last-child,td:last-child{text-align:right}small{color:#526770}@media print{@page{margin:18mm}body{margin:0;padding:0;font-size:11pt}tr{break-inside:avoid}}</style><body><small>Equilíbrio · " +
      esc(registry.find((s) => s.key === key)?.name || "Pessoal") +
      " · Preparado em " +
      dateLabel(F.today()) +
      "</small><h1>O teu ano " +
      r.year +
      "</h1><p>Receitas: <b>" +
      amount(r.income) +
      "</b> · Despesas líquidas: <b>" +
      amount(r.expense) +
      "</b> · Diferença: <b>" +
      amount(r.income - r.expense) +
      "</b></p><p>Média mensal no período comparável: receitas <b>" +
      amount(r.averageIncome) +
      "</b> · despesas <b>" +
      amount(r.averageExpense) +
      "</b>.</p><p>Comparação com " +
      r.previousYear.year +
      ": receitas " +
      (r.yearChange.incomePct === null ? "sem base" : (r.yearChange.incomePct >= 0 ? "+" : "") + Math.round(r.yearChange.incomePct) + "%") +
      " · despesas " +
      (r.yearChange.expensePct === null ? "sem base" : (r.yearChange.expensePct >= 0 ? "+" : "") + Math.round(r.yearChange.expensePct) + "%") +
      ".</p><p>Despesas regulares: <b>" + amount(r.regularVsOccasional.regular) +
      "</b> · ocasionais: <b>" + amount(r.regularVsOccasional.occasional) +
      "</b>.</p><p>" +
      r.closed +
      " meses fechados. Os restantes podem ainda precisar de revisão.</p><h2>Mês a mês</h2><table><tr><th>Mês</th><th>Receitas</th><th>Despesas</th></tr>" +
      r.months
        .map(
          (m) =>
            "<tr><td>" +
            monthLabel(m.month) +
            "</td><td>" +
            amount(m.income) +
            "</td><td>" +
            amount(m.expense) +
            "</td></tr>",
        )
        .join("") +
      "</table><h2>Despesas por categoria</h2><table>" +
      r.categories
        .map(
          ([name, value]) =>
            "<tr><td>" + esc(name) + "</td><td>" + amount(value) + "</td></tr>",
        )
        .join("") +
      "</table><h2>Património observado</h2>" +
      (r.history.length
        ? "<p>Primeira observação: " +
          dateLabel(r.history[0].date) +
          " · " +
          amount(r.history[0].net) +
          "</p><p>Última observação: " +
          dateLabel(r.history[r.history.length - 1].date) +
          " · " +
          amount(r.history[r.history.length - 1].net) +
          "</p>"
        : "<p>Não existem observações guardadas neste ano.</p>") +
      "<p>As observações disponíveis não reconstituem os dias sem registo.</p>" +
      (r.forecast ? "<h2>Previsão de fim do mês</h2><p>Receitas projetadas: <b>" + amount(r.forecast.income) + "</b> · despesas projetadas: <b>" + amount(r.forecast.expense) + "</b> · diferença projetada: <b>" + amount(r.forecast.balance) + "</b>.</p><p><small>Estimativa baseada no ritmo observado e nos compromissos conhecidos ainda por registar.</small></p>" : "") +
      "<h2>Operações de investimento do ano</h2><p>Compras: " +
      amount(r.performance.purchases) +
      " · Vendas: " +
      amount(r.performance.sales) +
      " · Dividendos líquidos: " +
      amount(r.performance.dividends) +
      " · Comissões: " +
      amount(r.performance.fees) +
      "</p><p>Resultado realizado das vendas: " +
      amount(r.performance.realized) +
      ". Sem cálculo de impostos.</p><h2>Acontecimentos</h2>" +
      (r.notes
        .map(
          (n) =>
            "<h3>" +
            dateLabel(n.date) +
            " · " +
            esc(n.title) +
            "</h3><p>" +
            esc(n.description) +
            "</p>",
        )
        .join("") || "<p>Sem acontecimentos registados.</p>") +
      "<h2>Objetivos atuais</h2><p>Estado atual, não uma reconstrução do fim do ano.</p><table>" +
      data.goals
        .map(
          (g) =>
            "<tr><td>" +
            esc(g.name) +
            "</td><td>" +
            amount(g.current) +
            " / " +
            amount(g.target) +
            "</td></tr>",
        )
        .join("") +
      "</table></body></html>"
    );
  }
  function subscriptionHistoryPreviewHtml(rows, selected = new Set()) {
    if (!rows.length)
      return '<p class="muted recurring-history-empty">Não encontrei movimentos nesta categoria e período com os filtros atuais.</p>';
    return '<div class="recurring-history-filter-summary"><b>' + rows.length + ' movimento' + (rows.length === 1 ? '' : 's') + ' encontrado' + (rows.length === 1 ? '' : 's') + '</b><span>Seleciona apenas os pagamentos antigos que pertencem a esta subscrição. Nenhum saldo será recalculado.</span></div>' +
      '<div class="subscription-history-tools"><span class="subscription-history-selection-count" data-subscription-history-selection-count>0 selecionados</span><button type="button" class="secondary" data-subscription-history-likely>Selecionar prováveis</button><button type="button" class="link-button" data-subscription-history-clear>Limpar seleção</button></div>' +
      '<div class="recurring-history-filter-list">' + rows.map((candidate) => {
        const already = candidate.alreadyLinked;
        const checked = already || selected.has(String(candidate.transactionId));
        return '<label class="recurring-history-candidate recurring-history-filter-row' + (already ? ' already-linked' : '') + '"><input type="checkbox" data-subscription-history-row value="' + esc(candidate.transactionId) + '"' + (checked ? ' checked' : '') + (already ? ' disabled' : '') + '><span><b>' + esc(candidate.description || 'Movimento') + '</b><small>' + dateLabel(candidate.date) + ' · ' + eur(candidate.amount) + ' · ' + esc(candidate.account || '—') + (candidate.beneficiary ? ' · ' + esc(candidate.beneficiary) : '') + (already ? ' · já associado' : candidate.sameAccount ? '' : ' · conta diferente') + '</small></span></label>';
      }).join('') + '</div>';
  }
  function bindSubscriptionHistoryPreview(existing) {
    const preview = document.querySelector('#subscriptionHistoryPreview');
    if (!preview) return () => [];
    const selected = new Set();
    let currentRows = [];
    const fold = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-PT')
      .trim();
    const rowText = (row) => fold([row.description, row.beneficiary, row.account, row.category].filter(Boolean).join(' '));
    const harvest = () => {
      preview.querySelectorAll('[data-subscription-history-row]:checked:not(:disabled)').forEach((input) => selected.add(String(input.value)));
      preview.querySelectorAll('[data-subscription-history-row]:not(:checked):not(:disabled)').forEach((input) => selected.delete(String(input.value)));
      return [...selected];
    };
    const draft = () => ({
      id: existing?.id || '__new-subscription__',
      name: document.querySelector('#modalContent [name="name"]')?.value || '',
      amount: +(document.querySelector('#modalContent [name="amount"]')?.value || 0),
      frequency: document.querySelector('#modalContent [name="frequency"]')?.value || 'monthly',
      nextDate: document.querySelector('#modalContent [name="nextDate"]')?.value || F.today(),
      account: document.querySelector('#modalContent [name="account"]')?.value || '',
      category: document.querySelector('#modalContent [name="category"]')?.value || 'Subscrições',
      renewalDay: +(document.querySelector('#modalContent [name="nextDate"]')?.value || '').slice(8) || existing?.renewalDay || 1,
    });
    const dayDistance = (a, b) => {
      if (!F.validDate(a) || !F.validDate(b)) return Infinity;
      return Math.abs(Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000));
    };
    const syncSelectionUi = () => {
      preview.querySelectorAll('[data-subscription-history-row]:not(:disabled)').forEach((input) => {
        input.checked = selected.has(String(input.value));
      });
      const count = preview.querySelector('[data-subscription-history-selection-count]');
      if (count) count.textContent = selected.size + ' selecionado' + (selected.size === 1 ? '' : 's');
    };
    const selectLikely = (event) => {
      event?.preventDefault?.();
      harvest();
      for(const row of currentRows)if(row.likely&&!row.alreadyLinked&&!row.blocked)selected.add(String(row.transactionId));
      syncSelectionUi();
    };
    const clearSelection = (event) => {
      event?.preventDefault?.();
      selected.clear();
      syncSelectionUi();
    };
    const bindPreviewControls = () => {
      const likelyButton = preview.querySelector('[data-subscription-history-likely]');
      const clearButton = preview.querySelector('[data-subscription-history-clear]');
      if (likelyButton) likelyButton.onclick = selectLikely;
      if (clearButton) clearButton.onclick = clearSelection;
      preview.querySelectorAll('[data-subscription-history-row]:not(:disabled)').forEach((input) => {
        input.onchange = () => {
          if (input.checked) selected.add(String(input.value));
          else selected.delete(String(input.value));
          syncSelectionUi();
        };
      });
      syncSelectionUi();
    };
    const refresh = (harvestCurrent = true) => {
      if (harvestCurrent === true || harvestCurrent?.type) harvest();
      try {
        const from = document.querySelector('#modalContent [name="historyFrom"]')?.value || '';
        if (!F.validDate(from)) throw Error('Escolhe uma data inicial válida.');
        const query = fold(document.querySelector('#modalContent [name="historySearch"]')?.value || '');
        const currentDraft = draft();
        const identity = fold(currentDraft.name);
        const sameAccountOnly = Boolean(document.querySelector('#modalContent [name="historySameAccount"]')?.checked);
        const result = F.subscriptionHistoryCandidates(data, currentDraft, from, F.today());
        let rows = result.rows;
        if (sameAccountOnly) rows = rows.filter((row) => row.sameAccount || row.alreadyLinked);
        if (query) rows = rows.filter((row) => rowText(row).includes(query));
        else rows = rows.filter((row) => row.sameCategory || row.alreadyLinked || row.identityMatch);
        currentRows = rows;
        preview.innerHTML = subscriptionHistoryPreviewHtml(rows, selected);
        bindPreviewControls();
      } catch (error) {
        currentRows = [];
        preview.innerHTML = '<p class="muted recurring-history-empty">' + esc(error.message || 'Não foi possível filtrar o histórico.') + '</p>';
      }
    };
    for (const name of ['historyFrom','historySearch','frequency','nextDate','account','category','amount','name']) {
      const input = document.querySelector('#modalContent [name="' + name + '"]');
      input?.addEventListener('input', refresh);
      input?.addEventListener('change', refresh);
    }
    document.querySelector('#modalContent [name="historySameAccount"]')?.addEventListener('change', refresh);
    refresh(false);
    return harvest;
  }
  function openSubscriptionForm(id, focusHistory = false) {
    const s = find('subscriptions', id);
    const sameCategoryDates = data.transactions
      .filter((t) => t.type === 'expense' && F.categoryPath(t.category || '') === F.categoryPath(s?.category || 'Subscrições'))
      .map((t) => t.date).filter(F.validDate).sort();
    const defaultFrom = s?.historyLinkedFrom || sameCategoryDates[0] || `${F.today().slice(0,4)}-01-01`;
    form(
      s ? 'Editar subscrição' : 'Adicionar subscrição',
      field('Nome', 'name', s?.name || '', 'text', 'required maxlength=100') +
        number('Valor contratado', 'amount', s?.amount || 0) +
        select('Frequência', 'frequency', [['monthly','Mensal'],['yearly','Anual']], s?.frequency || 'monthly') +
        field('Próxima renovação', 'nextDate', s?.nextDate || F.today(), 'date', 'required') +
        select('Estado', 'status', [['active','Ativa'],['trial','Período experimental'],['cancelled','Cancelada']], s?.status || 'active') +
        field('Fim do período experimental', 'trialEnd', s?.trialEnd || '', 'date') +
        select('Conta para pagamento', 'account', data.accounts.filter((a) => !a.archived || a.name === s?.account).map((a) => a.name), s?.account || data.accounts.find((a) => !a.archived)?.name || '') +
        field('Categoria', 'category', s?.category || 'Subscrições', 'text', 'required maxlength=80') +
        field('Antecedência do lembrete (dias)', 'reminderDays', s?.reminderDays ?? 7, 'number', 'required min=0 max=90') +
        '<details class="subscription-history-linker"' + (focusHistory ? ' open' : '') + '><summary>Associar movimentos antigos</summary><p class="muted">Filtra por período, conta e texto. A pesquisa procura no nome/descrição, beneficiário, categoria/subcategoria e conta, mesmo quando a categoria antiga é diferente.</p>' +
        '<div class="two-cols">' + field('Procurar desde', 'historyFrom', defaultFrom, 'date', 'required max="' + F.today() + '"') + field('Pesquisar descrição / beneficiário', 'historySearch', '', 'search', 'placeholder="Ex.: Netflix"') + '</div>' +
        '<label class="checkbox"><input type="checkbox" name="historySameAccount"> Mostrar apenas a conta selecionada</label><div id="subscriptionHistoryPreview" class="recurring-history-preview" aria-live="polite"></div></details>',
      (f) => {
        const selected = harvestHistory();
        let linked = [];
        const ok = commit(() => {
          const entry = L.subscription(data, Object.fromEntries(f), id);
          if (selected.length) {
            linked = F.linkSubscriptionHistorySelection(data, entry.id, selected);
            entry.historyLinkedFrom = f.get('historyFrom');
          }
        }, s ? 'Subscrição atualizada.' : 'Subscrição criada.');
        if (ok && linked.length) notice(linked.length + ' movimento' + (linked.length === 1 ? '' : 's') + ' histórico' + (linked.length === 1 ? '' : 's') + ' associado' + (linked.length === 1 ? '' : 's') + '. Os saldos não foram alterados.');
        return ok;
      },
      'A subscrição alimenta automaticamente a Agenda; confirmar a ocorrência cria o movimento real. Associar histórico apenas liga movimentos já existentes.',
    );
    const harvestHistory = bindSubscriptionHistoryPreview(s);
    if (focusHistory) {
      requestAnimationFrame(() => {
        document.querySelector('#subscriptionHistoryPreview [data-subscription-history-likely]')?.click();
      });
    }
  }
  Object.assign(actions, {
    "life-navigate": (id) => navigate(id),
    "data-quality-refresh": () => {
      window.renderEquilibrio?.();
      window.DataHub?.show?.("quality");
      notice("Verificação de qualidade atualizada.");
    },
    "global-result": (index) => {
      if (searchSpace !== key) return;
      const r = searchResults[+index];
      if (!r) return;
      inlineResults.hidden = true;
      inlineQuery.value = "";
      $("#modal").close();
      if (r.kind === "Movimento") return openMovement(r.id);
      if (r.kind === "Comprovativo") return openDocument(r.id);
      if (r.kind === "Compra Casa") {
        if (!data.casa?.purchases.some(p => String(p.id) === String(r.id)))
          return notice("Esta compra já não existe neste espaço.", true);
        navigate("casaPurchases");
        return CasaUI.openPurchase(r.id);
      }
      if (!window.UnifiedWorkspaceUI?.openRecord(r.kind, r.id))
        notice("Este registo já não está disponível neste espaço.", true);
    },
    "life-subscription": (id) => openSubscriptionForm(id, false),
    "life-subscription-history": (id) => openSubscriptionForm(id, true),
    "life-cancel-subscription": (id) => {
      const s=find("subscriptions",id);if(!s||s.status==='cancelled')return;
      form('Cancelar subscrição','<p>Cancelar <strong>'+esc(s.name)+'</strong> no Equilíbrio?</p><p>As cobranças futuras deixam de aparecer na Agenda. Os movimentos e o histórico de preços mantêm-se.</p><p>Esta ação não cancela o contrato junto do fornecedor. Para reativar, usa Editar e escolhe o estado Ativa.</p>',()=>commit(()=>L.subscription(data,{...s,status:'cancelled'},id),'Subscrição cancelada; histórico preservado.'),'','Confirmar cancelamento');
    },
    "life-delete-subscription": (id) => {
      const s = find("subscriptions", id);
      if (!s) return;
      if (!confirm(`Apagar a subscrição ${s.name}? Os movimentos já registados são preservados; deixam apenas de ser criadas ocorrências futuras na Agenda.`)) return;
      commit(() => { data.subscriptions = data.subscriptions.filter((x) => String(x.id) !== String(id)); }, "Subscrição apagada. Os movimentos históricos foram preservados.");
    },
    "life-renew": (id) =>
      commit(
        () => L.renew(data, id),
        "Data de renovação avançada. Nenhum pagamento foi lançado.",
      ),
    "life-asset": (id) => {
      const a = find("assets", id);
      simple(
        a ? "Editar bem" : "Adicionar bem",
        field("Nome", "name", a?.name || "", "text", "required maxlength=100") +
          field(
            "Tipo de bem",
            "kind",
            a?.kind || "Imóvel",
            "text",
            "required",
          ) +
          (!a
            ? number("Avaliação inicial", "value", 0) +
              field("Data da avaliação", "date", F.today(), "date", "required")
            : ""),
        (f) => {
          if (a) {
            find("assets", id).name = f.get("name").trim();
            find("assets", id).kind = f.get("kind").trim();
          } else {
            const newAsset = {
              id: F.id(),
              name: f.get("name").trim(),
              kind: f.get("kind").trim(),
              valuations: [],
            };
            data.assets.push(newAsset);
            L.valuation(data, newAsset.id, f.get("date"), +f.get("value"));
          }
        },
      );
    },
    "life-valuation": (id) =>
      simple(
        "Registar avaliação",
        number("Valor estimado", "value", L.assetValue(find("assets", id))) +
          field("Data", "date", F.today(), "date", "required"),
        (f) => L.valuation(data, id, f.get("date"), +f.get("value")),
        "Uma avaliação na mesma data substitui a anterior, ficando registada no histórico de alterações.",
      ),
    "life-remove-asset": (id) =>
      commit(() => (data.assets = data.assets.filter((a) => a.id !== id))),
    "life-holding": (id) => {
      const i = find("investments", id);
      simple(
        i ? "Editar posição" : "Nova posição",
        field("Nome", "name", i?.name || "", "text", "required") +
          field("Tipo", "type", i?.type || "Fundo") +
          field(
            "Unidades atuais",
            "units",
            i?.units ?? 0,
            "number",
            "required min=0 step=0.00000001",
          ) +
          number("Custo da posição atual", "cost", i?.cost || 0) +
          number("Valor de mercado atual", "value", i?.value || 0),
        (f) => {
          const next = {
            ...i,
            id: id || F.id(),
            name: f.get("name").trim(),
            type: f.get("type"),
            units: +f.get("units"),
            cost: +f.get("cost"),
            value: +f.get("value"),
          };
          if (id)
            data.investments[data.investments.findIndex((x) => x.id === id)] =
              next;
          else data.investments.push(next);
        },
        "Para começar a negociar uma posição existente, define as unidades e o custo atuais. Esta edição não movimenta dinheiro.",
      );
    },
    "life-trade": () =>
      simple(
        "Registar operação de investimento",
        select(
          "Posição",
          "investmentId",
          data.investments.map((i) => [i.id, i.name]),
        ) +
          select("Operação", "kind", [
            ["buy", "Compra"],
            ["sell", "Venda"],
            ["dividend", "Dividendo"],
          ]) +
          field(
            "Unidades (ignorado em dividendos)",
            "units",
            1,
            "number",
            "min=0 step=0.00000001 required",
          ) +
          number("Preço por unidade / dividendo bruto", "price", 0, 0.01) +
          number("Comissão", "fee", 0) +
          select(
            "Conta de dinheiro",
            "account",
            data.accounts
              .filter(
                (a) =>
                  !a.archived &&
                  !["Cartão", "Cartão de crédito"].includes(a.type),
              )
              .map((a) => [a.name, a.name]),
          ) +
          field("Data", "date", F.today(), "date", "required"),
        (f) => L.trade(data, Object.fromEntries(f)),
        "Usa a conta de dinheiro que suportou a operação. Confirma o valor e a comissão do extrato.",
      ),
    "life-undo-trade": (id) =>
      commit(() => L.undoTrade(data, id), "Operação revertida."),
    "life-doc-entity": (id) => {
      const t = find("transactions", id);
      simple(
        "Entidade do comprovativo",
        field(
          "Entidade",
          "entity",
          t.documentEntity || t.receiptMerchant || t.beneficiary || t.description,
          "text",
          "required maxlength=120",
        ),
        (f) => {
          if (data.closedMonths.includes(t.date.slice(0, 7)))
            throw Error("Reabre o mês antes de alterar o documento.");
          find("transactions", id).documentEntity = f.get("entity").trim();
        },
      );
    },
    "life-doc-clear": () => {
      documentYear = documentQuery = documentFrom = documentTo = documentMin = documentMax = "";
      documentType = "all";
      renderDocuments();
    },
    "life-doc-movement": (id) => openMovement(id),
    "life-doc-save": async (id) => {
      const attachment = find("transactions", id)?.attachment;
      if (!attachment) return notice("Este movimento já não tem comprovativo.", true);
      if (window.financasDesktop?.saveAttachment) {
        try {
          const result = await window.financasDesktop.saveAttachment(attachment);
          if (result?.canceled) return;
          notice("Cópia do comprovativo guardada.");
          return;
        } catch (error) {
          return notice(error?.message || "Não foi possível guardar a cópia.", true);
        }
      }
      const encoded = String(attachment.data || "");
      if (!/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/.test(encoded))
        return notice("Comprovativo inválido ou formato não suportado.", true);
      const raw = atob(encoded.split(",")[1]);
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      download(bytes, attachment.name || "comprovativo", attachment.type || "application/octet-stream");
    },
    "life-doc-zip": () => {
      const records = L.documents(data, {
        year: documentYear, query: documentQuery, from: documentFrom, to: documentTo,
        min: documentMin, max: documentMax, type: documentType,
      });
      if (!records.length) return notice("Não há documentos nesta seleção.");
      const files = records.map((t, i) => {
        const encoded = t.attachment.data;
        if (
          typeof encoded !== "string" ||
          !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/.test(encoded)
        )
          throw Error("Um comprovativo tem um formato não suportado.");
        return {
          name:
            String(i + 1).padStart(4, "0") +
            "-" +
            t.attachment.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100),
          bytes: Uint8Array.from(atob(encoded.split(",")[1]), (c) =>
            c.charCodeAt(0),
          ),
        };
      });
      const rows = [
        "ficheiro;data;entidade;movimento;valor",
        ...records.map((t, i) =>
          [
            files[i].name,
            t.date,
            t.documentEntity || t.receiptMerchant || t.beneficiary || t.description,
            t.description,
            Number(t.amount || 0).toFixed(2),
          ]
            .map((value) => '"' + String(value).replace(/"/g, '""') + '"')
            .join(";"),
        ),
      ];
      files.push({
        name: "indice.csv",
        bytes: new TextEncoder().encode("\ufeff" + rows.join("\r\n")),
      });
      download(
        L.zip(files),
        "documentos-" + (documentYear || "todos") + ".zip",
        "application/zip",
      );
    },
    "life-presentation": () => {
      const p = data.presentation || {
        theme: "light",
        density: "comfortable",
        hiddenMetrics: [],
      };
      simple(
        "Personalizar apresentação",
        select(
          "Tema",
          "theme",
          [
            ["light", "Claro"],
            ["dark", "Escuro"],
          ],
          p.theme,
        ) +
          select(
            "Densidade",
            "density",
            [
              ["comfortable", "Confortável"],
              ["compact", "Compacta"],
            ],
            p.density,
          ) +
          "<fieldset><legend>Indicadores no Resumo</legend>" +
          [
            ["balanceValue", "Saldo"],
            ["incomeValue", "Receitas"],
            ["expenseValue", "Despesas"],
            ["savingRate", "Taxa de poupança"],
          ]
            .map(
              ([id, label]) =>
                '<label class="checkbox"><input type="checkbox" name="' +
                id +
                '" ' +
                (!p.hiddenMetrics.includes(id) ? "checked" : "") +
                " /> " +
                label +
                "</label>",
            )
            .join("") +
          "</fieldset>",
        (f) =>
          (data.presentation = {
            theme: f.get("theme"),
            density: f.get("density"),
            hiddenMetrics: [
              "balanceValue",
              "incomeValue",
              "expenseValue",
              "savingRate",
            ].filter((id) => !f.has(id)),
          }),
      );
    },
    "life-annual-export": () =>
      download(
        reportHTML(),
        "equilibrio-relatorio-" + month.slice(0, 4) + ".html",
        "text/html",
      ),
    "life-annual-print": () => {
      const html = reportHTML();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      $("#printReport").innerHTML = parsed.body.innerHTML;
      document.body.classList.add("printing-report");
      window.print();
    },
    "life-year-note": () =>
      simple(
        "Acontecimento do ano",
        field("Título", "title", "", "text", "required maxlength=120") +
          field("Data", "date", F.today(), "date", "required") +
          field("Descrição", "description", "", "text", "maxlength=1000"),
        (f) =>
          data.yearNotes.push({
            id: F.id(),
            title: f.get("title").trim(),
            date: f.get("date"),
            description: f.get("description"),
          }),
      ),
    "life-remove-note": (id) =>
      commit(
        () => (data.yearNotes = data.yearNotes.filter((n) => n.id !== id)),
      ),
  });
  const prior = PremiumUI.render;
  const tradeForm = actions["life-trade"];
  actions["life-trade"] = () => {
    if (!data.investments.length)
      return notice("Cria primeiro uma posição para registar operações.", true);
    if (
      !data.accounts.some(
        (a) => !a.archived && !["Cartão", "Cartão de crédito"].includes(a.type),
      )
    )
      return notice(
        "Adiciona primeiro uma conta de dinheiro ativa em Contas.",
        true,
      );
    return tradeForm();
  };
  PremiumUI.render = () => {
    prior();
    render();
  };
  window.LifeUI = {
    render,
    openDocument,
    reportHTML,
    switchSpace,
    spaces: () => registry.slice(),
    activeSpace: () => ({ ...registry.find((s) => s.key === key) }),
    moveBetweenSpaces: (targetId, options, beforeSource, beforeTarget) => {
      assertSpaceWritable();
      const from=registry.find(s=>s.key===key),to=registry.find(s=>s.id===targetId);
      if(!to||to.id===from.id)throw Error('Escolhe outro espaço.');
      const source=readPersistedSpace(from),target=readPersistedSpace(to);
      if(JSON.stringify(source)!==beforeSource||JSON.stringify(target)!==beforeTarget)throw Error('Um dos espaços mudou. Volta a pré-visualizar.');
      const result=SpaceTransfer.prepare(source,target,options);
      commitSpaceCatalog(registry,{[from.key]:result.source,[to.key]:result.target});
      undoState=null;window.renderEquilibrio();return result;
    },
    readSpace: (id) => {
      const s = registry.find((s) => s.id === id);
      if (!s) throw Error("Espaço inexistente.");
      return readPersistedSpace(s);
    },
    exportSpaces: () => ({
      format: "equilibrio-spaces",
      version: 1,
      exportedAt: new Date().toISOString(),
      backupMetadata: BackupInfo.stamp("Todos os espaços"),
      spaces: registry.map((s) => ({
        name: s.name,
        data: readPersistedSpace(s),
      })),
    }),
    importSpaces: (raw) => {
      if (registryBroken || !CompleteUI.canWrite() || storageProblem)
        throw Error("Não é possível restaurar espaços nesta janela.");
      const sources = PlanningFinance.unpack(raw),
        created = [];
      if (
        localStorage.getItem(key) === null &&
        !commit(() => {}, "Espaço atual guardado.")
      )
        throw Error("Não foi possível proteger o espaço atual.");
      const supplied = {};
        for (const source of sources) {
          const id = F.id(),
            entry = {
              id,
              name: source.name.slice(0, 80) + " (recuperado)",
              key: "equilibrioData:" + id,
            };
          supplied[entry.key] = source.data;
          created.push(entry);
        }
      commitSpaceCatalog([...registry, ...created], supplied);
      return created.length;
    },
    restoreCopy: async (raw, prepared = false, info = {}) => {
      assertSpaceWritable();
      const target = { ...registry.find(s => s.key === key) }, atKey = key;
      const before = JSON.stringify(readPersistedSpace(target));
      if (!prepared && window.financasDesktop?.isDesktop) {
        const result = await window.financasDesktop.migrateJson(JSON.stringify(raw), JSON.stringify(LifeUI.exportSpaces()));
        raw = JSON.parse(result.content);
      }
      const bundle = raw.format === 'equilibrio-spaces' ? raw : {format:'equilibrio-spaces',version:1,spaces:[{name:raw.spaceName || 'Cópia individual',data:raw}]};
      const provenance=BackupInfo.describe(raw,info.filename);
      const sources = PlanningFinance.unpack(bundle);
      if (key !== atKey) throw Error('O espaço mudou durante a leitura. Abre novamente a cópia.');
      const initial = Math.max(0, sources.findIndex(s => s.name === target.name));
      form('Restaurar cópia',
        '<div class="restore-copy-origin"><b>'+esc(provenance.filename||'Cópia de segurança')+'</b><span>'+esc(provenance.origin)+' · '+esc(provenance.device)+'</span><small>'+esc(provenance.createdAt?new Date(provenance.createdAt).toLocaleString('pt-PT'):'Data não indicada')+'</small></div>'+select('Espaço da cópia','restoreSource',sources.map((s,i)=>[String(i),s.name]),String(initial)) +
        select('Destino','restoreDestination',[['replace','Substituir '+target.name],['new','Criar espaços recuperados']],'replace') +
        '<div id="restoreSpacePreview" role="status"></div><label class="checkbox"><input name="confirmReplaceSpace" type="checkbox" required> Confirmo substituir todos os dados do espaço atual pelos dados escolhidos</label>',
        values => {
          if (key !== atKey || JSON.stringify(readPersistedSpace(target)) !== before) throw Error('O espaço foi alterado. Abre novamente a cópia antes de substituir.');
          if(values.get('restoreDestination') === 'new') { const count=LifeUI.importSpaces(bundle);notice(count+' espaços recuperados.');return true; }
          if(!values.has('confirmReplaceSpace')) throw Error('Confirma a substituição do espaço atual.');
          const source=sources[Number(values.get('restoreSource'))];if(!source)throw Error('Seleciona um espaço válido da cópia.');
          // The native migration path already made a consistent safety backup.
          if(!window.financasDesktop?.isDesktop)localStorage.setItem('equilibrioBeforeRestore:'+target.id,before);
          commitSpaceCatalog(registry,{[atKey]:source.data});
          undoState=null;
          try{const result=window.financasDesktop?.isDesktop?window.financasDesktop.removeDraft(atKey):(localStorage.removeItem('equilibrioDraft:'+atKey),true);if(result?.error)throw Error(result.error);}catch(e){notice('Espaço substituído; não foi possível limpar o rascunho anterior: '+e.message,true);}
          window.renderEquilibrio();notice('Todos os dados de '+target.name+' foram substituídos.');return true;
        },'Os outros espaços são preservados. Existe uma cópia de segurança do estado anterior.','Restaurar');
      const draw=()=>{const create=$('[name=restoreDestination]').value==='new',source=sources[Number($('[name=restoreSource]').value)],confirm=$('[name=confirmReplaceSpace]');confirm.required=!create;confirm.closest('label').hidden=create;$('#restoreSpacePreview').innerHTML=create?'<p>Cria '+sources.length+' espaços novos sem substituir os atuais.</p>':'<p><b>'+esc(source.name)+'</b> · '+source.data.accounts.length+' contas · '+source.data.transactions.length+' movimentos · '+source.data.debts.length+' créditos.</p><p>Substitui integralmente <b>'+esc(target.name)+'</b>, mantendo o nome e o espaço atual.</p>'+(window.WorkflowsUI?.backupComparison(source.data)||'');};
      $('[name=restoreSource]').onchange=draw;$('[name=restoreDestination]').onchange=draw;draw();
    },
  };
  if (!window.equilibrioStartup?.awaitingChoice) render();
})();
