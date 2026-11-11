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
        utilityFilter: 'all',
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
    const master=res.rows.map(n=>`<button type="button" class="notice-list-item nt-row priority-${esc(n.priority)} ${n.id===s.noticeSelected?'is-selected':''}" data-notice-select="${esc(n.id)}" aria-pressed="${n.id===s.noticeSelected}"><span class="nt-row-icon" aria-hidden="true">${areaIcons[n.area]||'🔔'}</span><span class="notice-list-title">${esc(n.title)}</span><strong class="amount">${n.amount!==null&&n.amount!==undefined?eur(n.amount):''}</strong><small>${n.date?dateLabel(n.date)+' · ':''}${esc(n.areaLabel)}</small><span class="notice-state-tag state-${esc(n.effectiveState)}">${esc(stateLabels[n.effectiveState]||n.effectiveState)}</span></button>`).join('');
    const kpi = (tone, icon, label, value, note, state, id) => `<button type="button" class="ch-tile nt-kpi is-${tone}${s.noticeState === state ? ' is-active' : ''}" data-notice-kpi="${state}"><span class="ch-tile-icon">${I(icon)}</span><div><span>${label}</span><strong id="${id}">${value}</strong><small>${note}</small></div></button>`;
    const states = [['active', 'Ativos'], ['overdue', 'Em atraso'], ['snoozed', 'Adiados'], ['dismissed', 'Dispensados'], ['resolved', 'Concluídos'], ['all', 'Todos']];

    noticesHost.innerHTML =
      `<div class="section-head notices-hero-head nt-head">` +
        `<div>` +
          `<h2>Centro de avisos geral</h2><p>Pagamentos, garantias, validades, rotinas e datas da casa num só lugar.</p>` +
        `</div>` +
        `<div class="row-actions">` +
          `<button type="button" class="secondary" data-notice-settings>${I('gear')}Configurar avisos</button>` +
        `</div>` +
      `</div>` +
      `<div class="u-metrics notices-kpis nt-kpis">` +
        kpi('blue', 'bell', 'Avisos ativos', res.counts.active, 'Total a aguardar atenção', 'active', 'noticesActiveCount') +
        kpi(res.counts.high ? 'red' : 'green', 'alert', 'Prioridade alta / Atraso', res.counts.high, 'Vencidos ou muito próximos', 'overdue', 'noticesHighCount') +
        kpi('amber', 'clock', 'Adiados', res.counts.snoozed, 'Temporariamente silenciados', 'snoozed', 'noticesSnoozedCount') +
        kpi('purple', 'check', 'Dispensados', res.counts.dismissed, 'Arquivados sem alterar origem', 'dismissed', 'noticesDismissedCount') +
      `</div>` +
      `<details class="panel notices-sources-explainer">` +
        `<summary><span><strong>Que dados alimentam o Centro de Avisos?</strong><small>Clica para ver todas as origens monitorizadas automaticamente neste espaço financeiro</small></span></summary>` +
        `<div class="notices-sources-grid">` +
          `<div class="notices-source-item"><strong>📅 Pagamentos, Agenda e Recorrências</strong><p>Compromissos agendados, regras recorrentes ativas (ex.: água, eletricidade, gás, internet, renda), subscrições, prestações e créditos mensais dentro do prazo que escolheste ou em atraso.</p></div>` +
          `<div class="notices-source-item"><strong>🛡️ Garantias</strong><p>Garantias de equipamentos registados em <em>Casa → Equipamentos</em> e movimentos financeiros com data de garantia dentro do prazo configurado.</p></div>` +
          `<div class="notices-source-item"><strong>🥫 Validades alimentares</strong><p>Lotes com quantidade disponível em <em>Casa → Stock / Despensa</em> cuja validade expira dentro do prazo configurado ou já expirou.</p></div>` +
          `<div class="notices-source-item"><strong>🔧 Equipamentos e rotinas</strong><p>Planos de manutenção/substituição de equipamentos domésticos e rotinas preventivas periódicas com data próxima ou em atraso.</p></div>` +
          `<div class="notices-source-item"><strong>🚗🏠 Veículos e Habitação</strong><p>Datas de Inspeção (IPO), Seguro, IUC e Revisão em <em>Casa → Veículos</em>, bem como Seguros, IMI, Condomínio e Contratos em <em>Casa → Habitação</em>.</p></div>` +
        `</div>` +
      `</details>` +
      `<section class="panel notices-toolbar nt-toolbar">` +
        `<div class="cs-pills nt-areas" role="group" aria-label="Origem">${noticeAreas.map(([id, label]) => `<button type="button" class="${s.noticeArea === id ? 'active' : ''}" data-notice-area-pill="${id}" aria-pressed="${s.noticeArea === id}">${id === 'all' ? 'Todas' : (areaIcons[id] || '') + ' ' + esc(label)}<small>${byAreaCount(id)}</small></button>`).join('')}</div>` +
        `<div class="nt-filter-row"><div class="cs-pills nt-states" role="group" aria-label="Estado">${states.map(([id, label]) => `<button type="button" class="${s.noticeState === id ? 'active' : ''}" data-notice-state-pill="${id}" aria-pressed="${s.noticeState === id}">${label}</button>`).join('')}</div>` +
        `<div class="notices-filters nt-filters">` +
          select('Origem', 'noticeAreaFilter', noticeAreas, s.noticeArea, 'id="noticeAreaFilter"') +
          select('Prioridade', 'noticePriorityFilter', [['all', 'Todas as prioridades'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']], s.noticePriority, 'id="noticePriorityFilter"') +
          select('Estado', 'noticeStateFilter', [['active', 'Ativos'], ['overdue', 'Em atraso'], ['snoozed', 'Adiados'], ['dismissed', 'Dispensados'], ['resolved', 'Liquidados / Concluídos'], ['all', 'Todos']], s.noticeState, 'id="noticeStateFilter"') +
          field('Pesquisar aviso', 'noticeQueryInput', s.noticeQuery, 'search', 'id="noticeQueryInput" placeholder="Procurar água, seguro, veículo, equipamento…"') +
        `</div></div>` +
      `</section>` +
      `<section class="panel notices-list-panel" id="noticesListPanel"><div class="notices-workbench"><nav class="notices-master" aria-label="Lista de avisos">${master||'<p class="muted">Sem avisos neste filtro.</p>'}</nav><div class="notices-detail">` +
        (res.rows.length
          ? `<div class="notices-list">${[selected].filter(Boolean).map(n =>
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
      `</div></div></section>`;

    noticesHost.append($('#noticesHub .notices-sources-explainer'));
    for(const button of $$('[data-notice-select]',noticesHost))button.onclick=()=>{s.noticeSelected=button.dataset.noticeSelect;renderNoticesHub();};
    for (const pill of $$('[data-notice-area-pill]', noticesHost)) {
      pill.onclick = () => { s.noticeArea = pill.dataset.noticeAreaPill; renderNoticesHub(); };
    }
    for (const pill of $$('[data-notice-state-pill]', noticesHost)) pill.onclick = () => { s.noticeState = pill.dataset.noticeStatePill; renderNoticesHub(); };
    for (const tile of $$('[data-notice-kpi]', noticesHost)) tile.onclick = () => { s.noticeState = tile.dataset.noticeKpi; renderNoticesHub(); };
    $('#noticeAreaFilter', noticesHost).onchange = e => { s.noticeArea = e.target.value; renderNoticesHub(); };
    $('#noticePriorityFilter', noticesHost).onchange = e => { s.noticePriority = e.target.value; renderNoticesHub(); };
    $('#noticeStateFilter', noticesHost).onchange = e => { s.noticeState = e.target.value; renderNoticesHub(); };
    $('#noticeQueryInput', noticesHost).oninput = e => {
      const pos = e.target.selectionStart;
      s.noticeQuery = e.target.value;
      renderNoticesHub();
      const input = $('#noticeQueryInput', noticesHost);
      input?.focus();
      try { input?.setSelectionRange(pos, pos); } catch {}
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
  const frequencyLabels = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    bimonthly: 'Bimestral',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    annual: 'Anual',
  };

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
            const freqText = frequencyLabels[r.frequency] || r.frequency;
            const lastExec = (r.history || []).at(-1);
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
    form(
      r.id ? 'Editar rotina doméstica' : 'Nova rotina doméstica',
      field('Nome da rotina', 'routineTitle', r.title || '', 'text', 'required maxlength="160"') +
        field('Divisão / área', 'routineArea', r.area || 'Geral', 'text', 'maxlength="80"') +
        select('Periodicidade', 'routineFrequency', Object.entries(frequencyLabels), r.frequency || 'monthly') +
        field('Próxima data prevista', 'routineNextDate', r.nextDate || F.today(), 'date', 'required') +
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
          equipmentId: f.get('routineEquipmentId'),
          checklist: String(f.get('routineChecklist') || ''),
          notes: f.get('routineNotes'),
        });
      }, 'Rotina doméstica guardada.'),
      'As rotinas domésticas geram avisos preventivos e não alteram saldos nem criam despesas.',
    );
  }

  function routineCompleteForm(id) {
    const r = D.routines(data).find(x => String(x.id) === String(id));
    if (!r) return;
    form(
      'Concluir rotina · ' + r.title,
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
  // 3. CASA -> CONSUMOS (ÁGUA, ELETRICIDADE E GÁS)
  // ============================================================================
  const utilityLabels = { water: 'Água', electricity: 'Eletricidade', gas: 'Gás' };
  const utilityIcons = { water: '💧', electricity: '⚡', gas: '🔥' };
  const utilityUnitsDefault = { water: 'm³', electricity: 'kWh', gas: 'm³ / kWh' };
  // O gás só aparece se já existirem leituras antigas de gás neste espaço.
  const utilityList = () => ['water', 'electricity', ...(D.utilityReadings(data).some(r => r.utility === 'gas') ? ['gas'] : [])];
  const utilityUnit = u => (u === 'electricity' ? 'kWh' : 'm3');
  const electricityPeriods = [['vazio', 'Vazio'], ['ponta', 'Ponta'], ['cheio', 'Cheio']];
  const kindLabels = {
    reading: 'Leitura acumulada',
    reset: 'Substituição / reinício de contador',
  };

  function renderConsumos() {
    if (view !== 'casaConsumos') return;
    const s = uiState();
    const comp = D.utilityComparison(data, { utility: s.utilityFilter });

    const summaryCards = utilityList().map(u => {
      const fullComp = D.utilityComparison(data, { utility: u });
      let latestInterval = fullComp.intervals[0] || null;
      // Vários contadores ou períodos lidos no mesmo dia (Vazio, Ponta, Cheio): mostra o total e o detalhe.
      const sameDay = latestInterval ? fullComp.intervals.filter(r => r.date === latestInterval.date) : [];
      let breakdown = '';
      if (sameDay.length > 1) {
        const known = sameDay.filter(r => r.consumption !== null);
        const sum = k => Math.round(known.reduce((n, r) => n + (r[k] || 0), 0) * 1000) / 1000;
        const periodOf = r => electricityPeriods.findIndex(([, label]) => r.meter.endsWith(' · ' + label));
        const short = r => (periodOf(r) >= 0 ? electricityPeriods[periodOf(r)][1] : r.meter);
        breakdown = sameDay.slice().sort((a, b) => periodOf(a) - periodOf(b) || a.meter.localeCompare(b.meter, 'pt-PT')).map(r => `${esc(short(r))}: <b>${r.consumption !== null ? r.consumption : r.reading} ${esc(r.unitLabel)}</b>`).join(' · ');
        latestInterval = { ...latestInterval, meter: `${sameDay.length} leituras no mesmo dia`, consumption: known.length ? sum('consumption') : null, deltaConsumption: known.some(r => r.deltaConsumption !== null) ? sum('deltaConsumption') : null, deltaPercent: null };
      }
      const uMonthly = fullComp.monthly;
      if (!latestInterval) {
        return `<article class="panel utility-summary-card utility-card-${u} is-empty" data-utility-card="${u}">` +
          `<div class="utility-card-head"><span class="utility-card-icon" aria-hidden="true">${utilityIcons[u]}</span><div><h3>${utilityLabels[u]}</h3><small>${utilityUnitsDefault[u]}</small></div></div>` +
          `<div class="utility-card-empty"><p class="muted">Sem leituras registadas.</p><small>Regista a primeira leitura do contador para iniciar o acompanhamento mensal.</small></div></article>`;
      }
      const deltaClass = latestInterval.deltaConsumption > 0 ? 'is-up' : latestInterval.deltaConsumption < 0 ? 'is-down' : 'is-neutral';
      return `<article class="panel utility-summary-card utility-card-${u}" data-utility-card="${u}">` +
        `<div class="utility-card-head">` +
          `<span class="utility-card-icon" aria-hidden="true">${utilityIcons[u]}</span>` +
          `<div><h3>${utilityLabels[u]} (${esc(latestInterval.unitLabel)})</h3><small>${esc(latestInterval.meter)}</small></div>` +
          `<span class="utility-interval-badge status-${esc(latestInterval.intervalKind)}">${esc(latestInterval.intervalLabel)}</span>` +
        `</div>` +
        `<div class="utility-card-kpi">` +
          `<span>Último consumo apurado</span>` +
          `<strong class="amount">${latestInterval.consumption !== null ? `${latestInterval.consumption} ${esc(latestInterval.unitLabel)}` : esc(latestInterval.intervalLabel)}</strong>` +
          (breakdown ? `<small>${breakdown} · ${dateLabel(latestInterval.date)}</small>` : `<small>Leitura de <b>${latestInterval.reading} ${esc(latestInterval.unitLabel)}</b> em ${dateLabel(latestInterval.date)}</small>`) +
        `</div>` +
        `<p class="utility-delta ${deltaClass}">${latestInterval.deltaConsumption !== null ? `Variação face ao intervalo anterior: <b>${latestInterval.deltaConsumption >= 0 ? '+' : ''}${latestInterval.deltaConsumption} ${esc(latestInterval.unitLabel)}</b>${latestInterval.deltaPercent !== null ? ` (${latestInterval.deltaPercent >= 0 ? '+' : ''}${latestInterval.deltaPercent}%)` : ''}` : 'Regista mais uma leitura para comparar a evolução entre períodos.'}</p>` +
        (uMonthly.length
          ? `<div class="u-table-scroll utility-mini-table"><table class="u-table"><thead><tr><th>Mês</th><th>Consumo</th><th>Intervalos</th><th>Estado</th></tr></thead><tbody>` +
              uMonthly.slice(0, 6).map(m =>
                `<tr><td><b>${esc(m.month)}</b></td><td><b>${m.consumption} ${esc(m.unitLabel)}</b></td><td>${m.intervalsCount}</td><td><span class="utility-state-dot">${m.hasIncompleteIntervals ? 'Parcial/Alargado' : 'Regular'}</span></td></tr>`
              ).join('') +
            `</tbody></table></div>`
          : '') +
      `</article>`;
    }).join('');

    consumosHost.innerHTML =
      `<div class="section-head consumos-hero-head">` +
        `<div><p class="eyebrow">CASA · CONSUMOS DOMÉSTICOS</p><h2>Consumos de água e eletricidade</h2>` +
        `<p>Regista leituras de contador e acompanha a evolução física mensal (m³ e kWh). As leituras são independentes dos movimentos bancários e nunca criam despesas duplicadas.</p></div>` +
        
      `</div>` +
      `<div class="utility-summary-grid" id="utilityMonthlyComparison">${summaryCards}</div>` +
      `<section class="panel consumos-form-panel">` +
        `<div class="u-head"><div><h3>Registar nova leitura de contador</h3><p>Introduz o valor acumulado visível no visor do contador. Para um contador novo que começou do zero, escolhe "Substituição / reinício de contador".</p></div></div>` +
        `<form id="utilityReadingForm" class="form-grid consumos-form-grid">` +
          select('Serviço', 'utility', utilityList().map(u => [u, `${utilityIcons[u]} ${utilityLabels[u]}`]), s.utilityDraft || 'water') +
          select('Contagem', 'mode', [['tri', 'Tri-horária (Vazio, Ponta e Cheio)'], ['single', 'Simples (uma leitura)']], s.utilityMode || 'tri') +
          field('Contador', 'meter', 'Contador principal', 'text', 'maxlength="80"') +
          field('Data da leitura', 'date', F.today(), 'date', 'required') +
          field('Leitura acumulada no visor', 'reading', '', 'number', 'min="0" step="0.001" placeholder="Ex.: 142.5"') +
          electricityPeriods.map(([id, label]) => field(`${label} (kWh acumulados)`, 'reading_' + id, '', 'number', 'min="0" step="0.001" placeholder="Leitura do visor"')).join('') +
          select('Tipo de registo', 'kind', Object.entries(kindLabels), 'reading') +
          field('Nota ou observação (opcional)', 'note', '', 'text', 'maxlength="500" placeholder="Ex.: Leitura comunicada ao fornecedor"') +
          `<div class="row-actions consumos-submit-row"><button type="submit" class="primary">Guardar leitura</button></div>` +
        `</form>` +
      `</section>` +
      `<section class="panel consumos-history-panel">` +
        `<div class="u-head"><div><h3>Histórico de leituras e intervalos apurados</h3><p>Diferença real entre leituras consecutivas do mesmo contador e média diária.</p></div>` +
        `<div class="u-filter-bar">` +
          [['all', 'Todos os serviços'], ...utilityList().map(u => [u, `${utilityIcons[u]} ${utilityLabels[u]} (${utilityUnitsDefault[u]})`])].map(([id, label]) =>
            `<button type="button" class="secondary ${s.utilityFilter === id ? 'active' : ''}" data-utility-filter="${id}" aria-pressed="${s.utilityFilter === id}">${label}</button>`
          ).join('') +
        `</div></div>` +
        (comp.intervals.length
          ? `<div class="u-table-scroll" id="utilityReadingsTable"><table class="u-table consumos-table"><thead><tr><th>Data</th><th>Serviço</th><th>Contador</th><th>Leitura no visor</th><th>Consumo no intervalo</th><th>Duração e média</th><th>Estado do intervalo</th><th>Ações</th></tr></thead><tbody>` +
              comp.intervals.map(r =>
                `<tr data-utility-row="${esc(r.id)}">` +
                  `<td><b>${dateLabel(r.date)}</b></td>` +
                  `<td><span class="utility-service-pill service-${esc(r.utility)}">${utilityIcons[r.utility] || ''} <b>${esc(r.utilityLabel)}</b></span></td>` +
                  `<td>${esc(r.meter)}</td>` +
                  `<td><b>${r.reading} ${esc(r.unitLabel)}</b></td>` +
                  `<td>${r.consumption !== null ? `<strong class="utility-consumption-val">${r.consumption} ${esc(r.unitLabel)}</strong>` : '<span class="muted">—</span>'}</td>` +
                  `<td>${r.days !== null ? `${r.days} dia(s)${r.dailyAverage !== null ? `<br><small class="muted">${r.dailyAverage} ${esc(r.unitLabel)}/dia</small>` : ''}` : '—'}</td>` +
                  `<td><span class="utility-interval-badge status-${esc(r.intervalKind)}">${esc(r.intervalLabel)}</span>${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td>` +
                  `<td class="row-actions">${btn('Editar', 'utility-form', r.id)}${btn('Eliminar', 'utility-remove', r.id)}</td>` +
                `</tr>`
              ).join('') +
            `</tbody></table></div>`
          : `<div class="consumos-empty-state"><p class="empty-state">Ainda não existem leituras registadas para este filtro.</p></div>`) +
      `</section>`;

    const inlineForm = $('#utilityReadingForm', consumosHost);
    if (inlineForm) {
      const uSel = $('[name=utility]', inlineForm);
      const modeSel = $('[name=mode]', inlineForm);
      const row = name => $(`[name=${name}]`, inlineForm).closest('label');
      const isTri = () => uSel.value === 'electricity' && modeSel.value === 'tri';
      const syncFields = () => {
        const tri = isTri();
        row('mode').hidden = uSel.value !== 'electricity';
        row('reading').hidden = tri;
        $('[name=reading]', inlineForm).required = !tri;
        for (const [id] of electricityPeriods) row('reading_' + id).hidden = !tri;
        s.utilityDraft = uSel.value;
        s.utilityMode = modeSel.value;
      };
      uSel.onchange = syncFields;
      modeSel.onchange = syncFields;
      syncFields();
      inlineForm.onsubmit = e => {
        e.preventDefault();
        const fd = new FormData(inlineForm);
        try {
          const utility = fd.get('utility');
          const meter = String(fd.get('meter') || '').trim() || 'Contador principal';
          const base = { utility, unit: utilityUnit(utility), date: fd.get('date'), kind: fd.get('kind'), note: fd.get('note') };
          const inputs = isTri()
            ? electricityPeriods.filter(([id]) => String(fd.get('reading_' + id)).trim() !== '').map(([id, label]) => ({ ...base, meter: `${meter} · ${label}`, reading: Number(fd.get('reading_' + id)) }))
            : [{ ...base, meter, reading: Number(fd.get('reading')) }];
          if (!inputs.length) throw Error('Indica pelo menos uma leitura: Vazio, Ponta ou Cheio.');
          commit(() => {
            D.saveUtilityReadings(data, inputs);
          }, inputs.length > 1 ? `${inputs.length} leituras guardadas. Nenhum movimento financeiro foi criado.` : 'Leitura de consumo guardada. Nenhum movimento financeiro foi criado.');
        } catch (err) {
          notice(err.message, true);
        }
      };
    }

    for (const b of $$('[data-utility-filter]', consumosHost)) {
      b.onclick = () => { s.utilityFilter = b.dataset.utilityFilter; renderConsumos(); };
    }
    $('#addTransaction').hidden = true;
  }

  function enhanceCasaAnalyticsWithConsumos() {
    if (view !== 'casaAnalytics') return;
    const host = $('#casaAnalytics');
    if (!host) return;
    let card = $('#casaAnalyticsConsumosShortcut', host);
    if (!card) {
      card = document.createElement('section');
      card.id = 'casaAnalyticsConsumosShortcut';
      card.className = 'panel casa-analytics-consumos-shortcut';
      host.append(card);
    } else {
      card.classList.add('casa-analytics-consumos-shortcut');
    }
    const readings = D.utilityReadings(data);
    const count = readings.length;
    const byUtil = utilityList().map(u => {
      const comp = D.utilityComparison(data, { utility: u });
      const latest = comp.intervals[0];
      return `<div class="casa-analytics-utility-chip"><span>${utilityIcons[u]} ${utilityLabels[u]}</span><strong>${latest && latest.consumption !== null ? `${latest.consumption} ${esc(latest.unitLabel)}` : latest ? `${latest.reading} ${esc(latest.unitLabel)}` : 'Sem leituras'}</strong></div>`;
    }).join('');
    card.innerHTML =
      `<div class="u-head"><div><h3>Consumos de água e eletricidade</h3>` +
      `<p>${count} leitura(s) de contador registada(s) neste espaço financeiro.</p></div>` +
      `<div class="u-actions">${btn('Abrir Consumos', 'open-consumos', '', '', 'primary')}</div></div>` +
      `<div class="casa-analytics-utility-chips">${byUtil}</div>`;
  }

  function utilityForm(id) {
    const r = D.utilityReadings(data).find(x => String(x.id) === String(id)) || {};
    form(
      r.id ? 'Editar leitura de contador' : 'Registar leitura de contador',
      select('Serviço', 'utilityType', (r.id ? [r.utility] : utilityList()).map(u => [u, utilityLabels[u]]), r.utility || 'water') +
        field('Data da leitura', 'utilityDate', r.date || F.today(), 'date', 'required') +
        field('Leitura no contador (acumulada)', 'utilityReading', r.reading ?? '', 'number', 'required min="0" step="0.001"') +
        select('Tipo de registo', 'utilityKind', Object.entries(kindLabels), r.kind || 'reading') +
        field('Identificação do contador (opcional)', 'utilityMeterLabel', r.meter || 'Contador principal', 'text', 'maxlength="80"') +
        field('Nota (opcional)', 'utilityNote', r.note || '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.saveUtilityReading(data, {
          id: r.id,
          utility: f.get('utilityType'),
          unit: r.unit || utilityUnit(f.get('utilityType')),
          date: f.get('utilityDate'),
          reading: Number(f.get('utilityReading')),
          kind: f.get('utilityKind'),
          meter: f.get('utilityMeterLabel'),
          note: f.get('utilityNote'),
        });
      }, 'Leitura de consumo guardada. Nenhum movimento financeiro foi criado.'),
      'Para contador novo ou substituído que recomeçou do zero, escolhe "Substituição / reinício de contador". Assim a leitura anterior não gera consumo negativo nem artificial.',
    );
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
    `<section class="panel dossier2-card${wide ? ' is-wide' : ''}"><header><h3>${esc(title)}${count === null ? '' : ` <small>${count}</small>`}</h3>${action}</header>${body}</section>`;
  const dossierEmpty = text => `<p class="dossier2-empty">${esc(text)}</p>`;
  const dossierDocs = (docs, prefix, removeAction, tag = null) => docs.length
    ? `<div class="dossier2-docs">` + docs.map(doc =>
        `<div class="dossier2-doc" data-${prefix}-doc="${esc(doc.id)}"><span class="dossier2-doc-icon" aria-hidden="true">PDF</span>` +
          `<div><b>${esc(doc.title)}</b>${tag ? ` <span class="notice-area-tag">${esc(tag(doc))}</span>` : ''}` +
          `<small>${esc(doc.document?.name || '')} · ${dateLabel(doc.date)}${doc.validUntil ? ` · Validade: ${dateLabel(doc.validUntil)}` : ''} · ${doc.document?.text ? 'Texto pesquisável' : doc.document?.ocrStatus === 'failed' ? 'Leitura automática indisponível' : 'Sem texto extraído'}</small></div>` +
          `<div class="row-actions">${btn('Abrir', prefix + '-doc-open', doc.ownerId + ':' + doc.id)}${btn('Texto', prefix + '-doc-read', doc.ownerId + ':' + doc.id)}${btn('Remover', removeAction(doc), doc.removeId)}</div>` +
        `</div>`).join('') + `</div>`
    : '';

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
      (list.length > 1
        ? `<div class="u-filter-bar dossier2-selector">` +
            list.map(v =>
              `<button type="button" class="secondary ${v.id === s.vehicleId ? 'active' : ''}" data-vehicle-select="${esc(v.id)}" aria-pressed="${v.id === s.vehicleId}">${esc(v.name)}${v.plate ? ` · ${esc(v.plate)}` : ''}</button>`
            ).join('') +
          `</div>`
        : '') +
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
                btn('+ Manutenção', 'vehicle-maintenance-form', selected.id), true) +
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
        : `<p class="empty-state">Adiciona um veículo para acompanhar quilometragem, revisões, inspeção, seguro e documentos PDF.</p>`);

    for (const b of $$('[data-vehicle-select]', vehiclesHost)) {
      b.onclick = () => { s.vehicleId = b.dataset.vehicleSelect; renderVehicles(); };
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
      'Registar abastecimento · ' + v.name,
      field('Data', 'fDate', F.today(), 'date', 'required') +
        field('Quantidade (L ou kWh)', 'fQuantity', '', 'number', 'required min="0.001" step="0.001"') +
        select('Unidade', 'fUnit', [['L', 'Litros (L)'], ['kWh', 'kWh']], v.fuelType === 'electric' ? 'kWh' : 'L') +
        number('Custo total (€)', 'fCost', 0) +
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
      'Registar manutenção · ' + v.name,
      field('Descrição da intervenção', 'mDesc', '', 'text', 'required maxlength="240"') +
        field('Data', 'mDate', F.today(), 'date', 'required') +
        select('Tipo', 'mKind', Object.entries(D.VEHICLE_MAINT_KINDS), 'revision') +
        number('Custo (€)', 'mCost', 0) +
        field('Quilometragem (km, opcional)', 'mKm', v.currentKm || '', 'number', 'min="0" max="5000000" step="1"') +
        select('Despesa do veículo em Movimentos (opcional)', 'mTx', expenses, '') +
        field('Nota (opcional)', 'mNote', '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.addVehicleMaintenance(data, vehicleId, {
          description: f.get('mDesc'),
          date: f.get('mDate'),
          kind: f.get('mKind'),
          cost: Number(f.get('mCost')),
          km: f.get('mKm'),
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
      (list.length > 1
        ? `<div class="u-filter-bar dossier2-selector">` +
            list.map(h =>
              `<button type="button" class="secondary ${h.id === s.housingId ? 'active' : ''}" data-housing-select="${esc(h.id)}" aria-pressed="${h.id === s.housingId}">${esc(h.name)}</button>`
            ).join('') +
          `</div>`
        : '') +
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
        : `<p class="empty-state">Cria o dossier da habitação para centralizar documentos PDF, prazos de seguro, IMI e condomínio, equipamentos e despesas.</p>`);

    for (const b of $$('[data-housing-select]', housingHost)) {
      b.onclick = () => { s.housingId = b.dataset.housingSelect; renderHousing(); };
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
        field('Prazo de IMI / imposto (opcional)', 'hTax', h.imiDate || '', 'date') +
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
      `<div id="pdfContentSearchResults" class="pdf-search-results">` +
        (s.pdfQuery.trim()
          ? (results.length
              ? results.map(r =>
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
          : `<p class="muted">Escreve um termo acima para pesquisar no texto extraído e OCR de todos os PDFs do espaço.</p>`) +
      `</div>`;

    const input = $('#pdfContentSearchInput', panel);
    const filter = $('#pdfContentSourceFilter', panel);
    if (input) {
      input.oninput = e => {
        const pos = e.target.selectionStart;
        s.pdfQuery = e.target.value;
        renderPdfSearchPanel();
        const next = $('#pdfContentSearchInput', panel);
        next?.focus();
        try { next?.setSelectionRange(pos, pos); } catch {}
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
    for (const item of catalog) {
      try {
        const res = await readPdfFromDataUrl(item.attachment);
        commit(() => {
          D.updatePdfText(
            data,
            { sourceKind: item.sourceKind, ownerId: item.ownerId, docId: item.docId },
            res.text,
            res.ocrStatus,
          );
        }, 'Texto extraído de PDF.');
        if (res.text) indexed++;
      } catch {
        commit(() => {
          D.updatePdfText(
            data,
            { sourceKind: item.sourceKind, ownerId: item.ownerId, docId: item.docId },
            '',
            'failed',
          );
        }, 'PDF preservado após tentativa de leitura.');
        preservedOnFailure++;
      }
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
          confirmAction('Eliminar leitura de contador', 'Eliminar esta leitura? Nenhuma despesa é alterada.', () => D.removeUtilityReading(data, id));
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

  function noticeSettings(){const p=D.noticePreferences(data),labels={payments:'Pagamentos e renovações',warranties:'Garantias',food:'Validades da despensa',routines:'Equipamentos e rotinas',dossiers:'Veículos e habitação'};form('Configurar avisos',Object.entries(labels).map(([id,label])=>'<div class="notice-preference-row"><label class="checkbox"><input type="checkbox" name="noticeEnabled_'+id+'" '+(p.enabled[id]?'checked':'')+'>'+label+'</label>'+field('Avisar com antecedência (dias)','noticeDays_'+id,p.days[id],'number','min="0" max="365" required')+'</div>').join('')+field('Prioridade alta quando faltarem até (dias)','noticeUrgent',p.urgentDays,'number','min="0" max="30" required'),f=>commit(()=>D.saveNoticePreferences(data,{enabled:Object.fromEntries(Object.keys(labels).map(id=>[id,f.has('noticeEnabled_'+id)])),days:Object.fromEntries(Object.keys(labels).map(id=>[id,Number(f.get('noticeDays_'+id))])),urgentDays:Number(f.get('noticeUrgent'))}),'Configuração de avisos guardada neste espaço.'),'Escolhe as origens e os prazos. Vencidos têm prioridade alta. Estas opções não pagam, dispensam nem alteram os registos de origem.');}
  document.addEventListener('click',e=>{if(e.target.closest('[data-notice-settings]'))noticeSettings();});

  function renderAll() {
    updateTopNoticesBadge();
    renderDashboardNoticesBanner();
    if (view === 'noticesHub') renderNoticesHub();
    if (view === 'casaEquipment') enhanceEquipmentPage();
    if (view === 'casaConsumos') renderConsumos();
    if(view==='casaAnalytics')document.getElementById('casaAnalyticsConsumosShortcut')?.remove();
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
