'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');
const Agenda = require('../agenda.cjs');
const { row, stateOf, MONTHS } = require('./movimentos.cjs');

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

function render(ctx, view = {}) {
  const hidden = ctx.state.hidden;
  const period = view.period || ctx.today.slice(0, 7);
  const ledger = ctx.ledger;
  const stats = V.summary(ledger, period);
  const counts = ctx.counts || {};
  let agendaCount = null;
  try { agendaCount = Agenda.agenda(ledger, period, ctx.today, false).pendingCount; } catch { agendaCount = null; }
  const recent = V.movements(ledger, stateOf(ctx), {}, 5).rows;
  const note = ctx.pending ? 'Inclui alterações locais por confirmar' : (ctx.release ? 'Contas deste aparelho' : 'Contas de demonstração');
  const tiles = [
    kit.tile({ tone: counts.notices > 0 ? 'red' : 'amber', icon: 'bell', label: 'Avisos', value: count(counts.notices), detail: 'O que merece atenção', page: 'avisos' }),
    kit.tile({ tone: 'blue', icon: 'calendar', label: 'Agenda', value: count(agendaCount), detail: 'Por tratar em ' + MONTHS[Number(period.slice(5)) - 1], page: 'agenda' }),
    kit.tile({ tone: 'green', icon: 'cart', label: 'Lista de compras', value: count(counts.shopping), detail: 'Artigos por comprar', page: 'compras' }),
  ].join('');
  return '<h1>Resumo</h1><p class="sub">' + kit.escape(kit.syncStamp(ctx.lastSync, new Date())) + '</p>'
    + periodControls(ledger, period, ctx.today)
    + '<section class="balance"><span>Saldo total · todas as contas</span><strong>' + kit.money(stats.balanceCents, hidden) + '</strong><small>' + kit.escape(note) + '</small></section>'
    + '<div class="pair"><div class="stat"><small>Gastos do mês</small><span class="amount">' + kit.money(stats.expenseCents, hidden) + '</span></div>'
    + '<div class="stat"><small>Rendimentos do mês</small><span class="amount">' + kit.money(stats.incomeCents, hidden) + '</span></div></div>'
    + '<p class="month-result">Resultado do mês <strong>' + kit.money(stats.resultCents, hidden) + '</strong></p>'
    + '<div class="ch-tiles is-three">' + tiles + '</div>'
    + '<button type="button" class="primary full" data-page="novo">+ Novo movimento</button>'
    + '<div class="section-heading"><h2>Últimos movimentos</h2><button type="button" id="see-month" class="text-button">Ver todos</button></div>'
    + (recent.map(t => row(ctx, t)).join('') || '<p class="empty">Ainda não há movimentos.</p>');
}

module.exports = { render, periodControls };
