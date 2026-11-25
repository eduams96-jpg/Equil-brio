(function(root){
 'use strict';
 const F=root.Finance||(typeof require==='function'?require('./finance.js'):null);
 const monthEnd = month => {
  const [year, number] = month.split('-').map(Number);
  return month + '-' + new Date(year, number, 0).getDate();
 };
 const ranges={year:[1,12],h1:[1,6],h2:[7,12],q1:[1,3],q2:[4,6],q3:[7,9],q4:[10,12],m01:[1,1],m02:[2,2],m03:[3,3],m04:[4,4],m05:[5,5],m06:[6,6],m07:[7,7],m08:[8,8],m09:[9,9],m10:[10,10],m11:[11,11],m12:[12,12]};
 function analyse(d,options={}){
  const year=String(options.year||F.today().slice(0,4)),period=options.period||'year',account=options.account||'';
  if(!/^\d{4}$/.test(year)||Number(year)<1900||!ranges[period])throw Error('Período de relatório inválido.');
  const selected=account?d.accounts.find(a=>String(a.id)===String(account)):null;if(account&&!selected)throw Error('A conta já não existe neste espaço.');
  const [first,last]=ranges[period];
  const start=year+'-'+String(first).padStart(2,'0')+'-01',end=monthEnd(year+'-'+String(last).padStart(2,'0'));
  const cutoff=options.asOf||F.today();
  if(!F.validDate(cutoff))throw Error('Data de corte inválida.');
  const asAt=end>cutoff?cutoff:end;
  const observedMonths=new Set();
  const balances=new Map(d.accounts.map(a=>[a.name,Number.isFinite(a.openingBalance)?F.cents(a.openingBalance):null]));
  const startingBalances=new Map(balances);
  for(const t of d.transactions){for(const name of [t.account,...(t.type==='transfer'&&t.transferStatus!=='pending'&&t.targetAccount?[t.targetAccount]:[])])if(balances.has(name)&&balances.get(name)!==null&&(name===t.targetAccount?t.targetDate||t.date:t.date)<=asAt){const delta=F.transactionDeltaForAccount(t,name);if(delta===null)throw Error('Ajuste sem direção impede calcular este saldo.');const total=balances.get(name)+F.cents(delta);if(!Number.isSafeInteger(total))throw Error('Saldo fora dos limites permitidos.');balances.set(name,total);if((name===t.targetAccount?t.targetDate||t.date:t.date)<start)startingBalances.set(name,startingBalances.get(name)+F.cents(delta));}}
  const months=Array.from({length:last-first+1},(_,i)=>({month:year+'-'+String(first+i).padStart(2,'0'),income:0,expense:0})),byMonth=new Map(months.map(m=>[m.month,m])),categories=new Map(),accounts=new Map(d.accounts.filter(a=>!selected||a.id===selected.id).map(a=>[a.name,{id:a.id,name:a.name,income:0,expense:0,balance:balances.get(a.name)===null?F.balanceAt(d,a,asAt):balances.get(a.name)/100}])),entries=[];
  const beforeStart=new Date(Number(year),first-1,0,12);
  const startCutoff=beforeStart.getFullYear()+'-'+String(beforeStart.getMonth()+1).padStart(2,'0')+'-'+beforeStart.getDate();
  for(const a of d.accounts){
   const row=accounts.get(a.name);
   if(!row)continue;
   row.startBalance=asAt<start?row.balance:startingBalances.get(a.name)===null?F.balanceAt(d,a,startCutoff):startingBalances.get(a.name)/100;
   row.balanceChange=F.money(row.balance-row.startBalance);
  }
  const add=(row,field,value)=>{const next=F.cents(row[field])+F.cents(value);if(!Number.isSafeInteger(next))throw Error('Total fora dos limites permitidos.');row[field]=next/100;};
  const include=t=>t.date<=asAt&&byMonth.has(t.date.slice(0,7))&&(!selected||t.account===selected.name);
  for(const t of d.transactions)if(t.type==='income'&&!t.refundOf&&include(t)){add(byMonth.get(t.date.slice(0,7)),'income',t.amount);if(accounts.has(t.account))add(accounts.get(t.account),'income',t.amount);entries.push({...t,entryKind:'income'});observedMonths.add(t.date.slice(0,7));}
  // Keep the complete ledger when resolving refunds, including purchases outside
  // the selected interval or account. Only filter the resulting expense entries.
  for(const t of F.expenseEntries(d,year))if(include(t)){add(byMonth.get(t.date.slice(0,7)),'expense',t.amount);if(accounts.has(t.account))add(accounts.get(t.account),'expense',t.amount);const old=categories.get(t.category)||{name:t.category,amount:0};add(old,'amount',t.amount);categories.set(t.category,old);entries.push({...t,entryKind:'expense'});observedMonths.add(t.date.slice(0,7));}
  const income=months.reduce((n,m)=>n+F.cents(m.income),0)/100,expense=months.reduce((n,m)=>n+F.cents(m.expense),0)/100,saving=F.money(income-expense);
  return {year,period,account,start,end,asAt,accountName:selected?.name||'Todas as contas',income,expense,saving,rate:F.savingsRate(income,expense),months:months.map(m=>({...m,saving:F.money(m.income-m.expense),status:m.month>asAt.slice(0,7)?'future':monthEnd(m.month)>asAt?'partial':'complete',hasData:observedMonths.has(m.month)})),categories:[...categories.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'pt')),accounts:[...accounts.values()],entries:entries.sort((a,b)=>(a.date===b.date?String(a.id).localeCompare(String(b.id)):a.date<b.date?1:-1))};
 }
 // Análises detalhadas sobre o mesmo resultado de analyse(): categorias com
 // subcategorias, mês a mês, comparação com o mesmo período do ano anterior,
 // onde gastas (descrições) e receitas. Não altera dados.
 function detail(d,options={}){
  const current=options.result||analyse(d,options),year=Number(current.year);let previous=null;
  if(current.asAt>=current.start&&year>1900){
   const previousMonth=String(year-1)+current.asAt.slice(4,7);
   const sameDay=previousMonth+current.asAt.slice(7);
   const previousEnd=monthEnd(previousMonth);
   const asOf=current.asAt===monthEnd(current.asAt.slice(0,7))||sameDay>previousEnd?previousEnd:sameDay;
   previous=analyse(d,{...options,year:String(year-1),asOf});
  }
  const sum=(a,b)=>F.money(a+b),root=c=>F.categoryParts(c||'Outros')[0]||'Outros',sub=c=>F.categoryParts(c||'Outros').slice(1).join(' / ')||'(sem subcategoria)';
  const expense=current.entries.filter(t=>t.entryKind==='expense'),income=current.entries.filter(t=>t.entryKind==='income'),prevExpense=(previous?.entries||[]).filter(t=>t.entryKind==='expense');
  const months=current.months.map(m=>m.month),monthIndex=new Map(months.map((m,i)=>[m,i]));
  const completeMonths=current.months.filter(m=>m.status==='complete');
  const elapsed=completeMonths.length;
  const monthlyAverage=amount=>elapsed?F.money(amount/elapsed):null;
  const prevByRoot=new Map(),prevBySub=new Map();for(const t of prevExpense){prevByRoot.set(root(t.category),sum(prevByRoot.get(root(t.category))||0,t.amount));const k=root(t.category)+'\u0000'+sub(t.category);prevBySub.set(k,sum(prevBySub.get(k)||0,t.amount));}
  const tree=new Map();
  for(const t of expense){const r=root(t.category),s=sub(t.category);if(!tree.has(r))tree.set(r,{name:r,amount:0,ids:new Set(),count:0,months:months.map(()=>0),children:new Map()});const node=tree.get(r);node.amount=sum(node.amount,t.amount);node.ids.add(String(t.id));node.count=node.ids.size;const i=monthIndex.get(t.date.slice(0,7));if(i!==undefined)node.months[i]=sum(node.months[i],t.amount);if(!node.children.has(s))node.children.set(s,{name:s,path:s==='(sem subcategoria)'?r:r+' / '+s,amount:0,ids:new Set(),count:0});const child=node.children.get(s);child.amount=sum(child.amount,t.amount);child.ids.add(String(t.id));child.count=child.ids.size;}
  const total=current.expense||0,share=v=>total>0?v/total*100:0;
  const categories=[...tree.values()].map(({ids:_nodeIds,...n})=>({...n,share:share(n.amount),average:monthlyAverage(n.months.reduce((total,amount,index)=>current.months[index].status==='complete'?sum(total,amount):total,0)),previous:previous?(prevByRoot.get(n.name)||0):null,children:[...n.children.values()].map(({ids:_childIds,...c})=>({...c,share:n.amount?c.amount/n.amount*100:0,previous:previous?(prevBySub.get(n.name+'\u0000'+c.name)||0):null})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'pt'))})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'pt'));
  const compareNames=new Set([...prevByRoot.keys(),...tree.keys()]),comparison=previous?[...compareNames].map(name=>{const now=tree.get(name)?.amount||0,before=prevByRoot.get(name)||0;return{name,current:now,previous:before,delta:F.money(now-before),change:F.percentageChange(now,before)};}).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.name.localeCompare(b.name,'pt')):[];
  const txById=new Map((d.transactions||[]).map(t=>[String(t.id),t]));
  const merchantDesc=t=>t.refundOf?(txById.get(String(t.refundOf))?.description||t.description):t.description;
  const key=s=>String(s||'Sem descrição').toLocaleLowerCase('pt-PT').replace(/\d{2,}/g,'').replace(/[^\p{L}\s]/gu,' ').replace(/\s+/g,' ').trim()||'sem descrição',places=new Map();
  for(const t of expense){const desc=merchantDesc(t),k=key(desc);if(!places.has(k))places.set(k,{name:desc||'Sem descrição',amount:0,ids:new Set(),last:'',categories:new Map()});const p=places.get(k);p.amount=sum(p.amount,t.amount);p.ids.add(String(t.id));p.count=p.ids.size;if(t.date>p.last)p.last=t.date;p.categories.set(root(t.category),(p.categories.get(root(t.category))||0)+1);}
  const merchants=[...places.values()].map(p=>({name:p.name,amount:p.amount,count:p.count,average:F.money(p.amount/p.count),last:p.last,share:share(p.amount),category:[...p.categories].sort((a,b)=>b[1]-a[1])[0]?.[0]||''})).sort((a,b)=>b.amount-a.amount||b.count-a.count);
  const incomeMap=new Map();for(const t of income){const name=F.categoryPath(t.category||'Receita');if(!incomeMap.has(name))incomeMap.set(name,{name,amount:0,count:0,months:months.map(()=>0)});const row=incomeMap.get(name);row.amount=sum(row.amount,t.amount);row.count++;const i=monthIndex.get(t.date.slice(0,7));if(i!==undefined)row.months[i]=sum(row.months[i],t.amount);}
  const incomeRows=[...incomeMap.values()].map(r=>({...r,share:current.income>0?r.amount/current.income*100:0})).sort((a,b)=>b.amount-a.amount);
  const biggest=expense.filter(t=>t.amount>0).slice().sort((a,b)=>b.amount-a.amount).slice(0,10);
  const includedMonths=rows=>rows.filter(m=>m.status!=='future');
  const currentIncluded=includedMonths(current.months),previousIncluded=previous?includedMonths(previous.months):[];
  const previousDataMonths=previousIncluded.filter(m=>m.hasData).length;
  const currentDataMonths=currentIncluded.filter(m=>m.hasData).length;
  const coverageComplete=Boolean(previous&&previousDataMonths===previousIncluded.length&&currentDataMonths===currentIncluded.length);
  return{months,elapsed,categories,comparison,coverageComplete,currentDataMonths,
   previous:previous?{year:previous.year,asAt:previous.asAt,income:previous.income,expense:previous.expense,saving:previous.saving,monthsWithData:previousDataMonths,monthsCompared:previousIncluded.length}:null,
   merchants,income:incomeRows,biggest,
   averageExpense:monthlyAverage(completeMonths.reduce((total,m)=>sum(total,m.expense),0)),
   averageIncome:monthlyAverage(completeMonths.reduce((total,m)=>sum(total,m.income),0))};
 }
 const palette=['#2f9e83','#e07a5f','#5b7fd6','#f2b134','#9b6bd3','#3fb4c8','#d4688f','#7a9e3f','#c98a4a','#a7c957','#f08a5d','#7c8ee8','#56b870','#c58fe0'];
 const color=i=>palette[i%palette.length];
 const api={analyse,detail,ranges,palette,color};root.ReportAnalysis=api;if(typeof module==='object')module.exports=api;
})(globalThis);
