'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../finance.js');
const Complete=require('../complete-model.js');
const Life=require('../life-model.js');
require('../planning-model.js');
require('../receipt-model.js');
const Casa=require('../casa-model.js');
require('../casa-life-model.js');
const CasaComplete=require('../casa-complete-model.js');

function ledger(){const d=F.empty();d.accounts=[{id:'bank',name:'Banco',type:'Banco',balance:1000},{id:'cash',name:'Carteira',type:'Dinheiro',balance:50}];return d;}

test('Auditoria v0.38.2: editar subscrição preserva metadados internos e dia real de renovação',()=>{
 const d=ledger();
 d.subscriptions=[{id:'sub',name:'Serviço',amount:10,frequency:'monthly',nextDate:'2026-02-28',renewalDay:31,status:'active',trialEnd:'',reminderDays:7,account:'Banco',category:'Subscrições',prices:[{date:'2026-01-01',amount:10}],usage:'often',occurrenceOverrides:[{originalDate:'2026-03-31',date:'2026-03-30',reason:'Antecipado'}],customFlag:'preservar'}];
 Life.subscription(d,{name:'Serviço Plus',amount:'12',frequency:'monthly',nextDate:'2026-02-28',status:'active',trialEnd:'',reminderDays:'5',account:'Banco',category:'Subscrições'},'sub');
 const s=d.subscriptions[0];
 assert.equal(s.renewalDay,31);assert.equal(s.usage,'often');assert.equal(s.customFlag,'preservar');assert.deepEqual(s.occurrenceOverrides,[{originalDate:'2026-03-31',date:'2026-03-30',reason:'Antecipado'}]);
 Life.subscription(d,{name:s.name,amount:String(s.amount),frequency:'monthly',nextDate:'2026-03-15',status:'active',trialEnd:'',reminderDays:'5',account:'Banco',category:'Subscrições'},'sub');
 assert.equal(d.subscriptions[0].renewalDay,15);
});

test('Auditoria v0.38.2: renomear conta atualiza todas as referências conhecidas',()=>{
 const d=ledger();
 d.transactions=[{id:'t',date:'2026-09-01',description:'x',type:'transfer',amount:1,account:'Banco',targetAccount:'Carteira'}];
 d.recurring=[{id:'r',description:'r',amount:2,type:'expense',category:'x',account:'Banco',start:'2026-09-01',day:1,active:true}];
 d.pendingPayments=[{id:'p',date:'2026-09-02',description:'p',type:'expense',amount:3,account:'Banco'}];
 d.pendingImports=[{id:'i',date:'2026-09-03',description:'i',type:'expense',amount:4,account:'Banco'}];
 d.subscriptions=[{id:'s',name:'s',amount:5,frequency:'monthly',nextDate:'2026-10-01',status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
 d.debts=[{id:'d',name:'d',balance:100,payment:10,account:'Banco'}];
 d.importProfiles=[{id:'ip',name:'perfil',defaultAccount:'Banco'}];
 d.statements=[{id:'st',name:'e',fingerprint:'f',rows:[{id:'sr',status:'pending',source:{date:'2026-09-01',amount:1,account:'Banco',targetAccount:'Carteira'}}]}];
 d.reconciliations=[{id:'rec',accountId:'bank',accountName:'Banco',date:'2026-09-01',expected:1000,actual:1000,difference:0,adjusted:false}];
 const count=F.renameAccountReferences(d,'Banco','Conta Principal');
 assert.ok(count>=8);assert.equal(F.accountNameReferences(d,'Banco').length,0);
 assert.equal(d.debts[0].account,'Conta Principal');assert.equal(d.subscriptions[0].account,'Conta Principal');assert.equal(d.importProfiles[0].defaultAccount,'Conta Principal');assert.equal(d.reconciliations[0].accountName,'Conta Principal');
});

test('Auditoria v0.38.2: dependências ativas impedem arquivar uma conta silenciosamente',()=>{
 const d=ledger();
 d.recurring=[{id:'r',description:'r',amount:2,type:'expense',category:'x',account:'Banco',start:'2026-09-01',day:1,active:true}];
 d.subscriptions=[{id:'s',name:'s',amount:5,frequency:'monthly',nextDate:'2026-10-01',status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
 d.debts=[{id:'d',name:'d',balance:100,payment:10,account:'Banco'}];
 assert.deepEqual(F.activeAccountDependencies(d,'Banco').sort(),['créditos ativos','recorrências ativas','subscrições ativas'].sort());
});

test('Auditoria v0.38.2: ajustes de ocorrência inválidos são rejeitados na normalização',()=>{
 const d=ledger();
 d.recurring=[{id:'r',description:'r',amount:2,type:'expense',category:'x',account:'Banco',start:'2026-09-01',day:1,active:true,occurrenceOverrides:[{originalDate:'2026-10-01',date:'2026-10-02'},{originalDate:'2026-10-01',date:'2026-10-03'}]}];
 assert.throws(()=>F.normalize(d),/Ajustes de ocorrência inválidos/);
 const d2=ledger();d2.subscriptions=[{id:'s',name:'s',amount:5,frequency:'monthly',nextDate:'2026-10-01',status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[],occurrenceOverrides:[{originalDate:'x',date:'2026-10-01'}]}];
 assert.throws(()=>F.normalize(d2),/Ajustes de ocorrência da subscrição inválidos/);
});

test('Auditoria v0.38.2: cartões não aceitam nomes duplicados apenas por maiúsculas/minúsculas',()=>{
 const d=ledger();d.accounts.push({id:'c1',name:'Cartão Casa',type:'Cartão',balance:0,closingDay:20,dueDay:5});
 assert.throws(()=>Complete.card(d,{name:'cartão casa',balance:0,closingDay:20,dueDay:5}),/Verifica nome/);
});

test('Auditoria v0.38.2: reembolso Casa pode regressar à conta original mesmo arquivada',()=>{
 const d=ledger();
 Casa.addPurchase(d,{id:'p',date:F.today(),store:'Loja',items:[{name:'Produto',total:10}],account:'Banco',category:'Casa'});
 d.accounts[0].archived=true;
 const id=CasaComplete.returnPurchase(d,{id:'ret',purchaseId:'p',date:F.today(),qty:0,amount:2,account:'Banco',note:'devolução'});
 assert.equal(id,'ret');assert.equal(d.transactions.at(-1).account,'Banco');assert.equal(d.accounts[0].balance,992);
});

test('Auditoria v0.38.2: botões renderizados têm type explícito',()=>{
 const root=path.join(__dirname,'..');
 const files=['index.html',...fs.readdirSync(root).filter(x=>x.endsWith('.js'))];
 for(const file of files){const text=fs.readFileSync(path.join(root,file),'utf8');for(const match of text.matchAll(/<button\b([^>]*)>/gis))assert.match(match[1],/\btype\s*=/,`${file} contém botão sem type explícito`);}
});

test('Auditoria v0.38.2: build inclui todos os recursos carregados pelo HTML',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),files=new Set(pkg.build.files);
 for(const match of html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)){const ref=match[1];assert.ok(fs.existsSync(path.join(root,ref)),`recurso ausente ${ref}`);assert.ok(files.has(ref),`recurso fora do build ${ref}`);}
});

test('Auditoria v0.38.2: 300 operações mantêm saldos reversíveis e sem drift monetário',()=>{
 const d=ledger();let expectedBank=1000,expectedCash=50;const ids=[];
 for(let i=0;i<300;i++){
  const amount=((i%37)+1)/10;
  if(i%3===0){const t=F.add(d,{id:'e'+i,date:'2026-09-01',description:'Despesa '+i,type:'expense',amount,account:'Banco'});expectedBank=F.money(expectedBank-amount);ids.push(t.id);}
  else if(i%3===1){const t=F.add(d,{id:'r'+i,date:'2026-09-01',description:'Receita '+i,type:'income',amount,account:'Carteira'});expectedCash=F.money(expectedCash+amount);ids.push(t.id);}
  else {const t=F.add(d,{id:'t'+i,date:'2026-09-01',description:'Transferência '+i,type:'transfer',amount,account:'Banco',targetAccount:'Carteira'});expectedBank=F.money(expectedBank-amount);expectedCash=F.money(expectedCash+amount);ids.push(t.id);}
  assert.equal(d.accounts[0].balance,expectedBank);assert.equal(d.accounts[1].balance,expectedCash);
 }
 for(const id of ids.slice().reverse()){const t=d.transactions.find(x=>x.id===id);if(t.type==='expense')expectedBank=F.money(expectedBank+t.amount);else if(t.type==='income')expectedCash=F.money(expectedCash-t.amount);else {expectedBank=F.money(expectedBank+t.amount);expectedCash=F.money(expectedCash-t.amount);}F.remove(d,id);}
 assert.equal(d.accounts[0].balance,1000);assert.equal(d.accounts[1].balance,50);assert.equal(d.transactions.length,0);
});

test('Auditoria v0.38.2: subscrição no dia 31 não deriva depois de fevereiro',()=>{
 const d=ledger();
 d.subscriptions=[{id:'s31',name:'Dia 31',amount:9.99,frequency:'monthly',nextDate:'2026-02-28',renewalDay:31,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
 Life.renew(d,'s31');
 assert.equal(d.subscriptions[0].nextDate,'2026-03-31');
 Life.renew(d,'s31');
 assert.equal(d.subscriptions[0].nextDate,'2026-04-30');
 Life.renew(d,'s31');
 assert.equal(d.subscriptions[0].nextDate,'2026-05-31');
 assert.equal(d.subscriptions[0].renewalDay,31);
});

test('Auditoria v0.38.2: dependências inativas não bloqueiam arquivo de conta',()=>{
 const d=ledger();
 d.recurring=[{id:'r',description:'r',amount:2,type:'expense',category:'x',account:'Banco',start:'2026-09-01',day:1,active:false}];
 d.subscriptions=[{id:'s',name:'s',amount:5,frequency:'monthly',nextDate:'2026-10-01',status:'cancelled',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
 d.debts=[{id:'d',name:'d',balance:0,payment:10,account:'Banco'}];
 assert.deepEqual(F.activeAccountDependencies(d,'Banco'),[]);
});

test('Auditoria v0.38.2: renomear referências é idempotente e não toca noutras contas',()=>{
 const d=ledger();
 d.transactions=[{id:'a',date:'2026-09-01',description:'a',type:'expense',amount:1,account:'Banco'},{id:'b',date:'2026-09-01',description:'b',type:'expense',amount:1,account:'Carteira'}];
 assert.equal(F.renameAccountReferences(d,'Banco','Principal'),1);
 assert.equal(F.renameAccountReferences(d,'Banco','Principal'),0);
 assert.equal(d.transactions[0].account,'Principal');
 assert.equal(d.transactions[1].account,'Carteira');
});

test('Auditoria v0.38.2: referências de conta incluem extratos, reconciliações e destino',()=>{
 const d=ledger();
 d.statements=[{id:'st',rows:[{id:'row',source:{account:'Carteira',targetAccount:'Banco'}}]}];
 d.reconciliations=[{id:'rec',accountId:'bank',accountName:'Banco',date:'2026-09-01',expected:1,actual:1,difference:0,adjusted:false}];
 const refs=F.accountNameReferences(d,'Banco');
 assert.ok(refs.some(r=>r.list==='statements'&&r.field==='targetAccount'));
 assert.ok(refs.some(r=>r.list==='reconciliations'&&r.field==='accountName'));
});

test('Auditoria v0.38.2: dia de renovação inválido é rejeitado',()=>{
 const d=ledger();
 d.subscriptions=[{id:'s',name:'s',amount:5,frequency:'monthly',nextDate:'2026-10-01',renewalDay:32,status:'active',trialEnd:'',reminderDays:0,account:'Banco',category:'Subscrições',prices:[]}];
 assert.throws(()=>F.normalize(d),/Subscrição inválida/);
});

test('Auditoria v0.38.2: override recorrente rejeita montante negativo e nota excessiva',()=>{
 const base=()=>{const d=ledger();d.recurring=[{id:'r',description:'r',amount:2,type:'expense',category:'x',account:'Banco',start:'2026-09-01',day:1,active:true}];return d;};
 const d1=base();d1.recurring[0].occurrenceOverrides=[{originalDate:'2026-10-01',amount:-1}];
 assert.throws(()=>F.normalize(d1),/Ajustes de ocorrência inválidos/);
 const d2=base();d2.recurring[0].occurrenceOverrides=[{originalDate:'2026-10-01',reason:'x'.repeat(501)}];
 assert.throws(()=>F.normalize(d2),/Ajustes de ocorrência inválidos/);
});

test('Auditoria v0.38.2: SQLite preserva metadados de subscrição e ajustes de ocorrência',()=>{
 const os=require('node:os');
 const {createSqliteStorage}=require('../desktop/storage-sqlite.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-audit-'));
 const storage=createSqliteStorage(dir);
 try{
  const d=ledger();d.spaceName='Teste';
  d.subscriptions=[{id:'s',name:'Serviço',amount:5,frequency:'monthly',nextDate:'2026-10-31',renewalDay:31,status:'active',trialEnd:'',reminderDays:3,account:'Banco',category:'Subscrições',prices:[],usage:'often',occurrenceOverrides:[{originalDate:'2026-10-31',date:'2026-10-30',reason:'antecipado'}]}];
  storage.writeSpace('equilibrioData',d);
  const restored=storage.readSpace('main').data;
  assert.equal(restored.subscriptions[0].renewalDay,31);
  assert.equal(restored.subscriptions[0].usage,'often');
  assert.deepEqual(restored.subscriptions[0].occurrenceOverrides,d.subscriptions[0].occurrenceOverrides);
 } finally { storage.close();fs.rmSync(dir,{recursive:true,force:true}); }
});

test('Auditoria v0.38.2: edição de subscrição mantém a conta arquivada atual disponível',()=>{
 const text=fs.readFileSync(path.join(__dirname,'..','life-ui.js'),'utf8');
 assert.match(text,/!a\.archived\s*\|\|\s*a\.name\s*===\s*s\?\.account/);
});

test('Auditoria v0.38.2: eliminação de conta consulta todas as referências centralizadas',()=>{
 const text=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 assert.match(text,/accountNameReferences\s*\(/);
 assert.match(text,/renameAccountReferences\s*\(/);
});

test('Auditoria v0.38.2: arquivo de conta consulta dependências ativas centralizadas',()=>{
 const text=fs.readFileSync(path.join(__dirname,'..','features-ui.js'),'utf8');
 assert.match(text,/activeAccountDependencies\s*\(/);
});

test('Auditoria frontend: HTML carrega apenas o bundle canónico',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const css=[...html.matchAll(/href="([^"?#]+\.css)"/g)].map(m=>m[1]);
 assert.deepEqual(css,['ui.css']);
});

test('Auditoria v0.38.2: HTML não contém IDs literais duplicados',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
});

test('Auditoria v0.38.2: preload sandboxed não importa módulos locais',()=>{
 const text=fs.readFileSync(path.join(__dirname,'..','desktop','preload.cjs'),'utf8');
 assert.doesNotMatch(text,/require\(\s*['"]\.\//);
});
