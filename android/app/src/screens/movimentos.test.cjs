'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const movimentos = require('./movimentos.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const NONE = { query: '', period: '', accountId: '', type: '', status: '' };

test('Movimentos sem filtro lista todos os movimentos do demo', () => {
  const html = movimentos.render(ctx(demo()), { filters: NONE, visibleLimit: 40 });
  assert.equal((html.match(/movement-row/g) || []).length, 5);
});

test('Movimentos com filtro de tipo despesa só lista despesas', () => {
  const html = movimentos.render(ctx(demo()), { filters: { ...NONE, type: 'expense' }, visibleLimit: 40 });
  assert.equal((html.match(/movement-row/g) || []).length, 3);
  assert.ok(html.includes('Café'));
  assert.ok(!html.includes('Ordenado'));
  assert.ok(!html.includes('Levantamento'));
  assert.match(html, /data-pill-type="expense" aria-pressed="true"/);
});

test('Movimentos usa pills para tipo e estado em vez de select', () => {
  const html = movimentos.render(ctx(demo()), { filters: NONE, visibleLimit: 40 });
  assert.ok(html.includes('data-pill-type="income"'));
  assert.ok(html.includes('data-pill-status="pending"'));
  assert.ok(!html.includes('id="filter-type"'));
  assert.ok(!html.includes('id="filter-status"'));
});

test('Movimentos vazio não atira e avisa', () => {
  const html = movimentos.render(ctx(empty()), { filters: NONE, visibleLimit: 40 });
  assert.ok(html.includes('Ainda não existem movimentos'));
});

test('Movimentos respeita o limite visível e oferece «Mostrar mais»', () => {
  const html = movimentos.render(ctx(demo()), { filters: NONE, visibleLimit: 2 });
  assert.equal((html.match(/movement-row/g) || []).length, 2);
  assert.ok(html.includes('id="show-more"'));
});

test('Movimentos com valores ocultos não mostra montantes', () => {
  const html = movimentos.render(ctx(demo(), { state: { hidden: true } }), { filters: NONE, visibleLimit: 40 });
  assert.doesNotMatch(html, /\d,\d{2}\s?€/);
});
