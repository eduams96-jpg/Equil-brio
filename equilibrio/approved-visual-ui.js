/* Estrutura dos visuais aprovados; os editores e os cálculos mantêm os seus donos. */
(() => {
  'use strict';
  const topbar = document.getElementById('appTopbar'), nav = topbar.querySelector('.top-primary-nav');
  const tools = topbar.querySelector('.topbar-tools'), context = tools.querySelector('.top-context-controls');
  const privacy = document.getElementById('privacyToggle');
  context.insertBefore(privacy, context.querySelector('.top-settings-button'));
  tools.prepend(document.getElementById('topSearchSlot'));
  const menu = document.createElement('button'); menu.type = 'button'; menu.id = 'topNavigationToggle';
  menu.className = 'secondary'; menu.textContent = '☰'; menu.setAttribute('aria-label', 'Abrir navegação');
  nav.id = 'topPrimaryNavigation'; menu.setAttribute('aria-controls', nav.id); menu.setAttribute('aria-expanded', 'false');
  topbar.querySelector('.top-brand').after(menu);
  menu.onclick = () => { const open = topbar.classList.toggle('navigation-open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Fechar navegação' : 'Abrir navegação'); };
  nav.addEventListener('click', () => { topbar.classList.remove('navigation-open'); menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Abrir navegação'); });
  topbar.addEventListener('keydown', event => { if (event.key === 'Escape' && topbar.classList.contains('navigation-open')) { topbar.classList.remove('navigation-open'); menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Abrir navegação'); menu.focus(); } });
  const planner = document.getElementById('planner'), summary = document.createElement('div');
  summary.className = 'approved-planning-metrics'; summary.id = 'agendaSummary';
  planner.querySelector('.planner-agenda-head').after(summary);
  const forecast = planner.querySelector('.planner-forecast-card'); summary.append(forecast);
  planner.querySelector('.planner-agenda-head').append(document.getElementById('addTransaction3'));
  const head=planner.querySelector('.planner-agenda-head'),actions=document.createElement('div');actions.className='agenda-primary-actions';head.append(actions);
  actions.append(document.getElementById('addTransaction3'));
  const recurring=planner.querySelector('.planner-recurring-actions');if(recurring){actions.append(...recurring.children);recurring.remove();}
  planner.querySelector('.planner-insights-card')?.remove();
  const tabs = document.querySelector('.area-tabs'), original = document.createComment('Separadores das outras áreas');
  tabs.before(original);
  function placeTabs() {
    if(view==='transactions'){
      document.querySelector('#transactions .movements-hero-actions').prepend(tabs);
      tabs.hidden=false;
    }else original.after(tabs);
    window.InterfaceUI?.refresh();
  }
  const priorNavigation = PremiumUI.navigation;
  PremiumUI.navigation = v => { priorNavigation(v); placeTabs(); };
  placeTabs();
})();
