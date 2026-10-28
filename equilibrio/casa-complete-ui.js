(() => {
  'use strict';
  const E=CasaComplete,C=CasaFinance,L=CasaLife,D=CasaDaily,$=(s,r=document)=>r.querySelector(s),state=()=>C.state(data);
  const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const eur=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
  const qty=n=>new Intl.NumberFormat('pt-PT',{maximumFractionDigits:3}).format(n);
  const field=(label,name,value='',type='text',attrs='')=>`<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${attrs}></label>`;
  const select=(label,name,rows,value='')=>`<label>${label}<select name="${name}">${rows.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
  const button=(text,action,host,attr)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;if(attr)b.setAttribute(attr,'');b.onclick=action;host.append(b);return b;};

  function categoryForm(id){const p=state().catalog.find(p=>p.id===id),stores=state().stores;
    if(!stores.length)return notice('Cria primeiro um supermercado.',true);
    form('Categorias por supermercado',select('Supermercado','categoryStore',stores.map(s=>[s.id,s.name]))+field('Categoria / subcategoria','storeCategory',p.storeCategories?.[stores[0].id]||'','text','maxlength="160" placeholder="Ex.: Alimentação / Mercearia"'),v=>commit(()=>E.category(data,id,v.get('categoryStore'),v.get('storeCategory')),'Categoria guardada.'),'A categoria geral do produto mantém-se. Podes usar um caminho como “Alimentação / Mercearia” em cada loja.');
    $('[name=categoryStore]').onchange=e=>$('[name=storeCategory]').value=p.storeCategories?.[e.target.value]||'';
  }
  function enhanceProducts(){document.querySelectorAll('[data-product-edit]').forEach(b=>{if($('[data-store-category]',b.parentElement))return;button('Categorias por loja',()=>categoryForm(b.dataset.productEdit),b.parentElement,'data-store-category');});}
  function compactProductActions(){
    document.querySelectorAll('#casaCatalogCards .casa-card-actions-more').forEach(details=>{const actions=details.parentElement;details.querySelectorAll('button').forEach(button=>actions.insertBefore(button,details));details.remove();});
  }

  function editListForm(id){const list=(state().lists||[]).find(l=>l.id===id);if(!list)return;
    form('Editar lista guardada',field('Nome','listName',list.name,'text','required maxlength="80"')+'<div id="casaSavedRows"></div><button type="button" class="secondary" id="casaSavedAdd">+ Produto</button><button type="button" class="secondary" id="casaSavedFree">+ Artigo livre</button>',v=>{
      const items=[...document.querySelectorAll('#casaSavedRows .casa-ingredient-row')].map(row=>($('[name=savedProduct]',row)?{catalogId:$('[name=savedProduct]',row).value,qty:Number($('[name=savedQty]',row).value)}:{name:$('[name=savedName]',row).value,qty:Number($('[name=savedQty]',row).value)}));
      return commit(()=>E.editList(data,id,v.get('listName'),items),'Modelo atualizado.');
    },'Altera apenas o modelo. A lista de compras atual não muda.');
    const add=i=>{const row=document.createElement('div');row.className='casa-ingredient-row';row.innerHTML=(i?.name!==undefined?field('Artigo livre','savedName',i.name,'text','required maxlength="160"'):select('Produto','savedProduct',state().catalog.map(p=>[p.id,p.name+' · '+p.unit]),i?.catalogId))+field('Quantidade','savedQty',i?.qty||1,'number','required min="0.001" step="0.001"');button('Remover',()=>row.remove(),row);$('#casaSavedRows').append(row);};
    list.items.forEach(add);$('#casaSavedAdd').onclick=()=>{if(!state().catalog.length)return notice('Cria primeiro um produto ou adiciona um artigo livre.',true);add();};$('#casaSavedFree').onclick=()=>add({name:'',qty:1});
  }

  function packagingForm(id){const lot=state().stock.find(l=>l.id===id),n=L.remaining(state(),lot),p=lot.packaging;
    form('Embalagens do lote',`<p>Disponível: ${qty(n)} ${esc(lot.unit)}.</p>`+field('Conteúdo de uma embalagem ('+esc(lot.unit)+')','packSize',p?.size||1,'number','required min="0.001" step="0.001"')+field('Número de embalagens fechadas','packClosed',p?.closed||0,'number','required min="0" step="1"'),v=>commit(()=>E.packaging(data,id,Number(v.get('packSize')),Number(v.get('packClosed'))),'Embalagens atualizadas.'),'Ex.: pack com seis garrafas de 1,5 L: conteúdo 1,5 L e seis fechadas. O restante stock é quantidade aberta. A quantidade total não é alterada.');
  }
  function enhanceStock(){document.querySelectorAll('[data-lot-edit]').forEach(b=>{
    const lot=state().stock.find(l=>l.id===b.dataset.lotEdit);if($('[data-pack-config]',b.parentElement))return;
    button('Embalagens',()=>packagingForm(lot.id),b.parentElement,'data-pack-config');
    if(lot.packaging){const n=L.remaining(state(),lot),p=document.createElement('p');p.textContent=`${lot.packaging.closed} fechadas × ${qty(lot.packaging.size)} ${lot.unit} · ${qty(n-lot.packaging.closed*lot.packaging.size)} ${lot.unit} abertos`;b.closest('article').append(p);const open=button('Abrir embalagem',()=>commit(()=>E.openPackage(data,lot.id),'Embalagem aberta.'),b.parentElement,'data-pack-open');open.disabled=!lot.packaging.closed;}
  });}

  function discountForm(id){const p=state().purchases.find(p=>p.id===id),gross=p.items.reduce((n,i)=>n+Finance.cents(i.total),0)/100;
    form('Desconto do talão',`<p>Total antes do desconto: ${eur(gross)}.</p>`+field('Desconto total (€)','receiptDiscount',p.discount||0,'number',`required min="0" max="${gross}" step="0.01"`),v=>commit(()=>C.correctPurchase(data,id,p.items.map(i=>i.catalogId?i.price:i.total),Number(v.get('receiptDiscount'))),'Desconto e pagamento atualizados.'),'Usa para um desconto aplicado no talão original. Se a loja devolveu dinheiro mais tarde, usa Reembolso. Um desconto de 100% elimina o débito associado.');
  }
  function returnForm(id, defaultDate = Finance.today()){const c=state(),p=c.purchases.find(p=>p.id===id),lots=c.stock.filter(l=>l.purchaseId===id&&L.remaining(c,l)>0),refunded=E.refunds(data).filter(r=>r.purchaseId===id).reduce((n,r)=>n+Finance.cents(r.amount),0)/100;
    const token=Finance.id();form('Devolução / reembolso',`<p>Pago: ${eur(p.total)} · já reembolsado: ${eur(refunded)}.</p>`+field('Data','returnDate',defaultDate,'date',`required min="${p.date}" max="${Finance.today()}"`)+select('Stock a devolver (opcional)','returnLot',[['','Só reembolso, sem retirar stock'],...lots.map(l=>[l.id,c.catalog.find(p=>p.id===l.catalogId).name+' · '+qty(L.remaining(c,l))+' '+l.unit])])+field('Quantidade a retirar (zero para só reembolso)','returnQty',0,'number','required min="0" step="0.001"')+field('Valor recebido (€)','returnAmount',0,'number',`required min="0" max="${Finance.money(p.total-refunded)}" step="0.01"`)+(p.transactionId?(()=>{const originalAccount=data.transactions.find(t=>t.id===p.transactionId)?.account;return select('Conta onde recebeste','returnAccount',data.accounts.filter(a=>!a.archived||a.name===originalAccount).map(a=>[a.name,a.name]),originalAccount);})():'<p>Compra sem movimento financeiro: este registo não altera nenhuma conta.</p>')+field('Motivo','returnNote','','text','required maxlength="500"'),v=>commit(()=>E.returnPurchase(data,{id:token,purchaseId:id,date:v.get('returnDate'),lotId:v.get('returnLot'),qty:Number(v.get('returnQty')),amount:Number(v.get('returnAmount')),account:v.get('returnAccount'),note:v.get('returnNote')}),'Devolução / reembolso registado.'),'Não podes devolver mais stock do que existe, nem receber mais do que pagaste. Para devolver vários lotes, regista cada um separadamente.');
  }
  function enhancePurchase(id){const p=state().purchases.find(p=>p.id===id);if(!p)return;const host=$('#modalContent'),actions=document.createElement('div');actions.className='casa-actions';host.append(actions);
    button('Desconto do talão',()=>discountForm(id),actions,'data-discount');button('Devolução / reembolso',()=>returnForm(id),actions,'data-return');
    const details=document.createElement('div');details.innerHTML=`<p>Desconto: ${eur(p.discount||0)}</p>${E.refunds(data).some(r=>r.purchaseId===id&&r.legacy)?'<p>Há reembolsos antigos associados em Movimentos. Estão incluídos nos totais; consulta-os nessa página.</p>':''}`;host.append(details);
    for(const r of (state().returns||[]).filter(r=>r.purchaseId===id)){const row=document.createElement('div');row.className='panel';row.innerHTML=`<p>${esc(r.date)} · ${eur(r.amount)} reembolsados · ${qty(r.qty)} devolvidos${r.lotId?' '+esc(state().stock.find(l=>l.id===r.lotId)?.unit||''):''}</p><p>${esc(r.note)}</p>`;button('Anular devolução',()=>{
      const payment=data.transactions.find(t=>t.id===r.transactionId),account=data.accounts.find(a=>a.name===payment?.account);
      const covered=payment&&account?.reconciledOn>=payment.date;
      const warning=covered?'<p class="practical-diagnostic">Este reembolso está abrangido pela conferência do saldo da conta. Ao anular, conserva-se a data histórica, mas o saldo terá de ser conferido novamente com o extrato.</p>':'';
      form('Anular devolução / reembolso','<p>O reembolso será retirado da conta e o stock devolvido voltará ao lote. Confirma que o registo estava errado.</p>'+warning,()=>commit(()=>E.removeReturn(data,r.id),'Devolução anulada.'),'','Anular');
    },row,'data-return-remove');details.append(row);}
  }

  function weekForm(){const start=$('#casaWeek')?.value||Finance.today();form('Sugerir refeições da semana',field('Primeiro dia','weekStart',start,'date','required')+field('Porções por refeição','weekServings',2,'number','required min="1" max="1000" step="1"'),v=>{weekPreview(v.get('weekStart'),Number(v.get('weekServings')));return false;},'Preenche apenas almoços e jantares vazios, a partir de hoje. Mantém o que já planeaste.','Ver sugestão');}
  function weekPreview(start,servings){const preview=E.weekly(data,start,servings);form('Conferir semana sugerida',`<ul>${preview.rows.map(p=>`<li>${esc(p.date)} · ${p.meal==='lunch'?'Almoço':'Jantar'} · ${esc(state().recipes.find(r=>r.id===p.recipeId).name)}</li>`).join('')||'<li>Não há lugares livres neste período.</li>'}</ul><h3>Ingredientes em falta para a semana</h3><ul>${preview.needs.map(n=>{const p=state().catalog.find(p=>p.id===n.catalogId);return `<li>${esc(p.name)} · ${qty(n.qty)} ${esc(p.unit)}</li>`;}).join('')||'<li>O stock válido e os pendentes cobrem a semana.</li>'}</ul>`,()=>commit(()=>E.applyWeek(data,start,servings,JSON.stringify(preview)),'Semana planeada. Usa “Ingredientes da semana à lista” para preparar as compras.'),'A sugestão alterna receitas e considera stock, validade e abertos. Podes editar ou trocar cada refeição depois. Não compra nem consome automaticamente.','Guardar plano');}
  function enhanceMeals(){const host=$('#casaMeals .section-head .casa-actions');if(host&&!$('#casaSuggestWeek')){const b=button('Sugerir semana',weekForm,host);b.id='casaSuggestWeek';}}

  function forecastForm(){const rows=E.forecasts(data),eligible=rows.some(r=>r.confidence==='moderada'&&r.qty>0);form('Previsão de reposição',`<div class="restock-forecast-intro"><h3>O que poderá faltar nos próximos 14 dias</h3><p>Confere o consumo registado, a autonomia e a quantidade proposta antes de adicionar à lista.</p></div><div class="casa-table-wrap"><table class="casa-life-table"><thead><tr><th>Produto</th><th>Histórico</th><th>Autonomia estimada</th><th>Falta para 14 dias</th></tr></thead><tbody>${rows.map(r=>{const p=state().catalog.find(p=>p.id===r.catalogId);return `<tr><td>${esc(p.name)}</td><td>${r.observations} dias · confiança ${r.confidence}</td><td>${r.days===null?'Sem dados suficientes':r.days+' dias'}</td><td>${qty(r.qty)} ${esc(p.unit)}</td></tr>`;}).join('')}</tbody></table></div>`,()=>{if(!eligible)return true;const now=E.forecasts(data);if(JSON.stringify(now)!==JSON.stringify(rows))throw Error('O stock ou o histórico mudaram. Revê a previsão.');const needs=now.filter(r=>r.confidence==='moderada'&&r.qty>0).map(r=>({catalogId:r.catalogId,qty:r.qty}));if(!needs.length)throw Error('Ainda não há previsões com confiança moderada e produtos em falta.');return commit(()=>L.queueNeeds(data,needs),'Reposição prevista adicionada à lista.');},'Estimativa pela média do consumo registado nos últimos 90 dias. Exige pelo menos três dias com consumo em duas semanas; confiança moderada exige oito dias de registos em pelo menos 30 dias. Desconta a lista pendente. Consumo não registado reduz a fiabilidade.',eligible?'Adicionar previsões moderadas à lista':'Fechar');$('#modal').classList.add('restock-forecast-dialog');$('#modal').addEventListener('close',()=>$('#modal').classList.remove('restock-forecast-dialog'),{once:true});}

  function dashboard(){
    // A partir da v0.35, tudo o que é Casa vive apenas nas páginas Casa.
    // Remover também qualquer host legado criado por versões anteriores.
    $('#casaDashboardStrip')?.remove();
  }
  function render(target){if(!target||target==='casaProducts'){enhanceProducts();compactProductActions();}if(!target||target==='casaStock')enhanceStock();if(!target||target==='casaMeals')enhanceMeals();const stock=$('#casaStock .section-head .casa-actions');if(stock&&!$('#casaForecast')){const b=button('Prever reposição',forecastForm,stock);b.id='casaForecast';}dashboard();}
  window.CasaCompleteUI=Object.freeze({render,enhanceProducts,compactProductActions,enhanceMeals,enhancePurchase,editListForm,packagingForm,returnForm,weekForm,forecastForm});
  render();
})();
