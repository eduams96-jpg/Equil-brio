const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../finance.js'), C = require('../casa-model.js'), D = require('../casa-daily-model.js');

function fixture() {
  const d = F.empty();
  const near = C.saveStore(d, { name: 'Perto', distanceKm: 2 });
  const far = C.saveStore(d, { name: 'Longe', distanceKm: 30 });
  const a = C.saveProduct(d, { name: 'Arroz', category: 'Mercearia', unit: 'un' });
  const b = C.saveProduct(d, { name: 'Azeite', category: 'Mercearia', unit: 'un' });
  C.setOffer(d, a, near, { packageQty: 1, price: 2 }); C.setOffer(d, a, far, { packageQty: 1, price: 1.5 });
  C.setOffer(d, b, near, { packageQty: 1, price: 8 }); C.setOffer(d, b, far, { packageQty: 1, price: 7 });
  C.queueProduct(d, { catalogId: a, storeId: near, requestedQty: 1 });
  C.queueProduct(d, { catalogId: b, storeId: near, requestedQty: 1 });
  return { d, near, far };
}

test('Comparar lojas: a deslocação (km × €/km) entra no total e muda a melhor escolha', () => {
  const { d, near, far } = fixture();
  let r = D.compare(d, 2);
  assert.equal(r.perKm, 0.2);
  const perStore = Object.fromEntries(r.candidates.map(x => [x.stores[0], x]));
  assert.deepEqual([perStore[near].products, perStore[near].travel, perStore[near].total], [10, 0.4, 10.4]);
  assert.deepEqual([perStore[far].products, perStore[far].travel, perStore[far].total], [8.5, 6, 14.5]);
  assert.deepEqual(r.best.stores, [near]);
  D.setTravelRate(d, 0);
  r = D.compare(d, 2);
  assert.equal(r.best.total, 8.5);
  assert.ok(r.best.assignments.every(a => a.storeId === far));
});

test('Comparar lojas: loja sem distância não soma deslocação; valores inválidos são recusados sem gravar', () => {
  const d = F.empty(), s = C.saveStore(d, { name: 'Sem km' });
  assert.equal(d.casa.stores.find(x => x.id === s).distanceKm, undefined);
  C.saveStore(d, { id: s, name: 'Sem km', distanceKm: '12.34' });
  assert.equal(d.casa.stores.find(x => x.id === s).distanceKm, 12.3);
  C.saveStore(d, { id: s, name: 'Sem km', distanceKm: '' });
  assert.equal(d.casa.stores.find(x => x.id === s).distanceKm, undefined);
  const before = JSON.stringify(d);
  assert.throws(() => C.saveStore(d, { id: s, name: 'X', distanceKm: -1 }), /Distância/);
  assert.throws(() => D.setTravelRate(d, 'abc'), /km/);
  assert.equal(JSON.stringify(d), before);
});
