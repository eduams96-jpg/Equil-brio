/* Produtos guardados num movimento por uma leitura de fatura anterior à 1.0.21.
 * A leitura de faturas foi retirada; esta janela só mostra os dados existentes. */
(function () {
  const previous = FeatureUI.transactionActions;
  FeatureUI.transactionActions = (t) =>
    previous(t) +
    (t.receiptItems
      ? button("Produtos", "receipt-products", t.id, "link-button")
      : "");
  actions["receipt-products"] = (id) => {
    const t = data.transactions.find((t) => String(t.id) === String(id));
    if (!t?.receiptItems) return;
    form(
      "Produtos da fatura",
      `<p>${esc(t.receiptMerchant)} · ${esc(t.receiptDate)}</p>` +
        t.receiptItems
          .map(
            (i) =>
              `<p><b>${esc(i.name)}</b> · ${i.quantity} · ${eur(i.amount)} · ${esc(i.category)}</p>`,
          )
          .join(""),
      () => true,
      "Valores das linhas após descontos.",
      "Fechar",
    );
  };
  render();
})();
