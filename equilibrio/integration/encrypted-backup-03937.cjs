const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__backupCalls = [];
      window.financasDesktop = new Proxy({
        isDesktop: true, desktopVersion: '0.39.37',
        getBackupSettings: async () => ({ directory: '', frequency: 'daily', retention: 30, onClose: false, lastBackupAt: '' }),
        dataListSpacesSync: () => [], dataReadSpaceSync: () => null, readSqliteSpaceSync: () => null,
        dataCommitLedgerSync: () => ({ ok: true }), syncCriticalDomains: () => ({ ok: true }),
        updateSnapshot: () => {}, runBackup: async () => ({ skipped: true }),
        getAppInfo: async () => ({}), saveStorage: async () => true, saveStorageSync: () => true,
        saveEncryptedBackup: async (name, content, passphrase) => {
          window.__backupCalls.push({ kind: 'save', name, content, passphrase });
          return 'teste.fpbackup';
        },
        openEncryptedBackup: async (passphrase) => {
          window.__backupCalls.push({ kind: 'open', passphrase });
          if (passphrase !== 'frase-passe de teste longa') throw Error('Frase-passe incorreta ou cópia danificada.');
          return { name: 'teste.fpbackup', content: window.__backupCalls.find((call) => call.kind === 'save').content };
        },
        migrateJson: async (content) => ({ content, changed: false }),
      }, { get: (target, key) => key in target ? target[key] : () => null });
    });
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    await page.waitForFunction(() => document.querySelector('#welcomeDialog')?.open);
    await page.locator('#welcomeClose').click();
    await page.evaluate(() => navigate('settings'));
    assert.equal(await page.locator('#saveEncryptedBackup').isVisible(), true);
    assert.match(await page.locator('#fileProtection').innerText(), /automáticas.*sem encriptação/i);
    await page.locator('#saveEncryptedBackup').click();
    await page.locator('#modalForm [name="backupPassphrase"]').fill('frase-passe de teste longa');
    await page.locator('#modalForm [name="backupPassphraseAgain"]').fill('frase-passe de teste longa');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.waitForFunction(() => window.__backupCalls.some((call) => call.kind === 'save'));
    assert.equal(await page.locator('#modalForm [name="backupPassphrase"]').inputValue(), '');
    await page.locator('#restoreEncryptedBackup').click();
    await page.locator('#modalForm [name="backupPassphrase"]').fill('frase-passe errada longa');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.locator('#formError:visible').waitFor();
    assert.match(await page.locator('#formError').innerText(), /Frase-passe incorreta/);
    await page.locator('#modalForm [name="backupPassphrase"]').fill('frase-passe de teste longa');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.locator('#formTitle').getByText('Restaurar cópia', { exact: true }).waitFor();
    assert.equal(await page.locator('#modal').evaluate((element) => element.open), true);
    assert.deepEqual(errors, []);
    console.log('Desktop: opção encriptada, indicação das cópias automáticas, frase-passe descartada e restauro pré-visualizado.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
