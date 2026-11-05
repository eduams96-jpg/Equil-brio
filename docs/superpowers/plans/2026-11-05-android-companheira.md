# Android 1.0.0 companheira — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a app Android RC4 a uma 1.0.0 companheira do PC, com o visual do Windows 1.0.21 e quatro funções novas: Lista de compras, Património, Relatórios e Avisos com notificação diária.

**Architecture:** A interface móvel é reescrita em módulos por ecrã (`android/app/src/screens/*.cjs`, `render(ctx)` puro + `bind(ctx, root)`), sobre peças comuns em `android/app/src/ui/`. Os números vêm dos modelos puros do PC (`reports-model.js`, `dossiers-model.js` e o novo `wealth-model.js`), que o esbuild junta no bundle. A sincronização e o protocolo não mudam. As escritas da Lista de compras usam o comando `house.shopping`, que já existe e é alargado. Os módulos de ecrã usam `.cjs` (o spec dizia `.js`), seguindo o padrão de `house-ui.cjs`, para os testes os poderem carregar com `require`.

**Tech Stack:** JavaScript (CommonJS nos módulos, como `house-ui.cjs` e `agenda.cjs`), Capacitor 8.5.3, esbuild 0.25.10, `node:test` (Node.js 24), Gradle/JDK 21 para o APK.

**Spec:** `docs/superpowers/specs/2026-11-05-android-companheira-design.md`

## Global Constraints

- Identidade `pt.equilibrio.mobile`, mesma chave de assinatura; nunca gerar outra chave. Instala por cima da RC4 sem desinstalar.
- Versão final `1.0.0`, versionCode `5` (em `android/app/android/app/build.gradle`, ramo `distributionBuild`, e em `android/app/package.json`).
- Protocolo de sincronização, emparelhamento e certificado inalterados. `protocolVersion` continua 1.
- Alterações ao PC limitadas a: `equilibrio/wealth-model.js` (novo, sem mudança visível), `ranges` mensais em `reports-model.js` e alargamento de `house.shopping` em `equilibrio/mobile-sync/shared/house.cjs`.
- Textos em português europeu, no tom da app. Montantes em `pt-PT`/EUR; com valores ocultos aparece `•••• €`.
- Tokens visuais do PC 1.0.21 (`--ink`, `--muted`, `--line`, `--paper`, teal `#116e59` em `--blue`/`--green`), tema claro e escuro, alvos de toque com pelo menos 44 px, `env(safe-area-inset-*)`, sem scroll horizontal a 375 px.
- CSP de `index.html` mantida (`script-src 'self'`, `connect-src 'none'`): nada inline e nenhum recurso externo.
- Muitos ficheiros do PC são CRLF e `.gitattributes` é `* -text`. Editar sempre preservando o fim de linha original, nunca com `sed -i`, e confirmar com `git diff --stat` antes de cada commit.
- Nunca tocar na base viva `%APPDATA%\Financas Pessoais\financas.db`. Os testes com dados reais usam uma cópia.
- Testes PC: `cd equilibrio && npm test` (683 a passar). Testes Android, a partir da raiz: `node --test android/shared/*.test.cjs android/server/*.test.cjs android/app/src/*.test.cjs android/app/src/ui/*.test.cjs android/app/src/screens/*.test.cjs` (194 hoje). Todos têm de passar no fim de cada tarefa.

## Review Focus

1. **Ledger sem secções opcionais** (sem `casa`, `investments`, `assets`, `debts`, `wealthHistory`, `pendingPayments`): todos os ecrãs mostram um estado vazio em vez de rebentar. → testes «ledger vazio» nas Tasks 4, 5, 7, 9, 10, 11.
2. **Valores ocultos ativos:** nenhum montante aparece nos ecrãs novos, nos gráficos (rótulos e `aria-label`) nem na notificação. → asserções `doesNotMatch(/\d+,\d{2} €/)` nas Tasks 9, 10, 11 e 12.
3. **Riscar o mesmo item no PC e no telemóvel antes de sincronizar:** a operação `toggle` não pode inverter duas vezes em silêncio. Usa `operation:'set-done'` com o valor pretendido, que é idempotente. → teste na Task 6.
4. **Modelo do PC atira erro com dados inesperados**, por exemplo «Ajuste sem direção impede calcular este saldo.»: o ecrã mostra o cartão de erro e a navegação continua. → teste na Task 9 (`ctx` com `analyse` a atirar).
5. **Avisos cujo `targetView` não existe no telemóvel** (`casaEquipment`, `casaVehicles`, `casaHousing`, `wealthMoneyHub`): mostram só o detalhe e não deixam um botão morto. → teste na Task 11.

---

## Fase 1 — Base visual e navegação

### Task 1: Peças comuns de interface

**Files:**
- Create: `android/app/src/ui/kit.cjs`, `android/app/src/ui/icons.cjs`
- Test: `android/app/src/ui/kit.test.cjs`

**Interfaces:**
- Produces (`kit.cjs`): `escape(value): string`; `money(cents:number, hidden:boolean): string` (Intl `pt-PT` EUR, `'•••• €'` quando oculto); `tile({tone:'green'|'amber'|'red'|'purple'|'blue', icon:string, label:string, value:string, detail?:string, page?:string}): string` (`<article class="ch-tile is-…">`, que passa a `<button data-page>` quando há `page`); `pills(name:string, options:{value,label,count?}[], selected:string): string` (`<div class="cs-pills" role="tablist">`, botões com `data-pill-<name>` e `aria-pressed`); `card({title, subtitle?, body, className?}): string`; `search(id, value, placeholder): string`; `errorCard(message): string` («Não foi possível calcular: …»); `syncStamp(isoOrNull, now:Date): string` («Dados de há 5 min», «Dados de há 2 h», «Dados de ontem», «Ainda não sincronizado»).
- Produces (`icons.cjs`): `icon(name): string` (SVG inline com `aria-hidden="true"`, ou `''` se o nome não existir). Os SVG são copiados de `equilibrio/interface-ui.js` para os nomes `chart, account, box, alert, cart, calendar, bell, home, list, settings, link, plus, search, check, arrow`. Se algum nome não existir lá, usa-se o mais próximo e regista-se o mapeamento num comentário.

- [ ] **Step 1: Write the failing tests** em `kit.test.cjs`: `money(123456,false)==='1234,56 €'` (comparar depois de normalizar NBSP); `money(5,true)==='•••• €'`; `escape('<a "x">')==='&lt;a &quot;x&quot;&gt;'`; `tile({tone:'red',icon:'alert',label:'Avisos',value:'3',page:'avisos'})` contém `class="ch-tile is-red"`, `data-page="avisos"` e um `<svg`; `pills('estado',[{value:'a',label:'A'},{value:'b',label:'B'}],'b')` tem `aria-pressed="true"` só em `b`; `syncStamp(null,now)==='Ainda não sincronizado'`; `syncStamp(new Date(now-5*60e3).toISOString(),now)==='Dados de há 5 min'`; `errorCard('x<y')` contém `x&lt;y`.
- [ ] **Step 2: Run** `node --test android/app/src/ui/kit.test.cjs`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `kit.cjs` e `icons.cjs` com as assinaturas acima.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit** `git add android/app/src/ui && git commit -m "Android: peças comuns de interface"`

### Task 2: CSS novo e pré-visualização estática

**Files:**
- Modify (reescrita): `android/app/src/style.css`
- Create: `android/app/scripts/preview.cjs`, `android/app/scripts/preview-serve.cjs`, `android/app/src/screens/fixtures.cjs`
- Modify: `.claude/launch.json` (nova configuração `android-preview`, porta 4174)
- Modify: `.gitignore` em `android/` (acrescentar `app/www-preview/`)

**Interfaces:**
- Produces: `fixtures.cjs` → `empty()`, `demo()` (a partir de `P.fixture()` de `android/shared/protocol.cjs`, com `casa.shopping`, `investments`, `assets`, `debts`, `wealthHistory` e `pendingPayments` preenchidos), `ctx(ledger, overrides?)` → `{ledger, state:{hidden:false}, today:'2026-11-05', lastSync:null, settings:{notifications:false, hour:9, theme:'auto', hideOnOpen:false}, ...overrides}`. É o mesmo `ctx` que os ecrãs recebem em produção (Task 3).
- Produces: `node android/app/scripts/preview.cjs` gera `android/app/www-preview/<ecrã>-<demo|vazio>-<claro|escuro>.html` e um `index.html` com ligações. Cada página tem `style.css` e o HTML de `render(ctx)` dentro da moldura da app (cabeçalho e barra inferior). `preview-serve.cjs` serve essa pasta na porta 4174.

- [ ] **Step 1: Obter os tokens efetivos do PC.** Arrancar a configuração `equilibrio` (porta 4173) e ler `getComputedStyle(document.body)` de `--ink --muted --line --paper --blue --green --red` e de âmbar e roxo, nos temas claro e escuro. Copiar os valores para `:root` e para `@media (prefers-color-scheme: dark)` / `[data-theme=dark]` em `style.css`. Copiar também as regras de `.ch-tile`, `.ch-tile-icon`, `.cs-pills` e `.cs-search` de `equilibrio/ui-styles/round-120.css`, sem os seletores `:is(#page…)`.
- [ ] **Step 2: Escrever o resto de `style.css`:** moldura (cabeçalho, `main` com scroll, barra inferior fixa com 4 botões e FAB «+» acima à direita), `.card`, `.row`, `.amount`, formulários e diálogos que já existem, tema forçado por `html[data-theme]`. Alvos de toque com pelo menos 44 px.
- [ ] **Step 3: Implementar `preview.cjs` e `preview-serve.cjs`.** Nesta tarefa o preview só tem a página «moldura» com um mosaico de cada cor. Os ecrãs juntam-se a partir da Task 3.
- [ ] **Step 4: Verify.** `preview_start {name:'android-preview'}`, abrir a moldura a 375×812 em claro e escuro, `read_console_messages` sem erros, capturas. Medir com `document.documentElement.scrollWidth <= 375` a confirmação de que não há scroll horizontal.
- [ ] **Step 5: Commit** `git commit -m "Android: CSS com a identidade do PC e pré-visualização"`

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

### Task 10: `wealth-model.js` e ecrã Património

**Files:**
- Create: `equilibrio/wealth-model.js`, `equilibrio/tests/wealth-model-1022.cjs`
- Modify: `equilibrio/wealth-analysis-v3.js:79-157` (`renderWealth` passa a usar o modelo), `equilibrio/index.html` (`<script src="wealth-model.js">` antes de `wealth-analysis-v3.js`, linha ~831), `equilibrio/package.json` (`build.files`), e qualquer lista de scripts verificada em `equilibrio/tests/` (procurar `wealth-analysis-v3.js`)
- Create: `android/app/src/screens/patrimonio.cjs`, `android/app/src/screens/patrimonio.test.cjs`

**Interfaces:**
- Produces: `WealthModel.summary(d, today = F.today()) → {cash, investments, assets, debts, monthlyPayments, net, positive, delta, previousDate, parts:[{key:'accounts'|'investments'|'assets', label, value, share, count}], debtCount, unchecked, history:[{date, net}] (até 12, ≤ today, ordenado)}`. Usa as mesmas fórmulas de `renderWealth` (`F.balanceAt`, `LifeFinance.assetTotal`, `F.money`). Exporta em UMD: `root.WealthModel` + `module.exports`.
- O mosaico «variação» do spec usa `delta` face ao último valor guardado, como no PC (não face ao mês).
- `patrimonio.render(ctx)`: 4 mosaicos iguais ao PC (Património líquido, Contas, Bens e investimentos, Créditos), cartão Composição (barra empilhada e lista), cartão Evolução (SVG de linha com `history`, rótulos em `sensitive`), cartão «Receitas e despesas do mês» através de `relatorios.view(…, period:'mNN')`, e `syncStamp`. Os erros mostram `errorCard`.

- [ ] **Step 1: Write failing tests:** (PC) para `seed` de `tests/reports-categories-1018.cjs` e o ledger de `tests/closure-040.cjs`, `summary(d,'2026-11-05')` tem `net === cash+investments+assets−debts` arredondado por `F.money`; com `wealthHistory` vazio, `delta===null` e `history==[]`. (Android) a paridade, o `net` no HTML é igual a `money(summary.net*100)`; com ledger vazio aparece «Ainda não há valores guardados»; com `hidden:true` não há montantes no SVG nem nos rótulos.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `wealth-model.js` e trocar os cálculos inline de `renderWealth` pelo `summary`, sem mudar o HTML gerado.
- [ ] **Step 4: Verify PC sem regressão.** `npm test` → PASS. Na configuração `equilibrio` (4173), comparar o `innerHTML` de `#wealthV3Overview` antes e depois da alteração, com os mesmos dados de demonstração e `git stash` para obter o «antes»: têm de ser idênticos. Depois `npm run build` do Android, todos os testes Android → PASS, e preview do Património.
- [ ] **Step 5: Commit** `git commit -m "Património: modelo partilhado e ecrã Android"`

**Revisão do proprietário no fim da Fase 3:** capturas de Relatórios e Património.

## Fase 4 — Avisos e notificações

### Task 11: Ecrã Avisos e contador no Resumo

**Files:**
- Create: `android/app/src/screens/avisos.cjs`, `android/app/src/screens/avisos.test.cjs`
- Modify: `android/app/src/main.js` (`ctx.counts.notices`, com cache invalidada em commit e sincronização)

**Interfaces:**
- Consumes: `require('../../../../equilibrio/dossiers-model.js').notices(ledger, {today})` → `{rows, counts:{active, overdue, high, medium, low}}`.
- Produces: `avisos.groups(result, today) → {overdue:[], today:[], soon:[]}`, conforme `item.date` < = > `today`. `avisos.target(item) → {page, params}|null`: `pendingPayment` → `{page:'pagar-compromisso', params:{id:item.originId}}` se o compromisso existir no ledger; `planner` → `agenda`; `casaStock`/`casaPurchases` → `casa` com `tab` `stock`/`compras`; `transactions` → `movimentos`; tudo o resto → `null`. `render(ctx)` mostra os grupos, cores por `priority` (`high` vermelho, `medium` âmbar, `low` azul), botão se `target` não for `null` e, se for, só o detalhe, mais `syncStamp`. O contador do Resumo é `counts.high + counts.medium`.

- [ ] **Step 1: Write failing tests:** um aviso com `targetView:'casaVehicles'` não gera `<button` com `data-page`; `pendingPayment` gera `data-page="pagar-compromisso"`; agrupamento com datas antes, igual e depois de `today`; ledger vazio mostra «Sem avisos»; com `hidden:true` não há montantes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Preview.
- [ ] **Step 5: Commit** `git commit -m "Android: Avisos"`

### Task 12: Notificação diária local

**Files:**
- Create: `android/app/src/digest.cjs`, `android/app/src/digest.test.cjs`, `android/app/src/notifier.cjs`
- Modify: `android/app/package.json` (`@capacitor/local-notifications` 8.x compatível com `@capacitor/core` 8.5.3, versão exata fixada no lock), `android/app/src/main.js`, `android/app/android/app/src/main/AndroidManifest.xml` (se o plugin não juntar `POST_NOTIFICATIONS`)

**Interfaces:**
- Produces: `digest.dailyDigest(noticesResult, {hidden:boolean}) → {title:string, body:string}|null`. Devolve `null` se não houver `high`/`medium`. `title` é «1 aviso hoje» ou «N avisos hoje». `body` tem até 3 títulos, cada um com o estado entre parênteses (`Vence hoje`→`vence hoje`, vencido→`atrasado`, futuro→`em N dias`), separados por «, », mais «…» se houver mais. Com `hidden`, `body` fica «Abre a app para ver.».
- Produces: `notifier.schedule(ledger, settings, {hidden, now:Date}, plugin)`. Cancela os ids `9001`–`9007` e, para cada um dos próximos 7 dias `k`, calcula `dailyDigest(notices(ledger,{today:dia_k}))` e agenda o id `9001+k` às `settings.hour:00`, com `extra:{page:'avisos'}`, quando não é `null` e a hora ainda não passou. `notifier.enable(plugin) → Promise<boolean>` pede a permissão e devolve `false` se for recusada.
- `main.js` chama `schedule` ao arrancar e depois de cada sincronização e commit, se `settings.notifications`. `localNotificationActionPerformed` com `extra.page` navega para essa página.

- [ ] **Step 1: Write failing tests:** `dailyDigest` sem avisos → `null`; com 4 avisos high/medium → `title:'4 avisos hoje'` e `body` termina em «…»; com `hidden:true`, `body==='Abre a app para ver.'` e nenhum título aparece; `schedule` com um plugin falso regista `cancel([9001..9007])` e só agenda os dias com avisos, à hora certa.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, instalar o plugin e correr `npx cap sync android`.
- [ ] **Step 4: Run** → PASS. `npm run build`.
- [ ] **Step 5: Commit** `git commit -m "Android: notificação diária dos avisos"`

## Fase 5 — Definições e entrega

### Task 13: Ecrã Definições

**Files:**
- Create: `android/app/src/settings.cjs`, `android/app/src/settings.test.cjs`, `android/app/src/screens/definicoes.cjs`, `android/app/src/screens/definicoes.test.cjs`
- Modify: `android/app/src/main.js` (aplica `data-theme` e `hideOnOpen` no arranque)

**Interfaces:**
- Produces: `settings.read(storage) → {notifications:false, hour:9, theme:'auto'|'light'|'dark', hideOnOpen:false}` (com valores por defeito e entradas inválidas ignoradas); `settings.write(storage, next)`. A chave é `'equilibrio.mobile.settings'` e `storage` é `localStorage`, com `try/catch` e um falso nos testes.
- Produces: `definicoes.render(ctx)` com o interruptor de notificações e a hora (0–23); se `enable()` devolver `false`, o interruptor volta a desligado e aparece «Sem permissão para notificações. Ativa-a nas definições do Android.». Inclui ainda o tema (pills), «Ocultar valores ao abrir», as preferências de avisos do PC só para leitura (de `noticePreferences` no ledger) com a nota «Alterar no PC», e a versão lida de `build-info.json`.

- [ ] **Step 1: Write failing tests:** um JSON inválido no storage dá os valores por defeito; `hour:25` é ignorada; `render` com notificações recusadas mostra o aviso de permissão.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Preview.
- [ ] **Step 5: Commit** `git commit -m "Android: Definições"`

### Task 14: Versão 1.0.0, APK e entrega

**Files:**
- Modify: `android/app/package.json` (`version:"1.0.0"`), `android/app/android/app/build.gradle:12-13` (`versionCode distributionBuild ? 5 : 16`, `versionName distributionBuild ? '1.0.0' : '0.1.0-prototipo.16'`), `android/app/scripts/build.cjs` (no release, o subtítulo `'Ensaio Android · dados fictícios'` passa a `'Android'`), `android/README.md`, `RETOMAR.md`, `PASTAS-DO-PROJETO.md`
- Create: `entrega-android-1.0.0/` (APK, `SHA256.txt`, `INSTALAR.md`)

- [ ] **Step 1:** Atualizar as versões e os textos acima. No README, o comando de testes passa a incluir `ui/` e `screens/`, e o número de testes é atualizado.
- [ ] **Step 2: Run** todos os testes Android e `cd equilibrio && npm test` → PASS.
- [ ] **Step 3: Build.** `powershell -NoProfile -ExecutionPolicy Bypass -File android/scripts/build-release.ps1` → `app-release.apk`, `lintRelease` com 0 erros. Confirmar com `apksigner verify --print-certs` que o certificado é igual ao da RC4 em `entrega-v1.0.15/`.
- [ ] **Step 4: Package.** Copiar para `entrega-android-1.0.0/Equilibrio-Android-1.0.0.apk`, gerar `SHA256.txt` e escrever `INSTALAR.md` (instalar por cima da RC4 sem desinstalar; ativar as notificações em Definições; o PC central não precisa de atualização).
- [ ] **Step 5: Commit** `git commit -m "Equilíbrio Android 1.0.0 — companheira redesenhada"`. O APK fica fora do Git, como nas entregas anteriores; confirmar com `git check-ignore`.

**Revisão do proprietário:** instalar no telemóvel. O piloto físico continua em `PILOTO-FINAL.md`.
