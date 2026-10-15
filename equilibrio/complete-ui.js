/* Complete workflows, attached to the five-area product shell. */
(function () {
  "use strict";
  const C = CompleteFinance,
    P = FinancePlus;
  const make = (id, host, title) => {
    const el = document.createElement("section");
    el.id = id;
    el.className = "panel complete-panel";
    el.innerHTML = "<h2>" + title + '</h2><div class="complete-content"></div>';
    $(host).append(el);
    return el.querySelector(".complete-content");
  };
  const statementHost = make(
      "statementWorkbench",
      "#review",
      "Conferir o extrato linha a linha",
    ),
    cardHost = make("cardWorkbench", "#debts", "Cartões e compras parceladas"),
    annualHost = make("annualWorkbench", "#planningPlus", "Plano anual"),
    scenarioHost = make(
      "scenarioWorkbench",
      "#cashflow",
      "Estimativas e cenários guardados",
    ),
    goalHost = make(
      "priorityWorkbench",
      "#goals",
      "Prioridades e contribuições",
    ),
    categoryHost = make(
      "categoryWorkbench",
      "#settings",
      "Categorias e regras",
    ),
    auditHost = make("auditWorkbench", "#activity", "Antes e depois");
  // v0.20: o módulo específico de cartões/compras parceladas deixa de fazer parte
  // da interface. Os dados antigos são preservados para não perder histórico.
  cardHost.closest("section")?.remove();
  // A previsão ganha uma segunda coluna útil com os cenários guardados.
  const scenarioPanel = scenarioHost.closest("section"),
    cashflowGrid = document.querySelector("#cashflow .report-grid");
  if (scenarioPanel && cashflowGrid) {
    scenarioPanel.classList.add("forecast-scenarios-panel");
    cashflowGrid.append(scenarioPanel);
  }
  // Categorias e regras ficam num bloco expansível/colapsável.
  const categoryPanel = categoryHost.closest("section");
  if (categoryPanel && !categoryPanel.querySelector(".category-workbench-disclosure")) {
    const title = categoryPanel.querySelector(":scope > h2"),
      details = document.createElement("details");
    details.className = "category-workbench-disclosure";
    details.open = true;
    details.innerHTML = '<summary><span><b>Categorias e regras</b><small>Subcategorias, arquivo e regras automáticas</small></span></summary>';
    if (title) details.append(title);
    details.append(categoryHost);
    categoryPanel.append(details);
  }
  const btn = (text, action, id = "") => button(text, action, id, "secondary compact-action");
  let filters = { category: "", tag: "", min: "", max: "", start: "", end: "" },
    writer = !navigator.locks,
    release;
  if (navigator.locks)
    navigator.locks
      .request(
        "equilibrio-single-writer",
        { ifAvailable: true },
        async (lock) => {
          writer = !!lock;
          if (!lock) {
            notice(
              "Outra janela está a editar. Esta janela fica em modo de leitura.",
              true,
            );
            return;
          }
          await new Promise((r) => (release = r));
        },
      )
      .catch(() => {
        writer = false;
        notice("Não foi possível obter acesso exclusivo para editar.", true);
      });
  window.addEventListener("pagehide", () => release?.());
  const extra = document.createElement("div");
  extra.className = "advanced-search";
  $("#transactions .movement-table-toolbar").append(extra);
  extra.innerHTML =
    '<details><summary>Filtros</summary><div class="filter-grid">' +
    field("Categoria", "filterCategory") +
    field("Valor mínimo", "filterMin", "", "number", "min=0 step=0.01") +
    field("Valor máximo", "filterMax", "", "number", "min=0 step=0.01") +
    "</div>" +
    '<div class="advanced-search-actions">' +
    btn("Guardar vista", "save-view") +
    btn("Limpar filtros", "clear-filters") +
    '</div><div id="savedViewsList"></div></details>';
  const keys = ["category", "min", "max"];
  extra.querySelectorAll("input").forEach(
    (el, i) =>
      (el.oninput = () => {
        filters[keys[i]] = el.value;
        api.visibleRows = 100;
        window.resetTransactionPage?.();
        renderTransactions();
      }),
  );
  extra.querySelector('.filter-grid').append($('#transactions .movement-date-range'));
  const accountToggle=document.createElement('button');accountToggle.type='button';accountToggle.className='secondary movement-sidebar-toggle';accountToggle.textContent='Contas e categorias';accountToggle.setAttribute('aria-expanded','true');accountToggle.onclick=()=>{const collapsed=$('#transactions').classList.toggle('movement-sidebar-collapsed');accountToggle.setAttribute('aria-expanded',String(!collapsed));};extra.before(accountToggle);
  const privacy = document.createElement("button");
  privacy.id = "privacyToggle";
  privacy.type = "button";
  privacy.className = "secondary";
  privacy.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  privacy.setAttribute("aria-label", "Ocultar valores");
  privacy.title = "Ocultar valores";
  privacy.setAttribute("aria-pressed", "false");
  privacy.onclick = () => {
    const on = document.body.classList.toggle("private-values");
    privacy.setAttribute("aria-label", on ? "Mostrar valores" : "Ocultar valores");
    privacy.title = on ? "Mostrar valores" : "Ocultar valores";
    privacy.setAttribute("aria-pressed", String(on));
  };
  (document.getElementById("topFinanceSlot") || $(".workspace-bar")).append(privacy);
  function accountOptions(cards = false) {
    return data.accounts
      .filter(
        (a) =>
          !a.archived && (cards ? a.type === "Cartão" : a.type !== "Cartão"),
      )
      .map((a) => [a.id, a.name]);
  }
  function simple(title, fields, fn, help = "") {
    form(title, fields, (f) => commit(() => fn(f)), help);
  }
  function reloadFilters() {
    extra
      .querySelectorAll("input[name]")
      .forEach((el, i) => (el.value = filters[keys[i]] || ""));
    renderTransactions();
  }
  function render() {
    $("#savedViewsList").innerHTML = data.savedViews
      .map(
        (v) =>
          btn(esc(v.name), "load-view", v.id) +
          btn("Apagar vista", "remove-view", v.id),
      )
      .join("");
    statementHost.innerHTML =
      "<p>Prepara o CSV no assistente. Depois, confere cada linha sem lançar novamente movimentos já existentes.</p>" +
      btn("Conferir linhas preparadas", "prepare-statement") +
      data.statements
        .map((s) => {
          const pending = s.rows.filter((r) => r.status === "pending");
          const safeCount = pending.filter((r) => C.safeCandidate(data, r.source)).length;
          return (
            '<details open class="statement-review"><summary>' +
            esc(s.name) +
            " · " +
            pending.length +
            " por resolver" +
            (safeCount ? " · " + safeCount + " correspondência" + (safeCount === 1 ? " segura" : "s seguras") : "") +
            "</summary>" +
            (safeCount
              ? '<div class="statement-bulk-actions"><span>O valor, a conta, a data e o beneficiário apontam para movimentos já existentes.</span>' +
                btn(
                  "Associar seguras (" + safeCount + ")",
                  "link-statement-safe",
                  s.id,
                ) +
                "</div>"
              : "") +
            s.rows
              .map((r) => {
                const t = r.source,
                  matches = C.candidateMatches(data, t),
                  top = matches[0],
                  safe = C.safeCandidate(data, t),
                  candidate = top?.transaction,
                  candidateHtml =
                    r.status === "pending" && candidate
                      ? '<div class="statement-match statement-match-' +
                        esc(safe ? "high" : top.confidence) +
                        '"><b>' +
                        (safe ? "Correspondência muito provável" : "Possível correspondência") +
                        "</b><span>" +
                        dateLabel(candidate.date) +
                        " · " +
                        esc(candidate.beneficiary || candidate.description) +
                        " · " +
                        eur(candidate.amount) +
                        "</span><small>" +
                        esc(top.reason) +
                        "</small></div>"
                      : "";
                return (
                  '<div class="attention-row statement-row"><div class="statement-row-main"><b>' +
                  esc(t.beneficiary || t.description) +
                  "</b><p>" +
                  dateLabel(t.date) +
                  " · " +
                  esc(t.account) +
                  ' · <span class="amount">' +
                  eur(t.amount) +
                  "</span></p><small>" +
                  {
                    pending: "Por conferir",
                    added: "Movimento criado",
                    linked: "Associado a movimento existente",
                    ignored: "Ignorado",
                  }[r.status] +
                  "</small>" +
                  candidateHtml +
                  '</div><div class="decision-actions">' +
                  (r.status === "pending"
                    ? (safe
                        ? btn(
                            "Associar",
                            "link-statement-direct",
                            s.id + "~" + r.id + "~" + safe.transaction.id,
                          )
                        : matches.length
                          ? btn(
                              matches.length === 1 ? "Ver correspondência" : "Ver opções (" + matches.length + ")",
                              "link-statement",
                              s.id + "~" + r.id,
                            )
                          : "") +
                      btn(
                        "Criar movimento",
                        "add-statement",
                        s.id + "~" + r.id,
                      ) +
                      btn("Ignorar", "ignore-statement", s.id + "~" + r.id)
                    : "") +
                  "</div></div>"
                );
              })
              .join("") +
            "</details>"
          );
        })
        .join("");
    cardHost.innerHTML =
      '<p>A compra é despesa no cartão. O pagamento à conta do cartão é transferência, sem repetir a despesa. As prestações repartem o pagamento dessa compra.</p><div class="decision-actions">' +
      btn("Novo cartão", "new-card") +
      btn("Compra parcelada", "card-purchase") +
      btn("Pagar cartão / juros", "card-payment") +
      btn("Transferência com comissão", "fee-transfer") +
      "</div>" +
      data.accounts
        .filter((a) => a.type === "Cartão")
        .map(
          (a) =>
            '<div class="attention-row"><b>' +
            esc(a.name) +
            '</b><span class="amount">' +
            eur(-a.balance) +
            " em dívida</span><small>Fecho: dia " +
            a.closingDay +
            " · Vencimento: dia " +
            a.dueDay +
            "</small></div>",
        )
        .join("") +
      data.installmentPlans
        .map(
          (p) =>
            "<details><summary>" +
            esc(p.description) +
            "</summary>" +
            p.payments
              .map(
                (x) =>
                  '<div class="attention-row"><span>' +
                  dateLabel(x.date) +
                  ' · <span class="amount">' +
                  eur(x.amount - x.paid) +
                  "</span> por pagar</span>" +
                  (x.paid < x.amount
                    ? btn(
                        "Pagar prestação",
                        "pay-installment",
                        p.id + "~" + x.id,
                      )
                    : "Liquidada") +
                  "</div>",
              )
              .join("") +
            "</details>",
        )
        .join("");
    const annualYear = month.slice(0, 4),
      annualRows = C.annual(data, annualYear),
      annualPlans = data.annualPlans.slice().sort((a, b) => a.month - b.month || a.name.localeCompare(b.name, "pt")),
      annualTotal = annualPlans.reduce((n, p) => n + (+p.amount || 0), 0),
      annualReserveTotal = data.reserves.reduce((n, r) => n + Math.max(0, (+r.target || 0) - (+r.saved || 0)), 0),
      annualReserveEffort = data.reserves.reduce((n, r) => n + Math.max(0, (+r.target || 0) - (+r.saved || 0)) / Math.max(1, +r.months || 12), 0),
      annualActual = (plan) => {
        const prefix = `${annualYear}-${String(plan.month).padStart(2, "0")}`,
          category = plan.category || "Outros";
        return F.expenseEntries(data, prefix)
          .filter((t) => t.category === category || t.category?.startsWith(category + " / "))
          .reduce((n, t) => n + (+t.amount || 0), 0);
      };
    annualHost.innerHTML =
      "<p>Despesas sazonais previstas. Não são movimentos nem se somam automaticamente às recorrências.</p>" +
      '<div class="annual-actions">' + btn("Planear despesa anual", "annual-plan") + "</div>" +
      '<div class="annual-summary-grid">' +
      metric("Com mês definido", eur(annualTotal)) +
      metric("Por reservar", eur(annualReserveTotal)) +
      metric("Esforço mensal das reservas", eur(annualReserveEffort)) +
      "</div>" +
      (data.reserves.length
        ? '<h3 class="annual-subheading">Reservas em curso</h3><div class="annual-reserve-list">' + data.reserves.map((r) => {
            const remaining = Math.max(0, (+r.target || 0) - (+r.saved || 0));
            return `<div class="annual-reserve-row"><div><b>${esc(r.name)}</b><small>${eur(r.saved || 0)} reservados de ${eur(r.target || 0)}</small></div><div><span>Falta <b>${eur(remaining)}</b></span><span>Sugestão <b>${eur(remaining / Math.max(1, +r.months || 12))}/mês</b></span></div></div>`;
          }).join("") + "</div>"
        : '<p class="muted annual-no-reserves">Ainda não existem reservas anuais em curso.</p>') +
      '<h3 class="annual-subheading">Despesas com mês definido</h3>' +
      (annualPlans.length
        ? '<div class="annual-plan-list">' +
          annualPlans.map((plan) => {
            const actual = annualActual(plan),
              monthKey = `${annualYear}-${String(plan.month).padStart(2, "0")}`;
            return `<div class="annual-plan-row"><div><b>${esc(plan.name)}</b><small>${esc(monthLabel(monthKey))} · ${esc(plan.category || "Outros")}</small></div><div class="annual-plan-values"><span>Previsto <b>${eur(plan.amount)}</b></span><span>Real na categoria <b>${eur(actual)}</b></span></div>${btn("Remover", "remove-annual", plan.id)}</div>`;
          }).join("") +
          "</div>"
        : '<div class="empty annual-empty"><p>Ainda não tens despesas anuais planeadas.</p><small>Usa “Planear despesa anual” para indicar, por exemplo, seguros, impostos, férias ou outras despesas que acontecem uma ou poucas vezes por ano.</small></div>') +
      '<details class="annual-monthly-overview"><summary>Ver resumo dos 12 meses</summary><div class="annual-grid">' +
      annualRows.map((m) =>
        `<div><b>${monthLabel(m.month)}</b><p class="amount">Previsto: ${eur(m.planned)}</p><small>Despesas registadas no mês: ${eur(m.actual)}</small></div>`,
      ).join("") +
      "</div></details>";
    scenarioHost.innerHTML =
      '<div class="decision-actions">' +
      btn("Ver previsão com despesas habituais", "estimated-forecast") +
      btn("Guardar novo cenário", "save-scenario") +
      "</div>" +
      data.scenarios
        .map(
          (s) =>
            '<div class="attention-row"><b>' +
            esc(s.name) +
            '</b><span class="amount">' +
            eur(s.amount) +
            "</span>" +
            btn("Comparar com situação atual", "compare-scenario", s.id) +
            btn("Apagar", "remove-scenario", s.id) +
            "</div>",
        )
        .join("");
    goalHost.innerHTML =
      "<p>A contribuição planeada não retira dinheiro da conta. Confirma os valores já reservados no objetivo.</p>" +
      data.goals
        .slice()
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map(
          (g) =>
            '<div class="attention-row"><b>' +
            esc(g.name) +
            '</b><span class="amount">' +
            eur(g.monthlyContribution ?? P.monthlySuggestion(g)) +
            "/mês</span>" +
            btn("Prioridade e contribuição", "goal-priority", g.id) +
            "</div>",
        )
        .join("") +
      '<p class="amount">Contribuições pretendidas: ' +
      eur(
        sum(data.goals, (g) => g.monthlyContribution ?? P.monthlySuggestion(g)),
      ) +
      "/mês · Disponibilidade estimada: " +
      eur(Math.max(0, P.spendingRoom(data, data.safetyMargin || 0).available)) +
      "</p>";
    categoryHost.innerHTML =
      '<div class="decision-actions">' +
      btn("Renomear / fundir categoria", "merge-category") +
      btn("Arquivar categoria", "archive-category") +
      btn("Pré-visualizar regras no histórico", "preview-rules") +
      "</div>" +
      data.rules
        .map(
          (r) =>
            '<div class="attention-row"><span>' +
            esc(r.match) +
            " → " +
            esc(r.category) +
            "</span>" +
            btn("Prioridade / estado", "rule-priority", r.id) +
            "</div>",
        )
        .join("") +
      data.categoryArchive
        .map(
          (c) =>
            "<p>" +
            esc(c.name) +
            " · Arquivada " +
            btn("Reativar", "reactivate-category", c.id) +
            "</p>",
        )
        .join("");
    auditHost.innerHTML = data.activity
      .slice(-30)
      .reverse()
      .map(
        (a) =>
          "<details><summary>" +
          esc(a.message) +
          " · " +
          new Date(a.at).toLocaleString("pt-PT") +
          "</summary>" +
          a.changes
            .map(
              (c) =>
                "<details><summary>" +
                esc(c.name) +
                '</summary><div class="audit-diff"><div><b>Antes</b><pre>' +
                esc(JSON.stringify(c.before, null, 2)) +
                "</pre></div><div><b>Depois</b><pre>" +
                esc(JSON.stringify(c.after, null, 2)) +
                "</pre></div></div></details>",
            )
            .join("") +
          "</details>",
      )
      .join("");
  }
  function drill(kind, category) {
    let entries =
      kind === "income"
        ? data.transactions.filter(
            (t) =>
              t.date.startsWith(month) && t.type === "income" && !t.refundOf,
          )
        : F.expenseEntries(data, month).filter(
            (t) => !category || t.category === category,
          );
    form(
      category
        ? "Movimentos: " + esc(category)
        : kind === "income"
          ? "Origem das receitas"
          : "Composição das despesas",
      '<p class="amount">Total: ' +
        eur(sum(entries, (t) => t.amount)) +
        "</p>" +
        entries
          .map(
            (t) =>
              '<div class="attention-row"><span>' +
              dateLabel(t.date) +
              " · " +
              esc(t.description) +
              " · " +
              esc(t.category) +
              '</span><span class="amount">' +
              eur(t.amount) +
              "</span></div>",
          )
          .join(""),
      () => true,
      "Valores por categoria incluem repartições e reembolsos.",
      "Concluir",
    );
  }
  function renderAllForChart() {
    filters = {};
    $("#typeFilter").value = "all";
    $("#accountFilter").value = "";
    $("#periodFilter").value = "month";
    $("#searchTransactions").value = "";
    window.renderEquilibrio();
    navigate("transactions");
  }
  const closingAction = $("#closeMonth").onclick;
  $("#closeMonth").onclick = () => {
    if (
      !data.closedMonths.includes(month) &&
      data.statements.some((s) =>
        s.rows.some(
          (r) => r.status === "pending" && r.source.date.startsWith(month),
        ),
      )
    )
      return notice(
        "Há linhas de extrato por conferir neste mês. Resolve-as antes de fechar.",
        true,
      );
    if (data.closedMonths.includes(month)) return closingAction();
    form(
      "Concluir revisão mensal",
      [
        "Movimentos e categorias revistos",
        "Saldos e diferenças revistos",
        "Orçamento e compromissos revistos",
      ]
        .map(
          (label, i) =>
            '<label class="checkbox"><input type="checkbox" name="review' +
            i +
            '" required /> ' +
            label +
            "</label>",
        )
        .join(""),
      (f) =>
        commit(() => {
          if ([0, 1, 2].some((i) => !f.has("review" + i)))
            throw Error("Confirma os três passos da revisão.");
          for (const b of data.budgets) {
            b.frozen ??= {};
            b.frozen[month] = P.budgetAt(data, b, month);
          }
          data.closedMonths.push(month);
          data.monthReviews.push({
            id: F.id(),
            month,
            date: F.today(),
            completed: true,
          });
        }, "Mês revisto e fechado."),
      "O fecho protege os movimentos. A confirmação é tua e não certifica automaticamente os extratos.",
      "Confirmar e fechar mês",
    );
  };
  Object.assign(actions, {
    "edit-card-cycle": (id) => {
      const a = find("accounts", id);
      simple(
        "Ciclo de " + esc(a.name),
        field(
          "Dia de fecho",
          "closingDay",
          a.closingDay,
          "number",
          "required min=1 max=31",
        ) +
          field(
            "Dia de vencimento",
            "dueDay",
            a.dueDay,
            "number",
            "required min=1 max=31",
          ),
        (f) =>
          Object.assign(a, {
            closingDay: +f.get("closingDay"),
            dueDay: +f.get("dueDay"),
          }),
        "Usa os dias indicados pelo teu banco.",
      );
    },
    "undo-statement": (id) =>
      form(
        "Reabrir conferência",
        "<p>Os movimentos criados nesta conferência serão revertidos. Movimentos que apenas associaste serão preservados. Todas as linhas voltam a ficar por conferir.</p>",
        () => commit(() => C.undoStatement(data, id), "Conferência reaberta."),
        "Meses fechados e movimentos com dependências têm de ser resolvidos primeiro.",
        "Reabrir e reverter lançamentos",
      ),
    "cancel-installments": (id) =>
      commit(() => {
        const p = find("installmentPlans", id);
        if (p.payments.some((x) => x.paid))
          throw Error("Reverte primeiro os pagamentos associados.");
        data.installmentPlans = data.installmentPlans.filter(
          (x) => x.id !== id,
        );
        F.remove(data, p.transactionId);
      }, "Compra e plano cancelados."),
    "card-cycle": (id) => {
      const c = C.cardCycle(data, id, month);
      form(
        "Fatura do ciclo",
        "<p>De " +
          dateLabel(c.start) +
          " a " +
          dateLabel(c.end) +
          " · Vencimento " +
          dateLabel(c.due) +
          '</p><p class="amount">Compras lançadas: ' +
          eur(c.total) +
          "</p>" +
          c.purchases
            .map(
              (t) =>
                "<p>" +
                esc(t.description) +
                ' · <span class="amount">' +
                eur(t.amount) +
                "</span></p>",
            )
            .join(""),
        () => true,
        "O total de compras do ciclo não é o saldo total em dívida nem o valor das prestações a vencer.",
        "Concluir",
      );
    },
    "drill-category": (category) => drill("expense", category),
    "more-rows": () => {
      api.visibleRows += 100;
      renderTransactions();
    },
    "clear-filters": () => {
      filters = {};
      $("#typeFilter").value = "all";
      $("#accountFilter").value = "";
      $("#periodFilter").value = "month";
      $("#searchTransactions").value = "";
      api.visibleRows = 100;
      window.resetMovementDashboardFilters?.();
      window.resetTransactionPage?.();
      reloadFilters();
    },
    "save-view": () =>
      simple(
        "Guardar pesquisa",
        field("Nome", "name", "", "text", "required"),
        (f) =>
          data.savedViews.push({
            id: F.id(),
            name: f.get("name").trim(),
            filters: { ...filters },
            type: $("#typeFilter").value,
            account: $("#accountFilter").value,
            period: $("#periodFilter").value,
            term: $("#searchTransactions").value,
          }),
      ),
    "load-view": (id) => {
      const v = find("savedViews", id);
      filters = { ...v.filters, tag: "" };
      $("#typeFilter").value = v.type;
      $("#accountFilter").value = v.account;
      $("#periodFilter").value = v.period;
      $("#searchTransactions").value = v.term;
      window.resetTransactionPage?.();
      reloadFilters();
    },
    "remove-view": (id) => {
      const view = find("savedViews", id);
      if (!view) return;
      if (!confirm(`Apagar a vista guardada “${view.name}”? Esta ação remove apenas a vista; os movimentos não são alterados.`)) return;
      return commit(
        () => (data.savedViews = data.savedViews.filter((v) => v.id !== id)),
        "Vista guardada apagada.",
      );
    },
    "prepare-statement": () =>
      commit(() => {
        C.statement(data, data.pendingImports, "Extrato de " + F.today());
        data.pendingImports = [];
      }, "Extrato preparado para conferência."),
    "add-statement": (id) => {
      const [sid, rid] = id.split("~"),
        r = find("statements", sid).rows.find((r) => r.id === rid);
      if (
        data.transactions.some((t) => C.signature(t) === C.signature(r.source))
      )
        return form(
          "Confirmar movimento distinto",
          "<p>Já existe um movimento com a mesma data, descrição, conta e valor. Associa a linha ao movimento existente, a menos que sejam duas operações reais diferentes.</p>",
          () => commit(() => C.resolve(data, sid, rid, "add", null, true)),
          "Este passo cria um segundo movimento e volta a alterar o saldo.",
          "Criar movimento distinto",
        );
      return commit(() => C.resolve(data, sid, rid, "add"));
    },
    "ignore-statement": (id) =>
      commit(() => C.resolve(data, ...id.split("~"), "ignore")),
    "link-statement-direct": (id) => {
      const [sid, rid, tid] = id.split("~");
      return commit(
        () => C.resolve(data, sid, rid, "link", tid),
        "Linha associada ao movimento existente; os saldos não foram alterados.",
      );
    },
    "link-statement-safe": (sid) =>
      commit(
        () => C.linkSafeMatches(data, sid),
        "Correspondências seguras associadas; os saldos não foram alterados.",
      ),
    "link-statement": (id) => {
      const [sid, rid] = id.split("~"),
        r = find("statements", sid).rows.find((r) => r.id === rid);
      simple(
        "Associar movimento",
        select(
          "Movimento existente",
          "tid",
          C.candidateMatches(data, r.source).map((match) => {
            const t = match.transaction;
            return [
              t.id,
              t.date + " · " + (t.beneficiary || t.description) + " · " + eur(t.amount) + " · " + match.reason,
            ];
          }),
        ),
        (f) => C.resolve(data, sid, rid, "link", f.get("tid")),
        "A associação não altera saldos. Confirma a descrição e a data.",
      );
    },
    "new-card": () =>
      simple(
        "Novo cartão",
        field("Nome", "name", "", "text", "required") +
          number("Dívida inicial (€)", "balance", 0) +
          field(
            "Dia de fecho",
            "closingDay",
            20,
            "number",
            "min=1 max=31 required",
          ) +
          field(
            "Dia de vencimento",
            "dueDay",
            5,
            "number",
            "min=1 max=31 required",
          ),
        (f) => C.card(data, Object.fromEntries(f)),
      ),
    "card-purchase": () =>
      simple(
        "Compra parcelada",
        select("Cartão", "cardId", accountOptions(true)) +
          field("Descrição", "description", "", "text", "required") +
          number("Valor total (€)", "amount", 0, 0.01) +
          field("Data da compra", "date", F.today(), "date", "required") +
          field(
            "Primeiro vencimento",
            "firstDue",
            F.today(),
            "date",
            "required",
          ) +
          field("Prestações", "count", 3, "number", "min=1 max=120 required") +
          field("Categoria", "category", "Outros"),
        (f) => C.purchase(data, Object.fromEntries(f)),
      ),
    "card-payment": () => payment(),
    "pay-installment": (id) => payment(...id.split("~")),
    "fee-transfer": () =>
      simple(
        "Transferência com comissão",
        select("Origem", "from", accountOptions()) +
          select(
            "Destino",
            "to",
            data.accounts.filter((a) => !a.archived).map((a) => [a.id, a.name]),
          ) +
          number("Valor transferido", "amount", 0, 0.01) +
          number("Comissão", "fee", 0) +
          field("Data", "date", F.today(), "date", "required"),
        (f) =>
          C.transfer(
            data,
            f.get("from"),
            f.get("to"),
            +f.get("amount"),
            +f.get("fee"),
            f.get("date"),
          ),
      ),
    "annual-plan": () =>
      simple(
        "Despesa anual",
        field("Nome", "name", "", "text", "required") +
          number("Montante", "amount", 0, 0.01) +
          field(
            "Mês (1–12)",
            "month",
            +month.slice(5),
            "number",
            "required min=1 max=12",
          ) +
          field("Categoria", "category", "Outros"),
        (f) =>
          data.annualPlans.push({
            id: F.id(),
            name: f.get("name"),
            amount: +f.get("amount"),
            month: +f.get("month"),
            category: f.get("category"),
          }),
      ),
    "remove-annual": (id) =>
      commit(
        () => (data.annualPlans = data.annualPlans.filter((p) => p.id !== id)),
      ),
    "estimated-forecast": () => {
      if(window.ProductivityUI)return window.ProductivityUI.forecast();
      const r = C.estimatedForecast(data);
      form(
        "Previsão com estimativas",
        '<div class="forecast-estimate-summary"><div><span>Despesa variável usada</span><strong class="amount">' +
          eur(r.monthlyEstimate) +
          '/mês</strong><small>' + esc(r.estimateBasis || "Sem base suficiente") +
          '</small></div><div><span>Saldo a 90 dias</span><strong class="amount">' +
          eur(r.end) +
          '</strong><small>Com compromissos + estimativa variável</small></div><div><span>Só compromissos conhecidos</span><strong class="amount">' +
          eur(r.baseline.end) +
          '</strong><small>Sem extrapolar despesa variável</small></div></div><p class="forecast-estimate-impact">Impacto estimado da despesa variável nos próximos 90 dias: <b class="negative">' +
          eur(Math.abs(r.estimateImpact || 0)) +
          '</b>.</p>',
        () => true,
        r.assumption,
        "Concluir",
      );
    },
    "save-scenario": () =>
      simple(
        "Guardar cenário",
        field("Nome", "name", "", "text", "required") +
          number("Valor", "amount", 100, 0.01) +
          field("Data", "date", F.today(), "date", "required") +
          select("Tipo", "type", [
            ["expense", "Despesa adicional"],
            ["income", "Receita adicional"],
          ]) +
          select("Repetição", "repeat", [
            ["once", "Uma vez"],
            ["monthly", "Mensal"],
          ]),
        (f) => {
          P.simulate(
            data,
            +f.get("amount"),
            f.get("date"),
            f.get("type"),
            f.get("repeat") === "monthly",
          );
          data.scenarios.push({
            ...Object.fromEntries(f),
            amount: +f.get("amount"),
            id: F.id(),
          });
        },
      ),
    "compare-scenario": (id) => {
      const s = find("scenarios", id),
        date = s.date < F.today() ? F.today() : s.date,
        r = P.simulate(data, s.amount, date, s.type, s.repeat === "monthly");
      form(
        "Comparar: " + esc(s.name),
        '<div class="audit-diff"><div><h3>Situação atual</h3><p class="amount">' +
          eur(r.base.end) +
          '</p></div><div><h3>Com a decisão</h3><p class="amount">' +
          eur(r.scenario.end) +
          "</p></div></div>",
        () => true,
        "Calculado a partir de hoje; uma data passada é atualizada para hoje. Nenhum movimento é criado.",
        "Concluir",
      );
    },
    "remove-scenario": (id) =>
      commit(
        () => (data.scenarios = data.scenarios.filter((s) => s.id !== id)),
      ),
    "goal-priority": (id) => {
      const g = find("goals", id);
      simple(
        "Planear " + esc(g.name),
        field(
          "Prioridade (1 primeiro)",
          "priority",
          g.priority || 1,
          "number",
          "required min=1",
        ) +
          number(
            "Contribuição mensal",
            "monthlyContribution",
            g.monthlyContribution ?? P.monthlySuggestion(g),
          ),
        (f) =>
          Object.assign(g, {
            priority: +f.get("priority"),
            monthlyContribution: +f.get("monthlyContribution"),
          }),
      );
    },
    "merge-category": () =>
      simple(
        "Renomear ou fundir",
        field("Categoria atual", "from", "", "text", "required") +
          field("Novo nome / destino", "to", "", "text", "required"),
        (f) => C.mergeCategory(data, f.get("from"), f.get("to")),
      ),
    "archive-category": () =>
      simple(
        "Arquivar categoria",
        field("Categoria", "name", "", "text", "required"),
        (f) => {
          const name = f.get("name").trim();
          if (!name || data.categoryArchive.some((c) => c.name === name))
            throw Error("Categoria vazia ou já arquivada.");
          data.categoryArchive.push({ id: F.id(), name });
        },
        "Deixa de aparecer nas sugestões. O histórico é preservado.",
      ),
    "reactivate-category": (id) =>
      commit(
        () =>
          (data.categoryArchive = data.categoryArchive.filter(
            (c) => c.id !== id,
          )),
      ),
    "rule-priority": (id) => {
      const r = find("rules", id);
      simple(
        "Prioridade da regra",
        field(
          "Ordem (menor primeiro)",
          "priority",
          r.priority || 0,
          "number",
          "required",
        ) +
          select(
            "Estado",
            "active",
            [
              ["yes", "Ativa"],
              ["no", "Pausada"],
            ],
            r.active === false ? "no" : "yes",
          ),
        (f) =>
          Object.assign(r, {
            priority: +f.get("priority"),
            active: f.get("active") === "yes",
          }),
      );
    },
    "preview-rules": () => {
      const changes = C.rulesPreview(data);
      form(
        "Pré-visualizar regras",
        changes
          .map(
            (c) =>
              "<p>" +
              esc(c.description) +
              ": " +
              esc(c.before) +
              " → " +
              esc(c.after) +
              "</p>",
          )
          .join("") || "<p>Nenhuma alteração proposta.</p>",
        () =>
          commit(() => {
            for (const c of C.rulesPreview(data))
              find("transactions", c.id).category = c.after;
          }, "Regras aplicadas. Podes desfazer."),
        "Meses fechados e compras divididas ficam preservados.",
        "Aplicar alterações",
      );
    },
    "partial-payment": (id) => {
      const p = find("pendingPayments", id);
      simple(
        "Liquidar parcialmente",
        number("Valor a liquidar", "amount", p.amount, 0.01) +
          field("Data", "date", F.today(), "date", "required"),
        (f) => C.partial(data, id, +f.get("amount"), f.get("date")),
      );
    },
    "edit-dates": (id) => {
      const t = find("transactions", id);
      simple(
        "Datas do movimento",
        field(
          "Compra / operação",
          "purchaseDate",
          t.purchaseDate || t.date,
          "date",
        ) +
          field(
            "Lançamento bancário",
            "postedDate",
            t.postedDate || t.date,
            "date",
          ) +
          field("Vencimento", "dueDate", t.dueDate || "", "date"),
        (f) => {
          if (data.closedMonths.includes(t.date.slice(0, 7)))
            throw Error("Reabre o mês antes de alterar.");
          for (const k of ["purchaseDate", "postedDate", "dueDate"])
            t[k] = f.get(k);
        },
        "Estas datas são informativas. A data contabilística existente continua a determinar os relatórios e os saldos.",
      );
    },
  });
  function payment(planId, paymentId) {
    const plan = find("installmentPlans", planId),
      part = plan?.payments.find((p) => p.id === paymentId);
    simple(
      "Pagar cartão",
      select("Cartão", "cardId", accountOptions(true), plan?.cardId) +
        select("Conta de pagamento", "from", accountOptions()) +
        number(
          "Montante pago",
          "amount",
          part ? part.amount - part.paid : 0,
          0.01,
        ) +
        number("Juros a registar no cartão", "interest", 0) +
        field("Data", "date", F.today(), "date", "required"),
      (f) =>
        C.payCard(
          data,
          f.get("cardId"),
          f.get("from"),
          +f.get("amount"),
          f.get("date"),
          +f.get("interest"),
          planId,
          paymentId,
        ),
      "Um pagamento parcial mantém o restante por liquidar. Juros são registados como despesa separada.",
    );
  }
  const oldActions = FeatureUI.transactionActions;
  FeatureUI.transactionActions = (t) =>
    oldActions(t) + btn("Datas", "edit-dates", t.id);
  const prior = PremiumUI.render;
  PremiumUI.render = () => {
    prior();
    render();
    $("#savingRate").setAttribute("role", "button");
    $("#savingRate").tabIndex = 0;
    $("#savingRate").onclick = () => {
      const totals = F.totals(data, month);
      form(
        "Taxa de poupança",
        '<p>(Receitas − despesas líquidas) ÷ receitas × 100.</p><p class="amount">Receitas: ' +
          eur(totals.income) +
          " · Despesas: " +
          eur(totals.expense) +
          "</p>",
        () => true,
        "Sem receitas, a taxa não é calculada.",
        "Concluir",
      );
    };
    $("#savingRate").onkeydown = (e) => {
      if (e.key === "Enter") $("#savingRate").click();
    };
    $$("#chart .bar-group").forEach((bar, i) => {
      const m = P.monthAdd(month, i - 5);
      bar.setAttribute("role", "button");
      bar.tabIndex = 0;
      bar.onclick = () => {
        const t = F.totals(data, m);
        form(
          "Fluxo de " + monthLabel(m),
          '<p class="amount">Receitas: ' +
            eur(t.income) +
            " · Despesas: " +
            eur(t.expense) +
            "</p>",
          () => {
            month = m;
            renderAllForChart();
            return true;
          },
          "Consulta os movimentos deste mês.",
          "Abrir movimentos",
        );
      };
      bar.onkeydown = (e) => {
        if (e.key === "Enter") bar.click();
      };
    });
    statementHost.insertAdjacentHTML(
      "beforeend",
      data.statements
        .map((s) =>
          btn("Reabrir e reverter: " + esc(s.name), "undo-statement", s.id),
        )
        .join(""),
    );
    // O antigo bloco “Vencimentos de cartões” foi retirado juntamente com a
    // funcionalidade específica de cartões/compras parceladas. Os cenários
    // ficam dedicados apenas a estimativas guardadas.
    cardHost.insertAdjacentHTML(
      "beforeend",
      data.accounts
        .filter((a) => a.type === "Cartão")
        .map(
          (a) =>
            btn("Fatura: " + esc(a.name), "card-cycle", a.id) +
            btn("Editar ciclo", "edit-card-cycle", a.id),
        )
        .join("") +
        data.installmentPlans
          .map((p) =>
            btn(
              "Cancelar plano: " + esc(p.description),
              "cancel-installments",
              p.id,
            ),
          )
          .join(""),
    );
    const impact = new Map();
    for (const t of data.pendingImports)
      impact.set(
        t.account,
        F.money(
          (impact.get(t.account) || 0) +
            (t.type === "income" ? t.amount : -t.amount),
        ),
      );
    statementHost.insertAdjacentHTML(
      "afterbegin",
      '<p class="amount">Efeito se todas as linhas preparadas forem novas: ' +
        [...impact].map(([a, n]) => esc(a) + ": " + eur(n)).join(" · ") +
        "</p>",
    );
    for (const [id, kind] of [
      ["incomeValue", "income"],
      ["expenseValue", "expense"],
    ]) {
      const el = $("#" + id);
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute(
        "aria-label",
        kind === "income"
          ? "Ver origem das receitas"
          : "Ver composição das despesas",
      );
      el.onclick = () => drill(kind);
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          drill(kind);
        }
      };
    }
    $("#balanceValue").setAttribute("role", "button");
    $("#balanceValue").tabIndex = 0;
    $("#balanceValue").onclick = () => navigate("accounts");
    $("#balanceValue").onkeydown = (e) => {
      if (e.key === "Enter") navigate("accounts");
    };
    let explorer = $("#categoryDrill");
    if (!explorer) {
      explorer = document.createElement("div");
      explorer.id = "categoryDrill";
      $("#insights").append(explorer);
    }
    explorer.innerHTML = [
      ...new Set(F.expenseEntries(data, month).map((t) => t.category)),
    ]
      .map((c) => btn("Detalhar " + esc(c), "drill-category", c))
      .join("");
    if (
      sum(data.goals, (g) => g.monthlyContribution ?? P.monthlySuggestion(g)) >
      Math.max(0, P.spendingRoom(data, data.safetyMargin || 0).available)
    )
      goalHost.insertAdjacentHTML(
        "afterbegin",
        '<p role="status">As contribuições pretendidas ultrapassam a disponibilidade estimada. Revê as prioridades.</p>',
      );
    $("#paymentCalendar")
      .querySelectorAll('[data-action="edit-pending"]')
      .forEach((b) =>
        b.insertAdjacentHTML(
          "afterend",
          btn("Pagamento parcial", "partial-payment", b.dataset.id),
        ),
      );
  };
  const api = {
    visibleRows: 100,
    getFilters: () => ({ ...filters }),
    setDateRange: (start = "", end = "") => {
      filters.start = start || "";
      filters.end = end || "";
      reloadFilters();
    },
    clearDateRange: () => {
      filters.start = "";
      filters.end = "";
      reloadFilters();
    },
    reviewRange: (start, end, category = "") => {
      actions["clear-filters"]();
      filters = { start, end, category };
      extra.querySelector("details").open = true;
      reloadFilters();
      navigate("transactions");
    },
    filterError: () => {
      if (filters.start && filters.end && filters.start > filters.end)
        return "A data inicial deve ser anterior ou igual à data final.";
      if (filters.min && filters.max && +filters.min > +filters.max)
        return "O valor mínimo deve ser inferior ou igual ao máximo.";
      if (
        [filters.min, filters.max].some(
          (v) => v && (!Number.isFinite(+v) || +v < 0),
        )
      )
        return "Usa valores iguais ou superiores a zero.";
      return "";
    },
    canWrite: () => writer && knownDisk === localStorage.getItem(key),
    updatedFromDisk: () => {
      knownDisk = localStorage.getItem(key);
    },
    filter: (t) =>
      (!filters.category ||
        (() => {
          const source = t.refundOf
            ? data.transactions.find((x) => String(x.id) === String(t.refundOf))
            : t;
          return (
            source?.category === filters.category ||
            source?.splits?.some((s) => s.category === filters.category)
          );
        })()) &&
      (!filters.min || t.amount >= +filters.min) &&
      (!filters.max || t.amount <= +filters.max) &&
      (!filters.start || t.date >= filters.start) &&
      (!filters.end || t.date <= filters.end),
  };
  let knownDisk = localStorage.getItem(key);
  window.CompleteUI = api;
  if (!window.equilibrioStartup?.awaitingChoice) window.PremiumUI.render();
  renderTransactions();
})();

/* Currency marking also covers amounts inside explanatory text and dialogs. */
(function () {
  let timer;
  const pendingRoots = new Set();
  const excluded = "script,style,textarea,option,svg title,svg desc,.sensitive-value";
  const currencyPattern = /\d[\d .,\u00a0\u202f]*\s*€/;
  const currencyParts = /[-−+]?\d[\d .,\u00a0\u202f]*\s*€/g;

  function eligibleTextNode(node) {
    return Boolean(
      node?.nodeType === Node.TEXT_NODE &&
      node.parentElement &&
      !node.parentElement.closest(excluded) &&
      currencyPattern.test(node.data),
    );
  }

  function wrapCurrencyText(node) {
    if (!eligibleTextNode(node)) return;
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let end = 0;
    for (const match of text.matchAll(currencyParts)) {
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      const span = node.parentElement.namespaceURI === 'http://www.w3.org/2000/svg'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        : document.createElement('span');
      span.setAttribute('class', 'sensitive-value');
      span.textContent = match[0];
      fragment.append(span);
      end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(end)));
    node.replaceWith(fragment);
  }

  function markRoot(root) {
    if (!root || !document.body) return;
    if (root.nodeType === Node.TEXT_NODE) {
      wrapCurrencyText(root);
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE && root.closest?.(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (eligibleTextNode(walker.currentNode)) nodes.push(walker.currentNode);
    for (const node of nodes) wrapCurrencyText(node);
  }

  function observe() {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function flush() {
    if (!document.body) return;
    observer.disconnect();
    const roots = pendingRoots.size ? [...pendingRoots] : [document.body];
    pendingRoots.clear();
    for (const root of roots) markRoot(root);
    observe();
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") pendingRoots.add(record.target);
      for (const node of record.addedNodes || []) pendingRoots.add(node);
    }
    if (!pendingRoots.size) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 0);
  });

  pendingRoots.add(document.body);
  flush();
})();
