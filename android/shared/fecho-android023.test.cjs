'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('./protocol.cjs'),HF=require('./house-form.cjs'),Recovery=require('./recovery.cjs'),{Client}=require('./client.cjs'),{SqliteStore}=require('../server/sqlite-store.cjs'),{createDesktopBridge}=require('../server/desktop-bridge.cjs');
const F=require('../../equilibrio/finance.js'),Casa=require('../../equilibrio/casa-model.js'),Gifts=require('../../equilibrio/gifts-model.js'),Dossiers=require('../../equilibrio/dossiers-model.js');
function form(offers){return{id:'product023',seed:'seed023',changedOn:'2026-10-28',command:'house.product',mode:'create',name:'Café',brand:'Marca',category:'Alimentação',sub1:'Mercearia',sub2:'Café',sub3:'Moído',unit:'g',url:'',offers};}
test('Oferta sem preço já admitida no Windows continua editável no Android; URL por loja preservado',()=>{
 const d=P.fixture();
 const p=HF.payload(form([{storeName:'Loja por confirmar',packageQty:'',price:'',url:'https://example.org/cafe'}]));
 P.apply(d,'house.product',p);
 const product=d.casa.catalog.find(x=>x.id===p.id),offer=Object.values(product.offers)[0];
 assert.equal(offer.price,0);assert.equal(offer.url,'https://example.org/cafe');assert.equal(product.category,'Alimentação / Mercearia / Café / Moído');
 const edit={...form([{storeName:'Loja por confirmar',packageQty:'',price:'0',url:offer.url}]),mode:'update',name:'Café revisto'};
 P.apply(d,'house.product',HF.payload(edit));assert.equal(Object.values(d.casa.catalog[0].offers)[0].price,0);
});
test('Oferta incompleta com preço inválido ou sem supermercado não é silenciosamente ignorada',()=>{
 for(const offer of [{storeName:'Loja',packageQty:'1',price:'-1'},{storeName:'Loja',packageQty:'1',price:'1,'},{storeName:'',packageQty:'',price:'',url:'https://example.org/produto'}])assert.throws(()=>HF.payload(form([offer])));
});
test('Windows atual: preferências, avisos, tutorial e planeamento anual de prendas sobrevivem a sync, reabertura SQLite, cópia e restauro',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-android023-'));const bridge=createDesktopBridge(path.join(temp,'pc'));let store;
 t.after(async()=>{store?.close();await bridge.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 const d=bridge.desktop.readSpace('main').data;
 Dossiers.saveNoticePreferences(d,{enabled:{payments:true,warranties:false,food:true,routines:true,dossiers:false},days:{payments:12,warranties:30,food:5,routines:14,dossiers:90},urgentDays:2});d.practical.entryTips=false;
 Gifts.saveTarget(d,{person:'Ana',occasion:'Aniversário',year:2027,date:'2027-04-12',budget:75});
 Casa.saveProductOffers(d,{name:'Produto sem preço',unit:'un',category:'Outros'},[{storeName:'Loja futura',url:'https://example.org/loja'}]);
 const expected=P.copy(d.practical);bridge.desktop.writeSpace('equilibrioData',d);bridge.refresh();
 const url=await bridge.listen(),token=bridge.provision('phone023',['main']);
 const request=async(method,p,body)=>{const r=await fetch(url+p,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(r.status>=400)throw Error(data.message||String(r.status));return data;};
 store=new SqliteStore(path.join(temp,'phone.db'),P.local(await request('GET','/api/v1/spaces/main/bootstrap'),'phone023'));
 const client=new Client(store,request,{negotiate:true});
 await client.enqueue('movement.add',{id:'movement023',description:'Ensaio após configurações',type:'expense',amountCents:125,date:'2026-10-28',accountId:'bank',category:'Outros'});await client.sync();
 assert.deepEqual(bridge.desktop.readSpace('main').data.practical,expected);assert.deepEqual(store.read().state.confirmed.ledger.practical,expected);
 // Nova alteração no PC, recebida com uma proposta local pendente sem apagar os campos novos.
 const next=bridge.desktop.readSpace('main').data;next.practical.entryTips=true;Gifts.saveTarget(next,{person:'Bruno',occasion:'Natal',year:2028,budget:30});bridge.desktop.writeSpace('equilibrioData',next);
 await client.sync();assert.deepEqual(store.read().state.confirmed.ledger.practical,next.practical);
 const before=store.read();store.close();store=new SqliteStore(path.join(temp,'phone.db'));assert.deepEqual(store.read(),before);
 const restored=await Recovery.decrypt(await Recovery.encrypt(before.state,'Ensaio-023-seguro'),'Ensaio-023-seguro');assert.deepEqual(restored,before.state);
 const portable=Recovery.portable(restored,P.offlineFixture('new-phone023'));assert.deepEqual(portable.confirmed.ledger.practical,next.practical);assert.deepEqual(portable.confirmed.ledger.casa,restored.confirmed.ledger.casa);
 const after=bridge.desktop.readSpace('main').data;assert.equal(after.transactions.length,1);assert.equal(after.accounts.find(a=>a.id==='bank').balance,d.accounts.find(a=>a.id==='bank').balance-1.25);
});
