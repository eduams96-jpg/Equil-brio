const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../finance.js'), C = require('../casa-model.js'), L = require('../casa-life-model.js');

function fixture() {
  const d = F.empty(), s = C.saveStore(d, { name: 'Loja' });
  const oats = C.saveProduct(d, { name: 'Aveia', category: 'Mercearia', unit: 'kg' });
  C.setOffer(d, oats, s, { packageQty: 1, price: 2 });
  const r = L.saveRecipe(d, { name: 'Papas', servings: 1, ingredients: [{ catalogId: oats, qty: 0.05 }] });
  // Semana de 2030-01-07 (segunda) a 2030-01-13
  L.plan(d, { recipeId: r, servings: 1, date: '2030-01-07', meal: 'breakfast' });
  L.plan(d, { recipeId: r, servings: 2, date: '2030-01-09', meal: 'supper' });
  return { d, r };
}

test('Semana-tipo: repete as refeições nos mesmos dias das semanas seguintes', () => {
  const { d, r } = fixture();
  L.saveTemplate(d, '2030-01-07');
  const next = L.weekPlans(d, '2030-01-14', '2030-01-20');
  assert.deepEqual(next.map(p => [p.date, p.meal, p.servings, p.template]), [['2030-01-14', 'breakfast', 1, true], ['2030-01-16', 'supper', 2, true]]);
  // A semana original não é duplicada e as semanas anteriores não são tocadas
  assert.equal(L.weekPlans(d, '2030-01-07', '2030-01-13').filter(p => p.template).length, 0);
  assert.equal(L.weekPlans(d, '2029-12-31', '2030-01-06').length, 0);
  // As necessidades da semana seguinte contam as refeições da semana-tipo (3 × 50 g sem stock)
  assert.deepEqual(L.planNeeds(d, '2030-01-14', '2030-01-20').map(n => n.qty), [0.15]);
  L.validate(d);
});

test('Semana-tipo: um dia concreto substitui o modelo; saltar e desligar funcionam sem tocar nos planos', () => {
  const { d, r } = fixture();
  L.saveTemplate(d, '2030-01-07');
  L.plan(d, { recipeId: r, servings: 3, date: '2030-01-14', meal: 'breakfast' });
  L.skipTemplate(d, '2030-01-16', 'supper');
  const week = L.weekPlans(d, '2030-01-14', '2030-01-20');
  assert.deepEqual(week.map(p => [p.date, p.servings, !!p.template]), [['2030-01-14', 3, false]]);
  L.clearTemplate(d);
  assert.equal(L.weekPlans(d, '2030-01-21', '2030-01-27').length, 0);
  assert.equal(d.casa.plans.length, 3);
  L.validate(d);
});

test('Semana-tipo: semana vazia é recusada sem gravar', () => {
  const { d } = fixture(), before = JSON.stringify(d);
  assert.throws(() => L.saveTemplate(d, '2030-02-04'), /pelo menos uma/);
  assert.equal(JSON.stringify(d), before);
});
