(() => {
 'use strict';
 const R=ReconciliationModel,host=document.createElement('section');host.id='reconciliationCenter';host.className='panel reconciliation-center-panel';document.querySelector('#accounts').append(host);
 const labels={'pending-transfer':'Transferência por confirmar','possible-duplicate':'Possível movimento duplicado','missing-source-account':'Conta de origem em falta','invalid-transfer-target':'Conta de destino inválida','invalid-pending-transfer':'Transferência pendente inconsistente','missing-opening-balance':'Saldo inicial por definir','balance-cache-divergence':'Saldo guardado diferente do calculado','unexplained-statement-difference':'Extrato com diferença por explicar','statement-unavailable':'Conferência indisponível','duplicate-transaction-evidence':'Identificador repetido na evidência','invalid-amount':'Valor inválido','invalid-date':'Data inválida','invalid-target-date':'Data de entrada inválida','adjustment-without-direction':'Ajuste sem direção','invalid-transaction-type':'Tipo de movimento inválido','unsafe-total':'Total fora dos limites'};
 const action=(text,attr,id,cls='secondary')=>`<button type="button" class="${cls}" ${attr}="${esc(id)}">${text}</button>`;
 function render(){
  if(!['accounts','wealthMoneyHub'].includes(view))return;
  const report=R.diagnoseLedger(data),pairs=R.candidates(data),pending=data.transactions.filter(t=>t.type==='transfer'&&t.transferStatus==='pending');
  const okAccounts=report.accounts.filter(a=>a.difference===0).length;
  const diffAccounts=report.accounts.filter(a=>a.difference!==0).length;
  host.innerHTML=
   `<div class="u-head reconciliation-head">`+
    `<div><p class="eyebrow">CONFERÊNCIA E INTEGRIDADE</p><h2>Centro de Reconciliação</h2>`+
    `<p>Saldo calculado = saldo inicial + movimentos. As diferenças e sugestões abaixo ajudam a conferir extratos sem alterar dados automaticamente.</p></div>`+
    `<div class="reconciliation-summary-pills">`+
     `<span class="reconcile-pill is-ok"><b>${okAccounts}</b> conta(s) certa(s)</span>`+
     (diffAccounts?`<span class="reconcile-pill is-warn"><b>${diffAccounts}</b> por conferir</span>`:'')+
     `<span class="reconcile-pill"><b>${pending.length}</b> transferência(s) pendente(s)</span>`+
     `<span class="reconcile-pill"><b>${pairs.length}</b> par(es) sugerido(s)</span>`+
    `</div>`+
   `</div>`+
   `<div class="u-table-scroll"><table class="u-table reconciliation-center-table"><thead><tr><th>Conta</th><th>Saldo inicial</th><th>Movimentos</th><th>Saldo calculado</th><th>Saldo guardado</th><th>Diferença</th><th>Ação</th></tr></thead><tbody>`+
   report.accounts.map(a=>{
    const diffBadge=a.difference===0?'<span class="reconcile-badge is-ok">Coincidente (0,00 €)</span>':a.difference===null?'<span class="reconcile-badge is-warn">Por explicar</span>':`<span class="reconcile-badge is-warn">${eur(a.difference)}</span>`;
    return `<tr><td><b>${esc(a.name)}</b></td><td class="amount">${a.openingBalance===null?'<span class="muted">Por definir</span>':eur(a.openingBalance)}</td><td class="amount">${eur(a.net)}</td><td class="amount"><b>${a.calculatedBalance===null?'Indisponível':eur(a.calculatedBalance)}</b></td><td class="amount">${eur(a.savedBalance)}</td><td>${diffBadge}</td><td>${action('Conferir extrato','data-reconcile-account',a.id,'primary')}</td></tr>`;
   }).join('')+
   `</tbody></table></div>`+
   report.accounts.filter(a=>a.statementDifference).map(a=>`<div class="reconcile-alert-banner"><span>⚠️ <b>${esc(a.name)}</b>: diferença registada no último extrato de <b>${eur(a.statementDifference)}</b>. Confere as datas e os movimentos antes de criar qualquer ajuste.</span></div>`).join('')+
   `<div class="reconciliation-subgrid">`+
    `<section class="reconciliation-subcard"><h3>↔ Transferências por confirmar (${pending.length})</h3>`+
     (pending.slice(0,100).map(t=>`<div class="attention-row reconcile-item-row"><div><b>${esc(t.account)} · ${dateLabel(t.date)} · ${eur(t.amount)}</b><p>${t.observedSide==='income'?'Entrada':'Saída'} · ${esc(t.description)} · <span class="muted">${esc(t.suggestedTargetAccount||'Sem contraparte confirmada')}</span></p></div>${action('Rever movimento','data-reconcile-movement',t.id)}</div>`).join('')||'<p class="reconcile-empty-inline">Sem transferências pendentes de confirmação.</p>')+
    `</section>`+
    `<section class="reconciliation-subcard"><h3>🔗 Pares possíveis (${pairs.length})</h3>`+
     (pairs.slice(0,100).map((p,i)=>`<div class="attention-row reconcile-item-row"><div><b>${esc(p.from)} → ${esc(p.to)} · ${eur(p.amount)}</b><p>${dateLabel(p.date)} / ${dateLabel(p.targetDate)}${p.ambiguous?' · <span class="reconcile-badge is-warn">Várias correspondências</span>':''}${p.blocked?' · <span class="muted">Mês fechado ou movimento conferido</span>':''}</p></div>${p.blocked?'':action('Conferir par','data-reconcile-pair',i,'primary')}</div>`).join('')||'<p class="reconcile-empty-inline">Sem pares possíveis detetados no intervalo de três dias.</p>')+
    `</section>`+
   `</div>`+
   `<details class="reconciliation-diagnostics-details"><summary><span><b>Diagnóstico técnico e possíveis duplicados</b><small>${report.issues.length ? report.issues.length + ' alerta(s) encontrado(s)' : 'Nenhum problema de integridade detetado'}</small></span></summary><div class="reconciliation-issues-list">`+
   (report.issues.length ? report.issues.map(i=>`<div class="reconcile-issue-row"><span class="reconcile-badge is-warn">${esc(labels[i.code]||i.code)}</span><span>${esc(i.transactionId||'Conta')}</span><small class="muted">${esc(String(i.detail??''))}</small></div>`).join('') : '<p class="muted">Todos os movimentos e saldos respeitam as regras de integridade.</p>')+
   `</div></details>`;
  host.querySelectorAll('[data-reconcile-account]').forEach(b=>b.onclick=()=>reconcileForm(b.dataset.reconcileAccount));
  host.querySelectorAll('[data-reconcile-movement]').forEach(b=>b.onclick=()=>transferForm(null,b.dataset.reconcileMovement));
  host.querySelectorAll('[data-reconcile-pair]').forEach(b=>b.onclick=()=>{const p=pairs[Number(b.dataset.reconcilePair)],out=data.transactions.find(t=>String(t.id)===String(p.outId)),incoming=data.transactions.find(t=>String(t.id)===String(p.inId));const fingerprint=JSON.stringify([out,incoming]);form('Conferir transferência',`<p>${esc(p.from)} → ${esc(p.to)} · ${eur(p.amount)}</p><p>Saída: ${dateLabel(p.date)} · ${esc(out.description)}<br>Entrada: ${dateLabel(p.targetDate)} · ${esc(incoming.description)}</p><p>Os dois registos observados serão preservados como evidência num único movimento. Os saldos mantêm os efeitos já registados.</p>`,()=>commit(()=>{const current=[data.transactions.find(t=>String(t.id)===String(p.outId)),data.transactions.find(t=>String(t.id)===String(p.inId))];if(JSON.stringify(current)!==fingerprint)throw Error('Os movimentos mudaram. Revê novamente o par.');FinancePlus.pairTransfer(data,p.outId,p.inId);},'Transferência confirmada pelo par selecionado.'),'Confirma as duas linhas no extrato antes de guardar.','Confirmar par');});
 }
 const prior=PremiumUI.render;PremiumUI.render=()=>{prior?.();render();};const nav=PremiumUI.navigation;PremiumUI.navigation=v=>{nav?.(v);if(['accounts','wealthMoneyHub'].includes(v))render();};window.ReconciliationUI=Object.freeze({render});render();
})();
