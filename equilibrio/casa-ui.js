(() => {
  'use strict';
  const C = window.CasaFinance;
  const $ = (s,host=document) => host.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur = n => new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
  const state = () => C.state(data);
  let purchaseQuery = '', purchaseLimit = 12;
  let receiptController;
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
  // Local OCR proposes a purchase. Nothing reaches the catalogue, stock or
  // ledger until the user has corrected the lines and confirmed the preview.
  function receiptNameKey(value) {
    return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function reviewReceiptInCasa(draft) {
    const before = JSON.stringify(data),origin=key;
    const products = state().catalog.filter(p=>!p.archived).slice().sort((a,b)=>a.name.localeCompare(b.name,'pt'));
    const options = products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.unit)}</option>`).join('');
    const proposedDate = Finance.validDate(draft.date) ? draft.date : '';
    form('Conferir fatura na Casa',
      '<p>Corrige as sugestões. Só os artigos assinalados entram no stock; a compra só altera o saldo se escolheres um movimento financeiro.</p>' +
      `<div class="two-cols"><label>Supermercado<input name="casaReceiptStore" value="${esc(draft.merchant || '')}" required maxlength="160"></label><label>Data da fatura<input name="casaReceiptDate" type="date" value="${esc(proposedDate)}" max="${Finance.today()}" required></label></div>` +
      `<label>Total da fatura (€)<input name="casaReceiptTotal" type="number" min="0.01" step="0.01" value="${draft.total ?? ''}" required></label>` +
      (draft.warnings?.length ? '<p class="receipt-status" role="status">'+esc(draft.warnings.join(' '))+'</p>' : '') +
      '<div id="casaReceiptLines"></div><button type="button" class="secondary" id="casaReceiptAddLine">+ Linha em falta</button><p id="casaReceiptBalance" role="status" aria-live="polite"></p>' +
      `<details class="workflow-detail"><summary>Texto lido e linhas por esclarecer (${draft.unresolved.length})</summary><p>${esc(draft.unresolved.join(' · '))}</p><pre style="white-space:pre-wrap">${esc(draft.text.slice(0, 60000))}</pre></details>` +
      '<label class="checkbox"><input type="checkbox" name="casaReceiptConfirmed" required> Conferi a loja, a data, os artigos, o stock, os preços e o total. Este registo não cria movimentos financeiros.</label>',
      values => {
        if (!values.has('casaReceiptConfirmed')) throw Error('Confirma a revisão da fatura antes de guardar.');
        if (key !== origin || JSON.stringify(data) !== before) throw Error('Os dados mudaram. Volta a ler a fatura para rever o catálogo e as despesas.');
        const items = [...document.querySelectorAll('#casaReceiptLines .casa-receipt-line')]
          .filter(row=>!row.querySelector('[data-receipt-omit]').checked)
          .map(row=>({
            name:row.querySelector('[data-receipt-name]').value.trim(),
            sourceName:row.dataset.sourceName || row.querySelector('[data-receipt-name]').value.trim(),
            total:Number(row.querySelector('[data-receipt-total]').value),
            stock:row.querySelector('[data-receipt-stock]').checked,
            catalogId:row.querySelector('[data-receipt-product]').value,
            unit:row.querySelector('[data-receipt-unit]').value,
            packages:Number(row.querySelector('[data-receipt-packages]').value),
            packageQty:Number(row.querySelector('[data-receipt-size]').value),
            productCategory:row.querySelector('[data-receipt-category]').value.trim(),
          }));
        return commit(() => {
          const id = C.addReceiptPurchase(data,{
            store:values.get('casaReceiptStore'),
            id:window.DraftUI?.token()?.id,
            date:values.get('casaReceiptDate'),
            total:Number(values.get('casaReceiptTotal')),
            items,
            text:draft.text,
          });
          if (values.has('receiptLearn')) ReceiptFinance.remember(data,values.get('casaReceiptStore'),C.state(data).purchases.find(p=>p.id===id).items,'product',values.get('receiptLearnScope')==='all');
        }, 'Fatura confirmada: compra, preços e stock guardados.');
      },
      'A leitura decorre neste computador. A imagem/PDF serve apenas para sugerir os dados e não é guardada na Casa.',
      'Confirmar compra e stock');
    const lines = $('#casaReceiptLines');
    const totalInput = document.querySelector('#modal [name=casaReceiptTotal]');
    const dateInput = document.querySelector('#modal [name=casaReceiptDate]');
    function updateBalance() {
      const selected = [...lines.querySelectorAll('.casa-receipt-line')].filter(row=>!row.querySelector('[data-receipt-omit]').checked);
      const sum = selected.reduce((n,row)=>n+Finance.cents(row.querySelector('[data-receipt-total]').value || 0),0);
      const invoice = Finance.cents(totalInput.value || 0);
      $('#casaReceiptBalance').textContent = `Artigos: ${eur(sum/100)} · Fatura: ${eur(invoice/100)} · Diferença: ${eur((invoice-sum)/100)}`;
    }
    function addLine(item={name:'',quantity:1,amount:'',category:'Outros'}) {
      if (lines.children.length >= 200) return notice('Máximo de 200 artigos.',true);
      const name = String(item.name || '').trim();
      const matched = products.find(p=>receiptNameKey(p.name)===receiptNameKey(name));
      const quantity = Number(item.quantity);
      const amount = Number(item.amount);
      const packages = Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000 &&
        Number.isFinite(amount) && Finance.cents(amount) % quantity === 0 ? quantity : 1;
      const size = Number.isFinite(quantity) && quantity > 0 && Math.round(quantity*1000)===quantity*1000 ? quantity/packages : 1;
      const category = String(item.category || 'Outros');
      const checked = !!matched || ['Alimentação','Casa','Higiene'].includes(category);
      const row = document.createElement('fieldset');
      row.className = 'panel casa-receipt-line';
      row.dataset.sourceName = name;
      row.innerHTML = `<legend>Artigo ${lines.children.length+1}</legend>` +
        `<div class="two-cols"><label>Produto<input data-receipt-name value="${esc(name)}" maxlength="160" required></label><label>Total da linha (€)<input data-receipt-total type="number" min="0.01" step="0.01" value="${Number.isFinite(amount)&&amount>0?amount:''}" required></label></div>` +
        `<label class="checkbox"><input data-receipt-stock type="checkbox" ${checked?'checked':''}> Adicionar ao stock</label>` +
        `<div data-receipt-stock-fields ${checked?'':'hidden'}><div class="two-cols"><label>Produto do catálogo<select data-receipt-product><option value="">Novo produto</option>${options}</select></label><label>Unidade<select data-receipt-unit>${C.stockUnits.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select></label></div>` +
        `<div class="two-cols"><label>Embalagens<input data-receipt-packages type="number" min="1" step="1" value="${packages}"></label><label>Conteúdo por embalagem<input data-receipt-size type="number" min="0.001" step="0.001" value="${size}"></label></div>` +
        `<label>Categoria para novos produtos<input data-receipt-category value="${esc(category)}" maxlength="80"></label><small data-receipt-price></small></div>` +
        `<label class="checkbox"><input data-receipt-omit type="checkbox"> Ignorar esta linha</label>`;
      lines.append(row);
      row.querySelectorAll('input,select').forEach((el,i)=>el.name='casaLine'+(lines.children.length-1)+'Field'+i);
      const stock = row.querySelector('[data-receipt-stock]');
      const stockFields = row.querySelector('[data-receipt-stock-fields]');
      const product = row.querySelector('[data-receipt-product]');
      const unit = row.querySelector('[data-receipt-unit]');
      product.value = matched?.id || '';
      unit.value = matched?.unit || 'un';
      unit.disabled = !!matched;
      stock.onchange = () => { stockFields.hidden = !stock.checked; updateBalance(); };
      product.onchange = () => { const p=products.find(p=>p.id===product.value); unit.value=p?.unit||'un'; unit.disabled=!!p; updateLinePrice(); };
      function updateLinePrice() {
        const count=Number(row.querySelector('[data-receipt-packages]').value), value=Number(row.querySelector('[data-receipt-total]').value);
        row.querySelector('[data-receipt-price]').textContent = count>0 && Number.isSafeInteger(count) && Number.isFinite(value) && value>0 && Finance.cents(value)%count===0
          ? `Preço por embalagem: ${eur(value/count)} · Entrada: ${count*Number(row.querySelector('[data-receipt-size]').value)} ${unit.value}`
          : 'Ajusta quantidade e total para obter um preço por embalagem em cêntimos.';
        updateBalance();
      }
      row.oninput = updateLinePrice;
      row.querySelector('[data-receipt-omit]').onchange = event => {
        row.querySelectorAll('input:not([data-receipt-omit]),select').forEach(control=>control.disabled=event.target.checked || (control===unit && !!product.value));
        updateBalance();
      };
      updateLinePrice();
      window.ReceiptAssistanceUI?.refreshReview();
    }
    draft.items.forEach(addLine);
    if (!draft.items.length) addLine();
    $('#casaReceiptAddLine').onclick = () => addLine();
    totalInput.oninput = () => {  updateBalance(); };
    dateInput.onchange = updateBalance;

     updateBalance();
    window.ReceiptAssistanceUI?.enhanceReview("product");
    window.DraftUI?.begin('casaReceipt',()=>({draft:{...draft,items:[...lines.children].map(row=>({name:row.querySelector('[data-receipt-name]').value,quantity:Number(row.querySelector('[data-receipt-packages]').value),amount:Number(row.querySelector('[data-receipt-total]').value),category:row.querySelector('[data-receipt-category]').value}))}}));
  }
  function readReceiptInCasa() {
    form('Ler fatura para a Casa',
      '<p>A leitura é local. As linhas serão apenas sugestões; confirma tudo antes de adicionar produtos ou stock.</p><label>Imagem ou PDF<input name="casaReceiptFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><p id="casaReceiptProgress" role="status">Imagens até 10 MB; PDF até 8 MB e 10 páginas.</p>',
      async values => {
        const origin = key, stamp = JSON.stringify(data);
        receiptController?.abort();
        receiptController = new AbortController();
        const own = receiptController;
        const result = await ReceiptReader.read(values.get('casaReceiptFile'),message=>{
          const progress = $('#casaReceiptProgress');
          if (progress) progress.textContent = message;
        },own.signal,{attachment:false});
        if (own.signal.aborted || key!==origin || JSON.stringify(data)!==stamp)
          throw Error('A leitura foi interrompida ou os dados mudaram. Abre novamente a fatura.');
        reviewReceiptInCasa(ReceiptFinance.parse(result.text));
        return false;
      },
      'A imagem/PDF não fica guardada na Casa. Guarda o original fora da aplicação se precisares dele.',
      'Ler e conferir');
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
    $('#casaPurchases').innerHTML=`<div class="section-head"><div><h2>Compras</h2><p>Registos de compras, artigos e stock da Casa.</p></div><div class="casa-actions"><button type="button" id="casaReadReceipt" class="secondary">Ler fatura</button><button type="button" id="casaNewPurchase" class="primary">+ Nova compra</button></div></div><div class="casa-summary-grid"><article class="casa-summary-card"><span>Compras líquidas este mês</span><strong>${eur(total)}</strong><small>Compras menos reembolsos do mês</small></article><article class="casa-summary-card"><span>Compras este mês</span><strong>${purchases.length}</strong><small>Registos neste espaço</small></article></div><label class="casa-search-label">Pesquisar compras<input id="casaPurchaseSearch" type="search" placeholder="Loja, artigo ou texto da fatura"></label><div id="casaPurchaseList" class="casa-card-grid"></div>`;
    $('#casaNewPurchase').onclick=purchaseForm;
    $('#casaReadReceipt').onclick=readReceiptInCasa;
    $('#casaPurchaseSearch').value=purchaseQuery;
    const paint = () => {
      const q=ReceiptFinance.nameKey($('#casaPurchaseSearch').value),terms=q.split(' ').filter(Boolean);
      const rows=c.purchases.filter(p=>{const text=ReceiptFinance.nameKey([p.store,p.receiptText,...p.items.flatMap(i=>[i.name,i.sourceName])].filter(Boolean).join(' '));return terms.every(term=>text.includes(term));}).slice().sort((a,b)=>b.date.localeCompare(a.date));
      $('#casaPurchaseList').innerHTML=rows.length?rows.slice(0,purchaseLimit).map(p=>`<article class="casa-product-card"><h3>${esc(p.store)}</h3><p>${esc(new Date(p.date+'T12:00:00').toLocaleDateString('pt-PT'))} · ${p.items.length} ${p.items.length===1?'artigo':'artigos'}</p><strong>${eur(p.total)}</strong><span class="casa-connection ${p.transactionId?'':'unlinked'}">${p.transactionId?'✓ Movimento associado':'Sem movimento financeiro'}</span><button type="button" class="secondary" data-purchase="${esc(p.id)}">Ver compra</button></article>`).join('')+(rows.length>purchaseLimit?`<button type="button" class="secondary casa-more-purchases" id="casaMorePurchases">Mostrar mais compras · ${rows.length-purchaseLimit} por ver</button>`:''):`<div class="casa-empty"><strong>${q?'Não encontrámos essa compra':'As compras da casa começam aqui'}</strong><p>${q?'Experimenta outro supermercado ou nome de artigo.':'Usa “Nova compra” para registar os artigos e escolher se queres debitar uma conta.'}</p></div>`;
      document.querySelectorAll('[data-purchase]').forEach(b=>b.onclick=()=>openPurchase(b.dataset.purchase));
      $('#casaMorePurchases')?.addEventListener('click',()=>{purchaseLimit+=12;paint();});
    }; $('#casaPurchaseSearch').oninput=e=>{purchaseQuery=e.target.value;purchaseLimit=12;paint();}; paint();
    // O Resumo é exclusivamente financeiro. Toda a informação Casa fica na área Casa.
    $('#casaDashboardStrip')?.remove();
  }
  window.CasaUI=Object.freeze({render,purchaseForm,openPurchase,readReceiptInCasa,reviewReceiptInCasa});
  document.getElementById('modal').addEventListener('close',()=>receiptController?.abort());
  const previousNav=PremiumUI.navigation;
  PremiumUI.navigation=v=>{previousNav?.(v);if(v?.startsWith('casa')){const add=$('#addTransaction');add.hidden=false;add.textContent=v==='casaShopping'?'+ Adicionar artigo':'+ Nova compra';add.onclick=v==='casaShopping'?()=>$('#casaQuickItem')?.focus():purchaseForm;}else if(v==='dashboard'){const add=$('#addTransaction');add.hidden=false;add.textContent='+ Novo movimento';add.onclick=()=>transactionForm();}};
  render();PremiumUI.navigation(view);
})();
