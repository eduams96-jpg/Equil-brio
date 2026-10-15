'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const F=require('../finance.js'),C=require('../casa-model.js'),{createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
test('Link de produto: grava, preserva em edição, reabre SQLite e permite limpar',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-link-'));let db;
 try{
  const d=F.empty(),before=JSON.stringify(d.accounts),id=C.saveProduct(d,{name:'Produto',unit:'un',url:'https://example.org/produto?q=1&loja=A'});
  C.saveProduct(d,{id,name:'Produto editado',unit:'un'});
  assert.equal(C.state(d).catalog.find(p=>p.id===id).url,'https://example.org/produto?q=1&loja=A');
  db=createSqliteStorage(dir);db.writeSpace('equilibrioData',d);db.close();db=createSqliteStorage(dir);
  const reopened=db.readSpace('main').data;assert.equal(C.state(reopened).catalog[0].url,C.state(d).catalog[0].url);
  assert.equal(JSON.stringify(reopened.accounts),before);
  C.saveProduct(reopened,{id,name:'Produto editado',unit:'un',url:''});assert.equal(C.state(reopened).catalog[0].url,'');
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Link de produto: protocolos executáveis, credenciais e endereços inválidos não alteram dados',()=>{
 for(const url of ['javascript:alert(1)','file:///C:/Windows','data:text/html,test','https://user:pass@example.org','texto','https://example.org/'+ 'a'.repeat(2048)]){
  const d=F.empty(),before=JSON.stringify(d);assert.throws(()=>C.saveProductOffers(d,{name:'Produto',unit:'un',url},[]));assert.equal(JSON.stringify(d),before);
 }
 assert.equal(C.productUrl(' https://example.org '),'https://example.org/');
});
