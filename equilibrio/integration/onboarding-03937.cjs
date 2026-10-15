const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    for (const scenario of ['current', 'historical', 'historical-mmex']) {
      const basis = scenario === 'current' ? 'current' : 'historical';
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
      await page.locator('.welcome-launcher').click();
      await page.locator('#welcomeStartSetup').click();
      await page.locator('#welcomeSetupForm [name="profile"]').fill('Ana');
      await page.locator('#welcomeSetupForm [name="accountName"]').fill('Banco Ana');
      await page.locator(`#welcomeSetupForm [name="balanceBasis"][value="${basis}"]`).check();
      await page.locator('#welcomeSetupForm [name="balance"]').fill('1000');
      await page.locator('#welcomeBalanceConfirmed').check();
      if (basis === 'current') {
        await page.screenshot({ path: 'integration/onboarding-setup-1280.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
        await page.screenshot({ path: 'integration/onboarding-setup-390.png' });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
      await page.locator('#welcomeSetupForm button[type="submit"]').click();
      assert.equal(await page.evaluate(() => data.accounts.length), 1);
      assert.equal(await page.evaluate(() => data.accounts[0].balance), 1000);
      assert.equal(await page.locator('#welcomeImportCsv').isVisible(), true);

      const fileChooser = page.waitForEvent('filechooser');
      await page.locator('#welcomeImportCsv').click();
      const chooser = await fileChooser;
      const today = await page.evaluate(() => F.today());
      const mmex = scenario === 'historical-mmex';
      const mmexHeader = ['ID','Data','Estado','Tipo','Conta','Beneficiário','Valor','Moeda','Categoria','Subcategoria','Etiquetas','Número','Observações','Levantamento','Depósito','Saldo','Comissão'];
      const mmexRows = [
        ['1',today,'','Deposit','Banco Ana','Ordenado','100','EUR','Rendimentos','','','','','','100','',''],
        ['2',today,'','Withdrawal','Banco Ana','Compras','-20','EUR','Compras','','','','','20','','',''],
      ];
      const content = mmex ? [mmexHeader, ...mmexRows].map((row) => row.join(';')).join('\n') : `Data;Descrição;Valor\n${today};Ordenado;100\n${today};Compras;-20`;
      await chooser.setFiles({ name: mmex ? 'money-manager-ex.csv' : 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
      await page.locator('#modal').waitFor({ state: 'visible' });
      if (mmex) {
        assert.equal(await page.locator('#modalForm [name="preserveBalances"]').isChecked(), false, 'Saldo histórico não pode ser preservado no assistente MMEX');
      } else {
        await page.locator('#modalForm [name="mode"]').selectOption('signed');
        await page.locator('#modalForm [name="column_date"]').selectOption('0');
        await page.locator('#modalForm [name="column_description"]').selectOption('1');
        await page.locator('#modalForm [name="column_amount"]').selectOption('2');
      }
      await page.locator('#modalForm button[type="submit"]').click();
      await page.waitForFunction(() => data.pendingImports.length === 2 && document.querySelector('#onboardingReconcileGuide'));
      assert.deepEqual(await page.evaluate(() => data.pendingImports.map((row) => row.importPreserveBalances)), [basis === 'current', basis === 'current']);
      assert.equal(await page.locator('#onboardingReconcileGuide').isVisible(), true);
      assert.match(await page.locator('#onboardingReconcileGuide').innerText(), /2 linhas selecionadas/);
      if (basis === 'current') {
        await page.reload();
        await page.evaluate(() => navigate('review'));
        await page.waitForFunction(() => document.querySelector('#onboardingReconcileGuide'));
        assert.deepEqual(await page.evaluate(() => data.pendingImports.map((row) => row.importPreserveBalances)), [true, true], 'A opção de não duplicar o saldo sobrevive ao reinício');
        await page.screenshot({ path: 'integration/onboarding-review-1280.png' });
      }
      await page.locator('#confirmImports').click();
      assert.equal(await page.evaluate(() => data.transactions.length), 0, 'A confirmação financeira deve ser explícita');
      await page.locator('#onboardingBalanceConfirm').check();
      await page.locator('#confirmImports').click();
      await page.waitForFunction(() => data.transactions.length === 2);
      assert.equal(await page.evaluate(() => data.accounts[0].balance), basis === 'current' ? 1000 : 1080);
      assert.match(await page.locator('#onboardingReconcileGuide').innerText(), /Confirmar o saldo com o banco/);
      await page.locator('#onboardingActualBalance').fill(String(basis === 'current' ? 1000 : 1080));
      await page.locator('#onboardingActualConfirmed').check();
      await page.locator('#onboardingReconcileNow').click();
      assert.equal(await page.locator('#modal').evaluate((element) => element.open), true);
      await page.locator('#modalForm button[type="submit"]').click();
      await page.waitForFunction(() => data.reconciliations.length === 1);
      assert.equal(await page.evaluate(() => data.reconciliations[0].difference), 0);
      assert.equal(await page.locator('#onboardingReconcileGuide').count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Primeira utilização: CSV e MMEX revistos, saldo atual preservado ou saldo histórico aplicado, confirmação explícita e reconciliação guardada.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
