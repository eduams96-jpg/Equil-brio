/* Feature panels share the ledger, forms and transactional save path. */
(function () {
  "use strict";
  const P = FinancePlus,
    selected = new Set(),
    freq = {
      weekly: "Semanal",
      monthly: "Mensal",
      bimonthly: "De dois em dois meses",
      quarterly: "Trimestral",
      yearly: "Anual",
    };
  let selectionSpace = key;
  function panel(id, target, title) {
    const host = document.createElement("section");
    host.id = id;
    host.className = "panel feature-panel";
    host.innerHTML = "<h2>" + title + "</h2>";
    $(target).append(host);
    return host;
  }
  function sectionHead(title, subtitle = "") {
    return `<div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div>`;
  }
  function smartInsightRows(info, limit = 6) {
    const smart = info?.smart || {}, rows = [];
    const category = smart.categoryChanges?.[0];
    if (category) {
      const up = category.delta > 0;
      rows.push({
        tone: up ? "warning" : "positive",
        title: `${category.category}: gastaste ${up ? "mais" : "menos"} ${Math.abs(Math.round(category.percent || 0))}%`,
        detail: `${eur(category.current)} este mês · ${eur(category.previous)} no mês anterior`,
      });
    }
    const casaStore = smart.casaStoreChanges?.[0];
    const merchant = casaStore || smart.merchantChanges?.[0];
    if (merchant) {
      const up = merchant.change > 0;
      rows.push({
        tone: up ? "warning" : "positive",
        title: `${merchant.name}: valor médio ${up ? "subiu" : "desceu"} ${Math.abs(Math.round(merchant.percent || 0))}%`,
        detail: `${eur(merchant.currentAverage)} por compra/registo · referência ${eur(merchant.previousAverage)}`,
      });
    }
    if (smart.unusualExpenses?.length) {
      const top = smart.unusualExpenses[0];
      rows.push({
        tone: "warning",
        title: `${smart.unusualExpenses.length} despesa${smart.unusualExpenses.length === 1 ? "" : "s"} acima do teu padrão recente`,
        detail: `Maior: ${top.beneficiary || top.description} · ${eur(top.amount)} vs. média ${eur(top.average)}`,
      });
    }
    if (smart.forecast) {
      const balance = smart.forecast.balance;
      rows.push({
        tone: balance >= 0 ? "positive" : "warning",
        title: `Este mês aponta para ${balance >= 0 ? "+" : "−"}${eur(Math.abs(balance))}`,
        detail: `Receitas projetadas ${eur(smart.forecast.income)} · despesas ${eur(smart.forecast.expense)}`,
      });
    }
    for (const extra of (smart.categoryChanges || []).slice(1, 3)) {
      const up = extra.delta > 0;
      rows.push({
        tone: up ? "warning" : "positive",
        title: `${extra.category}: ${up ? "+" : "−"}${Math.abs(Math.round(extra.percent || 0))}% face ao mês anterior`,
        detail: `${eur(extra.current)} vs. ${eur(extra.previous)}`,
      });
    }
    return rows.slice(0, limit);
  }
  function smartInsightsHTML(info, compact = false) {
    const rows = smartInsightRows(info, compact ? 4 : 6);
    if (!rows.length) return '<p class="quiet-state">Ainda não há histórico suficiente para gerar leituras úteis deste período.</p>';
    return `<div class="smart-insights-grid ${compact ? "is-compact" : ""}">${rows.map((row) => `<article class="smart-insight ${row.tone}"><i aria-hidden="true"></i><div><b>${esc(row.title)}</b><small>${esc(row.detail)}</small></div></article>`).join("")}</div>`;
  }
  function transactionActions(t) {
    const moreActions =
      (!t.debtId && !t.refundOf && t.source!=='Casa integrado' && ["income", "expense"].includes(t.type)
        ? button("Duplicar", "duplicate", t.id, "link-button")
        : "") +
      (t.type === "expense" && !t.debtId
        ? button("Converter em transferência", "make-transfer", t.id, "link-button") +
          button("Dividir categorias", "split", t.id, "link-button") +
          button("Registar reembolso", "refund", t.id, "link-button")
        : "") +
      (t.transferPair
        ? button("Separar transferência", "unpair", t.id, "link-button")
        : "");
    const moreMenu = moreActions
      ? `<details class="row-menu"><summary aria-label="Mais ações: ${esc(t.description)}">Mais</summary><div>${moreActions}</div></details>`
      : "";
    return `${moreMenu}${t.refundOf ? '<span class="tag">Reembolso</span>' : ""}`;
  }
  function selection(t) {
    if (selectionSpace !== key) {
      selected.clear();
      selectionSpace = key;
    }
    return `<label class="tx-selection"><input type="checkbox" data-tx-selection="${esc(t.id)}" aria-label="Selecionar ${esc(t.description)}" ${selected.has(String(t.id)) ? "checked" : ""}></label>`;
  }
  function bulkForm(initial = {}) {
    const ids = [...selected];
    if (!ids.length) return notice("Seleciona pelo menos um movimento.", true);
    const categoryPaths = [...new Set(data.transactions.map((t) => F.categoryPath(t.category || "")).filter(Boolean))];
    const categoryParts = categoryPaths.map((path) => F.categoryParts(path));
    const optionList = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")).map((value) => `<option value="${esc(value)}">`).join("");
    form(
      "Editar " + ids.length + (ids.length === 1 ? " movimento" : " movimentos"),
      field(
        "Novo nome/descrição (vazio mantém a atual)",
        "description",
        initial.description || "",
        "text",
        'maxlength="160"',
      ) +
        field(
        "Nova categoria principal (vazio mantém a atual)",
        "category",
        initial.category || "",
        "text",
        'maxlength="80" list="bulkCategories"',
      ) +
        field(
          "Nova subcategoria (vazio mantém a atual)",
          "subcategory",
          initial.subcategory || "",
          "text",
          'maxlength="80" list="bulkSubcategories"',
        ) +
        `<div class="two-cols category-depth-fields">${field(
          "Novo detalhe · 3.º nível (vazio mantém)",
          "categoryDetail",
          initial.categoryDetail || "",
          "text",
          'maxlength="80" list="bulkCategoryDetails"',
        )}${field(
          "Novo subdetalhe · 4.º nível (vazio mantém)",
          "categorySubdetail",
          initial.categorySubdetail || "",
          "text",
          'maxlength="80" list="bulkCategorySubdetails"',
        )}</div>` +
        `<datalist id="bulkCategories">${optionList(categoryParts.map((parts) => parts[0]))}</datalist>` +
        `<datalist id="bulkSubcategories">${optionList(categoryParts.map((parts) => parts[1]))}</datalist>` +
        `<datalist id="bulkCategoryDetails">${optionList(categoryParts.map((parts) => parts[2]))}</datalist>` +
        `<datalist id="bulkCategorySubdetails">${optionList(categoryParts.map((parts) => parts[3]))}</datalist>` +
        select(
          "Nova conta",
          "account",
          [
            ["", "Manter conta"],
            ...data.accounts.filter((a) => !a.archived).map((a) => a.name),
          ],
          initial.account || "",
        ) +
        select(
          "Classificação",
          "expenseNature",
          [
            ["", "Manter"],
            ["fixed", "Fixa"],
            ["variable", "Variável"],
          ],
          initial.expenseNature || "",
        ),
      (f) => {
        const changes = {
          description: f.get("description").trim(),
          category: f.get("category").trim(),
          subcategory: f.get("subcategory").trim(),
          categoryDetail: f.get("categoryDetail").trim(),
          categorySubdetail: f.get("categorySubdetail").trim(),
          account: f.get("account"),
          expenseNature: f.get("expenseNature"),
        };
        const eligibility=window.ProductivityFinance?.bulkEligibility(data,ids,changes)||{eligible:ids,blocked:[]};
        if(!eligibility.eligible.length)throw Error(eligibility.blocked.map(t=>t.description+': '+t.reason).join(' · '));
        const preview = PlanningFinance.bulkPreview(data, eligibility.eligible, changes);
        if (!preview.changed)
          throw Error("Estas escolhas não alteram nenhum movimento.");
        const expected = JSON.stringify(data);
        const describe = (t) =>
          esc(
            [
              t.description,
              t.category,
              t.account,
              t.expenseNature === "fixed"
                ? "Fixa"
                : t.expenseNature === "variable"
                  ? "Variável"
                  : "Sem classificação",
            ]
              .filter(Boolean)
              .join(" · "),
          );
        form(
          "Confirmar alterações em grupo",
          (eligibility.blocked.length?'<p role="status">'+eligibility.blocked.length+' movimentos protegidos ficam excluídos.</p><ul>'+eligibility.blocked.map(t=>'<li>'+esc(t.description)+': '+esc(t.reason)+'</li>').join('')+'</ul><label class="checkbox"><input type="checkbox" name="confirmEligibleOnly" required> Confirmo aplicar apenas aos movimentos elegíveis</label>':'')+"<p>Movimentos com alterações: <b>" +
            preview.changed +
            "</b>. Total selecionado: " +
            ids.length +
            '.</p><div class="change-preview">' +
            preview.rows
              .slice(0, 30)
              .map(
                (r) =>
                  "<article><b>" +
                  esc(r.before.description) +
                  "</b><p><span>Antes</span> " +
                  describe(r.before) +
                  "</p><p><span>Depois</span> " +
                  describe(r.after) +
                  "</p></article>",
              )
              .join("") +
            "</div>" +
            (preview.rows.length > 30
              ? "<p>Mostramos os primeiros 30. As mesmas escolhas aplicam-se aos restantes.</p>"
              : "") +
            preview.accounts
              .map(
                (a) =>
                  "<p><b>" +
                  esc(a.name) +
                  "</b>: " +
                  eur(a.before) +
                  " → " +
                  eur(a.after) +
                  "</p>",
              )
              .join("") +
            '<button type="button" id="bulkBack" class="secondary">Voltar às escolhas</button>',
          (values) =>
            commit(() => {
              if(eligibility.blocked.length&&!values.has('confirmEligibleOnly'))throw Error('Confirma os movimentos excluídos.');
              if (JSON.stringify(data) !== expected)
                throw Error(
                  "Os dados mudaram desde a pré-visualização. Volta às escolhas para rever novamente.",
                );
              P.bulk(data, eligibility.eligible, changes);
            }, "Movimentos selecionados atualizados."),
          "Nenhuma alteração é aplicada até confirmares. Uma mudança de conta também redistribui os saldos.",
          "Aplicar alterações",
        );
        $("#bulkBack").onclick = () => bulkForm(changes);
        return false;
      },
      "As alterações são aplicadas em conjunto. Meses fechados, transferências e pagamentos de dívida ficam protegidos.",
      "Rever alterações",
    );
  }
  function duplicate(id) {
    const t = find("transactions", id);
    form(
      "Duplicar movimento",
      field("Descrição", "description", t.description, "text", "required") +
        field(
          "Data",
          "date",
          F.today(),
          "date",
          `required max="${F.today()}"`,
        ) +
        accountSelect("account", t.account),
      (f) =>
        commit(() => {
          const next = {
            ...structuredClone(t),
            id: F.id(),
            date: f.get("date"),
            description: f.get("description").trim(),
            account: f.get("account"),
          };
          for (const k of [
            "recurringRuleId",
            "recurringDate",
            "recurringParent",
            "recurring",
            "importBatchId",
            "importSource",
            "refundOf",
            "sharedExpenseId",
            "investmentTradeId",
          ])
            delete next[k];
          F.add(data, next);
        }, "Movimento duplicado."),
      "Valor: " + eur(t.amount) + ". Podes editar o valor depois de guardar.",
    );
  }
  function split(id) {
    const t = find("transactions", id);
    if (data.closedMonths.includes(t.date.slice(0, 7)))
      return notice("Reabre o mês antes de alterar a divisão.", true);
    let parts = structuredClone(
      t.splits || [
        { category: t.category, amount: F.money(t.amount / 2) },
        {
          category: "Outros",
          amount: F.money(t.amount - F.money(t.amount / 2)),
        },
      ],
    );
    form(
      "Dividir por categorias",
      "<p>Valor do movimento: <b>" +
        eur(t.amount) +
        '</b></p><div id="splitRows"></div><button type="button" id="addSplit" class="secondary">Adicionar categoria</button><p id="splitTotal" role="status"></p>',
      () =>
        commit(() => {
          const categories = $$("[data-split-category]");
          const subcategories = $$("[data-split-subcategory]");
          const amounts = $$("[data-split-amount]");
          const values = categories.map((el, i) => ({
            category: [el.value.trim(), (subcategories[i]?.value || "").trim()].filter(Boolean).join(" / "),
            amount: +amounts[i].value,
          }));
          find("transactions", id).splits = values;
        }, "Divisão guardada."),
      "A soma das parcelas deve coincidir com o valor original. O saldo da conta não muda.",
    );
    function draw() {
      $("#splitRows").innerHTML = parts
        .map(
          (p, i) => {
            const pieces = String(p.category || "").split(" / ");
            return `<div class="split-row split-row-detailed"><label>Categoria ${i + 1}<input data-split-category value="${esc(pieces[0] || "")}" required></label><label>Subcategoria<input data-split-subcategory value="${esc(pieces.slice(1).join(" / "))}" placeholder="Opcional"></label><label>Valor (€)<input data-split-amount type="number" min="0.01" step="0.01" value="${p.amount}" required></label><button type="button" data-remove-split="${i}" class="link-button" aria-label="Remover parcela ${i + 1}" ${parts.length <= 2 ? "disabled" : ""}>×</button></div>`;
          },
        )
        .join("");
      total();
    }
    function read() {
      const categories = $$("[data-split-category]");
      const subcategories = $$("[data-split-subcategory]");
      const amounts = $$("[data-split-amount]");
      parts = categories.map((el, i) => ({
        category: [el.value, subcategories[i]?.value || ""].map((x) => x.trim()).filter(Boolean).join(" / "),
        amount: +amounts[i].value,
      }));
    }
    function total() {
      const amount = sum($$("[data-split-amount]"), (x) => +x.value);
      $("#splitTotal").textContent =
        "Distribuído: " + eur(amount) + " · Falta: " + eur(t.amount - amount);
    }
    $("#splitRows").oninput = total;
    $("#splitRows").onclick = (e) => {
      const b = e.target.closest("[data-remove-split]");
      if (b) {
        read();
        parts.splice(+b.dataset.removeSplit, 1);
        draw();
      }
    };
    $("#addSplit").onclick = () => {
      read();
      parts.push({ category: "", amount: 0 });
      draw();
    };
    draw();
  }
  function refund(id) {
    const purchase=data.casa?.purchases?.find(p=>p.transactionId===id);
    if(purchase&&window.CasaCompleteUI)return CasaCompleteUI.returnForm(purchase.id, find('transactions', id)?.date);
    const original = find("transactions", id),
      remaining = F.money(
        original.amount -
          sum(
            data.transactions.filter((t) => String(t.refundOf) === String(id)),
            (t) => t.amount,
          ),
      );
    if (remaining <= 0)
      return notice("Esta despesa já foi totalmente reembolsada.", true);
    form(
      "Registar reembolso",
      `<p class="refund-source-summary"><b>${esc(original.description)}</b><span>Despesa original: ${eur(original.amount)} · ainda por reembolsar: ${eur(remaining)}</span></p>` +
        field("Descrição do movimento", "description", "Reembolso: " + original.description, "text", 'required maxlength="160"') +
        number("Valor recebido (€)", "amount", remaining, 0.01) +
        field(
          "Data",
          "date",
          original.date,
          "date",
          `required max="${F.today()}"`,
        ) +
        accountSelect("account", original.account) +
        field("Nota (opcional)", "note", "", "text", 'maxlength="500" placeholder="Ex.: devolução parcial, correção do fornecedor"') +
        `<label class="attachment-picker">Comprovativo do reembolso (opcional)<input name="attachment" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label><p class="muted">O reembolso fica na lista como qualquer outro movimento de entrada. Podes editá-lo, apagá-lo ou anexar o comprovativo mais tarde.</p>`,
      async (f) => {
        const file = f.get("attachment");
        const attachment = file?.size ? await attachmentFromFile(file) : undefined;
        let refundMovement = null;
        const saved = commit(
          () => {
            refundMovement = F.add(data, {
              id: F.id(),
              description: (f.get("description") || "Reembolso: " + original.description).trim(),
              type: "income",
              refundOf: original.id,
              amount: +f.get("amount"),
              date: f.get("date"),
              account: f.get("account"),
              category: original.category,
              beneficiary: original.beneficiary || "",
              expenseNature: original.expenseNature,
              note: (f.get("note") || "").trim(),
              ...(attachment ? { attachment } : {}),
            });
          },
          "Reembolso registado como movimento normal.",
        );
        if (saved && refundMovement) {
          const search = document.querySelector("#searchTransactions");
          const typeFilter = document.querySelector("#typeFilter");
          const accountFilter = document.querySelector("#accountFilter");
          const periodFilter = document.querySelector("#periodFilter");
          if (search) search.value = "";
          if (typeFilter) typeFilter.value = "all";
          if (accountFilter) accountFilter.value = "";
          if (periodFilter) periodFilter.value = "all";
          window.resetTransactionPage?.();
          try { navigate("transactions"); } catch (_) { window.render?.(); }
          const account = data.accounts.find((a) => a.name === refundMovement.account);
          notice(`Reembolso criado como movimento de +${eur(refundMovement.amount)}.${account ? ` Saldo atual de ${account.name}: ${eur(account.balance)}.` : ""}`);
        }
        return saved;
      },
      "O valor da despesa original mantém-se visível; o reembolso aparece como um movimento positivo ligado a ela e reduz a despesa líquida nas análises.",
      "Registar reembolso",
    );
  }
  function budget(id) {
    const b = id ? find("budgets", id) : null,
      limit = b ? P.budgetAt(data, b, month) : null;
    form(
      b ? "Orçamento de " + b.category : "Novo orçamento",
      (!b
        ? field("Categoria", "category", "", "text", "required maxlength=80")
        : "<p>" + esc(monthLabel(month)) + "</p>") +
        number(
          "Limite neste mês e seguintes (€)",
          "limit",
          limit?.limit || "",
          0.01,
        ) +
        select(
          "Valor não utilizado",
          "carry",
          [
            ["false", "Não transitar"],
            ["true", "Transitar para o mês seguinte"],
          ],
          String(limit?.rollover || false),
        ),
      (f) =>
        commit(
          () =>
            P.saveBudget(data, id, month, {
              category: b?.category || f.get("category").trim(),
              limit: +f.get("limit"),
              carry: f.get("carry") === "true",
            }),
          "Orçamento mensal guardado.",
        ),
      "Os meses anteriores mantêm os seus limites. O saldo não utilizado transita apenas enquanto esta opção estiver ativa.",
    );
  }
  function goal(id) {
    const g = id ? find("goals", id) : null;
    form(
      g ? "Editar objetivo" : "Novo objetivo",
      field("Nome", "name", g?.name || "", "text", "required maxlength=100") +
        number("Valor alvo (€)", "target", g?.target || "", 0.01) +
        number("Já reservado (€)", "current", g?.current || 0) +
        field(
          "Data final",
          "deadline",
          g?.deadline || P.dayAdd(F.today(), 365),
          "date",
          "required",
        ),
      (f) =>
        commit(() => {
          const next = {
            ...g,
            id: g?.id || F.id(),
            name: f.get("name").trim(),
            target: +f.get("target"),
            current: +f.get("current"),
            deadline: f.get("deadline"),
            planMonths: 12,
          };
          if (next.current > next.target)
            throw Error("O valor reservado ultrapassa o alvo.");
          if (!F.validDate(next.deadline)) throw Error("Data final inválida.");
          if (g) data.goals[data.goals.findIndex((x) => x.id === g.id)] = next;
          else data.goals.push(next);
        }, "Objetivo guardado."),
      "As reservas identificam dinheiro que continua nas contas. Consulta o total reservado para evitar sobreposições.",
    );
  }
  function recurring(id) {
    if (!requireAccounts()) return;
    const salaryPreset = id === "__salary__";
    const r = id && !salaryPreset ? find("recurring", id) : null;
    const preferredSalaryDay = Number(data.paydayDay || 0);
    const today = new Date(F.today() + "T12:00:00Z");
    const defaultSalaryDay = preferredSalaryDay > 0
      ? preferredSalaryDay
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
    const categoryNames = [...new Set((window.CompleteFinance?.categoryList(data) || []).filter(c => !c.archived).map(c => c.name.split(" / ")[0]).concat(data.transactions.map(t => (t.category || "").split(" / ")[0]).filter(Boolean), data.budgets.map(b => (b.category || "").split(" / ")[0]).filter(Boolean), ["Alimentação","Casa","Transportes","Lazer","Saúde","Subscrições","Salário","Outros"]))].sort((a,b)=>a.localeCompare(b,"pt"));
    const beneficiaries = [...new Set([...(data.savedBeneficiaries || []), ...data.transactions.map(t => (t.beneficiary || "").trim())].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));
    const historyDefault = data.transactions.map((t) => t.date).filter(F.validDate).sort()[0] || F.today();
    form(
      r ? "Editar recorrência" : (salaryPreset ? "Previsão de ordenado" : "Nova recorrência"),
      field("Descrição", "description", r?.description || (salaryPreset ? "Ordenado" : ""), "text", "required maxlength=160") +
        select("Tipo", "type", [["expense","Despesa"],["income","Receita"],["transfer","Transferência entre contas"]], r?.type || (salaryPreset ? "income" : "expense")) +
        select("Tipo de entrada", "incomeKind", [["other","Outra entrada"],["salary","Ordenado / salário"]], r?.incomeKind || (salaryPreset ? "salary" : "other")) +
        number("Valor de referência (€)", "amount", r?.amount || "", 0.01) +
        select("Valor da recorrência", "valueMode", [["fixed","Fixo"],["estimated","Variável / estimado"]], r?.valueMode || "fixed") +
        select("Previsão do valor variável", "estimateMode", [["reference","Usar valor de referência"],["average","Média dos últimos meses"]], r?.estimateMode || "reference") +
        field("Meses usados na média", "averageMonths", r?.averageMonths || 3, "number", 'min="1" max="24" step="1"') +
        accountSelect("account", r?.account) +
        select("Conta de destino (só transferências)", "targetAccount", [["","—"], ...data.accounts.filter(a=>!a.archived).map(a=>a.name)], r?.targetAccount || "") +
        field("Categoria", "category", (r?.category || (salaryPreset ? "Salário" : "Outros")).split(" / ")[0], "text", 'required maxlength=80 list="recurringCategories"') +
        field("Subcategoria (opcional)", "subcategory", (r?.category || "").split(" / ").slice(1).join(" / "), "text", 'maxlength=60 list="recurringSubcategories"') +
        categorySplitFields() +
        field("Beneficiário / estabelecimento", "beneficiary", r?.beneficiary || "", "text", 'maxlength=160 list="recurringBeneficiaries"') +
        `<datalist id="recurringCategories">${categoryNames.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>` +
        `<datalist id="recurringSubcategories"></datalist>` +
        `<datalist id="recurringBeneficiaries">${beneficiaries.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>` +
        select("Frequência", "frequency", Object.entries(freq), r?.frequency || "monthly") +
        field("Primeira ocorrência", "start", r?.start || F.today(), "date", "required") +
        field("Dia do mês (exceto semanal)", "day", r?.day || (salaryPreset ? defaultSalaryDay : +F.today().slice(8)), "number", "min=1 max=31 required") +
        field("Terminar em (opcional)", "end", r?.end || "", "date") +
        select("Estado", "active", [["true","Ativo"],["false","Pausado"]], String(r?.active ?? true)) +
        (!r ? `<div class="recurring-create-history"><label class="checkbox"><input type="checkbox" name="linkHistory" checked> Procurar movimentos antigos desta categoria/subcategoria</label>${field("Procurar histórico desde", "historyFrom", historyDefault, "date", `max="${F.today()}"`)}<div id="recurringCreateHistoryPreview" class="recurring-history-preview" aria-live="polite"></div><p class="muted">Seleciona os movimentos que pertencem à recorrência. A associação não cria movimentos e não altera novamente os saldos.</p></div>` : ""),
      (f) => {
        let historyResult = [];
        const selectedHistoryIds = !r && f.has("linkHistory")
          ? [...document.querySelectorAll('#recurringCreateHistoryPreview [data-recurring-create-history]:checked:not(:disabled)')].map((input) => input.value)
          : [];
        const saved = commit(() => {
        const type=f.get("type"), account=f.get("account"), targetAccount=f.get("targetAccount");
        if(type === "transfer" && (!targetAccount || targetAccount === account)) throw Error("Escolhe uma conta de destino diferente da conta de origem.");
        const sub=(f.get("subcategory")||"").trim(), base=(f.get("category")||"Outros").trim();
        const beneficiary=(f.get("beneficiary")||"").trim();
        if(beneficiary) data.savedBeneficiaries=[...new Set([...(data.savedBeneficiaries||[]),beneficiary])].sort((a,b)=>a.localeCompare(b,"pt"));
        const incomeKind = type === "income" ? (f.get("incomeKind") || "other") : undefined;
        const next={...r,id:r?.id||F.id(),description:f.get("description").trim(),type,incomeKind,amount:+f.get("amount"),valueMode:f.get("valueMode")||"fixed",estimateMode:f.get("estimateMode")||"reference",averageMonths:Math.max(1,Math.min(24,+f.get("averageMonths")||3)),account,targetAccount:type==="transfer"?targetAccount:undefined,category:type==="transfer"?"Transferência":(sub?base+" / "+sub:base),beneficiary,frequency:f.get("frequency"),start:f.get("start"),day:+f.get("day"),end:f.get("end")||undefined,active:f.get("active")==="true"};
        const splits = readCategorySplits(type, next.amount);
        if (splits) { next.splits = splits; next.category = splits[0].category; }
        else delete next.splits;
        if (incomeKind === "salary") data.paydayDay = next.day;
        if(r) data.recurring[data.recurring.findIndex(x=>x.id===r.id)]=next;
        else {
          if (f.has("linkHistory")) {
            const from = f.get("historyFrom");
            if (!F.validDate(from) || from > F.today()) throw Error("Escolhe uma data válida para procurar o histórico.");
            const selectedDates = data.transactions.filter(t => selectedHistoryIds.includes(String(t.id))).map(t => t.date).filter(F.validDate).sort();
            if (selectedDates.length && selectedDates[0] < next.start) next.start = F.recurringHistoryStart(next, selectedDates[0]);
          }
          data.recurring.push(next);
          if (f.has("linkHistory")) {
            historyResult = F.linkRecurringHistorySelection(data, next.id, selectedHistoryIds);
            next.historyLinkedFrom = f.get("historyFrom");
          }
        }
        }, "Recorrência guardada.");
        if (saved && !r && f.has("linkHistory")) {
          const linked = historyResult.length;
          notice(`${linked} movimento${linked === 1 ? "" : "s"} antigo${linked === 1 ? "" : "s"} associado${linked === 1 ? "" : "s"} à recorrência. Os movimentos e os saldos existentes ficaram intactos.`);
        }
        return saved;
      },
      r
        ? "Estás a editar a série. As ocorrências já registadas mantêm-se no histórico; para antecipar ou adiar apenas um mês usa “Ajustar ocorrência” diretamente na Agenda."
        : "Para despesas variáveis podes usar uma estimativa fixa ou a média dos últimos meses. A Agenda mostra o previsto e, ao confirmar, podes substituir pelo valor real. O histórico real alimenta as previsões seguintes.",
    );
    const recurringStart = document.querySelector('#modal [name="start"]'), recurringDay = document.querySelector('#modal [name="day"]');
    recurringStart?.addEventListener('change', () => { if (F.validDate(recurringStart.value) && recurringDay) recurringDay.value = Number(recurringStart.value.slice(8)); });
    bindCategorySplits(r || {type:salaryPreset ? 'income' : 'expense',amount:0,category:'Outros'});
    const recurringCategory = document.querySelector("#modal [name=category]"),
      recurringSubcategory = document.querySelector("#modal [name=subcategory]"),
      recurringSubList = document.querySelector("#recurringSubcategories");
    if (recurringCategory && recurringSubcategory && recurringSubList) {
      let lastBase = recurringCategory.value.trim();
      const syncRecurringSubcategories = () => {
        const base = recurringCategory.value.trim();
        if (base !== lastBase) recurringSubcategory.value = "";
        lastBase = base;
        const values = [
          ...(window.CompleteFinance?.categoryList(data) || [])
            .filter((c) => !c.archived && c.parent === base)
            .map((c) => c.name.slice(c.parent.length + 3)),
          ...data.transactions
            .map((t) => F.categoryParts(t.category || ""))
            .filter((parts) => parts[0] === base && parts.length > 1)
            .map((parts) => parts.slice(1).join(" / ")),
        ];
        recurringSubList.innerHTML = [...new Set(values)].sort((a,b)=>a.localeCompare(b,"pt-PT")).map((value)=>`<option value="${esc(value)}">`).join("");
        if (recurringSubcategory.value && !values.includes(recurringSubcategory.value)) recurringSubcategory.value = "";
      };
      recurringCategory.addEventListener("input", syncRecurringSubcategories);
      recurringCategory.addEventListener("change", syncRecurringSubcategories);
      syncRecurringSubcategories();
    }
    if (!r) {
      const historyToggle = document.querySelector('#modal [name="linkHistory"]');
      const historyFrom = document.querySelector('#modal [name="historyFrom"]');
      const typeInput = document.querySelector('#modal [name="type"]');
      const accountInput = document.querySelector('#modal [name="account"]');
      const amountInput = document.querySelector('#modal [name="amount"]');
      const preview = document.querySelector('#recurringCreateHistoryPreview');
      const refreshHistoryCandidates = () => {
        if (!preview) return;
        if (!historyToggle?.checked) {
          preview.innerHTML = '<p class="muted">Pesquisa de histórico desligada.</p>';
          return;
        }
        const from = historyFrom?.value;
        const category = F.categoryPath([recurringCategory?.value || "", recurringSubcategory?.value || ""]);
        const type = typeInput?.value || "expense";
        if (!F.validDate(from)) {
          preview.innerHTML = '<p class="muted">Escolhe uma data inicial válida.</p>';
          return;
        }
        if (type === "transfer") {
          preview.innerHTML = '<p class="muted">Nas transferências, usa “Associar histórico” depois de guardar a recorrência.</p>';
          return;
        }
        const rows = data.transactions
          .filter((t) => t.type === type && !t.refundOf && !t.debtId && !t.subscriptionId && !t.pendingId && !t.recurringRuleId && F.validDate(t.date) && t.date >= from && t.date <= F.today() && F.categoryPath(t.category || "") === category)
          .sort((a,b)=>a.date.localeCompare(b.date));
        if (!rows.length) {
          preview.innerHTML = '<p class="muted recurring-history-empty">Ainda não encontrei movimentos nesta categoria/subcategoria e período.</p>';
          return;
        }
        const amount = Number(amountInput?.value) || 0;
        const tolerance = Math.max(100, Math.round(F.cents(amount) * 0.12));
        const groups = new Map();
        for (const t of rows) {
          const group = t.date.slice(0,7);
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(t);
        }
        const preferred = new Set();
        for (const groupRows of groups.values()) {
          const best = groupRows.slice().sort((a,b)=>
            Number(b.account === accountInput?.value) - Number(a.account === accountInput?.value) ||
            Math.abs(F.cents(a.amount)-F.cents(amount)) - Math.abs(F.cents(b.amount)-F.cents(amount)) ||
            a.date.localeCompare(b.date)
          )[0];
          if (best && best.account === accountInput?.value && (!amount || Math.abs(F.cents(best.amount)-F.cents(amount)) <= tolerance)) preferred.add(String(best.id));
        }
        preview.innerHTML = `<div class="recurring-history-filter-summary"><b>${rows.length} movimento${rows.length === 1 ? "" : "s"} encontrado${rows.length === 1 ? "" : "s"}</b><span>Filtro direto por ${esc(category || "categoria")}. Seleciona os que pertencem à série.</span></div><div class="recurring-history-filter-list">${rows.map((t)=>`<label class="recurring-history-candidate recurring-history-filter-row"><input type="checkbox" data-recurring-create-history value="${esc(t.id)}"${preferred.has(String(t.id)) ? " checked" : ""}><span><b>${esc(t.description || "Movimento")}</b><small>${dateLabel(t.date)} · ${eur(t.amount)} · ${esc(t.account || "—")} · ${esc(t.category || "—")}</small></span></label>`).join("")}</div>`;
      };
      for (const el of [historyToggle, historyFrom, recurringCategory, recurringSubcategory, typeInput, accountInput, amountInput]) {
        el?.addEventListener('input', refreshHistoryCandidates);
        el?.addEventListener('change', refreshHistoryCandidates);
      }
      refreshHistoryCandidates();
    }
  }
  function editPending(id) {
    const p = find("pendingPayments", id);
    form(
      "Editar agendamento",
      field("Descrição", "description", p.description, "text", "required") +
        number("Valor (€)", "amount", p.amount, 0.01) +
        field("Data prevista", "date", p.date, "date", "required") +
        accountSelect("account", p.account) +
        field(
          "Categoria",
          "category",
          p.category || "Outros",
          "text",
          "required",
        ),
      (f) =>
        commit(
          () =>
            Object.assign(find("pendingPayments", id), {
              description: f.get("description").trim(),
              amount: +f.get("amount"),
              date: f.get("date"),
              account: f.get("account"),
              category: f.get("category").trim(),
            }),
          "Agendamento atualizado.",
        ),
    );
  }
  function archive(id) {
    const a = find("accounts", id);
    confirmAction(
      a.archived ? "Reativar conta" : "Arquivar conta",
      a.archived
        ? "Voltar a apresentar esta conta nos formulários?"
        : "A conta e os movimentos mantêm-se no histórico e no património. Deixará de ser sugerida para novos movimentos.",
      () => {
        if (!a.archived) {
          const dependencies = F.activeAccountDependencies(data, a.name);
          if (dependencies.length)
            throw Error(
              "Muda ou pausa os compromissos desta conta antes de a arquivar: " + dependencies.join(", ") + ".",
            );
        }
        F.setAccountArchived(data, id, !a.archived);
      },
    );
  }
  function renderBulk() {
    if (selectionSpace !== key) {
      selected.clear();
      selectionSpace = key;
    }
    for (const id of selected)
      if (!data.transactions.some((t) => String(t.id) === id))
        selected.delete(id);
    const visible = new Set(
      $$("[data-tx-selection]").map((el) => el.dataset.txSelection),
    );
    const outside = [...selected].filter((id) => !visible.has(id)).length;
    $("#bulkCount").textContent =
      selected.size +
      " selecionados" +
      (outside ? " · " + outside + " fora desta lista" : "");
    document.querySelector("#transactions .bulk-toolbar")?.classList.toggle("has-selection", selected.size > 0);
    $("#bulkEdit").disabled = !selected.size;
  }
  function renderGoals() {
    const totals = P.reserves(data);
    $("#reserveOverview").innerHTML =
      sectionHead(
        "Dinheiro com destino",
        "Reservas e objetivos partilham os saldos das contas.",
      ) +
      `<div class="mini-metrics">${metric("Nas contas", eur(totals.cash))}${metric("Reservado", eur(totals.assigned))}${metric("Sem destino atribuído", eur(totals.free))}</div>` +
      (totals.free < 0
        ? '<div class="alert danger">Os objetivos e reservas ultrapassam o dinheiro nas contas em ' +
          eur(-totals.free) +
          ". Revê as afetações para evitar contar o mesmo dinheiro duas vezes.</div>"
        : "");
    $$("#goalsGrid .goal-card").forEach((card, i) => {
      const g = data.goals[i];
      const p = card.querySelector("p");
      if (p)
        p.textContent =
          eur(P.monthlySuggestion(g)) +
          "/mês" +
          (g.deadline
            ? " até " + dateLabel(g.deadline)
            : " durante " + (g.planMonths || 12) + " meses");
    });
  }
  function renderForecast() {
    const days = +$("#forecastHorizon").value,
      fc = P.forecast(data, days),
      max = Math.max(...fc.rows.map((r) => Math.abs(r.balance)), 1);
    $("#forecastMetrics").innerHTML =
      metric("Saldo em " + days + " dias", eur(fc.end)) +
      metric("Saldo mínimo previsto", eur(fc.min)) +
      metric(
        "Primeiro saldo negativo",
        fc.firstNegative ? dateLabel(fc.firstNegative) : "Nenhum",
      );
    const samples = fc.rows.filter(
      (r, i) =>
        i % Math.max(1, Math.floor(days / 25)) === 0 ||
        i === fc.rows.length - 1,
    );
    $("#forecastGraph").innerHTML = samples
      .map(
        (r) =>
          `<div class="forecast-column" title="${dateLabel(r.date)}: ${eur(r.balance)}"><i class="${r.balance < 0 ? "below-zero" : ""}" style="height:${Math.max(2, (Math.abs(r.balance) / max) * 100)}%"></i><small>${r.date.slice(8)}</small></div>`,
      )
      .join("");
    $("#forecastCalendar").innerHTML =
      fc.rows
        .filter((r) => r.events.length)
        .map(
          (r) =>
            `<div class="calendar-block"><div class="calendar-block-head"><b>${dateLabel(r.date)}</b><strong class="${r.balance < 0 ? "negative" : ""}">${eur(r.balance)}</strong></div>${r.events.map((t) => `<div class="calendar-event"><span>${esc(t.description)} <small>${t.overdue ? "Em atraso · " : ""}${esc(t.source)}</small></span><b>${t.type === "income" ? "+" : "−"}${eur(t.amount)}</b></div>`).join("")}</div>`,
        )
        .join("") || empty("Sem pagamentos previstos neste horizonte.");
    const weeklyHost = $("#weeklyForecastDashboard");
    if (weeklyHost) {
      const week = P.forecast(data, 6),
        rows = week.rows || [],
        events = (week.events || []).slice().sort((a,b) => String(a.date).localeCompare(String(b.date))),
        startBalance = F.money(sum(data.accounts || [], (a) => +a.balance || 0)),
        weekIncome = F.money(sum(events.filter((e) => e.type === "income"), (e) => +e.amount || 0)),
        weekExpense = F.money(sum(events.filter((e) => e.type !== "income"), (e) => +e.amount || 0)),
        endBalance = rows.length ? rows[rows.length - 1].balance : startBalance,
        biggestExpense = events.filter((e) => e.type !== "income").sort((a,b)=>(+b.amount||0)-(+a.amount||0))[0],
        biggestIncome = events.filter((e) => e.type === "income").sort((a,b)=>(+b.amount||0)-(+a.amount||0))[0];
      const startDate = rows[0]?.date || F.today(), endDate = rows.at(-1)?.date || F.today();
      const vals = rows.map((r) => +r.balance || 0), minV = Math.min(...vals, startBalance), maxV = Math.max(...vals, startBalance), spread = Math.max(1, maxV - minV);
      const chartW = 760, chartH = 230, padX = 34, padY = 24;
      const points = rows.map((r,i) => {
        const x = padX + (rows.length <= 1 ? 0 : i * ((chartW - padX * 2) / (rows.length - 1)));
        const y = padY + ((maxV - (+r.balance || 0)) / spread) * (chartH - padY * 2);
        return { ...r, x, y };
      });
      const path = points.map((p,i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      const area = points.length ? `${path} L${points.at(-1).x.toFixed(1)} ${(chartH-padY).toFixed(1)} L${points[0].x.toFixed(1)} ${(chartH-padY).toFixed(1)} Z` : "";
      const dayShort = (date) => new Date(date + "T12:00").toLocaleDateString("pt-PT", { weekday:"short", day:"2-digit" });
      weeklyHost.innerHTML = `
        <div class="weekly-forecast-head"><div><h2>Previsão semanal</h2><p>Visão das tuas entradas e saídas previstas nos próximos sete dias.</p></div><span class="weekly-range">${dateLabel(startDate)} — ${dateLabel(endDate)}</span></div>
        <div class="weekly-kpis">
          <article><i class="tone-blue">▣</i><div><span>Saldo inicial</span><strong>${eur(startBalance)}</strong><small>${dateLabel(startDate)}</small></div></article>
          <article><i class="tone-green">↓</i><div><span>Entradas previstas</span><strong class="positive">+${eur(weekIncome)}</strong><small>${events.filter((e)=>e.type === "income").length} movimentos</small></div></article>
          <article><i class="tone-red">↑</i><div><span>Saídas previstas</span><strong class="negative">−${eur(weekExpense)}</strong><small>${events.filter((e)=>e.type !== "income").length} movimentos</small></div></article>
          <article><i class="tone-purple">▥</i><div><span>Saldo projetado</span><strong>${eur(endBalance)}</strong><small>${dateLabel(endDate)}</small></div></article>
        </div>
        <div class="weekly-main-grid">
          <section class="weekly-chart-card"><div class="weekly-card-head"><div><h3>Evolução do saldo projetado</h3><p>Saldo estimado ao longo da semana com base nos compromissos conhecidos.</p></div></div>
            <svg class="weekly-line-chart" viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="Evolução do saldo projetado">
              <defs><linearGradient id="weeklyAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#37d7a0" stop-opacity=".32"/><stop offset="100%" stop-color="#37d7a0" stop-opacity="0"/></linearGradient></defs>
              ${[0,1,2,3].map((n)=>`<line x1="${padX}" y1="${padY+n*(chartH-padY*2)/3}" x2="${chartW-padX}" y2="${padY+n*(chartH-padY*2)/3}" class="weekly-grid-line"/>`).join("")}
              ${area ? `<path d="${area}" class="weekly-area"/><path d="${path}" class="weekly-line"/>` : ""}
              ${points.map((p)=>`<g><circle cx="${p.x}" cy="${p.y}" r="5" class="weekly-dot"/><text x="${p.x}" y="${Math.max(14,p.y-12)}" text-anchor="middle" class="weekly-value-label">${eur(p.balance)}</text><text x="${p.x}" y="${chartH-4}" text-anchor="middle" class="weekly-day-label">${esc(dayShort(p.date))}</text></g>`).join("")}
            </svg>
          </section>
          <section class="weekly-commitments-card"><div class="weekly-card-head"><div><h3>Compromissos da semana</h3><p>Próximos movimentos previstos por ordem cronológica.</p></div></div><div class="weekly-commitments">${events.length ? events.slice(0,7).map((e)=>`<div class="weekly-commitment"><span class="weekly-date-box">${esc(new Date(e.date+"T12:00").toLocaleDateString("pt-PT",{day:"2-digit",month:"short"}))}</span><div><b>${esc(e.description || "Movimento")}</b><small>${esc(e.category || e.source || "Planeamento")}</small></div><strong class="${e.type === "income" ? "positive" : "negative"}">${e.type === "income" ? "+" : "−"}${eur(e.amount)}</strong><em class="${e.overdue ? "late" : "planned"}">${e.overdue ? "Em atraso" : "A vencer"}</em></div>`).join("") : '<p class="weekly-empty">Sem compromissos previstos nesta semana.</p>'}</div></section>
        </div>
        <div class="weekly-bottom-grid">
          <section class="weekly-daily-card"><div class="weekly-card-head"><div><h3>Movimentos previstos por dia</h3><p>Resumo diário das entradas e saídas previstas.</p></div></div><div class="weekly-daily-table"><div class="weekly-daily-th"><span>Data</span><span>Entradas</span><span>Saídas</span><span>Saldo do dia</span><span>Principais movimentos</span></div>${rows.map((r)=>{ const ins=F.money(sum(r.events.filter((e)=>e.type === "income"),(e)=>+e.amount||0)), outs=F.money(sum(r.events.filter((e)=>e.type !== "income"),(e)=>+e.amount||0)), net=F.money(ins-outs); return `<div class="weekly-daily-row"><span>${esc(dayShort(r.date))}</span><span class="positive">${ins?"+":""}${eur(ins)}</span><span class="negative">${outs?"−":""}${eur(outs)}</span><strong class="${net>=0?"positive":"negative"}">${net>0?"+":net<0?"−":""}${eur(Math.abs(net))}</strong><span>${esc(r.events.map((e)=>e.description).slice(0,2).join(", ") || "—")}</span></div>`;}).join("")}</div></section>
          <section class="weekly-quick-card"><div class="weekly-card-head"><div><h3>Leitura rápida</h3><p>Os principais destaques desta semana.</p></div></div><div class="weekly-quick-list">
            <div><i class="tone-red">↑</i><span><b>Maior saída</b><small>${esc(biggestExpense?.description || "Sem saídas previstas")}</small></span><strong class="negative">${biggestExpense ? "−" + eur(biggestExpense.amount) : "—"}</strong></div>
            <div><i class="tone-green">↓</i><span><b>Maior entrada</b><small>${esc(biggestIncome?.description || "Sem entradas previstas")}</small></span><strong class="positive">${biggestIncome ? "+" + eur(biggestIncome.amount) : "—"}</strong></div>
            <div><i class="tone-blue">▣</i><span><b>Total de movimentos</b><small>${events.length} previstos</small></span><strong>${events.length}</strong></div>
            <div><i class="tone-purple">◔</i><span><b>Variação projetada</b><small>De ${eur(startBalance)} para ${eur(endBalance)}</small></span><strong class="${endBalance-startBalance>=0?"positive":"negative"}">${endBalance-startBalance>=0?"+":"−"}${eur(Math.abs(F.money(endBalance-startBalance)))}</strong></div>
          </div></section>
        </div>`;
    }
  }
  function renderAnalytics() {
    const info = P.insights(data, month),
      prev = P.monthAdd(month, -1);
    $("#smartInsightsPanel").innerHTML =
      sectionHead("Leituras automáticas", "Sinais calculados a partir dos teus próprios registos; são comparações, não certezas.") +
      smartInsightsHTML(info);
    $("#comparisonPanel").innerHTML =
      sectionHead("O que mudou", "Comparação com " + monthLabel(prev)) +
      `<div class="comparison-head"><span>Categoria</span><span>Mês anterior</span><span>Este mês</span><span>Variação</span></div>` +
      info.categories
        .map(
          (c) =>
            `<div class="comparison-row"><b>${esc(c.category)}</b><span>${eur(c.previous)}</span><span>${eur(c.current)}</span><span class="${c.current > c.previous ? "negative" : "positive"}">${c.current > c.previous ? "+" : ""}${eur(c.current - c.previous)}</span></div>`,
        )
        .join("");
    $("#spendingNature").innerHTML =
      sectionHead("Despesas fixas e variáveis") +
      `<div class="mini-metrics">${metric("Fixas", eur(info.fixed), info.fixedDebtPayments ? `Inclui ${eur(info.fixedDebtPayments)} de prestações de crédito.` : "")}${metric("Variáveis / por classificar", eur(info.variable))}</div><p>As prestações de crédito contam como compromisso fixo pelo valor total pago. Os restantes movimentos podem ser classificados individualmente ou em lote; reembolsos seguem a classificação da despesa original.</p>`;
    $("#merchantsPanel").innerHTML =
      sectionHead(
        "Onde gastas mais",
        "Descrições dos movimentos agrupadas; podes uniformizar os nomes ao editar.",
      ) +
      info.merchants
        .slice(0, 10)
        .map(
          (m, i) =>
            `<div class="rank-row"><span>${String(i + 1).padStart(2, "0")}</span><div><b>${esc(m.name)}</b><small>${m.count} movimentos</small></div><strong>${eur(m.amount)}</strong></div>`,
        )
        .join("");
    $("#subscriptionsPanel").innerHTML =
      sectionHead(
        "Compromissos recorrentes",
        "Custo anual estimado das despesas ativas.",
      ) +
      `<div class="annual-cost">${eur(sum(info.subscriptions, (r) => r.annual))}<small>por ano · sem prever alterações futuras</small></div>` +
      info.subscriptions
        .map(
          (r) =>
            `<div class="transaction-item"><div><b>${esc(r.description)}</b><small>${freq[r.frequency || "monthly"]} · ${eur(r.amount)}${r.increase > 0 ? " · aumento de " + eur(r.increase) + " face a um registo anterior" : ""}</small></div><b>${eur(r.annual)}/ano</b></div>`,
        )
        .join("") +
      (info.suggestions.length
        ? "<h3>Possíveis subscrições a confirmar</h3>" +
          info.suggestions
            .map(
              (s) =>
                `<p>${esc(s.description)} · aparece em ${s.months} meses · último valor ${eur(s.amount)}</p>`,
            )
            .join("")
        : "");
  }
  function renderRecovery() {
    const batchList = data.imports.slice().reverse();
    $("#importHistory").innerHTML =
      sectionHead("Histórico de importações") +
      (batchList
        .map(
          (b) =>
            `<div class="transaction-item"><div><b>${esc(b.name || "CSV")}</b><small>${new Date(b.at).toLocaleString("pt-PT")} · ${b.count} movimentos · ${b.undone ? "Desfeita" : "Confirmada"}</small></div>${!b.undone ? button("Desfazer importação", "undo-import", b.id) : ""}</div>`,
        )
        .join("") ||
        empty("As próximas importações confirmadas aparecem aqui."));
    const pairs = P.transferCandidates(data.transactions);
    $("#transferReview").innerHTML =
      sectionHead(
        "Possíveis transferências",
        "Valores iguais em contas diferentes, com até três dias de diferença. Confirma cada sugestão.",
      ) +
      (pairs
        .slice(0, 20)
        .map(
          (p) =>
            `<div class="transaction-item"><div><b>${esc(p.out.account)} → ${esc(p.in.account)}</b><small>${esc(p.out.description)} / ${esc(p.in.description)} · ${dateLabel(p.out.date)}</small></div><div><b>${eur(p.out.amount)}</b>${button("Associar", "pair", p.out.id + "~" + p.in.id)}</div></div>`,
        )
        .join("") || empty("Não há pares por confirmar."));
    $("#activityList").innerHTML =
      data.activity
        .slice()
        .reverse()
        .map(
          (a) =>
            `<details class="activity-entry"><summary><b>${esc(a.message)}</b><small>${new Date(a.at).toLocaleString("pt-PT")} · ${a.changes.length} alterações</small></summary>${a.changes.map((c) => `<p>${{ created: "Criado", deleted: "Apagado", updated: "Atualizado" }[c.kind]} · ${esc(c.name)}</p>`).join("")}</details>`,
        )
        .join("") ||
      empty("As alterações feitas a partir de agora aparecem aqui.");
    $("#trashList").innerHTML =
      data.trash
        .slice()
        .reverse()
        .map(
          (t) =>
            `<div class="transaction-item"><div><b>${esc(t.record.description || t.record.name || t.record.category || t.list)}</b><small>${new Date(t.deletedAt).toLocaleString("pt-PT")}</small></div>${button("Recuperar", "restore-deleted", t.id)}</div>`,
        )
        .join("") || empty("Não há registos apagados para recuperar.");
  }
  function monthlyReport() {
    const totals = F.totals(data, month),
      info = P.insights(data, month);
    $("#printReport").innerHTML =
      `<header><div><p>Equilíbrio · Resumo mensal</p><h1>${esc(monthLabel(month))}</h1></div><p>Preparado em ${dateLabel(F.today())}</p></header><div class="mini-metrics">${metric("Receitas", eur(totals.income))}${metric("Despesas líquidas", eur(totals.expense))}${metric("Diferença", eur(totals.income - totals.expense))}</div><h2>Despesas por categoria</h2>${info.categories.map((c) => `<div class="summary-row"><span>${esc(c.category)}</span><b>${eur(c.current)}</b></div>`).join("")}<h2>Movimentos</h2>${data.transactions
        .filter((t) => t.date.startsWith(month))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => row(t))
        .join(
          "",
        )}<p>Transferências e ajustes não contam como rendimento ou despesa. Reembolsos reduzem as despesas. Os saldos das contas são atuais.</p>`;
    document.body.classList.add("printing-report");
    window.print();
  }
  function onboarding() {
    form(
      "Configurar o teu espaço",
      field(
        "O teu nome",
        "name",
        data.profile,
        "text",
        "required maxlength=60",
      ) +
        field(
          "Nome da primeira conta",
          "accountName",
          "Conta à ordem",
          "text",
          "required maxlength=80",
        ) +
        select(
          "Como vais começar?",
          "balanceBasis",
          [
            ["current", "Saldo de hoje e movimentos novos"],
            ["historical", "Saldo anterior ao histórico que vou importar"],
          ],
          "current",
        ) +
        field(
          "Saldo de partida (€)",
          "balance",
          0,
          "number",
          "required step=0.01",
        ) +
        '<div id="openingGuide" class="opening-guide" aria-live="polite"></div>',
      (f) =>
        commit(() => {
          if (data.accounts.length && !data.isDemo)
            throw Error("Já tens contas. Adiciona outras no ecrã Contas.");
          data = F.empty();
          data.profile = f.get("name").trim();
          data.accounts.push({
            id: F.id(),
            name: f.get("accountName").trim(),
            type: "Banco",
            balance: +f.get("balance"),
          });
          data.onboarded = true;
        }, "Espaço configurado. Podes agora adicionar movimentos."),
      "Se estiveres na demonstração, os exemplos serão substituídos. Escolhe um saldo de partida coerente com os movimentos que vais registar.",
      "Começar",
    );
    const explain = () => {
      const f = new FormData($("#modalForm")),
        amount = Number(f.get("balance")) || 0;
      $("#openingGuide").innerHTML =
        f.get("balanceBasis") === "historical"
          ? "<b>Antes do primeiro movimento</b><p>Usa o saldo imediatamente anterior ao primeiro movimento do ficheiro. Uma despesa de 100 € aplicada a " +
            eur(amount) +
            " deixa " +
            eur(amount - 100) +
            ". Depois de importar, confere o resultado com o banco.</p>"
          : "<b>A partir de hoje</b><p>Usa o saldo que o banco mostra agora e regista os movimentos seguintes. Se depois importares despesas antigas já incluídas nesse saldo, volta a confirmar o saldo: a importação aplica-as novamente.</p>";
    };
    $("#modalContent [name=balanceBasis]").onchange = explain;
    $("#modalContent [name=balance]").oninput = explain;
    explain();
  }
  function render() {
    renderBulk();
    if (['goals','planningPlus','budgets','plansHub'].includes(view)) renderGoals();
    if (['cashflow','planner','plansHub','decisionsHub'].includes(view)) renderForecast();
    if (['dashboard','weeklyHub','reviewMonthHub','insights','reports'].includes(view)) renderAnalytics();
    if (['settings','dataHub','review'].includes(view) || document.querySelector('#historyManagerDialog')?.open) renderRecovery();
    $$("#accountsGrid .account-card").forEach((card, i) => {
      const a = data.accounts[i];
      card.classList.toggle("archived-account", !!a.archived);
      card
        .querySelector(".row-actions")
        .insertAdjacentHTML(
          "beforeend",
          button(
            a.archived ? "Reativar" : "Arquivar",
            "archive",
            a.id,
            "link-button",
          ),
        );
      if (a.archived)
        card.insertAdjacentHTML(
          "afterbegin",
          '<span class="tag">Arquivada</span>',
        );
    });
    $("#backupReminder").hidden =
      !!(window.DailyUI?.lastExport(key) || data.lastBackup) &&
      Date.now() -
        new Date(window.DailyUI?.lastExport(key) || data.lastBackup).getTime() <
        7 * 86400000;
    $("#backupReminder").innerHTML =
      "<div><b>Protege os teus registos</b><span>" +
      (!(window.DailyUI?.lastExport(key) || data.lastBackup)
        ? "Ainda não exportaste uma cópia."
        : "Já passaram mais de sete dias desde a última cópia.") +
      "</span></div>" +
      button("Exportar cópia", "backup-now");
    $("#recurringList").innerHTML =
      (data.recurring
        .map(
          (r) =>
            `<div class="transaction-item recurring-setting-row"><div><b>${esc(r.description)}</b><small>${freq[r.frequency || "monthly"]} · ${r.active ? "Ativa" : "Pausada"} · ${eur(r.amount)}</small></div><div class="row-actions">${button("Editar", "recurring", r.id, "link-button")}${button("Associar histórico", "link-recurring-history", r.id, "link-button")}${button("Histórico", "recurring-history", `recurring~${r.id}`, "link-button")}${button("Apagar", "delete-recurring", r.id, "link-button danger")}</div></div>`,
        )
        .join("") || empty("Ainda não tens recorrências.")) +
      (data.recurring.some((r) => !r.active) ? '<p class="muted recurring-paused-note">As recorrências pausadas continuam guardadas aqui, mas não entram na Agenda nem geram novas ocorrências até serem reativadas.</p>' : "");
  }
  function init() {
    const icons = {
      dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
      transactions: "M4 7h15m-4-4 4 4-4 4 M20 17H5m4-4-4 4 4 4",
      budgets: "M12 3v9h9 M9 4a9 9 0 1 0 11 11",
      goals:
        "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
      accounts: "M3 5h18v14H3z M3 9h18 M6 15h4",
      planner: "M4 5h16v16H4z M4 10h16 M8 2v6 M16 2v6",
      insights: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
      review: "M4 3h12l4 4v14H4z M7 13l3 3 6-6",
      debts: "M3 5h18v14H3z M3 9h18 M7 14h4",
      reports: "M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5",
      wealth: "M3 18l5-6 4 3 8-11 M14 4h6v6",
      cashflow: "M3 12h4l3-7 4 14 3-7h4",
      planningPlus: "M4 5h16v16H4z M8 2v6 M16 2v6 M8 15h8 M12 11v8",
      activity: "M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v6l4 2",
    };
    function styleNav() {
      const navigation = $(".sidebar nav");
      const groups = [
        ["DIA A DIA", ["dashboard", "transactions", "accounts"]],
        [
          "PLANEAR",
          ["budgets", "goals", "planner", "cashflow", "planningPlus"],
        ],
        ["ANALISAR", ["insights", "reports", "wealth", "debts"]],
        ["ORGANIZAR", ["review", "activity"]],
      ];
      for (const [label, views] of groups) {
        const heading = document.createElement("div");
        heading.className = "nav-group";
        heading.textContent = label;
        navigation.append(heading);
        for (const id of views) {
          const nav = $("[data-view=" + id + "]");
          if (!nav) continue;
          const label = nav.querySelector("span").textContent;
          nav.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
            icons[id] +
            '"/></svg><span>' +
            label +
            "</span>";
          navigation.append(nav);
        }
      }
    }
    const bulk = document.createElement("div");
    bulk.className = "bulk-toolbar";
    bulk.innerHTML =
      '<span id="bulkCount">0 selecionados</span><button type="button" id="selectVisible" class="link-button">Selecionar visíveis</button><button type="button" id="clearSelection" class="link-button">Limpar seleção</button><button type="button" id="bulkEdit" class="secondary" disabled>Editar seleção</button>';
    $("#transactionsTable").parentElement.insertBefore(bulk, $("#transactionsTable"));
    $("#selectVisible").onclick = () => {
      $$("[data-tx-selection]").forEach((el) =>
        selected.add(el.dataset.txSelection),
      );
      renderTransactions();
      renderBulk();
    };
    $("#clearSelection").onclick = () => {
      selected.clear();
      renderTransactions();
      renderBulk();
    };
    $("#bulkEdit").onclick = bulkForm;
    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-tx-selection]")) {
        e.target.checked
          ? selected.add(e.target.dataset.txSelection)
          : selected.delete(e.target.dataset.txSelection);
        renderBulk();
      }
    });
    panel("reserveOverview", "#planningPlus", "Dinheiro com destino");
    const fore = panel("longForecast", "#cashflow", "Previsão de saldo");
    fore.innerHTML =
      sectionHead(
        "Olhar em frente",
        "Inclui pendentes, recorrências e prestações estimadas de dívidas. Não agendes novamente estas prestações. Atrasados contam no primeiro dia; despesas desconhecidas ficam de fora.",
      ) +
      '<label class="inline-field">Horizonte<select id="forecastHorizon"><option value="30">30 dias</option><option value="60">60 dias</option><option value="90" selected>90 dias</option></select></label><div id="forecastMetrics" class="mini-metrics"></div><div id="forecastGraph" class="forecast-graph" aria-label="Saldo previsto ao longo dos dias"></div><h3>Calendário financeiro</h3><div id="forecastCalendar" class="financial-calendar"></div>';
    $("#forecastHorizon").onchange = renderForecast;
    const weeklyForecast = document.createElement("section");
    weeklyForecast.id = "weeklyForecastDashboard";
    weeklyForecast.className = "weekly-forecast-dashboard";
    $("#cashflow").prepend(weeklyForecast);
    const forecastAdvanced = document.createElement("details");
    forecastAdvanced.id = "forecastAdvancedDetails";
    forecastAdvanced.className = "forecast-advanced-details";
    forecastAdvanced.innerHTML = '<summary><span><b>Horizonte alargado e cenários</b><small>Consulta 30/60/90 dias e ferramentas avançadas quando precisares.</small></span></summary>';
    const legacyForecastGrid = $("#cashflow > .report-grid");
    if (legacyForecastGrid) forecastAdvanced.append(legacyForecastGrid);
    forecastAdvanced.append(fore);
    $("#cashflow").append(forecastAdvanced);
    // Transferências e reconciliação pertencem às Contas: move a interface existente,
    // preservando os mesmos botões, handlers e dados.
    const transferCard = document.querySelector("#makeTransfer")?.closest("article.panel");
    if (transferCard && !document.querySelector("#accountsTransferReconcile")) {
      const holder = document.createElement("section");
      holder.id = "accountsTransferReconcile";
      holder.className = "panel accounts-transfer-panel";
      holder.append(...Array.from(transferCard.childNodes));
      document.querySelector("#accounts")?.append(holder);
      transferCard.remove();
    }
    panel("smartInsightsPanel", "#insights", "Leituras automáticas");
    panel("comparisonPanel", "#insights", "Comparação mensal");
    // Estes dois painéis são um par visual: despesas fixas/variáveis à esquerda
    // e compromissos recorrentes à direita. Mantê-los no mesmo contentor evita
    // que regras antigas de margem/layout os voltem a empilhar.
    const natureGrid = document.createElement("div");
    natureGrid.id = "insightsNatureGrid";
    natureGrid.className = "insights-nature-grid";
    $("#insights").append(natureGrid);
    panel("spendingNature", "#insightsNatureGrid", "Fixas e variáveis");
    panel("merchantsPanel", "#insights", "Estabelecimentos");
    panel("subscriptionsPanel", "#insightsNatureGrid", "Subscrições");
    panel("importHistory", "#review", "Importações");
    panel("transferReview", "#review", "Transferências");
    panel("wealthEvolution", "#wealth", "Evolução");
    const activity = document.createElement("section");
    activity.className = "view";
    activity.id = "activity";
    activity.innerHTML =
      '<div class="section-head"><div><h2>Histórico e recuperação</h2><p>Consulta alterações e recupera registos apagados.</p></div></div><div class="report-grid"><section class="panel"><h2>Últimas alterações</h2><div id="activityList"></div></section><section class="panel"><h2>Registos apagados</h2><div id="trashList"></div></section></div>';
    $("#mainContent").append(activity);
    const nav = document.createElement("button");
    nav.className = "nav-link";
    nav.dataset.view = "activity";
    nav.innerHTML = "↶ <span>Histórico</span>";
    nav.onclick = () => navigate("activity");
    $(".sidebar nav").append(nav);
    styleNav();
    const reminder = document.createElement("div");
    reminder.id = "backupReminder";
    reminder.className = "backup-reminder";
    $("#settings").prepend(reminder);
    $("#demoStart").onclick = onboarding;
    $("#reports .header-actions").insertAdjacentHTML(
      "beforeend",
      button("Imprimir resumo", "monthly-report"),
    );
    const print = document.createElement("section");
    print.id = "printReport";
    document.body.append(print);
    window.addEventListener("afterprint", () =>
      document.body.classList.remove("printing-report"),
    );
    $("#settings .settings-grid").insertAdjacentHTML(
      "beforeend",
      '<article class="panel"><h2>Atalhos</h2><p><kbd>N</kbd> Novo movimento · <kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd> Mudar mês · <kbd>Ctrl</kbd> + <kbd>K</kbd> Pesquisar</p>' +
        button("Configuração inicial", "onboard") +
        button("Histórico e recuperação", "open-activity") +
        "</article>",
    );
    document.addEventListener("keydown", (e) => {
      if (
        $("#modal").open ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
      )
        return;
      if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        transactionForm();
      }
      if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        month = P.monthAdd(month, e.key === "ArrowLeft" ? -1 : 1);
        $("#monthPicker").value = month;
        renderAll();
      }
    });
    Object.assign(actions, {
      duplicate: duplicate,
      split: split,
      refund: refund,
      "edit-pending": editPending,
      archive: archive,
      pair: (id) => {
        const [out, incoming] = id.split("~");
        confirmAction(
          "Confirmar transferência",
          "Os saldos ficam iguais. A entrada e a saída passam a contar como uma transferência, sem inflacionar receitas ou despesas.",
          () => P.pairTransfer(data, out, incoming),
        );
      },
      unpair: (id) =>
        confirmAction(
          "Separar transferência",
          "Recuperar a entrada e a saída originais, mantendo os saldos?",
          () => P.separateTransfer(data, id),
        ),
      "undo-import": (id) =>
        confirmAction(
          "Desfazer importação",
          "Os movimentos desta importação serão removidos e os saldos corrigidos. Os registos removidos ficam disponíveis para recuperação.",
          () => P.undoImport(data, id),
        ),
      "restore-deleted": (id) =>
        confirmAction(
          "Recuperar registo",
          "O movimento recuperado volta a ter efeito nos saldos, quando aplicável.",
          () => P.restoreDeleted(data, id),
        ),
      snapshot: () => commit(() => P.snapshot(data), "Património registado."),
      "monthly-report": monthlyReport,
      onboard: onboarding,
      "backup-now": exportBackup,
      "open-activity": () => navigate("activity"),
    });
  }
  // Explicit render hook; the application owns the only save path and ledger.
  const renderAll = () => window.renderEquilibrio();
  window.FeatureUI = {
    renderRecovery,
    refreshSelection: renderBulk,
    render,
    transactionActions,
    selection,
    budget,
    goal,
    recurring,
    smartInsightsHTML,
  };
  init();
  renderAll();
})();

/* Product shell: five areas, transparent spending estimate and isolated scenarios. */
(function () {
  const P = FinancePlus;
  const groups = [
    { name: "Resumo", icon: "dashboard", pages: [["dashboard", "Resumo"], ["insights", "Análise"], ["reports", "Fecho e relatórios"]] },
    {
      name: "Movimentos",
      icon: "transactions",
      pages: [
        ["transactions", "Movimentos"],
      ],
    },
    {
      name: "Planeamento",
      icon: "budgets",
      pages: [
        ["planner", "Agenda"],
        ["plansHub", "Planos"],
      ],
    },
    {
      name: "Património",
      icon: "wealth",
      pages: [
        ["wealth", "Visão geral"],
        ["wealthMoneyHub", "Contas e créditos"],
        ["wealthHoldingsHub", "Bens e investimentos"],
      ],
    },
    {
      name: "Casa",
      icon: "transactions",
      pages: [
        ["casaHome", "Resumo"],
        ["casaPurchases", "Compras"],
        ["casaShopping", "Lista de compras"],
        ["casaProducts", "Produtos"],
        ["casaStock", "Despensa / Stock"],
        ["casaStores", "Supermercados"],
        ["casaAnalytics", "Análises de consumo"],
        ["casaRecipes", "Receitas"],
        ["casaMeals", "Refeições"],
        ["casaPrices", "Preços"],
      ],
    },
    { name: "Dados", icon: "review", pages: [["dataHub", "Dados"], ["review", "Importações"]] },
  ];
  const plansHub = document.createElement("section");
  plansHub.id = "plansHub";
  plansHub.className = "view plans-hub";
  $("#mainContent").append(plansHub);
  plansHub.innerHTML = '<div class="section-head"><div><h2>Planos</h2><p>Objetivos, limites mensais e reservas no mesmo local.</p></div></div><div class="plans-hub-overview" id="plansHubOverview"></div><div class="plans-hub-grid" id="plansHubGrid"></div><div class="plans-hub-sections" id="plansHubSections"></div>';
  const planDetails = [
    ["goals", "Objetivos", "Metas de poupança e progresso até ao valor pretendido."],
    ["budgets", "Orçamentos", "Limites de despesa aplicados ao mês selecionado."],
    ["planningPlus", "Reservas", "Provisões e preparação de despesas futuras."],
  ];
  for (const [id, title, detail] of planDetails) {
    const disclosure = document.createElement("details");
    disclosure.className = "plans-hub-detail";
    disclosure.dataset.planDetail = id;
    disclosure.innerHTML = '<summary><span><b>' + title + '</b><small>' + detail + '</small></span><span class="plans-hub-detail-toggle">Abrir</span></summary>';
    disclosure.append($("#" + id));
    $("#plansHubSections").append(disclosure);
    disclosure.addEventListener("toggle", () => {
      disclosure.querySelector(".plans-hub-detail-toggle").textContent = disclosure.open ? "Fechar" : "Abrir";
    });
  }
  const planManagerDialog = document.createElement("dialog");
  planManagerDialog.id = "planManagerDialog";
  planManagerDialog.className = "plan-manager-dialog";
  planManagerDialog.innerHTML = '<div class="plan-manager-shell"><header class="plan-manager-head"><div><p class="eyebrow">PLANEAMENTO</p><h2 id="planManagerTitle">Plano</h2><p id="planManagerHint"></p></div><button type="button" class="plan-manager-close" aria-label="Fechar">×</button></header><div id="planManagerBody" class="plan-manager-body"></div></div>';
  document.body.append(planManagerDialog);
  let openPlanId = "";
  const planMeta = Object.fromEntries(planDetails.map(([id, title, detail]) => [id, { title, detail }]));
  const restoreOpenPlan = () => {
    if (!openPlanId) return;
    const section = document.getElementById(openPlanId);
    const holder = plansHub.querySelector('[data-plan-detail="' + openPlanId + '"]');
    if (section && holder) holder.append(section);
    openPlanId = "";
  };
  function openPlanManager(id) {
    const section = document.getElementById(id);
    const meta = planMeta[id];
    const body = planManagerDialog.querySelector("#planManagerBody");
    if (!section || !meta || !body) return;
    if (openPlanId && openPlanId !== id) restoreOpenPlan();
    openPlanId = id;
    planManagerDialog.querySelector("#planManagerTitle").textContent = meta.title;
    planManagerDialog.querySelector("#planManagerHint").textContent = meta.detail;
    body.replaceChildren(section);
    if (!planManagerDialog.open) planManagerDialog.showModal();
    requestAnimationFrame(() => body.scrollTo({ top: 0, behavior: "auto" }));
  }
  planManagerDialog.querySelector(".plan-manager-close").onclick = () => planManagerDialog.close();
  planManagerDialog.addEventListener("cancel", (event) => { event.preventDefault(); planManagerDialog.close(); });
  planManagerDialog.addEventListener("close", restoreOpenPlan);
  function managerDialog(id,title,hint) {
    const dialog=document.createElement('dialog');dialog.id=id;dialog.className='plan-manager-dialog practical-manager';
    dialog.setAttribute('aria-labelledby',id+'Title');
    dialog.innerHTML='<div class="plan-manager-shell"><header class="plan-manager-head"><div><h2 id="'+id+'Title">'+title+'</h2><p>'+hint+'</p></div><button type="button" class="plan-manager-close manager-close-light" aria-label="Fechar '+title.toLowerCase()+'">×</button></header><div class="plan-manager-body"></div></div>';
    dialog.querySelector('button').onclick=()=>dialog.close();document.body.append(dialog);return dialog;
  }
  const subscriptionsManager=managerDialog('subscriptionsManagerDialog','Gerir subscrições','Serviços, cobranças e utilização. Edita cada serviço através do menu ⋯.');
  const agendaSubscriptions=document.createElement('div');agendaSubscriptions.id='agendaSubscriptionsPreview';agendaSubscriptions.className='agenda-subscriptions-integrated';subscriptionsManager.querySelector('.plan-manager-body').append(agendaSubscriptions);
  const historyManager=managerDialog('historyManagerDialog','Histórico e recuperação','Consulta alterações ou recupera registos apagados.');
  historyManager.querySelector('.plan-manager-body').append(document.getElementById('activity'));
  function openSubscriptionsManager(){mountUnifiedSections();if(!subscriptionsManager.open)subscriptionsManager.showModal();}
  function openHistoryManager(){window.FeatureUI.renderRecovery();if(!historyManager.open)historyManager.showModal();}
  window.PlanningManagerUI=Object.freeze({openSubscriptions:openSubscriptionsManager,openHistory:openHistoryManager,openPlan:openPlanManager});
  const historyButton=document.createElement('button');historyButton.type='button';historyButton.id='openMovementHistory';historyButton.className='secondary';historyButton.textContent='Histórico e recuperação';historyButton.onclick=openHistoryManager;
  document.querySelector('#transactions .movement-create-actions')?.append(historyButton);
  // A lista mensal fecha a página, depois do contexto das subscrições.
  const wealthMoneyHub = document.createElement("section");
  wealthMoneyHub.id = "wealthMoneyHub";
  wealthMoneyHub.className = "view wealth-combined-view";
  wealthMoneyHub.innerHTML = '<div class="section-head"><div><h2>Contas e créditos</h2><p>Saldos disponíveis e compromissos de financiamento juntos.</p></div></div><nav class="wealth-section-nav" aria-label="Secções de contas e créditos"><button type="button" data-wealth-jump="accounts">Contas</button><button type="button" data-wealth-jump="debts">Créditos</button></nav>';
  wealthMoneyHub.append($("#accounts"), $("#debts"));
  $("#mainContent").append(wealthMoneyHub);
  const wealthHoldingsHub = document.createElement("section");
  wealthHoldingsHub.id = "wealthHoldingsHub";
  wealthHoldingsHub.className = "view wealth-combined-view";
  wealthHoldingsHub.innerHTML = '<div class="section-head"><div><h2>Bens e investimentos</h2><p>Avaliações, posições e operações no mesmo local.</p></div></div><nav class="wealth-section-nav" aria-label="Secções de bens e investimentos"><button type="button" data-wealth-jump="assetsHub">Bens e avaliações</button><button type="button" data-wealth-jump="investmentsHub">Investimentos</button></nav>';
  $("#mainContent").append(wealthHoldingsHub);
  const wealthLegacyRoute = { accounts: "wealthMoneyHub", debts: "wealthMoneyHub", assetsHub: "wealthHoldingsHub", investmentsHub: "wealthHoldingsHub" };
  const planLegacyRoute = { goals: "plansHub", budgets: "plansHub", planningPlus: "plansHub" };
  function mountUnifiedSections() {
    const fullSubscriptions = document.querySelector("#subscriptionsHub .life-content");
    if (fullSubscriptions && fullSubscriptions.parentElement !== agendaSubscriptions) {
      agendaSubscriptions.append(fullSubscriptions);
    }
    for (const id of ["assetsHub", "investmentsHub"]) {
      const section = document.getElementById(id);
      if (section && section.parentElement !== wealthHoldingsHub) wealthHoldingsHub.append(section);
    }
  }
  mountUnifiedSections();
  $("#plansHubGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan-open]");
    if (!button) return;
    openPlanManager(button.dataset.planOpen);
  });
  for (const hub of [wealthMoneyHub, wealthHoldingsHub]) {
    hub.addEventListener("click", (event) => {
      const button = event.target.closest("[data-wealth-jump]");
      const target = button && document.getElementById(button.dataset.wealthJump);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  // v0.39.16 — a área “Dados” passa a funcionar como um dashboard único, com
  // Caixa de entrada + Qualidade de dados visíveis na mesma página.
  // Mantemos os IDs históricos dos painéis para que atalhos e ações antigas continuem válidos.
  const dataHub = document.createElement("section");
  dataHub.id = "dataHub";
  dataHub.className = "view data-hub";
  dataHub.innerHTML = `
    <div class="data-hub-head">
      <div class="data-hub-intro">
        <h2>Dados</h2>
        <p>Importa, valida e mantém a qualidade da tua informação financeira.</p>
      </div>
      <div class="data-hub-tools">
        <span class="data-period-pill" id="dataPeriodLabel">Mês selecionado</span>
        <div class="data-hub-summary" aria-live="polite">
          <span><b id="dataInboxCount">0</b> pendentes</span>
          <span><b id="dataQualityCount">0</b> pontos de qualidade</span>
        </div>
      </div>
    </div>
    <div class="data-hub-tabs" role="tablist" aria-label="Organizar dados"><button type="button" id="dataInboxTab" role="tab" aria-controls="inboxHub" data-data-section="inbox">Caixa de entrada <span id="dataInboxBadge">0</span></button><button type="button" id="dataQualityTab" role="tab" aria-controls="qualityHub" data-data-section="quality">Qualidade <span id="dataQualityBadge">0</span></button></div>
    <div class="data-hub-body">
      <section id="inboxHub" class="data-hub-pane" data-data-pane="inbox" role="tabpanel" aria-labelledby="dataInboxTab"></section>
      <section id="qualityHub" class="data-hub-pane" data-data-pane="quality" role="tabpanel" aria-labelledby="dataQualityTab"></section>
    </div>`;
  $("#mainContent").append(dataHub);
  let dataHubSection = (() => {
    try {
      const value = localStorage.getItem("equilibrioDataHubSection");
      return value === "quality" ? "quality" : "inbox";
    } catch { return "inbox"; }
  })();
  function showDataHub(section = dataHubSection, focus = false) {
    dataHubSection = section === "quality" ? "quality" : "inbox";
    try { localStorage.setItem("equilibrioDataHubSection", dataHubSection); } catch {}
    dataHub.querySelectorAll("[data-data-section]").forEach((button) => {
      const active = button.dataset.dataSection === dataHubSection;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
      if (focus && active) button.focus({ preventScroll: true });
    });
    dataHub.querySelectorAll("[data-data-pane]").forEach((pane) => {
      const active = pane.dataset.dataPane === dataHubSection;
      pane.classList.toggle("active", active);
      pane.hidden = !active;
    });
    if (focus) {
      const targetPane = dataHub.querySelector(`[data-data-pane="${dataHubSection}"]`);
      // Mantém o separador e o cabeçalho visíveis ao mudar de painel.
    }
  }
  function refreshDataHub() {
    let inboxCount = 0, qualityCount = 0;
    try { inboxCount = PlanningFinance.reviewInbox(data, month).active.length; } catch {}
    try { qualityCount = LifeFinance.quality(data, month).issues.length; } catch {}
    for (const id of ["dataInboxCount", "dataInboxBadge"]) { const el = document.getElementById(id); if (el) el.textContent = inboxCount; }
    for (const id of ["dataQualityCount", "dataQualityBadge"]) { const el = document.getElementById(id); if (el) el.textContent = qualityCount; }
    const period = document.getElementById("dataPeriodLabel");
    if (period) period.textContent = monthLabel(month);
  }
  dataHub.addEventListener("click", (event) => {
    const button = event.target.closest("[data-data-section]");
    if (button) showDataHub(button.dataset.dataSection, true);
  });
  dataHub.addEventListener("keydown", event => {
    const tab = event.target.closest("[data-data-section]");
    if (!tab || !["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault(); showDataHub(event.key === "Home" ? "inbox" : event.key === "End" ? "quality" : dataHubSection === "inbox" ? "quality" : "inbox", true);
  });
  window.DataHub = {
    pane(section) { return dataHub.querySelector(`[data-data-pane="${section === "quality" ? "quality" : "inbox"}"]`); },
    show(section, focus = false) { showDataHub(section, focus); },
    refresh: refreshDataHub,
    current() { return dataHubSection; },
  };
  showDataHub(dataHubSection);

  // v0.39.20 — navegação principal no topo. A antiga sidebar fica apenas como
  // contentor legado oculto para preservar IDs/eventos sem ocupar largura no ecrã.
  const oldSidebar = document.querySelector(".sidebar");
  const oldNav = oldSidebar?.querySelector("nav");
  const originals = new Map(
    $$(".sidebar [data-view]").map((el) => [el.dataset.view, el]),
  );
  const topbar = document.createElement("div");
  topbar.id = "appTopbar";
  topbar.className = "app-topbar";
  topbar.innerHTML = `
    <a class="top-brand" href="#dashboard" aria-label="Equilíbrio · Resumo"><img src="Equilibrio.png" data-source-icon="Equilibrio.ico" alt="" aria-hidden="true"><b>Equilíbrio</b></a>
    <nav class="top-primary-nav" aria-label="Navegação principal"></nav>
    <div class="topbar-tools">
      <div id="topFinanceSlot" class="top-finance-slot" aria-label="Atalhos financeiros"></div>
      <div id="topSearchSlot" class="top-search-slot"></div>
      <div id="topSpaceSlot" class="top-space-slot"></div>
      <button type="button" class="top-settings-button" aria-label="Definições" title="Definições">⚙</button>
    </div>`;
  document.body.insertBefore(topbar, document.getElementById("mainContent"));
  const topFinanceSlot = topbar.querySelector("#topFinanceSlot");
  const undoButton = document.getElementById("undo");
  if (undoButton) topFinanceSlot.append(undoButton);
  topbar.querySelector(".top-brand").onclick = (event) => { event.preventDefault(); navigate("dashboard"); };
  topbar.querySelector(".top-settings-button").onclick = () => navigate("settings");
  const nav = topbar.querySelector(".top-primary-nav");
  const tabs = document.createElement("nav");
  tabs.className = "area-tabs";
  tabs.setAttribute("aria-label", "Páginas desta área");
  $(".workspace-bar")?.after(tabs);
  if (!tabs.isConnected) $("#mainContent").prepend(tabs);
  const subtabs = document.createElement("nav");
  subtabs.className = "area-subtabs";
  subtabs.setAttribute("aria-label", "Secções da página");
  tabs.after(subtabs);
  groups.forEach((g) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "top-nav-link area-link";
    b.dataset.area = g.name;
    b.dataset.view = g.pages[0][0];
    b.innerHTML = "<span>" + g.name + "</span>";
    b.onclick = () => navigate(g.pages[0][0]);
    nav.append(b);
  });
  // Retain legacy selectors/event hooks without showing the old navigation.
  if (oldNav) {
    const legacy = document.createElement("div");
    legacy.hidden = true;
    legacy.id = "legacyNavigation";
    for (const el of originals.values()) legacy.append(el);
    oldNav.replaceChildren(legacy);
  }

  // As ações raras saem da navegação e vivem em Definições → Manutenção e dados.
  const settingsGrid = document.querySelector("#settings .settings-grid");
  if (settingsGrid && !document.getElementById("maintenanceDataPanel")) {
    const maintenance = document.createElement("article");
    maintenance.className = "panel settings-maintenance-panel";
    maintenance.id = "maintenanceDataPanel";
    maintenance.innerHTML = `
      <div class="settings-maintenance-heading">
        <div><h2>Manutenção e dados</h2><p>Atualizações, exportações e recuperação. Ferramentas usadas apenas pontualmente.</p></div>
        <span class="settings-maintenance-badge">Sistema</span>
      </div>
      <div id="maintenancePrimaryActions" class="settings-maintenance-actions"></div>
      <details class="settings-maintenance-more">
        <summary>Outras ferramentas</summary>
        <div id="maintenanceSecondaryActions" class="settings-maintenance-actions secondary-actions"></div>
      </details>`;
    const dataPanel = Array.from(settingsGrid.children).find((el) => el.querySelector?.("#backupSettings"));
    if (dataPanel?.nextSibling) settingsGrid.insertBefore(maintenance, dataPanel.nextSibling);
    else settingsGrid.append(maintenance);
    const primaryActions = maintenance.querySelector("#maintenancePrimaryActions");
    const secondaryActions = maintenance.querySelector("#maintenanceSecondaryActions");
    [
      ["desktopUpdateButton", "Atualizar aplicação", "Instalar uma atualização .fpupdate"],
      ["exportData", "Exportar dados", "Guardar uma cópia completa dos teus dados"],
      ["importData", "Restaurar cópia", "Recuperar dados a partir de uma cópia"],
    ].forEach(([id, title, help]) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.className = "settings-command secondary maintenance-command";
      button.innerHTML = "<span>" + title + "</span><small>" + help + "</small>";
      primaryActions.append(button);
    });
    const csv = document.getElementById("importCsv");
    if (csv) {
      csv.className = "settings-command secondary maintenance-command";
      csv.innerHTML = "<span>Importar extrato CSV</span><small>Importação manual técnica de movimentos</small>";
      secondaryActions.append(csv);
    }
    const resetShortcut = document.getElementById("resetData");
    if (resetShortcut) resetShortcut.remove();
  }
  const planningSections = [
    { label: "Agenda", first: "planner", pages: [["planner", "Compromissos"]] },
    { label: "Planos", first: "plansHub", pages: [["plansHub", "Planos"]] },
    { label: "Decisões", first: "decisionsHub", pages: [["decisionsHub", "Decisões"]] },
  ];
  function addAreaTab(host, id, label, current) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    const description = {Agenda:"Compromissos e subscrições",Planos:"Objetivos, limites e reservas",Decisões:"Simular antes de gastar"}[label];
    if (description) b.title = description;
    b.className = current ? "active" : "";
    b.setAttribute("aria-current", current ? "page" : "false");
    b.onclick = () => navigate(id);
    host.append(b);
  }
  function renderPlansHub() {
    $("#plansHubOverview").innerHTML='<p>Objetivos e reservas identificam dinheiro nas contas; orçamentos limitam a despesa. Estes valores podem sobrepor-se e não são somados.</p>';
    for (const [id] of planDetails) {
      const detail = plansHub.querySelector('[data-plan-detail="' + id + '"]');
      const count = id === "goals" ? (data.goals || []).length : id === "budgets" ? (data.budgets || []).length : (data.reserves || []).length;
      detail.querySelector("summary b, .context-section-title b").textContent = id === "goals" ? `Objetivos · ${count}` : id === "budgets" ? `Orçamentos · ${count}` : `Reservas · ${count}`;
    }
  }
  let renderingOverview = false;
  function navigation(v) {
    $("#addTransaction").hidden = v !== "dashboard";
    if (v === "subscriptionsHub") {
      navigate("planner");
      openSubscriptionsManager();
      return;
    }
    if(v==='activity'){navigate('transactions');openHistoryManager();return;}
    if(subscriptionsManager.open&&v!=='planner')subscriptionsManager.close();
    if(historyManager.open&&v!=='transactions')historyManager.close();
    const route = planLegacyRoute[v] || wealthLegacyRoute[v] || v;
    if (route !== v) {
      const host = document.getElementById(route);
      host?.classList.add("active");
      if (planLegacyRoute[v]) {
        setTimeout(() => openPlanManager(v), 0);
      }
    }
    const g = groups.find((g) => g.pages.some((p) => p[0] === route)) || (v === "cashflow" ? groups[0] : null);
    $$(".area-link").forEach((b) => {
      const current = b.dataset.area === g?.name;
      b.classList.toggle("active", current);
      b.setAttribute("aria-current", current ? "page" : "false");
    });
    const settingsButton = topbar.querySelector(".top-settings-button");
    settingsButton.classList.toggle("active", v === "settings");
    settingsButton.setAttribute("aria-current", v === "settings" ? "page" : "false");
    tabs.replaceChildren();
    subtabs.replaceChildren();
    if (g?.name === "Planeamento") {
      const section = planningSections.find((entry) => entry.pages.some(([id]) => id === route)) || planningSections[0];
      planningSections.forEach((entry) => addAreaTab(tabs, entry.first, entry.label, entry === section));
      section.pages.forEach(([id, label]) => addAreaTab(subtabs, id, label, id === route));
      subtabs.hidden = section.pages.length < 2;
    } else {
      g?.pages.forEach(([id, label]) => addAreaTab(tabs, id, label, id === route));
      subtabs.hidden = true;
    }
    tabs.hidden = !g || (g.name !== "Planeamento" && g.pages.length === 1);
    if (g) $("#pageTitle").textContent = g.name;
    if (v === "settings") $("#pageTitle").textContent = "Definições";
    if (route === "plansHub") renderPlansHub();
    if (v === "planner" || route === "wealthHoldingsHub") mountUnifiedSections();
    if (v === "dataHub") {
      refreshDataHub();
      showDataHub(dataHubSection);
    }
    if (!renderingOverview && ['dashboard','reports'].includes(v)) render(true);
  }
  const summary = document.createElement("section");
  summary.className = "decision-panel";
  summary.id = "decisionPanel";
  $("#dashboard").prepend(summary);
  const inbox = document.createElement("section");
  inbox.className = "panel attention-panel";
  inbox.id = "attentionPanel";
  summary.after(inbox);
  const smartSummary = document.createElement("section");
  smartSummary.className = "panel smart-summary-panel";
  smartSummary.id = "smartSummaryPanel";
  document.querySelector("#dashboard .dashboard-grid")?.before(smartSummary);
  const closing = document.createElement("section");
  closing.className = "panel";
  closing.id = "closingGuide";
  $("#reports .month-close").before(closing);
  function tasks() {
    const items = [];
    const unresolved = data.reconciliations.filter((r) => {
      try {
        return (
          F.money(
            r.actual - FinancePlus.balanceAt(data, r.accountId, r.date),
          ) !== 0
        );
      } catch {
        return false;
      }
    });
    if (unresolved.length)
      items.push({
        title: unresolved.length + " conferências com diferença",
        detail: "Compara os valores do extrato com os movimentos disponíveis.",
        route: "accounts",
      });
    const unc = data.transactions.filter(
      (t) =>
        t.date.startsWith(month) &&
        t.type === "expense" &&
        (!t.category || t.category === "Outros") &&
        !t.splits,
    );
    if (unc.length)
      items.push({
        title: unc.length + " despesas para rever",
        detail: "Confirma a categoria dos movimentos classificados em Outros.",
        route: "transactions",
      });
    if (data.pendingImports?.length)
      items.push({
        title: "Importação por confirmar",
        detail: "Revê os movimentos antes de os lançar.",
        route: "review",
      });
    const pairs = P.transferCandidates(data.transactions);
    if (pairs.length)
      items.push({
        title: pairs.length + " possíveis transferências",
        detail: "Confirma se as entradas e saídas pertencem à mesma operação.",
        route: "review",
      });
    const late = data.pendingPayments.filter((t) => t.date < F.today());
    if (late.length)
      items.push({
        title: late.length + " compromissos em atraso",
        detail: "Confirma o pagamento ou corrige a data.",
        route: "planner",
      });
    const accounts = data.accounts.filter(
      (a) => !a.archived && !a.reconciledOn,
    );
    if (accounts.length)
      items.push({
        title: accounts.length + " contas sem saldo confirmado",
        detail: "Compara o saldo atual com o teu banco.",
        route: "accounts",
      });
    if (
      !(window.DailyUI?.lastExport(key) || data.lastBackup) ||
      Date.now() -
        new Date(window.DailyUI?.lastExport(key) || data.lastBackup).getTime() >
        7 * 86400000
    )
      items.push({
        title: "Guardar uma cópia dos dados",
        detail:
          "A recuperação local não protege contra a limpeza do navegador.",
        backup: true,
      });
    return items;
  }
  function taskRows(items) {
    return (
      items
        .map(
          (x, i) =>
            `<div class="attention-row"><div><b>${esc(x.title)}</b><p>${esc(x.detail)}</p></div><button type="button" class="secondary" data-task-index="${i}">${x.backup ? "Exportar" : "Rever"}</button></div>`,
        )
        .join("") ||
      '<p class="quiet-state">Tudo revisto. Não há tarefas detetadas neste momento.</p>'
    );
  }
  function bindTasks(host, items) {
    host.querySelectorAll("[data-task-index]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = items[+b.dataset.taskIndex];
          t.backup ? exportBackup() : navigate(t.route);
        }),
    );
  }
  function render(skipNavigation = false) {
    if (window.equilibrioStartup?.awaitingChoice) return;
    if (!['dashboard','reports'].includes(view)) { if (!skipNavigation) (window.PremiumUI?.navigation || navigation)(view); return; }
    renderingOverview = true;
    try {
    const margin = Number.isFinite(data.safetyMargin) ? data.safetyMargin : 0;
    const room = P.spendingRoom(data, margin);
    const accountBalances = (data.accounts || []).map((a) => `<div class="decision-account"><span>${esc(a.name)}</span><strong>${eur(a.balance || 0)}</strong></div>`).join("") || '<p class="muted">Ainda não existem contas.</p>';
    summary.innerHTML = `<div class="decision-copy"><p class="eyebrow">OS PRÓXIMOS 30 DIAS</p><h2>Quanto posso gastar?</h2><strong class="spending-number">${eur(Math.max(0, room.available))}</strong><p>${room.available < 0 ? "Faltam " + eur(-room.available) + " para cobrir a margem e os valores reservados." : "Estimativa após compromissos conhecidos e dinheiro reservado."}</p><div class="decision-actions"><button type="button" class="primary" id="simulateDecision">Simular uma decisão</button><button type="button" class="secondary" id="adjustMargin">Definir margem</button></div><details class="decision-explanation"><summary>Como é calculado este valor?</summary><div class="calculation"><dl><div><dt>Saldo atual</dt><dd>${eur(room.cash)}</dd></div><div><dt>Queda máxima prevista</dt><dd>− ${eur(room.commitments)}</dd></div><div><dt>Objetivos e reservas</dt><dd>− ${eur(room.reserved)}</dd></div><div><dt>Margem de segurança</dt><dd>− ${eur(room.margin)}</dd></div></dl><button type="button" class="link-button" id="explainForecast">Consultar compromissos →</button></div></details></div><aside class="decision-accounts"><div class="decision-accounts-head"><span>Saldo por conta</span><b>${eur(room.cash)}</b></div>${accountBalances}</aside>`;
    let upcoming = document.getElementById("dashboardUpcoming"); if (!upcoming) { upcoming = document.createElement("section"); upcoming.id="dashboardUpcoming"; upcoming.className="panel dashboard-upcoming"; summary.after(upcoming); }
    const forecast = P.forecast(data, 30).events || P.forecast(data, 30) || [];
    const next = Array.isArray(forecast) ? forecast.filter((x)=>["income","expense"].includes(x.type)).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,6) : [];
    upcoming.innerHTML = `<div class="panel-heading"><div><h2>Próximos movimentos</h2><p>Pagamentos e receitas previstos nos próximos 30 dias</p></div><button type="button" class="link-button" id="openAgenda">Ver agenda →</button></div><div class="upcoming-list">${next.length ? next.map((x)=>`<div class="upcoming-row"><div><b>${esc(x.description || "Movimento previsto")}</b><span>${dateLabel(x.date)} · ${esc(x.source || "Agenda")}</span></div><strong class="amount ${x.type}">${x.type === "expense" ? "−" : "+"}${eur(x.amount)}</strong></div>`).join("") : '<p class="quiet-state">Sem movimentos previstos nos próximos 30 dias.</p>'}</div>`;
    $("#openAgenda").onclick = () => navigate("cashflow");
    $("#simulateDecision").onclick = scenario;
    $("#explainForecast").onclick = () => navigate("cashflow");
    $("#adjustMargin").onclick = () =>
      form(
        "Margem de segurança",
        number("Valor a manter disponível (€)", "margin", margin),
        (f) =>
          commit(() => {
            const n = +f.get("margin");
            if (!Number.isFinite(n) || n < 0)
              throw Error("Indica uma margem válida.");
            data.safetyMargin = n;
          }, "Margem atualizada."),
        "Este valor é descontado da estimativa. Não cria movimentos nem transfere dinheiro.",
      );
    const items = tasks();
    inbox.innerHTML =
      '<div class="section-head"><h2>A tua atenção</h2><span>' +
      items.length +
      " tarefas</span></div>" +
      taskRows(items);
    bindTasks(inbox, items);
    const dashboardInsights = P.insights(data, month);
    smartSummary.innerHTML =
      '<div class="panel-heading"><div><h2>Leituras deste mês</h2><p>O que merece atenção sem teres de interpretar todos os números.</p></div><button type="button" class="link-button" id="openSmartInsights">Ver análises →</button></div>' +
      window.FeatureUI.smartInsightsHTML(dashboardInsights, true);
    $("#openSmartInsights").onclick = () => navigate("insights");
    const monthly = data.transactions.filter((t) => t.date.startsWith(month));
    const seenMonthly=new Set(),duplicates=[];
    for(const t of monthly){const token=JSON.stringify([t.date,t.amount,t.account,t.type,t.description.toLowerCase()]);if(seenMonthly.has(token))duplicates.push(t);else seenMonthly.add(token);}
    const review = items.filter(
      (t) => t.route === "transactions" || t.route === "review",
    );
    if (duplicates.length)
      review.push({
        title: duplicates.length + " possíveis duplicados",
        detail:
          "Compara os movimentos com o extrato; não são apagados automaticamente.",
        route: "transactions",
      });
    closing.innerHTML =
      '<p class="eyebrow">FECHO DO MÊS</p><h2>Preparar fecho do mês</h2><p>1. Revê categorias e possíveis duplicados. 2. Confirma os saldos atuais em Contas. 3. Consulta os orçamentos. 4. Exporta uma cópia e fecha o mês no controlo abaixo.</p>' +
      taskRows(review) +
      '<p class="quiet-state">' +
      (data.closedMonths.includes(month)
        ? "Este mês está fechado."
        : "O fecho protege os movimentos; não certifica saldos históricos nem elimina diferenças por resolver.") +
      "</p>";
    bindTasks(closing, review);
    const controls = document.createElement("div");
    controls.className = "decision-actions";
    for (const [label, action] of [
      ["Confirmar saldos", () => navigate("accounts")],
      ["Rever orçamentos", () => navigate("budgets")],
      ["Exportar cópia", exportBackup],
      [
        data.closedMonths.includes(month)
          ? "Reabrir este mês"
          : "Fechar este mês",
        () => $("#closeMonth").click(),
      ],
    ]) {
      const b = document.createElement("button");
      b.className = "secondary";
      b.textContent = label;
      b.onclick = action;
      controls.append(b);
    }
    closing.append(controls);
    if (!skipNavigation) (window.PremiumUI?.navigation || navigation)(view);
    } finally { renderingOverview = false; }
  }
  function scenario() {
    form(
      "Experimentar uma decisão",
      number("Valor (€)", "amount", 100) +
        field("Data", "date", F.today(), "date", "required") +
        select(
          "Tipo",
          "type",
          [
            ["expense", "Despesa adicional"],
            ["income", "Rendimento adicional"],
          ],
          "expense",
        ) +
        select(
          "Repetição",
          "repeat",
          [
            ["once", "Uma vez"],
            ["monthly", "Todos os meses"],
          ],
          "once",
        ),
      (f) => {
        const result = P.simulate(
          data,
          +f.get("amount"),
          f.get("date"),
          f.get("type"),
          f.get("repeat") === "monthly",
        );
        const protection=PlanningFinance.decisionImpact(data,{oneOff:f.get('repeat')==='monthly'?0:(f.get('type')==='income'?1:-1)*+f.get('amount'),monthlyDelta:f.get('repeat')==='monthly'?(f.get('type')==='income'?1:-1)*+f.get('amount'):0,date:f.get('date')});
        // Show a read-only result using the same modal, after the submitting form closes.
        setTimeout(
          () =>
            form(
              "Resultado da simulação",
              `<div class="scenario-result"><p>${protection.canSpend?"Reservas e margem mantidas":"Reservas ou margem comprometidas em "+eur(protection.compromised)}</p><p>Disponibilidade após a decisão: ${eur(protection.availableAfter)}</p><p>Saldo ao fim de 90 dias</p><strong>${eur(result.scenario.end)}</strong><p>Sem esta decisão: ${eur(result.base.end)}</p><p>Diferença: ${eur(F.money(result.scenario.end - result.base.end))}</p><p>Menor saldo previsto: ${eur(result.scenario.min)}</p><p>${result.scenario.firstNegative ? "Primeiro saldo negativo: " + dateLabel(result.scenario.firstNegative) : "Sem saldo negativo nos compromissos conhecidos."}</p></div>`,
              () => true,
              "Simulação isolada. Não foram guardados movimentos nem alterados os teus saldos.",
              "Concluir",
            ),
          0,
        );
        return true;
      },
      "Compara os próximos 90 dias. Uma prestação existente já incluída na previsão não deve ser acrescentada novamente.",
      "Simular",
    );
  }
  window.PremiumUI = {
    navigation,
    render,
    addPage(area, id, label) {
      if (area === "Análises") area = "Resumo";
      const group = groups.find((g) => g.name === area);
      if (group && !group.pages.some((p) => p[0] === id)) {
        if (area === "Planeamento" && id === "subscriptionsHub") {
          // A gestão completa é apresentada dentro dos Compromissos.
        } else if (area === "Património" && ["assetsHub", "investmentsHub"].includes(id)) {
          // Estas vistas mantêm os IDs históricos dentro de Bens e investimentos.
        } else if (area === "Análises" && id === "reviewMonthHub") {
          const reportIndex = group.pages.findIndex((p) => p[0] === "reports");
          group.pages.splice(Math.max(0, reportIndex), 0, [id, label]);
        } else group.pages.push([id, label]);
      }
      navigation(view);
    },
  };
  if (!window.equilibrioStartup?.awaitingChoice) render();
})();

/* Automatic file backups through a browser-approved directory. */
(function () {
  const prefsKey = "equilibrioFileBackupPrefs";
  const loadPrefs = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(prefsKey) || "{}");
      return {
        frequency: ["manual", "daily", "weekly"].includes(raw.frequency)
          ? raw.frequency
          : "daily",
        retention: Math.max(1, Math.min(100, Number(raw.retention) || 30)),
        lastBySpace:
          raw.lastBySpace && typeof raw.lastBySpace === "object"
            ? raw.lastBySpace
            : {},
      };
    } catch {
      return { frequency: "daily", retention: 30, lastBySpace: {} };
    }
  };
  let prefs = loadPrefs(),
    directory = null,
    queue = Promise.resolve(),
    status = "Escolhe uma pasta para as cópias automáticas.",
    enabled = false;

  const panel = document.createElement("section");
  panel.className = "panel file-protection-panel";
  panel.id = "fileProtection";
  panel.innerHTML =
    '<div class="file-protection-head"><div><h2>Cópias automáticas em ficheiro</h2><p>Escolhe uma pasta e define a frequência e quantas cópias manter. A escolha fica guardada neste navegador; se a permissão expirar, basta voltar a autorizar a mesma pasta.</p></div><span class="backup-support" id="backupSupportState"></span></div>' +
    '<div class="file-backup-settings"><label>Frequência<select id="fileBackupFrequency"><option value="manual">Manual</option><option value="daily">Diária</option><option value="weekly">Semanal</option></select></label><label>Cópias a manter<input id="fileBackupRetention" type="number" min="1" max="100" step="1"></label></div>' +
    '<p id="fileBackupStatus" class="file-backup-status" role="status"></p>' +
    '<div class="decision-actions file-backup-actions"><button type="button" class="primary" id="chooseBackupFolder">Escolher pasta</button><button type="button" class="secondary" id="backupFileNow">Fazer cópia agora</button><button type="button" class="secondary" id="pauseFileBackup">Desligar pasta</button><button type="button" class="secondary" id="verifyBackupFile">Verificar uma cópia</button></div>' +
    '<input hidden type="file" id="verifyBackupInput" accept="application/json,.json" />';
  $("#settings").prepend(panel);
  const nativeBackups = window.financasDesktop?.isDesktop === true;
  let folderRevision = 0;
  async function rememberedFolder(mode, value) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("equilibrio-backup-folder", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("settings");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("settings", mode === "get" ? "readonly" : "readwrite");
        const store = tx.objectStore("settings");
        const request = mode === "get" ? store.get("directory") : value ? store.put(value, "directory") : store.delete("directory");
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(tx.error || Error("Não foi possível guardar a pasta."));
      });
    } finally { db.close(); }
  }

  const activeSpace = () => {
    try {
      return window.LifeUI?.activeSpace?.() || {
        id: "main",
        name: data.spaceName || "Pessoal",
      };
    } catch {
      return { id: "main", name: data.spaceName || "Pessoal" };
    }
  };
  const savePrefs = () =>
    localStorage.setItem(prefsKey, JSON.stringify(prefs));
  const lastForSpace = () => prefs.lastBySpace[activeSpace().id] || "";
  const frequencyLabel = () =>
    ({ manual: "manual", daily: "diária", weekly: "semanal" })[
      prefs.frequency
    ];
  function show() {
    if (nativeBackups) return;
    const statusEl = $("#fileBackupStatus");
    const last = lastForSpace();
    const extra = last
      ? ` Última cópia deste espaço: ${new Date(last).toLocaleString("pt-PT")}.`
      : " Ainda não existe uma cópia automática registada deste espaço nesta configuração.";
    statusEl.textContent = `${status} Frequência ${frequencyLabel()} · manter ${prefs.retention} cópia${prefs.retention === 1 ? "" : "s"}.${extra}`;
    $("#pauseFileBackup").disabled = !directory;
    $("#backupFileNow").disabled = !enabled;
    $("#chooseBackupFolder").textContent = directory && !enabled ? "Autorizar pasta guardada" : directory ? "Alterar pasta" : "Escolher pasta";
    $("#backupSupportState").textContent = window.showDirectoryPicker
      ? enabled
        ? "Pasta ligada"
        : "Pasta desligada"
      : "Não suportado neste navegador";
  }
  function due() {
    if (prefs.frequency === "manual") return false;
    const last = Date.parse(lastForSpace());
    if (!Number.isFinite(last)) return true;
    const interval = prefs.frequency === "weekly" ? 7 * 864e5 : 864e5;
    return Date.now() - last >= interval;
  }
  function safePart(value) {
    return String(value || "espaco")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "espaco";
  }
  async function prune(folder, prefix) {
    if (!folder?.entries || !folder?.removeEntry) return;
    const matches = [];
    for await (const [name, handle] of folder.entries()) {
      if (handle.kind === "file" && name.startsWith(prefix) && name.endsWith(".json"))
        matches.push(name);
    }
    matches.sort().reverse();
    for (const name of matches.slice(prefs.retention)) {
      try {
        await folder.removeEntry(name);
      } catch {}
    }
  }
  async function write(snapshot, folder, manual = false) {
    const normalized = F.normalize(JSON.parse(snapshot));
    const space = activeSpace();
    const prefix = `equilibrio-auto-${safePart(space.name)}-`;
    const name =
      prefix + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    const handle = await folder.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(JSON.stringify(normalized, null, 2));
      await stream.close();
    } catch (e) {
      try {
        await stream.abort();
      } catch {}
      throw e;
    }
    const read = await (await handle.getFile()).text();
    const verified = F.normalize(JSON.parse(read));
    if (JSON.stringify(verified) !== JSON.stringify(normalized))
      throw Error("O ficheiro escrito não corresponde aos dados.");
    prefs.lastBySpace[space.id] = new Date().toISOString();
    savePrefs();
    await prune(folder, prefix);
    status = `${manual ? "Cópia manual" : "Cópia automática"} verificada · ${name}.`;
    show();
    return name;
  }
  function enqueue(snapshot, folder, manual = false) {
    queue = queue
      .then(() => {
        if (!enabled || directory !== folder)
          return undefined;
        return write(snapshot, folder, manual);
      })
      .catch((e) => {
        status =
          "A cópia falhou: " +
          e.message +
          ". Os dados continuam no navegador. Liga novamente a pasta para retomar.";
        enabled = false;
        show();
        notice(status, true);
      });
    return queue;
  }
  function saved(next) {
    if (!enabled || !directory || !due()) return;
    return enqueue(JSON.stringify(next), directory, false);
  }

  $("#fileBackupFrequency").value = prefs.frequency;
  $("#fileBackupRetention").value = prefs.retention;
  $("#fileBackupFrequency").onchange = (e) => {
    prefs.frequency = e.target.value;
    savePrefs();
    status = "Frequência atualizada.";
    show();
  };
  $("#fileBackupRetention").onchange = (e) => {
    prefs.retention = Math.max(1, Math.min(100, Number(e.target.value) || 30));
    e.target.value = prefs.retention;
    savePrefs();
    status = "Limite de cópias atualizado.";
    show();
  };
  $("#chooseBackupFolder").onclick = async () => {
    if (!window.showDirectoryPicker) {
      notice(
        "Este navegador não permite escolher uma pasta. Usa Exportar cópia de segurança para guardar ficheiros JSON manualmente.",
        true,
      );
      return;
    }
    try {
      folderRevision++;
      if (directory && !enabled) {
        if (await directory.requestPermission({ mode: "readwrite" }) !== "granted") {
          status = "A pasta continua guardada, mas falta autorizar a escrita."; show(); return;
        }
        enabled = true; status = "Pasta novamente autorizada."; show();
        await enqueue(JSON.stringify(data), directory, true); return;
      }
      const folder = await window.showDirectoryPicker({ mode: "readwrite" });
      directory = folder;
      enabled = true;
      try { await rememberedFolder("set", folder); status = "Pasta ligada e guardada para a próxima abertura."; }
      catch { status = "Pasta ligada. Este navegador não permitiu guardar a escolha para a próxima abertura."; }
      show();
      await enqueue(JSON.stringify(data), folder, true);
    } catch (e) {
      if (e.name !== "AbortError")
        notice("Não foi possível ligar a pasta: " + e.message, true);
    }
  };
  $("#backupFileNow").onclick = async () => {
    if (!enabled || !directory)
      return notice("Liga primeiro uma pasta para as cópias.", true);
    status = "A criar cópia…";
    show();
    await enqueue(JSON.stringify(data), directory, true);
  };
  $("#pauseFileBackup").onclick = async () => {
    folderRevision++;
    enabled = false;
    directory = null;
    status = "Pasta desligada. As preferências ficam guardadas, mas nenhuma cópia é criada até voltares a autorizar uma pasta.";
    show();
    try { await rememberedFolder("set", null); }
    catch (e) { notice("Não foi possível esquecer a pasta guardada: " + e.message, true); }
  };
  $("#verifyBackupFile").onclick = () => $("#verifyBackupInput").click();
  $("#verifyBackupInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const copy = F.normalize(JSON.parse(await file.text()));
      status =
        "Cópia válida: " +
        copy.accounts.length +
        " contas, " +
        copy.transactions.length +
        " movimentos e " +
        copy.reconciliations.length +
        " conferências. Os dados atuais não foram alterados.";
      show();
    } catch (e) {
      status = "Cópia inválida: " + e.message;
      show();
    } finally {
      $("#verifyBackupInput").value = "";
    }
  };
  window.FileProtection = { saved };
  show();
  if (!nativeBackups && window.showDirectoryPicker) {
    const revision = folderRevision;
    rememberedFolder("get").then(async folder => {
      if (!folder || revision !== folderRevision) return;
      const permission = await folder.queryPermission({ mode: "readwrite" });
      if (revision !== folderRevision) return;
      directory = folder; enabled = permission === "granted";
      status = enabled ? "Pasta guardada recuperada automaticamente." : "Pasta guardada. Clica em Autorizar pasta guardada para retomar as cópias.";
      show(); if (enabled) saved(data);
    }).catch(() => { if (revision === folderRevision) { status = "Não foi possível recuperar a pasta guardada. Escolhe a pasta para retomar."; show(); } });
  }
  const historyPanel = document.createElement("section");
  historyPanel.className = "panel reconciliation-history-panel";
  historyPanel.id = "reconciliationHistory";
  $("#accounts").append(historyPanel);
  const prior = window.PremiumUI.render;
  window.PremiumUI.render = () => {
    prior();
    const list = (data.reconciliations || []).slice().reverse();
    const matchCount = list.filter((r) => !r.difference).length;
    const diffCount = list.length - matchCount;
    historyPanel.innerHTML =
      '<div class="u-head reconciliation-head">' +
        '<div><p class="eyebrow">HISTÓRICO DE AUDITORIA</p><h2>Conferências de extrato</h2>' +
        '<p>Registos preservados no momento da conferência bancária. Alterações posteriores mostram a eventual diferença face ao saldo reconstruído.</p></div>' +
        '<div class="reconciliation-summary-pills">' +
          '<span class="reconcile-pill"><b>' + list.length + '</b> conferência(s)</span>' +
          '<span class="reconcile-pill is-ok"><b>' + matchCount + '</b> coincidente(s)</span>' +
          (diffCount ? '<span class="reconcile-pill is-warn"><b>' + diffCount + '</b> com diferença</span>' : '') +
        '</div>' +
      '</div>' +
      (list.length
        ? '<div class="u-table-scroll"><table class="u-table reconciliation-history-table"><thead><tr><th>Conta e data</th><th>Saldo no extrato</th><th>Calculado na conferência</th><th>Diferença na data</th><th>Estado atual</th></tr></thead><tbody>' +
          list
            .map((r) => {
              let current;
              try {
                current = FinancePlus.balanceAt(data, r.accountId, r.date);
              } catch {}
              const curDiff = current !== undefined ? F.money(r.actual - current) : null;
              const statusBadge = r.adjusted
                ? '<span class="reconcile-badge is-adjusted">Ajuste criado</span>'
                : r.difference
                  ? '<span class="reconcile-badge is-warn">Diferença sem ajuste</span>'
                  : '<span class="reconcile-badge is-ok">Saldos coincidentes</span>';
              return (
                '<tr class="reconciliation-history-row">' +
                  '<td><b>' + esc(r.accountName) + '</b><br><small class="muted">' + dateLabel(r.date) + '</small></td>' +
                  '<td class="amount"><b>' + eur(r.actual) + '</b></td>' +
                  '<td class="amount">' + eur(r.expected) + '</td>' +
                  '<td class="amount ' + (r.difference ? 'negative' : '') + '">' + eur(r.difference) + '</td>' +
                  '<td><div class="reconcile-state-cell">' + statusBadge +
                    '<small class="muted">' +
                      (curDiff !== null
                        ? (curDiff === 0 ? 'Saldo reconstruído coincide (0,00 €)' : 'Diferença atual: ' + eur(curDiff))
                        : 'Conta indisponível') +
                    '</small></div></td>' +
                '</tr>'
              );
            })
            .join("") +
          '</tbody></table></div>'
        : '<div class="reconciliation-empty"><p class="muted">Ainda não existem conferências de extrato registadas neste espaço financeiro.</p></div>');
  };
  if (!window.equilibrioStartup?.awaitingChoice) window.PremiumUI.render();
})();
