'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../finance.js'),C=require('../casa-model.js');
test('Catálogo: cabeçalhos em B2, linhas vazias e links da Marca não deslocam as colunas',()=>{
 const rows=C.catalogTableRows([{values:['','']},{values:['','Produto','Categoria','Qtd Unitária','Marca','Supermercado','Preço Un','Stock'],rowNumber:2},{values:['','Produto de ensaio','Mercearia','3 x 210 g','Marca','Loja','4,29','2'],urls:[,,,, 'https://example.org/oferta'],rowNumber:3}]);
 assert.equal(rows.length,1);assert.equal(rows[0].name,'Produto de ensaio');assert.equal(rows[0].unitQty,'3 x 210 g');assert.equal(rows[0].url,'https://example.org/oferta');assert.equal(rows[0].rowNumber,3);
});
test('Catálogo: embalagens compostas e abreviatura u têm quantidade explícita',()=>{
 for(const [text,qty,unit]of [['3 x 1,3 L',3.9,'L'],['2 × 250 ml',500,'ml'],['3 x 210 g',630,'g'],['6 x 20cl',120,'cl'],['54 u',54,'un'],['30m',30,'m']])assert.deepEqual(C.parseUnitSpec(text),{qty,unit});
 assert.equal(C.convertCompatibleQty(120,'cl','L'),1.2);assert.equal(C.convertCompatibleQty(1.2,'L','cl'),120);
});
test('Catálogo: colagem com aspas, vírgula decimal, coluna inicial vazia e quebra de linha preserva campos',()=>{
 const rows=C.catalogTableRows(C.delimitedTable('\tProduto\tCategoria\tQtd Unitária\tMarca\tSupermercado\tPreço Un\tStock\n\t"Artigo, familiar"\tMercearia\t6 x 20cl\tMarca\tLoja\t1,29\t2'));
 assert.equal(rows.length,1);assert.equal(rows[0].price,'1,29');assert.equal(rows[0].name,'Artigo, familiar');
 const csv=C.delimitedTable('Produto,Categoria,Embalagem,Marca,Loja,Preço,Stock\n"Artigo, familiar",Mercearia,1 kg,Marca,Loja,"1,29",0');assert.equal(csv[1].values[5],'1,29');assert.throws(()=>C.delimitedTable('"Aspas por fechar'));
});
test('Catálogo: erro identifica linha e embalagem e não deixa importação parcial',()=>{
 const d=F.empty(),before=JSON.stringify(d);assert.throws(()=>C.importCatalogTable(d,[{name:'Válido',unitQty:'1 kg'},{name:'Inválido',unitQty:'duas caixas?',rowNumber:8}]),/Linha 8.*Inválido.*duas caixas/);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>C.importCatalogTable(d,[{name:'Incompatível',packageQty:-5,unit:'kg'}]));assert.equal(JSON.stringify(d),before);
});
test('Catálogo: variantes na mesma loja conservam embalagem, marca e links sem modificar a origem',()=>{
 const rows=[{name:'Café',unitQty:'200 g',brand:'Marca',storeName:'Loja',price:'2',url:'https://example.org/200'},{name:'Café',unitQty:'250 g',brand:'Marca',storeName:'Loja',price:'3',url:'https://example.org/250'},{name:'Sumo',unitQty:'6 x 20cl',brand:'Marca A',storeName:'Loja',price:'2'},{name:'Sumo',unitQty:'6 x 20cl',brand:'Marca B',storeName:'Loja',price:'3'},{name:'Recarga',unitQty:'',brand:'Marca',storeName:'Loja A'},{name:'Recarga',unitQty:'25 ml',brand:'Marca',storeName:'Loja B'}],before=JSON.stringify(rows),prepared=C.catalogVariants(rows);
 assert.equal(new Set(prepared.rows.map(r=>r.name)).size,6);assert.equal(JSON.stringify(rows),before);const d=F.empty();C.importCatalogTable(d,prepared.rows);assert.equal(d.casa.catalog.length,6);assert.equal(d.casa.catalog.reduce((n,p)=>n+Object.values(p.offers).filter(o=>o.url).length,0),2);assert(prepared.rows.some(r=>r.name.includes('Embalagem por indicar')));
});
test('Catálogo: mesma embalagem e marca com links diferentes conserva ambas as ofertas com nome estável',()=>{
 const rows=[{name:'Artigo',unitQty:'1 kg',brand:'Marca',storeName:'Loja',price:'2',url:'https://example.org/produto-12345.html'},{name:'Artigo',unitQty:'1 kg',brand:'Marca',storeName:'Loja',price:'3',url:'https://example.org/produto-54321.html'}],prepared=C.catalogVariants(rows).rows;
 assert.equal(new Set(prepared.map(r=>r.name)).size,2);assert.deepEqual(C.catalogVariants(rows.slice().reverse()).rows.map(r=>r.name).sort(),prepared.map(r=>r.name).sort());const d=F.empty();C.importCatalogTable(d,prepared);assert.equal(d.casa.catalog.flatMap(p=>Object.values(p.offers).filter(o=>o.url)).length,2);
});
