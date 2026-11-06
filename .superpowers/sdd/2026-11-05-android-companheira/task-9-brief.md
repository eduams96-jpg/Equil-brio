### Task 9: Ecrã Relatórios

**Files:**
- Create: `android/app/src/screens/relatorios.cjs`, `android/app/src/screens/relatorios.test.cjs`

**Interfaces:**
- Consumes: `require('../../../../equilibrio/reports-model.js')` (o esbuild junta-o, como já faz com `mobile-sync`), Task 8.
- Produces: `relatorios.view(ledger, {year, period, account}, analyse = R.analyse) → {current, previous, delta:{income, expense, saving, pct}, categories:[{name, value, color, children:[{name, value}]}]}`. O período anterior é o mês, trimestre ou ano anterior. A cor das categorias vem da regra usada em `equilibrio/reports-ui.js`, extraída para uma função se ainda não for pura. `render(ctx, sel)` mostra o seletor de período (pills Mês · Trimestre · Ano + ‹ ›) e de conta, 4 mosaicos (Receitas, Despesas, Saldo, Diferença em € e em %), «Onde gastas» (barras horizontais, toque expande as subcategorias), «Mês a mês» (barras, só em trimestre e ano) e `syncStamp`.
- Os erros do modelo são apanhados e o ecrã mostra `errorCard(e.message)`.

- [ ] **Step 1: Write failing tests:** a paridade, `view(demo,{year:'2026',period:'m10'}).current` deep-equal a `R.analyse(demo,{year:'2026',period:'m10'})`; o anterior de `m01` é `m12` do ano anterior; com `analyse` a atirar `Error('Ajuste sem direção…')`, `render` contém `Não foi possível calcular: Ajuste sem direção`; com ledger vazio não atira; com `hidden:true` não há montantes, nem no `aria-label`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Preview demo e vazio, claro e escuro.
- [ ] **Step 5: Commit** `git commit -m "Android: Relatórios"`

