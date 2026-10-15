const CURRENT_SCHEMA_VERSION = 1;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function schemaVersionOf(document) {
  const raw = Number(document?.schemaVersion ?? document?._desktopSchemaVersion ?? 0);
  return Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

const migrations = [
  {
    from: 0,
    to: 1,
    name: 'Marcar formato Desktop com schemaVersion',
    apply(document) {
      const next = clone(document) || {};
      next.schemaVersion = 1;
      if (next.format === 'equilibrio-spaces' && Array.isArray(next.spaces)) {
        next.spaces = next.spaces.map((space) => ({
          ...space,
          data: space?.data && typeof space.data === 'object'
            ? { ...space.data, _desktopSchemaVersion: 1 }
            : space?.data,
        }));
      } else if (typeof next === 'object') {
        next._desktopSchemaVersion = 1;
      }
      return next;
    },
  },
];

function migrationPlan(document) {
  const start = schemaVersionOf(document);
  const plan = [];
  let version = start;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === version);
    if (!step) throw new Error(`Não existe migração registada para o schema ${version}.`);
    plan.push({ from: step.from, to: step.to, name: step.name });
    version = step.to;
  }
  return { from: start, to: version, current: CURRENT_SCHEMA_VERSION, steps: plan };
}

function migrateDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('A cópia deve conter um objeto JSON.');
  if (schemaVersionOf(document) > CURRENT_SCHEMA_VERSION) throw new Error('Esta cópia foi criada por uma versão mais recente da aplicação.');
  let next = clone(document);
  const plan = migrationPlan(next);
  let version = plan.from;
  for (const stepInfo of plan.steps) {
    const step = migrations.find((m) => m.from === version && m.to === stepInfo.to);
    next = step.apply(next);
    version = step.to;
  }
  return { document: next, plan, changed: plan.steps.length > 0 };
}

function migrateJsonText(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Conteúdo JSON inválido.');
  const parsed = JSON.parse(content);
  const result = migrateDocument(parsed);
  return { ...result, content: JSON.stringify(result.document, null, 2) };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  schemaVersionOf,
  migrationPlan,
  migrateDocument,
  migrateJsonText,
};
