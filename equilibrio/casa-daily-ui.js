(() => {
 'use strict';
 const D=CasaDaily,C=CasaFinance,L=CasaLife,$=(s,r=document)=>r.querySelector(s),state=()=>C.state(data);
 const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const qtyFmt=new Intl.NumberFormat('pt-PT',{maximumFractionDigits:3}),eurFmt=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}),eurUnitFmt=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',minimumFractionDigits:3,maximumFractionDigits:4});
 const qty=n=>qtyFmt.format(n);
 const eur=n=>eurFmt.format(n);
 const eurUnit=n=>Number.isFinite(n)&&Math.abs(n)>0&&Math.abs(n)<0.01?eurUnitFmt.format(n):eur(n);
 const pctFmt=new Intl.NumberFormat('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1});
 const field=(label,name,value='',type='text',attrs='')=>`<label>${esc(label)}<input name="${esc(name)}" value="${esc(value)}" type="${type}" ${attrs}></label>`;
 let stockSearch='',stockMode='active';const stockLocations=new Map();
 let analyticsMonth=Finance.today().slice(0,7);
 function compareForm(limit=2){
  try{
   const result=D.compare(data,limit),p=result.best,c=state();
   const relevantSet=new Set(result.relevantStoreIds||[]);
   const missingDist=result.perKm>0?c.stores.filter(s=>!s.archived&&!(s.distanceKm>0)&&relevantSet.has(s.id)):[];
   const currentNote=p&&result.current?comparisonVsCurrent(result,p):'';
   const rowsHtml=result.candidates.length
    ?`<div class="casa-table-wrap u-table-scroll"><table class="casa-life-table casa-compare-table"><thead><tr><th>Loja</th><th>Cobertura</th><th>Produtos</th><th>Deslocação</th><th>Total</th></tr></thead><tbody>${result.candidates.map(r=>`<tr><td>${comparisonStore(c,r.stores[0])}${r.missing.length?`<br><small class="negative">Em falta: ${esc(r.missing.join(', '))}</small>`:''}</td><td>${r.assignments.length}/${result.rows}</td><td>${eur(r.products)}</td><td>${r.uncertainTravel?'Por apurar':eur(r.travel)}</td><td><strong>${eur(r.total)}</strong>${r.uncertainTravel?'<br><small>+ deslocação</small>':''}${r.missing.length?'<br><small>(parcial)</small>':''}</td></tr>`).join('')}</tbody></table></div>`
    :'<p class="muted">Nenhuma loja ativa tem preços configurados para os artigos desta lista.</p>';
   const uncoveredHtml=result.uncoveredStores?.length?`<details class="casa-history-disclosure casa-compare-uncovered"><summary>Lojas sem preços para os artigos desta lista (${result.uncoveredStores.length})</summary><p class="muted">${esc(result.uncoveredStores.join(', '))}</p></details>`:'';
   form('Comparar a lista',`<p>Produtos por comprar: ${result.rows}. Artigos livres excluídos: ${result.excluded}.</p><div class="casa-compare-opts">${field('Ponto de partida','compareOrigin',c.travelOrigin||'','text','maxlength="240"')}<label>Máximo de lojas<select id="casaCompareLimit">${[1,2,3].map(n=>`<option ${n===limit?'selected':''}>${n}</option>`).join('')}</select></label><label>Custo por km (€)<input id="casaCompareKm" type="number" min="0" max="5" step="0.01" inputmode="decimal" value="${result.perKm}"></label></div>${missingDist.length?`<p class="casa-compare-hint">Sem distância configurada: ${esc(missingDist.map(s=>s.name).join(', '))}. Podes indicá-la em Lojas → Editar.</p>`:''}${rowsHtml}${uncoveredHtml}${p?`<h3>${p.uncertainTravel?'Cabaz completo · deslocação por apurar':'Melhor combinação com os custos conhecidos'} · ${eur(p.total)}</h3>${currentNote}${comparisonSavings(result,p)}${p.travel?`<p>${eur(p.products)} em produtos + ${eur(p.travel)} de deslocação.</p>`:''}<ul>${p.assignments.map(a=>{const row=c.shopping.find(s=>s.id===a.id);return `<li>${esc(row.name)} → ${esc(c.stores.find(s=>s.id===a.storeId).name)} · ${a.packages} ${a.packages===1?'embalagem':'embalagens'} · ${eur(a.total)}${!a.date||a.date<dateOffset(-30)?' · confirmar preço antigo':''}</li>`;}).join('')}</ul>`:'<p>Não existe uma combinação que cubra todos os produtos. Configura os preços em falta.</p>'}`,()=>p?commit(()=>D.applyPlan(data,limit,JSON.stringify(p)),'Lojas aplicadas à lista.'):true,'Compara embalagens inteiras e preços registados e soma a deslocação (distância × custo por km) de cada loja usada. Confirma os preços na loja.',p?'Aplicar lojas':'Fechar');
   $('#modal').classList.add('casa-compare-dialog');
   $('#modal').addEventListener('close',()=>$('#modal').classList.remove('casa-compare-dialog'),{once:true});
   $('[name=compareOrigin]').onchange=e=>{if(commit(()=>D.setTravelOrigin(data,e.target.value)))compareForm(limit);};
   $('#casaCompareLimit').onchange=e=>compareForm(Number(e.target.value));
   $('#casaCompareKm').onchange=e=>{if(commit(()=>D.setTravelRate(data,e.target.value)))compareForm(limit);};
  }catch(e){notice(e.message,true);}
 }
 function comparisonVsCurrent(result,plan){
  const cur=result.current;
  if(!cur)return '';
  const diffProd=Finance.money(cur.products-plan.products);
  const diffTotal=Finance.money(cur.total-plan.total);
  const withTravel=!cur.uncertainTravel&&!plan.uncertainTravel&&result.perKm>0;
  if(diffProd>0||(withTravel&&diffTotal>0))return `<p>Poupança face à lista atual (${eur(cur.products)}): <strong>${eur(diffProd)}</strong> nos produtos${withTravel?` · <strong>${eur(diffTotal)}</strong> após deslocação`:''}.</p>`;
  if(Math.abs(diffProd)<0.01&&(!withTravel||Math.abs(diffTotal)<0.01))return `<p>A escolha atual da lista já iguala o melhor preço encontrado (${eur(cur.products)}).</p>`;
  return '';
 }
 function comparisonSavings(result,plan){
  const base=result.candidates.filter(r=>!r.missing.length&&!r.uncertainTravel).sort((a,b)=>a.total-b.total)[0];
  if(!base||plan.uncertainTravel||plan.stores.length<2)return '';
  return '<p>Face à melhor loja individual: '+eur(base.products-plan.products)+' no cabaz · '+eur(base.total-plan.total)+' após deslocação.</p>';
 }
 function comparisonStore(c,id){
  const s=c.stores.find(x=>x.id===id),km=s.distanceKm,label={straight:'linha reta',road:'por estrada',estimate:'estimativa'}[s.routeKind]||'estimativa';
  const maps=new URL('https://www.google.com/maps/dir/');
  maps.search=new URLSearchParams({api:'1',destination:s.address||'',travelmode:'driving',...(c.travelOrigin?{origin:c.travelOrigin}:{})});
  return '<b>'+esc(s.name)+'</b>'+(s.address?'<br><small>'+esc(s.address)+'</small> · <a href="'+esc(maps.href)+'" target="_blank" rel="noopener noreferrer">Trajeto</a>':'')+
   (km?'<br><small>'+qty(km)+' km · '+label+(s.durationMinutes!=null?' · '+qty(s.durationMinutes)+' min':'')+'</small>':'');
 }
 function dateOffset(n){const d=new Date(Finance.today()+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function listsForm(){const c=state();form('Listas reutilizáveis',field('Nome para guardar a lista atual','savedListName','','text','maxlength="80"')+'<button type="button" id="casaSaveList" class="secondary">Guardar produtos por comprar</button>'+`<div class="casa-card-grid">${(c.lists||[]).map(l=>`<article class="casa-product-card"><h3>${esc(l.name)}</h3><p>${l.items.length} produtos</p><button type="button" class="secondary" data-list-use="${esc(l.id)}">Adicionar à lista</button><button type="button" class="secondary" data-list-edit="${esc(l.id)}">Editar</button><button type="button" class="secondary" data-list-delete="${esc(l.id)}">Eliminar modelo</button></article>`).join('')||'<p>Ainda não há listas guardadas.</p>'}</div>`,()=>true,'Guarda modelos como “Compras da semana” ou “Festa”. Ao reutilizar, desconta os produtos já pendentes; não desconta o stock.','Fechar');$('#casaSaveList').onclick=()=>{if(commit(()=>D.saveList(data,$('[name=savedListName]').value),'Lista guardada.'))listsForm();};document.querySelectorAll('[data-list-use]').forEach(b=>b.onclick=()=>{if(commit(()=>D.useList(data,b.dataset.listUse),'Produtos adicionados sem duplicar pendentes.'))listsForm();});document.querySelectorAll('[data-list-edit]').forEach(b=>b.onclick=()=>CasaCompleteUI.editListForm(b.dataset.listEdit));document.querySelectorAll('[data-list-delete]').forEach(b=>b.onclick=()=>form('Eliminar modelo','<p>A lista de compras atual mantém-se.</p>',()=>commit(()=>D.removeList(data,b.dataset.listDelete)),'','Eliminar'));}
 function correctionForm(id){const p=state().purchases.find(p=>p.id===id);form('Corrigir valores da compra',p.items.map((i,n)=>field(i.name+(i.catalogId?' · preço por embalagem (€)':' · total (€)'),`correctPrice${n}`,i.catalogId?i.price:i.total,'number',`required min="${i.catalogId?'0.01':'0'}" step="0.01"`)).join(''),v=>commit(()=>C.correctPurchase(data,id,p.items.map((i,n)=>Number(v.get('correctPrice'+n)))),'Compra corrigida.'),p.transactionId?'A quantidade, os lotes e o consumo mantêm-se. A ligação histórica ajusta o saldo pela diferença; a correção fica guardada.':'A quantidade, os lotes e o consumo mantêm-se. A correção fica apenas na Casa.');}
 function linkMovementForm(id){
  const p=state().purchases.find(p=>p.id===id);if(!p)return;
  const accounts=data.accounts.filter(a=>!a.archived);
  if(!accounts.length)return notice('Ativa primeiro uma conta para registar a despesa.',true);
  const categories=Finance.categoriesFor?Finance.categoriesFor(data,'expense'):['Alimentação','Casa'];
  const list=categories.length?categories:['Alimentação','Casa'];
  const preferred=list.find(x=>/aliment|supermercado|mercearia/i.test(x))||list[0];
  form('Registar despesa da compra',
   `<p>${esc(p.store)} · ${esc(p.date)} · <strong>${eur(p.total)}</strong></p>`+
   `<label>Conta<select name="linkAccount">${accounts.map(a=>`<option value="${esc(a.name)}">${esc(a.name)} (${eur(a.balance)})</option>`).join('')}</select></label>`+
   `<label>Categoria<select name="linkCategory">${list.map(cat=>`<option value="${esc(cat)}" ${cat===preferred?'selected':''}>${esc(cat)}</option>`).join('')}</select></label>`,
   v=>commit(()=>C.link(data,id,v.get('linkAccount'),v.get('linkCategory')),'Despesa criada em Movimentos e associada à compra.'),
   'Cria uma despesa financeira com esta data e valor e associa-a à compra sem alterar o stock.','Registar despesa');
 }
 function attachForm(id){const p=state().purchases.find(p=>p.id===id),rows=data.transactions.filter(t=>t.type==='expense'&&t.amount===p.total&&t.date===p.date&&t.source!=='Casa integrado'&&!t.debtId&&!t.refundOf&&!t.recurringRuleId&&!t.pendingId&&!t.installmentPaymentId&&!(data.installmentPlans||[]).some(x=>x.transactionId===t.id)&&!(data.sharedExpenses||[]).some(x=>x.transactionId===t.id)&&!(data.investmentTrades||[]).some(x=>x.transactionId===t.id)&&!data.transactions.some(x=>x.refundOf===t.id));if(!rows.length)return notice('Não há despesas simples com a mesma data e valor. Confere primeiro o registo em Movimentos.',true);form('Associar despesa existente',`<label>Movimento<select name="existingMovement">${rows.map(t=>`<option value="${esc(t.id)}">${esc(t.date+' · '+t.description+' · '+t.account)} · ${eur(t.amount)}</option>`).join('')}</select></label>`,v=>commit(()=>C.attachMovement(data,id,v.get('existingMovement')),'Movimento associado sem novo débito.'),'Confirma que esta é a despesa da compra. Não será criada outra despesa nem alterado o saldo.','Associar');}
 function enhancePurchase(id){
  const p=state().purchases.find(p=>p.id===id),host=$('#modalContent');
  if(!p)return;
  const actions=document.createElement('div');actions.className='casa-actions';
  const pilotLinked=(state().financeLinks||[]).some(l=>l.purchaseId===p.id);
  const unlinked=!p.transactionId&&!pilotLinked&&p.total>0&&!(state().returns||[]).some(r=>r.purchaseId===p.id);
  const compatibleCount=unlinked&&!p.preservedPayment?data.transactions.filter(t=>t.type==='expense'&&t.amount===p.total&&t.date===p.date&&t.source!=='Casa integrado'&&!t.debtId&&!t.refundOf&&!t.recurringRuleId&&!t.pendingId&&!t.installmentPaymentId&&!(data.installmentPlans||[]).some(x=>x.transactionId===t.id)&&!(data.sharedExpenses||[]).some(x=>x.transactionId===t.id)&&!(data.investmentTrades||[]).some(x=>x.transactionId===t.id)&&!data.transactions.some(x=>x.refundOf===t.id)).length:0;
  actions.innerHTML='<button type="button" class="secondary" data-correct>Corrigir valores</button>'+
   (unlinked&&!p.preservedPayment?`<button type="button" class="secondary" id="casaAttachMovement" data-attach>Associar a despesa${compatibleCount?' ('+compatibleCount+')':''}…</button>`:'')+
   (unlinked?'<button type="button" class="secondary" id="casaCreateMovement" data-link-expense>Registar despesa na conta…</button>':'');
  host.append(actions);
  $('[data-correct]',actions).onclick=()=>correctionForm(p.id);
  if($('[data-attach]',actions))$('[data-attach]',actions).onclick=()=>attachForm(p.id);
  if($('[data-link-expense]',actions))$('[data-link-expense]',actions).onclick=()=>linkMovementForm(p.id);
  if(p.corrections?.length){const history=document.createElement('p');history.textContent='Correções: '+p.corrections.map(x=>`${x.date}: ${eur(x.from)} → ${eur(x.to)}`).join('; ');host.append(history);}
 }
 let homeAnalysisTab='expenses';
 function houseSpendAnalytics(c0,x,month){
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt').trim();
  const storeList=c0.stores.map(s=>({id:s.id,name:s.name,key:norm(s.name)})).filter(s=>s.key.length>=2);
  const houseCatRe=/^(aliment|supermercado|mercearia|talho|peixaria|padaria|casa\b|despensa|limpeza|higiene|lar\b)/i;
  const linkedTxIds=new Set(c0.purchases.map(p=>p.transactionId).filter(Boolean).map(String));
  const pilotPurchaseIds=new Set((c0.financeLinks||[]).map(l=>String(l.purchaseId||'')).filter(Boolean));
  const matchStore=tx=>{
   const hay=norm((tx.beneficiary||'')+' '+(tx.description||''));
   return storeList.find(s=>hay.includes(s.key))||null;
  };
  const isHouseTx=tx=>{
   if(tx.type!=='expense')return false;
   if(linkedTxIds.has(String(tx.id)))return true;
   if(matchStore(tx))return true;
   return houseCatRe.test(norm(tx.category||''));
  };
  const allHouseTx=(data.transactions||[]).filter(isHouseTx);
  const houseTxIdSet=new Set(allHouseTx.map(t=>String(t.id)));
  const houseRefunds=(data.transactions||[]).filter(t=>t.type==='income'&&t.refundOf&&houseTxIdSet.has(String(t.refundOf)));
  const houseTxById=new Map(allHouseTx.map(t=>[String(t.id),t]));
  const historicalOnly=c0.purchases.filter(p=>!p.transactionId&&!pilotPurchaseIds.has(String(p.id)));
  const historicalIds=new Set(historicalOnly.map(p=>String(p.id)));
  const historicalReturns=(c0.returns||[]).filter(r=>!r.transactionId&&historicalIds.has(String(r.purchaseId)));
  const monthSpendFor=m=>{
   const txRows=allHouseTx.filter(t=>String(t.date||'').startsWith(m));
   const txRefRows=houseRefunds.filter(t=>String(t.date||'').startsWith(m));
   const legacyRows=historicalOnly.filter(p=>String(p.date||'').startsWith(m));
   const legacyRetRows=historicalReturns.filter(r=>String(r.date||'').startsWith(m));
   const txCents=txRows.reduce((n,t)=>n+Finance.cents(t.amount||0),0)-txRefRows.reduce((n,t)=>n+Finance.cents(t.amount||0),0);
   const legCents=legacyRows.reduce((n,p)=>n+Finance.cents(p.total||0),0)-legacyRetRows.reduce((n,r)=>n+Finance.cents(r.amount||0),0);
   return {total:(txCents+legCents)/100,count:txRows.length+legacyRows.length};
  };
  const monthly=x.monthly.map(m=>({month:m.month,...monthSpendFor(m.month)}));
  const currentMonth=monthly.at(-1)||{total:0,count:0};
  const prevMonth=monthly.at(-2)||{total:0,count:0};
  const storeMap=new Map(),catMap=new Map();
  for(const tx of allHouseTx.filter(t=>String(t.date||'').startsWith(month))){
   const matched=matchStore(tx);
   const label=matched?.name||(String(tx.beneficiary||tx.description||'Sem estabelecimento').trim().slice(0,40)||'Sem estabelecimento');
   storeMap.set(label,(storeMap.get(label)||0)+Finance.cents(tx.amount||0));
   const parts=String(tx.category||'Casa').split('/').map(s=>s.trim()).filter(Boolean);
   const catLabel=parts.length>1?parts.slice(0,2).join(' / '):(parts[0]||'Casa');
   catMap.set(catLabel,(catMap.get(catLabel)||0)+Finance.cents(tx.amount||0));
  }
  for(const ref of houseRefunds.filter(t=>String(t.date||'').startsWith(month))){
   const orig=houseTxById.get(String(ref.refundOf));
   const matched=orig?matchStore(orig):null;
   const label=matched?.name||(orig?String(orig.beneficiary||orig.description||'Sem estabelecimento').trim().slice(0,40):'Sem estabelecimento');
   storeMap.set(label,(storeMap.get(label)||0)-Finance.cents(ref.amount||0));
   const parts=String(orig?.category||'Casa').split('/').map(s=>s.trim()).filter(Boolean);
   const catLabel=parts.length>1?parts.slice(0,2).join(' / '):(parts[0]||'Casa');
   catMap.set(catLabel,(catMap.get(catLabel)||0)-Finance.cents(ref.amount||0));
  }
  for(const p of historicalOnly.filter(r=>String(r.date||'').startsWith(month))){
   storeMap.set(p.store,(storeMap.get(p.store)||0)+Finance.cents(p.total||0));
   catMap.set('Histórico Casa',(catMap.get('Histórico Casa')||0)+Finance.cents(p.total||0));
  }
  for(const r of historicalReturns.filter(r=>String(r.date||'').startsWith(month))){
   const orig=historicalOnly.find(p=>String(p.id)===String(r.purchaseId));
   if(orig)storeMap.set(orig.store,(storeMap.get(orig.store)||0)-Finance.cents(r.amount||0));
   catMap.set('Histórico Casa',(catMap.get('Histórico Casa')||0)-Finance.cents(r.amount||0));
  }
  const shoppingByStore=new Map();let listTotalCents=0,listKnownBestCents=0,listUnknown=0;
  for(const row of c0.shopping){
   const prod=c0.catalog.find(p=>p.id===row.catalogId),offer=prod?.offers?.[row.storeId],o=row.purchaseOverride;
   const storeName=c0.stores.find(s=>s.id===row.storeId)?.name||'Sem loja';
   if(!offer||(o&&o.packageQty!==offer.packageQty)||(!o&&!(offer.price>0))){listUnknown++;continue;}
   const pkgs=o?.packages??Math.ceil(Math.round(row.requestedQty*1000)/Math.round(offer.packageQty*1000));
   const lineCents=pkgs*Finance.cents(o?.price??offer.price);
   listTotalCents+=lineCents;
   shoppingByStore.set(storeName,(shoppingByStore.get(storeName)||0)+lineCents);
   const activeOffers=Object.entries(prod.offers||{}).filter(([sid,of])=>of?.price>0&&!c0.stores.find(s=>s.id===sid)?.archived);
   if(activeOffers.length){
    const minCents=Math.min(...activeOffers.map(([,of])=>Math.ceil(Math.round(row.requestedQty*1000)/Math.round(of.packageQty*1000))*Finance.cents(of.price)));
    listKnownBestCents+=minCents;
   }else{listKnownBestCents+=lineCents;}
  }
  const priceComparisons=[];const storeWins=new Map();
  const unitFactor=unit=>({g:[1000,'kg'],ml:[1000,'L'],cl:[100,'L']}[unit]||[1,unit]);
  for(const prod of c0.catalog.filter(p=>!p.archived)){
   const [factor,unitLabel]=unitFactor(prod.unit);
   const offers=Object.entries(prod.offers||{}).map(([storeId,of])=>{
    const shop=c0.stores.find(s=>s.id===storeId);
    if(!shop||shop.archived||!(of?.price>0)||!(of?.packageQty>0))return null;
    const perUnit=(of.price/of.packageQty)*factor;
    return {storeId,storeName:shop.name,price:of.price,packageQty:of.packageQty,perUnit,unitLabel,date:of.date||''};
   }).filter(Boolean).sort((a,b)=>a.perUnit-b.perUnit);
   if(!offers.length)continue;
   if(offers.length>=2){
    const best=offers[0],worst=offers.at(-1),diff=worst.perUnit-best.perUnit;
    const diffPct=best.perUnit>0?diff/best.perUnit*100:0;
    priceComparisons.push({id:prod.id,name:prod.name,category:prod.category||'Outros',unitLabel,offers,best,worst,diff,diffPct});
    if(diffPct>0.5)storeWins.set(best.storeName,(storeWins.get(best.storeName)||0)+1);
   }
  }
  priceComparisons.sort((a,b)=>b.diffPct-a.diffPct);
  const byValue=m=>[...m.entries()].map(([name,cents])=>({name,total:cents/100})).sort((a,b)=>b.total-a.total);
  return {
   monthly,currentMonth,difference:Finance.money(currentMonth.total-prevMonth.total),
   stores:byValue(storeMap),categories:byValue(catMap),shoppingStores:byValue(shoppingByStore),
   listTotal:listTotalCents/100,listSavings:Math.max(0,Finance.money((listTotalCents-listKnownBestCents)/100)),listUnknown,
   priceComparisons,storeWins:[...storeWins.entries()].map(([name,wins])=>({name,wins})).sort((a,b)=>b.wins-a.wins),
  };
 }
 function analytics(){const host=$('#casaAnalytics'),x=D.insights(data,analyticsMonth),c0=state(),sData=houseSpendAnalytics(c0,x,analyticsMonth);
  const I=n=>window.InterfaceUI?.icon?InterfaceUI.icon(n):'',palette=['#2f9e83','#e07a5f','#5b7fd6','#f2b134','#9b6bd3','#3fb4c8','#d4688f','#7a9e3f','#c98a4a','#a7c957'];
  const budgetPct=x.budget?Math.min(100,Math.max(0,sData.currentMonth.total/x.budget*100)):0;
  const remainingBudget=Finance.money((x.budget||0)-sData.currentMonth.total);
  const tile=(tone,icon,label,value,note,extra='')=>`<article class="ch-tile is-${tone}"><span class="ch-tile-icon">${I(icon)}</span><div><span>${label}</span><strong>${value}</strong><small>${note}</small>${extra}</div></article>`;
  const monthMax=Math.max(1,...sData.monthly.map(m=>m.total)),shortMonth=m=>new Date(m+'-01T12:00:00').toLocaleDateString('pt-PT',{month:'short'}).replace('.','');
  const bars=(rows,empty)=>{const total=rows.reduce((n,r)=>n+r.total,0)||1,max=Math.max(1,...rows.map(r=>r.total));return rows.length?`<div class="ca-stack">${rows.map((r,i)=>`<i style="flex:${r.total};background:${palette[i%palette.length]}" title="${esc(r.name)}"></i>`).join('')}</div><div class="ca-bars">${rows.map((r,i)=>`<div class="ca-bar" style="--c:${palette[i%palette.length]}"><span><i></i>${esc(r.name)}</span><b>${eur(r.total)}</b><em><u style="width:${(r.total/max*100).toFixed(1)}%"></u></em><small>${Math.round(r.total/total*100)}%</small></div>`).join('')}</div>`:`<div class="ca-empty">${I('chart')}<p>${empty}</p></div>`;};
  const usage=c0.catalog.map(p=>{const sum=type=>[...c0.stockEvents.filter(e=>e.type===type&&e.date.startsWith(analyticsMonth)&&c0.stock.find(l=>l.id===e.lotId)?.catalogId===p.id).map(e=>-e.delta),...c0.legacyActivity.filter(e=>e.type===type&&e.catalogId===p.id&&e.date.startsWith(analyticsMonth)).map(e=>e.qty)].reduce((n,q)=>n+Math.round(q*1000),0)/1000;return {p,consume:sum('consume'),waste:sum('waste')};}).filter(r=>r.consume||r.waste);
  const pendingItems=c0.shopping.filter(r=>!r.done).length;
  host.innerHTML=`<div class="section-head cp-head"><div><h2>Análises da casa</h2><p>Gastos reais em Movimentos, previsão da lista e comparação de preços por supermercado.</p></div><div class="casa-analytics-actions">${field('Mês','casaMonth',analyticsMonth,'month','id="casaMonth"')}<button type="button" id="casaBudget" class="secondary">${I('chart')}Orçamento mensal</button></div></div>
   <div class="casa-summary-grid cp-tiles">${tile('blue','expense','Gastos no mês (Movimentos)',eur(sData.currentMonth.total),`${sData.currentMonth.count} ${sData.currentMonth.count===1?'registo':'registos'} · ${(sData.difference>0?'+':'')+eur(sData.difference)} vs mês anterior`)}${tile(x.budget&&remainingBudget<0?'red':'amber','chart','Orçamento mensal',x.budget?eur(x.budget):'Por definir',x.budget?eur(remainingBudget)+' disponíveis':'Define um limite mensal de referência',x.budget?`<div class="ca-progress${remainingBudget<0?' is-over':''}"><i style="width:${budgetPct.toFixed(1)}%"></i></div>`:'')}${tile('green','cart','Lista de compras atual',eur(sData.listTotal),sData.listSavings>0?`Poupança possível de ${eur(sData.listSavings)} entre lojas`:`${pendingItems} por comprar`+(sData.listUnknown?` · ${sData.listUnknown} sem preço`:''))}${tile('purple','tag','Preços comparados',String(sData.priceComparisons.length),sData.priceComparisons.length?'produtos em mais de 1 loja · '+eurUnit(sData.priceComparisons[0].diff)+'/'+sData.priceComparisons[0].unitLabel+' máx. dif.':'Adiciona ofertas em 2+ lojas para comparar')}</div>
   <div class="cs-pills home-analytics-tabs" role="group" aria-label="Tipo de análise">
    ${[['expenses','Gastos e lista'],['prices','Preços'],['stock','Consumo e desperdício']].map(([id,label])=>'<button type="button" class="secondary" data-home-analysis="'+id+'" aria-pressed="'+(id===homeAnalysisTab)+'">'+label+'</button>').join('')}
   </div>
   <div class="ca-grid" data-home-analysis-panel="expenses" ${homeAnalysisTab!=='expenses'?'hidden':''}>
    <section class="panel ca-card ca-months"><div class="ca-card-head"><h3>Últimos seis meses</h3><small>Despesas da casa em Movimentos</small></div><div class="ca-chart">${sData.monthly.map(m=>`<div class="ca-col${m.month===analyticsMonth?' is-current':''}" title="${esc(m.month)}: ${eur(m.total)} · ${m.count} movimentos"><b>${m.total?eur(m.total).replace(/,\d+\s?€/,' €'):''}</b><i><em style="height:${(m.total/monthMax*100).toFixed(1)}%"></em></i><small>${shortMonth(m.month)}</small><span>${m.count} reg.</span></div>`).join('')}</div></section>
    <section class="panel ca-card"><div class="ca-card-head"><h3>Gastos por supermercado / estabelecimento</h3><small>${sData.stores.length} ${sData.stores.length===1?'estabelecimento':'estabelecimentos'}</small></div>${bars(sData.stores,'Sem despesas de supermercado neste mês em Movimentos.')}</section>
    <section class="panel ca-card"><div class="ca-card-head"><h3>Gastos por categoria</h3><small>${sData.categories.length} ${sData.categories.length===1?'categoria':'categorias'}</small></div>${bars(sData.categories,'Sem categorias de casa/alimentação neste mês.')}</section>
    <section class="panel ca-card"><div class="ca-card-head"><h3>Previsão da lista por loja</h3><small>${eur(sData.listTotal)}</small></div>${bars(sData.shoppingStores,'Adiciona artigos com loja e preço à Lista de Compras.')}</section>
   </div>
   <div class="ca-prices-panel" data-home-analysis-panel="prices" ${homeAnalysisTab!=='prices'?'hidden':''}>
    ${sData.storeWins.length?`<section class="panel ca-card"><div class="ca-card-head"><h3>Lojas com mais melhores preços</h3><small>Produtos onde cada loja é a mais barata por unidade</small></div><div class="ca-store-wins">${sData.storeWins.map(w=>`<div class="ca-win-chip"><strong>${esc(w.name)}</strong><span>${w.wins} ${w.wins===1?'produto':'produtos'} mais barato(s)</span></div>`).join('')}</div></section>`:''}
    <div class="ca-grid">
     <section class="panel ca-card"><div class="ca-card-head"><h3>Comparação entre supermercados</h3><small>Maior diferença por unidade (kg, L ou un.)</small></div>${sData.priceComparisons.length?`<div class="ca-prices">${sData.priceComparisons.slice(0,25).map(p=>`<div class="ca-price"><span><b>${esc(p.name)}</b><small>Melhor: <b>${esc(p.best.storeName)}</b> (${eurUnit(p.best.perUnit)}/${esc(p.unitLabel)}) · Mais caro: ${esc(p.worst.storeName)} (${eurUnit(p.worst.perUnit)}/${esc(p.unitLabel)})</small></span><em class="is-down">−${pctFmt.format(p.diffPct)}% (${eurUnit(p.diff)})</em></div>`).join('')}</div>`:`<div class="ca-empty">${I('tag')}<p>Regista preços do mesmo produto em pelo menos duas lojas para ver onde compensa comprar.</p></div>`}</section>
     <section class="panel ca-card"><div class="ca-card-head"><h3>Evolução dos preços registados</h3><small>Primeiro e último preço por unidade</small></div>${x.priceChanges.length?`<div class="ca-prices">${x.priceChanges.map(p=>`<div class="ca-price"><span><b>${esc(p.name)}</b><small>por ${esc(p.unit)} · ${eurUnit(p.from)} → ${eurUnit(p.to)}</small></span><em class="${p.percent>0.05?'is-up':p.percent<-0.05?'is-down':'is-flat'}">${p.percent>0.05?'▲ ':p.percent<-0.05?'▼ ':''}${pctFmt.format(Math.abs(p.percent))}%</em></div>`).join('')}</div>`:`<div class="ca-empty">${I('tag')}<p>Ainda não há histórico suficiente de alterações de preço.</p></div>`}</section>
    </div>
   </div>
   <div data-home-analysis-panel="stock" ${homeAnalysisTab!=='stock'?'hidden':''}><details open class="panel ca-card casa-history-disclosure"><summary>Consumo e desperdício por produto · ${usage.length} ${usage.length===1?'produto':'produtos'} com registos no mês</summary>${usage.length?`<div class="casa-table-wrap"><table class="casa-life-table"><thead><tr><th>Produto</th><th>Stock válido agora</th><th>Consumido no mês</th><th>Desperdício no mês</th></tr></thead><tbody>${usage.map(({p,consume,waste})=>`<tr><td>${esc(p.name)}</td><td>${qty(L.available(c0,p.id))} ${esc(p.unit)}</td><td>${qty(consume)} ${esc(p.unit)}</td><td class="${waste?'negative':''}">${qty(waste)} ${esc(p.unit)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Sem consumos nem desperdício registados neste mês.</p>'}</details>
   </div><p class="ca-note">${I('alert')}As análises de gastos cruzam automaticamente os teus Movimentos em supermercados e categorias da casa (Alimentação, Casa, Limpeza, Higiene) com o histórico preservado. Consumo e desperdício não somam despesas.</p>`;
  host.querySelectorAll('[data-home-analysis]').forEach(button=>button.onclick=()=>{
   homeAnalysisTab=button.dataset.homeAnalysis;
   host.querySelectorAll('[data-home-analysis]').forEach(control=>control.setAttribute('aria-pressed',String(control===button)));
   host.querySelectorAll('[data-home-analysis-panel]').forEach(panel=>{panel.hidden=panel.dataset.homeAnalysisPanel!==homeAnalysisTab;});
  });
  $('[name=casaMonth]',host).onchange=e=>{if(Finance.validDate(e.target.value+'-01')){analyticsMonth=e.target.value;analytics();}};window.UnifiedWorkspaceUI?.splitPeriod(host,'casaMonth','das análises da Casa');$('#casaBudget').onclick=()=>form('Orçamento da casa',field('Limite mensal (€)','monthlyBudget',state().monthlyBudget||0,'number','min="0" step="0.01" required'),v=>commit(()=>D.budget(data,Number(v.get('monthlyBudget'))),'Orçamento guardado.'),'Aplica-se ao resumo de compras Casa de cada mês. Zero desativa o limite.');
 
 const legacy=state().legacyActivity.slice().sort((a,b)=>b.date.localeCompare(a.date));
 if(legacy.length)host.querySelector('[data-home-analysis-panel="stock"]').insertAdjacentHTML('beforeend','<details class="panel"><summary>Consumo e desperdício históricos ('+legacy.length+')</summary><p>Registos importados; não retiram stock nem criam movimentos financeiros. Primeiros 100 registos; o arquivo original completo permanece preservado nos dados e nas cópias de segurança.</p><div class="casa-table-wrap"><table class="casa-life-table"><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th></tr></thead><tbody>'+legacy.slice(0,100).map(r=>{const p=state().catalog.find(p=>p.id===r.catalogId);return '<tr><td>'+esc(r.date)+'</td><td>'+esc(p?.name||'Produto indisponível')+'</td><td>'+(r.type==='waste'?'Desperdício':'Consumo')+'</td><td>'+qty(r.qty)+' '+esc(p?.unit||'')+'</td></tr>';}).join('')+'</tbody></table></div></details>');
 
}
 function enhance(target){
  const stock=(!target||target==='casaStock')?$('#casaStock .casa-card-grid'):null;if(stock){
   document.querySelectorAll('#casaStockSearch').forEach(n=>n.closest('.casa-filter-bar')?.remove());
   const filter=document.createElement('div');filter.className='casa-filter-bar';
   filter.innerHTML='<label>Pesquisar stock<input id="casaStockSearch" type="search" placeholder="Produto ou localização"></label><label>Mostrar<select id="casaStockFilter"><option value="active">Com stock</option><option value="all">Todos os lotes</option><option value="expired">Expirados</option><option value="soon">Validade até sete dias</option><option value="opened">Abertos</option></select></label><span class="casa-stock-count" role="status"></span>';
   stock.before(filter);
   const search=$('#casaStockSearch'),select=$('#casaStockFilter'),count=$('.casa-stock-count',filter);
   const place=l=>String(l.location||'').trim()||'Sem localização',locations=[...new Set(['Frigorífico','Congelador','Despensa',...state().stock.map(place)])];
   if(!locations.includes(stockLocations.get(key)))stockLocations.set(key,'');
   const places=document.createElement('nav');places.className='casa-pantry-locations';places.setAttribute('aria-label','Locais da despensa');
   places.innerHTML=['',...locations].map(p=>'<button type="button" class="secondary" data-pantry-place="'+esc(p)+'" aria-pressed="'+(p===(stockLocations.get(key)||''))+'">'+esc(p||'Todos os locais')+'</button>').join('');filter.prepend(places);
   search.value=stockSearch;select.value=stockMode;
   const paint=()=>{
    stockSearch=search.value;stockMode=select.value;
    const q=stockSearch.toLocaleLowerCase('pt'),mode=stockMode,c=state(),today=Finance.today();let visible=0;
    [...stock.querySelectorAll('.casa-stock-card')].forEach((card,n)=>{
     const lot=c.stock.find(l=>l.id===card.dataset.stockLot),positive=L.remaining(c,lot)>0;
     card.hidden=!!stockLocations.get(key)&&place(lot)!==stockLocations.get(key)||!card.textContent.toLocaleLowerCase('pt').includes(q)||(mode!=='all'&&!positive)||(mode==='expired'&&(!lot.expiry||lot.expiry>=today))||(mode==='soon'&&(!lot.expiry||lot.expiry<today||lot.expiry>dateOffset(7)))||(mode==='opened'&&!lot.opened);
     if(!card.hidden)visible++;
    });
    count.textContent=`${visible} ${visible===1?'lote':'lotes'}`;
   };
   search.oninput=paint;select.onchange=paint;for(const b of places.querySelectorAll('button'))b.onclick=()=>{stockLocations.set(key,b.dataset.pantryPlace);for(const button of places.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));paint();};paint();
  }
  document.querySelectorAll((!target||target==='casaRecipes')?'[data-recipe-edit]':'[data-no-recipe]').forEach(b=>{const r=state().recipes.find(r=>r.id===b.dataset.recipeEdit),cost=D.recipeCost(data,r.id,r.servings),text=document.createElement('p');b.closest('article').querySelector('.casa-recipe-cost')?.remove();text.className='casa-card-meta casa-recipe-cost';text.textContent=cost.missing.length?'Custo incompleto · falta preço: '+cost.missing.join(', '):'Custo estimado: '+eur(cost.total)+' · '+eur(cost.perServing)+' / porção';b.closest('article').append(text);});
  $('#casaMeals .casa-meal-suggestion')?.remove();const suggestion=(!target||target==='casaMeals')?D.suggestRecipes(data)[0]:null;if(suggestion?.feasible&&(!target||target==='casaMeals')){const text=document.createElement('p');text.className='panel casa-meal-suggestion';text.textContent='Sugestão com stock disponível: '+suggestion.name+(suggestion.expiry!=='9999'?' · ingrediente com validade '+suggestion.expiry:'')+'. Confirma os lotes ao preparar.';$('#casaMeals .section-head').after(text);}
  if(view==='casaAnalytics')analytics();
 }
 window.CasaDailyUI=Object.freeze({render:enhance,compareForm,listsForm,correctionForm,attachForm,linkMovementForm,enhancePurchase});
 enhance();
})();
