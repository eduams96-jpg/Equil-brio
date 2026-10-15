const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 1050 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    if (process.env.WA_PREINTEGRATION) {
      await page.addStyleTag({ path: 'wealth-analysis-v3.css' });
      await page.addScriptTag({ path: 'wealth-analysis-v3.js' });
    }
    assert.equal(await page.evaluate(() => Boolean(window.WealthAnalysisV3)), true, 'módulo não carregado');
    await page.evaluate(() => {
      const d = F.empty();
      const today = F.today();
      d.accounts = [
        { id: 'a1', name: 'Millennium', type: 'Conta à ordem', balance: 6240.5 },
        { id: 'a2', name: 'Poupança', type: 'Poupança', balance: 2760 },
        { id: 'a3', name: 'Carteira', type: 'Dinheiro', balance: 399.5 },
      ];
      d.debts = [
        { id: 'd1', name: 'Habitação', balance: 37600, payment: 320, dueDay: 5, rate: 2 },
        { id: 'd2', name: 'Computador', balance: 2219.5, payment: 75, dueDay: 19, rate: 0 },
      ];
      d.investments = [
        { id: 'i1', name: 'ETF Global', type: 'ETF', value: 13200, cost: 12000, units: 100 },
        { id: 'i2', name: 'PPR', type: 'PPR', value: 4500, cost: 4400, units: 20 },
      ];
      d.assets = [
        { id: 's1', name: 'Casa', kind: 'Imóvel', valuations: [{ date: today, value: 52000 }] },
        { id: 's2', name: 'Equipamentos', kind: 'Outros', valuations: [{ date: today, value: 4000 }] },
      ];
      for (let i = 5; i >= 0; i--) {
        const m = FinancePlus.monthAdd(today.slice(0, 7), -i);
        d.transactions.push({ id: `in${i}`, date: `${m}-01`, description: 'Salário', type: 'income', amount: 2400 + i * 30, account: 'Millennium', category: 'Salário' });
        d.transactions.push({ id: `out${i}`, date: `${m}-02`, description: 'Casa', type: 'expense', amount: 850, account: 'Millennium', category: 'Casa / Renda' });
        d.transactions.push({ id: `food${i}`, date: `${m}-03`, description: 'Supermercado', type: 'expense', amount: 430 + i * 10, account: 'Millennium', category: 'Alimentação' });
      }
      d.wealthHistory = Array.from({ length: 6 }, (_, i) => ({ date: `${FinancePlus.monthAdd(today.slice(0, 7), i - 5)}-10`, net: 37000 + i * 1100 }));
      data = F.normalize(d);
      month = today.slice(0, 7);
      render();
      window.WealthAnalysisV3.render();
    });
    await page.evaluate(() => navigate('wealth'));
    assert.match((await page.locator('#wealthV3Overview').innerText()).replace(/\s/g, ''), /43280,50/);
    assert.match(await page.locator('#wealthV3Overview').innerText(), /Habitação/);
    assert.match(await page.locator('#wealthV3Overview').innerText(), /ETF Global/);
    assert.equal(await page.locator('#wealth .wealth-v3-more').count(), 0);
    assert.equal(await page.locator('#wealthLegacyViews').isVisible(), false);
    assert.equal(await page.locator('#wealth #investmentsList').count(), 1);
    await page.locator('#wealthV3Overview [data-wa-route="wealthMoneyHub"]').first().click();
    assert.equal(await page.locator('body').getAttribute('data-current-view'), 'wealthMoneyHub');
    await page.evaluate(() => navigate('wealth'));
    await page.locator('#wealth > .section-head [data-wa-action="trade"]').click();
    assert.equal(await page.locator('#modal').evaluate((node) => node.open), true);
    await page.locator('#modal').evaluate((node) => node.close());
    await page.evaluate(() => navigate('insights'));
    assert.match(await page.locator('#analysisV3Overview').innerText(), /Receitas e despesas/);
    assert.match(await page.locator('#analysisV3Overview').innerText(), /Para onde foi o dinheiro/);
    const typography = await page.locator('#analysisV3Overview .analysis-v3-metrics strong').first().evaluate((node) => getComputedStyle(node).fontSize);
    assert.ok(parseFloat(typography) >= 20, `valor de análise demasiado pequeno: ${typography}`);
    await page.locator('#analysisV3Overview [data-wa-category="0"]').click();
    assert.match(await page.locator('#modal').innerText(), /Casa/);
    await page.locator('#modal').evaluate((node) => node.close());
    await page.locator('#analysisV3Overview [data-wa-month]').last().click();
    assert.equal(await page.locator('body').getAttribute('data-current-view'), 'transactions');
    assert.equal(await page.evaluate(() => window.CompleteUI.getFilters().start), await page.evaluate(() => `${month}-01`));
    await page.evaluate(() => navigate('insights'));
    assert.equal(await page.locator('#insights .analysis-v3-more').evaluate((node) => node.open), false);
    await page.locator('#analysisV3Overview [data-wa-route="insights"]').click();
    assert.equal(await page.locator('#insights .analysis-v3-more').evaluate((node) => node.open), true);
    assert.equal(await page.locator('#categoryBreakdown').isVisible(), true);
    await page.locator('#insights .analysis-v3-more > summary').click();
    const exportDownload = page.waitForEvent('download');
    await page.locator('#insights > .section-head [data-wa-action="export-report"]').click();
    assert.match((await exportDownload).suggestedFilename(), /^equilibrio-relatorio-\d{4}\.html$/);
    assert.equal(await page.locator('body').getAttribute('data-current-view'), 'reports');
    for (const width of [1512, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const id of ['wealth', 'insights', 'reviewMonthHub', 'reports']) {
        await page.evaluate((route) => navigate(route), id);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, `overflow em ${id} a ${width}`);
      }
      for (const id of ['wealth', 'insights']) {
        await page.evaluate((route) => navigate(route), id);
        await page.screenshot({ path: `integration/wa-v3-${id}-${width}.png`, fullPage: true });
      }
    }
    await page.evaluate(() => { document.body.dataset.theme = 'dark'; navigate('wealth'); });
    await page.screenshot({ path: 'integration/wa-v3-wealth-dark-390.png', fullPage: true });
    await page.evaluate(() => navigate('insights'));
    await page.screenshot({ path: 'integration/wa-v3-insights-dark-390.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Património e Análises: valores reais, ações, detalhes, rotas, responsive e dark theme OK');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
