'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const patrimonio = require('./patrimonio.cjs');
const kit = require('../ui/kit.cjs');
const W = require('../../../../equilibrio/wealth-model.js');
const R = require('../../../../equilibrio/reports-model.js');
const relatorios = require('./relatorios.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const ANY_EURO = /\d[\d\s .,]*\s?€/;
const realCtx = (ledger, hidden = false) => ctx(ledger, { state: { hidden } });
const cents = x => Math.round(x * 100);
const tile = (html, name) => (html.match(new RegExp('<article[^>]*>(?:(?!</article>).)*' + name + '(?:(?!</article>).)*</article>')) || [''])[0];
const manyPoints = n => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, date: '2026-' + String(Math.floor(i / 2) + 1).padStart(2, '0') + (i % 2 ? '-28' : '-10'), net: 1000 + i * 100 }));
const negative = () => { const d = demo(); d.debts[0].balance = 99999; return d; };
const long = () => { const d = demo(); d.wealthHistory = manyPoints(15); return d; };

test('paridade: o líquido do ecrã é o do modelo partilhado', () => {
  for (const make of [demo, empty, negative]) {
    const ledger = make();
    const s = W.summary(ledger, '2026-11-05');
    const html = patrimonio.render(realCtx(ledger));
    assert.ok(tile(html, 'Património líquido').includes(kit.money(Math.round(s.net * 100))), String(s.net));
    assert.ok(tile(html, 'Contas').includes(kit.money(cents(s.cash))));
    assert.ok(tile(html, 'Bens e investimentos').includes(kit.money(cents(s.investments + s.assets))));
    assert.ok(tile(html, 'Créditos').includes(kit.money(cents(-s.debts))));
  }
});

test('o demo traz os quatro mosaicos com o sentido do PC', () => {
  const html = patrimonio.render(realCtx(demo()));
  const s = W.summary(demo(), '2026-11-05');
  assert.equal((html.match(/class="ch-tile /g) || []).length, 4);
  assert.match(tile(html, 'Património líquido'), /is-green/);
  assert.ok(tile(html, 'Património líquido').includes('desde 31/10/2026'));
  assert.ok(tile(html, 'Património líquido').includes(kit.money(cents(Math.abs(s.delta)))), 'variação face ao último valor guardado');
  assert.match(tile(html, 'Contas'), /conta(s)? por conferir/);
  assert.ok(tile(html, 'Bens e investimentos').includes('1 bem · 1 posição'));
  assert.match(tile(html, 'Créditos'), /is-amber/);
  assert.ok(tile(html, 'Créditos').includes('Prestações de ' + kit.money(15000) + '/mês'));
  assert.ok(html.includes('Ainda não sincronizado'));
});

test('património negativo fica a vermelho e sem créditos diz-se', () => {
  assert.match(tile(patrimonio.render(realCtx(negative())), 'Património líquido'), /is-red/);
  const html = patrimonio.render(realCtx(empty()));
  assert.ok(tile(html, 'Créditos').includes('Sem créditos em dívida'));
  assert.match(tile(html, 'Créditos'), /is-green/);
  assert.ok(tile(html, 'Património líquido').includes('Sem valores guardados para comparar'));
});

test('composição: barra empilhada, lista e créditos', () => {
  const html = patrimonio.render(realCtx(demo()));
  const s = W.summary(demo(), '2026-11-05');
  assert.ok(html.includes('Composição'));
  assert.ok(html.includes('Ativos de ' + kit.money(cents(s.positive))));
  for (const part of s.parts) {
    assert.ok(html.includes('pat-seg part-' + part.key), part.key);
    assert.ok(html.includes(part.label), part.label);
  }
  assert.ok(html.includes('1 crédito em dívida'));
  const widths = [...html.matchAll(/<rect class="pat-seg[^"]*"[^>]*\swidth="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.equal(widths.length, 3);
  assert.ok(Math.abs(widths.reduce((n, w) => n + w, 0) - 100) < 0.1);
});

test('evolução: linha SVG com os últimos 12 valores guardados', () => {
  const html = patrimonio.render(realCtx(long()));
  const commands = h => (h.match(/<path class="pat-line" d="([^"]+)"/)[1].match(/[ML]/g) || []).length;
  assert.equal(commands(html), 12);
  assert.ok(html.includes('Evolução'));
  const two = patrimonio.render(realCtx(demo()));
  assert.equal(commands(two), 2);
  assert.ok(two.includes('30/09/2026') && two.includes('31/10/2026'));
});

test('um único valor guardado desenha uma linha, sem dividir por zero', () => {
  const d = demo(); d.wealthHistory = [d.wealthHistory[0]];
  const html = patrimonio.render(realCtx(d));
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /<path class="pat-line"/);
});

test('sem valores guardados aparece o estado vazio', () => {
  const none = demo(); none.wealthHistory = [];
  for (const html of [patrimonio.render(realCtx(empty())), patrimonio.render(realCtx(none))]) {
    assert.ok(html.includes('Ainda não há valores guardados'));
    assert.ok(!html.includes('pat-line'));
  }
  assert.doesNotMatch(patrimonio.render(realCtx(empty())), /NaN|undefined/);
});

test('«Receitas e despesas do mês» usa Relatórios no mês de ctx.today', () => {
  const calls = [];
  const spy = (ledger, sel) => { calls.push(sel); return R.analyse(ledger, sel); };
  const html = patrimonio.render(realCtx(demo()), {}, { analyse: spy });
  assert.deepEqual(calls[0], { year: '2026', period: 'm11', account: '' });
  assert.ok(html.includes('Receitas e despesas do mês'));
  const rel = relatorios.view(demo(), { year: '2026', period: 'm11', account: '' });
  assert.ok(html.includes(kit.money(cents(rel.current.income))));
  assert.ok(html.includes(kit.money(cents(rel.current.expense))));
  assert.ok(html.includes(kit.money(cents(rel.current.saving))));
  assert.ok(html.includes('data-page="relatorios"'));
});

test('erros do modelo mostram o cartão de erro', () => {
  const boom = () => { throw new Error('Saldo fora dos limites permitidos.'); };
  const a = patrimonio.render(realCtx(demo()), {}, { summary: boom });
  assert.match(a, /Não foi possível calcular: Saldo fora dos limites/);
  assert.ok(!a.includes('ch-tile'));
  assert.ok(a.includes('data-page="mais"'));
  const b = patrimonio.render(realCtx(demo()), {}, { analyse: boom });
  assert.match(b, /Não foi possível calcular: Saldo fora dos limites/);
  assert.ok(b.includes('Património líquido'), 'o resto do ecrã mantém-se');
});

test('o ecrã não usa style= (a CSP bloqueia-o)', () => {
  for (const make of [demo, empty, long]) assert.ok(!/style\s*=/i.test(patrimonio.render(realCtx(make()))));
});

test('com valores ocultos não há montantes, nem nos rótulos SVG nem em aria-label', () => {
  for (const make of [demo, empty, long]) {
    const visible = patrimonio.render(realCtx(make(), false));
    // dentes: o mesmo ecrã visível tem montantes e as expressões apanham-nos
    assert.match(visible, AMOUNT);
    assert.match(visible, ANY_EURO);
    const hidden = patrimonio.render(realCtx(make(), true));
    assert.doesNotMatch(hidden, AMOUNT);
    assert.doesNotMatch(hidden, ANY_EURO);
    assert.ok(hidden.includes('•••• €'));
    for (const label of hidden.match(/aria-label="[^"]*"/g) || []) assert.doesNotMatch(label, /\d,\d{2}|\d\s?€/, label);
    for (const text of hidden.match(/<text[^>]*>[^<]*<\/text>/g) || []) assert.doesNotMatch(text.replace(/<[^>]*>/g, ''), /\d/, text);
  }
  const visible = patrimonio.render(realCtx(demo(), false));
  assert.match((visible.match(/<text[^>]*>[^<]*<\/text>/g) || []).join(''), /\d[\s ]?€/, 'dentes: os rótulos SVG visíveis levam montantes');
  assert.match((visible.match(/aria-label="Evolução[^"]*"/) || [''])[0], /\d,\d{2}/, 'dentes: o aria-label visível leva montantes');
});
