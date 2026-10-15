(function(root){
 'use strict';
 const F=root.Finance||(typeof require==='function'?require('./finance.js'):null);
 const ranges={year:[1,12],h1:[1,6],h2:[7,12],q1:[1,3],q2:[4,6],q3:[7,9],q4:[10,12]};
 function analyse(d,options={}){
  const year=String(options.year||F.today().slice(0,4)),period=options.period||'year',account=options.account||'';
  if(!/^\d{4}$/.test(year)||Number(year)<1900||!ranges[period])throw Error('Período de relatório inválido.');
  const selected=account?d.accounts.find(a=>String(a.id)===String(account)):null;if(account&&!selected)throw Error('A conta já não existe neste espaço.');
  const [first,last]=ranges[period],start=year+'-'+String(first).padStart(2,'0')+'-01',end=year+'-'+String(last).padStart(2,'0')+'-'+new Date(Number(year),last,0).getDate(),asAt=end>F.today()?F.today():end;
  const months=Array.from({length:last-first+1},(_,i)=>({month:year+'-'+String(first+i).padStart(2,'0'),income:0,expense:0})),byMonth=new Map(months.map(m=>[m.month,m])),categories=new Map(),accounts=new Map(d.accounts.filter(a=>!selected||a.id===selected.id).map(a=>[a.name,{id:a.id,name:a.name,income:0,expense:0,balance:F.balanceAt(d,a,asAt)}])),entries=[];
  const add=(row,field,value)=>{const next=F.cents(row[field])+F.cents(value);if(!Number.isSafeInteger(next))throw Error('Total fora dos limites permitidos.');row[field]=next/100;};
  const include=t=>byMonth.has(t.date.slice(0,7))&&(!selected||t.account===selected.name);
  for(const t of d.transactions)if(t.type==='income'&&!t.refundOf&&include(t)){add(byMonth.get(t.date.slice(0,7)),'income',t.amount);if(accounts.has(t.account))add(accounts.get(t.account),'income',t.amount);entries.push({...t,entryKind:'income'});}
  // Keep the complete ledger when resolving refunds, including purchases outside
  // the selected interval or account. Only filter the resulting expense entries.
  for(const t of F.expenseEntries(d,year))if(include(t)){add(byMonth.get(t.date.slice(0,7)),'expense',t.amount);if(accounts.has(t.account))add(accounts.get(t.account),'expense',t.amount);const old=categories.get(t.category)||{name:t.category,amount:0};add(old,'amount',t.amount);categories.set(t.category,old);entries.push({...t,entryKind:'expense'});}
  const income=months.reduce((n,m)=>n+F.cents(m.income),0)/100,expense=months.reduce((n,m)=>n+F.cents(m.expense),0)/100,saving=F.money(income-expense);
  return {year,period,account,start,end,asAt,accountName:selected?.name||'Todas as contas',income,expense,saving,rate:income>0?saving/income*100:null,months:months.map(m=>({...m,saving:F.money(m.income-m.expense)})),categories:[...categories.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'pt')),accounts:[...accounts.values()],entries:entries.sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)))};
 }
 const api={analyse,ranges};root.ReportAnalysis=api;if(typeof module==='object')module.exports=api;
})(globalThis);
