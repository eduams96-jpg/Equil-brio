'use strict';
const F=require('../../finance.js'),{validateLedger}=require('../../desktop/ledger-validation.cjs');
const clock='2026-10-08';
function seed(){const d=F.empty();d.accounts=[{id:'a',name:'Banco',type:'Banco',balance:1000},{id:'b',name:'Outra',type:'Banco',balance:0}];F.migrateLedgerCore(d);return d;}
function purchase(d,id,date,amount,extra={}){return F.add(d,{id,date,type:'expense',amount,account:'Banco',description:id,category:'Casa',...extra});}
function refund(d,id,date,amount,source,account='Banco'){return F.add(d,{id,date,type:'income',amount,account,description:id,category:'Casa',refundOf:source});}
function monthly(sameMonth=false){const d=seed();purchase(d,'buy',sameMonth?'2026-10-01':'2026-09-20',100.01);refund(d,'refund','2026-10-05',20.03,'buy');return validateLedger(d);}
function classified(kind='recurring',other=false,fixed=false){const d=seed();if(kind==='recurring')d.recurring=[{id:'r',active:false,start:'2025-09-01',day:20,frequency:'monthly',type:'expense',account:'Banco',amount:100.01,description:'Mensalidade',category:'Casa'}];else d.subscriptions=[{id:'s',name:'Serviço',amount:100.01,frequency:'monthly',nextDate:'2025-11-20',renewalDay:20,status:'cancelled',reminderDays:7,account:'Banco',category:'Casa',prices:[]}];purchase(d,'buy','2025-09-20',100.01,{[kind==='recurring'?'recurringRuleId':'subscriptionId']:kind==='recurring'?'r':'s',...(fixed?{expenseNature:'fixed'}:{})});refund(d,'refund','2025-10-05',20.03,'buy',other?'Outra':'Banco');return validateLedger(d);}
function future(year='2026',includeCurrent=false){const d=seed();if(includeCurrent)purchase(d,'now',year+'-09-20',10.02);purchase(d,'future',year+'-12-01',100.01,{expenseNature:'fixed'});return validateLedger(d);}
module.exports={clock,seed,monthly,classified,future};
