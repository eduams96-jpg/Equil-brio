'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mais = require('./mais.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const ORDER = ['contas', 'agenda', 'patrimonio', 'relatorios', 'avisos', 'sync', 'definicoes'];

test('Mais lista as sete entradas pela ordem indicada', () => {
  const html = mais.render(ctx(demo()));
  const pages = [...html.matchAll(/data-page="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(pages, ORDER);
  assert.equal((html.match(/class="mais-icon"/g) || []).length, 7);
  for (const label of ['Contas', 'Agenda', 'Património', 'Relatórios', 'Avisos', 'Ligação', 'Definições']) assert.ok(html.includes(label), label);
});

test('Mais funciona com dados vazios', () => {
  const pages = [...mais.render(ctx(empty())).matchAll(/data-page="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(pages, ORDER);
});
