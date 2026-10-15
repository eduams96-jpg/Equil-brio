const assert=require('node:assert/strict');
const fs=require('node:fs');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');
(async()=>{
  const browser=await chromium.launch(browserLaunchOptions());
  try{
    const page=await browser.newPage({viewport:{width:1600,height:950}}), errors=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.EQUILIBRIO_TEST_URL||'http://127.0.0.1:4173'));
    await page.evaluate(()=>{
      data=F.empty();data.accounts=[{id:'b',name:'Banco',type:'Conta',balance:1000}];
      data.subscriptions=[{id:'sub',name:'Serviço de teste',amount:12,frequency:'monthly',nextDate:F.today(),renewalDay:23,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
      data=F.normalize(data);render();
    });
    const primary=await page.locator('.top-primary-nav .top-nav-link').allTextContents();
    assert.deepEqual(primary.map(x=>x.trim()),['Resumo','Dados','Movimentos','Planeamento','Património','Casa','Análises']);
    assert.equal(await page.locator('.top-settings-button').count(),1);checks.push('Navegação principal curta e Definições acessíveis');
    for(const width of [1600,768,390]){
      await page.setViewportSize({width,height:950});
      for(const id of ['dashboard','transactions','dataHub','planner','plansHub','goals','budgets','planningPlus','decisionsHub','wealth','wealthMoneyHub','wealthHoldingsHub','accounts','debts','assetsHub','investmentsHub','insights','reviewMonthHub','reports','settings','cashflow']){
        await page.evaluate(id=>{document.querySelectorAll("dialog[open]").forEach(d=>d.close());navigate(id);},id);
        assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).display==='none'),false,`${id} não visível a ${width}`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,`overflow em ${id} a ${width}`);
      }
      for(const id of ['planner','plansHub','goals','budgets','planningPlus','decisionsHub','wealth','wealthMoneyHub','wealthHoldingsHub','accounts','debts','assetsHub','investmentsHub','insights','reviewMonthHub','reports']){
        await page.evaluate(id=>{document.querySelectorAll("dialog[open]").forEach(d=>d.close());navigate(id);},id);
        // Navigation geometry is covered by core-responsive-03950; no duplicate screenshots.
      }
    }
    await page.evaluate(()=>{document.querySelectorAll("dialog[open]").forEach(d=>d.close());navigate("planner");});
    assert.deepEqual((await page.locator('.area-tabs button').allTextContents()).map(x=>x.trim()),['Agenda','Planos','Decisões']);
    assert.equal(await page.locator('.area-subtabs:visible button').count(),0);
    assert.match(await page.locator('#agendaSubscriptionsPreview').innerText(),/Serviço de teste/);
    assert.equal(await page.locator('#agendaSubscriptionsPreview .subscription-dashboard').isVisible(),true);
    checks.push('Subscrições geridas dentro dos Compromissos');
    await page.locator('#agendaSubscriptionsPreview .subscription-actions-menu > summary').first().click();
    assert.equal(await page.locator('.subscription-actions-menu[open] .subscription-actions button').evaluateAll(buttons=>buttons.every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+2})),true);
    await page.locator('.subscription-actions-menu[open] .subscription-actions button').filter({hasText:'Editar'}).first().click();
    assert.equal(await page.locator('#modal').evaluate(el=>el.open),true);
    await page.locator('#modal').evaluate(el=>el.close());
    await page.locator('.area-tabs button').filter({hasText:'Planos'}).click();
    assert.equal(await page.locator('body').getAttribute('data-current-view'),'plansHub');
    assert.equal(await page.locator('.area-subtabs:visible button').count(),0);
    assert.equal(await page.locator('.plans-hub-card').count(),3);
    await page.locator('[data-plan-open="goals"]').click();
    assert.equal(await page.locator('#planManagerDialog').evaluate(el=>el.open),true);
    await page.keyboard.press('Escape');
    checks.push('Objetivos, Orçamentos e Reservas reunidos em Planos');
    await page.locator('.area-tabs button').filter({hasText:'Decisões'}).click();
    assert.equal(await page.locator('body').getAttribute('data-current-view'),'decisionsHub');checks.push('Decisões separado do registo financeiro');
    assert.equal(await page.locator('#decisionsHub .decision-simulator-v25').count(),1);
    assert.equal(await page.locator('#planningPlus .decision-simulator-v25').count(),0);
    await page.locator('#runSimulation').click();
    assert.ok((await page.locator('#simulationResult').innerText()).length>0);
    await page.evaluate(()=>navigate('wealth'));
    assert.deepEqual((await page.locator('.area-tabs button').allTextContents()).map(x=>x.trim()),['Visão geral','Contas e créditos','Bens e investimentos']);
    await page.evaluate(()=>navigate('insights'));
    assert.deepEqual((await page.locator('.area-tabs button').allTextContents()).map(x=>x.trim()),['Análises','Revisão mensal','Fecho e relatórios']);checks.push('Património e Análises organizados por função');
    await page.evaluate(()=>navigate('reports'));
    assert.equal(await page.locator('#reports').evaluate(el=>el.firstElementChild.classList.contains('section-head')),true);
    assert.equal(await page.locator('#reports').evaluate(el=>Boolean(el.querySelector('.report-grid').compareDocumentPosition(el.querySelector('#closingGuide'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.equal(await page.locator('#reports .annual-report-details').evaluate(el=>el.open),false);
    await page.locator('#reports .annual-report-details summary').click();
    assert.equal(await page.locator('#reports .annual-report-details').evaluate(el=>el.open),true);
    assert.equal(await page.locator('#reports .annual-analysis-card').first().isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    checks.push('Fecho e relatórios legível e detalhe anual expansível no telemóvel');
    await page.locator('.top-settings-button').click();
    assert.equal(await page.locator('body').getAttribute('data-current-view'),'settings');
    assert.deepEqual(errors,[]);
    fs.writeFileSync('integration/navigation-results-03934.json',JSON.stringify({checks,errors},null,2));
    console.log(checks.join('\n'));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
