# Task 3 report: Router, navegação inferior e Mais

Status: DONE

## Implemented
- `src/nav.cjs`: `tabFor`, `isPlaceholder`, `placeholder` (single PLACEHOLDERS map: compras, patrimonio, relatorios, avisos, definicoes; later tasks remove their name there and register the module).
- `src/screens/mais.cjs`: 7 entries in the required order, icon + label + detail, with sync stamp.
- `src/shell.cjs`: shared nav (Resumo, Movimentos, Casa, Mais, with `.nav-full`/`.nav-short`) and FAB (`#quickAdd`, `data-page="novo"`). index.html embeds this exact markup (a test enforces equality); preview.cjs uses it too; `mais` is in preview SCREENS.
- `main.js` (CRLF kept, 22 changed lines): imports, `readLastSync`/`markSynced` (localStorage in try/catch, written after both `client.sync()` calls), aria-current via `Nav.tabFor(page)`, common `ctx` built each render, routing for `mais` and placeholders.
- `style.css`: `.mais-*` styles. A text chevron is used because icons.cjs has no chevron.

## TDD
- RED: `node --test android/app/src/nav.test.cjs android/app/src/screens/mais.test.cjs` -> "Cannot find module './nav.cjs'" / "'./mais.cjs'".
- GREEN: same command, 5/5 (then 6 with the index.html test); full suite 207 pass, 0 fail; `npm run build` OK.

## Visual
Preview at 375x812, mais-demo-claro and mais-demo-escuro: nav with Mais active, FAB, 7 rows, console clean. Server stopped, viewport reset.

## Self-review
- `git diff --stat`: no line-ending flip (main.js 601 CRLF of 601 lines).
- No inline script/style, CSP intact.
- Behaviour change: old aria-current special cases (e.g. detalhe from a conta highlighted Contas; agenda highlighted Resumo) are replaced by the brief's mapping (Contas/Agenda now highlight Mais).

## Concerns
- Contas/Agenda/Ligação back buttons still point to their old targets (agenda back -> resumo); nav has no direct entry to them except via Mais.
- `ctx.settings` is a hard-coded default in main.js until a settings task exists; `ctx.go`/`commit` are not yet used by any screen.
- `EquilibrioBack` untouched (Android back from `mais` is not special-cased).
