'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');
const H = require('../../../shared/house.cjs');
const Forms = require('../../../shared/form-drafts.cjs');
const { priceLabel } = require('../house-ui.cjs');

const NO_PLACE = 'Sem local definido';

// Pills do topo: «Lista de compras» abre o seu próprio ecrã; as outras trocam o separador desta página.
const PILLS = [
  ['compras', 'Lista de compras', 'data-page="compras"'],
  ['produtos', 'Produtos', 'data-house-tab="produtos"'],
  ['stock', 'Stock', 'data-house-tab="stock"'],
  ['historico', 'Histórico', 'data-house-tab="historico"'],
];

function pills(tab) {
  return '<div class="cs-pills" role="tablist">' + PILLS.map(([id, label, attr]) =>
    '<button type="button" role="tab" ' + attr + ' aria-pressed="' + (id === tab ? 'true' : 'false') + '">' + label + '</button>').join('') + '</div>';
}

function rowButton(attr, id, title, detail, aside) {
  const e = kit.escape;
  return '<button type="button" class="row movement-row" ' + attr + '="' + e(id) + '"><div><strong>' + e(title) + '</strong><small>' + e(detail) + '</small></div><span>' + e(aside) + '</span></button>';
}

function banner(state) {
  return state.houseDraft
    ? '<section class="draft-banner"><strong>Tens um artigo Casa por concluir</strong><button id="resume-house">Retomar preenchimento</button><button id="ask-discard-house">Descartar rascunho</button></section>' : '';
}

function productPage(ctx, c, p) {
  const e = kit.escape, hidden = ctx.state.hidden;
  const back = '<button class="back" data-house-tab="produtos">‹ Produtos</button>';
  if (!p) return back + '<h1>Produto indisponível</h1>';
  const offers = Object.entries(p.offers || {}).map(([storeId, offer]) => ({ storeId, ...offer, per: offer.price / offer.packageQty }))
    .sort((a, b) => (a.price > 0 ? 0 : 1) - (b.price > 0 ? 0 : 1) || a.per - b.per);
  const offerCards = offers.map(o => '<section class="review-card"><strong>' + e((c.stores.find(s => s.id === o.storeId) || {}).name || 'Supermercado') + '</strong>'
    + '<p>' + o.packageQty + ' ' + e(p.unit) + ' · ' + (o.price > 0 ? kit.money(Math.round(o.price * 100), hidden) : 'Falta colocar preço') + '</p>'
    + '<small>' + (o.price > 0 ? priceLabel(p.unit, o, hidden) : 'Sem comparação por unidade') + ' · ' + e(V.dateLabel(o.date)) + '</small>'
    + (o.url ? '<a class="product-link" href="' + e(o.url) + '" target="_blank" rel="noopener noreferrer">Abrir neste supermercado ↗</a>' : '') + '</section>').join('');
  const lots = c.stock.filter(l => l.catalogId === p.id).map(l =>
    rowButton('data-lot', l.id, l.location || NO_PLACE, l.expiry ? V.dateLabel(l.expiry) : 'Sem validade indicada', H.Life.remaining(c, l) + ' ' + l.unit)).join('');
  return back + '<h1>' + e(p.name) + '</h1><p>' + [p.brand, p.category, p.unit].filter(Boolean).map(e).join(' · ') + '</p>'
    + (p.url ? '<a class="product-link" href="' + e(p.url) + '" target="_blank" rel="noopener noreferrer">Abrir link do produto ↗</a>' : '')
    + '<button class="full" data-edit-product="' + e(p.id) + '">Editar produto e preços</button>'
    + '<h2>Preços por supermercado</h2>' + (offerCards || '<p class="empty">Sem preços registados. Adiciona-os ao editar o produto.</p>')
    + '<h2>Lotes e destinos</h2><button class="primary full" data-new-lot="' + e(p.id) + '">+ Adicionar stock</button>' + lots;
}

function lotPage(ctx, c, lot) {
  const e = kit.escape;
  const product = lot && c.catalog.find(p => p.id === lot.catalogId);
  const back = '<button class="back" data-product="' + e(product ? product.id : '') + '">‹ Produto</button>';
  if (!lot) return back + '<h1>Lote indisponível</h1>';
  const labels = { consume: 'Consumo', waste: 'Desperdício' };
  const events = c.stockEvents.filter(x => x.lotId === lot.id).map(x =>
    '<div class="info-line"><span>' + e(V.dateLabel(x.date)) + ' · ' + e(labels[x.type] || 'Acerto') + '<small>' + e(x.note || '') + '</small></span><strong>' + x.delta + ' ' + e(lot.unit) + '</strong></div>').join('');
  return back + '<h1>' + e(product ? product.name : 'Lote indisponível') + '</h1>'
    + '<section class="review-card"><p class="review-value">' + H.Life.remaining(c, lot) + ' ' + e(lot.unit) + '</p><p>' + e(lot.location || NO_PLACE) + '</p>'
    + '<p>' + (lot.expiry ? 'Validade: ' + e(V.dateLabel(lot.expiry)) : 'Sem validade indicada') + '</p></section>'
    + '<div class="review-actions"><button data-edit-lot="' + e(lot.id) + '">Alterar destino e validade</button><button data-consume-lot="' + e(lot.id) + '" class="primary">Consumir / desperdício</button></div>'
    + '<h2>Histórico do lote</h2>' + (events || '<p class="empty">Ainda sem consumo.</p>');
}

function productsBody(c) {
  const list = c.catalog.filter(p => !p.archived).map(p => rowButton('data-product', p.id, p.name, (p.category || 'Sem categoria') + ' · ' + H.Life.available(c, p.id) + ' ' + p.unit, '›')).join('');
  return '<button id="new-product" class="primary full">+ Criar produto</button>'
    + (list ? kit.card({ title: 'Produtos', subtitle: c.catalog.filter(p => !p.archived).length + ' no catálogo', body: list }) : '<p class="empty">Ainda sem produtos. Começa por criar um produto.</p>');
}

function stockBody(c) {
  const places = [...new Set(c.stock.map(l => l.location || NO_PLACE))].sort();
  return places.map(place => {
    const lots = c.stock.filter(l => (l.location || NO_PLACE) === place && H.Life.remaining(c, l) > 0);
    return lots.length ? kit.card({
      title: place, subtitle: lots.length + (lots.length === 1 ? ' artigo' : ' artigos'),
      body: lots.map(l => rowButton('data-lot', l.id, (c.catalog.find(p => p.id === l.catalogId) || {}).name || 'Produto',
        l.expiry ? 'Validade: ' + V.dateLabel(l.expiry) : 'Sem validade indicada', H.Life.remaining(c, l) + ' ' + l.unit)).join(''),
    }) : '';
  }).join('');
}

function historyBody(ctx, c) {
  const e = kit.escape;
  return c.purchases.map(p => kit.card({
    title: p.store, subtitle: V.dateLabel(p.date),
    body: '<p class="review-value">' + kit.money(Math.round(p.total * 100), ctx.state.hidden) + '</p>'
      + p.items.map(i => '<div class="info-line"><span>' + e(i.name) + '</span><span>' + e(i.qty == null ? '' : i.qty) + ' ' + e(i.unit || '') + '</span></div>').join(''),
  })).join('') || '<p class="empty">Ainda sem compras registadas.</p>';
}

function shoppingBody(c) {
  const open = c.shopping.filter(s => !s.done).length;
  return kit.card({
    title: 'Lista de compras', subtitle: open + (open === 1 ? ' artigo por comprar' : ' artigos por comprar'),
    body: '<button type="button" class="primary full" data-page="compras">Abrir lista de compras</button>',
  });
}

// Ecrã Casa. view: {tab: 'compras'|'produtos'|'stock'|'historico' (ou 'produto'|'lote' nos detalhes), id}.
function render(ctx, view = {}) {
  const tab = view.tab || 'produtos', id = view.id;
  const c = H.Casa.state(ctx.ledger);
  if (tab === 'produto') return banner(ctx.state) + productPage(ctx, c, c.catalog.find(p => p.id === id));
  if (tab === 'lote') return banner(ctx.state) + lotPage(ctx, c, c.stock.find(l => l.id === id));
  const body = tab === 'compras' ? shoppingBody(c) : tab === 'stock' ? stockBody(c) : tab === 'historico' ? historyBody(ctx, c) : productsBody(c);
  return banner(ctx.state) + '<h1>Casa</h1><p class="sub">Compras e stock · dados guardados neste dispositivo</p>' + pills(tab)
    + (body || '<p class="empty">Ainda sem registos nesta vista. Começa por criar um produto.</p>');
}

// Formulário de produto, lote ou consumo. view: {form, record}. Os ids e names são os que main.js já usa.
function form(ctx, view = {}) {
  const e = kit.escape, f = view.form, hr = view.record;
  if (!f) return '<p>Formulário indisponível.</p>';
  const reason = Forms.staleReason(ctx.state, hr);
  const field = (name, label, extra = '') => '<label>' + label + '<input name="' + name + '" value="' + e(f[name] || '') + '" ' + extra + '></label>';
  let body = '';
  if (f.command === 'house.product') {
    const units = H.Casa.stockUnits.map(([id, label]) => '<option value="' + id + '" ' + (f.unit === id ? 'selected' : '') + '>' + e(label) + '</option>').join('');
    const offers = f.offers.map((o, i) => '<fieldset data-offer-row><legend>Preço ' + (i + 1) + '</legend>'
      + [['storeName', 'Supermercado'], ['packageQty', 'Quantidade da embalagem'], ['price', 'Preço (€), opcional'], ['url', 'Link neste supermercado']].map(([k, label]) =>
        '<label>' + label + '<input name="offer-' + i + '-' + k + '" data-offer-field="' + k + '" value="' + e(o[k] == null ? '' : o[k]) + '" '
        + (k === 'storeName' ? 'maxlength="160"' : k === 'url' ? 'type="url" maxlength="2048" placeholder="https://…"' : 'inputmode="decimal"') + '></label>').join('')
      + '<button data-remove-offer="' + i + '" type="button">Retirar este preço do formulário</button></fieldset>').join('');
    body = field('name', 'Nome', 'required maxlength="160"') + field('brand', 'Marca', 'maxlength="80"') + field('category', 'Categoria', 'required')
      + field('sub1', 'Subcategoria 1') + field('sub2', 'Subcategoria 2') + field('sub3', 'Subcategoria 3')
      + '<label>Unidade de stock<select name="unit">' + units + '</select></label>'
      + '<h2>Preços por supermercado</h2><p class="sub">A quantidade usa a unidade de stock escolhida. Deixa o preço vazio se ainda não o sabes; o link pertence a este supermercado.</p>'
      + offers + '<button id="add-offer" type="button">+ Adicionar supermercado</button>';
  } else if (f.command === 'house.lot') {
    body = (f.mode === 'create' ? field('qty', 'Quantidade', 'inputmode="decimal" required') : '<p>Alterar o destino mantém a quantidade original e os consumos.</p>')
      + field('location', 'Destino do produto', 'required maxlength="80" list="stock-places"')
      + '<datalist id="stock-places"><option>Despensa</option><option>Frigorífico</option><option>Congelador</option></datalist>'
      + field('expiry', 'Validade (opcional)', 'type="date"');
  } else {
    body = '<label>Registo<select name="type"><option value="consume" ' + (f.type === 'consume' ? 'selected' : '') + '>Consumo</option><option value="waste" ' + (f.type === 'waste' ? 'selected' : '') + '>Desperdício</option></select></label>'
      + field('qty', 'Quantidade', 'inputmode="decimal" required') + field('note', 'Motivo (opcional)', 'maxlength="500"');
  }
  return '<button class="back" data-page="casa">‹ Casa</button><h1>' + (f.command === 'house.product' ? 'Produto e preços' : f.command === 'house.lot' ? 'Lote de stock' : 'Registar consumo') + '</h1>'
    + '<form id="house-form">' + body
    + '<p id="house-status" role="status">' + (hr.sequence ? 'Rascunho guardado neste dispositivo.' : 'O preenchimento será guardado neste dispositivo.') + '</p>'
    + (reason ? '<p class="note">' + e(reason) + '</p>' : '')
    + '<button class="primary full" id="save-house" type="button">Guardar</button>'
    + '<button id="ask-discard-house" class="full" type="button">Descartar rascunho</button></form>';
}

function discard() {
  return '<h1>Descartar o preenchimento Casa?</h1><p>Os produtos e o stock guardados mantêm-se.</p>'
    + '<button data-page="casa">Manter rascunho</button><button id="confirm-discard-house">Descartar rascunho</button>';
}

module.exports = { render, form, discard };
