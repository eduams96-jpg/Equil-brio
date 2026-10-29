(function(){
  'use strict';
  const C=CasaFinance,L=CasaLife;
  let search='',storeSearch='',catalogCategory='';
  const field=(l,n,v='',t='text',a='')=>`<label>${l}<input name="${n}" type="${t}" value="${esc(v)}" ${a}></label>`;
  const select=(l,n,items,v='')=>`<label>${l}<select name="${n}">${items.map(([id,text])=>`<option value="${esc(id)}" ${String(id)===String(v)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  const qty=n=>Number(n).toLocaleString('pt-PT',{maximumFractionDigits:3});
  const units=C.stockUnits;
  function formatUnitPrice(price,packageQty,unit){const [factor,label]=({ml:[1000,'L'],cl:[100,'L'],g:[1000,'kg']})[unit]||[1,unit];return eur(price/packageQty*factor)+' / '+esc(label);}


  function parseHtmlOrTextRows(htmlText,plainText){
    if(htmlText&&/<table|<tr|<td/i.test(htmlText)){
      const doc=new DOMParser().parseFromString(htmlText,'text/html');
      const records=[...doc.querySelectorAll('tr')].map((tr,i)=>{const cells=[...tr.querySelectorAll('th,td')];return{values:cells.map(c=>c.textContent.replace(/\s+/g,' ').trim()),urls:cells.map(c=>c.querySelector('a[href]')?.getAttribute('href')||''),rowNumber:i+1};});
      const rows=C.catalogTableRows(records);if(rows.length)return rows;
    }
    return C.catalogTableRows(C.delimitedTable(String(plainText||'')));
  }

  async function parseXlsxFile(file){
    if(file.size>10*1024*1024)throw Error('O Excel excede o limite de 10 MB.');
    const buf=await file.arrayBuffer();
    if(buf.byteLength>10*1024*1024||buf.byteLength<22)throw Error('Ficheiro Excel inválido ou demasiado grande.');
    const view=new DataView(buf),bytes=new Uint8Array(buf);
    let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
      if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
    }
    if(eocd<0)throw Error('O ficheiro selecionado não é um ficheiro Excel (.xlsx) válido.');
    const cdCount=view.getUint16(eocd+10,true),cdOffset=view.getUint32(eocd+16,true);
    if(cdCount>5000||cdOffset>eocd)throw Error('Estrutura do Excel inválida.');
    const entries=new Map();let totalSize=0;
    let pos=cdOffset;
    for(let i=0;i<cdCount;i++){
      if(pos+46>eocd||view.getUint32(pos,true)!==0x02014b50)throw Error('Estrutura do Excel incompleta.');
      const method=view.getUint16(pos+10,true),compSize=view.getUint32(pos+20,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true);
      const size=view.getUint32(pos+24,true);totalSize+=size;if(size>20*1024*1024||totalSize>80*1024*1024||pos+46+nameLen+extraLen+commentLen>eocd||localOffset+30>cdOffset||view.getUint16(pos+8,true)&1)throw Error('Excel demasiado grande, encriptado ou inválido.');
      const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLen));
      entries.set(name,{method,compSize,localOffset,size});
      pos+=46+nameLen+extraLen+commentLen;
    }
    async function readEntryText(name){
      const e=entries.get(name);if(!e)return '';
      const lNameLen=view.getUint16(e.localOffset+26,true),lExtraLen=view.getUint16(e.localOffset+28,true);
      const start=e.localOffset+30+lNameLen+lExtraLen;
      if(start+e.compSize>cdOffset||view.getUint32(e.localOffset,true)!==0x04034b50)throw Error('Estrutura do Excel inválida.');
      const slice=bytes.subarray(start,start+e.compSize);
      if(e.method===0)return new TextDecoder().decode(slice);
      if(e.method===8&&typeof DecompressionStream!=='undefined'){
        const stream=new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw')),reader=stream.getReader(),chunks=[];let size=0;
        try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024||size>e.size)throw Error('Folha de cálculo demasiado grande.');chunks.push(value);}if(size!==e.size)throw Error('Folha de cálculo incompleta.');}catch(error){await reader.cancel().catch(()=>{});throw error;}
        const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(out);
      }
      throw Error('Método de compressão do Excel não suportado neste ambiente.');
    }
    const sstXml=await readEntryText('xl/sharedStrings.xml');
    const sharedStrings=[];
    if(sstXml){
      const sstDoc=new DOMParser().parseFromString(sstXml,'application/xml');
      for(const si of sstDoc.getElementsByTagName('si')){
        const ts=[...si.getElementsByTagName('t')].map(t=>t.textContent||'').join('');
        sharedStrings.push(ts);
      }
    }
    let sheetName=[...entries.keys()].find(k=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(k))||'xl/worksheets/sheet1.xml';
    const workbookXml=await readEntryText('xl/workbook.xml'),workbookRels=await readEntryText('xl/_rels/workbook.xml.rels');
    if(workbookXml&&workbookRels){const wb=new DOMParser().parseFromString(workbookXml,'application/xml'),rels=new DOMParser().parseFromString(workbookRels,'application/xml'),first=[...wb.getElementsByTagName('sheet')].find(n=>!n.getAttribute('state')||n.getAttribute('state')==='visible'),id=first?.getAttribute('r:id'),rel=[...rels.getElementsByTagName('Relationship')].find(n=>n.getAttribute('Id')===id&&!n.getAttribute('TargetMode'));
      if(rel){const target=new URL(rel.getAttribute('Target'),'https://local/xl/workbook.xml');const name=target.pathname.slice(1);if(target.origin==='https://local'&&entries.has(name))sheetName=name;}
    }
    const sheetBase=sheetName.split('/').pop();
    const relsName=`xl/worksheets/_rels/${sheetBase}.rels`;
    const sheetXml=await readEntryText(sheetName);
    if(!sheetXml)throw Error('Não foi possível encontrar a folha de cálculo dentro do ficheiro .xlsx.');
    const relsXml=await readEntryText(relsName);
    const relMap=new Map();
    if(relsXml){
      const relsDoc=new DOMParser().parseFromString(relsXml,'application/xml');
      for(const rel of relsDoc.getElementsByTagName('Relationship')){
        const id=rel.getAttribute('Id'),target=rel.getAttribute('Target');
        if(id&&target)relMap.set(id,target);
      }
    }
    const sheetDoc=new DOMParser().parseFromString(sheetXml,'application/xml');
    const cellLinks=new Map();
    for(const hl of sheetDoc.getElementsByTagName('hyperlink')){
      const ref=hl.getAttribute('ref');
      const rId=hl.getAttribute('r:id')||hl.getAttribute('id');
      const target=rId?relMap.get(rId):(hl.getAttribute('location')||'');
      if(ref&&target&&/^https?:\/\//i.test(target))cellLinks.set(ref,target);
    }
    const colIndex=ref=>{
      const m=String(ref||'').match(/^[A-Z]+/);if(!m)return 0;
      let idx=0;for(const ch of m[0])idx=idx*26+(ch.charCodeAt(0)-64);
      return idx-1;
    };
    const outRows=[];
    for(const rowEl of sheetDoc.getElementsByTagName('row')){
      const vals=[],urls=[];
      for(const cEl of rowEl.getElementsByTagName('c')){
        const ref=cEl.getAttribute('r')||'';
        const idx=colIndex(ref);
        const tAttr=cEl.getAttribute('t');
        let textVal='';
        if(tAttr==='s'){
          const vEl=cEl.getElementsByTagName('v')[0];
          const sIdx=Number(vEl?.textContent||0);
          textVal=sharedStrings[sIdx]??'';
        }else if(tAttr==='inlineStr'){
          textVal=[...cEl.getElementsByTagName('t')].map(n=>n.textContent||'').join('');
        }else{
          const vEl=cEl.getElementsByTagName('v')[0];
          textVal=vEl?.textContent||'';
        }
        vals[idx]=String(textVal).trim();
        if(cellLinks.has(ref))urls[idx]=cellLinks.get(ref);
      }
      outRows.push({values:vals,urls,rowNumber:Number(rowEl.getAttribute('r'))||outRows.length+1});
    }
    return C.catalogTableRows(outRows);
  }

  function importTableModal(){
    let stagedRows=[],rawRows=[],load=0;
    form(
      'Importar tabela de Produtos, Categorias, Preços e Stock',
      `<div class="casa-table-importer">`+
        `<p class="muted">Importa diretamente a tua tabela do Excel (<code>Produto | Categoria | Qtd Unitária | Marca | Supermercado | Preço Unitário | Stock</code>). Os links colocados na coluna <b>Marca</b> (ou Produto) são automaticamente associados ao produto e ao respetivo supermercado, e os supermercados sem preço ficam assinalados com aviso.</p>`+
        `<div class="u-actions importer-top-actions">`+
          `<label class="secondary file-btn">📂 Escolher ficheiro Excel (.xlsx / .csv)<input type="file" id="casaCatalogFileInput" accept=".xlsx,.csv,.tsv,.txt,.html" hidden></label>`+

        `</div>`+
        `<label>Ou seleciona as células no Excel, faz <b>Ctrl+C</b> e cola aqui (<b>Ctrl+V</b>) — preserva automaticamente os links da Marca:<div id="casaExcelPasteZone" class="casa-excel-paste-zone" contenteditable="true" role="textbox" aria-label="Área de colagem do Excel" data-placeholder="Clica aqui e prime Ctrl+V para colar a tabela do Excel com os links da Marca…"></div></label>`+
        `<label class="checkbox"><input type="checkbox" name="importSeparateVariants" checked> Separar embalagens diferentes do mesmo produto na mesma loja; distinguir a marca quando necessário para conservar os links.</label>`+
        `<label class="checkbox"><input type="checkbox" name="importApplyStock" checked> Criar lote inicial de Stock na Despensa para os produtos com Stock &gt; 0 (apenas se ainda não tiverem stock registado)</label>`+
        `<div id="casaImportPreviewBox" class="casa-import-preview-box"><p class="muted">Escolhe um ficheiro <b>.xlsx</b>, cola a tua tabela acima para pré-visualizar.</p></div>`+
      `</div>`,
      f=>{
        if(!stagedRows.length)throw Error('Carrega ou cola primeiro a tabela de produtos antes de confirmar.');
        const applyStock=Boolean($('#modalContent [name=importApplyStock]')?.checked);
        return commit(()=>{
          const res=C.importCatalogTable(data,stagedRows,{applyStock});
          setTimeout(()=>notice(`Importação concluída: ${res.productsCreated} novo(s), ${res.productsUpdated} atualizado(s), ${res.offersSaved} oferta(s) de supermercado${res.missingPriceCount?` (${res.missingPriceCount} sem preço)`:''}.`),10);
        },'Catálogo de produtos e categorias importado com sucesso.');
      },
      'Podes voltar a importar a tabela sempre que quiseres atualizar preços ou adicionar novos produtos sem duplicar os existentes.',
      'Importar para o Catálogo'
    );

    const content=$('#modalContent');
    const previewBox=$('#casaImportPreviewBox',content);
    const pasteZone=$('#casaExcelPasteZone',content);
    const fileInput=$('#casaCatalogFileInput',content);


    const renderPreview=inputRows=>{
      rawRows=inputRows;const prepared=C.catalogVariants(inputRows);const rows=content.querySelector('[name=importSeparateVariants]').checked?prepared.rows:inputRows.map(r=>({...r}));
      stagedRows=rows;
      if(!rows.length){
        previewBox.innerHTML='<p class="muted">Nenhuma linha detetada. Verifica o formato da tabela.</p>';
        return;
      }
      const uniqueProds=new Set(rows.map(r=>String(r.name||'').toLowerCase())).size;
      const withLinks=rows.filter(r=>r.url).length;
      const missingPackages=rows.filter(r=>!String(r.unitQty||'').trim()).length;
      const missingPrices=rows.filter(r=>!(Number(String(r.price??0).replace(/[^0-9.,-]/g,'').replace(',','.'))>0)).length;
      previewBox.innerHTML=
        (prepared.separatedRows?`<p class="importer-variant-note">${prepared.separatedNames} nome(s) com variantes na mesma loja: ${prepared.separatedRows} linha(s) ${content.querySelector('[name=importSeparateVariants]').checked?'separadas por embalagem / marca':'mantidas juntas; a última oferta de cada loja será a atual'}. Confere os nomes e links na pré-visualização.</p>`:'')+
        `<div class="importer-summary-bar">`+
          `<span class="reconcile-pill is-ok"><b>${rows.length}</b> linha(s) lida(s)</span>`+
          `<span class="reconcile-pill"><b>${uniqueProds}</b> produto(s)</span>`+
          `<span class="reconcile-pill"><b>${withLinks}</b> link(s) na Marca</span>`+
          (missingPackages?`<span class="reconcile-pill is-warn">${missingPackages} embalagem(ns) por indicar · provisoriamente 1 un</span>`:'')+
          (missingPrices?`<span class="reconcile-pill is-warn"><b>${missingPrices}</b> c/ aviso de preço em falta</span>`:'')+
        `</div>`+
        `<div class="u-table-scroll importer-preview-scroll"><table class="u-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Qtd Unitária</th><th>Marca (e Link)</th><th>Supermercado</th><th>Preço Unit.</th><th>Stock</th></tr></thead><tbody>`+
        rows.slice(0,100).map((r,idx)=>{
          const numP=Number(String(r.price??0).replace(/[^0-9.,-]/g,'').replace(',','.'));
          return `<tr>`+
            `<td><b>${esc(r.name)}</b></td>`+
            `<td>${esc(r.category||'—')}</td>`+
            `<td>${r.unitQty?esc(r.unitQty):'<span class="negative">Por indicar · unidade provisória</span>'}</td>`+
            `<td>${esc(r.brand||'—')} ${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="brand-link-badge" title="${esc(r.url)}">🔗 Link</a>`:''}`+
              `<input type="url" class="importer-inline-url" data-row-url="${idx}" value="${esc(r.url||'')}" placeholder="https://… (opcional)">`+
            `</td>`+
            `<td>${esc(r.storeName||'—')}</td>`+
            `<td class="amount">${numP>0?eur(numP):'<span class="offer-missing-price-badge">⚠ Falta preço</span>'}</td>`+
            `<td>${esc(String(r.stock??0))}</td>`+
          `</tr>`;
        }).join('')+
        `</tbody></table></div>`;
      for(const inp of previewBox.querySelectorAll('[data-row-url]')){
        inp.oninput=()=>{
          const i=Number(inp.dataset.rowUrl);
          if(stagedRows[i])stagedRows[i].url=inp.value.trim();
        };
      }
    };



    content.querySelector('[name=importSeparateVariants]').onchange=()=>{try{renderPreview(rawRows);}catch(error){stagedRows=[];previewBox.textContent=error.message;}};
    pasteZone.addEventListener('paste',e=>{
      e.preventDefault();
      load++;stagedRows=[];
      const html=e.clipboardData?.getData('text/html')||'';
      const text=e.clipboardData?.getData('text/plain')||'';
      pasteZone.textContent=text.slice(0,300)+(text.length>300?'…':'');
      try{renderPreview(parseHtmlOrTextRows(html,text));}catch(error){stagedRows=[];previewBox.textContent=error.message;}
    });
    pasteZone.addEventListener('input',()=>{
      load++;stagedRows=[];
      try{renderPreview(parseHtmlOrTextRows(pasteZone.innerHTML,pasteZone.innerText));}catch(error){previewBox.textContent=error.message;}
    });

    fileInput.onchange=async()=>{
      const file=fileInput.files?.[0];
      if(!file)return;const ticket=++load;stagedRows=[];previewBox.innerHTML='<p>A ler o ficheiro…</p>';
      try{
        if(file.size>10*1024*1024)throw Error('O ficheiro excede o limite de 10 MB.');
        if(/\.xlsx$/i.test(file.name)){
          const rows=await parseXlsxFile(file);
          if(ticket!==load||!content.isConnected)return;renderPreview(rows);
        }else{
          const text=await file.text();
          const rows=parseHtmlOrTextRows(/<table/i.test(text)?text:'',text);
          if(ticket!==load||!content.isConnected)return;renderPreview(rows);
        }
      }catch(err){
        if(ticket!==load||!content.isConnected)return;stagedRows=[];
        previewBox.innerHTML=`<p class="negative">${esc(err.message||'Não foi possível ler o ficheiro.')}</p>`;
      }
    };
  }

  function productForm(id){
    const c=C.state(data),p=c.catalog.find(p=>p.id===id),stores=c.stores.filter(s=>!s.archived),parts=Finance.categoryParts(p?.category||''),paths=C.categoryPaths(data);
    const storeOptions='<datalist id="casaStoreOptions">'+stores.map(s=>`<option value="${esc(s.name)}">`).join('')+'</datalist>';
    const offerRow=(index,storeName='',packageQty=1,price='',url='',explicit=false)=>`<div class="product-offer-row" data-product-offer="${index}" data-explicit="${explicit?'true':'false'}">${field('Supermercado','offerStore_'+index,storeName,'text','list="casaStoreOptions" data-offer-store placeholder="Continente, Mercadona, Pingo Doce…"')}${field('Quantidade da embalagem','offerQty_'+index,packageQty,'number','min="0.001" step="0.001" data-offer-qty')}${field('Preço da embalagem (€; opcional)','offerPrice_'+index,price===0?'':price,'number','min="0" step="0.01" data-offer-price placeholder="Vazio = avisar falta de preço"')}<label class="product-offer-link">Link neste supermercado (opcional)<input name="offerUrl_${index}" type="url" value="${esc(url)}" data-offer-url placeholder="https://..."></label><output data-offer-unit></output><button type="button" class="secondary" data-remove-offer>Remover</button></div>`;
    const legacyLink=p?.url?`<div class="product-legacy-link"><p>Link geral anterior: <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a></p><label class="checkbox"><input type="checkbox" name="clearProductUrl"> Remover link geral antigo</label></div>`:'';
    form(p?'Editar produto':'Novo produto','<div class="casa-product-form"><section class="product-identity"><h3>Produto</h3>'+field('Nome','productName',p?.name||'','text','required')+field('Marca (opcional)','productBrand',p?.brand||'')+legacyLink+select('Unidade de stock e comparação','productUnit',units,p?.unit||'un')+'</section><section class="product-category-guide"><h3>Categoria e subcategorias</h3><p class="muted">Podes usar até 5 níveis. Escolhe níveis existentes ou escreve novos.</p><div id="productCategoryLevels"></div>'+field('Ou escreve o caminho completo','productCategoryPath',p?.category||'','text','list="casaCategoryPaths" placeholder="Alimentação > Laticínios > Leite"')+'<datalist id="casaCategoryPaths">'+paths.map(x=>`<option value="${esc(x)}">`).join('')+'</datalist></section><section class="product-offers-section"><div class="product-offers-head"><div><h3>Preços e links por supermercado</h3><p class="muted">Podes indicar apenas o supermercado e deixar o preço vazio (0,00 €) — o programa guardará o supermercado com um aviso que falta colocar o preço.</p></div><button type="button" class="secondary" id="addProductOffer">+ Supermercado</button></div>'+storeOptions+'<div id="productOffersRows"></div></section></div>',v=>{
      const levels=[1,2,3,4,5].map(n=>String(v.get('catLevel'+n)||'').trim()),typed=Finance.categoryParts(v.get('productCategoryPath')||'');
      const offerRows=[...document.querySelectorAll('#productOffersRows .product-offer-row')];for(const row of offerRows){const storeVal=row.querySelector('[data-offer-store]').value.trim(),priceVal=row.querySelector('[data-offer-price]').value.trim(),urlVal=row.querySelector('[data-offer-url]').value.trim();const filled=row.dataset.explicit==='true'||storeVal||priceVal||urlVal;if(filled&&(!storeVal||!(Number(row.querySelector('[data-offer-qty]').value)>0)||priceVal!==''&&Number(priceVal)<0))throw Error('Indica o nome do supermercado e uma quantidade válida (o preço pode ficar vazio se ainda não o souberes).');}
      const offers=offerRows.map(row=>({
        storeName:row.querySelector('[data-offer-store]').value.trim(),
        packageQty:Number(row.querySelector('[data-offer-qty]').value||1),
        price:row.querySelector('[data-offer-price]').value.trim()===''?0:Number(row.querySelector('[data-offer-price]').value),
        url:row.querySelector('[data-offer-url]').value.trim()
      })).filter(r=>r.storeName);
      return commit(()=>C.saveProductOffers(data,{id,name:v.get('productName'),category:Finance.categoryPath((typed.length?typed:levels.filter(Boolean)).slice(0,5)),unit:v.get('productUnit'),brand:v.get('productBrand'),url:v.get('clearProductUrl')?'':p?.url,barcode:p?.barcode||'',notes:p?.notes||'',archived:p?.archived||false},offers),'Produto guardado.');
    },'Guardar ou editar produtos, preços e links atualiza apenas o catálogo da Casa; não cria movimentos financeiros.');
    const levelHost=$('#productCategoryLevels');
    const renderLevels=current=>{
      levelHost.innerHTML=[0,1,2,3,4].map(i=>{
        const prefix=current.slice(0,i),options=new Set();
        for(const path of paths){const seg=Finance.categoryParts(path);if(prefix.every((v,idx)=>seg[idx]===v)&&seg[i])options.add(seg[i]);}
        return `<label>Nível ${i+1}<span class="split-choice"><input name="catLevel${i+1}" list="catList${i+1}" value="${esc(current[i]||'')}" placeholder="${i===0?'Ex.: Alimentação':'Opcional'}"><button type="button" class="split-choice-arrow" data-cat-level-pick="${i+1}" aria-label="Selecionar nível ${i+1}">▾</button></span><datalist id="catList${i+1}">${[...options].map(o=>`<option value="${esc(o)}">`).join('')}</datalist></label>`;
      }).join('');
      levelHost.querySelectorAll('[data-cat-level-pick]').forEach(b=>b.onclick=()=>{const wrap=b.parentElement,input=wrap.querySelector('input'),open=wrap.querySelector('select');if(open){open.remove();return;}const options=[...input.list.options].map(o=>o.value),list=document.createElement('select');list.className='split-choice-options';list.size=Math.min(6,Math.max(2,options.length+1));list.innerHTML='<option value="">'+(options.length?'Escolher…':'Sem opções — escreve no campo')+'</option>'+options.map(o=>'<option value="'+esc(o)+'">'+esc(o)+'</option>').join('');list.onchange=()=>{if(!list.value)return;input.value=list.value;list.remove();input.dispatchEvent(new Event('change',{bubbles:true}));};list.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();list.remove();input.focus();}};wrap.append(list);list.focus();});
      levelHost.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{const next=[1,2,3,4,5].map(n=>$('[name=catLevel'+n+']').value.trim()).filter(Boolean);$('[name=productCategoryPath]').value=Finance.categoryPath(next);renderLevels(next);});
    };
    renderLevels(parts);
    const offersHost=$('#productOffersRows'),unitSelect=$('[name=productUnit]');
    const updateUnits=()=>{const unit=unitSelect.value;offersHost.querySelectorAll('[data-product-offer]').forEach(row=>{const storeName=row.querySelector('[data-offer-store]').value.trim(),q=Number(row.querySelector('[data-offer-qty]').value),rawPr=row.querySelector('[data-offer-price]').value.trim(),pr=rawPr===''?0:Number(rawPr),out=row.querySelector('[data-offer-unit]');if(q>0&&pr>0){out.innerHTML=eur(pr/q)+' / '+unit;}else if(storeName){out.innerHTML='<span class="offer-missing-price-badge">⚠ Falta colocar preço</span>';}else{out.textContent='Opcional: escolhe a loja (preço pode ficar para depois)';}});};
    const bindOffers=()=>{offersHost.querySelectorAll('input').forEach(i=>i.oninput=updateUnits);offersHost.querySelectorAll('[data-remove-offer]').forEach(b=>b.onclick=()=>{b.closest('[data-product-offer]').remove();updateUnits();});updateUnits();};
    let count=0;for(const [storeId,offer] of Object.entries(p?.offers||{})){const store=c.stores.find(s=>s.id===storeId);if(store&&!store.archived)offersHost.insertAdjacentHTML('beforeend',offerRow(count++,store.name,offer.packageQty,offer.price,offer.url||'',true));}
    if(!count)offersHost.insertAdjacentHTML('beforeend',offerRow(count++,'',1,'','',false));
    $('#addProductOffer').onclick=()=>{offersHost.insertAdjacentHTML('beforeend',offerRow(count++,'',1,'','',true));bindOffers();};
    unitSelect.onchange=updateUnits;bindOffers();
  }
  function offerForm(productId){
    const c=C.state(data),p=c.catalog.find(p=>p.id===productId),stores=c.stores.filter(s=>!s.archived);
    if(!p)return;
    if(!stores.length)return storeForm();
    const first=stores[0].id,current=p.offers[first];
    form('Preço · '+esc(p.name),select('Supermercado','offerStore',stores.map(s=>[s.id,s.name]),first)+field(`Quantidade por embalagem (${esc(p.unit)})`,'packageQty',current?.packageQty||1,'number','required min="0.001" step="0.001"')+field('Preço da embalagem (€; 0 ou vazio se faltar)','packagePrice',current?.price||'','number','min="0" step="0.01" placeholder="Deixa vazio se ainda não tiveres o preço"')+field('Link neste supermercado (opcional)','offerUrl',current?.url||p.url||'','url','placeholder="https://..."'),v=>commit(()=>C.setOffer(data,productId,v.get('offerStore'),{packageQty:Number(v.get('packageQty')),price:v.get('packagePrice')===''?0:Number(v.get('packagePrice')),url:v.get('offerUrl')}),'Supermercado e preço atualizados.'));
    $('[name=offerStore]').onchange=e=>{const o=p.offers[e.target.value];$('[name=packageQty]').value=o?.packageQty||1;$('[name=packagePrice]').value=o?.price>0?o.price:'';$('[name=offerUrl]').value=o?.url||'';};
  }
  function storeForm(id){
    const s=C.state(data).stores.find(s=>s.id===id);
    form(s?'Editar supermercado':'Novo supermercado',field('Nome','storeName',s?.name||'','text','required'),v=>commit(()=>C.saveStore(data,{id,name:v.get('storeName'),archived:s?.archived||false}),'Supermercado guardado.'));
  }
  function queueProductForm(id){
    const c=C.state(data),item=c.shopping.find(s=>s.id===id),products=c.catalog.filter(p=>!p.archived&&Object.keys(p.offers).some(sid=>c.stores.some(s=>s.id===sid&&!s.archived)));
    if(!products.length)return notice('Configura primeiro um produto, um supermercado e o respetivo preço.',true);
    const p0=products.find(p=>p.id===item?.catalogId)||products[0],storesFor=p=>c.stores.filter(s=>!s.archived&&p.offers[s.id]).map(s=>[s.id,`${s.name} · ${qty(p.offers[s.id].packageQty)} ${p.unit} · ${p.offers[s.id].price>0?eur(p.offers[s.id].price):'⚠ Falta preço'}`]);
    form(item?'Associar artigo ao catálogo':'Adicionar do catálogo',select('Produto','queueProduct',products.map(p=>[p.id,`${p.name} (${p.unit})`]),p0.id)+select('Supermercado','queueStore',storesFor(p0),item?.storeId)+field('Quantidade necessária','requestedQty',item?.requestedQty||1,'number','required min="0.001" step="0.001"')+'<p id="queueCalc" class="muted"></p>',v=>commit(()=>C.queueProduct(data,{id,catalogId:v.get('queueProduct'),storeId:v.get('queueStore'),requestedQty:Number(v.get('requestedQty'))}),'Artigo adicionado à lista.'));
    const calc=()=>{
      const p=products.find(p=>p.id===$('[name=queueProduct]').value),o=p.offers[$('[name=queueStore]').value];
      const req=Number($('[name=requestedQty]').value||0),packs=o&&req>0?Math.ceil(Math.round(req*1000)/Math.round(o.packageQty*1000)):0;
      $('#queueCalc').textContent=o&&packs?(o.price>0?`Compra prevista: ${packs} × ${qty(o.packageQty)} ${p.unit} = ${qty(packs*o.packageQty)} ${p.unit} · ${eur(packs*o.price)}`:`Compra prevista: ${packs} × ${qty(o.packageQty)} ${p.unit} · ⚠ Falta colocar preço nesta loja`):'';
    };
    const stores=()=>{const p=products.find(p=>p.id===$('[name=queueProduct]').value);$('[name=queueStore]').innerHTML=c.stores.filter(s=>!s.archived&&p.offers[s.id]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${qty(p.offers[s.id].packageQty)} ${esc(p.unit)} · ${p.offers[s.id].price>0?eur(p.offers[s.id].price):'⚠ Falta preço'}</option>`).join('');calc();};
    $('[name=queueProduct]').onchange=stores;$('[name=queueStore]').onchange=calc;$('[name=requestedQty]').oninput=calc;calc();
  }
  function adjustShoppingItem(id){
    const c=C.state(data),s=c.shopping.find(s=>s.id===id),p=c.catalog.find(p=>p.id===s?.catalogId),o=p?.offers[s?.storeId];
    if(!s||!p||!o)return;
    const defaultPacks=Math.ceil(Math.round(s.requestedQty*1000)/Math.round(o.packageQty*1000)),ov=s.purchaseOverride;
    form('Ajustar compra · '+esc(p.name),`<p class="muted">Embalagem configurada: ${qty(o.packageQty)} ${esc(p.unit)} · Preço catálogo: ${o.price>0?eur(o.price):'⚠ Em falta'}</p>`+field('Embalagens a comprar','overridePackages',ov?.packages||defaultPacks,'number','required min="1" step="1"')+field('Preço por embalagem nesta compra (€)','overridePrice',ov?.price||(o.price>0?o.price:''),'number','required min="0.01" step="0.01"'),v=>commit(()=>C.change(data,draft=>{const row=draft.casa.shopping.find(x=>x.id===id);row.purchaseOverride={packageQty:o.packageQty,packages:Number(v.get('overridePackages')),price:Number(v.get('overridePrice'))};}),'Valor desta compra ajustado.'));
  }
  function checkoutForm(selectedIds){
    try{
      const ids=Array.isArray(selectedIds)?selectedIds:C.state(data).shopping.filter(s=>s.done).map(s=>s.id),groups=C.quote(data,ids),expected=JSON.stringify(groups),batchId=Finance.id();
      const byStore=new Map();for(const id of ids){const row=C.state(data).shopping.find(s=>s.id===id);if(!byStore.has(row.storeId))byStore.set(row.storeId,[]);byStore.get(row.storeId).push(id);}
      const summary=groups.map(g=>'<section class="casa-checkout-group"><h3>'+esc(g.store)+'</h3>'+g.items.map((i,n)=>{const key=ids.indexOf(byStore.get(g.storeId)[n]);return '<div class="casa-checkout-line"><strong>'+esc(i.name)+'</strong><small>'+qty(i.packageQty)+' '+esc(i.unit)+' por embalagem</small>'+field('Embalagens compradas','checkoutQty'+key,i.packages,'number','required min="1" step="1"')+field('Preço final por embalagem (€)','checkoutPrice'+key,i.price,'number','required min="0.01" step="0.01"')+'</div>';}).join('')+field('Desconto adicional do talão (€)','checkoutDiscount'+groups.indexOf(g),0,'number','required min="0" step="0.01"')+'</section>').join('');
      const values=()=>({adjustments:Object.fromEntries(ids.map((id,i)=>[id,{packages:Number($('[name=checkoutQty'+i+']').value),price:Number($('[name=checkoutPrice'+i+']').value)}])),discounts:Object.fromEntries(groups.map((g,i)=>[g.storeId,Number($('[name=checkoutDiscount'+i+']').value)]))});
      form('Concluir compras',summary+'<p id="casaCheckoutTotal" role="status" aria-live="polite"></p>'+field('Data','checkoutDate',Finance.today(),'date',`required max="${Finance.today()}"`),v=>commit(()=>C.checkout(data,{ids,expected,batchId,...values(),date:v.get('checkoutDate')}),'Compras concluídas: talões e stock guardados.'),'Confirma o preço final por embalagem, já com promoções do artigo. Usa o desconto do talão apenas para descontos adicionais. Os preços do catálogo ficam preservados.','Confirmar compras');
      const total=()=>{try{const v=values(),actual=C.quote(data,ids,v.adjustments);let sum=0;const lines=actual.map(g=>{const discount=v.discounts[g.storeId];if(!Number.isFinite(discount)||discount<0||Finance.money(discount)!==discount||discount>g.total)throw Error('Confirma o desconto de cada talão.');const n=Finance.money(g.total-discount);sum=Finance.money(sum+n);return esc(g.store)+': '+eur(n);});$('#casaCheckoutTotal').innerHTML=lines.join('<br>')+'<br><strong>Total: '+eur(sum)+'</strong>';}catch(e){$('#casaCheckoutTotal').textContent=e.message;}};
      document.querySelectorAll('#modalContent input[type=number]').forEach(input=>input.addEventListener('input',total));total();
    }catch(e){notice(e.message,true);}
  }
  function openProductDetail(productId){
    const c=C.state(data),p=c.catalog.find(p=>p.id===productId);if(!p)return;
    const prices=L.prices(data,p.id),missingOffers=L.missingPriceOffers?.(data,p.id)||[],stock=L.available(c,p.id);
    const linkRow=(label,url)=>url?`<p class="casa-product-link"><span>${label}: <code>${esc(url)}</code></span> <button type="button" class="secondary" data-open-product-url="${esc(url)}">Abrir link ↗</button></p>`:'';
    const missingHtml=missingOffers.length?`<div class="offer-missing-price-box"><strong>⚠ Falta colocar preço em:</strong><ul>${missingOffers.map(o=>{const store=c.stores.find(s=>s.id===o.storeId);return `<li><b>${esc(store?.name||o.storeName)}</b> (${qty(o.packageQty)} ${esc(p.unit)}) ${o.url?`<button type="button" class="secondary" data-open-product-url="${esc(o.url)}">Abrir link da marca ↗</button>`:''} <button type="button" class="secondary" data-edit-missing-offer="${esc(p.id)}">Colocar preço</button></li>`;}).join('')}</ul></div>`:'';
    const offers=prices.length?'<div class="casa-offers">'+prices.map((o,idx)=>{const store=c.stores.find(s=>s.id===o.storeId);return `<div><span>${idx===0?'<b>Mais barato</b> · ':''}${esc(store?.name||o.storeId)}: ${qty(o.packageQty)} ${esc(p.unit)} por ${eur(o.price)} (${formatUnitPrice(o.price,o.packageQty,p.unit)})</span>${o.url?`<p class="casa-offer-url"><code>${esc(o.url)}</code> <button type="button" class="secondary" data-open-product-url="${esc(o.url)}">Abrir link ↗</button></p>`:''}</div>`;}).join('')+'</div>':(!missingOffers.length?'<p class="offer-missing-price-badge">⚠ Sem preços ou supermercados configurados.</p>':'');
    const content='<div class="casa-product-detail"><p>'+esc(p.category||'Sem categoria')+(p.brand?' · Marca: <b>'+esc(p.brand)+'</b>':'')+'</p><p>'+esc(p.notes||'')+'</p><p>Em casa: <b>'+qty(stock)+' '+esc(p.unit)+'</b></p>'+(prices.every(o=>!o.url)?linkRow('Link geral',p.url):'')+missingHtml+offers+'</div>';
    form(p.name,content,()=>{productForm(p.id);},'Consulta rápida do produto. Podes abrir os links de supermercado ou editar os dados.','Editar produto');
    $('#modalContent').querySelectorAll('[data-open-product-url]').forEach(b=>b.onclick=()=>openExternalProductUrl(b.dataset.openProductUrl));
    $('#modalContent').querySelectorAll('[data-edit-missing-offer]').forEach(b=>b.onclick=()=>offerForm(b.dataset.editMissingOffer));
  }
  function openExternalProductUrl(raw){
    let url;try{url=C.productUrl(raw);}catch(e){return notice(e.message,true);}
    if(window.desktopApp?.openExternalUrl){window.desktopApp.openExternalUrl(url).catch(e=>notice(e.message||'Não foi possível abrir o link.',true));return;}
    window.open(url,'_blank','noopener,noreferrer');
  }
  function render(){
    const c=C.state(data);
    if(view==='casaProducts'){
      const q=search.trim().toLocaleLowerCase('pt');
      const rows=c.catalog.filter(p=>(!catalogCategory||Finance.categoryMatches(p.category,catalogCategory))&&(!q||[p.name,p.category,p.brand,p.barcode].some(x=>String(x||'').toLocaleLowerCase('pt').includes(q))));
      const missingCount=c.catalog.filter(p=>!p.archived&&(L.missingPriceOffers?.(data,p.id)?.length||!Object.keys(p.offers||{}).length)).length;
      $('#casaProducts').innerHTML=`<div class="section-head"><div><h2>Produtos</h2><p>Produtos por categoria, com embalagens, preços e links em cada supermercado.${missingCount?` <span class="offer-missing-price-badge">⚠ ${missingCount} produto(s) com preço em falta</span>`:''}</p></div><div class="casa-actions"><input id="casaProductSearch" type="search" placeholder="Pesquisar produto, marca ou categoria…" value="${esc(search)}"><button type="button" class="secondary" data-casa-catalog="import-table">↥ Importar tabela / Excel</button><button type="button" class="secondary" data-casa-catalog="stores">Supermercados</button><button type="button" class="primary" data-casa-catalog="new-product">+ Novo produto</button></div></div><label class="casa-catalog-category">Categoria<select id="casaCatalogCategory"><option value="">Todas as categorias</option>${C.categoryPaths(data).map(c=>`<option value="${esc(c)}" ${c===catalogCategory?'selected':''}>${esc(c)}</option>`).join('')}</select></label><div id="casaCatalogCards" class="casa-card-grid"></div>`;
      $('#casaCatalogCards').innerHTML=rows.map(p=>{
        const prices=L.prices(data,p.id),missingOffers=L.missingPriceOffers?.(data,p.id)||[];
        const offers=prices.map((o,idx)=>{const store=c.stores.find(s=>s.id===o.storeId);return `<article class="catalog-offer"><div><strong>${esc(store?.name||o.storeId)}</strong><small>${qty(o.packageQty)} ${esc(p.unit)} por embalagem</small></div><div><b>${eur(o.price)}</b><small>${formatUnitPrice(o.price,o.packageQty,p.unit)}</small></div>${idx===0?'<span class="catalog-best">Menor preço</span>':''}${o.url?`<button type="button" class="secondary" data-product-url="${esc(o.url)}" title="${esc(o.url)}">Abrir loja ↗</button>`:''}</article>`;}).join('');
        const missingHtml=missingOffers.map(o=>`<article class="catalog-offer is-missing"><div><strong>${esc(o.storeName)}</strong><small>${qty(o.packageQty)} ${esc(p.unit)} por embalagem</small></div><div><b>Falta colocar preço</b><small>Sem comparação por unidade</small></div>${o.url?`<button type="button" class="secondary" data-product-url="${esc(o.url)}" title="${esc(o.url)}">Abrir loja ↗</button>`:''}</article>`).join('');
        return `<article class="casa-product-card"><span class="casa-card-meta">${esc(p.category||'Sem categoria')} · ${esc(p.unit)}${p.archived?' · Arquivado':''}</span><button type="button" class="product-title-button" data-product-detail="${esc(p.id)}">${esc(p.name)}</button><p>${esc(p.brand||'')}${p.barcode?' · '+esc(p.barcode):''}</p><p>${esc(p.notes||'')}</p><p>Em casa: <b>${qty(L.available(c,p.id))} ${esc(p.unit)}</b> · Mínimo: ${p.minimum??'—'} · Alvo: ${p.target??'—'}</p><div class="casa-offers">${offers}${missingHtml}${!offers&&!missingHtml?'<span class="offer-missing-price-badge">⚠ Sem preço por supermercado</span>':''}</div><div class="casa-actions">${p.url&&prices.every(o=>!o.url)?`<button type="button" class="secondary" data-product-url="${esc(p.url)}" title="${esc(p.url)}">Abrir link ↗</button>`:''}<button type="button" class="secondary" data-product-offer="${esc(p.id)}">Preço por loja</button><button type="button" class="secondary" data-product-policy="${esc(p.id)}">Limites</button><button type="button" class="secondary" data-product-edit="${esc(p.id)}">Editar</button><button type="button" class="secondary" data-product-archive="${esc(p.id)}">${p.archived?'Reativar':'Arquivar'}</button></div></article>`;
      }).join('')||'<p class="empty">Ainda não há produtos no catálogo. Clica em "↥ Importar tabela / Excel" ou "+ Novo produto".</p>';
      const refreshCatalog=()=>{render();window.CasaCompleteUI?.render(view);window.WorkbenchUI?.render();};$('#casaProductSearch').oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;refreshCatalog();const input=$('#casaProductSearch');input.focus();input.setSelectionRange(pos,pos);};$('#casaCatalogCategory').onchange=e=>{catalogCategory=e.target.value;refreshCatalog();$('#casaCatalogCategory').focus();};
      document.querySelectorAll('#casaCatalogCards .casa-offers').forEach(list=>{
        const items=[...list.children];if(items.length<=3)return;
        items.slice(2).forEach(el=>el.hidden=true);
        const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary casa-more-offers';toggle.textContent=`Ver mais ${items.length-2} lojas`;
        toggle.onclick=()=>{const hidden=items[2].hidden;items.slice(2).forEach(el=>el.hidden=!hidden);toggle.textContent=hidden?'Ver menos lojas':`Ver mais ${items.length-2} lojas`;};
        list.after(toggle);
      });
    }
    if(view==='casaStores'){
      const q=storeSearch.trim().toLocaleLowerCase('pt');
      const stores=c.stores.filter(s=>!q||s.name.toLocaleLowerCase('pt').includes(q));
      $('#casaStores').innerHTML=`<div class="section-head"><div><h2>Supermercados</h2><p>Lojas onde compras e preços configurados no catálogo.</p></div><div class="casa-actions"><input id="casaStoreSearch" type="search" placeholder="Pesquisar loja…" value="${esc(storeSearch)}"><button type="button" class="secondary" data-casa-catalog="products">Produtos</button><button type="button" class="primary" data-casa-catalog="new-store">+ Novo supermercado</button></div></div><div class="casa-card-grid">${stores.map(s=>`<article class="casa-store-card"><h3>${esc(s.name)}</h3><p>${c.catalog.filter(p=>p.offers[s.id]).length} produtos com oferta${c.catalog.some(p=>p.offers[s.id]&&!(p.offers[s.id].price>0))?' (alguns c/ preço em falta)':''}${s.archived?' · Arquivado':''}</p><div class="casa-actions"><button type="button" class="secondary" data-store-edit="${esc(s.id)}">Editar</button><button type="button" class="secondary" data-store-archive="${esc(s.id)}">${s.archived?'Reativar':'Arquivar'}</button></div></article>`).join('')||'<p class="empty">Ainda não há supermercados configurados.</p>'}</div>`;
      $('#casaStoreSearch').oninput=e=>{storeSearch=e.target.value;render();$('#casaStoreSearch').focus();};
    }
    if(view==='casaShopping'){
      const bar=$('#casaShopping .section-head .casa-actions');
      if(bar&&!bar.querySelector('[data-casa-catalog="queue-product"]')){
        bar.insertAdjacentHTML('afterbegin','<button type="button" class="secondary" data-casa-catalog="queue-product">+ Do catálogo</button><button type="button" class="primary" data-casa-catalog="checkout">Concluir marcados</button>');
      }
    }
  }
  document.addEventListener('click',e=>{
    const act=e.target.closest('[data-casa-catalog]')?.dataset.casaCatalog;
    if(act==='new-product')productForm();
    if(act==='import-table')importTableModal();
    if(act==='new-store')storeForm();
    if(act==='stores')navigate('casaStores');
    if(act==='products')navigate('casaProducts');
    if(act==='queue-product')queueProductForm();
    if(act==='checkout')checkoutForm();
    const edit=e.target.closest('[data-product-edit]')?.dataset.productEdit;if(edit)productForm(edit);
    const detail=e.target.closest('[data-product-detail]')?.dataset.productDetail;if(detail)openProductDetail(detail);
    const offer=e.target.closest('[data-product-offer]')?.dataset.productOffer;if(offer)offerForm(offer);
    const prodUrl=e.target.closest('[data-product-url]')?.dataset.productUrl;if(prodUrl)openExternalProductUrl(prodUrl);
    const arch=e.target.closest('[data-product-archive]')?.dataset.productArchive;if(arch){const p=C.state(data).catalog.find(p=>p.id===arch);commit(()=>C.saveProduct(data,{...p,archived:!p.archived}),'Catálogo atualizado.');}
    const sEdit=e.target.closest('[data-store-edit]')?.dataset.storeEdit;if(sEdit)storeForm(sEdit);
    const sArch=e.target.closest('[data-store-archive]')?.dataset.storeArchive;if(sArch){const s=C.state(data).stores.find(s=>s.id===sArch);commit(()=>C.saveStore(data,{...s,archived:!s.archived}),'Supermercado atualizado.');}
    const qItem=e.target.closest('[data-shop-catalog]')?.dataset.shopCatalog;if(qItem)queueProductForm(qItem);
    const adj=e.target.closest('[data-shop-adjust]')?.dataset.shopAdjust;if(adj)adjustShoppingItem(adj);
  });
  window.CasaCatalogUI=Object.freeze({render,productForm,offerForm,storeForm,queueProductForm,adjustShoppingItem,checkoutForm,openProductDetail,importTableModal,formatUnitPrice});
})();
