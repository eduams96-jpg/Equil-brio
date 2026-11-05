'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NO_FILTERS = { query: '', period: '', accountId: '', type: '', status: '' };
const TYPES = [['', 'Todos'], ['expense', 'Despesas'], ['income', 'Rendimentos'], ['transfer', 'Transferências']];
const STATUSES = [['', 'Todos'], ['confirmed', 'Confirmados'], ['pending', 'Por confirmar'], ['review', 'A rever']];

// O estado dos ecrãs pode vir sem fila de envio (pré-visualização, testes).
function stateOf(ctx) {
  return { outbox: [], ...ctx.state };
}

function statusMap(ctx) {
  return V.statuses(stateOf(ctx));
}

// Uma linha de movimento; `accountName` mostra o efeito numa conta (ecrã da conta).
function row(ctx, t, accountName = '') {
  const status = statusMap(ctx)[t.id], info = V.movementInfo(t, accountName);
  const date = accountName && t.targetAccount === accountName ? t.targetDate || t.date : t.date;
  return '<button type="button" class="row movement-row" data-open="' + kit.escape(t.id) + '"><div><strong>' + kit.escape(t.description) + '</strong>'
    + '<small>' + kit.escape(V.dateLabel(date)) + ' · ' + kit.escape(info.route) + '</small>'
    + '<small>' + kit.escape(t.category || '') + (status ? ' · ' + (status === 'pending' ? 'Por confirmar' : 'A rever') : '') + '</small></div>'
    + '<span class="amount">' + info.symbol + kit.money(info.amountCents, ctx.state.hidden) + '</span></button>';
}

function options(values, value) {
  return values.map(([id, label]) => '<option value="' + kit.escape(id) + '"' + (id === value ? ' selected' : '') + '>' + kit.escape(label) + '</option>').join('');
}

function pillOptions(list) {
  return list.map(([value, label]) => ({ value, label }));
}

function render(ctx, view = {}) {
  const filters = { ...NO_FILTERS, ...(view.filters || {}) };
  const limit = view.visibleLimit == null ? 40 : view.visibleLimit;
  const ledger = ctx.ledger;
  const result = V.movements(ledger, stateOf(ctx), filters, limit);
  const months = [...new Set([ctx.today.slice(0, 7), ...ledger.transactions.map(t => t.date.slice(0, 7))])].sort().reverse();
  const open = filters.period || filters.accountId ? ' open' : '';
  const found = result.total + ' ' + (result.total === 1 ? 'movimento encontrado' : 'movimentos encontrados');
  const empty = '<p class="empty">' + (ledger.transactions.length
    ? 'Não há movimentos com esta pesquisa. Altera ou limpa os filtros.'
    : 'Ainda não existem movimentos. Usa «Novo movimento» para começar.') + '</p>';
  return '<h1>Movimentos</h1><p class="sub">Consulta e gere os registos deste dispositivo.</p>'
    + '<button type="button" class="primary full" data-page="novo">+ Novo movimento</button>'
    + '<div class="movement-filters">'
    + kit.search('movement-search', filters.query, 'Descrição, categoria ou conta')
    + kit.pills('type', pillOptions(TYPES), filters.type)
    + kit.pills('status', pillOptions(STATUSES), filters.status)
    + '<details id="movement-filters"' + open + '><summary>Período e conta</summary><div class="filter-grid">'
    + '<label>Período<select id="filter-period">' + options([['', 'Todos os meses'], ...months.map(m => [m, MONTHS[Number(m.slice(5)) - 1] + ' ' + m.slice(0, 4)])], filters.period) + '</select></label>'
    + '<label>Conta<select id="filter-account">' + options([['', 'Todas as contas'], ...ledger.accounts.map(a => [a.id, a.name])], filters.accountId) + '</select></label>'
    + '</div></details>'
    + '<button type="button" id="clear-filters" class="text-button">Limpar pesquisa e filtros</button></div>'
    + '<p class="sub result-count" aria-live="polite">' + found + '</p>'
    + '<div id="movement-results">' + (result.rows.map(t => row(ctx, t)).join('') || empty) + '</div>'
    + (result.rows.length < result.total ? '<button id="show-more" type="button" class="full">Mostrar mais · ' + result.rows.length + ' de ' + result.total + '</button>' : '');
}

// Os botões são recriados a cada render, por isso os ouvintes não se acumulam.
function bind(ctx, root) {
  root.querySelectorAll('[data-pill-type],[data-pill-status]').forEach(button => {
    button.addEventListener('click', () => {
      const field = button.hasAttribute('data-pill-type') ? 'type' : 'status';
      ctx.setFilter(field, button.getAttribute('data-pill-' + field));
    });
  });
}

module.exports = { render, bind, row, stateOf, MONTHS };
