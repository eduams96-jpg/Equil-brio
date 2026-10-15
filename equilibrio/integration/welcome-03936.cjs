const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 850}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    await page.locator('.welcome-launcher').click();
    assert.equal(await page.locator('#welcomeDialog').evaluate(el => el.open), true);
    assert.equal(await page.locator('.welcome-space').count(), 1);
    await page.locator('#welcomeCreate').click();
    assert.equal(await page.locator('#welcomeDialog').evaluate(el => el.open), false);
    assert.equal(await page.locator('#modal').evaluate(el => el.open), true);
    await page.locator('#modalForm input[name="name"]').fill('Família');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.waitForFunction(() => LifeUI.spaces().length === 2 && LifeUI.activeSpace().name === 'Família');
    await page.locator('.welcome-launcher').click();
    assert.equal(await page.locator('.welcome-space').count(), 2);
    await page.locator('.welcome-space input[value="main"]').check();
    await page.locator('#welcomeContinue').click();
    assert.equal(await page.evaluate(() => LifeUI.activeSpace().id), 'main');
    for (const width of [1280, 390]) {
      await page.setViewportSize({width, height: 850});
      await page.locator('.welcome-launcher').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
      await page.screenshot({path: `integration/welcome-${width}.png`});
      await page.locator('#welcomeClose').click();
    }
    assert.deepEqual(errors, []);
    console.log('Boas-vindas: criar, selecionar e reabrir espaços; layout responsivo');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
