'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright-core');

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const profile = fs.mkdtempSync(path.join(path.dirname(manifest.snapshot), 'revisao-funcional-'));
const dataPath = path.join(profile, 'Financas Pessoais');
fs.mkdirSync(dataPath);
fs.writeFileSync(path.join(profile, '.equilibrio-validation'), '');
fs.copyFileSync(manifest.snapshot, path.join(dataPath, 'financas.db'));

(async () => {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: ['desktop/main.cjs', '--equilibrio-validation'],
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, EQUILIBRIO_VALIDATION_ROOT: profile },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof UnifiedWorkspaceUI === 'object', null, { timeout: 25000 });
    await page.waitForFunction(() => !equilibrioStartup.awaitingChoice || !!document.querySelector('#welcomeContinue')?.getClientRects().length);
    if (await page.locator('#welcomeContinue').isVisible()) await page.locator('#welcomeContinue').click();
    await page.waitForFunction(() => !equilibrioStartup.awaitingChoice && data.accounts.some(a => !a.archived));
    const id = 'audit-closed-month';
    const label = 'Auditoria funcional 20261119';
    const date = '2020-09-15';
    const m = date.slice(0, 7);
    const initial = await page.evaluate(({ m, date, id, label }) => {
      if (data.closedMonths.includes(m)) throw Error('O mês de teste já está fechado.');
      const account = data.accounts.find(a => !a.archived);
      if (!commit(() => F.add(data, { id, date, description: label, account: account.name, type: 'expense', amount: 12 })))
        throw Error('Falha ao preparar movimento.');
      month = m;
      navigate('reports');
      return data.accounts.find(a => a.id === account.id).balance;
    }, { m, date, id, label });
    const modal = page.locator('#modal');
    const openClose = () => page.evaluate(() => document.querySelector('#closeMonth').click());
    const submit = async () => {
      await modal.locator('button[type=submit]').first().click();
      const title = await page.locator('#formTitle').textContent();
      try {
        await modal.waitFor({ state: 'hidden' });
      } catch (error) {
        const message = await page.locator('#formError').textContent().catch(() => '');
        throw Error(title + ' · ' + (message || error.message.split('\n')[0]));
      }
    };
    const state = () => page.evaluate(({ id, m }) => {
      const ledger = DesktopPersistence.readSpace(LifeUI.activeSpace().id).data;
      return {
        hasMovement: ledger.transactions.some(t => t.id === id),
        closed: ledger.closedMonths.includes(m),
      };
    }, { id, m });
    await openClose();
    assert.equal(await modal.isVisible(), false);
    assert.deepEqual(await state(), { hasMovement: true, closed: false });
    await page.evaluate(m => {
      if (!commit(() => {
        const review = ReconciliationModel.monthReview(data, m);
        for (const account of review.accounts)
          FinancePlus.reconcile(data, account.id, review.date, account.expected);
      })) throw Error('Falha ao preparar conferências.');
    }, m);
    await openClose();
    for (const box of await modal.locator('input[type=checkbox][required]').all()) await box.check();
    await submit();
    assert.deepEqual(await state(), { hasMovement: true, closed: true });
    await page.evaluate(id => transactionForm(id), id);
    assert.equal(await modal.isVisible(), false);
    await page.evaluate(id => actions['delete-tx'](id), id);
    if (await modal.isVisible()) {
      await modal.locator('button[type=submit]').first().click();
      assert.ok(await page.locator('#formError').isVisible());
      await page.evaluate(() => document.querySelector('#modal').close());
    }
    assert.deepEqual(await state(), { hasMovement: true, closed: true });
    await openClose();
    await submit();
    assert.deepEqual(await state(), { hasMovement: true, closed: false });

    await page.evaluate(id => actions['delete-tx'](id), id);
    await submit();
    assert.deepEqual(await state(), { hasMovement: false, closed: false });
    await page.evaluate(() => document.querySelector('#undo').click());
    assert.deepEqual(await state(), { hasMovement: true, closed: false });
    assert.equal(await page.evaluate(id => {
      const tx = data.transactions.find(t => t.id === id);
      return data.accounts.find(a => a.name === tx.account).balance;
    }, id), initial);

    const csvLabel = label + ' CSV';
    const prepareCsv = async () => {
      await page.evaluate(label => openImportWizard('Data;Descrição;Valor\n2020-09-16;' + label + ';-14,20', 'auditoria.csv'), csvLabel);
      if (await page.locator('[name=column_date]').count()) await page.locator('[name=column_date]').selectOption('0');
      if (await page.locator('[name=column_description]').count()) await page.locator('[name=column_description]').selectOption('1');
      if (await page.locator('[name=column_amount]').count()) await page.locator('[name=column_amount]').selectOption('2');
      await submit();
    };
    await prepareCsv();
    const pendingId = await page.evaluate(label => data.pendingImports.find(t => t.description === label)?.id, csvLabel);
    assert.ok(pendingId, 'O CSV precisa de aparecer na revisão');
    assert.equal(await page.evaluate(label => data.transactions.some(t => t.description === label), csvLabel), false);
    await page.evaluate(id => {
      for (const input of document.querySelectorAll('[data-import-check]'))
        input.checked = input.dataset.importCheck === id;
      document.querySelector('#confirmImports').click();
    }, pendingId);
    if (await modal.isVisible()) await submit();
    const result = await page.evaluate(label => {
      const reopened = DesktopPersistence.readSpace(LifeUI.activeSpace().id).data;
      return {
        movements: reopened.transactions.filter(t => t.description === label).map(t => t.amount),
        pending: reopened.pendingImports.some(t => t.description === label),
      };
    }, csvLabel);
    assert.deepEqual(result, { movements: [14.2], pending: false });
    await prepareCsv();
    const repeatedId = await page.evaluate(label => data.pendingImports.find(t => t.description === label)?.id, csvLabel);
    assert.ok(repeatedId, 'Repetição disponível para revisão');
    assert.ok(await page.locator('[data-import-check="' + repeatedId + '"]').isDisabled());
    const repeatedCount = await page.evaluate(label => DesktopPersistence.readSpace(LifeUI.activeSpace().id).data.transactions.filter(tx => tx.description === label).length, csvLabel);
    assert.equal(repeatedCount, 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ closedMonth: true, editBlocked: true, deleteBlocked: true, reopenedMonth: true, deleted: true, undoAndBalance: true, csvPreviewAndImport: true, csvReplayBlocked: true, sqlite: true }));
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
