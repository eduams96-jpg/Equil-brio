/* Texto pesquisável dos comprovativos (Dados → Documentos).
 * A leitura de faturas e as sugestões de artigos foram retiradas na 1.0.21. */
(() => {
  'use strict';
  const R=ReceiptFinance,$=(s,r=document)=>r.querySelector(s);
  let indexController;
  async function indexDocument(id) {
    const tx=data.transactions.find(t=>String(t.id)===String(id));if(!tx?.attachment)return;
    const origin=key,stamp=JSON.stringify(tx),a=tx.attachment;
    if(data.closedMonths.includes(tx.date.slice(0,7)))return notice('Reabre o mês antes de guardar texto neste movimento.',true);
    form('Ler texto do comprovativo','<p id="documentIndexProgress" role="status">A preparar leitura local…</p>',()=>true,'','Fechar');
    indexController?.abort();indexController=new AbortController();const own=indexController;
    try{
      if(!/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(a.data||''))throw Error('O ficheiro não está disponível para leitura.');
      const mime=a.type||(a.data.match(/^data:([^;]+);/)?.[1]||'application/octet-stream');
      const base64=a.data.slice(a.data.indexOf(',')+1),binary=atob(base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),file=new File([bytes],a.name||'comprovativo',{type:mime});
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
  function render(){if(view!=='dataHub')return;if(UnifiedWorkspaceUI.dataTask()==='documents')documentDetail();}
  document.addEventListener('click',event=>{if(event.target.closest('.document-select'))documentDetail();});
  document.addEventListener('keydown',event=>{if(event.target?.closest?.('.document-select'))requestAnimationFrame(documentDetail);});
  $('#modal').addEventListener('close',()=>{if(!$('#documentIndexProgress'))return;indexController?.abort();});
  UILifecycle.register('receipt-assistance',{afterRender:render,afterNavigation:render},40);
  window.ReceiptAssistanceUI=Object.freeze({render,indexDocument,refreshDocuments:documentDetail});render();
})();
