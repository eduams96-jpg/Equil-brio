'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../finance.js'),L=require('../life-model.js');
test('Pesquisa global não deixa movimentos esconder as outras entidades e é só de leitura',()=>{
 const d=F.empty();d.accounts=[{id:'account',name:'Especial',type:'Banco'}];d.reserves=[{id:'reserve',name:'Especial',saved:0,target:10}];d.budgets=[{id:'budget',category:'Especial',limit:10}];
 d.transactions=Array.from({length:250},(_,i)=>({id:'t'+i,date:'2025-01-01',description:'Especial',category:'Casa',attachment:{name:'Especial.pdf'},receiptText:'Nome impresso original',receiptItems:[{name:'Sabonete',sourceName:'SAB ORIGINAL'}]}));const before=JSON.stringify(d),results=L.search(d,'Especial');
 assert.equal(results.length,100);for(const kind of ['Conta','Reserva','Orçamento','Comprovativo','Movimento'])assert.ok(results.some(r=>r.kind===kind));assert.equal(JSON.stringify(d),before);
 assert.ok(L.search(d,'Nome impresso').some(r=>r.kind==='Comprovativo'));assert.ok(L.search(d,'SAB ORIGINAL').some(r=>r.kind==='Movimento'));assert.deepEqual(L.search(d,'a'),[]);
});
