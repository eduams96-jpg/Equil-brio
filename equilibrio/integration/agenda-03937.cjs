const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL || 'http://127.0.0.1:4173');
    await page.evaluate(() => {
      data = F.empty();
      data.accounts = [{ id: 'bank', name: 'Banco', type: 'Conta', balance: 5000 }];
      const currentMonth = F.today().slice(0, 7);
      const priorMonth = (offset) => {
        const date = new Date(`${currentMonth}-15T12:00:00`);
        date.setMonth(date.getMonth() - offset);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-15`;
      };
      data.subscriptions = [
        {
          id: 'netflix', name: 'Netflix', amount: 14.99, frequency: 'monthly',
          nextDate: `${currentMonth}-15`, renewalDay: 15, status: 'active',
          trialEnd: '', reminderDays: 3, account: 'Banco', category: 'Subscrições', usage: 'rarely',
          prices: Array.from({ length: 7 }, (_, i) => ({ date: priorMonth(6 - i), amount: 9.99 + i * 0.83 })),
        },
        {
          id: 'spotify', name: 'Spotify', amount: 4.64, frequency: 'monthly',
          nextDate: `${currentMonth}-19`, renewalDay: 19, status: 'active',
          trialEnd: '', reminderDays: 3, account: 'Banco', category: 'Subscrições', usage: 'often',
          prices: [{ date: priorMonth(1), amount: 4.64 }],
        },
      ];
      data.recurring = Array.from({ length: 18 }, (_, i) => ({
        id: `commitment-${i}`, description: `Compromisso ${i + 1}`, type: 'expense',
        amount: 10 + i, account: 'Banco', category: 'Casa / Serviços',
        start: `${currentMonth}-01`, day: i + 1, active: true, frequency: 'monthly',
      }));
      data = F.normalize(data);
      render();
      navigate('planner');
    });

    assert.equal(await page.locator('#planner').isVisible(), true);
    assert.equal(await page.locator('#planner .planner-agenda-head h2').isVisible(), true);
    assert.equal(await page.locator('#planner .planner-agenda-head h2').innerText(), 'Agenda');
    assert.equal(await page.locator('.workspace-bar').isVisible(), false, 'A barra global deve desaparecer na Agenda');
    assert.equal(await page.locator('#plannerAgendaFilters').isVisible(), true, 'Os filtros devem ficar no topo da Agenda');
    await page.locator('#plannerAgendaFilters button').first().focus();
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      return element && element.matches('#planner button, #planner summary')
        ? getComputedStyle(element).outlineStyle : null;
    });
    assert.equal(focus, 'solid', 'O foco por teclado deve ser visível');
    assert.equal(await page.locator('#agendaSubscriptionsPreview .subscription-table-row').count(), 2);
    assert.equal(await page.locator('#agendaSubscriptionsPreview .subscription-review-card').isVisible(), true);
    assert.equal(await page.locator('#agendaRows > .agenda31-row').count(), 8, 'Os compromissos começam compactos');
    const moreCommitments = page.locator('#agendaRows .agenda31-more');
    assert.equal(await moreCommitments.count(), 1);
    await moreCommitments.locator(':scope > summary').click();
    assert.equal(await page.locator('#agendaRows .agenda31-row:visible').count(), 20, 'Os restantes compromissos e ações permanecem acessíveis');
    await moreCommitments.locator(':scope > summary').click();

    const history = page.locator('#agendaSubscriptionsPreview .subscription-history-card');
    assert.equal(await history.locator('.subscription-history-row:visible').count(), 3, 'O histórico começa compacto');
    const more = history.locator('details.subscription-history-more');
    assert.equal(await more.count(), 1);
    assert.equal(await more.evaluate((element) => element.open), false);
    await more.locator('summary').click();
    assert.equal(await history.locator('.subscription-history-row:visible').count(), 7, 'O histórico completo continua acessível');
    await more.locator('summary').click();

    const desktopCards = await page.evaluate(() => {
      const historyRect = document.querySelector('#agendaSubscriptionsPreview .subscription-history-card').getBoundingClientRect();
      const reviewRect = document.querySelector('#agendaSubscriptionsPreview .subscription-review-card').getBoundingClientRect();
      return { sameRow: Math.abs(historyRect.top - reviewRect.top) < 24, separateColumns: reviewRect.left >= historyRect.right - 2 };
    });
    assert.deepEqual(desktopCards, { sameRow: true, separateColumns: true }, 'Histórico e utilização lado a lado no desktop');

    assert.equal(await page.evaluate(() => {
      const subscriptions = document.querySelector('#agendaSubscriptionsPreview');
      const monthly = document.querySelector('#pendingEditor');
      return Boolean(subscriptions.compareDocumentPosition(monthly) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true, 'A Agenda mensal deve vir depois das subscrições');
    const monthly = await page.evaluate(() => {
      const wrap = document.querySelector('#pendingEditor .monthly-agenda-wrap');
      const cell = document.querySelector('#pendingEditor .monthly-agenda-table tbody td');
      return { height: wrap.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(cell).fontSize) };
    });
    assert.ok(monthly.height >= 600, `A Agenda mensal tem só ${monthly.height}px de altura`);
    assert.ok(monthly.fontSize >= 14, `O texto da Agenda mensal tem só ${monthly.fontSize}px`);

    const actions = page.locator('#agendaSubscriptionsPreview .subscription-table-row').filter({ hasText: 'Netflix' }).locator('details.subscription-actions-menu');
    assert.equal(await actions.count(), 1);
    assert.equal(await actions.evaluate((element) => element.open), false, 'As ações começam recolhidas');
    await actions.locator('summary').click();
    assert.equal(await actions.evaluate((element) => element.open), true);
    for (const label of ['Editar', 'Associar histórico', 'Histórico', 'Apagar']) {
      assert.equal(await actions.getByRole('button', { name: label, exact: true }).count(), 1, `Ação ${label} preservada`);
    }
    await actions.getByRole('button', { name: 'Editar', exact: true }).click();
    assert.equal(await page.locator('#modal').evaluate((element) => element.open), true, 'Editar abre o formulário da subscrição');
    assert.match(await page.locator('#modal').innerText(), /Netflix|Editar subscrição/);
    await page.locator('#modal').evaluate((element) => element.close());

    await page.evaluate(() => navigate('budgets'));
    assert.equal(await page.locator('.workspace-bar').isVisible(), false, 'A barra inferior global foi removida; os controlos vivem no topo');
    await page.evaluate(() => navigate('planner'));

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.body.dataset.theme = value; }, theme);
      for (const width of [1600, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 950 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, `Overflow a ${width}px em ${theme}`);
        assert.equal(await page.locator('#plannerAgendaFilters').isVisible(), true);
        assert.equal(await page.locator('#agendaSubscriptionsPreview .subscription-table-row').count(), 2);
        if (theme === 'light' && [1600, 390].includes(width)) {
          await page.screenshot({ path: `integration/agenda-03937-${width}.png`, fullPage: true });
        }
      }
    }
    assert.deepEqual(errors, [], 'Sem erros de execução');
    console.log('Agenda: filtros, barra contextual, subscrições completas, histórico compacto, cartões, agenda mensal e 5 larguras em 2 temas.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
