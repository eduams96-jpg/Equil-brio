'use strict';
const kit = require('../ui/kit.cjs');
const R = require('../../../../equilibrio/reports-model.js');

const KINDS = [['m', 'Mês'], ['q', 'Trimestre'], ['year', 'Ano']];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const cents = x => Math.round((Number(x) || 0) * 100);
const two = n => String(n).padStart(2, '0');

function kindOf(period) {
  if (/^m\d\d$/.test(period)) return 'm';
  if (/^q\d$/.test(period)) return 'q';
  return 'year';
}

// Seleção inicial: o mês corrente de ctx.today, todas as contas.
function initial(today) {
  const t = String(today || '');
  return { year: t.slice(0, 4), period: 'm' + t.slice(5, 7), account: '' };
}

// Recua (-1) ou avança (+1) um mês, trimestre ou ano; atravessa a fronteira do ano.
function shift(sel, dir) {
  const kind = kindOf(sel.period);
  let year = Number(sel.year);
  if (kind === 'year') return { ...sel, year: String(year + dir), period: 'year' };
  const size = kind === 'm' ? 12 : 4;
  let n = Number(sel.period.slice(1)) + dir;
  if (n < 1) { n = size; year -= 1; }
  if (n > size) { n = 1; year += 1; }
  return { ...sel, year: String(year), period: kind === 'm' ? 'm' + two(n) : 'q' + n };
}

// Muda entre Mês, Trimestre e Ano mantendo o ano; de «Ano» para outra vista usa o mês de hoje se o ano coincidir.
function switchKind(sel, kind, today) {
  const from = kindOf(sel.period);
  if (from === kind) return sel;
  if (kind === 'year') return { ...sel, period: 'year' };
  let month = 1;
  if (from === 'm') month = Number(sel.period.slice(1));
  else if (from === 'q') month = (Number(sel.period.slice(1)) - 1) * 3 + 1;
  else if (String(today || '').slice(0, 4) === String(sel.year)) month = Number(String(today).slice(5, 7)) || 1;
  return { ...sel, period: kind === 'm' ? 'm' + two(month) : 'q' + Math.ceil(month / 3) };
}

function label(sel) {
  const kind = kindOf(sel.period);
  if (kind === 'm') return MONTHS[Number(sel.period.slice(1)) - 1] + ' de ' + sel.year;
  if (kind === 'q') return sel.period.slice(1) + '.º trimestre de ' + sel.year;
  return sel.year;
}

// Pura: período atual e anterior, diferenças (do saldo) e categorias com cor e subcategorias.
function view(ledger, sel, analyse = R.analyse) {
  const current = analyse(ledger, sel);
  const previous = analyse(ledger, shift(sel, -1));
  const diff = (a, b) => (cents(a) - cents(b)) / 100;
  const saving = diff(current.saving, previous.saving);
  const delta = {
    income: diff(current.income, previous.income),
    expense: diff(current.expense, previous.expense),
    saving,
    pct: previous.saving ? saving / Math.abs(previous.saving) * 100 : null,
  };
  const categories = R.detail(ledger, { ...sel, result: current }).categories.map((c, i) => ({
    name: c.name,
    value: c.amount,
    color: R.color(i),
    children: c.children.map(ch => ({ name: ch.name, value: ch.amount })),
  }));
  return { current, previous, delta, categories };
}

function pct(v) {
  return v == null || !Number.isFinite(v) ? '' : (v > 0 ? '+' : '') + v.toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' %';
}

function controls(ctx, sel) {
  const e = kit.escape;
  const accounts = (ctx.ledger.accounts || []).filter(a => !a.archived);
  return kit.pills('repkind', KINDS.map(([value, text]) => ({ value, label: text })), kindOf(sel.period))
    + '<div class="rep-step"><button type="button" id="rep-prev" aria-label="Período anterior">‹</button>'
    + '<strong aria-live="polite">' + e(label(sel)) + '</strong>'
    + '<button type="button" id="rep-next" aria-label="Período seguinte">›</button></div>'
    + (accounts.length > 1 ? kit.pills('repaccount', [{ value: '', label: 'Todas' }, ...accounts.map(a => ({ value: String(a.id), label: a.name }))], String(sel.account || '')) : '');
}

function tiles(ctx, v, sel) {
  const hidden = ctx.state.hidden;
  const money = x => kit.money(cents(x), hidden);
  const diff = (v.delta.saving > 0 && !hidden ? '+' : '') + money(v.delta.saving);
  const p = pct(v.delta.pct);
  return '<div class="ch-tiles">'
    + kit.tile({ tone: 'green', icon: 'plus', label: 'Receitas', value: money(v.current.income) })
    + kit.tile({ tone: 'red', icon: 'cart', label: 'Despesas', value: money(v.current.expense) })
    + kit.tile({ tone: v.current.saving < 0 ? 'red' : 'blue', icon: 'account', label: 'Saldo', value: money(v.current.saving) })
    + kit.tile({ tone: 'purple', icon: 'chart', label: 'Diferença do saldo', value: diff, detail: (p && !hidden ? p + ' ' : '') + 'face a ' + label(shift(sel, -1)) })
    + '</div>';
}

// Barra horizontal em SVG: a cor vai em atributo de apresentação (a CSP não admite style="").
function bar(width, color) {
  const w = Math.max(0, Math.min(100, width)).toFixed(1);
  return '<svg class="rep-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
    + '<rect class="rep-track" width="100" height="8"/><rect width="' + w + '" height="8" fill="' + kit.escape(color) + '"/></svg>';
}

function categories(ctx, v, open) {
  const e = kit.escape;
  const total = v.current.expense;
  const top = v.categories.reduce((m, c) => Math.max(m, c.value), 0);
  const money = x => kit.money(cents(x), ctx.state.hidden);
  if (!v.categories.length) return kit.card({ title: 'Onde gastas', body: '<p class="empty">Sem despesas neste período.</p>' });
  const rows = v.categories.map(c => {
    const share = total > 0 ? Math.round(c.value / total * 100) : 0;
    const isOpen = open === c.name;
    const kids = isOpen
      ? '<div class="rep-kids">' + c.children.map(ch => '<div class="rep-kid"><span>' + e(ch.name) + '</span><span class="amount">' + money(ch.value) + '</span></div>').join('') + '</div>'
      : '';
    return '<div class="rep-cat' + (isOpen ? ' is-open' : '') + '">'
      + '<button type="button" class="rep-cat-head" data-rep-cat="' + e(c.name) + '" aria-expanded="' + isOpen + '">'
      + '<span class="rep-cat-line"><svg class="rep-dot" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><rect width="10" height="10" fill="' + e(c.color) + '"/></svg>'
      + '<strong>' + e(c.name) + '</strong><span class="amount">' + money(c.value) + '</span></span>'
      + bar(top > 0 ? c.value / top * 100 : 0, c.color)
      + '<small>' + share + ' % das despesas</small></button>' + kids + '</div>';
  }).join('');
  return kit.card({ title: 'Onde gastas', subtitle: 'Toca numa categoria para ver as subcategorias', body: rows });
}

function months(v, sel) {
  const list = v.current.months;
  if (kindOf(sel.period) === 'm' || !list.length) return '';
  const W = 300, H = 120, base = 100, slot = W / list.length, bw = Math.min(14, slot * 0.34);
  const max = list.reduce((m, x) => Math.max(m, x.income, x.expense), 0);
  const h = x => (max > 0 ? Math.round(x / max * (base - 6) * 10) / 10 : 0);
  const parts = list.map((m, i) => {
    const mid = slot * i + slot / 2, hi = h(m.income), he = h(m.expense);
    return '<rect class="rep-inc" x="' + (mid - bw - 0.5).toFixed(1) + '" y="' + (base - hi) + '" width="' + bw.toFixed(1) + '" height="' + hi + '"/>'
      + '<rect class="rep-exp" x="' + (mid + 0.5).toFixed(1) + '" y="' + (base - he) + '" width="' + bw.toFixed(1) + '" height="' + he + '"/>'
      + '<text class="rep-axis" x="' + mid.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + SHORT[Number(m.month.slice(5, 7)) - 1] + '</text>';
  }).join('');
  const svg = '<svg class="rep-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Receitas e despesas mês a mês" focusable="false">'
    + '<line class="rep-base" x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '"/>' + parts + '</svg>'
    + '<p class="rep-legend"><span class="rep-key is-inc">Receitas</span><span class="rep-key is-exp">Despesas</span></p>';
  return kit.card({ title: 'Mês a mês', subtitle: label(sel), body: svg });
}

// Ecrã «Relatórios». sel: {year, period, account, open?}, gerido por main.js.
function render(ctx, sel, analyse = R.analyse) {
  const s = { ...initial(ctx.today), ...(sel || {}) };
  let body;
  try {
    const v = view(ctx.ledger, s, analyse);
    body = tiles(ctx, v, s) + categories(ctx, v, s.open) + months(v, s);
  } catch (error) {
    body = kit.errorCard(error.message);
  }
  return '<button type="button" class="back" data-page="mais">‹ Mais</button><h1>Relatórios</h1>'
    + '<p class="sub">' + kit.escape(kit.syncStamp(ctx.lastSync, new Date())) + '</p>'
    + controls(ctx, s) + body;
}

module.exports = { initial, shift, switchKind, label, view, render };
