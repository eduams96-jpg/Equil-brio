'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const agenda = require('./agenda.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');
const P = require('../../../shared/protocol.cjs');
const K = require('../../../shared/commitment-drafts.cjs');
const Forms = require('../../../shared/form-drafts.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const view = { period: '2026-11', showCompleted: false };
const realCtx = (ledger, hidden = false) => ctx(ledger, { state: { ...P.offlineFixture(), hidden } });

test('Agenda não atira com dados vazios e de demonstração', () => {
  for (const make of [empty, demo]) {
    const c = realCtx(make());
    assert.ok(agenda.render(c, view).includes('id="new-commitment"'));
    assert.ok(agenda.commitment(c, { commitmentId: 'pp-rent' }).length > 0);
    assert.ok(agenda.discardCommitment().includes('id="confirm-discard-commitment"'));
    assert.ok(agenda.discardPayment().includes('id="confirm-discard-payment"'));
  }
});

test('Agenda do demo lista os compromissos do mês e volta a Mais', () => {
  const html = agenda.render(realCtx(demo()), view);
  assert.ok(html.includes('Renda') && html.includes('Internet'));
  assert.equal((html.match(/data-commitment="/g) || []).length, 2);
  assert.ok(html.includes('data-agenda-pay') && html.includes('data-agenda-receive'));
  assert.ok(html.includes('data-page="mais"'));
  assert.ok(html.includes('id="agenda-completed"'));
  assert.doesNotMatch(html, /id="agenda-completed"[^>]*checked/);
  assert.match(agenda.render(realCtx(demo()), { ...view, showCompleted: true }), /id="agenda-completed"[^>]*checked/);
});

test('Agenda vazia avisa que não há compromissos', () => {
  assert.ok(agenda.render(realCtx(empty()), view).includes('Sem compromissos previstos'));
});

test('Agenda com valores ocultos não mostra montantes (e mostra-os quando visíveis)', () => {
  assert.match(agenda.render(realCtx(demo()), view), AMOUNT);
  assert.doesNotMatch(agenda.render(realCtx(demo(), true), view), AMOUNT);
  assert.match(agenda.commitment(realCtx(demo()), { commitmentId: 'pp-rent' }), AMOUNT);
  assert.doesNotMatch(agenda.commitment(realCtx(demo(), true), { commitmentId: 'pp-rent' }), AMOUNT);
});

test('Detalhe do compromisso tem ações e trata compromisso em falta', () => {
  const html = agenda.commitment(realCtx(demo()), { commitmentId: 'pp-rent' });
  for (const s of ['Renda', 'id="edit-commitment"', 'id="reschedule-commitment"', 'id="open-payment"', 'data-page="agenda"']) assert.ok(html.includes(s), s);
  assert.ok(agenda.commitment(realCtx(demo()), { commitmentId: 'nao-existe' }).includes('Compromisso indisponível'));
});

test('Formulário de compromisso tem os campos e ids usados pelos manipuladores', () => {
  const c = realCtx(demo());
  const form = { id: 'c1', command: 'commitment.add', action: 'edit', type: 'expense', description: 'Seguro', amount: '12,50', accountId: c.ledger.accounts[0].id, date: '2026-11-20', category: 'Casa', reason: '', changedOn: '2026-11-05' };
  const html = agenda.form(c, { form, record: K.create(c.state, form, 0) });
  for (const s of ['id="commitment-form"', 'id="save-commitment"', 'id="ask-discard-commitment"', 'id="commitment-status"', 'name="accountId"', 'name="reason"', 'Novo compromisso']) assert.ok(html.includes(s), s);
  const upd = agenda.form(c, { form: { ...form, command: 'commitment.update', action: 'reschedule' }, record: K.create(c.state, form, 0) });
  assert.ok(upd.includes('Reagendar compromisso') && upd.includes('<textarea name="reason"'));
  assert.ok(agenda.form(c, { form: null, record: null }).includes('Compromisso indisponível'));
});

test('Formulário de pagamento tem os campos e ids usados pelos manipuladores', () => {
  const c = realCtx(demo());
  const form = { id: 'pp-rent', transactionId: 't1', amount: '520,00', date: '2026-11-05', changedOn: '2026-11-05' };
  const html = agenda.payment(c, { form, record: Forms.create(c.state, form, 'commitment:pp-rent', 0) });
  for (const s of ['id="payment-form"', 'id="save-payment"', 'id="ask-discard-payment"', 'id="payment-status"', 'name="amount"', 'name="date"', 'max="2026-11-05"', 'Renda']) assert.ok(html.includes(s), s);
  assert.ok(agenda.payment(c, { form: null, record: null }).includes('Pagamento indisponível'));
  // o valor por liquidar fora do campo de edição respeita a ocultação
  const strip = h => h.replace(/value="[^"]*"/g, '');
  assert.match(strip(html), AMOUNT);
  const hc = realCtx(demo(), true);
  assert.doesNotMatch(strip(agenda.payment(hc, { form, record: Forms.create(hc.state, form, 'commitment:pp-rent', 0) })), AMOUNT);
});

test('Banners de rascunho de pagamento e compromisso aparecem na Agenda', () => {
  const state = { ...P.offlineFixture(), hidden: false, paymentDraft: { token: 't' }, commitmentDraft: { token: 'c' } };
  const html = agenda.render(ctx(demo(), { state }), view);
  assert.ok(html.includes('id="resume-payment"') && html.includes('id="resume-commitment"'));
});
