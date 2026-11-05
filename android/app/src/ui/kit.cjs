'use strict';
const { icon } = require('./icons.cjs');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ESC[c]);
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
function money(cents, hidden) {
  if (hidden) return '•••• €';
  return eur.format((Number(cents) || 0) / 100);
}

function tile({ tone, icon: iconName, label, value, detail, page }) {
  const inner = '<span class="ch-tile-icon">' + icon(iconName) + '</span>'
    + '<span class="ch-tile-label">' + escape(label) + '</span>'
    + '<strong class="ch-tile-value">' + escape(value) + '</strong>'
    + (detail ? '<small class="ch-tile-detail">' + escape(detail) + '</small>' : '');
  const cls = 'ch-tile is-' + escape(tone);
  if (page) return '<button type="button" class="' + cls + '" data-page="' + escape(page) + '">' + inner + '</button>';
  return '<article class="' + cls + '">' + inner + '</article>';
}

function pills(name, options, selected) {
  const n = escape(name);
  return '<div class="cs-pills" role="tablist">' + options.map(o =>
    '<button type="button" role="tab" data-pill-' + n + '="' + escape(o.value) + '" aria-pressed="'
    + (o.value === selected ? 'true' : 'false') + '">' + escape(o.label)
    + (o.count != null ? ' <span class="cs-pill-count">' + escape(o.count) + '</span>' : '') + '</button>'
  ).join('') + '</div>';
}

// title/subtitle são escapados; body é HTML já composto pelo chamador.
function card({ title, subtitle, body, className }) {
  return '<section class="cs-card' + (className ? ' ' + escape(className) : '') + '">'
    + '<header><h2>' + escape(title) + '</h2>' + (subtitle ? '<p>' + escape(subtitle) + '</p>' : '') + '</header>'
    + (body || '') + '</section>';
}

function search(id, value, placeholder) {
  return '<label class="cs-search">' + icon('search')
    + '<input type="search" id="' + escape(id) + '" value="' + escape(value) + '" placeholder="' + escape(placeholder) + '" autocomplete="off"></label>';
}

function errorCard(message) {
  return '<section class="cs-card cs-error" role="alert"><p>Não foi possível calcular: ' + escape(message) + '</p></section>';
}

function syncStamp(iso, now) {
  if (!iso) return 'Ainda não sincronizado';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Ainda não sincronizado';
  const min = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (min < 1) return 'Dados de agora mesmo';
  if (min < 60) return 'Dados de há ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'Dados de há ' + h + ' h';
  if (h < 48) return 'Dados de ontem';
  return 'Dados de há ' + Math.floor(h / 24) + ' dias';
}

module.exports = { escape, money, tile, pills, card, search, errorCard, syncStamp };
