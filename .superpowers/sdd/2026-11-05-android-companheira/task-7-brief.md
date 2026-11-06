### Task 7: Ecrã Lista de compras

**Files:**
- Create: `android/app/src/screens/compras.cjs`, `android/app/src/screens/compras.test.cjs`
- Modify: `android/app/src/main.js` (página `compras` e a folha `compras-artigo` ligadas a rascunhos e operações `house.shopping`, pelo mesmo caminho dos outros comandos `house.*`)

**Interfaces:**
- Consumes: Task 6; `Casa.state(ledger)` e `Casa.quote` de `equilibrio/casa-model.js` para os totais.
- Produces: `compras.view(ledger, {status:'todo'|'cart'|'all', storeId:string, query:string, inStore:boolean}) → {rows:[{id,name,qty,storeName,unitPrice,total,done,notFound}], estimated:number, inCart:number, stores:{id,name}[]}` (pura, testável). `compras.render(ctx, filters)` e `compras.bind(ctx, root)`: um toque na caixa envia `set-done` com o valor inverso do que está visível; um toque no nome abre a folha «Conferir artigo» (embalagens, preço por embalagem, guardar em, validade, nota); «+» abre «Acrescentar» (pesquisa no catálogo → `queue`, ou nome livre → `add`). O rodapé fixo mostra «Estimado» e «No carrinho».

- [ ] **Step 1: Write failing tests:** `view(demo, {status:'todo'})` exclui os itens `done`; `inStore:true` com `storeId` só mostra os itens dessa loja; `estimated` é a soma dos `total` de todos os itens não `notFound` e `inCart` a dos `done`; com ledger sem `casa`, `rows` fica vazio e `render` mostra «A lista está vazia»; com `hidden:true` não há montantes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** todos os testes → PASS. Preview demo e vazio, claro e escuro. Teste de integração com o servidor de ensaio já existente (`android/server/service.test.cjs` como modelo): riscar no cliente, sincronizar e o PC ver `done:true`.
- [ ] **Step 5: Commit** `git commit -m "Android: Lista de compras"`

## Fase 3 — Relatórios e Património

