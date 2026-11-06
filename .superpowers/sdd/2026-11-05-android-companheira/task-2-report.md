# Task 2 report

Status: DONE

## Implemented
- `android/app/src/style.css` rewritten (CRLF kept; diff stat 221 lines, not a whole-file flip). Tokens, frame (header, scrolling main, fixed 4-button bottom nav grid-auto-flow so the old 5-button nav still works, FAB `#quickAdd`/`.fab`), `.card`/`.cs-card`, `.ch-tile*` (matching kit.cjs flat spans: icon, label, value, detail, `is-green/amber/red/purple`), `.cs-pills` (uses `aria-pressed`, `.cs-pill-count`), `.cs-search`, `.cs-error`. All legacy classes from main.js/house-ui kept (rows, forms, period controls, filters, agenda, commit, house tabs, dialogs...). Legacy var names (`--bg --surface --text --soft --on-green`) are aliases of the new tokens. Forced theme via `html[data-theme=light|dark]`, plus prefers-color-scheme. Touch targets >= 44px (checked by script: no button under 44px height).
- Tile layout deliberately stacks icon above label/value (two-column inline layout truncated values at 375px).
- `android/app/src/screens/fixtures.cjs`: `empty()`, `demo()`, `ctx()` (includes `counts:{notices:null,shopping:null}`).
- `android/app/scripts/preview.cjs`: `SCREENS` list (`{name, module}`); modules that don't exist yet are skipped (resumo/movimentos/casa/mais listed). Currently produces `moldura-{demo,vazio}-{claro,escuro}.html` + `index.html`, plus style.css and assets/dm-sans.ttf (CSP-safe, no inline styles). A render error becomes an errorCard.
- `android/app/scripts/preview-serve.cjs`: port 4174; rebuilds on request of `/` (so after CSS edits, reload the index or rerun preview.cjs).
- `android/.gitignore`: `app/www-preview/` added (CRLF).
- `.claude/launch.json`: `android-preview` added locally, not committed (ignored).

## Token sources
Read from the live PC preview (`equilibrio` config, http://localhost:4173) via getComputedStyle(document.body), both themes.
Light: ink #172b36, muted #596c77, line #dde5eb, paper #fff, blue(teal) #116e59, green #147c5a, red #b4414e, orange #b77b2f, canvas/body bg #f5f7f9, surface-soft #f2f6f4.
Dark: ink #edf3f7, muted #b9cad5, line #354d5d, paper #192f3a, blue #267f6d, canvas/body bg #101e25, surface-soft #203842 (green/red/orange same as light).
Purple #9b6bd3 taken from round-120.css (no var exists on the PC). Confirmed the brief's known values.

## Verification
- Browser pane at 375x812, moldura demo in light and dark: screenshots checked, `scrollWidth` 375 (no horizontal scroll), console without errors, DM Sans loaded, no tile value truncated, no button < 44px.
- `npm run build` OK. Test suite: 201 pass, 0 fail.
- Not verified: the old screens (main.js) in the real app/emulator, only the new frame. Light preview was seen before the tile re-layout; dark after it.

## Self-review / concerns
- Old Android dark `--green` was a light mint; now buttons use `--blue` (#267f6d) with white text, like the PC. Old screens inherit that.
- Fixture shapes for investments/assets/debts/wealthHistory are plausible, not validated by a ledger validator; Tasks 4-5 may need to adjust.
- `.claude/launch.json` change is local only.

## Fix round 1
- The PC itself does not redefine green/red/orange in dark (only common.css:1620-1622 light values), so I chose lighter dark variants by contrast (>= 5.1:1 on #192f3a, #101e25 and #203842): --green #4cc39a, --red #f08a93, --orange #e0a85a, --purple #c4a0ec, added to BOTH dark blocks.
- New --blue-text (light = var(--blue); dark #5cc4ab, 6.6:1 on paper). Used for .text-button, #message, .product-link, active nav button, .ch-tile-icon. --blue stays as a fill (buttons, active pills, FAB).
- preview-serve.cjs: URL decode wrapped in try/catch -> 404. Checked with a real server: /%E0 -> 404, /index.html -> 200, server alive.
- CRLF kept in style.css (199/199). Dark preview at 375px: scrollWidth 375, console clean, computed vars confirmed.
- `npm run build` OK; focused tests (ui + app/src) pass.
