'use strict';
const assert = require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');

async function main() {
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = 'http://equilibrio.invalid';
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, decodeURIComponent(url.pathname).slice(1) || 'index.html');
      if (url.origin !== origin || !file.startsWith(root + path.sep)) return route.abort();
      return route.fulfill({path:file});
    });
    await page.goto(origin);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      data = F.empty();
      data.accounts = [{id:'a',name:'Conta',type:'Banco',openingBalance:2000,balance:2000}];
      const protection = {protectionAccountId:'a',protectionGroup:'Seguro'};
      data.goals = [{id:'g',name:'Seguro',current:99.99,target:100,planMonths:9,...protection}];
      data.reserves = [{id:'r',name:'Seguro anual',saved:50,target:200,months:12,...protection}];
      data = F.normalize(data);
      render();
      navigate('plansHub');
    });
    const board = page.locator('#plansBoard');
    const choose = (attr, id) => board.locator((attr==='data-plan-pane'?'.plan-navigation ':'')+'[' + attr + '="' + id + '"]').first().click();
    const submit = () => page.locator('#modalForm [type=submit]').click();
    await choose('data-plan-pane','records');
    const goal = board.locator('[data-u-plan="goal:g"]');
    assert.match(await goal.innerText(), /9 meses/);
    assert.match(await goal.innerText(), /Faltam/);
    assert.match(await board.locator('.pl2-hero-main dl>div').last().innerText(), /99,99/);
    for (const kind of ['goal','reserve','budget']) {
      await board.locator('.u-add-menu summary').click();
      await board.locator('.u-add-menu [data-action="'+kind+'"]').click();
      const name = page.locator('#modal [name='+(kind==='budget'?'category':'name')+']');
      await name.fill('Ensaio');
      await page.locator('#modal [name='+(kind==='budget'?'limit':'target')+']').fill('120');
      await submit();
      const row = board.locator('.plan-record').filter({hasText:'Ensaio'});
      await row.locator('summary').click();
      await board.locator('#unifiedPlanDetail [data-action="'+kind+'"]').click();
      if(kind==='budget') await page.locator('#modal [name=limit]').fill('135');
      else await name.fill('Ensaio revisto');
      await submit();
      assert.match(await row.innerText(), kind==='budget'?/135,00/:/Ensaio revisto/);
      await board.locator('#unifiedPlanDetail [data-action="delete-'+kind+'"]').click();
      await submit();
      assert.equal(await row.count(),0);
    }
    await choose('data-u-plan-kind','all');
    await goal.locator('summary').click();
    await board.locator('#unifiedPlanDetail [data-u-plan-contributions]').click();
    assert.ok(await board.locator('.plan-decision-events-box').evaluate(node => node.open));
    await board.locator('[data-practical=event-form]').first().click();
    assert.ok(await page.locator('#modal').isVisible());
    await page.locator('#modal [name=title]').fill('Mudança de casa');
    await submit();
    assert.match(await board.locator('.u-plan-events').innerText(), /Mudança de casa/);
    await board.locator('[data-action=plan-scenario]').first().click();
    await page.locator('#modal [name=name]').fill('Mudança');
    await page.locator('#modal [name=amount]').fill('130');
    await submit();
    await board.locator('[data-action=plan-simulate]').click();
    assert.ok(await page.locator('#modal').isVisible());
    await page.keyboard.press('Escape');
    await board.locator('[data-action=plan-note]').first().click();
    await page.locator('#modal [name=reason]').fill('Avaliar a mudança');
    await submit();
    assert.match(await board.locator('.u-plan-scenarios').innerText(), /Avaliar a mudança/);
    await choose('data-decision-section','forecast');
    assert.ok(await board.locator('.u-plan-comparison h2,.u-plan-comparison h3').first().isVisible());
    await choose('data-decision-section','simulator');
    await board.locator('#simAmount').fill('357');
    await page.waitForFunction(() => document.querySelector('#simulationResult').innerText.includes('357'));
    for (const width of [1440,630]) {
      await page.setViewportSize({width,height:900});
      for (const theme of ['dark','light']) {
        await page.evaluate(theme => document.body.dataset.theme=theme,theme);
        for (const section of ['forecast','history','simulator']) {
          await choose('data-decision-section',section);
          assert.equal(await board.locator('[data-decision-page]:visible').count(),1);
          const bounds = await board.evaluate(n => [n.clientWidth,n.scrollWidth]);
          assert.ok(bounds[1]<=bounds[0]+1, theme+' '+width+' '+section+' '+bounds);
        }
        assert.equal(await board.locator('#simAmount').inputValue(),'357');
      }
    }
    await choose('data-plan-pane','records');
    assert.match(await goal.innerText(), /99,99/);
    assert.ok(await goal.locator('summary').evaluate(node => node.scrollWidth<=node.clientWidth+1));
    await page.evaluate(() => {
      for(const [utility,billAmount] of [['water',15],['sanitation',5]]) {
        DossiersFinance.saveUtilityReading(data,{utility,kind:'monthly',unit:'m3',reading:10,
          periodStart:'2025-02-01',periodEnd:'2025-02-28',billAmount});
      }
      navigate('casaConsumos');
    });
    const water = page.locator('.utility-period-card').first();
    assert.match(await water.locator('.ut-kpi').first().innerText(), /20,00/);
    await water.locator('tr').filter({hasText:'Saneamento (histórico)'}).locator('[data-dossier-action=utility-form]').click();
    assert.equal(await page.locator('#modal [name=monthlyUtility]').inputValue(),'sanitation');
    await page.locator('#modal [name=monthlyBill]').fill('7');
    await submit();
    assert.match(await water.locator('.ut-kpi').first().innerText(), /22,00/);
    await page.evaluate(() => navigate('weeklyHub'));
    const comparison = page.locator('#weeklyHub #analysisComparisons');
    assert.equal(await comparison.isVisible(),false);
    await page.locator('#weeklyHub [data-review-topic=comparison]').click();
    assert.ok(await comparison.isVisible());
    await comparison.locator('select').selectOption('year');
    const reference = await comparison.locator('.section-head p').innerText();
    await page.locator('#weeklyHub [data-review-topic=overview]').click();
    await page.locator('#weeklyHub [data-review-topic=comparison]').click();
    assert.equal(await comparison.locator('select').inputValue(),'year');
    assert.equal(await comparison.locator('.section-head p').innerText(),reference);
    await page.evaluate(() => {month=FinancePlus.monthAdd(month,-1);render();});
    assert.notEqual(await comparison.locator('.section-head p').innerText(),reference);
    assert.deepEqual(errors,[]);
    console.log('CRUD de planos, proteção partilhada, simulação, previsões e histórico OK.');
  } finally {
    await browser?.close();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
