/* Composição aprovada em 0.39.77. Uma navegação por área, com os mesmos
 * modelos, editores e comandos; nunca persiste dados durante a apresentação. */
(() => {
 'use strict';
 const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],I=InterfaceUI.icon;
 const states=new Map();let composing=false,renderingImport=false;
 const state=()=>{if(!states.has(key))states.set(key,{task:'inbox',settings:'general',planKind:'all',planId:'',wealthKind:'all',wealthId:'',subId:'',subSearch:'',subStatus:'active',importId:''});return states.get(key);};
 const parked=document.createElement('div');parked.id='unifiedSources';parked.hidden=true;document.querySelector('#mainContent').append(parked);
 const sources=new Map();
 for(const id of ['insights','reviewMonthHub','decisionsHub','wealthHoldingsHub','review','documentsHub','captureQueue','personalRules','inboxHub','qualityHub','plansHubSections','timelinePanel']){const node=document.getElementById(id);if(node)sources.set(id,node);}
 const source=id=>sources.get(id)||document.getElementById(id);
 const mount=(id,host)=>{const node=source(id);if(node){node.classList.add('u-source');node.hidden=false;host.append(node);}return node;};
 function park(){for(const [id,node]of sources){if(['insights','reviewMonthHub','decisionsHub','wealthHoldingsHub','debts','review','documentsHub'].includes(id))parked.append(node);}}
 function title(text,subtitle='',actions=''){return '<div class="u-head"><div><h2>'+esc(text)+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div><div class="u-actions">'+actions+'</div></div>';}
 const cmd=(label,action,id='',primary=false)=>button(label,action,id,primary?'primary':'secondary');
 const link=(text,route)=>'<button type="button" class="secondary" data-u-route="'+esc(route)+'">'+I('document')+esc(text)+'</button>';
 const metric=(label,value,kind='all')=>'<article class="panel u-metric">'+I(kind)+'<div><span>'+esc(label)+'</span><strong class="amount">'+eur(value)+'</strong></div></article>';
 function tabs(host,items,current){host.hidden=items.length<2;host.replaceChildren();for(const [id,label]of items){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=id===current?'active':'';b.setAttribute('aria-current',id===current?'page':'false');b.onclick=()=>navigate(id);host.append(b);}}
 function navigation(){
  document.body.dataset.unifiedView=view;const area=$('.area-tabs'),sub=$('.area-subtabs');
  const summary=['dashboard','weeklyHub','reports'].includes(view),planning=['planner','plansHub'].includes(view),wealth=['wealth','wealthMoneyHub'].includes(view),dataView=view==='dataHub';
  if(summary)tabs(area,[['dashboard','Resumo'],['weeklyHub','Revisão e análise'],['reports','Relatórios']],view);
  if(planning)tabs(area,[['planner','Agenda'],['plansHub','Planos e decisões']],view);
  if(wealth)tabs(area,[['wealth','Visão geral'],['wealthMoneyHub','Inventário']],view);
  if(dataView||view==='noticesHub')tabs(area,[],view);
  if(view==='transactions')tabs(area,[],view);
  if(summary||planning||wealth||dataView||view==='settings'||view==='noticesHub')sub.hidden=true;
  const name=summary?'Resumo':planning?'Planeamento':wealth?'Património':dataView?'Dados':null;
  if(name)$$('.top-nav-link').forEach(b=>{b.classList.toggle('active',b.dataset.area===name);b.setAttribute('aria-current',b.dataset.area===name?'page':'false');});
 }
 function canonical(v){const s=state();
  if(['insights','reviewMonthHub'].includes(v)){s.reviewTopic='comparison';return 'weeklyHub';}
  if(v==='decisionsHub'){s.planPane='decisions';return 'plansHub';}
  if(v==='cashflow')return 'planner';
  if(['goals','planningPlus','budgets'].includes(v)){s.planPane='records';s.planKind={goals:'goal',planningPlus:'reserve',budgets:'budget'}[v];return 'plansHub';}
  const inventory={accounts:'account',debts:'debt',assetsHub:'asset',investmentsHub:'investment',wealthHoldingsHub:'holdings'};
  if(inventory[v]){s.wealthKind=inventory[v];if(v==='accounts'){s.inventoryHistoryOpen=true;s.diagnosticTab='accounts';}return 'wealthMoneyHub';}
  const tasks={review:'imports',documentsHub:'documents',inboxHub:'inbox',qualityHub:'quality',captureQueue:'inbox',personalRules:'rules',backupSettings:'backup',maintenanceDataPanel:'update'};
  if(tasks[v]){if(['backup','update'].includes(tasks[v])){s.settings='backup';s.focusUpdate=tasks[v]==='update';return 'settings';}s.task=tasks[v];return 'dataHub';}return v;
 }
 function period(host,id){const input=$('#'+id,host);if(input)input.onchange=e=>{if(F.validDate(e.target.value+'-01')){month=e.target.value;$('#monthPicker').value=month;render();}};}
 function splitPeriod(host,id,context='dos planos'){
  const input=$('#'+id,host);if(!input)return;const label=input.closest('label'),controls=document.createElement('div');controls.className='u-split-period';
  const selected=(input.value||month).split('-'),monthSelect=document.createElement('select'),yearSelect=document.createElement('select');monthSelect.setAttribute('aria-label','Mês '+context);yearSelect.setAttribute('aria-label','Ano '+context);
  for(let n=1;n<=12;n++){const value=String(n).padStart(2,'0');monthSelect.add(new Option(monthLabel('2000-'+value).replace(/ de 2000$/,''),value));}
  const current=Number(selected[0]),today=Number(F.today().slice(0,4)),years=[...new Set([current,today,...data.transactions.map(t=>Number(t.date.slice(0,4))),...Array.from({length:11},(_,n)=>today-5+n)])].sort((a,b)=>a-b);
  for(const year of years)yearSelect.add(new Option(String(year),String(year)));monthSelect.value=selected[1];yearSelect.value=selected[0];
  const set=value=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};for(const select of [monthSelect,yearSelect])select.onchange=()=>set(yearSelect.value+'-'+monthSelect.value);
  const previous=document.createElement('button'),next=document.createElement('button');for(const [button,delta,name,glyph]of [[previous,-1,'Mês anterior','‹'],[next,1,'Mês seguinte','›']]){button.type='button';button.className='secondary';button.setAttribute('aria-label',name);button.textContent=glyph;button.onclick=()=>set(dashboardMonthOffset(input.value||month,delta));}
  const yearLabel=document.createElement('label'),monthLabelEl=document.createElement('label');yearLabel.append('Ano',yearSelect);monthLabelEl.append('Mês',monthSelect);input.hidden=true;label.hidden=true;controls.append(previous,yearLabel,monthLabelEl,next);label.after(controls);
 }
 function review(){
  const host=$('#weeklyHub'),r=currentMonthReview(),inbox=PlanningFinance.reviewInbox(data,month),totals=totalsFor(month);
  const prevMonth=dashboardMonthOffset(month,-1),prevTotals=totalsFor(prevMonth);
  const previousReview=ReconciliationModel.monthReview(data,prevMonth);
  const weeklyBody=$('#weeklyReviewBody',host);if(weeklyBody)parked.append(weeklyBody);
  for(const id of ['insights','reviewMonthHub']){const n=source(id);if(n)parked.append(n);}host.replaceChildren();host.classList.add('u-review');
  const result=F.money(totals.income-totals.expense),prevResult=F.money(prevTotals.income-prevTotals.expense),accTotal=r.accounts.length,accDone=r.accounts.filter(a=>a.confirmed).length,pendingCount=inbox.active.length,stepsDone=(accTotal&&accDone===accTotal?1:0)+(!pendingCount?1:0)+(r.closed?1:0),progress=Math.round(stepsDone/3*100);
  const closeReason=r.closed?'':r.blockers.join(' ');
  const deltaStr=(cur,prev,invert=false)=>{if(!prev)return 'Sem base no mês anterior';const diff=F.money(cur-prev),pct=Math.round((diff/Math.abs(prev))*100);const sign=diff>0?'+':'';const cls=diff===0?'':((diff>0)^invert?'positive':'negative');return `<span class="${cls}">${sign}${eur(diff)} (${sign}${pct}%) vs mês anterior</span>`;};
  const kpi=(tone,icon,label,value,note)=>'<article class="rv-kpi is-'+tone+'"><span class="rv-kpi-icon">'+I(icon)+'</span><div><span>'+label+'</span><strong class="amount">'+value+'</strong><small>'+note+'</small></div></article>';
  const stepPill=(done,icon,label,note)=>'<div class="rv-ribbon-step '+(done?'is-done':'')+'"><span class="rv-step-icon">'+I(done?'check':icon)+'</span><div><b>'+label+'</b><small>'+note+'</small></div></div>';
  const pendIcon=p=>/duplicado/i.test(p.title)?'transfer':/comprovativo|document/i.test(p.title)?'document':/confirmar|saldo/i.test(p.title)?'account':/import/i.test(p.title)?'upload':/categor|classific/i.test(p.title)?'tag':'alert';
  const accStatus=a=>a.confirmed?'<span class="rv-pill is-ok">'+I('check')+'Conferida</span>':a.statement?'<span class="rv-pill is-bad">Diferença '+eur(a.difference)+'</span>':'<span class="rv-pill is-wait">Por conferir</span>';
  host.innerHTML=title('Revisão e análise','Indicadores do mês, conferência de contas, comparações e pendências num ecrã.',
   '<label class="u-period">Mês<input id="reviewMonthPicker" type="month" value="'+esc(month)+'"></label><button type="button" id="reviewCloseMonth" aria-describedby="reviewCloseReason" class="'+(r.closed?'secondary':'primary')+'" '+(closeReason?'disabled':'')+'>'+I(r.closed?'lock':'check')+(r.closed?'Reabrir mês':'Fechar mês')+'</button>')+(closeReason?'<p id="reviewCloseReason" class="muted">'+esc(closeReason)+'</p>':'')+
   '<nav class="u-review-navigation rv-tabs" aria-label="Revisão e análise">'+[['overview','Resumo e conferência','check'],['comparison','Comparações e fecho','chart']].map(([id,label,icon])=>'<button type="button" class="secondary" data-review-topic="'+id+'">'+I(icon)+'<b>'+label+'</b></button>').join('')+'</nav>'+
   '<section class="rv-ribbon"><div class="rv-ribbon-head"><span class="rv-eyebrow">Fecho de '+esc(monthLabel(month))+' · '+stepsDone+'/3 passos</span><strong>'+(r.closed?'Mês fechado e protegido':r.future?'Este mês ainda não começou':r.ready?'Pronto a fechar':!r.complete?'Mês em curso':'Falta pouco para fechar')+'</strong></div><div class="rv-ribbon-bar"><i style="width:'+progress+'%"></i></div><div class="rv-ribbon-steps">'+stepPill(accTotal&&accDone===accTotal,'account','1. Conferir contas',accDone+' de '+accTotal+' conferidas')+stepPill(!pendingCount,'alert','2. Rever pendências',pendingCount?pendingCount+' por tratar':'Tudo tratado')+stepPill(r.closed,'lock','3. Fechar mês',r.closed?'Protegido':r.ready?'Pronto a fechar':r.complete?'Após validação':'No fim do mês')+'</div></section>'+
   '<section class="rv-kpis rv-kpis-4 u-metrics">'+kpi('income','income','Receitas',eur(totals.income),deltaStr(totals.income,prevTotals.income))+kpi('expense','expense','Despesas líquidas',eur(totals.expense),deltaStr(totals.expense,prevTotals.expense,true))+kpi(result<0?'expense':'income','transfer','Balanço do mês',eur(result),reviewSavingsLabel(totals.income,totals.expense)+' · '+deltaStr(result,prevResult))+kpi(pendingCount?'warn':'ok','alert','Conferência e pendências',`${accDone}/${accTotal} · ${pendingCount}`,previousReview.future?'Sem conferência anterior':`${previousReview.confirmed}/${previousReview.accounts.length} contas conferidas no mês anterior`)+'</section>'+
   '<div id="reviewWorkflow" class="u-review-grid rv-grid"><section class="panel u-review-accounts rv-accounts">'+title('Conferência de contas',dateLabel(r.date)+' · '+(r.complete?'Fim do mês':'Até hoje')+' · indica o saldo que aparece no extrato')+'<div class="rv-account-grid">'+r.accounts.map(a=>'<article class="rv-account '+(a.confirmed?'is-ok':a.statement?'is-bad':'')+'"><header><span class="rv-account-icon">'+I('account')+'</span><div><b>'+esc(a.name)+'</b><small>Calculado <strong class="amount">'+eur(a.expected)+'</strong></small>'+accStatus(a)+'</div></header>'+(r.closed||r.future?'<p class="rv-account-static">Extrato: <b class="amount">'+(a.statement?eur(a.statement.actual):'—')+'</b></p>':'<form data-review-account="'+esc(a.id)+'"><input name="statementBalance" type="number" step="0.01" required placeholder="Extrato (€)" aria-label="Saldo no extrato · '+esc(a.name)+'" value="'+(a.statement?esc(a.statement.actual):'')+'"><button type="submit" class="'+(a.confirmed?'secondary':'primary')+'">'+(a.confirmed?'Atualizar':'Conferir')+'</button><span data-review-difference role="status"></span></form>')+'</article>').join('')+(!r.accounts.length?'<p class="rv-empty">Ainda não tens contas.</p>':'')+'</div><div class="u-close-diagnostic rv-diagnostic" role="status">'+(r.future?'Este mês ainda não começou.':r.closed?(r.ready?I('lock')+'Mês protegido contra alterações.':'Mês fechado, mas a conferência precisa de revisão. Reabre o mês: '+esc(r.blockers.join(' '))):r.blockers.length?'<ul>'+r.blockers.map(b=>'<li>'+esc(b)+'</li>').join('')+'</ul>':I('check')+'Contas conferidas; sem transferências ou importações pendentes.')+'</div></section><section class="panel u-review-categories rv-categories"><div class="rv-panel-head"><h3>Comparação e categorias</h3></div><div class="rv-mini-compare"><div><span>Receitas vs anterior</span><b class="amount">'+eur(totals.income)+' / '+eur(prevTotals.income)+'</b></div><div><span>Despesas vs anterior</span><b class="amount">'+eur(totals.expense)+' / '+eur(prevTotals.expense)+'</b></div><div><span>Resultado vs anterior</span><b class="amount">'+eur(result)+' / '+eur(prevResult)+'</b></div></div><div id="unifiedReviewCategories"></div></section><section class="panel u-review-pending rv-pending"><div class="rv-panel-head"><h3>Pendências do mês</h3><span class="rv-count">'+pendingCount+'</span></div><div class="rv-pending-list">'+inbox.active.slice(0,5).map((p,i)=>'<div class="u-pending-row rv-pending-row"><span class="rv-pending-icon">'+I(pendIcon(p))+'</span><div><b>'+esc(p.title)+'</b><small>'+esc(p.detail||'')+'</small></div>'+cmd(ReviewUI.actionLabel(p),'review-resolve',String(i))+'</div>').join('')+'</div>'+(!pendingCount?'<div class="rv-empty">'+I('check')+'<b>Sem pendências ativas</b><small>Está tudo em ordem neste mês.</small></div>':'')+(pendingCount>5?'<p class="rv-more">E mais '+(pendingCount-5)+' pendências.</p>':'')+link('Ver todas','inboxHub')+'</section></div><section class="u-review-extra"></section>';
  period(host,'reviewMonthPicker');splitPeriod(host,'reviewMonthPicker','da revisão');
  $('#reviewCloseMonth',host).onclick=()=>promptMonthClose(r.month);
  for(const formEl of $$('[data-review-account]',host)){const a=r.accounts.find(x=>String(x.id)===formEl.dataset.reviewAccount),input=$('input',formEl),feedback=$('[role=status]',formEl);input.oninput=()=>{feedback.textContent=input.value!==''&&Number.isFinite(input.valueAsNumber)?'Diferença: '+eur(F.money(input.valueAsNumber-a.expected)):'';};formEl.onsubmit=e=>{e.preventDefault();if(!formEl.reportValidity())return;const actual=input.valueAsNumber;if(!Number.isFinite(actual))return;commit(()=>{if(data.closedMonths.includes(r.month))throw Error('Reabre o mês antes de conferir.');FinancePlus.reconcile(data,a.id,r.date,actual,false);},'Conferência registada; nenhum ajuste foi criado.');};}
  const entries=F.expenseEntries(data,month),categories=new Map();for(const e of entries){const name=String(e.category||'Outros').split(' / ')[0];categories.set(name,F.money((categories.get(name)||0)+e.amount));}
  const list=[...categories].sort((a,b)=>b[1]-a[1]),max=Math.max(1,...list.map(r=>r[1]));const totalSpent=list.reduce((n,r)=>n+r[1],0)||1,catColors=['#2f9e83','#e07a5f','#5b7fd6','#f2b134','#9b6bd3','#3fb4c8','#d4688f','#7a9e3f','#c98a4a','#a7c957'];$('#unifiedReviewCategories',host).innerHTML=(list.length?'<div class="rv-cat-stack">'+list.map(([name,value],i)=>'<i style="flex:'+value+';background:'+catColors[i%catColors.length]+'" title="'+esc(name)+'"></i>').join('')+'</div>':'')+(list.map(([name,value],i)=>'<button type="button" class="u-category-bar rv-cat" data-u-category="'+esc(name)+'" style="--c:'+catColors[i%catColors.length]+'"><span><i></i>'+esc(name)+'</span><i><em style="width:'+Math.max(0,value/max*100)+'%"></em></i><small>'+Math.round(value/totalSpent*100)+'%</small><b class="amount">'+eur(value)+'</b></button>').join('')||'<div class="rv-empty">'+I('chart')+'<b>Sem despesas registadas neste mês.</b></div>');
  const extra=$('.u-review-extra',host),workflow=$('#reviewWorkflow',host);
  extra.innerHTML='<div class="u-review-topic-content u-review-combined"><section id="analysisComparisons" class="panel"></section></div>';
  mount('reviewMonthHub',extra.firstElementChild);

  let comparisonRendered=false;
  const choose=requested=>{
   const topic=['comparison','closing'].includes(requested)?'comparison':'overview';
   state().reviewTopic=topic;
   host.dataset.reviewTopic=topic;
   extra.hidden=topic!=='comparison';
   workflow.hidden=topic!=='overview';
   if(topic==='comparison'&&!comparisonRendered){
    ExperienceUI.renderAnalysis($('#analysisComparisons',extra));
    comparisonRendered=true;
   }
   for(const button of $$('[data-review-topic]',host)){
    const selected=button.dataset.reviewTopic===topic;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
   }
  };
  for(const button of $$('[data-review-topic]',host))button.onclick=()=>choose(button.dataset.reviewTopic);
  choose(state().reviewTopic);
 }
 function planRecords(){const expenses=data.budgets.length?F.expenseEntries(data,month):[];return data.goals.map(g=>({id:'goal:'+g.id,entity:g,kind:'goal',name:g.name,target:g.target,current:g.current,meta:'Objetivo · '+(g.deadline?'até '+dateLabel(g.deadline):g.planMonths?g.planMonths+' meses':'Sem prazo')})).concat(data.reserves.map(g=>({id:'reserve:'+g.id,entity:g,kind:'reserve',name:g.name,target:g.target,current:g.saved,meta:'Reserva · '+(g.months||12)+' meses'})),data.budgets.map(g=>{const budget=FinancePlus.budgetAt(data,g,month);return{id:'budget:'+g.id,entity:g,kind:'budget',name:g.category,target:budget.available,current:F.money(expenses.filter(t=>F.categoryMatches(t.category,g.category)).reduce((n,t)=>n+t.amount,0)),meta:'Orçamento · '+monthLabel(month)};}));}
 function expandSection(node){
  if(!node||node.tagName!=='DETAILS')return node;
  const section=document.createElement('section');
  for(const attribute of node.attributes)if(attribute.name!=='open')section.setAttribute(attribute.name,attribute.value);
  const summary=node.querySelector(':scope>summary');
  if(summary){
   const title=document.createElement('h3');
   title.className='context-section-title';
   title.append(...summary.childNodes);
   summary.replaceWith(title);
  }
  section.append(...node.childNodes);
  node.replaceWith(section);
  return section;
 }
 const planPortals=new Map();
 function restorePlanPortals(){for(const [node,anchor]of planPortals){if(anchor.parentNode)anchor.replaceWith(node);}planPortals.clear();}
 function placePlanNode(node,target){if(!node||!target||node.closest('dialog[open]'))return;const anchor=document.createComment('plan-source');node.before(anchor);planPortals.set(node,anchor);target.append(node);node.hidden=false;}
 const planKinds=[['goal','Objetivos'],['reserve','Reservas'],['budget','Orçamentos']];
 const planValue=value=>`<strong class="amount">${eur(value)}</strong>`;
 const planProgress=(value,total,label)=>{
  const pct=total>0?Math.min(100,Math.max(0,value/total*100)):0;
  return `<progress max="100" value="${pct}" aria-label="${esc(label)}"></progress>`;
 };
 function fundingPane(coverage) {
  const total=key=>F.money(coverage.reduce((sum,row)=>sum+row[key],0));
  const funds=total('balance'),protectedFunds=total('protectedAmount'),deficit=total('deficit'),free=total('available');
  const room=FinancePlus.spendingRoom(data,data.safetyMargin||0),reserved=FinancePlus.reserves(data);
  const unassignedReserved=F.money(Math.max(0,reserved.assigned-protectedFunds)),totalReserved=F.money(Math.max(protectedFunds,reserved.assigned));
  const ordered=coverage.slice().sort((a,b)=>b.deficit-a.deficit||Number(b.low)-Number(a.low)||a.name.localeCompare(b.name,'pt-PT'));
  const accounts=ordered.map(a=>{
   const status=a.deficit?'Faltam '+eur(a.deficit):a.balance<0?'Saldo negativo':a.low?'Pouco saldo livre':a.protectedAmount?'Coberto':'Sem proteção';
   return `<li class="plan-account${a.deficit?' is-deficit':''}">
    <div class="plan-account-name">${I('account')}<div><h4>${esc(a.name)}</h4><span>${status}</span></div></div>
    <dl><div><dt>Saldo</dt><dd>${planValue(a.balance)}</dd></div><div><dt>Protegido</dt><dd>${planValue(a.protectedAmount)}</dd></div><div><dt>Livre</dt><dd>${planValue(a.available)}</dd></div></dl>
    ${planProgress(a.protectedAmount,a.balance,'Proporção do saldo protegido em '+a.name)}
   </li>`;
  }).join('');
  return `<section class="plan-funding">
   <div class="plan-funding-primary">
    <div class="plan-saldo">
     <h3>Saldo livre hoje</h3>${planValue(free)}
     <div class="plan-saldo-scale">${planProgress(Math.max(0,protectedFunds-deficit),Math.max(0,protectedFunds+free),'Proporção protegida do saldo real')}</div>
     <dl><div><dt>Saldo real</dt><dd>${planValue(funds)}</dd></div><div><dt>Dinheiro reservado</dt><dd>${planValue(totalReserved)}</dd></div><div><dt>Protegido</dt><dd>${planValue(protectedFunds)}</dd></div>${unassignedReserved>0?`<div><dt>Reservado sem conta</dt><dd>${planValue(unassignedReserved)}</dd></div>`:''}<div><dt>Compromissos (30 dias)</dt><dd>${planValue(room.commitments)}</dd></div>${room.margin>0?`<div><dt>Margem de segurança</dt><dd>${planValue(room.margin)}</dd></div>`:''}<div><dt>Margem após compromissos</dt><dd>${planValue(room.available)}</dd></div></dl>
    </div>
    <div class="plan-coverage-status">
     ${I(deficit||free<0||unassignedReserved>0?'alert':'shield')}
     <div><h3>${deficit?'Cobertura em falta':free<0?'Saldo livre negativo':unassignedReserved>0?'Reservas sem conta associada':protectedFunds?'Cobertura em dia':coverage.length?'Sem valores protegidos':'Adiciona uma conta'}</h3>
      ${deficit?planValue(deficit):''}
      <p>${deficit?'Há compromissos por cobrir nas contas assinaladas.':free<0?'Consulta os saldos e os valores protegidos em cada conta.':unassignedReserved>0?`Existem ${eur(unassignedReserved)} reservados em planos ainda sem conta associada.`:coverage.some(a=>a.low)?'Há contas próximas do limite de proteção.':protectedFunds?'Os valores que reservaste estão cobertos.':coverage.length?'Associa os planos às contas para acompanhar a cobertura.':'Adiciona uma conta ativa para acompanhar o saldo livre.'}</p>
     </div>
     <button type="button" class="secondary" data-plan-pane="records">${coverage.length?'Ver os meus planos':'Gerir planos'}</button>
    </div>
   </div>
   <section class="plan-accounts" aria-label="Cobertura por conta">
    <h3>Cobertura por conta</h3>
    ${accounts?`<ul>${accounts}</ul>`:'<p>Sem contas elegíveis neste espaço.</p>'}
   </section>
  </section>`;
 }

 function planDetails(record,item) {
  const budget=record.kind==='budget';
  const description=budget?'Limite deste mês ainda por gastar nesta conta.':'Valor que já puseste de parte para este plano.';
  return `<div id="unifiedPlanDetail" class="plan-record-detail">
   <div class="plan-detail-progress">
    <h4>${budget?'Execução do orçamento':'Progresso do plano'}</h4>
    <p>${planValue(record.current)} de ${eur(record.target)}</p>
    ${planProgress(record.current,record.target,budget?'Gasto face ao limite':'Valor reunido face à meta')}
    <small>${esc(record.meta)}</small>
   </div>
   <div class="plan-detail-funding">
    <h4>Proteção na conta</h4>
    ${item?`<p>${planValue(item.amount)} · ${esc(item.account.name)}</p>`:'<p>Sem conta associada</p>'}
    <small>${item?.group?`${esc(item.group)} · ${eur(item.groupAmount)} de proteção conjunta.`:description}</small>
   </div>
   <div class="plan-detail-actions">
    ${budget?cmd('Ajustar orçamento','budget',record.entity.id):cmd('Reservar valor',record.kind+'-fund',record.entity.id,true)}
    ${budget?'':cmd('Editar',record.kind,record.entity.id)}
    <button type="button" class="secondary" data-u-plan-protect>${item?'Alterar proteção':'Associar conta'}</button>
    ${record.kind==='goal'?'<button type="button" class="secondary" data-u-plan-contributions>Contribuições</button>':''}
    ${cmd('Apagar','delete-'+record.kind,record.entity.id)}
   </div>
  </div>`;
 }

 function planStatus(r){
  const progress=r.target>0?Math.floor(F.cents(r.current)*100/F.cents(r.target)):null;
  const rem=F.money(r.target-r.current);
  if(r.kind==='budget'){
   if(rem<0)return {progress,tone:'is-over',text:'Excedido em '+eur(-rem)};
   return {progress,tone:progress>=85?'is-warn':'is-ok',text:'Restam '+eur(rem)};
  }
  if(rem<=0&&r.target>0)return {progress,tone:'is-done',text:'Concluído'};
  return {progress,tone:'is-open',text:rem>0?'Faltam '+eur(rem):'Em dia'};
 }
 const PLAN_LOOK={goal:['star','Objetivo'],reserve:['shield','Reserva'],budget:['chart','Orçamento']};
 function planNextStep(records){
  const over=records.filter(r=>r.kind==='budget'&&r.current>r.target&&r.target>0).sort((a,b)=>(b.current-b.target)-(a.current-a.target))[0];
  if(over)return {record:over,icon:'alert',tone:'is-over',title:'Orçamento excedido',text:esc(over.name)+' passou o limite em <b class="amount">'+eur(F.money(over.current-over.target))+'</b> este mês.'};
  const dated=records.filter(r=>r.kind==='goal'&&r.entity.deadline&&r.current<r.target).sort((a,b)=>a.entity.deadline.localeCompare(b.entity.deadline))[0];
  if(dated)return {record:dated,icon:'calendar',tone:'is-open',title:'Próximo prazo',text:'Faltam <b class="amount">'+eur(F.money(dated.target-dated.current))+'</b> para '+esc(dated.name)+' até '+dateLabel(dated.entity.deadline)+'.'};
  const behind=records.filter(r=>r.kind!=='budget'&&r.target>0&&r.current<r.target).sort((a,b)=>a.current/a.target-b.current/b.target)[0];
  if(behind)return {record:behind,icon:'star',tone:'is-open',title:'Mais atrasado',text:esc(behind.name)+' vai em '+Math.floor(behind.current/behind.target*100)+'% · faltam <b class="amount">'+eur(F.money(behind.target-behind.current))+'</b>.'};
  return {record:null,icon:'check',tone:'is-done',title:'Tudo em dia',text:'Os objetivos e reservas estão cumpridos e nenhum orçamento passou o limite.'};
 }
 function recordsPane(records,protection,accounts,s) {
  const kinds=[['all','Todos'],...planKinds];
  const query=PracticalFinance.norm(s.planQuery||'');
  const filtered=records.filter(r=>(s.planKind==='all'||r.kind===s.planKind)&&PracticalFinance.norm(r.name).includes(query));
  const goals=records.filter(r=>r.kind==='goal'),reserves=records.filter(r=>r.kind==='reserve'),budgets=records.filter(r=>r.kind==='budget');
  const sum=(list,k)=>F.money(list.reduce((n,r)=>n+(Number(r[k])||0),0));
  const protectedTotal=sum(accounts,'protectedAmount');
  const gathered=F.money(sum(goals,'current')+sum(reserves,'current')),goal=F.money(sum(goals,'target')+sum(reserves,'target'));
  const pct=goal>0?Math.min(100,Math.floor(gathered/goal*100)):0;
  const next=records.length?planNextStep(records):null;
  const hero=records.length?`<section class="pl2-hero">
   <div class="pl2-hero-main">
    <h3>Dinheiro com destino</h3>${planValue(gathered)}
    <p>${goal>0?`de ${eur(goal)} em objetivos e reservas · <b>${pct}%</b>`:'Sem metas definidas em objetivos e reservas.'}</p>
    <div class="pl2-hero-bar" role="img" aria-label="${pct}% reunido"><i style="width:${pct}%"></i></div>
    <dl>
     <div class="is-goal"><dt>${I('star')} Objetivos · ${goals.length}</dt><dd>${planValue(sum(goals,'current'))}<small>de ${eur(sum(goals,'target'))}</small></dd></div>
     <div class="is-reserve"><dt>${I('shield')} Reservas · ${reserves.length}</dt><dd>${planValue(sum(reserves,'current'))}<small>de ${eur(sum(reserves,'target'))}</small></dd></div>
     <div class="is-budget${budgets.some(b=>b.target>0&&b.current>b.target)?' is-over':''}"><dt>${I('chart')} Orçamentos · ${budgets.length}</dt><dd>${planValue(sum(budgets,'current'))}<small>gasto de ${eur(sum(budgets,'target'))}</small></dd></div>
     <div class="is-protected"><dt>${I('lock')} Protegido nas contas</dt><dd>${planValue(protectedTotal)}<small>${protection.size} ${protection.size===1?'plano associado':'planos associados'}</small></dd></div>
    </dl>
   </div>
   <div class="pl2-hero-side ${next.tone}">
    <span class="pl2-side-icon">${I(next.icon)}</span>
    <div><h3>${next.title}</h3><p>${next.text}</p></div>
    ${next.record?`<button type="button" class="secondary" data-u-plan-focus="${esc(next.record.id)}">Abrir plano</button>`:`<button type="button" class="secondary" data-plan-pane="funding">Ver cobertura</button>`}
   </div>
  </section>`:'';
  const starter=records.length?'':`<section class="pl2-starter" data-plan-create aria-label="Criar o primeiro plano">
   <div class="pl2-starter-intro"><h3>Dá um destino ao teu dinheiro</h3><p>Escolhe o tipo de plano. Depois podes associá-lo a uma conta para proteger o valor e acompanhar a cobertura.</p></div>
   <div class="pl2-starter-grid">
    <button type="button" class="pl2-type is-goal" data-action="goal"><span class="pl2-type-icon">${I('star')}</span><strong>Objetivo</strong><span>Juntar um valor até uma data.</span><small>Ex.: viagem, fundo de emergência, carro.</small><em>Criar objetivo →</em></button>
    <button type="button" class="pl2-type is-reserve" data-action="reserve"><span class="pl2-type-icon">${I('shield')}</span><strong>Reserva</strong><span>Pôr de parte, mês a mês, para uma despesa que vai chegar.</span><small>Ex.: seguros, IMI, férias, Natal.</small><em>Criar reserva →</em></button>
    <button type="button" class="pl2-type is-budget" data-action="budget"><span class="pl2-type-icon">${I('chart')}</span><strong>Orçamento</strong><span>Limite mensal de gasto numa categoria.</span><small>Ex.: Alimentação até 300 € por mês.</small><em>Criar orçamento →</em></button>
   </div>
  </section>`;
  const legacy=PlanningFinance.legacyPlanSummary(data,month);
  const legacyBlock=legacy.total?`<section class="panel plan-legacy-consolidation">
   <div class="u-head"><div><h3>Planos antigos por consolidar</h3><p>Passa envelopes para Orçamentos e planos anuais/sazonais para Reservas sem duplicar valores.</p></div><div class="u-actions"><button type="button" class="secondary" data-u-consolidate-all>Consolidar todos (${legacy.total})</button></div></div>
   <div class="pl2-legacy-list">${[
    ...legacy.envelopes.map(e=>`<div class="attention-row"><div><b>${esc(e.category)}</b><p>Envelope antigo (${eur(e.allocated)}) → Orçamento${e.existingBudgetId?` (orçamento atual: ${eur(e.existingLimit)})`:''}</p></div><button type="button" class="secondary" data-u-consolidate-kind="envelope" data-u-consolidate-id="${esc(e.id)}">Converter em Orçamento</button></div>`),
    ...legacy.annualPlans.map(p=>`<div class="attention-row"><div><b>${esc(p.name)}</b><p>Despesa anual (mês ${p.month}) · ${eur(p.amount)} → Reserva (${p.months} ${p.months===1?'mês':'meses'})${p.existingReserveId?' · atualiza reserva existente':''}</p></div><button type="button" class="secondary" data-u-consolidate-kind="annualPlan" data-u-consolidate-id="${esc(p.id)}">Converter em Reserva</button></div>`),
    ...legacy.seasonalCosts.map(c=>`<div class="attention-row"><div><b>${esc(c.name)}</b><p>Despesa sazonal (${dateLabel(c.date)}) · ${eur(c.saved)} de ${eur(c.amount)} → Reserva (${c.months} ${c.months===1?'mês':'meses'})${c.existingReserveId?' · junta sem duplicar':''}</p></div><button type="button" class="secondary" data-u-consolidate-kind="seasonalCost" data-u-consolidate-id="${esc(c.id)}">Converter em Reserva</button></div>`)
   ].join('')}</div>
  </section>`:'';
  const selected=filtered.find(r=>r.id===s.planId) || filtered[0];
  s.planId=selected?.id || "";
  const cards=filtered.map(r=>{
   const item=protection.get(r.id),st=planStatus(r),[icon,label]=PLAN_LOOK[r.kind];
   const deadlineMeta=r.meta.split(' · ').slice(1).join(' · ');
   const width=st.progress===null?0:Math.max(0,Math.min(100,st.progress));
   return `<details class="plan-record pl2-card is-kind-${esc(r.kind)} ${st.tone}${r.id===s.planId?' is-selected':''}" data-u-plan="${esc(r.id)}" ${r.id===s.planId?'open':''}>
    <summary aria-label="${esc(label+': '+r.name+' · '+st.text)}">
     <div class="pl2-card-top"><span class="pl2-kind">${I(icon)}</span><div class="plan-identity"><strong>${esc(r.name)}</strong><small>${esc(label)}${deadlineMeta?' · '+esc(deadlineMeta):''}</small></div></div>
     <div class="pl2-card-figures plan-figure"><span>${planValue(r.current)}<small> de ${eur(r.target)}</small></span>${st.progress===null?'':`<em>${st.progress}%</em>`}</div>
     <div class="pl2-bar">${st.progress===null?'':`<progress aria-label="${r.kind==='budget'?'Utilização do orçamento':'Progresso do plano'}" value="${width}" max="100"></progress>`}<i style="width:${width}%"></i></div>
     <div class="pl2-card-foot"><span class="pl2-status">${esc(st.text)}</span><span class="pl2-account">${I('account')}${item?esc(item.account.name):'Sem conta'}</span></div>
    </summary>
   </details>`;
  }).join('');
  const toolbar=records.length?`<div class="plan-record-controls pl2-toolbar">
    <div class="plan-filters" role="group" aria-label="Tipo de plano">${kinds.map(([kind,label])=>
     `<button type="button" class="secondary is-${kind}" data-u-plan-kind="${kind}" aria-pressed="${s.planKind===kind}">${label}<small>${kind==='all'?records.length:records.filter(r=>r.kind===kind).length}</small></button>`).join('')}</div>
    <label class="plan-query">${I('search')}<input type="search" id="planSearch" aria-label="Pesquisar planos" placeholder="Pesquisar planos…" value="${esc(s.planQuery||'')}"></label>
    ${records.some(r=>r.kind==='budget')&&['all','budget'].includes(s.planKind)?`<label class="plan-month">Mês do orçamento<input id="unifiedPlansMonth" type="month" value="${esc(month)}"></label>`:''}
   </div>`:'';
  const workspace=records.length?`<div class="eq-design-split plan-record-workspace pl2-workspace">
    <div class="pl2-grid">${cards||`<div class="plan-empty"><h3>Nenhum plano encontrado</h3><p>Experimenta outro filtro ou termo de pesquisa.</p></div>`}</div>
    <aside class="panel plan-record-inspector pl2-inspector${selected?' '+planStatus(selected).tone:''}" aria-label="Detalhe do plano">${selected?`<span class="pl2-inspector-kind is-${esc(selected.kind)}">${I(PLAN_LOOK[selected.kind][0])}${PLAN_LOOK[selected.kind][1]}</span><h3>${esc(selected.name)}</h3>${planDetails(selected,protection.get(selected.id))}`:'<p>Seleciona um plano para ver o progresso, a conta protegida e as ações.</p>'}</aside>
   </div>`:'';
  return `<div class="plan-records pl2">
   ${hero}${starter}
   ${records.length?'<h3 class="pl2-section-title">Os teus planos</h3>':''}
   ${toolbar}
   <div id="planRecordsWorkspace">${workspace}
   ${legacyBlock}
   <details class="plan-managers pl2-managers"><summary>Gestão avançada</summary><div class="u-actions">
    <button type="button" class="secondary" data-plan-open="goals">Gerir objetivos</button>
    <button type="button" class="secondary" data-plan-open="planningPlus">Gerir reservas</button>
    <button type="button" class="secondary" data-plan-open="budgets">Gerir orçamentos</button>
    <button type="button" class="secondary" id="reserveEvidenceButton" data-u-plan-reserves>Conferir reservas</button>
   </div></details></div>
  </div>`;
 }

 function decisionsPane(s) {
  const selected=s.decisionSection||'simulator';
  const tool=selected==='simulator'?(s.decisionMode==='autonomy'?'autonomy':'simulator'):selected;
  const visibility=id=>selected===id?'':'hidden';
  const room=FinancePlus.spendingRoom(data,data.safetyMargin||0),reserved=FinancePlus.reserves(data);
  const today=F.today(),balance=F.money(data.accounts.filter(a=>!a.archived).reduce((n,a)=>n+(Number(F.balanceAt(data,a,today))||0),0));
  const tools=[
   ['simulator','simulator','decision-simulator','transfer','Simular uma decisão','Compra, crédito ou mudança de rendimento: vê o impacto antes de avançar.','toggleDecisionWorkbench'],
   ['autonomy','simulator','decision-autonomy','shield','Autonomia financeira','Quantos meses as despesas essenciais ficam cobertas.',''],
   ['forecast','forecast','','chart','Planeado vs. realizado','Orçamentos face ao gasto real e despesas sazonais.',''],
   ['history','history','','history','Histórico','Cenários guardados, decisões registadas e acontecimentos.','']
  ];
  return `<section class="plan-decisions dc2">
   <section class="dc2-hero">
    <div class="dc2-hero-main">
     <h3>Margem para decidir hoje</h3>${planValue(room.available)}
     <p>O que sobra do saldo depois dos compromissos dos próximos 30 dias${room.margin>0?' e da margem de segurança':''}.</p>
     <dl>
      <div><dt>Saldo nas contas</dt><dd>${planValue(balance)}</dd></div>
      <div><dt>Compromissos (30 dias)</dt><dd>${planValue(room.commitments)}</dd></div>
      <div><dt>Reservado em planos</dt><dd>${planValue(reserved.assigned||0)}</dd></div>
      ${room.margin>0?`<div><dt>Margem de segurança</dt><dd>${planValue(room.margin)}</dd></div>`:''}
     </dl>
    </div>
    <ol class="dc2-steps" aria-label="Como decidir">
     <li><b>1</b><div><strong>Vê a margem</strong><small>Quanto podes usar sem tocar em compromissos.</small></div></li>
     <li><b>2</b><div><strong>Simula o impacto</strong><small>Compara a situação atual com a decisão, sem mexer em saldos.</small></div></li>
     <li><b>3</b><div><strong>Regista se avançares</strong><small>Transforma em compromisso ou guarda a decisão para rever.</small></div></li>
    </ol>
   </section>
   <nav class="dc2-tools decision-sections" aria-label="Ferramentas de decisão">${tools.map(([id,section,practical,icon,label,text,domId])=>
    `<button type="button" class="dc2-tool${tool===id?' is-active':''}"${domId?` id="${domId}"`:''} data-decision-section="${section}"${practical?` data-practical="${practical}"`:''} data-decision-tool="${id}" aria-pressed="${tool===id}"><span class="dc2-tool-icon">${I(icon)}</span><strong>${label}</strong><small>${text}</small></button>`).join('')}</nav>
   <section class="decision-page dc2-page" data-decision-page="simulator" ${visibility('simulator')}>
    <div class="u-decision-pane" aria-label="Simulação e autonomia"></div>
    <details class="decision-premises"><summary>Saldos e premissas da simulação</summary><div class="u-decision-overview"></div><div class="decision-baseline"></div></details>
   </section>
   <section class="decision-page decision-pair dc2-page" data-decision-page="forecast" ${visibility('forecast')}>
    <div class="u-plan-comparison"></div><div class="u-plan-seasonal"></div>
   </section>
   <section class="decision-page dc2-page" data-decision-page="history" ${visibility('history')}>
    <div class="u-plan-scenarios decision-pair"></div>
    <details class="plan-decision-events-box"${s.eventsOpen?' open':''}><summary>Acontecimentos e contribuições</summary>
     <div class="u-actions"><button type="button" class="secondary" data-practical="event-form">Novo acontecimento</button><button type="button" class="secondary" data-practical="event-export">Exportar acontecimentos</button></div>
     <div class="u-plan-events"></div></details>
   </section>
  </section>`;
 }

 function plans(){
  restorePlanPortals();
  const host=$('#plansHub'),s=state();
  let root=$('#plansBoard',host);
  if(!root){
   root=document.createElement('div');
   root.id='plansBoard';
   root.className='plan-workspace';
   host.prepend(root);
  }
  host.classList.add('u-plans');
  $$(':scope>.section-head,:scope>#plansHubGrid,:scope>#plansHubOverview,:scope>#plansHubSections',host).forEach(n=>n.hidden=true);
  for(const id of ['decisionsHub','timelinePanel']){const n=source(id);if(n)parked.append(n);}
  const pane=s.planPane||'records';
  const {accounts,items}=pane==='decisions'?{}:PlanningFinance.protectionOverview(data,pane==='records'&&month!==F.today().slice(0,7)?F.dateAt(month,31):F.today());
  const records=pane==='records'?planRecords():[];
  const focused=root.contains(document.activeElement)?document.activeElement:null;
  const queryCaret=focused?.id==='planSearch'?focused.selectionStart:null;
  root.innerHTML=`<header class="plan-masthead"><div><h2>${pane==='decisions'?'Decisões':pane==='records'?'Planos':'Cobertura dos planos'}</h2>
   <nav class="plan-navigation" aria-label="Planos e decisões">${[['funding','Cobertura'],['records','Planos'],['decisions','Decisões']].map(([id,label])=>
    `<button type="button" data-plan-pane="${id}" aria-current="${pane===id?'page':'false'}">${label}</button>`).join('')}</nav></div>
   <details class="u-add-menu" ${pane==='decisions'?'hidden':''}><summary class="primary">${I('plus')} Criar plano</summary>
   <div>${cmd('Objetivo','goal')}${cmd('Reserva','reserve')}${cmd('Orçamento','budget')}</div></details>
  </header>
  ${pane==='funding'?fundingPane(accounts):pane==='records'?recordsPane(records,items,accounts,s):decisionsPane(s)}`;
  if(pane==='records'){
   const search=$('#planSearch',root);
   if(search)search.oninput=e=>{s.planQuery=e.target.value;const nextRecords=planRecords(),nq=PracticalFinance.norm(s.planQuery||''),filteredNext=nextRecords.filter(r=>(s.planKind==='all'||r.kind===s.planKind)&&PracticalFinance.norm(r.name).includes(nq)),selNext=filteredNext.find(r=>r.id===s.planId),box=$('#planRecordsWorkspace',root);if(!box)return plans();const tmp=document.createElement('div');tmp.innerHTML=recordsPane(nextRecords,items,accounts,s);const nextBox=$('#planRecordsWorkspace',tmp);if(nextBox)box.replaceWith(nextBox);};
   period(root,'unifiedPlansMonth');
  }
  if(pane==='decisions'){
   const simulator=mount('decisionsHub',$('.u-decision-pane',root));
   for(const node of $$('.decisions-hero,.decision-flow,.ex-detail',simulator))node.hidden=true;
   placePlanNode($('#simBaselineSummary',simulator),$('.decision-baseline',root));
   const overview=$('.decisions-overview',simulator);
   if(overview){
    overview.removeAttribute('style');
    for(const card of $$('article',overview)){card.classList.add('panel');card.removeAttribute('style');}
    placePlanNode(overview,$('.u-decision-overview',root));
   }
   for(const card of $$('[data-decision-group]',simulator)){
    placePlanNode(card,$('.u-plan-'+card.dataset.decisionGroup,root));
   }
   const eventsBox=$('.plan-decision-events-box',root);
   eventsBox.ontoggle=()=>{if(eventsBox.isConnected)s.eventsOpen=eventsBox.open;};
   placePlanNode(source('timelinePanel'),$('.u-plan-events',root));
   placePlanNode($('#priorityWorkbench'),$('.u-plan-events',root));
   // Keep the selected tool and the original form inputs across renders.
   window.PracticalUI?.selectDecisionMode(s.decisionMode==='autonomy'?'autonomy':'simulator');
   for(const node of $$('.decisions-hero,.decision-flow,.ex-detail',simulator))node.hidden=true;
  }

  root.onclick=e=>{
   const create=e.target.closest('.u-add-menu [data-action],[data-plan-create] [data-action]');
   if(create){
    s.planPane='records';s.planKind=create.dataset.action;s.planQuery='';s.planId='';
    const menu=create.closest('details');if(menu)menu.open=false;
    return;
   }
   const consolidate=e.target.closest('[data-u-consolidate-kind]');
   if(consolidate){
    const kind=consolidate.dataset.uConsolidateKind,id=consolidate.dataset.uConsolidateId;
    commit(()=>PlanningFinance.consolidateLegacyPlan(data,kind,id,month),'Plano consolidado.');
    return;
   }
   if(e.target.closest('[data-u-consolidate-all]')){
    commit(()=>PlanningFinance.consolidateAllLegacyPlans(data,month),'Planos antigos consolidados.');
    return;
   }
   const change=e.target.closest('[data-plan-pane]');
   if(change){
    s.planPane=change.dataset.planPane;
    plans();
    $('.plan-navigation [aria-current=page]',root)?.focus({preventScroll:true});
    return;
   }
   const focusPlan=e.target.closest('[data-u-plan-focus]');
   if(focusPlan){s.planKind='all';s.planQuery='';s.planId=focusPlan.dataset.uPlanFocus;plans();$$('.plan-record',root).find(n=>n.dataset.uPlan===s.planId)?.scrollIntoView({block:'nearest'});return;}
   const section=e.target.closest('[data-decision-section]');
   if(section){
    s.decisionSection=section.dataset.decisionSection;
    if(section.dataset.practical)s.decisionMode=section.dataset.practical==='decision-autonomy'?'autonomy':'simulation';
    for(const toolButton of $$('[data-decision-tool]',root)){const on=toolButton===section;toolButton.setAttribute('aria-pressed',String(on));toolButton.classList.toggle('is-active',on);}
    for(const page of $$('[data-decision-page]',root))page.hidden=page.dataset.decisionPage!==s.decisionSection;
    return;
   }
   const filter=e.target.closest('[data-u-plan-kind]');
   if(filter){
    s.planKind=filter.dataset.uPlanKind;
    plans();
    $('[data-u-plan-kind][aria-pressed=true]',root)?.focus({preventScroll:true});
    return;
   }
   const row=e.target.closest('.plan-record>summary');
   if(row){
    e.preventDefault();
    const id=row.parentElement.dataset.uPlan;
    s.planId=s.planId===id?'':id;
    plans();
    $$('.plan-record',root).find(n=>n.dataset.uPlan===id)?.querySelector('summary').focus({preventScroll:true});
    return;
   }
   const manager=e.target.closest('[data-plan-open]');
   if(manager){PlanningManagerUI.openPlan(manager.dataset.planOpen);return;}
   if(e.target.closest('[data-u-plan-reserves]')){window.ProductivityUI?.reserves();return;}
   if(e.target.closest('[data-u-plan-contributions]')){
    s.planPane='decisions';s.decisionSection='history';s.eventsOpen=true;plans();
    $('#priorityWorkbench')?.scrollIntoView({block:'center'});
    return;
   }
   if(e.target.closest('[data-u-plan-protect]')){
    const selected=records.find(r=>r.id===s.planId);
    if(!selected)return;
    const row=selected.entity,accountId=row.protectionAccountId??(selected.kind==='goal'?row.accountId:'');
    form('Proteção · '+esc(selected.name),select('Conta','protectionAccount',[['','Sem proteção'],...accounts.map(a=>[String(a.id),a.name])],String(accountId||''))+
     field('Despesa partilhada (opcional)','protectionGroup',row.protectionGroup||'','text','maxlength="100"'),
     f=>commit(()=>PlanningFinance.saveProtection(data,selected.kind,row.id,f.get('protectionAccount'),f.get('protectionGroup')),'Proteção atualizada.'),
     'Usa o mesmo nome nos planos da mesma conta que representam a mesma despesa. Nesse caso, conta apenas o maior valor.');
   }
   const tool=e.target.closest('.plan-decision-choices [data-practical]');
   if(tool){
    s.decisionMode=tool.dataset.practical==='decision-autonomy'?'autonomy':'simulation';
    for(const button of $$('.plan-decision-choices button',root))button.setAttribute('aria-pressed',String(button===tool));
   }
  };
 }
 function inventoryRecords(){const today=F.today();return data.accounts.map(a=>{const conference=ReconciliationModel.accountState(data,a,today);return{id:'account:'+a.id,kind:'account',entity:a,name:a.name,meta:a.type||'Conta',value:F.balanceAt(data,a,today),date:a.reconciledOn,status:a.archived?'Arquivada':conference.confirmed?'Conferida':'Por conferir'};}).concat(data.debts.map(a=>({id:'debt:'+a.id,kind:'debt',entity:a,name:a.name,meta:'Prestação de '+eur(a.payment||0)+'/mês',value:-a.balance,date:a.updatedOn,status:a.balance?'Em dívida':'Liquidado'})),data.assets.map(a=>({id:'asset:'+a.id,kind:'asset',entity:a,name:a.name,meta:a.kind||'Bem',value:LifeFinance.assetValue(a),date:(a.valuations||[]).filter(v=>v.date<=today).map(v=>v.date).sort().at(-1),status:'Avaliação manual'})),data.investments.map(a=>({id:'investment:'+a.id,kind:'investment',entity:a,name:a.name,meta:a.type||'Posição',value:a.value||0,date:a.updatedOn||a.date,status:'Valor registado'})));}
 const INVENTORY_KINDS={account:'Conta',debt:'Crédito',asset:'Bem',investment:'Investimento'};
 const INVENTORY_LOOK={all:['green','chart'],account:['blue','account'],debt:['amber','alert'],asset:['purple','box'],investment:['green','income']};
  function inventorySummary(all,active){const total=kind=>F.money(all.filter(r=>!kind||r.kind===kind).reduce((n,r)=>n+(Number(r.value)||0),0)),count=kind=>all.filter(r=>r.kind===kind).length,word=(n,one,many)=>n+' '+(n===1?one:many);return '<div class="wl-tiles wl-tiles-5 u-inventory-summary">'+[['all','Património líquido',total(),word(all.length,'registo','registos')],['account','Contas',total('account'),word(count('account'),'conta','contas')],['debt','Créditos',total('debt'),word(count('debt'),'crédito','créditos')],['asset','Bens',total('asset'),word(count('asset'),'bem','bens')],['investment','Investimentos',total('investment'),word(count('investment'),'posição','posições')]].map(([kind,label,value,detail])=>'<button type="button" class="ch-tile is-'+INVENTORY_LOOK[kind][0]+' u-inventory-kpi'+(active===kind?' active':'')+'" data-kind="'+kind+'" data-u-wealth-kind="'+kind+'" aria-pressed="'+(active===kind)+'"><span class="ch-tile-icon">'+I(INVENTORY_LOOK[kind][1])+'</span><div><span>'+label+'</span><strong class="amount">'+eur(value)+'</strong><small>'+detail+'</small></div></button>').join('')+'</div>';}
 function inventory(){ReconciliationUI.render();
  const diag=ReconciliationModel.diagnoseLedger(data),pairs=ReconciliationModel.candidates(data),pendingTransfers=data.transactions.filter(t=>t.type==='transfer'&&t.transferStatus==='pending');
  const pendingCount=pendingTransfers.length;
  const diffAccounts=diag.accounts.filter(acc=>acc.difference!==0||acc.statementDifference).length,reconcileAlerts=diffAccounts+pendingCount+pairs.length;
  const host=$('#wealthMoneyHub'),s=state();host.classList.add('u-inventory');let root=$('#unifiedInventory',host);if(!root){root=document.createElement('div');root.id='unifiedInventory';host.prepend(root);}
  $$(':scope>.section-head,:scope>.wealth-section-nav',host).forEach(n=>n.hidden=true);
  for(const id of ['accounts','debts','wealthHoldingsHub']){const n=$('#'+id);if(n)parked.append(n);}
  $('.u-inventory-legacy',host)?.remove();
  const all=inventoryRecords(),query=s.wealthSearch||'',normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const rows=all.filter(r=>(s.wealthKind==='all'||s.wealthKind==='holdings'&&['asset','investment'].includes(r.kind)||r.kind===s.wealthKind)&&normalize(r.name+' '+r.meta).includes(normalize(query))),selected=rows.find(r=>r.id===s.wealthId)||rows[0];s.wealthId=selected?.id||'';
  const showReconcile=Boolean(s.inventoryHistoryOpen);
  const reconcileDrawer=`<section id="inventoryReconcilePanel" class="panel u-inv-reconcile" ${showReconcile?'':'hidden'}>
   <div class="u-inv-reconcile-head">
    <div><h3>Conferência de extratos e transferências</h3><p>${reconcileAlerts?`${reconcileAlerts} alerta(s): ${diffAccounts} conta(s), ${pendingCount} transferência(s) pendente(s), ${pairs.length} par(es) sugerido(s).`:'Contas e transferências em dia.'}</p></div>
    <div class="u-actions"><button type="button" class="secondary" data-inv-reconcile-close>Fechar</button></div>
   </div>
   <div class="u-inv-reconcile-grid">
    <div class="u-table-scroll"><table class="u-table u-inv-rec-table"><thead><tr><th>Conta</th><th>Calculado</th><th>Guardado</th><th>Diferença</th><th>Extrato</th></tr></thead><tbody>${diag.accounts.map(a=>{
     const badge=a.difference===0?'<span class="wl-status">0,00 €</span>':`<span class="wl-status is-pending">${a.difference===null?'Por apurar':eur(a.difference)}</span>`;
     const stmt=a.statementDifference?` <small class="wl-status is-pending">Extrato ${eur(a.statementDifference)}</small>`:'';
     return `<tr><td><b>${esc(a.name)}</b></td><td class="amount">${a.calculatedBalance===null?'—':eur(a.calculatedBalance)}</td><td class="amount">${eur(a.savedBalance)}</td><td>${badge}${stmt}</td><td><button type="button" class="secondary" data-reconcile-account="${esc(a.id)}">Conferir</button></td></tr>`;
    }).join('')}</tbody></table></div>
    ${(pendingCount||pairs.length)?`<div class="u-inv-rec-transfers">
     ${pendingTransfers.slice(0,8).map(t=>`<div class="u-inv-rec-row"><span><b>${esc(t.account)}</b> · ${dateLabel(t.date)} · ${eur(t.amount)}<small>${esc(t.description)}</small></span><button type="button" class="secondary" data-reconcile-movement="${esc(t.id)}">Rever</button></div>`).join('')}
     ${pairs.slice(0,8).map((p,i)=>`<div class="u-inv-rec-row"><span><b>${esc(p.from)} → ${esc(p.to)}</b> · ${eur(p.amount)}<small>${dateLabel(p.date)} / ${dateLabel(p.targetDate)}</small></span>${p.blocked?'<small class="muted">Mês fechado</small>':`<button type="button" class="primary" data-reconcile-pair="${i}">Confirmar par</button>`}</div>`).join('')}
    </div>`:'<p class="muted u-inv-rec-ok">Sem transferências pendentes nem pares por confirmar.</p>'}
   </div>
  </section>`;
  const drawList=list=>'<div class="wl-record-list">'+list.map(r=>'<article data-u-wealth="'+esc(r.id)+'" data-kind="'+r.kind+'" class="wl-record'+(s.wealthId===r.id?' is-selected':'')+'"><span class="wl-kind-badge kind-'+r.kind+'">'+I(INVENTORY_LOOK[r.kind][1])+'</span><div class="wl-record-main"><button type="button" class="u-record-button" aria-pressed="'+(s.wealthId===r.id)+'">'+esc(r.name)+'</button><small>'+INVENTORY_KINDS[r.kind]+' · '+esc(r.meta)+' · '+(F.validDate(r.date)?dateLabel(r.date):'sem data')+'</small></div><div class="wl-record-side"><strong class="amount'+(r.value<0?' negative':'')+'">'+eur(r.value)+'</strong><span class="wl-status'+(/Por conferir|Em dívida/.test(r.status)?' is-pending':/Arquivada|Liquidado/.test(r.status)?' is-muted':'')+'">'+esc(r.status)+'</span></div></article>').join('')+'</div>'+(!list.length?'<div class="wl-empty">'+I('search')+'<strong>Sem registos</strong><p>'+(s.wealthSearch?'Experimenta outro nome.':'Não há registos neste filtro.')+'</p></div>':'')+'<footer>'+list.length+' '+(list.length===1?'registo':'registos')+' · Seleciona um registo para ver e gerir o respetivo histórico.</footer>';
  root.innerHTML=title('Património · Inventário','Contas, créditos, bens e investimentos com conferência e histórico integrados.',
   '<button type="button" class="secondary" id="toggleInventoryReconcile" aria-expanded="'+showReconcile+'">'+I('check')+'Conferência global'+(reconcileAlerts?' ('+reconcileAlerts+')':'')+'</button>'+
   '<details class="u-add-menu"><summary class="primary">'+I('plus')+'Adicionar</summary><div>'+cmd('Conta','account')+cmd('Crédito','debt')+cmd('Bem','life-asset')+cmd('Investimento','life-holding')+cmd('Operação de investimento','life-trade')+'</div></details>')+
   inventorySummary(all,s.wealthKind)+reconcileDrawer+'<div class="u-inventory-grid"><section class="panel u-inventory-list"><div class="wl-toolbar"><label class="cs-search">'+I('search')+'<input id="unifiedInventorySearch" type="search" aria-label="Pesquisar inventário" placeholder="Pesquisar registo…" value="'+esc(query)+'"></label><div class="cs-pills" hidden role="group" aria-label="Tipo de registo">'+[['all','Todos'],['account','Contas'],['debt','Créditos'],['asset','Bens'],['investment','Investimentos']].map(([kind,label])=>'<button type="button" class="'+(s.wealthKind===kind?'active':'')+'" data-u-wealth-kind="'+kind+'" aria-pressed="'+(s.wealthKind===kind)+'">'+label+'<small>'+(kind==='all'?all.length:all.filter(r=>r.kind===kind).length)+'</small></button>').join('')+'</div></div><div id="inventoryListBody">'+drawList(rows)+'</div></section><aside class="panel u-inspector desk-inspector" aria-label="Registo selecionado"><div class="desk-inspector-heading"><span>Registo selecionado</span><h3 id="inventoryInspectorTitle">'+esc(selected?.name||'Nenhum registo')+'</h3></div><div class="u-inventory-detail"></div></aside></div>';
  const drawDetail=sel=>{const titleEl=$('#inventoryInspectorTitle',root);if(titleEl)titleEl.textContent=sel?.name||'Nenhum registo';const body=$('.u-inventory-detail',root);if(sel){const r=sel,a=r.entity;
   if(r.kind==='account'){
    const accDiag=diag.accounts.find(x=>String(x.id)===String(a.id)||x.name===a.name);
    const reconciliations=(accDiag?.reconciliations||[]).slice().sort((x,y)=>String(y.date||'').localeCompare(String(x.date||''))).slice(0,8);
    const tx=data.transactions.filter(t=>t.account===a.name||t.targetAccount===a.name).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
    body.innerHTML='<p>'+esc(r.meta)+'</p><div class="u-inspector-value"><span>Saldo atual</span><strong class="amount">'+eur(r.value)+'</strong></div><dl><div><dt>Estado</dt><dd>'+esc(r.status)+'</dd></div><div><dt>Última conferência</dt><dd>'+(F.validDate(r.date)?dateLabel(r.date):'Não registada')+'</dd></div><div><dt>Saldo inicial</dt><dd>'+eur(a.openingBalance||0)+'</dd></div><div><dt>Diferença de extrato</dt><dd>'+(accDiag?.statementDifference?eur(accDiag.statementDifference):'0,00 €')+'</dd></div></dl><div class="u-actions">'+cmd('Conferir saldo','reconcile',a.id,true)+'<button type="button" class="secondary" data-inv-transfer>Transferir</button>'+cmd('Editar','account',a.id)+cmd(a.archived?'Reativar conta':'Arquivar conta','archive',a.id)+'<button type="button" class="secondary danger" data-action="delete-account" data-id="'+esc(a.id)+'">Apagar</button></div>'+
     '<h4>Histórico de conferências ('+reconciliations.length+')</h4>'+(reconciliations.length?'<div class="u-table-scroll u-inv-hist-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Extrato</th><th>Diferença</th></tr></thead><tbody>'+reconciliations.map(rec=>'<tr><td>'+dateLabel(rec.date)+'</td><td class="amount">'+eur(rec.actual??0)+'</td><td class="amount">'+eur(rec.difference??0)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Ainda sem conferências de extrato nesta conta.</p>')+
     '<h4>Movimentos recentes ('+tx.length+')</h4>'+(tx.length?'<div class="u-table-scroll u-inv-hist-scroll"><table class="u-table"><tbody>'+tx.map(t=>'<tr><td>'+dateLabel(t.date)+'</td><td>'+cmd(t.description,'edit-tx',t.id)+'</td><td class="amount">'+eur(t.type==='expense'?-t.amount:t.type==='adjustment'?t.delta:t.amount)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Sem movimentos nesta conta.</p>');
    $('[data-inv-transfer]',body)?.addEventListener('click',()=>transferForm(a.name));
   }else if(r.kind==='debt'){
    const m=debtMetrics(a),forecast=m.projection.possible?dateLabel(m.projection.endDate):'Prestação insuficiente';
    const historyPreview=m.history.slice(0,8).map(h=>debtHistoryRowHTML(a,h)).join('');
    const historyRest=m.history.length>8?'<details class="u-inv-more-history"><summary>Ver histórico completo ('+m.history.length+')</summary><div class="debt-history-list">'+m.history.slice(8).map(h=>debtHistoryRowHTML(a,h)).join('')+'</div></details>':'';
    body.innerHTML='<p>'+esc(r.meta)+'</p><div class="u-inspector-value"><span>Dívida atual</span><strong class="amount">'+eur(r.value)+'</strong></div><div class="debt-progress-wrap"><div class="debt-progress-head"><span>Capital amortizado</span><b>'+Math.round(m.progress)+'%</b></div><div class="debt-progress-track"><span style="width:'+m.progress.toFixed(1)+'%"></span></div><small>'+eur(Math.max(0,m.original-(Number(a.balance)||0)))+' de '+eur(m.original)+' amortizados</small></div><dl><div><dt>Prestação mensal</dt><dd>'+eur(a.payment||0)+'</dd></div><div><dt>Capital inicial</dt><dd>'+eur(m.original)+'</dd></div><div><dt>Total pago</dt><dd>'+eur(m.paid)+'</dd></div><div><dt>Juros pagos</dt><dd>'+eur(m.interestPaid)+'</dd></div><div><dt>Taxa nominal</dt><dd>'+(a.rate||0)+'%</dd></div><div><dt>Fim estimado</dt><dd>'+esc(forecast)+'</dd></div></dl><div class="u-actions">'+cmd('Registar prestação','pay-debt',a.id,true)+cmd('Amortização extraordinária','extra-debt',a.id)+cmd('Associar histórico','link-debt-history',a.id)+cmd('+ Pagamento anterior','debt-history',a.id)+cmd('Editar','debt',a.id)+'<button type="button" class="secondary danger" data-action="delete-debt" data-id="'+esc(a.id)+'">Apagar</button></div><h4>Histórico de pagamentos ('+m.history.length+')</h4>'+(m.history.length?'<div class="debt-history-list u-inv-hist-scroll">'+historyPreview+'</div>'+historyRest:'<p class="muted">Ainda sem pagamentos registados neste crédito.</p>');
   }else if(r.kind==='asset'){
    const valuations=(a.valuations||[]).slice().sort((x,y)=>y.date.localeCompare(x.date));
    body.innerHTML='<p>'+esc(r.meta)+'</p><div class="u-inspector-value"><span>Avaliação registada</span><strong class="amount">'+eur(r.value)+'</strong></div><dl><div><dt>Estado</dt><dd>'+esc(r.status)+'</dd></div><div><dt>Última avaliação</dt><dd>'+(F.validDate(r.date)?dateLabel(r.date):'Não registada')+'</dd></div></dl><div class="u-actions">'+cmd('Registar avaliação','life-valuation',a.id,true)+cmd('Editar','life-asset',a.id)+'<button type="button" class="secondary danger" data-action="life-remove-asset" data-id="'+esc(a.id)+'">Apagar</button></div><h4>Histórico de avaliações ('+valuations.length+')</h4>'+(valuations.length?'<div class="u-table-scroll u-inv-hist-scroll"><table class="u-table"><tbody>'+valuations.slice(0,10).map(v=>'<tr><td>'+dateLabel(v.date)+'</td><td class="amount">'+eur(v.value)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Sem avaliações registadas.</p>');
   }else{
    const trades=data.investmentTrades.filter(t=>t.investmentId===a.id).slice().reverse();
    body.innerHTML='<p>'+esc(r.meta)+'</p><div class="u-inspector-value"><span>Valor registado</span><strong class="amount">'+eur(r.value)+'</strong></div><dl><div><dt>Unidades</dt><dd>'+esc(a.units??'Por definir')+'</dd></div><div><dt>Custo base</dt><dd>'+eur(a.cost||0)+'</dd></div><div><dt>Variação</dt><dd>'+eur((a.value||0)-(a.cost||0))+'</dd></div><div><dt>Atualizado em</dt><dd>'+(F.validDate(r.date)?dateLabel(r.date):'Não registada')+'</dd></div></dl><div class="u-actions">'+cmd('Registar operação','life-trade','',true)+cmd('Editar','life-holding',a.id)+'<button type="button" class="secondary danger" data-action="delete-investment" data-id="'+esc(a.id)+'">Apagar</button></div><h4>Histórico de operações ('+trades.length+')</h4>'+(trades.slice(0,8).map(t=>'<div class="u-pending-row"><span>'+dateLabel(t.date)+' · '+esc({buy:'Compra',sell:'Venda',dividend:'Dividendo'}[t.kind])+' · '+eur(t.net)+'</span>'+cmd('Reverter','life-undo-trade',t.id)+'</div>').join('')||'<p class="muted">Sem operações registadas.</p>');
   }
  }};
  drawDetail(selected);
  const wireWealthRows=()=>bindRows(root,'data-u-wealth',id=>{s.wealthId=id;const currentRows=all.filter(r=>(s.wealthKind==='all'||s.wealthKind==='holdings'&&['asset','investment'].includes(r.kind)||r.kind===s.wealthKind)&&normalize(r.name+' '+r.meta).includes(normalize(s.wealthSearch||'')));for(const el of $$('[data-u-wealth]',root)){const on=el.dataset.uWealth===id;el.classList.toggle('is-selected',on);$('.u-record-button',el)?.setAttribute('aria-pressed',String(on));}drawDetail(currentRows.find(r=>r.id===id)||currentRows[0]);});
  wireWealthRows();for(const b of $$('[data-u-wealth-kind]',root))b.onclick=()=>{s.wealthKind=b.dataset.uWealthKind;inventory();};$('#unifiedInventorySearch',root).oninput=e=>{s.wealthSearch=e.target.value;const nextRows=all.filter(r=>(s.wealthKind==='all'||s.wealthKind==='holdings'&&['asset','investment'].includes(r.kind)||r.kind===s.wealthKind)&&normalize(r.name+' '+r.meta).includes(normalize(s.wealthSearch||''))),nextSel=nextRows.find(r=>r.id===s.wealthId)||nextRows[0];s.wealthId=nextSel?.id||'';const listBox=$('#inventoryListBody',root);if(listBox){listBox.innerHTML=drawList(nextRows);wireWealthRows();drawDetail(nextSel);}else inventory();};
  const recPanel=$('#inventoryReconcilePanel',root),toggleBtn=$('#toggleInventoryReconcile',root);
  const syncRec=()=>{s.inventoryHistoryOpen=!recPanel.hidden;toggleBtn?.setAttribute('aria-expanded',String(!recPanel.hidden));toggleBtn?.classList.toggle('active',!recPanel.hidden);};
  toggleBtn?.addEventListener('click',()=>{recPanel.hidden=!recPanel.hidden;syncRec();});
  $('[data-inv-reconcile-close]',root)?.addEventListener('click',()=>{recPanel.hidden=true;syncRec();});
  $$('[data-reconcile-account]',root).forEach(b=>b.onclick=()=>reconcileForm(b.dataset.reconcileAccount));
  $$('[data-reconcile-movement]',root).forEach(b=>b.onclick=()=>transferForm(null,b.dataset.reconcileMovement));
  $$('[data-reconcile-pair]',root).forEach(b=>b.onclick=()=>{
   const p=pairs[Number(b.dataset.reconcilePair)],out=data.transactions.find(t=>String(t.id)===String(p.outId)),incoming=data.transactions.find(t=>String(t.id)===String(p.inId));
   const fingerprint=JSON.stringify([out,incoming]);
   form('Conferir transferência',`<p>${esc(p.from)} → ${esc(p.to)} · ${eur(p.amount)}</p><p>Saída: ${dateLabel(p.date)} · ${esc(out.description)}<br>Entrada: ${dateLabel(p.targetDate)} · ${esc(incoming.description)}</p><p>Os dois registos observados serão preservados como evidência num único movimento. Os saldos mantêm os efeitos já registados.</p>`,()=>commit(()=>{const current=[data.transactions.find(t=>String(t.id)===String(p.outId)),data.transactions.find(t=>String(t.id)===String(p.inId))];if(JSON.stringify(current)!==fingerprint)throw Error('Os movimentos mudaram. Revê novamente o par.');FinancePlus.pairTransfer(data,p.outId,p.inId);},'Transferência confirmada pelo par selecionado.'),'Confirma as duas linhas no extrato antes de guardar.','Confirmar par');
  });
 }
 function bindRows(root,attr,fn){for(const row of $$('['+attr+']',root)){const b=$('.u-record-button',row);const select=()=>{fn(row.getAttribute(attr));};b.onclick=select;row.onclick=e=>{if(!e.target.closest('button,input,select,a,summary'))select();};b.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const rows=$$('['+attr+']',root),i=rows.indexOf(row),next=e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1))),id=rows[next].getAttribute(attr);fn(id);const nextRoot=document.getElementById(root.id);for(const el of nextRoot?.querySelectorAll('['+attr+']')||[])if(el.getAttribute(attr)===id)$('.u-record-button',el)?.focus({preventScroll:true});};}}
 function bindTaskNavigation(root,attr,select){const buttons=$$('['+attr+']',root);for(const b of buttons){b.onclick=()=>select(b.getAttribute(attr));b.onkeydown=e=>{if(!['Home','End','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const i=buttons.indexOf(b),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowDown'?1:-1))),id=buttons[n].getAttribute(attr);select(id);for(const next of $$('['+attr+']',document.getElementById(root.id)))if(next.getAttribute(attr)===id)next.focus({preventScroll:true});};}}
 const taskItems=[['inbox','A tratar','document'],['imports','Importações','income'],['rules','Regras','recurring'],['documents','Comprovativos','document'],['quality','Qualidade dos dados','shield']];
 const dataSources=new Map(),backupExtras=[];
 function discoverDataSources(){for(const [task,id]of [['inbox','inboxHub'],['imports','review'],['quality','qualityHub'],['captures','captureQueue'],['rules','personalRules'],['documents','documentsHub']])dataSources.set(task,source(id));const backup=$('#backupSettings')?.closest('article.panel');if(backup)dataSources.set('backup',backup);const update=$('#maintenanceDataPanel');if(update)dataSources.set('update',update);}
 function enhanceInbox(){
   if(view!=='dataHub'||state().task!=='inbox')return;const inbox=$('#inboxHub'),layout=$('.data-inbox-layout',inbox);if(!layout)return;const sources=$('.data-inbox-sources',layout);if(sources)layout.before(sources);layout.classList.add('u-inbox-workspace');let detail=$('#dataInboxInspector',inbox);if(!detail){detail=document.createElement('section');detail.id='dataInboxInspector';detail.className='panel u-inbox-inspector';detail.setAttribute('aria-label','Detalhes da pendência');}if(detail.parentElement!==layout)layout.append(detail);
  const sourceButtons=$$('[data-inbox-source]',inbox);let origin=$('#dataInboxOrigin',inbox);if(!origin&&sourceButtons.length){const label=document.createElement('label');label.className='u-inbox-origin-control';label.textContent='Origem';origin=document.createElement('select');origin.id='dataInboxOrigin';for(const button of sourceButtons){const o=document.createElement('option');o.value=button.dataset.inboxSource;o.textContent=$('.data-source-label>span',button)?.textContent||'Todas';origin.append(o);}label.append(origin);$('.data-inbox-toolbar',inbox)?.append(label);origin.onchange=()=>{const value=origin.value;sourceButtons.find(b=>b.dataset.inboxSource===value)?.click();origin.value=value;};}const activeSource=sourceButtons.find(b=>b.classList.contains('active'));if(origin&&activeSource)origin.value=activeSource.dataset.inboxSource;
const heading=$('.data-inbox-heading h2',inbox);if(heading?.firstChild?.nodeType===3)heading.firstChild.nodeValue='A tratar ';const rows=$$('[data-inbox-row]',inbox),visible=rows.filter(row=>!row.hidden),selected=visible.find(row=>$('[data-action="review-resolve"]',row)?.dataset.id===state().inboxId)||visible[0];
  for(const row of rows){let summary=$('.u-inbox-summary',row);if(!summary){summary=document.createElement('span');summary.className='u-inbox-summary';$('.data-inbox-description',row)?.append(summary);}summary.textContent=[$('.data-inbox-date',row)?.textContent,$('.data-inbox-source',row)?.textContent].filter(Boolean).join(' · ');let choose=$('[data-inbox-select-record]',row);if(!choose){const title=$('.data-inbox-description>b',row);if(!title)continue;choose=document.createElement('button');choose.type='button';choose.className='u-record-button';choose.dataset.inboxSelectRecord='';choose.textContent=title.textContent;title.replaceWith(choose);}const id=$('[data-action="review-resolve"]',row)?.dataset.id;choose.setAttribute('aria-pressed',String(row===selected));row.classList.toggle('is-selected',row===selected);choose.onclick=()=>{state().inboxId=id;enhanceInbox();};choose.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const at=visible.indexOf(row),next=e.key==='Home'?0:e.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,at+(e.key==='ArrowDown'?1:-1)));state().inboxId=$('[data-action="review-resolve"]',visible[next])?.dataset.id;enhanceInbox();$('[data-inbox-select-record]',visible[next])?.focus();};}
  detail.replaceChildren();const title=document.createElement('h3');title.textContent='Pendência selecionada';detail.append(title);if(!selected){const empty=document.createElement('p');empty.textContent='Sem pendências neste filtro.';detail.append(empty);return;}state().inboxId=$('[data-action="review-resolve"]',selected)?.dataset.id;
  const name=$('[data-inbox-select-record]',selected)?.textContent||'Registo';title.textContent=name;
  const eyebrow=document.createElement('p');eyebrow.className='settings-overline';eyebrow.textContent='Registo selecionado';detail.prepend(eyebrow);
  const amount=$('.data-inbox-value',selected);if(amount){const n=document.createElement('p');n.className='amount u-inbox-amount';n.textContent=amount.textContent;detail.append(n);}
  const meta=document.createElement('dl');meta.className='u-inbox-meta';for(const [label,selector]of [['Data','.data-inbox-date'],['Origem','.data-inbox-source'],['Estado','.data-state']]){const n=$(selector,selected);if(n){const wrap=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=n.textContent;wrap.append(dt,dd);meta.append(wrap);}}detail.append(meta);
  const note=$('.data-inbox-description>small',selected);if(note?.textContent.trim()&&note.textContent.trim()!==name.trim()){const copy=document.createElement('p');copy.className='u-inbox-note';copy.textContent=note.textContent;detail.append(copy);}
  const actions=document.createElement('div');actions.className='u-actions';for(const original of $$('.data-inbox-actions [data-action]',selected)){const action=original.cloneNode(true);action.className=original.dataset.action==='review-resolve'?'primary':'secondary';actions.append(action);}detail.append(actions);
 }
 function dataPage(){
  discoverDataSources();for(const old of $$('.u-attention-switch',dataSources.get('inbox')||document.createElement('div')))old.remove();for(const id of ['settingsBackupGrid','backupReminder']){const n=document.getElementById(id);if(n&&!backupExtras.includes(n))backupExtras.push(n);}const host=$('#dataHub'),s=state();host.classList.add('u-data');let root=$('#unifiedData',host);if(!root){root=document.createElement('div');root.id='unifiedData';root.className='u-task-grid';host.append(root);}
  const edits=readImportEdits();for(const node of dataSources.values())if(node)parked.append(node);const deviceName=$('#backupDeviceName')?.closest('label');if(deviceName&&!backupExtras.includes(deviceName))backupExtras.push(deviceName);for(const node of backupExtras)parked.append(node);
  $$(':scope>.data-hub-head,:scope>.data-hub-tabs,:scope>.data-hub-body',host).forEach(n=>n.hidden=true);
  const pendingImports=PlanningFinance.importWork(data),dtImports=pendingImports.prepared+pendingImports.statementLines;
  const dtInbox=PlanningFinance.reviewInbox(data,month).active.length,personalRules=PracticalFinance.state(data).rules.length,dtRules=personalRules+data.rules.length,dtDocs=(()=>{try{return window.DossiersFinance?.pdfCatalog?DossiersFinance.pdfCatalog(data).length:(data.transactions||[]).filter(t=>t.attachment).length;}catch{return 0;}})();
  const dtQuality=(()=>{try{return LifeFinance.quality(data).score+'%';}catch{return 'OK';}})();
   const taskButton=(task,icon,label,value)=>{
    const active=s.task===task;
    return '<button type="button" class="secondary" data-u-task="'+task+'" aria-current="'+(active?'page':'false')+'">'+I(icon)+'<span>'+label+'</span><small>'+value+'</small></button>';
   };
   root.innerHTML='<header class="dt-head"><h2>Dados</h2></header><nav class="dt-compact-nav" aria-label="Tarefas dos dados">'+taskButton('inbox','alert','A tratar',dtInbox)+taskButton('imports','upload','Importações',dtImports)+taskButton('rules','recurring','Regras',dtRules)+taskButton('documents','document','Comprovativos',dtDocs)+taskButton('quality','shield','Qualidade dos dados',dtQuality)+'</nav><div class="u-task-content"></div>';
  if(!taskItems.some(([id])=>id===s.task))s.task='inbox';if(s.task==='rules')window.PracticalUI?.renderRules();if(s.task==='documents'||s.task==='quality')window.LifeUI?.flushVisible?.();const content=$('.u-task-content',root),node=dataSources.get(s.task);if(node){node.hidden=false;node.classList.add('u-source');content.append(node);}
  if(s.task==='backup')mountBackupSections(content);
  if(s.task==='imports'){renderingImport=true;try{renderReview();WorkflowsUI.render();restoreImportEdits(edits);imports();compactImportExtras();
   const toolbar=document.createElement('nav');
   toolbar.className='eq-design-tabs';toolbar.setAttribute('aria-label','Estado das importações');
   toolbar.innerHTML='<button type="button" class="secondary" data-import-tab="pending">Por rever</button><button type="button" class="secondary" data-import-tab="done">Concluídos</button><button type="button" class="secondary" data-import-tab="ignored">Ignorados</button>';
   const apply=()=>{
    const selected=s.importTab||'pending';
    for(const button of toolbar.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.importTab===selected));
    const review=source('review'), statements=$('#statementWorkbench',review), layout=$('.review-layout',review), extras=$('.u-import-extras',review);
    layout.hidden=selected!=='pending';
    extras.hidden=selected!=='pending';
    if(!statements)return;
    statements.hidden=false;
    const statementContent=$('.complete-content',statements);
    let register=$('.import-statement-register',statements);
    if(!register){
     register=document.createElement('div');register.className='eq-design-split import-statement-register';
     register.innerHTML='<div><label>Pesquisar lote<input type="search" placeholder="Nome do extrato"></label><div class="u-table-scroll"><table class="u-table"><thead><tr><th>Lote</th><th>Linhas</th><th>Data</th></tr></thead><tbody></tbody></table></div></div><div class="import-statement-detail"></div>';
     statementContent.append(register);
    }
    const table=$('tbody',register), search=$('input',register), detail=$('.import-statement-detail',register);
    const entries=[];
    for(const item of $$('.statement-review',statements)){
     const batch=data.statements.find(s=>String(s.id)===item.dataset.statementId);
     const show=row=>selected==='pending'?row.status==='pending':selected==='ignored'?row.status==='ignored':['linked','added'].includes(row.status);
     const matched=(batch?.rows||[]).filter(show).length;
     if(item.parentNode!==detail)detail.append(item);
     if(matched)entries.push({item,batch,matched});
     for(const row of $$('.statement-row',item))row.hidden=!show({status:row.dataset.statementStatus});
     for(const actions of $$('.statement-bulk-actions',item))actions.hidden=selected!=='pending';
    }
    for(const n of $$('.complete-content > .amount',statements))n.hidden=selected!=='pending';
    for(const n of $$('.complete-content > button:not([data-action=undo-statement])',statements))n.hidden=selected!=='pending';
    let message=$('.import-stage-empty',statements);
    if(!message){message=document.createElement('p');message.className='import-stage-empty';statements.append(message);}
    const fill=()=>{
     const q=PracticalFinance.norm(search.value),list=entries.filter(({batch})=>PracticalFinance.norm(batch.name).includes(q));
     const active=list.find(({batch})=>batch.id===s.statementId)||list[0];
     table.replaceChildren();
     for(const item of $$('.statement-review',detail)){item.hidden=item!==active?.item;item.open=!item.hidden;}
     for(const entry of list){
      const tr=table.insertRow(),button=document.createElement('button');
      tr.classList.toggle('is-selected',entry===active);
      button.type='button';button.className='u-record-button';button.textContent=entry.batch.name;
      button.setAttribute('aria-pressed',String(entry===active));
      button.onclick=()=>{s.statementId=entry.batch.id;fill();table.querySelector('[aria-pressed=true]')?.focus();};
      tr.insertCell().append(button);tr.insertCell().textContent=entry.matched;tr.insertCell().textContent=dateLabel(entry.batch.date);
     }
     message.textContent=entries.length?'Nenhum lote corresponde à pesquisa.':'Sem linhas de extrato neste estado.';
     message.hidden=list.length>0;
    };
    search.oninput=fill;fill();
   };
   for(const button of toolbar.querySelectorAll('button'))button.onclick=()=>{s.importTab=button.dataset.importTab;apply();};
   content.prepend(toolbar);apply();
   if(dtImports){
    const clear=document.createElement('button');
    clear.type='button';clear.className='secondary dt-clear-imports';
    clear.textContent='Retirar pendentes ('+dtImports+')';
    clear.onclick=()=>confirmAction('Retirar pendentes de importação',
     'Registos preparados a retirar: '+pendingImports.prepared+'. Linhas de extrato a marcar como ignoradas: '+pendingImports.statementLines+'. Os movimentos registados e as associações existentes são preservados.',
     ()=>{
      data.pendingImports=[];
      for(const statement of data.statements)for(const row of statement.rows)if(row.status==='pending')row.status='ignored';
     });
    toolbar.append(clear);
   }}finally{renderingImport=false;}}
  bindTaskNavigation(root,'data-u-task',id=>{s.task=id;dataPage();});
  InterfaceUI.collectHelp(root);
  enhanceInbox();
  window.ReceiptAssistanceUI?.render();
 }
 function compactImportExtras(){const review=source('review');let extra=$('.u-import-extras',review);if(!extra){extra=document.createElement('details');extra.className='u-import-extras';extra.innerHTML='<summary>Histórico, transferências e extratos guardados</summary>';review.append(extra);}for(const node of $$(':scope>.panel:not(#statementWorkbench)',review))extra.append(node);}
 function readImportEdits(){const s=state();const batch=JSON.stringify(data.pendingImports);if(s.importBatch!==batch){s.importBatch=batch;s.importEdits=new Map();return s.importEdits;}const categories=new Map($$('[data-import-category]').map(n=>[n.dataset.importCategory,n.value])),beneficiaries=new Map($$('[data-import-beneficiary]').map(n=>[n.dataset.importBeneficiary,n.value]));for(const check of $$('[data-import-check]')){const id=check.dataset.importCheck;s.importEdits.set(id,{checked:check.checked,category:categories.get(id),beneficiary:beneficiaries.get(id)});}return s.importEdits;}
 function restoreImportEdits(edits){const categories=new Map($$('[data-import-category]').map(n=>[n.dataset.importCategory,n])),beneficiaries=new Map($$('[data-import-beneficiary]').map(n=>[n.dataset.importBeneficiary,n]));for(const check of $$('[data-import-check]')){const row=edits.get(check.dataset.importCheck);if(!row)continue;if(!check.disabled)check.checked=row.checked;if(categories.has(check.dataset.importCheck)&&row.category!==undefined)categories.get(check.dataset.importCheck).value=row.category;if(beneficiaries.has(check.dataset.importCheck)&&row.beneficiary!==undefined)beneficiaries.get(check.dataset.importCheck).value=row.beneficiary;}updateImportSelection();}
 function imports(){
  const root=$('#reviewTable');if(!root)return;const rows=$$('.import-row',root);if(!rows.length)return;
  const s=state(),selected=rows.find(n=>$('[data-import-check]',n)?.dataset.importCheck===s.importId)||rows[0];s.importId=$('[data-import-check]',selected)?.dataset.importCheck||'';
  const grid=document.createElement('div');grid.className='u-import-grid';grid.innerHTML='<div class="u-table-scroll"><table class="u-table"><thead><tr><th><span class="sr-only">Selecionar</span></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Estado</th></tr></thead><tbody></tbody></table></div><aside class="panel u-import-inspector"><h3>Linha selecionada</h3><div></div></aside>';
  const tbody=$('tbody',grid),detail=$('.u-import-inspector>div',grid);
  const select=row=>{for(const tr of $$('tr[data-u-import]',grid)){tr.classList.toggle('is-selected',tr.dataset.uImport===row.dataset.importId);$('.u-record-button',tr).setAttribute('aria-pressed',String(tr.dataset.uImport===row.dataset.importId));}for(const label of $$('.u-import-inspector [data-original-row]',grid)){const original=rows.find(n=>n.dataset.importId===label.dataset.originalRow);original?.append(label);}detail.replaceChildren();s.importId=row.dataset.importId;const tx=data.pendingImports.find(t=>String(t.id)===s.importId);if(!tx)return;detail.innerHTML='<p>'+dateLabel(tx.date)+'</p><h4>'+esc(tx.description)+'</h4><p class="amount">'+eur(tx.amount)+' · '+esc(tx.account)+'</p><p><small>Categoria original do ficheiro</small><br>'+esc(tx.importOriginalCategory||tx.category||'Não indicada')+'</p>';for(const field of $$(':scope>label.import-review-field,:scope>.import-review-splits,:scope>.import-comparison',row)){field.dataset.originalRow=row.dataset.importId;detail.append(field);}if(!$('.import-comparison',detail))detail.insertAdjacentHTML('beforeend','<p class="u-import-status" role="status">'+esc($('.import-status',row)?.textContent||'Novo movimento')+'</p>');};
  for(const row of rows){const check=$('[data-import-check]',row),tx=data.pendingImports.find(t=>String(t.id)===check?.dataset.importCheck);if(!tx)continue;row.dataset.importId=String(tx.id);const tr=document.createElement('tr');tr.dataset.uImport=String(tx.id);tr.innerHTML='<td></td><td>'+dateLabel(tx.date)+'</td><td><button type="button" class="u-record-button">'+esc(tx.description)+'</button><div class="u-import-original"></div></td><td class="u-import-category">'+esc(tx.splits?.length?tx.splits.length+' parcelas':tx.category)+'</td><td class="amount '+esc(tx.type)+'">'+(tx.type==='expense'?'−':'')+eur(tx.amount)+'</td><td>'+esc($('.import-status',row)?.textContent||'Novo')+'</td>';tr.cells[0].append(check);$('.u-import-original',tr).append(row);tbody.append(tr);$('.u-record-button',tr).onclick=()=>select(row);tr.onclick=e=>{if(!e.target.closest('input,button,select,summary'))select(row);};row.addEventListener('input',e=>{if(e.target.matches('[data-import-category]'))$('.u-import-category',tr).textContent=e.target.value;});}
  root.replaceChildren(grid);select(selected);grid.addEventListener('keydown',e=>{if(!e.target.matches('.u-record-button')||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const list=$$('tr[data-u-import]',grid),index=list.indexOf(e.target.closest('tr')),next=e.key==='Home'?0:e.key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,index+(e.key==='ArrowDown'?1:-1)));const row=rows.find(r=>r.dataset.importId===list[next].dataset.uImport);select(row);$('.u-record-button',list[next]).focus();});
 }
 const settingsNodes=new Map();
 function discoverSettings(){
  if(settingsNodes.size)return;const host=$('#settings');
  for(const child of $$('.settings-grid>*,:scope>section.panel,:scope>article.panel,:scope>details',host)){
   const node=child.matches('details.settings-disclosure')?child.querySelector(':scope>article.panel,:scope>section.panel'):child;
   if(child.matches('details.settings-disclosure'))parked.append(child);
   if(!node||!node.textContent.trim())continue;
   if(node.id==='desktopAboutPanel')continue;
   if(node.id==='fileProtection'){parked.append(node);continue;}
   if(node.id==='maintenanceDataPanel'||$('#backupSettings',node)||node.id==='spacesPortability')continue;
   const text=node.textContent;
   if(/Atalhos|Perguntas frequentes|Como funciona|Configuração inicial/.test(text)){
    parked.append(node);continue;
   }
   const topic=node.id==='providerIconSettings'||$('#providerIconSettings',node)?'icons':$('.settings-reset-actions',node)?'reset':$('#profileName',node)?'general':/aparência|apresentação|tema|contraste|escala|tamanho|colunas|densidade/i.test(text)?'appearance':/espaços/i.test(text)?'spaces':/categorias|beneficiários/i.test(text)?'categories':'general';
   if(!settingsNodes.has(topic))settingsNodes.set(topic,[]);settingsNodes.get(topic).push(node);
  }
 }
 document.addEventListener('click',e=>{if(e.target.closest('#privacyToggle'))$('#settingsPrivacy')?.setAttribute('aria-checked',String(document.body.classList.contains('private-values')));});
 function appearanceControls(body){
  const p=data.presentation||{theme:'light',density:'comfortable',hiddenMetrics:[]},root=document.createElement('section');root.className='settings-presentation-rows';
  root.innerHTML=[['theme','Tema do programa','Escolhe o fundo que te deixa mais confortável.',[['light','Claro'],['dark','Escuro']]],['density','Densidade da informação','Mais espaço entre elementos ou mais registos à vista.',[['comfortable','Confortável'],['compact','Compacta']]]].map(([field,label,copy,options])=>'<div class="setting-row"><div><h3>'+label+'</h3><p>'+copy+'</p></div><div class="settings-segments" role="group" aria-label="'+label+'">'+options.map(([value,text])=>'<button type="button" data-setting-field="'+field+'" data-setting-value="'+value+'" aria-pressed="'+(p[field]===value)+'">'+text+'</button>').join('')+'</div></div>').join('')+'<div class="setting-row"><div><h3>Ocultar valores nesta sessão</h3><p>O mesmo controlo do olho e do ecrã de entrada. Não altera os dados.</p></div><button type="button" id="settingsPrivacy" role="switch" aria-label="Ocultar valores nesta sessão" aria-checked="'+document.body.classList.contains('private-values')+'"><span></span></button></div>';
  body.prepend(root);for(const b of $$('[data-setting-field]',root))b.onclick=()=>{const field=b.dataset.settingField,value=b.dataset.settingValue;if(!({theme:['light','dark'],density:['comfortable','compact']}[field]||[]).includes(value))return;commit(()=>{data.presentation={...(data.presentation||{theme:'light',density:'comfortable',hiddenMetrics:[]}),[field]:value};});$('[data-setting-field="'+field+'"][data-setting-value="'+value+'"]')?.focus();};
  $('#settingsPrivacy',root).onclick=()=>{$('#privacyToggle').click();$('#settingsPrivacy')?.setAttribute('aria-checked',String(document.body.classList.contains('private-values')));};
  const advanced=$('[data-action="life-presentation"]',body);if(advanced)advanced.textContent='Indicadores do Resumo';
 }
 function mountBackupSections(body){
  const automatic=$('#fileProtection'),manual=dataSources.get('backup'),reminder=$('#backupReminder'),
    history=$('#backupCenter'),encrypted=$('#encryptedBackupCard'),device=$('#backupDeviceName')?.closest('label');
  if(automatic){
   automatic.hidden=false;
   body.append(automatic);
   if(device)automatic.append(device);
   if(reminder)automatic.append(reminder);
  }
  if(manual){
   manual.hidden=false;
   body.append(manual);
   if(history)manual.append(history);
   if(encrypted)manual.append(encrypted);
  }
  FeatureUI.renderBackupReminder();
 }
 function settings(){
  discoverSettings();discoverDataSources();for(const nodes of settingsNodes.values())for(const node of nodes)parked.append(node);for(const id of ['settingsBackupGrid','backupReminder']){const n=document.getElementById(id);if(n&&!backupExtras.includes(n))backupExtras.push(n);}for(const topic of ['backup','update']){const node=dataSources.get(topic);if(node)parked.append(node);}const deviceName=$('#backupDeviceName')?.closest('label');if(deviceName&&!backupExtras.includes(deviceName))backupExtras.push(deviceName);for(const node of backupExtras)parked.append(node);
  const host=$('#settings'),s=state();host.classList.add('u-settings');let root=$('#unifiedSettings',host);if(!root){root=document.createElement('div');root.id='unifiedSettings';host.prepend(root);}root.className='u-settings-overview u-settings-workspace';$$(':scope>.section-head,:scope>.settings-grid',host).forEach(n=>n.hidden=true);
  const groups=[['general','O teu espaço','Perfil e espaços financeiros.',['general','spaces','reset']],['appearance','Utilização e aparência','Tema, privacidade, categorias e ícones.',['appearance','categories','icons']],['backup','Backup e Atualização','Guardar, recuperar e atualizar.']];
  root.innerHTML='<aside class="u-task-nav"><h2>Definições</h2><nav class="u-settings-jumps" aria-label="Grupos das definições">'+groups.map(([id,label,copy])=>'<button type="button" class="secondary st-nav" data-u-settings="'+id+'">'+I({general:'account',appearance:'palette',backup:'shield',guides:'help'}[id]||'gear')+'<span><b>'+label+'</b><small>'+copy+'</small></span></button>').join('')+'</nav></aside><div class="u-settings-content"></div>';
  for(const [id,label,copy,topics]of groups){const section=document.createElement('section');section.className='settings-topic-group';section.dataset.settingsGroup=id;const details=document.createElement('div');details.className='settings-group-details';details.innerHTML='<header class="settings-page-heading"><span class="settings-overline">Preferências</span><h2>'+label+'</h2><p>'+copy+'</p></header><div class="settings-topic-cards"></div>';section.append(details);$('.u-settings-content',root).append(section);const body=$('.settings-topic-cards',details);const append=node=>{if(!node)return;node.hidden=false;body.append(node);};
   if(id==='backup'){
    mountBackupSections(body);
    const update=dataSources.get('update');
    if(update){
     for(const command of $$('#exportData,#importData',update))command.hidden=true;
     append(update);

    }
   }
   else for(const topic of topics||[])for(const node of settingsNodes.get(topic)||[]){if(topic==='reset')$('details',node)?.setAttribute('open','');append(node);}
   if(id==='appearance'){appearanceControls(body);if($('.beneficiary-settings')?.open)window.LifeUI?.renderBeneficiaries?.();}
  }
  const select=id=>{id=id==='icons'||id==='categories'?'appearance':id==='spaces'?'general':id==='update'?'backup':['help','guides'].includes(id)?'general':id;s.settings=id;for(const group of $$('[data-settings-group]',root)){group.hidden=group.dataset.settingsGroup!==id;}};
  bindTaskNavigation(root,'data-u-settings',id=>{s.settings=id;select(id);for(const button of $$('[data-u-settings]',root))button.setAttribute('aria-current',button.dataset.uSettings===id?'page':'false');});for(const button of $$('[data-u-settings]',root))button.setAttribute('aria-current',button.dataset.uSettings===s.settings?'page':'false');
  select(s.settings||'general');for(const button of $$('[data-u-settings]',root))button.setAttribute('aria-current',button.dataset.uSettings===s.settings?'page':'false');InterfaceUI.collectHelp(root);
  if(s.focusUpdate){s.focusUpdate=false;select('backup');$('#maintenanceDataPanel',root)?.scrollIntoView({block:'start'});}
 }
 function subscriptions(){
  const dialog=$('#subscriptionsManagerDialog');if(!dialog?.open)return;const s=state(),body=$('.plan-manager-body',dialog),preview=$('#agendaSubscriptionsPreview');
  if(preview&&!preview.parentElement?.matches('#unifiedSources'))parked.append(preview);
  let root=$('#unifiedSubscriptions',dialog);if(!root){root=document.createElement('div');root.id='unifiedSubscriptions';body.append(root);}const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),all=data.subscriptions.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt')),rows=all.filter(a=>(s.subStatus==='all'||s.subStatus==='active'&&a.status!=='cancelled'||s.subStatus==='cancelled'&&a.status==='cancelled')&&normalize(a.name).includes(normalize(s.subSearch))),selected=rows.find(r=>String(r.id)===s.subId)||rows[0];s.subId=String(selected?.id||'');
  const activeSubs=all.filter(a=>a.status!=='cancelled');
  const monthlyEq=F.money(activeSubs.reduce((n,a)=>n+(a.frequency==='yearly'?Number(a.amount||0)/12:Number(a.amount||0)),0));
  const annualEq=F.money(activeSubs.reduce((n,a)=>n+(a.frequency==='yearly'?Number(a.amount||0):Number(a.amount||0)*12),0));
  const drawSubRowsAndDetail=(list,sel)=>{
   const wrap=$('#unifiedSubTableWrap',root);
   if(wrap)wrap.innerHTML='<div class="u-table-scroll"><table class="u-table"><thead><tr><th>Serviço</th><th>Valor</th><th>Próxima cobrança</th><th>Estado</th></tr></thead><tbody>'+list.map(r=>'<tr data-u-sub="'+esc(r.id)+'" class="'+(String(r.id)===s.subId?'is-selected':'')+'"><td><button type="button" class="u-record-button provider-name" aria-pressed="'+(String(r.id)===s.subId)+'">'+ProviderIcons.html(r.name)+'<span>'+esc(r.name)+'</span></button></td><td class="amount"><b>'+eur(r.amount)+'</b><small class="muted">'+(r.frequency==='yearly'?'/ano':'/mês')+'</small></td><td>'+(r.status==='cancelled'?'—':dateLabel(r.nextDate))+'</td><td><span class="sub-status-pill status-'+esc(r.status||'active')+'">'+esc({active:'Ativa',trial:'Experimental',cancelled:'Cancelada'}[r.status]||'Ativa')+'</span></td></tr>').join('')+'</tbody></table></div>'+(!list.length?'<p class="u-empty">Sem serviços registados neste filtro.</p>':'');
   const detail=$('.u-sub-detail',root);if(detail&&sel){const a=sel;const prices=new Map();for(const p of a.prices||[])if(F.validDate(p.date)&&Number.isFinite(+p.amount))prices.set(p.date+'|'+F.cents(p.amount),{date:p.date,amount:+p.amount});for(const t of data.transactions.filter(t=>t.type==='expense'&&String(t.subscriptionId||'')===String(a.id)))prices.set(t.date+'|'+F.cents(t.amount),{date:t.date,amount:t.amount});const history=[...prices.values()].sort((a,b)=>b.date.localeCompare(a.date));detail.innerHTML='<div class="u-sub-title">'+ProviderIcons.html(a.name)+'<div class="u-sub-title-copy"><h3>'+esc(a.name)+'</h3><strong class="amount">'+eur(a.amount)+' <small>'+(a.frequency==='yearly'?'/ ano':'/ mês')+'</small></strong></div><span class="sub-status-pill status-'+esc(rStatus(a))+'">'+esc({active:'Ativa',trial:'Experimental',cancelled:'Cancelada'}[a.status]||'Ativa')+'</span></div><dl class="u-sub-meta-grid"><div><dt>Conta de débito</dt><dd>'+esc(a.account||'Não indicada')+'</dd></div><div><dt>Categoria</dt><dd>'+esc(a.category||'Subscrições')+'</dd></div><div><dt>Próxima cobrança</dt><dd>'+(a.status==='cancelled'?'Não agendada':dateLabel(a.nextDate))+'</dd></div><div><dt>Utilização</dt><dd>'+esc(a.usage||'Por indicar')+'</dd></div></dl><div class="u-actions u-sub-primary-actions">'+cmd('Editar serviço','life-subscription',a.id,true)+cmd('Rever utilização','plan-usage',a.id)+(a.status!=='cancelled'?cmd('Cancelar subscrição','life-cancel-subscription',a.id):'')+cmd('Apagar serviço','life-delete-subscription',a.id)+'</div><div class="u-sub-history-section"><h4>Histórico de preços e cobranças</h4>'+(history.length?'<div class="u-table-scroll u-sub-history-scroll"><table class="u-table"><thead><tr><th>Data</th><th>Valor</th></tr></thead><tbody>'+history.slice(0,12).map(p=>'<tr><td>'+dateLabel(p.date)+'</td><td class="amount">'+eur(p.amount)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="u-sub-empty-history">Ainda sem cobranças associadas a este serviço.</p>')+'<div class="u-actions u-sub-secondary-actions">'+cmd('Associar movimentos','life-subscription-history',a.id)+cmd('Histórico completo','recurring-history','subscription~'+a.id)+'</div></div>';}else if(detail){detail.innerHTML='<div class="u-sub-empty-detail"><h3>Nenhum serviço selecionado</h3><p>Seleciona uma subscrição na lista à esquerda ou adiciona um novo serviço para gerir cobranças, utilização e histórico de preços.</p></div>';}
   bindRows(root,'data-u-sub',id=>{s.subId=id;const nextSel=list.find(r=>String(r.id)===id)||list[0];for(const el of $$('[data-u-sub]',root)){const on=el.dataset.uSub===String(id);el.classList.toggle('is-selected',on);$('.u-record-button',el)?.setAttribute('aria-pressed',String(on));}drawSubRowsAndDetail(list,nextSel);});
  };
  root.innerHTML='<div class="u-sub-kpis"><article class="u-sub-kpi"><span>Subscrições ativas</span><strong>'+activeSubs.length+'</strong><small>'+(all.length-activeSubs.length)+' cancelada(s)</small></article><article class="u-sub-kpi"><span>Encargo mensal equivalente</span><strong class="amount">'+eur(monthlyEq)+'</strong><small>Média mensal dos serviços ativos</small></article><article class="u-sub-kpi"><span>Encargo anual estimado</span><strong class="amount">'+eur(annualEq)+'</strong><small>Projeção a 12 meses</small></article></div><div class="u-sub-grid"><section class="u-sub-list"><div class="u-filter-bar"><input id="unifiedSubSearch" type="search" aria-label="Pesquisar serviço" placeholder="Pesquisar serviço…" value="'+esc(s.subSearch)+'"><div class="u-sub-filter-pills">'+[['active','Ativas ('+activeSubs.length+')'],['cancelled','Canceladas ('+(all.length-activeSubs.length)+')'],['all','Todas ('+all.length+')']].map(([id,label])=>'<button type="button" data-u-sub-status="'+id+'" class="secondary '+(s.subStatus===id?'active':'')+'" aria-pressed="'+(s.subStatus===id)+'">'+label+'</button>').join('')+'</div></div><div id="unifiedSubTableWrap"></div></section><aside class="u-sub-detail"></aside></div>';
  let add=$('[data-u-sub-add]',$('.plan-manager-head',dialog));if(!add){add=document.createElement('button');add.type='button';add.className='primary';add.dataset.uSubAdd='true';add.innerHTML=I('plus')+'Adicionar subscrição';add.onclick=()=>actions['life-subscription']();$('.plan-manager-head .plan-manager-close',dialog).before(add);}
  const head=$('.plan-manager-head',dialog)||$('header',dialog);if(head){head.querySelector('.u-sub-head-filters')?.remove();const filters=$('.u-filter-bar',root);filters.classList.add('u-sub-head-filters');head.append(filters);}
  drawSubRowsAndDetail(rows,selected);
  for(const b of $$('[data-u-sub-status]',dialog))b.onclick=()=>{s.subStatus=b.dataset.uSubStatus;subscriptions();};$('#unifiedSubSearch',dialog).oninput=e=>{s.subSearch=e.target.value;const nextRows=all.filter(a=>(s.subStatus==='all'||s.subStatus==='active'&&a.status!=='cancelled'||s.subStatus==='cancelled'&&a.status==='cancelled')&&normalize(a.name).includes(normalize(s.subSearch))),nextSel=nextRows.find(r=>String(r.id)===s.subId)||nextRows[0];s.subId=String(nextSel?.id||'');drawSubRowsAndDetail(nextRows,nextSel);};
 }
 function rStatus(a){return a?.status||'active';}
 function agenda(){for(const [id,handler] of [['addTransaction3',()=>pendingForm()],['manageRecurring',()=>recurringForm()],['addSalaryRecurring',()=>FeatureUI.recurring('__salary__')]]){const b=document.getElementById(id);if(b)b.onclick=handler;}const services=$('#agendaMonthServices'),sidebar=$('#planner .planner-agenda-sidebar');if(services&&sidebar)sidebar.append(services);if(services){const rows=$$('tbody tr',services);let total=$('.u-services-total',services);if(!total){total=document.createElement('div');total.className='u-services-total';services.append(total);}const forecast=ExperienceFinance.agenda(data,schedule({includeCompletedGenerated:true}),month,'all'),sum=F.money(forecast.rows.filter(p=>p.source==='subscription'||p.subscriptionId).reduce((n,p)=>n+p.amount,0));total.innerHTML='<span>Total previsto no mês</span><strong class="amount">'+eur(sum)+'</strong>';services.classList.add('u-services-card');} }
 function compose(){if(composing||window.equilibrioStartup?.awaitingChoice)return;composing=true;try{navigation();if(view==='weeklyHub')review();if(view==='plansHub')plans();if(view==='wealthMoneyHub')inventory();if(view==='dataHub')dataPage();if(view==='settings')settings();if(view==='planner')agenda();subscriptions();}finally{composing=false;}}
 const oldReview=renderReview;renderReview=()=>{const edits=readImportEdits();oldReview();restoreImportEdits(edits);if(!renderingImport&&view==='dataHub'&&state().task==='imports'){imports();compactImportExtras();}};
 const oldNavigate=navigate;navigate=(v,skip=false)=>{if(!skip)readImportEdits();InterfaceUI.beginRender();try{oldNavigate(canonical(v),skip);}finally{InterfaceUI.endRender();}};
 UILifecycle.register('unified-prepare',{beforeRender:ctx=>{restorePlanPortals();readImportEdits();park();ctx.unifiedTask=state().task;ctx.unifiedNested=composing;composing=true;return()=>{composing=ctx.unifiedNested;};},beforeNavigation:ctx=>{restorePlanPortals();readImportEdits();ctx.unifiedTask=state().task;}},5);
 UILifecycle.register('unified',{afterRender:ctx=>{if(view==='dataHub'&&ctx.unifiedTask)state().task=ctx.unifiedTask;composing=ctx.unifiedNested;compose();},afterNavigation:ctx=>{if(ctx.args[0]==='dataHub')state().task=ctx.unifiedTask;compose();}},20);
 
 const oldDataShow=DataHub.show;DataHub.show=(task,focus=false)=>{if(['backup','update'].includes(task)){state().settings='backup';state().focusUpdate=task==='update';navigate('settings');if(focus)$('[data-u-settings="'+task+'"]')?.focus({preventScroll:true});return;}if(['inbox','quality'].includes(task))oldDataShow(task,false);state().task=task==='rules'||task==='quality'?task:'inbox';if(view==='dataHub')dataPage();if(focus)$('[data-u-task="'+state().task+'"]')?.focus({preventScroll:true});};
 const oldOpen=PlanningManagerUI.openSubscriptions;window.PlanningManagerUI=Object.freeze({...PlanningManagerUI,openSubscriptions:()=>{oldOpen();subscriptions();}});
 document.addEventListener('input',e=>{if(e.target.matches('[data-import-category],[data-import-beneficiary]')){readImportEdits();if(e.target.matches('[data-import-category]')){const row=$$('tr[data-u-import]').find(r=>r.dataset.uImport===e.target.dataset.importCategory);if(row)$('.u-import-category',row).textContent=e.target.value;}}});document.addEventListener('change',e=>{if(e.target.matches('[data-import-check]'))readImportEdits();});
 document.addEventListener('click',e=>{const record=e.target.closest('[data-u-open-record]');if(record){state().wealthId=record.dataset.uOpenRecord;state().wealthKind='all';navigate('wealthMoneyHub');return;}const route=e.target.closest('[data-u-route]');if(route){const target=route.dataset.uRoute;if(['categories','payees'].includes(target)){state().settings='appearance';navigate('settings');const node=target==='categories'?$('#categoryWorkbench'):$('.beneficiary-settings');for(let parent=node;parent&&parent!==document.body;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;node?.scrollIntoView({block:'start'});node?.querySelector('button,input')?.focus({preventScroll:true});return;}navigate(target);return;}if(e.target.closest('[data-u-help]'))InterfaceUI.openHelp();const cat=e.target.closest('[data-u-category]');if(cat){const entries=F.expenseEntries(data,month).filter(t=>F.categoryMatches(t.category,cat.dataset.uCategory));form('Movimentos · '+cat.dataset.uCategory,'<div class="ex-list">'+entries.map(t=>'<div class="attention-row"><span>'+dateLabel(t.date)+' · '+esc(t.description)+(t.splitNote?'<small>'+esc(t.splitNote)+'</small>':'')+'</span><b class="amount">'+eur(t.amount)+'</b>'+cmd('Abrir','edit-tx',t.transactionId||t.id)+'</div>').join('')+'</div>',()=>true,'','Fechar');}const m=e.target.closest('[data-u-month]');if(m){month=m.dataset.uMonth;$('#monthPicker').value=month;render();}});
 function openRecord(kind,id){
  const s=state(),wealth={Conta:'account',Crédito:'debt',Bem:'asset',Investimento:'investment'},plan={Objetivo:'goal',Reserva:'reserve',Orçamento:'budget'};
  if(wealth[kind]){const target=wealth[kind]+':'+id;if(!inventoryRecords().some(r=>r.id===target))return false;s.wealthKind='all';s.wealthSearch='';s.wealthId=target;navigate('wealthMoneyHub');return true;}
  if(plan[kind]){const target=plan[kind]+':'+id;if(!planRecords().some(r=>r.id===target))return false;s.planKind='all';s.planQuery='';s.planPane='records';s.planId=target;navigate('plansHub');return true;}
  if(kind==='Veículo'||kind==='Habitação'){
   const ui=window.DossiersUI;
   const vehicle=kind==='Veículo';
   if(!ui||!(data.practical?.[vehicle?'vehicles':'housing']||[]).some(r=>String(r.id)===String(id)))return false;
   navigate(vehicle?'casaVehicles':'casaHousing');
   (vehicle?ui.vehicleForm:ui.housingForm)(id);
   return true;
  }
  if(kind==='Subscrição'){if(!data.subscriptions.some(r=>String(r.id)===String(id)))return false;s.subId=String(id);s.subSearch='';s.subStatus='all';navigate('planner');PlanningManagerUI.openSubscriptions();return true;}
  return false;
 }
 $('#planManagerDialog')?.addEventListener('close',()=>{if(view==='plansHub')plans();});
 window.UnifiedWorkspaceUI=Object.freeze({enhanceInbox,render:compose,refreshAgenda:agenda,dataTask:()=>state().task,splitPeriod,canonical,inventoryRecords,planRecords,openRecord});

 discoverDataSources();for(const id of ['settingsBackupGrid','backupReminder']){const n=document.getElementById(id);if(n){backupExtras.push(n);parked.append(n);}}park();if(!window.equilibrioStartup?.awaitingChoice)navigate(view);
 // Scripts loaded after this one redraw the legacy area tabs; compose once more when all are loaded.
 window.addEventListener('load',()=>{if(!window.equilibrioStartup?.awaitingChoice)compose();},{once:true});
})();
