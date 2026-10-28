'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),F=require('../finance.js'),scenarios=require('./fixtures/summary-0416.cjs');
const source=fs.readFileSync(require.resolve('../workspace.js'),'utf8');
const renderer=source.slice(source.indexOf('function summaryCategoryBreakdown()'),source.indexOf('function summaryAccountGlyph('));
for(const s of scenarios)test('Resumo: reconciliação de categorias e total líquido — '+s.id,()=>{
 const before=JSON.stringify(s.data),nodes=Object.fromEntries(['summaryExpenseDonut','summaryExpenseLegend','summaryExpenseTotal','summaryExpenseExplanation'].map(id=>['#'+id,{style:{setProperty(k,v){this[k]=v;}}}]));
 const eur=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n),context={F,data:s.data,month:'2026-10',$:id=>nodes[id],eur,esc:s=>s};
 vm.createContext(context);vm.runInContext(renderer+';summaryRenderDonut('+s.net+');',context);
 const total=nodes['#summaryExpenseTotal'].textContent,explanation=nodes['#summaryExpenseExplanation'].textContent,legend=nodes['#summaryExpenseLegend'].innerHTML,denominator=vm.runInContext('summaryCategoryBreakdown().reduce((n,r)=>n+r.amount,0)',context);
 assert.equal(total,eur(s.net));assert.doesNotMatch(explanation,/Percentagens sobre categorias com despesa líquida positiva/);
 if(s.net<denominator){assert.ok(explanation.includes(eur(denominator)));assert.match(explanation,/ajustes negativos/);assert.ok(explanation.includes(eur(s.net-denominator)));assert.ok(explanation.includes(eur(s.net)));}else assert.doesNotMatch(explanation,/ajustes negativos/);
 if(s.id==='mixed')assert.match(legend,/>100%/);if(s.id==='refund-only')assert.match(legend,/Reembolsos líquidos/);if(s.id==='empty')assert.match(legend,/Sem despesas nem reembolsos/);
 assert.equal(JSON.stringify(s.data),before);
});