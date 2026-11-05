(() => {
  'use strict';
  const C = window.CasaFinance;
  const $ = (s,host=document) => host.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur = n => new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
  const state = () => C.state(data);
  let purchaseQuery = '', purchaseLimit = 12;
  function purchaseForm() {
    form('Nova compra Casa', `<label>Supermercado<input name="casaStore" required maxlength="160"></label><label>Data<input name="casaDate" type="date" required max="${Finance.today()}" value="${Finance.today()}"></label><div id="casaPurchaseLines"></div><button type="button" id="casaAddLine" class="secondary">+ Adicionar artigo</button><p id="casaPurchaseTotal" role="status"></p>`, values => {
      const items = [...document.querySelectorAll('#casaPurchaseLines .casa-entry')].map(row=>({name:$('[name=casaItemName]',row).value.trim(),total:Number($('[name=casaItemTotal]',row).value)}));
      return commit(()=>C.addPurchase(data,{store:values.get('casaStore'),date:values.get('casaDate'),items}),'Compra Casa guardada.');
    },'Indica o valor total de cada artigo ou conjunto de embalagens. Este registo fica apenas na Casa e não altera os movimentos financeiros.');
    const update = () => { $('#casaPurchaseTotal').textContent = 'Total: ' + eur([...document.querySelectorAll('[name=casaItemTotal]')].reduce((sum,e)=>sum+Finance.cents(e.value),0)/100); };
    const addLine = () => {
      const row = document.createElement('div'); row.className='casa-entry two-cols';
      row.innerHTML='<label>Artigo<input name="casaItemName" required maxlength="160"></label><label>Valor total (€)<input name="casaItemTotal" type="number" min="0" step="0.01" required></label><button type="button" class="link-button">Remover artigo</button>';
      row.querySelector('button').onclick=()=>{row.remove();update();}; row.oninput=update;
      $('#casaPurchaseLines').append(row); update();
    };
    $('#casaAddLine').onclick=addLine; addLine();
  }
  function openPurchase(id) {
    const p = state().purchases.find(p=>p.id===id); if(!p) return notice('Compra não encontrada.',true);
    const t = data.transactions.find(t=>t.id===p.transactionId);
    const proof=t?.attachment||p.preservedPayment?.attachment;
    const details = (proof?'<button type="button" id="casaOpenProof" class="secondary">Abrir comprovativo</button>':'')+`<p>${esc(p.date)} · <strong>${eur(p.total)}</strong></p><ul>${p.items.map(i=>`<li>${esc(i.name)} — ${eur(i.total)}${i.catalogId?`<br>${i.packages} embalagens × ${i.packageQty} ${esc(i.unit)} = ${i.qty} ${esc(i.unit)} de stock`:''}</li>`).join('')}</ul>`;
    form('Compra · '+esc(p.store), details + (t ? `<div class="casa-link-preview"><b>Movimento associado</b><p>${esc(t.description)} · ${esc(t.account)} · ${esc(t.category)} · ${eur(t.amount)}</p><button type="button" id="casaOpenMovement" class="secondary">Abrir movimento</button></div>` : '<p class="casa-independent-note">Registo exclusivo da Casa; sem movimento financeiro.</p>') + '<button type="button" id="casaDeletePurchase" class="secondary">Eliminar compra…</button>',()=>true,t ? 'A compra e o movimento são guardados em conjunto. Usa “Corrigir valores” para ajustar os preços sem perder os lotes e o histórico.' : 'Esta compra não altera as contas financeiras.','Fechar');
    $('#casaOpenProof')?.addEventListener('click',()=>actions.receipt(null,proof));
    $('#casaOpenMovement')?.addEventListener('click',()=>{document.getElementById('modal')?.close();openMovement(t.id);});
    $('#casaDeletePurchase').onclick=()=>{
      form('Eliminar compra',`<p>Eliminar a compra de ${esc(p.store)} (${eur(p.total)})? ${t?'O movimento associado também será eliminado e o valor será reposto na conta.':''} ${p.stockPosted?'As entradas de stock desta compra também serão retiradas. Os artigos não regressam automaticamente à lista.':''}</p>`,()=>commit(()=>C.removePurchase(data,id),'Compra eliminada.'),'','Eliminar compra');
    };
    window.CasaDailyUI?.enhancePurchase(id);
    window.CasaCompleteUI?.enhancePurchase(id);
  }
  function render() {
    const c=state(), month=Finance.today().slice(0,7), purchases=c.purchases.filter(p=>p.date.startsWith(month));
    const total=CasaDaily.insights(data,month).total;
    const I=n=>window.InterfaceUI?.icon?InterfaceUI.icon(n):'';
    const year=month.slice(0,4),yearRows=c.purchases.filter(p=>p.date.startsWith(year)),average=purchases.length?purchases.reduce((n,p)=>n+Finance.cents(p.total),0)/100/purchases.length:0;
    const storeTotals=new Map();for(const p of yearRows)storeTotals.set(p.store,(storeTotals.get(p.store)||0)+1);const topStore=[...storeTotals].sort((a,b)=>b[1]-a[1])[0];
    const hue=s=>{let h=0;for(const ch of String(s||''))h=(h*31+ch.charCodeAt(0))%360;return h;};
    const monthName=m=>new Date(m+'-01T12:00:00').toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
    $('#casaPurchases').innerHTML=`<div class="section-head cp-head"><div><h2>Compras</h2><p>Registos de compras, artigos e stock da Casa.</p></div><div class="casa-actions"><button type="button" id="casaNewPurchase" class="primary">${I('plus')}Nova compra</button></div></div>
      <div class="casa-summary-grid cp-tiles"><article class="ch-tile is-blue"><span class="ch-tile-icon">${I('cart')}</span><div><span>Compras líquidas este mês</span><strong>${eur(total)}</strong><small>Compras menos reembolsos do mês</small></div></article><article class="ch-tile is-green"><span class="ch-tile-icon">${I('document')}</span><div><span>Compras este mês</span><strong>${purchases.length}</strong><small>Registos neste espaço</small></div></article><article class="ch-tile is-amber"><span class="ch-tile-icon">${I('chart')}</span><div><span>Média por compra</span><strong>${eur(average)}</strong><small>neste mês</small></div></article><article class="ch-tile is-purple"><span class="ch-tile-icon">${I('star')}</span><div><span>Loja mais usada · ${year}</span><strong>${topStore?esc(topStore[0]):'—'}</strong><small>${topStore?topStore[1]+' '+(topStore[1]===1?'compra':'compras'):'Sem compras este ano'}</small></div></article></div>
      <div class="casa-actions casa-purchases-toolbar cp-toolbar"><label class="cs-search casa-purchase-search">${I('search')}<input id="casaPurchaseSearch" type="search" placeholder="Pesquisar loja ou artigo" aria-label="Pesquisar compras"></label></div><div id="casaPurchaseList" class="cp-list"></div>`;
    $('#casaNewPurchase').onclick=purchaseForm;
    $('#casaPurchaseSearch').value=purchaseQuery;
    const card=p=>`<article class="casa-product-card cp-card"><span class="cp-badge" style="--h:${hue(p.store)}">${esc(String(p.store||'?').trim().charAt(0).toUpperCase())}</span><div class="cp-main"><h3>${esc(p.store)}</h3><p>${esc(new Date(p.date+'T12:00:00').toLocaleDateString('pt-PT',{weekday:'short',day:'2-digit',month:'short'}))} · ${p.items.length} ${p.items.length===1?'artigo':'artigos'}</p>${p.items.length?`<small class="cp-items">${p.items.slice(0,3).map(i=>esc(i.name)).join(' · ')}${p.items.length>3?' · +'+(p.items.length-3):''}</small>`:''}</div><div class="cp-side"><strong>${eur(p.total)}</strong><span class="casa-connection ${p.transactionId?'':'unlinked'}">${p.transactionId?'✓ Movimento associado':'Sem movimento financeiro'}</span></div><button type="button" class="secondary" data-purchase="${esc(p.id)}">Ver compra</button></article>`;
    const paint = () => {
      const q=ReceiptFinance.nameKey($('#casaPurchaseSearch').value),terms=q.split(' ').filter(Boolean);
      const rows=c.purchases.filter(p=>{const text=ReceiptFinance.nameKey([p.store,p.receiptText,...p.items.flatMap(i=>[i.name,i.sourceName])].filter(Boolean).join(' '));return terms.every(term=>text.includes(term));}).slice().sort((a,b)=>b.date.localeCompare(a.date));
      const shown=rows.slice(0,purchaseLimit),groups=[];for(const p of shown){const m=p.date.slice(0,7);let g=groups.at(-1);if(!g||g.month!==m){g={month:m,rows:[]};groups.push(g);}g.rows.push(p);}
      $('#casaPurchaseList').innerHTML=rows.length?groups.map(g=>`<section class="cp-month"><h3><span>${esc(monthName(g.month))}</span><small>${g.rows.length} ${g.rows.length===1?'compra':'compras'} · ${eur(g.rows.reduce((n,p)=>n+Finance.cents(p.total),0)/100)}</small></h3><div class="casa-card-grid cp-grid">${g.rows.map(card).join('')}</div></section>`).join('')+(rows.length>purchaseLimit?`<button type="button" class="secondary casa-more-purchases" id="casaMorePurchases">Mostrar mais compras · ${rows.length-purchaseLimit} por ver</button>`:''):`<div class="casa-empty cp-empty">${I(q?'search':'cart')}<strong>${q?'Não encontrámos essa compra':'As compras da casa começam aqui'}</strong><p>${q?'Experimenta outro supermercado ou nome de artigo.':'Usa “Nova compra” para registar os artigos, o supermercado e o stock recebido.'}</p>${q?'':`<div class="cp-empty-actions"><button type="button" class="primary" data-cp-new>${I('plus')}Nova compra</button></div>`}</div>`;
      document.querySelectorAll('[data-purchase]').forEach(b=>b.onclick=()=>openPurchase(b.dataset.purchase));
      $('[data-cp-new]')?.addEventListener('click',purchaseForm);
      $('#casaMorePurchases')?.addEventListener('click',()=>{purchaseLimit+=12;paint();});
    }; $('#casaPurchaseSearch').oninput=e=>{purchaseQuery=e.target.value;purchaseLimit=12;paint();}; paint();
    // O Resumo é exclusivamente financeiro. Toda a informação Casa fica na área Casa.
    $('#casaDashboardStrip')?.remove();
  }
  window.CasaUI=Object.freeze({render,purchaseForm,openPurchase});
  const previousNav=PremiumUI.navigation;
  PremiumUI.navigation=v=>{previousNav?.(v);if(v?.startsWith('casa')){const add=$('#addTransaction');add.hidden=false;add.textContent=v==='casaShopping'?'+ Adicionar artigo':'+ Nova compra';add.onclick=v==='casaShopping'?()=>$('#casaQuickItem')?.focus():purchaseForm;}else if(v==='dashboard'){const add=$('#addTransaction');add.hidden=false;add.textContent='+ Novo movimento';add.onclick=()=>transactionForm();}};
  render();PremiumUI.navigation(view);
})();
