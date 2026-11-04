const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({viewport: {width: 1600, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [{id: 'bank', name: 'Banco', type: 'Conta', balance: 5000}];
      const today = F.today();
      for (let i = 0; i < 120; i++) {
        F.add(data, {id: `tx-${i}`, date: today, type: 'expense', amount: 1, account: 'Banco', category: 'Alimentação', description: `Despesa ${i}`});
      }
      data = F.normalize(data);
      render();
      navigate('transactions');
    });
    assert.equal(await page.locator('.movement-table-row .movement-description-avatar svg').count() > 0, true, 'Ícones de categoria visíveis nos movimentos');
    const currentPage = () => page.locator('.tx-page-number[aria-current="page"]').innerText();
    await page.locator('[data-action="tx-page"][data-id="2"]').click();
    assert.equal(await currentPage(), '2');
    const firstId = await page.locator('.movement-table-row').first().getAttribute('data-transaction-id');
    await page.locator(`.movement-table-row[data-transaction-id="${firstId}"] .movement-more>summary`).click();await page.locator('.movement-menu-portal [data-action="plan-receipt"]').click();
    assert.equal(await currentPage(), '2', 'Pedir fatura deve manter a página');
    assert.equal(await page.locator(`.movement-table-row[data-transaction-id="${firstId}"] .movement-receipt-pending`).count(), 1);
    await page.locator(`.movement-table-row[data-transaction-id="${firstId}"] .movement-more>summary`).click();await page.locator('.movement-menu-portal [data-action="delete-tx"]').click();
    await page.locator('#modalForm button[type="submit"]').click();
    assert.equal(await currentPage(), '2', 'Apagar movimento deve manter a página quando ainda existe');
    assert.equal(await page.locator(`.movement-table-row[data-transaction-id="${firstId}"]`).count(), 0);
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [{id: 'bank', name: 'Banco', type: 'Conta', balance: 5000}];
      for (let i = 0; i < 51; i++) F.add(data, {id: `last-${i}`, date: F.today(), type: 'expense', amount: 1, account: 'Banco', category: 'Alimentação', description: `Última página ${i}`});
      data = F.normalize(data);
      render();
      navigate('transactions');
    });
    await page.locator('[data-movement-filter="status"][data-value="confirmed"]').click();
    await page.locator('[data-action="tx-page"][data-id="2"]').click();
    await page.locator('.movement-table-row .movement-more>summary').first().click();await page.locator('.movement-menu-portal [data-action="plan-receipt"]').click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.movement-table-row:focus').count(), 1, 'Quando a última página desaparece, manter o foco no movimento vizinho');
    assert.deepEqual(errors, []);
    console.log('Pedir fatura e apagar preservam a página de Movimentos');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
