### Task 5: Migrar Contas, Agenda, Casa e Ligação para `screens/`

**Files:**
- Create: `android/app/src/screens/{contas,agenda,casa,ligacao}.cjs` e os testes respetivos
- Modify: `android/app/src/main.js`, `android/app/src/house-ui.cjs` (Casa passa a pills Lista de compras · Produtos · Stock; a lista antiga de `tab==='lista'` sai, porque a Task 7 a substitui)

**Interfaces:**
- Produces: `render(ctx)` e `bind(ctx, root)` em cada módulo, com os fluxos atuais intactos: editar e arquivar conta; novo, pagar e reagendar compromisso; produto, lote e consumo; emparelhamento, conflito, recuperação e passagem.
- Depois desta tarefa, `main.js` só tem arranque, router, estado, sincronização e diálogos.

- [ ] **Step 1: Write failing tests:** cada `render` com `empty()` e `demo()` não atira. `casa.render(ctx(demo()),{tab:'compras'})` contém `data-page="compras"` e `aria-pressed="true"` na pill Lista de compras. `ligacao.render` sem associação contém o formulário de endereço e código.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a migração.
- [ ] **Step 4: Run** todos os testes Android → PASS. `npm run build`. Preview de todos os ecrãs, claro e escuro, a 375 px, sem erros na consola.
- [ ] **Step 5: Commit** `git commit -m "Android: Contas, Agenda, Casa e Ligação com o visual novo"`

**Revisão do proprietário no fim da Fase 1:** capturas do preview de todos os ecrãs.

## Fase 2 — Lista de compras

