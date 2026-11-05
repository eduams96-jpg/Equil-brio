'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');
const Agenda = require('../agenda.cjs');
const { row, stateOf, draftBanner, MONTHS } = require('./movimentos.cjs');
const Consult = require('../financial-consultation.cjs');
const P = require('../../../shared/protocol.cjs');

function periodControls(ledger, period, today) {
  const years = V.years(ledger, period, today).map(y => '<option value="' + y + '"' + (y === Number(period.slice(0, 4)) ? ' selected' : '') + '>' + y + '</option>').join('');
  const months = MONTHS.map((name, i) => '<option value="' + String(i + 1).padStart(2, '0') + '"' + (i + 1 === Number(period.slice(5)) ? ' selected' : '') + '>' + name + '</option>').join('');
  return '<div class="period-controls" aria-label="Mês e ano"><button type="button" id="period-prev" aria-label="Mês anterior">‹</button>'
    + '<label>Ano<select id="period-year">' + years + '</select></label><label>Mês<select id="period-month">' + months + '</select></label>'
    + '<button type="button" id="period-next" aria-label="Mês seguinte">›</button></div>';
}

function count(value) {
  return Number.isFinite(value) ? String(value) : '—';
}

// Rascunhos por concluir (movimento, compromisso, pagamento), do mais ao menos recente.
function banners(ctx) {
  return draftBanner(ctx)
    + (ctx.state.commitmentDraft ? '<section class="draft-banner"><strong>Tens um compromisso por concluir</strong><button data-page="agenda">Abrir Agenda</button></section>' : '')
    + (ctx.state.paymentDraft ? '<section class="draft-banner"><strong>Tens um pagamento por concluir</strong><button id="resume-payment">Retomar pagamento</button><button id="ask-discard-payment">Descartar rascunho</button></section>' : '');
}

function render(ctx, view = {}) {
  const hidden = ctx.state.hidden;
  const period = view.period || ctx.today.slice(0, 7);
  const ledger = ctx.ledger;
  const stats = V.summary(ledger, period);
  const counts = ctx.counts || {};
  const agendaCount = Agenda.agenda(ledger, period, ctx.today, false).pendingCount;
  const recent = V.movements(ledger, stateOf(ctx), {}, 5).rows;
  const note = ctx.pending ? 'Inclui alterações locais por confirmar' : (ctx.release ? 'Contas deste aparelho' : 'Contas de demonstração');
  const tiles = [
    kit.tile({ tone: counts.notices > 0 ? 'red' : 'amber', icon: 'bell', label: 'Avisos', value: count(counts.notices), detail: 'O que merece atenção', page: 'avisos' }),
    kit.tile({ tone: 'blue', icon: 'calendar', label: 'Agenda', value: count(agendaCount), detail: 'Por tratar em ' + MONTHS[Number(period.slice(5)) - 1], page: 'agenda' }),
    kit.tile({ tone: 'green', icon: 'cart', label: 'Lista de compras', value: count(counts.shopping), detail: 'Artigos por comprar', page: 'compras' }),
  ].join('');
  return banners(ctx) + '<h1>Resumo</h1><p class="sub">' + kit.escape(kit.syncStamp(ctx.lastSync, new Date())) + '</p>'
    + periodControls(ledger, period, ctx.today)
    + '<section class="balance"><span>Saldo total · todas as contas</span><strong>' + kit.money(stats.balanceCents, hidden) + '</strong><small>' + kit.escape(note) + '</small></section>'
    + '<div class="pair"><div class="stat"><small>Gastos do mês</small><span class="amount">' + kit.money(stats.expenseCents, hidden) + '</span></div>'
    + '<div class="stat"><small>Rendimentos do mês</small><span class="amount">' + kit.money(stats.incomeCents, hidden) + '</span></div></div>'
    + '<p class="month-result">Resultado do mês <strong>' + kit.money(stats.resultCents, hidden) + '</strong></p>'
    + '<div class="ch-tiles is-three">' + tiles + '</div>'
    + '<button type="button" class="primary full" data-page="novo">+ Novo movimento</button>'
    + '<div class="section-heading"><h2>Últimos movimentos</h2><button type="button" id="see-month" class="text-button">Ver todos</button></div>'
    + (recent.map(t => row(ctx, t)).join('') || '<p class="empty">Ainda não há movimentos.</p>')
    + '<button class="full agenda-shortcut" data-page="consulta-financeira">Créditos e prestações · consulta</button>';
}

// Créditos e prestações (consulta). view: {period}.
function financial(ctx, view = {}) {
  const e = kit.escape, hidden = ctx.state.hidden, period = view.period || ctx.today.slice(0, 7);
  const c = Consult.debts(ctx.ledger, period), m = cents => kit.money(cents, hidden);
  return '<button class="back" data-page="resumo">‹ Resumo</button><h1>Créditos e prestações</h1>'
    + '<p class="sub">Consulta dos registos existentes. Alterações e pagamentos especializados mantêm o percurso no PC.</p>'
    + periodControls(ctx.ledger, period, ctx.today)
    + '<h2>Créditos</h2>' + (c.debts.map(d => '<section class="review-card"><h3>' + e(d.name) + '</h3><small>Capital em dívida</small><p class="review-value">' + m(d.balanceCents) + '</p><p>Prestação: ' + m(d.paymentCents) + '</p></section>').join('') || '<p class="empty">Sem créditos registados.</p>')
    + '<h2>Prestações estimadas do mês</h2><p class="sub">Estimativas do modelo Windows; não são pagamentos registados.</p>'
    + (c.estimates.map(x => '<section class="review-card"><strong>' + e(x.description) + '</strong><p>' + e(V.dateLabel(x.date)) + ' · ' + m(P.Finance.cents(x.amount)) + '</p></section>').join('') || '<p class="empty">Sem prestações estimadas neste mês.</p>')
    + '<h2>Compras em prestações</h2>'
    + (c.plans.map(p => '<section class="review-card"><h3>' + e(p.description) + '</h3>' + p.payments.map(x => '<div class="info-line"><span>' + e(V.dateLabel(x.date)) + '</span><strong>' + m(x.remainingCents) + ' por liquidar</strong></div>').join('') + '</section>').join('') || '<p class="empty">Sem planos de prestações.</p>');
}

module.exports = { render, periodControls, financial };
