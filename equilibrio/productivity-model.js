(function(root){
 'use strict';
 const F=root.Finance||(typeof require==='function'?require('./finance.js'):null);
 function validateDraft(value){
  if(!value||value.format!==1||typeof value.space!=='string'||!value.space||value.space.length>200||!['movement','csv','mmex','receipt','casaReceipt','importReview'].includes(value.kind)||typeof value.savedAt!=='string'||!Array.isArray(value.fields)||value.fields.length>40000||!value.payload||typeof value.payload!=='object')throw Error('Rascunho inválido.');
  for(const f of value.fields)if(!f||typeof f.name!=='string'||f.name.length>200||typeof f.value!=='string'||f.value.length>200000||typeof f.checked!=='boolean')throw Error('Campo de rascunho inválido.');
  if(value.recordId!==undefined&&(typeof value.recordId!=='string'||!value.recordId||value.recordId.length>200))throw Error('Identificador de rascunho inválido.');
  if(JSON.stringify(value).length>24*1024*1024)throw Error('O rascunho excede o limite local.');
  return structuredClone(value);
 }
 function balanceChanges(d,from,to){
  if(!F.validDate(from)||!F.validDate(to)||from>to)throw Error('Intervalo inválido.');
  const accounts=d.accounts.map(a=>({id:a.id,name:a.name,from:F.balanceAt(d,a,from),to:F.balanceAt(d,a,to)}));
  const rows=[];
  for(const t of d.transactions){
   if(t.type==='transfer'&&t.transferStatus!=='pending'){
    if(t.date>from&&t.date<=to)rows.push({id:t.id,date:t.date,description:t.description,account:t.account,amount:-t.amount});
    const date=t.targetDate||t.date;if(date>from&&date<=to)rows.push({id:t.id,date,description:t.description,account:t.toAccount||t.targetAccount,amount:t.amount});
   }else if(t.date>from&&t.date<=to)rows.push({id:t.id,date:t.date,description:t.description,account:t.account,amount:F.transactionDeltaForAccount(t,t.account)});
  }
  const opening=accounts.reduce((n,a)=>n+F.cents(a.from),0)/100,closing=accounts.reduce((n,a)=>n+F.cents(a.to),0)/100,explained=rows.reduce((n,t)=>n+F.cents(t.amount),0)/100;
  return {from,to,opening,closing,change:F.money(closing-opening),explained,residual:F.money(closing-opening-explained),accounts,rows:rows.sort((a,b)=>b.date.localeCompare(a.date))};
 }
 function bulkEligibility(d,ids,changes){
  const index=new Map(d.transactions.map(t=>[String(t.id),t])),eligible=[],blocked=[];
  if(new Set(ids.map(String)).size!==ids.length)throw Error('Seleção repetida.');
  for(const id of ids){const t=index.get(String(id));let reason='';
   if(!t)reason='O movimento já não existe';else if(d.closedMonths.includes(t.date.slice(0,7)))reason='Mês fechado';else if(!['expense','income'].includes(t.type)||t.debtId||t.pendingId||t.installmentPaymentId||t.refundOf||t.sourceId||t.receiptItems)reason='Movimento com ligação protegida';else if(t.splits&&[changes.category,changes.subcategory,changes.categoryDetail,changes.categorySubdetail].some(Boolean))reason='Divisão de categorias: editar individualmente';
   if(reason)blocked.push({id:String(id),description:t?.description||String(id),reason});else eligible.push(String(id));
  }
  return {eligible,blocked};
 }
 function forecastEvidence(d,result){
  const rows=(result.events||[]).map(e=>({...e,certainty:e.source==='Estimativa variável'||e.estimated?'estimated':'scheduled'}));
  return {rows,unknown:!result.monthlyEstimate?['Sem estimativa confirmada para despesas variáveis']:[],scheduled:rows.filter(e=>e.certainty==='scheduled'),estimated:rows.filter(e=>e.certainty==='estimated')};
 }
 function unitQuantity(value,from,to){const units={un:['count',1],kg:['mass',1],g:['mass',.001],L:['volume',1],ml:['volume',.001],cl:['volume',.01],...Object.fromEntries(['pack','caixa','garrafa','lata','frasco','saco','dose','rolo','par','m'].map(u=>[u,[u,1]]))};if(!units[from]||!units[to]||units[from][0]!==units[to][0]||!Number.isFinite(value)||value<=0)throw Error('Unidades incompatíveis.');const result=value*units[from][1]/units[to][1];if(!Number.isSafeInteger(Math.round(result*1000))||Math.abs(result*1000-Math.round(result*1000))>1e-6)throw Error('Quantidade inferior à precisão de stock.');return Math.round(result*1000)/1000;}
 function periodIndex(d){const map=new Map(),ensure=m=>{if(!map.has(m))map.set(m,{income:0,expense:0});return map.get(m);};for(const t of d.transactions)if(t.type==='income'&&!t.refundOf)ensure(t.date.slice(0,7)).income+=F.cents(t.amount);for(const t of F.expenseEntries(d))ensure(t.date.slice(0,7)).expense+=F.cents(t.amount);const balance=F.money(d.accounts.reduce((n,a)=>n+a.balance,0));return prefix=>{let income=0,expense=0;for(const [m,value]of map)if(m.startsWith(prefix)){income+=value.income;expense+=value.expense;}return {income:income/100,expense:expense/100,balance};};}
 function cashIndex(d){const names=new Set(d.accounts.map(a=>a.name)),days=new Map();const add=(date,delta)=>{if(delta===null)throw Error('Este ajuste antigo não pode ser indexado automaticamente.');days.set(date,(days.get(date)||0)+F.cents(delta));};for(const t of d.transactions){if(names.has(t.account))add(t.date,F.transactionDeltaForAccount(t,t.account));if(t.type==='transfer'&&t.transferStatus!=='pending'&&names.has(t.targetAccount))add(t.targetDate||t.date,F.transactionDeltaForAccount(t,t.targetAccount));}let value=d.accounts.reduce((n,a)=>n+F.cents(F.openingBalance(d,a)),0);const opening=value/100;const points=[...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,delta])=>({date,value:(value+=delta)/100}));return date=>{let low=0,high=points.length;while(low<high){const mid=(low+high)>>1;if(points[mid].date<=date)low=mid+1;else high=mid;}return low?points[low-1].value:opening;};}
 function priceEvidence(d,id){const c=d.casa,p=c?.catalog.find(p=>p.id===id);if(!p)throw Error('Produto não encontrado.');const rows=[];for(const purchase of c.purchases){if(purchase.date>F.today())continue;const total=purchase.items.reduce((n,i)=>n+F.cents(i.total),0);for(const item of purchase.items)if(item.catalogId===id&&item.qty>0&&total>0)rows.push({date:purchase.date,store:purchase.store,source:'Compra confirmada',unit:p.unit,per:item.total/item.qty*(purchase.total/(total/100)),purchaseId:purchase.id});}for(const h of c.priceHistory||[])if(h.catalogId===id&&h.packageQty>0&&h.date<=F.today())rows.push({date:h.date,store:c.stores.find(s=>s.id===h.storeId)?.name||'Loja histórica',source:'Preço registado',unit:p.unit,per:h.price/h.packageQty});return rows.sort((a,b)=>b.date.localeCompare(a.date));}
 const api={validateDraft,balanceChanges,bulkEligibility,forecastEvidence,unitQuantity,periodIndex,cashIndex,priceEvidence};root.ProductivityFinance=api;if(typeof module==='object')module.exports=api;
})(globalThis);
