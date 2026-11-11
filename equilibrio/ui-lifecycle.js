/* Final presentation owners register here instead of wrapping one another.
   Older domain renderers stay behind the single compatibility boundary. */
(() => {
  'use strict';
  const owners = new Map(), counts = {}, original = { render: PremiumUI.render, navigation: PremiumUI.navigation };
  function register(id, hooks, priority = 0) {
    if (owners.has(id)) throw Error('Dono de interface repetido: ' + id);
    owners.set(id,{id,hooks,priority});
  }
  function invoke(method,args,replacement) {
    const context={method,args}, cleanups=[], ordered=[...owners.values()].sort((a,b)=>a.priority-b.priority);
    const suffix=method==='render'?'Render':'Navigation';
    try {
      for (const owner of ordered) {
        const cleanup=owner.hooks['before'+suffix]?.(context);
        if(typeof cleanup==='function')cleanups.push(cleanup);
      }
      const result=(replacement||original[method])?.(...args);
      for(const owner of ordered){const fn=owner.hooks['after'+suffix];if(fn){fn(context);const name=owner.id+':'+method;counts[name]=(counts[name]||0)+1;}}
      return result;
    } finally { for(const cleanup of cleanups.reverse())cleanup(); }
  }
  PremiumUI.render=(...args)=>invoke('render',args);
  PremiumUI.navigation=(...args)=>invoke('navigation',args);
  /* Gravações feitas numa página da Casa que não mexem em contas nem movimentos:
     redesenha só a Casa e os donos finais; o resto fica para quando se sai da Casa. */
  const renderLight=()=>invoke('render',[],()=>window.CasaRenderUI?.refresh());
  window.UILifecycle=Object.freeze({register,renderLight,owners:()=>[...owners.keys()],counts:()=>({...counts})});
})();
