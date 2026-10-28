'use strict';
// Only records whose entire shape is represented by the mobile form are editable.
const represented=new Set(['id','type','amount','date','description','account','targetAccount','targetDate','category','note','beneficiary','noteColor','tags','expenseNature']);
function editable(t){return !!t&&Object.keys(t).every(k=>represented.has(k))&&['income','expense','transfer'].includes(t.type)&&!t.refundOf&&!t.debtId&&!t.pendingId&&!t.installmentPaymentId&&!t.reconciled&&!(Array.isArray(t.splits)&&t.splits.length)&&t.transferStatus!=='pending'&&!(t.type==='transfer'&&t.targetDate&&t.targetDate!==t.date);}
module.exports={editable};
