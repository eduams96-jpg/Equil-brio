'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');
const W = require('../../../../equilibrio/wealth-model.js');
const R = require('../../../../equilibrio/reports-model.js');
const relatorios = require('./relatorios.cjs');

const cents = x => Math.round((Number(x) || 0) * 100);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

// Evolução: linha em SVG com atributos de apresentação (a CSP não admite style=""). Mesma geometria do PC.
function evolution(s, hidden) {
  const money = x => kit.money(cents(x), hidden);
  if (!s.history.length) {
    return '<p class="empty">Ainda não há valores guardados. Guarda o valor de hoje no PC para começares a acompanhar a tendência.</p>';
  }
  const LEFT = 56, RIGHT = 292, TOP = 10, BOTTOM = 100;
  const points = s.history.length === 1
    ? [{ ...s.history[0], x: LEFT }, { ...s.history[0], x: RIGHT }]
    : s.history.map((p, i) => ({ ...p, x: LEFT + i / (s.history.length - 1) * (RIGHT - LEFT) }));
  const values = points.map(p => p.net);
  const min = Math.min(...values, s.net), max = Math.max(...values, s.net);
  const pad = Math.max(1, (max - min) * 0.2), low = min - pad, range = max - min + 2 * pad;
  const y = v => BOTTOM - (v - low) / range * (BOTTOM - TOP);
  const d = points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + y(p.net).toFixed(1)).join(' ');
  const last = points[points.length - 1];
  const grid = [0, 0.5, 1].map(f => {
    const gy = BOTTOM - f * (BOTTOM - TOP);
    const text = hidden ? '•••• €' : Math.round(low + range * f).toLocaleString('pt-PT') + ' €';
    return '<path class="pat-base" d="M' + LEFT + ' ' + gy.toFixed(1) + 'H' + RIGHT + '"/>'
      + '<text class="pat-axis" x="' + (LEFT - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + kit.escape(text) + '</text>';
  }).join('');
  const first = s.history[0], end = s.history[s.history.length - 1];
  const aria = hidden
    ? 'Evolução do património de ' + V.dateLabel(first.date) + ' a ' + V.dateLabel(end.date)
    : 'Evolução de ' + money(first.net) + ' em ' + V.dateLabel(first.date) + ' para ' + money(end.net) + ' em ' + V.dateLabel(end.date);
  return '<svg class="pat-chart" viewBox="0 0 300 112" role="img" aria-label="' + kit.escape(aria) + '" focusable="false">' + grid
    + '<path class="pat-area" d="' + d + ' L' + RIGHT + ',' + BOTTOM + ' L' + LEFT + ',' + BOTTOM + ' Z"/>'
    + '<path class="pat-line" d="' + d + '"/>'
    + '<circle class="pat-dot" cx="' + last.x.toFixed(1) + '" cy="' + y(last.net).toFixed(1) + '" r="3.5"/></svg>'
    + '<p class="pat-dates"><span>' + V.dateLabel(first.date) + '</span><span>' + V.dateLabel(end.date) + '</span></p>';
}

function tiles(s, hidden) {
  const money = x => kit.money(cents(x), hidden);
  const detail = s.delta === null
    ? 'Sem valores guardados para comparar'
    : (hidden ? '' : (s.delta >= 0 ? '+' : '−')) + money(Math.abs(s.delta)) + ' desde ' + V.dateLabel(s.previousDate);
  const assetCount = s.parts[2].count, positions = s.parts[1].count;
  return '<div class="ch-tiles">'
    + kit.tile({ tone: s.net >= 0 ? 'green' : 'red', icon: 'chart', label: 'Património líquido', value: money(s.net), detail })
    + kit.tile({ tone: 'blue', icon: 'account', label: 'Contas', value: money(s.cash), detail: s.unchecked ? plural(s.unchecked, 'conta por conferir', 'contas por conferir') : 'Todas conferidas' })
    + kit.tile({ tone: 'purple', icon: 'box', label: 'Bens e investimentos', value: money(s.investments + s.assets), detail: plural(assetCount, 'bem', 'bens') + ' · ' + plural(positions, 'posição', 'posições') })
    + kit.tile({ tone: s.debts ? 'amber' : 'green', icon: 'alert', label: 'Créditos', value: money(-s.debts), detail: s.debts ? 'Prestações de ' + money(s.monthlyPayments) + '/mês' : 'Sem créditos em dívida' })
    + '</div>';
}

function composition(s, hidden) {
  const money = x => kit.money(cents(x), hidden);
  const detail = { accounts: plural(s.parts[0].count, 'conta ativa', 'contas ativas'), investments: plural(s.parts[1].count, 'posição', 'posições'), assets: plural(s.parts[2].count, 'bem', 'bens') };
  let at = 0;
  const segments = s.parts.map(p => {
    const rect = '<rect class="pat-seg part-' + p.key + '" x="' + at.toFixed(2) + '" width="' + p.share.toFixed(2) + '" height="10"/>';
    at += p.share;
    return rect;
  }).join('');
  const bar = '<svg class="pat-stack" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="pat-track" width="100" height="10"/>' + segments + '</svg>';
  const rows = s.parts.map(p => '<li><svg class="pat-key part-' + p.key + '" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><rect width="10" height="10"/></svg>'
    + '<div><b>' + p.label + '</b><small>' + detail[p.key] + '</small></div><span class="amount">' + money(p.value) + '</span><em>' + Math.round(p.share) + ' %</em></li>').join('')
    + '<li class="is-debt"><svg class="pat-key part-debts" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><rect width="10" height="10"/></svg>'
    + '<div><b>Créditos</b><small>' + plural(s.debtCount, 'crédito em dívida', 'créditos em dívida') + '</small></div>'
    + '<span class="amount">' + (s.debts && !hidden ? '−' : '') + money(s.debts) + '</span><em>' + (s.positive ? Math.round(s.debts / s.positive * 100) + ' %' : '—') + '</em></li>';
  return kit.card({ title: 'Composição', subtitle: 'Ativos de ' + money(s.positive), body: bar + '<ul class="pat-parts">' + rows + '</ul>' });
}

function month(ctx, analyse) {
  const sel = { year: ctx.today.slice(0, 4), period: 'm' + ctx.today.slice(5, 7), account: '' };
  try {
    const v = relatorios.view(ctx.ledger, sel, analyse);
    const money = x => kit.money(cents(x), ctx.state.hidden);
    const line = (label, value) => '<div class="info-line"><span>' + label + '</span><strong class="amount">' + money(value) + '</strong></div>';
    return kit.card({
      title: 'Receitas e despesas do mês',
      subtitle: relatorios.label(sel),
      body: line('Receitas', v.current.income) + line('Despesas', v.current.expense) + line('Saldo', v.current.saving)
        + '<button type="button" class="full" data-page="relatorios">Ver relatórios</button>',
    });
  } catch (error) {
    return kit.errorCard(error.message);
  }
}

// Ecrã «Património». deps (só para testes): {summary, analyse}.
function render(ctx, view, deps = {}) {
  const hidden = ctx.state.hidden;
  const head = '<button type="button" class="back" data-page="mais">‹ Mais</button><h1>Património</h1>'
    + '<p class="sub">' + kit.escape(kit.syncStamp(ctx.lastSync, new Date())) + '</p>';
  let body;
  try {
    const s = (deps.summary || W.summary)(ctx.ledger, ctx.today);
    const money = x => kit.money(cents(x), hidden);
    const sub = s.delta === null
      ? 'Os valores são guardados no PC.'
      : (hidden ? '' : (s.delta >= 0 ? '+' : '−')) + money(Math.abs(s.delta)) + ' face ao último valor guardado (' + plural(s.historyCount, 'registo', 'registos') + ')';
    body = tiles(s, hidden) + composition(s, hidden)
      + kit.card({ title: 'Evolução', subtitle: sub, body: evolution(s, hidden) });
  } catch (error) {
    body = kit.errorCard(error.message);
  }
  return head + body + month(ctx, deps.analyse || R.analyse)
    + '<p class="sub">Transferências entre contas não alteram o património. Os bens usam a última avaliação registada; a evolução usa apenas os valores guardados.</p>';
}

module.exports = { render };
