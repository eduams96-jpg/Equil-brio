'use strict';
// Lista de compras: riscar no cliente, sincronizar e o PC (espaço do servidor) ver done:true.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const P = require('../shared/protocol.cjs'), { Client } = require('../shared/client.cjs'), { SqliteStore } = require('./sqlite-store.cjs'), { createDesktopBridge } = require('./desktop-bridge.cjs');
const Compras = require('../app/src/screens/compras.cjs');

// Tal como no telemóvel: cliente com negociação de compatibilidade contra a ponte do PC.
async function setup(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-shopping-')), service = createDesktopBridge(path.join(folder, 'pc-profile')), url = await service.listen();
  const token = service.provision('phone', ['main']);
  const request = async (method, p, data) => {
    const r = await fetch(url + p, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const value = await r.json();
    if (r.status >= 400 && value.status !== 'epoch-mismatch') throw Object.assign(Error(value.message || 'HTTP ' + r.status), { status: r.status });
    return value;
  };
  const bootstrap = await request('GET', '/api/v1/spaces/main/bootstrap'), store = new SqliteStore(path.join(folder, 'phone.db'), P.local(bootstrap, 'phone'));
  t.after(async () => { store.close(); await service.close(); fs.rmSync(folder, { recursive: true, force: true }); });
  const client = new Client(store, request, { negotiate: true });
  const send = (id, values) => client.enqueue('house.shopping', { id, seed: P.id(), changedOn: '2026-11-05', values });
  const server = () => service.desktop.readSpace('main').data.casa.shopping;
  return { client, store, send, server };
}

test('riscar no cliente sincroniza e o PC vê done:true; desmarcar volta a false', async t => {
  const x = await setup(t), id = P.id();
  await x.send(id, Compras.addValues({ name: 'Detergente', qty: '2' }));
  await x.client.sync();
  assert.equal(x.server().find(s => s.id === id).done, false);

  // O que o ecrã mostra decide o valor enviado: caixa por marcar -> data-next="true".
  const html = Compras.render({ ledger: P.view(x.store.read().state).ledger, state: { hidden: false } }, { status: 'all', storeId: '', query: '', inStore: false });
  assert.match(html, new RegExp('data-shopping-done="' + id + '"[^>]*data-next="true"'));
  await x.send(id, Compras.setDone(true));
  await x.send(id, Compras.setDone(true));
  assert.equal(P.view(x.store.read().state).ledger.casa.shopping.find(s => s.id === id).done, true);
  await x.client.sync();
  assert.equal(x.server().find(s => s.id === id).done, true);
  assert.deepEqual(x.store.read().state.outbox.map(o => o.status), ['acknowledged', 'acknowledged', 'acknowledged']);

  await x.send(id, Compras.setDone(false));
  await x.client.sync();
  assert.equal(x.server().find(s => s.id === id).done, false);
});

test('conferir artigo do catálogo: o ajuste de embalagens e a nota chegam ao PC', async t => {
  const x = await setup(t);
  await x.client.enqueue('house.product', { id: 'rice', mode: 'create', seed: P.id(), changedOn: '2026-11-05', values: { name: 'Arroz', brand: '', category: 'Alimentação', unit: 'un', url: '', offersRows: [{ storeName: 'Loja A', packageQty: 1, price: 1.2 }] } });
  const ledger = () => P.view(x.store.read().state).ledger;
  const storeId = ledger().casa.stores[0].id, id = P.id();
  await x.send(id, Compras.queueValues({ catalogId: 'rice', storeId, qty: '2' }));
  const defaults = Compras.offerDefaults(ledger(), id);
  assert.deepEqual(defaults, { packages: 2, price: 1.2 });
  await x.send(id, Compras.updateValues({ packages: '3', price: '1,10', location: 'Despensa', expiry: '', note: 'Integral' }, true, defaults));
  await x.client.sync();
  const row = x.server().find(s => s.id === id);
  assert.deepEqual([row.note, row.location, row.purchaseOverride.packages, row.purchaseOverride.price], ['Integral', 'Despensa', 3, 1.1]);
  assert.equal(Compras.view(ledger(), { status: 'all' }).rows[0].total, 3.3);
  await x.send(id, Compras.updateValues({ packages: '2', price: '1,2', location: 'Despensa', expiry: '', note: 'Integral' }, true, defaults));
  await x.client.sync();
  assert.equal(x.server().find(s => s.id === id).purchaseOverride, undefined);
});
