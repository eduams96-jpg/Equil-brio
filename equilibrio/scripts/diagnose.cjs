'use strict';
const fs = require('node:fs'), path = require('node:path');
const {diagnoseLedger} = require('../desktop/ledger-diagnostics.cjs');
function readDatabase(file) {
  const {DatabaseSync} = require('node:sqlite');
  const db = new DatabaseSync(file,{readOnly:true});
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map(r => r.integrity_check);
    const spaces = db.prepare('SELECT id,name,remainder_json FROM spaces ORDER BY sort_order,id').all().map(s => {
      const data = JSON.parse(s.remainder_json);
      for (const table of ['accounts','transactions'])
        data[table] = db.prepare(`SELECT payload_json FROM ${table} WHERE space_id=? ORDER BY sort_order,id`).all(s.id).map(r=>JSON.parse(r.payload_json));
      return {id:s.id,name:s.name,...diagnoseLedger(data)};
    });
    return {readOnly:true,source:'SQLite normalizado',integrity,spaces};
  } finally {db.close();}
}
function diagnoseFile(file) {
  const source=path.resolve(file);
  if(path.extname(source).toLowerCase()==='.db')return readDatabase(source);
  const parsed=JSON.parse(fs.readFileSync(source,'utf8'));
  const spaces=parsed.format==='equilibrio-spaces'?parsed.spaces:[{name:parsed.spaceName||'Pessoal',data:parsed}];
  if(!Array.isArray(spaces)||!spaces.length)throw Error('Cópia sem espaços.');
  return {readOnly:true,source:'JSON',spaces:spaces.map(s=>({name:s.name,...diagnoseLedger(s.data)}))};
}
if(require.main===module){
  try{
    if(!process.argv[2])throw Error('Uso: node scripts/diagnose.cjs caminho/financas.db [relatorio.json]');
    const result=JSON.stringify(diagnoseFile(process.argv[2]),null,2);
    if(process.argv[3]){
      if(path.resolve(process.argv[2]).toLowerCase()===path.resolve(process.argv[3]).toLowerCase())throw Error('O relatório não pode substituir a origem.');
      fs.writeFileSync(process.argv[3],result,{flag:'wx'});
    }else console.log(result);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={diagnoseFile};
