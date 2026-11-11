# Retomar o Equilíbrio

Estado em 11/11/2026. Lê isto primeiro quando voltares a pegar no projeto.

## Onde ficou

- **Windows 1.0.23** pronto em `entrega-v1.0.23/` (atualização `.fpupdate`, hash e instruções). Aceita as instalações 1.0.20, 1.0.21 e 1.0.22 e inclui tudo o que estas traziam. Validado com instalação incremental e reposição automática numa cópia isolada, a partir das três.
- **1.0.23:** Refeições com seis tipos (`CasaLife.meals`); receitas com unidade por ingrediente (`qty` continua na unidade do produto, `unit` é a unidade em que foi escrita; `CasaLife.ingredientQty`); Lista de compras com «Escolher do catálogo»; redesenho leve ao gravar nas páginas da Casa (`render({light})` em `workspace.js`, `UILifecycle.renderLight`, `CasaRenderUI.lightView`; o redesenho completo corre ao sair da Casa); Análises com um só controlo de mês; Consumos com Vazio/Ponta/Cheio (três contadores «Contador · Vazio», gravados juntos por `saveUtilityReadings`) e sem gás na interface. Estilos em `ui-styles/round-122.css`. **Falta instalar neste PC.**
- **Instalado neste PC:** 1.0.20 (instaladas e revistas a 1.0.17 a 1.0.20).
- **1.0.22:** o PC central aceita as alterações à lista de compras da app Android 1.0.0 (`mobile-sync/shared/house.cjs`: `set-done`, `add`, `queue`, `update`); `wealth-model.js` e períodos mensais em `reports-model.js`. Sem mudanças visíveis. **Falta instalar neste PC**, antes de usar a Lista de compras no telemóvel.
- **1.0.21** (incluída na 1.0.22): Ler Fatura retirado; Património redesenhado; `workbench-ui.js` e 136 regras de CSS mortas removidos; navegação sem rotas duplicadas.
- **Android 1.0.1** em `entrega-android-1.0.1/` (APK assinado com a mesma chave, versão interna 6): igual à 1.0.0 mas com as regras da 1.0.23 (tipos de refeição). A 1.0.0 não deve ser usada com o PC na 1.0.23. 343 testes Android a passar. Próximo: instalar no telemóvel depois de o PC central estar na 1.0.23.
- **Código:** tudo gravado no `main`. Não enviado para o GitHub.
- **Testes:** 703 a passar (`npm test` em `equilibrio/`).
- **`historico/`:** baselines 1.0.16 a 1.0.23 em `historico/baselines/`. As entregas até 1.0.14 e a baseline 0.39.79 perderam-se em 30/10/2026.

## Próximos passos, por ordem

1. **Instalar a 1.0.23** (`entrega-v1.0.23/`) no PC central e rever o que o `LEIA-ME.md` indica (receita do pequeno-almoço com unidades, Refeições, Lista de compras, Análises, Consumos; Património se vier da 1.0.20). Depois instalar a Android 1.0.1 no telemóvel e experimentar a Lista de compras (marcar, acrescentar, conferir) com sincronização.
2. **Arrumar categorias da conta Casa** (o utilizador confirma mais tarde, tal como os possíveis duplicados Portagens 3,25 € e Condomínio 38,75 €). Gestão de categorias → «Arrumar repetidas»: 11 sugestões prováveis já marcadas; acrescentar à mão «Mercearia» → «Alimentação / Mercearias». Outras sugeridas ao utilizador: corrigir «Lanços»/«Cirúgica»/«Dispensa»/«Outros Despesas», Bagaço e Licor Beirão → Bebidas / Espirituosa, Saúde / Taxas Moderadoras → Cuidados de Saúde, Subscrições → Lazer / Subscrições. Também há lojas combinadas («Continente // LIDL…») a desfazer.
3. **Consolidação visual:** concluída na 1.0.21. Ainda há camadas antigas em `features-ui.js` (cria os hubs de Património e os separadores antigos, que o `unified-workspace-ui.js` substitui) e regras de CSS mistas; só compensa mexer se o programa continuar a evoluir.
4. **Desempenho, se ainda for lento:** os módulos `planning-ui`, `life-ui`, `daily-ui` e `features-ui` ainda desenham todas as suas secções em cada gravação. Medir com o painel do browser visível (escondido, as medições variam 3×).
5. **Ler Fatura** — retirado na 1.0.21 a pedido do utilizador. Ficaram: o motor local de texto (`receipt-reader.js`, `receipt-image.js`), usado pela pesquisa em PDFs e comprovativos; a validação e a pesquisa dos dados já lidos (`receipt-model.js`); a janela «Produtos» dos movimentos antigos (`receipt-ui.js`); «Ler texto para pesquisa» em Dados → Documentos (`receipt-assistance-ui.js`). As antigas sugestões de artigos (`receiptRules`) continuam guardadas, sem uso.
6. **Pendentes que dependem de ti** (da 1.0.15): piloto físico da partilha (`PILOTO-FINAL.md`); guardar fora deste PC a chave de assinatura Android (`RECUPERACAO-DA-ASSINATURA.md`).

## O que foi feito na 1.0.20

- Revisão geral: quadros colados e molduras duplas corrigidos (Revisão, Dados, Agenda, Avisos, Movimentos, Inventário); menus `<details>` fecham ao escolher/clicar fora/Esc (`workspace.js`); Movimentos respeita o tema claro (a paleta escura fixa vinha de `movements.css`); Casa sem botão `#addTransaction` duplicado; Refeições sem receitas com aviso.
- Dados da conta Casa por confirmar pelo utilizador: possíveis duplicados Portagens 3,25 € (08/05) e Condomínio 38,75 € (02/07); uma diferença de extrato por explicar.
- Regra antiga `body.equilibrio-studio #mainContent :is(.primary,.secondary)` ganha a seletores `#página [atributo]`: para estilizar botões `.secondary` usar `body #mainContent #página ….secondary`.

## O que foi feito na 1.0.19

- Revisão e análise (`unified-workspace-ui.js` `review`): fecho em três passos com anel de progresso, contas em cartões, categorias com cores; separador de comparações restilizado (`#analysisComparisons`, `#reviewMonthHub`).
- Relatórios → Mês a mês (`reports-ui.js` `trendView`): cor por categoria, barras empilhadas e mapa de calor por linha.
- Casa: Visão geral (`casa-home-ui.js`), Lista de compras (`casa-shopping-ui.js`), Compras (`casa-ui.js`), Despensa, Receitas e Refeições (`casa-life-ui.js`), Análises (`casa-daily-ui.js` `analytics`). Todas fora das tabelas do `workbench-ui.js` (lista `cardPages`).
- Avisos (`dossiers-ui.js` `renderNoticesHub`), Dados (`dataPage`) e Definições (`settings`) em `unified-workspace-ui.js`.
- Movimentos (`workspace.js` `movementActionsHtml`): ações secundárias no menu «•••»; a lista passa para o `<body>` enquanto aberta (`.movement-menu-portal`). Não dar foco ao primeiro item: provoca um novo desenho da linha e fecha o menu.
- Peças comuns `.ch-tile`, `.cs-pills`, `.cs-search` e ícones novos em `InterfaceUI.icon`. Estilos em `ui-styles/round-120.css`.

## O que foi feito na 1.0.18

- Desempenho: conferência do extrato só desenhada com a página aberta e com índice único (`CompleteFinance.matchIndex`); `Finance.upcoming` indexado (~4×); memória de um desenho `Finance.renderCache` (aberta em `render`/`navigate`, limpa em `commit`).
- Relatórios (`reports-ui.js`, `ReportAnalysis.detail`): Categorias com subcategorias, Mês a mês, Comparar anos, Onde gastas, Receitas, Contas.
- Planos e decisões (`unified-workspace-ui.js`, raiz `#plansBoard`), Agenda (`daily-ui.js` `renderAgenda`), Equipamentos (`practical-ui.js`), Produtos/Lojas (`casa-catalog-ui.js`) e Preços com tabela editável (`casa-life-ui.js`). Estas páginas saíram das conversões em tabela do `workbench-ui.js`.
- «Arrumar repetidas» (`CompleteFinance.categoryCleanupSuggestions`, `cleanupCategories`, `moveCategoryTree`; diálogo em `daily-ui.js`).
- Estilos novos em `ui-styles/round-119.css`. Valores em `.sensitive-value` precisam de `font-size:inherit` dentro de números grandes.

## O que foi feito na 1.0.17

- Ecrã inicial com as opções lado a lado; Revisão e análise sem a Revisão semanal.
- Agenda: cartão do dia e Subscrições à altura do calendário, com scroll; o menu de ações abre por cima da página (`workspace.js`, portal `.agenda31-menu-portal`).
- Em cartões: Planos e decisões, Inventário, Habitação e Veículos (`dossiers-ui.js`, classes `dossier2-*`), Rotinas.
- Catálogo: menor preço destacado, filtros, eliminar produtos sem histórico, produtos sem categoria (`CasaFinance.clearProductCategories`).

## Como trabalhar no código

Dentro de `equilibrio/` (Windows, Node.js 24):

```bash
npm test
```

```bash
npm run styles:build
```

```bash
npm run desktop
```

- **CSS:** editar só `ui-styles/*.css` (cada regra precisa de um comentário `/* @order N */` único) e depois `npm run styles:build`; `ui.css` é gerado. As alterações da 1.0.17 estão em `ui-styles/round-118.css`, as da 1.0.18 em `round-119.css` e as da 1.0.19 e 1.0.20 em `round-120.css`. Um ficheiro novo em `ui-styles/` tem de ser acrescentado à lista em `tests/frontend-03953.cjs`.
- **Pré-visualização no browser:** `node serve.cjs` e abrir `http://localhost:4173` (modo demonstração, sem SQLite).
- **Quebras de linha:** muitos ficheiros são CRLF. `sed -i` no Git Bash e `scripts/advance-version.cjs` convertem para LF e geram diffs gigantes — confirmar com `git diff --stat` antes de fazer commit.
- **Regras partilhadas com o telemóvel:** a app Android leva no bundle `casa-life-model.js`, `casa-model.js`, `dossiers-model.js`, `reports-model.js` e `wealth-model.js`. Se a validação destes modelos passar a aceitar dados novos (como os tipos de refeição), é preciso recompilar e entregar a app.
- **Armadilhas encontradas:** vários scripts movem e escondem elementos de outros scripts (`workbench-ui.js`, `approved-visual-ui.js`); seletores globais como `document.querySelectorAll('[data-...]')` apanham botões de outras páginas — limitar sempre ao formulário. Há regras antigas com `!important` e seletores fortes (ex.: `#plansHub #unifiedPlans>.u-plans-list`); as novas usam seletores igualmente específicos. Os painéis com `container-type` cortam menus absolutos e fixos.

## Gerar a próxima atualização

1. `node scripts/advance-version.cjs 1.0.24 "Descrição"` (repor CRLF em `package.json`, `package-lock.json`, `desktop/version.cjs`).
2. Criar `DESKTOP-v1.0.24.md` e uma entrada no topo de `ATUALIZACOES.md`; correr `node scripts/check.cjs` e `npm test`.
3. Gerar a partir da versão instalada mais antiga a suportar (ex.: baseline 1.0.20, aceitando até 1.0.23; validar a partir de cada baseline aceite):
   ```bash
   node scripts/package-release.cjs ../historico/baselines/baseline-1.0.20 ../entrega-v1.0.24 1.0.23
   ```
4. Validar (instala numa cópia e testa a reposição):
   ```bash
   ELECTRON_PATH="$PWD/node_modules/electron/dist/electron.exe" node integration/validate-incremental-package.cjs ../historico/baselines/baseline-1.0.20 ../entrega-v1.0.24
   ```
5. Guardar a baseline nova: `node scripts/advance-version.cjs --snapshot`.

## Dados pessoais

Ficam em `%APPDATA%\Financas Pessoais\financas.db`, fora do projeto e do Git. Para testar com dados reais, trabalhar sempre sobre uma cópia.

## Fora de âmbito (decidido)

Novas funcionalidades e reorganização da arquitetura (CSS de ~950 KB em camadas, ~40 mil elementos carregados, scripts que alteram ecrãs uns dos outros). Só compensa se o projeto continuar a evoluir a longo prazo.
