'use strict';
const F=require('../../finance.js'),P=require('../../features-model.js'),C=require('../../complete-model.js');
const attachment={name:'prova.png',type:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
function paired(){const d=F.empty();d.accounts=[{id:'b',name:'Banco',type:'Banco',balance:1000},{id:'p',name:'Poupança',type:'Poupança',balance:0}];F.migrateLedgerCore(d);for(const [id,type,account,date]of [['out','expense','Banco','2026-08-01'],['in','income','Poupança','2026-08-02']])F.importTransaction(d,{id,type,account,date,amount:100,description:'TRF',category:'Transferências'},{reconcile:false});P.pairTransfer(d,'out','in');return d;}
function cards(){const a=F.empty(),b=F.empty();a.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:1000},{id:'ca',name:'Cartão A',type:'Cartão',balance:0}];b.accounts=[{id:'bankB',name:'Banco B',type:'Banco',balance:1000},{id:'cb',name:'Cartão B',type:'Cartão',balance:0}];F.migrateLedgerCore(a);F.migrateLedgerCore(b);const plan=C.purchase(a,{cardId:'ca',amount:100,count:2,date:'2026-08-01',firstDue:'2026-08-10',description:'Compra cartão',category:'Casa'});a.transactions[0].attachment=structuredClone(attachment);a.transactions[0].note='Preservar';const payment=C.payCard(a,'ca','bank',40,'2026-08-10',0,plan.id,plan.payments[0].id);return {a,b,plan,payment,options:{ids:[plan.transactionId],accountMap:{Banco:'bankB','Cartão A':'cb'}}};}
module.exports={paired,cards,attachment};


