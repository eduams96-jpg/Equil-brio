'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const notifier = require('./notifier.cjs');

test('cancelAll cancela os ids 9001 a 9007 pelo plugin injetado e nada mais', async () => {
  const calls = [];
  const plugin = { cancel: async arg => { calls.push(['cancel', arg]); }, schedule: async arg => { calls.push(['schedule', arg]); } };
  await notifier.cancelAll(plugin);
  assert.deepEqual(calls, [['cancel', { notifications: [9001, 9002, 9003, 9004, 9005, 9006, 9007].map(id => ({ id })) }]]);
});
