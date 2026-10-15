const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const {
  CURRENT_DB_SCHEMA_VERSION,
  prepareDatabase,
  initializeFreshSchema,
  integrityCheck,
  recordIntegrityHealth,
  migrationHistory,
} = require('./schema-migrations.cjs');

const NORMALIZED_SCHEMA_VERSION = 2;
const CRITICAL_ARRAYS = ['accounts', 'transactions', 'debts', 'recurring', 'categoryCatalog', 'categoryArchive'];

function writeConflict(domain) {
  const labels = { accounts: 'contas', transactions: 'movimentos', debts: 'dívidas', recurring: 'compromissos recorrentes', categoryCatalog: 'categorias', categoryArchive: 'categorias arquivadas', providerIcons: 'ícones', subscriptions: 'subscrições', casa: 'dados da Casa', budgets: 'orçamentos', goals: 'objetivos', reserves: 'reservas', reconciliations: 'reconciliações', closedMonths: 'meses fechados', monthlyConclusions: 'conclusões mensais', activity: 'histórico', trash: 'recuperação', spaceName: 'nome do espaço' };
  return new Error('Os dados foram alterados noutra operação (' + (labels[domain] || 'dados do espaço') + '). Recarrega antes de guardar. Nenhuma alteração foi guardada.');
}

function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    if (key.length > 200) continue;
    clean[key] = value;
  }
  return clean;
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function parseStoredObject(text, label) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('JSON SQLite inválido em ' + label + '. Os dados foram preservados.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Registo SQLite inválido em ' + label + '. Os dados foram preservados.');
  return value;
}

function timestampPart() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function canonicalRegistry(state) {
  const parsed = safeJsonParse(state.equilibrioSpaces || '[]', []);
  const registry = Array.isArray(parsed) ? parsed.filter((s) => s && typeof s === 'object') : [];
  const seen = new Set();
  const out = [];
  for (const s of registry) {
    const id = String(s.id || '').trim();
    const name = String(s.name || '').trim();
    const storageKey = String(s.key || '').trim();
    if (!id || !name || !storageKey || seen.has(id)) continue;
    if (storageKey !== (id === 'main' ? 'equilibrioData' : `equilibrioData:${id}`)) continue;
    seen.add(id);
    out.push({ id, name, key: storageKey });
  }
  if (!out.length && typeof state.equilibrioData === 'string') {
    out.push({ id: 'main', name: 'Pessoal', key: 'equilibrioData' });
  }
  return out;
}

function countSpacesFromState(state) {
  return canonicalRegistry(state).length;
}

function createSqliteStorage(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, 'financas.db');
  const legacyPath = path.join(userDataDir, 'browser-state.json');
  const schemaPreparation = prepareDatabase(dbPath, userDataDir);
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS storage_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS schema_health (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      last_check_at TEXT NOT NULL,
      last_result TEXT NOT NULL,
      details TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL,
      remainder_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      space_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS transactions (
      space_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS debts (
      space_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS recurring (
      space_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS categories (
      space_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('catalog','archive')),
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (space_id, source, id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_space_order ON accounts(space_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_transactions_space_order ON transactions(space_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_debts_space_order ON debts(space_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_recurring_space_order ON recurring(space_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_categories_space_source_order ON categories(space_id, source, sort_order);
  `);

  if (schemaPreparation.fresh) {
    initializeFreshSchema(db);
  } else {
    const startupIntegrity = integrityCheck(db);
    if (!startupIntegrity.ok) {
      throw new Error(`A base SQLite falhou a verificação de integridade no arranque: ${(startupIntegrity.details || []).join(' | ')}`);
    }
    recordIntegrityHealth(db, startupIntegrity, 'startup-after-open');
    const declared = Number(db.prepare("SELECT value FROM meta WHERE key = 'db_schema_version'").get()?.value || 0);
    if (declared < CURRENT_DB_SCHEMA_VERSION) {
      throw new Error(`Schema SQLite incompleto após preparação: ${declared}/${CURRENT_DB_SCHEMA_VERSION}.`);
    }
  }

  const readStateStmt = db.prepare('SELECT key, value FROM app_state ORDER BY key');
  const insertStateStmt = db.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const clearStateStmt = db.prepare('DELETE FROM app_state');
  const countStateStmt = db.prepare('SELECT COUNT(*) AS count FROM app_state');
  const getMetaStmt = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMetaStmt = db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const migrationStmt = db.prepare(`
    INSERT OR IGNORE INTO storage_migrations (name, applied_at, details)
    VALUES (?, ?, ?)
  `);

  const insertSpaceStmt = db.prepare(`
    INSERT INTO spaces (id, name, storage_key, sort_order, remainder_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertAccountStmt = db.prepare('INSERT INTO accounts (space_id,id,sort_order,payload_json) VALUES (?,?,?,?)');
  const insertTransactionStmt = db.prepare('INSERT INTO transactions (space_id,id,sort_order,payload_json) VALUES (?,?,?,?)');
  const insertDebtStmt = db.prepare('INSERT INTO debts (space_id,id,sort_order,payload_json) VALUES (?,?,?,?)');
  const insertRecurringStmt = db.prepare('INSERT INTO recurring (space_id,id,sort_order,payload_json) VALUES (?,?,?,?)');
  const insertCategoryStmt = db.prepare('INSERT INTO categories (space_id,source,id,sort_order,payload_json) VALUES (?,?,?,?,?)');

  function getMeta(key, fallback = '') {
    try { return getMetaStmt.get(String(key))?.value ?? fallback; } catch { return fallback; }
  }

  function setMeta(key, value) {
    setMetaStmt.run(String(key), String(value));
  }

  function rawStateMirror() {
    const result = {};
    for (const row of readStateStmt.all()) result[row.key] = row.value;
    return result;
  }

  function tableRows(table, spaceId) {
    return db.prepare(`SELECT payload_json FROM ${table} WHERE space_id = ? ORDER BY sort_order, id`).all(spaceId)
      .map((row) => {
        const value = JSON.parse(row.payload_json);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registo SQLite inválido em ' + table);
        return value;
      });
  }

  function categoryRows(spaceId, source) {
    return db.prepare('SELECT payload_json FROM categories WHERE space_id = ? AND source = ? ORDER BY sort_order, id').all(spaceId, source)
      .map((row) => parseStoredObject(row.payload_json, 'categories/' + source));
  }

  function readNormalizedState() {
    const base = rawStateMirror();
    const spaces = db.prepare('SELECT id,name,storage_key,remainder_json FROM spaces ORDER BY sort_order,id').all();
    if (!spaces.length) return base;

    const registry = [];
    for (const row of spaces) {
      registry.push({ id: row.id, name: row.name, key: row.storage_key });
      const ledger = parseStoredObject(row.remainder_json, 'spaces/' + row.id);
      ledger.accounts = tableRows('accounts', row.id);
      ledger.transactions = tableRows('transactions', row.id);
      ledger.debts = tableRows('debts', row.id);
      ledger.recurring = tableRows('recurring', row.id);
      ledger.categoryCatalog = categoryRows(row.id, 'catalog');
      ledger.categoryArchive = categoryRows(row.id, 'archive');
      base[row.storage_key] = JSON.stringify(ledger);
    }
    base.equilibrioSpaces = JSON.stringify(registry);
    return base;
  }

  function readState() {
    if (Number(getMeta('normalized_schema', '0')) >= NORMALIZED_SCHEMA_VERSION) return readNormalizedState();
    return rawStateMirror();
  }

  function insertEntityRows(spaceId, table, rows, insertStmt) {
    if (rows !== undefined && !Array.isArray(rows)) throw new Error('Lista inválida: ' + table);
    (Array.isArray(rows) ? rows : []).forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registo inválido: ' + table);
      const id = String(item.id ?? `row-${index}`);
      insertStmt.run(spaceId, id, index, JSON.stringify(item));
    });
  }

  function syncNormalizedFromState(clean, now) {
    const registry = canonicalRegistry(clean);
    if (clean.equilibrioSpaces !== undefined) {
      const declared = safeJsonParse(clean.equilibrioSpaces, null);
      if (!Array.isArray(declared) || registry.length < declared.length || declared.some(s => !s || !registry.some(r => r.id === String(s.id || '').trim() && r.key === String(s.key || '').trim() && r.name === String(s.name || '').trim()))) throw new Error('Catálogo de espaços inválido; os dados atuais foram preservados.');
    }
    db.exec('DELETE FROM spaces');
    let syncedSpaces = 0;
    for (let i = 0; i < registry.length; i += 1) {
      const space = registry[i];
      const rawLedger = clean[space.key];
      if (typeof rawLedger !== 'string') throw new Error('Dados em falta no espaço: ' + space.name);
      const ledger = safeJsonParse(rawLedger, null);
      if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) throw new Error('Dados inválidos no espaço: ' + space.name);

      const remainder = { ...ledger };
      require('../casa-model.js').validate(ledger);
      for (const key of CRITICAL_ARRAYS) delete remainder[key];
      insertSpaceStmt.run(space.id, space.name, space.key, i, JSON.stringify(remainder), now);
      insertEntityRows(space.id, 'accounts', ledger.accounts, insertAccountStmt);
      insertEntityRows(space.id, 'transactions', ledger.transactions, insertTransactionStmt);
      insertEntityRows(space.id, 'debts', ledger.debts, insertDebtStmt);
      insertEntityRows(space.id, 'recurring', ledger.recurring, insertRecurringStmt);
      insertEntityRows(space.id, 'categories', ledger.categoryCatalog, {
        run: (sid, id, order, payload) => insertCategoryStmt.run(sid, 'catalog', id, order, payload),
      });
      insertEntityRows(space.id, 'categories', ledger.categoryArchive, {
        run: (sid, id, order, payload) => insertCategoryStmt.run(sid, 'archive', id, order, payload),
      });
      syncedSpaces += 1;
    }
    if (syncedSpaces) {
      setMetaStmt.run('normalized_schema', String(NORMALIZED_SCHEMA_VERSION));
      setMetaStmt.run('storage_schema', String(NORMALIZED_SCHEMA_VERSION));
    }
    return { spaces: syncedSpaces, normalized: syncedSpaces > 0 };
  }

  function writeState(raw, expected = null) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Estado de restauro inválido.');
    const clean = sanitizeState(raw);
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (expected) {
        const current = readState();
        for (const [key, value] of Object.entries(expected)) {
          const actual = current[key];
          const parse = v => v == null ? null : JSON.parse(v);
          if (!require("node:util").isDeepStrictEqual(parse(actual), parse(value))) throw writeConflict(key);
        }
      }
      clearStateStmt.run();
      for (const [key, value] of Object.entries(clean)) insertStateStmt.run(key, value, now);
      const normalized = syncNormalizedFromState(clean, now);
      setMetaStmt.run('last_write_at', now);
      if (!normalized.normalized) setMetaStmt.run('storage_schema', String(NORMALIZED_SCHEMA_VERSION));
      db.exec('COMMIT');
      return { ok: true, keys: Object.keys(clean).length, path: dbPath, ...normalized };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }


  function writeCacheState(raw) {
    const clean = sanitizeState(raw);
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      clearStateStmt.run();
      for (const [key, value] of Object.entries(clean)) insertStateStmt.run(key, value, now);
      setMetaStmt.run('last_cache_write_at', now);
      db.exec('COMMIT');
      return { ok: true, keys: Object.keys(clean).length, path: dbPath, cacheOnly: true };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  function refreshRegistryMirror(now = new Date().toISOString()) {
    const registry = db.prepare('SELECT id,name,storage_key FROM spaces ORDER BY sort_order,id').all()
      .map((row) => ({ id: row.id, name: row.name, key: row.storage_key }));
    insertStateStmt.run('equilibrioSpaces', JSON.stringify(registry), now);
    setMetaStmt.run('normalized_schema', String(NORMALIZED_SCHEMA_VERSION));
    setMetaStmt.run('storage_schema', String(NORMALIZED_SCHEMA_VERSION));
    return registry;
  }

  function writeSpace(storageKey, ledgerRaw) {
    const key = String(storageKey || '').trim();
    if (!key) throw new Error('Chave do Espaço Financeiro em falta.');
    const ledger = ledgerRaw && typeof ledgerRaw === 'object' && !Array.isArray(ledgerRaw)
      ? JSON.parse(JSON.stringify(ledgerRaw))
      : null;
    if (!ledger) throw new Error('Dados do Espaço Financeiro inválidos.');
    require('../casa-model.js').validate(ledger);

    db.exec('BEGIN IMMEDIATE');
    try {
    let space = db.prepare('SELECT id,name FROM spaces WHERE storage_key = ?').get(key);
    if (!space?.id) {
      const derivedId = key === 'equilibrioData'
        ? 'main'
        : (key.startsWith('equilibrioData:') ? key.slice('equilibrioData:'.length) : '');
      if (!derivedId || !/^[A-Za-z0-9-]+$/.test(derivedId))
        throw new Error('Não foi possível identificar o Espaço Financeiro desta cópia.');
      const displayName = String(ledger.spaceName || (derivedId === 'main' ? 'Pessoal' : 'Espaço recuperado')).trim() || 'Pessoal';
      const maxOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM spaces').get()?.value ?? -1);
      const now = new Date().toISOString();
      const remainder = { ...ledger };
      for (const domain of CRITICAL_ARRAYS) delete remainder[domain];
      db.prepare(`
        INSERT INTO spaces (id, name, storage_key, sort_order, remainder_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          storage_key = excluded.storage_key,
          remainder_json = excluded.remainder_json,
          updated_at = excluded.updated_at
      `).run(derivedId, displayName, key, maxOrder + 1, JSON.stringify(remainder), now);
      space = { id: derivedId, name: displayName };
    }
    const remainder = { ...ledger };
    for (const domain of CRITICAL_ARRAYS) delete remainder[domain];
    const now = new Date().toISOString();
    const displayName = String(ledger.spaceName || space.name || 'Pessoal').trim() || 'Pessoal';

      db.prepare('UPDATE spaces SET name = ?, remainder_json = ?, updated_at = ? WHERE id = ?')
        .run(displayName, JSON.stringify(remainder), now, space.id);

      db.prepare('DELETE FROM accounts WHERE space_id = ?').run(space.id);
      db.prepare('DELETE FROM transactions WHERE space_id = ?').run(space.id);
      db.prepare('DELETE FROM debts WHERE space_id = ?').run(space.id);
      db.prepare('DELETE FROM recurring WHERE space_id = ?').run(space.id);
      db.prepare('DELETE FROM categories WHERE space_id = ?').run(space.id);

      insertEntityRows(space.id, 'accounts', ledger.accounts, insertAccountStmt);
      insertEntityRows(space.id, 'transactions', ledger.transactions, insertTransactionStmt);
      insertEntityRows(space.id, 'debts', ledger.debts, insertDebtStmt);
      insertEntityRows(space.id, 'recurring', ledger.recurring, insertRecurringStmt);
      insertEntityRows(space.id, 'categories', ledger.categoryCatalog, {
        run: (sid, id, order, payload) => insertCategoryStmt.run(sid, 'catalog', id, order, payload),
      });
      insertEntityRows(space.id, 'categories', ledger.categoryArchive, {
        run: (sid, id, order, payload) => insertCategoryStmt.run(sid, 'archive', id, order, payload),
      });

      insertStateStmt.run(key, JSON.stringify(ledger), now);
      refreshRegistryMirror(now);
      setMetaStmt.run('last_space_write_at', now);
      setMetaStmt.run('last_entity_write_at', now);
      setMetaStmt.run('last_write_at', now);
      db.exec('COMMIT');
      return {
        ok: true,
        spaceId: space.id,
        storageKey: key,
        counts: {
          accounts: Array.isArray(ledger.accounts) ? ledger.accounts.length : 0,
          transactions: Array.isArray(ledger.transactions) ? ledger.transactions.length : 0,
          categories: (Array.isArray(ledger.categoryCatalog) ? ledger.categoryCatalog.length : 0) + (Array.isArray(ledger.categoryArchive) ? ledger.categoryArchive.length : 0),
          debts: Array.isArray(ledger.debts) ? ledger.debts.length : 0,
          recurring: Array.isArray(ledger.recurring) ? ledger.recurring.length : 0,
        },
      };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  function readDomain(spaceId, domain) {
    const id = String(spaceId || '').trim();
    if (!id) return [];
    if (domain === 'categoryCatalog') return categoryRows(id, 'catalog');
    if (domain === 'categoryArchive') return categoryRows(id, 'archive');
    const table = ({ accounts: 'accounts', transactions: 'transactions', debts: 'debts', recurring: 'recurring' })[domain];
    if (!table) return [];
    return tableRows(table, id);
  }

  function migrateLegacyBrowserState() {
    const existingCount = Number(countStateStmt.get()?.count || 0);
    if (existingCount > 0 || !fs.existsSync(legacyPath)) {
      return { migrated: false, reason: existingCount > 0 ? 'sqlite-not-empty' : 'no-legacy-state' };
    }

    let legacy;
    try {
      legacy = sanitizeState(JSON.parse(fs.readFileSync(legacyPath, 'utf8')));
    } catch (error) {
      return { migrated: false, reason: 'legacy-invalid', error: error?.message || String(error) };
    }
    if (!Object.keys(legacy).length) return { migrated: false, reason: 'legacy-empty' };

    const safetyDir = path.join(userDataDir, 'safety-backups', 'pre-sqlite');
    fs.mkdirSync(safetyDir, { recursive: true });
    const safetyPath = path.join(safetyDir, `browser-state-${timestampPart()}.json`);
    fs.copyFileSync(legacyPath, safetyPath);

    writeState(legacy);
    const at = new Date().toISOString();
    setMeta('migrated_from', 'browser-state.json');
    setMeta('migrated_at', at);
    migrationStmt.run('browser-state-json-to-sqlite-v1', at, JSON.stringify({ safetyPath, keys: Object.keys(legacy).length }));
    return { migrated: true, safetyPath, keys: Object.keys(legacy).length };
  }

  function ensureNormalizedMigration() {
    const current = Number(getMeta('normalized_schema', '0')) || 0;
    if (current >= NORMALIZED_SCHEMA_VERSION) return { migrated: false, reason: 'already-current' };
    const state = rawStateMirror();
    if (!Object.keys(state).length) return { migrated: false, reason: 'no-state' };

    const safetyDir = path.join(userDataDir, 'safety-backups', 'pre-normalized-sqlite');
    fs.mkdirSync(safetyDir, { recursive: true });
    const safetyPath = path.join(safetyDir, `app-state-${timestampPart()}.json`);
    fs.writeFileSync(safetyPath, JSON.stringify(state, null, 2), 'utf8');
    writeState(state);
    const at = new Date().toISOString();
    setMeta('normalized_migrated_at', at);
    migrationStmt.run('sqlite-critical-entities-v2', at, JSON.stringify({ safetyPath, spaces: countSpacesFromState(state) }));
    return { migrated: true, safetyPath, spaces: countSpacesFromState(state) };
  }

  const legacyMigration = migrateLegacyBrowserState();
  const normalizedMigration = ensureNormalizedMigration();
  const legacySpaces = listSpaces().map(s => readSpace(s.id)).filter(s => s.data.version === 2 && (s.data.ledgerCoreVersion !== 1 || !s.data.coreMigration?.savingsCredit051));
  if (legacySpaces.length) {
    try {
      const safetyPath = path.join(userDataDir, 'safety-backups', legacySpaces.some(s=>s.data.ledgerCoreVersion===1)?'pre-core-03951':'pre-core-03950', 'ledger-' + timestampPart() + '.db');
      createConsistentBackup(safetyPath);
      const state = readState();
      const finance = require('../finance.js');
      for (const space of legacySpaces) state[space.key] = JSON.stringify(finance.normalize(finance.migrateLedgerCore(space.data)));
      writeState(state);
    } catch (error) { db.close(); throw error; }
  }

  const DOMAIN_CONFIG = {
    accounts: { table: 'accounts' },
    transactions: { table: 'transactions' },
    debts: { table: 'debts' },
    recurring: { table: 'recurring' },
    categoryCatalog: { table: 'categories', source: 'catalog' },
    categoryArchive: { table: 'categories', source: 'archive' },
  };

  function entityRowId(domain, item, index) {
    const direct = item && typeof item === 'object' ? item.id : null;
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct);
    if ((domain === 'categoryCatalog' || domain === 'categoryArchive') && item && typeof item === 'object') {
      const name = String(item.name || '').trim();
      if (name) return `name:${name}`;
    }
    return `row-${index}`;
  }

  function rowsByIdentity(domain, rows) {
    const out = new Map();
    if (rows !== undefined && !Array.isArray(rows)) throw new Error('Lista inválida: ' + domain);
    (Array.isArray(rows) ? rows : []).forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registo inválido: ' + domain);
      const id = entityRowId(domain, item, index);
      if (out.has(id)) throw new Error('Identificador repetido em ' + domain + ': ' + id);
      out.set(id, { id, item, order: index, payload: JSON.stringify(item) });
    });
    return out;
  }

  function applyDomainDeltaOpen(spaceId, beforeLedger, afterLedger) {
    const before = beforeLedger && typeof beforeLedger === 'object' ? beforeLedger : {};
    const after = afterLedger && typeof afterLedger === 'object' ? afterLedger : {};
    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
      const previous = rowsByIdentity(domain, before[domain]);
      const next = rowsByIdentity(domain, after[domain]);
      const isCategory = config.table === 'categories';

      for (const [id] of previous) {
        if (next.has(id)) continue;
        if (isCategory) {
          db.prepare('DELETE FROM categories WHERE space_id = ? AND source = ? AND id = ?')
            .run(spaceId, config.source, id);
        } else {
          db.prepare(`DELETE FROM ${config.table} WHERE space_id = ? AND id = ?`).run(spaceId, id);
        }
        deleted += 1;
      }

      for (const [id, row] of next) {
        const old = previous.get(id);
        if (old && old.payload === row.payload && old.order === row.order) continue;
        if (isCategory) {
          db.prepare(`
            INSERT INTO categories (space_id, source, id, sort_order, payload_json)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(space_id, source, id) DO UPDATE SET
              sort_order = excluded.sort_order,
              payload_json = excluded.payload_json
          `).run(spaceId, config.source, id, row.order, row.payload);
        } else {
          db.prepare(`
            INSERT INTO ${config.table} (space_id, id, sort_order, payload_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(space_id, id) DO UPDATE SET
              sort_order = excluded.sort_order,
              payload_json = excluded.payload_json
          `).run(spaceId, id, row.order, row.payload);
        }
        if (old) updated += 1;
        else inserted += 1;
      }
    }
    return { inserted, updated, deleted, changes: inserted + updated + deleted };
  }

  function applyCriticalChanges(storageKey, beforeLedger, afterLedger) {
    const key = String(storageKey || '').trim();
    const space = db.prepare('SELECT id FROM spaces WHERE storage_key = ?').get(key);
    if (!space?.id) return {ok:true,skipped:true,reason:'space-not-found',changes:0};
    const current = readSpace(space.id).data;
    const after = JSON.parse(JSON.stringify(current));
    for (const domain of CRITICAL_ARRAYS) {
      if (!require('node:util').isDeepStrictEqual(current[domain] || [], JSON.parse(JSON.stringify(beforeLedger?.[domain] || []))))
        throw writeConflict(domain);
      after[domain] = afterLedger?.[domain] || [];
    }
    return applyLedgerDelta(key, current, after);
  }

  function applyLedgerDelta(storageKey, beforeLedger, afterLedger) {
    const key = String(storageKey || '').trim();
    if (!key) throw new Error('Chave do Espaço Financeiro em falta.');
    const after = afterLedger && typeof afterLedger === 'object' && !Array.isArray(afterLedger)
      ? JSON.parse(JSON.stringify(afterLedger))
      : null;
    if (!after) throw new Error('Dados do Espaço Financeiro inválidos.');
    if (after.ledgerCoreVersion === 1) require('../finance.js').refreshBalances(after);
    require('../casa-model.js').validate(after);

    const space = db.prepare('SELECT id,name FROM spaces WHERE storage_key = ?').get(key);
    if (!space?.id) {
      const created = writeSpace(key, after);
      return { ...created, mode: 'full-create', changes: null };
    }

    const remainder = { ...after };
    for (const domain of CRITICAL_ARRAYS) delete remainder[domain];
    const displayName = String(after.spaceName || space.name || 'Pessoal').trim() || 'Pessoal';
    const now = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const current = readSpace(space.id).data;
      for (const domain of CRITICAL_ARRAYS) {
        if (!require('node:util').isDeepStrictEqual(current[domain] || [], JSON.parse(JSON.stringify(beforeLedger?.[domain] || []))))
          throw writeConflict(domain);
      }
      // Every financial domain participates in conflict detection, including
      // Casa, reconciliation, planning and attachments held in remainder_json.
      // Older ledgers omit newly introduced empty/default fields. The UI
      // materialises them on read. Compare that projection, without normalising
      // balances, repairing records or ignoring any nonempty/unknown domain.
      const defaults = require('../finance.js').empty();
      const currentRemainder = { ...defaults, ...current }, previousRemainder = { ...defaults, ...JSON.parse(JSON.stringify(beforeLedger || {})) };
      for (const domain of CRITICAL_ARRAYS) { delete currentRemainder[domain]; delete previousRemainder[domain]; }
      // The renderer can materialize the catalog name as a projection after read.
      if (currentRemainder.spaceName === undefined && previousRemainder.spaceName === space.name)
        currentRemainder.spaceName = space.name;
      const { isDeepStrictEqual } = require('node:util');
      if (!isDeepStrictEqual(currentRemainder, previousRemainder)) {
        const domain = [...new Set([...Object.keys(currentRemainder), ...Object.keys(previousRemainder)])].find(name => !isDeepStrictEqual(currentRemainder[name], previousRemainder[name]));
          throw writeConflict(domain);
      }
      db.prepare('UPDATE spaces SET name = ?, remainder_json = ?, updated_at = ? WHERE id = ?')
        .run(displayName, JSON.stringify(remainder), now, space.id);
      const result = applyDomainDeltaOpen(space.id, beforeLedger || {}, after);
      insertStateStmt.run(key, JSON.stringify(after), now);
      refreshRegistryMirror(now);
      setMetaStmt.run('last_entity_write_at', now);
      setMetaStmt.run('last_space_write_at', now);
      setMetaStmt.run('last_write_at', now);
      db.exec('COMMIT');
      return { ok: true, skipped: false, mode: 'delta', spaceId: space.id, storageKey: key, ...result };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  function domainCounts() {
    const counts = {};
    for (const table of ['spaces', 'accounts', 'transactions', 'categories', 'debts', 'recurring']) {
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count || 0);
    }
    return counts;
  }

  function listSpaces() {
    return db.prepare('SELECT id,name,storage_key,sort_order,updated_at FROM spaces ORDER BY sort_order,id').all().map((row) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
      key: String(row.storage_key || ''),
      sortOrder: Number(row.sort_order || 0),
      updatedAt: String(row.updated_at || ''),
    }));
  }

  function readSpace(spaceId) {
    // Keep the remainder and normalized tables in the same WAL snapshot.
    // Writes and multi-space snapshots already own a transaction.
    if (db.isTransaction) return readSpaceOpen(spaceId);
    db.exec('BEGIN');
    try {
      const result = readSpaceOpen(spaceId);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  function readSpaceOpen(spaceId) {
    const row = db.prepare('SELECT id,name,storage_key,remainder_json FROM spaces WHERE id = ?').get(String(spaceId));
    if (!row) return null;
    const ledger = parseStoredObject(row.remainder_json, 'spaces/' + row.id);
    ledger.accounts = tableRows('accounts', row.id);
    ledger.transactions = tableRows('transactions', row.id);
    ledger.debts = tableRows('debts', row.id);
    ledger.recurring = tableRows('recurring', row.id);
    ledger.categoryCatalog = categoryRows(row.id, 'catalog');
    ledger.categoryArchive = categoryRows(row.id, 'archive');
    return { id: row.id, name: row.name, key: row.storage_key, data: ledger };
  }

  function snapshotSpaces() {
    // One SQLite read transaction fixes the WAL snapshot for every space.
    db.exec('BEGIN');
    try {
      const spaces = listSpaces().map(space => readSpace(space.id));
      db.exec('COMMIT');
      return spaces;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  function info() {
    const state = readState();
    return {
      mode: 'SQLite normalizado',
      dbPath,
      legacyPath,
      keys: Object.keys(state).length,
      spaces: countSpacesFromState(state),
      storageSchema: Number(getMeta('storage_schema', String(NORMALIZED_SCHEMA_VERSION))) || NORMALIZED_SCHEMA_VERSION,
      normalizedSchema: Number(getMeta('normalized_schema', '0')) || 0,
      dbSchemaVersion: Number(getMeta('db_schema_version', String(CURRENT_DB_SCHEMA_VERSION))) || CURRENT_DB_SCHEMA_VERSION,
      currentDbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
      lastIntegrityCheckAt: getMeta('last_integrity_check_at', ''),
      lastIntegrityResult: getMeta('last_integrity_result', ''),
      lastSchemaMigrationAt: getMeta('last_schema_migration_at', ''),
      lastSchemaMigrationName: getMeta('last_schema_migration_name', ''),
      schemaPreparation,
      migrationHistory: migrationHistory(db, 20),
      lastWriteAt: getMeta('last_write_at', ''),
      migratedAt: getMeta('migrated_at', ''),
      normalizedMigratedAt: getMeta('normalized_migrated_at', ''),
      lastEntityWriteAt: getMeta('last_entity_write_at', ''),
      lastSpaceWriteAt: getMeta('last_space_write_at', ''),
      lastCacheWriteAt: getMeta('last_cache_write_at', ''),
      legacyMigration,
      normalizedMigration,
      domains: domainCounts(),
    };
  }

  function createConsistentBackup(targetPath) {
    if (!String(targetPath || '').trim()) throw new Error('Destino de cópia SQLite inválido.');
    const target = path.resolve(String(targetPath || ''));
    if (target.toLowerCase() === path.resolve(dbPath).toLowerCase()) throw new Error('A cópia não pode substituir a base de dados aberta.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = target + '.' + require('node:crypto').randomUUID() + '.tmp';
    try {
      db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`);
      const stat = fs.statSync(temp);
      if (!stat.size) throw new Error('A cópia SQLite ficou vazia.');
      const verify = new DatabaseSync(temp, { readOnly: true });
      try {
        const result = String(verify.prepare('PRAGMA integrity_check').get()?.integrity_check || '').toLowerCase();
        if (result !== 'ok') throw new Error('A cópia SQLite não passou a verificação de integridade.');
      } finally { verify.close(); }
      const fd = fs.openSync(temp, 'r+');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temp, target);
      return { ok: true, filePath: target, size: stat.size };
    } finally { if (fs.existsSync(temp)) fs.rmSync(temp, { force: true }); }
  }

  function close() {
    try { db.close(); } catch {}
  }

  return {
    dbPath,
    legacyPath,
    readState,
    writeState,
    writeCacheState,
    writeSpace,
    listSpaces,
    readSpace,
    snapshotSpaces,
    readDomain,
    applyCriticalChanges,
    applyLedgerDelta,
    getMeta,
    setMeta,
    info,
    createConsistentBackup,
    close,
    legacyMigration,
    normalizedMigration,
  };
}

module.exports = {
  createSqliteStorage,
  sanitizeState,
  countSpacesFromState,
  NORMALIZED_SCHEMA_VERSION,
};
