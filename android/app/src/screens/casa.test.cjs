'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const casa = require('./casa.cjs');
const H = require('../../../shared/house.cjs');
const P = require('../../../shared/protocol.cjs');
const Forms = require('../../../shared/form-drafts.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const realCtx = (ledger, hidden = false) => ctx(ledger, { state: { ...P.offlineFixture(), hidden } });

test('Casa não atira com dados vazios e de demonstração em nenhum separador', () => {
  for (const make of [empty, demo]) {
    const c = realCtx(make());
    for (const tab of ['compras', 'produtos', 'stock']) assert.ok(casa.render(c, { tab }).includes('Casa'));
    assert.ok(casa.render(c).includes('Casa'));
    assert.ok(casa.discard().includes('id="confirm-discard-house"'));
  }
});

test('Casa tem as pills Lista de compras, Produtos e Stock e marca a ativa', () => {
  const html = casa.render(realCtx(demo()), { tab: 'compras' });
  assert.match(html, /<button[^>]*data-page="compras"[^>]*aria-pressed="true"[^>]*>Lista de compras/);
  assert.match(html, /data-house-tab="produtos"[^>]*aria-pressed="false"/);
  assert.match(html, /data-house-tab="stock"[^>]*aria-pressed="false"/);
  assert.ok(!html.includes('data-house-tab="lista"') && !html.includes('data-shopping='));
  const prod = casa.render(realCtx(demo()), { tab: 'produtos' });
  assert.match(prod, /data-house-tab="produtos"[^>]*aria-pressed="true"/);
  assert.match(prod, /data-page="compras"[^>]*aria-pressed="false"/);
});

test('Produtos e stock listam o catálogo do demo', () => {
  const c = realCtx(demo());
  const prod = casa.render(c, { tab: 'produtos' });
  assert.ok(prod.includes('id="new-product"') && prod.includes('Arroz agulha') && prod.includes('data-product="'));
  const stock = casa.render(c, { tab: 'stock' });
  assert.ok(stock.includes('Despensa') && stock.includes('data-lot="'));
  assert.ok(casa.render(realCtx(empty()), { tab: 'produtos' }).includes('Ainda sem produtos'));
});

test('Produto e lote mostram preços, lotes e ações; ids em falta são tratados', () => {
  const c = realCtx(demo());
  const cat = H.Casa.state(c.ledger);
  const p = cat.catalog[0], lot = cat.stock[0];
  const prod = casa.render(c, { tab: 'produto', id: p.id });
  for (const s of ['Arroz agulha', 'data-edit-product="' + p.id + '"', 'data-new-lot="' + p.id + '"', 'data-lot="' + lot.id + '"', 'Continente', 'data-house-tab="produtos"']) assert.ok(prod.includes(s), s);
  const l = casa.render(c, { tab: 'lote', id: lot.id });
  for (const s of ['data-edit-lot="' + lot.id + '"', 'data-consume-lot="' + lot.id + '"', 'data-product="' + p.id + '"']) assert.ok(l.includes(s), s);
  assert.ok(casa.render(c, { tab: 'produto', id: 'nao' }).includes('Produto indisponível'));
  assert.ok(casa.render(c, { tab: 'lote', id: 'nao' }).includes('Lote indisponível'));
});

test('Casa com valores ocultos não mostra montantes (e mostra-os quando visíveis)', () => {
  const ledger = demo(), id = H.Casa.state(ledger).catalog[0].id;
  assert.match(casa.render(realCtx(ledger), { tab: 'produto', id }), AMOUNT);
  assert.doesNotMatch(casa.render(realCtx(ledger, true), { tab: 'produto', id }), AMOUNT);
});

test('Formulários de produto, lote e consumo têm os ids e names usados pelos manipuladores', () => {
  const c = realCtx(demo());
  const base = { id: 'h1', mode: 'create', seed: 's', changedOn: '2026-11-05' };
  const rec = f => Forms.create(c.state, f, 'house', 0);
  const product = { ...base, command: 'house.product', name: 'Leite', brand: '', category: 'Alimentação', sub1: '', sub2: '', sub3: '', unit: 'un', url: '', offers: [{ storeName: 'Continente', packageQty: '1', price: '0,89' }] };
  let html = casa.form(c, { form: product, record: rec(product) });
  for (const s of ['id="house-form"', 'id="save-house"', 'id="ask-discard-house"', 'id="house-status"', 'name="name"', 'name="unit"', 'name="offer-0-storeName"', 'data-remove-offer="0"', 'id="add-offer"', 'Produto e preços']) assert.ok(html.includes(s), s);
  const lot = { ...base, command: 'house.lot', catalogId: 'p', qty: '1', location: 'Despensa', expiry: '', opened: false };
  html = casa.form(c, { form: lot, record: rec(lot) });
  for (const s of ['name="qty"', 'name="location"', 'id="stock-places"', 'name="expiry"', 'Lote de stock']) assert.ok(html.includes(s), s);
  const consume = { ...base, command: 'house.consume', qty: '', type: 'consume', note: '' };
  html = casa.form(c, { form: consume, record: rec(consume) });
  for (const s of ['name="type"', 'name="note"', 'Registar consumo']) assert.ok(html.includes(s), s);
  assert.ok(casa.form(c, { form: null, record: null }).includes('Formulário indisponível'));
});

test('Banner de rascunho Casa aparece com houseDraft', () => {
  const c = ctx(demo(), { state: { ...P.offlineFixture(), hidden: false, houseDraft: { token: 't' } } });
  assert.ok(casa.render(c, { tab: 'produtos' }).includes('id="resume-house"'));
});
