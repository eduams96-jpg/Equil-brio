const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../finance.js');
const C = require('../casa-model.js');
const R = require('../receipt-model.js');

function ledger() {
  const d = F.empty();
  d.accounts = [{id:'bank',name:'Banco',type:'Conta',balance:100}];
  return d;
}
function draft(overrides={}) {
  return {
    store:'Mercado',date:F.today(),total:5.5,account:'Banco',category:'Alimentação',
    items:[
      {name:'Arroz',total:3,stock:true,catalogId:'',unit:'kg',packages:2,packageQty:.5,productCategory:'Alimentação'},
      {name:'Saco',total:2.5,stock:false},
    ],...overrides,
  };
}

test('OCR Casa: leitura continua a ser uma proposta, sem tocar no estado', () => {
  const d=ledger(),before=JSON.stringify(d);
  const parsed=R.parse('Mercado\nARROZ 2 x 1,50 3,00\nSACO 2,50\nTOTAL 5,50');
  assert.equal(parsed.total,5.5);
  assert.equal(parsed.items.length,2);
  assert.equal(JSON.stringify(d),before);
});

test('OCR Casa: confirmação guarda compra, preço, stock e apenas um débito', () => {
  const d=ledger();
  const product=C.saveProduct(d,{name:'Arroz',category:'Mercearia',unit:'kg'});
  const input=draft();input.items[0].catalogId=product;
  const id=C.addReceiptPurchase(d,input);
  const p=d.casa.purchases.find(row=>row.id===id);
  assert.equal(d.casa.version,4);
  assert.equal(d.casa.stores.length,1);
  assert.equal(p.items.length,2);
  assert.equal(p.items[0].catalogId,product);
  assert.equal(p.items[0].qty,1);
  assert.equal(p.items[0].price,1.5);
  assert.equal(p.items[1].catalogId,undefined);
  assert.equal(d.casa.stock.length,1);
  assert.equal(d.casa.stock[0].purchaseId,id);
  assert.equal(d.casa.priceHistory.length,1);
  assert.equal(d.transactions.length,1);
  assert.equal(d.accounts[0].balance,94.5);
  assert.equal(p.transactionId,d.transactions[0].id);
  F.normalize(d);
});

test('OCR Casa: associação posterior a despesa existente não volta a debitar', () => {
  const d=ledger();
  const t=F.add(d,{date:F.today(),description:'Mercado',type:'expense',amount:5.5,account:'Banco',category:'Alimentação'});
  const id=C.addReceiptPurchase(d,draft({account:''}));
  assert.equal(d.accounts[0].balance,94.5);
  assert.equal(d.casa.purchases[0].transactionId,undefined);
  C.attachMovement(d,id,t.id);
  assert.equal(d.accounts[0].balance,94.5);
  assert.equal(d.casa.purchases[0].transactionId,t.id);
  assert.equal(d.transactions.length,1);
  F.normalize(d);
});

test('OCR Casa: soma, mês fechado e preço por embalagem incoerentes falham sem alterações', () => {
  const d=ledger();
  for(const input of [
    draft({total:6}),
    draft({items:[{name:'A',total:2.51,stock:true,unit:'un',packages:2,packageQty:1,productCategory:'Casa'},{name:'B',total:2.99,stock:false}]}),
  ]) {
    const before=JSON.stringify(d);
    assert.throws(()=>C.addReceiptPurchase(d,input));
    assert.equal(JSON.stringify(d),before);
  }
  d.closedMonths=[F.today().slice(0,7)];
  const before=JSON.stringify(d);
  assert.throws(()=>C.addReceiptPurchase(d,draft()),/mês aberto/);
  assert.equal(JSON.stringify(d),before);
});

test('OCR Casa: produto arquivado e conta inválida não deixam compra parcial', () => {
  const d=ledger();
  const id=C.saveProduct(d,{name:'Arroz',category:'Mercearia',unit:'kg',archived:true});
  let input=draft();input.items[0].catalogId=id;
  let before=JSON.stringify(d);
  assert.throws(()=>C.addReceiptPurchase(d,input),/arquivado/);
  assert.equal(JSON.stringify(d),before);
  input=draft({account:'Conta ausente'});input.items[0].name='Massa';
  before=JSON.stringify(d);
  assert.throws(()=>C.addReceiptPurchase(d,input),/conta ativa/);
  assert.equal(JSON.stringify(d),before);
});
