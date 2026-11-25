'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const out = path.resolve(process.argv[2]);
const read = (file) => JSON.parse(fs.readFileSync(path.join(out, file), 'utf8'));
const { previous, version } = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const navigation = read('navegacao-repetida/auditoria-navegacao.json');
const baseline = read('sessao-final/windows-' + previous + '.json');
const current = read('sessao-final/windows-' + version + '.json');
assert.ok(baseline.completed && current.completed, 'As duas sessões Windows ainda não terminaram.');

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
}

const ms = (value) => value === null ? '—' : value.toLocaleString('pt-PT', { maximumFractionDigits: 1 });
const mb = (bytes) => ms(bytes / 1048576);
const widthSummary = Object.keys(navigation.original.routes).sort((a, b) => b - a).map((width) => {
  const original = Object.values(navigation.original.routes[width]);
  const updated = Object.values(navigation.updated.routes[width]);
  return '| ' + width + ' px | ' + ms(percentile(original, 0.5)) + ' | ' + ms(percentile(updated, 0.5)) + ' |';
});
const routeNames = Object.keys(navigation.original.routes[1440]);
const routeRows = routeNames.map((name) => {
  const row = [1440, 768, 390].map((width) => {
    const a = navigation.original.routes[width][name];
    const b = navigation.updated.routes[width][name];
    const aTail = percentile(navigation.original.routeSamples[width][name], 0.9);
    const bTail = percentile(navigation.updated.routeSamples[width][name], 0.9);
    return ms(a) + ' / ' + ms(aTail) + ' → ' + ms(b) + ' / ' + ms(bTail);
  });
  return '| ' + name + ' | ' + row.join(' | ') + ' |';
});

function groups(samples, attr) {
  const map = new Map();
  for (const sample of samples) {
    const key = sample[attr];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(sample.ms);
  }
  return map;
}

function compare(before, after, attr) {
  const a = groups(before, attr);
  const b = groups(after, attr);
  return [...new Set([...a.keys(), ...b.keys()])].map((name) => {
    const stats = [a.get(name) || [], b.get(name) || []].flatMap((times) => [
      times.length, ms(percentile(times, 0.5)), times.length >= 10 ? ms(percentile(times, 0.9)) : '—',
    ]);
    return '| ' + name + ' | ' + stats.join(' | ') + ' |';
  });
}

const checks = [baseline, current].flatMap((r) => r.checkpoints.map((p) =>
  '| ' + r.version + ' | ' + p.cycle + ' | ' + ms(p.elapsedMs / 60000) + ' | ' + mb(p.heapBytes) + ' | ' + p.domNodes + ' | ' + p.listeners + ' |'
));
const exceptions = [baseline, current].flatMap((r) => [
  ...r.failures.map((f) => '- v' + r.version + ', ciclo ' + f.cycle + ', ' + f.workflow + ' — ' + f.issue),
  ...r.errors.map((e) => '- v' + r.version + ' — ' + e),
]);

const report = [
  '# Auditoria de fluidez do Equilíbrio',
  '',
  'Comparação entre a v' + previous + ' e a v' + version + ' no mesmo PC. A passagem pelo navegador usou dados sintéticos, três larguras, um ciclo de aquecimento e 12 amostras por página e largura. As sessões da aplicação Windows usaram perfis isolados a partir da mesma cópia SQLite, com ' + current.originalMovements + ' movimentos no espaço selecionado, mais registos de teste. A base original foi aberta em modo de leitura.',
  '',
  '## Navegação nas 36 páginas',
  '',
  'Mediana dos tempos de navegação nas páginas, em milissegundos.',
  '',
  '| Largura | v' + previous + ' | v' + version + ' |',
  '| --- | ---: | ---: |',
  ...widthSummary,
  '',
  'Mediana / P90 por página, em milissegundos, da v' + previous + ' para a v' + version + '.',
  '',
  '| Página | 1440 px | 768 px | 390 px |',
  '| --- | ---: | ---: | ---: |',
  ...routeRows,
  '',
  'Ocorrências verificadas no navegador em cada versão: ' + navigation.original.issues.length + ' → ' + navigation.updated.issues.length + ' de navegação, visibilidade ou largura, ' + navigation.original.errors.length + ' → ' + navigation.updated.errors.length + ' erros JavaScript e ' + navigation.original.resources.length + ' → ' + navigation.updated.resources.length + ' recursos em falta.',
  '',
  '## Tarefas na aplicação Windows',
  '',
  'Medição entre o início da ação e a atualização da interface, com espera por dois fotogramas ou um limite de 250 ms. As gravações incluem a espera pelo fecho do formulário. Foram feitas ' + baseline.cycles + ' e ' + current.cycles + ' rondas, durante ' + ms(baseline.elapsedMs / 60000) + ' e ' + ms(current.elapsedMs / 60000) + ' minutos, respetivamente. Os valores estão em milissegundos.',
  '',
  '| Ação | Amostras v' + previous + ' | Mediana | P90 | Amostras v' + version + ' | Mediana | P90 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...compare(baseline.samples, current.samples, 'action'),
  '',
  '### Etapas de gravação',
  '',
  'Tempos medidos dentro da aplicação, agregados sobre todas as gravações. Podem estar incluídos no tempo de outra etapa.',
  '',
  '| Etapa | Amostras v' + previous + ' | Mediana | P90 | Amostras v' + version + ' | Mediana | P90 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...compare(baseline.phases, current.phases, 'phase'),
  '',
  '### Memória da sessão',
  '',
  'Medições após recolha de memória. Durante a sessão foram acrescentados compras e consumos e foi mantido o estado de desfazer. Estes valores descrevem o percurso e servem para identificar tendências a confirmar.',
  '',
  '| Versão | Ronda | Minutos | Memória JavaScript (MiB) | Elementos do documento | Eventos registados |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...checks,
  '',
  '### Verificações e ocorrências',
  '',
  ...[baseline, current].map((r) => '- v' + r.version + ' — gravação confirmada no SQLite do movimento (' + (r.persisted.editedMovement ? 'sim' : 'não') + '), compromisso (' + (r.persisted.rescheduled ? 'sim' : 'não') + '), objetivo (' + (r.persisted.editedGoal ? 'sim' : 'não') + '), ' + r.persisted.purchases + ' compras e ' + r.persisted.electricity + ' consumos de eletricidade editados.'),
  ...exceptions,
  '',
  'Dados das medições em `navegacao-repetida/auditoria-navegacao.json` e `sessao-final/windows-*.json`.',
  '',
];
fs.writeFileSync(path.join(out, 'AUDITORIA-FLUIDEZ-v' + version + '.md'), report.join('\n'));
