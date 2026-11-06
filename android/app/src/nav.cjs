'use strict';
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

module.exports = { tabFor };
