'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const movimentos = require('./movimentos.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');
const D = require('../../../shared/drafts.cjs');
const P = require('../../../shared/protocol.cjs');

// Estado real (com contexto de ligação) para o rascunho; o razão vem do demo().
function formCtx(ledger) {
  return ctx(ledger, { state: { ...P.offlineFixture(), hidden: false } });
}
function record(c, draft, sequence) {
  return { ...D.create(c.state, draft, null, ''), sequence };
}

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




test('Detalhe mostra o movimento e as ações de editar e eliminar', () => {
  const html = movimentos.detail(ctx(demo()), { movementId: 'm-super', returnPage: 'movimentos' });
  assert.ok(html.includes('Compras no supermercado'));
  assert.ok(html.includes('id="edit-movement"') && html.includes('id="ask-delete"'));
  assert.ok(html.includes('data-page="movimentos"'));
  assert.match(html, /63,20/);
});

test('Detalhe com valores ocultos não mostra montantes e movimento em falta é tratado', () => {
  const hiddenHtml = movimentos.detail(ctx(demo(), { state: { hidden: true } }), { movementId: 'm-super' });
  assert.doesNotMatch(hiddenHtml, /d,d{2}s?€/);
  assert.ok(movimentos.detail(ctx(demo()), { movementId: 'nao-existe' }).includes('já não existe'));
});

function draftFor(ledger, id) {
  const base = { id: 'novo-1', type: 'expense', amount: '', description: '', accountId: ledger.accounts[0].id, targetId: ledger.accounts[1].id, category: '', subcategory: '', categoryDetail: '', categorySubdetail: '', note: '', beneficiary: '', noteColor: '', expenseNature: 'variable', date: '2026-11-05', command: 'new' };
  return base;
}

test('Formulário novo tem os campos e ids usados pelos manipuladores', () => {
  const ledger = demo();
  const c = formCtx(ledger), d = draftFor(ledger);
  const html = movimentos.form(c, { draft: d, draftRecord: record(c, d, 0), resolvingId: null });
  for (const id of ['id="movement"', 'id="movement-type"', 'id="save"', 'id="draft-status"', 'id="target-field"', 'id="category-field"']) assert.ok(html.includes(id), id);
  assert.ok(html.includes('Novo movimento') && html.includes('name="amount"') && html.includes('name="target"'));
  assert.ok(html.includes('value="transfer"'));
});

test('Formulário de edição mostra os dados do movimento e limita os tipos', () => {
  const ledger = demo();
  const d = { ...draftFor(ledger), command: 'movement.update', amount: '63,20', description: 'Compras no supermercado', category: 'Alimentação' };
  const c = formCtx(ledger);
  const html = movimentos.form(c, { draft: d, draftRecord: record(c, d, 1), resolvingId: null });
  assert.ok(html.includes('Editar movimento'));
  assert.ok(html.includes('value="63,20"') && html.includes('Compras no supermercado'));
  assert.ok(!html.includes('value="transfer"'));
  assert.ok(html.includes('Rascunho guardado'));
});
