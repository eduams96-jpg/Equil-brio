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
    host.innerHTML=`<div class="section-head"><div><h2>${inStore?'Na loja':'Lista de compras'}</h2><p>${inStore?'Confere os artigos, ajusta os preços e guarda o talão no fim.':'Organiza por supermercado e categoria, prepara o carrinho e acompanha o total.'}</p></div><div class="casa-actions"><button type="button" class="secondary" id="casaStoreMode">${inStore?'Sair do modo loja':'Modo loja'}</button><button type="button" class="primary" id="casaCheckout" ${done.length?'':'disabled'}>Concluir ${store?'esta loja':'compras'} · ${done.length}</button></div></div>
      <div class="casa-shop-summary"><div><small>Lista estimada${unknown?' · parcial':''}</small><strong>${eur(total)}</strong><span>${unknown?unknown+' artigos sem preço':'Preços por embalagem'}</span></div><div><small>No carrinho</small><strong>${eur(cart)}</strong><span>${done.length} de ${selected.length} artigos</span></div><div><small>Por encontrar</small><strong>${pending}</strong><span>${selected.filter(r=>r.notFound).length} não encontrados</span></div></div>
      <progress aria-label="Progresso das compras" max="${selected.length||1}" value="${done.length}"></progress>
      <div class="casa-filter-bar"><label>Supermercado<select id="casaShopStore"><option value="">Todas as lojas</option>${c.stores.map(s=>`<option value="${esc(s.id)}" ${store===s.id?'selected':''}>${esc(s.name)}${s.archived?' (arquivado)':''}</option>`).join('')}</select></label><label>Pesquisar<input id="casaShopSearch" type="search" placeholder="Produto, categoria ou nota" value="${esc(search)}"></label><label>Mostrar<select id="casaShopStatus">${[['all','Todos'],['pending','Por comprar'],['done','No carrinho'],['missing','Não encontrados']].map(([id,name])=>`<option value="${id}" ${status===id?'selected':''}>${name}</option>`).join('')}</select></label></div>
      ${inStore?'':`<div class="casa-actions casa-shop-tools"><button type="button" class="secondary" id="casaQueueProduct">+ Produto do catálogo</button><button type="button" class="secondary" id="casaCompare">Comparar lojas</button><button type="button" class="secondary" id="casaSavedLists">Listas guardadas</button></div><form id="casaShoppingForm" class="casa-shop-add"><label>Artigo livre<input id="casaQuickItem" required maxlength="160" placeholder="O que falta comprar?"></label><label>Quantidade<input id="casaQuickQty" maxlength="80" placeholder="Ex.: 2 embalagens"></label><button type="submit" class="secondary">Adicionar</button></form>`}
      <div id="casaShopGroups"></div><p class="casa-shopping-note">Marcar artigos não cria despesas nem stock. Ao concluir, confere o talão e escolhe se queres debitar uma conta.</p>`;
    const paint=()=>{
      const groups=new Map(),q=search.trim().toLocaleLowerCase('pt');
      for(const row of selected){const p=c.catalog.find(p=>p.id===row.catalogId),category=p?.storeCategories?.[row.storeId]||p?.category||'Outros artigos';
        if((status==='pending'&&row.done)||(status==='done'&&!row.done)||(status==='missing'&&!row.notFound)||!`${row.name} ${category} ${row.note||''}`.toLocaleLowerCase('pt').includes(q))continue;
        const title=(store?'':(c.stores.find(s=>s.id===row.storeId)?.name||'Sem loja')+' · ')+category;
        if(!groups.has(title))groups.set(title,[]);groups.get(title).push(row);
      }
      $('#casaShopGroups').innerHTML=[...groups].sort(([a],[b])=>a.localeCompare(b,'pt')).map(([title,rows])=>`<section class="casa-shop-group"><h3>${esc(title)} <small>${rows.length}</small></h3>${rows.sort((a,b)=>Number(a.done)-Number(b.done)||a.name.localeCompare(b.name,'pt')).map(row=>{
        const estimate=estimates.find(x=>x?.id===row.id),p=c.catalog.find(p=>p.id===row.catalogId);
        return `<article class="casa-shop-row ${row.done?'is-done':''}" data-shop-row="${esc(row.id)}"><label class="casa-shop-check"><input type="checkbox" data-casa-toggle="${esc(row.id)}" ${row.done?'checked':''}><span><b>${esc(row.name)}</b><small>${esc(row.qty)}${row.notFound?' · Não encontrado':''}</small></span></label><div class="casa-shop-price"><strong>${estimate?eur(estimate.total):'Preço por definir'}</strong><small>${estimate?`${estimate.packages} × ${eur(estimate.price)} · ${qty(estimate.packageQty)} ${esc(estimate.unit)}`:'Associa a um produto para concluir'}</small></div>${row.note?`<p class="casa-shop-note">${esc(row.note)}</p>`:''}<div class="casa-actions"><button type="button" class="secondary" data-shop-edit="${esc(row.id)}">${inStore?'Preço / detalhes':'Editar'}</button>${p?'':`<button type="button" class="secondary" data-shop-link="${esc(row.id)}">Associar produto</button>`}<button type="button" class="secondary" data-shop-missing="${esc(row.id)}">${row.notFound?'Voltar a procurar':'Não encontrei'}</button><details><summary>Mais</summary><div class="casa-actions"><button type="button" class="secondary" data-shop-move="${esc(row.id)}">Mudar loja</button>${p?`<button type="button" class="secondary" data-shop-quantity="${esc(row.id)}">Quantidade necessária</button>`:''}<button type="button" class="secondary" data-casa-remove="${esc(row.id)}">Remover</button></div></details></div></article>`;
      }).join('')}</section>`).join('')||'<div class="casa-empty"><strong>Nenhum artigo neste grupo</strong><p>Altera os filtros ou adiciona artigos à lista.</p></div>';
      host.querySelectorAll('[data-casa-toggle]').forEach(b=>b.onchange=()=>commit(()=>C.shopping(data,'toggle',{id:b.dataset.casaToggle})));
      host.querySelectorAll('[data-shop-edit]').forEach(b=>b.onclick=()=>editItem(b.dataset.shopEdit));
      host.querySelectorAll('[data-shop-move]').forEach(b=>b.onclick=()=>moveItem(b.dataset.shopMove));
      host.querySelectorAll('[data-shop-link]').forEach(b=>b.onclick=()=>CasaCatalogUI.queueProductForm(b.dataset.shopLink));
      host.querySelectorAll('[data-shop-quantity]').forEach(b=>b.onclick=()=>CasaCatalogUI.adjustShoppingItem(b.dataset.shopQuantity));
      host.querySelectorAll('[data-shop-missing]').forEach(b=>b.onclick=()=>{const row=state().shopping.find(r=>r.id===b.dataset.shopMissing);commit(()=>E.updateShopping(data,row.id,{notFound:!row.notFound}));});
      host.querySelectorAll('[data-casa-remove]').forEach(b=>b.onclick=()=>commit(()=>C.shopping(data,'remove',{id:b.dataset.casaRemove})));
    };
    $('#casaShopStore').onchange=e=>{store=e.target.value;render();};
    $('#casaShopStatus').onchange=e=>{status=e.target.value;paint();};
    $('#casaShopSearch').oninput=e=>{search=e.target.value;paint();};
    $('#casaStoreMode').onclick=()=>{inStore=!inStore;render();};
    $('#casaCheckout').onclick=()=>CasaCatalogUI.checkoutForm(done.map(r=>r.id));
    if(!inStore){$('#casaQueueProduct').onclick=()=>CasaCatalogUI.queueProductForm();$('#casaCompare').onclick=()=>CasaDailyUI.compareForm();$('#casaSavedLists').onclick=()=>CasaDailyUI.listsForm();
      $('#casaShoppingForm').onsubmit=e=>{e.preventDefault();const name=$('#casaQuickItem').value,qty=$('#casaQuickQty').value;commit(()=>{C.shopping(data,'add',{name,qty});if(store)E.updateShopping(data,data.casa.shopping.at(-1).id,{storeId:store});});};}
    paint();
  }
  window.CasaShoppingUI=Object.freeze({render,editItem});
  const nav=PremiumUI.navigation;PremiumUI.navigation=v=>{nav?.(v);if(v==='casaShopping'){const add=$('#addTransaction');if(add)add.onclick=()=>{inStore=false;render();$('#casaQuickItem')?.focus();};}};
  render();
})();
