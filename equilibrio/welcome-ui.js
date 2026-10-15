/* Entry screen for financial spaces. Switching reuses the existing space API. */
(function () {
  "use strict";
  const topTools = document.querySelector(".topbar-tools");
  if (!topTools || !window.LifeUI) return;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "welcome-launcher";
  launcher.setAttribute("aria-label", "Escolher utilizador ou espaço financeiro");
  launcher.title = "Escolher utilizador";
  launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-1.5a7 7 0 0 1 14 0V20"/></svg>';
  const contextControls = document.createElement('div');
  contextControls.className = 'top-context-controls';
  contextControls.setAttribute('role', 'group');
  contextControls.setAttribute('aria-label', 'Espaço, utilizador e definições');
  const spaceControl = topTools.querySelector('#topSpaceSlot');
  const settingsControl = topTools.querySelector('.top-settings-button');
  topTools.append(contextControls);
  if (spaceControl) contextControls.append(spaceControl);
  contextControls.append(launcher);
  if (settingsControl) contextControls.append(settingsControl);

  const dialog = document.createElement("dialog");
  dialog.id = "welcomeDialog";
  dialog.className = "welcome-dialog";
  dialog.setAttribute("aria-labelledby", "welcomeTitle");
  document.body.append(dialog);

  const onboardingStyle = document.createElement("style");
  onboardingStyle.id = "welcomeOnboardingStyle";
  onboardingStyle.textContent = `
    .welcome-setup-form{display:grid;gap:14px;margin-top:8px}
    .welcome-setup-form label:not(.welcome-balance-choice):not(.welcome-explicit-check){display:grid;gap:6px;color:#4c6767;font-size:12px;font-weight:750}
    .welcome-setup-form input:not([type=radio]):not([type=checkbox]),.welcome-setup-form select{width:100%;min-height:42px;padding:9px 11px;border:1px solid #cfdfda;border-radius:10px;background:#fff;color:#1c3738;font-size:14px}
    .welcome-balance-choices{display:grid;gap:8px;margin:0;padding:0;border:0}
    .welcome-balance-choices legend{margin-bottom:8px;color:#4c6767;font-size:12px;font-weight:750}
    .welcome-balance-choice{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border:1px solid #d5e5df;border-radius:11px;background:#f8fbf9;cursor:pointer}
    .welcome-balance-choice:has(input:checked){border-color:#4aa67f;background:#eff8f2}
    .welcome-balance-choice input,.welcome-explicit-check input{width:17px!important;height:17px!important;min-width:17px!important;min-height:17px!important;flex:0 0 17px;margin:2px 0 0!important;accent-color:#14795c}
    .welcome-balance-choice span{display:grid;gap:3px}.welcome-balance-choice b{color:#213c3a;font-size:13px}.welcome-balance-choice small{color:#627b77;font-size:11px;line-height:1.4}
    .welcome-balance-explain{padding:12px 14px;border:1px solid #bcded0;border-radius:10px;background:#f0f9f3;color:#28604d;font-size:12px;line-height:1.5}
    .welcome-explicit-check{display:flex;gap:9px;align-items:flex-start;color:#345956;font-size:12px;line-height:1.45}
    .welcome-setup-actions{display:flex;gap:9px;flex-wrap:wrap}.welcome-setup-actions button{min-height:42px;padding:9px 15px;border-radius:10px;font-size:12px;font-weight:750}
    .welcome-setup-actions .primary{background:#116f57;color:#fff}.welcome-setup-actions .secondary{border:1px solid #cbded8;background:#fff;color:#285c52}
    .welcome-import-summary{display:grid;gap:10px;margin:10px 0 20px;padding:17px;border:1px solid #d5e5df;border-radius:13px;background:#f7fbf8}
    .welcome-import-summary strong{font-size:16px;color:#1f3e39}.welcome-import-summary p{margin:0;color:#5b746f;font-size:12px;line-height:1.5}
    .onboarding-reconcile-guide{margin:0 0 18px;padding:20px 22px;border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));border-radius:16px;background:linear-gradient(120deg,color-mix(in srgb,var(--accent) 9%,var(--paper)),var(--paper));box-shadow:0 10px 25px #0b352014}
    .onboarding-reconcile-guide h2{margin:2px 0 7px;font-size:20px}.onboarding-reconcile-guide p{margin:5px 0;color:var(--muted);font-size:13px;line-height:1.5}
    .onboarding-reconcile-guide .onboarding-figures{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}.onboarding-reconcile-guide .onboarding-figures span{display:grid;gap:3px;min-width:130px;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}
    .onboarding-reconcile-guide .onboarding-figures small{color:var(--muted);font-size:11px}.onboarding-reconcile-guide .onboarding-figures strong{font-size:17px}
    .onboarding-reconcile-guide .onboarding-confirm{display:flex;gap:9px;align-items:flex-start;margin:10px 0;color:var(--text);font-size:12px}.onboarding-reconcile-guide .onboarding-confirm input{width:17px;height:17px;flex:0 0 17px;margin:1px 0;accent-color:var(--accent)}
    .onboarding-reconcile-guide button{min-height:36px;margin-top:9px}
    body[data-theme=dark] .welcome-setup-form label:not(.welcome-balance-choice):not(.welcome-explicit-check),body[data-theme=dark] .welcome-explicit-check{color:#c7dfd6}
    body[data-theme=dark] .welcome-setup-form input:not([type=radio]):not([type=checkbox]),body[data-theme=dark] .welcome-setup-form select,body[data-theme=dark] .welcome-balance-choice,body[data-theme=dark] .welcome-import-summary{border-color:#48675d;background:#294440;color:#e9f6f0}
    body[data-theme=dark] .welcome-balance-choice:has(input:checked),body[data-theme=dark] .welcome-balance-explain{border-color:#61ae86;background:#285443;color:#daf4e3}
    body[data-theme=dark] .welcome-balance-choice b,body[data-theme=dark] .welcome-import-summary strong{color:#eaf8f0}
    body[data-theme=dark] .welcome-balance-choice small,body[data-theme=dark] .welcome-import-summary p{color:#bbd2c8}
    @media(max-width:600px){.welcome-setup-actions{display:grid}.welcome-setup-actions button{width:100%}.onboarding-reconcile-guide{padding:16px}}
  `;
  document.head.append(onboardingStyle);

  const progressKey = () => `equilibrio:onboarding:v1:${window.LifeUI.activeSpace?.()?.id || "main"}`;
  const readProgress = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey()) || "null");
      return saved?.accountId && data.accounts.some((account) => String(account.id) === String(saved.accountId)) ? saved : null;
    } catch { return null; }
  };
  const saveProgress = (state) => {
    try { localStorage.setItem(progressKey(), JSON.stringify(state)); } catch { notice("Não foi possível guardar o progresso da configuração.", true); }
  };
  const finishProgress = () => {
    try { localStorage.removeItem(progressKey()); } catch {}
    document.querySelector("#onboardingReconcileGuide")?.remove();
  };

  let startupEntryAuthorized = false;
  const nativeDialogClose = dialog.close.bind(dialog);
  dialog.close = (...args) => { if (window.equilibrioStartup?.awaitingChoice && !startupEntryAuthorized) return; nativeDialogClose(...args); };
  function finishStartup() {
    if (!window.equilibrioStartup?.awaitingChoice || !startupEntryAuthorized) return;
    window.equilibrioStartup.awaitingChoice = false;
    window.equilibrioStartup.entered = true;
    delete document.body.dataset.startup;
    const account = document.querySelector('#accountFilter');
    if (account) account.value = '';
    view = 'dashboard';
    window.renderEquilibrio?.();
  }
  dialog.addEventListener('cancel', event => { if (window.equilibrioStartup?.awaitingChoice) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    if (window.equilibrioStartup?.awaitingChoice && !startupEntryAuthorized) { openMain(); return; }
    finishStartup();
  });
  const close = () => {
    if (window.equilibrioStartup?.awaitingChoice && !startupEntryAuthorized) return false;
    if (dialog.open) dialog.close();
    finishStartup();
  };
  const currentSpace = () => window.LifeUI.activeSpace?.()?.id || "main";
  const setupAvailable = () => Boolean(data.isDemo || data.accounts.length === 0);
  const amount = (value) => eur(F.money(Number(value) || 0));
  const accountFor = (state) => data.accounts.find((account) => String(account.id) === String(state?.accountId));
  const setupShell = (step, heading, intro, body) => `
    <div class="welcome-shell"><div class="welcome-hero">
      <div class="welcome-brand"><img src="Equilibrio.png" alt="" aria-hidden="true"><span>Equilíbrio</span></div>
      <p class="welcome-kicker">COMEÇAR COM SEGURANÇA</p><h2 id="welcomeTitle">Os teus dados, com o saldo certo.</h2>
      <p>Prepara a primeira conta, importa o histórico e confere o resultado com o banco.</p>
      <div class="welcome-hero-note"><span aria-hidden="true">✓</span> A escolha do saldo evita contar duas vezes movimentos antigos.</div>
    </div><div class="welcome-content welcome-setup-content">
      
      <p class="welcome-step">${step} · CONFIGURAR</p><h3>${heading}</h3><p class="welcome-intro">${intro}</p>${body}
    </div></div>`;

  function setup() {
    if (!setupAvailable()) return notice("Este espaço já tem contas. Usa Contas para acrescentar outras.", true);
    dialog.innerHTML = setupShell("1 DE 3", "A primeira conta", "Escolhe a referência do saldo antes de importar qualquer movimento.", `
      <form id="welcomeSetupForm" class="welcome-setup-form">
        <label>O teu nome<input name="profile" type="text" maxlength="60" value="${esc(data.profile || "")}" required></label>
        <label>Nome da conta<input name="accountName" type="text" maxlength="80" value="Conta à ordem" required></label>
        <label>Tipo de conta<select name="accountType"><option>Banco</option><option>Poupança</option><option>Dinheiro</option><option>Cartão de crédito</option></select></label>
        <fieldset class="welcome-balance-choices"><legend>Que saldo vais indicar?</legend>
          <label class="welcome-balance-choice"><input name="balanceBasis" type="radio" value="current" checked><span><b>Saldo atual</b><small>O valor que o banco mostra hoje. O histórico importado já está incluído nele.</small></span></label>
          <label class="welcome-balance-choice"><input name="balanceBasis" type="radio" value="historical"><span><b>Saldo anterior ao primeiro movimento</b><small>O valor imediatamente antes da primeira linha do extrato que vais importar.</small></span></label>
        </fieldset>
        <label><span id="welcomeBalanceLabel">Saldo atual (€)</span><input name="balance" type="number" step="0.01" required value="0"></label>
        <div id="welcomeBalanceExplain" class="welcome-balance-explain" aria-live="polite"></div>
        <label class="welcome-explicit-check"><input id="welcomeBalanceConfirmed" type="checkbox" required><span id="welcomeBalanceConfirmation"></span></label>
        <div class="welcome-setup-actions"><button type="submit" class="primary">Criar conta e continuar →</button><button type="button" class="secondary" id="welcomeBack">Voltar</button></div>
      </form>`);
    dialog.querySelector("#welcomeClose")?.addEventListener("click", close);
    dialog.querySelector("#welcomeBack").onclick = openMain;
    const setupForm = dialog.querySelector("#welcomeSetupForm");
    const explain = () => {
      const basis = setupForm.elements.balanceBasis.value;
      const balance = setupForm.elements.balance.value;
      dialog.querySelector("#welcomeBalanceLabel").textContent = basis === "current" ? "Saldo atual (€)" : "Saldo antes do primeiro movimento (€)";
      dialog.querySelector("#welcomeBalanceExplain").textContent = basis === "current"
        ? `Os movimentos antigos ficarão no histórico sem alterar novamente ${amount(balance)}. Depois, confirmas este saldo com o banco.`
        : `A importação vai aplicar os movimentos a ${amount(balance)}. Por exemplo, uma despesa de 100 € produzirá ${amount(Number(balance) - 100)}.`;
      dialog.querySelector("#welcomeBalanceConfirmation").textContent = basis === "current"
        ? "Confirmo que este saldo já inclui os movimentos antigos que vou importar."
        : "Confirmo que este saldo é anterior ao primeiro movimento que vou importar.";
      dialog.querySelector("#welcomeBalanceConfirmed").checked = false;
    };
    setupForm.elements.balanceBasis.forEach((input) => input.addEventListener("change", explain));
    setupForm.elements.balance.addEventListener("input", explain);
    explain();
    setupForm.onsubmit = (event) => {
      event.preventDefault();
      const profile = setupForm.elements.profile.value.trim();
      const name = setupForm.elements.accountName.value.trim();
      const type = setupForm.elements.accountType.value;
      const balance = Number(setupForm.elements.balance.value);
      const basis = setupForm.elements.balanceBasis.value;
      if (!profile || !name || !Number.isFinite(balance) || !Number.isSafeInteger(Math.round(balance * 100)) || F.money(balance) !== balance || !setupForm.elements.welcomeBalanceConfirmed.checked) {
        return notice("Confirma o nome, o saldo com duas casas decimais e a referência escolhida.", true);
      }
      if (!setupAvailable()) return notice("Este espaço já tem dados reais. Não os substituímos.", true);
      const id = F.id(), spaceName = data.spaceName || window.LifeUI.activeSpace?.()?.name || "";
      const ok = commit(() => {
        data = F.empty();
        data.profile = profile;
        data.spaceName = spaceName;
        data.accounts.push({ id, name, type, balance });
        data.onboarded = true;
      }, "Primeira conta criada. Podes importar o extrato.");
      if (!ok) return;
      saveProgress({ spaceId: currentSpace(), accountId: id, basis, referenceBalance: balance, phase: "import", importIds: [] });
      importStep();
    };
  }

  function importStep() {
    const state = readProgress(), account = accountFor(state);
    if (!account) return openMain();
    dialog.innerHTML = setupShell("2 DE 3", "Importar os movimentos", "A importação usa a revisão existente: podes mapear colunas, excluir duplicados e confirmar cada linha.", `
      <div class="welcome-import-summary"><strong>${esc(account.name)} · ${amount(account.balance)}</strong>
        <p>${state.basis === "current" ? "Escolheste o saldo atual: os movimentos antigos serão acrescentados ao histórico sem voltar a alterar este saldo." : "Escolheste o saldo anterior ao primeiro movimento: cada linha confirmada vai alterar o saldo a partir desta base."}</p></div>
      <div class="welcome-setup-actions"><button type="button" class="primary" id="welcomeImportCsv">Escolher extrato CSV →</button><button type="button" class="secondary" id="welcomeSkipImport">Não tenho extrato agora</button></div>
      `);
    dialog.querySelector("#welcomeClose")?.addEventListener("click", close);
    dialog.querySelector("#welcomeImportCsv").onclick = () => {
      state.phase = "awaiting-import";
      saveProgress(state);
      close();
      navigate("review");
      document.querySelector("#csvFile")?.click();
    };
    dialog.querySelector("#welcomeSkipImport").onclick = () => {
      state.phase = "reconcile";
      saveProgress(state);
      close();
      navigate("review");
      renderGuide();
    };
  }

  const ownPending = (state) => data.pendingImports.filter((row) => state.importIds?.includes(String(row.id)));
  const selectedPending = (state) => {
    const selected = new Set([...document.querySelectorAll("[data-import-check]:checked")].map((input) => String(input.dataset.importCheck)));
    return ownPending(state).filter((row) => selected.has(String(row.id)));
  };
  const importEffect = (rows, accountName) => F.money(rows.reduce((net, row) => {
    const value = Number(row.amount) || 0;
    if (row.type === "transfer") return net + (row.account === accountName ? -value : 0) + (row.targetAccount === accountName ? value : 0);
    if (row.account !== accountName) return net;
    if (row.type === "income") return net + value;
    if (row.type === "expense") return net - value;
    if (row.type === "adjustment") return net + (Number(row.delta) || 0);
    return net;
  }, 0));

  function renderGuide() {
    const review = document.querySelector("#review");
    if (!review) return;
    const state = readProgress(), account = accountFor(state);
    if (!state || !account || !["review", "reconcile"].includes(state.phase)) {
      document.querySelector("#onboardingReconcileGuide")?.remove();
      return;
    }
    if (state.phase === "review" && !ownPending(state).length) {
      state.phase = "reconcile";
      saveProgress(state);
    }
    let guide = document.querySelector("#onboardingReconcileGuide");
    if (!guide) {
      guide = document.createElement("section");
      guide.id = "onboardingReconcileGuide";
      guide.className = "onboarding-reconcile-guide";
      review.prepend(guide);
    }
    if (state.phase === "review") {
      const rows = selectedPending(state), remaining = ownPending(state);
      const net = importEffect(rows, account.name);
      const after = state.basis === "current" ? account.balance : F.money(account.balance + net);
      const wasConfirmed = Boolean(guide.querySelector("#onboardingBalanceConfirm")?.checked);
      guide.innerHTML = `<p class="eyebrow">PRIMEIRA UTILIZAÇÃO · 2 DE 3</p><h2>Rever a importação e o saldo</h2>
        <p>${state.basis === "current"
          ? "Escolheste um saldo que já inclui estes movimentos antigos. As linhas confirmadas entram no histórico e o saldo atual mantém-se."
          : "Escolheste o saldo anterior ao primeiro movimento. As linhas confirmadas alteram-no pela sua diferença líquida."}</p>
        <div class="onboarding-figures"><span><small>Saldo guardado</small><strong>${amount(account.balance)}</strong></span><span><small>${rows.length} linhas selecionadas</small><strong>${net >= 0 ? "+" : ""}${amount(net)}</strong></span><span><small>Saldo após confirmar</small><strong>${amount(after)}</strong></span></div>
        <p>Confere as linhas selecionadas abaixo. Duplicados desmarcados não entram no cálculo. Depois compara o saldo final com o banco.</p>
        <label class="onboarding-confirm"><input type="checkbox" id="onboardingBalanceConfirm" ${wasConfirmed ? "checked" : ""}><span>Compreendo como esta importação afeta o saldo da conta ${esc(account.name)}.</span></label>
        ${remaining.length ? '<button type="button" class="secondary" id="onboardingSkipRemaining">Descartar esta importação</button>' : ""}`;
      guide.querySelector("#onboardingSkipRemaining")?.addEventListener("click", () => {
        const ids = new Set(state.importIds || []);
        if (!commit(() => { data.pendingImports = data.pendingImports.filter((row) => !ids.has(String(row.id))); }, "Importação preparada descartada.")) return;
        state.phase = "reconcile";
        saveProgress(state);
        renderGuide();
      });
    } else {
      guide.innerHTML = `<p class="eyebrow">PRIMEIRA UTILIZAÇÃO · 3 DE 3</p><h2>Confirmar o saldo com o banco</h2>
        <p>A conta ${esc(account.name)} mostra ${amount(account.balance)}. Compara com o saldo do banco na mesma data. Se houver diferença, o formulário de confirmação permite registar um ajuste ou deixá-la pendente.</p>
        <div class="onboarding-figures"><span><small>Saldo no Equilíbrio</small><strong>${amount(account.balance)}</strong></span><span><small>Referência inicial</small><strong>${amount(state.referenceBalance)}</strong></span></div>
        <label>Saldo real no banco (€) <input id="onboardingActualBalance" type="number" step="0.01" value="${account.balance}" style="display:block;max-width:240px;margin:5px 0 10px"></label>
        <label class="onboarding-confirm"><input type="checkbox" id="onboardingActualConfirmed"><span>Conferi este valor no banco ou no extrato da data escolhida.</span></label>
        <button type="button" class="primary" id="onboardingReconcileNow">Confirmar saldo →</button>`;
      guide.querySelector("#onboardingReconcileNow").onclick = () => {
        const actual = Number(guide.querySelector("#onboardingActualBalance").value);
        if (!guide.querySelector("#onboardingActualConfirmed").checked || !Number.isFinite(actual) || F.money(actual) !== actual) {
          return notice("Confere o saldo real e assinala a confirmação antes de continuar.", true);
        }
        reconcileForm(account.id);
        const balanceField = document.querySelector('#modalContent [name="balance"]');
        if (balanceField) {
          balanceField.value = String(actual);
          balanceField.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
    }
  }

  document.addEventListener("submit", (event) => {
    if (event.target.id !== "modalForm") return;
    const state = readProgress();
    if (!state) return;
    const modal = document.querySelector("#modal");
    if (state.phase === "awaiting-import" && modal?.classList.contains("import-dialog")) {
      const before = new Set(data.pendingImports.map((row) => String(row.id)));
      setTimeout(() => {
        const latest = readProgress();
        if (!latest || latest.phase !== "awaiting-import") return;
        const prepared = data.pendingImports.filter((row) => !before.has(String(row.id)));
        if (!prepared.length) return;
        const ids = prepared.map((row) => String(row.id));
        const ok = commit(() => {
          for (const row of data.pendingImports) if (ids.includes(String(row.id))) row.importPreserveBalances = latest.basis === "current";
        }, "Extrato preparado. Confirma o efeito no saldo antes de importar.");
        if (!ok) return;
        latest.importIds = [...new Set([...(latest.importIds || []), ...ids])];
        latest.phase = "review";
        saveProgress(latest);
        navigate("review");
        renderGuide();
      }, 0);
    } else if (state.phase === "reconcile" && document.querySelector("#formTitle")?.textContent === "Confirmar saldo") {
      const before = data.reconciliations.length;
      setTimeout(() => {
        if (data.reconciliations.length <= before) return;
        const saved = data.reconciliations.slice(before).some((row) => String(row.accountId) === String(state.accountId));
        if (!saved) return;
        finishProgress();
        notice("Primeira configuração concluída e saldo conferido.");
      }, 0);
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("#discardImports")) {
      const state = readProgress();
      if (state?.phase === "review") setTimeout(() => {
        const latest = readProgress();
        if (latest?.phase === "review" && !ownPending(latest).length) {
          latest.phase = "reconcile";
          saveProgress(latest);
          renderGuide();
        }
      }, 0);
    }
    if (event.target.closest("#confirmImports")) {
      const state = readProgress();
      if (state?.phase !== "review") return;
      const rows = selectedPending(state);
      if (!rows.length) return;
      if (!document.querySelector("#onboardingBalanceConfirm")?.checked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return notice("Confirma primeiro como os movimentos afetam o saldo.", true);
      }
      for (const row of rows) row.importPreserveBalances = state.basis === "current";
      setTimeout(() => {
        const latest = readProgress();
        if (!latest || latest.phase !== "review") return;
        if (!ownPending(latest).length) {
          latest.phase = "reconcile";
          saveProgress(latest);
        }
        renderGuide();
      }, 0);
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-import-check]")) {
      const confirmed = document.querySelector("#onboardingBalanceConfirm");
      if (confirmed) confirmed.checked = false;
      renderGuide();
    }
  });
  const importModalObserver = new MutationObserver(() => {
    const state = readProgress();
    if (state?.phase !== "awaiting-import") return;
    const preserve = document.querySelector('#modal[open] [name="preserveBalances"]');
    if (preserve && preserve.checked !== (state.basis === "current")) {
      preserve.checked = state.basis === "current";
      preserve.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  importModalObserver.observe(document.querySelector("#modalContent"), { childList: true });
  const reviewTable = document.querySelector("#reviewTable");
  if (reviewTable) new MutationObserver(() => renderGuide()).observe(reviewTable, { childList: true, subtree: true });
  requestAnimationFrame(renderGuide);

  function openMain() {
    const spaces = window.LifeUI.spaces?.() || [];
    const active = currentSpace();
    const intro = data.isDemo ? "Começa com os teus dados ou explora a demonstração." : "Escolhe o espaço em que queres trabalhar hoje.";
    dialog.innerHTML = `
      <div class="welcome-shell welcome-centered">
        <div class="welcome-hero">
          <div class="welcome-brand"><img src="Equilibrio.png" alt="" aria-hidden="true"><span>Equilíbrio</span></div>
          <p class="welcome-kicker">O TEU ESPAÇO FINANCEIRO</p>
          <h2 id="welcomeTitle">${data.profile ? `Bem-vindo de volta, ${esc(data.profile)}.` : "Bem-vindo ao Equilíbrio."}</h2>
          <p>${intro}</p>
          <div class="welcome-hero-note"><span aria-hidden="true">✓</span> Cada espaço guarda os seus movimentos separadamente.</div>
        </div>
        <div class="welcome-content">
          
          <p class="welcome-step">1 · ESCOLHER</p>
          <h3>Escolhe o teu espaço</h3>
          <p class="welcome-intro">Seleciona um espaço existente ou cria outro para manter as contas organizadas.</p>
          <div class="welcome-spaces" role="radiogroup" aria-label="Espaços financeiros">
            ${spaces.map((space, index) => `<label class="welcome-space"><input type="radio" name="welcomeSpace" value="${esc(space.id)}" ${space.id === active || (!active && index === 0) ? "checked" : ""}><span class="welcome-avatar" aria-hidden="true">${esc(String(space.name || "E").charAt(0).toUpperCase())}</span><span class="welcome-space-copy"><strong>${esc(space.name)}</strong><small>${space.id === active ? "Espaço aberto agora" : "Dados separados"}</small></span><span class="welcome-selected" aria-hidden="true">✓</span></label>`).join("")}
          </div>
          <label class="welcome-privacy"><input id="welcomeHideValues" type="checkbox" ${document.body.classList.contains("private-values")?"checked":""}><span>Entrar com os valores ocultos</span></label><div class="welcome-actions"><button type="button" class="primary" id="welcomeContinue">Entrar no espaço <span aria-hidden="true">→</span></button><button type="button" class="secondary" id="welcomeCreate">+ Criar espaço</button></div>
          ${!window.equilibrioStartup?.awaitingChoice && (setupAvailable() || readProgress()) ? `<button type="button" class="welcome-configure" id="welcomeStartSetup">${readProgress() ? "Retomar primeira configuração" : "Preparar os meus dados e importar extrato"}</button>` : ""}
          ${window.equilibrioStartup?.awaitingChoice ? "" : `<button type="button" class="welcome-configure" id="welcomeConfigure">${data.isDemo ? "Configurar os meus dados reais" : "Gerir os espaços nas Definições"}</button>`}
          <p class="welcome-preference">Escolhe o espaço ao iniciar. Os dados só são apresentados depois de entrares.</p>
        </div>
      </div>`;
    dialog.querySelector("#welcomeClose")?.addEventListener("click", close);
    dialog.querySelector("#welcomeContinue").onclick = () => {
      const selected = dialog.querySelector('[name="welcomeSpace"]:checked')?.value;
      try {
        if (!selected || !window.LifeUI.spaces().some(space => space.id === selected)) throw Error("Escolhe um espaço financeiro válido.");
        if (selected !== currentSpace()) window.LifeUI.switchSpace(selected);
        const hide=dialog.querySelector("#welcomeHideValues").checked;if(hide!==document.body.classList.contains("private-values"))document.getElementById("privacyToggle").click();
        startupEntryAuthorized = true;
        close();
      } catch (error) { notice(error.message || "Não foi possível abrir o espaço.", true); }
    };
    dialog.querySelector("#welcomeCreate").onclick = () => {
      if (window.equilibrioStartup?.awaitingChoice) {
        const modal = document.querySelector('#modal');
        modal.addEventListener('close', () => { if (window.equilibrioStartup?.awaitingChoice) setTimeout(() => { if (window.equilibrioStartup?.awaitingChoice) openMain(); }, 0); }, {once:true});
        document.querySelector('#settingsAddSpace')?.click();
        return;
      }
      close();
      navigate("settings");
      document.querySelector("#settingsAddSpace")?.click();
    };
    dialog.querySelector("#welcomeConfigure")?.addEventListener("click", () => {
      if (data.isDemo) setup();
      else { close(); navigate("settings"); }
    });
    dialog.querySelector("#welcomeStartSetup")?.addEventListener("click", () => {
      const state = readProgress();
      if (!state) return setup();
      if (state.phase === "import" || state.phase === "awaiting-import") return importStep();
      close();
      navigate("review");
      renderGuide();
    });
    if (!dialog.open) dialog.showModal();
  }
  function open() { if (!dialog.open) openMain(); }
  launcher.onclick = open;
  window.WelcomeUI = { open, close, startSetup: () => { if (!dialog.open) dialog.showModal(); setup(); }, renderGuide };
  if (window.financasDesktop?.isDesktop) open();
})();
