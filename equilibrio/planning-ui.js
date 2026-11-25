(function () {
  "use strict";
  const Q = PlanningFinance,
    P = FinancePlus,
    L = LifeFinance;
  const b = (label, action, id = "") => button(label, action, id, "secondary");
  const simple = (title, fields, fn, help = "") =>
    form(title, fields, (f) => commit(() => fn(f)), help);
  const panel = (title, content, decisionGroup) =>
    '<article class="panel planning-panel"' + (decisionGroup ? ' data-decision-group="'+decisionGroup+'"' : '') + '><h3>' +
    title +
    "</h3>" +
    content +
    "</article>";
  const empty = (text) => '<p class="empty-state">' + text + "</p>";
  function page(id, area, title) {
    if (id === "inboxHub" && window.DataHub) return window.DataHub.pane("inbox");
    const el = document.createElement("section");
    el.id = id;
    el.className = "view life-page";
    $("#mainContent").append(el);
    PremiumUI.addPage(area, id, title);
    return el;
  }
  const inbox = page("inboxHub", "Resumo", "A tratar"),
    decisions = page("decisionsHub", "Planeamento", "Decisões"),
    review = page("reviewMonthHub", "Análises", "Revisão mensal");
  const decisionSimulator = $("#planningPlus .decision-simulator-v25");
  const salary = document.createElement("section");
  salary.id = "salaryPlan";
  salary.className = "panel planning-panel";
  $("#lifeOverview")
    ? $("#lifeOverview").after(salary)
    : $("#decisionPanel").after(salary);
  const setup = document.createElement("section");
  setup.id = "setupChecklist";
  setup.className = "panel planning-panel";
  // O antigo cartão “Configurar o meu espaço” foi retirado do Resumo.
  // Mantemos o nó destacado apenas para compatibilidade interna do renderer.
  const goalLinks = document.createElement("section");
  goalLinks.className = "panel planning-panel";
  $("#goals").append(goalLinks);
  const subReview = document.createElement("details");
  subReview.className = "panel planning-panel subscription-review-card";
  $("#agendaSubscriptionsPreview").append(subReview);
  const portability = document.createElement("section");
  portability.id = "spacesPortability";
  portability.className = "panel planning-panel";
  $("#settings").append(portability);
  portability.innerHTML =
    "<h2>Todos os espaços numa cópia</h2><p>Inclui registos e comprovativos. No restauro, escolhe o espaço da cópia e confirma a substituição integral do espaço atual. Os outros espaços mantêm-se.</p>" +
    b("Exportar todos os espaços", "plan-export") +
    b("Restaurar cópia de outro PC", "plan-import");
  let items = [];
  let planningDetailsDirty = true;
  const planningDetailsVisible = () => ["planner", "plansHub", "planningPlus", "reviewMonthHub", "weeklyHub", "inboxHub", "dataHub", "insights", "goals"].includes(view);
  function render() {
    const pay = Q.payday(data);
    salary.innerHTML =
      '<div class="planning-heading"><h2>Até ao próximo salário</h2>' +
      (pay?.salaryRuleId ? b("Editar ordenado", "recurring", pay.salaryRuleId) : b("Definir data", "plan-payday")) +
      "</div>" +
      (pay
        ? "<p>" +
          (pay.salaryRuleId
            ? (esc(pay.salaryDescription || "Ordenado") + ": <b>" + eur(pay.salaryAmount || 0) + "</b> em " + dateLabel(pay.date) + " · ")
            : ("Até " + dateLabel(P.dayAdd(pay.date, -1)) + " · ")) +
          'o salário desse dia fica fora do cálculo.</p><strong class="life-number amount">' +
          eur(pay.allowance) +
          "</strong><p>Margem total estimada para " +
          pay.days +
          " dias." +
          (pay.deficit
            ? " Faltam " +
              eur(pay.deficit) +
              " para cobrir reservas e compromissos."
            : "") +
          "</p>" +
          b("Ver cálculo e compromissos", "plan-explain")
        : empty(
            data.paydayDate
              ? "A data de salário já passou. Define a próxima entrada."
              : "Escolhe a próxima data de entrada para distribuir a margem disponível por semanas.",
          ));
    if (!planningDetailsVisible()) {
      planningDetailsDirty = true;
      window.DataHub?.refresh?.();
      return;
    }
    planningDetailsDirty = false;
    const rows = Q.comparison(data, month),
      subscriptionReviews = Q.subscriptionReview(data);
    items = Q.reviewInbox(data, month).active;
    inbox.innerHTML =
      '<div class="data-section-heading"><div><p class="eyebrow">Revisão</p><h2>A tratar</h2><p>Pendências do espaço aberto. Resolve importações, duplicados e registos incompletos num só fluxo.</p></div><span class="data-section-status">' + items.length + ' pendente' + (items.length === 1 ? '' : 's') + '</span></div><p>' +
      items.length +
      " pontos para rever.</p>" +
      (items
        .slice(0, 100)
        .map((it, i) =>
          panel(
            esc(it.title),
            "<p>" + esc(it.detail) + "</p>" + b("Rever", "plan-inbox", i),
          ),
        )
        .join("") || empty("Tudo revisto por aqui.")) +
      (items.length > 100
        ? "<p>São apresentados os primeiros 100 pontos. Resolve-os para revelar os seguintes.</p>"
        : "");
    window.DataHub?.refresh?.();
    const steps = [
      ["Contas", data.accounts.length > 0, "accounts"],
      [
        "Compromissos",
        data.recurring.length + data.pendingPayments.length > 0,
        "planner",
      ],
      ["Objetivos", data.goals.length > 0, "goals"],
      ["Primeiros movimentos", data.transactions.length > 0, "transactions"],
      [
        "Cópia de segurança",
        !!(window.DailyUI?.lastExport(key) || data.lastBackup),
        "settings",
      ],
    ];
    setup.innerHTML =
      "<h2>Preparar o teu espaço</h2><p>" +
      steps.filter((s) => s[1]).length +
      " de " +
      steps.length +
      ' passos com registos. Configura apenas o que fizer sentido para ti.</p><div class="planning-steps">' +
      steps
        .map((s) => b((s[1] ? "✓ " : "") + s[0], "life-navigate", s[2]))
        .join("") +
      "</div>";
    goalLinks.innerHTML =
      "<h2>Onde está o dinheiro dos objetivos?</h2><p>Associar uma conta identifica a origem da reserva. Não transfere dinheiro nem acrescenta uma segunda reserva ao património.</p>" +
      data.goals
        .map(
          (g) =>
            '<div class="planning-line"><div><b>' +
            esc(g.name) +
            "</b><p>" +
            esc(
              data.accounts.find((a) => a.id === g.accountId)?.name ||
                "Sem conta associada",
            ) +
            " · " +
            eur(g.current) +
            "</p></div>" +
            b("Associar conta", "plan-goal", g.id) +
            "</div>",
        )
        .join("");
    subReview.hidden = subscriptionReviews.length === 0;
    const reviewRow = (s) => `<div class="planning-line"><div><b>${esc(s.name)}</b><p>${eur(s.annual)}/ano · ${{ unknown: "Utilização por indicar", often: "Uso frequente", rarely: "Uso raro", never: "Sem utilização" }[s.usage]}${s.increase === null ? "" : " · Variação por cobrança: " + eur(s.increase)}</p></div>${b("Rever utilização", "plan-usage", s.id)}</div>`;
    subReview.innerHTML =
      "<summary>Utilização dos serviços · vale a pena manter?</summary><p>A utilização é indicada por ti; a aplicação não acompanha os serviços.</p>" +
      subscriptionReviews.slice(0, 2).map(reviewRow).join("") +
      (subscriptionReviews.length > 2 ? `<details class="subscription-review-more"><summary>Ver todos os serviços (${subscriptionReviews.length})</summary>${subscriptionReviews.slice(2).map(reviewRow).join("")}</details>` : "");
    const decisionRoom = P.spendingRoom(data, data.safetyMargin || 0);
    const decisionAvailable = Number(decisionRoom.available || 0);
    const decisionTone = decisionAvailable < 0 ? "danger" : decisionAvailable < Math.max(100, Number(decisionRoom.margin || 0)) ? "watch" : "good";
    const seasonalRows = Q.seasonal(data);
    const nextSeasonal = seasonalRows
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .find((item) => String(item.date || "") >= F.today()) || seasonalRows[0];
    const seasonalHtml = seasonalRows.length
      ? seasonalRows.map((s) =>
          '<div class="planning-line"><div><b>' + esc(s.name) + '</b><p>' + dateLabel(s.date) + ' · ' + eur(s.remaining) + ' por preparar · ' + eur(s.monthly) + '/mês' + (s.overdue ? ' · Data ultrapassada' : '') + '</p></div>' + b("Consolidar em reserva", "plan-seasonal-consolidate", s.id) + b("Editar", "plan-seasonal", s.id) + b("Remover", "plan-seasonal-remove", s.id) + '</div>'
        ).join("")
      : '<p class="decision-empty">Ainda não tens despesas sazonais preparadas.</p>';
    const scenariosHtml = data.scenarios.length
      ? data.scenarios.map((s) =>
          '<div class="planning-line"><div><b>' + esc(s.name) + '</b><p>' + dateLabel(s.date) + ' · ' + eur(s.amount) + (s.repeat === "monthly" ? ' / mês' : '') + '</p></div>' + b("Comparar", "plan-simulate", s.id) + b("Editar", "plan-scenario", s.id) + b("Remover", "plan-scenario-remove", s.id) + '</div>'
        ).join("")
      : '<p class="decision-empty">Guarda um cenário quando quiseres comparar uma compra ou compromisso sem mexer nos saldos.</p>';
    const notesHtml = data.decisionNotes.length
      ? data.decisionNotes.slice().reverse().map((n) =>
          '<div class="planning-line"><div><b>' + esc(n.title) + '</b><p>' + dateLabel(n.date) + ' · ' + esc(n.reason) + '</p><p>Resultado: ' + esc(n.result || "Ainda por avaliar") + '</p></div>' + b("Atualizar resultado", "plan-note", n.id) + '</div>'
        ).join("")
      : '<p class="decision-empty">Ainda não registaste nenhuma decisão para rever mais tarde.</p>';
    decisions.innerHTML =
      '<header class="decisions-hero"><div><p class="eyebrow">PLANEAMENTO</p><h2>Decisões</h2><p>Usa esta página para testar uma decisão antes de a transformar num compromisso real.</p></div>' +
      '<div class="decisions-hero-counts"><span><b>' + data.scenarios.length + '</b> cenários</span><span><b>' + data.decisionNotes.length + '</b> decisões</span></div></header>' +
      '<div class="decision-flow" aria-label="Fluxo de decisão"><span class="active"><b>1</b><em>Ver margem</em></span><i>›</i><span><b>2</b><em>Simular impacto</em></span><i>›</i><span><b>3</b><em>Registar se avançar</em></span></div>' +
      '<div class="decisions-overview" aria-label="Estado para decidir">' +
        '<article class="decision-overview-primary tone-' + decisionTone + '"><span>Margem depois de tudo</span><strong class="' + (decisionAvailable < 0 ? 'negative' : 'positive') + '">' + eur(decisionAvailable) + '</strong><small>' + (decisionAvailable < 0 ? 'Há um défice antes de novas decisões.' : 'Valor disponível após compromissos, reservas e margem.') + '</small></article>' +
        '<article><span>Compromissos considerados</span><strong>' + eur(decisionRoom.commitments || 0) + '</strong><small>queda máxima prevista</small></article>' +
        '<article><span>Dinheiro reservado</span><strong>' + eur(decisionRoom.reserved || 0) + '</strong><small>objetivos e reservas</small></article>' +
      '</div>' +
      '<div class="decisions-secondary-grid">' +
        panel(
          "Despesas sazonais",
          '<div class="decision-panel-intro"><p>Antecipações que vale a pena preparar com tempo.</p>' + b("Preparar despesa", "plan-seasonal") + '</div>' + seasonalHtml,
          "seasonal",
        ) +
        panel(
          "Planeado vs. realizado",
          '<div class="decision-panel-intro"><p>Compara limites definidos com o que já aconteceu no mês.</p>' + b("Ajustar orçamentos", "life-navigate", "budgets") + '</div><details class="decision-comparison"><summary>Ver desvios por categoria <span>' + rows.length + '</span></summary><div class="planning-table"><table><thead><tr><th>Categoria</th><th>Limite</th><th>Realizado</th><th>Desvio</th></tr></thead><tbody>' +
            rows.map((r, i) =>
              '<tr><th><button type="button" class="link-button" data-action="plan-category" data-id="' + i + '">' + esc(r.category) + '</button></th><td>' + (r.planned === null ? 'Sem plano' : eur(r.planned)) + '</td><td>' + eur(r.actual) + '</td><td>' + (r.difference === null ? '—' : eur(r.difference)) + '</td></tr>'
            ).join("") +
          '</tbody></table></div></details>',
          "comparison",
        ) +
        panel(
          "Cenários guardados",
          '<div class="decision-panel-intro"><p>Comparações que podes voltar a abrir sem alterar movimentos.</p>' + b("Novo cenário", "plan-scenario") + '</div>' + scenariosHtml,
          "scenarios",
        ) +
        panel(
          "Histórico de decisões",
          '<div class="decision-panel-intro"><p>Regista a razão e, mais tarde, confirma o resultado real.</p>' + b("Registar decisão", "plan-note") + '</div>' + notesHtml,
          "scenarios",
        ) +
      '</div>';
    // The simulator belongs to Decisions. Reattach the same node after each
    // render so its inputs and existing event handlers remain intact. It is
    // deliberately kept near the top because this is the primary decision tool.
    if (decisionSimulator) decisions.querySelector(".decisions-overview")?.after(decisionSimulator);
    const totals = F.totals(data, month),
      selected = new Date(month + "-01T12:00:00"),
      previousDate = new Date(selected.getFullYear(), selected.getMonth() - 1, 1),
      previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`,
      previousTotals = F.totals(data, previousMonth),
      yearAgoMonth = `${selected.getFullYear() - 1}-${String(selected.getMonth() + 1).padStart(2, "0")}`,
      yearAgoTotals = F.totals(data, yearAgoMonth),
      monthExpenses = F.expenseEntries(data, month),
      categoryTotals = [...monthExpenses.reduce((map, e) => map.set(e.category, F.money((map.get(e.category) || 0) + e.amount)), new Map())].sort((a, b) => b[1] - a[1]),
      annualInsight = L.annualReport(data, month.slice(0, 4)),
      forecast = annualInsight.forecast?.month === month ? annualInsight.forecast : null;
    const closeReview = currentMonthReview();
    const closeReason = closeReview.closed ? "" : closeReview.blockers.join(" ");
    const reviewMonth = month;
    const conclusion = data.monthlyConclusions.find(row => row.month === reviewMonth);
    review.innerHTML =
      "<h2>Revisão de " +
      esc(monthLabel(month)) +
      "</h2><p>Um fecho útil: primeiro vê o que mudou, depois resolve pendências e só no fim fecha o mês.</p>" +
      '<div class="review-month-kpis">' +
      `<div><span>Receitas</span><strong>${eur(totals.income)}</strong><small>${monthlyComparisonLabel(month, totals.income, previousTotals.income, yearAgoTotals.income)}</small></div>` +
      `<div><span>Despesas</span><strong>${eur(totals.expense)}</strong><small>${monthlyComparisonLabel(month, totals.expense, previousTotals.expense, yearAgoTotals.expense)}</small></div>` +
      `<div><span>Balanço do mês</span><strong class="${totals.income - totals.expense >= 0 ? "positive" : "negative"}">${eur(totals.income - totals.expense)}</strong><small>${reviewSavingsLabel(totals.income, totals.expense)}</small></div>` +
      (forecast ? `<div><span>Previsão de fecho</span><strong class="${forecast.balance >= 0 ? "positive" : "negative"}">${eur(forecast.balance)}</strong><small>${eur(forecast.expense)} de despesas projetadas</small></div>` : "") +
      '</div>' +
      panel(
        "1. O que mais pesou",
        (categoryTotals.length ? '<div class="review-category-top">' + categoryTotals.slice(0, 5).map(([name, value]) => `<div><span>${esc(name)}</span><b>${eur(value)}</b><small>${totals.expense ? Math.round((value / totals.expense) * 100) : 0}% das despesas</small></div>`).join("") + '</div>' : '<p>Ainda não existem despesas neste mês.</p>') +
          b("Ver análises", "life-navigate", "reports"),
      ) +
      panel(
        "2. Resolver pendências",
        "<p>" + items.length + " pontos na caixa de entrada. Resolve importações, duplicados e registos incompletos antes do fecho.</p>" +
          b("Abrir caixa de entrada", "life-navigate", "inboxHub"),
      ) +
      panel(
        "3. Confirmar saldos e plano",
        "<p>Compara as categorias com os limites definidos.</p>" +
          b("Conferir contas e extratos", "life-navigate", "accounts") +
          b("Comparar com o plano", "life-navigate", "decisionsHub") +
          "",
      ) +
      panel(
        "4. Conclusões e fecho do mês",
        `<form class="monthly-note monthly-note-compact"><div class="monthly-note-fields"><label>Conclusões<textarea name="summary" required maxlength="2000" rows="2" placeholder="O que aprendeste este mês?">${esc(conclusion?.summary || "")}</textarea></label><label>Próximos passos<textarea name="next" maxlength="2000" rows="2" placeholder="O que vais mudar no próximo mês?">${esc(conclusion?.next || "")}</textarea></label></div><div class="review-finish-actions"><button type="submit" class="primary">Guardar conclusões</button>` +
          '<button type="button" class="secondary" data-action="plan-close" aria-describedby="comparisonCloseReason"' + (closeReason ? ' disabled' : '') + '>' + (closeReview.closed ? 'Reabrir mês' : 'Fechar mês') + '</button>' +
          '</div></form><p id="comparisonCloseReason" class="muted review-close-reason"' + (closeReason ? '' : ' hidden') + '>' + esc(closeReason) + '</p>',
      );
    review.querySelector(".monthly-note").onsubmit = event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const summary = fields.get("summary").trim(), next = fields.get("next").trim();
      if (!summary) return notice("Escreve uma conclusão antes de guardar.", true);
      commit(() => {
        const existing = data.monthlyConclusions.find(row => row.month === reviewMonth);
        if (existing) Object.assign(existing, { summary, next });
        else data.monthlyConclusions.push({ id: F.id(), month: reviewMonth, summary, next });
      }, "Conclusões guardadas.");
    };
  }
  Object.assign(actions, {
    "plan-payday": () =>
      simple(
        "Próxima entrada de salário",
        field(
          "Data prevista",
          "date",
          (Q.payday(data)?.date || P.dayAdd(F.today(), 30)),
          "date",
          "required",
        ),
        (f) => {
          const date = f.get("date");
          if (
            !F.validDate(date) ||
            date <= F.today() ||
            date > P.dayAdd(F.today(), 366)
          )
            throw Error("Escolhe uma data futura nos próximos 366 dias.");
          data.paydayDate = date;
          data.paydayDay = Number(date.slice(8, 10));
        },
        "Usa esta data apenas se ainda não tiveres um ordenado recorrente na Agenda. Quando existir uma entrada recorrente marcada como Ordenado / salário, essa ocorrência passa automaticamente a definir o próximo salário e esta data manual fica apenas como fallback.",
      ),
    "plan-explain": () => {
      const p = Q.payday(data);
      if (!p) return;
      form(
        "Como calculámos a margem",
        '<dl class="planning-formula"><dt>Saldo atual</dt><dd>' +
          eur(p.cash) +
          "</dd><dt>Queda máxima prevista antes do salário</dt><dd>− " +
          eur(p.commitments) +
          "</dd><dt>Objetivos e reservas</dt><dd>− " +
          eur(p.reserved) +
          "</dd><dt>Margem de segurança</dt><dd>− " +
          eur(p.margin) +
          "</dd><dt>Resultado</dt><dd>" +
          eur(p.available) +
          "</dd></dl><h3>Compromissos considerados</h3>" +
          p.plan.events
            .map(
              (e) =>
                "<p>" +
                dateLabel(e.date) +
                " · " +
                esc(e.description) +
                " · " +
                eur(e.amount) +
                " · " +
                esc(e.source) +
                "</p>",
            )
            .join(""),
        () => true,
        "Não inclui despesas por planear. O total disponível é distribuído pelos dias até à entrada; rendimentos futuros só ajudam depois da sua data prevista.",
        "Fechar",
      );
    },
    "plan-inbox": (i) => {
      const item = items[+i];
      if (item?.action) actions[item.action](item.id);
      else if (item) navigate(item.route);
    },
    "plan-close": () => promptMonthClose(),
    "plan-goal": (id) => {
      const g = find("goals", id);
      simple(
        "Conta de " + g.name,
        select(
          "Conta",
          "account",
          [
            ["", "Sem associação"],
            ...data.accounts
              .filter(
                (a) =>
                  !a.archived &&
                  !["Cartão", "Cartão de crédito"].includes(a.type),
              )
              .map((a) => [a.id, a.name]),
          ],
          g.accountId || "",
        ),
        (f) => Q.allocation(data, g.id, f.get("account")),
      );
    },
    "plan-usage": (id) => {
      const s = find("subscriptions", id);
      simple(
        "Utilização de " + s.name,
        select(
          "Utilização",
          "usage",
          [
            ["unknown", "Por indicar"],
            ["often", "Frequente"],
            ["rarely", "Rara"],
            ["never", "Nunca"],
          ],
          s.usage || "unknown",
        ),
        (f) => (find("subscriptions", id).usage = f.get("usage")),
      );
    },
    "plan-seasonal": (id) => {
      const s = find("seasonalCosts", id);
      simple(
        "Preparar despesa sazonal",
        field("Nome", "name", s?.name || "", "text", "required maxlength=120") +
          field(
            "Data",
            "date",
            s?.date || P.dayAdd(F.today(), 90),
            "date",
            "required",
          ) +
          number("Valor total (€)", "amount", s?.amount || 0) +
          number("Já preparado no plano (€)", "saved", s?.saved || 0),
        (f) => {
          const next = {
            id: s?.id || F.id(),
            name: f.get("name").trim(),
            date: f.get("date"),
            amount: +f.get("amount"),
            saved: +f.get("saved"),
          };
          if (s) Object.assign(find("seasonalCosts", s.id), next);
          else data.seasonalCosts.push(next);
        },
      );
    },
    "plan-seasonal-consolidate": (id) =>
      commit(
        () => Q.consolidateLegacyPlan(data, "seasonalCost", id, month),
        "Despesa sazonal consolidada em Reservas.",
      ),
    "plan-seasonal-remove": (id) =>
      commit(
        () =>
          (data.seasonalCosts = data.seasonalCosts.filter((s) => s.id !== id)),
      ),
    "plan-category": (i) => {
      const r = Q.comparison(data, month)[+i];
      if (!r) return;
      form(
        esc(r.category) + " — " + esc(month),
        "<p>Realizado: " +
          eur(r.actual) +
          "</p>" +
          r.transactions
            .map(
              (t) =>
                "<p>" +
                dateLabel(t.date) +
                " · " +
                esc(t.description) +
                " · " +
                eur(t.amount) +
                "</p>",
            )
            .join(""),
        () => true,
        "Soma das parcelas da categoria, após reembolsos.",
        "Fechar",
      );
    },
    "plan-scenario": (id) => {
      const s = find("scenarios", id);
      simple(
        "Guardar cenário",
        field("Nome", "name", s?.name || "", "text", "required maxlength=120") +
          field("Data", "date", s?.date || F.today(), "date", "required") +
          number("Valor (€)", "amount", s?.amount || 0) +
          select(
            "Tipo",
            "type",
            [
              ["expense", "Despesa"],
              ["income", "Receita"],
            ],
            s?.type || "expense",
          ) +
          '<label class="checkbox"><input type="checkbox" name="monthly" ' +
          (s?.repeat === "monthly" ? "checked" : "") +
          "> Repetir mensalmente</label>",
        (f) => {
          const next = {
            id: s?.id || F.id(),
            name: f.get("name").trim(),
            date: f.get("date"),
            amount: +f.get("amount"),
            type: f.get("type"),
            repeat: f.has("monthly") ? "monthly" : "once",
          };
          P.simulate(
            data,
            next.amount,
            next.date,
            next.type,
            next.repeat === "monthly",
          );
          if (s) Object.assign(find("scenarios", s.id), next);
          else data.scenarios.push(next);
        },
        "Data nos próximos 90 dias. O cenário não altera o saldo.",
      );
    },
    "plan-simulate": (id) => {
      const s = find("scenarios", id);
      if (s.date < F.today() || s.date > P.dayAdd(F.today(), 90))
        return notice(
          "Atualiza a data do cenário para os próximos 90 dias.",
          true,
        );
      const c = P.simulate(
        data,
        s.amount,
        s.date,
        s.type,
        s.repeat === "monthly",
      );
      const protection=Q.decisionImpact(data,{oneOff:s.repeat==='monthly'?0:(s.type==='income'?1:-1)*s.amount,monthlyDelta:s.repeat==='monthly'?(s.type==='income'?1:-1)*s.amount:0,date:s.date});
      const scenarioPremises='<p class="muted"><strong>Premissas:</strong> '+(s.type==='income'?'Receita':'Despesa')+' '+(s.repeat==='monthly'?'mensal':'única')+' de '+eur(s.amount)+' a partir de '+dateLabel(s.date)+' · Dinheiro reservado '+eur(protection.reserved)+' · Margem de segurança '+eur(protection.margin)+' (90 dias).</p>';
      form(
        s.name,
        scenarioPremises +
          '<div class="planning-table"><table><tr><th></th><th>Plano atual</th><th>Com cenário</th></tr><tr><th>Saldo mínimo projetado</th><td>' +
          eur(c.base.min) +
          "</td><td>" +
          eur(c.scenario.min) +
          "</td></tr><tr><th>Saldo ao fim de 90 dias</th><td>" +
          eur(c.base.end) +
          "</td><td>" +
          eur(c.scenario.end) +
          "</td></tr></table></div><p>Disponibilidade após reservas e margem: "+eur(protection.availableAfter)+". "+(protection.canSpend?"Valores protegidos mantidos.":"Proteção comprometida em "+eur(protection.compromised)+".")+"</p>",
        () => true,
        "Saldos projetados com compromissos conhecidos; os valores não descontam reservas nem despesas ainda não planeadas.",
        "Fechar",
      );
    },
    "plan-scenario-remove": (id) =>
      commit(
        () => (data.scenarios = data.scenarios.filter((s) => s.id !== id)),
      ),
    "plan-note": (id) => {
      const n = find("decisionNotes", id);
      simple(
        n ? "Editar decisão" : "Registar decisão",
        field(
          "Título",
          "title",
          n?.title || "Revisão de " + month,
          "text",
          "required maxlength=120",
        ) +
          field("Data", "date", n?.date || F.today(), "date", "required") +
          '<label>Motivo da decisão<textarea name="reason" required maxlength="2000" rows="3">' +
          esc(n?.reason || "") + '</textarea></label>' +
          '<details class="catalog-options"' + (n?.result ? ' open' : '') +
          '><summary>Resultado observado</summary><label>O que aconteceu?<textarea name="result" maxlength="2000" rows="3">' +
          esc(n?.result || "") + '</textarea></label></details>',
        (f) => {
          const next = {
            id: n?.id || F.id(),
            title: f.get("title").trim(),
            date: f.get("date"),
            reason: f.get("reason"),
            result: f.get("result"),
          };
          if (n) Object.assign(find("decisionNotes", n.id), next);
          else data.decisionNotes.push(next);
        },
      );
    },
    "plan-receipt": (id) =>
      commit(() => {
        const t = find("transactions", id);
        if (t.type !== "expense") throw Error("Só podes pedir fatura para despesas.");
        if (data.closedMonths.includes(t.date.slice(0, 7)))
          throw Error("Reabre o mês para alterar o pedido de comprovativo.");
        window.rememberMovementContext?.(id);
        t.receiptRequired = !t.receiptRequired;
      }, find("transactions", id)?.receiptRequired
        ? "Pedido de fatura retirado deste movimento."
        : "Fatura pedida: o movimento aparece em Dados → A tratar até anexares o comprovativo."),
    "plan-export": () => {
      const content = JSON.stringify(LifeUI.exportSpaces(), null, 2);
      if (new Blob([content]).size > 50 * 1024 * 1024)
        throw Error(
          "O pacote excede 50 MB. Exporta os espaços individualmente.",
        );
      download(
        content,
        "equilibrio-todos-os-espacos-" + F.today() + ".json",
        "application/json",
      );
      notice("Pacote preparado. Guarda-o num local seguro.");
    },
    "plan-import": () => file.click(),
  });
  const file = document.createElement("input");
  file.id = "recoveryPackageFile";
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  document.body.append(file);
  file.onchange = async () => {
    const selected = file.files[0];
    file.value = "";
    if (!selected) return;
    try {
      if (selected.size > 50 * 1024 * 1024)
        throw Error("O pacote excede 50 MB.");
      const parsed = JSON.parse(await selected.text());
      const raw =
        parsed.format === "equilibrio-spaces"
          ? parsed
          : {
              format: "equilibrio-spaces",
              version: 1,
              spaces: [
                {
                  name:
                    parsed.spaceName || parsed.profile || "Cópia individual",
                  data: parsed,
                },
              ],
            };
      if(window.LifeUI?.restoreCopy){await LifeUI.restoreCopy(raw);return;}
      const spaces = Q.unpack(raw);
      form(
        "Pré-visualização da recuperação",
        spaces
          .map(
            (s) =>
              "<p><b>" +
              esc(s.name) +
              "</b> · " +
              s.data.accounts.length +
              " contas · " +
              s.data.transactions.length +
              " movimentos · " +
              s.data.transactions.filter((t) => t.attachment).length +
              " comprovativos</p>" +
              (window.WorkflowsUI?.backupComparison(s.data) || ""),
          )
          .join(""),
        () => {
          const count = LifeUI.importSpaces(raw);
          notice(
            count + " espaços recuperados. Seleciona-os na barra lateral.",
          );
          return true;
        },
        "Comparação com o espaço aberto: " +
          esc(LifeUI.activeSpace().name) +
          ". Cada espaço da cópia é comparado separadamente. A recuperação cria espaços novos; não funde nem substitui os atuais.",
        "Criar espaços recuperados",
      );
    } catch (error) {
      notice(error.message, true);
    }
  };
  const previousActions = FeatureUI.transactionActions;
  FeatureUI.transactionActions = (t) =>
    previousActions(t) +
    (t.type === "expense" ? b(
      t.receiptRequired ? "Dispensar comprovativo" : "Pedir fatura",
      "plan-receipt",
      t.id,
    ) : "");
  const prior = PremiumUI.render;
  PremiumUI.render = () => {
    prior();
    render();
  };
  const priorNav = PremiumUI.navigation;
  PremiumUI.navigation = (target) => {
    priorNav?.(target);
    if (!window.UILifecycle?.inRender?.() && planningDetailsDirty && planningDetailsVisible()) render();
  };
  window.PlanningUI = { render };
  if (!window.equilibrioStartup?.awaitingChoice) render();
  if (
    document
      .getElementById(window.equilibrioInitialRoute)
      ?.classList.contains("view")
  )
    navigate(window.equilibrioInitialRoute);
})();
