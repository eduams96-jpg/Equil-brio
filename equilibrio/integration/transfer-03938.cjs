const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
const { createServer } = require('../serve.cjs');

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [
        { id: 'millenium', name: 'Millenium', type: 'Banco', balance: 1000 },
        { id: 'savings', name: 'Poupança', type: 'Banco', balance: 0 },
      ];
      F.add(data, { id: 'transfer-jan', date: '2026-01-01', type: 'transfer', amount: 100, account: 'Millenium', targetAccount: 'Poupança', category: 'Transferências', description: 'Transferência Millenium → Poupança' });
      data = F.normalize(data);
      month = F.today().slice(0, 7);
      render();
      navigate('transactions');
    });
    assert.equal(await page.locator('#transactionsTable [data-transaction-id="transfer-jan"]').count(), 0);
    await page.locator('#movementHistoryToggle').click();
    await page.locator('[data-tx-type-tab="transfer"]').click();
    const row = page.locator('#transactionsTable [data-transaction-id="transfer-jan"]');
    assert.equal(await row.count(), 1);
    assert.match(await row.textContent(), /Millenium → Poupança/);
    await row.locator('[data-action="edit-tx"]').first().click();
    assert.match(await page.locator('#modal').textContent(), /Editar transferência/);
    await page.locator('#modalContent [name="date"]').fill('2026-01-05');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.waitForFunction(() => data.transactions.some(t => t.id === 'transfer-jan' && t.date === '2026-01-05'));
    const state = await page.evaluate(() => ({
      transfers: data.transactions.filter(t => t.type === 'transfer').length,
      millenium: data.accounts.find(a => a.name === 'Millenium').balance,
      savings: data.accounts.find(a => a.name === 'Poupança').balance,
    }));
    assert.deepEqual(state, { transfers: 1, millenium: 900, savings: 100 });
    assert.equal(await row.count(), 1);
    await page.locator('#addTransfer2').click();
    assert.match(await page.locator('#modal').textContent(), /Nova transferência/);
    assert.deepEqual(errors, []);
    console.log('Transferências: histórico visível, edição da data sem duplicado nem alteração dos saldos, criação acessível.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
