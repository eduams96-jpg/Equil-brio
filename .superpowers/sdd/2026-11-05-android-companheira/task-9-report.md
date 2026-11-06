# Task 9 — Ecrã Relatórios

Status: DONE. Commits: 63d6d9d (PC palette), a94e093 (Android screen).

## Implemented
- `android/app/src/screens/relatorios.cjs`: `initial`, `shift`, `switchKind`, `label`, `view(ledger, sel, analyse=R.analyse)`, `render(ctx, sel, analyse=R.analyse)`.
  - view returns `{current, previous, delta:{income,expense,saving,pct}, categories:[{name,value,color,children}]}`. `delta` is current minus previous period; the "Diferença" tile shows the saldo difference (€ and %); pct is null when the previous saldo is 0.
  - Selectors: pills Mês/Trimestre/Ano (`data-pill-repkind`), ‹ › (`rep-prev`/`rep-next`), account pills (`data-pill-repaccount`, only if >1 account). Previous period crosses year boundaries (m01→m12 y-1, q1→q4 y-1, year→y-1).
  - 4 tiles, «Onde gastas» (SVG bars, `data-rep-cat` toggles subcategories via `sel.open`), «Mês a mês» only for q/year (SVG rects with fixed CSS classes), syncStamp. Model errors -> `errorCard(e.message)` with the selectors kept.
- main.js: `repSel` state, render branch, one delegated capture handler (period kind, prev/next, account, category toggle). nav.cjs: `relatorios` removed from PLACEHOLDERS (nav.test updated). preview.cjs: three screens (m11 with open category, ano, trimestre). style.css: `.rep-*` appended (27 lines, no rewrite).

## PC change (Ruling M)
`palette` + `color(i)` moved to `equilibrio/reports-model.js` api (`palette`, `color`); reports-ui.js now `const color=i=>ReportAnalysis.color(i)`. New `equilibrio/tests/reports-palette.cjs` (2 tests). Output identical. PC suite 688/688 (was 686 + 2 new).

## TDD evidence
- PC: new palette test run before the change failed (R.palette undefined / reports-ui still defines palette), green after.
- Android: tests written first and run with the implementation file absent: "Cannot find module './relatorios.cjs'" (RED); then 13/13 green. (The implementation had been drafted before; RED was shown by moving the file aside.)

## Teeth checks
- Mutating tile/category money to ignore `hidden` -> hidden test fails (12 pass / 1 fail). The visible render of the same selections is asserted to match `/\d,\d{2}\s?€/` first.
- Injecting `style="…"` into the SVG -> no-style test fails.
- aria-labels checked individually for digits/€.

## Verification
- Android suite 294/294; PC suite 688/688; `cd android/app && npm run build` exits 0 and bundles ReportAnalysis.
- Visual (preview android-preview, 375x812): relatorios demo/vazio x claro/escuro plus ano/trimestre variants. No `[style]` elements, no error cards, no horizontal overflow (scrollWidth 371 ≤ 375), console clean (only the favicon 404 from the preview server). Month label capitalised with `::first-letter` after first screenshot showed "Novembro De". Viewport reset to desktop; server stopped.

## Files
- equilibrio/reports-model.js, equilibrio/reports-ui.js, equilibrio/tests/reports-palette.cjs
- android/app/src/screens/relatorios.cjs, relatorios.test.cjs, android/app/src/main.js, nav.cjs, nav.test.cjs, style.css, android/app/scripts/preview.cjs

## Concerns
- Interactions in main.js (pill/step/account/toggle) are covered by pure-function tests (`shift`, `switchKind`) and the render tests but not exercised in a running app/emulator.
- Percentages (share, delta %) stay visible when values are hidden (proportions, not amounts).
- Stale `sel.account` (account later deleted) shows the model's error card; the account pills remain so "Todas" recovers it.
- `style.css` has mixed line endings; the appended block is LF like the surrounding recent rules.

## Fix round 1
- style.css normalised to CRLF (259 split parts, every line ends in \r, verified in Node); diff 58 lines changed in the file (previously-LF lines), total diff 62+/58-.
- Tile label now «Diferença do saldo».
- Hidden mode omits the delta % detail (keeps «face a …»); category shares kept.
- Test: tile helper asserts no `%` in the Diferença do saldo tile when hidden; teeth: visible m11 tile has `%`, and reverting the `!hidden` guard fails the test (12 pass/1 fail).
- Android suite 294/294; `npm run build` exit 0.
