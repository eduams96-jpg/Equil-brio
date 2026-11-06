### Task 8: Períodos mensais em `reports-model.js`

**Files:**
- Modify: `equilibrio/reports-model.js:4` (`ranges`)
- Test: `equilibrio/tests/reports-months-1022.cjs`

**Interfaces:**
- Produces: `ranges` passa a incluir `m01`…`m12` (`m03:[3,3]`). `analyse(d,{year,period:'m03'})` devolve `months.length===1`, com `start` `YYYY-03-01` e `end` `YYYY-03-31`.

- [ ] **Step 1: Write failing test:** `analyse(fixture,{year:'2026',period:'m02'})`: `start==='2026-02-01'`, `end==='2026-02-28'`, `months.length===1`; `period:'m13'` atira «Período de relatório inválido.».
- [ ] **Step 2: Run** `cd equilibrio && node --test tests/reports-months-1022.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Relatórios: períodos mensais"`

