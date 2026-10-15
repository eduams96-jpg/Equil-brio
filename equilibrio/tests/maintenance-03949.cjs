const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../finance.js');

test('v0.39.50: importação usa reconciliação sem adivinhar Poupança',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
  assert.match(source,/F\.importTransaction\(data, prepared, \{ reconcile: false \}\)/);
  assert.doesNotMatch(source,/inferredSavingsTarget/);
});

test('v0.39.49: Rendimentos vs Despesas reserva margem esquerda dentro do SVG',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
  assert.match(source,/const width = 520, height = 250, left = 78/);
  assert.match(source,/summary-bar-axis-label/);
  assert.match(source,/x1="\$\{left\}"/);
  assert.doesNotMatch(source,/summary-chart-frame">\$\{summaryAxisColumn\(scale\.ticks, y, height\)\}<div class="summary-chart-plot">\$\{svg\}<\/div><\/div>`;\n}\nfunction summaryCategoryBreakdown/);
  assert.match(css,/\.summary-chart-grid \.summary-bar-axis-label/);
});

test('v0.39.49: setas alinham pela base dos seletores e topbar deixa de depender de scroll horizontal',()=>{
  const summary=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
  const stable=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
  assert.match(summary,/grid-template-columns:30px auto 30px/);
  assert.match(summary,/\.summary-month-arrow\{[\s\S]*height:36px!important/);
  assert.match(summary,/\.summary-month-picker-wrap\{[\s\S]*height:auto!important/);
  assert.match(stable,/@media\(max-width:1700px\)/);
  assert.match(stable,/\.top-primary-nav\{[\s\S]*overflow:visible!important;[\s\S]*flex-wrap:wrap!important/);
});

