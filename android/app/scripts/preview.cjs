'use strict';
// Gera páginas estáticas em app/www-preview/ para rever a interface sem emulador.
// Para juntar um ecrã basta acrescentar uma entrada a SCREENS.
const fs = require('node:fs');
const path = require('node:path');
const { icon } = require('../src/ui/icons.cjs');
const kit = require('../src/ui/kit.cjs');
const fixtures = require('../src/screens/fixtures.cjs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www-preview');

const SCREENS = [
  { name: 'moldura', module: null },
  { name: 'resumo', module: '../src/screens/resumo.cjs' },
  { name: 'movimentos', module: '../src/screens/movimentos.cjs' },
  { name: 'casa', module: '../src/screens/casa.cjs' },
  { name: 'mais', module: '../src/screens/mais.cjs' },
];
const DATA = [['demo', fixtures.demo], ['vazio', fixtures.empty]];
const THEMES = [['claro', 'light'], ['escuro', 'dark']];
const NAV = [['resumo', 'Resumo', 'chart'], ['movimentos', 'Movimentos', 'list'], ['casa', 'Casa', 'home'], ['mais', 'Mais', 'settings']];
const CSP = "default-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'";

function frame(title, theme, active, body) {
  const nav = NAV.map(([id, label, ic]) => '<button type="button" data-page="' + id + '"' + (id === active ? ' aria-current="page"' : '') + '>' + icon(ic) + '<span>' + label + '</span></button>').join('');
  return '<!doctype html>\n<html lang="pt-PT" data-theme="' + theme + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">'
    + '<title>' + kit.escape(title) + '</title><link rel="stylesheet" href="style.css"></head><body>'
    + '<div id="app"><header><div><strong>Equilíbrio</strong><small>Pré-visualização</small></div>'
    + '<button type="button" id="privacy" aria-pressed="false">Ocultar valores</button></header>'
    + '<main id="main">' + body + '</main>'
    + '<nav aria-label="Navegação principal">' + nav + '</nav>'
    + '<button type="button" id="quickAdd" aria-label="Novo movimento">' + icon('plus') + '</button></div></body></html>\n';
}

// Página «moldura»: um mosaico de cada cor, pílulas, pesquisa, cartão e linhas.
function frameBody(ctx) {
  const hidden = ctx.state.hidden;
  const tones = [['blue', 'chart', 'Padrão'], ['green', 'check', 'Verde'], ['amber', 'alert', 'Âmbar'], ['red', 'alert', 'Vermelho'], ['purple', 'bell', 'Roxo']];
  const tiles = tones.map(([tone, ic, label]) => kit.tile({ tone, icon: ic, label, value: kit.money(123456, hidden), detail: 'Detalhe de exemplo', page: 'resumo' })).join('');
  return '<h1>Moldura</h1><p class="sub">' + kit.syncStamp(ctx.lastSync, new Date()) + '</p>'
    + '<div class="ch-tiles">' + tiles + '</div>'
    + kit.pills('view', [{ value: 'a', label: 'Todos', count: 12 }, { value: 'b', label: 'Despesas', count: 7 }, { value: 'c', label: 'Receitas' }], 'a')
    + kit.search('q', '', 'Pesquisar movimentos')
    + kit.card({ title: 'Cartão', subtitle: 'Subtítulo do cartão', body: '<div class="row"><div><strong>Compras</strong><small>3 nov</small></div><span class="amount">' + kit.money(-6320, hidden) + '</span></div>' })
    + kit.errorCard('exemplo de erro');
}

function build() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(root, 'src/style.css'), path.join(out, 'style.css'));
  const font = ['www/assets/dm-sans.ttf', '../../equilibrio/assets/fonts/dm-sans.ttf'].map(p => path.join(root, p)).find(p => fs.existsSync(p));
  if (font) fs.copyFileSync(font, path.join(out, 'assets/dm-sans.ttf'));

  const links = [];
  for (const screen of SCREENS) {
    let render = frameBody;
    if (screen.module) {
      const file = path.resolve(__dirname, screen.module);
      if (!fs.existsSync(file)) continue;
      render = require(file).render;
    }
    for (const [dataName, make] of DATA) {
      for (const [themeName, theme] of THEMES) {
        const file = screen.name + '-' + dataName + '-' + themeName + '.html';
        let body;
        try { body = render(fixtures.ctx(make())); } catch (error) { body = kit.errorCard(error.message); }
        fs.writeFileSync(path.join(out, file), frame('Equilíbrio · ' + screen.name, theme, screen.name, body));
        links.push(file);
      }
    }
  }
  const items = links.map(f => '<li><a href="' + f + '">' + f.replace('.html', '') + '</a></li>').join('');
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html>\n<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pré-visualização</title><link rel="stylesheet" href="style.css"></head><body><div id="app"><main><h1>Pré-visualização</h1><ul>' + items + '</ul></main></div></body></html>\n');
  return links;
}

if (require.main === module) console.log(build().length + ' páginas em ' + out);
module.exports = { build, SCREENS };
