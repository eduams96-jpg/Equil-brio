(() => {'use strict';
 const G=GiftFinance,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],labels={idea:'Ideia',shopping:'A comprar',bought:'Comprado',delivered:'Entregue'},memory=new Map();
 const state=()=>{if(!memory.has(key))memory.set(key,{mode:'plan',year:String(new Date().getFullYear()),person:'',query:'',selected:'',status:'all',checklistFilter:'incomplete'});return memory.get(key);};
 const host=document.createElement('section');host.id='casaGifts';host.className='view casa-view gifts-page';document.querySelector('#mainContent').append(host);PremiumUI.addPage('Casa','casaGifts','Prendas');
 const normKey=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const field=(label,name,value='',type='text',attrs='')=>'<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(value??'')+'" '+attrs+'></label>',select=(label,name,items,value='',attrs='')=>'<label>'+esc(label)+'<select name="'+esc(name)+'" '+attrs+'>'+items.map(([id,text])=>'<option value="'+esc(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';

 function giftForm(id,prefill={}){
  const g=G.rows(data).find(g=>g.id===id)||{},s=state(),expenses=data.transactions.filter(t=>t.type==='expense').slice(-2000).reverse(),purchases=(data.casa?.purchases||[]).slice(-1000).reverse(),products=data.casa?.catalog||[];
  const allOccasions=G.occasions(data),allPeople=G.people(data);
  const currentOccasion=String(g.occasion??prefill.occasion??'Natal').trim();
  const isCustomOccasion=Boolean(currentOccasion&&!allOccasions.includes(currentOccasion));
  const occOptions=[...allOccasions.map(o=>[o,o]),['__custom__','+ Outra ocasião (escrever abaixo)…']];
  const selectedOccOption=isCustomOccasion?'__custom__':(currentOccasion||allOccasions[0]||'Natal');
  const peopleDatalist='<datalist id="giftPeopleDatalist">'+allPeople.map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist>';

  form(
   g.id?'Editar prenda':'Nova prenda',
   '<div class="gift-form-grid">'+
    field('Pessoa','giftPerson',g.person??prefill.person??'','text','required maxlength="160" list="giftPeopleDatalist" placeholder="Ex.: Mãe, João, Maria…"')+
    peopleDatalist+
    field('Prenda / ideia','giftTitle',g.title??prefill.title??'','text','required maxlength="160" placeholder="Ex.: Perfume, Livro, Relógio…"')+
    select('Ocasião (comuns e registadas)','giftOccasionSelect',occOptions,selectedOccOption,'id="giftOccasionSelect"')+
    '<label id="giftOccasionCustomWrap" '+(selectedOccOption==='__custom__'?'':'hidden')+'>Nova ocasião personalizada<input name="giftOccasionCustom" id="giftOccasionCustom" type="text" maxlength="160" value="'+esc(isCustomOccasion?currentOccasion:'')+'" placeholder="Escreve a ocasião…"></label>'+
    '<input type="hidden" name="giftOccasion" id="giftOccasionHidden" value="'+esc(currentOccasion)+'">'+
    field('Ano','giftYear',g.year||prefill.year||(s.year==='all'?new Date().getFullYear():s.year)||new Date().getFullYear(),'number','required min="1900" max="2200" step="1"')+
    field('Data (opcional)','giftDate',g.date||prefill.date||'','date')+
    select('Estado','giftStatus',Object.entries(labels),prefill.status||g.status||'idea')+
    field('Orçamento (€; opcional)','giftBudget',g.budget??prefill.budget??'','number','min="0" step="0.01"')+
    field('Custo real (€; vazio se desconhecido)','giftActualCost',g.actualCost,'number','min="0" step="0.01"')+
    field('Link (opcional)','giftUrl',g.url,'url','maxlength="2048"')+
    select('Produto do catálogo (opcional)','giftCatalogId',[['','Sem produto associado'],...products.map(p=>[p.id,p.name])],g.catalogId)+
    select('Associar registo existente','giftLinkKind',[['none','Sem associação'],['transaction','Movimento financeiro'],['purchase','Compra / artigo da Casa']],g.transactionId?'transaction':g.purchaseId?'purchase':'none')+
    '<div id="giftTransactionFields">'+select('Movimento existente (não será alterado)','giftTransactionId',[['','Escolhe uma despesa'],...expenses.map(t=>[t.id,dateLabel(t.date)+' · '+t.description+' · '+eur(t.amount)])],g.transactionId)+'</div>'+
    '<div id="giftPurchaseFields">'+select('Compra existente (não será alterada)','giftPurchaseId',[['','Escolhe uma compra'],...purchases.map(p=>[p.id,dateLabel(p.date)+' · '+p.store+' · '+eur(p.total)])],g.purchaseId)+select('Artigo / parcela','giftPurchaseItem',[],g.purchaseItem)+'</div>'+
    '<label class="gift-notes">Notas<textarea name="giftNotes" maxlength="2000" rows="3">'+esc(g.notes||'')+'</textarea></label>'+
   '</div><p id="giftFormHint" role="status"></p>',
   f=>{
    const chosenOcc=f.get('giftOccasionSelect')==='__custom__'?String(f.get('giftOccasionCustom')||'').trim():String(f.get('giftOccasionSelect')||f.get('giftOccasion')||'').trim();
    return commit(()=>{
     const saved=G.save(data,{
      id:g.id,
      person:f.get('giftPerson'),
      title:f.get('giftTitle'),
      occasion:chosenOcc,
      year:f.get('giftYear'),
      date:f.get('giftDate'),
      status:f.get('giftStatus'),
      budget:f.get('giftBudget')===''?0:Number(f.get('giftBudget')||0),
      actualCost:f.get('giftActualCost'),
      url:f.get('giftUrl'),
      notes:f.get('giftNotes'),
      catalogId:f.get('giftCatalogId'),
      transactionId:f.get('giftLinkKind')==='transaction'?f.get('giftTransactionId'):'',
      purchaseId:f.get('giftLinkKind')==='purchase'?f.get('giftPurchaseId'):'',
      purchaseItem:f.get('giftLinkKind')==='purchase'?f.get('giftPurchaseItem'):null
     });
     if(saved.person&&saved.occasion){
      G.saveTarget(data,{person:saved.person,occasion:saved.occasion,budget:saved.budget||undefined,year:saved.year,date:saved.date});
     }
    },'Prenda guardada. Nenhum pagamento foi criado ou alterado.');
   },
   'O custo real só entra no histórico quando a prenda está comprada ou entregue. Para repartir uma compra, indica apenas o valor desta prenda.'
  );
  const content=$('#modalContent'),link=$('[name=giftLinkKind]',content),purchase=$('[name=giftPurchaseId]',content),item=$('[name=giftPurchaseItem]',content),actual=$('[name=giftActualCost]',content),status=$('[name=giftStatus]',content);
  const occSel=$('#giftOccasionSelect',content),occWrap=$('#giftOccasionCustomWrap',content),occCustom=$('#giftOccasionCustom',content),occHidden=$('#giftOccasionHidden',content);
  const syncOccasion=()=>{
   const isCust=occSel.value==='__custom__';
   occWrap.hidden=!isCust;
   occHidden.value=isCust?occCustom.value.trim():occSel.value;
  };
  occSel.onchange=syncOccasion;
  occCustom.oninput=syncOccasion;
  const updateItems=()=>{const p=purchases.find(p=>p.id===purchase.value);item.innerHTML='<option value="">Compra completa / parcela do total</option>'+(p?.items||[]).map((i,n)=>'<option value="'+n+'">'+esc(i.name)+' · '+eur(i.total)+'</option>').join('');};updateItems();if(g.purchaseItem!==null&&g.purchaseItem!==undefined)item.value=String(g.purchaseItem);
  const update=()=>{$('#giftTransactionFields').hidden=link.value!=='transaction';$('#giftPurchaseFields').hidden=link.value!=='purchase';const planning=!['bought','delivered'].includes(status.value);actual.disabled=planning;link.disabled=planning;if(planning){link.value='none';$('#giftTransactionFields').hidden=$('#giftPurchaseFields').hidden=true;actual.value='';}$('#giftFormHint').textContent=planning?'Nesta fase, regista a ideia. O custo real fica para quando comprares.':'Indica o custo real conhecido. Se associares uma despesa, o valor pode ser repartido entre prendas, sem o exceder.';};link.onchange=update;status.onchange=update;purchase.onchange=updateItems;update();
 }

 function targetForm(personPrefill='',id=''){
  const t=G.targets(data).find(t=>t.id===id)||{},yr=Number(state().year)||new Date().getFullYear();
  form(t.id?'Editar pessoa e ocasião':'Planear pessoas e ocasião','<div class="gift-form-grid">'+(t.id?field('Pessoa','targetPerson',t.person,'text','required maxlength="160" list="giftTargetPeopleList"'):'<label class="gift-notes">Pessoas (uma por linha ou separadas por vírgulas)<textarea name="targetPerson" required rows="3" placeholder="Ex.: Mãe, Pai, João">'+esc(personPrefill)+'</textarea></label>')+'<datalist id="giftTargetPeopleList">'+G.people(data).map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist>'+field('Ocasião','targetOccasion',t.occasion||'','text','required maxlength="160" list="giftTargetOccasions"')+'<datalist id="giftTargetOccasions">'+G.occasions(data).map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist>'+field('Ano','targetYear',t.year||yr,'number','required min="1900" max="2200" step="1"')+field('Data (opcional)','targetDate',t.date||'','date')+field('Notas','targetNotes',t.notes||'','text','maxlength="1000"')+'</div>',f=>{const people=t.id?[String(f.get('targetPerson')||'')]:[...new Set(String(f.get('targetPerson')||'').split(/[\n,;]+/).map(p=>p.trim()).filter(Boolean))];if(!people.length)throw Error('Indica pelo menos uma pessoa.');return commit(()=>{for(const person of people)G.saveTarget(data,{id:t.id,person,occasion:f.get('targetOccasion'),year:Number(f.get('targetYear')),date:f.get('targetDate'),budget:t.budget??0,notes:f.get('targetNotes')});},people.length>1?people.length+' pessoas adicionadas à ocasião.':'Planeamento guardado.');},'Escolhe um nome e uma ocasião existentes ou escreve novos. O plano pertence ao ano indicado.');
 }
 function manageTargets(){
  const yr=Number(state().year)||new Date().getFullYear(),list=G.targets(data).filter(t=>!t.year||t.year===yr);
  form('Pessoas e ocasiões · '+yr,'<div class="gift-target-management">'+(list.length?list.map(t=>'<article><div><strong>'+esc(t.person)+'</strong><span>'+esc(t.occasion)+(t.date?' · '+dateLabel(t.date):'')+'</span><small>'+(t.year||'Todos os anos (registo antigo)')+'</small></div><div class="u-actions"><button type="button" class="secondary" data-target-edit="'+esc(t.id)+'">Editar</button><button type="button" class="secondary" data-target-remove="'+esc(t.id)+'">Retirar do plano</button></div></article>').join(''):'<p>Nenhuma pessoa ou ocasião planeada para este ano.</p>')+'</div><button type="button" class="primary" id="targetAdd">+ Pessoa e ocasião</button>',()=>true,'Retirar um plano preserva todas as prendas do histórico.');
  $('#targetAdd').onclick=()=>targetForm();for(const b of $$('[data-target-edit]'))b.onclick=()=>targetForm('',b.dataset.targetEdit);for(const b of $$('[data-target-remove]'))b.onclick=()=>{if(!confirm('Retirar esta pessoa e ocasião do planeamento? O histórico de prendas será preservado.'))return;commit(()=>G.removeTarget(data,b.dataset.targetRemove),'Planeamento retirado.');manageTargets();};
 }

 function render(){
  if(view!=='casaGifts')return;
  const s=state(),all=G.rows(data),years=[...new Set([new Date().getFullYear(),new Date().getFullYear()+1,...all.map(g=>g.year),...G.targets(data).map(t=>t.year).filter(Boolean)])].sort((a,b)=>b-a),people=G.people(data),year=s.mode==='history'&&s.year==='all'?null:Number(s.year||new Date().getFullYear()),q=s.query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const dynamicHtml=()=>{
   const all=G.rows(data),years=[...new Set([new Date().getFullYear(),new Date().getFullYear()+1,...all.map(g=>g.year),...G.targets(data).map(t=>t.year).filter(Boolean)])].sort((a,b)=>b-a),people=G.people(data),year=s.mode==='history'&&s.year==='all'?null:Number(s.year||new Date().getFullYear()),q=s.query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const checklistYear=year||new Date().getFullYear();
   const checklist=G.yearChecklist(data,checklistYear);
   const checklistRows=(s.checklistFilter==='all'?checklist.all:s.checklistFilter==='missing'?checklist.missing:checklist.incomplete).filter(item=>(!s.person||normKey(item.person)===normKey(s.person))&&(!q||[item.person,item.occasion,item.notes].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)));

   const list=all.filter(g=>(s.status==='all'||(s.status==='paid'?G.paid(g):g.status===s.status))&&(s.mode!=='history'||G.paid(g))&&(year===null||g.year===year)&&(!s.person||normKey(g.person)===normKey(s.person))&&(!q||[g.person,g.title,g.occasion,g.notes].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q))).sort((a,b)=>String(a.date||a.year).localeCompare(String(b.date||b.year))||a.person.localeCompare(b.person,'pt')),selected=list.find(g=>g.id===s.selected)||list[0];s.selected=selected?.id||'';
   const totals=G.summary(data,year,s.person),history=G.summary(data,null,s.person);
   return {
    list, selected, checklistYear,
    html:
     '<div class="gift-metrics gift-metrics-3">'+
      '<article class="panel"><span>Gasto real registado</span><strong class="amount">'+eur(totals.spent)+'</strong><small>'+totals.missing+' comprada(s) sem custo indicado</small></article>'+
      '<article class="panel"><span>Prendas registadas</span><strong>'+totals.count+'</strong><small>'+(checklist.ready.length)+' pronta(s) em '+checklistYear+'</small></article>'+
      '<article class="panel '+(checklist.incomplete.length?'gift-metric-missing':'')+'"><span>Falta preparar em '+checklistYear+'</span><strong>'+checklist.incomplete.length+'</strong><small>'+checklist.missing.length+' sem prenda · '+checklist.pending.length+' por comprar</small></article>'+
     '</div>'+
     '<nav class="eq-design-tabs" aria-label="Estado da prenda">'+[['all','Todas'],['idea','Ideias'],['shopping','Por comprar'],['paid','Compradas']].filter(([id])=>s.mode!=='history'||['all','paid'].includes(id)).map(([id,label])=>'<button type="button" class="secondary" data-gift-status="'+id+'" aria-pressed="'+(s.status===id)+'">'+label+'</button>').join('')+'</nav>'+
     '<div class="gift-workspace"><section class="panel gift-list"><h3>'+(s.mode==='history'?'Prendas compradas e entregues':'Prendas registadas ('+list.length+')')+'</h3><div class="u-table-scroll"><table class="u-table"><thead><tr><th>Pessoa / prenda</th><th>Ocasião / ano</th><th>Estado</th><th>'+(s.mode==='history'?'Custo real':'Data')+'</th></tr></thead><tbody>'+list.map(g=>'<tr class="'+(g.id===s.selected?'is-selected':'')+'"><td><button type="button" class="u-record-button" data-gift-select="'+esc(g.id)+'" aria-pressed="'+(g.id===s.selected)+'">'+esc(g.person)+' · '+esc(g.title)+'</button></td><td><span class="gift-occasion-tag">'+esc(g.occasion||'Sem ocasião')+'</span> · '+g.year+'</td><td><span class="gift-stage-badge status-'+esc(g.status)+'">'+labels[g.status]+'</span></td><td class="amount">'+(s.mode==='history'?(g.actualCost===null?'Por indicar':eur(g.actualCost)):(g.date?dateLabel(g.date):'—'))+'</td></tr>').join('')+'</tbody></table></div>'+(!list.length?'<p class="empty-state">Ainda sem prendas neste filtro. Guarda uma ideia ou usa a lista de pessoas e ocasiões acima para começar.</p>':'')+'</section><aside class="panel gift-detail" id="giftDetail"></aside></div>'+(s.mode==='history'?'<section class="panel gift-years"><h3>Ao longo dos anos'+(s.person?' · '+esc(s.person):'')+'</h3><div class="u-table-scroll"><table class="u-table"><thead><tr><th>Ano</th><th>Compradas / entregues</th><th>Gasto real</th></tr></thead><tbody>'+history.byYear.map(row=>'<tr><td>'+row.year+'</td><td>'+row.count+'</td><td class="amount">'+eur(row.spent)+'</td></tr>').join('')+'</tbody></table></div></section>':'')+(s.mode==='plan'?'<section class="panel gift-checklist-panel" id="giftYearChecklistPanel">'+
       '<div class="u-head">'+
        '<div><h3>Lista de pessoas e ocasiões · O que ainda falta em '+checklistYear+'</h3>'+
        '<p>Regista as pessoas e as ocasiões do ano (Natal, Aniversário, Dia da Mãe, etc.) para veres num relance tudo o que ainda falta definir ou comprar.</p></div>'+
        '<div class="u-filter-bar">'+
         [['incomplete','Em falta no ano ('+checklist.incomplete.length+')'],['missing','Sem prenda ('+checklist.missing.length+')'],['all','Lista completa ('+checklist.all.length+')']].map(([id,lbl])=>'<button type="button" class="secondary '+(s.checklistFilter===id?'active':'')+'" data-gift-check-filter="'+id+'" aria-pressed="'+(s.checklistFilter===id)+'">'+lbl+'</button>').join('')+
         '<button type="button" class="primary" id="giftAddTargetInline">+ Adicionar pessoa / ocasiões</button>'+
        '</div>'+
       '</div>'+
       (checklistRows.length?
        '<div class="gift-checklist-grid">'+
         checklistRows.map(item=>
          '<article class="gift-target-card stage-'+esc(item.stage)+'">'+
           '<div class="gift-target-main">'+
            '<div class="gift-target-badges">'+
             '<span class="gift-occasion-tag">🎁 '+esc(item.occasion)+'</span>'+
             '<span class="gift-stage-badge stage-'+esc(item.stage)+'">'+esc(item.stageLabel)+'</span>'+
            '</div>'+
            '<h4>'+esc(item.person)+'</h4>'+
            '<p>'+(item.gift?'Prenda: <b>'+esc(item.gift.title)+'</b>':'Ainda sem ideia ou prenda registada para '+checklistYear)+(item.notes?' · '+esc(item.notes):'')+'</p>'+
           '</div>'+
           '<div class="row-actions">'+
            (item.gift?
             '<button type="button" class="secondary" data-gift-edit-id="'+esc(item.gift.id)+'">Abrir / atualizar prenda</button>':
             '<button type="button" class="primary" data-gift-create-target="true" data-person="'+esc(item.person)+'" data-occasion="'+esc(item.occasion)+'" data-budget="'+esc(item.budget||0)+'">+ Registar prenda</button>')+
            (item.targetId?'<button type="button" class="secondary" data-gift-remove-target="'+esc(item.targetId)+'" title="Retirar da lista anual">×</button>':'')+
           '</div>'+
          '</article>'
         ).join('')+
        '</div>'
        :'<div class="gift-checklist-empty"><p class="muted">'+(checklist.all.length?'Tudo preparado para este filtro em '+checklistYear+'! 🎉':'Ainda não criaste a tua lista anual de pessoas e ocasiões. Clica em "+ Adicionar pessoa / ocasiões" para registar quem queres presentear no Natal, Aniversários, etc.')+'</p></div>')+
      '</section>'
     :'')
   };
  };

  function showGift(g){const detail=$('#giftDetail',host);if(!detail)return;if(g){const diag=G.diagnostic(data,g),product=data.casa?.catalog?.find(p=>p.id===g.catalogId);detail.innerHTML='<p class="eyebrow">PRENDA SELECIONADA</p><h3>'+esc(g.title)+'</h3><p><b>'+esc(g.person)+'</b> · <span class="gift-occasion-tag">'+esc(g.occasion||'Sem ocasião')+'</span> · '+g.year+'</p>'+(g.date?'<p>Data: '+dateLabel(g.date)+'</p>':'')+'<dl><dt>Estado</dt><dd>'+labels[g.status]+'</dd>'+(g.budget==null?'':'<dt>Orçamento</dt><dd class="amount">'+eur(g.budget)+'</dd>')+'<dt>Custo real</dt><dd class="amount">'+(g.actualCost===null?'Por indicar':eur(g.actualCost))+'</dd></dl><p>'+esc(g.notes)+'</p>'+(g.url?'<p><a href="'+esc(g.url)+'" target="_blank" rel="noopener noreferrer">Abrir link ↗</a></p>':'')+(product?'<p>Produto: '+esc(product.name)+'</p>':'')+(diag.linked?'<p class="gift-link-status '+(diag.changed||diag.missing?'warning':'')+'">'+(diag.missing?'O registo associado já não está disponível. O custo guardado foi preservado.':diag.changed?'O registo associado foi alterado. Confere a ligação e o custo; nada foi atualizado automaticamente.':'Associado a '+esc(diag.label)+'. O pagamento mantém-se no registo de origem.')+'</p>':'')+'<div class="u-actions">'+(!G.paid(g)?'<button type="button" class="primary" id="giftMarkBought">Marcar como comprada</button>':'')+'<button type="button" class="secondary" id="giftEdit">Editar</button><button type="button" class="secondary" id="giftRemove">Eliminar</button></div>';const bought=$('#giftMarkBought',detail);if(bought)bought.onclick=()=>giftForm(g.id,{status:'bought'});$('#giftEdit').onclick=()=>giftForm(g.id);$('#giftRemove').onclick=()=>confirmAction('Eliminar prenda','Eliminar esta prenda? O movimento financeiro ou a compra associados mantêm-se.',()=>G.remove(data,g.id));}else detail.innerHTML='<h3>Detalhe</h3><p>Seleciona uma prenda para consultar ou editar.</p>';}

  function wireDynamic(res){
   showGift(res.selected);
   if($('#giftAddTargetInline'))$('#giftAddTargetInline').onclick=()=>targetForm(s.person||'');
   for(const b of host.querySelectorAll('[data-gift-check-filter]')){
    b.onclick=()=>{s.checklistFilter=b.dataset.giftCheckFilter;renderDynamic();};
   }
   for(const b of host.querySelectorAll('[data-gift-create-target]')){
    b.onclick=()=>giftForm(null,{person:b.dataset.person,occasion:b.dataset.occasion,budget:Number(b.dataset.budget||0),year:res.checklistYear});
   }
   for(const b of host.querySelectorAll('[data-gift-edit-id]')){
    b.onclick=()=>giftForm(b.dataset.giftEditId);
   }
   for(const b of host.querySelectorAll('[data-gift-remove-target]')){
    b.onclick=()=>confirmAction('Remover da lista anual','Remover este par pessoa/ocasião da lista anual?',()=>G.removeTarget(data,b.dataset.giftRemoveTarget));
   }
   const giftButtons = [...host.querySelectorAll('[data-gift-select]')];
   function selectGift(index, focus = false) {
    const selected = res.list[index];
    if (!selected) return;
    s.selected = selected.id;
    giftButtons.forEach((button, at) => {
     button.setAttribute('aria-pressed', String(at === index));
     button.closest('tr').classList.toggle('is-selected', at === index);
    });
    showGift(selected);
    if (focus) giftButtons[index].focus();
   }
   giftButtons.forEach((button, index) => {
    button.onclick = () => selectGift(index);
    button.onkeydown = event => {
     if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
     event.preventDefault();
     const next = event.key === 'Home' ? 0 : event.key === 'End' ? res.list.length - 1
       : Math.max(0, Math.min(res.list.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
     selectGift(next, true);
    };
   });
   for(const b of host.querySelectorAll('[data-gift-status]'))b.onclick=()=>{s.status=b.dataset.giftStatus;renderDynamic();host.querySelector('[data-gift-status][aria-pressed=true]')?.focus();};
  }
  function renderDynamic(){
   const body=$('#giftsDynamicBody',host);
   if(!body)return render();
   const res=dynamicHtml();
   body.innerHTML=res.html;
   wireDynamic(res);
  }

  host.innerHTML=
   '<div class="section-head">'+
    '<div><p class="eyebrow">CASA · PRENDAS E OCASIÕES</p><h2>Prendas</h2><p>Ideias, lista anual de pessoas e ocasiões, orçamento e memória do que ofereceste ao longo dos anos.</p></div>'+
    '<div class="row-actions"><button type="button" class="secondary" id="giftManageTargets">+ Pessoa e ocasiões</button><button type="button" class="primary" id="giftAdd">+ Nova prenda</button></div>'+
   '</div>'+
   '<nav class="gift-tabs" aria-label="Prendas">'+
    '<button type="button" class="secondary" data-gift-view="plan" aria-pressed="'+(s.mode==='plan')+'">Planear ano e o que falta</button>'+
    '<button type="button" class="secondary" data-gift-view="history" aria-pressed="'+(s.mode==='history')+'">Histórico de prendas dadas</button>'+
   '</nav>'+
   '<div class="gift-filters">'+
    select('Ano','giftsYear',(s.mode==='history'?[['all','Todos os anos']]:[]).concat(years.map(y=>[String(y),String(y)])),s.year)+
    select('Pessoa','giftsPerson',[['','Todas as pessoas'],...people.map(p=>[p,p])],s.person)+
    field('Pesquisar pessoa, ocasião ou prenda','giftsQuery',s.query,'search','placeholder="Ex.: Natal, Aniversário, Mãe…"')+
   '</div>'+
   '<div id="giftsDynamicBody"></div>';

  const res=dynamicHtml();
  $('#giftsDynamicBody',host).innerHTML=res.html;
  wireDynamic(res);
  $('#giftAdd').onclick=()=>giftForm();
  $('#giftManageTargets').onclick=manageTargets;
  for(const b of host.querySelectorAll('[data-gift-view]'))b.onclick=()=>{s.mode=b.dataset.giftView;s.status='all';s.year=s.mode==='history'?'all':String(new Date().getFullYear());render();};$('[name=giftsYear]').onchange=e=>{s.year=e.target.value;renderDynamic();};$('[name=giftsPerson]').onchange=e=>{s.person=e.target.value;renderDynamic();};$('[name=giftsQuery]').oninput=e=>{s.query=e.target.value;renderDynamic();};$('#addTransaction').hidden=true;
 }
 UILifecycle.register('gifts',{afterRender:render,afterNavigation:render},30);window.GiftsUI=Object.freeze({render,giftForm,targetForm});
})();
