'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const F = require('../finance.js'), P = require('../features-model.js'), L = require('../life-model.js');
globalThis.Finance = F;
const W = require('../wealth-model.js'), { seed } = require('./fixtures/cor-007.cjs');
const TODAY = '2026-11-05';

// Livro como o de tests/reports-categories-1018.cjs (seed + movimentos).
function reports() {
  const d = seed();
  F.add(d, { id: 'a1', date: '2026-03-02', type: 'expense', amount: 10, account: 'Banco', description: 'LIDL', category: 'Alimentação' });
  F.add(d, { id: 'a2', date: '2026-04-01', type: 'expense', amount: 20.55, account: 'Banco', description: 'Pingo Doce', category: 'Alimentação' });
  F.add(d, { id: 'i1', date: '2026-04-05', type: 'income', amount: 1000.1, account: 'Banco', description: 'Vencimento', category: 'Receita' });
  return d;
}
// Livro como o de tests/closure-040.cjs, com um bem avaliado e um valor guardado.
function closure() {
  const d = F.empty();
  d.accounts = [{ id: 'a', name: 'Banco', type: 'Banco', balance: 1000 }, { id: 'b', name: 'Poupança', type: 'Poupança', balance: 0 }];
  F.migrateLedgerCore(d);
  d.assets = [{ id: 'home', name: 'Casa', kind: 'Imóvel', valuations: [{ date: '2026-08-01', value: 2000.2 }] }];
  F.add(d, { id: 't1', date: '2026-09-01', type: 'transfer', amount: 300, account: 'Banco', targetAccount: 'Poupança', description: 'Poupar' });
  return d;
}
function full() {
  const d = closure();
  d.investments = [{ id: 'i1', name: 'Fundo', value: 1234.56 }, { id: 'i2', name: 'ETF', value: 300.1 }];
  d.debts = [{ id: 'd1', name: 'Crédito', balance: 3200.25, payment: 150.1 }, { id: 'd2', name: 'Pago', balance: 0, payment: 50 }];
  d.wealthHistory = [{ id: 'w1', date: '2026-09-30', net: 4000 }, { id: 'w2', date: '2026-10-31', net: 5000.5 }];
  return d;
}

// Fórmulas de renderWealth antes de passarem para o modelo (cópia fiel).
function legacy(data, today) {
  const total = (list, value) => F.money((list || []).reduce((sum, item) => sum + (Number(value(item)) || 0), 0));
  const cash = total(data.accounts || [], (item) => F.balanceAt(data, item, today));
  const investments = total(data.investments || [], (item) => item.value);
  const assets = L.assetTotal(data) || 0;
  const debts = total(data.debts || [], (item) => item.balance);
  const monthlyPayments = total((data.debts || []).filter((item) => item.balance > 0), (item) => item.payment);
  const net = F.money(cash + investments + assets - debts);
  const positive = Math.max(0, cash) + Math.max(0, investments) + Math.max(0, assets);
  const historical = [...(data.wealthHistory || [])].filter((item) => Number.isFinite(Number(item.net)) && item.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const previous = historical.at(-1);
  return { cash, investments, assets, debts, monthlyPayments, net, positive, delta: previous ? F.money(net - Number(previous.net)) : null, previousDate: previous ? previous.date : null };
}

test('summary: net = contas + investimentos + bens − créditos, arredondado por F.money (seed e livro de fecho)', () => {
  for (const d of [reports(), closure(), full(), F.empty()]) {
    const s = W.summary(d, TODAY);
    assert.equal(s.net, F.money(s.cash + s.investments + s.assets - s.debts));
    assert.equal(s.cash, F.money(d.accounts.reduce((n, a) => n + F.balanceAt(d, a, TODAY), 0)));
    assert.equal(s.assets, L.assetTotal(d));
  }
  const s = W.summary(closure(), TODAY);
  assert.equal(s.cash, 1000);
  assert.equal(s.assets, 2000.2);
  assert.equal(s.net, 3000.2);
});

test('summary devolve os valores que renderWealth usava', () => {
  for (const d of [reports(), closure(), full(), F.empty()]) {
    const s = W.summary(d, TODAY), old = legacy(d, TODAY);
    for (const key of Object.keys(old)) assert.deepEqual(s[key], old[key], key);
  }
});

test('summary: sem valores guardados, delta e previousDate são null e history é vazia', () => {
  const d = closure();
  d.wealthHistory = [];
  const s = W.summary(d, TODAY);
  assert.equal(s.delta, null);
  assert.equal(s.previousDate, null);
  assert.deepEqual(s.history, []);
  assert.equal(s.historyCount, 0);
  delete d.wealthHistory;
  assert.deepEqual(W.summary(d, TODAY).history, []);
});

test('summary: delta é face ao último valor guardado até hoje; futuros e inválidos ficam de fora', () => {
  const d = full();
  d.wealthHistory.push({ id: 'f', date: '2027-01-01', net: 99999 }, { id: 'bad', date: '2026-05-05', net: 'x' });
  const s = W.summary(d, TODAY);
  assert.equal(s.previousDate, '2026-10-31');
  assert.equal(s.delta, F.money(s.net - 5000.5));
  assert.deepEqual(s.history.map(h => h.date), ['2026-09-30', '2026-10-31']);
  assert.equal(s.historyCount, 2);
});

test('summary: history tem no máximo 12 pontos, os mais recentes, por ordem', () => {
  const d = closure();
  d.wealthHistory = Array.from({ length: 15 }, (_, i) => ({ id: 'w' + i, date: '2026-' + String(Math.floor(i / 2) + 1).padStart(2, '0') + (i % 2 ? '-28' : '-10'), net: 1000 + i }));
  d.wealthHistory.reverse();
  const s = W.summary(d, TODAY);
  assert.equal(s.history.length, 12);
  assert.deepEqual(s.history.map(h => h.net), Array.from({ length: 12 }, (_, i) => 1003 + i));
  assert.deepEqual(s.history.map(h => h.date), [...s.history.map(h => h.date)].sort());
  assert.equal(s.historyCount, 15);
});

test('summary: composição, contagens, créditos e contas por conferir', () => {
  const d = full();
  d.accounts.push({ id: 'z', name: 'Antiga', type: 'Banco', balance: 0, archived: true });
  d.accounts[0].reconciledOn = '2026-09-02';
  const s = W.summary(d, TODAY);
  assert.deepEqual(s.parts.map(p => p.key), ['accounts', 'investments', 'assets']);
  assert.deepEqual(s.parts.map(p => p.label), ['Contas', 'Investimentos', 'Bens']);
  assert.deepEqual(s.parts.map(p => p.count), [2, 2, 1]);
  assert.equal(s.parts[0].value, s.cash);
  assert.equal(s.positive, s.cash + s.investments + s.assets);
  assert.ok(Math.abs(s.parts.reduce((n, p) => n + p.share, 0) - 100) < 1e-9);
  assert.equal(s.parts[1].share, s.investments / s.positive * 100);
  assert.equal(s.debtCount, 1);
  assert.equal(s.monthlyPayments, 150.1);
  assert.equal(s.unchecked, 1, 'a conta 0 foi conferida depois do último movimento; a 1 não');
});

test('summary: composição sem ativos positivos fica a zero, sem dividir por zero', () => {
  const s = W.summary(F.empty(), TODAY);
  assert.equal(s.positive, 0);
  assert.deepEqual(s.parts.map(p => p.share), [0, 0, 0]);
  assert.equal(s.net, 0);
});

test('summary não depende de DOM nem de window e não altera o livro', () => {
  const d = full(), before = JSON.stringify(d);
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');
  W.summary(d, TODAY);
  assert.equal(JSON.stringify(d), before);
  const source = fs.readFileSync(path.join(__dirname, '../wealth-model.js'), 'utf8');
  assert.ok(!/\bwindow\b|\bdocument\b/.test(source));
});

test('summary usa F.today() quando não recebe data', () => {
  const d = full();
  assert.deepEqual(W.summary(d), W.summary(d, F.today()));
});

test('wealth-model.js está ligado ao index.html (antes de wealth-analysis-v3.js), ao servidor e ao pacote', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const model = html.indexOf('<script src="wealth-model.js"></script>'), view = html.indexOf('<script src="wealth-analysis-v3.js"></script>');
  assert.ok(model > 0 && view > model);
  assert.ok(model > html.indexOf('<script src="life-model.js"></script>'));
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.files.includes('wealth-model.js'));
  assert.ok(/"wealth-model\.js"/.test(fs.readFileSync(path.join(root, 'serve.cjs'), 'utf8')));
});
