(function () {
  const R = ReceiptFinance;
  let controller;
  const entry = document.createElement("button");
  entry.className = "secondary";
  entry.textContent = "Ler fatura";
  entry.id = "readReceipt";
  // Reading starts inside the movement form, preserving its draft.
  function start() {
    form(
      "Ler uma fatura",
      '<p>A leitura é local. Confirma os produtos e valores: descrições abreviadas, descontos e fotografias pouco nítidas podem causar erros.</p><label>Imagem ou PDF<input name="receiptFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><p id="receiptProgress" role="status">Imagens até 10 MB; PDF até 8 MB e 10 páginas.</p>',
      async (f) => {
        const origin = key, fileInput=document.querySelector("[name=receiptFile]");
        controller?.abort();
        controller = new AbortController();
        const own = controller;
        const result = await ReceiptReader.read(
          f.get("receiptFile"),
          (s) => {
            const el = document.getElementById("receiptProgress");
            if (el) el.textContent = s;
          },
          own.signal,
          {image:ReceiptImageUI.options(document.querySelector("[name=receiptFile]"))},
        );
        if (key !== origin || own.signal.aborted || !document.getElementById("modal").open || !fileInput.isConnected)
          throw Error(
            "O espaço mudou ou a leitura foi cancelada. Abre novamente a fatura.",
          );
        review({...R.parse(result.text),reading:result.reading}, result.attachment);
        return false;
      },
      "O comprovativo será guardado com o movimento.",
      "Ler documento",
    );
    ReceiptImageUI.bind(document.querySelector("[name=receiptFile]"));
  }
  function review(draft, attachment, context) {
    const before = JSON.stringify(data),origin=key;
    const itemRow = (item, i) =>
      `<div class="receipt-product" data-receipt-index="${i}" data-source-name="${esc(item.sourceName||item.name)}">${item.sourceLine?`<small class="receipt-source-line">Lido: ${esc(item.sourceLine)}</small>`:""}<label>Produto<input name="product${i}" value="${esc(item.name)}" maxlength="200" required></label><label>Quantidade<input name="quantity${i}" type="number" step="any" min="0.001" value="${item.quantity}" required></label><label>Total da linha (€)<input name="price${i}" type="number" step="0.01" min="0.01" value="${item.amount}" required></label><label>Categoria / subcategoria<input name="category${i}" value="${esc(item.category)}" maxlength="80" required></label><label class="checkbox"><input type="checkbox" name="omit${i}"> Ignorar linha</label></div>`;
    let count = draft.items.length;
    form(
      "Rever produtos e categorias",
      field(
        "Loja",
        "merchant",
        draft.merchant,
        "text",
        'required maxlength="200"',
      ) +
        field("Data da fatura", "receiptDate", draft.date, "date", "required") +
        field(
          "Total da fatura (€)",
          "receiptTotal",
          draft.total ?? "",
          "number",
          'required min="0.01" step="0.01"',
        ) +
        accountSelect("account") +
        '<label>Destino<select name="receiptTarget" required><option value="">Escolhe depois de comparar com os teus movimentos</option><option value="new">Criar uma nova despesa</option>' +
        data.transactions
          .filter(
            (t) =>
              t.type === "expense" &&
              !t.attachment &&
              !t.receiptItems &&
              !t.debtId &&
              !t.pendingId &&
              !t.recurringRuleId &&
              !data.closedMonths.includes(t.date.slice(0, 7)),
          )
          .slice(0, 300)
          .map(
            (t) =>
              `<option value="${esc(t.id)}">Associar: ${esc(t.date)} · ${esc(t.description)} · ${eur(t.amount)} · ${esc(t.account)}</option>`,
          )
          .join("") +
        '</select></label><p>Associar mantém o saldo e a data do movimento existente. Confirma o valor e a conta. São apresentados até 300 movimentos elegíveis.</p>' +
        (draft.warnings?.length ? '<p class="receipt-status" role="status">'+esc(draft.warnings.join(' '))+'</p>' : '') + '<div id="receiptProducts">' +
        draft.items.map(itemRow).join("") +
        '</div><button type="button" class="secondary" id="addReceiptProduct">Adicionar produto</button><details class="workflow-detail"><summary>Texto lido e linhas a confirmar</summary><p>' +
        esc(draft.unresolved.join(" · ")) +
        '</p><pre style="white-space:pre-wrap">' +
        esc(draft.text) +
        '</pre></details><label class="checkbox"><input name="receiptConfirmed" type="checkbox" required> Conferi os produtos, descontos, total e a existência de movimentos anteriores.</label>',
      (f) => {
        if (!f.has("receiptConfirmed"))
          throw Error("Confirma a revisão antes de guardar.");
        const items = [];
        for (let i = 0; i < count; i++)
          if (!f.has("omit" + i))
            items.push({
              name: f.get("product" + i)?.trim(),
              sourceName: document.querySelector('[data-receipt-index="'+i+'"]')?.dataset.sourceName || f.get("product"+i)?.trim(),
              quantity: Number(f.get("quantity" + i)),
              amount: Number(f.get("price" + i)),
              category: f.get("category" + i)?.trim(),
            });
        const target = f.get("receiptTarget");
        if (!target)
          throw Error("Escolhe criar ou associar a uma despesa existente.");
        return commit(() => {
          if (key !== origin || JSON.stringify(data) !== before)
            throw Error(
              "Os dados mudaram. Volta a ler a fatura para comparar com os registos atuais.",
            );
          const saved = R.apply(
            data,
            {
              merchant: f.get("merchant").trim(),
              date: f.get("receiptDate"),
              total: Number(f.get("receiptTotal")),
              items,
              text: draft.text,
              transactionId:target==='new'?window.DraftUI?.token()?.id:undefined,
            },
            f.get("account"),
            target === "new" ? null : target,
            attachment,
          );
          if(document.getElementById('receiptProducts').adjustments?.length)saved.receiptAdjustments=structuredClone(document.getElementById('receiptProducts').adjustments);
          if (f.has("receiptLearn")) R.remember(data,f.get("merchant").trim(),items,"category",f.get("receiptLearnScope")==="all");
          if (
            context &&
            (target === "new" || target === String(context.transaction?.id))
          ) {
            saved.beneficiary =
              context.values.get("beneficiary")?.trim() || draft.merchant;
            saved.note = context.values.get("note") || "";
            saved.noteColor = context.values.get("noteColor") === "auto" ? undefined : (context.values.get("noteColor") || context.transaction?.noteColor);
            if (context.values.get("description")?.trim())
              saved.description = context.values.get("description").trim();
          } else if (!saved.beneficiary) saved.beneficiary = draft.merchant;
        }, "Fatura guardada com os produtos e categorias.");
      },
      "A soma dos produtos tem de coincidir com o total. Corrige os valores das linhas após descontos antes de guardar.",
      "Guardar fatura",
    );
    if (context) {
      document.querySelector("#modal [name=account]").value =
        context.values.get("account");
      document.querySelector("#modal [name=receiptTarget]").value =
        context.transaction ? String(context.transaction.id) : "new";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "secondary";
      back.textContent = "Voltar ao movimento";
      back.onclick = () => {
        transactionForm(context.transaction?.id);
        for (const [name, value] of context.values) {
          const el = document.querySelector('#modal [name="' + name + '"]');
          if (el && el.type !== "file") {
            if (el.type === "checkbox") el.checked = true;
            else el.value = value;
          }
        }
        document.querySelector('#modal [name=category]')?.dispatchEvent(new Event('change',{bubbles:true}));
        document.getElementById('modal').movementDraft?.restore(context.splitDraft);
      };
      document.getElementById("modalContent").append(back);
    }
    document.getElementById("addReceiptProduct").onclick = () => {
      if (count >= 200) return notice("Máximo de 200 produtos.", true);
      document
        .getElementById("receiptProducts")
        .insertAdjacentHTML(
          "beforeend",
          itemRow(
            { name: "", quantity: 1, amount: "", category: "Outros" },
            count++,
          ),
        );
      window.ReceiptAssistanceUI?.refreshReview();
    };
    window.ReceiptAssistanceUI?.enhanceReview("category",draft);
    window.ProductivityUI?.receiptPanel(draft);
    window.DraftUI?.begin('receipt',()=>({draft:{...draft,reviewedAdjustments:document.getElementById('receiptProducts').adjustments||[]},attachment,context:context?{id:context.transaction?.id||null,values:[...context.values].filter(([,v])=>typeof v==='string'),splitDraft:context.splitDraft}:null,items:[...document.querySelectorAll('#receiptProducts .receipt-product')].map(row=>({name:row.querySelector('[name^=product]').value,sourceName:row.dataset.sourceName,quantity:Number(row.querySelector('[name^=quantity]').value),amount:Number(row.querySelector('[name^=price]').value),category:row.querySelector('[name^=category]').value}))}));
  }
  entry.onclick = start;
  document
    .getElementById("modal")
    .addEventListener("close", () => controller?.abort());
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
  const previous = FeatureUI.transactionActions;
  FeatureUI.transactionActions = (t) =>
    previous(t) +
    (t.receiptItems
      ? button("Produtos", "receipt-products", t.id, "link-button")
      : "");
  function attachToMovement(transaction) {
    if (
      transaction?.attachment ||
      transaction?.receiptItems ||
      transaction?.debtId ||
      transaction?.pendingId ||
      transaction?.recurringRuleId
    )
      return;
    const box = document.createElement("details");
    box.className = "workflow-detail receipt-inline";
    box.innerHTML =
      '<summary>Preencher com uma fatura</summary><p>Lê uma imagem ou PDF neste computador. Depois revê os produtos e o total antes de guardar.</p><label>Fatura<input type="file" name="inlineReceiptFile" accept="image/png,image/jpeg,image/webp,application/pdf"></label><button type="button" class="secondary" id="readMovementReceipt">Ler fatura</button><p class="receipt-status" role="status">Imagem até 10 MB; PDF até 8 MB e 10 páginas.</p>';
    document.querySelector("#modal [name=type]").closest("label").after(box);
    ReceiptImageUI.bind(box.querySelector("[name=inlineReceiptFile]"));
    box.querySelector("#readMovementReceipt").onclick = async () => {
      const values = new FormData(document.getElementById("modalForm"));
      if (values.get("type") !== "expense")
        return notice("A leitura de faturas destina-se a despesas.", true);
      const file = box.querySelector("input").files[0];
      if (!file) return notice("Escolhe primeiro uma fatura.", true);
      const splitDraft=document.getElementById("modal").movementDraft?.capture();
      const origin = key,
        stamp = JSON.stringify(data);
      controller?.abort();
      controller = new AbortController();
      const own = controller;
      const buttons = [...new Set([...document.querySelectorAll("#modal button")].filter(
        (b) => b.type === "submit" || b.id === "readMovementReceipt",
      ).concat([...box.querySelectorAll("input,button")]))];
      const disabledBefore=buttons.map(b=>b.disabled);
      buttons.forEach((b) => (b.disabled = true));
      try {
        const result = await ReceiptReader.read(
          file,
          (text) => (box.querySelector(".receipt-status").textContent = text),
          own.signal,
          {image:ReceiptImageUI.options(document.querySelector("[name=inlineReceiptFile]"))},
        );
        if (
          own.signal.aborted ||
          key !== origin ||
          JSON.stringify(data) !== stamp ||
          !box.isConnected || !document.getElementById("modal").open
        )
          throw Error(
            "A leitura foi interrompida ou os dados mudaram. Abre novamente a fatura.",
          );
        review({...R.parse(result.text),reading:result.reading}, result.attachment, {
          transaction,
          values,
          splitDraft,
        });
      } catch (error) {
        if (box.isConnected)
          box.querySelector(".receipt-status").textContent = error.message;
      } finally {
        buttons.forEach((b,i) => (b.disabled = disabledBefore[i]));
      }
    };
  }
  window.ReceiptUI = { start, review, attachToMovement };
  render();
})();
