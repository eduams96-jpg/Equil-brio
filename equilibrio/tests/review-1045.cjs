'use strict';
// Regressões encontradas na revisão final da 1.0.44 (25/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('../finance.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const ledger = () => { const d = F.empty(); d.accounts = [{ id: 'a', name: 'Banco', type: 'Banco', balance: 1000 }]; F.migrateLedgerCore(d); return d; };

test('Casa: separar loja combinada sem preço nunca apaga o preço já registado na loja individual', () => {
  const Casa = require('../casa-model.js'), CD = require('../casa-daily-model.js'), d = ledger();
  const lidl = Casa.saveStore(d, { name: 'LIDL' });
  const comb = Casa.saveStore(d, { name: 'Continente // LIDL' });
  const arroz = Casa.saveProduct(d, { name: 'Arroz', unit: 'kg' });
  Casa.setOffer(d, arroz, lidl, { packageQty: 2, price: 2.15 });
  Casa.setOffer(d, arroz, comb, { packageQty: 2, price: 0, url: 'https://exemplo.pt/arroz' });
  const decisions = { offers: { [arroz]: 'LIDL' } };
  const preview = CD.previewSplitStore(d, comb, decisions);
  assert.equal(preview.assignedOffers.length, 0);
  assert.equal(preview.overwrites.length, 0);
  assert.equal(preview.keptPrices.length, 1);
  CD.applySplitStore(d, comb, decisions, preview.token);
  const offer = d.casa.catalog.find((p) => p.id === arroz).offers[lidl];
  assert.equal(offer.price, 2.15);
  assert.equal(offer.packageQty, 2);
  assert.equal(offer.url, 'https://exemplo.pt/arroz');
  assert.equal(d.casa.stores.some((s) => s.id === comb), false);
});

test('Casa: um preço real da loja combinada continua a substituir o preço anterior após confirmação', () => {
  const Casa = require('../casa-model.js'), CD = require('../casa-daily-model.js'), d = ledger();
  const lidl = Casa.saveStore(d, { name: 'LIDL' });
  const comb = Casa.saveStore(d, { name: 'Continente // LIDL' });
  const arroz = Casa.saveProduct(d, { name: 'Arroz', unit: 'kg' });
  Casa.setOffer(d, arroz, lidl, { packageQty: 2, price: 2.15 });
  Casa.setOffer(d, arroz, comb, { packageQty: 2, price: 1.99 });
  const decisions = { offers: { [arroz]: 'LIDL' } };
  const preview = CD.previewSplitStore(d, comb, decisions);
  assert.equal(preview.overwrites.length, 1);
  CD.applySplitStore(d, comb, decisions, preview.token);
  assert.equal(d.casa.catalog.find((p) => p.id === arroz).offers[lidl].price, 1.99);
});

function commitSandbox({ renderThrows = false, saveThrows = false } = {}) {
  const source = read('workspace.js');
  const start = source.indexOf('function commit(fn, message');
  const end = source.indexOf('window.flushPendingLocalCache');
  assert.ok(start > 0 && end > start, 'commit() não encontrado em workspace.js');
  const notices = [];
  const modal = { open: false };
  const ctx = {
    F: { ...F, renderCache: { clear() {} }, normalize: (d) => d },
    FinancePlus: { audit() {}, snapshot() {} },
    structuredClone,
    console: { error() {}, warn() {} },
    localStorage: { setItem() {} },
    setTimeout: () => 0, clearTimeout() {},
    $: (sel) => (sel === '#modal' ? modal : null),
    notice: (text, error) => notices.push({ text, error: !!error }),
    render: () => { if (renderThrows) throw Error('Falha de apresentação simulada'); },
    restoreMovementContext() {},
    view: 'transactions', key: 'equilibrioData',
    window: {
      DesktopPersistence: {
        commitLedgerDirect() { if (saveThrows) throw Error('Falha real de gravação'); return { confirmed: true }; },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext('let data={accounts:[],transactions:[]};let storageProblem=false,undoState=null,movementReturnContext=null;\n' + source.slice(start, end) +
    '\nthis.run=(fn)=>commit(fn,"Movimento registado.");this.state=()=>({data,storageProblem});', ctx);
  return { ctx, notices };
}

test('Gravação: falha de apresentação após gravar não é apresentada como dados danificados nem bloqueia escritas', () => {
  const { ctx, notices } = commitSandbox({ renderThrows: true });
  assert.equal(ctx.run((/* data */) => { ctx.state().data.transactions.push({ id: 't1' }); }), true);
  const state = ctx.state();
  assert.equal(state.storageProblem, false);
  assert.equal(state.data.transactions.length, 1);
  assert.match(notices.at(-1).text, /foi guardada/);
  assert.doesNotMatch(notices.at(-1).text, /danific|corromp|Recupera/i);
});

test('Gravação: falha real de gravação repõe os dados e é comunicada como erro', () => {
  const { ctx, notices } = commitSandbox({ saveThrows: true });
  assert.equal(ctx.run(() => { ctx.state().data.transactions.push({ id: 't1' }); }), false);
  const state = ctx.state();
  assert.equal(state.data.transactions.length, 0);
  assert.equal(notices.at(-1).error, true);
  assert.match(notices.at(-1).text, /Falha real de gravação/);
});

test('Movimento: Cancelar fica à direita de todas as ações de confirmação e Enter na divisão não grava o formulário escondido', () => {
  const source = read('workspace.js');
  assert.match(source, /cancelAction\.before\(again\)/);
  assert.match(source, /splitWorkbench\?\.addEventListener\("keydown"/);
  assert.match(source, /if \(splitDone && !splitDone\.disabled\) splitDone\.click\(\)/);
});

test('Estilos: Dados tem áreas de grelha coerentes com a barra lateral e o título da revisão não fica claro sobre claro', () => {
  const { compile } = require('../scripts/build-styles.cjs');
  const css = compile();
  assert.match(css, /grid-template-areas:"head head" "tabs content"!important/);
  assert.match(css, /#reviewMonthHub:not\(\.active\)>h2\{color:var\(--ink\)!important\}/);
  assert.equal(read('ui.css'), css, 'ui.css desatualizado');
});

test('Produtos: o catálogo vazio já não sugere a importação do Excel removida e as datas de preços usam formato português', () => {
  const source = read('casa-catalog-ui.js');
  assert.doesNotMatch(source, /Importa a tua tabela do Excel ou cria/);
  assert.doesNotMatch(source, /'Invalid Date'/);
  assert.match(source, /observado a '\+esc\(ptDate\(date\)\)/);
  assert.match(source, /Não foi possível contactar o Open Prices/);
});
