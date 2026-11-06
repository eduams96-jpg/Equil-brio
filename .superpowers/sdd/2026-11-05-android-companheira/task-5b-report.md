# Task 5b report

Changes
- style.css: #app bottom padding = nav-h + 16 + 56 (FAB) + 24 + safe-area. .cs-pills: nowrap, overflow-x:auto, hidden scrollbar, scroll-snap proximity; buttons flex:0 0 auto, nowrap, min-height 44 kept; 3px padding so focus outline is not clipped.
- screens/movimentos.cjs: removed the duplicate "+ Novo movimento" button; empty-state text now "Usa o botão «+» para começar."
- screens/movimentos.test.cjs: new test (render has no data-page="novo"; shell.fabHtml() has it). Nothing else depended on the button (resumo keeps its own).
- main.js: after render, selected pill scrolled into view with plain JS (no inline script, CSP safe), via bounding rects.

Verification (preview, 375x812)
- Movimentos demo claro/escuro scrolled to bottom: last row bottom 627.9 < FAB top 676; scrollWidth 375.
- Pills one line (all buttons same top), scrollWidth 399/416/390 vs clientWidth 343/309; buttons 44 px high; doc scrollWidth 375.
- Selected pill scroll-into-view logic checked in the Histórico page (selected right edge 357 <= container 359); main.js path itself not run in preview (preview does not use main.js).
- Console clean (only 404 was my own mistyped URL).
- Tests: 259 pass, 0 fail; npm run build OK. Diff stat shows only small changes (CRLF preserved).
Concerns: none; viewport reset to desktop, preview stopped.

## Fix round 1
- Focus ring: `.cs-pills button:focus-visible{outline-offset:-3px}` (style.css, CRLF kept) so the ring is drawn inside the pill and never clipped by the scroll container. Verified in preview at 375x812 with a real Tab key press onto the first pill: :focus-visible true, ring fully visible on all sides in a screenshot (computed width/offset 2.4/-2.4 under emulation scaling, i.e. ring inside the border box).
- main.js: scroll-selected-pill block moved after the last `main.innerHTML` assignment (after the `sync` branch, before the draftBaseline/aria-busy lines); now iterates `.cs-pills` containers and uses `p.querySelector('[aria-pressed="true"]')` instead of parentElement.
- Commands: full Android suite -> 259 pass, 0 fail; `npm run build` OK. Preview viewport reset, server stopped.
