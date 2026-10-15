'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('../finance.js'),U=require('../desktop/manual-updater.cjs');
const {createSqliteStorage:openStorage}=require('../desktop/storage-sqlite.cjs');
const openStores=new Map();
function createSqliteStorage(dir){const db=openStorage(dir);openStores.set(db,dir);return db;}
const {createDataService}=require('../desktop/data-service.cjs');
const {diagnoseLedger}=require('../desktop/ledger-diagnostics.cjs');
const {diagnoseFile}=require('../scripts/diagnose.cjs');
const {prepareRestoreText}=require('../desktop/restore-validation.cjs');
const {resolveBackupText}=require('../desktop/snapshot-backup.cjs');
const {writeVerifiedAtomic}=require('../desktop/verified-backup.cjs');
const {applyFromZip}=require('../scripts/apply-update-from-zip.cjs');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-03952-'));t.after(()=>{for(const [db,folder]of openStores)if(folder===dir||folder.startsWith(dir+path.sep)){db.close();openStores.delete(db);}fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return dir;}
function ledger(){const d=F.empty();d.accounts=[{id:'b',name:'Banco',type:'Banco',balance:1000},{id:'s',name:'Poupança',type:'Poupança',balance:0}];return F.normalize(F.migrateLedgerCore(d));}
const row=(id,type,account,date='2026-09-01')=>({id,type,account,date,description:'TRF interna',category:'Transferências',amount:25});
function packageOf(files=[['desktop/version.cjs',"const APP_VERSION = '0.39.52';"]]){
 const pkg={format:U.UPDATE_FORMAT,formatVersion:1,appId:U.UPDATE_APP_ID,version:'0.39.52',minAppVersion:'0.39.51',maxAppVersion:'0.39.51',minSchemaVersion:2,maxSchemaVersion:2,files:files.map(([path,text])=>{const b=Buffer.from(text);return {path,size:b.length,sha256:U.sha256Buffer(b),contentBase64:b.toString('base64')};})};
 pkg.manifestSha256=U.sha256Buffer(Buffer.from(U.canonicalManifestForHash(pkg)));return pkg;
}
const context={currentVersion:'0.39.51',schemaVersion:2};
test('Diagnóstico: saldo inicial, entradas, saídas e pendências sem alterar dados',()=>{
 const d=ledger();F.add(d,{...row('e','expense','Banco'),category:'Casa',description:'Compra'});F.importTransaction(d,row('o','expense','Banco'));d.accounts[0].balance=999;
 const before=JSON.stringify(d),r=diagnoseLedger(d);assert.equal(JSON.stringify(d),before);assert.equal(r.accounts[0].calculatedBalance,950);assert.equal(r.accounts[0].difference,49);assert.equal(r.accounts[0].expense,25);assert.equal(r.accounts[0].transferOut,25);assert.deepEqual(r.accounts[0].pendingTransfers,['o']);assert.equal(r.accounts[1].calculatedBalance,0);
 assert.ok(r.issues.some(x=>x.code==='balance-cache-divergence'));assert.ok(r.issues.some(x=>x.code==='pending-transfer'));
});
test('Diagnóstico: referências órfãs, evidência duplicada e ajuste sem direção',()=>{
 const d=ledger();d.transactions=[{...row('a','transfer','Banco'),targetAccount:'Desconhecida'},{...row('b','income','Outro'),transferEvidence:[{id:'a'}]},{...row('c','adjustment','Banco')}];
 const codes=diagnoseLedger(d).issues.map(x=>x.code);for(const c of ['invalid-transfer-target','missing-source-account','duplicate-transaction-evidence','adjustment-without-direction'])assert.ok(codes.includes(c));
});
test('Diagnóstico SQLite: usa tabelas normalizadas e não escreve nem migra',t=>{
 const dir=temp(t),db=createSqliteStorage(dir);db.writeSpace('equilibrioData',ledger());db.close();
 const file=path.join(dir,'financas.db'),before=fs.readFileSync(file);const r=diagnoseFile(file);assert.equal(r.spaces[0].accounts[0].calculatedBalance,1000);assert.deepEqual(fs.readFileSync(file),before);
});
test('Persistência: uma alteração Casa antiga não pode sobrescrever uma gravação concorrente',t=>{
 const db=createSqliteStorage(temp(t));t.after(()=>db.close());const service=createDataService(db);service.writeSpace('equilibrioData',ledger());const before=service.readSpace('main').data;
 const first=structuredClone(before);first.yearNotes.push({id:'n',date:'2026-09-01',title:'primeira',description:'Nota'});service.commitLedger('equilibrioData',before,first);
 const stale=structuredClone(before);stale.yearNotes.push({id:'n2',date:'2026-09-01',title:'segunda',description:'Nota'});assert.throws(()=>service.commitLedger('equilibrioData',before,stale),/noutra operação/);assert.deepEqual(service.readSpace('main').data.yearNotes,first.yearNotes);
});
test('Persistência: conflito no movimento preserva todos os domínios da operação',t=>{
 const db=createSqliteStorage(temp(t));t.after(()=>db.close());db.writeSpace('equilibrioData',ledger());const before=db.readSpace('main').data,first=structuredClone(before);F.add(first,{...row('e','expense','Banco'),description:'Compra',category:'Casa'});db.applyLedgerDelta('equilibrioData',before,first);
 const second=structuredClone(before);second.yearNotes.push({id:'n'});assert.throws(()=>db.applyLedgerDelta('equilibrioData',before,second),/noutra operação/);assert.deepEqual(db.readSpace('main').data,first);
});
test('CRUD: nunca reaplica a reparação histórica de saldo inicial',t=>{
 const db=createSqliteStorage(temp(t));t.after(()=>db.close());const d=ledger();delete d.coreMigration.savingsCredit051;
 d.coreMigration.previousBalances=[{id:'s',balance:0}];d.accounts[1].openingBalance=-25;d.transactions=[{...row('t','transfer','Banco'),targetAccount:'Poupança',transferStatus:'confirmed',mmexBalanceAfter:100}];F.refreshBalances(d);
 const service=createDataService(db);service.writeSpace('equilibrioData',d);assert.equal(service.readSpace('main').data.accounts[1].openingBalance,-25);assert.equal(service.readSpace('main').data.coreMigration.savingsCredit051,undefined);
});
test('Leitura SQLite: categorias corrompidas não desaparecem silenciosamente',t=>{
 const dir=temp(t),db=createSqliteStorage(dir);t.after(()=>db.close());const d=ledger();d.categoryCatalog=[{id:'cat',name:'Casa'}];db.writeSpace('equilibrioData',d);
 const native=new (require('node:sqlite').DatabaseSync)(db.dbPath);native.prepare("UPDATE categories SET payload_json='broken'").run();native.close();assert.throws(()=>db.readSpace('main'),/JSON SQLite inválido/);assert.throws(()=>resolveBackupText({dataService:createDataService(db)}),/JSON SQLite inválido/);
});
test('Leitura SQLite: remainder corrompido bloqueia leitura sem fabricar listas vazias',t=>{
 const db=createSqliteStorage(temp(t));t.after(()=>db.close());db.writeSpace('equilibrioData',ledger());const native=new (require('node:sqlite').DatabaseSync)(db.dbPath);native.prepare("UPDATE spaces SET remainder_json='[]'").run();native.close();assert.throws(()=>db.readSpace('main'),/Registo SQLite inválido/);
});
test('Restauro: valida todos os espaços antes de substituir qualquer dado',()=>{
 const valid=ledger(),broken=structuredClone(valid);broken.transactions=[row('e','expense','Conta inexistente')];
 assert.throws(()=>prepareRestoreText(JSON.stringify({format:'equilibrio-spaces',version:1,spaces:[{name:'Bom',data:valid},{name:'Mau',data:broken}]})),/conta/);
 for(const doc of [{format:'outro',accounts:[],transactions:[]},{format:'equilibrio-spaces',version:2,spaces:[{name:'Bom',data:valid}]},{format:'equilibrio-spaces',version:1,spaces:[{name:'',data:valid}]}])assert.throws(()=>prepareRestoreText(JSON.stringify(doc)));
});
test('Restauro: rejeita núcleo futuro e data inválida na contraparte',()=>{
 const d=ledger();d.ledgerCoreVersion=2;assert.throws(()=>prepareRestoreText(JSON.stringify(d)),/núcleo/);
 d.ledgerCoreVersion=1;d.transactions=[{...row('t','transfer','Banco'),targetAccount:'Poupança',targetDate:'2026-02-30'}];assert.throws(()=>prepareRestoreText(JSON.stringify(d)),/data de destino/);
});
test('Backup/restauro: SQLite → JSON → validação → outro perfil → reabertura',t=>{
 const dir=temp(t),db=createSqliteStorage(path.join(dir,'a'));t.after(()=>db.close());const d=ledger();F.add(d,{...row('t','transfer','Banco'),targetAccount:'Poupança'});db.writeSpace('equilibrioData',d);const snapshot=resolveBackupText({preferred:'{"stale":true}',dataService:createDataService(db)});const prepared=prepareRestoreText(snapshot),source=JSON.parse(prepared.content).spaces[0].data;
 let target=createSqliteStorage(path.join(dir,'b'));target.writeSpace('equilibrioData',source);target.close();target=createSqliteStorage(path.join(dir,'b'));try{assert.deepEqual(target.readSpace('main').data,source);}finally{target.close();}
});
test('Backup: destino recusado preserva a cópia anterior e limpa temporários',async t=>{
 const dir=temp(t),file=path.join(dir,'backup.json');fs.writeFileSync(file,'anterior');const blocked=path.join(dir,'blocked');fs.writeFileSync(blocked,'x');await assert.rejects(writeVerifiedAtomic(file,'novo',{stageDirectory:path.join(blocked,'inside')}));assert.equal(fs.readFileSync(file,'utf8'),'anterior');assert.deepEqual(fs.readdirSync(dir).sort(),['backup.json','blocked']);
});
test('Transferência: crédito com data distinta confirmado sem alterar saldo final',()=>{
 const d=ledger();F.add(d,{...row('t','transfer','Banco'),targetAccount:'Poupança'});F.importTransaction(d,row('i','income','Poupança','2026-09-03'));assert.equal(d.transactions.length,1);assert.equal(d.accounts[1].balance,25);assert.equal(F.balanceAt(d,d.accounts[1],'2026-09-02'),0);assert.equal(F.balanceAt(d,d.accounts[1],'2026-09-03'),25);
});
test('Transferência: meses fechados e movimentos reconciliados não são confirmados implicitamente',()=>{
 for(const closed of [false,true]){const d=ledger();F.add(d,{...row('t','transfer','Banco'),targetAccount:'Poupança'});if(closed)d.closedMonths=['2026-09'];else d.transactions[0].reconciled=true;const before=JSON.stringify(d);if(closed)assert.throws(()=>F.importTransaction(d,row('i','income','Poupança')),/Reabre o mês/);else{F.importTransaction(d,row('i','income','Poupança'));assert.equal(d.transactions.length,2);}if(closed)assert.equal(JSON.stringify(d),before);}
});
test('Transferência: emparelhamento não elimina IDs referenciados por Casa/planeamento',()=>{
 for(const domain of ['sharedExpenses','installmentPlans','investmentTrades']){const d=ledger();F.importTransaction(d,row('o','expense','Banco'),{reconcile:false});F.importTransaction(d,row('i','income','Poupança'),{reconcile:false});d[domain]=[{transactionId:'i'}];assert.deepEqual(F.reconcileTransfers(d),[]);assert.equal(d.transactions.length,2);}
});
test('Saldos: cálculo linear equivale ao saldo por data para 200 contas e 10000 movimentos',()=>{
 const d=ledger();d.accounts=Array.from({length:200},(_,i)=>({id:String(i),name:'Conta '+i,balance:0,openingBalance:i}));d.transactions=Array.from({length:10000},(_,i)=>({...row(String(i),i%2?'income':'expense','Conta '+(i%200)),amount:(i%99+1)/100}));F.refreshBalances(d);for(const a of d.accounts)assert.equal(a.balance,F.balanceAt(d,a));
});
test('Atualização: sem chave, verifica hash, duplicados, tamanho, base64 e caminhos',()=>{
 assert.equal(U.validatePackageObject(packageOf(),context).signatureVerified,false);
 for(const mutate of [p=>p.files[0].contentBase64+='!',p=>delete p.files[0].size,p=>p.files[0].path='../fora.cjs',p=>p.files.push({...p.files[0]}),p=>p.manifestSha256='0'.repeat(64)]){const p=packageOf();mutate(p);assert.throws(()=>U.validatePackageObject(p,context));}
 assert.equal(U.validatePackageObject(packageOf([['empty.css','']]),context).files[0].size,0);
});
async function stagedFixture(t){const dir=temp(t),appPath=path.join(dir,'app'),userDataPath=path.join(dir,'profile');fs.mkdirSync(path.join(appPath,'desktop'),{recursive:true});fs.writeFileSync(path.join(appPath,'desktop/version.cjs'),"const APP_VERSION = '0.39.51';");const pkg=packageOf([['new.css','new'],['desktop/version.cjs',"const APP_VERSION = '0.39.52';"]]),validated=U.validatePackageObject(pkg,context);const staged=await U.stageUpdate({pkg,validated,appPath,userDataPath,currentVersion:context.currentVersion});staged.plan.parentPid=2147483647;fs.writeFileSync(staged.planPath,JSON.stringify(staged.plan));const marker=path.join(userDataPath,'update-pending.json'),pointer=JSON.parse(fs.readFileSync(marker));pointer.planSha256=require('../desktop/update-recovery.cjs').planHash(staged.plan);fs.writeFileSync(marker,JSON.stringify(pointer));return {dir,appPath,userDataPath,...staged};}
async function runHelper(s){await U.launchDetachedHelper(s);for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));const status=await U.readUpdateStatus(s.userDataPath);if(['success','failed-before-install','failed-rolled-back','failed-rollback-error'].includes(status?.state))return status;}throw Error('helper timeout');}
test('Atualização: staging corrompido reverte ficheiro novo e mantém a versão anterior',async t=>{const s=await stagedFixture(t);fs.writeFileSync(path.join(s.stagingDir,'desktop/version.cjs'),'broken');const status=await runHelper(s);assert.equal(status.state,'failed-rolled-back');assert.equal(fs.existsSync(path.join(s.appPath,'new.css')),false);assert.match(fs.readFileSync(path.join(s.appPath,'desktop/version.cjs'),'utf8'),/0.39.51/);assert.equal(fs.existsSync(path.join(s.appPath,'desktop/version.cjs.update-tmp')),false);});
test('Atualização: rollback corrompido impede começar a instalação',async t=>{const s=await stagedFixture(t);fs.writeFileSync(path.join(s.rollbackDir,'desktop/version.cjs'),'broken');await assert.rejects(U.launchDetachedHelper(s),/reversão corrompida/);assert.equal(fs.existsSync(path.join(s.userDataPath,'update-pending.json')),true);assert.match(fs.readFileSync(path.join(s.appPath,'desktop/version.cjs'),'utf8'),/0.39.51/);assert.equal(fs.existsSync(path.join(s.appPath,'new.css')),false);});
test('Passagem .51 → .52: via ZIP sem chave, com cópia SQLite consistente e dados preservados',async t=>{
 const dir=temp(t),appPath=path.join(dir,'Aplicação €'),userDataPath=path.join(dir,'Outro PC €');fs.mkdirSync(path.join(appPath,'desktop'),{recursive:true});fs.writeFileSync(path.join(appPath,'package.json'),'{"version":"0.39.51"}');fs.writeFileSync(path.join(appPath,'desktop/version.cjs'),"const APP_VERSION = '0.39.51';");const db=createSqliteStorage(userDataPath);db.writeSpace('equilibrioData',ledger());db.close();const before=fs.readFileSync(path.join(userDataPath,'financas.db'));const pkg=packageOf(),file=path.join(dir,'update.fpupdate');fs.writeFileSync(file,JSON.stringify(pkg));const result=await applyFromZip(appPath,userDataPath,file);assert.equal(result.state,'success');assert.ok(fs.existsSync(result.backupPath));assert.deepEqual(fs.readFileSync(path.join(userDataPath,'financas.db')),before);assert.match(fs.readFileSync(path.join(appPath,'desktop/version.cjs'),'utf8'),/0.39.52/);
});
