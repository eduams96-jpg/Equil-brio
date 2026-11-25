'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3];

async function measure(root, version) {
  const profile = fs.mkdtempSync(path.join(path.dirname(manifest.snapshot), 'medir-catalogo-'));
  const appData = path.join(profile, 'Financas Pessoais');
  fs.mkdirSync(appData);
  fs.writeFileSync(path.join(profile, '.equilibrio-validation'), '');
  fs.copyFileSync(manifest.snapshot, path.join(appData, 'financas.db'));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(root, 'desktop/main.cjs'), '--equilibrio-validation', '--disable-renderer-backgrounding'],
    env: { ...process.env, EQUILIBRIO_VALIDATION_ROOT: profile },
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof UnifiedWorkspaceUI === 'object' && (!equilibrioStartup.awaitingChoice || !!document.querySelector('#welcomeContinue')?.getClientRects().length), null, {timeout:25000});
    if (await page.locator('#welcomeContinue').isVisible()) {
      await page.evaluate(() => {
        const id = LifeUI.spaces().map(space => ({id:space.id,count:CasaFinance.state(LifeUI.readSpace(space.id)).catalog.length})).sort((a,b)=>b.count-a.count)[0].id;
        [...document.querySelectorAll('[name=welcomeSpace]')].find(input => input.value === id).click();
      });
      await page.locator('#welcomeContinue').click();
    }
    await page.waitForFunction(() => !equilibrioStartup.awaitingChoice);
    const result = await page.evaluate(async () => {
      navigate('casaProducts');
      const products = CasaFinance.state(data).catalog.filter(p=>!p.archived);
      if (!products.length) throw Error('Catálogo vazio.');
      const queries = products.filter((_,i) => i % Math.max(1, Math.floor(products.length / 5)) === 0).slice(0,5).map(p=>p.name);
      const frame = () => new Promise(resolve => setTimeout(resolve, 60));
      let timings = [];
      for (let i = 0; i < 10; i++) {
        for (const query of [queries[i % queries.length], '']) {
          const input = document.querySelector('#casaProductSearch');
          const start = performance.now();
          input.value = query;
          input.dispatchEvent(new Event('input', {bubbles:true}));
          const grid = document.querySelector('#casaCatalogCards');
          grid.getBoundingClientRect();
          const elapsed = performance.now() - start;
          const count = [...grid.querySelectorAll('.cat-card')].filter(card=>!card.hidden).length;
          const expected = query ? products.filter(p=>[p.name,p.brand,p.barcode].some(v=>String(v||'').toLocaleLowerCase('pt').includes(query.toLocaleLowerCase('pt')))).length : products.length;
          if (count !== expected) throw Error('Contagem do catálogo incorreta.');
          if (i >= 2) timings.push({operation:query?'pesquisar':'limpar',ms:+elapsed.toFixed(1)});
          await frame();
        }
      }
      return { products:products.length,timings };
    });
    assert.deepEqual(errors, []);
    return {version,...result};
  } finally {
    await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
  }
}

(async () => {
  const results=[];
  for (const [root,version] of [[manifest.baseline,manifest.previous],[manifest.current,manifest.version]]) results.push(await measure(root,version));
  assert.equal(results[0].products,results[1].products);
  fs.writeFileSync(out,JSON.stringify(results,null,2));
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  console.log(JSON.stringify(results.map(r=>({version:r.version,products:r.products,pesquisar:median(r.timings.filter(t=>t.operation==='pesquisar').map(t=>t.ms)),limpar:median(r.timings.filter(t=>t.operation==='limpar').map(t=>t.ms))}))));
})().catch(error => {console.error(error.message);process.exitCode=1;});
