'use strict';
const F=require('../../finance.js');
const types=['Banco','Dinheiro','Poupança','Cartão'];
const key=s=>String(s).normalize('NFC').toLocaleLowerCase('pt-PT').trim().replace(/\s+/g,' ');
function requirements(ledger,command,p){
 if(!['account.add','account.update','account.archive'].includes(command))throw Error('Comando de conta indisponível.');
 if(command==='account.add'&&ledger.accounts.some(a=>a.id===p.id))throw Error('Esta conta já existe.');
 if(command!=='account.add'&&!ledger.accounts.some(a=>a.id===p.id))throw Error('A conta já não existe.');
 return ['accounts','account:'+p.id];
}
function apply(ledger,command,p){
 requirements(ledger,command,p);
 const account=ledger.accounts.find(a=>a.id===p.id);
 if(command==='account.archive'){
  if(typeof p.archived!=='boolean')throw Error('Estado da conta inválido.');
  F.setAccountArchived(ledger,p.id,p.archived);return;
 }
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80||/[\u0000-\u001f]/.test(p.name))throw Error('Indica um nome de conta até 80 caracteres.');
 if(!types.includes(p.type)&&!(command==='account.update'&&p.type===account.type))throw Error('Tipo de conta indisponível.');
 if(ledger.accounts.some(a=>a.id!==p.id&&key(a.name)===key(p.name)))throw Error('Já existe uma conta com este nome, incluindo as arquivadas.');
 if(command==='account.add'){
  if(!Number.isSafeInteger(p.openingCents)||Math.abs(p.openingCents)>9999999999)throw Error('Saldo inicial inválido em cêntimos.');
  ledger.accounts.push({id:p.id,name:p.name.trim(),type:p.type,openingBalance:p.openingCents/100,balance:p.openingCents/100});
 }else{
  if(Object.hasOwn(p,'openingCents')||Object.hasOwn(p,'balance'))throw Error('A edição mantém o saldo inicial e os movimentos.');
  F.renameAccountReferences(ledger,account.name,p.name.trim());account.name=p.name.trim();account.type=p.type;
 }
 F.refreshBalances(ledger);
}
function openingCents(value){if(typeof value!=='string'||!/^[-+]?\d{1,8}([.,]\d{1,2})?$/.test(value.trim()))throw Error('Indica o saldo com até duas casas decimais.');const n=F.cents(Number(value.trim().replace(',','.')));if(!Number.isSafeInteger(n)||Math.abs(n)>9999999999)throw Error('Saldo inicial inválido.');return n;}
module.exports={types,requirements,apply,openingCents};
