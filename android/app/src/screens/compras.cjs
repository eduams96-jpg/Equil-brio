'use strict';
const kit = require('../ui/kit.cjs');
const { icon } = require('../ui/icons.cjs');
const H = require('../../../shared/house.cjs');

const STATUSES = [['todo', 'Por comprar'], ['cart', 'No carrinho'], ['all', 'Todos']];
const PLACES = ['Despensa', 'Frigorífico', 'Congelador'];
const NO_FILTERS = { status: 'todo', storeId: '', query: '', inStore: false };

const cents = x => Math.round(x * 100);
const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = s => Number(String(s == null ? '' : s).trim().replace(',', '.'));

// Preço de uma linha ligada ao catálogo, calculado pela mesma regra do fecho da compra
// (Casa.quote exige o artigo marcado, por isso a cotação usa uma cópia com todos marcados).
function pricing(ledger, c) {
  const copy = { ...ledger, casa: { ...ledger.casa, shopping: c.shopping.map(s => ({ ...s, done: true, notFound: false })) } };
  return id => {
    try {
      const item = H.Casa.quote(copy, [id])[0].items[0];
      return { unitPrice: item.price, total: item.total, packages: item.packages, packageQty: item.packageQty };
    } catch {
      return null;
    }
  };
}

function filtersOf(f) {
  return { ...NO_FILTERS, ...(f || {}) };
}

// Pura: linhas filtradas, totais da lista inteira e lojas disponíveis.
function view(ledger, filters) {
  const f = filtersOf(filters);
  const c = H.Casa.state(ledger || {});
  const price = pricing(ledger || {}, c);
  const storeName = id => (c.stores.find(s => s.id === id) || {}).name || '';
  const all = c.shopping.map(s => {
    const p = s.catalogId ? price(s.id) : null;
    return { id: s.id, name: s.name, qty: s.qty, storeId: s.storeId || '', storeName: storeName(s.storeId), unitPrice: p ? p.unitPrice : null, total: p ? p.total : null, done: s.done === true, notFound: s.notFound === true };
  });
  const sum = list => list.reduce((t, r) => t + (r.total == null ? 0 : cents(r.total)), 0) / 100;
  const query = fold(f.query).trim();
  const rows = all.filter(r => (f.status === 'all' || (f.status === 'cart') === r.done)
    && (!f.storeId || r.storeId === f.storeId)
    && (!query || fold(r.name).includes(query)));
  return {
    rows,
    estimated: sum(all.filter(r => !r.notFound)),
    inCart: sum(all.filter(r => r.done)),
    stores: c.stores.filter(s => !s.archived).map(s => ({ id: s.id, name: s.name })),
    counts: { todo: all.filter(r => !r.done).length, cart: all.filter(r => r.done).length, all: all.length },
  };
}

function amount(ctx, value) {
  return value == null ? '' : kit.money(cents(value), ctx.state.hidden);
}

function row(ctx, r) {
  const e = kit.escape;
  const detail = [r.qty, r.storeName, r.notFound ? 'Não encontrado' : ''].filter(Boolean).map(e).join(' · ');
  return '<div class="shop-row' + (r.done ? ' is-done' : '') + (r.notFound ? ' is-missing' : '') + '">'
    + '<button type="button" class="shop-check" data-shopping-done="' + e(r.id) + '" data-next="' + !r.done
    + '" role="checkbox" aria-checked="' + r.done + '" aria-label="' + e((r.done ? 'Desmarcar ' : 'Marcar como comprado: ') + r.name) + '">' + (r.done ? icon('check') : '') + '</button>'
    + '<button type="button" class="shop-name" data-shopping-open="' + e(r.id) + '"><strong>' + e(r.name) + '</strong><small>' + detail + '</small></button>'
    + '<span class="amount">' + amount(ctx, r.total) + '</span></div>';
}

// Ecrã «Lista de compras». filters: {status, storeId, query, inStore}, geridos por main.js.
function render(ctx, filters) {
  const f = filtersOf(filters);
  const v = view(ctx.ledger, f);
  const opts = STATUSES.map(([value, label]) => ({ value, label, count: v.counts[value] }));
  const stores = [{ value: '', label: 'Todas' }, ...v.stores.map(s => ({ value: s.id, label: s.name }))];
  const empty = v.counts.all
    ? 'Nenhum artigo nesta vista. Altera a pesquisa ou o estado.'
    : 'A lista está vazia. Usa «Acrescentar» para juntar o primeiro artigo.';
  return '<button type="button" class="back" data-page="casa">‹ Casa</button><h1>Lista de compras</h1>'
    + '<p class="sub">' + v.counts.todo + (v.counts.todo === 1 ? ' artigo por comprar' : ' artigos por comprar') + '</p>'
    + '<div class="shop-actions"><button type="button" class="primary" id="shop-add">' + icon('plus') + ' Acrescentar</button>'
    + '<button type="button" id="shop-instore" aria-pressed="' + f.inStore + '">' + icon('cart') + ' Estou na loja</button></div>'
    + kit.search('shop-search', f.query, 'Pesquisar na lista')
    + kit.pills('shopstatus', opts, f.status)
    + (f.inStore ? kit.pills('shopstore', stores, f.storeId) : '')
    + '<div class="shop-list" id="shop-list">' + (v.rows.map(r => row(ctx, r)).join('') || '<p class="empty">' + empty + '</p>') + '</div>'
    + '<div class="shop-footer" role="status"><div><small>Estimado</small><strong>' + amount(ctx, v.estimated) + '</strong></div>'
    + '<div><small>No carrinho</small><strong>' + amount(ctx, v.inCart) + '</strong></div></div>';
}

// Folha «Conferir artigo». view: {id, form?}; form substitui os valores iniciais (rascunho de main.js).
function item(ctx, view = {}) {
  const e = kit.escape;
  const c = H.Casa.state(ctx.ledger);
  const s = c.shopping.find(x => x.id === view.id);
  const back = '<button type="button" class="back" data-page="compras">‹ Lista de compras</button>';
  if (!s) return back + '<h1>Artigo indisponível</h1><p class="sub">Este artigo já não está na lista.</p>';
  const q = s.catalogId ? pricing(ctx.ledger, c)(s.id) : null;
  const form = { ...initial(s, q), ...(view.form || {}) };
  const product = c.catalog.find(p => p.id === s.catalogId);
  const store = c.stores.find(x => x.id === s.storeId);
  const field = (name, label, extra = '', value = form[name]) => '<label>' + label + '<input name="' + name + '" value="' + e(value) + '" ' + extra + '></label>';
  const offer = q
    ? field('packages', 'Embalagens', 'inputmode="numeric" autocomplete="off"') + field('price', 'Preço por embalagem (€)', 'inputmode="decimal" autocomplete="off"')
      + '<p class="sub">' + e(q.packageQty + ' ' + product.unit) + ' por embalagem · total ' + amount(ctx, q.total) + '</p>'
    : '';
  return back + '<h1>Conferir artigo</h1>'
    + '<section class="review-card"><h2>' + e(s.name) + '</h2><p>' + e(s.qty) + (store ? ' · ' + e(store.name) : '') + '</p></section>'
    + '<form id="shop-item-form" data-shopping-id="' + e(s.id) + '">' + offer
    + field('location', 'Guardar em', 'maxlength="80" list="shop-places" autocomplete="off"')
    + '<datalist id="shop-places">' + PLACES.map(p => '<option>' + p + '</option>').join('') + '</datalist>'
    + field('expiry', 'Validade (opcional)', 'type="date"')
    + '<label>Nota<textarea name="note" maxlength="500" rows="3">' + e(form.note) + '</textarea></label>'
    + '<button type="button" class="primary full" id="shop-item-save">Guardar</button>'
    + '<button type="button" class="full" id="shop-item-remove">Retirar da lista</button></form>';
}

// Embalagens e preço que a oferta da loja dá (sem o ajuste guardado), para saber se o ajuste mudou.
function offerDefaults(ledger, id) {
  const c = H.Casa.state(ledger), s = c.shopping.find(x => x.id === id);
  const p = s && c.catalog.find(x => x.id === s.catalogId), offer = p && p.offers[s.storeId];
  if (!offer) return null;
  return { packages: Math.ceil(Math.round(s.requestedQty * 1000) / Math.round(offer.packageQty * 1000)), price: offer.price };
}

function initial(s, q) {
  return {
    packages: q ? String(q.packages) : '', price: q ? String(q.unitPrice).replace('.', ',') : '',
    location: s.location || '', expiry: s.expiry || '', note: s.note || '',
  };
}

// Folha «Acrescentar». view: {query, qty, name}.
function add(ctx, view = {}) {
  const e = kit.escape;
  const c = H.Casa.state(ctx.ledger);
  const query = fold(view.query).trim();
  const results = [];
  for (const p of c.catalog.filter(x => !x.archived && fold(x.name + ' ' + (x.brand || '')).includes(query))) {
    for (const s of c.stores.filter(x => !x.archived && p.offers[x.id])) results.push({ p, s, offer: p.offers[s.id] });
  }
  const list = results.slice(0, 12).map(({ p, s, offer }) => '<button type="button" class="row movement-row" data-queue-catalog="' + e(p.id) + '" data-queue-store="' + e(s.id) + '"><div><strong>' + e(p.name) + '</strong>'
    + '<small>' + e(s.name) + ' · ' + (offer.price > 0 ? kit.money(cents(offer.price), ctx.state.hidden) : 'Sem preço') + ' · ' + e(offer.packageQty + ' ' + p.unit) + '</small></div><span>' + icon('plus') + '</span></button>').join('');
  return '<button type="button" class="back" data-page="compras">‹ Lista de compras</button><h1>Acrescentar</h1>'
    + '<label>Quantidade<input id="shop-add-qty" inputmode="decimal" autocomplete="off" value="' + e(view.qty == null ? '1' : view.qty) + '"></label>'
    + '<h2>Do catálogo</h2><p class="sub">Só aparecem produtos com preço numa loja.</p>'
    + kit.search('shop-add-query', view.query || '', 'Pesquisar produtos')
    + (list || '<p class="empty">Nenhum produto encontrado no catálogo.</p>')
    + '<h2>Artigo livre</h2><label>Nome<input id="shop-add-name" maxlength="160" autocomplete="off" value="' + e(view.name || '') + '"></label>'
    + '<button type="button" class="primary full" id="shop-add-free">Acrescentar à lista</button>';
}

// Valores enviados em house.shopping (aceites por shared/house.cjs).
function setDone(done) {
  return { operation: 'set-done', done: done === true };
}

function queueValues({ catalogId, storeId, qty }) {
  const requestedQty = num(qty);
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) throw Error('Indica uma quantidade positiva.');
  return { operation: 'queue', catalogId, storeId, requestedQty };
}

function addValues({ name, qty }) {
  const n = String(name == null ? '' : name).trim();
  if (!n) throw Error('Indica o nome do artigo.');
  return { operation: 'add', name: n, qty: String(qty == null ? '' : qty).trim() };
}

// defaults: valores calculados pela oferta; se não foram alterados, retira-se o ajuste guardado.
function updateValues(form, hasOffer, defaults) {
  const out = { operation: 'update' };
  if (hasOffer) {
    const packages = num(form.packages), price = num(form.price);
    if (!Number.isSafeInteger(packages) || packages < 1 || !Number.isFinite(price) || price <= 0 || String(form.packages).trim() === '') throw Error('Confirma embalagens (inteiro ≥ 1) e preço positivo.');
    out.purchaseOverride = defaults && packages === defaults.packages && price === defaults.price ? null : { packages, price };
  }
  return Object.assign(out, { location: String(form.location || '').trim(), expiry: String(form.expiry || '').trim(), note: String(form.note || '').trim() });
}

module.exports = { view, render, item, add, initial, offerDefaults, pricing, setDone, queueValues, addValues, updateValues, NO_FILTERS };
