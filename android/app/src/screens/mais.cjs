'use strict';
const kit = require('../ui/kit.cjs');
const { icon } = require('../ui/icons.cjs');

const ENTRIES = [
  ['contas', 'Contas', 'Saldos e contas arquivadas', 'account'],
  ['agenda', 'Agenda', 'Compromissos e recorrências', 'calendar'],
  ['patrimonio', 'Património', 'Investimentos, bens e dívidas', 'box'],
  ['relatorios', 'Relatórios', 'Análise por período', 'chart'],
  ['avisos', 'Avisos', 'O que merece atenção', 'bell'],
  ['sync', 'Ligação', 'Sincronização com o PC', 'link'],
  ['definicoes', 'Definições', 'Aparência e notificações', 'settings'],
];

function render(ctx) {
  const rows = ENTRIES.map(([page, label, detail, ic]) =>
    '<button type="button" class="mais-row" data-page="' + page + '">'
    + '<span class="mais-icon">' + icon(ic) + '</span>'
    + '<span class="mais-text"><strong>' + kit.escape(label) + '</strong><small>' + kit.escape(detail) + '</small></span>'
    + '<span class="mais-go" aria-hidden="true">›</span></button>').join('');
  return '<h1>Mais</h1><p class="sub">' + kit.escape(kit.syncStamp(ctx.lastSync, new Date())) + '</p>'
    + '<div class="mais-list">' + rows + '</div>';
}

module.exports = { render };
