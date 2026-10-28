(() => {
  'use strict';
  const C = window.CasaFinance;
  const L = window.CasaLife;
  const D = window.CasaDaily;
  const E = window.CasaComplete;
  const $ = (s, host = document) => host.querySelector(s);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const eur = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  const qty = (n) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 }).format(Number(n) || 0);
  const dateLabel = (iso) => {
    try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }); }
    catch { return iso; }
  };
  const state = () => C.state(data);
  const go = (view) => typeof navigate === 'function' && navigate(view);
  const addDays = (iso, days) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const monday = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const button = (label, view, extra = '') => `<button type="button" class="secondary casa-home-link" data-casa-go="${esc(view)}" ${extra}>${label}</button>`;

  function issueRows(c, today) {
    const rows = [];
    const expired = c.stock.filter((l) => l.expiry && l.expiry < today && L.remaining(c, l) > 0);
    if (expired.length) rows.push({ tone: 'danger', title: `${expired.length} lote${expired.length === 1 ? '' : 's'} expirado${expired.length === 1 ? '' : 's'} com stock`, text: 'Confere a despensa antes de planear novas compras.', view: 'casaStock' });
    const soonLimit = addDays(today, 7);
    const soon = c.stock.filter((l) => l.expiry && l.expiry >= today && l.expiry <= soonLimit && L.remaining(c, l) > 0);
    if (soon.length) rows.push({ tone: 'info', title: `${soon.length} lote${soon.length === 1 ? '' : 's'} a vencer nos próximos 7 dias`, text: 'Podes priorizar estes produtos nas refeições.', view: 'casaStock' });
    const restock = L.suggestions(data);
    if (restock.length) rows.push({ tone: 'info', title: `${restock.length} produto${restock.length === 1 ? '' : 's'} abaixo do nível de reposição`, text: 'A sugestão já desconta o que está pendente na lista.', view: 'casaStock' });
    const warranties=(data.practical?.equipment||[]).filter(e=>PracticalFinance.equipmentWarranty(e,today).status==='soon');
    if(warranties.length)rows.push({tone:'info',title:`${warranties.length} garantia${warranties.length===1?'':'s'} a terminar`,text:'Confere os equipamentos com garantia a terminar nos próximos 30 dias.',view:'casaEquipment'});
    return rows;
  }

  function render() {
    const host = $('#casaHome');
    if (!host) return;
    const c = state();
    const today = Finance.today();
    const month = today.slice(0, 7);
    const insight = D.insights(data, month);
    const pending = c.shopping.filter((s) => !s.done).length;
    const doneShopping = c.shopping.filter((s) => s.done).length;
    const alerts = issueRows(c, today);
    const weekStart = monday(today), weekEnd = addDays(weekStart, 6);
    const plans = c.plans.filter((p) => p.date >= weekStart && p.date <= weekEnd);
    const planned = plans.length;
    const prepared = plans.filter((p) => p.done).length;
    let missing = [];
    try { missing = L.planNeeds(data, weekStart, weekEnd); } catch { missing = []; }
    const recent = c.purchases.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5);
    const activeStock = c.stock.filter((lot) => L.remaining(c, lot) > 0).length;
    const budgetPct = insight.budget > 0 ? Math.min(100, Math.max(0, insight.total / insight.budget * 100)) : 0;
    const hasCasaContent = Boolean(c.purchases.length || c.shopping.length || c.catalog.length || c.stores.length || c.stock.length || c.recipes.length || c.plans.length || c.imports.length);

    const essentialLots=c.stock.filter(l=>l.expiry&&l.expiry<=addDays(today,7)&&L.remaining(c,l)>0).sort((a,b)=>a.expiry.localeCompare(b.expiry));
    const maintenance=(data.practical?.equipment||[]).filter(e=>e.planStatus!=="completed"&&Finance.validDate(e.date)&&e.date<=addDays(today,30));
    host.innerHTML = `
      <div class="section-head casa-home-head">
        <div><span class="casa-home-kicker">O teu dia-a-dia</span><h2>Hoje em casa</h2><p>Compras, lista, despensa e refeições num só lugar.</p></div>
        <div class="casa-actions"><button type="button" id="casaHomeCreateProduct" class="primary">+ Criar produto</button></div>
      </div>
      <div class="ex-casa-priorities"><article class="panel"><h3>Comprar</h3><strong>${pending} na lista</strong><p>${L.suggestions(data).length} produtos a repor. Confirma o stock antes de comprar.</p>${button("Preparar lista","casaShopping")}</article><article class="panel"><h3>Usar primeiro</h3><strong>${essentialLots.length} lotes a rever</strong><p>${essentialLots.slice(0,3).map(l=>esc(c.catalog.find(p=>p.id===l.catalogId)?.name||"Produto")+" · "+dateLabel(l.expiry)).join("<br>")||"Sem validades próximas com stock."}</p>${button("Ver despensa","casaStock")}</article><article class="panel"><h3>Manutenções a rever</h3><strong>${maintenance.length} nos próximos 30 dias ou em atraso</strong><p>${maintenance.slice(0,3).map(e=>esc(e.name)+" · "+dateLabel(e.date)).join("<br>")||"Sem planos próximos."}</p>${button("Ver equipamentos","casaEquipment")}</article></div>
      ${!hasCasaContent ? `<article class="casa-home-start">
        <div class="casa-home-start-copy"><span class="casa-home-kicker">Começar a usar</span><h3>A tua casa, organizada sem complicações</h3><p>Cria produtos para acompanhar preços e stock ou prepara a próxima lista de compras.</p></div>
        <div class="casa-home-start-actions"><button type="button" class="primary" id="casaHomeFirstProduct">+ Criar produto</button>${button('Preparar lista','casaShopping')}</div>
      </article>` : ''}
      ${hasCasaContent ? `
      <div class="casa-summary-grid casa-home-kpis">
        <article class="casa-summary-card"><span>Compras líquidas · ${esc(month)}</span><strong>${eur(insight.total)}</strong><small>${insight.difference === 0 ? 'Igual ao mês anterior' : `${insight.difference > 0 ? '+' : ''}${eur(insight.difference)} face ao mês anterior`}</small></article>
        <article class="casa-summary-card"><span>Orçamento Casa</span><strong>${insight.budget ? eur(insight.remaining) : 'Por definir'}</strong><small>${insight.budget ? `${eur(insight.total)} de ${eur(insight.budget)} utilizados` : 'Define o limite mensal nas Análises da Casa'}</small>${insight.budget ? `<div class="casa-home-budget"><span style="width:${budgetPct.toFixed(1)}%"></span></div>` : ''}</article>
        <article class="casa-summary-card"><span>Lista de compras</span><strong>${pending}</strong><small>${doneShopping} marcados · ${c.shopping.length} no total</small></article>
        <article class="casa-summary-card"><span>Despensa</span><strong>${activeStock}</strong><small>${L.suggestions(data).length} produtos a repor · ${c.catalog.filter(p=>!p.archived).length} no catálogo</small></article>
      </div>
      <div class="casa-home-grid">
        <article class="panel casa-home-attention">
          <div class="panel-heading"><div><h3>A tratar</h3><p>O que merece atenção agora.</p></div>${alerts.length ? `<span class="tag">${alerts.length}</span>` : ''}</div>
          <div class="casa-home-issues">${alerts.length ? alerts.map((row) => `<button type="button" class="casa-home-issue ${row.tone}" data-casa-go="${esc(row.view)}"><span><b>${esc(row.title)}</b><small>${esc(row.text)}</small></span><span aria-hidden="true">›</span></button>`).join('') : '<div class="casa-empty compact"><strong>Casa em dia</strong><p>Não há alertas de stock, reposição nem reposições pendentes.</p></div>'}</div>
          
        </article>
        <article class="panel casa-home-week">
          <div class="panel-heading"><div><h3>Esta semana</h3><p>${esc(dateLabel(weekStart))} — ${esc(dateLabel(weekEnd))}</p></div>${button('Abrir refeições','casaMeals')}</div>
          <div class="casa-home-week-metrics"><div><strong>${planned}</strong><span>refeições planeadas</span></div><div><strong>${prepared}</strong><span>já preparadas</span></div><div><strong>${missing.length}</strong><span>ingredientes em falta</span></div></div>
          ${missing.length ? `<div class="casa-home-needs">${missing.slice(0,4).map((n) => { const p = c.catalog.find((p) => p.id === n.catalogId); return `<span>${esc(p?.name || 'Produto')} · ${qty(n.qty)} ${esc(p?.unit || '')}</span>`; }).join('')}${missing.length > 4 ? `<small>+ ${missing.length-4} outros</small>` : ''}</div>` : '<p class="muted">O stock e a lista pendente cobrem as refeições planeadas.</p>'}
        </article>
      </div>
      <article class="panel casa-home-recent">
        <div class="panel-heading"><div><h3>Compras recentes</h3><p>Talões e artigos registados na Casa.</p></div>${button('Ver todas','casaPurchases')}</div>
        <div class="casa-home-purchase-list">${recent.length ? recent.map((p) => `<button type="button" class="casa-home-purchase" data-purchase="${esc(p.id)}"><span><b>${esc(p.store)}</b><small>${esc(dateLabel(p.date))} · ${p.items.length} ${p.items.length === 1 ? 'artigo' : 'artigos'}</small></span><span class="casa-home-purchase-value"><strong>${eur(p.total)}</strong><small class="${p.transactionId ? 'linked' : 'unlinked'}">${p.transactionId ? 'Ligação histórica' : 'Registo Casa'}</small></span></button>`).join('') : '<div class="casa-empty compact"><strong>Ainda não há compras</strong><p>Cria a primeira compra e confere os artigos e o stock.</p></div>'}</div>
      </article>` : ''}`;

    $('#casaHomeCreateProduct')?.addEventListener('click', () => window.CasaCatalogUI?.productForm());
    $('#casaHomeFirstProduct')?.addEventListener('click', () => window.CasaCatalogUI?.productForm());
    host.querySelectorAll('[data-casa-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.casaGo)));
    host.querySelectorAll('[data-purchase]').forEach((b) => b.addEventListener('click', () => window.CasaUI?.openPurchase(b.dataset.purchase)));
  }

  window.CasaHomeUI = Object.freeze({ render });
  const prevNav = PremiumUI.navigation;
  PremiumUI.navigation = (v) => {
    prevNav?.(v);
    if (v?.startsWith('casa')) {
      const revealActive = () => {
        const tabs = document.querySelector('.area-tabs');
        const active = tabs?.querySelector('button.active');
        if (active) tabs.scrollLeft = active.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - active.clientWidth) / 2;
      };
      revealActive();
      requestAnimationFrame(revealActive);
    }
    if (v === 'casaHome') {
      const add = $('#addTransaction');
      if (add) { add.hidden = false; add.textContent = '+ Criar produto'; add.onclick = () => window.CasaCatalogUI?.productForm(); }
    }
  };
  render();
  PremiumUI.navigation(view);
})();
