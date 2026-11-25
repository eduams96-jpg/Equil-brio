/* Optional walkthrough selected when entering a financial space. */
(() => {'use strict';
 const steps=[['dashboard','Resumo','Aqui acompanhas saldos e o mês. Os cartões abrem os cálculos e os registos de origem.'],['planner','Agenda','Agenda um compromisso, uma recorrência ou o ordenado. Agendar não regista um pagamento.'],['casaHome','Casa','Organiza compras, despensa, equipamentos, consumos e prendas nas respetivas abas.'],['dataHub','Dados','Trata pendências, importa ficheiros e consulta documentos. Confirma sempre os dados antes de guardar.'],['settings','Definições','Gere os espaços, a aparência e as cópias.']];
 let card,index=0,origin;
 function stop(){card?.remove();card=null;document.querySelectorAll('.entry-tip-highlight').forEach(e=>e.classList.remove('entry-tip-highlight'));}
 function draw(){if(!card||key!==origin){stop();return;}const [route,title,copy]=steps[index];navigate(route);card.innerHTML='<p class="eyebrow">DICA '+(index+1)+' DE '+steps.length+'</p><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p><div class="u-actions"><button type="button" class="secondary" data-tip-close>Fechar dicas</button><button type="button" class="primary" data-tip-next>'+(index===steps.length-1?'Terminar':'Seguinte')+'</button></div>';card.querySelector('[data-tip-close]').onclick=stop;card.querySelector('[data-tip-next]').onclick=()=>{if(++index>=steps.length)stop();else draw();};card.querySelector('[data-tip-next]').focus();}
 function start(){stop();origin=key;index=0;card=document.createElement('aside');card.className='entry-tip-card';card.setAttribute('role','dialog');card.setAttribute('aria-label','Dicas do espaço financeiro');document.body.append(card);draw();}
 document.addEventListener('keydown',e=>{if(card&&e.key==='Escape'){e.preventDefault();stop();}});

 UILifecycle.register('entry-tips',{afterNavigation:()=>{if(card&&origin!==key)stop();}},60);window.EntryTipsUI=Object.freeze({start,stop});
})();
