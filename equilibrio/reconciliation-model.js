(function(root){
'use strict';
const F=typeof module==='object'&&module.exports?require('./finance.js'):root.Finance;

// Deliberately bypass normalize/migrate: a diagnosis must show the saved facts.
function diagnoseLedger(ledger) {
  const accounts = Array.isArray(ledger?.accounts) ? ledger.accounts : [];
  const transactions = Array.isArray(ledger?.transactions) ? ledger.transactions : [];
  const issues = [], seen = new Set(), names = new Set(accounts.map(a => a.name)), fingerprints=new Map();
  const totals = new Map(accounts.map(a => [a.name, { income:0, expense:0, transferIn:0, transferOut:0, adjustments:0, pending:[] }]));
  const issue = (code, transactionId, detail) => issues.push({code, transactionId, detail});
  const add = (name, field, amount) => {
    const summary = totals.get(name);
    if (!summary) return;
    summary[field] += F.cents(amount);
    if (!Number.isSafeInteger(summary[field])) issue('unsafe-total', null, name);
  };
  for (const t of transactions) {
    if (!names.has(t.account)) issue('missing-source-account', t.id, t.account);
    if (!Number.isFinite(t.amount) || t.amount < 0 || !Number.isSafeInteger(F.cents(t.amount))) { issue('invalid-amount', t.id, t.amount); continue; }
    if (!F.validDate(t.date)) issue('invalid-date', t.id, t.date);
    if(['income','expense'].includes(t.type)||t.transferStatus==='pending'){
      const token=JSON.stringify([t.account,t.type,t.observedSide||'',t.date,F.cents(t.amount),String(t.description||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()]);
      if(fingerprints.has(token))issue('possible-duplicate',t.id,fingerprints.get(token));else fingerprints.set(token,t.id);
    }
    for (const row of [t, ...(Array.isArray(t.transferEvidence) ? t.transferEvidence : [])]) {
      const key = row.id == null ? null : String(row.id);
      // The source evidence can repeat the ID of its own canonical transfer.
      if (key !== null && row !== t && key === String(t.id)) continue;
      if (key !== null && seen.has(key)) issue('duplicate-transaction-evidence', t.id, key);
      if (key !== null) seen.add(key);
    }
    if (t.type === 'transfer') {
      if (t.transferStatus === 'pending') {
        if (!['income','expense'].includes(t.observedSide) || t.targetAccount) issue('invalid-pending-transfer',t.id,t.account);
        else {
          add(t.account, t.observedSide === 'income' ? 'transferIn' : 'transferOut', t.amount);
          totals.get(t.account)?.pending.push(t.id);
          issue('pending-transfer',t.id,t.suggestedTargetAccount || 'Sem contraparte confirmada');
        }
      } else {
        if (!names.has(t.targetAccount) || t.targetAccount === t.account) issue('invalid-transfer-target',t.id,t.targetAccount);
        else { add(t.account,'transferOut',t.amount); add(t.targetAccount,'transferIn',t.amount); }
        if (t.targetDate && !F.validDate(t.targetDate)) issue('invalid-target-date',t.id,t.targetDate);
      }
    } else if (t.type === 'income') add(t.account,'income',t.amount);
    else if (t.type === 'expense') add(t.account,'expense',t.amount);
    else if (t.type === 'adjustment') {
      if (!Number.isFinite(t.delta)) issue('adjustment-without-direction',t.id,t.account);
      else add(t.account,'adjustments',t.delta);
    } else issue('invalid-transaction-type',t.id,t.type);
  }
  const summaries = accounts.map(a => {
    const x = totals.get(a.name);
    const net = x.income - x.expense + x.transferIn - x.transferOut + x.adjustments;
    const explicit = Number.isFinite(a.openingBalance);
    const calculated = explicit ? (F.cents(a.openingBalance) + net) / 100 : null;
    const difference = calculated !== null && Number.isFinite(a.balance) ? (F.cents(a.balance) - F.cents(calculated)) / 100 : null;
    if (!explicit) issue('missing-opening-balance',null,a.name);
    if (difference !== null && difference !== 0) issue('balance-cache-divergence',null,a.name);
    const confirmations = (ledger.reconciliations || []).filter(r => r.accountId === a.id || r.accountName === a.name);
    const last=confirmations.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1);
    let statementDifference=null;
    if(last&&explicit){try{statementDifference=F.money(last.actual-F.balanceAt(ledger,a,last.date));if(statementDifference)issue('unexplained-statement-difference',null,a.name);}catch{issue('statement-unavailable',null,a.name);}}
    return {id:a.id,name:a.name,openingBalance:explicit?a.openingBalance:null,
      income:x.income/100,expense:x.expense/100,transferIn:x.transferIn/100,transferOut:x.transferOut/100,
      adjustments:x.adjustments/100,net:net/100,calculatedBalance:calculated,savedBalance:a.balance,
      difference,statementDifference,pendingTransfers:x.pending,reconciliations:confirmations,
      migration:ledger.coreMigration || null};
  });
  return {readOnly:true,ledgerCoreVersion:ledger.ledgerCoreVersion || null,accounts:summaries,issues};
}
function candidates(d) {
 const pending=(d.transactions||[]).filter(t=>t.type==='transfer'&&t.transferStatus==='pending');
 const ins=new Map();for(const t of pending.filter(t=>t.observedSide==='income')){const k=F.cents(t.amount);if(!ins.has(k))ins.set(k,[]);ins.get(k).push(t);}
 const pairs=[];for(const out of pending.filter(t=>t.observedSide==='expense'))for(const incoming of ins.get(F.cents(out.amount))||[]){
  if(out.account===incoming.account||Math.abs(Date.parse(out.date)-Date.parse(incoming.date))>3*86400000||out.bankReference&&incoming.bankReference&&out.bankReference!==incoming.bankReference)continue;
  const blocked=[out,incoming].some(t=>t.reconciled||(d.closedMonths||[]).includes(t.date.slice(0,7)));
  pairs.push({outId:out.id,inId:incoming.id,from:out.account,to:incoming.account,amount:out.amount,date:out.date,targetDate:incoming.date,blocked});
 }
 const counts=new Map();for(const p of pairs)for(const id of [p.outId,p.inId])counts.set(String(id),(counts.get(String(id))||0)+1);
 return pairs.map(p=>({...p,ambiguous:counts.get(String(p.outId))>1||counts.get(String(p.inId))>1}));
}

// Uma marca antiga não prova que o saldo continua a corresponder ao extrato.
function accountState(d,a,at=F.today()) {
 const date=a.reconciledOn,statement=(d.reconciliations||[]).filter(r=>(r.accountId===a.id||r.accountName===a.name)&&r.date===date).at(-1);
 const latest=(d.transactions||[]).reduce((last,t)=>{const posted=t.account===a.name?t.date:t.targetAccount===a.name?t.targetDate||t.date:"";return posted&&posted<=at&&posted>last?posted:last;},"");
 const difference=statement?F.money(statement.actual-F.balanceAt(d,a,date)):null;
 return {date,statement,difference,latest,confirmed:!!statement&&difference===0&&(!latest||latest<=date)};
}

// A dated statement confirms a balance, never a saved display cache or an entire month.
function monthReview(d, month) {
 if(!/^\d{4}-\d{2}$/.test(month)||!F.validDate(month+'-01'))throw Error('Escolhe um mês válido.');
 const [year,m]=month.split('-').map(Number),end=month+'-'+new Date(Date.UTC(year,m,0)).getUTCDate();
 const today=F.today(),date=end>today?today:end,future=month>today.slice(0,7),complete=end<=today;
 const accounts=d.accounts.filter(a=>!a.archived||d.transactions.some(t=>t.account===a.name&&t.date.startsWith(month)||t.targetAccount===a.name&&(t.targetDate||t.date).startsWith(month))||F.cents(F.balanceAt(d,a,date))!==0).map(a=>{
  const expected=F.balanceAt(d,a,date);
  const statement=(d.reconciliations||[]).filter(r=>(r.accountId===a.id||r.accountName===a.name)&&r.date===date).at(-1);
  const difference=statement?F.money(statement.actual-expected):null;
  const confirmed=!!statement&&Number.isFinite(statement.actual)&&difference===0;
  return{id:a.id,name:a.name,expected,statement,difference,confirmed};
 });
 const transfers=d.transactions.filter(t=>t.type==='transfer'&&t.transferStatus==='pending'&&t.date<=end);
 const imports=(d.pendingImports||[]).filter(t=>!t.date||t.date<=end);
 const confirmed=accounts.filter(a=>a.confirmed).length,blockers=[];
 if(!complete)blockers.push('O mês ainda não terminou. Podes conferir os saldos até hoje.');
 if(!accounts.length)blockers.push('Adiciona uma conta antes de fechar o mês.');
 if(confirmed<accounts.length)blockers.push('Confere o saldo de '+(accounts.length-confirmed)+' conta(s) na data indicada.');
 if(transfers.length)blockers.push(transfers.length+' transferência(s) por confirmar até ao fim deste mês.');
 if(imports.length)blockers.push(imports.length+' movimento(s) importado(s) por rever até ao fim deste mês.');
 return{month,end,date,future,complete,accounts,confirmed,transfers,imports,blockers,ready:!blockers.length,closed:(d.closedMonths||[]).includes(month)};
}
function setMonthClosed(d,month,closed,budgets){
 const state=monthReview(d,month);
 if(!closed){d.closedMonths=d.closedMonths.filter(m=>m!==month);return;}
 if(state.closed)return;
 if(!state.ready)throw Error('Antes de fechar: '+state.blockers.join(' '));
 // Calculate first so that a failed calculation never leaves a partial close.
 const values=d.budgets.map(b=>[b,budgets.budgetAt(d,b,month)]);
 for(const [b,value] of values){b.frozen??={};b.frozen[month]=value;}
 d.closedMonths.push(month);
}

const api={diagnoseLedger,candidates,monthReview,setMonthClosed,accountState};if(typeof module==='object'&&module.exports)module.exports=api;else root.ReconciliationModel=Object.freeze(api);
})(globalThis);
