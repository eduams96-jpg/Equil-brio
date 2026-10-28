/* Rascunhos automáticos desativados a pedido do utilizador (v1.0.9).
 * Mantém a interface completa de window.DraftUI como no-op seguro para que
 * todos os formulários, modais e o fecho da aplicação funcionem sem erros. */
(function () {
  'use strict';
  const noop = () => {};
  const removeBtn = () => {
    const btn = document.getElementById('recoverFormDraft');
    if (btn) btn.remove();
  };
  removeBtn();
  window.DraftUI = Object.freeze({
    enabled: false,
    begin: noop,
    suspend: noop,
    flush: () => true,
    saveReview: noop,
    token: () => null,
    complete: noop,
    recover: noop,
    discard: noop,
    observeModal: noop,
    clear: noop,
    refresh: async () => {},
    restore: async () => {},
  });
})();
