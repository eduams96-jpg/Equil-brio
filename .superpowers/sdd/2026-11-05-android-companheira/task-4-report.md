# Task 4 report: Resumo e Movimentos em screens/

Status: DONE_WITH_CONCERNS. Commit a399aa3.

## Implemented
- `screens/resumo.cjs`: `render(ctx, {period})`: título, selo de sincronização, controlos de período, saldo total, gastos/rendimentos do mês, resultado, 3 mosaicos (Avisos -> avisos, Agenda -> agenda, Lista de compras -> compras; «—» quando o contador é nulo/ausente; Agenda mostra pendentes do mês), botão novo movimento, últimos 5 movimentos (globais). Exporta também `periodControls`.
- `screens/movimentos.cjs`: `render(ctx, {filters, visibleLimit})`, `bind(ctx, root)` (pills de tipo e estado chamam `ctx.setFilter`), `row(ctx, t, accountName)`, `stateOf`, `MONTHS`. Pesquisa com `kit.search` (id `movement-search` mantido); período e conta continuam em `<select>` dentro de «Período e conta».
- main.js: importa os dois ecrãs; ctx ganhou `counts` (notices null, shopping = itens por fazer de `ledger.casa?.shopping` ou null), `pending`, `release`, `setFilter`; `row` e `periodControls` ficaram como wrappers finos (usados pelas páginas Conta, Agenda e Consulta); removidos `movementList`, o HTML do resumo e `monthNames`. O botão «Ver todos» do Resumo passa a limpar o período (a lista é global, já não só do mês).
- style.css: 1 regra (`.ch-tiles.is-three` faz o 3.º mosaico ocupar a largura toda).

## Ficou em main.js (e porquê)
- Detalhe do movimento, formulário novo/editar, rascunhos, `leaveDialog`, eliminação, revisão de conflitos: estão presos ao estado (`draft`, `draftRecord`, `selectedId`, `detailReturn`...) e à delegação global de cliques. Regra «não reescrever o formulário/rascunhos». Não movidos; só a lista/Resumo foram migrados.
- Eventos de período, «Ver todos», «Mostrar mais», limpar filtros, pesquisa e selects de período/conta continuam na delegação global. Só as pills usam `bind`.
- Os `selects` `filter-type`/`filter-status` já não existem; o mapeamento antigo em main.js fica inofensivo.

## TDD
- RED: `node --test src/screens/resumo.test.cjs src/screens/movimentos.test.cjs` -> `Cannot find module './movimentos.cjs'` / `'./resumo.cjs'`.
- GREEN: 10/10 (vazio, 3 `ch-tile` e <=5 `movement-row`, páginas dos mosaicos, «—» vs números, `counts` ausente, ocultar valores, filtro despesas = 3 linhas, pills, limite/«Mostrar mais»).
- Suite completa: 217 testes, 217 pass, 0 fail (207 anteriores + 10 novos). `npm run build` OK.
- Descoberta: o `state` das fixtures não tem `outbox`, e `V.statuses` atirava; `stateOf(ctx)` acrescenta `outbox: []`.

## Verificação visual (preview, 375x812)
Resumo e Movimentos, demo/vazio, claro/escuro: 8 páginas sem `.cs-error`, sem atributos `style`, `scrollWidth` 372 (<=375), consola sem erros. Capturas revistas: Resumo claro demo, Resumo vazio escuro, Movimentos demo escuro. Servidor parado, viewport reposto.

## Ficheiros
main.js (CRLF preservado, diff +10/-24), style.css, screens/resumo.cjs, movimentos.cjs e respetivos testes. `scripts/preview.cjs` já listava os dois ecrãs.

## Auto-revisão / preocupações
- `stats` e `total` em main.js `render` ficaram sem uso (inofensivo; deixados para não mexer mais).
- Os mosaicos mostram «—» no preview/fixtures porque `counts` é null; em runtime, Compras mostra o número real; Avisos fica «—» até à Task 11. Avisos e Compras abrem «Em breve».
- Desvio do brief: o detalhe e o formulário não saíram de main.js (ver acima).
- Não testei o fluxo real no Capacitor/emulador (só preview estático e testes); a ligação das pills (`bind` -> `setFilter` -> `run`) é verificada por leitura, sem teste automático de DOM.

## Fix round 1
- `movimentos.cjs` ganhou `detail(ctx, {movementId, returnPage})` (inclui divisão por categorias/ligações, antes `movementConsultation`), `form(ctx, {draft, draftRecord, resolvingId})` e `categorySuggestions` (movida). Funções puras; ids, names e data-* iguais. main.js só chama os construtores (`movementForm` ficou com a inicialização do rascunho; `detalhe` chama `Movimentos.detail`). Rascunhos, leaveDialog, conflitos, eliminação e delegação de eventos intactos.
- resumo.cjs: removido o try/catch à volta de `Agenda.agenda`.
- Código morto removido de main.js: `total`, `stats`, `movementConsultation`, `categorySuggestions`, entradas `filter-type`/`filter-status`. O wrapper `periodControls` mantém-se (Agenda e Consulta chamam-no).
- «Ver todos» no Resumo mostra todos os movimentos (aceite).
- Testes novos (4): detalhe (demo, ocultar valores, movimento em falta), formulário novo e de edição (com estado real via `P.offlineFixture` + `D.create`).
- Comandos: `npm run build` OK; suite completa `221 tests, 221 pass, 0 fail`; main.js continua CRLF (569/569), diff +35/-… apenas localizado.
- Preview: detalhe e formulário não são alcançáveis no preview estático (precisam de movimento/rascunho vivos), por isso não foram vistos visualmente; cobertos por testes.

## Fix round 2
- movimentos.test.cjs:70: regex corrigida para `/\d,\d{2}\s?€/` (tinha perdido as barras, nunca fazia match).
- Prova: com `detail()` a ignorar `hidden` (`kit.money(..., false)`), `node --test android/app/src/screens/movimentos.test.cjs` -> `pass 9 / fail 1` (falha «Detalhe com valores ocultos...»). Restaurado: `pass 10 / fail 0`. (Antes da correção, a mesma mutação passava 10/10, o que confirmava o teste vazio.)
