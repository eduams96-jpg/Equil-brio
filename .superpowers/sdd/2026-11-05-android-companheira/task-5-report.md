# Task 5 - Contas, Agenda, Casa e Ligação para `screens/`

Status: DONE_WITH_CONCERNS. Commit `ac3af21` (um só commit) na branch `android-1.0.0`.

## Implementado por ecrã (builders e argumentos)
- `screens/contas.cjs`: `render(ctx)` (inclui banner de rascunho, voltar a `mais`, mosaicos de saldo e contas ativas, lista e arquivadas), `detail(ctx,{accountId,visibleLimit})`, `editor(ctx,{form})`, `archive(ctx,{accountId})`, `leave()`.
- `screens/agenda.cjs`: `render(ctx,{period,showCompleted})` (banners de pagamento e compromisso, voltar a `mais`, mosaicos A pagar / A receber), `commitment(ctx,{commitmentId})`, `form(ctx,{form,record})` (compromisso), `payment(ctx,{form,record})`, `discardCommitment()`, `discardPayment()`.
- `screens/casa.cjs`: `render(ctx,{tab,id})` com tab `compras|produtos|stock` e também `produto|lote` para os detalhes; pills Lista de compras (`data-page="compras"`), Produtos (`data-house-tab="produtos"`), Stock (`data-house-tab="stock"`). `form(ctx,{form,record})` (produto, lote, consumo), `discard()`. `house-ui.cjs` ficou só com `priceReference`/`priceLabel(unit,offer,hidden)`; a lista `tab==='lista'` e o separador de histórico de compras saíram.
- `screens/ligacao.cjs`: `render(ctx,{connection,savedConnection})` (voltar a `mais`, botão Cópia e recuperação, cartões Associação e Alterações), `conflict(ctx,{conflictId})` (junta o painel de movimento e o de conta/compromisso/Casa), `recovery(ctx,{points,file})`, `confirmRecovery()`, `confirmDetach()`, `confirmPassage()`.
- `fixtures.demo()` ganhou um produto e um lote (via `Casa.saveProductOffers` / `Life.lot`) para a pré-visualização e testes. `preview.cjs`: contas, agenda, ligacao (page `sync`), casa-stock, casa-compras, ligacao-ligada; novo campo `view`/`page` nas entradas de SCREENS.

## O que ficou em main.js e porquê
Arranque, router `render()`, estado/closures (`cf/cr/pf/pr/hf/hr/accountForm`...), rascunhos (preserve/persist/auto), `run`, delegação de cliques/inputs, leaveDialog, sync/associação, recuperação (handlers), EquilibrioBack, e HTML de Movimentos/resumo deixado pela Task 4 (`recovery()`, `draftBanner()`, `Eliminar movimento` inline, banners de resumo) e `financialConsultation` (consulta-financeira, ecrã de Mais, fora desta tarefa). Só HTML foi movido; ids, names, data-* e lógica inalterados. Estado de closure passa por argumento (view). `houseTab` passa a `'stock'` em vez de `'despensa'` após guardar lote.
main.js: 568 linhas (com linhas em branco) antes, 516 depois; CRLF preservado (diff 108 linhas, sem flip).

## Testes e TDD
- RED: `node --test android/app/src/screens/*.test.cjs` -> `Cannot find module './agenda.cjs' / casa / contas / ligacao` (4 módulos em falta).
- GREEN: 32 testes dos novos ecrãs + house-ui; a primeira corrida teve 2 falhas minhas de teste (rascunho de compromisso sem `changedOn`; estado vazio de Produtos que nunca aparecia - corrigido no módulo com mensagem "Ainda sem produtos").
- Todos: `node --test android/shared/*.test.cjs android/server/*.test.cjs android/app/src/*.test.cjs android/app/src/ui/*.test.cjs android/app/src/screens/*.test.cjs` -> 252 pass, 0 fail. `npm run build` OK.
- Teeth de valores ocultos: cada teste de ocultação afirma `assert.match(visível, /\d,\d{2}\s?€/)` e `assert.doesNotMatch(oculto, ...)`. Verificação extra: com `--require` a fazer `kit.money` ignorar `hidden`, falham 5 testes (Agenda, Casa, Conflito, Contas e Formulário de pagamento), logo as asserções têm dentes.

## Verificação visual
Preview `android-preview` a 375x812: 28 páginas novas (contas, agenda, casa, ligacao, casa-stock, casa-compras, ligacao-ligada x demo/vazio x claro/escuro), `scrollWidth` = 375 em todas, consola sem erros (as "moldura" mostram o cartão de erro de propósito). Capturas conferidas de contas (claro), agenda (escuro), casa (claro), ligacao (escuro). Servidor parado e viewport reposto.

## Ficheiros
Novos: `android/app/src/screens/{contas,agenda,casa,ligacao}.cjs` + `.test.cjs`. Alterados: `android/app/src/main.js`, `android/app/src/house-ui.cjs`, `android/app/src/screens/fixtures.cjs`, `android/app/scripts/preview.cjs`.

## Autorrevisão e concerns
1. Não criei `bind(ctx,root)` nos quatro módulos: como na Task 4, a delegação global fica em main.js (ids/data-* inalterados), e os módulos não têm ligações próprias. Dizer se se quer um `bind` vazio por simetria.
2. Pill Lista de compras vai para o placeholder `compras`; o separador `render(ctx,{tab:'compras'})` mostra um cartão com a contagem e um botão para o mesmo destino. O histórico de compras antigo (`tab==='compras'` de house-ui) saiu com a lista antiga; a Task 7 deve reintroduzi-lo se for desejado. O handler `data-shopping` continua em main.js mas já não é renderizado.
3. Restos fora de âmbito em main.js (Task 4/Mais): banners de resumo, `recovery()` do rascunho de movimento, ecrã Eliminar e `financialConsultation` ainda constroem HTML. O banner de pagamento passou a só ser inserido em `resumo` (a Agenda trata dos seus).
4. Os módulos de ecrã são LF; main.js e house-ui.cjs mantêm CRLF.
5. Lógica de `Contas/Ligacao` usam um `fullState` local com defaults (`outbox`, `confirmed.ledger`) para a pré-visualização; duplicado em dois módulos (3 linhas).

## Fix round 1
1. Histórico restaurado: 4ª pill «Histórico» (`data-house-tab="historico"`), ordem Lista de compras, Produtos, Stock, Histórico. `casa.render(ctx,{tab:'historico'})` mostra um `kit.card` por compra (loja, data, total com `kit.money` ciente de `hidden`, linhas de artigos); vazio -> "Ainda sem compras registadas." `fixtures.demo()` ganhou uma compra (Continente, 63,20 EUR). Testes: demo mostra loja/total/artigos, empty avisa, hidden sem montantes (regex real, com dentes), ordem das pills.
2. HTML restante saiu de main.js (agora sem qualquer HTML): `Movimentos.draftBanner(ctx)` (também prefixado em `Movimentos.render`), `Movimentos.recovery(ctx)`, `Movimentos.discardDraft()`, `Movimentos.remove(ctx,{movementId})`; `Resumo.render` passa a incluir os banners (movimento, compromisso, pagamento, mesma ordem) e o atalho "Créditos e prestações"; `Resumo.financial(ctx,{period})` (em resumo.cjs e não em movimentos.cjs: precisa de `periodControls` e movimentos não pode importar resumo sem ciclo). main.js deixou de importar `Consult` e perdeu `draftBanner/recovery/financialConsultation/periodControls`. Testes de não-atirar com empty()/demo(), banners, e hidden em Eliminar e Consulta.
3. `screens/state.cjs` exporta `fullState(ctx)`; contas.cjs e ligacao.cjs usam-no.
- Armadilha apanhada: ao gerar os testes, `\d` perdeu a barra num template literal (`/d,d{2}s?€/`); detetado porque os testes falhavam com dados visíveis, corrigido para `/\d,\d{2}\s?€/`.
- Comandos: `node --test` suite Android completa -> 258 pass, 0 fail; `npm run build` OK. Teeth: com `kit.money` a ignorar `hidden` falham 11 testes (incluindo Histórico, Eliminar, Consulta). Preview 375 px (casa, resumo, movimentos x demo/vazio x claro/escuro: 24 páginas, scrollWidth máx. 375, consola limpa; Histórico conferido em escuro; 4 pills quebram para 2 linhas a 375 px).
- main.js: 516 -> 492 linhas, CRLF preservado (`git diff --stat`: main.js 32 linhas alteradas).
