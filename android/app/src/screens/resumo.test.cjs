'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const resumo = require('./resumo.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

test('Resumo com dados vazios não atira e explica que não há movimentos', () => {
  const html = resumo.render(ctx(empty()));
  assert.ok(html.includes('Ainda não há movimentos'));
});

test('Resumo com dados de demonstração tem 3 mosaicos e no máximo 5 movimentos', () => {
  const html = resumo.render(ctx(demo()));
  assert.equal((html.match(/class="ch-tile /g) || []).length, 3);
  const rows = (html.match(/movement-row/g) || []).length;
  assert.ok(rows >= 1 && rows <= 5, 'linhas: ' + rows);
  const pages = [...html.matchAll(/class="ch-tile [^"]*" data-page="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(pages, ['avisos', 'agenda', 'compras']);
});

test('Resumo mostra «—» quando os contadores são nulos e o número quando existem', () => {
  const nulls = resumo.render(ctx(demo(), { counts: { notices: null, shopping: null } }));
  assert.equal((nulls.match(/ch-tile-value">—</g) || []).length, 2);
  const withCounts = resumo.render(ctx(demo(), { counts: { notices: 4, shopping: 2 } }));
  assert.ok(withCounts.includes('ch-tile-value">4<'));
  assert.ok(withCounts.includes('ch-tile-value">2<'));
  const missing = ctx(demo());
  delete missing.counts;
  assert.doesNotThrow(() => resumo.render(missing));
});

test('Resumo com valores ocultos não mostra montantes', () => {
  const html = resumo.render(ctx(demo(), { state: { hidden: true } }));
  assert.doesNotMatch(html, /\d,\d{2}\s?€/);
});

test('Banners do Resumo e atalho de consulta', () => {
  const state = { hidden: false, commitmentDraft: { t: 1 }, paymentDraft: { t: 1 } };
  const html = resumo.render(ctx(demo(), { state }));
  assert.ok(html.includes('data-page="agenda">Abrir Agenda') && html.includes('id="resume-payment"'));
  assert.ok(html.includes('data-page="consulta-financeira"'));
  assert.ok(!resumo.render(ctx(demo())).includes('draft-banner'));
});

test('Consulta financeira não atira e esconde montantes (com dentes)', () => {
  for (const make of [empty, demo]) assert.ok(resumo.financial(ctx(make())).includes('Créditos e prestações'));
  const re = /\d,\d{2}\s?€/;
  const visible = resumo.financial(ctx(demo()), { period: '2026-11' });
  assert.match(visible, re);
  assert.doesNotMatch(resumo.financial(ctx(demo(), { state: { hidden: true } }), { period: '2026-11' }), re);
});
