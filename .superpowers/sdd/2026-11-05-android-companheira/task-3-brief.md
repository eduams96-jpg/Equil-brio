### Task 3: Router, navegação inferior e separador «Mais»

**Files:**
- Create: `android/app/src/nav.cjs`, `android/app/src/screens/mais.cjs`
- Test: `android/app/src/nav.test.cjs`, `android/app/src/screens/mais.test.cjs`
- Modify: `android/app/src/index.html` (nav com Resumo · Movimentos · Casa · Mais, FAB `#quickAdd` com `data-page="novo"`), `android/app/src/main.js` (usa `nav.tabFor` para `aria-current` e um `ctx` comum)

**Interfaces:**
- Produces: `nav.tabFor(page:string): 'resumo'|'movimentos'|'casa'|'mais'`. Mapeamento: `resumo→resumo`; `movimentos, detalhe, novo, rascunho, eliminar, descartar-rascunho, conflito→movimentos`; `casa, casa-form, descartar-casa, compras→casa`; todas as outras (`contas, conta, editar-conta, arquivar-conta, sair-conta, agenda, compromisso, novo-compromisso, pagar-compromisso, descartar-compromisso, descartar-pagamento, patrimonio, relatorios, avisos, sync, recuperacao, confirmar-*, consulta-financeira, definicoes`) → `mais`.
- Produces: `main.js` constrói em cada desenho `ctx = {ledger, state, today, lastSync, settings, money, go(page), commit(...)}`. `lastSync` vem de `localStorage['equilibrio.mobile.lastSync']` (ISO), escrito depois de cada sincronização bem-sucedida, com acesso em `try/catch`.
- Produces: `mais.render(ctx)` → lista de entradas com ícone, em botões `data-page` por esta ordem: Contas (`contas`), Agenda (`agenda`), Património (`patrimonio`), Relatórios (`relatorios`), Avisos (`avisos`), Ligação (`sync`), Definições (`definicoes`). Páginas ainda não implementadas mostram «Em breve» até à sua tarefa.

- [ ] **Step 1: Write failing tests:** `tabFor('pagar-compromisso')==='mais'`, `tabFor('rascunho')==='movimentos'`, `tabFor('compras')==='casa'`, `tabFor('desconhecida')==='resumo'`; `mais.render(ctx(demo()))` contém os 7 `data-page` pela ordem indicada.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `nav.cjs`, `mais.cjs` e a ligação em `main.js`/`index.html`. Nenhum outro fluxo muda.
- [ ] **Step 4: Run** todos os testes Android → PASS. `cd android/app && npm run build` sem erros.
- [ ] **Step 5: Commit** `git commit -m "Android: navegação inferior com Mais"`

