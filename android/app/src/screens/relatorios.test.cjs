'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const relatorios = require('./relatorios.cjs');
const R = require('../../../../equilibrio/reports-model.js');
const { ctx, demo, empty } = require('./fixtures.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const NOV = { year: '2026', period: 'm11', account: '' };
const realCtx = (ledger, hidden = false) => ctx(ledger, { state: { hidden } });

test('view(demo) coincide com R.analyse e o período anterior é o mês anterior', () => {
  const ledger = demo();
  const v = relatorios.view(ledger, { year: '2026', period: 'm10' });
  assert.deepEqual(v.current, R.analyse(ledger, { year: '2026', period: 'm10' }));
  assert.deepEqual(v.previous, R.analyse(ledger, { year: '2026', period: 'm09' }));
});

test('o anterior de m01 é m12 do ano anterior; de q1 é q4; do ano é o ano anterior', () => {
  const calls = [];
  const spy = (ledger, sel) => { calls.push(sel); return R.analyse(ledger, sel); };
  relatorios.view(demo(), { year: '2026', period: 'm01', account: '' }, spy);
  relatorios.view(demo(), { year: '2026', period: 'q1', account: '' }, spy);
  relatorios.view(demo(), { year: '2026', period: 'year', account: '' }, spy);
  assert.deepEqual(calls.filter((_, i) => i % 2 === 1).map(s => s.year + s.period), ['2025m12', '2025q4', '2025year']);
});

test('shift passa as fronteiras do ano nos dois sentidos', () => {
  const s = (year, period) => ({ year, period, account: '' });
  assert.deepEqual(relatorios.shift(s('2026', 'm01'), -1), s('2025', 'm12'));
  assert.deepEqual(relatorios.shift(s('2026', 'm12'), 1), s('2027', 'm01'));
  assert.deepEqual(relatorios.shift(s('2026', 'q1'), -1), s('2025', 'q4'));
  assert.deepEqual(relatorios.shift(s('2026', 'q4'), 1), s('2027', 'q1'));
  assert.deepEqual(relatorios.shift(s('2026', 'year'), -1), s('2025', 'year'));
  assert.equal(relatorios.shift({ ...s('2026', 'm05'), account: '7' }, 1).account, '7');
});

test('switchKind converte entre mês, trimestre e ano', () => {
  const s = (period, year = '2026') => ({ year, period, account: '' });
  assert.equal(relatorios.switchKind(s('m11'), 'q', '2026-11-05').period, 'q4');
  assert.equal(relatorios.switchKind(s('q2'), 'm', '2026-11-05').period, 'm04');
  assert.equal(relatorios.switchKind(s('m11'), 'year', '2026-11-05').period, 'year');
  assert.equal(relatorios.switchKind(s('year'), 'm', '2026-11-05').period, 'm11');
  assert.equal(relatorios.switchKind(s('year', '2025'), 'm', '2026-11-05').period, 'm01');
  assert.equal(relatorios.switchKind(s('m11'), 'm', '2026-11-05').period, 'm11');
  assert.deepEqual(relatorios.initial('2026-11-05'), NOV);
});

test('delta é a diferença do saldo face ao período anterior, com percentagem', () => {
  const v = relatorios.view(demo(), NOV);
  assert.equal(v.current.saving, 1385.2);
  assert.equal(v.previous.saving, -48.5);
  assert.equal(v.delta.saving, 1433.7);
  assert.equal(v.delta.income, 1450);
  assert.equal(v.delta.expense, 16.3);
  assert.equal(Math.round(v.delta.pct), 2956);
  assert.equal(relatorios.view(empty(), NOV).delta.pct, null);
});

test('as categorias trazem a cor do modelo por posição e as subcategorias', () => {
  const v = relatorios.view(demo(), NOV);
  assert.deepEqual(v.categories.map(c => c.name), ['Alimentação']);
  assert.equal(v.categories[0].value, 64.8);
  assert.equal(v.categories[0].color, R.color(0));
  assert.equal(R.color(0), '#2f9e83');
  assert.ok(v.categories[0].children.length > 0);
  const year = relatorios.view(demo(), { year: '2026', period: 'year', account: '' });
  year.categories.forEach((c, i) => assert.equal(c.color, R.color(i)));
});

test('erro do modelo mostra o cartão de erro e mantém os seletores', () => {
  const boom = () => { throw new Error('Ajuste sem direção impede calcular este saldo.'); };
  const html = relatorios.render(realCtx(demo()), NOV, boom);
  assert.match(html, /Não foi possível calcular: Ajuste sem direção/);
  assert.ok(html.includes('data-pill-repkind="year"'));
  assert.ok(!html.includes('ch-tile'));
});

test('ledger vazio e demo não atiram, em todos os períodos', () => {
  for (const make of [empty, demo]) {
    for (const period of ['m01', 'm11', 'q4', 'year']) {
      const html = relatorios.render(realCtx(make()), { year: '2026', period, account: '' });
      assert.ok(html.includes('Relatórios') && !html.includes('cs-error'), period);
    }
  }
  assert.ok(relatorios.render(realCtx(empty()), NOV).includes('Sem despesas neste período'));
});

test('seletor de período, contas, mosaicos e carimbo de sincronização', () => {
  const html = relatorios.render(realCtx(demo()), NOV);
  for (const part of ['data-pill-repkind="m"', 'data-pill-repkind="q"', 'data-pill-repkind="year"', 'id="rep-prev"', 'id="rep-next"', 'data-pill-repaccount=""', 'novembro de 2026', 'Receitas', 'Despesas', 'Saldo', 'Diferença do saldo', 'Onde gastas', 'data-page="mais"', 'Ainda não sincronizado']) {
    assert.ok(html.includes(part), part);
  }
  assert.ok(html.includes('data-pill-repkind="m"') && /data-pill-repkind="m" aria-pressed="true"/.test(html));
});

test('«Mês a mês» só aparece em trimestre e ano', () => {
  const at = period => relatorios.render(realCtx(demo()), { year: '2026', period, account: '' });
  assert.ok(!at('m11').includes('Mês a mês'));
  assert.ok(at('q4').includes('Mês a mês'));
  assert.equal((at('year').match(/class="rep-inc"/g) || []).length, 12);
  assert.equal((at('q4').match(/class="rep-inc"/g) || []).length, 3);
});

test('tocar numa categoria expande as subcategorias', () => {
  const closed = relatorios.render(realCtx(demo()), NOV);
  const open = relatorios.render(realCtx(demo()), { ...NOV, open: 'Alimentação' });
  assert.ok(closed.includes('aria-expanded="false"') && !closed.includes('rep-kid'));
  assert.ok(open.includes('aria-expanded="true"') && open.includes('rep-kid'));
});

test('o ecrã não usa style= (a CSP bloqueia-o) e desenha cores em atributos SVG', () => {
  for (const period of ['m11', 'q4', 'year']) {
    const html = relatorios.render(realCtx(demo()), { year: '2026', period, account: '', open: 'Alimentação' });
    assert.ok(!/style\s*=/i.test(html), period);
  }
  assert.ok(relatorios.render(realCtx(demo()), NOV).includes('fill="#2f9e83"'));
});

const tile = (html, name) => (html.match(new RegExp('<article[^>]*>(?:(?!</article>).)*' + name + '(?:(?!</article>).)*</article>')) || [''])[0];

test('com valores ocultos não há montantes, nem em aria-label', () => {
  for (const period of ['m11', 'q4', 'year']) {
    const sel = { year: '2026', period, account: '', open: 'Alimentação' };
    // dentes: o mesmo ecrã visível tem montantes e a expressão apanha-os
    assert.match(relatorios.render(realCtx(demo(), false), sel), AMOUNT, period);
    const html = relatorios.render(realCtx(demo(), true), sel);
    assert.doesNotMatch(html, AMOUNT, period);
    assert.ok(html.includes('•••• €'));
    assert.doesNotMatch(tile(html, 'Diferença do saldo'), /%/, period);
    if (period === 'm11') assert.match(tile(relatorios.render(realCtx(demo(), false), sel), 'Diferença do saldo'), /%/);
    for (const label of html.match(/aria-label="[^"]*"/g) || []) assert.doesNotMatch(label, /\d,\d{2}|€/, label);
  }
  const emptyHtml = relatorios.render(realCtx(empty(), true), NOV);
  assert.doesNotMatch(emptyHtml, AMOUNT);
});
