'use strict';
const kit = require('./ui/kit.cjs');

const MOVIMENTOS = ['movimentos', 'detalhe', 'novo', 'rascunho', 'eliminar', 'descartar-rascunho', 'conflito'];
const CASA = ['casa', 'casa-form', 'descartar-casa', 'compras', 'compras-artigo', 'compras-novo'];
const MAIS = [
  'mais', 'contas', 'conta', 'editar-conta', 'arquivar-conta', 'sair-conta',
  'agenda', 'compromisso', 'novo-compromisso', 'pagar-compromisso', 'descartar-compromisso', 'descartar-pagamento',
  'patrimonio', 'relatorios', 'avisos', 'sync', 'recuperacao',
  'confirmar-recuperacao', 'confirmar-desligar', 'confirmar-passagem',
  'consulta-financeira', 'definicoes',
];

// Separador da barra inferior a que uma página pertence; o que não está listado cai em «resumo».
function tabFor(page) {
  if (MOVIMENTOS.includes(page)) return 'movimentos';
  if (CASA.includes(page)) return 'casa';
  if (MAIS.includes(page)) return 'mais';
  return 'resumo';
}

// Páginas cujo ecrã ainda não existe: mostram «Em breve». Quando uma tarefa registar o ecrã
// real, basta retirar o nome daqui.
const PLACEHOLDERS = { definicoes: 'Definições' };

function isPlaceholder(page) {
  return Object.prototype.hasOwnProperty.call(PLACEHOLDERS, page);
}

function placeholder(page) {
  const title = PLACEHOLDERS[page] || 'Página';
  const back = ['mais', '‹ Mais'];
  return '<button type="button" class="back" data-page="' + back[0] + '">' + back[1] + '</button>'
    + kit.card({ title, subtitle: 'Em breve', body: '<p class="sub">Esta página chega numa próxima atualização.</p>' });
}

module.exports = { tabFor, isPlaceholder, placeholder };
