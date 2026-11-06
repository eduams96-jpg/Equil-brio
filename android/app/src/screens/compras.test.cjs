'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const compras = require('./compras.cjs');
const H = require('../../../shared/house.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const TODO = { status: 'todo', storeId: '', query: '', inStore: false };
const view = (ledger, f = {}) => compras.view(ledger, { ...TODO, ...f });
const storeOf = (ledger, name) => H.Casa.state(ledger).stores.find(s => s.name === name).id;
const queued = ledger => H.Casa.state(ledger).shopping.find(s => s.catalogId && !s.done && !s.notFound);

test('view(todo) exclui os itens feitos e view(cart) só mostra os feitos', () => {
  const ledger = demo();
  const todo = view(ledger, { status: 'todo' });
  assert.ok(todo.rows.length > 0);
  assert.ok(todo.rows.every(r => r.done === false));
  assert.ok(!todo.rows.some(r => r.name === 'Pão'));
  const cart = view(ledger, { status: 'cart' });
  assert.deepEqual(cart.rows.map(r => r.name).sort(), ['Arroz agulha', 'Pão']);
  assert.equal(view(ledger, { status: 'all' }).rows.length, todo.rows.length + cart.rows.length);
});

test('view filtra por pesquisa e, com storeId, só mostra os itens dessa loja', () => {
  const ledger = demo();
  assert.deepEqual(view(ledger, { status: 'all', query: 'detergente' }).rows.map(r => r.name), ['Detergente']);
  assert.deepEqual(view(ledger, { status: 'all', query: 'PAO' }).rows.map(r => r.name), ['Pão']);
  const pingo = storeOf(ledger, 'Pingo Doce');
  const inStore = view(ledger, { status: 'all', storeId: pingo, inStore: true });
  assert.ok(inStore.rows.length > 0);
  assert.ok(inStore.rows.every(r => r.storeName === 'Pingo Doce'));
  const all = view(ledger, { status: 'all', inStore: true });
  assert.ok(all.rows.length > inStore.rows.length);
  assert.ok(all.rows.some(r => r.storeName === 'Continente'));
  assert.deepEqual(view(ledger, { status: 'all', storeId: pingo }).rows, inStore.rows);
});

test('estimated soma os totais de todos os itens não «não encontrados» e inCart os dos feitos', () => {
  const ledger = demo();
  const v = view(ledger, { status: 'all' });
  const priced = v.rows.filter(r => r.total != null);
  assert.ok(priced.length >= 3);
  const notFound = v.rows.filter(r => r.notFound);
  assert.equal(notFound.length, 1);
  assert.ok(notFound[0].total != null, 'o item não encontrado tem total mas fica fora do estimado');
  const sum = list => Math.round(list.reduce((s, r) => s + r.total * 100, 0)) / 100;
  assert.equal(v.estimated, sum(priced.filter(r => !r.notFound)));
  assert.equal(v.inCart, sum(priced.filter(r => r.done)));
  assert.ok(v.estimated > v.inCart && v.inCart > 0);
  // Os totais não dependem do filtro de estado.
  assert.equal(view(ledger, { status: 'todo' }).estimated, v.estimated);
});

test('o total de uma linha vem de embalagens × preço e respeita purchaseOverride', () => {
  const ledger = demo();
  const row = queued(ledger);
  const before = view(ledger, { status: 'all' }).rows.find(r => r.id === row.id);
  assert.equal(before.total, Math.round(Math.ceil(row.requestedQty) * before.unitPrice * 100) / 100);
  ledger.casa.shopping.find(s => s.id === row.id).purchaseOverride = { packages: 5, price: 2, packageQty: 1 };
  const after = view(ledger, { status: 'all' }).rows.find(r => r.id === row.id);
  assert.equal(after.total, 10);
  assert.equal(after.unitPrice, 2);
});

test('sem casa ou sem artigos a lista fica vazia, sem lançar', () => {
  const noCasa = empty();
  delete noCasa.casa;
  for (const ledger of [noCasa, empty()]) {
    const v = view(ledger);
    assert.deepEqual(v.rows, []);
    assert.equal(v.estimated, 0);
    assert.equal(v.inCart, 0);
    assert.deepEqual(v.stores, []);
    assert.ok(compras.render(ctx(ledger), TODO).includes('A lista está vazia'));
  }
});

test('render mostra linhas, caixa com valor inverso, rodapé e pills de estado', () => {
  const html = compras.render(ctx(demo()), { ...TODO, status: 'all' });
  assert.match(html, /<h1>Lista de compras<\/h1>/);
  assert.ok(html.includes('Leite') && html.includes('Detergente') && html.includes('Pão'));
  assert.match(html, /data-shopping-done="sh-1"[^>]*data-next="true"[^>]*aria-checked="false"/);
  assert.match(html, /data-shopping-done="sh-2"[^>]*data-next="false"[^>]*aria-checked="true"/);
  assert.match(html, /data-shopping-open="sh-1"/);
  assert.match(html, /data-pill-shopstatus="todo"/);
  assert.match(html, /data-pill-shopstatus="cart"/);
  assert.ok(html.includes('Estimado') && html.includes('No carrinho'));
  assert.match(html, /data-page="casa"/);
  assert.match(html, /id="shop-add"/);
  assert.ok(!/ on\w+=|<script|style=/.test(html));
});

test('o estado por omissão vem dos filtros e marca a pill ativa', () => {
  const html = compras.render(ctx(demo()), TODO);
  assert.match(html, /data-pill-shopstatus="todo"[^>]*aria-pressed="true"/);
  assert.match(html, /data-pill-shopstatus="all"[^>]*aria-pressed="false"/);
  assert.ok(!html.includes('data-shopping-open="sh-2"'));
});

test('modo «Na loja» mostra as lojas como pills e marca a escolhida', () => {
  const ledger = demo();
  const pingo = storeOf(ledger, 'Pingo Doce');
  const html = compras.render(ctx(ledger), { ...TODO, inStore: true, storeId: pingo });
  assert.match(html, new RegExp('data-pill-shopstore="' + pingo + '"[^>]*aria-pressed="true"'));
  assert.match(html, /data-pill-shopstore=""/);
  assert.match(html, /id="shop-instore"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(compras.render(ctx(ledger), TODO), /data-pill-shopstore=/);
});

test('com valores ocultos não há montantes (e com visíveis há)', () => {
  const ledger = demo();
  const f = { ...TODO, status: 'all' };
  const shown = compras.render(ctx(ledger, { state: { hidden: false } }), f);
  const hidden = compras.render(ctx(ledger, { state: { hidden: true } }), f);
  assert.match(shown, AMOUNT);
  assert.doesNotMatch(hidden, AMOUNT);
  assert.ok(hidden.includes('•••• €'));
  const id = queued(ledger).id;
  assert.match(compras.item(ctx(ledger), { id }), AMOUNT);
  assert.doesNotMatch(compras.item(ctx(ledger, { state: { hidden: true } }), { id }), AMOUNT);
  assert.match(compras.add(ctx(ledger), { query: 'arroz' }), AMOUNT);
  assert.doesNotMatch(compras.add(ctx(ledger, { state: { hidden: true } }), { query: 'arroz' }), AMOUNT);
});

test('os nomes são escapados', () => {
  const ledger = demo();
  ledger.casa.shopping.push({ id: 'sh-x', name: '<img src=x onerror=alert(1)>', qty: '"1"', done: false });
  const html = compras.render(ctx(ledger), TODO);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('folha «Conferir artigo» tem embalagens, preço, guardar em, validade e nota', () => {
  const ledger = demo();
  const html = compras.item(ctx(ledger), { id: queued(ledger).id });
  assert.match(html, /<h1>Conferir artigo<\/h1>/);
  for (const name of ['packages', 'price', 'location', 'expiry', 'note']) assert.match(html, new RegExp('name="' + name + '"'));
  assert.match(html, /id="shop-item-save"/);
  assert.match(html, /id="shop-item-remove"/);
  assert.match(html, /data-page="compras"/);
  assert.ok(!/name="packages"/.test(compras.item(ctx(ledger), { id: 'sh-1' })), 'artigo livre não tem embalagens');
  assert.ok(compras.item(ctx(ledger), { id: 'nope' }).includes('Artigo indisponível'));
});

test('folha «Acrescentar» pesquisa o catálogo (queue) e aceita nome livre (add)', () => {
  const html = compras.add(ctx(demo()), { query: 'arroz' });
  assert.match(html, /<h1>Acrescentar<\/h1>/);
  assert.match(html, /data-queue-catalog="[^"]+"[^>]*data-queue-store="[^"]+"/);
  assert.ok(html.includes('Continente') && html.includes('Pingo Doce'));
  assert.match(html, /id="shop-add-name"/);
  assert.match(html, /id="shop-add-free"/);
  assert.match(html, /id="shop-add-qty"/);
  const none = compras.add(ctx(demo()), { query: 'zzzz' });
  assert.ok(!none.includes('data-queue-catalog'));
  assert.ok(none.includes('Nenhum produto'));
});

test('payloads das operações são os aceites por house.shopping', () => {
  assert.deepEqual(compras.setDone(true), { operation: 'set-done', done: true });
  assert.deepEqual(compras.queueValues({ catalogId: 'c', storeId: 's', qty: '2,5' }), { operation: 'queue', catalogId: 'c', storeId: 's', requestedQty: 2.5 });
  assert.deepEqual(compras.addValues({ name: ' Sal ', qty: '2' }), { operation: 'add', name: 'Sal', qty: '2' });
  assert.throws(() => compras.addValues({ name: ' ', qty: '1' }), /nome/);
  assert.throws(() => compras.queueValues({ catalogId: 'c', storeId: 's', qty: '0' }), /quantidade/);
  assert.deepEqual(compras.updateValues({ packages: '2', price: '1,5', location: 'Despensa', expiry: '2027-01-01', note: 'x' }, true),
    { operation: 'update', purchaseOverride: { packages: 2, price: 1.5 }, location: 'Despensa', expiry: '2027-01-01', note: 'x' });
  assert.equal(compras.updateValues({ packages: '', price: '', location: '', expiry: '', note: '' }, false).purchaseOverride, undefined);
  assert.throws(() => compras.updateValues({ packages: '0', price: '1', location: '', expiry: '', note: '' }, true), /embalagens/);
});

test('offerDefaults ignora o ajuste guardado e é nulo para artigos livres', () => {
  const ledger = demo();
  const row = queued(ledger);
  assert.deepEqual(compras.offerDefaults(ledger, row.id), { packages: 3, price: 1.29 });
  ledger.casa.shopping.find(s => s.id === row.id).purchaseOverride = { packages: 5, price: 2, packageQty: 1 };
  assert.deepEqual(compras.offerDefaults(ledger, row.id), { packages: 3, price: 1.29 });
  assert.equal(compras.offerDefaults(ledger, 'sh-1'), null);
  assert.equal(compras.updateValues({ packages: '3', price: '1,29', location: '', expiry: '', note: '' }, true, compras.offerDefaults(ledger, row.id)).purchaseOverride, null);
  assert.deepEqual(compras.updateValues({ packages: '4', price: '1,29', location: '', expiry: '', note: '' }, true, compras.offerDefaults(ledger, row.id)).purchaseOverride, { packages: 4, price: 1.29 });
});

test('isDirty compara os campos iniciais e ignora espaços nas pontas', () => {
  const ledger = demo();
  const row = queued(ledger);
  const q = compras.pricing(ledger, H.Casa.state(ledger))(row.id);
  const initial = compras.initial(row, q);
  assert.equal(compras.isDirty(initial, { ...initial }), false);
  assert.equal(compras.isDirty(initial, { ...initial, note: '  ' }), false);
  assert.equal(compras.isDirty(initial, { ...initial, packages: ' 3 ' }), false);
  assert.equal(compras.isDirty(initial, { ...initial, note: 'Integral' }), true);
  assert.equal(compras.isDirty(initial, { ...initial, packages: '4' }), true);
  assert.equal(compras.isDirty(initial, { ...initial, expiry: '2027-01-01' }), true);
  assert.equal(compras.isDirty({ qty: '1', name: '' }, { qty: '1', name: '' }), false);
  assert.equal(compras.isDirty({ qty: '1', name: '' }, { qty: '2', name: '' }), true);
  assert.equal(compras.isDirty({ qty: '1', name: '' }, { qty: '1', name: 'Sal' }), true);
  assert.equal(compras.isDirty({ qty: '1' }, null), true);
  assert.equal(compras.isDirty(null, { qty: '9' }), false);
});

test('o rodapé é um grupo etiquetado, não um estado', () => {
  const html = compras.render(ctx(demo()), TODO);
  assert.match(html, /class="shop-footer" role="group" aria-label="[^"]+"/);
  assert.doesNotMatch(html, /role="status"/);
});
