'use strict';
// Definições locais da app (notificações, hora, tema, ocultar ao abrir). Tudo em localStorage, sempre com try/catch.
const KEY = 'equilibrio.mobile.settings';
const THEMES = ['auto', 'light', 'dark'];
const DEFAULTS = Object.freeze({ notifications: false, hour: 9, theme: 'auto', hideOnOpen: false });

// Campo a campo: o que não for válido cai no valor por defeito.
function normalize(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    notifications: typeof r.notifications === 'boolean' ? r.notifications : DEFAULTS.notifications,
    hour: Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23 ? r.hour : DEFAULTS.hour,
    theme: THEMES.includes(r.theme) ? r.theme : DEFAULTS.theme,
    hideOnOpen: typeof r.hideOnOpen === 'boolean' ? r.hideOnOpen : DEFAULTS.hideOnOpen,
  };
}

function read(storage) {
  try {
    const text = storage && storage.getItem(KEY);
    return normalize(text ? JSON.parse(text) : null);
  } catch { return normalize(null); }
}

function write(storage, next) {
  try { storage.setItem(KEY, JSON.stringify(normalize(next))); } catch { /* sem armazenamento: a app continua */ }
}

module.exports = { KEY, THEMES, DEFAULTS, normalize, read, write };
