# Task 8: Períodos mensais em reports-model.js

## Change
- `equilibrio/reports-model.js` line 4: `ranges` now also has `m01`…`m12`, each `[n,n]`. No other code changed; `analyse` needs no change.
- New test `equilibrio/tests/reports-months-1022.cjs` (3 tests): m02 start/end/months length, m03 values, `ranges` m01–m12 shape, and rejection of `m13`/`m00`.
- Commit `485abef` "Relatórios: períodos mensais" (2 files, 7 insertions, 1 deletion). LF endings kept.

## ranges usage grep
- `equilibrio/reports-model.js`: definition, validation in `analyse`, and `api` export. Nothing enumerates the keys there.
- `equilibrio/tests/reports-0412.cjs` line 5: `for (const period of Object.keys(R.ranges))` checks that each period's income/expense equals the sum of its months. Month keys satisfy this, so it still passes.
- `equilibrio/reports-ui.js` line 6: UI select uses its own hard-coded `periods` map (year, h1, h2, q1–q4), not `ranges`. The new keys do not appear in the UI. `periods[last.period]` would be undefined for an `m..` period, but the UI never offers one.
- No other `ranges` references in `equilibrio/*.js` or tests (the rest are vendored pdfjs).

## RED
```
✖ períodos mensais cobrem apenas o mês escolhido
  Error: Período de relatório inválido.
✖ ranges inclui m01 a m12 com um único mês cada
  AssertionError: actual undefined, expected [1, 1]
✔ mês inválido é rejeitado   (already passed: m13 was not a key)
```

## GREEN
```
✔ períodos mensais cobrem apenas o mês escolhido
✔ ranges inclui m01 a m12 com um único mês cada
✔ mês inválido é rejeitado
ℹ tests 3  pass 3  fail 0
```

## Suites
- `cd equilibrio && npm test`: tests 686, pass 686, fail 0 (683 before + 3 new).
- Android (repo root): tests 281, pass 281, fail 0.
- `git diff --stat` before commit: `equilibrio/reports-model.js | 2 +-`.

## Concerns
- Commit trailer: the brief asks for `Co-Authored-By: Claude Opus 5.5`, but the session's attribution instruction says Haiku 5.5. I followed the brief's verbatim value. Change it with `git commit --amend` if Haiku is wanted.
- The UI select does not offer monthly periods. Adding them is a separate UI task, out of scope here.
