'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('v0.39.41 manutenção: persistência Desktop evita escritas repetidas e polling oculto', () => {
  const source = read('desktop-bridge.js');
  assert.match(source, /function sameStoragePayload\(a, b\)/);
  assert.match(source, /if \(!force && sameStoragePayload\(payload, lastPersistedStorage\)\)/);
  assert.match(source, /let persistInFlight = null;/);
  assert.match(source, /if \(persistInFlight\) \{\s*persistQueued = true;/s);
  assert.match(source, /if \(!document\.hidden\) persistDesktopStorage\(false\);/);
  assert.match(source, /}, 10000\);/);
  assert.match(source, /persistDesktopStorage\(true, true\)/);
});

test('v0.39.41 manutenção: marcação de valores em euros é incremental', () => {
  const source = read('complete-ui.js');
  assert.match(source, /const pendingRoots = new Set\(\);/);
  assert.match(source, /for \(const record of records\)/);
  assert.match(source, /for \(const node of record\.addedNodes \|\| \[\]\) pendingRoots\.add\(node\);/);
  assert.match(source, /function markRoot\(root\)/);
  assert.doesNotMatch(source, /new MutationObserver\(\(\) => \{\s*clearTimeout\(timer\);\s*timer = setTimeout\(mark, 0\);/s);
});

test('v0.39.41 manutenção: Movimentos reutiliza a mesma base filtrada por render', () => {
  const source = read('workspace.js');
  assert.match(source, /function filteredTransactions\(scopeRows = null\)/);
  assert.match(source, /function movementRenderHeaderAndKpis\(periodRows = null\)/);
  assert.match(source, /function movementRenderSidebar\(scopeRows = null\)/);
  assert.match(source, /const periodRows = movementPeriodRows\(\);\s*const scopeRows = periodRows\.filter\(movementTypeMatches\);/s);
  assert.match(source, /const tx = filteredTransactions\(scopeRows\);/);
});

test('v0.39.41 manutenção: cálculos repetidos ficam limitados ao ciclo de render', () => {
  const source = read('workspace.js');
  assert.match(source, /let activeRenderTotalsCache = null;/);
  assert.match(source, /let activeRenderSpentCache = null;/);
  assert.match(source, /let activeRenderScheduleCache = null;/);
  assert.match(source, /activeRenderTotalsCache = new Map\(\);/);
  assert.match(source, /activeRenderScheduleCache = new Map\(\);/);
  assert.match(source, /finally \{\s*activeRenderTotalsCache = null;\s*activeRenderSpentCache = null;\s*activeRenderScheduleCache = null;/s);
  assert.match(source, /function storageInfoKb\(\)/);
});

test('v0.39.41 manutenção: navegação limpa bloqueios de scroll obsoletos', () => {
  const source = read('workspace.js');
  assert.match(source, /function navigateCore\(v(?:,[^)]*)?\) \{\s*const splitWorkbench = document\.getElementById\("transactionSplitWorkbench"\);/s);
  assert.match(source, /return navigateCore\(v, skipEnhancement\);/);
  assert.match(source, /document\.body\.classList\.remove\("split-workbench-open"\);/);
});

test('v0.39.41 manutenção: build de produção não leva documentação histórica', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.build.files.some((file) => /\.md$/i.test(file) && !/^assets\/licenses\/[^/]*(?:LICENSE|NOTICE)[^/]*$/i.test(file)), false);
  for (const required of ['index.html', 'workspace.js', 'desktop/main.cjs', 'desktop/manual-updater.cjs', 'Equilibrio.png']) {
    assert.ok(pkg.build.files.includes(required), required);
  }
  const release = read('scripts/package-release.cjs');
  const candidateExpression = release.match(/const candidates=(.*);/)[1];
  const candidates = require('node:vm').runInNewContext(candidateExpression, { pkg, fs, path, root });
  assert.ok(candidates.includes('package-lock.json'));
  assert.deepEqual(Array.from(candidates.filter(file => /\.md$/i.test(file) && !/^assets\/licenses\/[^/]*(?:LICENSE|NOTICE)[^/]*$/i.test(file))).sort(),
    ['ARQUITETURA.md', 'ATUALIZACOES.md', 'ROADMAP.md', `AUDITORIA-v${pkg.version}.md`, `DESKTOP-v${pkg.version}.md`, `PROPOSTAS-VISUAIS-v${pkg.version}.md`, `REVISAO-CASA-E-LAYOUTS-v${pkg.version}.md`, 'README.md'].sort());
});


test('v0.39.41 manutenção: agenda indexa dívidas e pendentes sem scans aninhados repetidos', () => {
  const source = read('workspace.js');
  assert.match(source, /const postedDebtMonths = new Set\(\);/);
  assert.match(source, /const latestDebtAccount = new Map\(\);/);
  assert.match(source, /postedDebtMonths\.has\(`/);
  assert.match(source, /const postedPendingIds = new Set\(\);/);
  assert.match(source, /const unlinkedPendingMatches = new Map\(\);/);
  assert.match(source, /unlinkedPendingMatches\.get\(matchKey\)/);
});

test('v0.39.41 manutenção: integração centraliza Playwright e browser sem caminho obrigatório de uma máquina', () => {
  const helper = read('integration/_browser.cjs');
  assert.match(helper, /process\.env\.PLAYWRIGHT_MODULE/);
  assert.match(helper, /process\.env\.BROWSER_PATH/);
  assert.match(helper, /\/usr\/bin\/chromium/);
  const browserTests = fs.readdirSync(path.join(root, 'integration'))
    .filter((name) => name.endsWith('.cjs') && name !== '_browser.cjs')
    .filter((name) => /chromium/.test(read(`integration/${name}`)));
  assert.ok(browserTests.length >= 10);
  for (const name of browserTests) {
    const source = read(`integration/${name}`);
    assert.match(source, /require\('\.\/_browser\.cjs'\)/, name);
    assert.doesNotMatch(source, /WinNAS\/\.cache\/codex-runtimes/, name);
    assert.doesNotMatch(source, /BraveSoftware\/Brave-Browser/, name);
  }
});
