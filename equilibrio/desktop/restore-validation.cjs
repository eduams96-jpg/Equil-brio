'use strict';
const {migrateJsonText} = require('./migrations.cjs');
const {validateLedger} = require('./ledger-validation.cjs');
function prepareRestoreText(content) {
  const result = migrateJsonText(content), doc = result.document;
  const validate = validateLedger;
  if (doc.format === 'equilibrio-spaces') {
    if (doc.version !== 1 || !Array.isArray(doc.spaces) || !doc.spaces.length) throw Error('A cópia não contém Espaços Financeiros válidos.');
    doc.spaces = doc.spaces.map(s => {
      if (!s || typeof s.name !== 'string' || !s.name.trim()) throw Error('Espaço sem nome válido.');
      return {...s,data:validate(s.data)};
    });
  } else {
    if (doc.format) throw Error('Formato de cópia não suportado.');
    result.document=validate(doc);
  }
  return {...result,content:JSON.stringify(result.document,null,2)};
}
module.exports={prepareRestoreText};
