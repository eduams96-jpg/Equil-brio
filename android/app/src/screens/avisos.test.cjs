'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const avisos = require('./avisos.cjs');
const D = require('../../../../equilibrio/dossiers-model.js');
const { ctx, demo, empty, avisos: avisos_fixture } = require('./fixtures.cjs');

const TODAY = '2026-11-05';
const AMOUNT = /\d,\d{2}\s?€/;
const ANY_EURO = /\d[\d\s .,]*\s?€/;
const realCtx = (ledger, hidden = false) => ctx(ledger, { state: { hidden } });

const withNotices = avisos_fixture;
const item = (over) => ({ id: 'x', originKind: 'vehicle', originId: 'v1', title: 'Seguro do carro', date: TODAY, amount: 0, priority: 'medium', detail: 'Renova em breve', targetView: 'casaVehicles', ...over });

test('agrupa por data face a hoje: atrasados, hoje, próximos dias', () => {
  const g = avisos.groups({ rows: [item({ id: 'a', date: '2026-11-01' }), item({ id: 'b', date: TODAY }), item({ id: 'c', date: '2026-11-09' })] }, TODAY);
  assert.deepEqual(g.overdue.map(i => i.id), ['a']);
  assert.deepEqual(g.today.map(i => i.id), ['b']);
  assert.deepEqual(g.soon.map(i => i.id), ['c']);
  const e = avisos.groups({ rows: [] }, TODAY);
  assert.deepEqual(e, { overdue: [], today: [], soon: [] });
});

test('o modelo real dá os três grupos e os títulos pela ordem dos cabeçalhos', () => {
  const html = avisos.render(realCtx(withNotices()));
  const o = html.indexOf('Atrasados'), t = html.indexOf('Hoje'), s = html.indexOf('Próximos dias');
  assert.ok(o > 0 && t > o && s > t, 'cabeçalhos pela ordem');
  assert.ok(html.indexOf('Seguro') > o && html.indexOf('Seguro') < t, 'Seguro em Atrasados');
  assert.ok(html.indexOf('Ginásio') > t && html.indexOf('Ginásio') < s, 'Ginásio em Hoje');
  assert.ok(html.indexOf('Renda') > s, 'Renda em Próximos dias');
  assert.ok(html.includes('Ainda não sincronizado'));
});

test('pendingPayment existente leva a pagar-compromisso; um aviso sem destino não tem botão', () => {
  const d = withNotices();
  const result = D.notices(d, { today: TODAY });
  const rent = result.rows.find(i => i.originId === 'pp-rent');
  assert.deepEqual(avisos.target(rent, d), { page: 'pagar-compromisso', params: { id: 'pp-rent' } });
  assert.equal(avisos.target(rent, empty()) && avisos.target(rent, empty()).page, 'agenda', 'sem o compromisso no ledger cai no planeador');
  const html = avisos.render(realCtx(d));
  assert.match(html, /<button[^>]*data-page="pagar-compromisso"[^>]*data-notice-pay="pp-rent"/);

  const veh = avisos.render(realCtx(d), undefined, { notices: () => ({ rows: [item({ title: 'ITV do carro' })], counts: {} }) });
  assert.ok(veh.includes('ITV do carro'));
  assert.ok(veh.includes('Renova em breve'), 'o detalhe aparece');
  assert.ok(!/<button[^>]*data-page="(?!mais")/.test(veh), "sem botão com destino");
  assert.ok(!/<button[^>]*data-notice/.test(veh));
});

test('target: mapeamento do brief', () => {
  const l = demo();
  assert.equal(avisos.target(item({ targetView: 'casaVehicles' }), l), null);
  assert.equal(avisos.target(item({ targetView: 'casaEquipment' }), l), null);
  assert.equal(avisos.target(item({ targetView: 'casaHousing' }), l), null);
  assert.equal(avisos.target(item({ targetView: 'wealthMoneyHub' }), l), null);
  assert.deepEqual(avisos.target(item({ targetView: 'planner' }), l), { page: 'agenda', params: {} });
  assert.deepEqual(avisos.target(item({ targetView: 'transactions' }), l), { page: 'movimentos', params: {} });
  assert.deepEqual(avisos.target(item({ targetView: 'casaStock' }), l), { page: 'casa', params: { tab: 'stock' } });
  assert.deepEqual(avisos.target(item({ targetView: 'casaPurchases' }), l), { page: 'casa', params: { tab: 'historico' } });
});

test('cores por prioridade', () => {
  const html = avisos.render(realCtx(demo()), undefined, { notices: () => ({ rows: [item({ id: 'h', priority: 'high' }), item({ id: 'm', priority: 'medium' }), item({ id: 'l', priority: 'low' })], counts: {} }) });
  for (const p of ['high', 'medium', 'low']) assert.match(html, new RegExp('class="aviso is-' + p + '"'), p);
});

test('ledger vazio mostra «Sem avisos»', () => {
  const html = avisos.render(realCtx(empty()));
  assert.ok(html.includes('Sem avisos'));
  assert.ok(!html.includes('Atrasados'));
});

test('valores ocultos não deixam montantes, nem no detalhe', () => {
  const d = withNotices();
  const shown = avisos.render(realCtx(d));
  assert.match(shown, AMOUNT, 'o teste tem dentes: com valores visíveis há montantes');
  const detailAmount = { notices: () => ({ rows: [item({ detail: 'Falta liquidar 12.34 €', amount: 12.34 })], counts: {} }) };
  assert.match(avisos.render(realCtx(d), undefined, detailAmount), ANY_EURO);
  for (const make of [() => d, () => demo()]) {
    const hidden = avisos.render(realCtx(make(), true));
    assert.doesNotMatch(hidden, AMOUNT);
    assert.ok(hidden.includes('••••'));
  }
  assert.doesNotMatch(avisos.render(realCtx(d, true), undefined, detailAmount), ANY_EURO);
});

test('erro do modelo mostra o cartão de erro', () => {
  const html = avisos.render(realCtx(demo()), undefined, { notices: () => { throw Error('falhou'); } });
  assert.match(html, /cs-error/);
  assert.ok(html.includes('falhou'));
});

test('sem style=""', () => {
  assert.ok(!/ style=/.test(avisos.render(realCtx(withNotices()))));
});
