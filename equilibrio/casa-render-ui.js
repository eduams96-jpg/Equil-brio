(() => {
  'use strict';
  // A ordem é explícita: os módulos finais enriquecem o DOM dos anteriores.
  const modules = ['CasaUI', 'CasaHomeUI', 'CasaCatalogUI', 'CasaLifeUI',
    'CasaDailyUI', 'CasaCompleteUI', 'CasaShoppingUI'];
  const rendered = new Map();
  const owners = { casaHome:['CasaHomeUI'], casaPurchases:['CasaUI'], casaProducts:['CasaCatalogUI','CasaCompleteUI'], casaStores:['CasaCatalogUI'], casaStock:['CasaLifeUI','CasaDailyUI','CasaCompleteUI'], casaRecipes:['CasaLifeUI','CasaDailyUI'], casaMeals:['CasaLifeUI','CasaDailyUI','CasaCompleteUI'], casaPrices:['CasaLifeUI'], casaAnalytics:['CasaDailyUI'], casaShopping:['CasaShoppingUI'] };
  const counts = {};
  function renderCasa() {
    if (!view?.startsWith('casa')) return;
    for (const name of owners[view] || []) { window[name]?.render(view); counts[name]=(counts[name]||0)+1; }
    rendered.set(view,{data,key});
  }
  const previousRender = PremiumUI.render;
  PremiumUI.render = () => { previousRender?.(); rendered.clear(); renderCasa(); };
  const previousNavigation = PremiumUI.navigation;
  PremiumUI.navigation = v => {
    previousNavigation?.(v);
    if (!v?.startsWith('casa')) return;
    const last=rendered.get(v);if(last?.data===data&&last.key===key)return;
    renderCasa();
  };
  window.CasaRenderUI = Object.freeze({ render: renderCasa, refresh: () => { rendered.clear(); renderCasa(); }, lightView: v => Boolean(owners[v]) || v === 'casaConsumos', modules: Object.freeze(modules), counts });
})();
