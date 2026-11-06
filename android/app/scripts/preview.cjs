'use strict';
// Gera páginas estáticas em app/www-preview/ para rever a interface sem emulador.
// Para juntar um ecrã basta acrescentar uma entrada a SCREENS.
const fs = require('node:fs');
const path = require('node:path');
const shell = require('../src/shell.cjs');
const kit = require('../src/ui/kit.cjs');
const { tabFor } = require('../src/nav.cjs');
const fixtures = require('../src/screens/fixtures.cjs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www-preview');

const SCREENS = [
  { name: 'moldura', module: null },
  { name: 'resumo', module: '../src/screens/resumo.cjs' },
  { name: 'movimentos', module: '../src/screens/movimentos.cjs' },
  { name: 'casa', module: '../src/screens/casa.cjs' },
  { name: 'mais', module: '../src/screens/mais.cjs' },
  { name: 'contas', module: '../src/screens/contas.cjs' },
  { name: 'agenda', module: '../src/screens/agenda.cjs' },
  { name: 'ligacao', module: '../src/screens/ligacao.cjs', page: 'sync' },
  { name: 'casa-stock', module: '../src/screens/casa.cjs', page: 'casa', view: { tab: 'stock' } },
  { name: 'casa-historico', module: '../src/screens/casa.cjs', page: 'casa', view: { tab: 'historico' } },
  { name: 'compras', module: '../src/screens/compras.cjs', view: { status: 'all' } },
  { name: 'compras-na-loja', module: '../src/screens/compras.cjs', page: 'compras', view: ledger => ({ status: 'todo', inStore: true, storeId: (ledger.casa && ledger.casa.stores[0] || {}).id || '' }) },
  { name: 'compras-artigo', module: '../src/screens/compras.cjs', fn: 'item', page: 'compras', view: ledger => ({ id: ((ledger.casa && ledger.casa.shopping.find(x => x.catalogId)) || {}).id }) },
  { name: 'compras-novo', module: '../src/screens/compras.cjs', fn: 'add', page: 'compras', view: { query: 'arroz' } },
  { name: 'casa-compras', module: '../src/screens/casa.cjs', page: 'casa', view: { tab: 'compras' } },
  { name: 'relatorios', module: '../src/screens/relatorios.cjs', page: 'relatorios', view: { year: '2026', period: 'm11', account: '', open: 'Alimentação' } },
  { name: 'relatorios-ano', module: '../src/screens/relatorios.cjs', page: 'relatorios', view: { year: '2026', period: 'year', account: '' } },
  { name: 'relatorios-trimestre', module: '../src/screens/relatorios.cjs', page: 'relatorios', view: { year: '2026', period: 'q4', account: '' } },
  { name: 'patrimonio', module: '../src/screens/patrimonio.cjs', page: 'patrimonio' },
  { name: 'avisos', module: '../src/screens/avisos.cjs', page: 'avisos', demo: fixtures.avisos },
  { name: 'ligacao-ligada', module: '../src/screens/ligacao.cjs', page: 'sync', view: { connection: {} } },
];
const DATA = [['demo', fixtures.demo], ['vazio', fixtures.empty]];
const THEMES = [['claro', 'light'], ['escuro', 'dark']];
const CSP = "default-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'";

function frame(title, theme, active, body) {
  return '<!doctype html>\n<html lang="pt-PT" data-theme="' + theme + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">'
    + '<title>' + kit.escape(title) + '</title><link rel="stylesheet" href="style.css"></head><body>'
    + '<div id="app"' + (body.includes('shop-footer') ? ' class="has-shop-footer"' : '') + '><header><div><strong>Equilíbrio</strong><small>Pré-visualização</small></div>'
    + '<button type="button" id="privacy" aria-pressed="false">Ocultar valores</button></header>'
    + '<main id="main">' + body + '</main>'
    + shell.navHtml(tabFor(active))
    + shell.fabHtml() + '</div></body></html>\n';
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
      render = require(file)[screen.fn || 'render'];
    }
    for (const [dataName, make] of DATA) {
      for (const [themeName, theme] of THEMES) {
        const file = screen.name + '-' + dataName + '-' + themeName + '.html';
        let body;
        try { body = (() => { const ledger = (dataName === 'demo' && screen.demo || make)(); return render(fixtures.ctx(ledger), typeof screen.view === 'function' ? screen.view(ledger) : screen.view); })(); } catch (error) { body = kit.errorCard(error.message); }
        fs.writeFileSync(path.join(out, file), frame('Equilíbrio · ' + screen.name, theme, screen.page || screen.name, body));
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
