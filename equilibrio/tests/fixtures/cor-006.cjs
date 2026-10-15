'use strict';
const path=require('node:path'),root=path.resolve(__dirname,'../..');
const F=require(path.join(root,'finance.js')),P=require(path.join(root,'features-model.js')),Q=require(path.join(root,'complete-model.js')),C=require(path.join(root,'casa-model.js')),E=require(path.join(root,'casa-complete-model.js')),Pr=require(path.join(root,'practical-model.js')),R=require(path.join(root,'reconciliation-model.js')),{validateLedger}=require(path.join(root,'desktop/ledger-validation.cjs'));
function ledger(){const d=F.empty();d.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:100,openingBalance:100}];F.migrateLedgerCore(d);return d;}
function refund(mode='normal',stock=false){
 const d=ledger(),date='2026-10-08';d.spaceName='COR-006';
 let purchaseId='purchase',lotId='';
 if(stock){const product=C.saveProduct(d,{name:'Artigo sintético',unit:'un',category:'Casa'}),store=C.saveStore(d,{name:'Loja sintética'});C.setOffer(d,product,store,{packageQty:1,price:5});const item=C.queueProduct(d,{catalogId:product,storeId:store,requestedQty:2});C.shopping(d,'toggle',{id:item});purchaseId=C.checkout(d,{ids:[item],batchId:'stock-batch',date,account:'Banco',category:'Casa',expected:JSON.stringify(C.quote(d,[item]))})[0];lotId=d.casa.stock[0].id;}
 else C.addPurchase(d,{id:purchaseId,date,store:'Loja sintética',items:[{name:'Artigo',total:10}],account:'Banco',category:'Casa'});
 E.returnPurchase(d,{id:'return',purchaseId,date,amount:2,qty:stock?1:0,lotId,note:'Reembolso sintético'});
 const t=d.transactions.find(t=>t.source==='Casa reembolso');
 const s=Q.statement(d,[{date,type:'income',account:'Banco',amount:2,description:'Reembolso no extrato',category:'Casa'}],'Extrato sintético');Q.resolve(d,s.id,s.rows[0].id,'link',t.id);
 if(['reconciled','both','closed'].includes(mode))t.reconciled=true;
 if(['account','both','closed','account-earlier'].includes(mode))P.reconcile(d,'bank',mode==='account-earlier'?'2026-10-07':date,mode==='account-earlier'?100:92,false);
 if(mode==='closed')d.closedMonths.push('2026-10');
 if(mode==='shared')d.sharedExpenses.push({id:'shared',transactionId:t.id,description:'Partilha',amount:2,participants:[]});
 return {d:validateLedger(d),refundId:t.id,purchaseId,lotId};
}
function equipment(pay=true){const d=ledger();const e=Pr.saveEquipment(d,{id:'equipment',name:'Máquina sintética',date:'2099-01-01',cost:10,notes:''});Pr.scheduleEquipment(d,e.id,'Banco');const pendingId=e.pendingId,reserveId=e.reserveId;if(!pay)return {d:validateLedger(d),equipmentId:e.id,interventionId:null,paymentId:null,pendingId,reserveId};const t=Q.partial(d,pendingId,10,'2026-10-08');const i=Pr.addIntervention(d,{equipmentId:e.id,date:'2026-10-08',description:'Intervenção sintética',cost:10,transactionId:t.id});return {d:validateLedger(d),equipmentId:e.id,interventionId:i.id,paymentId:t.id,pendingId,reserveId};}
function summary(d){const a=d.accounts[0],st=R.accountState(d,a,'2026-10-08');return {balance:a.balance,cents:F.cents(a.balance),openingBalance:a.openingBalance,transactions:d.transactions.length,returns:d.casa?.returns?.length||0,reconciledOn:a.reconciledOn||null,accountConfirmed:st.confirmed,statementDifference:st.difference,statementRow:d.statements[0]?.rows[0]||null,diagnostic:R.diagnoseLedger(d).issues};}
module.exports={F,P,Q,C,E,Pr,R,validateLedger,refund,equipment,summary};



