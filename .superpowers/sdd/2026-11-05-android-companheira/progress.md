# SDD ledger — plan: docs/superpowers/plans/2026-11-05-android-companheira.md

Spec: docs/superpowers/specs/2026-11-05-android-companheira-design.md
Branch: android-1.0.0 (from main 2ad0e1c). Baseline: 194 Android tests pass.
Scope this run: Tasks 1–5 (Fase 1), then stop for owner review.

Ruling: work on branch android-1.0.0 in place, not a git worktree — android/app/node_modules and the Gradle/SDK setup are untracked and would be missing in a worktree — cost if wrong: none beyond a branch switch.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1→T4/T5 | kit.tile/pills/card/money/escape/syncStamp, icons.icon | consistent |
| T2→T4/T5 | fixtures.ctx shape {ledger,state,today,lastSync,settings} | T4 needs ctx.counts; fixtures lacks it → Ruling A |
| T2↔T3 | preview frame vs nav markup in index.html | preview must use same nav as T3 → T3 updates preview frame |
| T3→T4/T5 | ctx {ledger,state,today,lastSync,settings,money,go,commit}; tabFor | consistent |
| T3 (self) | "todas as outras → mais" vs tabFor('desconhecida')==='resumo' | enumerated list → mais, unknown → resumo; consistent once read as enumeration |
| T3/T5 vs T7,T9–T11,T13 | data-page compras/patrimonio/relatorios/avisos/definicoes before screens exist | Ruling B |
| T4 (self) | movimentos.render filter test, but signature only render(ctx) | Ruling C |
| T5 (self) | casa.render(ctx,{tab}) | consistent with Ruling C pattern |
| T2 (self) | edits .claude/launch.json, which root .gitignore ignores | Ruling D |
| T1, T2, T4, T5 | CRLF files (main.js, index.html, style.css, house-ui.cjs, android/.gitignore) | preserve CRLF; new files may be LF; check git diff --stat |
| T6–T14 | not in this run | rescanned when Fase 2 starts |

Ruling A: fixtures.ctx() includes counts:{notices:null, shopping:null}; screens treat missing counts as null — spec shows "—" until Avisos exist — cost if wrong: trivial.
Ruling B: router renders a placeholder card "Em breve" for pages whose screen module does not exist yet (compras, patrimonio, relatorios, avisos, definicoes) — keeps nav buttons alive without dead ends — cost if wrong: trivial, removed as each screen lands.
Ruling C: screens with local view state take it as a second argument: render(ctx, viewState) (movimentos: filters+visibleLimit; casa: {tab}) — matches T5's stated signature — cost if wrong: small refactor.
Ruling D: .claude/launch.json is edited locally but not committed (ignored by root allowlist .gitignore) — cost if wrong: owner re-adds config entry.

## Progress
- Task 1: dispatched (BASE 2ad0e1c)
- Task 1: implementer DONE_WITH_CONCERNS c422379 (git add -f needed for android/ — established pattern; icon mappings noted)
- Task 1: minor (deferred): pills role=tab + aria-pressed mixes ARIA (plan-mandated wording)
- Task 1: minor (deferred): money/syncStamp branch coverage; icons NAMES duplicates keys
- Task 1: complete (commits 2ad0e1c..c422379, review clean)
- Task 2: dispatched (BASE c422379)
- Task 2: implementer DONE 8070f2f
- Task 2: review approved; controller confirmed gap: dark tokens incomplete (brief Step 1) + preview-serve decodeURIComponent crash → fix round 1 (FIX_BASE 8070f2f)
- Task 2: minor (deferred): preview frame duplicates shell markup (nav-full/nav-short) — carry to Task 3
- Task 2: minor (deferred): FAB spacing vs nav; no fixtures validation test
- Task 2: fix round 1/5 (2 addressed, 0 open; commits 8070f2f..d344390)
- Task 2: minor (deferred): preview-serve new URL outside try for absolute-form targets
- Task 2: complete (commits c422379..d344390, review clean)
- Task 3: dispatched (BASE d344390)
- Task 3: implementer DONE 804195e (207 tests); shell.cjs shared by index.html+preview; PLACEHOLDERS in nav.cjs
- Ruling E: pages reached from Mais (contas, agenda, sync and their sub-pages' top level) get back target 'mais' — carried to Task 5 — cost if wrong: one-line back target change.
- Task 3: minor (deferred): detalhe opened from conta highlights Movimentos (brief mapping); mais.render uses new Date() instead of ctx
- Task 3: complete (commits d344390..804195e, review clean)
- Task 4: dispatched (BASE 804195e)
- Task 4: implementer DONE_WITH_CONCERNS a399aa3 (detail+form HTML stayed in main.js; unused stats/total)
- Task 4: review Needs fixes. Ruling F: 'Ver todos' showing all movements (no month filter) is kept — Resumo list is 'Últimos movimentos', global, so label is accurate — cost if wrong: one-line revert.
- Task 4: fix round 1 requested: move detail (and new/edit form) HTML builders to movimentos.cjs as pure fns; remove try/catch around Agenda.agenda in resumo.cjs:307; remove dead total/stats/filter-type/filter-status handler entries (FIX_BASE a399aa3)
- Task 4: fix round 1/5 (3 addressed, 1 new — vacuous hidden-amount regex /d,d{2}s?€/ in movimentos.test.cjs; commits a399aa3..8c07e64)
- Task 4: fix round 2/5 (1 addressed, 0 open; commits 8c07e64..ffeefca)
- Task 4: minor (deferred): stray blank lines main.js/test; unused draftFor id param; detail/form not visually previewed (tests only)
- Task 4: complete (commits 804195e..ffeefca, review clean)
- Task 5: dispatched (BASE ffeefca)
- Task 5: implementer DONE_WITH_CONCERNS ac3af21 (252 tests; main.js 568->516; purchase-history tab possibly dropped; leftovers HTML in main.js)
- Task 5: review Needs fixes. Ruling G: purchase history restored as a 4th Casa pill 'Histórico' (tab 'historico') — spec lists 3 pills but did not ask to drop an existing RC4 feature; losing data views is worse — cost if wrong: remove one pill.
- Ruling H: remaining main.js HTML (resumo banners, draftBanner, recovery(), Eliminar screen, discard page, financialConsultation) moves in Task 5 fix round to resumo.cjs/movimentos.cjs — plan end state 'main.js only startup/router/state/sync/dialogs' — cost if wrong: extra churn.
- Task 5: fix round 1 requested (FIX_BASE ac3af21)
- Task 5: minor (deferred): fullState defaults duplicated contas/ligacao; dead data-shopping handler (Task 7 owns); shoppingBody duplicate compras button
- Task 5: fix round 1/5 (3 addressed, 0 open; commits ac3af21..8a078e9)
- Task 5: minor (deferred): 4 Casa pills wrap to 2 rows at 375px
- Task 5: complete (commits ffeefca..8a078e9, review clean)
- FASE 1 complete — stopped for owner review

## Fase 2–3 pre-flight scan (owner approved Fase 1 on 2026-11-06 with 3 visual tweaks; next stop end of Fase 3)

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| 5b (new) | visual tweaks: FAB clearance, drop "+ Novo movimento" duplicate, single-line scrollable pills | Ruling J |
| T6→T7 | house.shopping ops set-done/add/queue/update | consistent |
| T6 (self) | queue "id = p.id se existir" vs "add/queue fail if p.id exists" | Ruling I |
| T7 vs T5 | Casa 'Lista de compras' pill data-page=compras placeholder; dead data-shopping handler | T7 removes compras from PLACEHOLDERS and the dead handler |
| T8→T9/T10 | ranges m01–m12 | consistent |
| T9→T10 | relatorios.view(…, period:'mNN') used by Património card | consistent |
| T10 (self) | spec tile "variação do mês" vs plan "delta vs last saved value" | plan already rules (match PC); keep |
| T6, T8, T10 | PC files (house.cjs, reports-model.js, wealth-analysis-v3.js, index.html, package.json) | preserve each file's line endings; PC `npm test` (683) must pass |

Ruling I: add and queue always create a new row with id = p.id and fail with «O artigo já existe.» if it exists; queue does not update existing rows — spec only needs adding from catalog — cost if wrong: small op extension later.
Ruling J: owner-approved tweaks run as Task 5b before Task 6 — cost if wrong: none.
- Task 5b: dispatched (BASE 8a078e9)
- Task 5b: implementer DONE 6843bc4 (259 tests)
- Task 5b: review Needs fixes (focus ring clipped; scroll block mid render chain) → fix round 1 (FIX_BASE 6843bc4)
- Task 5b: fix round 1/5 (2 addressed, 0 open; commits 6843bc4..5405f19)
- Task 5b: minor (deferred): pill strip re-scroll on every render may override manual horizontal scroll
- Task 5b: complete (commits 8a078e9..5405f19, review clean)
- Task 6: dispatched (BASE 5405f19)
- Task 6: implementer DONE 20bda7a (263 Android, 683 PC)
- Task 6: minor (deferred): p.id not safe()-validated for add/queue; expiry format only length-checked; no test for update with inactive store
- Task 6: complete (commits 5405f19..20bda7a, review clean)
- Task 7: dispatched (BASE 20bda7a)
- Task 7: implementer DONE_WITH_CONCERNS 5c99cf1 (279 tests)
- Ruling K: «Conferir artigo» covers embalagens, preço, guardar em, validade, nota (spec list); changing store / notFound from the phone is out of scope — cost if wrong: small op + UI later.
- Task 7: review approved w/ Important (unguarded in-memory sheets). Ruling L: dirty-check + leaveDialog instead of SQLite draft for compras-artigo/compras-novo — light sheet, five short fields — cost if wrong: input lost on process kill only.
- Task 7: fix round 1 requested (+ replace :has with class, footer role) FIX_BASE 5c99cf1
- Task 7: minor (deferred): unit price/packages inputs not masked when hidden; quote O(n²) per row
- Task 7: fix round 1/5 (3 addressed, 0 open; commits 5c99cf1..95d68a8). Controller verified CRLF intact (re-reviewer's 'zero CR' grep was wrong).
- Task 7: minor (deferred): Android back while #shopLeaveDialog open calls showModal on open dialog (EquilibrioBack lacks branch); stale pending button within 180ms debounce
- Task 7: complete (commits 20bda7a..95d68a8, review clean)
- FASE 2 complete
- Task 8: dispatched (BASE 95d68a8)
- Task 8: implementer DONE 485abef (686 PC, 281 Android)
- Ruling M: category colour = rank-based palette from reports-ui.js:7-12; move palette+color(i) into reports-model.js api (ReportAnalysis.palette/color) and have reports-ui use it (plan permits extraction) — Android imports it — cost if wrong: tiny PC refactor.
- Ruling N: Android CSP style-src 'self' forbids style attributes; Relatórios/Património bars and colours via SVG presentation attributes (fill, width, x) or fixed classes, never style='' — cost if wrong: none.
- Task 8: minor (deferred): no leap-year Feb test; ranges guard allows prototype keys (pre-existing)
- Task 8: complete (commits 95d68a8..485abef, review clean)
- Task 9: dispatched (BASE 485abef)
- Task 9: implementer DONE 63d6d9d..a94e093 (294 Android, 688 PC)
- Controller check: android/app/src/style.css has mixed CRLF/LF since 8a078e9 (Task 2/5 era); only mixed file on branch. Ruling O: normalize style.css to CRLF in Task 9 fix round — cost if wrong: none.
- Task 9: review Approved. Fix round 1 (controller): normalize style.css CRLF; label «Diferença do saldo»; Ruling P: hide delta % in hidden mode, keep category shares — cost if wrong: trivial. FIX_BASE a94e093
- Task 9: minor (deferred): repSel stale across month boundary; pct vs negative base; '0 %' unsigned
