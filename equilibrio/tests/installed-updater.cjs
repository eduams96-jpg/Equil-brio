'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const U=require('../desktop/manual-updater.cjs');
test('Atualizador: verifica escrita e remove o ensaio de acesso',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equilibrio-access-'));
 try{assert.equal(await U.needsElevation(dir),false);assert.deepEqual(fs.readdirSync(dir),[]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Atualizador: acesso recusado pede elevação, outras falhas não são ignoradas',async()=>{
 if(process.platform!=='win32')return;
 const original=fsp.open;try{
  fsp.open=async()=>{throw Object.assign(Error('Recusado'),{code:'EACCES'});};assert.equal(await U.needsElevation('C:/synthetic'),true);
  fsp.open=async()=>{throw Object.assign(Error('Disco indisponível'),{code:'EIO'});};await assert.rejects(()=>U.needsElevation('C:/synthetic'),/Disco/);
 }finally{fsp.open=original;}
});
test('Atualizador: caminhos com espaços e apóstrofos permanecem argumentos literais na elevação',()=>{
 const args=U.elevationCommand("C:\\teste d'uso\\helper.cjs",'C:\\teste\\plan.json','C:\\teste\\ack.txt');
 const outer=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.ok(outer.includes('-Verb RunAs'));assert.ok(outer.includes('-WindowStyle Hidden'));
 const encoded=outer.match(/'-EncodedCommand','([^']+)'/)[1],inner=Buffer.from(encoded,'base64').toString('utf16le');
 assert.ok(inner.includes("d''uso"));assert.ok(inner.includes("ELECTRON_RUN_AS_NODE='1'"));assert.ok(inner.includes('WriteAllText'));assert.ok(!inner.includes('ExecutionPolicy'));
});
