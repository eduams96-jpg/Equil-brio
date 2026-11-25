/* Ícones locais, portáveis e independentes do livro financeiro. */
(function (root) {
  'use strict';
  const key = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const brandAssets = {lidl:'lidl',continente:'continente'};
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validImage = image => typeof image === 'string' && (image === '' || image.length <= 65536 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(image));
  function validate(rows) {
    if (!Array.isArray(rows) || rows.length > 200) throw Error('Lista de ícones inválida.');
    const seen = new Set();
    for (const row of rows) {
      const name = key(row?.name);
      if (!name || typeof row.name !== 'string' || row.name.length > 100 || seen.has(name) || !validImage(row.image) || row.initialOnly !== undefined && typeof row.initialOnly !== 'boolean') throw Error('Ícone de fornecedor inválido.');
      seen.add(name);
    }
    return rows;
  }
  function resolve(name, rows = []) {
    const normalized = key(name);
    // A associação é exata: nunca atribuir um logótipo por coincidência parcial.
    const custom = rows.find(row => key(row.name) === normalized);
    if (custom?.image && validImage(custom.image)) return {kind: 'image', image: custom.image};
    if (custom?.initialOnly) return {kind: 'initial'};
    if(Object.hasOwn(brandAssets,normalized))return {kind:'brand',image:'assets/providers/'+brandAssets[normalized]+'.png'};
    return {kind: ['digi','spotify'].includes(normalized) ? normalized : 'initial'};
  }
  function html(name, rows = root.document ? data.providerIcons || [] : []) {
    const icon = resolve(name, rows);
    const content = ['image','brand'].includes(icon.kind) ? `<img src="${escape(icon.image)}" alt="">` : icon.kind === 'digi' ? 'D' : icon.kind === 'spotify' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8Q12 4 19 8M6 12Q12 9 18 12M7 16Q12 13 17 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' : escape(String(name || '?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?');
    return `<span class="provider-icon provider-${icon.kind}" aria-hidden="true">${content}</span>`;
  }
  const api = {key, validate, resolve, html, accountHtml: html, validImage};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ProviderIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
