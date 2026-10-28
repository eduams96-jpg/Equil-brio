'use strict';
const Finance=require('../finance.js');
// O processo nativo tem de validar os mesmos domínios que o renderer. Não
// depender da ordem em que módulos opcionais foram carregados noutra janela.
require('../features-model.js');require('../complete-model.js');require('../life-model.js');require('../planning-model.js');require('../receipt-model.js');require('../practical-model.js');require('../gifts-model.js');require('../casa-finance-pilot-model.js');require('../dossiers-model.js');
const Casa=require('../casa-model.js');
function validateLedger(raw){const ledger=Finance.normalize(raw);Casa.validate(ledger);return ledger;}
module.exports={validateLedger};
