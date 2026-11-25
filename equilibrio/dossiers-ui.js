/* Interface unificada para Centro de Avisos, Rotinas e Custo Acumulado de Equipamentos,
 * Consumos Domésticos (Água, Eletricidade, Gás), Ficha do Veículo, Dossier da Habitação
 * e Pesquisa no Conteúdo dos PDFs. */
(() => {
  'use strict';
  const D = window.DossiersFinance;
  const P = window.PracticalFinance;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const memory = new Map();

  function uiState() {
    if (!memory.has(key)) {
      memory.set(key, {
        noticeArea: 'all',
        noticePriority: 'all',
        noticeState: 'active',
        noticeQuery: '',
        vehicleId: '',
        housingId: '',
        pdfQuery: '',
        pdfSource: 'all',
      });
    }
    return memory.get(key);
  }

  function makeSection(id, className, area, label) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('section');
      el.id = id;
      el.className = className;
      $('#mainContent')?.append(el);
    }
    if (area && label && window.PremiumUI?.addPage) {
      PremiumUI.addPage(area, id, label);
    }
    return el;
  }

  const noticesHost = makeSection('noticesHub', 'view notices-page', '', '');
  const consumosHost = makeSection('casaConsumos', 'view casa-view consumos-page', 'Casa', 'Consumos');
  const vehiclesHost = makeSection('casaVehicles', 'view casa-view vehicles-page', 'Casa', 'Veículos');
  const housingHost = makeSection('casaHousing', 'view casa-view housing-page', 'Casa', 'Habitação');

  // Top bar shortcut for Notice Center
  const topSlot = $('#topFinanceSlot');
  let topNoticesBtn = $('#topNoticesBtn');
  if (topSlot && !topNoticesBtn) {
    topNoticesBtn = document.createElement('button');
    topNoticesBtn.id = 'topNoticesBtn';
    topNoticesBtn.type = 'button';
    topNoticesBtn.className = 'secondary top-notices-btn';
    topNoticesBtn.onclick = () => navigate('noticesHub');
    topSlot.prepend(topNoticesBtn);
  }

  const field = (label, name, value = '', type = 'text', attrs = '') =>
    `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value ?? '')}" ${attrs}></label>`;
  const select = (label, name, items, value = '', attrs = '') =>
    `<label>${esc(label)}<select name="${esc(name)}" ${attrs}>${items.map(([id, text]) => `<option value="${esc(id)}" ${String(id) === String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const btn = (label, action, id = '', extra = '', cls = 'secondary') =>
    `<button type="button" class="${cls}" data-dossier-action="${esc(action)}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;

  async function extractPdfTextSafe(file) {
    if (!file || !window.ReceiptReader?.read) return { text: '', ocrStatus: 'empty' };
    try {
      const res = await window.ReceiptReader.read(file, undefined, undefined, { attachment: false, fastTextOnly: true });
      const text = String(res?.text || '').replace(/\u0000/g, '').trim().slice(0, 120000);
      return { text, ocrStatus: text ? 'text' : 'empty' };
    } catch {
      return { text: '', ocrStatus: 'failed' };
    }
  }

  async function readPdfFromDataUrl(attachment, onProgress) {
    if (!attachment?.data || typeof attachment.data !== 'string') throw Error('O PDF não está disponível.');
    const idx = attachment.data.indexOf(',');
    if (idx < 0) throw Error('Formato de PDF inválido.');
    const binary = atob(attachment.data.slice(idx + 1));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const file = new File([bytes], attachment.name || 'documento.pdf', { type: 'application/pdf' });
    const res = await window.ReceiptReader.read(file, onProgress || (() => {}), undefined, { attachment: false });
    const text = String(res?.text || '').replace(/\u0000/g, '').trim().slice(0, 120000);
    const usedOcr = res?.reading?.pages?.some(p => p.method === 'ocr');
    return { text, ocrStatus: text ? (usedOcr ? 'ocr' : 'text') : 'empty' };
  }

  // ============================================================================
  // 1. CENTRO DE AVISOS GERAL
  // ============================================================================
  const priorityLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
  const stateLabels = {
    overdue: 'Em atraso',
    upcoming: 'Próximo',
    active: 'Ativo',
    snoozed: 'Adiado',
    dismissed: 'Dispensado',
    paid: 'Liquidado',
    cancelled: 'Cancelado',
  };
  const noticeAreas = [
    ['all', 'Todas as origens'],
    ['payments', 'Pagamentos e renovações'],
    ['warranties', 'Garantias'],
    ['food', 'Validades alimentares'],
    ['routines', 'Equipamentos e rotinas'],
    ['dossiers', 'Veículo e habitação'],
  ];

  const areaIcons = {
    payments: '📅',
    warranties: '🛡️',
    food: '🥫',
    routines: '🔧',
    dossiers: '🏠',
  };

  // Os avisos só mudam quando os dados (commit) ou o dia mudam; navegar não os recalcula.
  let noticesCache = null;
  function getCachedNotices(opts) {
    if (opts) return D.notices(data, opts);
    const stamp = { data, revision: window.equilibrioDataRevision || 0, day: F.today() };
    if (noticesCache && noticesCache.data === stamp.data && noticesCache.revision === stamp.revision && noticesCache.day === stamp.day) return noticesCache.value;
    noticesCache = { ...stamp, value: D.notices(data) };
    return noticesCache.value;
  }

  function updateTopNoticesBadge() {
    if (!topNoticesBtn || !D) return;
    try {
      const summary = getCachedNotices();
      const activeCount = summary.counts.active;
      const highCount = summary.counts.high;
      topNoticesBtn.dataset.activeCount = String(activeCount);
      topNoticesBtn.dataset.hasActive = activeCount > 0 ? 'true' : 'false';
      topNoticesBtn.dataset.urgent = highCount > 0 ? 'true' : 'false';
      topNoticesBtn.innerHTML =
        `<span class="top-notices-icon" aria-hidden="true">🔔</span>` +
        `<span class="top-notices-label">Avisos</span>` +
        (activeCount ? `<span class="top-notices-pill">${activeCount}</span>` : '');
      topNoticesBtn.title = activeCount
        ? `${activeCount} aviso(s) ativo(s)${highCount ? `, ${highCount} de prioridade alta` : ''}`
        : 'Centro de avisos sem alertas pendentes';
    } catch {
      topNoticesBtn.innerHTML = `<span class="top-notices-icon" aria-hidden="true">🔔</span><span class="top-notices-label">Avisos</span>`;
    }
  }

  function renderDashboardNoticesBanner() {
    const existing = document.getElementById('dashboardNoticesBanner');
    if (existing) existing.remove();
  }

  function renderNoticesHub() {
    if (view !== 'noticesHub') return;
    const s = uiState();
    const res = D.notices(data, {
      area: s.noticeArea,
      priority: s.noticePriority,
      status: s.noticeState,
      query: s.noticeQuery,
    });
    const allActive = getCachedNotices()?.rows || [];
    const byAreaCount = areaId => areaId === 'all' ? allActive.length : allActive.filter(n => n.area === areaId).length;
    const selected=res.rows.find(n=>n.id===s.noticeSelected)||res.rows[0];s.noticeSelected=selected?.id||'';
    const I = name => window.InterfaceUI?.icon ? InterfaceUI.icon(name) : '';
    const master=res.rows.map(n=>{const stateText=stateLabels[n.effectiveState]||n.effectiveState,tagText=n.priority==='high'&&n.effectiveState!=='overdue'?'Alta · '+stateText:stateText;return `<button type="button" class="notice-list-item nt-row priority-${esc(n.priority)} ${n.id===s.noticeSelected?'is-selected':''}" data-notice-select="${esc(n.id)}" aria-pressed="${n.id===s.noticeSelected}"><span class="nt-row-icon" aria-hidden="true">${areaIcons[n.area]||'🔔'}</span><span class="notice-list-title">${esc(n.title)}</span><strong class="amount">${n.amount!==null&&n.amount!==undefined?eur(n.amount):''}</strong><small>${n.date?dateLabel(n.date)+' · ':''}${esc(n.areaLabel)}</small><span class="notice-state-tag state-${esc(n.effectiveState)}">${esc(tagText)}</span></button>`;}).join('');
    const kpi = (tone, icon, label, value, note, state, id) => `<button type="button" class="ch-tile nt-kpi is-${tone}${(state === 'high' ? s.noticeState === 'active' && s.noticePriority === 'high' : s.noticeState === state && s.noticePriority === 'all') ? ' is-active' : ''}" data-notice-kpi="${state}"><span class="ch-tile-icon">${I(icon)}</span><div><span>${label}</span><strong id="${id}">${value}</strong><small>${note}</small></div></button>`;
    const states = [['active', 'Ativos'], ['overdue', 'Em atraso'], ['snoozed', 'Adiados'], ['dismissed', 'Dispensados'], ['resolved', 'Concluídos'], ['all', 'Todos']];

    noticesHost.innerHTML =
      `<div class="section-head notices-hero-head nt-head">` +
        `<div>` +
          `<h2>Centro de avisos</h2>` +
        `</div>` +
        `<div class="row-actions">` +
          `<button type="button" class="secondary" data-goto-related="planner">Abrir Agenda</button><button type="button" class="secondary" data-goto-related="inboxHub">Ver pendências de dados</button><button type="button" class="secondary" data-notice-settings>${I('gear')}Configurar avisos</button>` +
        `</div>` +
      `</div>` +
      `<div id="noticesKpisWrap" class="u-metrics notices-kpis nt-kpis"></div>` +
      `<section class="panel notices-toolbar nt-toolbar">` +
        `<div class="nt-filter-row"><div class="cs-pills nt-states" role="group" aria-label="Estado">${states.map(([id, label]) => `<button type="button" class="${s.noticeState === id ? 'active' : ''}" data-notice-state-pill="${id}" aria-pressed="${s.noticeState === id}">${label}</button>`).join('')}</div>` +
        `<div class="notices-filters nt-filters">` +
          select('Origem', 'noticeAreaFilter', noticeAreas.map(([id, label]) => [id, id === 'all' ? 'Todas (' + byAreaCount('all') + ')' : `${label} (${byAreaCount(id)})`]), s.noticeArea, 'id="noticeAreaFilter"') +
          select('Prioridade', 'noticePriorityFilter', [['all', 'Todas'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']], s.noticePriority, 'id="noticePriorityFilter"') +
          field('Pesquisar', 'noticeQueryInput', s.noticeQuery, 'search', 'id="noticeQueryInput" placeholder="Procurar aviso…"') +
        `</div></div>` +
      `</section>` +
      `<section class="panel notices-list-panel" id="noticesListPanel"></section>` +
      `<details class="panel notices-sources-explainer">` +
        `<summary><span><strong>Origens monitorizadas automaticamente</strong><small>Ver regras de deteção deste espaço</small></span></summary>` +
        `<div class="notices-sources-grid">` +
          `<div class="notices-source-item"><strong>📅 Pagamentos, Agenda e Recorrências</strong><p>Compromissos agendados, regras recorrentes ativas (ex.: água, eletricidade, gás, internet, renda), subscrições, prestações e créditos mensais dentro do prazo que escolheste ou em atraso.</p></div>` +
          `<div class="notices-source-item"><strong>🛡️ Garantias</strong><p>Garantias de equipamentos registados em <em>Casa → Equipamentos</em> e movimentos financeiros com data de garantia dentro do prazo configurado.</p></div>` +
          `<div class="notices-source-item"><strong>🥫 Validades alimentares</strong><p>Lotes com quantidade disponível em <em>Casa → Stock / Despensa</em> cuja validade expira dentro do prazo configurado ou já expirou.</p></div>` +
          `<div class="notices-source-item"><strong>🔧 Equipamentos e rotinas</strong><p>Planos de manutenção/substituição de equipamentos domésticos e rotinas preventivas periódicas com data próxima ou em atraso.</p></div>` +
          `<div class="notices-source-item"><strong>🚗🏠 Veículos e Habitação</strong><p>Datas de Inspeção (IPO), Seguro, IUC e Revisão em <em>Casa → Veículos</em>, bem como Seguros, IMI, Condomínio e Contratos em <em>Casa → Habitação</em>.</p></div>` +
        `</div>` +
      `</details>`;

    const drawNoticeResults = (currentRes = null) => {
      const r = currentRes || D.notices(data, {
        area: s.noticeArea,
        priority: s.noticePriority,
        status: s.noticeState,
        query: s.noticeQuery,
      });
      const sel = r.rows.find(n => n.id === s.noticeSelected) || r.rows[0];
      s.noticeSelected = sel?.id || '';
      const masterHtml = r.rows.map(n => {
        const stateText = stateLabels[n.effectiveState] || n.effectiveState;
        const tagText = n.priority === 'high' && n.effectiveState !== 'overdue' ? 'Alta · ' + stateText : stateText;
        return `<button type="button" class="notice-list-item nt-row priority-${esc(n.priority)} ${n.id === s.noticeSelected ? 'is-selected' : ''}" data-notice-select="${esc(n.id)}" aria-pressed="${n.id === s.noticeSelected}"><span class="nt-row-icon" aria-hidden="true">${areaIcons[n.area] || '🔔'}</span><span class="notice-list-title">${esc(n.title)}</span><strong class="amount">${n.amount !== null && n.amount !== undefined ? eur(n.amount) : ''}</strong><small>${n.date ? dateLabel(n.date) + ' · ' : ''}${esc(n.areaLabel)}</small><span class="notice-state-tag state-${esc(n.effectiveState)}">${esc(tagText)}</span></button>`;
      }).join('');
      const kpiWrap = $('#noticesKpisWrap', noticesHost);
      if (kpiWrap) {
        kpiWrap.innerHTML =
          kpi('blue', 'bell', 'Ativos', r.counts.active, 'Por ver', 'active', 'noticesActiveCount') +
          kpi(r.counts.high ? 'red' : 'green', 'alert', 'Prioridade alta / Atraso', r.counts.high, 'Urgentes', 'high', 'noticesHighCount') +
          kpi('amber', 'clock', 'Adiados', r.counts.snoozed, 'Silenciados', 'snoozed', 'noticesSnoozedCount') +
          kpi('purple', 'check', 'Dispensados', r.counts.dismissed, 'Arquivados', 'dismissed', 'noticesDismissedCount');
        for (const tile of $$('[data-notice-kpi]', kpiWrap)) tile.onclick = () => {
          s.noticeState = tile.dataset.noticeKpi === 'high' ? 'active' : tile.dataset.noticeKpi;
          s.noticePriority = tile.dataset.noticeKpi === 'high' ? 'high' : 'all';
          renderNoticesHub();
        };
      }
      const listPanel = $('#noticesListPanel', noticesHost);
      if (listPanel) {
        listPanel.innerHTML =
          `<div class="notices-workbench"><div class="notices-master" role="group" aria-label="Lista de avisos">${masterHtml}</div><div class="notices-detail">` +
            (r.rows.length
              ? `<div class="notices-list">${[sel].filter(Boolean).map(n =>
                  `<article class="notice-card priority-${esc(n.priority)} state-${esc(n.effectiveState)}" data-notice-row="${esc(n.id)}">` +
                    `<div class="notice-card-icon" aria-hidden="true">${areaIcons[n.area] || '🔔'}</div>` +
                    `<div class="notice-card-main">` +
                      `<div class="notice-card-badges">` +
                        `<span class="notice-badge priority-${esc(n.priority)}">Prioridade ${esc(priorityLabels[n.priority] || n.priority)}</span>` +
                        `<span class="notice-area-tag">${esc(n.areaLabel)}</span>` +
                        `<span class="notice-state-tag state-${esc(n.effectiveState)}">${esc(stateLabels[n.effectiveState] || n.effectiveState)}${n.snoozedUntil ? ' até ' + dateLabel(n.snoozedUntil) : ''}</span>` +
                      `</div>` +
                      `<h3>${esc(n.title)}</h3>` +
                      `<p class="notice-card-meta">` +
                        `<span>${esc(n.detail)}</span>` +
                        (n.date ? `<span class="notice-meta-pill">📅 ${dateLabel(n.date)}</span>` : '') +
                        (n.amount !== null && n.amount !== undefined ? `<strong class="notice-meta-amount">${eur(n.amount)}</strong>` : '') +
                      `</p>` +
                    `</div>` +
                    `<div class="row-actions notice-card-actions">` +
                      btn('Abrir origem', 'notice-open', n.id, '', 'primary') +
                      (n.isActive
                        ? btn('Adiar 7 dias', 'notice-snooze-7', n.id) +
                          btn('Adiar até…', 'notice-snooze-custom', n.id) +
                          btn('Dispensar', 'notice-dismiss', n.id)
                        : n.reviewed
                          ? btn('Repor ativo', 'notice-restore', n.id)
                          : '') +
                    `</div>` +
                  `</article>`
                ).join('')}</div>`
              : `<div class="notices-empty-state"><span aria-hidden="true">✨</span><h3>Sem avisos para o filtro selecionado</h3><p>Quando existirem pagamentos próximos na Agenda, garantias a expirar, validades na despensa ou rotinas pendentes, aparecerão aqui organizados por prioridade.</p></div>`) +
          `</div></div>`;
        const selectedButton = $('.nt-row.is-selected', listPanel);
        if (selectedButton) {
          selectedButton.after($('.notices-detail', listPanel));
          selectedButton.setAttribute('aria-controls', 'noticeSelectedDetail');
          $('.notices-detail', listPanel).id = 'noticeSelectedDetail';
        }
        for (const button of $$('[data-notice-select]', listPanel)) button.onclick = () => {
          s.noticeSelected = button.dataset.noticeSelect;
          drawNoticeResults();
          $('.nt-row.is-selected', listPanel)?.focus({ preventScroll: true });
        };
      }
    };

    drawNoticeResults(res);
    for (const pill of $$('[data-notice-area-pill]', noticesHost)) {
      pill.onclick = () => { s.noticeArea = pill.dataset.noticeAreaPill; renderNoticesHub(); };
    }
    for (const pill of $$('[data-notice-state-pill]', noticesHost)) pill.onclick = () => { s.noticeState = pill.dataset.noticeStatePill; renderNoticesHub(); };
    for (const link of $$('[data-goto-related]', noticesHost)) link.onclick = () => navigate(link.dataset.gotoRelated);
    const areaSel=$('#noticeAreaFilter', noticesHost); if(areaSel) areaSel.onchange = e => { s.noticeArea = e.target.value; renderNoticesHub(); };
    const prioSel=$('#noticePriorityFilter', noticesHost); if(prioSel) prioSel.onchange = e => { s.noticePriority = e.target.value; renderNoticesHub(); };
    const stateSel=$('#noticeStateFilter', noticesHost); if(stateSel) stateSel.onchange = e => { s.noticeState = e.target.value; renderNoticesHub(); };
    $('#noticeQueryInput', noticesHost).oninput = e => {
      s.noticeQuery = e.target.value;
      drawNoticeResults();
    };
    $('#addTransaction').hidden = true;
  }

  function openNoticeOrigin(noticeId) {
    const all = D.notices(data, { status: 'all' }).all;
    const item = all.find(n => n.id === noticeId);
    if (!item) return;
    const s = uiState();
    if (item.targetView === 'casaVehicles' && item.originId) s.vehicleId = item.originId;
    if (item.targetView === 'casaHousing' && item.originId) s.housingId = item.originId;
    if(item.targetView==='planner'&&F.validDate(item.date)){month=item.date.slice(0,7);$('#monthPicker').value=month;}
    navigate(item.targetView);
  }

  // ============================================================================
  // 2. EQUIPAMENTOS: CUSTO ACUMULADO E ROTINAS DOMÉSTICAS
  // ============================================================================
  const frequencyLabels = Object.fromEntries(Object.entries(D.FREQUENCIES).map(([key, rule]) => [key, rule.label]));

  function enhanceEquipmentPage() {
    if (view !== 'casaEquipment') return;
    const host = $('#casaEquipment');
    if (!host || !D) return;
    const summary = D.allEquipmentCosts(data);

    let costPanel = $('#equipmentCostSummary', host);
    if (!costPanel) {
      costPanel = document.createElement('section');
      costPanel.id = 'equipmentCostSummary';
      costPanel.className = 'panel equipment-cost-summary';
      const headEl = $('.section-head', host);
      if (headEl) headEl.after(costPanel);
      else host.prepend(costPanel);
    }
    costPanel.innerHTML =
      `<div class="u-head"><div><h3>Custo acumulado dos equipamentos</h3>` +
      `<p>Soma aquisição, intervenções realizadas e despesas pagas associadas sem duplicar pagamentos já ligados. Previsões futuras e reservas aparecem separadas.</p></div>` +
      `<div class="u-actions">${btn('Pesquisar nos PDFs', 'open-pdf-search', 'equipment')}</div></div>` +
      `<div class="u-metrics">` +
        `<article class="panel u-metric"><div><span>Aquisição registada</span><strong class="amount" id="equipTotalPurchase">${eur(summary.purchaseTotal)}</strong></div></article>` +
        `<article class="panel u-metric"><div><span>Manutenções e despesas efetivas</span><strong class="amount" id="equipTotalMaintenance">${eur(summary.maintenanceTotal)}</strong></div></article>` +
        `<article class="panel u-metric"><div><span>Custo acumulado efetivo</span><strong class="amount" id="equipTotalAccumulated">${eur(summary.accumulatedTotal)}</strong></div></article>` +
        `<article class="panel u-metric"><div><span>Previsão futura (fora do custo efetivo)</span><strong class="amount" id="equipTotalPlanned">${eur(summary.plannedFutureTotal)}</strong></div></article>` +
      `</div>`;

    // Enrich each equipment card with its deduplicated cost breakdown & PDF text controls
    const cards = $$('.practical-equipment-grid > article.panel', host);
    const equipList = P.state(data).equipment;
    cards.forEach((card, index) => {
      const e = equipList[index];
      if (!e) return;
      const c = summary.items.find(x => String(x.equipmentId) === String(e.id));
      if (!c) return;
      card.querySelector('.equipment-cost-breakdown')?.remove();
      const box = document.createElement('div');
      box.className = 'equipment-cost-breakdown';
      const pdfStatus = e.document
        ? (e.document.text?.trim()
            ? `PDF pesquisável (${e.document.ocrStatus === 'ocr' ? 'OCR' : 'texto extraído'})`
            : e.document.ocrStatus === 'failed'
              ? 'PDF preservado (leitura automática indisponível)'
              : 'PDF sem texto extraído')
        : '';
      box.innerHTML =
        `<p class="equipment-accumulated-line"><strong>Custo acumulado efetivo: ${eur(c.accumulatedTotal)}</strong> · ` +
        `Aquisição: ${eur(c.purchasePrice)} · Intervenções: ${eur(c.interventionsTotal)}` +
        (c.directTransactionsTotal > 0 ? ` · Despesas diretas: ${eur(c.directTransactionsTotal)}` : '') +
        ` · Previsão futura: ${eur(c.plannedFutureCost)}` +
        (c.reservedAmount > 0 ? ` · Reserva: ${eur(c.reservedAmount)}` : '') +
        `</p>` +
        (e.document
          ? `<p class="equipment-pdf-status"><span>${esc(pdfStatus)}</span> ${btn(e.document.text ? 'Rever/editar texto do PDF' : 'Extrair texto do PDF', 'equipment-read-pdf', e.id)}</p>`
          : '');
      const actionsRow = card.querySelector('.row-actions');
      if (actionsRow) actionsRow.before(box);
      else card.append(box);
    });

    // Routines section inside #casaEquipment
    let routinesSec = $('#practicalRoutinesSection', host);
    if (!routinesSec) {
      routinesSec = document.createElement('section');
      routinesSec.id = 'practicalRoutinesSection';
      routinesSec.className = 'panel practical-routines-section';
      host.append(routinesSec);
    }
    const today = F.today();
    const dueDays = r => Math.round((Date.parse(r.nextDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
    const routines = D.routines(data).slice().sort((x, y) => String(x.nextDate).localeCompare(String(y.nextDate)));
    const lateCount = routines.filter(r => dueDays(r) < 0).length, weekCount = routines.filter(r => dueDays(r) >= 0 && dueDays(r) <= 7).length;
    routinesSec.innerHTML =
      `<div class="u-head routines-head">` +
        `<div><h3>Rotinas domésticas e manutenção preventiva</h3>` +
        `<p>Tarefas periódicas com lista de verificação e histórico de conclusão.</p></div>` +
        `<div class="u-actions">` +
          (routines.length ? `<span class="routine-count${lateCount ? ' is-late' : ''}">${lateCount} em atraso</span><span class="routine-count">${weekCount} nos próximos 7 dias</span>` : '') +
          btn('+ Nova rotina', 'routine-form', '', '', 'primary') +
        `</div>` +
      `</div>` +
      (routines.length
        ? `<div class="routines-grid">${routines.map(r => {
            const equip = equipList.find(e => String(e.id) === String(r.equipmentId));
            const days = dueDays(r);
            const tone = days < 0 ? 'late' : days <= 7 ? 'soon' : 'ok';
            const statusText = days < 0 ? `Em atraso · ${Math.abs(days)} dia(s)` : days === 0 ? 'Para hoje' : `Daqui a ${days} dia(s)`;
            const freqText = frequencyLabels[D.routineFrequency(r)] || r.frequency;
            const lastExec = D.latestRoutineRun(r);
            const expectedNext = lastExec ? D.routineNextFromHistory(r, D.routineFrequency(r)) : '';
            const canRecalc = Boolean(expectedNext && expectedNext !== r.nextDate);
            const doneItems = (r.checklist || []).filter(c => c.done).length, totalItems = (r.checklist || []).length;
            return `<article class="panel routine-card is-${tone}" data-routine-id="${esc(r.id)}">` +
              `<div class="routine-card-top"><span class="routine-status">${esc(statusText)}</span><span class="routine-freq">${esc(freqText)}</span></div>` +
              `<div class="routine-card-head">` +
                `<h4>${esc(r.title)}</h4>` +
                `<p>${esc(r.area || 'Geral')}${equip ? ` · ${esc(equip.name)}` : ''}</p>` +
              `</div>` +
              `<dl class="routine-dates"><div><dt>Próxima</dt><dd>${dateLabel(r.nextDate)}</dd></div><div><dt>Última</dt><dd>${lastExec ? dateLabel(lastExec.date) : '—'}</dd></div></dl>` +
              (r.notes ? `<p class="routine-notes">${esc(r.notes)}</p>` : '') +
              (totalItems
                ? `<details class="routine-checklist-details"><summary><span>Lista de verificação</span><b>${doneItems}/${totalItems}</b><i class="routine-progress"><em style="width:${Math.round(doneItems / totalItems * 100)}%"></em></i></summary><div class="routine-checklist" aria-label="Lista de verificação">` +
                    r.checklist.map(c =>
                      `<label class="checkbox"><input type="checkbox" data-routine-check="${esc(r.id)}" data-check-id="${esc(c.id)}" ${c.done ? 'checked' : ''}> ${esc(c.label)}</label>`
                    ).join('') +
                  `</div></details>`
                : '') +
              `<div class="row-actions">` +
                btn('Concluir', 'routine-complete', r.id, 'title="Concluir e avançar para a próxima data"', 'primary') +
                (canRecalc ? btn('Recalcular prazo', 'routine-recalculate', r.id, `title="Recalcular pela última execução (${dateLabel(lastExec.date)} → ${dateLabel(expectedNext)})"`) : '') +
                btn('Editar', 'routine-form', r.id) +
                btn('Eliminar', 'routine-remove', r.id, '', 'secondary danger') +
              `</div>` +
              `<details class="routine-history"><summary>Histórico (${(r.history || []).length})</summary>` +
                ((r.history || []).length
                  ? (r.history || []).slice().reverse().map(h =>
                      `<p>${dateLabel(h.date)} · próxima ${dateLabel(h.nextDate)} · ${h.completedItems}/${h.totalItems}${h.note ? ' · ' + esc(h.note) : ''}</p>`
                    ).join('')
                  : `<p class="practical-empty">Ainda sem execuções registadas.</p>`) +
              `</details>` +
            `</article>`;
          }).join('')}</div>`
        : `<p class="practical-empty">Cria uma rotina doméstica (ex.: limpeza de filtros do ar condicionado, verificação da caldeira, revisão de caleiras) para acompanhar prazos e listas de verificação.</p>`);

    for (const chk of $$('[data-routine-check]', routinesSec)) {
      chk.onchange = () => commit(() => D.toggleRoutineCheck(data, chk.dataset.routineCheck, chk.dataset.checkId), 'Lista de verificação atualizada.');
    }
  }

  function routineForm(id) {
    const r = D.routines(data).find(x => String(x.id) === String(id)) || {};
    const equipOptions = [['', 'Sem equipamento específico'], ...P.state(data).equipment.map(e => [e.id, e.name])];
    const checklistLines = (r.checklist || []).map(c => c.label).join('\n');
    const latest = D.latestRoutineRun(r);
    let manual=false,recalc=false;
    form(
      r.id ? 'Editar rotina doméstica' : 'Nova rotina doméstica',
      field('Nome da rotina', 'routineTitle', r.title || '', 'text', 'required maxlength="160"') +
        field('Divisão / área', 'routineArea', r.area || 'Geral', 'text', 'maxlength="80"') +
        select('Periodicidade', 'routineFrequency', Object.entries(frequencyLabels), D.routineFrequency(r) || 'monthly') +
        field('Próxima data prevista', 'routineNextDate', r.nextDate || F.today(), 'date', 'required') +
        (latest ? '<p class="muted" id="routineDateInfo">Última execução em '+dateLabel(latest.date)+'</p><button type="button" class="secondary" id="routineRecalculate">Recalcular pela última execução</button>' : '') +
        select('Equipamento associado (opcional)', 'routineEquipmentId', equipOptions, r.equipmentId || '') +
        `<label>Passos da lista de verificação (um por linha)<textarea name="routineChecklist" rows="4" maxlength="4000" placeholder="Ex.: Desligar quadro&#10;Limpar filtro&#10;Testar funcionamento">${esc(checklistLines)}</textarea></label>` +
        field('Notas', 'routineNotes', r.notes || '', 'text', 'maxlength="1000"'),
      f => commit(() => {
        D.saveRoutine(data, {
          id: r.id,
          title: f.get('routineTitle'),
          area: f.get('routineArea'),
          frequency: f.get('routineFrequency'),
          nextDate: f.get('routineNextDate'),
          keepNextDate: manual,
          recalculateFromLast: recalc,
          equipmentId: f.get('routineEquipmentId'),
          checklist: String(f.get('routineChecklist') || ''),
          notes: f.get('routineNotes'),
        });
      }, 'Rotina doméstica guardada.'),
      'As rotinas domésticas geram avisos preventivos e não alteram saldos nem criam despesas.',
    );
    if(latest){
      const frequency=$('[name=routineFrequency]'),date=$('[name=routineNextDate]'),info=$('#routineDateInfo');
      const update=()=>{date.value=D.routineNextFromHistory(r,frequency.value)||date.value;if(info)info.textContent=`Última execução em ${dateLabel(latest.date)} → próxima: ${dateLabel(date.value)}`;};
      date.oninput=()=>{manual=true;recalc=false;};
      frequency.onchange=()=>{if(!manual){recalc=true;update();}};
      $('#routineRecalculate').onclick=()=>{manual=false;recalc=true;update();};
    }
  }

  function routineCompleteForm(id) {
    const r = D.routines(data).find(x => String(x.id) === String(id));
    if (!r) return;
    form(
      'Concluir rotina · ' + esc(r.title),
      field('Data de realização', 'completedOn', F.today(), 'date', 'required') +
        field('Observações desta execução', 'note', '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.completeRoutine(data, id, {
          date: f.get('completedOn'),
          note: f.get('note'),
        });
      }, 'Rotina concluída e próxima data atualizada.'),
      'Regista a execução no histórico da rotina, reinicia a lista de verificação e calcula a próxima data.',
    );
  }

  // ============================================================================
  // 3. CASA -> CONSUMOS
  // ============================================================================
  const utilityLabels = { water: 'Água e saneamento', sanitation: 'Saneamento (histórico)', electricity: 'Eletricidade', gas: 'Gás' };
  const utilityIcons = { water: '💧', sanitation: '💧', electricity: '⚡', gas: '🔥' };
  const utilityUnitsDefault = { water: 'm³', sanitation: 'm³', electricity: 'kWh', gas: 'm³' };
  const utilityList = () => ['water', 'electricity', ...(D.monthlyUtility(data,'gas').rows.length ? ['gas'] : [])];
  const utilityUnit = u => u === 'electricity' ? 'kWh' : 'm3';
  const utilityUnitFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3, maximumFractionDigits: 4 });

  function utilityDeltaBadge(diff, pct, suffix = '') {
    if (diff === null || diff === undefined) return '<span class="ut-delta is-flat">—</span>';
    const cls = diff > 0.0001 ? 'is-up' : diff < -0.0001 ? 'is-down' : 'is-flat';
    const arrow = diff > 0.0001 ? '▲ ' : diff < -0.0001 ? '▼ ' : '';
    const pctText = pct !== null && pct !== undefined ? ` (${pct > 0 ? '+' : ''}${String(pct).replace('.', ',')}%)` : '';
    return `<span class="ut-delta ${cls}">${arrow}${diff > 0 ? '+' : ''}${suffix}${esc(pctText)}</span>`;
  }

  function utilityTotalsBlock(totals, unit, year) {
    if (!totals.length) return '<p class="muted">Sem períodos completos para comparar.</p>';
    const shown = totals.slice(0, year ? 6 : 12);
    const maxUnits = Math.max(1, ...shown.map(r => r.consumption || 0));
    const maxCost = Math.max(1, ...shown.map(r => r.cost || 0));
    const chart = `<div class="ut-bars">${shown.slice().reverse().map(row => {
      const label = year ? row.period : new Date(row.period + '-01T12:00:00').toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' }).replace('.', '');
      const unitH = Math.max(6, Math.round((row.consumption / maxUnits) * 100));
      const costH = row.cost !== null ? Math.max(6, Math.round((row.cost / maxCost) * 100)) : 0;
      return `<div class="ut-bar-col" title="${esc(year ? row.period : monthLabel(row.period))}: ${row.consumption} ${unit}${row.cost !== null ? ' · ' + eur(row.cost) : ''}">
        <div class="ut-bar-values"><b>${row.cost !== null ? eur(row.cost).replace(/,\d+\s?€/, '€') : ''}</b><small>${row.consumption} ${unit}</small></div>
        <div class="ut-bar-tracks"><i class="is-qty" style="height:${unitH}%"></i>${row.cost !== null ? `<i class="is-cost" style="height:${costH}%"></i>` : ''}</div>
        <span>${esc(label)}</span>
      </div>`;
    }).join('')}</div>`;
    const table = '<div class="u-table-scroll"><table class="u-table ut-compare-table"><thead><tr><th>Período</th><th>Consumo</th><th>Var. consumo</th><th>Fatura / custo</th><th>Var. valor</th><th>Média</th></tr></thead><tbody>' +
      shown.map(row => {
        const diffQty = row.consumptionDiff === null ? '<span class="ut-delta is-flat">—</span>' : utilityDeltaBadge(row.consumptionDiff, row.consumptionPct, `${String(row.consumptionDiff).replace('.', ',')} ${unit}`);
        const diffMoney = row.costDiff === null ? '<span class="ut-delta is-flat">—</span>' : utilityDeltaBadge(row.costDiff, row.costPct, eur(row.costDiff));
        const unitStr = row.unitCost !== null ? `${utilityUnitFmt.format(row.unitCost)}/${unit}` : '';
        const dayStr = row.dailyCost !== null ? `${eur(row.dailyCost)}/dia` : '';
        return `<tr><th scope="row">${esc(year ? row.period : monthLabel(row.period))}</th>` +
          `<td><b>${String(row.consumption).replace('.', ',')} ${unit}</b></td>` +
          `<td>${diffQty}</td>` +
          `<td class="amount"><b>${row.cost === null ? '—' : eur(row.cost)}</b>${row.costs < row.count ? '<br><small class="muted">parcial</small>' : row.bills < row.costs ? '<br><small class="muted">estimativa</small>' : ''}</td>` +
          `<td>${diffMoney}</td>` +
          `<td><small>${esc([unitStr, dayStr].filter(Boolean).join(' · ') || '—')}</small></td></tr>`;
      }).join('') + '</tbody></table></div>';
    return chart + table;
  }

  function renderConsumos() {
    if (view !== 'casaConsumos') return;
    const I = n => window.InterfaceUI?.icon ? InterfaceUI.icon(n) : '';
    const cards = utilityList().map(utility => {
      const { rows, average } = D.monthlyUtility(data, utility);
      const unit = utilityUnitsDefault[utility], electricity = utility === 'electricity';
      const legacyIntervals = D.utilityComparison(data, { utility }).intervals.concat(utility === 'water' ? D.utilityComparison(data, { utility: 'sanitation' }).intervals : []).filter(r => r.kind !== 'monthly');
      const months = D.utilityTotals(rows, false), years = D.utilityTotals(rows, true);
      const pastRows = rows.filter(r => !r.future);
      const pastAverage = pastRows.length ? Math.round((pastRows.reduce((s, r) => s + r.reading, 0) / pastRows.length) * 1000) / 1000 : average;
      const latest = pastRows[0] || rows[0] || null;
      const bills = new Map();
      for (const row of pastRows) {
        const key = row.period.start + ':' + row.period.end;
        const bill = bills.get(key) || {cents:0, units:row.reading, complete:true};
        if (row.cost === null) bill.complete = false;
        else bill.cents += F.cents(row.cost);
        bills.set(key, bill);
      }
      const latestBill = bills.values().next().value;
      const latestCost = latestBill?.complete ? latestBill.cents / 100 : null;
      const priced = [...bills.values()].filter(bill => bill.complete);
      const totalCents = priced.reduce((sum,bill) => sum + bill.cents, 0);
      const totalUnits = priced.reduce((sum,bill) => sum + bill.units, 0);
      const avgCost = priced.length ? F.money(totalCents / 100 / priced.length) : null;
      const avgUnitCost = totalUnits > 0 ? totalCents / 100 / totalUnits : null;
      const curYear = years[0] || null;
      const prevYear = years[1] || null;
      const yearBadge = curYear && curYear.costDiff !== null ? utilityDeltaBadge(curYear.costDiff, curYear.costPct, eur(curYear.costDiff)) : '';
      const kpis = pastRows.length ? `<div class="ut-kpis">
        <div class="ut-kpi"><span>Última fatura</span><strong>${latestCost !== null ? eur(latestCost) : String(latest.reading).replace('.', ',') + ' ' + unit}</strong><small>${dateLabel(latest.period.start)} a ${dateLabel(latest.period.end)}${latest.days ? ' · ' + latest.days + ' dias' : ''}</small></div>
        <div class="ut-kpi"><span>Média por período</span><strong>${String(pastAverage).replace('.', ',')} ${unit}</strong><small>${avgCost !== null ? 'Fatura média: ' + eur(avgCost) : 'Sem valor de fatura'}</small></div>
        <div class="ut-kpi"><span>Preço médio efetivo</span><strong>${avgUnitCost !== null ? utilityUnitFmt.format(avgUnitCost) + ' / ' + unit : '—'}</strong><small>${latest?.days && latestCost !== null ? eur(latestCost / latest.days) + ' / dia na última' : 'Calculado pelas faturas'}</small></div>
        <div class="ut-kpi"><span>Total ${esc(curYear?.period || '')}</span><strong>${curYear?.cost != null ? eur(curYear.cost) : (curYear ? String(curYear.consumption).replace('.', ',') + ' ' + unit : '—')}</strong><small>${curYear ? `${String(curYear.consumption).replace('.', ',')} ${unit}` : ''}${prevYear ? ' · vs ' + prevYear.period + ' ' : ''}</small>${yearBadge}</div>
      </div>` : '';
      const history = rows.map(r => {
        const legacyTag = r.utility === 'sanitation' ? '<span class="ut-service-tag">Saneamento (histórico)</span> ' : '';
        return `<tr>
          <th scope="row">${legacyTag}${dateLabel(r.period.start)} a ${dateLabel(r.period.end)}${r.anomaly ? `<br><span class="notice-state-tag state-overdue utility-anomaly">${esc(r.anomaly)}</span>` : r.days ? `<br><small class="muted">${r.days} ${r.days === 1 ? 'dia' : 'dias'}</small>` : ''}</th>
          ${electricity ? `<td>${esc(r.supplier || '—')}</td>` : ''}
          <td><b>${String(r.reading).replace('.', ',')} ${unit}</b></td>
          <td>${r.change === null ? '—' : utilityDeltaBadge(r.change, null, `${String(r.change).replace('.', ',')} ${unit}`)}</td>
          <td class="amount"><b>${r.cost === null ? '—' : eur(r.cost)}</b>${!electricity && r.billAmount == null ? '<br><small class="muted">estimativa</small>' : r.days && r.cost != null ? `<br><small class="muted">${eur(r.cost / r.days)}/dia</small>` : ''}</td>
          <td><div class="ut-row-actions">${btn('Editar', 'utility-form', r.id)}${btn('Eliminar', 'utility-remove', r.id)}</div></td>
        </tr>`;
      }).join('');
      const oldReadingsHtml = legacyIntervals.length ? `<details class="ut-legacy-readings"><summary>Leituras acumuladas antigas (${legacyIntervals.length})</summary><div class="u-table-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Leitura</th><th>Consumo</th><th>Nota</th><th>Ações</th></tr></thead><tbody>${legacyIntervals.slice().reverse().map(r => `<tr><td>${dateLabel(r.date)}</td><td>${r.reading} ${unit}</td><td>${r.consumption !== null ? r.consumption + ' ' + unit : esc(r.intervalLabel)}</td><td>${esc(r.note || '—')}</td><td><div class="ut-row-actions">${btn('Editar', 'utility-form', r.id)}${btn('Eliminar', 'utility-remove', r.id)}</div></td></tr>`).join('')}</tbody></table></div></details>` : '';
      return `<article class="panel utility-period-card">
        <div class="ut-card-head"><h3><span aria-hidden="true">${utilityIcons[utility]}</span> ${utilityLabels[utility]}</h3><span class="ut-unit-chip">${bills.size} ${bills.size === 1 ? 'período' : 'períodos'} · ${unit}</span></div>
        ${rows.length ? `${kpis}
        <details open class="utility-comparison"><summary><span>Comparar meses e anos</span><small><i class="ut-legend-qty"></i> Consumo (${unit}) · <i class="ut-legend-cost"></i> Valor (€)</small></summary>
        <div class="ut-compare-grid">
          <section class="ut-compare-box"><h4>Por mês</h4>${utilityTotalsBlock(months, unit, false)}</section>
          <section class="ut-compare-box"><h4>Por ano</h4>${utilityTotalsBlock(years, unit, true)}</section>
        </div></details>
        <details class="ut-invoices-history" ${rows.length <= 6 ? 'open' : ''}><summary>Histórico de faturas (${rows.length})</summary>
        <div class="u-table-scroll"><table class="u-table"><thead><tr><th>Período</th>
        ${electricity ? '<th>Comercializadora</th>' : ''}
        <th>Consumo</th><th>Variação</th><th>${electricity ? 'Custo variável' : 'Valor da fatura'}</th><th>Ações</th>
        </tr></thead><tbody>${history}</tbody></table></div></details>${oldReadingsHtml}` : `<p class="muted">Sem consumos registados.</p>${oldReadingsHtml}`}
      </article>`;
    }).join('');
    consumosHost.innerHTML = `<div class="section-head consumos-hero-head">
      <div><h2>Consumos</h2><p>Regista água e saneamento (na mesma fatura) e eletricidade pelo período da fatura e compara meses e anos.</p></div>
      <button type="button" class="primary" id="addUtilityMonthly">${I('plus')}Registar consumo</button>
    </div><div class="utility-period-grid">${cards}</div>`;
    $('#addUtilityMonthly', consumosHost).onclick = () => monthlyUtilityForm();
    $('#addTransaction').hidden = true;
  }

  function monthlyUtilityForm(r) {
    const period = r ? D.utilityPeriod(r) : { start: '', end: '' };
    const effectiveUtility = r?.utility || 'water';
    const services = ['water', ...(effectiveUtility === 'sanitation' ? ['sanitation'] : []), 'electricity', ...(r?.utility === 'gas' || D.monthlyUtility(data, 'gas').rows.length ? ['gas'] : [])];
    const oldRateNote = r && r.utility !== 'electricity' && r.billAmount == null && r.unitPrice != null
      ? `<p class="muted">Este registo antigo calcula estimativa pela tarifa (${eur(r.reading * r.unitPrice)}). Indica o valor da fatura para o substituir.</p>`
      : '';
    form(r ? 'Editar consumo' : 'Registar consumo',
      select('Serviço (unidade)', 'monthlyUtility', services.map(u => [u, utilityLabels[u] + ' · ' + utilityUnitsDefault[u]]), effectiveUtility) +
      '<div class="two-cols">' + field('De', 'periodStart', period.start, 'date', 'required') +
        field('Até', 'periodEnd', period.end, 'date', 'required') + '</div>' +
      field('Comercializadora (opcional)', 'utilitySupplier', r?.supplier || '', 'text', 'maxlength="120"') +
      field('Consumo do período', 'monthlyConsumption', r?.reading ?? '', 'number', 'required min="0" step="0.001"') +
      field('Tarifa por unidade em euros (opcional)', 'monthlyRate', r?.unitPrice ?? '', 'number', 'min="0" max="1000" step="0.0001"') +
      field('Valor da fatura (€)', 'monthlyBill', r?.billAmount ?? '', 'number', 'min="0" step="0.01"') +
      oldRateNote +
      field('Nota (opcional)', 'monthlyNote', r?.note || '', 'text', 'maxlength="500"'),
      f => commit(() => D.saveUtilityReading(data, {
        id: r?.id, kind: 'monthly', utility: f.get('monthlyUtility'),
        unit: utilityUnit(f.get('monthlyUtility')), periodStart: f.get('periodStart'), periodEnd: f.get('periodEnd'),
        supplier: f.get('utilitySupplier'), reading: f.get('monthlyConsumption'),
        unitPrice: f.get('monthlyUtility') === 'electricity' && f.has('monthlyRate') ? f.get('monthlyRate') : null, billAmount: f.get('monthlyBill'), note: f.get('monthlyNote'), meter: 'Consumo por período',
      }), 'Consumo guardado.'),
      'Usa as datas indicadas na fatura (máximo 1 ano; o início não pode ser futuro). Para água e saneamento regista o valor total da fatura; na eletricidade podes indicar a comercializadora e a tarifa.');
    const service = $('[name=monthlyUtility]'), supplier = $('[name=utilitySupplier]');
    const rate = $('[name=monthlyRate]'), bill = $('[name=monthlyBill]');
    const syncSupplier = () => {
      const electricity = service.value === 'electricity';
      for (const [input, visible] of [[supplier, electricity], [rate, electricity], [bill, !electricity]]) {
        input.disabled = !visible;
        input.closest('label').hidden = !visible;
      }
    };
    service.onchange = syncSupplier;
    syncSupplier();
  }

  function utilityForm(id) {
    const row=D.utilityReadings(data).find(r=>String(r.id)===String(id));
    if(!row)return;
    if(row.kind==='monthly') return monthlyUtilityForm(row);
    const electricity=row.utility==='electricity';
    form('Editar leitura antiga · '+esc(utilityLabels[row.utility]||row.utility),
      field('Data','readingDate',row.date,'date','required')+
      field('Leitura ('+(utilityUnitsDefault[row.utility]||row.unit)+')','readingValue',row.reading,'number','required min="0" step="0.001"')+
      (electricity?field('Tarifa por unidade em euros (opcional)','readingPrice',row.unitPrice??'','number','min="0" max="1000" step="0.0001"'):'')+
      field('Nota (opcional)','readingNote',row.note||'','text','maxlength="500"'),
      f=>commit(()=>D.saveUtilityReading(data,{id:row.id,kind:row.kind,utility:row.utility,unit:row.unit,meter:row.meter,date:f.get('readingDate'),reading:f.get('readingValue'),...(electricity?{unitPrice:f.get('readingPrice')}:{}),note:f.get('readingNote')}),'Registo atualizado.'),
      'Leitura histórica preservada.');
  }

  // ============================================================================
  // 4. FICHA DO VEÍCULO (#casaVehicles)
  // ============================================================================
  const fuelLabels = {
    gasoline: 'Gasolina',
    diesel: 'Gasóleo',
    electric: 'Elétrico',
    hybrid: 'Híbrido',
    lpg: 'GPL',
    other: 'Outro',
  };

  // Fichas em cartões: cabeçalho com os factos principais e blocos lado a lado.
  const dossierFact = (label, value, hint = '', attrs = '') =>
    `<div class="dossier2-fact"><span>${esc(label)}</span><strong ${attrs}>${value}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  const dossierDue = (label, date, km = '') => {
    if (!date) return `<div class="dossier2-fact is-empty"><span>${esc(label)}</span><strong>${km ? esc(km) : 'Não indicada'}</strong></div>`;
    const days = Math.round((new Date(date + 'T12:00:00') - new Date(F.today() + 'T12:00:00')) / 86400000);
    const tone = days < 0 ? 'late' : days <= 30 ? 'soon' : 'ok';
    const hint = days < 0 ? `Passou há ${-days} dia${days === -1 ? '' : 's'}` : days === 0 ? 'Hoje' : `Daqui a ${days} dia${days === 1 ? '' : 's'}`;
    return `<div class="dossier2-fact is-${tone}"><span>${esc(label)}</span><strong>${dateLabel(date)}${km ? ` · ${esc(km)}` : ''}</strong><small>${hint}</small></div>`;
  };
  const dossierCard = (title, count, body, action = '', wide = false) =>
    `<section class="panel dossier2-card${wide ? ' is-wide' : ''}${title === 'Documentos PDF' ? ' dossier-documents' : ''}"><header><h3>${esc(title)}${count === null ? '' : ` <small>${count}</small>`}</h3>${action}</header>${body}</section>`;
  const dossierEmpty = text => `<p class="dossier2-empty">${esc(text)}</p>`;
  const dossierDocs = (docs, prefix, removeAction, tag = null) => docs.length
    ? `<div class="dossier2-docs">` + docs.map(doc =>
        `<div class="dossier2-doc" data-${prefix}-doc="${esc(doc.id)}"><span class="dossier2-doc-icon" aria-hidden="true">PDF</span>` +
          `<div><b>${esc(doc.title)}</b>${tag ? ` <span class="notice-area-tag">${esc(tag(doc))}</span>` : ''}` +
          `<small>${esc(doc.document?.name || '')} · ${dateLabel(doc.date)}${doc.validUntil ? ` · Validade: ${dateLabel(doc.validUntil)}` : ''} · ${doc.document?.text ? 'Texto pesquisável' : doc.document?.ocrStatus === 'failed' ? 'Leitura automática indisponível' : 'Sem texto extraído'}</small></div>` +
          `<div class="row-actions">${btn('Abrir', prefix + '-doc-open', doc.ownerId + ':' + doc.id)}${btn('Texto', prefix + '-doc-read', doc.ownerId + ':' + doc.id)}${btn('Remover', removeAction(doc), doc.removeId)}</div>` +
        `</div>`).join('') + `</div>`
    : '';

  const dossierTable = (kind, list, selected, columns, cells) => {
    if (!list.length) return '';
    const labels = columns.map(label => `<th>${esc(label)}</th>`).join('');
    const rows = list.map(item => {
      const active = item.id === selected?.id;
      const values = cells(item).map(value => `<td>${esc(value)}</td>`).join('');
      return `<tr class="${active ? 'is-selected' : ''}"><td><button type="button" class="u-record-button" data-${kind}-select="${esc(item.id)}" aria-pressed="${active}">${esc(item.name)}</button></td>${values}</tr>`;
    }).join('');
    return `<section class="panel dossier-register"><label>Pesquisar <input type="search" data-dossier-query placeholder="Nome ou registo"></label><div class="u-table-scroll"><table class="u-table"><thead><tr>${labels}</tr></thead><tbody>${rows}</tbody></table></div><p class="empty-state" data-dossier-empty hidden>Nenhum registo encontrado.</p></section>`;
  };
  function bindDossierFilter(host, kind) {
    const query = $('[data-dossier-query]', host);
    if (!query) return;
    const rows = $$('.dossier-register tbody tr', host), empty = $('[data-dossier-empty]', host);
    const state = uiState(), key = kind+'Query';
    query.value = state[key] || '';
    query.oninput = () => {
      state[key] = query.value;
      const value=PracticalFinance.norm(query.value);
      for(const row of rows)row.hidden=!PracticalFinance.norm(row.textContent).includes(value);
      empty.hidden=rows.some(row=>!row.hidden);
    };
    query.oninput();
  }
  function dossierTabs(host, kind, tabs, active) {
    const detail = $('.dossier2', host);
    if (!detail) return;
    const nav = document.createElement('nav');
    nav.className = 'eq-design-tabs';
    nav.setAttribute('aria-label', 'Secções da ficha');
    nav.innerHTML = tabs.map(([id,label]) => `<button type="button" class="secondary" data-dossier-tab="${id}">${label}</button>`).join('');
    $('.dossier2-hero', detail).before(nav);
    const dates = $('.dossier2-facts.is-dates', detail);
    const stats = $('.dossier2-facts:not(.is-dates)', detail);
    const cards = $('.dossier2-grid', detail);
    const apply = button => {
      const tab = button.dataset.dossierTab;
      uiState()[kind+'Tab'] = tab;
      for (const choice of nav.querySelectorAll('button')) choice.setAttribute('aria-pressed', String(choice===button));
      dates.hidden = !['overview','dates'].includes(tab);
      stats.hidden = !['overview','costs'].includes(tab);
      cards.hidden = tab === 'dates' || (tab === 'costs' && kind !== 'vehicle');
      for (const card of cards.children) {
        if (tab === 'costs' && kind === 'vehicle') {
          const title = card.querySelector('h3')?.textContent || '';
          card.hidden = !/Manuten|Abastec/i.test(title);
        } else {
          card.hidden = tab === 'documents' ? !card.classList.contains('dossier-documents') : tab === 'history' && card.classList.contains('dossier-documents');
        }
      }
    };
    for (const button of nav.querySelectorAll('button')) button.onclick = () => apply(button);
    apply(nav.querySelector('[data-dossier-tab="'+(active||'overview')+'"]'));
  }
  function dossierNext(entries) {
    return entries.filter(([,date])=>date).sort((a,b)=>a[1].localeCompare(b[1]))[0] || ['—',''];
  }
  function renderVehicles() {
    if (view !== 'casaVehicles') return;
    const s = uiState();
    const list = D.vehicles(data);
    const selected = list.find(v => String(v.id) === String(s.vehicleId)) || list[0] || null;
    s.vehicleId = selected?.id || '';
    const summary = selected ? D.vehicleSummary(data, selected.id) : null;

    const docs = (selected?.documents || []).map(doc => ({ ...doc, ownerId: selected.id, removeId: `${selected.id}:documents:${doc.id}` }));
    const table = (head, rows) => `<div class="u-table-scroll"><table class="u-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    vehiclesHost.innerHTML =
      `<div class="section-head dossier2-head">` +
        `<div><h2>Veículos</h2><p>Quilometragem, manutenções, prazos e documentos de cada veículo.</p></div>` +
        `<div class="row-actions">${btn('Pesquisar nos PDFs', 'open-pdf-search', 'vehicle')}${btn('+ Novo veículo', 'vehicle-form', '', '', 'primary')}</div>` +
      `</div>` +
      '<div class="eq-design-split dossier-register-workspace">' +
      dossierTable('vehicle', list, selected, ['Veículo','Próximo prazo','Data'], v => { const [label,date]=dossierNext([['Inspeção',v.nextInspectionDate],['Seguro',v.insuranceDate],['IUC',v.iucDate],['Revisão',v.nextMaintenanceDate]]); return [label,date?dateLabel(date):'—']; }) +
      (summary
        ? `<div class="dossier2" id="vehicleDossierView">` +
            `<section class="panel dossier2-hero">` +
              `<div class="dossier2-title"><span class="dossier2-avatar" aria-hidden="true">🚗</span>` +
                `<div><h3>${esc(selected.name)}${selected.plate ? ` <span class="dossier2-plate">${esc(selected.plate)}</span>` : ''}</h3>` +
                `<p>${esc([selected.makeModel || 'Marca/modelo por indicar', fuelLabels[selected.fuelType] || selected.fuelType, summary.assetName ? `Património: ${summary.assetName}` : ''].filter(Boolean).join(' · '))}</p></div>` +
                `<div class="dossier2-actions">${btn('Editar', 'vehicle-form', selected.id)}${btn('+ Quilometragem', 'vehicle-mileage-form', selected.id)}${btn('+ Manutenção', 'vehicle-maintenance-form', selected.id, '', 'primary')}</div>` +
              `</div>` +
              `<div class="dossier2-facts">` +
                dossierFact('Quilometragem atual', `${summary.currentKm.toLocaleString('pt-PT')} km`, '', 'id="vehicleCurrentKm"') +
                dossierFact('Custo acumulado', eur(summary.totalEffectiveCost), 'Sem duplicar movimentos', 'class="amount" id="vehicleTotalCost"') +
                dossierFact('Manutenção', eur(summary.maintenanceCost), '', 'class="amount" id="vehicleMaintCost"') +
                ((selected.fuelings || []).length ? dossierFact('Abastecimentos', eur(summary.fuelCost), summary.averageConsumptionPer100Km !== null ? `${summary.averageConsumptionPer100Km} ${summary.consumptionUnit}` : '', 'class="amount" id="vehicleFuelCost"') : '') +
                (summary.assetName ? dossierFact('Valor patrimonial', eur(summary.assetValue), '', 'class="amount"') : '') +
              `</div>` +
              `<div class="dossier2-facts is-dates">` +
                dossierDue('Inspeção (IPO)', selected.nextInspectionDate) +
                dossierDue('Seguro', selected.insuranceDate) +
                dossierDue('IUC', selected.iucDate) +
                dossierDue('Próxima revisão', selected.nextMaintenanceDate, selected.nextMaintenanceKm ? `${selected.nextMaintenanceKm.toLocaleString('pt-PT')} km` : '') +
              `</div>` +
              (selected.notes ? `<p class="dossier2-notes">${esc(selected.notes)}</p>` : '') +
            `</section>` +
            `<div class="dossier2-grid">` +
              dossierCard('Manutenções e intervenções', (selected.maintenance || []).length,
                (selected.maintenance || []).length
                  ? table(['Data', 'Descrição', 'Km', 'Custo', 'Movimento', ''], selected.maintenance.slice().sort((a, b) => b.date.localeCompare(a.date)).map(m =>
                      `<tr><td>${dateLabel(m.date)}</td><td>${esc(m.description)}</td><td>${m.km !== null && m.km !== undefined ? `${m.km.toLocaleString('pt-PT')} km` : '—'}</td><td class="amount">${eur(m.cost)}</td><td>${m.transactionId ? 'Associado' : 'Só na ficha'}</td><td>${btn('Remover', 'vehicle-sub-remove', `${selected.id}:maintenance:${m.id}`)}</td></tr>`).join(''))
                  : dossierEmpty('Sem manutenções registadas neste veículo.'),
                '', true) +
              dossierCard('Quilometragem', (selected.mileageLog || []).length,
                (selected.mileageLog || []).length
                  ? table(['Data', 'Km', 'Nota', ''], selected.mileageLog.slice().sort((a, b) => b.date.localeCompare(a.date)).map(m =>
                      `<tr><td>${dateLabel(m.date)}</td><td><b>${m.km.toLocaleString('pt-PT')} km</b></td><td>${esc(m.note || '')}</td><td>${btn('Remover', 'vehicle-sub-remove', `${selected.id}:mileageLog:${m.id}`)}</td></tr>`).join(''))
                  : dossierEmpty('Sem registos de quilometragem.'),
                btn('+ Registo', 'vehicle-mileage-form', selected.id)) +
              dossierCard('Documentos PDF', docs.length,
                dossierDocs(docs, 'vehicle', () => 'vehicle-sub-remove') || dossierEmpty('Apólice de seguro, inspeção, IUC ou faturas de oficina.'),
                btn('+ PDF', 'vehicle-document-form', selected.id)) +
              ((selected.fuelings || []).length ? dossierCard('Abastecimentos e carregamentos', selected.fuelings.length,
                table(['Data', 'Quantidade', 'Total', 'Km', 'Movimento', ''], selected.fuelings.slice().sort((a, b) => b.date.localeCompare(a.date)).map(f =>
                  `<tr><td>${dateLabel(f.date)}</td><td>${f.quantity} ${esc(f.unit)}</td><td class="amount">${eur(f.cost)}</td><td>${f.km !== null && f.km !== undefined ? `${f.km.toLocaleString('pt-PT')} km` : '—'}</td><td>${f.transactionId ? 'Associado' : 'Só na ficha'}</td><td>${btn('Remover', 'vehicle-sub-remove', `${selected.id}:fuelings:${f.id}`)}</td></tr>`).join('')), '', true) : '') +
            `</div>` +
            `<div class="dossier2-danger">${btn('Eliminar veículo', 'vehicle-remove', selected.id, '', 'secondary danger')}</div>` +
          `</div>`
        : `<p class="empty-state">Adiciona um veículo para acompanhar quilometragem, revisões, inspeção, seguro e documentos PDF.</p>`) + '</div>';
    bindDossierFilter(vehiclesHost,'vehicle');
    dossierTabs(vehiclesHost,'vehicle',[['overview','Ficha'],['dates','Próximas datas'],['costs','Custos']],s.vehicleTab);

    for (const b of $$('[data-vehicle-select]', vehiclesHost)) {
      b.onclick = () => { s.vehicleId = b.dataset.vehicleSelect; renderVehicles(); $('[data-vehicle-select][aria-pressed=true]', vehiclesHost)?.focus({preventScroll:true}); };
    }
    $('#addTransaction').hidden = true;
  }

  function vehicleForm(id) {
    const v = D.vehicles(data).find(x => String(x.id) === String(id)) || {};
    const assets = [['', 'Sem bem associado'], ...(data.assets || []).map(a => [a.id, `${a.name} (${eur(LifeFinance.assetValue(a))})`])];
    form(
      v.id ? 'Editar veículo' : 'Novo veículo',
      field('Nome / identificação', 'vehName', v.name || '', 'text', 'required maxlength="120"') +
        field('Matrícula (opcional)', 'vehPlate', v.plate || '', 'text', 'maxlength="40"') +
        field('Marca e modelo', 'vehMakeModel', v.makeModel || '', 'text', 'maxlength="120"') +
        select('Combustível / energia', 'vehFuelType', Object.entries(fuelLabels), v.fuelType || 'gasoline') +
        field('Quilometragem atual (km)', 'vehCurrentKm', v.currentKm ?? 0, 'number', 'min="0" max="5000000" step="1"') +
        select('Bem em Património (opcional — evita duplicar valor patrimonial)', 'vehAssetId', assets, v.assetId || '') +
        field('Validade da Inspeção / IPO (opcional)', 'vehInspection', v.nextInspectionDate || '', 'date') +
        field('Validade do Seguro (opcional)', 'vehInsurance', v.insuranceDate || '', 'date') +
        field('Validade do IUC / Imposto (opcional)', 'vehIuc', v.iucDate || '', 'date') +
        field('Data da próxima revisão (opcional)', 'vehServiceDate', v.nextMaintenanceDate || '', 'date') +
        field('Km da próxima revisão (opcional)', 'vehServiceKm', v.nextMaintenanceKm ?? '', 'number', 'min="0" max="5000000" step="1"') +
        field('Notas', 'vehNotes', v.notes || '', 'text', 'maxlength="1000"'),
      f => commit(() => {
        const saved = D.saveVehicle(data, {
          id: v.id,
          name: f.get('vehName'),
          plate: f.get('vehPlate'),
          makeModel: f.get('vehMakeModel'),
          fuelType: f.get('vehFuelType'),
          currentKm: Number(f.get('vehCurrentKm') || 0),
          assetId: f.get('vehAssetId'),
          nextInspectionDate: f.get('vehInspection'),
          insuranceDate: f.get('vehInsurance'),
          iucDate: f.get('vehIuc'),
          nextMaintenanceDate: f.get('vehServiceDate'),
          nextMaintenanceKm: f.get('vehServiceKm'),
          notes: f.get('vehNotes'),
        });
        uiState().vehicleId = saved.id;
      }, 'Ficha do veículo guardada.'),
      'A ficha do veículo organiza prazos, manutenção e documentos sem criar movimentos financeiros automáticos.',
    );
  }

  function vehicleMileageForm(vehicleId) {
    const v = D.vehicles(data).find(x => String(x.id) === String(vehicleId));
    if (!v) return;
    form(
      'Registar quilometragem · ' + v.name,
      field('Data', 'mDate', F.today(), 'date', 'required') +
        field('Quilometragem no quadrante (km)', 'mKm', v.currentKm || 0, 'number', 'required min="0" max="5000000" step="1"') +
        field('Nota (opcional)', 'mNote', '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.addVehicleMileage(data, vehicleId, {
          date: f.get('mDate'),
          km: Number(f.get('mKm')),
          note: f.get('mNote'),
        });
      }, 'Quilometragem registada.'),
    );
  }

  function vehicleFuelingForm(vehicleId) {
    const v = D.vehicles(data).find(x => String(x.id) === String(vehicleId));
    if (!v) return;
    const expenses = [['', 'Sem movimento associado (apenas registo na ficha)'], ...data.transactions.filter(t => t.type === 'expense').slice(-300).reverse().map(t => [t.id, `${dateLabel(t.date)} · ${t.description} · ${eur(t.amount)}`])];
    form(
      'Registar abastecimento · ' + esc(v.name),
      field('Data', 'fDate', F.today(), 'date', 'required') +
        field('Quantidade (L ou kWh)', 'fQuantity', '', 'number', 'required min="0.001" step="0.001"') +
        select('Unidade', 'fUnit', [['L', 'Litros (L)'], ['kWh', 'kWh']], v.fuelType === 'electric' ? 'kWh' : 'L') +
        field('Custo total (€)', 'fCost', 0, 'number', 'required min="0" step="0.01"') +
        field('Quilometragem atual (km)', 'fKm', v.currentKm || 0, 'number', 'required min="0" max="5000000" step="1"') +
        field('Posto / local (opcional)', 'fStation', '', 'text', 'maxlength="120"') +
        select('Despesa existente em Movimentos (opcional)', 'fTx', expenses, '') +
        field('Nota (opcional)', 'fNote', '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.addVehicleFueling(data, vehicleId, {
          date: f.get('fDate'),
          quantity: Number(f.get('fQuantity')),
          unit: f.get('fUnit'),
          cost: Number(f.get('fCost')),
          km: Number(f.get('fKm')),
          station: f.get('fStation'),
          transactionId: f.get('fTx'),
          note: f.get('fNote'),
        });
      }, 'Abastecimento registado sem duplicar despesas.'),
      'Se associares uma despesa existente, o custo entra uma única vez no total acumulado do veículo.',
    );
  }

  function vehicleMaintenanceForm(vehicleId) {
    const v = D.vehicles(data).find(x => String(x.id) === String(vehicleId));
    if (!v) return;
    const plain = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const own = [v.name, v.plate, v.makeModel].map(plain).flatMap(x => x.split(/\s+/)).filter(x => x.length > 2);
    const related = /transporte|automove|automovel|carro|veiculo|viatura|oficina|revisao|pneu|inspec|\bipo\b|mecanic|garagem|travo|bateria|oleo|lavagem/;
    const fuel = /combust|gasolin|gasoleo|diesel|abastec|carregamento|\bpasse\b|metro|comboio|autocarro|\buber\b|\bbolt\b|taxi|portagem|estacionamento/;
    const relevant = t => { const text = plain([t.category, t.description, t.beneficiary].join(' ')); return !fuel.test(text) && (related.test(text) || own.some(w => text.includes(w))); };
    const linked = new Set((v.maintenance || []).map(m => String(m.transactionId || '')).filter(Boolean));
    const candidates = data.transactions.filter(t => t.type === 'expense' && !linked.has(String(t.id)) && relevant(t)).slice(-100).reverse();
    const expenses = [['', candidates.length ? 'Sem movimento associado (apenas registo na ficha)' : 'Sem despesas de veículo encontradas (apenas registo na ficha)'], ...candidates.map(t => [t.id, `${dateLabel(t.date)} · ${t.description} · ${eur(t.amount)}`])];
    form(
      'Registar manutenção · ' + esc(v.name),
      field('Descrição da intervenção', 'mDesc', '', 'text', 'required maxlength="240"') +
        field('Data', 'mDate', F.today(), 'date', 'required') +
        select('Tipo', 'mKind', Object.entries(D.VEHICLE_MAINT_KINDS), 'revision') +
        field('Custo (€)', 'mCost', 0, 'number', 'required min="0" step="0.01"') +
        field('Quilometragem (km, opcional)', 'mKm', v.currentKm || '', 'number', 'min="0" max="5000000" step="1"') +
        field('Próxima data (opcional)', 'mNextDate', '', 'date') +
        field('Próxima quilometragem (km, opcional)', 'mNextKm', '', 'number', 'min="0" max="5000000" step="1"') +
        select('Despesa do veículo em Movimentos (opcional)', 'mTx', expenses, '') +
        field('Nota (opcional)', 'mNote', '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.addVehicleMaintenance(data, vehicleId, {
          description: f.get('mDesc'),
          date: f.get('mDate'),
          kind: f.get('mKind'),
          cost: Number(f.get('mCost')),
          km: f.get('mKm'),
          nextDate: f.get('mNextDate'),
          nextKm: f.get('mNextKm'),
          transactionId: f.get('mTx'),
          note: f.get('mNote'),
        });
      }, 'Manutenção do veículo registada.'),
    );
  }

  function vehicleDocumentForm(vehicleId) {
    const v = D.vehicles(data).find(x => String(x.id) === String(vehicleId));
    if (!v) return;
    form(
      'Anexar documento PDF · ' + v.name,
      field('Título do documento', 'docTitle', '', 'text', 'required maxlength="160" placeholder="Ex.: Apólice de seguro 2026, Fatura revisão, Folha IPO"') +
        field('Categoria', 'docCategory', 'Seguro / Inspeção', 'text', 'maxlength="80"') +
        field('Data do documento', 'docDate', F.today(), 'date', 'required') +
        field('Validade (opcional)', 'docValidUntil', '', 'date') +
        field('Nota (opcional)', 'docNote', '', 'text', 'maxlength="500"') +
        `<label>Ficheiro PDF (até 8 MB)<input name="docFile" type="file" accept="application/pdf,.pdf" required></label>`,
      async f => {
        const active = key;
        const file = f.get('docFile');
        if (!file?.size) throw Error('Escolhe um ficheiro PDF.');
        if (file.size > 8 * 1024 * 1024) throw Error('O PDF deve ter até 8 MB.');
        const att = await attachmentFromFile(file);
        att.type = 'application/pdf';
        const extracted = await extractPdfTextSafe(file);
        if (key !== active) throw Error('O espaço mudou.');
        return commit(() => {
          D.addVehicleDocument(data, vehicleId, {
            title: f.get('docTitle'),
            category: f.get('docCategory') || 'Outro',
            date: f.get('docDate'),
            validUntil: f.get('docValidUntil'),
            note: f.get('docNote'),
            document: {
              name: att.name,
              type: 'application/pdf',
              size: att.size,
              data: att.data,
              text: extracted.text,
              ocrStatus: extracted.ocrStatus,
            },
          });
        }, 'Documento PDF guardado na ficha do veículo.');
      },
      'O PDF original fica preservado na ficha do veículo e o texto disponível fica pesquisável localmente.',
    );
  }

  // ============================================================================
  // 5. DOSSIER DA HABITAÇÃO (#casaHousing)
  // ============================================================================
  const housingKinds = {
    own: 'Habitação própria',
    rented: 'Habitação arrendada',
    other: 'Outro imóvel',
  };
  const housingDocCategories = {
    general: 'Geral',
    deed: 'Escritura / registo',
    contract: 'Contrato / arrendamento',
    insurance: 'Seguro da habitação',
    condo: 'Condomínio / atas',
    certificate: 'Certificado energético / técnico',
    tax: 'IMI / impostos',
    manual: 'Planta / manual / garantia',
  };

  function renderHousing() {
    if (view !== 'casaHousing') return;
    const s = uiState();
    const list = D.housing(data);
    const selected = list.find(h => String(h.id) === String(s.housingId)) || list[0] || null;
    s.housingId = selected?.id || '';
    const summary = selected ? D.housingSummary(data, selected.id) : null;

    const docs = (selected?.documents || []).map(doc => ({ ...doc, ownerId: selected.id, removeId: `${selected.id}:${doc.id}` }));
    housingHost.innerHTML =
      `<div class="section-head dossier2-head">` +
        `<div><h2>Habitação</h2><p>Prazos, documentos e tudo o que está ligado à casa.</p></div>` +
        `<div class="row-actions">${btn('Pesquisar nos PDFs', 'open-pdf-search', 'housing')}${btn('+ Nova habitação', 'housing-form', '', '', 'primary')}</div>` +
      `</div>` +
      '<div class="eq-design-split dossier-register-workspace">' +
      dossierTable('housing', list, selected, ['Habitação','Próximo prazo','Data'], h => { const [label,date]=dossierNext([['Seguro',h.insuranceDate],['Condomínio',h.condominiumDate],['IMI',h.imiDate],...(h.imiDates||[]).filter(d=>d!==h.imiDate).map(d=>['IMI',d])]); return [label,date?dateLabel(date):'—']; }) +
      (summary
        ? `<div class="dossier2" id="housingDossierView">` +
            `<section class="panel dossier2-hero">` +
              `<div class="dossier2-title"><span class="dossier2-avatar" aria-hidden="true">🏠</span>` +
                `<div><h3>${esc(selected.name)}</h3><p>${esc([summary.kindLabel, selected.typology, selected.addressNote, selected.taxId].filter(Boolean).join(' · '))}</p></div>` +
                `<div class="dossier2-actions">${btn('Editar', 'housing-form', selected.id)}${btn('+ Anexar PDF', 'housing-document-form', selected.id, '', 'primary')}</div>` +
              `</div>` +
              `<div class="dossier2-facts">` +
                dossierFact('Valor patrimonial', summary.assetName ? eur(summary.assetValue) : 'Por indicar', summary.assetName ? '' : 'Indica-o em Editar', 'class="amount" id="housingAssetValue"') +
                (summary.accumulatedTotal ? dossierFact('Custos associados', eur(summary.accumulatedTotal), '', 'class="amount" id="housingCombinedCost"') : '') +
                dossierFact('Documentos', String(docs.length)) +
                dossierFact('Equipamentos', String(summary.equipmentSummaries.length)) +
              `</div>` +
              `<div class="dossier2-facts is-dates">` +
                dossierDue('Seguro da habitação', selected.insuranceDate) +
                dossierDue('Condomínio / assembleia', selected.condominiumDate) +
                dossierDue('IMI', selected.imiDate) +
                (selected.imiDates || []).filter(d => d !== selected.imiDate).map((d, idx) => dossierDue(`IMI (${idx + 2}.ª data)`, d)).join('') +
              `</div>` +
              (selected.notes ? `<p class="dossier2-notes">${esc(selected.notes)}</p>` : '') +
            `</section>` +
            `<div class="dossier2-grid">` +
              dossierCard('Documentos PDF', docs.length,
                dossierDocs(docs, 'housing', () => 'housing-doc-remove', doc => housingDocCategories[doc.category] || doc.category) || dossierEmpty('Escrituras, contratos, apólices, atas de condomínio, certificados e IMI.'),
                btn('+ PDF', 'housing-document-form', selected.id), !(summary.equipmentSummaries.length || summary.linkedRoutines.length)) +
              (summary.equipmentSummaries.length || summary.linkedRoutines.length ? dossierCard('Equipamentos e rotinas', null,
                `<h4>Equipamentos <small>${summary.equipmentSummaries.length}</small></h4>` +
                (summary.equipmentSummaries.length
                  ? `<ul class="dossier2-list">${summary.equipmentSummaries.map(e => `<li><b>${esc(e.name)}</b><span class="amount">${eur(e.accumulatedTotal)}</span></li>`).join('')}</ul>`
                  : dossierEmpty('Sem equipamentos associados.')) +
                `<h4>Rotinas domésticas <small>${summary.linkedRoutines.length}</small></h4>` +
                (summary.linkedRoutines.length
                  ? `<ul class="dossier2-list">${summary.linkedRoutines.map(r => `<li><b>${esc(r.title)}</b><span>${dateLabel(r.nextDate)}</span></li>`).join('')}</ul>`
                  : dossierEmpty('Sem rotinas associadas.')),
                btn('Abrir equipamentos', 'open-equipment-page')) : '') +
              (summary.linkedTransactions.length ? dossierCard('Movimentos associados', summary.linkedTransactions.length,
                `<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>` +
                  summary.linkedTransactions.map(t =>
                    `<tr><td>${dateLabel(t.date)}</td><td>${esc(t.description)}</td><td>${esc(t.category || '')}</td><td class="amount">${eur(t.amount)}</td></tr>`
                  ).join('') +
                `</tbody></table></div>`, '', true) : '') +
            `</div>` +
            `<div class="dossier2-danger">${btn('Eliminar dossier', 'housing-remove', selected.id, '', 'secondary danger')}</div>` +
          `</div>`
        : `<p class="empty-state">Cria o dossier da habitação para centralizar documentos PDF, prazos de seguro, IMI e condomínio, equipamentos e despesas.</p>`) + '</div>';
    bindDossierFilter(housingHost,'housing');
    dossierTabs(housingHost,'housing',[['overview','Ficha'],['documents','Documentos'],['history','Histórico']],s.housingTab);

    for (const b of $$('[data-housing-select]', housingHost)) {
      b.onclick = () => { s.housingId = b.dataset.housingSelect; renderHousing(); $('[data-housing-select][aria-pressed=true]', housingHost)?.focus({preventScroll:true}); };
    }
    $('#addTransaction').hidden = true;
  }

  function housingForm(id) {
    const h = D.housing(data).find(x => String(x.id) === String(id)) || {};
    const assets = [['', 'Sem bem associado'], ...(data.assets || []).map(a => [a.id, `${a.name} (${eur(LifeFinance.assetValue(a))})`])];
    const equipList = P.state(data).equipment;
    const routineList = D.routines(data);
    const expenses = data.transactions.filter(t => t.type === 'expense').slice(-200).reverse();
    form(
      h.id ? 'Editar dossier da habitação' : 'Novo dossier da habitação',
      field('Nome da habitação', 'hName', h.name || '', 'text', 'required maxlength="120" placeholder="Ex.: Habitação principal, Apartamento Porto"') +
        select('Tipo', 'hKind', Object.entries(housingKinds), h.kind || 'own') +
        field('Tipologia (opcional)', 'hTypology', h.typology || '', 'text', 'maxlength="60"') +
        field('Morada / nota de localização (opcional)', 'hAddress', h.addressNote || '', 'text', 'maxlength="240"') +
        field('Fração / artigo matricial / referência (opcional)', 'hRef', h.taxId || '', 'text', 'maxlength="80"') +
        field('Valor patrimonial (€; opcional)', 'hPropertyValue', h.propertyValue || '', 'number', 'min="0" step="0.01" placeholder="Ex.: 180000"') +
        field('Renovação do seguro da habitação (opcional)', 'hInsurance', h.insuranceDate || '', 'date') +
        field('Próxima data de condomínio / assembleia (opcional)', 'hCondo', h.condominiumDate || '', 'date') +
        field('Prazo principal de IMI (opcional)', 'hTax', h.imiDate || '', 'date') +
        field('Outros prazos de IMI (AAAA-MM-DD, separados por vírgula)', 'hTaxDates', (h.imiDates||[]).join(', '), 'text', 'maxlength="150"') +
        field('Notas', 'hNotes', h.notes || '', 'text', 'maxlength="2000"'),
      f => commit(() => {
        const saved = D.saveHousing(data, {
          id: h.id,
          name: f.get('hName'),
          kind: f.get('hKind'),
          typology: f.get('hTypology'),
          addressNote: f.get('hAddress'),
          taxId: f.get('hRef'),
          propertyValue: Number(f.get('hPropertyValue') || 0),
          insuranceDate: f.get('hInsurance'),
          condominiumDate: f.get('hCondo'),
          imiDate: f.get('hTax'),
          imiDates: f.get('hTaxDates').split(',').map(date=>date.trim()).filter(Boolean),
          notes: f.get('hNotes'),
        });
        uiState().housingId = saved.id;
      }, 'Dossier da habitação guardado.'),
      'Liga os registos já existentes sem duplicar valores no Património nem nos Movimentos.',
    );
  }

  function housingDocumentForm(housingId) {
    const h = D.housing(data).find(x => String(x.id) === String(housingId));
    if (!h) return;
    form(
      'Anexar PDF ao dossier · ' + h.name,
      field('Título do documento', 'docTitle', '', 'text', 'required maxlength="160" placeholder="Ex.: Apólice multirriscos, Ata condomínio, Nota IMI"') +
        select('Categoria documental', 'docCategory', Object.entries(housingDocCategories), 'general') +
        field('Data do documento', 'docDate', F.today(), 'date', 'required') +
        field('Válido até / próxima renovação (opcional)', 'docValidUntil', '', 'date') +
        field('Nota (opcional)', 'docNote', '', 'text', 'maxlength="500"') +
        `<label>Ficheiro PDF (até 8 MB)<input name="docFile" type="file" accept="application/pdf,.pdf" required></label>`,
      async f => {
        const active = key;
        const file = f.get('docFile');
        if (!file?.size) throw Error('Escolhe um ficheiro PDF.');
        if (file.size > 8 * 1024 * 1024) throw Error('O PDF deve ter até 8 MB.');
        const att = await attachmentFromFile(file);
        att.type = 'application/pdf';
        const extracted = await extractPdfTextSafe(file);
        if (key !== active) throw Error('O espaço mudou.');
        return commit(() => {
          D.addHousingDocument(data, housingId, {
            title: f.get('docTitle'),
            category: f.get('docCategory'),
            date: f.get('docDate'),
            validUntil: f.get('docValidUntil'),
            note: f.get('docNote'),
            document: {
              name: att.name,
              type: 'application/pdf',
              size: att.size,
              data: att.data,
              text: extracted.text,
              ocrStatus: extracted.ocrStatus,
            },
          });
        }, 'Documento PDF adicionado ao dossier da habitação.');
      },
      'O PDF é preservado integralmente. Se tiver data de validade, passa também a constar no Centro de avisos.',
    );
  }

  // ============================================================================
  // 6. PESQUISA NO CONTEÚDO DOS PDFS (em #documentsHub e #dataHub)
  // ============================================================================
  const sourceLabels = {
    all: 'Todas as origens',
    transaction: 'Movimentos',
    casa: 'Compras Casa',
    equipment: 'Equipamentos',
    vehicle: 'Veículos',
    housing: 'Habitação',
  };

  function renderPdfSearchPanel() {
    const docsHub = $('#documentsHub');
    if (!docsHub || !D) return;
    let panel = $('#pdfContentSearchPanel', docsHub);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'pdfContentSearchPanel';
      panel.className = 'panel pdf-content-search-panel';
      const content = $('.life-content', docsHub) || docsHub;
      content.prepend(panel);
    }
    const s = uiState();
    const catalog = D.pdfCatalog(data);
    const withText = catalog.filter(c => Boolean(c.text?.trim())).length;
    const results = s.pdfQuery.trim() ? D.searchPdfs(data, s.pdfQuery, { sourceKind: s.pdfSource }) : [];

    panel.innerHTML =
      `<div class="u-head">` +
        `<div><p class="eyebrow">PESQUISA DOCUMENTAL LOCAL</p><h3>Pesquisar no conteúdo dos PDFs e faturas</h3>` +
        `<p>${catalog.length} documento(s) catalogado(s) (movimentos, compras Casa, equipamentos, veículos e habitação) · ${withText} com texto pesquisável. A falha de leitura nunca apaga nem altera nenhum PDF.</p></div>` +
        `<div class="u-actions">${btn('Extrair texto dos PDFs por ler', 'pdf-index-all', '', 'id="pdfIndexPendingBtn"')}</div>` +
      `</div>` +
      `<div class="pdf-search-controls">` +
        field('Pesquisar palavra, artigo, matrícula, apólice ou referência nos PDFs', 'pdfSearchInput', s.pdfQuery, 'search', 'id="pdfContentSearchInput" placeholder="Ex.: caldeira, apólice, travões, IMI, frigorífico…"') +
        select('Origem documental', 'pdfSourceSelect', Object.entries(sourceLabels), s.pdfSource, 'id="pdfContentSourceFilter"') +
      `</div>` +
      `<div id="pdfContentSearchResults" class="pdf-search-results"></div>`;

    const drawPdfResults = () => {
      const box = $('#pdfContentSearchResults', panel);
      if (!box) return;
      const filtered = s.pdfQuery.trim() ? D.searchPdfs(data, s.pdfQuery, { sourceKind: s.pdfSource }) : [];
      box.innerHTML = s.pdfQuery.trim()
        ? (filtered.length
            ? filtered.map(r =>
                `<article class="pdf-search-hit" data-pdf-hit="${esc(r.id)}">` +
                  `<div class="pdf-hit-main">` +
                    `<span class="notice-area-tag">${esc(r.sourceLabel)}</span> ` +
                    `<b>${esc(r.title)}</b> · <small>${dateLabel(r.date)} · ${esc(r.fileName)}</small>` +
                    `<p class="pdf-hit-excerpt">${esc(r.excerpt)}</p>` +
                  `</div>` +
                  `<div class="row-actions">` +
                    (r.attachment ? btn('Abrir PDF', 'pdf-hit-open-file', r.id) : '') +
                    btn('Abrir origem', 'pdf-hit-open-origin', r.id) +
                  `</div>` +
                `</article>`
              ).join('')
            : `<p class="practical-empty">Nenhum PDF ou fatura contém “${esc(s.pdfQuery)}” neste filtro.</p>`)
        : `<p class="muted">Escreve um termo acima para pesquisar no texto extraído e OCR de todos os PDFs do espaço.</p>`;
    };
    drawPdfResults();

    const input = $('#pdfContentSearchInput', panel);
    const filter = $('#pdfContentSourceFilter', panel);
    if (input) {
      input.oninput = e => {
        s.pdfQuery = e.target.value;
        drawPdfResults();
      };
    }
    if (filter) {
      filter.onchange = e => {
        s.pdfSource = e.target.value;
        renderPdfSearchPanel();
      };
    }
  }

  async function inspectOrEditPdfText(target) {
    const catalog = D.pdfCatalog(data);
    const entry = catalog.find(c =>
      c.sourceKind === target.sourceKind &&
      String(c.ownerId) === String(target.ownerId) &&
      String(c.docId || '') === String(target.docId || target.ownerId || '')
    );
    if (!entry) return;
    let currentText = entry.text || '';
    let currentStatus = entry.ocrStatus || (currentText ? 'text' : 'empty');

    if (!currentText && entry.attachment && window.ReceiptReader?.read) {
      try {
        const readRes = await readPdfFromDataUrl(entry.attachment);
        currentText = readRes.text;
        currentStatus = readRes.ocrStatus;
      } catch {
        currentStatus = 'failed';
      }
    }

    form(
      'Texto pesquisável do PDF · ' + entry.title,
      `<p>O ficheiro PDF original (<b>${esc(entry.fileName)}</b>) permanece intacto. Podes rever ou complementar o texto usado na pesquisa local.</p>` +
        `<label>Texto indexado para pesquisa<textarea name="pdfExtractedText" rows="8" maxlength="120000">${esc(currentText)}</textarea></label>`,
      f => commit(() => {
        const text = String(f.get('pdfExtractedText') || '');
        D.updatePdfText(
          data,
          { sourceKind: target.sourceKind, ownerId: target.ownerId, docId: target.docId },
          text,
          text.trim() ? (currentStatus === 'ocr' ? 'ocr' : 'text') : currentStatus,
        );
      }, 'Texto pesquisável do PDF atualizado. O ficheiro original foi preservado.'),
      'Guardar atualiza apenas o índice textual deste PDF.',
      'Guardar texto',
    );
  }

  async function indexAllPendingPdfs() {
    const catalog = D.pdfCatalog(data).filter(c => !c.text?.trim() && c.attachment);
    if (!catalog.length) {
      notice('Todos os PDFs anexados já têm texto indexado ou foram verificados.');
      return;
    }
    let indexed = 0;
    let preservedOnFailure = 0;
    const updates = [];
    for (const item of catalog) {
      try {
        const res = await readPdfFromDataUrl(item.attachment);
        updates.push({ item, text: res.text, ocrStatus: res.ocrStatus });
        if (res.text) indexed++;
      } catch {
        updates.push({ item, text: '', ocrStatus: 'failed' });
        preservedOnFailure++;
      }
    }
    if (updates.length) {
      commit(() => {
        for (const u of updates) {
          D.updatePdfText(
            data,
            { sourceKind: u.item.sourceKind, ownerId: u.item.ownerId, docId: u.item.docId },
            u.text,
            u.ocrStatus,
          );
        }
      }, `${indexed} PDF(s) indexado(s) para pesquisa.`);
    }
    renderPdfSearchPanel();
    notice(`${indexed} PDF(s) indexado(s) para pesquisa${preservedOnFailure ? ` · ${preservedOnFailure} PDF(s) preservado(s) sem texto legível` : ''}.`);
  }

  // ============================================================================
  // GLOBAL ACTION DISPATCHER & LIFECYCLE
  // ============================================================================
  document.addEventListener('click', event => {
    const b = event.target.closest('[data-dossier-action]');
    if (!b) return;
    const action = b.dataset.dossierAction;
    const id = b.dataset.id || '';
    try {
      switch (action) {
        case 'open-notices':
          navigate('noticesHub');
          break;
        case 'notice-open':
          openNoticeOrigin(id);
          break;
        case 'notice-snooze-7':
          commit(() => D.reviewNotice(data, id, 'snoozed', FinancePlus.dayAdd(F.today(), 7)), 'Aviso adiado por 7 dias. O registo de origem mantém-se inalterado.');
          break;
        case 'notice-snooze-custom':
          form(
            'Adiar aviso',
            field('Adiar até à data', 'snoozeUntil', FinancePlus.dayAdd(F.today(), 14), 'date', `required min="${FinancePlus.dayAdd(F.today(), 1)}"`),
            f => commit(() => D.reviewNotice(data, id, 'snoozed', f.get('snoozeUntil')), 'Aviso adiado. O registo de origem mantém-se inalterado.'),
            'O aviso volta a aparecer após a data escolhida ou se o registo de origem mudar.',
          );
          break;
        case 'notice-dismiss':
          commit(() => D.reviewNotice(data, id, 'dismissed'), 'Aviso dispensado. O registo de origem mantém-se inalterado.');
          break;
        case 'notice-restore':
          commit(() => D.restoreNotice(data, id), 'Aviso reposto como ativo.');
          break;
        case 'routine-form':
          routineForm(id);
          break;
        case 'routine-complete':
          routineCompleteForm(id);
          break;
        case 'routine-recalculate':
          commit(() => D.recalculateRoutine(data, id), 'Próxima data recalculada pela última execução.');
          break;
        case 'routine-remove':
          confirmAction('Eliminar rotina doméstica', 'Eliminar esta rotina doméstica e o seu histórico?', () => D.removeRoutine(data, id));
          break;
        case 'equipment-read-pdf':
          inspectOrEditPdfText({ sourceKind: 'equipment', ownerId: id, docId: id });
          break;
        case 'open-consumos':
          navigate('casaConsumos');
          break;
        case 'utility-form':
          utilityForm(id);
          break;
        case 'utility-remove':
          if(D.utilityReadings(data).some(r=>String(r.id)===String(id)))
            confirmAction('Eliminar consumo', 'Queres eliminar este registo de consumo?', () => D.removeUtilityReading(data, id));
          break;
        case 'vehicle-form':
          vehicleForm(id);
          break;
        case 'vehicle-remove':
          confirmAction('Eliminar ficha de veículo', 'Eliminar esta ficha de veículo? Os movimentos financeiros e os bens em Património são preservados.', () => D.removeVehicle(data, id));
          break;
        case 'vehicle-mileage-form':
          vehicleMileageForm(id);
          break;
        case 'vehicle-fueling-form':
          vehicleFuelingForm(id);
          break;
        case 'vehicle-maintenance-form':
          vehicleMaintenanceForm(id);
          break;
        case 'vehicle-document-form':
          vehicleDocumentForm(id);
          break;
        case 'vehicle-sub-remove': {
          const [vehId, collection, rowId] = id.split(':');
          confirmAction('Remover registo do veículo', 'Remover este item da ficha do veículo? Os movimentos financeiros mantêm-se.', () => D.removeVehicleSubrecord(data, vehId, collection, rowId));
          break;
        }
        case 'vehicle-doc-open': {
          const [vehId, docId] = id.split(':');
          const doc = D.vehicles(data).find(v => String(v.id) === String(vehId))?.documents?.find(d => String(d.id) === String(docId));
          if (doc?.document) actions.receipt(null, doc.document);
          break;
        }
        case 'vehicle-doc-read': {
          const [vehId, docId] = id.split(':');
          inspectOrEditPdfText({ sourceKind: 'vehicle', ownerId: vehId, docId });
          break;
        }
        case 'housing-form':
          housingForm(id);
          break;
        case 'housing-remove':
          confirmAction('Eliminar dossier da habitação', 'Eliminar este dossier? Equipamentos, rotinas, bens e movimentos financeiros mantêm-se.', () => D.removeHousing(data, id));
          break;
        case 'housing-document-form':
          housingDocumentForm(id);
          break;
        case 'housing-doc-open': {
          const [hId, docId] = id.split(':');
          const doc = D.housing(data).find(h => String(h.id) === String(hId))?.documents?.find(d => String(d.id) === String(docId));
          if (doc?.document) actions.receipt(null, doc.document);
          break;
        }
        case 'housing-doc-read': {
          const [hId, docId] = id.split(':');
          inspectOrEditPdfText({ sourceKind: 'housing', ownerId: hId, docId });
          break;
        }
        case 'housing-doc-remove': {
          const [hId, docId] = id.split(':');
          confirmAction('Remover PDF da habitação', 'Remover este documento PDF do dossier da habitação?', () => D.removeHousingDocument(data, hId, docId));
          break;
        }
        case 'open-equipment-page':
          navigate('casaEquipment');
          break;
        case 'open-pdf-search':
          if (id) uiState().pdfSource = id;
          navigate('documentsHub');
          break;
        case 'pdf-index-all':
          indexAllPendingPdfs();
          break;
        case 'pdf-hit-open-file': {
          const entry = D.pdfCatalog(data).find(c => c.id === id);
          if (entry?.attachment) actions.receipt(null, entry.attachment);
          break;
        }
        case 'pdf-hit-open-origin': {
          const entry = D.pdfCatalog(data).find(c => c.id === id);
          if (entry) {
            if (entry.sourceKind === 'vehicle') uiState().vehicleId = entry.ownerId;
            if (entry.sourceKind === 'housing') uiState().housingId = entry.ownerId;
            navigate(entry.targetView);
          }
          break;
        }
      }
    } catch (e) {
      notice(e.message, true);
    }
  });

  function noticeSettings(){const p=D.noticePreferences(data),labels={payments:'Pagamentos e renovações',warranties:'Garantias',food:'Validades da despensa',routines:'Equipamentos e rotinas',dossiers:'Veículos e habitação'};form('Configurar avisos',Object.entries(labels).map(([id,label])=>'<div class="notice-preference-row"><label class="checkbox"><input type="checkbox" name="noticeEnabled_'+id+'" '+(p.enabled[id]?'checked':'')+'>'+label+'</label>'+field('Avisar com antecedência (dias)','noticeDays_'+id,p.days[id],'number','min="0" max="365" required')+'</div>').join('')+field('Antecedências de veículos e habitação (dias, separadas por vírgula)','dossierStages',p.dossierStages.join(', '),'text','maxlength="50"')+field('Prioridade alta quando faltarem até (dias)','noticeUrgent',p.urgentDays,'number','min="0" max="30" required'),f=>commit(()=>D.saveNoticePreferences(data,{enabled:Object.fromEntries(Object.keys(labels).map(id=>[id,f.has('noticeEnabled_'+id)])),days:Object.fromEntries(Object.keys(labels).map(id=>[id,Number(f.get('noticeDays_'+id))])),urgentDays:Number(f.get('noticeUrgent')),dossierStages:[...new Set(f.get('dossierStages').split(',').map(n=>n.trim()).filter(Boolean).map(Number))]}),'Configuração de avisos guardada neste espaço.'),'Escolhe as origens e os prazos. Vencidos têm prioridade alta. Estas opções não pagam, dispensam nem alteram os registos de origem.');}
  document.addEventListener('click',e=>{if(e.target.closest('[data-notice-settings]'))noticeSettings();});

  function renderAll() {
    updateTopNoticesBadge();
    renderDashboardNoticesBanner();
    if (view === 'noticesHub') renderNoticesHub();
    if (view === 'casaEquipment') enhanceEquipmentPage();
    if (view === 'casaConsumos') renderConsumos();
    if (view === 'casaVehicles') renderVehicles();
    if (view === 'casaHousing') renderHousing();
    if (view === 'dataHub' || view === 'documentsHub') renderPdfSearchPanel();
  }

  if (window.UILifecycle?.register) {
    UILifecycle.register('dossiers-ui', { afterRender: renderAll, afterNavigation: renderAll }, 50);
  }
  window.DossiersUI = Object.freeze({
    render: renderAll,
    routineForm,
    routineCompleteForm,
    utilityForm,
    vehicleForm,
    vehicleMileageForm,
    vehicleFuelingForm,
    vehicleMaintenanceForm,
    vehicleDocumentForm,
    housingForm,
    housingDocumentForm,
    inspectOrEditPdfText,
    indexAllPendingPdfs,
  });
  if (!window.equilibrioStartup?.awaitingChoice) renderAll();
})();
