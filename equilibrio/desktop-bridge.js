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


  const CRITICAL_DOMAINS = ['accounts', 'transactions', 'debts', 'recurring', 'categoryCatalog', 'categoryArchive'];
  const CRITICAL_DOMAIN_SET = new Set(CRITICAL_DOMAINS);
  const lastUpdatedAtByKey = new Map();

  function samePatchVal(x, y) {
    if (x === y) return true;
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return false;
    if (Array.isArray(x)) {
      if (!Array.isArray(y) || x.length !== y.length) return false;
      for (let i = 0; i < x.length; i += 1) if (!samePatchVal(x[i], y[i])) return false;
      return true;
    }
    if (Array.isArray(y)) return false;
    const kx = Object.keys(x), ky = Object.keys(y);
    let cx = 0, cy = 0;
    for (let i = 0; i < kx.length; i += 1) {
      const k = kx[i];
      if (x[k] === undefined) continue;
      cx += 1;
      if (!samePatchVal(x[k], y[k])) return false;
    }
    for (let i = 0; i < ky.length; i += 1) if (y[ky[i]] !== undefined) cy += 1;
    return cx === cy;
  }

  function patchEntityId(domain, item, index) {
    const direct = item && typeof item === 'object' ? item.id : null;
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct);
    if ((domain === 'categoryCatalog' || domain === 'categoryArchive') && item && typeof item === 'object') {
      const name = String(item.name || '').trim();
      if (name) return `name:${name}`;
    }
    return `row-${index}`;
  }

  function buildLedgerPatch(beforeLedger, afterLedger, baseUpdatedAt) {
    if (!beforeLedger || !afterLedger || beforeLedger.version !== 2 || afterLedger.version !== 2 || afterLedger.ledgerCoreVersion !== 1) {
      return null;
    }
    if (!samePatchVal(beforeLedger.casa, afterLedger.casa)) return null;
    const domains = {};
    let totalRowChanges = 0;
    for (const domain of CRITICAL_DOMAINS) {
      const bArr = Array.isArray(beforeLedger[domain]) ? beforeLedger[domain] : [];
      const aArr = Array.isArray(afterLedger[domain]) ? afterLedger[domain] : [];
      const bMap = new Map();
      for (let i = 0; i < bArr.length; i += 1) bMap.set(patchEntityId(domain, bArr[i], i), { item: bArr[i], order: i });
      const aMap = new Map();
      for (let i = 0; i < aArr.length; i += 1) aMap.set(patchEntityId(domain, aArr[i], i), { item: aArr[i], order: i });
      const deleted = [];
      for (const [id, row] of bMap) {
        if (!aMap.has(id)) deleted.push({ id, order: row.order, before: row.item });
      }
      const changed = [];
      for (const [id, row] of aMap) {
        const old = bMap.get(id);
        if (old && old.order === row.order && samePatchVal(old.item, row.item)) continue;
        changed.push(old
          ? { id, order: row.order, oldOrder: old.order, hadBefore: true, before: old.item, after: row.item }
          : { id, order: row.order, hadBefore: false, after: row.item });
      }
      if (deleted.length || changed.length) {
        totalRowChanges += deleted.length + changed.length;
        if (totalRowChanges > 40) return null;
        domains[domain] = { countBefore: bArr.length, countAfter: aArr.length, deleted, changed };
      }
    }
    const remainder = {};
    const allKeys = new Set([...Object.keys(beforeLedger), ...Object.keys(afterLedger)]);
    for (const k of allKeys) {
      if (CRITICAL_DOMAIN_SET.has(k)) continue;
      const bVal = beforeLedger[k], aVal = afterLedger[k];
      if (samePatchVal(bVal, aVal)) continue;
      if (k === 'activity' && Array.isArray(bVal) && Array.isArray(aVal) && aVal.length >= 1) {
        let matched = false;
        if (aVal.length > bVal.length && aVal.length - bVal.length <= 5) {
          let prefixSame = true;
          for (let i = 0; i < bVal.length; i += 1) {
            if (!samePatchVal(bVal[i], aVal[i])) { prefixSame = false; break; }
          }
          if (prefixSame) {
            remainder.activity = {
              op: 'activity',
              beforeLen: bVal.length,
              lastBeforeId: bVal.length ? bVal[bVal.length - 1]?.id : null,
              pushed: aVal.slice(bVal.length),
              maxLen: 0,
            };
            matched = true;
          }
        } else if (bVal.length === 150 && aVal.length === 150) {
          for (let shift = 1; shift <= 5; shift += 1) {
            let shiftedSame = true;
            for (let i = 0; i < 150 - shift; i += 1) {
              if (!samePatchVal(bVal[i + shift], aVal[i])) { shiftedSame = false; break; }
            }
            if (shiftedSame) {
              remainder.activity = {
                op: 'activity',
                beforeLen: bVal.length,
                lastBeforeId: bVal[bVal.length - 1]?.id,
                pushed: aVal.slice(150 - shift),
                maxLen: 150,
              };
              matched = true;
              break;
            }
          }
        }
        if (matched) continue;
      }
      remainder[k] = {
        hadBefore: bVal !== undefined,
        before: bVal,
        hasAfter: aVal !== undefined,
        after: aVal,
      };
    }
    return {
      version: 2,
      baseUpdatedAt: baseUpdatedAt || null,
      spaceName: afterLedger.spaceName,
      domains,
      remainder,
    };
  }

  function commitLedgerDirect(beforeLedger, afterLedger, storageKey) {
    try {
      const resolvedKey = String(storageKey || 'equilibrioData');
      if (native.dataCommitLedgerPatchSync) {
        const patch = buildLedgerPatch(beforeLedger, afterLedger, lastUpdatedAtByKey.get(resolvedKey));
        if (patch) {
          const patchResult = native.dataCommitLedgerPatchSync(resolvedKey, JSON.stringify(patch));
          if (patchResult?.ok) {
            if (patchResult.updatedAt) lastUpdatedAtByKey.set(resolvedKey, patchResult.updatedAt);
            return patchResult;
          }
          if (!patchResult?.fallbackFull) {
            throw new Error(patchResult?.error || 'Não foi possível gravar a alteração em SQLite.');
          }
        }
      }
      if (native.dataCommitLedgerConfirmedSync) {
        const afterText = JSON.stringify(afterLedger);
        const result = native.dataCommitLedgerConfirmedSync(resolvedKey, JSON.stringify(beforeLedger), afterText);
        if (!result?.ok) throw new Error(result?.error || 'Não foi possível gravar a alteração em SQLite.');
        if (result.updatedAt) lastUpdatedAtByKey.set(resolvedKey, result.updatedAt);
        return { ...result, cacheText: result.confirmedLedgerText ?? afterText };
      }
      const result = (native.dataCommitLedgerSync || native.applyLedgerDelta)(resolvedKey, beforeLedger || {}, afterLedger || {});
      if (!result?.ok) throw new Error(result?.error || result?.reason || 'Não foi possível gravar a alteração em SQLite.');
      return result;
    } catch (error) {
      console.error('Persistência incremental do Espaço Financeiro falhou:', error);
      throw error;
    }
  }

  function saveSpaceDirect(ledger, storageKey) {
    try {
      const resolvedKey = String(storageKey || 'equilibrioData');
      const result = native.writeSqliteSpaceSync(resolvedKey, ledger || {});
      if (!result?.ok) throw new Error(result?.error || result?.reason || 'Não foi possível gravar o Espaço Financeiro em SQLite.');
      if (result.updatedAt) lastUpdatedAtByKey.set(resolvedKey, result.updatedAt);
      else lastUpdatedAtByKey.delete(resolvedKey);
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
      if (result?.key && result?.updatedAt) lastUpdatedAtByKey.set(result.key, result.updatedAt);
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
      if (space.key && space.updatedAt) lastUpdatedAtByKey.set(space.key, space.updatedAt);
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
      lastUpdatedAtByKey.clear();
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
      if (window.equilibrioMobileSyncPending) return sync ? true : Promise.resolve({ ok: true, skipped: true });
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
      if (!native.runBackupFromSqlite) native.updateSnapshot(fullSnapshotText());
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
    window.FeatureUI?.renderBackupReminder();
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
    choose?.classList.toggle('primary', !backupSettings.directory);
    choose?.classList.toggle('secondary', Boolean(backupSettings.directory));
    now?.classList.toggle('primary', Boolean(backupSettings.directory));
    now?.classList.toggle('secondary', !backupSettings.directory);
    if (pause) pause.disabled = !backupSettings.directory;
    if (verify) verify.hidden = true;

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
      let result;
      if (native.runBackupFromSqlite) {
        result = await native.runBackupFromSqlite({
          force, reason, device: localStorage.getItem("equilibrioDeviceName") || "",
        });
      } else {
        const content = fullSnapshotText();
        native.updateSnapshot(content);
        result = await native.runBackup(content, { force, reason });
      }
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
    if (intro) intro.textContent = "O Equilíbrio guarda e verifica uma cópia JSON de todos os espaços. Se a pasta escolhida falhar, guarda uma cópia interna de segurança.";

    if (!document.getElementById('encryptedBackupCard')) {
      const encrypted = document.createElement('section');
      encrypted.id = 'encryptedBackupCard';
      encrypted.className = 'encrypted-backup-card';
      encrypted.innerHTML = '<h3>Cópia encriptada opcional</h3><p>Exporta todos os espaços para um ficheiro .fpbackup protegido por frase-passe. A frase-passe não é guardada. As cópias automáticas continuam sem encriptação.</p><div class="encrypted-backup-actions"><button type="button" class="primary" id="saveEncryptedBackup">Guardar cópia encriptada</button><button type="button" class="secondary" id="restoreEncryptedBackup">Restaurar cópia encriptada</button></div>';
      (document.getElementById('backupSettings')?.closest('article') || panel).append(encrypted);
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
      lastForSpace: () => backupSettings?.lastBackupAt || "",
    };

    refreshBackupUI();
    updateNativeSnapshot();
    runNativeBackup(false, "startup");
  }


  if (typeof native.confirm === 'function') {
    window.confirm = message => native.confirm(String(message));
  }

  let desktopAboutPending = false;
  async function prepareDesktopAboutPanel() {
    const grid = document.querySelector("#settings .settings-grid");
    const host = document.getElementById("faqDesktopDiagnostics");
    if (!grid || !host || desktopAboutPending) return;
    const desktopPanels = [...grid.querySelectorAll("article.panel")].filter((panel) => panel.querySelector(":scope > h2")?.textContent.trim() === "Aplicação desktop");
    const existingDesktopPanel = document.getElementById("desktopAboutPanel");
    if (existingDesktopPanel) {
      desktopPanels.filter((panel) => panel !== existingDesktopPanel).forEach((panel) => panel.closest("details.settings-disclosure")?.remove() || panel.remove());
      if (existingDesktopPanel.parentElement !== host) host.append(existingDesktopPanel);
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
    const panel = document.createElement("section");
    panel.className = "panel desktop-diagnostics-panel";
    panel.id = "desktopAboutPanel";

    const versionP = document.createElement("p");
    versionP.className = "desktop-version-line";
    const versionStrong = document.createElement("strong");
    versionStrong.textContent = `Finanças Pessoais Desktop ${info.displayVersion || ""}`;
    const versionMeta = document.createElement("span");
    versionMeta.textContent = ` · Web ${info.webVersion || "—"} · Schema ${info.schemaVersion ?? "—"}`;
    versionP.append(versionStrong, " ", versionMeta);

    const spacesCount = Number(info.storage?.spaces) || 0;
    const storageP = document.createElement("p");
    storageP.className = "muted desktop-storage-meta";
    const storageStrong = document.createElement("strong");
    storageStrong.textContent = `Armazenamento: ${info.storage?.mode || "SQLite"}`;
    storageP.append(
      storageStrong,
      ` · ${spacesCount} Espaço${spacesCount === 1 ? "" : "s"} Financeiro${spacesCount === 1 ? "" : "s"} · ${info.packaged ? "Aplicação instalada" : "Modo de desenvolvimento"}`
    );

    const domainsP = document.createElement("p");
    domainsP.className = "muted desktop-storage-meta";
    domainsP.textContent = `Fonte principal: SQLite · Leituras críticas: diretas · Contas ${info.storage?.domains?.accounts ?? 0} · Movimentos ${info.storage?.domains?.transactions ?? 0} · Categorias ${info.storage?.domains?.categories ?? 0} · Créditos ${info.storage?.domains?.debts ?? 0} · Recorrências ${info.storage?.domains?.recurring ?? 0}`;

    const updateRow = document.createElement("div");
    updateRow.className = "desktop-update-row";
    const updateSpan = document.createElement("span");
    updateSpan.id = "desktopUpdateStatus";
    updateSpan.className = "muted";
    updateRow.append(updateSpan);

    const diagHost = document.createElement("div");
    diagHost.className = "desktop-diagnostics-body";
    diagHost.id = "desktopDiagnosticsBody";

    panel.append(versionP, storageP, domainsP, updateRow, diagHost);
    host.append(panel);
    [...grid.querySelectorAll("article.panel")]
      .filter((candidate) => candidate !== panel && candidate.querySelector(":scope > h2")?.textContent.trim() === "Aplicação desktop")
      .forEach((candidate) => candidate.closest("details.settings-disclosure")?.remove() || candidate.remove());
    desktopAboutPending = false;

    const diagnostic = applyBuildIdentity(info);
    const diagnosticsBody = document.getElementById("desktopDiagnosticsBody");
    if (diagnosticsBody) {
      const addDiagLine = (label, value, codeClass = "") => {
        const row = document.createElement("div");
        row.className = "desktop-diagnostic-line";
        const span = document.createElement("span");
        span.textContent = label;
        const code = document.createElement("code");
        if (codeClass) code.className = codeClass;
        code.textContent = value;
        row.append(span, code);
        diagnosticsBody.append(row);
      };
      const statusClass = diagnostic.stableLoaded ? "desktop-diagnostic-ok" : "desktop-diagnostic-warn";
      addDiagLine("Build", `${diagnostic.displayVersion || diagnostic.appVersion || "—"} · Web ${diagnostic.webVersion || "—"}`);
      addDiagLine("CSS final", diagnostic.stableLoaded ? "ui.css carregado" : "ui.css NÃO carregado", statusClass);
      addDiagLine("Estilos", diagnostic.styles.join(" → ") || "—");
      addDiagLine("Scripts", diagnostic.scripts.join(" → ") || "—");
      addDiagLine("Aplicação", diagnostic.appPath || "—");
      addDiagLine("Dados", diagnostic.statePath || "—");
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
  document.addEventListener("close", () => {
    queueMicrotask(() => {
      try {
        if (document.querySelector("dialog[open]")) return;
        window.focus();
        const active = document.activeElement;
        if (!active || !active.isConnected || active === document.body) {
          const main = document.getElementById("mainContent");
          if (main) {
            if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
            main.focus({ preventScroll: true });
          }
        }
      } catch {}
    });
  }, true);
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
    latestBackupAt: () => backupSettings?.lastBackupAt,
    exportActiveNative,
    exportAllNative,
    restoreNative,
    runNativeBackup,
    refreshBackupUI,
    prepareDiagnostics: prepareDesktopAboutPanel,
  };
})();
