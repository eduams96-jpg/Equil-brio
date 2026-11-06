### Task 4: Migrar Resumo e Movimentos para `screens/`

**Files:**
- Create: `android/app/src/screens/resumo.cjs`, `android/app/src/screens/movimentos.cjs`, os testes `*.test.cjs` correspondentes
- Modify: `android/app/src/main.js` (o HTML destes ecrãs sai daqui, incluindo a lista, o detalhe e o formulário novo/editar; os eventos passam para `bind`)

**Interfaces:**
- Consumes: `kit` (Task 1), `ctx` (Task 3), `view-model.cjs`, `financial-consultation.cjs`.
- Produces: `resumo.render(ctx)`: saldo total, gastos do mês, linha de mosaicos (Avisos → `avisos`, Agenda → `agenda`, Lista de compras → `compras`) e os últimos 5 movimentos. Os contadores de Avisos e Compras chegam por `ctx.counts = {notices:number|null, shopping:number|null}`, e `null` mostra «—». Até à Task 11, `notices` é `null`.
- Produces: `movimentos.render(ctx)` e `movimentos.bind(ctx, root)`, com o comportamento atual de filtros (`filters`), `visibleLimit` e detalhe. As pills substituem os `select` de tipo e de estado.

- [ ] **Step 1: Write failing tests:** `resumo.render(ctx(empty()))` não atira e contém «Ainda não há movimentos»; com `demo()` contém 3 `ch-tile` e 5 `movement-row` no máximo; com `state.hidden:true` não tem `/\d,\d{2}\s?€/`. `movimentos.render` com o filtro `type:'expense'` só lista despesas do `demo()`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, movendo o HTML e os eventos de `main.js` sem mudar regras (rascunhos, `leaveDialog`, revisão de conflitos).
- [ ] **Step 4: Run** todos os testes Android → PASS (os 194 originais incluídos). Gerar o preview e verificar Resumo e Movimentos a 375 px, claro e escuro.
- [ ] **Step 5: Commit** `git commit -m "Android: Resumo e Movimentos com o visual novo"`

