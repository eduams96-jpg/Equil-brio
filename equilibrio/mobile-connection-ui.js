'use strict';
(()=>{if(typeof document==='undefined')return;const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let state,approval=null,busy=false,pendingSync=false;
 const dialog=document.createElement('dialog');dialog.className='mobile-dialog';dialog.setAttribute('aria-label','Ligação aos dispositivos');document.body.append(dialog);
 async function perform(task){if(busy||!window.EquilibrioMobile)return;busy=true;for(const b of dialog.querySelectorAll('button'))b.disabled=true;try{await task();state=await window.EquilibrioMobile.action({type:'status'});render();}catch(e){const p=dialog.querySelector('[role="status"]');if(p)p.textContent=String(e.message).replace(/^Error invoking remote method[^:]+: (?:Error: )?/,'');}finally{busy=false;for(const b of dialog.querySelectorAll('button'))b.disabled=false;}}
 function refreshReceivedData(){
  try{
   if(document.querySelector('dialog[open]:not(.mobile-dialog)'))throw Error('Conclui ou fecha o formulário antes de atualizar a vista.');
   if(window.DesktopPersistence?.refreshCriticalDomains){
    const result=window.DesktopPersistence.refreshCriticalDomains();
    if(!result?.ok)throw Error('Reabre a vista para carregar os dados recebidos.');
   }
   const active=window.LifeUI?.activeSpace?.();
   if(active?.key&&typeof data!=='undefined')localStorage.setItem(active.key,JSON.stringify(data));
   window.CompleteUI?.updatedFromDisk?.();
   if(typeof data!=='undefined')window.FileProtection?.saved?.(data);
   pendingSync=false;
   for(const badge of document.querySelectorAll('[data-mobile-sync-status]'))badge.textContent='Dados sincronizados e vista atualizada.';
   window.renderEquilibrio?.();
   return true;
  }catch(e){
   for(const badge of document.querySelectorAll('[data-mobile-sync-status]'))badge.textContent=e.message;
   return false;
  }
 }
 function render(){if(!state)return;dialog.innerHTML=`<header><h2>Dispositivos móveis</h2><button type="button" data-close aria-label="Fechar">×</button></header><p>Este PC conserva os dados em SQLite. A ligação funciona enquanto o programa estiver aberto.</p><p>${state.running?'Ligação ativa: <code>'+escape(state.url)+'</code>':'Ligação parada'}</p><div class="mobile-actions">${state.running?'<button type="button" data-stop>Parar ligação</button>':'<button type="button" data-start>Iniciar ensaio local</button><button type="button" data-network>Iniciar ligação de rede</button>'}<button type="button" data-refresh-view>Atualizar dados recebidos</button></div><details><summary>Configuração HTTPS da rede</summary><p>O certificado deve corresponder ao endereço deste PC e ser confiado pelo Android. A chave fica protegida pelo Windows.</p><label>Endereço<select id="mobileHost">${state.addresses.filter(a=>a!=='127.0.0.1').map(a=>`<option>${escape(a)}</option>`).join('')}</select></label><label>Porta<input id="mobilePort" type="number" value="8743" min="1024" max="65535"></label><div class="mobile-actions"><button type="button" data-generate>Preparar certificado deste PC</button><button type="button" data-certificate>Guardar certificado público</button><button type="button" data-configure>Usar certificado existente</button></div><p>Instala o certificado público como certificado de autoridade no Android antes de associar. O endereço deve manter-se estável na rede. A chave privada permanece protegida neste PC.</p></details><h3>Associar aparelho</h3><label>Espaço financeiro<select id="mobileSpace">${state.spaces.map(s=>`<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('')}</select></label><button type="button" data-approve ${state.running?'':'disabled'}>Criar código temporário</button>${approval?`<p class="mobile-code">${escape(approval.code)}</p><small>Válido por dois minutos, para o espaço escolhido.</small>`:''}<h3>Aparelhos autorizados</h3>${state.devices.map(d=>`<article><strong>${escape(d.name||d.deviceId)}</strong><small>${d.revoked?'Acesso revogado':'Acesso autorizado'}</small>${d.revoked?'':`<button type="button" data-revoke="${escape(d.deviceId)}">Revogar acesso</button>`}</article>`).join('')||'<p>Sem aparelhos registados nesta sessão.</p>'}<p role="status">${pendingSync?'Foram recebidos novos dados do telemóvel.':''}</p>`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-refresh-view]')?.addEventListener('click',()=>refreshReceivedData());
  dialog.querySelector('[data-start]')?.addEventListener('click',()=>perform(()=>window.EquilibrioMobile.action({type:'start'})));
  dialog.querySelector('[data-network]')?.addEventListener('click',()=>perform(()=>window.EquilibrioMobile.action({type:'start',network:true})));
  dialog.querySelector('[data-stop]')?.addEventListener('click',()=>perform(async()=>{approval=null;await window.EquilibrioMobile.action({type:'stop'});}));
  for(const type of ['generate','certificate'])dialog.querySelector('[data-'+type+']').onclick=()=>{const host=dialog.querySelector('#mobileHost').value,port=Number(dialog.querySelector('#mobilePort').value);perform(()=>window.EquilibrioMobile.action({type,host,port}));};
  dialog.querySelector('[data-configure]').onclick=()=>{const host=dialog.querySelector('#mobileHost').value,port=Number(dialog.querySelector('#mobilePort').value);perform(()=>window.EquilibrioMobile.action({type:'configure',host,port}));};
  dialog.querySelector('[data-approve]').onclick=()=>{const spaceId=dialog.querySelector('#mobileSpace').value;perform(async()=>{approval=await window.EquilibrioMobile.action({type:'approve',spaceId});});};
  for(const b of dialog.querySelectorAll('[data-revoke]'))b.onclick=()=>perform(()=>window.EquilibrioMobile.action({type:'revoke',deviceId:b.dataset.revoke}));
 }
 function openDialog(){
  if(!window.EquilibrioMobile){
   dialog.innerHTML='<header><h2>Dispositivos móveis</h2><button type="button" data-close aria-label="Fechar">×</button></header><p>A sincronização local com dispositivos Android está disponível na aplicação instalada no PC (Windows).</p>';
   dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.showModal();
   return;
  }
  perform(async()=>{state=await window.EquilibrioMobile.action({type:'status'});render();if(!dialog.open)dialog.showModal();});
 }
 window.EquilibrioMobile?.onChange?.(()=>{
  pendingSync=true;
  for(const badge of document.querySelectorAll('[data-mobile-sync-status]'))badge.textContent='Novos dados recebidos do telemóvel · clica em Atualizar dados.';
 });
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-open-mobile-devices]')){e.preventDefault();openDialog();}
  else if(e.target.closest('[data-refresh-mobile-sync]')){e.preventDefault();refreshReceivedData();}
 });
 window.EquilibrioMobileUI=Object.freeze({open:openDialog,refresh:refreshReceivedData,hasPending:()=>pendingSync});
})();
