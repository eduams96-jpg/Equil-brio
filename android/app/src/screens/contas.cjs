'use strict';
const kit = require('../ui/kit.cjs');
const { fullState } = require('./state.cjs');
const V = require('../view-model.cjs');
const P = require('../../../shared/protocol.cjs');
const Accounts = require('../../../shared/accounts.cjs');
const { row, stateOf } = require('./movimentos.cjs');

function balance(ledger, account) {
  return P.Finance.cents(P.Finance.balanceAt(ledger, account));
}

function accountCard(ctx, a) {
  const e = kit.escape, hidden = ctx.state.hidden, confirmedLedger = fullState(ctx).confirmed.ledger;
  const confirmed = confirmedLedger.accounts.find(c => c.id === a.id);
  return '<button type="button" class="review-card account-card" data-account="' + e(a.id) + '"><div><h2>' + e(a.name) + '</h2>'
    + '<small>' + e(a.type) + (a.archived ? ' · Arquivada' : '') + '</small></div>'
    + '<div><strong class="review-value" data-balance="' + e(a.id) + '">' + kit.money(balance(ctx.ledger, a), hidden) + '</strong>'
    + '<small>' + (confirmed ? 'Confirmado: ' + kit.money(balance(confirmedLedger, confirmed), hidden) : 'Criada neste dispositivo') + '</small></div></button>';
}

function back(page, label) {
  return '<button type="button" class="back" data-page="' + page + '">' + label + '</button>';
}

function render(ctx) {
  const ledger = ctx.ledger, hidden = ctx.state.hidden;
  const active = ledger.accounts.filter(a => !a.archived), archived = ledger.accounts.filter(a => a.archived);
  const total = active.reduce((sum, a) => sum + balance(ledger, a), 0);
  const tiles = '<div class="ch-tiles">'
    + kit.tile({ tone: 'blue', icon: 'account', label: 'Saldo das contas ativas', value: kit.money(total, hidden), detail: 'Inclui alterações locais' })
    + kit.tile({ tone: 'green', icon: 'check', label: 'Contas ativas', value: String(active.length), detail: archived.length ? archived.length + ' arquivada' + (archived.length === 1 ? '' : 's') : 'Nenhuma arquivada' })
    + '</div>';
  const banner = ctx.state.accountDraft
    ? '<section class="draft-banner"><strong>Tens uma conta por concluir</strong><button id="resume-account">Retomar conta</button></section>' : '';
  return banner + back('mais', '‹ Mais') + '<h1>Contas</h1><p class="sub">Os saldos incluem alterações locais. Arquivar conserva o histórico e o saldo.</p>'
    + tiles
    + '<button class="primary full" id="new-account">+ Nova conta</button>'
    + (active.map(a => accountCard(ctx, a)).join('') || '<p class="empty">Sem contas ativas. Cria ou reativa uma conta.</p>')
    + (archived.length ? '<details class="archived-accounts"><summary>Contas arquivadas · ' + archived.length + '</summary>' + archived.map(a => accountCard(ctx, a)).join('') + '</details>' : '');
}

// Detalhe da conta. view: {accountId, visibleLimit}.
function detail(ctx, view = {}) {
  const e = kit.escape, ledger = ctx.ledger;
  const account = ledger.accounts.find(a => a.id === view.accountId);
  const rows = account ? V.movements(ledger, stateOf(ctx), { accountId: account.id }, view.visibleLimit == null ? 40 : view.visibleLimit) : { rows: [], total: 0 };
  const body = account
    ? '<section class="balance"><span>Saldo atual</span><strong>' + kit.money(balance(ledger, account), ctx.state.hidden) + '</strong><small>' + e(account.type) + (account.archived ? ' · Arquivada' : '') + '</small></section>'
      + '<div class="review-actions"><button id="edit-account">Editar conta</button><button id="ask-archive">' + (account.archived ? 'Reativar conta' : 'Arquivar conta') + '</button></div>'
      + '<h2>Movimentos desta conta</h2><p class="sub">Transferências mostram o efeito nesta conta.</p>'
      + (rows.rows.map(t => row(ctx, t, account.name)).join('') || '<p class="empty">Ainda não existem movimentos nesta conta.</p>')
      + (rows.rows.length < rows.total ? '<button id="show-more" class="full">Mostrar mais movimentos</button>' : '')
    : '';
  return back('contas', '‹ Contas') + '<h1>' + (account ? e(account.name) : 'Conta indisponível') + '</h1>' + body;
}

// Editor de conta nova/existente. view: {form}. Os ids e names são os que main.js já usa.
function editor(ctx, view = {}) {
  const e = kit.escape, a = view.form;
  if (!a) return '<h1>Conta indisponível</h1><button data-page="contas">Voltar</button>';
  const add = a.command === 'account.add';
  const types = [...new Set([...Accounts.types, a.type])].map(t => '<option ' + (t === a.type ? 'selected' : '') + '>' + e(t) + '</option>').join('');
  return back('contas', '‹ Contas') + '<h1>' + (add ? 'Nova conta' : 'Editar conta') + '</h1>'
    + '<p class="sub">' + (add ? 'Define o saldo anterior aos movimentos que vais registar.' : 'Mudar o nome mantém os movimentos e os saldos desta conta.') + '</p>'
    + '<form id="account-form"><label>Nome<input name="name" value="' + e(a.name) + '" maxlength="80" required autocomplete="off"></label>'
    + '<label>Tipo<select name="type">' + types + '</select></label>'
    + (add ? '<label>Saldo inicial (€)<input name="opening" value="' + e(a.opening) + '" inputmode="decimal" required></label>' : '<p class="note">O saldo inicial é conservado. Esta edição não altera valores.</p>')
    + '<p class="sub">Só fica guardado depois de tocares em Guardar conta.</p>'
    + '<button class="primary full" id="save-account" type="button">Guardar conta</button></form>';
}

// Confirmação de arquivo/reativação. view: {accountId}.
function archive(ctx, view = {}) {
  const e = kit.escape, a = ctx.ledger.accounts.find(x => x.id === view.accountId);
  const verb = a && a.archived ? 'Reativar' : 'Arquivar';
  return '<h1>' + verb + ' conta?</h1><p>' + e(a ? a.name : 'Conta indisponível') + '</p>'
    + '<p>O saldo e todos os movimentos são conservados. Uma conta arquivada deixa de estar disponível para novos movimentos.</p>'
    + '<div class="review-actions"><button data-page="conta">Cancelar</button><button id="confirm-archive" class="primary">' + verb + ' conta</button></div>';
}

// Saída de um formulário de conta por guardar.
function leave() {
  return '<h1>Sair sem guardar a conta?</h1><p>O preenchimento desta conta ainda não foi guardado. Os movimentos e os rascunhos existentes mantêm-se.</p>'
    + '<div class="review-actions"><button id="stay-account" class="primary">Continuar a preencher</button><button id="leave-account">Sair sem guardar</button></div>';
}

module.exports = { render, detail, editor, archive, leave };
