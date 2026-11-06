'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('./settings.cjs');

const fake = (initial) => {
  const data = new Map(initial ? Object.entries(initial) : []);
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, data };
};
const DEFAULTS = { notifications: false, hour: 9, theme: 'auto', hideOnOpen: false };

test('a chave de armazenamento é fixa', () => {
  assert.equal(settings.KEY, 'equilibrio.mobile.settings');
});

test('sem nada guardado, JSON inválido ou valor que não é objeto dão os valores por defeito', () => {
  assert.deepEqual(settings.read(fake()), DEFAULTS);
  assert.deepEqual(settings.read(fake({ [settings.KEY]: '{não é json' })), DEFAULTS);
  assert.deepEqual(settings.read(fake({ [settings.KEY]: '[1,2]' })), DEFAULTS);
  assert.deepEqual(settings.read(fake({ [settings.KEY]: 'null' })), DEFAULTS);
  assert.deepEqual(settings.read(null), DEFAULTS);
});

test('um armazenamento que lança erros nunca estraga a leitura nem a escrita', () => {
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); } };
  assert.deepEqual(settings.read(broken), DEFAULTS);
  assert.doesNotThrow(() => settings.write(broken, DEFAULTS));
});

test('entradas inválidas são ignoradas campo a campo (hour 25, tema desconhecido, tipos errados)', () => {
  const raw = JSON.stringify({ notifications: true, hour: 25, theme: 'roxo', hideOnOpen: 'sim' });
  assert.deepEqual(settings.read(fake({ [settings.KEY]: raw })), { ...DEFAULTS, notifications: true });
  for (const hour of [-1, 24, 8.5, '9', null]) assert.equal(settings.read(fake({ [settings.KEY]: JSON.stringify({ hour }) })).hour, 9, String(hour));
  for (const hour of [0, 7, 23]) assert.equal(settings.read(fake({ [settings.KEY]: JSON.stringify({ hour }) })).hour, hour);
  for (const theme of ['auto', 'light', 'dark']) assert.equal(settings.read(fake({ [settings.KEY]: JSON.stringify({ theme }) })).theme, theme);
});

test('escrever e ler devolve o mesmo, sem campos desconhecidos', () => {
  const storage = fake();
  settings.write(storage, { notifications: true, hour: 18, theme: 'dark', hideOnOpen: true, extra: 1 });
  assert.deepEqual(JSON.parse(storage.data.get(settings.KEY)), { notifications: true, hour: 18, theme: 'dark', hideOnOpen: true });
  assert.deepEqual(settings.read(storage), { notifications: true, hour: 18, theme: 'dark', hideOnOpen: true });
});

test('escrever valores inválidos grava os valores por defeito nesses campos', () => {
  const storage = fake();
  settings.write(storage, { notifications: 'x', hour: 99, theme: 'neon', hideOnOpen: 1 });
  assert.deepEqual(settings.read(storage), DEFAULTS);
});
