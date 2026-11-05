'use strict';
// O estado dos ecrãs pode vir sem fila de envio nem razão confirmado (pré-visualização, testes).
function fullState(ctx) {
  return { outbox: [], confirmed: { ledger: ctx.ledger }, ...ctx.state };
}

module.exports = { fullState };
