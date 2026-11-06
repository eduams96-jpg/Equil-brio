/* Património e Análises: leitura rápida a partir dos dados reais, sem alterar o livro. */
(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  let categoryGroups = [];
  const money = (value) => eur(Number(value) || 0);
  const safe = (value) => esc(value == null ? "" : value);
  const total = (list, value) => F.money((list || []).reduce((sum, item) => sum + (Number(value(item)) || 0), 0));
  const percentChange = (current, previous) =>
    previous ? `${current >= previous ? "+" : ""}${Math.round(((current - previous) / Math.abs(previous)) * 100)}%` : "sem base";
  const monthName = (value) => monthLabel(value).replace(/^./, (character) => character.toUpperCase());
  const routeButton = (route, label, className = "") =>
    `<button type="button" class="wa-v3-link ${className}" data-wa-route="${route}">${label} <span aria-hidden="true">→</span></button>`;

  function setupWealth() {
    const page = byId("wealth");
    if (!page || byId("wealthV3Overview")) return;
    const header = page.querySelector(":scope > .section-head");
    header?.querySelector("h2")?.replaceChildren("Património");
    header?.querySelector("p")?.replaceChildren("O que tens, o que deves e como evolui.");
    const overview = document.createElement("div");
    overview.id = "wealthV3Overview";
    overview.className = "wa-v3-overview wealth-v3-overview";
    header?.after(overview);
    const more = document.createElement("div");
    more.id = "wealthLegacyViews"; more.hidden = true;
    
    for (const selector of ["#addInvestment", ":scope > .wealth-cards", ":scope > .report-grid", "#wealthEvolution", ":scope > .context-help"]) {
      const node = page.querySelector(selector);
      if (node) more.append(node);
    }
    page.append(more);
  }

  function setupAnalysis() {
    const page = byId("insights");
    if (!page || byId("analysisV3Overview")) return;
    const header = page.querySelector(":scope > .section-head");
    header?.querySelector("h2")?.replaceChildren("O teu dinheiro, com contexto.");
    header?.querySelector("p")?.replaceChildren("Tendências, revisão mensal e fecho no mesmo lugar.");
    header?.querySelector(":scope > div")?.insertAdjacentHTML("afterbegin", '<span class="wa-v3-eyebrow">ANÁLISES</span>');
    const overview = document.createElement("div");
    overview.id = "analysisV3Overview";
    overview.className = "wa-v3-overview analysis-v3-overview";
    header?.after(overview);
    const more = document.createElement("details");
    more.className = "wa-v3-more analysis-v3-more";
    more.innerHTML = '<summary><span><b>Explorar análises detalhadas</b><small>Recorrentes, comparações, comerciantes e outras leituras</small></span><span class="wa-v3-more-toggle" aria-hidden="true">Ver detalhes</span></summary>';
    for (const child of [...page.children]) {
      if (child !== header && child !== overview) more.append(child);
    }
    page.append(more);
  }

  function wealthHistoryChart(wealth) {
    const current = wealth.net;
    const history = wealth.history;
    if (!history.length)
      return '<div class="wealth-v3-chart-empty">Ainda não há valores guardados. Usa «Guardar valor de hoje» para começares a acompanhar a tendência.</div>';
    const points = history.length === 1
      ? [{ ...history[0], x: 70 }, { ...history[0], x: 580 }]
      : history.map((point, index) => ({ ...point, x: 70 + (index / (history.length - 1)) * 510 }));
    const values = points.map((point) => Number(point.net));
    const minimum = Math.min(...values, current);
    const maximum = Math.max(...values, current);
    const padding = Math.max(1, (maximum - minimum) * .2);
    const bottom = minimum - padding;
    const range = maximum - minimum + 2 * padding;
    const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${(170 - ((Number(point.net) - bottom) / range) * 145).toFixed(1)}`).join(" ");
    const last = points.at(-1);
    const y = 170 - ((Number(last.net) - bottom) / range) * 145;
    const grid = [0,.5,1].map(fraction => { const y = 170 - fraction * 145; return `<path class="wealth-v3-chart-base" d="M70 ${y}H580"/><text x="62" y="${y+4}" text-anchor="end" class="sensitive-value">${safe(Math.round(bottom + range * fraction).toLocaleString('pt-PT'))} €</text>`; }).join('');
    return `<svg class="wealth-v3-chart" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Evolução de ${money(history[0].net)} em ${dateLabel(history[0].date)} para ${money(last.net)} em ${dateLabel(last.date)}">${grid}<path class="wealth-v3-chart-area" d="${path} L580,170 L70,170 Z"/><path class="wealth-v3-chart-line" d="${path}"/><circle cx="${last.x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/></svg><div class="wealth-v3-chart-labels"><span>${dateLabel(history[0].date)}</span><span>${dateLabel(last.date)}</span></div>`;
  }

  function renderWealth() {
    const host = byId("wealthV3Overview");
    if (!host) return;
    const today = F.today();
    const wealth = WealthModel.summary(data, today);
    const I = (name) => window.InterfaceUI?.icon ? InterfaceUI.icon(name) : "";
    const accounts = (data.accounts || []).filter((item) => !item.archived);
    const investments = data.investments || [];
    const assets = data.assets || [];
    const { cash, investments: investmentValue, assets: assetValue, debts: debtValue, monthlyPayments, net, positive, delta, previousDate, historyCount, debtCount, unchecked } = wealth;
    const share = (value) => positive ? Math.max(0, value) / positive * 100 : 0;
    const pct = (value) => `${Math.round(share(value))}%`;
    const pending = ["Por conferir", "Rever avaliação", "Sem avaliação"];
    const entries = [
      ...accounts.map((item) => {
        const posted = (data.transactions || []).filter((t) => (t.account === item.name || t.targetAccount === item.name) && t.date <= today).map((t) => t.date).filter(F.validDate).sort().at(-1);
        const checked = F.validDate(item.reconciledOn) && (!posted || posted <= item.reconciledOn);
        return { id: "account:" + item.id, kind: "account", name: item.name, type: item.type || "Conta", value: F.balanceAt(data, item, today), date: item.reconciledOn, status: checked ? "Conferida" : "Por conferir" };
      }),
      ...assets.map((item) => {
        const date = (item.valuations || []).filter((v) => v.date <= today).map((v) => v.date).sort().at(-1);
        const stale = !date || date < FinancePlus.monthAdd(today.slice(0, 7), -6) + "-01";
        return { id: "asset:" + item.id, kind: "asset", name: item.name, type: item.kind || "Bem", value: LifeFinance.assetValue(item), date, status: !date ? "Sem avaliação" : stale ? "Rever avaliação" : "Avaliação registada" };
      }),
    ];
    const review = entries.filter((item) => pending.includes(item.status));
    // productivity-ui.js adds "Ver composição" to this card; keep it across redraws.
    const contribution = byId("wealthContributionButton");
    const tile = (tone, icon, label, value, detail) => `<article class="ch-tile is-${tone}"><span class="ch-tile-icon">${I(icon)}</span><div><span>${label}</span><strong class="amount">${value}</strong><small>${detail}</small></div></article>`;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const parts = [
      ["accounts", "Contas", cash, plural(accounts.length, "conta ativa", "contas ativas")],
      ["investments", "Investimentos", investmentValue, plural(investments.length, "posição", "posições")],
      ["assets", "Bens", assetValue, plural(assets.length, "bem", "bens")],
    ];
    const reviewCard = (item) => {
      const account = item.kind === "account";
      return `<article class="wl-review-card${account ? "" : " is-asset"}"><span class="wl-kind-badge kind-${item.kind}">${I(account ? "account" : "box")}</span><div class="wl-review-main"><h4>${safe(item.name)}</h4><p>${safe(item.type)} · ${F.validDate(item.date) ? (account ? "conferida a " : "avaliada a ") + dateLabel(item.date) : account ? "nunca conferida" : "sem avaliação"}</p></div><div class="wl-review-side"><strong class="amount">${money(item.value)}</strong><span class="wl-status is-pending">${safe(item.status)}</span></div><button type="button" class="secondary" data-u-open-record="${safe(item.id)}">${account ? "Conferir saldo" : "Registar avaliação"}</button></article>`;
    };
    host.innerHTML = `
      <div class="wl-tiles">
        ${tile(net >= 0 ? "green" : "red", "chart", "Património líquido", money(net), delta === null ? "Sem valores guardados para comparar" : `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))} desde ${dateLabel(previousDate)}`)}
        ${tile("blue", "account", "Contas", money(cash), unchecked ? plural(unchecked, "conta por conferir", "contas por conferir") : "Todas conferidas")}
        ${tile("purple", "box", "Bens e investimentos", money(investmentValue + assetValue), `${plural(assets.length, "bem", "bens")} · ${plural(investments.length, "posição", "posições")}`)}
        ${tile(debtValue ? "amber" : "green", "alert", "Créditos", money(-debtValue), debtValue ? `Prestações de ${money(monthlyPayments)}/mês` : "Sem créditos em dívida")}
      </div>
      <div class="wl-grid">
        <article class="wl-card wl-evolution">
          <header class="wl-card-head"><div><h3>Evolução</h3><p>${delta === null ? "Guarda o valor de hoje para começares a acompanhar a tendência." : `<span class="amount ${delta >= 0 ? "positive" : "negative"}">${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))}</span> face ao último valor guardado (${plural(historyCount, "registo", "registos")})`}</p></div><button type="button" class="secondary" data-action="snapshot">${I("history")}Guardar valor de hoje</button></header>
          ${wealthHistoryChart(wealth)}
        </article>
        <article class="wl-card wl-composition wealth-v3-composition">
          <header class="wl-card-head"><div><h3>Composição</h3><p>Ativos de ${money(positive)}</p></div></header>
          <div class="wl-stack" role="img" aria-label="Composição dos ativos: ${parts.map(([, label, value]) => `${label} ${money(value)}`).join(", ")}">${parts.map(([key, , value]) => `<i class="part-${key}" style="width:${share(value).toFixed(2)}%"></i>`).join("")}</div>
          <ul class="wl-parts">
            ${parts.map(([key, label, value, detail]) => `<li><span class="wl-dot part-${key}"></span><div><b>${label}</b><small>${detail}</small></div><strong class="amount">${money(value)}</strong><em>${pct(value)}</em></li>`).join("")}
            <li class="is-debt"><span class="wl-dot part-debts"></span><div><b>Créditos</b><small>${plural(debtCount, "crédito em dívida", "créditos em dívida")}</small></div><strong class="amount">${debtValue ? "−" : ""}${money(debtValue)}</strong><em>${positive ? Math.round(debtValue / positive * 100) + "%" : "—"}</em></li>
          </ul>
          <button type="button" class="wa-v3-link" data-wa-route="wealthMoneyHub">Ver inventário <span aria-hidden="true">→</span></button>
        </article>
      </div>
      <article id="wealthInventory" class="wl-card wl-review">
        <header class="wl-card-head"><div><h3>A rever</h3><p>Contas por conferir com o extrato e bens sem avaliação recente (6 meses).</p></div>${review.length ? `<span class="wl-count">${review.length}</span>` : ""}</header>
        ${review.length ? `<div class="wl-review-grid">${review.slice(0, 24).map(reviewCard).join("")}</div>${review.length > 24 ? `<p class="wl-more">Mais ${review.length - 24} no <button type="button" class="wa-v3-link" data-wa-route="wealthMoneyHub">Inventário</button>.</p>` : ""}` : `<div class="wl-empty">${I("check")}<strong>Tudo em dia</strong><p>Não há contas por conferir nem bens por avaliar.</p></div>`}
      </article>
      <p class="wl-footnote">Transferências entre contas não alteram o património. Os bens usam a última avaliação registada; a evolução usa apenas os valores guardados.</p>`;
    if (contribution) host.querySelector(".wl-composition")?.append(contribution);
  }

  function categoryOverview() {
    const categories = new Map();
    for (const entry of F.expenseEntries(data, month)) {
      const name = String(entry.category || "Outros").split(" / ")[0].trim() || "Outros";
      categories.set(name, F.money((categories.get(name) || 0) + (Number(entry.amount) || 0)));
    }
    const ranked = [...categories].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 3);
    const rest = F.money(ranked.slice(3).reduce((sum, [, value]) => sum + value, 0));
    categoryGroups = top.map(([name]) => ({ label: name, names: [name] }));
    if (rest > 0) categoryGroups.push({ label: "Outras", names: ranked.slice(3).map(([name]) => name) });
    if (rest > 0) top.push(["Outras", rest]);
    const sum = top.reduce((value, item) => value + item[1], 0);
    if (!sum) return '<div class="analysis-v3-empty"><p>Ainda não há despesas categorizadas neste mês.</p><button type="button" class="wa-v3-link" data-wa-route="transactions">Ver movimentos →</button></div>';
    const colors = ["#80dfbb", "#8dc5df", "#f8c978", "#93aab3"];
    let point = 0;
    const stops = top.map(([, value], index) => {
      const start = point;
      point += (value / sum) * 100;
      return `${colors[index]} ${start.toFixed(2)}% ${point.toFixed(2)}%`;
    }).join(",");
    return `<div class="analysis-v3-categories"><div class="analysis-v3-donut" style="--analysis-v3-stops:${stops}" role="img" aria-label="Distribuição das despesas por categoria"><div><small>Despesas</small><strong>${money(sum)}</strong></div></div><div class="analysis-v3-legend">${top.map(([name, value], index) => `<button type="button" data-wa-category="${index}" aria-label="Ver movimentos de ${safe(name)}"><span><i style="background:${colors[index]}"></i>${safe(name)}</span><b>${Math.round(value / sum * 100)}%</b></button>`).join("")}</div></div>`;
  }

  function monthlyBars(months) {
    const high = Math.max(1, ...months.flatMap((item) => [item.income, item.expense]));
    return `<div class="analysis-v3-chart" role="group" aria-label="Receitas e despesas dos últimos seis meses; escolhe um mês para ver movimentos">${months.map((item) => `<button type="button" class="analysis-v3-bar-group" data-wa-month="${item.month}" aria-label="Ver movimentos de ${safe(monthName(item.month))}: receitas ${money(item.income)}, despesas ${money(item.expense)}"><span class="analysis-v3-bar-pair"><span class="income" style="height:${item.income > 0 ? Math.max(2, item.income / high * 100).toFixed(1) : 0}%"></span><span class="expense" style="height:${item.expense > 0 ? Math.max(2, item.expense / high * 100).toFixed(1) : 0}%"></span></span><small>${safe(new Date(item.month + "-01T12:00:00").toLocaleDateString("pt-PT", { month: "short" }))}</small></button>`).join("")}</div>`;
  }

  function renderAnalysis() {
    const host = byId("analysisV3Overview");
    if (!host) return;
    const selected = F.totals(data, month);
    const previousMonth = FinancePlus.monthAdd(month, -1);
    const previous = F.totals(data, previousMonth);
    const series = Array.from({ length: 6 }, (_, index) => {
      const key = FinancePlus.monthAdd(month, index - 5);
      return { month: key, ...F.totals(data, key) };
    });
    const net = F.money(selected.income - selected.expense);
    const previousNet = F.money(previous.income - previous.expense);
    const closed = (data.closedMonths || []).includes(month);
    const trend = net - previousNet;
    const unclassified = (data.transactions || []).filter((item) =>
      item.date?.startsWith(month) && item.type === "expense" && !item.splits &&
      (!item.category || ["Outros", "Por categorizar"].includes(item.category))).length;
    const currentAccounts = (data.accounts || []).filter((account) => !account.archived);
    const ready = [
      !(data.pendingImports || []).length,
      !unclassified,
      currentAccounts.length > 0 && currentAccounts.every((account) => account.reconciledOn?.startsWith(month)),
    ].filter(Boolean).length;
    const preparation = closed ? 3 : ready;
    host.innerHTML = `
      <div class="wa-v3-toolbar"><span class="wa-v3-period">${safe(monthName(month))}</span><span>Todas as contas · comparação com ${safe(monthName(previousMonth))}</span></div>
      <div class="analysis-v3-metrics"><article class="wa-v3-card"><span>Receitas do mês</span><strong>${money(selected.income)}</strong><small>${percentChange(selected.income, previous.income)} face ao mês anterior</small></article><article class="wa-v3-card"><span>Despesas do mês</span><strong>${money(selected.expense)}</strong><small>${percentChange(selected.expense, previous.expense)} face ao mês anterior</small></article><article class="wa-v3-card result"><span>Saldo do mês</span><strong class="${net < 0 ? "negative" : ""}">${net >= 0 ? "+" : ""}${money(net)}</strong><small>${trend >= 0 ? "+" : ""}${money(trend)} face ao mês anterior</small></article></div>
      <div class="analysis-v3-chart-grid"><article class="wa-v3-card analysis-v3-chart-card"><div class="wa-v3-card-heading"><div><h3>Receitas e despesas</h3><p>Seis meses de evolução, com leitura imediata do saldo.</p></div><div class="analysis-v3-key"><span><i class="income"></i>Receitas</span><span><i class="expense"></i>Despesas</span></div></div>${monthlyBars(series)}<div class="analysis-v3-insight">${trend >= 0 ? "↗" : "↘"} ${trend >= 0 ? "O saldo melhorou" : "O saldo recuou"} ${money(Math.abs(trend))} face a ${safe(monthName(previousMonth))}.</div></article><article class="wa-v3-card analysis-v3-category-card"><div class="wa-v3-card-heading"><div><h3>Para onde foi o dinheiro</h3><p>As categorias com maior peso neste mês.</p></div></div>${categoryOverview()}${routeButton("insights", "Explorar categorias", "wa-v3-footer-link" )}</article></div>
      <div class="analysis-v3-next-grid"><article class="wa-v3-card analysis-v3-next"><div class="wa-v3-card-heading"><div><h3>Revisão mensal</h3><p>O essencial para perceber e corrigir.</p></div>${routeButton("reviewMonthHub", "Abrir revisão")}</div><div class="analysis-v3-next-row"><span class="analysis-v3-next-icon">1</span><div><b>O que mudou neste mês</b><small>Despesas, categorias e comparação com o período anterior.</small></div></div><div class="analysis-v3-next-row"><span class="analysis-v3-next-icon">2</span><div><b>Resolver o que está pendente</b><small>Importações, saldos e movimentos por classificar.</small></div></div></article><article class="wa-v3-card analysis-v3-next closing"><div class="wa-v3-card-heading"><div><h3>Fecho e relatórios</h3><p>Fecha o mês com confiança e guarda o resultado.</p></div><span class="analysis-v3-status ${closed ? "closed" : ""}">${closed ? "Mês fechado" : "Por fechar"}</span></div><div class="analysis-v3-progress" role="progressbar" aria-label="Preparação preliminar do mês" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${preparation}"><span style="width:${preparation / 3 * 100}%"></span></div><p>${closed ? "O mês está protegido contra alterações. Podes consultar e exportar os relatórios." : `${preparation} de 3 verificações preliminares prontas: importações, categorias e contas. Confirma o fecho na página de relatórios.`}</p>${routeButton("reports", closed ? "Ver relatórios" : "Continuar fecho", "wa-v3-footer-link")}</article></div>`;
    host.querySelector('[data-wa-route="insights"]')?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const detail = byId("insights")?.querySelector(":scope > .analysis-v3-more");
      if (detail) {
        detail.open = true;
        detail.querySelector("#categoryBreakdown")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function render() {
    setupWealth();
    setupAnalysis();
    renderWealth();
    renderAnalysis();
  }

  document.addEventListener("click", (event) => {
    const monthBar = event.target.closest("[data-wa-month]");
    if (monthBar && byId("analysisV3Overview")?.contains(monthBar)) {
      const selectedMonth = monthBar.dataset.waMonth;
      const end = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
      window.CompleteUI?.reviewRange?.(`${selectedMonth}-01`, `${selectedMonth}-${String(end).padStart(2, "0")}`);
      return;
    }
    const category = event.target.closest("[data-wa-category]");
    if (category && byId("analysisV3Overview")?.contains(category)) {
      const group = categoryGroups[Number(category.dataset.waCategory)];
      if (!group) return;
      const entries = F.expenseEntries(data, month).filter((entry) => group.names.includes(String(entry.category || "Outros").split(" / ")[0].trim() || "Outros"));
      const list = entries.slice(0, 25).map((entry) => `<div class="attention-row"><span>${safe(dateLabel(entry.date))} · ${safe(entry.description)} · ${safe(entry.category)}</span><strong>${money(entry.amount)}</strong></div>`).join("");
      const rest = entries.length > 25 ? `<details><summary>Ver mais ${entries.length - 25} movimentos</summary>${entries.slice(25).map((entry) => `<div class="attention-row"><span>${safe(dateLabel(entry.date))} · ${safe(entry.description)} · ${safe(entry.category)}</span><strong>${money(entry.amount)}</strong></div>`).join("")}</details>` : "";
      form(`Movimentos: ${safe(group.label)}`, `<p class="amount">Total: ${money(total(entries, (entry) => entry.amount))}</p>${list}${rest}`, () => true, "Inclui repartições por categoria e reembolsos.", "Concluir");
      return;
    }
    const route = event.target.closest("[data-wa-route]");
    if (route && (byId("wealthV3Overview")?.contains(route) || byId("insights")?.querySelector(":scope > .section-head")?.contains(route) || byId("analysisV3Overview")?.contains(route))) {
      navigate(route.dataset.waRoute);
      return;
    }
    const trade = event.target.closest('[data-wa-action="trade"]');
    if (trade && byId("wealth")?.contains(trade)) {
      navigate("wealthHoldingsHub");
      byId("investmentsHub")?.querySelector('[data-action="life-trade"]')?.click();
    }
    const exportReport = event.target.closest('[data-wa-action="export-report"]');
    if (exportReport && byId("insights")?.contains(exportReport)) {
      navigate("reports");
      byId("reports")?.querySelector('[data-action="life-annual-export"]')?.click();
    }
  });

  // Icons come from interface-ui.js, loaded later: redraw when the page is opened.
  const priorNavigation = window.PremiumUI?.navigation;
  if (window.PremiumUI) PremiumUI.navigation = (v) => { priorNavigation?.(v); if (v === "wealth") { setupWealth(); renderWealth(); } };
  window.WealthAnalysisV3 = { render };
  if (!window.equilibrioStartup?.awaitingChoice) render();
})();
