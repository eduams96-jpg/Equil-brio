'use strict';
// Dados fictícios partilhados pelos ecrãs, pelos testes e pela pré-visualização.
const P = require('../../../shared/protocol.cjs');
const H = require('../../../shared/house.cjs');

function empty() {
  return P.fixture();
}

function demo() {
  const d = P.fixture();
  const bank = d.accounts[0].name;
  const cash = d.accounts[1].name;
  const rows = [
    { id: 'm-salary', date: '2026-11-02', description: 'Ordenado', type: 'income', amount: 1450, account: bank, category: 'Rendimentos' },
    { id: 'm-super', date: '2026-11-03', description: 'Compras no supermercado', type: 'expense', amount: 63.2, account: bank, category: 'Alimentação', beneficiary: 'Continente' },
    { id: 'm-coffee', date: '2026-11-04', description: 'Café', type: 'expense', amount: 1.6, account: cash, category: 'Alimentação' },
    { id: 'm-fuel', date: '2026-10-28', description: 'Combustível', type: 'expense', amount: 48.5, account: bank, category: 'Transportes' },
    { id: 'm-move', date: '2026-11-01', description: 'Levantamento', type: 'transfer', amount: 40, account: bank, targetAccount: cash, category: 'Transferências' },
  ];
  for (const t of rows) P.Finance.add(d, t);
  d.casa = {
    version: 1, purchases: [{ id: 'pu-1', store: 'Continente', date: '2026-11-03', total: 63.2, items: [{ name: 'Leite', qty: 6, unit: 'un', total: 5.4 }, { name: 'Pão', qty: 1, unit: 'un', total: 57.8 }] }], catalog: [], stores: [], stock: [],
    shopping: [
      { id: 'sh-1', name: 'Leite', qty: '6 un', done: false },
      { id: 'sh-2', name: 'Pão', qty: '1', done: true },
      { id: 'sh-3', name: 'Detergente', qty: '2', done: false },
    ],
  };
  H.Casa.saveProductOffers(d, { name: 'Arroz agulha', brand: 'Cigala', category: 'Alimentação', unit: 'un' }, [
    { storeName: 'Continente', packageQty: 1, price: 1.29 }, { storeName: 'Pingo Doce', packageQty: 1, price: 1.35 },
  ]);
  H.Life.lot(d, { catalogId: H.Casa.state(d).catalog[0].id, qty: 3, location: 'Despensa', expiry: '2027-03-01', opened: false });
  d.pendingPayments = [
    { id: 'pp-rent', description: 'Renda', date: '2026-11-08', type: 'expense', amount: 520, account: bank, category: 'Habitação' },
    { id: 'pp-net', description: 'Internet', date: '2026-11-20', type: 'expense', amount: 34.9, account: bank, category: 'Serviços' },
  ];
  d.investments = [{ id: 'inv-1', name: 'Fundo Poupança', type: 'Fundo', account: bank, invested: 1500, value: 1620 }];
  d.assets = [{ id: 'as-1', name: 'Automóvel', kind: 'Veículo', valuations: [{ date: '2026-10-01', value: 6500 }] }];
  d.debts = [{ id: 'db-1', name: 'Crédito automóvel', account: bank, balance: 3200, payment: 150 }];
  d.wealthHistory = [
    { id: 'w-1', date: '2026-09-30', cash: 2100, investments: 1600, assets: 6500, debts: 3350, net: 6850 },
    { id: 'w-2', date: '2026-10-31', cash: 2300, investments: 1620, assets: 6500, debts: 3200, net: 7220 },
  ];
  return d;
}

function ctx(ledger, overrides) {
  return {
    ledger,
    state: { hidden: false },
    today: '2026-11-05',
    lastSync: null,
    settings: { notifications: false, hour: 9, theme: 'auto', hideOnOpen: false },
    counts: { notices: null, shopping: null },
    ...overrides,
  };
}

module.exports = { empty, demo, ctx };
