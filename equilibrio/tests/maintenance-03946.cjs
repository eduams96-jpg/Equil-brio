const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../finance.js');

test('v0.39.50: ambos os gráficos partilham eixos e números completos',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
  assert.equal((source.match(/summarySvgAxis\(scale\.ticks, y, left, right, width\)/g)||[]).length,2);
  assert.doesNotMatch(source,/function summaryAxisColumn/);
  assert.match(source,/Math\.round\(Math\.abs\(numeric\)\)/);
});

test('v0.39.46: barra superior deixa de renderizar saldos das contas',()=>{
  const root=path.join(__dirname,'..');
  const life=fs.readFileSync(path.join(root,'life-ui.js'),'utf8');
  const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
  assert.doesNotMatch(life,/toolbarAccountBalances/);
  assert.doesNotMatch(workspace,/toolbarAccountBalances/);
});

test('v0.39.46: importação não congela uma poupança não reconciliada',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
  assert.match(source,/savingsLike && rowsForAccount\.length\) return false/);
  assert.match(source,/reconciled\) return true/);
});

