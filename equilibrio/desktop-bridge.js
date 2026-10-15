/* Desktop v0.16 — acesso a dados centralizado na camada native data-service.
   SQLite continua a ser a fonte efetiva; localStorage é apenas cache de compatibilidade. */
(function () {
  "use strict";
  if (!window.financasDesktop?.isDesktop) return;

  const native = window.financasDesktop;


  function loadedAssetNames(selector, attr) {
    return [...document.querySelectorAll(selector)]
      .map((node) => {
        try {
          const value = node.getAttribute(attr) || '';
          return value.split('/').filter(Boolean).at(-1) || value || 'inline';
        } catch { return 'desconhecido'; }
      })
      .filter(Boolean);
  }

  function buildDiagnostics(info = {}) {
    const styles = loadedAssetNames('link[rel="stylesheet"]', 'href');
    const scripts = loadedAssetNames('script[src]', 'src');
    const stableLoaded = styles.length === 1 && styles[0] === 'ui.css';
    return {
      appVersion: info.appVersion || native.desktopVersion || '',
      displayVersion: info.displayVersion || native.desktopDisplayVersion || '',
      webVersion: info.webVersion || native.webVersion || '',
      styles,
      scripts,
      stableLoaded,
      appPath: info.appPath || '',
      statePath: info.statePath || '',
      packaged: Boolean(info.packaged),
    };
  }

  function applyBuildIdentity(info = {}) {
    const diagnostic = buildDiagnostics(info);
    const badge = document.getElementById('appBuildBadge');
    const version = diagnostic.appVersion || 'desconhecida';
    if (badge) {
      badge.textContent = `v${String(version).replace(/^v/i, '')}`;
      badge.title = `${diagnostic.displayVersion || 'Finanças Pessoais Desktop'} · Web ${diagnostic.webVersion || '—'} · ${diagnostic.stableLoaded ? 'ui.css carregado' : 'ui.css em falta'}`;
    }
    document.documentElement.dataset.appVersion = version;
    document.documentElement.dataset.webVersion = diagnostic.webVersion || '';
    document.documentElement.dataset.stableCss = diagnostic.stableLoaded ? 'loaded' : 'missing';
    window.FinancasBuildDiagnostics = () => buildDiagnostics(info);
    return diagnostic;
  }

  applyBuildIdentity();

  // v0.23.2 — Atualizador independente das Definições.
  // O botão vive permanentemente na barra lateral e é ligado logo no arranque,
  // sem depender de getAppInfo(), da construção dos painéis ou de operações assíncronas.
  function bindDirectDesktopUpdater() {
    const button = document.getElementById("desktopUpdateButton");
    if (!button || button.dataset.desktopUpdateBound === "1") return;
    button.dataset.desktopUpdateBound = "1";
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "↻ A abrir atualização…";
      try {
        const result = await native.installUpdateFile();
        if (!result) {
          button.textContent = original;
          button.disabled = false;
          return;
        }
        button.textContent = "✓ Atualização preparada";
        desktopNotice(`Atualização ${result.displayVersion || result.toVersion || ""} preparada. A aplicação vai fechar; volta a abri-la manualmente depois.`);
      } catch (error) {
        button.textContent = original;
        button.disabled = false;
        desktopNotice(error?.message || "Não foi possível instalar a atualização.", true);
      }
    });
  }

  bindDirectDesktopUpdater();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindDirectDesktopUpdater, { once: true });
  }

  let backupSettings = null;
  let backupBusy = false;

  const criticalDomainNames = ['accounts', 'transactions', 'debts', 'recurring', 'categoryCatalog', 'categoryArchive'];
  function criticalLedgerSnapshot(source) {
    const out = {};
    for (const name of criticalDomainNames) {
      out[name] = Array.isArray(source?.[name]) ? structuredClone(source[name]) : [];
    }
    return out;
  }

  function syncCriticalDomains(before, after, storageKey) {
    try {
      const result = native.syncCriticalDomains(
        String(storageKey || 'equilibrioData'),
        criticalLedgerSnapshot(before),
        criticalLedgerSnapshot(after),
      );
      if (!result?.ok) throw new Error(result?.error || 'Não foi possível gravar os dados críticos em SQLite.');
      return result;
    } catch (error) {
      console.error('Sincronização CRUD direta falhou:', error);
      throw error;
    }
  }


  function commitLedgerDirect(beforeLedger, afterLedger, storageKey) {
    try {
      const result = (native.dataCommitLedgerSync || native.applyLedgerDelta)(
        String(storageKey || 'equilibrioData'),
        beforeLedger || {},
        afterLedger || {},
      );
      if (!result?.ok) throw new Error(result?.error || result?.reason || 'Não foi possível gravar a alteração em SQLite.');
      return result;
    } catch (error) {
      console.error('Persistência incremental do Espaço Financeiro falhou:', error);
      throw error;
    }
  }

  function saveSpaceDirect(ledger, storageKey) {
    try {
      const result = native.writeSqliteSpaceSync(String(storageKey || 'equilibrioData'), ledger || {});
      if (!result?.ok) throw new Error(result?.error || result?.reason || 'Não foi possível gravar o Espaço Financeiro em SQLite.');
      return result;
    } catch (error) {
      console.error('Escrita direta do Espaço Financeiro falhou:', error);
      throw error;
    }
  }

  function listSpacesDirect() {
    try {
      const result = native.dataListSpacesSync?.() || native.listSqliteSpacesSync?.() || [];
      if (result?.error) throw new Error(result.error);
      return result;
    } catch (error) {
      console.error('Leitura direta do catálogo SQLite falhou:', error);
      throw error;
    }
  }

  function readSpaceDirect(spaceId) {
    try {
      const result = native.dataReadSpaceSync?.(String(spaceId || '')) || native.readSqliteSpaceSync(String(spaceId || '')) || null;
      if (result?.error) throw new Error(result.error);
      return result;
    } catch (error) {
      console.error('Leitura direta do Espaço Financeiro falhou:', error);
      throw error;
    }
  }

  function readDomainDirect(spaceId, domain) {
    try {
      const result = native.dataReadDomainSync?.(String(spaceId || ''), String(domain || '')) || native.readSqliteDomainSync(String(spaceId || ''), String(domain || '')) || [];
      if (result?.error) throw new Error(result.error);
      return result;
    } catch (error) {
      console.error('Leitura direta do domínio SQLite falhou:', error);
      throw error;
    }
  }

  function resolveActiveSpaceId(explicitSpaceId = '') {
    const explicit = String(explicitSpaceId || '').trim();
    if (explicit) return explicit;
    try {
      const active = window.LifeUI?.activeSpace?.();
      if (active?.id) return String(active.id);
    } catch {}
    try {
      if (typeof key === 'string') {
        if (key === 'equilibrioData') return 'main';
        if (key.startsWith('equilibrioData:')) return key.slice('equilibrioData:'.length);
      }
    } catch {}
    return '';
  }

  function refreshCriticalDomainsFromSqlite(explicitSpaceId = '') {
    const spaceId = resolveActiveSpaceId(explicitSpaceId);
    if (!spaceId) return { ok: false, reason: 'space-not-resolved' };
    const space = readSpaceDirect(spaceId);
    if (!space?.data) return { ok: false, reason: 'space-not-found' };
    try {
      // One authoritative snapshot, including Casa/planning/attachments.
      // Prepare it before replacing the renderer state; failed reads leave it intact.
      const fresh = F.normalize(structuredClone(space.data));
      if (space.name) fresh.spaceName = space.name;
      data = fresh;
      return {
        ok: true,
        spaceId,
        counts: Object.fromEntries(criticalDomainNames.map((name) => [name, Array.isArray(data[name]) ? data[name].length : 0])),
      };
    } catch (error) {
      console.error('Atualização direta dos domínios SQLite falhou:', error);
      return { ok: false, reason: error?.message || String(error) };
    }
  }

  function persistFullStateSync(expected = null) {
    try {
      const result = expected ? native.replaceStorageGuardedSync(collectLocalStorage(), expected) : native.replaceStorageSync(collectLocalStorage());
      if (result?.error) throw Error(result.error);
      if (result?.warning) desktopNotice(result.warning, true);
      return result === true || result?.ok === true;
    } catch (error) {
      console.error('Não foi possível sincronizar integralmente os Espaços Financeiros:', error);
      return false;
    }
  }

  window.DesktopPersistence = {
    commitLedgerDirect,
    syncCriticalDomains,
    criticalLedgerSnapshot,
    saveSpaceDirect,
    listSpaces: listSpacesDirect,
    readSpace: readSpaceDirect,
    readDomain: readDomainDirect,
    refreshCriticalDomains: refreshCriticalDomainsFromSqlite,
    persistFullStateSync,
    upsertEntity: (spaceId, domain, entity) => native.dataUpsertEntitySync?.(String(spaceId || ''), String(domain || ''), entity || {}),
    deleteEntity: (spaceId, domain, entityId) => native.dataDeleteEntitySync?.(String(spaceId || ''), String(domain || ''), String(entityId || '')),
  };

  function desktopNotice(message, error = false) {
    try {
      notice(message, error);
    } catch {
      if (error) console.error(message);
      else console.log(message);
    }
  }

  function activeSnapshot() {
    try {
      const active = window.LifeUI?.activeSpace?.();
      if (active?.id) {
        const direct = readSpaceDirect(active.id);
        if (direct?.data) return F.normalize(direct.data);
      }
    } catch (error) {
      throw new Error('Não foi possível obter a cópia pelo SQLite: ' + error.message);
    }
    return F.normalize(structuredClone(data));
  }

  function fullSnapshot() {
    try {
      const spaces = listSpacesDirect();
      if (spaces.length) {
        return {
          format: "equilibrio-spaces",
          version: 1,
          exportedAt: new Date().toISOString(),
          backupMetadata: BackupInfo.stamp("Todos os espaços"),
          spaces: spaces.map((space) => {
            const direct = readSpaceDirect(space.id);
            if (!direct?.data) throw new Error(`Não foi possível ler o espaço ${space.name || space.id} em SQLite.`);
            return { name: space.name || direct.name || "Pessoal", data: F.normalize(direct.data) };
          }),
        };
      }
    } catch (error) {
      throw new Error('Não foi possível exportar a cópia pelo SQLite: ' + error.message);
    }
    if (window.LifeUI?.exportSpaces) return window.LifeUI.exportSpaces();
    return {
      format: "equilibrio-spaces",
      version: 1,
      exportedAt: new Date().toISOString(),
          backupMetadata: BackupInfo.stamp("Todos os espaços"),
      spaces: [{ name: data.spaceName || "Pessoal", data: activeSnapshot() }],
    };
  }

  function fullSnapshotText() {
    return JSON.stringify(fullSnapshot(), null, 2);
  }

  function safeFilePart(value) {
    return String(value || "Pessoal")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Pessoal";
  }

  async function exportActiveNative() {
    try {
      const snapshot = activeSnapshot();
      const at = new Date().toISOString();
      const payload = { ...snapshot, lastBackup: at, backupMetadata: BackupInfo.stamp(window.LifeUI?.activeSpace?.().name) };
      const active = window.LifeUI?.activeSpace?.();
      const name = `equilibrio-${safeFilePart(active?.name || snapshot.spaceName || "Pessoal")}-${F.today()}.json`;
      const saved = await native.saveJson(name, JSON.stringify(payload, null, 2));
      if (!saved) return false;
      if (!storageProblem) {
        commit(() => { data.lastBackup = at; }, "Cópia de segurança exportada.");
      }
      desktopNotice("Cópia guardada em ficheiro.");
      return true;
    } catch (error) {
      desktopNotice(error?.message || "Não foi possível exportar a cópia.", true);
      return false;
    }
  }

  async function exportAllNative() {
    try {
      const payload = fullSnapshot();
      const saved = await native.saveJson(
        `equilibrio-todos-os-espacos-${F.today()}.json`,
        JSON.stringify(payload, null, 2),
      );
      if (!saved) return false;
      desktopNotice("Cópia de todos os espaços guardada em ficheiro.");
      return true;
    } catch (error) {
      desktopNotice(error?.message || "Não foi possível exportar os espaços.", true);
      return false;
    }
  }

  async function restorePicked(picked) {
    if (!picked) return false;
    const migration = await native.migrateJson(picked.content, fullSnapshotText());
    let parsed = JSON.parse(migration.content);
    if (migration.changed) {
      const steps = migration.plan?.steps?.length || 0;
      desktopNotice(`Cópia preparada para o schema atual (${steps} migração${steps === 1 ? "" : "ões"}). Cópia de segurança criada antes da migração.`);
    }

    if(window.LifeUI?.restoreCopy){await window.LifeUI.restoreCopy(parsed,true,{filename:picked.name||picked.filePath});return true;}
    if (parsed?.format === "equilibrio-spaces") {
      if (!Array.isArray(parsed.spaces) || !parsed.spaces.length)
        throw new Error("A cópia não contém Espaços Financeiros válidos.");
      if (parsed.spaces.length > 1) {
        const count = window.LifeUI?.importSpaces?.(parsed);
        if (!count) throw new Error("Não foi possível recuperar os espaços desta cópia.");
        window.LifeUI?.render?.();
        window.renderEquilibrio?.();
        desktopNotice(`${count} espaços recuperados. Abre o espaço pretendido em Definições.`);
        updateNativeSnapshot();
        return true;
      }
      parsed = parsed.spaces[0].data;
    }

    const next = F.normalize(parsed);
    form(
      "Restaurar cópia",
      `<p>A cópia contém ${next.accounts.length} contas e ${next.transactions.length} movimentos. Vai substituir os dados do espaço atual.</p>`,
      () => {
        const previous = storageProblem;
        storageProblem = false;
        const ok = commit(() => { data = next; }, "Cópia restaurada.");
        if (!ok) storageProblem = previous;
        if (ok) {
          try { window.LifeUI?.render?.(); } catch {}
          try { window.renderEquilibrio?.(); } catch {}
          updateNativeSnapshot();
        }
        return ok;
      },
      "O ficheiro é lido diretamente pelo Desktop; não depende do seletor de ficheiros do navegador.",
      "Restaurar",
    );
    return true;
  }

  async function restoreNative() {
    try {
      return await restorePicked(await native.openJson());
    } catch (error) {
      desktopNotice(error?.message || "Cópia inválida.", true);
      return false;
    }
  }

  function eraseBackupPassphrases() {
    document.querySelectorAll('#modalContent input[data-backup-passphrase]').forEach((input) => { input.value = ''; });
  }

  function exportEncryptedNative() {
    form(
      'Guardar cópia encriptada',
      '<label>Frase-passe<input name="backupPassphrase" data-backup-passphrase type="password" autocomplete="new-password" minlength="12" required></label>' +
      '<label>Repetir frase-passe<input name="backupPassphraseAgain" data-backup-passphrase type="password" autocomplete="new-password" minlength="12" required></label>' +
      '<p class="muted">Inclui todos os espaços. Guarda a frase-passe fora do programa: sem ela não é possível recuperar esta cópia.</p>',
      async (values) => {
        const passphrase = String(values.get('backupPassphrase') || '');
        if (passphrase.length < 12 || passphrase !== String(values.get('backupPassphraseAgain') || '')) {
          eraseBackupPassphrases();
          throw Error('Usa uma frase-passe com pelo menos 12 caracteres e confirma-a.');
        }
        try {
          const saved = await native.saveEncryptedBackup(`equilibrio-todos-os-espacos-${F.today()}.fpbackup`, fullSnapshotText(), passphrase);
          if (!saved) return false;
          desktopNotice('Cópia encriptada guardada. Guarda a frase-passe em local seguro.');
          return true;
        } finally { eraseBackupPassphrases(); }
      },
      'Esta exportação é opcional. As cópias automáticas continuam sem encriptação.',
      'Guardar cópia encriptada',
    );
  }

  function restoreEncryptedNative() {
    form(
      'Restaurar cópia encriptada',
      '<label>Frase-passe da cópia<input name="backupPassphrase" data-backup-passphrase type="password" autocomplete="off" required></label>' +
      '<p class="muted">Escolhe o ficheiro .fpbackup depois de introduzir a frase-passe. O conteúdo só será apresentado após a verificação.</p>',
      async (values) => {
        const passphrase = String(values.get('backupPassphrase') || '');
        try {
          const picked = await native.openEncryptedBackup(passphrase);
          if (!picked) return false;
          eraseBackupPassphrases();
          document.querySelector('#modal')?.close();
          try { await restorePicked(picked); return false; }
          catch (error) { desktopNotice(error?.message || 'Não foi possível restaurar a cópia.', true); return false; }
        } finally { eraseBackupPassphrases(); }
      },
      'A frase-passe não é guardada pelo programa.',
      'Abrir cópia encriptada',
    );
  }

  function collectLocalStorage() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key == null) continue;
        const value = localStorage.getItem(key);
        if (value != null) out[key] = value;
      }
    } catch (error) {
      console.error("Não foi possível ler o armazenamento local:", error);
    }
    return out;
  }

  let lastPersistedStorage = null;
  let persistInFlight = null;
  let persistQueued = false;

  function sameStoragePayload(a, b) {
    if (!a || !b) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) if (a[key] !== b[key]) return false;
    return true;
  }

  function rememberPersistedStorage(payload) {
    // Os valores de localStorage são strings imutáveis; uma cópia rasa chega
    // para comparar o próximo snapshot sem voltar a escrever o espelho JSON.
    lastPersistedStorage = { ...payload };
  }

  function persistDesktopStorage(sync = false, force = false) {
    try {
      const payload = collectLocalStorage();
      if (!force && sameStoragePayload(payload, lastPersistedStorage))
        return sync ? true : Promise.resolve({ ok: true, unchanged: true });

      if (sync) {
        const result = native.saveStorageSync(payload);
        if (result === true || result?.ok === true) rememberPersistedStorage(payload);
        return result;
      }

      // Evita duas escritas completas em paralelo. Se os dados mudarem durante
      // uma gravação, agenda exatamente mais uma passagem no fim.
      if (persistInFlight) {
        persistQueued = true;
        return persistInFlight;
      }
      persistInFlight = native.saveStorage(payload)
        .then((result) => {
          if (result === true || result?.ok === true) rememberPersistedStorage(payload);
          return result;
        })
        .catch((error) => {
          console.error("Não foi possível persistir os dados Desktop:", error);
          desktopNotice("Falha ao guardar a cópia de recuperação: " + error.message, true);
          return false;
        })
        .finally(() => {
          persistInFlight = null;
          if (persistQueued) {
            persistQueued = false;
            queueMicrotask(() => persistDesktopStorage(false));
          }
        });
      return persistInFlight;
    } catch (error) {
      console.error("Não foi possível persistir os dados Desktop:", error);
      return false;
    }
  }

  function updateNativeSnapshot() {
    try {
      native.updateSnapshot(fullSnapshotText());
      persistDesktopStorage(false);
    } catch (error) {
      console.error("Não foi possível atualizar snapshot Desktop:", error);
    }
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-PT");
  }

  function shortPath(value) {
    const s = String(value || "");
    if (s.length <= 72) return s;
    return "…" + s.slice(-69);
  }

  async function refreshBackupUI(message = "") {
    backupSettings = await native.getBackupSettings();
    const frequency = document.getElementById("fileBackupFrequency");
    const retention = document.getElementById("fileBackupRetention");
    const status = document.getElementById("fileBackupStatus");
    const support = document.getElementById("backupSupportState");
    const choose = document.getElementById("chooseBackupFolder");
    const now = document.getElementById("backupFileNow");
    const pause = document.getElementById("pauseFileBackup");
    const verify = document.getElementById("verifyBackupFile");
    const onClose = document.getElementById("desktopBackupOnClose");

    if (frequency) frequency.value = backupSettings.frequency;
    if (retention) retention.value = backupSettings.retention;
    if (onClose) onClose.checked = backupSettings.onClose;
    if (support) support.textContent = backupSettings.directory ? "Pasta ligada · Desktop" : "Pasta desligada · Desktop";
    if (choose) choose.textContent = backupSettings.directory ? "Alterar pasta" : "Escolher pasta";
    if (now) now.disabled = !backupSettings.directory;
    if (pause) pause.disabled = !backupSettings.directory;
    if (verify) verify.textContent = "Restaurar cópia";

    if (status) {
      const folder = backupSettings.directory ? shortPath(backupSettings.directory) : "Nenhuma pasta escolhida";
      const last = backupSettings.lastBackupAt ? `Última cópia: ${formatDateTime(backupSettings.lastBackupAt)}.` : "Ainda não existe uma cópia automática.";
      status.textContent = `${message ? message + " " : ""}${folder} · ${last} Mantém ${backupSettings.retention} cópia${backupSettings.retention === 1 ? "" : "s"}${backupSettings.onClose ? " · cópia ao fechar ativa" : ""}. Estas cópias automáticas não são encriptadas.`;
      status.title = backupSettings.directory || "";
    }
  }

  async function runNativeBackup(force = false, reason = "automatic") {
    if (backupBusy) return false;
    backupBusy = true;
    try {
      const content = fullSnapshotText();
      native.updateSnapshot(content);
      const result = await native.runBackup(content, { force, reason });
      if (result?.ok) {
        const prefix = result.fallback ? "Cópia criada na pasta interna de segurança" : (force ? "Cópia criada" : "Cópia automática criada");
        await refreshBackupUI(`${prefix}: ${result.name}.${result.warning ? " " + result.warning : ""}`);
        return true;
      }
      await refreshBackupUI();
      return false;
    } catch (error) {
      await refreshBackupUI("A cópia falhou.");
      if (force) desktopNotice(error?.message || "Não foi possível criar a cópia.", true);
      else console.error("Cópia automática falhou:", error);
      return false;
    } finally {
      backupBusy = false;
    }
  }

  async function chooseNativeBackupFolder() {
    try {
      const next = await native.chooseBackupDirectory();
      if (!next) return;
      backupSettings = next;
      await refreshBackupUI("Pasta ligada.");
      await runNativeBackup(true, "folder-selected");
    } catch (error) {
      desktopNotice(error?.message || "Não foi possível escolher a pasta.", true);
    }
  }

  async function disableNativeBackupFolder() {
    backupSettings = await native.disableBackupDirectory();
    await refreshBackupUI("Pasta desligada.");
  }

  function prepareNativeBackupPanel() {
    const panel = document.getElementById("fileProtection");
    if (!panel) return;
    panel.classList.add('desktop-native-backups');

    const intro = panel.querySelector(".file-protection-head p");
    if (intro) intro.textContent = "As cópias automáticas nesta pasta são ficheiros JSON verificados antes de serem considerados válidos. Se a pasta escolhida falhar, o Desktop cria automaticamente uma cópia interna de segurança para não bloquear o fecho nem uma atualização. Para proteger uma cópia com frase-passe, usa a opção abaixo.";

    if (!document.getElementById('encryptedBackupCard')) {
      const encrypted = document.createElement('section');
      encrypted.id = 'encryptedBackupCard';
      encrypted.className = 'encrypted-backup-card';
      encrypted.innerHTML = '<h3>Cópia encriptada opcional</h3><p>Exporta todos os espaços para um ficheiro .fpbackup protegido por frase-passe. A frase-passe não é guardada. As cópias automáticas continuam sem encriptação.</p><div class="encrypted-backup-actions"><button type="button" class="primary" id="saveEncryptedBackup">Guardar cópia encriptada</button><button type="button" class="secondary" id="restoreEncryptedBackup">Restaurar cópia encriptada</button></div>';
      panel.append(encrypted);
      document.querySelector('#modal')?.addEventListener('close', eraseBackupPassphrases);
    }
    document.getElementById('saveEncryptedBackup').onclick = exportEncryptedNative;
    document.getElementById('restoreEncryptedBackup').onclick = restoreEncryptedNative;

    const settingsGrid = panel.querySelector(".file-backup-settings");
    if (settingsGrid && !document.getElementById("desktopBackupOnClose")) {
      const label = document.createElement("label");
      label.className = "desktop-backup-close-option";
      label.innerHTML = '<span>Ao fechar a aplicação</span><input id="desktopBackupOnClose" type="checkbox">';
      settingsGrid.append(label);
    }

    const frequency = document.getElementById("fileBackupFrequency");
    const retention = document.getElementById("fileBackupRetention");
    const choose = document.getElementById("chooseBackupFolder");
    const now = document.getElementById("backupFileNow");
    const pause = document.getElementById("pauseFileBackup");
    const verify = document.getElementById("verifyBackupFile");
    const onClose = document.getElementById("desktopBackupOnClose");

    if (frequency) frequency.onchange = async (event) => {
      backupSettings = await native.setBackupSettings({ frequency: event.target.value });
      await refreshBackupUI("Frequência atualizada.");
      await runNativeBackup(false, "settings");
    };
    if (retention) retention.onchange = async (event) => {
      const value = Math.max(1, Math.min(100, Number(event.target.value) || 30));
      event.target.value = value;
      backupSettings = await native.setBackupSettings({ retention: value });
      await refreshBackupUI("Limite atualizado.");
    };
    if (onClose) onClose.onchange = async (event) => {
      backupSettings = await native.setBackupSettings({ onClose: Boolean(event.target.checked) });
      await refreshBackupUI("Preferência ao fechar atualizada.");
    };
    if (choose) choose.onclick = chooseNativeBackupFolder;
    if (now) now.onclick = () => runNativeBackup(true, "manual");
    if (pause) pause.onclick = disableNativeBackupFolder;
    if (verify) verify.onclick = restoreNative;

    // Replace the browser-only hook with a native snapshot + due-backup hook.
    window.FileProtection = {
      saved: () => {
        updateNativeSnapshot();
        runNativeBackup(false, "saved");
      },
    };

    refreshBackupUI();
    updateNativeSnapshot();
    runNativeBackup(false, "startup");
  }


  let desktopAboutPending = false;
  async function prepareDesktopAboutPanel() {
    const grid = document.querySelector("#settings .settings-grid");
    if (!grid || desktopAboutPending) return;
    const desktopPanels = [...grid.querySelectorAll("article.panel")].filter((panel) => panel.querySelector(":scope > h2")?.textContent.trim() === "Aplicação desktop");
    const existingDesktopPanel = document.getElementById("desktopAboutPanel");
    if (existingDesktopPanel) {
      desktopPanels.filter((panel) => panel !== existingDesktopPanel).forEach((panel) => panel.closest("details.settings-disclosure")?.remove() || panel.remove());
      return;
    }
    // Remove qualquer painel legado/sem ID antes de criar o único painel canónico.
    desktopPanels.forEach((panel) => panel.closest("details.settings-disclosure")?.remove() || panel.remove());
    desktopAboutPending = true;
    let info;
    try {
      info = await native.getAppInfo();
    } catch (error) {
      desktopAboutPending = false;
      throw error;
    }
    if (document.getElementById("desktopAboutPanel")) {
      desktopAboutPending = false;
      return;
    }
    const panel = document.createElement("article");
    panel.className = "panel";
    panel.id = "desktopAboutPanel";
    panel.innerHTML = `
      <h2>Aplicação desktop</h2>
      <p class="desktop-version-line"><strong>Finanças Pessoais Desktop ${info.displayVersion}</strong> <span>· Web ${info.webVersion} · Schema ${info.schemaVersion}</span></p>
      <p>Os teus dados são guardados fora da pasta do programa, no perfil do Windows. Reinstalar ou substituir a aplicação não apaga os Espaços Financeiros.</p>
      <p class="muted desktop-storage-meta"><strong>Armazenamento: ${info.storage?.mode || "SQLite"}</strong> · ${info.storage?.spaces ?? 0} Espaço${Number(info.storage?.spaces) === 1 ? "" : "s"} Financeiro${Number(info.storage?.spaces) === 1 ? "" : "s"} · ${info.packaged ? "Aplicação instalada" : "Modo de desenvolvimento"}</p>
      <p class="muted desktop-storage-meta">Fonte principal: SQLite · Leituras críticas: diretas · Contas ${info.storage?.domains?.accounts ?? 0} · Movimentos ${info.storage?.domains?.transactions ?? 0} · Categorias ${info.storage?.domains?.categories ?? 0} · Créditos ${info.storage?.domains?.debts ?? 0} · Recorrências ${info.storage?.domains?.recurring ?? 0}</p>
      <div class="desktop-update-row">
        <span>Para atualizar, abre Definições → Manutenção e dados → Atualizar aplicação.</span>
        <span id="desktopUpdateStatus" class="muted"></span>
      </div>
      <details class="desktop-diagnostics">
        <summary>Diagnóstico técnico do build</summary>
        <div class="desktop-diagnostics-body" id="desktopDiagnosticsBody"></div>
      </details>
    `;
    grid.append(panel);
    [...grid.querySelectorAll("article.panel")]
      .filter((candidate) => candidate !== panel && candidate.querySelector(":scope > h2")?.textContent.trim() === "Aplicação desktop")
      .forEach((candidate) => candidate.closest("details.settings-disclosure")?.remove() || candidate.remove());
    desktopAboutPending = false;

    const diagnostic = applyBuildIdentity(info);
    const diagnosticsBody = document.getElementById("desktopDiagnosticsBody");
    if (diagnosticsBody) {
      const statusClass = diagnostic.stableLoaded ? "desktop-diagnostic-ok" : "desktop-diagnostic-warn";
      diagnosticsBody.innerHTML = `
        <div class="desktop-diagnostic-line"><span>Build</span><code>${diagnostic.displayVersion || diagnostic.appVersion || "—"} · Web ${diagnostic.webVersion || "—"}</code></div>
        <div class="desktop-diagnostic-line"><span>CSS final</span><code class="${statusClass}">${diagnostic.stableLoaded ? "ui.css carregado" : "ui.css NÃO carregado"}</code></div>
        <div class="desktop-diagnostic-line"><span>Estilos</span><code>${diagnostic.styles.join(" → ") || "—"}</code></div>
        <div class="desktop-diagnostic-line"><span>Scripts</span><code>${diagnostic.scripts.join(" → ") || "—"}</code></div>
        <div class="desktop-diagnostic-line"><span>Aplicação</span><code>${diagnostic.appPath || "—"}</code></div>
        <div class="desktop-diagnostic-line"><span>Dados</span><code>${diagnostic.statePath || "—"}</code></div>`;
    }

    const updateStatus = document.getElementById("desktopUpdateStatus");
    const status = info.updateStatus;
    if (updateStatus && status) {
      if (status.state === "success") updateStatus.textContent = `Última atualização concluída: ${status.fromVersion} → ${status.toVersion}.`;
      else if (status.state === "failed-rolled-back") updateStatus.textContent = `Última atualização falhou e foi recuperada: ${status.error || "erro desconhecido"}.`;
      else if (status.state === "failed-rollback-error") updateStatus.textContent = `Falha na atualização e na recuperação. Reinstala a aplicação antes de continuar. ${status.rollbackError || status.error || ""}`;
      else if (String(status.state || "").startsWith("failed")) updateStatus.textContent = `Atualização não instalada: ${status.error || "erro desconhecido"}.`;
      else if (status.state === "installing" || status.state === "waiting-for-close") updateStatus.textContent = `Atualização ${status.toVersion || ""} ficou pendente; fecha totalmente a aplicação e volta a abrir.`;
    }

  }

  function bindDesktopIO() {
    if (typeof actions === "object" && actions) {
      actions.exportData = exportActiveNative;
      actions.importData = restoreNative;
      actions["backup-now"] = exportActiveNative;
      actions["plan-import"] = restoreNative;
      actions["daily-export-all"] = exportAllNative;
      actions["plan-export"] = exportAllNative;
      actions["daily-export-space"] = exportActiveNative;
    }

    const direct = {
      exportData: exportActiveNative,
      backupSettings: exportActiveNative,
      importData: restoreNative,
      restoreSettings: restoreNative,
    };
    for (const [id, handler] of Object.entries(direct)) {
      const el = document.getElementById(id);
      if (el) el.onclick = (event) => {
        event?.preventDefault?.();
        handler();
      };
    }

    if (window.DailyUI) {
      window.DailyUI.exportActive = exportActiveNative;
      window.DailyUI.prepareExport = (all = false) => all ? exportAllNative() : exportActiveNative();
    }

    prepareNativeBackupPanel();
    prepareDesktopAboutPanel();
  }

  // Confirm the first visible state against the normalized tables too.
  // The preload already bootstraps from SQLite, but this makes the source
  // explicit after every desktop startup and catches stale browser cache.
  try {
    const refreshed = refreshCriticalDomainsFromSqlite();
    if (refreshed?.ok) {
      window.renderEquilibrio?.();
    }
  } catch (error) {
    console.warn("Leitura inicial direta SQLite indisponível; mantém-se o cache carregado pelo preload.", error);
  }

  bindDesktopIO();
  window.addEventListener("load", bindDesktopIO, { once: true });
  window.addEventListener("focus", updateNativeSnapshot);
  window.addEventListener("beforeunload", () => {
    try { persistDesktopStorage(true, true); } catch {}
  });
  document.addEventListener("visibilitychange", () => {
    // Ao minimizar/trocar de aplicação, deixa o espelho de recuperação em dia.
    // Enquanto está oculto não faz polling nem escritas repetidas sem alterações.
    if (document.hidden) persistDesktopStorage(false);
  });
  setInterval(() => {
    if (!document.hidden) persistDesktopStorage(false);
  }, 10000);
  setInterval(() => runNativeBackup(false, "timer"), 10 * 60 * 1000);

  window.FinancasDesktopIO = {
    exportActiveNative,
    exportAllNative,
    restoreNative,
    runNativeBackup,
    refreshBackupUI,
  };
})();
