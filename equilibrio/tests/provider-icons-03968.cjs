'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),I=require('../provider-icons.js'),F=require('../finance.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('Ícones: associação exata, acentos e espaços, sem coincidências parciais',()=>{
 assert.equal(I.resolve(' DIGI ').kind,'digi');assert.equal(I.resolve('Spotify').kind,'spotify');
 assert.equal(I.resolve('Digi falso').kind,'initial');assert.equal(I.resolve('Meu Spotify').kind,'initial');
 const rows=[{id:'p',name:'Água municipal',image:png}];assert.equal(I.resolve('agua municipal',rows).image,png);
});
test('Ícones: imagens locais e nomes são validados antes de aceitar o restauro',()=>{
 for(const image of ['https://evil.test/logo.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,xxx',png+'A'.repeat(65536)])assert.throws(()=>F.normalize({...F.empty(),providerIcons:[{id:'x',name:'Fornecedor',image}]}),/Ícone/);
 assert.throws(()=>I.validate([{name:'Água',image:''},{name:'agua',image:''}]),/Ícone/);
 assert.throws(()=>I.validate([{name:'Spotify',image:'',initialOnly:'false'}]),/Ícone/);
});
test('Ícones: normalização e cópia preservam imagens e saldos; espaços mantêm configurações próprias',()=>{
 const original=F.empty();original.accounts=[{id:'a',name:'Banco',type:'Banco',balance:100}];F.migrateLedgerCore(original);
 const before=structuredClone(original.accounts);original.providerIcons=[{id:'p',name:'Spotify',image:png}];
 const copy=F.normalize(JSON.parse(JSON.stringify(original)));assert.deepEqual(copy.providerIcons,original.providerIcons);assert.deepEqual(copy.accounts,before);
 assert.equal(I.resolve('Spotify',copy.providerIcons).kind,'image');assert.equal(I.resolve('Spotify',F.empty().providerIcons).kind,'spotify');
});
test('Ícones: HTML escapa o nome e a opção de iniciais substitui o símbolo incluído',()=>{
 assert.equal(I.resolve('DIGI',[{name:'DIGI',image:'',initialOnly:true}]).kind,'initial');
 assert.equal(I.resolve('DIGI',[{name:'DIGI',image:'',initialOnly:false}]).kind,'digi');
 assert.doesNotMatch(I.html('<script>',[]),/<script>/);assert.match(I.html('<script>',[]),/&lt;/);
});
