# Estado do projeto Equilíbrio

> O «cérebro» do projeto. É atualizado no fim de cada ronda de trabalho.
> Última atualização: **16/11/2026**.

## Versões

| | Versão | Onde | Estado |
|---|---|---|---|
| Windows (PC central) | **1.0.25** instalada · **1.0.26** pronta (pacote `.fpupdate`, baseline 1.0.20) | `entrega-v1.0.26/` | ⏳ Instalar a 1.0.26 |
| Android | **1.0.1** | `entrega-android-1.0.1/` | ✅ Instalada |
| Código por publicar | — | `main` (local) | Nada: tudo está na 1.0.25 |
| GitHub | — | — | ⏳ Só no fim de tudo |

## Para fechar de vez

| # | Tarefa | Quem | Estado |
|---|---|---|---|
| 1 | Instalar a 1.0.24 no PC | Utilizador | ✅ |
| 2 | Instalar a Android 1.0.1 | Utilizador | ✅ |
| 3 | Testar a sincronização (marcar, acrescentar e conferir no telemóvel → PC; totais de Património e Relatórios iguais) | Utilizador | ❌ Não funcionou (16/11) |
| 4 | Acertar dados: banana em «un», distância das lojas, €/km | Utilizador | ✅ |
| 5 | Copiar a chave Android para uma pen | Utilizador | ✅ |
| 6 | Duplicados da conta Casa | Utilizador | ✅ Condomínio correto; Portagens removido |
| 7 | Arrumar a base de dados: na 1.0.25, Gestão de categorias → «Correções sugeridas» → Aplicar (Casa 15, Eduardo 1) | Utilizador | ✅ Aplicadas; as pendentes para remover → botão «Descartar todas as pendentes» (código feito e testado; sai numa nova versão) |
| 8 | Instalar a 1.0.25 e criar a semana-tipo nas Refeições | Utilizador | ✅ |
| 10 | Sincronização PC ↔ telemóvel: Tailscale e mesma rede não funcionaram | Claude + Utilizador | ⏳ Decidir alternativa (ver Decisões) |
| 11 | Disco externo: pôr fim (12/2026) na recorrência de 92,50 € | Utilizador | ✅ |
| 12 | Corrigir à mão as 8 descrições «Outros» e 2 «Produtos» (conta Casa) | Utilizador | ⏳ Depois (utilizador) |
| 9 | Enviar para o GitHub | Claude | ⏳ No fim |

## Funcionalidades recentes

- **1.0.26 (`entrega-v1.0.26/`):** «Descartar todas as pendentes» nas Correções sugeridas. Validação dos pacotes OK (39 ficheiros, SHA-256). Validação completa (`validate-release`, 16/11): **falhou em 16 suites de interface (browser, frontend, roadmap, practical, startup, experience, month-review, approved-visual, visual-system, essential, unified, global, casa-performance, closure, restoration, reports)**. Quatro delas (reports, essential, global, visual-system) também falham no código de 1.0.25 (`4dcc879`) nesta máquina: não são regressões desta ronda, mas o portão de release continua por passar. Relatório em `equilibrio/validacao/release-1026/`. Diagnóstico: a maioria são testes de interface antigos (seletores de ecrãs já redesenhados ou removidos, p.ex. `desk-record-button`, `equipment-form`, `u-plan-context`); `casa-performance` precisa da baseline 0.39.79, que se perdeu em 30/10/2026; `startup` e `restoration` ainda não analisados. Correção = reescrever os testes, decisão pendente.
- **1.0.25 (`entrega-v1.0.25/`):**
  - Gestão de categorias → «Correções sugeridas»: a revisão de 12/11 aplicada com confirmação (`CompleteFinance.suggestedCorrections / applyCorrections`, reconhecidas pelo conteúdo, desaparecem depois de aplicadas).
  - Refeições → «Repetir esta semana todas as semanas» (semana-tipo).
  - As refeições da semana-tipo aparecem marcadas em todas as semanas seguintes. Editar ou preparar uma delas cria o plano só para esse dia. ✕ salta esse dia.
  - Os ingredientes da semana contam com elas.
  - Detalhes técnicos: `casa.weekTemplate = {since, slots[{weekday, meal, recipeId, servings}], skips["data|refeição"]}`; `CasaLife.weekPlans / saveTemplate / clearTemplate / skipTemplate`.
- **1.0.24:**
  - As receitas aceitam qualquer unidade, com equivalência (`per`).
  - «Comparar lojas» soma a deslocação (`store.distanceKm` × `casa.travelCostPerKm`).
  - Os seletores deixaram de abrir com fundo branco no modo escuro.
- **1.0.23:** seis tipos de refeição; unidades por ingrediente; Consumos com Vazio, Ponta e Cheio.

## Decisões tomadas

- O plano de refeições usa uma semana fixa, que se ajusta quando for preciso.
- Os custos de deslocação contam por km (0,20 €/km por omissão).
- Só se envia para o GitHub quando tudo estiver terminado.
- Condomínio 38,75 € a 02/07: não é duplicado (junho não foi pago).
- Aplicar todas as correções da análise de dados (12/11). As compras de supermercado já divididas por artigos ficam como estão.
- Disco externo: são duas prestações reais. A de 92,50 € acaba em dezembro de 2026 e a de 32,50 € em janeiro de 2027. ⏳ O utilizador tem de pôr o fim (12/2026) na recorrência de 92,50 € em Planeamento → Recorrências.
- Incidente de 16/11 (~11:03): durante a movimentação de `work/`, ficaram vazios `historico/baselines`, `historico/documentacao`, `equilibrio/vendor-receipts` e `equilibrio/node_modules`. Causa não confirmada (suspeita: robocopy /MOVE sobre pastas de `work/`). Restaurado: ficheiros do Git repostos com `git checkout`; `node_modules` reinstalado com `npm ci --ignore-scripts` (o binário do Electron não foi descarregado; `npm run desktop` precisa de `npm install` completo). Testes: 712 a passar.
- Limpeza de 16/11: pastas antigas (`work/`, `coordenacao/`, `audit/`, `.superpowers/`, entregas 1.0.15–1.0.24 e android 1.0.0) movidas para `D:\CODEX\arquivo-antigo-2026-11-16\` (fora do projeto; não apagadas). Ficaram 3 ficheiros de fixtures em `work/` (ACL só de leitura, idênticos ao arquivo) que o Windows não deixou apagar. Zips de segurança em `D:\CODEX\`: código e entregas atuais.
- Revisão de 16/11 (demonstração, navegador): 22 ecrãs abertos sem erros; ~70 botões de formulário/painel abertos sem erros; corrigido erro nas teclas (`07e96c6`). Não testados: botões que gravam, apagam ou fecham meses (só com dados reais e cópia). Código: ~26 mil linhas em `equilibrio/*.js`; ficheiros grandes (`workspace.js` 4770 linhas) são candidatos a dividir mais tarde.
- Sincronização sem Tailscale nem rede local (16/11): o Google Drive é uma alternativa manual possível, mas copiar a base para os dois lados pode criar conflitos e perder alterações. Só uma cópia de cada vez, sempre a mais recente; a decidir. Alternativas a avaliar: Drive, pen USB ou cabo.
- Correções pendentes (16/11): novo `correctionsDismissed` na base de dados e «Descartar todas as pendentes» na janela de Correções sugeridas. Não altera movimentos nem categorias. Testes: 712 a passar. Ainda não está numa versão instalável.
- Descrições vagas: 8 movimentos «Outros» e 2 «Produtos» na conta Casa (abril a novembro de 2026), a corrigir à mão. «Normal» é o nome da loja, por isso está bem.

## Notas técnicas

- **Testes:** 712 a passar (`npm test` em `equilibrio/`).
- **Release:** `node scripts/advance-version.cjs X.Y.Z "título"` → `node scripts/finalize-release.cjs ../historico/baselines/baseline-1.0.20 ../entrega-vX.Y.Z <versão anterior> --packages-only` → `node scripts/advance-version.cjs --snapshot`. A validação completa passa dos 15 minutos.
- **Chave Android:** `%USERPROFILE%\.codex\private\equilibrio\android-release\` (`.p12` + `password.dpapi`, que só abre neste Windows). Cópia externa: `android/scripts/backup-signing-key.ps1` (PowerShell 7). JDK em `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`.
- **Análise de dados:** sempre numa cópia (`VACUUM INTO`) da `%APPDATA%\Financas Pessoais\financas.db`; nunca na base real.
- Mais contexto histórico em `RETOMAR.md`.
