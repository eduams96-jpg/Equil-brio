/* Leituras para organização das páginas; nunca altera dados ou saldos. */
(function(root){'use strict';
 const F=root.Finance||(typeof require==='function'?require('./finance.js'):null);
 const shift=(m,n)=>{const d=new Date(+m.slice(0,4),+m.slice(5,7)-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
 function analysis(d,m,comparison='previous'){
  const current=F.totals(d,m),keys=comparison==='year'?[shift(m,-12)]:comparison==='average'?[-3,-2,-1].map(n=>shift(m,n)):[shift(m,-1)];
  const observed=keys.filter(k=>d.transactions.some(t=>t.date.startsWith(k)&&['income','expense'].includes(t.type)));
  const divisor=keys.length;
  const reference={income:0,expense:0};if(divisor){for(const k of keys){const t=F.totals(d,k);reference.income+=t.income/divisor;reference.expense+=t.expense/divisor;}}
  reference.income=F.money(reference.income);reference.expense=F.money(reference.expense);
  const sum=entries=>{const map=new Map();for(const e of entries)map.set(e.category||'Sem categoria',F.money((map.get(e.category||'Sem categoria')||0)+e.amount));return map;};
  const entries=F.expenseEntries(d,m),now=sum(entries),before=sum(keys.flatMap(k=>F.expenseEntries(d,k)));if(divisor)for(const [category,amount]of before)before.set(category,F.money(amount/divisor));
  const changes=[...new Set([...now.keys(),...before.keys()])].map(category=>({category,amount:now.get(category)||0,reference:before.get(category)||0,delta:F.money((now.get(category)||0)-(before.get(category)||0))})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  const vendors=new Map();for(const e of entries){const key=e.beneficiary||e.description||'Sem fornecedor';vendors.set(key,F.money((vendors.get(key)||0)+e.amount));}
  const topVendors=[...vendors].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount).slice(0,5);
  const byId=new Map(d.transactions.map(t=>[String(t.id),t])),txs=d.transactions.filter(t=>t.date.startsWith(m)),recurring=F.money(entries.filter(e=>{const source=e.refundOf?byId.get(String(e.refundOf)):e;return source&&(source.subscriptionId||source.subscriptionRuleId||source.recurringRuleId||source.recurringId||source.ruleId);}).reduce((n,e)=>n+e.amount,0));
  return{current,reference,keys,observedMonths:observed.length,completeReference:observed.length===keys.length,changes,topVendors,recurring,variable:F.money(current.expense-recurring),savingsRate:F.savingsRate(current.income,current.expense),unclassified:txs.filter(t=>t.type==='expense'&&!t.splits?.length&&(!t.category||['Outros','Por categorizar'].includes(t.category))).length,events:(d.practical?.events||[]).filter(e=>e.date.startsWith(m))};
 }
 function agenda(d,items,m,status='all'){
  const rows=items.filter(p=>p.date?.startsWith(m)),done=p=>p.agendaCompleted||p.source==='completed';
  const selected=rows.filter(p=>status==='all'||status==='completed'&&done(p)||status==='open'&&!done(p)||status==='overdue'&&!done(p)&&p.date<F.today());
  return{rows:selected,open:rows.filter(p=>!done(p)),completed:rows.filter(done),outgoing:F.money(rows.filter(p=>!done(p)&&p.type==='expense').reduce((n,p)=>n+Number(p.amount||0),0)),registered:F.money(rows.filter(p=>done(p)&&p.type==='expense').reduce((n,p)=>n+Number(p.amount||0),0))};
 }
 function agendaSubscriptions(d, schedule, month) {
  const planned = schedule.filter(item => item.date?.startsWith(month) &&
    (item.source === 'subscription' || item.subscriptionId));
  const represented = new Set(planned.filter(item => item.agendaCompleted || item.source === 'completed')
    .map(item => String(item.completedTransactionId || item.id)));
  const representedSubs = new Set(planned.filter(item => (item.agendaCompleted || item.source === 'completed') && item.subscriptionId)
    .map(item => `${item.subscriptionId}|${item.actualDate || item.date}`));
  const subsById = new Map((d.subscriptions || []).map(s => [String(s.id), s]));
  const subsByRecurring = new Map((d.subscriptions || []).filter(s => s.recurringId).map(s => [String(s.recurringId), s]));
  const isSubscription = category => F.categoryParts(category)
    .some(part => part.toLocaleLowerCase('pt-PT') === 'subscrições');
  const history = [];
  for (const t of d.transactions) {
    if (t.type !== 'expense' || !t.date.startsWith(month) || represented.has(String(t.id))) continue;
    const linked = (t.subscriptionId && subsById.get(String(t.subscriptionId))) || (t.subscriptionRuleId && subsByRecurring.get(String(t.subscriptionRuleId)));
    const subId = t.subscriptionId || linked?.id;
    if (subId && representedSubs.has(`${subId}|${t.date}`)) continue;
    if (linked || t.subscriptionId || t.subscriptionRuleId) {
      history.push({ ...t, subscriptionId: subId, description: linked?.name || t.description, source: 'completed', agendaCompleted: true });
      continue;
    }
    const parts = t.splits?.length ? t.splits : [t];
    const amount = F.money(parts.filter(part => isSubscription(part.category))
      .reduce((total, part) => total + part.amount, 0));
    if (amount > 0) history.push({...t, amount, source: 'completed', historyOnly: true});
  }
  return [...planned, ...history]
    .sort((a, b) => a.date.localeCompare(b.date));
 }
 const api={shift,analysis,agenda,agendaSubscriptions};root.ExperienceFinance=api;if(typeof module==='object')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
