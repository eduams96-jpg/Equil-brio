'use strict';
// Navegação inferior e botão de novo movimento, partilhados pelo index.html e pela pré-visualização.
const { icon } = require('./ui/icons.cjs');

const TABS = [
  ['resumo', 'Resumo', 'Resumo', 'chart'],
  ['movimentos', 'Movimentos', 'Mov.', 'list'],
  ['casa', 'Casa', 'Casa', 'home'],
  ['mais', 'Mais', 'Mais', 'settings'],
];

function navHtml(active) {
  return '<nav aria-label="Navegação principal">' + TABS.map(([id, full, short, ic]) =>
    '<button type="button" data-page="' + id + '"' + (full !== short ? ' aria-label="' + full + '"' : '') + (id === active ? ' aria-current="page"' : '') + '>'
    + icon(ic) + '<span class="nav-full">' + full + '</span><span class="nav-short" aria-hidden="true">' + short + '</span></button>').join('')
    + '</nav>';
}

function fabHtml() {
  return '<button type="button" id="quickAdd" data-page="novo" aria-label="Novo movimento">' + icon('plus') + '</button>';
}

module.exports = { TABS, navHtml, fabHtml };
