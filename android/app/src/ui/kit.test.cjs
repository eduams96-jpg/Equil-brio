'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('./kit.cjs');
const { icon } = require('./icons.cjs');

const flat = s => s.replace(/[\u00a0\u202f]/g, ' ');

test('money formata em pt-PT e oculta quando pedido', () => {
  assert.equal(flat(kit.money(123456, false)), '1234,56 €');
  assert.equal(kit.money(5, true), '•••• €');
});

test('escape neutraliza HTML', () => {
  assert.equal(kit.escape('<a "x">'), '&lt;a &quot;x&quot;&gt;');
  assert.equal(kit.escape(null), '');
});

test('tile com page passa a botao com icone', () => {
  const html = kit.tile({ tone: 'red', icon: 'alert', label: 'Avisos', value: '3', page: 'avisos' });
  assert.match(html, /class="ch-tile is-red"/);
  assert.match(html, /data-page="avisos"/);
  assert.match(html, /<svg/);
  assert.match(html, /^<button/);
  assert.match(kit.tile({ tone: 'green', icon: 'check', label: 'x', value: '1' }), /^<article/);
});

test('pills marca so o selecionado', () => {
  const html = kit.pills('estado', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', count: 2 }], 'b');
  assert.match(html, /class="cs-pills" role="tablist"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /data-pill-estado="b"[^>]*aria-pressed="true"/);
  assert.match(html, /data-pill-estado="a"[^>]*aria-pressed="false"/);
});

test('card, search e errorCard', () => {
  assert.match(kit.card({ title: 'T<', body: '<p>b</p>', className: 'x' }), /T&lt;[\s\S]*<p>b<\/p>/);
  assert.match(kit.search('q', 'a"b', 'Procurar'), /id="q"[^>]*value="a&quot;b"/);
  const err = kit.errorCard('x<y');
  assert.match(err, /x&lt;y/);
  assert.match(err, /Não foi possível calcular: /);
});

test('syncStamp', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(kit.syncStamp(null, now), 'Ainda não sincronizado');
  assert.equal(kit.syncStamp(new Date(now - 5 * 60e3).toISOString(), now), 'Dados de há 5 min');
  assert.equal(kit.syncStamp(new Date(now - 2 * 3600e3).toISOString(), now), 'Dados de há 2 h');
  assert.equal(kit.syncStamp(new Date(now - 26 * 3600e3).toISOString(), now), 'Dados de ontem');
});

test('icon devolve svg ou vazio', () => {
  for (const n of ['chart', 'account', 'box', 'alert', 'cart', 'calendar', 'bell', 'home', 'list', 'settings', 'link', 'plus', 'search', 'check', 'arrow']) {
    assert.match(icon(n), /^<svg[^>]*aria-hidden="true"/, n);
  }
  assert.equal(icon('nao-existe'), '');
});
