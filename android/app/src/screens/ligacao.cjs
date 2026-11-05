'use strict';
const kit = require('../ui/kit.cjs');
const P = require('../../../shared/protocol.cjs');

// O estado dos ecrãs pode vir sem fila de envio nem razão confirmado (pré-visualização, testes).
function fullState(ctx) {
  return { outbox: [], confirmed: { ledger: ctx.ledger }, ...ctx.state };
}

function back(page, label) {
  return '<button type="button" class="back" data-page="' + page + '">' + label + '</button>';
}

const STATUS = {
  pending: 'Por enviar', sending: 'Envio por confirmar', acknowledged: 'Confirmado pelo servidor',
  conflict: 'Conflito — proposta local preservada', rejected: 'Recusado — proposta local preservada', blocked: 'Bloqueado por dependência',
};

function queueEntry(x) {
  const e = kit.escape, op = x.operation;
  const state = x.resolution ? (x.resolution.choice === 'server' ? 'Revisto · versão do PC mantida' : 'Revisto · nova proposta conservada') : STATUS[x.status] || 'Revisão necessária';
  return '<section class="queue-entry"><strong>' + e(op.payload.description || op.payload.name || (op.command.startsWith('account.') ? 'Conta' : 'Movimento')) + '</strong>'
    + '<small>' + e(state) + '</small>'
    + (!x.resolution && ['conflict', 'rejected', 'blocked'].includes(x.status) ? '<button data-review="' + e(op.operationId) + '">Rever</button>' : '') + '</section>';
}

function pairing(state, connection, savedConnection) {
  if (connection) {
    return '<div class="note">PC associado · ligação guardada com proteção do Android. Podes continuar a registar sem rede.</div>'
      + '<button type="button" id="sync" class="primary full">Sincronizar</button><button type="button" id="review-detach" class="full">Preparar nova ligação</button>';
  }
  if (savedConnection && savedConnection.kind === 'pairing') {
    return '<div class="note">Existe uma associação por concluir. O código e a credencial estão guardados com proteção do Android.</div>'
      + '<button type="button" id="resume-pair" class="primary full">Retomar associação</button><button type="button" id="cancel-pair" class="full">Cancelar tentativa</button>';
  }
  const L = state.confirmed.ledger;
  const needsConfirm = state.outbox.length || L.transactions.length || (L.pendingPayments && L.pendingPayments.length) || (L.casa && L.casa.catalog && L.casa.catalog.length)
    || state.movementDraft || state.commitmentDraft || state.paymentDraft || state.accountDraft || state.houseDraft;
  return '<div class="note">No PC de ensaio, cria um código para este dispositivo. Podes associar uma base vazia ou confirmar a substituição pelos dados do PC. Nesse caso, o estado local fica conservado num ponto anterior.</div>'
    + '<form id="pairing"><label>Endereço apresentado no PC<input name="server" id="pair-server" type="url" placeholder="https://pc:…" required autocomplete="off"></label>'
    + '<label>Código do PC<input name="code" id="pair-code" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" required autocomplete="off" autocapitalize="characters"></label>'
    + '<label class="note"><input type="checkbox" name="replaceLocal" value="yes" ' + (needsConfirm ? 'required' : '') + '> Se este aparelho já tiver dados, confirmo substituí-los pelos dados do PC e conservar o estado local num ponto anterior. Esta ação não junta as duas bases.</label>'
    + '<button type="button" id="pair" class="primary">Associar este dispositivo</button></form>';
}

// Ligação ao PC. view: {connection, savedConnection} (estado de ligação que main.js possui).
function render(ctx, view = {}) {
  const state = fullState(ctx);
  const status = view.connection ? 'PC associado' : view.savedConnection && view.savedConnection.kind === 'pairing' ? 'Associação por concluir' : 'Sem PC associado';
  return back('mais', '‹ Mais') + '<h1>Ligação</h1><p class="sub">Ensaio local · associação e sincronização</p>'
    + '<button data-page="recuperacao" class="full">Cópia e recuperação</button>'
    + kit.card({ title: 'Associação', subtitle: status, body: pairing(state, view.connection, view.savedConnection) })
    + kit.card({ title: 'Alterações deste dispositivo', subtitle: state.outbox.length ? state.outbox.length + ' na fila' : '', body: '<div class="queue">' + (state.outbox.map(queueEntry).join('') || '<p class="sub">Sem alterações pendentes.</p>') + '</div>' });
}

// Rever uma diferença de sincronização. view: {conflictId}.
function conflict(ctx, view = {}) {
  const e = kit.escape, state = fullState(ctx), hidden = ctx.state.hidden;
  const entry = state.outbox.find(r => r.operation.operationId === view.conflictId);
  if (!entry || entry.resolution) return '<h1>Proposta já revista</h1><button data-page="sync">Voltar à ligação</button>';
  const op = entry.operation, proposed = op.payload;
  if (op.command.startsWith('commitment.') || op.command.startsWith('house.') || op.command.startsWith('account.')) {
    return back('sync', '‹ Ligação') + '<h1>Rever proposta</h1><p>' + e((entry.receipt && entry.receipt.message) || 'Os dados mudaram.') + '</p>'
      + '<h2>Proposta conservada</h2><pre class="proposal">' + (hidden ? 'Valores ocultos' : e(JSON.stringify(proposed, null, 2))) + '</pre>'
      + '<p class="sub">Manter a versão do PC conserva a proposta no histórico. Repetir envia os mesmos campos apresentados com novas pré-condições; um pagamento nunca pode exceder o restante.</p>'
      + '<div class="review-actions"><button id="keep-server">Manter versão do PC</button><button id="repeat-extended">Repetir proposta apresentada</button></div>';
  }
  const confirmed = state.confirmed.ledger.transactions.find(t => t.id === proposed.id);
  const isDelete = op.command === 'movement.delete';
  const canRevise = op.command.endsWith('.add') || !!confirmed;
  return back('sync', '‹ Voltar') + '<h1>Rever diferença</h1><p class="sub">Escolhe explicitamente o que queres manter. As propostas anteriores ficam no histórico.</p>'
    + '<div class="comparison"><section class="review-card"><h2>Versão confirmada no PC</h2>'
    + (confirmed
      ? '<strong>' + e(confirmed.description) + '</strong><p class="review-value">' + kit.money(P.Finance.cents(confirmed.amount), hidden) + '</p>'
        + '<small>' + e(confirmed.date) + ' · ' + e(confirmed.account) + (confirmed.targetAccount ? ' → ' + e(confirmed.targetAccount) : '') + '</small>'
      : '<p>O movimento não existe no estado confirmado.</p>')
    + '</section><section class="review-card"><h2>A tua proposta</h2><strong>' + e(proposed.description || 'Movimento') + '</strong>'
    + '<p class="review-value">' + (isDelete ? 'Eliminar movimento' : kit.money(proposed.amountCents, hidden)) + '</p><small>' + e(proposed.date || '') + '</small></section></div>'
    + '<p class="sub">' + e((entry.receipt && entry.receipt.message) || 'A alteração precisa de revisão.') + '</p>'
    + '<div class="review-actions"><button class="primary" id="keep-server">Manter versão do PC</button>'
    + (canRevise ? '<button id="revise-local">' + (isDelete ? 'Repetir eliminação' : 'Rever minha proposta') + '</button>' : '<p class="sub">Uma edição antiga não pode recriar um movimento eliminado.</p>')
    + '</div>';
}

// Cópia e recuperação. view: {points, file} (pontos guardados e cópia escolhida, estado que main.js possui).
function recovery(ctx, view = {}) {
  const points = view.points || [], file = view.file;
  return back('sync', '‹ Ligação') + '<h1>Cópia e recuperação</h1>'
    + '<p class="sub">Cópia encriptada dos dados e rascunhos locais. Guarda a palavra-passe: será necessária para recuperar. As credenciais da ligação ficam na proteção do Android e não são exportadas.</p>'
    + '<label>Palavra-passe da cópia<input id="backup-password" type="password" minlength="10" maxlength="512" autocomplete="off"></label>'
    + '<div class="review-actions"><button id="export-backup" class="primary">Guardar cópia encriptada</button><button id="choose-backup">Escolher cópia para recuperar</button>'
    + (file ? '<button id="open-backup">Abrir cópia escolhida</button>' : '') + '</div>'
    + '<section><h2>Estados anteriores</h2><p class="sub">Conservamos até três pontos. Uma origem importada pode ser exportada novamente; só se restaura diretamente a mesma associação.</p>'
    + '<button id="list-checkpoints">Ver pontos guardados</button>'
    + points.map(r => '<article class="review-card"><strong>' + (r.revision === 0 ? 'Origem da passagem' : 'Estado anterior · revisão ' + kit.escape(r.revision)) + '</strong>'
      + '<p>' + kit.escape(r.transactions) + ' movimentos confirmados · ' + kit.escape(r.operations) + ' operações no histórico</p>'
      + '<button data-checkpoint="' + kit.escape(r.id) + '">Abrir e rever</button></article>').join('') + '</section>';
}

function confirmRecovery() {
  return '<button class="back" data-page="recuperacao">‹ Cancelar</button><h1>Rever recuperação</h1><p>O restauro substitui os dados locais e guarda o estado anterior. Só é permitido diretamente na mesma associação.</p>'
    + '<button id="confirm-recovery" class="primary full">Restaurar nesta associação</button><h2>Outro aparelho</h2>'
    + '<p>Num aparelho vazio, podes importar os dados para uso offline. Os registos antigos não são reenviados ao PC. A origem completa fica arquivada e os rascunhos que dependiam da associação anterior exigem revisão.</p>'
    + '<button id="portable-import" class="full">Preparar passagem para este aparelho</button>'
    + '<label>Palavra-passe para exportar a origem<input id="backup-password" type="password" minlength="10" maxlength="512" autocomplete="off"></label>'
    + '<button id="export-recovery-candidate">Guardar esta origem encriptada</button>';
}

function confirmDetach() {
  return '<button class="back" data-page="sync">‹ Cancelar</button><h1>Preparar nova ligação?</h1>'
    + '<p>Os dados atuais ficam disponíveis offline. O histórico original fica num ponto anterior e as operações antigas não serão reenviadas. A ligação antiga deixa de ser usada neste aparelho; revoga-a no PC se já não for necessária. A associação seguinte exige escolher os dados do PC.</p>'
    + '<button id="confirm-detach" class="primary full">Conservar dados e desligar associação</button>';
}

function confirmPassage() {
  return '<button class="back" data-page="recuperacao">‹ Cancelar</button><h1>Confirmar passagem offline?</h1>'
    + '<p>Os dados da cópia passam a ser a base local deste aparelho. O histórico original fica arquivado, sem credenciais e sem reenviar operações antigas. A ligação ao PC é feita separadamente e exige escolher os dados do PC.</p>'
    + '<button id="confirm-portable" class="primary full">Confirmar passagem</button>';
}

module.exports = { render, conflict, recovery, confirmRecovery, confirmDetach, confirmPassage };
