'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyDigest } = require('./digest.cjs');
const notifier = require('./notifier.cjs');

const TODAY = '2026-11-05';
const row = (title, date, priority = 'high') => ({ title, date, priority, naturalState: date < TODAY ? 'overdue' : 'upcoming' });
const result = rows => ({ rows, counts: { high: rows.filter(r => r.priority === 'high').length, medium: rows.filter(r => r.priority === 'medium').length } });

test('sem avisos high/medium não há resumo', () => {
  assert.equal(dailyDigest(null, { hidden: false }), null);
  assert.equal(dailyDigest(result([]), { hidden: false, today: TODAY }), null);
  assert.equal(dailyDigest(result([row('Baixo', TODAY, 'low')]), { hidden: false, today: TODAY }), null);
});

test('um aviso: título no singular e estado entre parênteses', () => {
  const d = dailyDigest(result([row('Seguro', TODAY)]), { hidden: false, today: TODAY });
  assert.deepEqual(d, { title: '1 aviso hoje', body: 'Seguro (vence hoje)' });
});

test('estados: vence hoje, atrasado e em N dias', () => {
  const d = dailyDigest(result([row('A', TODAY), row('B', '2026-11-01'), row('C', '2026-11-08', 'medium')]), { hidden: false, today: TODAY });
  assert.equal(d.title, '3 avisos hoje');
  assert.equal(d.body, 'A (vence hoje), B (atrasado), C (em 3 dias)');
});

test('quatro avisos: três títulos e reticências', () => {
  const d = dailyDigest(result([row('A', TODAY), row('B', TODAY), row('C', TODAY), row('D', TODAY)]), { hidden: false, today: TODAY });
  assert.equal(d.title, '4 avisos hoje');
  assert.equal(d.body, 'A (vence hoje), B (vence hoje), C (vence hoje)…');
  assert.ok(!d.body.includes('D'));
});

test('com valores ocultos não há títulos nem montantes', () => {
  const d = dailyDigest(result([row('Renda 450,00 €', TODAY), row('Luz', TODAY)]), { hidden: true, today: TODAY });
  assert.equal(d.title, '2 avisos hoje');
  assert.equal(d.body, 'Abre a app para ver.');
  assert.ok(!/Renda|Luz|€|450/.test(d.title + d.body));
});

function fakePlugin() {
  const calls = { cancel: [], schedule: [] };
  return { calls, cancel: async a => { calls.cancel.push(a); }, schedule: async a => { calls.schedule.push(a); } };
}
const fakeNotices = (ledger, { today }) => ledger.byDay[today] || null;

test('schedule cancela 9001-9007 e só agenda os dias com avisos, à hora certa', async () => {
  const plugin = fakePlugin();
  const ledger = { byDay: { '2026-11-05': result([row('Hoje', '2026-11-05')]), '2026-11-07': result([row('Dia 7', '2026-11-08', 'medium')]) } };
  const now = new Date(2026, 10, 5, 7, 30);
  await notifier.schedule(ledger, { hour: 9 }, { hidden: false, now }, plugin, fakeNotices);
  assert.deepEqual(plugin.calls.cancel, [{ notifications: [9001, 9002, 9003, 9004, 9005, 9006, 9007].map(id => ({ id })) }]);
  assert.equal(plugin.calls.schedule.length, 1);
  const list = plugin.calls.schedule[0].notifications;
  assert.deepEqual(list.map(n => n.id), [9001, 9003]);
  assert.deepEqual(list[0].extra, { page: 'avisos' });
  assert.equal(list[0].title, '1 aviso hoje');
  assert.equal(list[0].body, 'Hoje (vence hoje)');
  assert.equal(list[0].schedule.allowWhileIdle, true);
  for (const n of list) assert.equal(n.isExactNotification, false);
  assert.equal(list[0].schedule.at.getTime(), new Date(2026, 10, 5, 9, 0).getTime());
  assert.equal(list[1].schedule.at.getTime(), new Date(2026, 10, 7, 9, 0).getTime());
  assert.equal(list[1].body, 'Dia 7 (em 1 dia)');
});

test('schedule salta horas já passadas e não agenda nada sem avisos', async () => {
  const plugin = fakePlugin();
  const ledger = { byDay: { '2026-11-05': result([row('Hoje', '2026-11-05')]) } };
  await notifier.schedule(ledger, { hour: 9 }, { hidden: false, now: new Date(2026, 10, 5, 10, 0) }, plugin, fakeNotices);
  assert.equal(plugin.calls.cancel.length, 1);
  assert.equal(plugin.calls.schedule.length, 0);
});

test('schedule com valores ocultos não envia títulos', async () => {
  const plugin = fakePlugin();
  const ledger = { byDay: { '2026-11-05': result([row('Renda 450,00 €', '2026-11-05')]) } };
  await notifier.schedule(ledger, { hour: 9 }, { hidden: true, now: new Date(2026, 10, 5, 7, 0) }, plugin, fakeNotices);
  const n = plugin.calls.schedule[0].notifications[0];
  assert.equal(n.body, 'Abre a app para ver.');
  assert.ok(!JSON.stringify(n).includes('Renda'));
});

test('enable devolve false quando a permissão é recusada', async () => {
  assert.equal(await notifier.enable({ requestPermissions: async () => ({ display: 'denied' }) }), false);
  assert.equal(await notifier.enable({ requestPermissions: async () => ({ display: 'granted' }) }), true);
});
