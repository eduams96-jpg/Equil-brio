'use strict';

function isValidJsonText(content) {
  if (typeof content !== 'string' || !content.trim()) return false;
  try { JSON.parse(content); return true; } catch { return false; }
}

function buildSqliteSnapshot(dataService, now = () => new Date().toISOString(), metadata = {}) {
  if (!dataService?.listSpaces || !dataService?.readSpace) return '';
  const captured = dataService.snapshotSpaces?.();
  const spaces = captured || dataService.listSpaces() || [];
  if (!spaces.length) return '';
  const payload = {
    format: 'equilibrio-spaces',
    version: 1,
    exportedAt: now(),
    backupMetadata: {version:1,copyId:require('node:crypto').randomUUID(),createdAt:now(),appVersion:require('./version.cjs').APP_VERSION,origin:'Todos os espaços',device:String(metadata.device||'PC sem nome definido').slice(0,80)},
    spaces: spaces.map((space) => {
      const direct = captured ? space : dataService.readSpace(String(space.id || ''));
      if (!direct?.data) throw new Error(`Não foi possível ler o espaço ${space.name || space.id || '(sem nome)'} em SQLite.`);
      return {
        name: String(space.name || direct.name || direct.data.spaceName || 'Pessoal'),
        data: direct.data,
      };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

function resolveBackupText({ preferred = '', dataService = null, readStorage = null, now } = {}) {
  // SQLite é a fonte durável. Nunca confiar primeiro num snapshot vindo do
  // renderer/browser-state para cópias automáticas ou de segurança.
  if (dataService) {
    let metadata={};try{metadata=JSON.parse(preferred).backupMetadata||{};}catch{}
    if(!metadata.device&&typeof readStorage==='function'){try{metadata.device=readStorage()?.equilibrioDeviceName||'';}catch{}}
    const sqlite = buildSqliteSnapshot(dataService, now, metadata);
    if (isValidJsonText(sqlite)) return sqlite;
    throw new Error('Não foi possível ler uma cópia completa do SQLite. A cópia antiga não foi substituída.');
  }

  // Só em instalações sem SQLite usamos um snapshot já validado.
  if (isValidJsonText(preferred)) return preferred;

  if (typeof readStorage === 'function') {
    try {
      const storage = JSON.stringify(readStorage() || {}, null, 2);
      if (isValidJsonText(storage)) return storage;
    } catch (error) {
      console.error('Não foi possível reconstruir a cópia pelo armazenamento de compatibilidade:', error);
    }
  }

  throw new Error('Não foi possível obter uma cópia JSON válida dos dados. Os dados SQLite foram preservados.');
}

module.exports = { isValidJsonText, buildSqliteSnapshot, resolveBackupText };
