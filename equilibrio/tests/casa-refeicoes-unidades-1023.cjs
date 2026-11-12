const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../finance.js'), C = require('../casa-model.js'), L = require('../casa-life-model.js'), D = require('../casa-daily-model.js'), Dossiers = require('../dossiers-model.js');

function fixture() {
  const d = F.empty(), s = C.saveStore(d, { name: 'Loja' });
  const oats = C.saveProduct(d, { name: 'Flocos de Aveia', category: 'Mercearia', unit: 'kg' });
  const milk = C.saveProduct(d, { name: 'Leite', category: 'Laticínios', unit: 'L' });
  const eggs = C.saveProduct(d, { name: 'Ovos', category: 'Frescos', unit: 'un' });
  C.setOffer(d, oats, s, { packageQty: 1, price: 2 });
  C.setOffer(d, milk, s, { packageQty: 1, price: 1 });
  C.setOffer(d, eggs, s, { packageQty: 12, price: 3 });
  return { d, oats, milk, eggs };
}

test('Refeições: aceita os seis tipos e recusa um tipo desconhecido ou repetido no mesmo dia', () => {
  const { d, oats } = fixture(), r = L.saveRecipe(d, { name: 'Papas', servings: 1, ingredients: [{ catalogId: oats, qty: 0.05 }] });
  assert.deepEqual(L.meals.map(m => m[0]), ['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner', 'supper']);
  for (const [meal] of L.meals) L.plan(d, { recipeId: r, servings: 1, date: '2026-11-11', meal });
  assert.equal(d.casa.plans.length, 6);
  assert.equal(L.mealLabel('breakfast'), 'Pequeno-almoço');
  assert.equal(L.mealLabel('supper'), 'Ceia');
  const before = JSON.stringify(d);
  assert.throws(() => L.plan(d, { recipeId: r, servings: 1, date: '2026-11-12', meal: 'brunch' }), /inválida/);
  assert.throws(() => L.plan(d, { recipeId: r, servings: 1, date: '2026-11-11', meal: 'breakfast' }), /repetida/);
  assert.equal(JSON.stringify(d), before);
});

test('Receitas: quantidade com unidade é convertida para a unidade do produto e o custo usa-a', () => {
  const { d, oats, milk, eggs } = fixture();
  const r = L.saveRecipe(d, { name: 'Pequeno-almoço', servings: 1, ingredients: [
    { catalogId: oats, amount: 50, unit: 'g' }, { catalogId: milk, amount: 250, unit: 'ml' }, { catalogId: eggs, amount: 2, unit: 'un' }] });
  const recipe = d.casa.recipes.find(x => x.id === r);
  assert.deepEqual(recipe.ingredients, [{ catalogId: oats, qty: 0.05, unit: 'g' }, { catalogId: milk, qty: 0.25, unit: 'ml' }, { catalogId: eggs, qty: 2 }]);
  assert.deepEqual(L.ingredientQty(recipe.ingredients[0], 'kg'), { qty: 50, unit: 'g' });
  assert.deepEqual(L.ingredientQty(recipe.ingredients[1], 'L'), { qty: 250, unit: 'ml' });
  assert.deepEqual(L.ingredientQty({ qty: 2 }, 'un'), { qty: 2, unit: 'un' });
  // 50 g a 2 €/kg + 250 ml a 1 €/L + 2 ovos a 0,25 € = 0,10 + 0,25 + 0,50
  assert.equal(D.recipeCost(d, r, 1).total, 0.85);
  assert.deepEqual(L.requirements(d, r, 2).map(x => x.qty), [0.1, 0.5, 4]);
});

test('Receitas: unidade incompatível ou quantidade abaixo da precisão é recusada sem gravar', () => {
  const { d, oats, eggs } = fixture(), before = JSON.stringify(d);
  assert.throws(() => L.saveRecipe(d, { name: 'X', servings: 1, ingredients: [{ catalogId: oats, amount: 50, unit: 'ml' }] }), /equivalência/);
  assert.throws(() => L.saveRecipe(d, { name: 'X', servings: 1, ingredients: [{ catalogId: eggs, amount: 1, unit: 'kg' }] }), /equivalência/);
  assert.throws(() => L.saveRecipe(d, { name: 'X', servings: 1, ingredients: [{ catalogId: oats, amount: 1, unit: 'chávena' }] }), /incompatível/);
  assert.throws(() => L.saveRecipe(d, { name: 'X', servings: 1, ingredients: [{ catalogId: oats, amount: 0.5, unit: 'g' }] }), /inválida/);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(L.ingredientUnits('kg'), ['kg', 'g']);
  assert.deepEqual(L.ingredientUnits('L'), ['L', 'ml', 'cl']);
  assert.deepEqual(L.ingredientUnits('un'), ['un']);
  assert.deepEqual(L.allUnits('kg'), ['kg', 'un', 'g', 'L', 'ml', 'cl']);
});

test('Receitas: receitas antigas sem unidade continuam válidas e uma unidade que deixou de servir mostra a do produto', () => {
  const { d, oats } = fixture(), r = L.saveRecipe(d, { name: 'Antiga', servings: 2, ingredients: [{ catalogId: oats, qty: 1 }] });
  assert.deepEqual(d.casa.recipes.find(x => x.id === r).ingredients, [{ catalogId: oats, qty: 1 }]);
  assert.deepEqual(L.ingredientQty({ qty: 1, unit: 'g' }, 'un'), { qty: 1, unit: 'un' });
  L.validate(d);
});

test('Consumos: Vazio, Ponta e Cheio gravam juntos, somam no mês e uma leitura inválida não grava nenhuma', () => {
  const d = F.empty();
  const tri = (date, v, p, c) => [['Vazio', v], ['Ponta', p], ['Cheio', c]].map(([label, reading]) => ({ utility: 'electricity', unit: 'kWh', meter: 'Contador principal · ' + label, date, reading }));
  Dossiers.saveUtilityReadings(d, tri('2026-10-01', 1000, 400, 800));
  Dossiers.saveUtilityReadings(d, tri('2026-11-01', 1120, 440, 890));
  assert.equal(d.casa.utilityReadings.length, 6);
  const comp = Dossiers.utilityComparison(d, { utility: 'electricity' });
  assert.equal(comp.monthly[0].month, '2026-11');
  assert.equal(comp.monthly[0].consumption, 250);
  assert.deepEqual(comp.intervals.filter(r => r.date === '2026-11-01').map(r => r.consumption).sort((a, b) => a - b), [40, 90, 120]);
  const before = JSON.stringify(d);
  assert.throws(() => Dossiers.saveUtilityReadings(d, tri('2026-12-01', 1200, 100, 950)), /inferior|inválid|menor/i);
  assert.equal(JSON.stringify(d), before);
  assert.throws(() => Dossiers.saveUtilityReadings(d, []), /pelo menos uma/);
});

test('Receitas: qualquer unidade com equivalência (2 un de banana ao kg, 120 g de ovos à unidade)', () => {
  const { d, oats, eggs } = fixture();
  const r = L.saveRecipe(d, { name: 'Bolo', servings: 1, ingredients: [
    { catalogId: oats, amount: 2, unit: 'un', per: 0.12 }, { catalogId: eggs, amount: 120, unit: 'g', per: 1 / 60 }] });
  const recipe = d.casa.recipes.find(x => x.id === r);
  assert.deepEqual(recipe.ingredients, [{ catalogId: oats, qty: 0.24, unit: 'un', per: 0.12 }, { catalogId: eggs, qty: 2, unit: 'g', per: 0.016667 }]);
  assert.deepEqual(L.ingredientQty(recipe.ingredients[0], 'kg'), { qty: 2, unit: 'un', per: 0.12 });
  assert.deepEqual(L.requirements(d, r, 1).map(x => x.qty), [0.24, 2]);
  L.validate(d);
});
