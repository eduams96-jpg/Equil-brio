'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ligacao = require('./ligacao.cjs');
const P = require('../../../shared/protocol.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const entry = (command, payload, extra = {}) => ({ operation: { operationId: 'op1', command, payload }, status: 'conflict', receipt: { message: 'Os dados mudaram.' }, ...extra });
const withOutbox = (ledger, outbox, hidden = false) => ctx(ledger, { state: { hidden, outbox, confirmed: { ledger } } });

test('Ligação sem associação mostra o formulário de endereço e código', () => {
  const html = ligacao.render(ctx(empty()), { connection: null, savedConnection: null });
  for (const s of ['id="pairing"', 'name="server"', 'name="code"', 'id="pair"', 'data-page="mais"', 'data-page="recuperacao"']) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('id="sync"'));
  assert.ok(ligacao.render(ctx(empty())).includes('id="pairing"'));
});

test('Ligação associada oferece sincronizar; associação por concluir oferece retomar', () => {
  const paired = ligacao.render(ctx(demo()), { connection: { url: 'x' }, savedConnection: null });
  assert.ok(paired.includes('id="sync"') && paired.includes('id="review-detach"') && !paired.includes('id="pairing"'));
  const pending = ligacao.render(ctx(demo()), { connection: null, savedConnection: { kind: 'pairing' } });
  assert.ok(pending.includes('id="resume-pair"') && pending.includes('id="cancel-pair"'));
});

test('Ligação exige confirmar a substituição quando há dados locais', () => {
  const local = P.offlineFixture('phone');
  const render = () => ligacao.render(ctx(local.confirmed.ledger, { state: local }), {});
  const confirmation = /name="replaceLocal" value="yes" required/;
  assert.doesNotMatch(render(), confirmation);
  require('../../../shared/house.cjs').Casa.shopping(local.confirmed.ledger, 'add', { name: 'Pão', qty: '1' });
  assert.match(render(), confirmation);
});

test('Ligação lista a fila e oferece Rever nos conflitos', () => {
  const html = ligacao.render(withOutbox(demo(), [entry('movement.update', { description: 'Café' })]), {});
  assert.ok(html.includes('Café') && html.includes('Conflito') && html.includes('data-review="op1"'));
  assert.ok(ligacao.render(ctx(empty()), {}).includes('Sem alterações pendentes'));
});

test('Conflito de movimento compara versões e oferece manter ou rever', () => {
  const ledger = demo(), t = ledger.transactions[0];
  const c = withOutbox(ledger, [entry('movement.update', { id: t.id, description: 'Outro', amountCents: 999, date: '2026-11-05' })]);
  const html = ligacao.conflict(c, { conflictId: 'op1' });
  for (const s of ['id="keep-server"', 'id="revise-local"', 'Versão confirmada no PC', 'Outro', 'data-page="sync"']) assert.ok(html.includes(s), s);
  assert.ok(ligacao.conflict(c, { conflictId: 'outro' }).includes('Proposta já revista'));
});

test('Conflito com valores ocultos não mostra montantes (e mostra-os quando visíveis)', () => {
  const ledger = demo(), t = ledger.transactions[0];
  const outbox = [entry('movement.update', { id: t.id, description: 'Outro', amountCents: 999, date: '2026-11-05' })];
  assert.match(ligacao.conflict(withOutbox(ledger, outbox), { conflictId: 'op1' }), AMOUNT);
  assert.doesNotMatch(ligacao.conflict(withOutbox(ledger, outbox, true), { conflictId: 'op1' }), AMOUNT);
});

test('Conflito de conta, compromisso ou Casa usa a proposta conservada e esconde valores', () => {
  const outbox = [entry('account.update', { id: 'a1', name: 'Conta nova' })];
  const html = ligacao.conflict(withOutbox(demo(), outbox), { conflictId: 'op1' });
  assert.ok(html.includes('id="repeat-extended"') && html.includes('Conta nova'));
  const hidden = ligacao.conflict(withOutbox(demo(), outbox, true), { conflictId: 'op1' });
  assert.ok(hidden.includes('Valores ocultos') && !hidden.includes('Conta nova'));
});

test('Recuperação e confirmações têm os ids usados pelos manipuladores', () => {
  const c = ctx(demo());
  const rec = ligacao.recovery(c, { points: [{ id: 3, revision: 0, transactions: 5, operations: 2 }], file: null });
  for (const s of ['id="export-backup"', 'id="choose-backup"', 'id="list-checkpoints"', 'data-checkpoint="3"', 'id="backup-password"', 'data-page="sync"']) assert.ok(rec.includes(s), s);
  assert.ok(!rec.includes('id="open-backup"'));
  assert.ok(ligacao.recovery(c, { points: [], file: 'x' }).includes('id="open-backup"'));
  assert.ok(ligacao.recovery(c).includes('id="export-backup"'));
  assert.ok(ligacao.confirmRecovery().includes('id="confirm-recovery"') && ligacao.confirmRecovery().includes('id="portable-import"'));
  assert.ok(ligacao.confirmDetach().includes('id="confirm-detach"'));
  assert.ok(ligacao.confirmPassage().includes('id="confirm-portable"'));
});
