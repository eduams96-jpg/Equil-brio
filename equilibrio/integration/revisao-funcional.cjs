
'use strict';
const assert=require('node:assert/strict');
const {chromium,browserLaunchOptions}=require('./_browser.cjs');
const {createServer}=require('../serve.cjs');
const F=require('../finance.js');

async function main(){
 const server=createServer();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(browserLaunchOptions());
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.setDefaultTimeout(8000);
  const d=F.empty();
  d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:4000},{id:'b',name:'Cartão Refeição',type:'Banco',balance:100}];
  F.migrateLedgerCore(d);
  F.add(d,{id:'initial',date:F.today(),type:'income',amount:10,account:'Cartão Refeição',description:'Saldo de teste',category:'Receitas'});
  for(const category of ['Subscrições','Mercearia','Outros Despesas'])F.add(d,{id:category,date:F.today(),type:'expense',amount:10,account:'Banco',description:category,category,beneficiary:'Beneficiário Teste'});
  await page.addInitScript(d=>{if(!localStorage.getItem('equilibrioData'))localStorage.setItem('equilibrioData',JSON.stringify(d));},d);
  const url='http://127.0.0.1:'+server.address().port;
  const enter=async()=>{
   await page.goto(url);
   await page.waitForFunction(()=>!!window.equilibrioStartup);
   if(await page.locator('#welcomeContinue').isVisible()){
    if(await page.locator('[name=welcomeSpace]').count())await page.locator('[name=welcomeSpace]').first().check();
    await page.locator('#welcomeContinue').click();
   }
   await page.waitForFunction(()=>!window.equilibrioStartup.awaitingChoice);
  };
  await enter();
  const go=route=>page.evaluate(v=>navigate(v),route);
  const close=()=>page.evaluate(()=>document.querySelector('#modal').close());
  const submit=()=>page.locator('#modalContent [type=submit]').click();
  const text=()=>page.locator('#formTitle').textContent();
  await go('transactions');
  await page.locator('#movementAccountFilters').getByRole('button',{name:/Cartão Refeição/}).click();
  await page.locator('#addTransaction2').click();
  const account=page.locator('#modalContent [name=account]');
  assert.equal(await account.inputValue(),'Cartão Refeição');
  await page.locator('#modalContent [name=type]').selectOption('income');
  assert.equal(await account.inputValue(),'Cartão Refeição');
  await account.selectOption('Banco');
  await page.locator('#modalContent [name=type]').selectOption('expense');
  assert.equal(await account.inputValue(),'Banco');
  await close();
  await page.locator('#addTransfer2').click();
  assert.equal(await account.inputValue(),'Cartão Refeição');
  assert.equal(await page.locator('#modalContent [name=targetAccount]').inputValue(),'Banco');
  await close();
  await page.locator('#openMovementHistory').click();
  assert.equal(await page.locator('#historyManagerDialog').isVisible(),true);
  await page.evaluate(()=>document.querySelector('#historyManagerDialog').close());

  await go('settings');
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>typeof UnifiedWorkspaceUI),'object');
  assert.equal(await page.locator('[data-u-settings=guides]').count(),0);
  await page.locator('[data-u-settings=appearance]').click();
  assert.equal(await page.locator('.beneficiary-settings').getAttribute('open'),null);
  await page.locator('.beneficiary-settings summary').click();
  await page.locator('#beneficiarySettingsSearch').fill('beneficiario');
  assert.equal(await page.locator('#beneficiarySettingsList .beneficiary-setting-row').count(),1);
  await page.locator('[data-category-corrections]').click();
  const corrections=page.locator('#modalContent [data-correction]');
  assert.equal(await corrections.count(),3);
  await corrections.nth(1).uncheck();
  await corrections.nth(2).uncheck();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-correction-dismiss]').click();
  assert.equal(await corrections.count(),2);
  page.once('dialog',d=>d.accept());
  await page.locator('[data-correction-dismiss]').click();
  await enter();
  assert.equal(await page.evaluate(()=>data.correctionsDismissed.length),3);

  await page.evaluate(()=>{
   commit(()=>{
    DossiersFinance.saveVehicle(data,{name:'Veículo Teste',makeModel:'Marca Pesquisável'});
    DossiersFinance.saveHousing(data,{name:'Habitação Teste',addressNote:'Travessa Pesquisável'});
    const routine=DossiersFinance.saveRoutine(data,{title:'Limpar exaustor',frequency:'weekly',nextDate:'2026-11-14'});
    DossiersFinance.completeRoutine(data,routine.id,{date:'2026-11-14'});
    const stored=data.practical.routines.find(r=>r.id===routine.id);
    stored.intervalDays=14;
    const z=CasaFinance.saveProduct(data,{name:'Zimbro',unit:'kg',category:'Casa'});
    CasaFinance.saveProduct(data,{name:'Água',unit:'L',category:'Casa'});
    CasaLife.saveRecipe(data,{name:'Receita Teste',servings:2,ingredients:[{catalogId:z,qty:1}]});
    CasaFinance.shopping(data,'add',{name:'Leite',qty:'2'});
    data.goals.push({id:'g',name:'Poupança',current:1000,target:1500});
   });
  });
  const inline=page.locator('#inlineGlobalResults');
  await page.evaluate(()=>{
   const input=document.querySelector('#inlineGlobalResults').parentElement.querySelector('input');
   input.value='Marca Pesquisável';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await inline.locator('[data-action=global-result]').first().click();
  assert.match(await text(),/Editar veículo/);
  await close();
  await page.evaluate(()=>{
   const input=document.querySelector('#inlineGlobalResults').parentElement.querySelector('input');
   input.value='Travessa Pesquisável';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await inline.locator('[data-action=global-result]').first().click();
  assert.match(await text(),/Editar dossier da habitação/);
  await close();

  await go('casaRecipes');
  await page.locator('[data-recipe-edit]').click();
  const options=page.locator('[name=ingredientProduct] option');
  assert.deepEqual(await options.allTextContents(),['Água','Zimbro']);
  await close();
  await page.locator('[data-recipe-remove]').click();
  await submit();
  assert.equal(await page.evaluate(()=>data.casa.recipes.length),0);

  await go('plansHub');
  await page.locator('.plan-navigation [data-plan-pane=funding]').click();assert.match(await page.locator('.plan-saldo').innerText(),/Saldo livre hoje/);
  await page.locator('.plan-navigation [data-plan-pane=records]').click();
  await page.locator('[data-u-plan] summary').first().click();
  await page.locator('[data-u-plan-protect]').click();
  await page.locator('[name=protectionAccount]').selectOption('a');
  await submit();
  await page.locator('.plan-navigation [data-plan-pane=funding]').click();
  assert.match(await page.locator('.plan-accounts').innerText(),/Coberto/);
  const create=async(kind,fields)=>{
   await page.locator('.plan-masthead .u-add-menu summary').click();
   await page.locator('.plan-masthead .u-add-menu [data-action='+kind+']').click();
   for(const [name,value] of Object.entries(fields))await page.locator('#modalContent [name='+name+']').fill(value);
   await submit();
   assert.equal(await page.locator('[data-u-plan-kind='+kind+']').getAttribute('aria-pressed'),'true');
  };
  const openPlan=name=>page.locator('.plan-record summary').filter({hasText:name}).click();
  const deletePlan=async kind=>{
   await page.locator('#unifiedPlanDetail [data-action=delete-'+kind+']').click();
   await submit();
  };
  await create('goal',{name:'Formação',target:'700',current:'100'});
  await openPlan('Formação');
  await page.locator('#unifiedPlanDetail [data-action=goal]').click();
  await page.locator('#modalContent [name=target]').fill('720');
  await submit();
  assert.equal(await page.evaluate(()=>data.goals.find(r=>r.name==='Formação').target),720);
  await page.locator('#unifiedPlanDetail [data-action=goal-fund]').click();
  await page.locator('#modalContent [name=amount]').fill('721');
  await submit();
  await page.locator('#formError').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>data.goals.find(r=>r.name==='Formação').current),100);
  await close();
  await deletePlan('goal');
  await create('reserve',{name:'Seguro anual',target:'360',saved:'45'});
  await openPlan('Seguro anual');
  await page.locator('#unifiedPlanDetail [data-action=reserve-fund]').click();
  await page.locator('#modalContent [name=amount]').fill('60');
  await submit();
  assert.equal(await page.evaluate(()=>data.reserves[0].saved),60);
  await deletePlan('reserve');
  await create('budget',{category:'Desporto',limit:'85'});
  await openPlan('Desporto');
  await page.locator('#unifiedPlanDetail [data-action=budget]').click();
  await page.locator('#modalContent [name=limit]').fill('95');
  await submit();
  assert.equal(await page.evaluate(()=>FinancePlus.budgetAt(data,data.budgets.find(b=>b.category==='Desporto'),month).limit),95);
  await deletePlan('budget');
  assert.equal(await page.evaluate(()=>data.goals.length+data.reserves.length+data.budgets.length),1);

  await page.setViewportSize({width:390,height:844});
  await go('casaShopping');
  await page.locator('#casaStoreMode').click();
  assert.equal(await page.locator('#casaShoppingForm').count(),0);
  await page.context().setOffline(true);
  await page.locator('#casaShopping .casa-shop-check').click();
  assert.equal(await page.evaluate(()=>data.casa.shopping[0].done),true);
  assert.equal(await page.locator('#casaShopping [data-casa-toggle]').isChecked(),true);

  await page.context().setOffline(false);
  await go('casaEquipment');
  assert.equal(await page.evaluate(()=>DossiersFinance.routines(data)[0].nextDate),'2026-11-28');
  await go('casaConsumos');
  assert.equal(await page.locator('#utilityLegacy').count(),0);
  await page.locator('#addUtilityMonthly').click();
  const supplier=page.locator('[name=utilitySupplier]');
  assert.equal(await supplier.isVisible(),false);
  await page.locator('[name=monthlyUtility]').selectOption('electricity');
  assert.equal(await supplier.isVisible(),true);
  await supplier.fill('Comercializadora de teste');
  await page.locator('[name=periodStart]').fill('2026-10-16');
  await page.locator('[name=periodEnd]').fill('2026-11-15');
  await page.locator('[name=monthlyConsumption]').fill('80');
  await submit();
  assert.match(await page.locator('#casaConsumos').innerText(),/80 kWh/);
  assert.match(await page.locator('#casaConsumos').innerText(),/Comercializadora de teste/);
  await page.locator('#casaConsumos [data-dossier-action=utility-form]').click();
  assert.equal(await page.locator('[name=periodStart]').inputValue(),'2026-10-16');
  await page.locator('[name=monthlyConsumption]').fill('81');
  await submit();
  await enter();
  assert.equal(await page.evaluate(()=>data.casa.utilityPeriods[0].reading),81);
  await go('plansHub');
  await page.locator('.plan-navigation [data-plan-pane=records]').click();
  await page.locator('#planSearch').fill('sem correspondência');
  assert.match(await page.locator('.plan-empty').innerText(),/Nenhum plano encontrado/);
  await page.evaluate(()=>{data=F.empty();render();});
  assert.match(await page.locator('.pl2-starter').innerText(),/Dá um destino ao teu dinheiro/);
  await page.locator('.plan-navigation [data-plan-pane=funding]').click();
  assert.match(await page.locator('.plan-accounts').innerText(),/Sem contas elegíveis/);
  assert.deepEqual(errors,[]);
  console.log('Fluxos de browser validados a 1440 px e 390 px sem erros de JavaScript, com marcação de compras offline.');
 }finally{
  await browser.close();
  await new Promise(r=>server.close(r));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

