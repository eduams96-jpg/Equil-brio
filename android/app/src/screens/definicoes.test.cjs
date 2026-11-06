'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const definicoes = require('./definicoes.cjs');
const { ctx, demo } = require('./fixtures.cjs');

const DENIED = 'Sem permissão para notificações. Ativa-a nas definições do Android.';
const make = (settings, view) => definicoes.render(ctx(demo(), { settings: { notifications: false, hour: 9, theme: 'auto', hideOnOpen: false, ...settings } }), view);

test('mostra o cabeçalho, o regresso a Mais e as secções', () => {
  const html = make();
  assert.match(html, /data-page="mais"/);
  assert.match(html, /<h1>Definições<\/h1>/);
  for (const text of ['Notificações', 'Aparência', 'Privacidade', 'Alterar no PC']) assert.ok(html.includes(text), text);
});

test('o interruptor de notificações reflete o estado e não mostra o aviso por defeito', () => {
  const off = make({ notifications: false });
  assert.match(off, /id="set-notifications"[^>]*aria-pressed="false"/);
  assert.ok(!off.includes(DENIED));
  const on = make({ notifications: true });
  assert.match(on, /id="set-notifications"[^>]*aria-pressed="true"/);
});

test('com a permissão recusada mostra o aviso e o interruptor fica desligado', () => {
  const html = make({ notifications: false }, { permissionDenied: true });
  assert.ok(html.includes(DENIED));
  assert.match(html, /id="set-notifications"[^>]*aria-pressed="false"/);
  assert.match(html, /role="alert"/);
});

test('a hora é um seletor com as 24 horas e a atual escolhida', () => {
  const html = make({ hour: 18 });
  assert.match(html, /<select id="set-hour"/);
  assert.equal((html.match(/<option /g) || []).length, 24);
  assert.match(html, /<option value="18" selected>18:00<\/option>/);
  assert.match(html, /<option value="0">00:00<\/option>/);
  assert.equal((html.match(/ selected>/g) || []).length, 1);
});

test('o tema são três pills e a atual fica pressionada', () => {
  for (const [theme, label] of [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']]) {
    const html = make({ theme });
    assert.equal((html.match(/data-pill-theme="/g) || []).length, 3);
    assert.match(html, new RegExp('data-pill-theme="' + theme + '" aria-pressed="true">' + label));
    assert.equal((html.match(/aria-pressed="true">(Automático|Claro|Escuro)/g) || []).length, 1);
  }
});

test('«Ocultar valores ao abrir» é um interruptor', () => {
  assert.match(make({ hideOnOpen: false }), /id="set-hide-open"[^>]*aria-pressed="false"/);
  assert.match(make({ hideOnOpen: true }), /id="set-hide-open"[^>]*aria-pressed="true"/);
  assert.ok(make().includes('Ocultar valores ao abrir'));
});

test('as preferências de avisos do PC vêm do ledger, só para leitura', () => {
  const d = demo();
  d.practical = { noticePreferences: { enabled: { payments: true, warranties: false }, days: { payments: 12 }, urgentDays: 5 } };
  const html = definicoes.render(ctx(d));
  assert.ok(html.includes('Pagamentos') && html.includes('12 dias'));
  assert.ok(html.includes('Garantias') && html.includes('Desligado'));
  assert.ok(html.includes('5 dias'));
  assert.ok(html.includes('Alterar no PC'));
  assert.ok(!/<input[^>]*name="(enabled|days)/.test(html));
  // por defeito (sem configuração) usa os valores do PC
  const byDefault = definicoes.render(ctx(demo()));
  assert.ok(byDefault.includes('30 dias') && byDefault.includes('45 dias') && byDefault.includes('14 dias'));
});

test('a versão aparece quando conhecida e o texto é escapado', () => {
  assert.ok(make({}, { version: { app: '1.0.0', core: '1.0.21' } }).includes('Versão 1.0.0 · núcleo 1.0.21'));
  assert.ok(make({}, { version: { app: '<b>', core: '1' } }).includes('&lt;b&gt;'));
  assert.ok(!make().includes('Versão'));
});

test('nenhum estilo inline', () => {
  assert.ok(!/ style=/.test(make({ notifications: true }, { permissionDenied: true, version: { app: '1', core: '2' } })));
});
