/* Explicit article suggestions, document text and purchase progress. */
(() => {
  'use strict';
  const R=ReceiptFinance,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  let activeReview=null,indexController;
  function reviewRows(form,kind) {
    return $$(kind==='category'?'.receipt-product':'.casa-receipt-line',form).map(row=>{
      const i=row.dataset.receiptIndex;
      return {row,name:$(kind==='category'?'[name=product'+i+']':'[data-receipt-name]',row),
        omit:$(kind==='category'?'[name=omit'+i+']':'[data-receipt-omit]',row),
        value:$(kind==='category'?'[name=category'+i+']':'[data-receipt-product]',row)};
    });
  }
  function refreshReview() {
    if(!activeReview?.form.isConnected||!$('.receipt-learning-preview',activeReview.form))return;
    const {form,kind}=activeReview,merchant=$(kind==='category'?'[name=merchant]':'[name=casaReceiptStore]',form)?.value||'';
    for(const entry of reviewRows(form,kind)) {
      let hint=$('.receipt-article-hint',entry.row);
      if(!hint){hint=document.createElement('div');hint.className='receipt-article-hint';entry.row.append(hint);}
      const name=entry.row.dataset.sourceName||entry.name.value,suggestion=R.suggest(data,merchant,name,kind);
      hint.replaceChildren();
      if(!suggestion||entry.omit.checked)continue;
      const message=document.createElement('span');
      if(suggestion.conflict){message.textContent='Há associações diferentes para este artigo. Escolhe manualmente ou revê as sugestões em Dados.';hint.append(message);continue;}
      const value=kind==='category'?suggestion.category:suggestion.catalogId,
        label=kind==='category'?value:data.casa.catalog.find(p=>p.id===value)?.name;
      message.textContent='Memorizado: '+label+' · '+(suggestion.merchant||'todas as lojas');hint.append(message);
      const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.textContent=entry.value.value===value?'Já selecionado':'Aplicar sugestão';apply.disabled=entry.value.value===value;
      apply.onclick=()=>{entry.value.value=value;if(kind==='product'){$('[data-receipt-stock]',entry.row).checked=true;$('[data-receipt-stock]',entry.row).dispatchEvent(new Event('change'));}entry.value.dispatchEvent(new Event('change',{bubbles:true}));refreshReview();};hint.append(apply);
    }
    const preview=$('.receipt-learning-preview',form),checked=$('[name=receiptLearn]',form)?.checked;
    preview.replaceChildren();preview.hidden=!checked;
    if(checked)try{
      const items=reviewRows(form,kind).filter(e=>!e.omit.checked&&(kind==='category'||$('[data-receipt-stock]',e.row).checked)).map(e=>({name:e.name.value,sourceName:e.row.dataset.sourceName,...(kind==='category'?{category:e.value.value}:{catalogId:e.value.value})}));
      const rows=R.learningPreview(data,merchant,items,kind,$('[name=receiptLearnScope]',form).value==='all');
      const title=document.createElement('strong');title.textContent=rows.length+' associações a memorizar após guardar';preview.append(title);
      for(const row of rows){const p=document.createElement('p');p.textContent=row.name+' → '+(row.category||data.casa?.catalog.find(p=>p.id===row.catalogId)?.name||'Produto')+' · '+(row.merchant||'todas as lojas');preview.append(p);}
      if(kind==='product'&&items.some(i=>!i.catalogId)){const p=document.createElement('p');p.textContent='Os novos produtos assinalados para stock também serão memorizados após a confirmação.';preview.append(p);}
    }catch(error){const p=document.createElement('p');p.className='error';p.textContent=error.message;preview.append(p);}
  }
  function enhanceReview(kind) {
    const form=$('#modalForm');if(!form||$('.receipt-learning',form))return;
    activeReview={form,kind};form.classList.add('receipt-assisted-review');
    $('#modal').classList.add('receipt-review-dialog');
    if(kind==='category'){
      const names=['merchant','receiptDate','receiptTotal','account'],group=document.createElement('div');group.className='receipt-review-basics';
      const first=$('[name=merchant]',form)?.closest('label');if(first){first.before(group);for(const name of names){const label=$('[name='+name+']',form)?.closest('label');if(label)group.append(label);}}
    }
    const learn=document.createElement('details');learn.className='receipt-learning workflow-detail';
    learn.innerHTML='<summary>Memorizar associações destes artigos</summary><label class="checkbox"><input type="checkbox" name="receiptLearn"> Sugerir estas escolhas nas próximas faturas</label><label>Aplicar sugestões em<select name="receiptLearnScope"><option value="merchant">Só nesta loja</option><option value="all">Todas as lojas</option></select></label><div class="receipt-learning-preview" hidden aria-live="polite"></div>';
    const anchor=$('[name=receiptConfirmed],[name=casaReceiptConfirmed]',form)?.closest('label');if(anchor)anchor.before(learn);else form.append(learn);
    refreshReview();
  }
  function editRule(id) {
    const r=(data.receiptRules||[]).find(r=>r.id===id);if(!r)return;
    const input=(label,name,value)=>'<label>'+label+'<input name="'+name+'" value="'+esc(value)+'" maxlength="200"></label>';
    const mapping=r.kind==='category'?input('Categoria / subcategoria','category',r.category):'<label>Produto Casa<select name="catalogId">'+(data.casa?.catalog||[]).map(p=>'<option value="'+esc(p.id)+'" '+(p.id===r.catalogId?'selected':'')+'>'+esc(p.name)+(p.archived?' · arquivado':'')+'</option>').join('')+'</select></label>';
    form('Sugestão de artigo',input('Nome lido na fatura','name',r.name)+input('Loja (vazio = todas)','merchant',r.merchant)+mapping+'<label>Excluir lojas (uma por linha)<textarea name="exceptions">'+esc(r.excludedMerchants.join('\n'))+'</textarea></label><label class="checkbox"><input name="enabled" type="checkbox" '+(r.enabled?'checked':'')+'> Sugestão ativa</label>',f=>commit(()=>R.updateRule(data,id,{name:f.get('name').trim(),merchant:f.get('merchant').trim(),...(r.kind==='category'?{category:f.get('category').trim()}:{catalogId:f.get('catalogId')}),enabled:f.has('enabled'),excludedMerchants:f.get('exceptions').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)}),'Sugestão atualizada.'),'As sugestões só se aplicam quando confirmadas. Não alteram movimentos anteriores.');
  }
  function rules() {
    const source=$('#personalRules');if(!source)return;
    let panel=$('#receiptArticleRules');if(!panel){panel=document.createElement('section');panel.id='receiptArticleRules';panel.className='panel receipt-rules';source.append(panel);}
    const rows=data.receiptRules||[];
    panel.innerHTML='<div class="panel-heading"><div><h3>Artigos das faturas</h3><p>'+rows.length+' associações confirmadas</p></div></div>'+(rows.length?'<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Artigo</th><th>Sugestão</th><th>Loja</th><th>Estado / ações</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(r.kind==='category'?r.category:data.casa?.catalog.find(p=>p.id===r.catalogId)?.name||'Produto já indisponível')+'</td><td>'+esc(r.merchant||'Todas')+(r.excludedMerchants.length?'<small>Exclui: '+esc(r.excludedMerchants.join(', '))+'</small>':'')+'</td><td>'+esc(r.enabled?'Ativa':'Desativada')+' <button class="link-button" type="button" data-article-edit="'+esc(r.id)+'">Editar</button> <button class="link-button" type="button" data-article-remove="'+esc(r.id)+'">Eliminar</button></td></tr>').join('')+'</tbody></table></div>':'<p class="quiet-state">Na revisão de uma fatura, abre “Memorizar associações” e confirma as escolhas para as reutilizar.</p>');
    $$('[data-article-edit]',panel).forEach(b=>b.onclick=()=>editRule(b.dataset.articleEdit));
    $$('[data-article-remove]',panel).forEach(b=>b.onclick=()=>{const r=rows.find(r=>r.id===b.dataset.articleRemove);form('Eliminar sugestão','<p>'+esc(r.name)+' · '+esc(r.merchant||'Todas as lojas')+'</p>',()=>commit(()=>R.removeRule(data,r.id),'Sugestão eliminada.'),'A classificação dos movimentos guardados mantém-se.','Eliminar sugestão');});
  }
  async function indexDocument(id) {
    const tx=data.transactions.find(t=>String(t.id)===String(id));if(!tx?.attachment)return;
    const origin=key,stamp=JSON.stringify(tx),a=tx.attachment;
    if(data.closedMonths.includes(tx.date.slice(0,7)))return notice('Reabre o mês antes de guardar texto neste movimento.',true);
    form('Ler texto do comprovativo','<p id="documentIndexProgress" role="status">A preparar leitura local…</p>',()=>true,'','Fechar');
    indexController?.abort();indexController=new AbortController();const own=indexController;
    try{
      if(!/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(a.data||''))throw Error('O ficheiro não está disponível para leitura.');
      const base64=a.data.slice(a.data.indexOf(',')+1),binary=atob(base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),file=new File([bytes],a.name||'comprovativo',{type:a.type});
      const result=await ReceiptReader.read(file,s=>{const p=$('#documentIndexProgress');if(p)p.textContent=s;},own.signal,{attachment:false});
      if(own.signal.aborted||key!==origin||!$('#documentIndexProgress')||JSON.stringify(data.transactions.find(t=>t.id===tx.id))!==stamp)return;
      R.validateText(result.text);
      form('Confirmar texto para pesquisa','<label>Texto lido<textarea name="documentText" rows="9" maxlength="200000">'+esc(result.text)+'</textarea></label><label class="checkbox"><input name="confirmText" type="checkbox" required> Conferi o texto</label>',f=>commit(()=>{if(key!==origin||JSON.stringify(data.transactions.find(t=>t.id===tx.id))!==stamp)throw Error('O movimento mudou. Lê novamente o documento.');if(!f.has('confirmText'))throw Error('Confirma o texto.');R.validateText(f.get('documentText'));data.transactions.find(t=>t.id===tx.id).receiptText=f.get('documentText');},'Texto guardado para pesquisa.'),'Guarda apenas texto. Mantém os valores, categorias e conta do movimento.','Guardar texto');
    }catch(error){if(!own.signal.aborted)notice(error.message,true);}
  }
  function documentDetail() {
    const preview=$('#documentsHub .document-inspector .document-preview');if(!preview)return;
    const select=$('#documentsHub .document-select[aria-pressed=true]'),tx=data.transactions.find(t=>String(t.id)===select?.dataset.documentSelect);if(!tx)return;
    preview.parentElement.querySelector('.receipt-search-content')?.remove();
    const detail=document.createElement('details');detail.className='receipt-search-content workflow-detail';
    const summary=document.createElement('summary');summary.textContent='Texto e artigos pesquisáveis';detail.append(summary);
    const body=document.createElement('pre');body.textContent=[tx.receiptText,...(tx.receiptItems||[]).map(i=>i.name+' · '+i.category)].filter(Boolean).join('\n')||'Este comprovativo ainda não tem texto lido.';detail.append(body);
    const read=document.createElement('button');read.type='button';read.className='secondary';read.textContent=tx.receiptText?'Voltar a ler texto':'Ler texto para pesquisa';read.onclick=()=>indexDocument(tx.id);detail.append(read);preview.after(detail);
  }
  function render(){if(view!=='dataHub')return;if(UnifiedWorkspaceUI.dataTask()==='rules')rules();if(UnifiedWorkspaceUI.dataTask()==='documents')documentDetail();}
  document.addEventListener('click',event=>{if(event.target.closest('.document-select'))documentDetail();});
  for(const type of ['input','change'])document.addEventListener(type,event=>{if(event.target.closest('#modalForm'))refreshReview();});
  document.addEventListener('keydown',event=>{if(event.target.closest('.document-select'))requestAnimationFrame(documentDetail);});
  $('#modal').addEventListener('close',()=>{if(!$('#documentIndexProgress'))return;indexController?.abort();});
  UILifecycle.register('receipt-assistance',{afterRender:render,afterNavigation:render},40);
  window.ReceiptAssistanceUI=Object.freeze({enhanceReview,refreshReview,render,indexDocument,refreshDocuments:documentDetail});render();
})();
