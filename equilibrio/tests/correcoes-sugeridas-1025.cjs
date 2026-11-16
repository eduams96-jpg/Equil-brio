const test = require('node:test'), assert = require('node:assert/strict');
global.Finance = require('../finance.js');
const F = global.Finance, C = require('../complete-model.js');

function fixture() {
  const d = F.empty();
  d.accounts = [{ id: 'bank', name: 'Banco', type: 'Banco', openingBalance: 1000, balance: 1000 }];
  const tx = (o) => d.transactions.push({ id: F.id(), date: '2026-05-01', type: 'expense', account: d.accounts[0].name, amount: 10, ...o });
  tx({ description: 'Netflix', category: 'Subscrições' });
  tx({ description: 'Netflix', category: 'Lazer / Subscrições' });
  tx({ description: 'Pingo Doce', category: 'Mercearia / Arroz', amount: 115 });
  tx({ description: 'LIDL', category: 'Alimentação / Carne', amount: 60, splits: [{ category: 'Alimentação / Carne', amount: 30 }, { category: 'Bebidas / Sumo', amount: 30 }] });
  tx({ description: 'Venda: Jogo', category: 'Lazer / Gaming', type: 'income' });
  d.recurring = [{ id: 'r1', description: 'IUC: Carro', type: 'expense', amount: 150, account: d.accounts[0].name, category: 'Impostos / IUC', frequency: 'monthly', start: '2027-02-02', day: 2, active: true }];
  return d;
}

test('Correções sugeridas: só aparecem quando se aplicam e corrigem categorias, recorrências e movimentos', () => {
  const d = fixture(), ids = C.suggestedCorrections(d).map((x) => x.id);
  assert.ok(ids.includes('move:Subscrições'));
  assert.ok(ids.includes('move:Mercearia'));
  assert.ok(ids.includes('recurring:iuc'));
  assert.ok(ids.includes('tx:sales'));
  assert.ok(ids.includes('tx:supermarket'));
  assert.ok(!ids.includes('move:Contas / TV'), 'categoria sem uso não é proposta');
  C.applyCorrections(d, ids);
  assert.deepEqual(d.transactions.map((t) => t.category), ['Lazer / Subscrições', 'Lazer / Subscrições', 'Alimentação / Supermercado', 'Alimentação / Carne', 'Receita / Vendas']);
  assert.match(d.transactions[2].note, /Antes: Alimentação \/ Mercearias \/ Arroz/);
  assert.equal(d.transactions[3].splits.length, 2, 'compra dividida por artigos não é tocada');
  assert.equal(d.recurring[0].frequency, 'yearly');
  assert.equal(C.suggestedCorrections(d).length, 0);
});

test('Correções sugeridas: descartar tira da lista sem alterar dados', () => {
  const d = fixture(), before = JSON.stringify(d.transactions), ids = C.suggestedCorrections(d).map((x) => x.id);
  assert.equal(C.dismissCorrections(d, ids), ids.length);
  assert.equal(C.suggestedCorrections(d).length, 0);
  assert.equal(JSON.stringify(d.transactions), before, 'movimentos intactos');
  assert.equal(d.recurring[0].frequency, 'monthly', 'recorrência intacta');
  assert.throws(() => C.dismissCorrections(d, []), /pelo menos uma/);
});

test('Correções sugeridas: sem escolha não grava', () => {
  const d = fixture(), before = JSON.stringify(d);
  assert.throws(() => C.applyCorrections(d, []), /pelo menos uma/);
  assert.equal(JSON.stringify(d), before);
});
