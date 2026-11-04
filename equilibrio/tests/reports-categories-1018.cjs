'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../finance.js');
globalThis.Finance=F;
const R=require('../reports-model.js'),C=require('../complete-model.js'),{seed}=require('./fixtures/cor-007.cjs');
const buy=(d,id,date,amount,category,description=id)=>F.add(d,{id,date,type:'expense',amount,account:'Banco',description,category});
function ledger(){const d=seed();buy(d,'a1','2026-03-02',10,'Alimentação / Snacks / Chocolates','LIDL 123');buy(d,'a2','2026-03-09',5.5,'Alimentação / Snacks / Chocolates','LIDL 456');buy(d,'a3','2026-04-01',20,'Mercearia / Arroz','Pingo Doce');buy(d,'a4','2026-04-03',2,'Mercearia / Snacks / Chocolate','LIDL');buy(d,'a5','2025-03-02',8,'Alimentação / Snacks / Chocolates','LIDL');buy(d,'a6','2026-05-01',30,'Alimentação / Mercearias / Arroz','Continente');buy(d,'t1','2026-05-02',1,'Transferências','Banco');buy(d,'t2','2026-05-03',1,'Transferência','Banco');buy(d,'t3','2026-05-04',1,'Transferência','Banco');F.add(d,{id:'i1',date:'2026-03-25',type:'income',amount:1000,account:'Banco',description:'Salário',category:'Receita / Vencimento'});return d;}

test('Relatórios: detalhe com subcategorias, mês a mês, ano anterior, descrições e receitas',()=>{const d=ledger(),before=JSON.stringify(d),x=R.detail(d,{year:'2026'});assert.equal(JSON.stringify(d),before);
 const food=x.categories.find(c=>c.name==='Alimentação');assert.equal(food.amount,45.5);assert.equal(food.children.find(c=>c.name==='Snacks / Chocolates').amount,15.5);assert.equal(food.previous,8);
 assert.equal(food.months.length,12);assert.equal(food.months[2],15.5);assert.equal(food.months[4],30);
 assert.equal(x.comparison.find(c=>c.name==='Alimentação').delta,37.5);assert.equal(x.previous.year,'2025');
 const lidl=x.merchants.find(m=>/lidl/i.test(m.name));assert.equal(lidl.count,3,'números no nome não separam o mesmo sítio');assert.equal(lidl.amount,17.5);
 assert.equal(x.income[0].name,'Receita / Vencimento');assert.equal(x.income[0].amount,1000);assert.equal(x.biggest[0].id,'a6');});

test('Relatórios: sem ano anterior a comparação fica vazia',()=>{const d=seed();buy(d,'x','2026-02-02',3,'Casa');const x=R.detail(d,{year:'2026'});assert.equal(x.previous?.expense||0,0);});

test('Categorias: sugestões juntam plural, a mesma subcategoria e escolhem o destino mais usado',()=>{const d=ledger(),s=C.categoryCleanupSuggestions(d),find=(from)=>s.find(p=>p.from===from);
 assert.equal(find('Transferências').to,'Transferência');assert.equal(find('Transferências').strength,'strong');
 assert.equal(find('Mercearia / Snacks / Chocolate').to,'Alimentação / Snacks / Chocolates');
 assert.equal(find('Mercearia / Arroz').to,'Alimentação / Mercearias / Arroz');});

test('Categorias: arrumar move ramos inteiros, não volta a mostrar a origem e preserva valores',()=>{const d=ledger(),total=d.transactions.reduce((n,t)=>n+t.amount,0);
 const moved=C.cleanupCategories(d,[{from:'Mercearia / Snacks / Chocolate',to:'Alimentação / Snacks / Chocolates'},{from:'Mercearia',to:'Alimentação / Mercearias'},{from:'Transferências',to:'Transferência'}]);
 assert.ok(moved>=4);const names=C.categoryList(d).map(c=>c.name);assert.ok(!names.some(n=>n.startsWith('Mercearia')),names.join(','));assert.ok(!names.includes('Transferências'));
 assert.equal(d.transactions.find(t=>t.id==='a3').category,'Alimentação / Mercearias / Arroz');assert.equal(d.transactions.find(t=>t.id==='a4').category,'Alimentação / Snacks / Chocolates');
 assert.equal(d.transactions.reduce((n,t)=>n+t.amount,0),total);});

test('Categorias: arrumar falha sem alterar nada quando o destino ultrapassa quatro níveis',()=>{const d=ledger(),before=JSON.stringify(d);assert.throws(()=>C.cleanupCategories(d,[{from:'Mercearia',to:'A / B / C / D'}]),/quatro níveis/);assert.equal(JSON.stringify(d),before);});
