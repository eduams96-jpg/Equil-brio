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
    const master=res.rows.map(n=>`<button type="button" class="notice-list-item ${n.id===s.noticeSelected?'is-selected':''}" data-notice-select="${esc(n.id)}" aria-pressed="${n.id===s.noticeSelected}"><span class="notice-list-title">${esc(n.title)}</span><strong class="amount">${n.amount!==null&&n.amount!==undefined?eur(n.amount):''}</strong><small>${n.date?dateLabel(n.date)+' · ':''}${esc(n.areaLabel)}</small><span class="notice-state-tag state-${esc(n.effectiveState)}">${esc(stateLabels[n.effectiveState]||n.effectiveState)}</span></button>`).join('');


    noticesHost.innerHTML =
      `<div class="section-head notices-hero-head">` +
        `<div>` +
          `<h2>Centro de avisos geral</h2>` +

        `</div>` +
        `<div class="row-actions">` +
          `<button type="button" class="secondary" data-notice-settings>Configurar avisos</button>` +
        `</div>` +
      `</div>` +
      `<div class="u-metrics notices-kpis">` +
        `<article class="panel u-metric notices-kpi-card"><div><span>Avisos ativos</span><strong id="noticesActiveCount">${res.counts.active}</strong><small>Total a aguardar atenção</small></div></article>` +
        `<article class="panel u-metric notices-kpi-card ${res.counts.high ? 'is-urgent' : ''}"><div><span>Prioridade alta / Atraso</span><strong id="noticesHighCount" class="${res.counts.high ? 'negative' : ''}">${res.counts.high}</strong><small>Vencidos ou muito próximos</small></div></article>` +
        `<article class="panel u-metric notices-kpi-card"><div><span>Adiados</span><strong id="noticesSnoozedCount">${res.counts.snoozed}</strong><small>Temporariamente silenciados</small></div></article>` +
        `<article class="panel u-metric notices-kpi-card"><div><span>Dispensados</span><strong id="noticesDismissedCount">${res.counts.dismissed}</strong><small>Arquivados sem alterar origem</small></div></article>` +
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
      `<section class="panel notices-toolbar">` +
        `<div class="notices-filters">` +
          select('Origem', 'noticeAreaFilter', noticeAreas, s.noticeArea, 'id="noticeAreaFilter"') +
          select('Prioridade', 'noticePriorityFilter', [['all', 'Todas as prioridades'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']], s.noticePriority, 'id="noticePriorityFilter"') +
          select('Estado', 'noticeStateFilter', [['active', 'Ativos'], ['overdue', 'Em atraso'], ['snoozed', 'Adiados'], ['dismissed', 'Dispensados'], ['resolved', 'Liquidados / Concluídos'], ['all', 'Todos']], s.noticeState, 'id="noticeStateFilter"') +
          field('Pesquisar aviso', 'noticeQueryInput', s.noticeQuery, 'search', 'id="noticeQueryInput" placeholder="Procurar água, seguro, veículo, equipamento…"') +
        `</div>` +
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
    const routines = D.routines(data);
    const today = F.today();
    routinesSec.innerHTML =
      `<div class="u-head">` +
        `<div><h3>Rotinas domésticas e manutenção preventiva</h3>` +
        `<p>Tarefas periódicas com lista de verificação e histórico de conclusão.</p></div>` +
        `<div class="u-actions">${btn('+ Nova rotina', 'routine-form', '', '', 'primary')}</div>` +
      `</div>` +
      (routines.length
        ? `<div class="routines-grid">${routines.map(r => {
            const equip = equipList.find(e => String(e.id) === String(r.equipmentId));
            const days = Math.round((Date.parse(r.nextDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
            const statusText = days < 0 ? `Em atraso (${Math.abs(days)} dia(s))` : days === 0 ? 'Para hoje' : `Daqui a ${days} dia(s)`;
            const freqText = frequencyLabels[r.frequency] || r.frequency;
            const lastExec = (r.history || []).at(-1);
            return `<article class="panel routine-card" data-routine-id="${esc(r.id)}">` +
              `<div class="routine-card-head">` +
                `<div><h4>${esc(r.title)}</h4><p>${esc(r.area || 'Geral')} · ${esc(freqText)} · Próxima data: <b>${dateLabel(r.nextDate)}</b> (${esc(statusText)})${equip ? ` · Equipamento: <b>${esc(equip.name)}</b>` : ''}</p></div>` +
                (lastExec ? `<small>Última conclusão: ${dateLabel(lastExec.date)}</small>` : `<small>Ainda sem conclusões</small>`) +
              `</div>` +
              (r.notes ? `<p>${esc(r.notes)}</p>` : '') +
              (r.checklist?.length
                ? `<details class="routine-checklist-details"><summary>Lista de verificação (${r.checklist.filter(c => c.done).length}/${r.checklist.length})</summary><div class="routine-checklist" aria-label="Lista de verificação">` +
                    r.checklist.map(c =>
                      `<label class="checkbox"><input type="checkbox" data-routine-check="${esc(r.id)}" data-check-id="${esc(c.id)}" ${c.done ? 'checked' : ''}> ${esc(c.label)}</label>`
                    ).join('') +
                  `</div></details>`
                : '') +
              `<div class="row-actions">` +
                btn('Concluir e avançar data', 'routine-complete', r.id, '', 'primary') +
                btn('Editar', 'routine-form', r.id) +
                btn('Eliminar', 'routine-remove', r.id) +
              `</div>` +
              `<details><summary>Histórico de execução (${(r.history || []).length})</summary>` +
                ((r.history || []).length
                  ? (r.history || []).slice().reverse().map(h =>
                      `<p>${dateLabel(h.date)} (próxima: ${dateLabel(h.nextDate)}) · Checklist: ${h.completedItems}/${h.totalItems}${h.note ? ' · ' + esc(h.note) : ''}</p>`
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
  const kindLabels = {
    reading: 'Leitura acumulada',
    reset: 'Substituição / reinício de contador',
  };

  function renderConsumos() {
    if (view !== 'casaConsumos') return;
    const s = uiState();
    const comp = D.utilityComparison(data, { utility: s.utilityFilter });

    const summaryCards = (['water', 'electricity', 'gas']).map(u => {
      const fullComp = D.utilityComparison(data, { utility: u });
      const latestInterval = fullComp.intervals[0] || null;
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
          `<small>Leitura de <b>${latestInterval.reading} ${esc(latestInterval.unitLabel)}</b> em ${dateLabel(latestInterval.date)}</small>` +
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
        `<div><p class="eyebrow">CASA · CONSUMOS DOMÉSTICOS</p><h2>Consumos de água, eletricidade e gás</h2>` +
        `<p>Regista leituras de contador e acompanha a evolução física mensal (m³ e kWh). As leituras são independentes dos movimentos bancários e nunca criam despesas duplicadas.</p></div>` +
        `<div class="row-actions">${btn('+ Registar leitura em janela', 'utility-form', '', '', 'primary')}</div>` +
      `</div>` +
      `<div class="utility-summary-grid" id="utilityMonthlyComparison">${summaryCards}</div>` +
      `<section class="panel consumos-form-panel">` +
        `<div class="u-head"><div><h3>Registar nova leitura de contador</h3><p>Introduz o valor acumulado visível no visor do contador. Para um contador novo que começou do zero, escolhe "Substituição / reinício de contador".</p></div></div>` +
        `<form id="utilityReadingForm" class="form-grid consumos-form-grid">` +
          select('Serviço', 'utility', [['water', '💧 Água'], ['electricity', '⚡ Eletricidade'], ['gas', '🔥 Gás']], 'water') +
          select('Unidade', 'unit', [['m3', 'm³ (Água / Gás)'], ['kWh', 'kWh (Eletricidade / Gás)']], 'm3') +
          field('Contador', 'meter', 'Contador principal', 'text', 'maxlength="80"') +
          field('Data da leitura', 'date', F.today(), 'date', 'required') +
          field('Leitura acumulada no visor', 'reading', '', 'number', 'required min="0" step="0.001" placeholder="Ex.: 142.5"') +
          select('Tipo de registo', 'kind', Object.entries(kindLabels), 'reading') +
          field('Nota ou observação (opcional)', 'note', '', 'text', 'maxlength="500" placeholder="Ex.: Leitura comunicada ao fornecedor"') +
          `<div class="row-actions consumos-submit-row"><button type="submit" class="primary">Guardar leitura</button></div>` +
        `</form>` +
      `</section>` +
      `<section class="panel consumos-history-panel">` +
        `<div class="u-head"><div><h3>Histórico de leituras e intervalos apurados</h3><p>Diferença real entre leituras consecutivas do mesmo contador e média diária.</p></div>` +
        `<div class="u-filter-bar">` +
          [['all', 'Todos os serviços'], ['water', '💧 Água (m³)'], ['electricity', '⚡ Eletricidade (kWh)'], ['gas', '🔥 Gás (m³ / kWh)']].map(([id, label]) =>
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
      const unitSel = $('[name=unit]', inlineForm);
      if (uSel && unitSel) {
        uSel.onchange = () => {
          if (uSel.value === 'water') unitSel.value = 'm3';
          else if (uSel.value === 'electricity') unitSel.value = 'kWh';
        };
      }
      inlineForm.onsubmit = e => {
        e.preventDefault();
        const fd = new FormData(inlineForm);
        try {
          commit(() => {
            D.saveUtilityReading(data, {
              utility: fd.get('utility'),
              unit: fd.get('unit'),
              meter: fd.get('meter'),
              date: fd.get('date'),
              reading: Number(fd.get('reading')),
              kind: fd.get('kind'),
              note: fd.get('note'),
            });
          }, 'Leitura de consumo guardada. Nenhum movimento financeiro foi criado.');
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
    const byUtil = (['water', 'electricity', 'gas']).map(u => {
      const comp = D.utilityComparison(data, { utility: u });
      const latest = comp.intervals[0];
      return `<div class="casa-analytics-utility-chip"><span>${utilityIcons[u]} ${utilityLabels[u]}</span><strong>${latest && latest.consumption !== null ? `${latest.consumption} ${esc(latest.unitLabel)}` : latest ? `${latest.reading} ${esc(latest.unitLabel)}` : 'Sem leituras'}</strong></div>`;
    }).join('');
    card.innerHTML =
      `<div class="u-head"><div><h3>Consumos de água, eletricidade e gás</h3>` +
      `<p>${count} leitura(s) de contador registada(s) neste espaço financeiro.</p></div>` +
      `<div class="u-actions">${btn('Abrir Consumos', 'open-consumos', '', '', 'primary')}</div></div>` +
      `<div class="casa-analytics-utility-chips">${byUtil}</div>`;
  }

  function utilityForm(id) {
    const r = D.utilityReadings(data).find(x => String(x.id) === String(id)) || {};
    form(
      r.id ? 'Editar leitura de contador' : 'Registar leitura de contador',
      select('Serviço', 'utilityType', [['water', 'Água'], ['electricity', 'Eletricidade'], ['gas', 'Gás']], r.utility || 'water') +
        select('Unidade', 'utilityUnit', [['m3', 'm³ (Água / Gás)'], ['kWh', 'kWh (Eletricidade / Gás)']], r.unit || (r.utility === 'electricity' ? 'kWh' : 'm3')) +
        field('Data da leitura', 'utilityDate', r.date || F.today(), 'date', 'required') +
        field('Leitura no contador (acumulada)', 'utilityReading', r.reading ?? '', 'number', 'required min="0" step="0.001"') +
        select('Tipo de registo', 'utilityKind', Object.entries(kindLabels), r.kind || 'reading') +
        field('Identificação do contador (opcional)', 'utilityMeterLabel', r.meter || 'Contador principal', 'text', 'maxlength="80"') +
        field('Nota (opcional)', 'utilityNote', r.note || '', 'text', 'maxlength="500"'),
      f => commit(() => {
        D.saveUtilityReading(data, {
          id: r.id,
          utility: f.get('utilityType'),
          unit: f.get('utilityUnit'),
          date: f.get('utilityDate'),
          reading: Number(f.get('utilityReading')),
          kind: f.get('utilityKind'),
          meter: f.get('utilityMeterLabel'),
          note: f.get('utilityNote'),
        });
      }, 'Leitura de consumo guardada. Nenhum movimento financeiro foi criado.'),
      'Para contador novo ou substituído que recomeçou do zero, escolhe "Substituição / reinício de contador". Assim a leitura anterior não gera consumo negativo nem artificial.',
    );
    const uSel = $('#modalContent [name=utilityType]');
    const unitSel = $('#modalContent [name=utilityUnit]');
    if (uSel && unitSel) {
      uSel.onchange = () => {
        if (uSel.value === 'water') unitSel.value = 'm3';
        else if (uSel.value === 'electricity') unitSel.value = 'kWh';
      };
    }
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

  function renderVehicles() {
    if (view !== 'casaVehicles') return;
    const s = uiState();
    const list = D.vehicles(data);
    const selected = list.find(v => String(v.id) === String(s.vehicleId)) || list[0] || null;
    s.vehicleId = selected?.id || '';
    const summary = selected ? D.vehicleSummary(data, selected.id) : null;

    vehiclesHost.innerHTML =
      `<div class="section-head">` +
        `<div><p class="eyebrow">DOSSIÊ PRÁTICO E PATRIMÓNIO</p><h2>Ficha do veículo</h2>` +
        `<p>Quilometragem, abastecimentos, manutenções, documentos PDF e custos agregados sem duplicar movimentos.</p></div>` +
        `<div class="row-actions">${btn('Pesquisar nos PDFs', 'open-pdf-search', 'vehicle')}${btn('+ Novo veículo', 'vehicle-form', '', '', 'primary')}</div>` +
      `</div>` +
      (list.length
        ? `<div class="u-filter-bar vehicle-selector-bar">` +
            list.map(v =>
              `<button type="button" class="secondary ${v.id === s.vehicleId ? 'active' : ''}" data-vehicle-select="${esc(v.id)}" aria-pressed="${v.id === s.vehicleId}">${esc(v.name)}${v.plate ? ` · ${esc(v.plate)}` : ''}</button>`
            ).join('') +
          `</div>`
        : '') +
      (summary
        ? `<div class="vehicle-dossier" id="vehicleDossierView">` +
            `<div class="u-metrics">` +
              `<article class="panel u-metric"><div><span>Quilometragem atual</span><strong id="vehicleCurrentKm">${summary.currentKm.toLocaleString('pt-PT')} km</strong></div></article>` +
              `<article class="panel u-metric"><div><span>Custo total acumulado</span><strong class="amount" id="vehicleTotalCost">${eur(summary.totalEffectiveCost)}</strong><small>Sem duplicação financeira</small></div></article>` +
              ((selected.fuelings || []).length ? `<article class="panel u-metric"><div><span>Abastecimentos / consumo</span><strong class="amount" id="vehicleFuelCost">${eur(summary.fuelCost)}</strong><small>${summary.averageConsumptionPer100Km !== null ? `${summary.averageConsumptionPer100Km} ${esc(summary.consumptionUnit)}` : 'Média após 2 abastecimentos com km'}</small></div></article>` : '') +
              `<article class="panel u-metric"><div><span>Manutenção acumulada</span><strong class="amount" id="vehicleMaintCost">${eur(summary.maintenanceCost)}</strong></div></article>` +
            `</div>` +
            `<section class="panel vehicle-overview-panel">` +
              `<div class="u-head">` +
                `<div><h3>${esc(selected.name)}${selected.plate ? ` · ${esc(selected.plate)}` : ''}</h3>` +
                `<p>${esc(selected.makeModel || 'Marca/modelo por indicar')} · Combustível: ${esc(fuelLabels[selected.fuelType] || selected.fuelType)}${summary.assetName ? ` · Património: ${esc(summary.assetName)} (${eur(summary.assetValue)})` : ''}</p></div>` +
                `<div class="u-actions">` +
                  btn('Editar veículo', 'vehicle-form', selected.id) +
                  btn('+ Quilometragem', 'vehicle-mileage-form', selected.id) +
                  btn('+ Manutenção', 'vehicle-maintenance-form', selected.id) +
                  btn('+ Documento PDF', 'vehicle-document-form', selected.id) +
                  btn('Eliminar veículo', 'vehicle-remove', selected.id) +
                `</div>` +
              `</div>` +
              `<dl class="dossier-dates-grid">` +
                `<div><dt>Inspeção (IPO)</dt><dd>${selected.nextInspectionDate ? dateLabel(selected.nextInspectionDate) : 'Não indicada'}</dd></div>` +
                `<div><dt>Seguro</dt><dd>${selected.insuranceDate ? dateLabel(selected.insuranceDate) : 'Não indicado'}</dd></div>` +
                `<div><dt>IUC / Imposto</dt><dd>${selected.iucDate ? dateLabel(selected.iucDate) : 'Não indicado'}</dd></div>` +
                `<div><dt>Próxima revisão</dt><dd>${selected.nextMaintenanceDate ? dateLabel(selected.nextMaintenanceDate) : ''}${selected.nextMaintenanceKm ? ` · ${selected.nextMaintenanceKm.toLocaleString('pt-PT')} km` : (!selected.nextMaintenanceDate ? 'Não indicada' : '')}</dd></div>` +
              `</dl>` +
              (selected.notes ? `<p>${esc(selected.notes)}</p>` : '') +
            `</section>` +
            `<div class="dossier-columns">` +
              `<section class="panel">` +
                `<h3>Manutenções e intervenções (${(selected.maintenance || []).length})</h3>` +
                ((selected.maintenance || []).length
                  ? `<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Descrição</th><th>Km</th><th>Custo</th><th>Movimento</th><th></th></tr></thead><tbody>` +
                      selected.maintenance.slice().sort((a, b) => b.date.localeCompare(a.date)).map(m =>
                        `<tr><td>${dateLabel(m.date)}</td><td>${esc(m.description)}</td><td>${m.km !== null && m.km !== undefined ? `${m.km.toLocaleString('pt-PT')} km` : '—'}</td><td class="amount">${eur(m.cost)}</td><td>${m.transactionId ? 'Associado' : 'Só na ficha'}</td><td>${btn('Remover', 'vehicle-sub-remove', `${selected.id}:maintenance:${m.id}`)}</td></tr>`
                      ).join('') +
                    `</tbody></table></div>`
                  : `<p class="practical-empty">Sem manutenções registadas neste veículo.</p>`) +
              `</section>` +
              ((selected.fuelings || []).length ? `<section class="panel">` +
                `<h3>Abastecimentos e carregamentos (${(selected.fuelings || []).length})</h3>` +
                ((selected.fuelings || []).length
                  ? `<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Quantidade</th><th>Total</th><th>Km</th><th>Movimento</th><th></th></tr></thead><tbody>` +
                      selected.fuelings.slice().sort((a, b) => b.date.localeCompare(a.date)).map(f =>
                        `<tr><td>${dateLabel(f.date)}</td><td>${f.quantity} ${esc(f.unit)}</td><td class="amount">${eur(f.cost)}</td><td>${f.km !== null && f.km !== undefined ? `${f.km.toLocaleString('pt-PT')} km` : '—'}</td><td>${f.transactionId ? 'Associado' : 'Só na ficha'}</td><td>${btn('Remover', 'vehicle-sub-remove', `${selected.id}:fuelings:${f.id}`)}</td></tr>`
                      ).join('') +
                    `</tbody></table></div>`
                  : `<p class="practical-empty">Sem abastecimentos registados.</p>`) +
              `</section>` : '') +
              `<section class="panel">` +
                `<h3>Registo de quilometragem (${(selected.mileageLog || []).length})</h3>` +
                ((selected.mileageLog || []).length
                  ? `<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Quilometragem</th><th>Nota</th><th></th></tr></thead><tbody>` +
                      selected.mileageLog.slice().sort((a, b) => b.date.localeCompare(a.date)).map(m =>
                        `<tr><td>${dateLabel(m.date)}</td><td><b>${m.km.toLocaleString('pt-PT')} km</b></td><td>${esc(m.note || '')}</td><td>${btn('Remover', 'vehicle-sub-remove', `${selected.id}:mileageLog:${m.id}`)}</td></tr>`
                      ).join('') +
                    `</tbody></table></div>`
                  : `<p class="practical-empty">Sem registos autónomos de quilometragem.</p>`) +
              `</section>` +
              `<section class="panel">` +
                `<h3>Documentos PDF do veículo (${(selected.documents || []).length})</h3>` +
                ((selected.documents || []).length
                  ? `<div class="dossier-docs-list">` +
                      selected.documents.map(doc =>
                        `<div class="dossier-doc-row" data-vehicle-doc="${esc(doc.id)}">` +
                          `<div><b>${esc(doc.title)}</b> <small>(${esc(doc.document?.name || '')} · ${dateLabel(doc.date)})</small><br>` +
                          `<small>${doc.document?.text ? `Texto pesquisável (${doc.document.ocrStatus === 'ocr' ? 'OCR' : 'extraído'})` : doc.document?.ocrStatus === 'failed' ? 'PDF preservado (leitura automática indisponível)' : 'Sem texto extraído'}</small></div>` +
                          `<div class="row-actions">` +
                            btn('Abrir PDF', 'vehicle-doc-open', `${selected.id}:${doc.id}`) +
                            btn('Ler/rever texto', 'vehicle-doc-read', `${selected.id}:${doc.id}`) +
                            btn('Remover', 'vehicle-sub-remove', `${selected.id}:documents:${doc.id}`) +
                          `</div>` +
                        `</div>`
                      ).join('') +
                    `</div>`
                  : `<p class="practical-empty">Anexa apólice de seguro, comprovativo de inspeção, IUC ou faturas de oficina em PDF.</p>`) +
              `</section>` +
            `</div>` +
          `</div>`
        : `<p class="empty-state">Adiciona um veículo para acompanhar quilometragem, revisões, inspeção, seguro, abastecimentos e documentos PDF.</p>`);

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

    housingHost.innerHTML =
      `<div class="section-head">` +
        `<div><p class="eyebrow">DOSSIÊ DOCUMENTAL E PATRIMÓNIO</p><h2>Dossier da habitação</h2>` +
        `<p>Reúne informação da habitação, documentos PDF pesquisáveis e ligações a equipamentos, rotinas domésticas, património e movimentos.</p></div>` +
        `<div class="row-actions">${btn('Pesquisar nos PDFs', 'open-pdf-search', 'housing')}${btn('+ Nova habitação', 'housing-form', '', '', 'primary')}</div>` +
      `</div>` +
      (list.length
        ? `<div class="u-filter-bar housing-selector-bar">` +
            list.map(h =>
              `<button type="button" class="secondary ${h.id === s.housingId ? 'active' : ''}" data-housing-select="${esc(h.id)}" aria-pressed="${h.id === s.housingId}">${esc(h.name)}</button>`
            ).join('') +
          `</div>`
        : '') +
      (summary
        ? `<div class="housing-dossier" id="housingDossierView">` +
            `<div class="u-metrics">` +
              `<article class="panel u-metric"><div><span>Valor patrimonial</span><strong class="amount" id="housingAssetValue">${summary.assetName ? eur(summary.assetValue) : 'Por indicar'}</strong><small>${summary.assetName ? '' : 'Indica-o em «Editar dossier».'}</small></div></article>` +
              (summary.accumulatedTotal ? `<article class="panel u-metric"><div><span>Custos associados</span><strong class="amount" id="housingCombinedCost">${eur(summary.accumulatedTotal)}</strong></div></article>` : '') +
            `</div>` +
            `<section class="panel housing-overview-panel">` +
              `<div class="u-head">` +
                `<div><h3>${esc(selected.name)} · ${esc(summary.kindLabel)}</h3>` +
                `<p>${esc([selected.typology, selected.addressNote, selected.taxId].filter(Boolean).join(' · ') || 'Morada/fração não indicada')}</p></div>` +
                `<div class="u-actions">` +
                  btn('Editar dossier', 'housing-form', selected.id) +
                  btn('+ Anexar PDF ao dossier', 'housing-document-form', selected.id, '', 'primary') +
                  btn('Eliminar dossier', 'housing-remove', selected.id) +
                `</div>` +
              `</div>` +
              `<dl class="dossier-dates-grid">` +
                `<div><dt>Seguro da habitação</dt><dd>${selected.insuranceDate ? dateLabel(selected.insuranceDate) : 'Não indicado'}</dd></div>` +
                `<div><dt>Condomínio / assembleia</dt><dd>${selected.condominiumDate ? dateLabel(selected.condominiumDate) : 'Não indicado'}</dd></div>` +
                `<div><dt>IMI / Imposto</dt><dd>${selected.imiDate ? dateLabel(selected.imiDate) : 'Não indicado'}</dd></div>` +
              `</dl>` +
              (selected.notes ? `<p>${esc(selected.notes)}</p>` : '') +
            `</section>` +
            `<div class="dossier-columns">` +
              `<section class="panel">` +
                `<h3>Documentos PDF da habitação (${(selected.documents || []).length})</h3>` +
                ((selected.documents || []).length
                  ? `<div class="dossier-docs-list">` +
                      selected.documents.map(doc =>
                        `<div class="dossier-doc-row" data-housing-doc="${esc(doc.id)}">` +
                          `<div><b>${esc(doc.title)}</b> · <span class="notice-area-tag">${esc(housingDocCategories[doc.category] || doc.category)}</span><br>` +
                          `<small>${esc(doc.document?.name || '')} · Data: ${dateLabel(doc.date)}${doc.validUntil ? ` · Validade: ${dateLabel(doc.validUntil)}` : ''}</small><br>` +
                          `<small>${doc.document?.text ? `Texto pesquisável (${doc.document.ocrStatus === 'ocr' ? 'OCR' : 'extraído'})` : doc.document?.ocrStatus === 'failed' ? 'PDF preservado (leitura automática indisponível)' : 'Sem texto extraído'}</small></div>` +
                          `<div class="row-actions">` +
                            btn('Abrir PDF', 'housing-doc-open', `${selected.id}:${doc.id}`) +
                            btn('Ler/rever texto', 'housing-doc-read', `${selected.id}:${doc.id}`) +
                            btn('Remover', 'housing-doc-remove', `${selected.id}:${doc.id}`) +
                          `</div>` +
                        `</div>`
                      ).join('') +
                    `</div>`
                  : `<p class="practical-empty">Guarda aqui escrituras, contratos, apólices de seguro, atas de condomínio, certificados e comprovativos de IMI em PDF.</p>`) +
              `</section>` +
              (summary.equipmentSummaries.length || summary.linkedRoutines.length ? `<section class="panel">` +
                `<h3>Equipamentos e rotinas associados</h3>` +
                `<h4>Equipamentos (${summary.equipmentSummaries.length})</h4>` +
                (summary.equipmentSummaries.length
                  ? `<ul>${summary.equipmentSummaries.map(e => `<li><b>${esc(e.name)}</b> · Acumulado: ${eur(e.accumulatedTotal)}</li>`).join('')}</ul>`
                  : `<p class="practical-empty">Sem equipamentos associados.</p>`) +
                `<h4>Rotinas domésticas (${summary.linkedRoutines.length})</h4>` +
                (summary.linkedRoutines.length
                  ? `<ul>${summary.linkedRoutines.map(r => `<li><b>${esc(r.title)}</b> · Próxima: ${dateLabel(r.nextDate)}</li>`).join('')}</ul>`
                  : `<p class="practical-empty">Sem rotinas associadas.</p>`) +
                `<div class="row-actions">${btn('Abrir Equipamentos e Rotinas', 'open-equipment-page')}</div>` +
              `</section>` : '') +
              (summary.linkedTransactions.length ? `<section class="panel">` +
                `<h3>Movimentos financeiros associados (${summary.linkedTransactions.length})</h3>` +
                (summary.linkedTransactions.length
                  ? `<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>` +
                      summary.linkedTransactions.map(t =>
                        `<tr><td>${dateLabel(t.date)}</td><td>${esc(t.description)}</td><td>${esc(t.category || '')}</td><td class="amount">${eur(t.amount)}</td></tr>`
                      ).join('') +
                    `</tbody></table></div>`
                  : `<p class="practical-empty">Sem movimentos associados diretamente a este dossier.</p>`) +
              `</section>` : '') +
            `</div>` +
          `</div>`
        : `<p class="empty-state">Cria o dossier da habitação para centralizar documentos PDF, prazos de seguros/IMI/condomínio e ligações a equipamentos, rotinas, património e despesas.</p>`);

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
