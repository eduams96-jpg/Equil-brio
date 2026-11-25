'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const { _electron } = require('playwright-core');
const { createSqliteStorage } = require('../desktop/storage-sqlite.cjs');
const { decodeAttachment } = require('../desktop/attachment.cjs');
const { prepareRestoreText } = require('../desktop/restore-validation.cjs');

const out = path.resolve(process.argv[2]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibrio-restauro-'));
function profile(label) {
  const dir = path.join(root, label);
  fs.mkdirSync(path.join(dir, 'Financas Pessoais'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.equilibrio-validation'), '');
  return dir;
}
const dataDir = dir => path.join(dir, 'Financas Pessoais');
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function describe(data) {
  const serializable = { ...data };
  delete serializable.spaceName;
  const attachments = data.transactions.map(row => row.attachment).filter(a => a?.data);
  for (const attachment of attachments) assert.ok(decodeAttachment(attachment).buffer.length);
  return {
    movements: data.transactions.length,
    accounts: data.accounts.length,
    attachments: attachments.length,
    balances: hash(data.accounts.map(account => [account.id, account.balance])),
    ledger: hash(serializable),
  };
}

async function launch(dir, operation) {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.resolve(__dirname, '../desktop/main.cjs'), '--equilibrio-validation'],
    env: { ...process.env, EQUILIBRIO_VALIDATION_ROOT: dir },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof UnifiedWorkspaceUI === 'object' && (!equilibrioStartup.awaitingChoice || !!document.querySelector('#welcomeContinue')?.getClientRects().length), null, { timeout: 25000 });
    if (await page.locator('#welcomeContinue').isVisible()) {
      const spaces = page.locator('[name=welcomeSpace]');
      if (await spaces.count()) await spaces.first().check();
      await page.locator('#welcomeContinue').click();
    }
    await page.waitForFunction(() => !equilibrioStartup.awaitingChoice);
    const result = await operation(app, page);
    assert.equal(errors.length, 0, 'Erros na interface de restauro');
    return result;
  } finally {
    await app.evaluate(({app}) => app.exit(0)).catch(() => {});
  }
}

(async () => {
  const origin = profile('origem');
  const destination = profile('limpo');
  const production = new DatabaseSync(path.join(process.env.APPDATA, 'Financas Pessoais', 'financas.db'), { readOnly: true });
  try {
    await backup(production, path.join(dataDir(origin), 'financas.db'));
  } finally {
    production.close();
  }
  const exported = await launch(origin, async (_app, page) => {
    const folder = path.join(root, 'copias');
    await page.evaluate(folder => financasDesktop.setBackupSettings({ directory: folder, frequency: 'manual', onClose: false }), folder);
    const result = await page.evaluate(() => financasDesktop.runBackupFromSqlite({ force:true, reason:'manual' }));
    assert.ok(result.ok);
    return result.filePath;
  });
  const source = prepareRestoreText(fs.readFileSync(exported,'utf8')).document;
  assert.equal(source.spaces.length, 3);
  const expected = source.spaces.map(space => ({ name: space.name, ...describe(space.data) }));
  const imported = await launch(destination, async (app, page) => {
    const initial = await page.evaluate(() => LifeUI.spaces().length);
    // Only the system picker is substituted; the app still reads, validates and restores the file.
    await app.evaluate(({dialog}, file) => {
      dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]});
    }, exported);
    await page.evaluate(() => navigate('settings'));
    await page.locator('[data-u-settings=backup]').click();
    await page.locator('#restoreSettings').click();
    const modal = page.locator('#modal');
    await modal.waitFor();
    await modal.locator('[name=restoreDestination]').selectOption('new');
    await modal.getByRole('button',{name:'Restaurar',exact:true}).click();
    try {
      await modal.waitFor({state:'hidden'});
    } catch (error) {
      throw Error(await page.locator('#formError').textContent() || error.message.split('\n')[0]);
    }
    const spaces = await page.evaluate(() => LifeUI.spaces().filter(s=>s.name.endsWith(' (recuperado)')));
    assert.equal(await page.evaluate(() => LifeUI.spaces().length), initial + expected.length);
    assert.equal(spaces.length, expected.length);
    return spaces.map(space => ({ id: space.id, name: space.name }));
  });
  const reopened = await launch(destination, (_app, page) => page.evaluate(() => DesktopPersistence.listSpaces().length));
  assert.ok(reopened >= expected.length);
  const storage = createSqliteStorage(dataDir(destination));
  try {
    for (const space of expected) {
      const row = imported.find(x => x.name === space.name + ' (recuperado)');
      assert.ok(row,'Espaço em falta');
      const observed = describe(storage.readSpace(row.id).data);
      for (const key of Object.keys(observed)) assert.equal(observed[key], space[key], key);
    }
  } finally {
    storage.close();
  }
  const result = {
    spaces: expected.length, accounts: expected.reduce((n,row)=>n+row.accounts,0),
    movements: expected.reduce((n,row)=>n+row.movements,0),
    attachmentsDecoded: expected.reduce((n,row)=>n+row.attachments,0),
    fullLedgerAndBalancesMatch: true, cleanProfile: true, reopened: true,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
