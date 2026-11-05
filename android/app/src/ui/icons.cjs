'use strict';
// Caminhos copiados de equilibrio/interface-ui.js (InterfaceUI.icon).
// Nomes que não existem lá e o mapeamento usado:
//   home -> box, list -> document, settings -> gear, link -> recurring, arrow -> transfer
const P = {
  plus: 'M12 5v14M5 12h14',
  transfer: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
  document: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',
  calendar: 'M4 5h16v16H4zM4 10h16M8 2v6M16 2v6',
  recurring: 'M4 7a9 9 0 0 1 15-2M19 2v5h-5M20 17a9 9 0 0 1-15 2M5 22v-5h5',
  account: 'M3 7h18v13H3zM3 7l3-3h12l3 3M16 13.5h2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3 2 20h20zM12 10v4.5M12 17.5h.01',
  cart: 'M3 4h2.5l2 11.5h10.5l2-8H6.5M9 20h.01M17 20h.01',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 21 21',
};
const ALIAS = { home: 'box', list: 'document', settings: 'gear', link: 'recurring', arrow: 'transfer' };
const NAMES = ['chart', 'account', 'box', 'alert', 'cart', 'calendar', 'bell', 'home', 'list', 'settings', 'link', 'plus', 'search', 'check', 'arrow'];

function icon(name) {
  if (!NAMES.includes(name)) return '';
  const d = P[ALIAS[name] || name];
  return '<svg class="interface-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
}

module.exports = { icon };
