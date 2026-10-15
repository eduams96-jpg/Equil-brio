(function(root){
'use strict';
const C=root.CasaFinance||(typeof require==='function'?require('./casa-model.js'):null);
const F=root.Finance||(typeof require==='function'?require('./finance.js'):null),excluded=new Set(['accounts','activity','trash','imports','categoryCatalog','categoryArchive','providerIcons','wealthHistory','closedMonths','monthReviews','monthlyConclusions','savedViews','importProfiles']);
const clone=v=>structuredClone(v),moneySum=d=>F.money(d.accounts.reduce((n,a)=>n+F.cents(a.balance),0)/100);
function refs(value,out=new Set()){if(!value||typeof value!=='object')return out;for(const [k,v]of Object.entries(value)){if(k==='id')continue;if(k==='offers'&&v&&typeof v==='object')Object.keys(v).forEach(id=>out.add(id));if(typeof v==='string'&&(/(Id|Of)$/.test(k)||['linkedTransaction','transaction','linkedMovement'].includes(k)))out.add(v);else if(Array.isArray(v)&&/Ids$/.test(k))v.forEach(id=>out.add(String(id)));else if(v&&typeof v==='object')refs(v,out);}return out;}
function names(value,out=new Set()){if(!value||typeof value!=='object')return out;for(const [k,v]of Object.entries(value)){if(['account','targetAccount','accountName'].includes(k)&&typeof v==='string'&&v)out.add(v);else if(v&&typeof v==='object')names(v,out);}return out;}
function nodes(d){const rows=[];function add(domain,list){list.forEach((value,index)=>{if(value&&typeof value==='object')rows.push({domain,index,value,id:value.id==null?null:String(value.id),refs:new Set([...refs(value),...(domain==='transactions'?(value.installmentCredits||[]).map(c=>String(c.id)):[])]),accounts:names(value)});});}for(const [k,v]of Object.entries(d)){if(Array.isArray(v)&&!excluded.has(k))add(k,v);else if(['casa','practical'].includes(k)&&v)for(const [sub,list]of Object.entries(v))if(Array.isArray(list))add(k+'.'+sub,list);}return rows;}
// Payment IDs belong to their plan; they are not independent records to move.
function ownedIds(n){return [n.id,...(n.domain==='installmentPlans'?(n.value.payments||[]).map(p=>String(p.id)):[])].filter(Boolean);}
function cardLinks(d){
 const owners=new Map(),topIds=new Set([...(d.accounts||[]),...nodes(d).map(n=>n.value)].filter(r=>r.id!=null).map(r=>String(r.id)));
 for(const plan of d.installmentPlans||[]){
  const card=d.accounts.find(a=>String(a.id)===String(plan.cardId));
  const purchase=d.transactions.find(t=>String(t.id)===String(plan.transactionId));
  if(!card||card.type!=='Cartão'||!purchase||purchase.type!=='expense'||purchase.account!==card.name)
   throw Error('Ligação do plano ao cartão ou à compra inválida. Revê antes de mover.');
  for(const part of plan.payments||[]){const id=part.id==null?'':String(part.id);if(!id||owners.has(id)||topIds.has(id))throw Error('Identificador de parcela repetido ou inválido.');owners.set(id,{plan,card});}
 }
 for(const t of d.transactions||[]){
  if(t.installmentPaymentId!=null){const owner=owners.get(String(t.installmentPaymentId));if(!owner||t.type!=='transfer'||t.targetAccount!==owner.card.name||t.account===owner.card.name)throw Error('Ligação do pagamento à prestação inválida. Revê antes de mover.');}
  for(const credit of t.installmentCredits||[]){const owner=owners.get(String(credit.id));if(!owner||String(t.refundOf)!==String(owner.plan.transactionId))throw Error('Ligação do reembolso à parcela inválida. Revê antes de mover.');}
 }
 return owners;
}
function list(d,domain){const [a,b]=domain.split('.');return b?(d[a]??={})[b]??=[]:d[a]??=[];}
function remap(v,map,accountIds){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(['account','targetAccount','accountName'].includes(k)&&typeof x==='string'&&map[x])v[k]=map[x];else if(['accountId','cardId'].includes(k)&&accountIds[x])v[k]=accountIds[x];else if(x&&typeof x==='object')remap(x,map,accountIds);}}
function prepare(source,target,options={}){
 const a=F.normalize(clone(source)),b=F.normalize(clone(target)),beforeSource=moneySum(a),beforeTarget=moneySum(b),all=nodes(a),picked=new Set(),kind=options.kind||'movement',ids=new Set((options.ids||[]).map(String)),moving=kind==='account'?a.accounts.filter(x=>ids.has(String(x.id))):[];
 cardLinks(a);cardLinks(b);
 if(!ids.size||!['movement','credit','account'].includes(kind))throw Error('Seleciona registos para mover.');if(kind==='account'&&moving.length!==ids.size)throw Error('Conta inexistente.');
 for(const n of all)if(kind==='movement'&&n.domain==='transactions'&&ids.has(n.id)||kind==='credit'&&n.domain==='debts'&&ids.has(n.id)||kind==='account'&&moving.some(ac=>n.accounts.has(ac.name)||n.value.accountId===ac.id||n.refs.has(String(ac.id))))picked.add(n);
 if(kind!=='account'&&[...picked].length!==ids.size)throw Error('Registo inexistente.');
 // Follow references in both directions until the entire connected group is included.
 const byId=new Map();for(const n of all)for(const id of ownedIds(n)){if(!byId.has(id))byId.set(id,[]);byId.get(id).push(n);}const inbound=new Map();for(const n of all)for(const id of n.refs){if(!inbound.has(id))inbound.set(id,[]);inbound.get(id).push(n);}
 const queue=[...picked];for(let i=0;i<queue.length;i++){const n=queue[i];for(const x of [...n.refs].flatMap(id=>byId.get(id)||[]).concat(ownedIds(n).flatMap(id=>inbound.get(id)||[])))if(!picked.has(x)){picked.add(x);queue.push(x);}}
 const tx=[...picked].filter(n=>n.domain==='transactions');for(const n of tx){const t=n.value;if(t.reconciled||[t.date,t.targetDate].filter(Boolean).some(date=>(a.closedMonths||[]).some(m=>date.startsWith(m))||(b.closedMonths||[]).some(m=>date.startsWith(m))))throw Error('Há movimentos reconciliados ou num mês fechado. Reabre/confere essas proteções antes de mover.');if(t.transferStatus==='pending')throw Error('Confirma primeiro as transferências pendentes do conjunto.');}
 for(const ac of moving)if(refs(a.practical?.autonomy).has(String(ac.id)))throw Error('Esta conta está selecionada no mapa de autonomia. Retira-a dessa seleção antes de mover a conta completa.');
 const required=new Set([...picked].flatMap(n=>[...n.accounts,...a.accounts.filter(ac=>n.refs.has(String(ac.id))).map(ac=>ac.name)]));moving.forEach(ac=>required.add(ac.name));const map=Object.create(null),accountIds=Object.create(null);for(const name of required){const old=a.accounts.find(ac=>ac.name===name);if(!old)throw Error('Conta de origem em falta: '+name);const selected=options.accountMap?.[name];if(moving.includes(old)){const newName=selected||name;if(b.accounts.some(ac=>ac.name.toLocaleLowerCase('pt')===newName.toLocaleLowerCase('pt')))throw Error('A conta movida já existe no destino: '+newName);if(b.accounts.some(ac=>ac.id===old.id))throw Error('Identificador da conta já existe no destino.');const newAccount={...clone(old),name:newName};b.accounts.push(newAccount);a.accounts=a.accounts.filter(ac=>ac.id!==old.id);map[name]=newName;accountIds[old.id]=old.id;}else{const dest=b.accounts.find(ac=>String(ac.id)===String(selected)||ac.name===selected);if(!dest)throw Error('Mapeia a conta '+name+' para uma conta do destino.');map[name]=dest.name;accountIds[old.id]=dest.id;}}
 for(const n of picked)if(n.domain==='installmentPlans'){
  // Complete accounts have already moved; the mapped ID still identifies them.
  const dest=b.accounts.find(ac=>String(ac.id)===String(accountIds[n.value.cardId]));
  if(!dest||dest.type!=='Cartão')throw Error('Mapeia o plano para uma conta de tipo Cartão válida.');
 }
 const targetPaymentIds=cardLinks(b),targetTopIds=new Set([...b.accounts,...nodes(b).map(n=>n.value)].filter(r=>r.id!=null).map(r=>String(r.id)));
 for(const n of picked)for(const nested of ownedIds(n).slice(1))if(targetPaymentIds.has(nested)||targetTopIds.has(nested))throw Error('Colisão de identificador de parcela no destino.');
 for(const n of picked)if(n.id&&targetPaymentIds.has(n.id))throw Error('Colisão de identificador com parcela do destino.');
 for(const domain of ['casa','practical'])if([...picked].some(n=>n.domain.startsWith(domain+'.'))&&!b[domain]){b[domain]={version:a[domain].version};for(const [key,value]of Object.entries(a[domain]))if(Array.isArray(value))b[domain][key]=[];if(domain==='practical')b[domain].autonomy=null;}
 const groups=new Map();for(const n of picked){if(!groups.has(n.domain))groups.set(n.domain,[]);groups.get(n.domain).push(n);}for(const [domain,rows]of groups){const targetList=list(b,domain),seen=new Set(targetList.filter(r=>r.id!=null).map(r=>String(r.id)));for(const n of rows){if(n.id&&seen.has(n.id))throw Error('O destino já contém um registo do conjunto: '+domain+' / '+n.id);const value=clone(n.value);remap(value,map,accountIds);targetList.push(value);if(n.id)seen.add(n.id);}const removed=new Set(rows.map(n=>n.index)),original=list(a,domain);const [p,q]=domain.split('.');if(q)a[p][q]=original.filter((_,i)=>!removed.has(i));else a[p]=original.filter((_,i)=>!removed.has(i));}
 // Category definitions and provider icons are supporting metadata, retained at source.
 for(const domain of ['categoryCatalog','categoryArchive','providerIcons']){const dest=list(b,domain);for(const r of a[domain]||[]){const same=dest.find(x=>r.id!=null&&x.id===r.id||r.name&&x.name===r.name);if(same){if(JSON.stringify({...same,id:undefined})!==JSON.stringify({...r,id:undefined})&&domain==='categoryCatalog')throw Error('Categorias incompatíveis no destino: '+(r.name||r.id));}else dest.push(clone(r));}}
 cardLinks(a);cardLinks(b);
 F.refreshBalances(a);F.refreshBalances(b);const before=F.money(beforeSource+beforeTarget),after=F.money(moneySum(a)+moneySum(b));if(F.cents(before)!==F.cents(after))throw Error('A passagem não conserva o saldo conjunto.');
 const batch=F.id(),at=new Date().toISOString();for(const [ledger,side]of [[a,'source'],[b,'target']])ledger.activity.push({id:F.id(),date:F.today(),at,message:'Passagem entre espaços — '+(side==='source'?'saída':'entrada'),changes:[...groups].flatMap(([domain,rows])=>rows.map(n=>({kind:side==='source'?'deleted':'created',collection:domain,id:n.value.id,name:n.value.description||n.value.name||domain}))),action:'Passagem entre espaços',kind:'space-transfer',batchId:batch,side,records:picked.size,movements:tx.length});
 const normalizedSource=F.normalize(a),normalizedTarget=F.normalize(b);if(C?.validate){C.validate(normalizedSource);C.validate(normalizedTarget);}
 return {source:normalizedSource,target:normalizedTarget,summary:{kind,accounts:moving.length,records:picked.size,movements:tx.length,groups:[...groups].map(([domain,rows])=>({domain,count:rows.length})),balances:{sourceBefore:beforeSource,sourceAfter:moneySum(a),targetBefore:beforeTarget,targetAfter:moneySum(b),totalBefore:before,totalAfter:after},accountMap:map,recordsPreview:tx.slice(0,100).map(n=>({id:n.id,date:n.value.date,description:n.value.description,amount:n.value.amount})),batchId:batch}};
}
const api={prepare};root.SpaceTransfer=api;if(typeof module==='object')module.exports=api;
})(globalThis);

