'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const nav = require('./nav.cjs');

test('tabFor agrupa as páginas por separador', () => {
  assert.equal(nav.tabFor('resumo'), 'resumo');
  for (const p of ['movimentos', 'detalhe', 'novo', 'rascunho', 'eliminar', 'descartar-rascunho', 'conflito']) assert.equal(nav.tabFor(p), 'movimentos', p);
  for (const p of ['casa', 'casa-form', 'descartar-casa', 'compras', 'compras-artigo', 'compras-novo']) assert.equal(nav.tabFor(p), 'casa', p);
  for (const p of ['contas', 'conta', 'editar-conta', 'arquivar-conta', 'sair-conta', 'agenda', 'compromisso', 'novo-compromisso', 'pagar-compromisso', 'descartar-compromisso', 'descartar-pagamento', 'patrimonio', 'relatorios', 'avisos', 'sync', 'recuperacao', 'confirmar-recuperacao', 'confirmar-desligar', 'confirmar-passagem', 'consulta-financeira', 'definicoes', 'mais']) assert.equal(nav.tabFor(p), 'mais', p);
});

test('tabFor devolve resumo para páginas desconhecidas', () => {
  assert.equal(nav.tabFor('desconhecida'), 'resumo');
  assert.equal(nav.tabFor(undefined), 'resumo');
});

test('já não há páginas «Em breve»: o mecanismo de placeholder foi retirado', () => {
  assert.equal(nav.isPlaceholder, undefined);
  assert.equal(nav.placeholder, undefined);
});

test('index.html usa a mesma navegação que a pré-visualização', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
  const shell = require('./shell.cjs');
  assert.ok(html.includes(shell.navHtml('resumo') + shell.fabHtml()));
  assert.match(shell.fabHtml(), /id="quickAdd" data-page="novo"/);
});
