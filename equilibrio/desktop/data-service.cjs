'use strict';
const Finance = require('../finance.js');
const {validateLedger}=require('./ledger-validation.cjs');
function canonicalLedger(value) {
  const copy = clone(value);
  // Historical repairs belong to the backed-up startup migration, never to CRUD.
  return copy?.version === 2 ? validateLedger(copy.ledgerCoreVersion === 1 ? copy : Finance.migrateLedgerCore(copy)) : copy;
}

const SUPPORTED_DOMAINS = new Set([
  'accounts',
  'transactions',
  'debts',
  'recurring',
  'categoryCatalog',
  'categoryArchive',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} inválido.`);
  }
}

function assertDomain(domain) {
  const name = String(domain || '').trim();
  if (!SUPPORTED_DOMAINS.has(name)) throw new Error(`Domínio não suportado: ${name || '(vazio)'}.`);
  return name;
}

function entityIdentity(domain, item, index = 0) {
  assertObject(item, 'Entidade');
  if (item.id !== undefined && item.id !== null && String(item.id).trim()) return String(item.id);
  if (domain === 'categoryCatalog' || domain === 'categoryArchive') {
    const name = String(item.name || '').trim();
    if (name) return `name:${name}`;
  }
  return `row-${index}`;
}

function createDataService(sqliteStorage) {
  if (!sqliteStorage) throw new Error('SQLite indisponível para a camada de dados.');

  function listSpaces() {
    return sqliteStorage.listSpaces?.() || [];
  }

  function readSpace(spaceId) {
    const id = String(spaceId || '').trim();
    if (!id) return null;
    return sqliteStorage.readSpace?.(id) || null;
  }

  function readDomain(spaceId, domain) {
    const id = String(spaceId || '').trim();
    if (!id) return [];
    const name = assertDomain(domain);
    return sqliteStorage.readDomain?.(id, name) || [];
  }

  function writeSpace(storageKey, ledger) {
    const key = String(storageKey || '').trim();
    if (!key) throw new Error('Chave do Espaço Financeiro em falta.');
    assertObject(ledger, 'Espaço Financeiro');
    return sqliteStorage.writeSpace(key, canonicalLedger(ledger));
  }

  function commitLedger(storageKey, beforeLedger, afterLedger) {
    const key = String(storageKey || '').trim();
    if (!key) throw new Error('Chave do Espaço Financeiro em falta.');
    assertObject(beforeLedger || {}, 'Estado anterior');
    assertObject(afterLedger, 'Estado do Espaço Financeiro');
    return sqliteStorage.applyLedgerDelta(key, clone(beforeLedger || {}), canonicalLedger(afterLedger));
  }

  function commitLedgerConfirmed(storageKey, beforeText, afterText) {
    if (typeof beforeText !== 'string' || typeof afterText !== 'string')
      throw new Error('Dados de gravação inválidos.');
    const before = JSON.parse(beforeText);
    const submitted = JSON.parse(afterText);
    assertObject(before, 'Estado anterior');
    assertObject(submitted, 'Estado do Espaço Financeiro');
    if (submitted.version !== 2) throw new Error('Versão dos dados de gravação inválida.');
    let after;
    if (submitted.ledgerCoreVersion === 1) {
      after = Finance.normalize(submitted, { inPlace: true });
      require('../casa-model.js').validate(after);
    } else {
      after = canonicalLedger(submitted);
    }
    return sqliteStorage.writeLedgerDelta(storageKey, before, after, afterText);
  }

  function commitLedgerPatch(storageKey, patchText) {
    if (typeof patchText !== 'string') throw new Error('Alteração incremental inválida.');
    const patch = JSON.parse(patchText);
    assertObject(patch, 'Alteração incremental');
    if (patch.version !== 2) throw new Error('Versão dos dados de gravação inválida.');
    return sqliteStorage.writeLedgerPatch(storageKey, patch);
  }

  function resolveSpace(spaceId) {
    const current = readSpace(spaceId);
    if (!current?.data || !current?.key) throw new Error('Espaço Financeiro não encontrado.');
    return current;
  }

  function upsertEntity(spaceId, domain, entity) {
    const name = assertDomain(domain);
    assertObject(entity, 'Entidade');
    const current = resolveSpace(spaceId);
    const before = current.data;
    const after = clone(before);
    const rows = Array.isArray(after[name]) ? after[name] : [];
    const targetId = entityIdentity(name, entity, rows.length);
    const index = rows.findIndex((row, i) => entityIdentity(name, row, i) === targetId);
    if (index >= 0) rows[index] = clone(entity);
    else rows.push(clone(entity));
    after[name] = rows;
    const result = commitLedger(current.key, before, after);
    return { ...result, entity: clone(entity), domain: name };
  }

  function deleteEntity(spaceId, domain, entityId) {
    const name = assertDomain(domain);
    const id = String(entityId || '').trim();
    if (!id) throw new Error('Identificador da entidade em falta.');
    const current = resolveSpace(spaceId);
    const before = current.data;
    const after = clone(before);
    const rows = Array.isArray(after[name]) ? after[name] : [];
    const next = rows.filter((row, i) => entityIdentity(name, row, i) !== id);
    if (next.length === rows.length) return { ok: true, skipped: true, reason: 'entity-not-found', domain: name, id };
    after[name] = next;
    const result = commitLedger(current.key, before, after);
    return { ...result, domain: name, id };
  }

  function info() {
    return {
      service: 'data-service-v1',
      domains: Array.from(SUPPORTED_DOMAINS),
      storage: sqliteStorage.info?.() || null,
    };
  }

  return {
    listSpaces,
    readSpace,
    snapshotSpaces: () => sqliteStorage.snapshotSpaces(),
    readDomain,
    writeSpace,
    commitLedger,
    commitLedgerConfirmed,
    commitLedgerPatch,
    upsertEntity,
    deleteEntity,
    info,
  };
}

module.exports = {
  createDataService,
  SUPPORTED_DOMAINS,
};
