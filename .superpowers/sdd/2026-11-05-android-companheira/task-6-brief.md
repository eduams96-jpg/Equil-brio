### Task 6: Alargar `house.shopping`

**Files:**
- Modify: `equilibrio/mobile-sync/shared/house.cjs` (preservar CRLF/LF)
- Test: `android/shared/house.test.cjs` (acrescentar casos)

**Interfaces:**
- Produces: `house.shopping` aceita `values.operation` em `'toggle'|'remove'|'set-done'|'add'|'queue'|'update'`:
  - `set-done` → `values.done:boolean`; põe `row.done` igual ao valor (idempotente) e, se for `true`, `notFound=false`.
  - `add` → `values.name` (1–160) e `values.qty` (até 80); cria um item livre com `id = p.id` através de `Casa.shopping(d,'add',…)`.
  - `queue` → `values.catalogId`, `values.storeId`, `values.requestedQty>0`; chama `Casa.queueProduct(d,{id:p.id se existir, ...})` e cria com `id = p.id`.
  - `update` → subconjunto de `{storeId, note, location, expiry, name, qty, purchaseOverride:{packages:int≥1, price:number>0}|null}`, delegado em `CasaComplete.updateShopping` (`equilibrio/casa-complete-model.js`).
  - Para `add`/`queue`, a verificação «artigo existe» é invertida: falha com «O artigo já existe.» se `p.id` já estiver na lista. Os campos permitidos por operação são validados como hoje, e qualquer outro dá «Campo Casa não suportado.».

- [ ] **Step 1: Write failing tests:** `set-done` com `done:true` aplicado duas vezes deixa `done===true`; `add` cria `{id:p.id, name:'Pão', qty:'2', done:false}`; `add` com um `id` existente atira «O artigo já existe.»; `queue` sem preço na loja atira «Configura primeiro o preço…»; `update` com `purchaseOverride:{packages:2,price:1.5}` grava `packageQty` da oferta; o campo `foo` atira «Campo Casa não suportado.»; nenhuma operação altera `transactions`/`accounts`.
- [ ] **Step 2: Run** `node --test android/shared/house.test.cjs` → FAIL.
- [ ] **Step 3: Implement** em `house.cjs`.
- [ ] **Step 4: Run** os testes Android e `cd equilibrio && npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Partilha: lista de compras com adicionar, conferir e marcar"`

