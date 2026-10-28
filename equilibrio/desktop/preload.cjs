const { contextBridge, ipcRenderer } = require('electron');

// Rehydrate the browser storage synchronously before the application's normal
// scripts execute. The real persistent copy lives in Electron userData, not in
// the random localhost port used by the internal server.
try {
  const stored = ipcRenderer.sendSync('financas:storage:bootstrap');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    localStorage.clear();
    for (const [key, value] of Object.entries(stored)) {
      if (typeof key === 'string' && typeof value === 'string') localStorage.setItem(key, value);
    }
  }
} catch (error) {
  console.error('Não foi possível recuperar o estado persistente do Desktop:', error);
}

let buildInfo = { appVersion: '', displayVersion: '', webVersion: '' };
try {
  const received = ipcRenderer.sendSync('financas:build-info');
  if (received && typeof received === 'object' && !Array.isArray(received)) buildInfo = { ...buildInfo, ...received };
} catch (error) {
  console.warn('Não foi possível obter a identificação do build:', error);
}

contextBridge.exposeInMainWorld('financasDesktop', {
  isDesktop: true,
  readDraft: (space) => ipcRenderer.sendSync('financas:draft:read', space),
  writeDraft: (space, value) => ipcRenderer.sendSync('financas:draft:write', {space,value}),
  removeDraft: (space) => ipcRenderer.sendSync('financas:draft:remove', space),
  platform: process.platform,
  desktopVersion: buildInfo.appVersion,
  desktopDisplayVersion: buildInfo.displayVersion,
  webVersion: buildInfo.webVersion,
  saveJson: (defaultName, content) => ipcRenderer.invoke('financas:save-json', { defaultName, content }),
  openJson: () => ipcRenderer.invoke('financas:open-json'),
  saveEncryptedBackup: (defaultName, content, passphrase) => ipcRenderer.invoke('financas:backup:encrypted-save', { defaultName, content, passphrase }),
  openEncryptedBackup: (passphrase) => ipcRenderer.invoke('financas:backup:encrypted-open', passphrase),
  getBackupSettings: () => ipcRenderer.invoke('financas:backup-settings:get'),
  setBackupSettings: (patch) => ipcRenderer.invoke('financas:backup-settings:set', patch),
  chooseBackupDirectory: () => ipcRenderer.invoke('financas:backup-directory:choose'),
  disableBackupDirectory: () => ipcRenderer.invoke('financas:backup-directory:disable'),
  runBackup: (content, options = {}) => ipcRenderer.invoke('financas:backup:run', { content, ...options }),
  listBackups: () => ipcRenderer.invoke('financas:backup:list'),
  readBackup: (filePath) => ipcRenderer.invoke('financas:backup:read',filePath),
  protectSpaceTransfer: (content) => ipcRenderer.invoke('financas:spaces:protect',content),
  updateSnapshot: (content) => ipcRenderer.send('financas:snapshot:update', content),
  saveStorage: (state) => ipcRenderer.invoke('financas:storage:save', state),
  saveStorageSync: (state) => ipcRenderer.sendSync('financas:storage:save-sync', state),
  replaceStorage: (state) => ipcRenderer.invoke('financas:storage:replace', state),
  replaceStorageGuardedSync: (state, expected) => ipcRenderer.sendSync('financas:storage:replace-guarded-sync', {state,expected}),
  replaceStorageSync: (state) => ipcRenderer.sendSync('financas:storage:replace-sync', state),
  getAppInfo: () => ipcRenderer.invoke('financas:app-info'),
  installUpdateFile: () => ipcRenderer.invoke('financas:update:install-file'),
  getUpdateStatus: () => ipcRenderer.invoke('financas:update:status'),
  clearUpdateStatus: () => ipcRenderer.invoke('financas:update:status-clear'),
  openAttachment: (attachment) => ipcRenderer.invoke('financas:attachment:open', attachment || {}),
  saveAttachment: (attachment) => ipcRenderer.invoke('financas:attachment:save', attachment || {}),
  listSqliteSpaces: () => ipcRenderer.invoke('financas:sqlite:spaces'),
  listSqliteSpacesSync: () => ipcRenderer.sendSync('financas:sqlite:spaces-sync'),
  readSqliteSpace: (spaceId) => ipcRenderer.invoke('financas:sqlite:space', String(spaceId || '')),
  readSqliteSpaceSync: (spaceId) => ipcRenderer.sendSync('financas:sqlite:space-sync', String(spaceId || '')),
  writeSqliteSpaceSync: (storageKey, ledger) => ipcRenderer.sendSync('financas:sqlite:space-write-sync', { storageKey, ledger }),
  readSqliteDomainSync: (spaceId, domain) => ipcRenderer.sendSync('financas:sqlite:domain-sync', { spaceId, domain }),
  applyLedgerDelta: (storageKey, beforeLedger, afterLedger) => ipcRenderer.sendSync('financas:sqlite:ledger-delta-sync', { storageKey, beforeLedger, afterLedger }),
  syncCriticalDomains: (storageKey, beforeLedger, afterLedger) => ipcRenderer.sendSync('financas:sqlite:critical-sync', { storageKey, beforeLedger, afterLedger }),
  dataListSpacesSync: () => ipcRenderer.sendSync('financas:data:spaces-sync'),
  dataReadSpaceSync: (spaceId) => ipcRenderer.sendSync('financas:data:space-sync', String(spaceId || '')),
  dataReadDomainSync: (spaceId, domain) => ipcRenderer.sendSync('financas:data:domain-sync', { spaceId, domain }),
  dataCommitLedgerSync: (storageKey, beforeLedger, afterLedger) => ipcRenderer.sendSync('financas:data:commit-ledger-sync', { storageKey, beforeLedger, afterLedger }),
  dataUpsertEntitySync: (spaceId, domain, entity) => ipcRenderer.sendSync('financas:data:entity-upsert-sync', { spaceId, domain, entity }),
  dataDeleteEntitySync: (spaceId, domain, entityId) => ipcRenderer.sendSync('financas:data:entity-delete-sync', { spaceId, domain, entityId }),
  migrateJson: (incomingContent, currentContent) => ipcRenderer.invoke('financas:migration:apply', { incomingContent, currentContent }),
});

contextBridge.exposeInMainWorld("EquilibrioMobile",{onChange:callback=>{if(typeof callback!=="function")return;ipcRenderer.on("equilibrio:mobile:changed",(_event,spaceId)=>callback(String(spaceId)));},action:input=>ipcRenderer.invoke("equilibrio:mobile:action",input)});
