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

const TAB_ROOTS = ['mais', 'casa', 'movimentos'];

// Destino do botão «voltar» do Android: fecha o diálogo aberto, usa o botão «voltar» do ecrã,
// leva as raízes de separador ao Resumo; no Resumo não trata (sai da app).
function backTarget(page, { hasBackButton = false, dialogOpen = false } = {}) {
  if (dialogOpen) return 'close-dialog';
  if (page === 'resumo') return 'exit';
  if (hasBackButton) return 'back';
  if (TAB_ROOTS.includes(page)) return 'resumo';
  return 'resumo';
}

module.exports = { tabFor, backTarget };
