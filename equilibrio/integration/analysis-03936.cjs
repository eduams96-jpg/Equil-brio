const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [{ id: 'bank', name: 'Banco', type: 'Banco', balance: 5000 }];
      month = F.today().slice(0, 7);
      for (let i = 0; i < 16; i++) {
        data.transactions.push({ id: `expense-${i}`, description: `Compra ${i}`, type: 'expense', amount: 20 + i, date: `${month}-04`, account: 'Banco', category: `Categoria ${String(i).padStart(2, '0')}` });
        data.recurring.push({ id: `recurring-${i}`, description: `Recorrência ${i}`, type: 'expense', amount: 10 + i, account: 'Banco', category: 'Serviços', start: `${month}-01`, day: 1, active: true, frequency: 'monthly' });
      }
      data.transactions.push({ id: 'last-year', description: 'Despesa anterior', type: 'expense', amount: 50, date: `${Number(month.slice(0, 4)) - 1}-09-04`, account: 'Banco', category: 'Outro ano' });
      data.yearNotes = Array.from({ length: 6 }, (_, i) => ({ id: `note-${i}`, title: `Acontecimento ${i}`, date: `${month}-08`, description: `Descrição ${i}` }));
      data = F.normalize(data);
      render();
      navigate('insights');
    });
    await page.locator('#insights .analysis-v3-more > summary').click();
    assert.equal(await page.locator('#categoryBreakdown > .breakdown-row').count(), 6);
    assert.equal(await page.locator('#categoryBreakdown .analysis-more-body .breakdown-row').count(), 10);
    assert.equal(await page.locator('#recurringList > .recurring-setting-row').count(), 4);
    assert.equal(await page.locator('#recurringList .analysis-more-body .recurring-setting-row').count(), 12);
    assert.equal(await page.locator('#comparisonPanel > .comparison-row').count(), 6);
    assert.equal(await page.locator('#comparisonPanel .analysis-more-body .comparison-row').count(), 10);
    assert.equal(await page.locator('#categoryBreakdown .analysis-more summary b').getAttribute('aria-hidden'), 'true');
    await page.locator('#categoryBreakdown .analysis-more summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#categoryBreakdown .analysis-more').evaluate((el) => el.open), true);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#categoryBreakdown .analysis-more').evaluate((el) => el.open), false);
    await page.evaluate(() => AnalysisUI.enhance());
    assert.equal(await page.locator('#categoryBreakdown .analysis-more').count(), 1);
    assert.equal(await page.locator('#categoryDrill > .analysis-more').count(), 1);
    await page.locator('#categoryDrill .analysis-more summary').click();
    await page.locator('#categoryDrill .analysis-more-body button').last().click();
    assert.equal(await page.locator('#modal').evaluate((el) => el.open), true);
    await page.locator('#modal').evaluate((el) => el.close());
    await page.locator('#categoryDrill .analysis-more summary').click();
    await page.locator('#insights .analysis-v3-more').evaluate((el) => { el.open = true; });
    await page.locator('#recurringList .analysis-more').evaluate((el) => { el.open = true; });
    await page.locator('#insights .analysis-v3-more > summary').click();
    await page.locator('#recurringList .analysis-more-body button[data-action="recurring"]').last().evaluate((button) => button.click());
    assert.equal(await page.locator('#modal').evaluate((el) => el.open), true);
    await page.locator('#modal').evaluate((el) => el.close());
    await page.evaluate(() => { render(); navigate('insights'); document.querySelector('#insights .analysis-v3-more').open = true; });
    assert.equal(await page.locator('#recurringList .analysis-more').evaluate((el) => el.open), true);
    await page.locator('#recurringList .analysis-more summary').click();
    await page.evaluate(() => navigate('reports'));
    assert.equal(await page.locator('#annualCategories > .breakdown-row').count(), 6);
    assert.equal(await page.locator('#annualCategories .analysis-more-body .breakdown-row').count(), 10);
    await page.locator('#reports .annual-report-details > summary').click();
    assert.equal(await page.locator('#reports .annual-report-details').evaluate((el) => el.open), true);
    assert.equal(await page.locator('#reports #lifeAnnualReport .annual-analysis-card .analysis-more').count(), 1);
    await page.locator('#reports #lifeAnnualReport .annual-analysis-card .analysis-more summary').click();
    assert.equal(await page.locator('#reports #lifeAnnualReport .analysis-more-body .attention-row').count(), 2);
    await page.locator('#reports #lifeAnnualReport .analysis-more-body [data-action="life-remove-note"]').last().click();
    assert.equal(await page.evaluate(() => data.yearNotes.length), 5);
    assert.equal(await page.locator('#reports .annual-report-details').evaluate((el) => el.open), true);
    assert.equal(await page.locator('#reports #lifeAnnualReport .annual-analysis-card .analysis-more').evaluate((el) => el.open), true);
    await page.setViewportSize({ width: 390, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, 'expanded annual report overflows on mobile');
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator('#reports .annual-report-details > summary').click();
    await page.locator('#reportYear').evaluate((el) => {
      const previous = String(new Date().getFullYear() - 1);
      if (![...el.options].some((option) => option.value === previous)) el.add(new Option(previous, previous));
    });
    await page.locator('#reportYear').selectOption(String(new Date().getFullYear() - 1));
    await page.waitForTimeout(0);
    assert.equal(await page.locator('#annualCategories .analysis-more').count(), 0);
    await page.locator('#reportYear').selectOption(String(new Date().getFullYear()));
    await page.waitForTimeout(0);
    assert.equal(await page.locator('#annualCategories .analysis-more').count(), 1);
    for (const width of [1600, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const id of ['insights', 'reviewMonthHub', 'reports']) {
        await page.evaluate((next) => navigate(next), id);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, `${id} overflows at ${width}`);
        await page.screenshot({ path: `integration/analysis-${id}-${width}.png`, fullPage: true });
      }
    }
    await page.evaluate(() => { document.body.dataset.theme = 'dark'; navigate('reports'); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
    await page.screenshot({ path: 'integration/analysis-reports-dark-390.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Análises: listas expansíveis, ações preservadas, ano alterado e três larguras sem overflow.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
