'use strict';
const kit = require('../ui/kit.cjs');
const D = require('../../../../equilibrio/dossiers-model.js');

const THEME_OPTIONS = [{ value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }];
const AREAS = [['payments', 'Pagamentos'], ['warranties', 'Garantias'], ['food', 'Alimentos'], ['routines', 'Rotinas'], ['dossiers', 'Dossiês']];
const days = n => n + (n === 1 ? ' dia' : ' dias');

function toggle(id, label, detail, on) {
  return '<div class="set-row"><div class="set-text"><strong>' + kit.escape(label) + '</strong>' + (detail ? '<small>' + kit.escape(detail) + '</small>' : '') + '</div>'
    + '<button type="button" role="switch" class="set-switch" id="' + id + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + kit.escape(label) + '">' + (on ? 'Ligado' : 'Desligado') + '</button></div>';
}

function hourSelect(hour) {
  const options = Array.from({ length: 24 }, (_, h) => '<option value="' + h + '"' + (h === hour ? ' selected' : '') + '>' + String(h).padStart(2, '0') + ':00</option>').join('');
  return '<div class="set-row"><div class="set-text"><strong><label for="set-hour">Hora do aviso diário</label></strong><small>Resumo dos avisos do dia</small></div>'
    + '<select id="set-hour" class="set-hour">' + options + '</select></div>';
}

function pcPreferences(ledger) {
  const p = D.noticePreferences(ledger || {});
  const rows = AREAS.map(([key, label]) => '<li><span>' + kit.escape(label) + '</span><span class="set-value">'
    + (p.enabled[key] ? 'Ligado · ' + days(p.days[key]) : 'Desligado') + '</span></li>').join('');
  return kit.card({
    title: 'Avisos do PC', subtitle: 'Definidos no programa do PC',
    body: '<ul class="set-prefs">' + rows + '<li><span>Urgente a partir de</span><span class="set-value">' + days(p.urgentDays) + '</span></li></ul>'
      + '<p class="sub">Alterar no PC. Aqui só podes consultar.</p>',
  });
}

// Ecrã «Definições». view: {permissionDenied, version:{app, core}}.
function render(ctx, view = {}) {
  const s = ctx.settings || {};
  const head = '<button type="button" class="back" data-page="mais">‹ Mais</button><h1>Definições</h1>';
  const denied = view.permissionDenied
    ? '<p class="set-alert" role="alert">Sem permissão para notificações. Ativa-a nas definições do Android.</p>' : '';
  const notifications = kit.card({
    title: 'Notificações', subtitle: 'Um resumo diário dos avisos',
    body: toggle('set-notifications', 'Avisos diários', 'Ligados, a app agenda os próximos 7 dias', !!s.notifications && !view.permissionDenied) + denied + hourSelect(Number.isInteger(s.hour) ? s.hour : 9),
  });
  const appearance = kit.card({ title: 'Aparência', subtitle: 'Tema da aplicação', body: kit.pills('theme', THEME_OPTIONS, s.theme || 'auto') });
  const privacy = kit.card({ title: 'Privacidade', body: toggle('set-hide-open', 'Ocultar valores ao abrir', 'Os valores ficam escondidos sempre que abres a app', !!s.hideOnOpen) });
  const v = view.version;
  const about = v ? '<p class="sub set-version">Versão ' + kit.escape(v.app) + ' · núcleo ' + kit.escape(v.core) + '</p>' : '';
  return head + notifications + appearance + privacy + pcPreferences(ctx.ledger) + about;
}

module.exports = { render };
