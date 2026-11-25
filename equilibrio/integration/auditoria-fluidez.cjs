'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron } = require('playwright-core');

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = path.resolve(process.argv[3]);
const minutes = Number(process.argv[4] ?? 15);
const requestedVersion = process.argv[5];
assert.ok(Number.isFinite(minutes) && minutes >= 0, 'Duração inválida');
const targets = [
  { version: manifest.previous, source: manifest.baseline, name: 'referencia' },
  { version: manifest.version, source: manifest.current, name: 'atual' },
];
const auditRoot = path.dirname(manifest.snapshot);
const label = 'Auditoria de fluidez';
const seed = {
  tx: 'fluidez-movimento', pending: 'fluidez-compromisso',
  goal: 'fluidez-objetivo', product: 'fluidez-produto',
};
fs.mkdirSync(out, { recursive: true });

async function prepare(page) {
  const welcome = page.locator('#welcomeContinue');
  await page.waitForFunction(() => !equilibrioStartup.awaitingChoice || !!document.querySelector('#welcomeContinue')?.getClientRects().length, null, { timeout: 25000 });
  if (await welcome.isVisible()) {
    const spaces = page.locator('[name=welcomeSpace]');
    if (await spaces.count()) {
      const id = await page.evaluate(() => LifeUI.spaces()
        .map((space) => ({ id: space.id, count: LifeUI.readSpace(space.id).transactions.length }))
        .sort((a, b) => b.count - a.count)[0].id);
      await page.evaluate((id) => {
        const choice = [...document.querySelectorAll('[name=welcomeSpace]')].find((radio) => radio.value === id);
        if (!choice) throw Error('Espaço de teste indisponível no ecrã de entrada.');
        choice.click();
      }, id);
    }
    await welcome.click();
  }
  await page.waitForFunction(() => !equilibrioStartup.awaitingChoice, null, { timeout: 25000 });
  const accounts = await page.evaluate(() => data.accounts.length);
  assert.ok(accounts, 'O espaço selecionado não tem contas.');
  return page.evaluate(({ seed, label }) => {
    const account = data.accounts.find((a) => !a.archived);
    if (!account) throw Error('Não há contas ativas para preparar os dados de teste.');
    let date = F.today();
    while (data.closedMonths.includes(date.slice(0, 7))) {
      date = dashboardMonthOffset(date.slice(0, 7), -1) + '-15';
    }
    const ok = commit(() => {
      F.add(data, { id: seed.tx, type: 'expense', date, account: account.name, amount: 10, description: label, category: 'Outros' });
      data.pendingPayments.push({ id: seed.pending, date, account: account.name, type: 'expense', amount: 37, description: label });
      data.goals.push({ id: seed.goal, name: label, current: 10, target: 200 });
      CasaFinance.saveProduct(data, { name: label, unit: 'kg', category: 'Outros' });
    }, label);
    if (!ok) throw Error('Não foi possível preparar os registos de teste.');
    month = date.slice(0, 7);
    render();
    return { date, originalMovements: data.transactions.length - 1 };
  }, { seed, label });
}

async function exercise(target, report) {
  const profile = fs.mkdtempSync(path.join(auditRoot, target.name + '-execucao-'));
  const appData = path.join(profile, 'Financas Pessoais');
  fs.mkdirSync(appData);
  fs.writeFileSync(path.join(profile, '.equilibrio-validation'), '');
  fs.copyFileSync(manifest.snapshot, path.join(appData, 'financas.db'));
  const output = path.join(out, 'windows-' + target.version + '.json');
  const checkpoint = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
  const started = performance.now();
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(target.source, 'desktop', 'main.cjs'), '--equilibrio-validation', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
    env: { ...process.env, EQUILIBRIO_VALIDATION_ROOT: profile },
    timeout: 30000,
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    page.on('pageerror', (error) => report.errors.push(error.message));
    report.stage = 'carregar interface';
    await page.waitForFunction(() => typeof UnifiedWorkspaceUI === 'object', null, { timeout: 25000 });
    report.startupMs = Math.round(performance.now() - started);
    const cdp = await page.context().newCDPSession(page);
    report.stage = 'abrir espaço e preparar dados';
    const { date, originalMovements } = await prepare(page);
    report.stage = 'medir tarefas';
    report.originalMovements = originalMovements;
    await page.evaluate((profileSave) => {
      const samples = [];
      function observe(host, method, phase) {
        const original = host?.[method];
        if (typeof original !== 'function') return;
        host[method] = function (...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally { samples.push({ phase, ms: performance.now() - start }); }
        };
      }
      observe(DesktopPersistence, 'commitLedgerDirect', 'gravar SQLite');
      observe(DesktopPersistence, 'refreshCriticalDomains', 'reler SQLite');
      observe(window.FileProtection, 'saved', 'preparar cópia e espelho');
      observe(window, 'render', 'redesenho');
      if (profileSave) {
        observe(window, 'commit', 'gravação completa');
        observe(window, 'structuredClone', 'cópias de dados');
        observe(F, 'normalize', 'normalização');
        observe(F, 'update', 'aplicar edição');
        observe(FinancePlus, 'audit', 'histórico');
        observe(FinancePlus, 'snapshot', 'conclusão mensal');
        observe(window, 'restoreMovementContext', 'recuperar foco');
      }
      window.readFluencyPhases = () => samples.splice(0);
    }, process.env.EQUILIBRIO_AUDIT_PROFILE_SAVE === '1');
    const main = page.locator('#modal');
    const field = (name) => main.locator('[name="' + name + '"]');
    const paint = () => page.evaluate(() => new Promise((resolve) => {
      const timeout = setTimeout(resolve, 250);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(); }));
    }));
    const measure = async (action, operation) => {
      const time = performance.now();
      try {
        await operation();
        await paint();
      } catch (error) {
        throw Error(action + ' · ' + error.message.split('\n')[0]);
      }
      report.samples.push({ action, cycle: report.cycles, ms: +(performance.now() - time).toFixed(1) });
    };
    const go = (route) => measure('abrir:' + route, () => page.evaluate((v) => {
      navigate(v);
      if (!document.getElementById(view)?.classList.contains('active')) throw Error('Página inativa.');
    }, route));
    const click = (name, selector) => measure(name, () => page.locator(selector).click());
    const save = (name) => measure(name, async () => {
      await page.evaluate(() => window.readFluencyPhases());
      await main.getByRole('button', { name: 'Guardar', exact: true }).click();
      await main.waitFor({ state: 'hidden' });
      const phases = await page.evaluate(() => window.readFluencyPhases());
      report.phases.push(...phases.map(row => ({ action: name, cycle: report.cycles, ...row, ms: +row.ms.toFixed(1) })));
    });
    const close = () => page.evaluate(() => document.querySelector('#modal').close());
    const check = (fn, value) => page.evaluate(fn, value).then((ok) => assert.ok(ok, 'Resultado diferente do esperado'));
    const workflows = {
      resumo: async () => {
        await go('dashboard');
        const previous = page.locator('#summaryPrevMonth');
        const selected = await page.evaluate(() => month);
        if (await previous.isEnabled()) {
          await click('resumo:mês anterior', '#summaryPrevMonth');
          await check((last) => month !== last, selected);
          await click('resumo:mês seguinte', '#summaryNextMonth');
          await check((last) => month === last, selected);
        }
        await click('resumo:abrir cálculo de despesa', '#expenseBreakdownButton');
        await check(() => Number(document.querySelector('[data-financial-total]').dataset.financialTotal) === F.totals(data, month).expense);
        await close();
      },
      movimentos: async () => {
        await go('transactions');
        await measure('movimentos:pesquisar', async () => {
          await page.locator('#searchTransactions').fill(label);
          await page.locator('#transactionsTable .movement-table-row[data-transaction-id="' + seed.tx + '"]').waitFor();
        });
        const filter = page.locator('[data-movement-filter=category][data-value=Outros]');
        if (await filter.isVisible()) await measure('movimentos:filtrar categoria', () => filter.click());
        const edit = '#transactionsTable .movement-table-row[data-transaction-id="' + seed.tx + '"] .movement-row-actions-expanded [data-action=edit-tx]';
        await click('movimentos:abrir edição', edit);
        await field('amount').fill(String(10 + (report.cycles % 2 ? 1 : 2)));
        await save('movimentos:guardar edição');
        await check(({ id, amount }) => data.transactions.some((t) => t.id === id && t.amount === amount), { id: seed.tx, amount: 10 + (report.cycles % 2 ? 1 : 2) });
        const all = page.locator('[data-movement-filter=category][data-value=""]');
        if (await all.isVisible()) await all.click();
        await page.locator('#searchTransactions').clear();
      },
      agenda: async () => {
        await go('planner');
        await click('agenda:mês anterior', '[data-agenda-step="-1"]');
        await click('agenda:mês seguinte', '[data-agenda-step="1"]');
        await click('agenda:lista', '[data-agenda-layout=list]');
        await click('agenda:calendário', '[data-agenda-layout=calendar]');
        const currentDate = await page.evaluate(id => data.pendingPayments.find(p => p.id === id)?.date, seed.pending);
        await click('agenda:selecionar dia', '[data-agenda-day="' + currentDate + '"]');
        const selector = '[data-action=edit-pending][data-id="' + seed.pending + '"]';
        await measure('agenda:abrir compromisso', async () => {
          const record = page.locator('#agendaRows:visible .agenda31-row').filter({ hasText: label });
          if (!await record.count()) {
            const state = await page.evaluate(({ date, label, id }) => ({
              exactDate: document.querySelector('[data-agenda-day="' + date + '"].active') !== null,
              shownOnCalendar: document.querySelector('[data-agenda-day="' + date + '"]')?.textContent.includes(label),
              rowCounts: [...document.querySelectorAll('#agendaRows')].map(n => n.querySelectorAll('.agenda31-row').length),
              inSchedule: schedule({ includeCompletedGenerated: true }).some(p => p.id === id),
            }), { date: currentDate, label, id: seed.pending });
            throw Error('Compromisso ausente do detalhe do dia ' + JSON.stringify(state));
          }
          const menu = record.locator('.agenda31-menu summary');
          await menu.scrollIntoViewIfNeeded();
          await paint();
          await menu.click();
          await page.locator('.agenda31-menu-portal ' + selector).click();
        });
        const newDate = date.slice(0, 7) + (report.cycles % 2 ? '-12' : '-13');
        await field('date').fill(newDate);
        await save('agenda:guardar compromisso');
        await check(({ id, newDate }) => data.pendingPayments.some((p) => p.id === id && p.date === newDate) && !!document.querySelector('.ag-calendar'), { id: seed.pending, newDate });
      },
      planos: async () => {
        await go('plansHub');
        await click('planos:abrir cobertura', '.plan-navigation [data-plan-pane=funding]');
        await click('planos:abrir lista', '.plan-navigation [data-plan-pane=records]');
        await measure('planos:pesquisar', () => page.locator('#planSearch').fill(label));
        const record = page.locator('.plan-record').filter({ has: page.locator('summary').filter({ hasText: label }) });
        if (await record.getAttribute('open') !== null) await record.locator('summary').first().click();
        await measure('planos:expandir objetivo', () => record.locator('summary').first().click());
        await click('planos:abrir edição', '#unifiedPlanDetail [data-action=goal]');
        const target = 200 + (report.cycles % 2 ? 10 : 20);
        await field('target').fill(String(target));
        await save('planos:guardar objetivo');
        await check(({ id, target }) => data.goals.some((g) => g.id === id && g.target === target), { id: seed.goal, target });
        await page.locator('#planSearch').clear();
        await go('decisionsHub');
        await measure('decisões:simular', async () => {
          const amount = page.locator('#simAmount');
          await amount.fill(report.cycles % 2 ? '43' : '44');
          await page.locator('#runSimulation').click();
          await check(() => !!document.querySelector('#simulationResult .simulation-comparison'));
        });
      },
      casa: async () => {
        await go('casaProducts');
        await measure('casa:pesquisar produto', async () => {
          const search = page.locator('#casaProducts input[type=search]').first();
          await search.fill(label);
          await check((label) => document.getElementById('casaProducts').textContent.includes(label), label);
          await search.clear();
        });
        await go('casaPurchases');
        await click('casa:abrir nova compra', '#casaNewPurchase');
        await field('casaStore').fill(label);
        await field('casaItemName').fill(label);
        await field('casaItemTotal').fill('1.25');
        await save('casa:guardar compra');
        await measure('casa:abrir compra guardada', async () => {
          await page.locator('#casaPurchaseSearch').fill(label);
          await page.locator('#casaPurchases button[data-purchase]').first().click();
        });
        await close();
      },
      consumos: async () => {
        await go('casaConsumos');
        const add = '#addUtilityMonthly';
        const interval = await page.evaluate((cycle) => {
          const year = 2010 + Math.floor(cycle / 12);
          const period = String(cycle % 12 + 1).padStart(2, '0');
          return [year + '-' + period + '-01', year + '-' + period + '-07'];
        }, report.cycles);
        const addPeriod = async (utility, usage) => {
          await page.locator(add).click();
          await field('monthlyUtility').selectOption(utility);
          if (utility === 'electricity') await field('utilitySupplier').fill(label);
          await field('periodStart').fill(interval[0]);
          await field('periodEnd').fill(interval[1]);
          await field('monthlyConsumption').fill(String(usage));
          await save('consumos:guardar ' + utility);
        };
        await addPeriod('water', 3);
        await addPeriod('electricity', 30);
        const id = await page.evaluate((period) => data.casa.utilityPeriods.find((p) => p.utility === 'electricity' && p.periodStart === period)?.id, interval[0]);
        assert.ok(id, 'Consumo de eletricidade guardado');
        await click('consumos:abrir edição', '#casaConsumos [data-dossier-action=utility-form][data-id="' + id + '"]');
        await field('monthlyConsumption').fill('31');
        await save('consumos:guardar edição');
        await check(({ id, label }) => data.casa.utilityPeriods.some((p) => p.id === id && p.reading === 31 && p.supplier === label), { id, label });
      },
    };
    const startedCycles = performance.now();
    const deadline = startedCycles + minutes * 60000;
    const limit = Number(process.env.EQUILIBRIO_AUDIT_CYCLES || (minutes ? 12 : 1));
    assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= 30, 'Número de rondas inválido');
    for (let i = 0; i < limit; i += 1) {
      if (i > 0) await delay(Math.max(0, startedCycles + (deadline - startedCycles) * i / (limit - 1) - performance.now()));
      report.cycles = i + 1;
      for (const [name, workflow] of Object.entries(workflows)) {
        if (process.env.EQUILIBRIO_AUDIT_WORKFLOW && name !== process.env.EQUILIBRIO_AUDIT_WORKFLOW) continue;
        try {
          await workflow();
        } catch (error) {
          report.failures.push({ cycle: report.cycles, workflow: name, issue: error.message.split('\n')[0] });
          await close().catch(() => {});
        }
        checkpoint();
      }
      if (i === 0 || i === 5 || i === limit - 1) {
        await cdp.send('HeapProfiler.collectGarbage');
        const heap = await cdp.send('Runtime.getHeapUsage');
        const dom = await cdp.send('Memory.getDOMCounters');
        report.checkpoints.push({ cycle: report.cycles, elapsedMs: Math.round(performance.now() - startedCycles),
          heapBytes: heap.usedSize, domNodes: dom.nodes, listeners: dom.jsEventListeners });
      }
      checkpoint();
    }
    report.persisted = await page.evaluate(({ seed, label, reportDate }) => {
      const saved = DesktopPersistence.readSpace(LifeUI.activeSpace().id).data;
      return {
        editedMovement: saved.transactions.some(t => t.id === seed.tx && t.amount !== 10),
        rescheduled: saved.pendingPayments.some(p => p.id === seed.pending && p.date !== reportDate),
        editedGoal: saved.goals.some(g => g.id === seed.goal && g.target > 200),
        purchases: saved.casa.purchases.filter(p => p.store === label).length,
        electricity: (saved.casa.utilityPeriods || []).filter(p => p.supplier === label && p.reading === 31).length,
      };
    }, { seed, label, reportDate: date });
    report.elapsedMs = Math.round(performance.now() - startedCycles);
    report.completed = true;
    delete report.stage;
    checkpoint();
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
}

(async () => {
  for (const target of targets.filter((candidate) => !requestedVersion || candidate.version === requestedVersion)) {
    const report = { version: target.version, cycles: 0, samples: [], phases: [], failures: [], errors: [], checkpoints: [] };
    try {
      await exercise(target, report);
    } catch (error) {
      report.fatal = error.message.split('\n')[0];
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(out, 'windows-' + target.version + '.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ version: target.version, cycles: report.cycles, failures: report.failures, fatal: report.fatal }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
