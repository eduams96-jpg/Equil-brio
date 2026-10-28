'use strict';
const F=require('../../../equilibrio/finance.js');
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-PT').trim();
function validMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>0;}
function shiftMonth(value,delta){if(!validMonth(value)||!Number.isInteger(delta))throw Error('Mês inválido.');const count=Number(value.slice(0,4))*12+Number(value.slice(5))-1+delta;if(count<12||count>119999)return value;return String(Math.floor(count/12)).padStart(4,'0')+'-'+String(count%12+1).padStart(2,'0');}
function dateLabel(value){return F.validDate(value)?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'Data indisponível';}
function statuses(state){const map={};for(const r of state.outbox){const cmd=r.operation.command;if(cmd?.startsWith('account.')||cmd?.startsWith('house.')||cmd?.startsWith('commitment.')&&cmd!=='commitment.settle')continue;if(r.resolution||r.status==='acknowledged')continue;const id=cmd==='commitment.settle'?r.operation.payload.transactionId:r.operation.payload.id;map[id]=['pending','sending'].includes(r.status)?'pending':'review';}return map;}
function movements(ledger,state,filters={},limit=40){
 const status=statuses(state),query=fold(filters.query),account=ledger.accounts.find(a=>a.id===filters.accountId);
 const found=ledger.transactions.map((t,index)=>({t,index,date:account&&t.type==='transfer'&&t.targetAccount===account.name?t.targetDate||t.date:t.date})).filter(({t,date})=>{
  return (!filters.period||date.startsWith(filters.period))&&(!filters.accountId||!!account&&(t.account===account.name||t.targetAccount===account.name))&&(!filters.type||t.type===filters.type)&&(!filters.status||(status[t.id]||'confirmed')===filters.status)&&(!query||fold([t.description,t.category,t.account,t.targetAccount,t.beneficiary,t.note,...(t.tags||[])].filter(Boolean).join(' ')).includes(query));
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.index-a.index);
 return {rows:found.slice(0,Math.max(1,Number.isFinite(limit)?Math.floor(limit):40)).map(({t})=>t),total:found.length,status};
}
function summary(ledger,period){if(!validMonth(period))throw Error('Mês inválido.');const totals=F.totals(ledger,period);return {incomeCents:F.cents(totals.income),expenseCents:F.cents(totals.expense),resultCents:F.cents(F.money(totals.income-totals.expense)),balanceCents:ledger.accounts.reduce((n,a)=>n+F.cents(F.balanceAt(ledger,a)),0)};}
function accountAmount(t,name){return F.cents(F.transactionDeltaForAccount(t,name));}
function movementInfo(t,accountName=''){
 const pending=t.type==='transfer'&&t.transferStatus==='pending';
 return {amountCents:accountName||pending?accountAmount(t,accountName||t.account):F.cents(t.amount)*(t.type==='expense'?-1:1),symbol:t.type==='transfer'&&!pending&&!accountName?'↔ ':'',route:String(t.account||'')+(t.type==='transfer'&&t.targetAccount?' → '+t.targetAccount:'')+(pending?' · Por confirmar':''),label:pending?'Transferência por confirmar':t.type==='transfer'?'Transferência interna · não conta como rendimento ou despesa':t.category||'',dates:dateLabel(t.date)+(t.type==='transfer'&&t.targetDate&&t.targetDate!==t.date?' · Entrada: '+dateLabel(t.targetDate):'')};
}
function years(ledger,period,current){return [...new Set([Number(current.slice(0,4))-1,Number(current.slice(0,4)),Number(current.slice(0,4))+1,Number(period.slice(0,4)),...ledger.transactions.map(t=>Number(t.date.slice(0,4))),...([...ledger.pendingPayments.map(t=>t.date),...ledger.recurring.map(t=>t.start),...(ledger.subscriptions||[]).map(t=>t.nextDate)].filter(F.validDate).map(d=>Number(d.slice(0,4))))])].filter(n=>Number.isInteger(n)&&n>0&&n<=9999).sort((a,b)=>b-a);}
module.exports={movementInfo,fold,validMonth,shiftMonth,dateLabel,statuses,movements,summary,accountAmount,years};
