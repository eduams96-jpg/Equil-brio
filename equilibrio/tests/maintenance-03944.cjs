const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

test('v0.39.44: Decisões apresenta fluxo, margem real e detalhe agrupado',()=>{
  const ui=read('planning-ui.js');
  const css=read('ui.css');
  assert.match(ui,/class="decision-flow"/);
  assert.match(ui,/Margem depois de tudo/);
  assert.doesNotMatch(ui,/eur\(Math\.max\(0, decisionRoom\.available/);
  assert.match(ui,/class="decisions-secondary-grid"/);
  assert.match(css,/\.decisions-secondary-grid/);
});

test('v0.39.44: Revisão semanal inclui resumo compacto antes da narrativa',()=>{
  const ui=read('daily-ui.js');
  const css=read('ui.css');
  assert.match(ui,/class="review30-kpi-strip"/);
  assert.match(ui,/Maior categoria/);
  assert.match(ui,/Próximos 7 dias/);
  assert.match(css,/\.review30-kpi-strip/);
});

test('v0.39.44+: versão permanece consistente nos metadados principais',()=>{
  const pkg=JSON.parse(read('package.json'));
  const version=read('desktop/version.cjs');
  const match=version.match(/APP_VERSION = '([^']+)'/);
  assert.ok(match);
  assert.equal(pkg.version,match[1]);
});
