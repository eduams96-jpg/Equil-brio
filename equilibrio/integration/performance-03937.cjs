const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    const results = await page.evaluate(() => {
      data = demoData();
      const original = data.transactions.slice();
      data.transactions = Array.from({ length: 1000 }, (_, index) => ({
        ...original[index % original.length],
        id: `perf-${index}`,
        note: index % 5 ? '' : 'Nota de controlo',
      }));
      data = F.normalize(data);
      render();
      const stages = {};
      for (const name of ['renderDashboard', 'renderTransactions', 'renderCollections', 'renderPlanning', 'renderReports', 'renderWealth', 'renderReview']) {
        const originalRender = window[name];
        window[name] = (...args) => {
          const start = performance.now();
          try { return originalRender(...args); }
          finally { stages[name] = Math.round((stages[name] || 0) + performance.now() - start); }
        };
      }
      for (const [name, owner] of [['FeatureUI', 'render'], ['PremiumUI', 'render']]) {
        if (!window[name]?.[owner]) continue;
        const originalRender = window[name][owner];
        window[name][owner] = (...args) => {
          const start = performance.now();
          try { return originalRender(...args); }
          finally { stages[name] = Math.round((stages[name] || 0) + performance.now() - start); }
        };
      }
      const timings = [];
      for (let trial = 0; trial < 3; trial++) {
        const start = performance.now();
        render();
        timings.push(Math.round(performance.now() - start));
      }
      return { transactions: data.transactions.length, timings, medianMs: timings.slice().sort((a,b)=>a-b)[1], stages };
    });
    assert.equal(results.transactions, 1000);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
