'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const CURRENT_DB_SCHEMA_VERSION = 2;

function timestampPart() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sqlQuote(value) {
  return String(value).replace(/'/g, "''");
}

function tableExists(db, tableName) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1").get(String(tableName)));
  } catch {
    return false;
  }
}

function getMeta(db, key, fallback = '') {
  if (!tableExists(db, 'meta')) return fallback;
  try { return db.prepare('SELECT value FROM meta WHERE key = ?').get(String(key))?.value ?? fallback; }
  catch { return fallback; }
}

function setMeta(db, key, value) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(key), String(value));
}

function integrityCheck(db) {
  let rows;
  try { rows = db.prepare('PRAGMA integrity_check').all(); }
  catch (error) {
    return { ok: false, details: [`integrity-check-error: ${error?.message || String(error)}`] };
  }
  const details = rows.map((row) => String(Object.values(row)[0] ?? '')).filter(Boolean);
  return { ok: details.length === 1 && details[0].toLowerCase() === 'ok', details };
}

function recordIntegrityHealth(db, result, source = 'startup') {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_health (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      last_check_at TEXT NOT NULL,
      last_result TEXT NOT NULL,
      details TEXT NOT NULL,
      source TEXT NOT NULL
    )
  `);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO schema_health (id, last_check_at, last_result, details, source)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_check_at = excluded.last_check_at,
      last_result = excluded.last_result,
      details = excluded.details,
      source = excluded.source
  `).run(now, result.ok ? 'ok' : 'error', JSON.stringify(result.details || []), String(source));
  setMeta(db, 'last_integrity_check_at', now);
  setMeta(db, 'last_integrity_result', result.ok ? 'ok' : 'error');
  return now;
}

function inferSchemaVersion(db) {
  const explicit = Number(getMeta(db, 'db_schema_version', '0')) || 0;
  if (explicit > 0) return explicit;
  const baselineTables = ['spaces', 'accounts', 'transactions', 'categories', 'debts', 'recurring'];
  if (baselineTables.some((name) => tableExists(db, name))) return 1;
  return 0;
}

const DB_MIGRATIONS = [
  {
    from: 0,
    to: 1,
    name: 'baseline-sqlite-normalizado',
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS storage_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '{}'
        );
      `);
    },
  },
  {
    from: 1,
    to: 2,
    name: 'integridade-e-historico-schema-v2',
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_health (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          last_check_at TEXT NOT NULL,
          last_result TEXT NOT NULL,
          details TEXT NOT NULL,
          source TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_storage_migrations_applied_at
          ON storage_migrations(applied_at);
      `);
    },
  },
];

function migrationPlan(fromVersion, targetVersion = CURRENT_DB_SCHEMA_VERSION, registry = DB_MIGRATIONS) {
  const plan = [];
  let current = Number(fromVersion) || 0;
  while (current < targetVersion) {
    const step = registry.find((item) => Number(item.from) === current);
    if (!step) throw new Error(`Não existe migração SQLite registada para o schema ${current}.`);
    if (Number(step.to) <= current) throw new Error(`Migração SQLite inválida: ${step.name || `${step.from}->${step.to}`}.`);
    plan.push(step);
    current = Number(step.to);
  }
  return plan;
}

function ensureMigrationLogTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS storage_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}'
    )
  `);
}

function createConsistentBackup(db, userDataDir, fromVersion, toVersion) {
  const directory = path.join(userDataDir, 'safety-backups', 'pre-schema-migration');
  fs.mkdirSync(directory, { recursive: true });
  const backupPath = path.join(directory, `financas-schema-${fromVersion}-para-${toVersion}-${timestampPart()}.db`);
  try { db.exec('PRAGMA wal_checkpoint(FULL)'); } catch {}
  db.exec(`VACUUM INTO '${sqlQuote(backupPath)}'`);
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size <= 0) {
    throw new Error('Não foi possível criar a cópia de segurança SQLite antes da migração.');
  }
  return backupPath;
}

function writeFailureLog(userDataDir, payload) {
  try {
    const directory = path.join(userDataDir, 'safety-backups', 'migration-failures');
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, `migration-failure-${timestampPart()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
  } catch {
    return '';
  }
}

function restoreInterruptedSwap(dbPath, oldPath) {
  if (!fs.existsSync(oldPath)) return;
  if (fs.statSync(oldPath).size === 0) {
    throw new Error('A cópia anterior à migração está vazia. Verifica as cópias de segurança.');
  }
  if (fs.existsSync(dbPath)) {
    if (fs.statSync(dbPath).size > 0) return;
    fs.unlinkSync(dbPath);
  }
  fs.renameSync(oldPath, dbPath);
}

function safelyReplaceDatabase(dbPath, stagedPath, oldPath) {
  // The previous connection has closed. Never attach an old journal to the staged database.
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (fs.existsSync(dbPath + suffix) || fs.existsSync(stagedPath + suffix)) {
      throw new Error('A migração requer que todas as ligações SQLite estejam fechadas.');
    }
  }
  fs.renameSync(dbPath, oldPath);
  try {
    fs.renameSync(stagedPath, dbPath);
  } catch (error) {
    try {
      fs.renameSync(oldPath, dbPath);
    } catch (rollbackError) {
      throw new Error('A reposição da base ficou pendente. A base original foi conservada.', {
        cause: new AggregateError([error, rollbackError]),
      });
    }
    throw error;
  }
  // The staged database has already passed integrity checks and committed.
  // If cleanup fails, startup verifies the active database before retrying it.
  try { fs.unlinkSync(oldPath); } catch {}
}

function prepareDatabase(dbPath, userDataDir, options = {}) {
  const oldPath = dbPath + '.pre-migration-swap';
  restoreInterruptedSwap(dbPath, oldPath);
  const exists = fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;
  if (!exists) {
    return {
      fresh: true,
      migrated: false,
      fromVersion: 0,
      toVersion: CURRENT_DB_SCHEMA_VERSION,
      plan: [],
      backupPath: '',
      integrity: { ok: true, details: ['new-database'] },
    };
  }

  const source = new DatabaseSync(dbPath);
  let initialIntegrity;
  let fromVersion;
  try {
    try { source.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;'); } catch {}
    initialIntegrity = integrityCheck(source);
    if (!initialIntegrity.ok) {
      throw new Error(`A base SQLite falhou a verificação de integridade: ${(initialIntegrity.details || []).join(' | ')}`);
    }
    fromVersion = inferSchemaVersion(source);
    if (fromVersion > CURRENT_DB_SCHEMA_VERSION) {
      throw new Error(`A base usa schema ${fromVersion}, superior ao suportado (${CURRENT_DB_SCHEMA_VERSION}).`);
    }
    if (fs.existsSync(oldPath)) {
      const directory = path.join(userDataDir, 'safety-backups', 'pre-schema-migration');
      fs.mkdirSync(directory, { recursive: true });
      fs.renameSync(oldPath, path.join(directory, 'interrupted-swap-' + randomUUID() + '.db'));
    }
    const plan = migrationPlan(fromVersion, CURRENT_DB_SCHEMA_VERSION, options.registry || DB_MIGRATIONS);
    if (!plan.length) {
      try { recordIntegrityHealth(source, initialIntegrity, 'startup'); } catch {}
      return {
        fresh: false,
        migrated: false,
        fromVersion,
        toVersion: fromVersion,
        plan: [],
        backupPath: '',
        integrity: initialIntegrity,
      };
    }

    const backupPath = createConsistentBackup(source, userDataDir, fromVersion, CURRENT_DB_SCHEMA_VERSION);
    source.close();

    const stagedPath = path.join(userDataDir, `financas-migration-stage-${process.pid}-${Date.now()}.db`);
    fs.copyFileSync(backupPath, stagedPath);
    const staged = new DatabaseSync(stagedPath);
    let applied = [];
    try {
      staged.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
      ensureMigrationLogTable(staged);
      let current = fromVersion;
      for (const step of plan) {
        if (Number(step.from) !== current) throw new Error(`Sequência de migração inválida em ${step.name}.`);
        if (options.simulateFailureAt && String(options.simulateFailureAt) === String(step.name)) {
          throw new Error(`Falha simulada na migração ${step.name}.`);
        }
        step.apply(staged);
        current = Number(step.to);
        setMeta(staged, 'db_schema_version', String(current));
        const at = new Date().toISOString();
        staged.prepare(`
          INSERT OR IGNORE INTO storage_migrations (name, applied_at, details)
          VALUES (?, ?, ?)
        `).run(`db-schema-${step.from}-to-${step.to}:${step.name}`, at, JSON.stringify({
          from: step.from,
          to: step.to,
          name: step.name,
          backupPath,
        }));
        setMeta(staged, 'last_schema_migration_at', at);
        setMeta(staged, 'last_schema_migration_name', step.name);
        applied.push({ from: step.from, to: step.to, name: step.name, at });
      }
      const post = integrityCheck(staged);
      if (!post.ok) throw new Error(`A verificação de integridade após migração falhou: ${(post.details || []).join(' | ')}`);
      recordIntegrityHealth(staged, post, 'post-migration');
      staged.exec('COMMIT');
      staged.close();
      safelyReplaceDatabase(dbPath, stagedPath, oldPath);
      return {
        fresh: false,
        migrated: true,
        fromVersion,
        toVersion: CURRENT_DB_SCHEMA_VERSION,
        plan: applied,
        backupPath,
        integrity: post,
      };
    } catch (error) {
      try { staged.exec('ROLLBACK'); } catch {}
      try { staged.close(); } catch {}
      try { if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath); } catch {}
      const failureLog = writeFailureLog(userDataDir, {
        at: new Date().toISOString(),
        dbPath,
        backupPath,
        fromVersion,
        targetVersion: CURRENT_DB_SCHEMA_VERSION,
        applied,
        error: error?.stack || error?.message || String(error),
      });
      const wrapped = new Error(`Migração SQLite cancelada sem alterar a base original: ${error?.message || String(error)}`);
      wrapped.cause = error;
      wrapped.backupPath = backupPath;
      wrapped.failureLog = failureLog;
      throw wrapped;
    }
  } finally {
    try { source.close(); } catch {}
  }
}

function initializeFreshSchema(db) {
  setMeta(db, 'db_schema_version', String(CURRENT_DB_SCHEMA_VERSION));
  ensureMigrationLogTable(db);
  const at = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO storage_migrations (name, applied_at, details)
    VALUES (?, ?, ?)
  `).run('db-schema-bootstrap-v2', at, JSON.stringify({ version: CURRENT_DB_SCHEMA_VERSION }));
  setMeta(db, 'last_schema_migration_at', at);
  setMeta(db, 'last_schema_migration_name', 'bootstrap-v2');
  const health = integrityCheck(db);
  if (!health.ok) throw new Error(`Nova base SQLite inválida: ${(health.details || []).join(' | ')}`);
  recordIntegrityHealth(db, health, 'fresh-bootstrap');
  return { version: CURRENT_DB_SCHEMA_VERSION, integrity: health, at };
}

function migrationHistory(db, limit = 20) {
  if (!tableExists(db, 'storage_migrations')) return [];
  return db.prepare(`
    SELECT name, applied_at, details
    FROM storage_migrations
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, Number(limit) || 20))).map((row) => ({
    name: String(row.name || ''),
    appliedAt: String(row.applied_at || ''),
    details: (() => { try { return JSON.parse(row.details || '{}'); } catch { return {}; } })(),
  }));
}

module.exports = {
  CURRENT_DB_SCHEMA_VERSION,
  DB_MIGRATIONS,
  integrityCheck,
  recordIntegrityHealth,
  inferSchemaVersion,
  migrationPlan,
  prepareDatabase,
  initializeFreshSchema,
  migrationHistory,
};
