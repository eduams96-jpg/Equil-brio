'use strict';
const F=require('../../finance.js');
const specs=[
{id:'mixed',previous:50,refund:20,food:100,net:80,categories:{'Alimentação':100,Casa:-20}},
{id:'positive',currentCasa:50,food:100,net:150,categories:{'Alimentação':100,Casa:50}},
{id:'full-refund-mixed',previous:50,refund:50,food:100,net:50,categories:{'Alimentação':100,Casa:-50}},
{id:'zero',previous:50,refund:20,food:20,net:0,categories:{'Alimentação':20,Casa:-20}},
{id:'negative',previous:50,refund:50,food:20,net:-30,categories:{'Alimentação':20,Casa:-50}},
{id:'refund-only',previous:50,refund:20,net:-20,categories:{Casa:-20}},
{id:'empty',net:0,categories:{}},
{id:'same-category',previous:50,refund:20,currentCasa:100,net:80,categories:{Casa:80}}
];
module.exports=specs.map(s=>{const d=F.empty();d.accounts=[{id:'a',name:'Banco sintético',type:'Banco',balance:1000}];F.migrateLedgerCore(d);if(s.previous)F.add(d,{id:'purchase',date:'2026-09-20',type:'expense',amount:s.previous,account:'Banco sintético',category:'Casa',description:'Compra anterior Casa'});if(s.refund)F.add(d,{id:'refund',date:'2026-10-05',type:'income',amount:s.refund,account:'Banco sintético',refundOf:'purchase',description:'Reembolso Casa'});if(s.food)F.add(d,{id:'food',date:'2026-10-07',type:'expense',amount:s.food,account:'Banco sintético',category:'Alimentação',description:'Despesa Alimentação'});if(s.currentCasa)F.add(d,{id:'current-casa',date:'2026-10-07',type:'expense',amount:s.currentCasa,account:'Banco sintético',category:'Casa',description:'Despesa atual Casa'});return {...s,data:F.normalize(d)};});
