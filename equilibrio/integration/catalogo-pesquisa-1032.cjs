'use strict';
const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
const { createServer } = require('../serve.cjs');

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      data = F.empty();
      const store = CasaFinance.saveStore(data, {name:'Loja A'});
      const rice = CasaFinance.saveProduct(data, {name:'Arroz',unit:'kg',brand:'Marca A'});
      CasaFinance.setOffer(data, rice, store, {price:2,packageQty:1});
      CasaFinance.saveProduct(data, {name:'Massa',unit:'kg',brand:'Marca A'});
      CasaFinance.saveProduct(data, {name:'Açúcar',unit:'kg',archived:true});
      navigate('casaProducts');
    });
    const input = page.locator('#casaProductSearch');
    await input.evaluate(node => { window.auditCatalogInput = node; });
    const results = () => page.locator('#casaCatalogCards .cat-card:visible [data-product-detail]').allTextContents();
    await input.fill('MARCA A');
    assert.deepEqual(await results(), ['Arroz', 'Massa']);
    assert.ok(await input.evaluate(node => window.auditCatalogInput === node && node === document.activeElement));
    await page.locator('#casaCatalogStore').selectOption('__missing');
    assert.deepEqual(await results(), ['Massa']);
    await input.clear();
    assert.deepEqual(await results(), ['Massa']);
    await page.locator('#casaCatalogStore').selectOption('');
    await page.locator('[data-catalog-status=archived]').click();
    await input.fill('Açú');
    assert.deepEqual(await results(), ['Açúcar']);
    await input.fill('sem correspondência');
    assert.equal((await results()).length, 0);
    assert.match(await page.locator('#casaCatalogCards').textContent(), /Nenhum produto encontrado/);
    assert.deepEqual(errors, []);
    console.log('Catálogo: pesquisa, foco, filtros, arquivo e estado vazio verificados.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
