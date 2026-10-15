const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [{ id: 'a', name: 'Banco', type: 'Conta', balance: 100 }];
      data.importProfiles = [{
        id: 'profile-1', name: 'Extrato habitual', separator: ';', header: true,
        mode: 'signed', defaultAccount: 'Banco', overrideAccount: true,
        headerSignature: 'data|descricao|valor',
        columns: { column_date: '0', column_description: '1', column_amount: '2' },
      }];
      data = F.normalize(data);
      render();
      openImportWizard('Data;Descrição;Valor\n2026-09-01;Compra;-12,50', 'extrato.csv');
    });
    assert.equal(await page.locator('[name=savedProfile]').inputValue(), 'profile-1');
    assert.match(await page.locator('.import-profile-match').innerText(), /Extrato habitual/);
    assert.equal(await page.locator('[name=column_date]').inputValue(), '0');
    assert.equal(await page.locator('[name=column_description]').inputValue(), '1');
    assert.equal(await page.locator('[name=column_amount]').inputValue(), '2');
    assert.match(await page.locator('#importPreview').innerText(), /1 novos|1 novo/);
    assert.deepEqual(errors, []);
    console.log('Formato CSV guardado reconhecido pelo cabeçalho; mapeamento e amostra aplicados.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
