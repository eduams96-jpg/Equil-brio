const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../finance.js');

function ledger(){
  const d=F.empty();
  d.accounts=[
    {id:'mill',name:'Millenium',type:'Banco',balance:1000},
    {id:'save',name:'Poupança',type:'Poupança',balance:0},
  ];
  return d;
}

test('v0.39.42+: eixo do Resumo mantém números visíveis e setas compactas',()=>{
  const root=path.join(__dirname,'..');
  const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
  const summary=fs.readFileSync(path.join(root,'ui.css'),'utf8');
  assert.match(workspace,/function summarySvgAxis/);
  assert.match(workspace,/class="summary-bar-axis-label"/);
  assert.match(summary,/summary-plot-svg/);
  assert.match(summary,/\.summary-month-arrow\{[\s\S]*width:30px!important/);
});

test('v0.39.42: dados e subscrições refletem o layout pedido',()=>{
  const root=path.join(__dirname,'..');
  const stable=fs.readFileSync(path.join(root,'ui.css'),'utf8');
  const agenda=fs.readFileSync(path.join(root,'ui.css'),'utf8');
  assert.match(stable,/#dataHub \.data-deferred>div\{[\s\S]{0,120}gap:16px/);
  assert.match(agenda,/subscription-review-card\{grid-column:2!important/);
  assert.match(agenda,/subscription-agenda-card\{grid-column:1\/-1!important/);
});
