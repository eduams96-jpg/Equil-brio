'use strict';
const { dailyDigest } = require('./digest.cjs');

const BASE_ID = 9001;
const DAYS = 7;

const pad = n => String(n).padStart(2, '0');
const dayOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

// Substitui as notificações dos próximos 7 dias; ids fixos 9001-9007 para poder cancelar tudo.
async function schedule(ledger, settings, { hidden = false, now = new Date() } = {}, plugin, notices = require('../../../equilibrio/dossiers-model.js').notices) {
  const ids = Array.from({ length: DAYS }, (_, k) => ({ id: BASE_ID + k }));
  await plugin.cancel({ notifications: ids });
  const hour = Number.isInteger(settings && settings.hour) ? settings.hour : 9;
  const list = [];
  for (let k = 0; k < DAYS; k++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hour, 0, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    const day = dayOf(at);
    let result = null;
    try { result = notices(ledger, { today: day }); } catch { result = null; }
    const digest = dailyDigest(result, { hidden, today: day });
    if (!digest) continue;
    list.push({ id: BASE_ID + k, title: digest.title, body: digest.body, schedule: { at, allowWhileIdle: true }, extra: { page: 'avisos' } });
  }
  if (list.length) await plugin.schedule({ notifications: list });
}

async function enable(plugin) {
  const r = await plugin.requestPermissions();
  return !!r && r.display === 'granted';
}

module.exports = { schedule, enable };
