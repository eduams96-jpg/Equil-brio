const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
const { createServer } = require('../serve.cjs');

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [{ id: 'bank', name: 'Conta principal', type: 'Banco', balance: 6800 }];
      for (let i = 0; i < 24; i++) {
        const m = dashboardMonthOffset(month, -i);
        data.transactions.push({ id: `income-${i}`, description: 'Ordenado', type: 'income', amount: 2000 + i * 12, date: `${m}-05`, account: 'Conta principal', category: 'Ordenado' });
        data.transactions.push({ id: `expense-${i}`, description: 'Despesas', type: 'expense', amount: 1200 + i * 5, date: `${m}-12`, account: 'Conta principal', category: 'Casa' });
      }
      data = F.normalize(data);
      render();
      navigate('dashboard');
    });
    for (const count of [3, 6, 12, 24]) {
      await page.locator('#summaryBalanceRange').selectOption(String(count));
      await page.locator('#summaryIncomeRange').selectOption(String(count));
      assert.equal(await page.locator('#summaryBalanceChart .summary-line-point').count(), count);
      assert.equal(await page.locator('#chart .summary-bar-income').count(), count);
      assert.equal(await page.locator('#chart .summary-bar-expense').count(), count);
    }
    assert.equal(await page.locator('#periodBadge, .summary-axis-label').count(), 0);
    assert.equal(await page.locator('#summaryExpenseLegend .summary-legend-row').count() > 0, true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'equilibrio-summary-03938.png') });
    await page.evaluate(() => navigate('weeklyHub'));
    assert.equal(await page.locator('.review30-hero-title h2').textContent(), 'A tua semana');
    assert.match(await page.locator('.review30-hero-action button').textContent(), /Ver pendências/);
    await page.screenshot({ path: path.join(os.tmpdir(), 'equilibrio-weekly-03938.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
    assert.deepEqual(errors, []);
    console.log('Resumo: filtros 3/6/12/24, sem eixo pesado; Revisão semanal e mobile OK.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
