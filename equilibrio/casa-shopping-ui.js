(() => {
  'use strict';
  const C=CasaFinance,E=CasaComplete,L=CasaLife,$=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
  const qty=n=>new Intl.NumberFormat('pt-PT',{maximumFractionDigits:3}).format(n);
  const state=()=>C.state(data);
  let store='',status='all',search='',inStore=false,space='';
  const field=(label,name,value,type='text',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${extra}></label>`;
  function editItem(id){
    const c=state(),row=c.shopping.find(r=>r.id===id);if(!row)return;
    const p=c.catalog.find(p=>p.id===row.catalogId),offer=p?.offers[row.storeId],o=row.purchaseOverride;
    const stores=c.stores.filter(s=>!s.archived&&(!p||p.offers[s.id]));
    form(p?'Conferir artigo na loja':'Editar artigo',
      `<p>${esc(row.name)}${p?' · precisas de '+qty(row.requestedQty)+' '+esc(p.unit):''}</p>`+
      (p?'':field('Nome','itemName',row.name,'text','required maxlength="160"')+field('Quantidade','itemQty',row.qty,'text','maxlength="80"'))+
      `<label>Supermercado<select name="itemStore"><option value="">Sem loja</option>${stores.map(s=>`<option value="${esc(s.id)}" ${s.id===row.storeId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`+
      (offer?`<div class="two-cols">${field('Embalagens no carrinho','itemPackages',o?.packages??Math.ceil(Math.round(row.requestedQty*1000)/Math.round(offer.packageQty*1000)),'number','required min="1" step="1"')}${field('Preço por embalagem (€)','itemPrice',o?.price??offer.price,'number','required min="0.01" step="0.01"')}</div><p id="casaItemSize">${qty(offer.packageQty)} ${esc(p.unit)} por embalagem</p>`:'')+
      `<div class="two-cols">${field('Guardar em','itemLocation',row.location||'','text','maxlength="80" placeholder="Ex.: Despensa"')}${field('Validade','itemExpiry',row.expiry||'','date')}</div>`+
      field('Nota','itemNote',row.note||'','text','maxlength="500"'),
      v=>commit(()=>E.updateShopping(data,id,{...(v.get('itemStore')?{storeId:v.get('itemStore')}:{}),...(!p?{name:v.get('itemName'),qty:v.get('itemQty')}:{}),note:v.get('itemNote'),location:v.get('itemLocation'),expiry:v.get('itemExpiry'),...(offer?{purchaseOverride:{packages:Number(v.get('itemPackages')),price:Number(v.get('itemPrice'))}}:{})}),'Artigo atualizado.'),
      'O preço conferido fica nesta compra. O catálogo mantém o preço de referência; o local e a validade acompanham o artigo até à despensa.');
    const selector=$('[name=itemStore]');if(p){selector.querySelector('option[value=""]').remove();selector.onchange=()=>{const next=p.offers[selector.value];if(!next)return;$('[name=itemPackages]').value=Math.ceil(Math.round(row.requestedQty*1000)/Math.round(next.packageQty*1000));$('[name=itemPrice]').value=next.price;$('#casaItemSize').textContent=`${qty(next.packageQty)} ${p.unit} por embalagem`;};}
  }
  function moveItem(id){editItem(id);}
  function render(){
    const host=$('#casaShopping');if(!host)return;
    if(space!==key){space=key;store='';status='all';search='';inStore=false;}
    const c=state();if(store&&!c.stores.some(s=>s.id===store))store='';
    const selected=c.shopping.filter(r=>!store||r.storeId===store);
    const done=selected.filter(r=>r.done),pending=selected.length-done.length;
    const estimates=selected.map(row=>{
      const p=c.catalog.find(p=>p.id===row.catalogId),offer=p?.offers[row.storeId],o=row.purchaseOverride;
      if(!offer||o&&o.packageQty!==offer.packageQty)return null;
      const packages=o?.packages??Math.ceil(Math.round(row.requestedQty*1000)/Math.round(offer.packageQty*1000));
      return {id:row.id,total:packages*Finance.cents(o?.price??offer.price)/100,packages,price:o?.price??offer.price,packageQty:offer.packageQty,unit:p.unit};
    });
    const total=estimates.filter(Boolean).reduce((n,x)=>n+Finance.cents(x.total),0)/100;
    const cart=estimates.filter(x=>x&&done.some(r=>r.id===x.id)).reduce((n,x)=>n+Finance.cents(x.total),0)/100;
    const unknown=estimates.filter(x=>!x).length;
    host.classList.toggle('casa-in-store',inStore);
    const I=n=>window.InterfaceUI?.icon?InterfaceUI.icon(n):'';
    const pct=selected.length?Math.round(done.length/selected.length*100):0;
    const counts={all:selected.length,pending:selected.filter(r=>!r.done).length,done:done.length,missing:selected.filter(r=>r.notFound).length};
    const storeCount=id=>c.shopping.filter(r=>r.storeId===id).length;
    const storeChips=[['','Todas as lojas',c.shopping.length],...c.stores.filter(s=>!s.archived||storeCount(s.id)).map(s=>[s.id,s.name,storeCount(s.id)]).filter(([id,,n])=>n||id===store)];
    host.innerHTML=`<div class="section-head cs-head"><div><h2>${inStore?'Na loja':'Lista de compras'}</h2><p>${inStore?'Confere os artigos, ajusta os preços e guarda o talão no fim.':'Organiza por supermercado e categoria, prepara o carrinho e acompanha o total.'}</p></div><div class="casa-actions"><button type="button" class="secondary" id="casaStoreMode">${I('cart')}${inStore?'Sair do modo loja':'Modo loja'}</button><button type="button" class="primary" id="casaCheckout" ${done.length?'':'disabled'}>${I('check')}Concluir ${store?'esta loja':'compras'} · ${done.length}</button></div></div>
      <div class="casa-shop-summary cs-tiles"><article class="ch-tile is-blue"><span class="ch-tile-icon">${I('document')}</span><div><span>Lista estimada${unknown?' · parcial':''}</span><strong>${eur(total)}</strong><small>${unknown?unknown+' artigos sem preço':'Preços por embalagem'}</small></div></article><article class="ch-tile is-green"><span class="ch-tile-icon">${I('cart')}</span><div><span>No carrinho</span><strong>${eur(cart)}</strong><small>${done.length} de ${selected.length} artigos · ${pct}%</small><div class="cs-progress" role="progressbar" aria-label="Progresso das compras" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div></div></article><article class="ch-tile ${counts.missing?'is-red':'is-amber'}"><span class="ch-tile-icon">${I('search')}</span><div><span>Por encontrar</span><strong>${pending}</strong><small>${counts.missing} não encontrados</small></div></article></div>
      ${inStore?'':`<form id="casaShoppingForm" class="casa-shop-add cs-add"><span class="cs-add-icon">${I('plus')}</span><label><span class="visually-hidden">Artigo livre</span><input id="casaQuickItem" required maxlength="160" placeholder="O que falta comprar? (artigo livre)" aria-label="Artigo livre"></label><label><span class="visually-hidden">Quantidade</span><input id="casaQuickQty" maxlength="80" placeholder="Quantidade (ex.: 2 embalagens)" aria-label="Quantidade"></label><button type="submit" class="primary">Adicionar</button><button type="button" class="secondary cs-add-catalog" id="casaPickProduct">${I('tag')}Escolher do catálogo</button></form>`}
      <div class="cs-toolbar"><div class="cs-pills" role="group" aria-label="Mostrar">${[['all','Todos'],['pending','Por comprar'],['done','No carrinho'],['missing','Não encontrados']].map(([id,name])=>`<button type="button" class="${status===id?'active':''}" data-shop-status="${id}" aria-pressed="${status===id}">${name}<small>${counts[id]}</small></button>`).join('')}</div><label class="cs-search">${I('search')}<input id="casaShopSearch" type="search" placeholder="Pesquisar produto, categoria ou nota" value="${esc(search)}" aria-label="Pesquisar"></label>${inStore?'':`<details class="cs-more"><summary>Mais ações</summary><div><button type="button" class="secondary" id="casaCompare">${I('chart')}Comparar lojas</button><button type="button" class="secondary" id="casaSavedLists">${I('document')}Listas guardadas</button></div></details>`}</div>
      <div class="cs-stores" role="group" aria-label="Supermercado">${storeChips.map(([id,name,n])=>`<button type="button" class="${store===id?'active':''}" data-shop-store="${esc(id)}" aria-pressed="${store===id}">${id?`<i>${esc(String(name).trim().charAt(0).toUpperCase())}</i>`:I('all')}${esc(name)}<small>${n}</small></button>`).join('')}<select id="casaShopStore" hidden aria-hidden="true"><option value="">Todas as lojas</option>${c.stores.map(s=>`<option value="${esc(s.id)}" ${store===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div id="casaShopGroups" class="cs-groups"></div><p class="casa-shopping-note cs-note">${I('alert')}Marcar artigos não cria despesas nem stock. Ao concluir, confere o talão e escolhe se queres debitar uma conta.</p>`;
    const paint=()=>{
      const groups=new Map(),q=search.trim().toLocaleLowerCase('pt');
      for(const row of selected){const p=c.catalog.find(p=>p.id===row.catalogId),category=p?.storeCategories?.[row.storeId]||p?.category||'Outros artigos';
        if((status==='pending'&&row.done)||(status==='done'&&!row.done)||(status==='missing'&&!row.notFound)||!`${row.name} ${category} ${row.note||''}`.toLocaleLowerCase('pt').includes(q))continue;
        const title=(store?'':(c.stores.find(s=>s.id===row.storeId)?.name||'Sem loja')+' · ')+category;
        if(!groups.has(title))groups.set(title,[]);groups.get(title).push(row);
      }
      $('#casaShopGroups').innerHTML=[...groups].sort(([a],[b])=>a.localeCompare(b,'pt')).map(([title,rows])=>`<section class="casa-shop-group cs-group"><h3><span>${esc(title)}</span><small>${rows.filter(r=>r.done).length}/${rows.length}</small></h3>${rows.sort((a,b)=>Number(a.done)-Number(b.done)||a.name.localeCompare(b.name,'pt')).map(row=>{
        const estimate=estimates.find(x=>x?.id===row.id),p=c.catalog.find(p=>p.id===row.catalogId);
        return `<article class="casa-shop-row ${row.done?'is-done':''}" data-shop-row="${esc(row.id)}"><label class="casa-shop-check"><input type="checkbox" data-casa-toggle="${esc(row.id)}" ${row.done?'checked':''}><span><b>${esc(row.name)}</b><small>${esc(row.qty)}${row.notFound?' · Não encontrado':''}</small></span></label><div class="casa-shop-price"><strong>${estimate?eur(estimate.total):'Preço por definir'}</strong><small>${estimate?`${estimate.packages} × ${eur(estimate.price)} · ${qty(estimate.packageQty)} ${esc(estimate.unit)}`:'Associa a um produto para concluir'}</small></div>${row.note?`<p class="casa-shop-note">${esc(row.note)}</p>`:''}<div class="casa-actions"><button type="button" class="secondary" data-shop-edit="${esc(row.id)}">${inStore?'Preço / detalhes':'Editar'}</button>${p?'':`<button type="button" class="secondary" data-shop-link="${esc(row.id)}">Associar produto</button>`}<button type="button" class="secondary" data-shop-missing="${esc(row.id)}">${row.notFound?'Voltar a procurar':'Não encontrei'}</button><details class="cs-row-more"><summary aria-label="Mais ações">•••</summary><div class="casa-actions"><button type="button" class="secondary" data-shop-move="${esc(row.id)}">Mudar loja</button>${p?`<button type="button" class="secondary" data-shop-quantity="${esc(row.id)}">Quantidade necessária</button>`:''}<button type="button" class="secondary" data-casa-remove="${esc(row.id)}">Remover</button></div></details></div></article>`;
      }).join('')}</section>`).join('')||'<div class="casa-empty cs-empty">'+(window.InterfaceUI?.icon?InterfaceUI.icon('cart'):'')+'<strong>'+(selected.length?'Nenhum artigo com estes filtros':'A lista está vazia')+'</strong><p>'+(selected.length?'Altera os filtros ou a pesquisa.':'Escreve acima o que falta comprar ou junta um produto do catálogo.')+'</p></div>';
      host.querySelectorAll('[data-casa-toggle]').forEach(b=>b.onchange=()=>commit(()=>C.shopping(data,'toggle',{id:b.dataset.casaToggle})));
      host.querySelectorAll('[data-shop-edit]').forEach(b=>b.onclick=()=>editItem(b.dataset.shopEdit));
      host.querySelectorAll('[data-shop-move]').forEach(b=>b.onclick=()=>moveItem(b.dataset.shopMove));
      host.querySelectorAll('[data-shop-link]').forEach(b=>b.onclick=()=>CasaCatalogUI.queueProductForm(b.dataset.shopLink));
      host.querySelectorAll('[data-shop-quantity]').forEach(b=>b.onclick=()=>CasaCatalogUI.adjustShoppingItem(b.dataset.shopQuantity));
      host.querySelectorAll('[data-shop-missing]').forEach(b=>b.onclick=()=>{const row=state().shopping.find(r=>r.id===b.dataset.shopMissing);commit(()=>E.updateShopping(data,row.id,{notFound:!row.notFound}));});
      host.querySelectorAll('[data-casa-remove]').forEach(b=>b.onclick=()=>commit(()=>C.shopping(data,'remove',{id:b.dataset.casaRemove})));
    };
    $('#casaShopStore').onchange=e=>{store=e.target.value;render();};
    host.querySelectorAll('[data-shop-status]').forEach(b=>b.onclick=()=>{status=b.dataset.shopStatus;host.querySelectorAll('[data-shop-status]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});paint();});host.querySelectorAll('[data-shop-store]').forEach(b=>b.onclick=()=>{store=b.dataset.shopStore;render();});
    $('#casaShopSearch').oninput=e=>{search=e.target.value;paint();};
    $('#casaStoreMode').onclick=()=>{inStore=!inStore;render();};
    $('#casaCheckout').onclick=()=>CasaCatalogUI.checkoutForm(done.map(r=>r.id));
    if(!inStore){$('#casaPickProduct').onclick=()=>CasaCatalogUI.queueProductForm();$('#casaCompare').onclick=()=>CasaDailyUI.compareForm();$('#casaSavedLists').onclick=()=>CasaDailyUI.listsForm();
      $('#casaShoppingForm').onsubmit=e=>{e.preventDefault();const name=$('#casaQuickItem').value,qty=$('#casaQuickQty').value;commit(()=>{C.shopping(data,'add',{name,qty});if(store)E.updateShopping(data,data.casa.shopping.at(-1).id,{storeId:store});});};}
    paint();
  }
  window.CasaShoppingUI=Object.freeze({render,editItem});
  const nav=PremiumUI.navigation;PremiumUI.navigation=v=>{nav?.(v);if(v==='casaShopping'){const add=$('#addTransaction');if(add)add.onclick=()=>{inStore=false;render();$('#casaQuickItem')?.focus();};}};
  render();
})();
