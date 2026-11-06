'use strict';
const kit = require('../ui/kit.cjs');
const V = require('../view-model.cjs');
const D = require('../../../../equilibrio/dossiers-model.js');
const Commitments = require('../../../shared/commitments.cjs');

const GROUPS = [['overdue', 'Atrasados'], ['today', 'Hoje'], ['soon', 'Próximos dias']];
const EURO = /\d[\d\s.,]*\s?€/g;

// Separa os avisos ativos por data face a hoje (as datas são AAAA-MM-DD, comparáveis como texto).
function groups(result, today) {
  const g = { overdue: [], today: [], soon: [] };
  for (const item of (result && result.rows) || []) {
    if (item.date && item.date < today) g.overdue.push(item);
    else if (item.date === today) g.today.push(item);
    else g.soon.push(item);
  }
  return g;
}

// Para onde leva o botão de um aviso; null quando só há detalhe (o Android não tem esse ecrã).
function target(item, ledger) {
  if (item.originKind === 'pendingPayment') {
    const row = ((ledger && ledger.pendingPayments) || []).find(p => String(p.id) === String(item.originId));
    if (row && Commitments.payable(ledger, row)) return { page: 'pagar-compromisso', params: { id: String(item.originId) } };
  }
  switch (item.targetView) {
    case 'planner': return { page: 'agenda', params: {} };
    case 'transactions': return { page: 'movimentos', params: {} };
    case 'casaStock': return { page: 'casa', params: { tab: 'stock' } };
    case 'casaPurchases': return { page: 'casa', params: { tab: 'historico' } };
    default: return null;
  }
}

const TARGET_LABEL = { 'pagar-compromisso': 'Pagar', agenda: 'Ver na agenda', movimentos: 'Ver movimentos', casa: 'Abrir na Casa' };

function attrs(t) {
  let out = ' data-page="' + kit.escape(t.page) + '"';
  if (t.page === 'pagar-compromisso') out += ' data-notice-pay="' + kit.escape(t.params.id) + '"';
  if (t.page === 'casa') out += ' data-notice-tab="' + kit.escape(t.params.tab) + '"';
  return out;
}

function row(item, ctx) {
  const hidden = ctx.state.hidden;
  const mask = s => hidden ? String(s || '').replace(EURO, '•••• €') : String(s || '');
  const priority = ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'low';
  const t = target(item, ctx.ledger);
  const amount = Number(item.amount) > 0 ? '<span class="amount">' + kit.money(Math.round(Number(item.amount) * 100), hidden) + '</span>' : '';
  return '<li class="aviso is-' + priority + '"><div class="aviso-main"><strong>' + kit.escape(mask(item.title)) + '</strong>'
    + '<small>' + kit.escape(item.areaLabel || '') + (item.date ? ' · ' + V.dateLabel(item.date) : '') + '</small>'
    + (item.detail ? '<small>' + kit.escape(mask(item.detail)) + '</small>' : '') + '</div>' + amount
    + (t ? '<button type="button" class="aviso-go"' + attrs(t) + '>' + (TARGET_LABEL[t.page] || 'Abrir') + '</button>' : '')
    + '</li>';
}

// Ecrã «Avisos». deps (só para testes): {notices}.
function render(ctx, view, deps = {}) {
  const head = '<button type="button" class="back" data-page="mais">‹ Mais</button><h1>Avisos</h1>'
    + '<p class="sub">' + kit.escape(kit.syncStamp(ctx.lastSync, new Date())) + '</p>';
  let result;
  try {
    result = deps.notices ? deps.notices(ctx.ledger, { today: ctx.today }) : ctx.notices || D.notices(ctx.ledger, { today: ctx.today });
  } catch (error) {
    return head + kit.errorCard(error.message);
  }
  const g = groups(result, ctx.today);
  const body = GROUPS.filter(([key]) => g[key].length).map(([key, label]) =>
    kit.card({ title: label, subtitle: g[key].length === 1 ? '1 aviso' : g[key].length + ' avisos', body: '<ul class="avisos">' + g[key].map(i => row(i, ctx)).join('') + '</ul>' })).join('');
  return head + (body || kit.card({ title: 'Sem avisos', body: '<p class="empty">Nada precisa da tua atenção neste momento.</p>' }));
}

module.exports = { groups, target, render };
