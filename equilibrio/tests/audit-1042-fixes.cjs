'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Finance = require('../finance.js');
const Planning = require('../planning-model.js');
const SpaceTransfer = require('../space-transfer-model.js');
const Complete = require('../complete-model.js');
const Casa = require('../casa-model.js');
const Gifts = require('../gifts-model.js');
const ProviderIcons = require('../provider-icons.js');
const { writeVerifiedAtomic } = require('../desktop/verified-backup.cjs');
const { createService } = require('../mobile-sync/server/service.cjs');
const { Client } = require('../mobile-sync/shared/client.cjs');
const { SqliteStore } = require('../mobile-sync/server/sqlite-store.cjs');
const P = require('../mobile-sync/shared/protocol.cjs');
const { listenForTest } = require('./helpers/local-http.cjs');

const root = path.join(__dirname, '..');

test('Phase 2: writeVerifiedAtomic grava e serializa escritas atómicas sem deixar temporários', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-audit-vba-'));
  try {
    const file = path.join(dir, 'state.json');
    await writeVerifiedAtomic(file, Buffer.from('{"ok":1}', 'utf8'));
    assert.equal(fs.readFileSync(file, 'utf8'), '{"ok":1}');
    await Promise.all([
      writeVerifiedAtomic(file, Buffer.from('{"ok":2}', 'utf8')),
      writeVerifiedAtomic(file, Buffer.from('{"ok":3}', 'utf8')),
    ]);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"ok":3}');
    assert.deepEqual(fs.readdirSync(dir), ['state.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 3: parseAmount, normalização de debtHistoryPrincipal e proteção de reembolso em mês fechado', () => {
  assert.equal(Finance.parseAmount('EUR 1.234,50'), 1234.5);
  assert.equal(Finance.parseAmount('1.200'), 1200);
  assert.equal(Finance.parseAmount('45,20-'), -45.2);

  const raw = Finance.empty();
  raw.accounts = [{ id: 101, name: 'Ordem', type: 'Banco', openingBalance: 1000, balance: 1000 }];
  raw.transactions = [
    { id: 201, date: '2026-01-10', type: 'expense', account: 'Ordem', amount: 100, description: 'Farmácia', category: 'Saúde', debtHistoryPrincipal: 'abc' },
  ];
  assert.throws(() => Finance.normalize(raw), /Divisão histórica/);

  const d = Finance.empty();
  d.accounts = [{ id: 'a1', name: 'Ordem', type: 'Banco', openingBalance: 500, balance: 500 }];
  d.debts = [{ id: 'd1', name: 'Crédito', balance: 200, payment: 50, rate: 0, dueDay: 5 }];
  assert.throws(() => {
    Finance.add(d, {
      id: 't-over',
      date: '2026-02-01',
      type: 'expense',
      account: 'Ordem',
      amount: 300,
      description: 'Amortização',
      debtId: 'd1',
      principal: 250,
    });
  }, /capital/i);

  Finance.add(d, { id: 'buy', date: '2026-02-05', type: 'expense', account: 'Ordem', amount: 60, description: 'Loja', category: 'Compras' });
  Finance.add(d, { id: 'ref', date: '2026-02-20', type: 'income', account: 'Ordem', amount: 20, description: 'Devolução', refundOf: 'buy' });
  d.closedMonths = ['2026-02'];
  assert.throws(() => {
    Finance.update(d, 'buy', {
      id: 'buy', date: '2026-02-05', type: 'expense', account: 'Ordem', amount: 60, description: 'Loja', category: 'Casa',
    });
  }, /Reabre o mês do reembolso/);
});

test('Phase 3: Planning inbox inclui Por categorizar, deduplica reconciliações e SpaceTransfer preserva referências numéricas', () => {
  const d = Finance.empty();
  d.accounts = [{ id: 10, name: 'Ordem', type: 'Banco', openingBalance: 300, balance: 275, reconciledOn: '2026-03-05' }];
  d.transactions = [
    { id: 1, date: '2026-03-01', type: 'expense', account: 'Ordem', amount: 25, description: 'Sem cat', category: 'Por categorizar' },
  ];
  d.reconciliations = [
    { id: 'r1', accountId: 10, accountName: 'Ordem', date: '2026-02-01', actual: 290, expected: 300, difference: -10 },
    { id: 'r2', accountId: 10, accountName: 'Ordem', date: '2026-03-05', actual: 270, expected: 275, difference: -5 },
  ];
  const inbox = Planning.inbox(d, '2026-03');
  assert.ok(inbox.some((x) => /Categorizar/.test(x.title)));
  assert.equal(inbox.filter((x) => x.title === 'Conferência com diferença').length, 1);

  Planning.validate({
    ...Finance.empty(),
    forecastReviews: [{
      id: 'fr1',
      date: '2026-03-01',
      until: '2026-03-08',
      opening: 500,
      expected: 500,
      accountIds: ['10'],
      events: [{ date: '2026-03-04', amount: 50, type: 'transfer', description: 'Movimento interno', source: 'transfer' }],
    }],
  });

  const src = Finance.empty();
  src.accounts = [{ id: 10, name: 'Ordem', type: 'Banco', balance: 275 }];
  src.transactions = [{ id: 1, date: '2026-03-01', type: 'expense', account: 'Ordem', amount: 25, description: 'Sem cat', category: 'Compras' }];
  src.reserves = [{ id: 'res1', name: 'Férias', target: 500, saved: 100, protectionAccountId: 10 }];
  const dst = Finance.empty();
  const txPrep = SpaceTransfer.prepare(src, dst, { kind: 'account', ids: ['10'] });
  assert.equal(txPrep.source.accounts.length, 0);
  assert.equal(txPrep.target.accounts.length, 1);
  assert.equal(txPrep.target.accounts[0].openingBalance, 300);
  assert.equal(txPrep.target.reserves.length, 1);
});

test('Phase 3: CompleteFinance.payCard é atómico e Casa/Gifts aplicam proteções novas', () => {
  const d = Finance.empty();
  d.accounts = [
    { id: 'bank', name: 'Banco', type: 'Banco', openingBalance: 100, balance: 100 },
    { id: 'card', name: 'Visa', type: 'Cartão', openingBalance: 0, balance: -80, closingDay: 20, dueDay: 5 },
  ];
  d.installmentPlans = [{ id: 'pl1', description: 'PC', payments: [{ id: 'p1', date: '2026-03-05', amount: 80, paid: 0 }] }];
  assert.throws(() => Complete.payCard(d, 'card', 'missing-bank', 40, '2026-03-05', 0, 'pl1', 'p1'));
  assert.equal(d.transactions.length, 0);
  assert.equal(d.installmentPlans[0].payments[0].paid, 0);

  const g = Finance.empty();
  const tgt = Gifts.saveTarget(g, { person: 'Ana', occasion: 'Aniversário', year: 2026, date: '2026-05-10' });
  const cleared = Gifts.saveTarget(g, { id: tgt.id, person: 'Ana', occasion: 'Aniversário', year: 2026, date: '' });
  assert.equal(cleared.date, '');

  Casa.saveStore(g, { name: 'Loja A' });
  Casa.saveProduct(g, { name: 'Arroz', unit: 'kg', category: 'Mercearia' });
  const sid = Casa.state(g).stores[0].id;
  const pid = Casa.state(g).catalog[0].id;
  Casa.setOffersBatch(g, [{ pid, sid, price: 1.8, packageQty: 1, url: '' }]);
  assert.equal(Casa.state(g).catalog[0].offers[sid].price, 1.8);
});

test('Phase 5: CSP, acessibilidade, escaping frontend e proteção de imagens/PDF', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /class="movement-type-tabs" role="group"/);
  assert.match(html, /data-tx-type-tab="all" aria-pressed="true"/);

  const workspace = fs.readFileSync(path.join(root, 'workspace.js'), 'utf8');
  assert.match(workspace, /function select\(label, name, options, value, attrs = ""\)/);
  assert.match(workspace, /"noopener,noreferrer"/);

  const lifeUi = fs.readFileSync(path.join(root, 'life-ui.js'), 'utf8');
  assert.match(lifeUi, /media\.sandbox='allow-same-origin';media\.referrerPolicy='no-referrer'/);

  const prodUi = fs.readFileSync(path.join(root, 'productivity-ui.js'), 'utf8');
  assert.match(prodUi, /contributionModalBody/);
  assert.doesNotMatch(prodUi, /document\.getElementById\('modalContent'\)\.onclick/);

  const badImg = ProviderIcons.resolve('Teste', [{ name: 'Teste', image: 'data:text/html,<script>alert(1)</script>' }]);
  assert.equal(badImg.kind, 'initial');
});

test('Phase 6: mobile-sync autentica antes de refresh(), valida timingSafeEqual e revogação segura', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-audit-ms-'));
  let refreshCount = 0;
  const service = createService(path.join(dir, 'srv.db'), {
    refresh: () => { refreshCount++; },
  });
  const memStore = new SqliteStore(path.join(dir, 'cli.db'), P.offlineFixture());
  t.after(async () => {
    try { memStore.close(); } catch {}
    try { await service.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  assert.throws(() => service.revoke('dispositivo-inexistente'), (err) => err.http === 404);
  const url = await listenForTest(t, service.server, service.listen);

  const unauth = await fetch(url + '/api/v1/spaces/casa/bootstrap');
  assert.equal(unauth.status, 401);
  assert.equal(refreshCount, 0);

  const weirdLen = await fetch(url + '/api/v1/spaces/casa/bootstrap', {
    headers: { authorization: 'Bearer curto' },
  });
  assert.equal(weirdLen.status, 401);

  const proto = fs.readFileSync(path.join(root, 'mobile-sync/shared/protocol.cjs'), 'utf8');
  const reqBody = proto.slice(proto.indexOf('function requirements('), proto.indexOf('function apply('));
  assert.doesNotMatch(reqBody, /House\.apply/);

  const c = new Client(memStore, async () => { throw Error('offline'); });
  await assert.rejects(
    c.enqueue('house.product', { id: 'p1', seed: P.id(), changedOn: '2026-03-01', mode: 'create', values: {} }, { expectedEntityRevision: 99 }),
    /mudou entretanto/
  );
});
