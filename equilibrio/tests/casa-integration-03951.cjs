const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../finance.js'),C=require('../casa-model.js'),E=require('../casa-complete-model.js'),D=require('../casa-daily-model.js'),I=require('../casa-import.js');
function fixture(){const d=F.empty(),s=C.saveStore(d,{name:'Loja A'}),other=C.saveStore(d,{name:'Loja B'}),p=C.saveProduct(d,{name:'Leite',unit:'L',category:'Laticínios'});C.setOffer(d,p,s,{packageQty:1,price:1.2});C.setOffer(d,p,other,{packageQty:2,price:2});const id=C.queueProduct(d,{catalogId:p,storeId:s,requestedQty:3});return {d,s,other,p,id};}
test('Casa loja: preço conferido persiste, talão/stock usam quantidade real e local, catálogo preservado',()=>{
 const {d,s,p,id}=fixture();E.updateShopping(d,id,{purchaseOverride:{packages:2,price:1.1},location:'Frigorífico',expiry:'2099-01-01',note:'Promoção'});C.shopping(d,'toggle',{id});
 const loaded=JSON.parse(JSON.stringify(d)),quote=C.quote(loaded,[id]);assert.equal(quote[0].total,2.2);assert.equal(quote[0].items[0].qty,2);
 C.checkout(loaded,{ids:[id],expected:JSON.stringify(quote),batchId:'store',date:F.today()});
 assert.equal(loaded.casa.stock[0].location,'Frigorífico');assert.equal(loaded.casa.stock[0].expiry,'2099-01-01');assert.equal(loaded.casa.stock[0].qty,2);assert.equal(loaded.casa.catalog.find(x=>x.id===p).offers[s].price,1.2);assert.equal(loaded.transactions.length,0);
});
test('Casa loja: mudar loja elimina preço temporário; não encontrado retira do carrinho sem apagar',()=>{
 const {d,id,other}=fixture();E.updateShopping(d,id,{purchaseOverride:{packages:1,price:.9}});C.shopping(d,'toggle',{id});E.updateShopping(d,id,{notFound:true});assert.equal(d.casa.shopping[0].done,false);assert.equal(d.casa.shopping.length,1);
 E.updateShopping(d,id,{storeId:other});assert.equal(d.casa.shopping[0].purchaseOverride,undefined);C.shopping(d,'toggle',{id});assert.equal(d.casa.shopping[0].notFound,false);assert.equal(C.quote(d,[id])[0].total,4);
});
test('Casa loja: valores inválidos e embalagem alterada são recusados sem compra parcial',()=>{
 const {d,id,p,s}=fixture();const before=JSON.stringify(d);for(const input of [{purchaseOverride:{packages:1.5,price:1}},{purchaseOverride:{packages:1,price:-1}},{expiry:'invalida'},{storeId:'missing'}])assert.throws(()=>E.updateShopping(d,id,input));assert.equal(JSON.stringify(d),before);
 E.updateShopping(d,id,{purchaseOverride:{packages:1,price:1}});C.shopping(d,'toggle',{id});C.setOffer(d,p,s,{packageQty:2,price:2});assert.throws(()=>C.quote(d,[id]),/embalagem mudou/);assert.equal(d.casa.purchases.length,0);
});
test('Casa listas: artigos livres e produtos reutilizam sem duplicar nem alterar stock',()=>{
 const {d,id}=fixture();C.shopping(d,'add',{name:'Guardanapos',qty:'2 pacotes'});const list=D.saveList(d,'Fim de semana');assert.equal(d.casa.lists[0].items.length,2);C.shopping(d,'remove',{id});C.shopping(d,'remove',{id:d.casa.shopping[0].id});D.useList(d,list);D.useList(d,list);assert.equal(d.casa.shopping.length,2);assert.equal(d.casa.shopping.find(r=>r.name==='Guardanapos').qty,'2 pacotes');assert.equal(d.casa.stock.length,0);
});
function source(){return {version:'0.3.0',data:{items:[{id:'stock',catalogId:'water',name:'Água',unit:'pack',qty:1.5,closedPacks:1,looseUnits:3,location:'Garagem'}],shopping:[],history:[],recipes:[],catalog:[{id:'water',name:'Água',unit:'pack',packSize:6,innerAmount:1.5,innerUnit:'L',storePrices:{a:3},storeQtys:{a:1},brand:'Marca',notes:'Sem gás'}],stores:[{id:'a',name:'Loja A'}],specialLists:[{id:'list',name:'Férias',items:['Água','Guardanapos','Guardanapos']}],receipts:[]}};}
test('Casa v0.3.0: importa listas especiais, marca, notas e embalagens sem duplicar stock',async()=>{
 const payload=source(),before=JSON.stringify(payload),r=await I.prepare(payload,'2026-09-21');assert.equal(JSON.stringify(payload),before);assert.equal(r.ledger.casa.stock[0].qty,13.5);assert.deepEqual(r.ledger.casa.stock[0].packaging,{size:9,closed:1});assert.equal(r.ledger.casa.stock[0].opened,true);assert.equal(r.ledger.casa.catalog[0].brand,'Marca');assert.equal(r.ledger.casa.lists[0].items.length,2);D.useList(r.ledger,r.ledger.casa.lists[0].id);assert.equal(r.ledger.casa.shopping.length,2);assert.equal(r.ledger.transactions.length,0);assert.equal(r.ledger.casa.imports[0].version,'0.3.0');F.normalize(r.ledger);
});
test('Casa importação: versão desconhecida/lista malformada não altera origem',async()=>{
 const p=source();p.data.specialLists[0].items=[{name:'Objeto inesperado'}];const before=JSON.stringify(p);await assert.rejects(()=>I.prepare(p,'2026-09-21'),/lista especial/);assert.equal(JSON.stringify(p),before);await assert.rejects(()=>I.prepare({...source(),version:'0.3.1'},'2026-09-21'));
});
test('Casa SQLite: carrinho, preço conferido e listas sobrevivem a reabertura e restauro',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'casa051-'));let db;
 try{const {d,id}=fixture();E.updateShopping(d,id,{purchaseOverride:{packages:2,price:1.05},location:'Frigorífico',note:'Conferido'});D.saveList(d,'Semana');db=createSqliteStorage(dir);db.writeSpace('equilibrioData',d);const snap=db.readState();db.close();db=createSqliteStorage(dir);assert.deepEqual(db.readSpace('main').data.casa,d.casa);db.writeState(snap);assert.deepEqual(db.readSpace('main').data.casa,d.casa);}finally{db?.close();if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('casa051-'))fs.rmSync(dir,{recursive:true,force:true});}
});
