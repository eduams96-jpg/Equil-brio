'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');
const P = require('../../../shared/protocol.cjs');
const D = require('../../../shared/drafts.cjs');
const Policy = require('../../../shared/movement-policy.cjs');
const Consult = require('../financial-consultation.cjs');

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


// Divisão por categorias e ligações do movimento (parte final do detalhe).
function consultation(ctx, t) {
  const info = Consult.movement(t), e = kit.escape, hidden = ctx.state.hidden;
  return (info.splits.length ? '<h2>Divisão por categorias</h2><div class="split-list">' + info.splits.map(p => '<div class="info-line"><span>' + e(p.category) + '</span><strong>' + kit.money(p.amountCents, hidden) + '</strong></div>').join('') + '</div>' : '')
    + (info.links.length ? '<p class="note">' + info.links.map(e).join(' · ') + '</p>' : '')
    + (info.pendingTransfer ? '<p class="note">Transferência por confirmar: o destino ainda não recebeu este valor.</p>' : '');
}

// Detalhe do movimento. view: {movementId, returnPage}. Só constrói HTML; editar/eliminar ficam em main.js.
function detail(ctx, view = {}) {
  const e = kit.escape, hidden = ctx.state.hidden;
  const t = ctx.ledger.transactions.find(x => x.id === view.movementId);
  const info = t ? V.movementInfo(t) : null;
  const body = t
    ? '<section class="review-card"><h2>' + e(t.description) + '</h2><p class="review-value">' + info.symbol + kit.money(info.amountCents, hidden) + '</p>'
      + '<p>' + e(info.dates) + ' · ' + e(info.route) + '</p><small>' + e(info.label) + '</small>'
      + (t.beneficiary ? '<p class="movement-meta">Estabelecimento<br><strong>' + e(t.beneficiary) + '</strong></p>' : '')
      + (t.note ? '<p class="movement-meta note-text" data-note-color="' + e(t.noteColor || '') + '">Nota<br><span>' + e(t.note) + '</span></p>' : '')
      + '</section>'
      + (Policy.editable(t) ? '<div class="review-actions"><button id="edit-movement" class="primary">Editar</button><button id="ask-delete">Eliminar</button></div>' : '<p class="sub">Usa o percurso especializado para alterar este movimento.</p>')
    : '<p>O movimento já não existe nesta vista.</p>';
  return '<button class="back" data-page="' + e(view.returnPage || 'movimentos') + '">‹ Voltar</button><h1>Detalhe do movimento</h1>' + body + (t ? consultation(ctx, t) : '');
}

function categorySuggestions(ledger, index, prefix = []) {
  const paths = ['Alimentação', 'Casa', 'Transportes', 'Rendimentos', 'Outros', ...ledger.transactions.map(t => t.category), ...(ledger.categoryCatalog || []).filter(c => !c.deleted).map(c => c.name)].filter(Boolean).map(c => P.Finance.categoryParts(c));
  return [...new Set(paths.filter(parts => prefix.every((p, i) => !p || parts[i] === p)).map(parts => parts[index]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

// Formulário novo/editar/rever. view: {draft, draftRecord, resolvingId}. Os ids e names são os que main.js já usa.
function form(ctx, view) {
  const e = kit.escape, ledger = ctx.ledger, d = view.draft, record = view.draftRecord, resolvingId = view.resolvingId;
  const transfer = d.type === 'transfer';
  const opts = (items, value) => items.map(([id, label]) => '<option value="' + e(id) + '"' + (id === value ? ' selected' : '') + '>' + e(label) + '</option>').join('');
  const types = d.command === 'new' ? [['expense', 'Despesa'], ['income', 'Receita'], ['transfer', 'Transferência']] : d.command.startsWith('transfer.') ? [['transfer', 'Transferência']] : [['expense', 'Despesa'], ['income', 'Receita']];
  const accounts = ledger.accounts.filter(a => !a.archived).map(a => [a.id, a.name]);
  const accountOptions = value => opts(accounts.some(([id]) => id === value) ? accounts : [[value, 'Conta indisponível · escolhe outra'], ...accounts], value);
  const reason = D.staleReason(ctx.state, record);
  const labels = ['Categoria', 'Subcategoria 1', 'Subcategoria 2', 'Subcategoria 3'];
  const keys = ['category', 'subcategory', 'categoryDetail', 'categorySubdetail'];
  const category = keys.map((key, index) => '<label>' + labels[index] + '<input name="' + key + '" value="' + e(d[key]) + '" maxlength="80" list="category-options-' + index + '"' + (index ? ' placeholder="Opcional"' : '') + '>'
    + '<datalist id="category-options-' + index + '">' + categorySuggestions(ledger, index, ['category', 'subcategory', 'categoryDetail'].slice(0, index).map(k => d[k])).map(v => '<option value="' + e(v) + '"></option>').join('') + '</datalist></label>').join('');
  return '<button type="button" class="back" data-page="movimentos">‹ Voltar</button><h1>' + (resolvingId ? 'Rever proposta' : d.command === 'new' ? 'Novo movimento' : 'Editar movimento') + '</h1>'
    + (resolvingId ? '<p class="sub">A proposta anterior será conservada. Esta revisão fica por confirmar até sincronizares.</p>' : '')
    + '<form id="movement"><label>Tipo<select name="type" id="movement-type">' + opts(types, d.type) + '</select></label>'
    + '<label>Valor (€)<input name="amount" inputmode="decimal" value="' + e(d.amount) + '" required autocomplete="off"></label>'
    + '<label>Descrição<input name="description" maxlength="120" value="' + e(d.description) + '" required></label>'
    + '<label><span id="account-label">' + (transfer ? 'De' : 'Conta') + '</span><select name="account">' + accountOptions(d.accountId) + '</select></label>'
    + '<label id="target-field"' + (transfer ? '' : ' hidden') + '>Para<select name="target">' + accountOptions(d.targetId) + '</select></label>'
    + '<fieldset id="category-field"' + (transfer ? ' hidden' : '') + '><legend>Categoria</legend>' + category + '</fieldset>'
    + '<label>Data<input name="date" type="date" value="' + e(d.date) + '" required></label>'
    + '<details class="movement-options"' + (d.note || d.beneficiary || d.noteColor ? ' open' : '') + '><summary>Estabelecimento, nota e cor</summary>'
    + '<label>Estabelecimento<input name="beneficiary" maxlength="160" value="' + e(d.beneficiary) + '" autocomplete="off"></label>'
    + '<label>Nota<textarea name="note" maxlength="1000" rows="3">' + e(d.note) + '</textarea></label>'
    + '<label>Cor da nota<select name="noteColor">' + opts([['', 'Automática'], ['default', 'Sem destaque'], ['blue', 'Azul'], ['green', 'Verde'], ['purple', 'Roxo'], ['orange', 'Laranja'], ['red', 'Vermelho']], d.noteColor) + '</select></label>'
    + '<label>Classificação<select name="expenseNature">' + opts([['variable', 'Variável'], ['fixed', 'Fixa'], ['exceptional', 'Extraordinária']], d.expenseNature) + '</select></label></details>'
    + '<p id="draft-status" role="status" aria-live="polite">' + (record.sequence ? 'Rascunho guardado neste dispositivo.' : 'O preenchimento é guardado como rascunho.') + '</p>'
    + (reason ? '<p class="note">' + e(reason) + '</p>' : '')
    + '<button type="button" class="primary" id="save">' + (resolvingId ? 'Guardar proposta revista' : 'Guardar no dispositivo') + '</button></form>';
}

module.exports = { render, bind, row, stateOf, detail, form, categorySuggestions, MONTHS };
