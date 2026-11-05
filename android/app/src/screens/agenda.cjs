'use strict';
const kit = require('../ui/kit.cjs');
const { icon } = require('../ui/icons.cjs');
const V = require('../view-model.cjs');
const Agenda = require('../agenda.cjs');
const K = require('../../../shared/commitment-drafts.cjs');
const Forms = require('../../../shared/form-drafts.cjs');
const Commitments = require('../../../shared/commitments.cjs');
const P = require('../../../shared/protocol.cjs');
const { row } = require('./movimentos.cjs');
const { periodControls } = require('./resumo.cjs');

function back(page, label) {
  return '<button type="button" class="back" data-page="' + page + '">' + label + '</button>';
}

function banners(state) {
  return (state.paymentDraft
    ? '<section class="draft-banner"><strong>Tens um pagamento por concluir</strong><button id="resume-payment">Retomar pagamento</button><button id="ask-discard-payment">Descartar rascunho</button></section>' : '')
    + (state.commitmentDraft
      ? '<section class="draft-banner"><strong>Tens um compromisso por concluir</strong><p>O preenchimento está guardado neste dispositivo.</p><button type="button" id="resume-commitment">Retomar compromisso</button><button type="button" id="ask-discard-commitment">Descartar rascunho</button></section>' : '');
}

function entry(ctx, t) {
  const e = kit.escape;
  return '<article class="review-card agenda-entry"><div><strong>' + e(t.description || 'Compromisso') + '</strong>'
    + '<small>' + e(V.dateLabel(t.date)) + ' · ' + e(t.agendaSource) + '</small>'
    + '<small>' + e(t.account || 'Conta não indicada') + (t.targetAccount ? ' → ' + e(t.targetAccount) : '') + '</small>'
    + '<small class="agenda-state">' + e(t.status) + (t.estimated ? ' · Estimativa' : '') + '</small>'
    + (t.occurrenceNote ? '<p class="sub">' + e(t.occurrenceNote) + '</p>' : '')
    + (t.agendaSource === 'Compromisso' ? '<button type="button" class="commit-open" data-commitment="' + e(t.id) + '">Abrir compromisso</button>' : '') + '</div>'
    + '<span class="amount">' + (t.type === 'transfer' ? '↔ ' : t.type === 'expense' ? '−' : '+') + kit.money(t.amountCents, ctx.state.hidden) + '</span></article>';
}

// Agenda do mês. view: {period, showCompleted}.
function render(ctx, view = {}) {
  const period = view.period || ctx.today.slice(0, 7), showCompleted = !!view.showCompleted, hidden = ctx.state.hidden;
  const result = Agenda.agenda(ctx.ledger, period, ctx.today, showCompleted);
  const tiles = '<div class="ch-tiles">'
    + '<article class="ch-tile is-red"><span class="ch-tile-icon">' + icon('alert') + '</span><span class="ch-tile-label">A pagar</span><strong class="ch-tile-value" data-agenda-pay>' + kit.money(result.payCents, hidden) + '</strong></article>'
    + '<article class="ch-tile is-green"><span class="ch-tile-icon">' + icon('check') + '</span><span class="ch-tile-label">A receber</span><strong class="ch-tile-value" data-agenda-receive>' + kit.money(result.receiveCents, hidden) + '</strong></article>'
    + '</div>';
  return banners(ctx.state) + back('mais', '‹ Mais') + '<h1>Agenda</h1><p class="sub">Compromissos, recorrências e subscrições deste mês.</p>'
    + periodControls(ctx.ledger, period, ctx.today)
    + '<button type="button" id="new-commitment" class="primary full">+ Novo compromisso</button>'
    + tiles
    + '<p class="sub">' + result.pendingCount + ' por concluir' + (result.estimated ? ' · Inclui estimativas' : '') + '. Valores previstos; o saldo só muda com movimentos registados.</p>'
    + '<label class="agenda-check"><input id="agenda-completed" type="checkbox" ' + (showCompleted ? 'checked' : '') + '> Mostrar recorrências e subscrições concluídas</label>'
    + '<div class="agenda-list">' + (result.rows.map(t => entry(ctx, t)).join('') || '<p class="empty">Sem compromissos previstos neste mês.</p>') + '</div>';
}

function originalDetail(ctx, commitmentId) {
  const e = kit.escape, ledger = ctx.ledger, r = ledger.pendingPayments.find(t => t.id === commitmentId);
  if (!r) return '<button data-page="agenda">‹ Agenda</button><h1>Compromisso indisponível</h1>';
  return back('agenda', '‹ Agenda') + '<h1>' + e(r.description) + '</h1>'
    + '<section class="review-card"><p class="review-value">' + kit.money(P.Finance.cents(r.amount), ctx.state.hidden) + '</p>'
    + '<p>' + e(V.dateLabel(r.date)) + ' · ' + e(r.account || 'Conta não indicada') + '</p><small>' + e(r.category || 'Outros') + '</small></section>'
    + (Commitments.editable(ledger, r)
      ? '<div class="review-actions"><button id="edit-commitment" class="primary">Editar compromisso</button><button id="reschedule-commitment">Reagendar</button></div>'
      : '<p class="note">Este compromisso exige gestão especializada.</p>')
    + (r.reschedules && r.reschedules.length
      ? '<h2>Histórico de reagendamento</h2><ul class="commit-history">' + r.reschedules.map(x => '<li>' + e(V.dateLabel(x.from)) + ' → ' + e(V.dateLabel(x.to)) + '<p>' + e(x.reason) + '</p></li>').join('') + '</ul>' : '');
}

// Detalhe do compromisso e pagamentos já registados. view: {commitmentId}.
function commitment(ctx, view = {}) {
  const ledger = ctx.ledger, id = view.commitmentId;
  const t = ledger.pendingPayments.find(x => x.id === id), paid = ledger.transactions.filter(x => x.pendingId === id);
  let html = t ? originalDetail(ctx, id) : '<button data-page="agenda">‹ Agenda</button><h1>' + (paid.length ? 'Compromisso liquidado' : 'Compromisso indisponível') + '</h1>';
  if (t && Commitments.payable(ledger, t)) html += '<button id="open-payment" class="primary full">' + (t.type === 'income' ? 'Registar recebimento' : 'Registar pagamento') + '</button>';
  if (paid.length) html += '<h2>Pagamentos registados</h2>' + paid.map(x => row(ctx, x)).join('');
  return html;
}

// Formulário de compromisso (novo, editar, reagendar). view: {form, record}.
function form(ctx, view = {}) {
  const e = kit.escape, cf = view.form, cr = view.record;
  if (!cf || !cr) return '<p>Compromisso indisponível.</p>';
  const accounts = ctx.ledger.accounts.filter(a => !a.archived), available = accounts.some(a => a.id === cf.accountId), reason = K.reason(ctx.state, cr);
  const sel = (value, mine) => value === mine ? 'selected' : '';
  return back('agenda', '‹ Agenda') + '<h1>' + (cf.command === 'commitment.add' ? 'Novo compromisso' : cf.action === 'reschedule' ? 'Reagendar compromisso' : 'Editar compromisso') + '</h1>'
    + '<p class="sub">Guardar atualiza a previsão. O saldo mantém-se até registares o pagamento ou recebimento.</p>'
    + '<form id="commitment-form"><label>Tipo<select name="type"><option value="expense" ' + sel(cf.type, 'expense') + '>Despesa</option><option value="income" ' + sel(cf.type, 'income') + '>Receita</option></select></label>'
    + '<label>Descrição<input name="description" maxlength="120" required value="' + e(cf.description) + '"></label>'
    + '<label>Valor (€)<input name="amount" inputmode="decimal" required value="' + e(cf.amount) + '"></label>'
    + '<label>Conta<select name="accountId">' + (!available ? '<option value="' + e(cf.accountId) + '" selected>Conta indisponível · escolhe outra</option>' : '')
    + accounts.map(a => '<option value="' + e(a.id) + '" ' + sel(a.id, cf.accountId) + '>' + e(a.name) + '</option>').join('') + '</select></label>'
    + '<label>Data prevista<input name="date" type="date" required value="' + e(cf.date) + '"></label>'
    + '<label>Categoria<input name="category" maxlength="120" required value="' + e(cf.category) + '" placeholder="Ex.: Casa / Renda"></label>'
    + (cf.command === 'commitment.update'
      ? '<label>Motivo do reagendamento (se mudares a data)<textarea name="reason" maxlength="500" rows="3">' + e(cf.reason) + '</textarea></label>'
      : '<input name="reason" type="hidden" value="">')
    + '<p id="commitment-status" role="status">' + (cr.sequence ? 'Rascunho guardado neste dispositivo.' : 'O preenchimento é guardado como rascunho.') + '</p>'
    + (reason ? '<p class="note">' + e(reason) + '</p>' : '')
    + '<button type="button" class="primary full" id="save-commitment">Guardar compromisso</button>'
    + '<button id="ask-discard-commitment" class="full" type="button">Descartar rascunho</button></form>';
}

// Registo de pagamento ou recebimento. view: {form, record}.
function payment(ctx, view = {}) {
  const e = kit.escape, pf = view.form, pr = view.record;
  if (!pf) return '<p>Pagamento indisponível.</p>';
  const t = ctx.ledger.pendingPayments.find(x => x.id === pf.id), reason = Forms.staleReason(ctx.state, pr);
  return back('agenda', '‹ Agenda') + '<h1>' + (t && t.type === 'income' ? 'Registar recebimento' : 'Registar pagamento') + '</h1>'
    + '<p>' + e(t ? t.description : 'Compromisso indisponível') + '</p>'
    + '<p>Por liquidar: <strong>' + (t ? kit.money(P.Finance.cents(t.amount), ctx.state.hidden) : 'Indisponível') + '</strong></p>'
    + '<p class="sub">Confirma apenas dinheiro que já entrou ou saiu. Num pagamento parcial, o restante continua na Agenda.</p>'
    + '<form id="payment-form"><label>Valor (€)<input name="amount" inputmode="decimal" required value="' + e(pf.amount) + '"></label>'
    + '<label>Data efetiva<input name="date" type="date" required max="' + e(ctx.today) + '" value="' + e(pf.date) + '"></label>'
    + '<p id="payment-status" role="status">' + (pr.sequence ? 'Rascunho guardado neste dispositivo.' : 'O preenchimento será guardado neste dispositivo.') + '</p>'
    + (reason ? '<p class="note">' + e(reason) + '</p>' : '')
    + '<button id="save-payment" type="button" class="primary full">Confirmar registo</button>'
    + '<button id="ask-discard-payment" class="full" type="button">Descartar rascunho</button></form>';
}

function discardCommitment() {
  return '<h1>Descartar o rascunho do compromisso?</h1><p>O preenchimento por concluir será removido. Os compromissos e movimentos guardados mantêm-se.</p>'
    + '<div class="review-actions"><button data-page="agenda">Manter rascunho</button><button id="confirm-discard-commitment">Descartar rascunho</button></div>';
}

function discardPayment() {
  return '<h1>Descartar o pagamento por concluir?</h1><p>O compromisso e os pagamentos guardados mantêm-se.</p>'
    + '<button data-page="agenda">Manter rascunho</button><button id="confirm-discard-payment">Descartar rascunho</button>';
}

module.exports = { render, commitment, form, payment, discardCommitment, discardPayment };
