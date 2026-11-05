'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const contas = require('./contas.cjs');
const { ctx, demo, empty } = require('./fixtures.cjs');

const AMOUNT = /\d,\d{2}\s?€/;
const hiddenCtx = ledger => ctx(ledger, { state: { hidden: true } });

test('Contas não atira com dados vazios e de demonstração', () => {
  for (const make of [empty, demo]) {
    const c = ctx(make());
    const id = c.ledger.accounts[0].id;
    assert.ok(contas.render(c).includes('id="new-account"'));
    assert.ok(contas.detail(c, { accountId: id, visibleLimit: 40 }).length > 0);
    assert.ok(contas.editor(c, { form: { command: 'account.add', id: 'x', name: '', type: 'Banco', opening: '' } }).includes('id="account-form"'));
    assert.ok(contas.archive(c, { accountId: id }).includes('id="confirm-archive"'));
    assert.ok(contas.leave(c).includes('id="leave-account"'));
  }
});

test('Contas lista cada conta com data-account e o botão de arquivar volta a Mais', () => {
  const html = contas.render(ctx(demo()));
  assert.equal((html.match(/data-account="/g) || []).length, 2);
  assert.ok(html.includes('data-page="mais"'));
});

test('Contas arquivadas ficam numa secção própria', () => {
  const ledger = demo();
  ledger.accounts[1].archived = true;
  const html = contas.render(ctx(ledger));
  assert.match(html, /Contas arquivadas · 1/);
});

test('Contas com valores ocultos não mostra montantes (e mostra-os quando visíveis)', () => {
  assert.match(contas.render(ctx(demo())), AMOUNT);
  assert.doesNotMatch(contas.render(hiddenCtx(demo())), AMOUNT);
  const id = demo().accounts[0].id;
  assert.match(contas.detail(ctx(demo()), { accountId: id, visibleLimit: 40 }), AMOUNT);
  assert.doesNotMatch(contas.detail(hiddenCtx(demo()), { accountId: id, visibleLimit: 40 }), AMOUNT);
});

test('Detalhe da conta lista movimentos, ações e trata conta em falta', () => {
  const c = ctx(demo());
  const html = contas.detail(c, { accountId: c.ledger.accounts[0].id, visibleLimit: 40 });
  assert.ok(html.includes('id="edit-account"') && html.includes('id="ask-archive"') && html.includes('movement-row'));
  assert.ok(html.includes('data-page="contas"'));
  assert.ok(contas.detail(c, { accountId: 'nao-existe', visibleLimit: 40 }).includes('Conta indisponível'));
});

test('Editor da conta distingue nova de existente e trata ausência de formulário', () => {
  const c = ctx(demo());
  const add = contas.editor(c, { form: { command: 'account.add', id: 'x', name: 'N', type: 'Banco', opening: '10,00' } });
  assert.ok(add.includes('Nova conta') && add.includes('name="opening"') && add.includes('id="save-account"'));
  const upd = contas.editor(c, { form: { command: 'account.update', id: 'x', name: 'N', type: 'Banco', opening: '10,00' } });
  assert.ok(upd.includes('Editar conta') && !upd.includes('name="opening"'));
  assert.ok(contas.editor(c, { form: null }).includes('Conta indisponível'));
});

test('Arquivar propõe reativar numa conta arquivada', () => {
  const ledger = demo();
  ledger.accounts[0].archived = true;
  assert.ok(contas.archive(ctx(ledger), { accountId: ledger.accounts[0].id }).includes('Reativar conta?'));
  assert.ok(contas.archive(ctx(demo()), { accountId: demo().accounts[0].id }).includes('Arquivar conta?'));
});

test('Banner de rascunho de conta aparece com accountDraft', () => {
  const html = contas.render(ctx(demo(), { state: { hidden: false, accountDraft: { token: 't' } } }));
  assert.ok(html.includes('id="resume-account"'));
});
