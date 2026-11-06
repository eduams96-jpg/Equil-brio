# Task 7 — Ecrã Lista de compras (relatório)

## Implementado
- `android/app/src/screens/compras.cjs`
  - `view(ledger, {status, storeId, query, inStore})` pura → `{rows[{id,name,qty,storeName,unitPrice,total,done,notFound}], estimated, inCart, stores, counts}`. `unitPrice`/`total` vêm de `Casa.quote` (cópia do ledger com os artigos marcados, porque `quote` exige `done` e recusa `notFound && done`), em try/catch por linha: artigos livres ou sem oferta ficam com `null`. `estimated` = soma dos totais de todos os artigos não `notFound`; `inCart` = dos `done`; ambos independentes dos filtros. Lista vazia/sem `casa` não lança.
  - `render(ctx, filters)`: título, «Acrescentar» (`#shop-add`), «Estou na loja» (`#shop-instore`), pesquisa, pills de estado (`data-pill-shopstatus`), pills de loja só no modo na loja (`data-pill-shopstore`), linhas (caixa `data-shopping-done` + `data-next` = inverso do valor visível; nome `data-shopping-open`), rodapé fixo «Estimado» / «No carrinho», «A lista está vazia».
  - `item(ctx,{id,form})` (folha «Conferir artigo»: embalagens, preço por embalagem, guardar em, validade, nota; retirar da lista), `add(ctx,{query,qty,name})` (pesquisa no catálogo → `queue` por produto/loja; nome livre → `add`).
  - Construtores de valores: `setDone`, `queueValues`, `addValues`, `updateValues` (só envia `purchaseOverride` quando difere da oferta, `null` quando volta ao valor da oferta), `offerDefaults`.
- `nav.cjs`: `compras` retirado de `PLACEHOLDERS`; `compras-artigo` e `compras-novo` no separador Casa (+ teste).
- `main.js` (CRLF preservado, 0 linhas LF): estado `shopFilters/shopId/shopForm/shopAdd`; páginas `compras`, `compras-artigo`, `compras-novo` no `render`; um novo handler de clique em captura (`data-shopping-done`, pills, `#shop-instore`, `#shop-add`, `data-shopping-open`, `#shop-item-save`, `#shop-item-remove`, `data-queue-catalog`, `#shop-add-free`) e um de `input` (pesquisa com debounce que repõe foco/cursor/scroll, como Movimentos); `preserveShop()` chamado em `run()` para não perder o formulário da folha. Handler morto `data-shopping` (toggle) removido.
- `style.css`: bloco «Lista de compras». Rodapé fixo acima da barra inferior; `#app:has(.shop-footer)` sobe o FAB e aumenta o padding inferior.
- `fixtures.cjs` `demo()`: 3 artigos ligados ao catálogo (por comprar, no carrinho, não encontrado). `preview.cjs`: ecrãs `compras`, `compras-na-loja`, `compras-artigo`, `compras-novo` (suporta `fn` e `view` como função).

## Como as operações são enviadas
Igual aos outros comandos `house.*`: `client.enqueue('house.shopping', {id, seed: P.id(), changedOn: today(), values})` (mesma `client` do main.js, fila de saída/SQLite). Ids novos: `P.id()` (como `openHouseForm`). Caixa: `set-done` com `data-next` (inverso do visível), nunca `toggle`. Nomes: `queue` `{catalogId,storeId,requestedQty}`, `add` `{name,qty}`, `update` `{purchaseOverride|null,location,expiry,note}`, `remove`.

## TDD
- RED: `node --test android/app/src/screens/compras.test.cjs` → `Cannot find module './compras.cjs'`.
- GREEN: 14 testes em `compras.test.cjs` + 2 em `android/server/shopping-sync.test.cjs`; suite completa **279/279** (263 + 16). `npm run build` OK.
- Integração: `shopping-sync.test.cjs` usa a ponte do PC (`createDesktopBridge`, cliente com `negotiate:true`), não `createService`: o cliente sem negociação recusa `house.*` («Casa aguarda validação de compatibilidade»), por isso o ensaio de `service.test.cjs` não serve para Casa. Verifica: add → set-done (duas vezes, idempotente) → PC lê `done:true` → set-done false → `done:false`; e queue + update com `purchaseOverride`/nota/local no PC, e regresso ao valor da oferta apaga o ajuste.

## Dentes (mutações, cada uma reposta)
1. Ignorar `hidden` em `amount()` → falha «com valores ocultos não há montantes» (o regex `/\d,\d{2}\s?€/` apanha o montante; com visíveis também afirma que existe).
2. `data-next` sem inverter → falham o teste de render e o de integração.
3. Filtro `todo` a incluir feitos → falham 2 testes.
4. `estimated` a incluir `notFound` → falha o teste de totais.

## Verificação visual (375×812, preview `android-preview`)
Demo claro (lista completa, rodapé 6,45 € / 2,58 €), na loja escuro, «Conferir artigo» claro, «Acrescentar» escuro, vazio escuro: `scrollWidth` 375, sem erros de consola (único 404 era uma URL antiga sem `.html` de outra página). Medido no fundo da página: último item termina em y=546, FAB 602–658, rodapé 672–738, barra 739–812: nada sobreposto. Primeira passagem mostrou o rodapé 9 px por baixo da barra (a barra mede 73 px, `--nav-h` é 64): corrigido com +10 px. Viewport reposto em desktop e servidor parado.

## Ficheiros
`android/app/src/screens/compras.cjs`, `compras.test.cjs`, `fixtures.cjs`, `android/app/src/main.js`, `nav.cjs`, `nav.test.cjs`, `style.css`, `android/app/scripts/preview.cjs`, `android/server/shopping-sync.test.cjs`.

## Preocupações
- `house.shopping update` não aceita `notFound`: a app não consegue marcar «não encontrado» (só mostra o que veio do PC) nem trocar de loja. Se for desejado, é uma extensão a `SHOP_FIELDS` (Task 6).
- Os totais usam o mesmo arredondamento de `Casa.quote`; artigos livres (sem catálogo) não têm preço, por isso não entram em «Estimado».
- A folha «Conferir artigo» e «Acrescentar» são páginas completas (`compras-artigo`, `compras-novo`) com estado em memória (preservado entre renders), não um `<dialog>`. Não há rascunho persistido em SQLite para estes formulários.
- `#app:has(...)` precisa de WebView com `:has` (Chromium ≥ 105); sem ele o FAB sobrepõe-se ao rodapé.
- Não testado em emulador/dispositivo, apenas preview estático e testes.

## Fix round 1
1. Perda de dados nas folhas: novo `Compras.isDirty(initial, current)` (pura; compara os campos iniciais, ignora espaços nas pontas; testada com casos reais em `compras.test.cjs`). Em `main.js`, `shopDirty()` compara o formulário atual com `Compras.initial(...)` (compras-artigo) ou `{qty:'1',name:''}` (compras-novo). Um handler de clique em captura, registado antes dos de Compras, trata qualquer botão `data-page`, da barra inferior ou o FAB nessas duas páginas (inclui `.back` e o botão Voltar do Android): se está sujo, abre o novo `<dialog id="shopLeaveDialog">` (index.html) com «Continuar a editar» / «Descartar alterações e sair»; se está limpo, não pergunta. Descartar repõe o estado e reenvia o clique original. O seletor de reativação de botões no fim de `run()` inclui o novo diálogo.
2. `:has` substituído por `#app.has-shop-footer` (style.css, mesma geometria); `render()` alterna a classe conforme `page==='compras'`; a pré-visualização emite a classe quando o corpo tem `.shop-footer`.
3. Rodapé: `role="group" aria-label="Totais da lista"` (teste novo).

Verificação: `node --test <glob completo>` → 281/281 (279 + 2); `npm run build` OK; `main.js` mantém CRLF (0 linhas só com LF, contado com node; nota: o `grep $'\r$'` do shell não é fiável aqui); `git diff --stat` sem reescrita de ficheiros. Preview 375×812 escuro: classe presente, scrollWidth 375, FAB 602–658, rodapé 672–738, último item termina em 546, barra 739: sem sobreposição. O comportamento do diálogo em `main.js` não tem teste automático (só a função `isDirty`); não foi exercitado num emulador.
