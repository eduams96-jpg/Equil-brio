/* Final presentation owners register here instead of wrapping one another.
   Older domain renderers stay behind the single compatibility boundary. */
(() => {
  'use strict';
  const owners = new Map(), counts = {}, original = { render: PremiumUI.render, navigation: PremiumUI.navigation };
  function register(id, hooks, priority = 0) {
    if (owners.has(id)) throw Error('Dono de interface repetido: ' + id);
    owners.set(id,{id,hooks,priority});
  }
  function invoke(method,args) {
    const context={method,args}, cleanups=[], ordered=[...owners.values()].sort((a,b)=>a.priority-b.priority);
    const suffix=method==='render'?'Render':'Navigation';
    try {
      for (const owner of ordered) {
        const cleanup=owner.hooks['before'+suffix]?.(context);
        if(typeof cleanup==='function')cleanups.push(cleanup);
      }
      const result=original[method]?.(...args);
      for(const owner of ordered){const fn=owner.hooks['after'+suffix];if(fn){fn(context);const name=owner.id+':'+method;counts[name]=(counts[name]||0)+1;}}
      return result;
    } finally { for(const cleanup of cleanups.reverse())cleanup(); }
  }
  PremiumUI.render=(...args)=>invoke('render',args);
  PremiumUI.navigation=(...args)=>invoke('navigation',args);
  window.UILifecycle=Object.freeze({register,owners:()=>[...owners.keys()],counts:()=>({...counts})});
})();
