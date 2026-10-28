'use strict';
const F=require('../../../equilibrio/finance.js');
function agenda(ledger,month,today,showCompleted=false){
 if(!F.validDate(month+'-01')||!F.validDate(today))throw Error('Período inválido.');
 const draft=structuredClone(ledger);
 const scheduled=(draft.pendingPayments||[]).filter(t=>t.date.startsWith(month)&&F.cents(t.amount)>0).map(t=>({...t,agendaSource:'Compromisso'}));
 const recurring=F.upcoming(draft,month,{includeCompleted:showCompleted}).map(t=>({...t,agendaSource:t.subscriptionId?'Subscrição':'Recorrência'}));
 const rows=[...scheduled,...recurring].sort((a,b)=>a.date.localeCompare(b.date)||String(a.description||'').localeCompare(String(b.description||''),'pt-PT')).map(t=>({...t,amountCents:F.cents(t.amount),status:t.agendaCompleted?'Concluído':t.date<today?'Em atraso':t.date===today?'Hoje':'Previsto'}));
 const total=type=>rows.filter(t=>!t.agendaCompleted&&t.type===type).reduce((n,t)=>n+t.amountCents,0);
 return {rows,payCents:total('expense'),receiveCents:total('income'),pendingCount:rows.filter(t=>!t.agendaCompleted).length,estimated:rows.some(t=>!t.agendaCompleted&&t.estimated)};
}
module.exports={agenda};
