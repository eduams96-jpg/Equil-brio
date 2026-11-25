/* A configuração pertence ao espaço aberto e segue commit/backup/restore. */
(() => {
  'use strict';
  const I = ProviderIcons;
  const panel = document.createElement('article');
  panel.className = 'panel provider-settings';
  panel.id = 'providerIconSettings';
  const disclosure = document.createElement('details');
  disclosure.className = 'workflow-detail settings-disclosure';
  disclosure.innerHTML = '<summary>Ícones das contas e fornecedores</summary>';
  disclosure.append(panel);
  document.querySelector('#settings .settings-grid').append(disclosure);
  let dirty = true;
  function draw(force = false) {
    if (!force && typeof view === 'string' && view !== 'settings') { dirty = true; return; }
    dirty = false;
    const names=new Map();for(const name of ['DIGI','Spotify',...(data.accounts||[]).map(a=>a.name),...(data.subscriptions||[]).map(s=>s.name),...(data.beneficiaries||[]).map(b=>typeof b==='string'?b:b.name),...(data.savedBeneficiaries||[]),...(data.providerIcons||[]).map(r=>r.name),...(data.transactions||[]).map(t=>t.beneficiary),...(data.casa?.stores||[]).map(s=>s.name),...(data.casa?.purchases||[]).map(p=>p.store)])if(name)names.set(I.key(name),name);
    const rows=[...names.values()].sort((a,b)=>a.localeCompare(b,'pt'));
    panel.innerHTML='<div class="u-head"><h2>Ícones das contas e fornecedores</h2><button type="button" class="primary" data-provider-add>+ Associar ícone</button></div><div class="u-table-scroll"><table class="u-table provider-settings-list"><thead><tr><th>Conta / fornecedor</th><th>Ícone</th><th>Origem</th><th>Ações</th></tr></thead><tbody>'+rows.map(name=>{const custom=(data.providerIcons||[]).find(r=>I.key(r.name)===I.key(name)),resolved=I.resolve(name,data.providerIcons||[]);return '<tr><td>'+esc(name)+'</td><td>'+(data.accounts.some(a=>I.key(a.name)===I.key(name))?I.accountHtml(name):I.html(name))+'</td><td>'+esc(custom?custom.initialOnly||!custom.image?'Personalizado · iniciais':'Personalizado · imagem local':resolved.kind==='initial'?'Iniciais':'Incluído na aplicação')+'</td><td><button type="button" class="secondary" data-provider-edit="'+esc(custom?.id||'')+'" data-provider-name="'+esc(name)+'">Editar</button></td></tr>';}).join('')+'</tbody></table></div>';
  }
  async function readImage(file) {
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw Error('Escolhe uma imagem PNG, JPEG ou WebP até 2 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 25000000) throw Error('A imagem é demasiado grande.');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const scale = Math.min(96 / image.naturalWidth, 96 / image.naturalHeight), width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      canvas.getContext('2d').drawImage(image, (96-width)/2, (96-height)/2, width, height);
      const result = canvas.toDataURL('image/png');
      if (!I.validImage(result)) throw Error('Não foi possível preparar esta imagem.');
      return result;
    } finally { URL.revokeObjectURL(url); }
  }
  function editor(id, suggestedName='') {
    const existing = (data.providerIcons || []).find(row => String(row.id) === String(id));
    let image = existing?.image || '', loading = false, failed = false;
    const expected = existing && JSON.stringify(existing), spaceKey = key;
    form(existing ? 'Editar ícone' : 'Associar ícone', field('Conta, fornecedor ou beneficiário', 'providerName', existing?.name || suggestedName, 'text', 'required maxlength="100"') + '<label>Imagem local<input id="providerIconFile" type="file" accept="image/png,image/jpeg,image/webp"></label><p id="providerIconFeedback" role="status">PNG, JPEG ou WebP até 2 MB. A imagem será reduzida para 96 × 96.</p><div id="providerIconPreview">' + I.html(existing?.name || suggestedName || '?') + '</div><label class="checkbox"><input type="checkbox" name="initialOnly">Usar apenas iniciais</label>', f => {
      if (loading || failed) { notice(loading ? 'Aguarda a preparação da imagem.' : 'Escolhe outra imagem ou usa apenas iniciais.', true); return false; }
      return commit(() => {
        if (key !== spaceKey || existing && JSON.stringify((data.providerIcons || []).find(row => row.id === existing.id)) !== expected) throw Error('O espaço ou ícone mudou. Abre novamente a configuração.');
        const name = String(f.get('providerName')).trim();
        if (!f.has('initialOnly') && !image) throw Error('Escolhe uma imagem ou ativa a opção de usar apenas iniciais.');
        const rows = (data.providerIcons || []).filter(row => row.id !== existing?.id);
        rows.push({id: existing?.id || F.id(), name, image: f.has('initialOnly') ? '' : image, initialOnly: f.has('initialOnly')});
        I.validate(rows); data.providerIcons = rows;
      }, 'Ícone associado. Os valores financeiros não foram alterados.');
    }, 'Sem imagem personalizada, o ícone incluído é usado quando existir; nos restantes fornecedores aparecem iniciais.');
    const fileInput = document.getElementById('providerIconFile'), feedback = document.getElementById('providerIconFeedback'), preview = document.getElementById('providerIconPreview');
    fileInput.onchange = async () => {
      if (!fileInput.files.length) return;
      loading = true; failed = false; feedback.textContent = 'A preparar imagem…';
      try { image = await readImage(fileInput.files[0]); preview.innerHTML = '<span class="provider-icon"><img src="' + image + '" alt="Pré-visualização"></span>'; feedback.textContent = 'Imagem pronta para guardar.'; }
      catch (e) { failed = true; feedback.textContent = e.message; }
      finally { loading = false; }
    };
    document.querySelector('[name="initialOnly"]').checked = !!existing?.initialOnly;
    document.querySelector('[name="initialOnly"]').onchange = e => { if (e.target.checked) failed = false; };
  }
  panel.addEventListener('click', event => {
    const target = event.target.closest('[data-provider-add],[data-provider-edit]');
    if (target) editor(target.dataset.providerEdit || '',target.dataset.providerName||'');
  });
  const renderBefore = PremiumUI.render;
  PremiumUI.render = () => { renderBefore(); draw(); };
  const navBefore = PremiumUI.navigation;
  PremiumUI.navigation = (target) => { navBefore?.(target); if (!window.UILifecycle?.inRender?.() && target === 'settings' && dirty) draw(true); };
  draw();
  window.ProviderIconsUI = {draw, readImage};
})();
