'use strict';

const MAX_TITLES = 3;

function dayNumber(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
}

// Estado de um aviso face ao dia em que o resumo é lido.
function status(item, today) {
  const a = dayNumber(today), b = dayNumber(item.date);
  if (a === null || b === null) return item.naturalState === 'overdue' ? 'atrasado' : 'vence hoje';
  const n = b - a;
  if (n < 0) return 'atrasado';
  if (n === 0) return 'vence hoje';
  return 'em ' + n + (n === 1 ? ' dia' : ' dias');
}

// Resumo diário dos avisos high/medium; com valores ocultos não leva títulos nem montantes.
function dailyDigest(result, { hidden = false, today } = {}) {
  const rows = ((result && result.rows) || []).filter(r => r && (r.priority === 'high' || r.priority === 'medium'));
  if (!rows.length) return null;
  const title = rows.length === 1 ? '1 aviso hoje' : rows.length + ' avisos hoje';
  if (hidden) return { title, body: 'Abre a app para ver.' };
  const body = rows.slice(0, MAX_TITLES).map(r => r.title + ' (' + status(r, today) + ')').join(', ') + (rows.length > MAX_TITLES ? '…' : '');
  return { title, body };
}

module.exports = { dailyDigest };
