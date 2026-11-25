# Instalação e atualização — versão 1.0

O instalador NSIS instala o runtime x64 em Programas (x86), preservando appId pt.financaspessoais.desktop e o perfil Financas Pessoais. O código fica em resources/app, sem ASAR, para continuar a aceitar .fpupdate. Staging e rollback permanecem no perfil; só a substituição dos ficheiros protegidos pede elevação. Recuperação interrompida ocorre antes de abrir SQLite. A aplicação normal não corre como administrador.

# Arquitetura atual — v0.41.3

## Contratos de dados

Na .40 readSpace abre uma transação de leitura para todos os domínios; dentro de uma transação existente reutiliza esse contexto. A ponte prepara e normaliza o snapshot completo antes de substituir o estado em memória. Uma escrita durável cuja releitura falhe bloqueia novas escritas até reabrir, evitando reenviar o comando confirmado.

FormSession mantém revisão, ocupação e impressão dos campos do formulário. Captura FormData antes de desativar os controlos; os assistentes CSV reutilizam esse snapshot na confirmação. Uma ação assíncrona que abre outro formulário não o fecha ao terminar. A proteção contra saída preserva rascunhos em utilização normal, sem persistência automática após término forçado.

SQLite no perfil Windows é a fonte de verdade. desktop/storage-sqlite.cjs mantém contas, movimentos e os domínios normalizados; os restantes campos dos espaços, incluindo receiptRules, Casa, texto de faturas e ícones, fazem parte da mesma transação. Texto dos comprovativos pertence ao movimento (receiptText) ou à compra Casa (receiptText). localStorage, app_state e browser-state.json são espelhos de compatibilidade; não substituem uma leitura crítica que falhou.

data-service.cjs centraliza comandos; main.cjs valida IPC e preload.cjs limita a ponte. workspace.js executa commit com proteção contra dados desatualizados, validação e releitura crítica. Gravações normais usam deltas; restauro/catalogação completa são operações explícitas. As migrações históricas continuam disponíveis para versões antigas e não são reaplicadas como reparação automática.

finance.js mantém openingBalance + ledger = saldo calculado, em cêntimos. balance é uma projeção. Transferências não são receitas/despesas; não se cria dinheiro para preencher divergências. Conferência, ajuste e fecho têm comandos explícitos e auditáveis. Biblioteca, sugestões, pesquisa, navegação e stock não debitam contas.

## Faturas e sugestões

Datas/totais contraditórios são deixados por confirmar; linhas negativas e descontos não reconhecidos geram avisos. A Casa conserva a categoria do artigo confirmada na compra e não assume a data de hoje quando a fatura não tem data inequívoca.

receipt-reader.js lê imagem/PDF localmente. receipt-model.js separa parse, review e apply. Somar linhas ao total é obrigatório; associar um comprovativo mantém valor, conta e data da despesa existente. Meses fechados ficam protegidos. Texto até 200000 caracteres, artigos até 200 por fatura, sugestões até 2000 por espaço.

receiptRules memoriza um nome/alias exato, loja ou âmbito global, categoria ou produto Casa, exceções e estado. A normalização tolera acentos e pontuação, sem correspondência aproximada. Uma associação local prevalece sobre a global; conflitos são apresentados, nunca resolvidos implicitamente. Produtos arquivados/ausentes não são sugeridos. Memorizar acontece apenas após confirmação da fatura; aplicar uma sugestão exige clique e revisão. Atualizar a associação preserva as exceções existentes. Nenhum movimento antigo é reclassificado.

life-model.js pesquisa metadados, artigos, categorias e texto dos comprovativos. O índice é local e transitório; o ficheiro binário não é repetidamente descodificado na pesquisa. Comprovativos antigos podem ser lidos e o texto confirmado em separado; isso não altera montantes/categorias. A Casa conserva e pesquisa o texto das faturas confirmadas.

## Donos da interface

| Área | Dono dos dados/operação | Apresentação |
|---|---|---|
| Núcleo / movimentos | finance.js e workspace.js | workspace.js, apresentação comum em interface-ui.js |
| Faturas financeiras | receipt-model.js | receipt-ui.js e receipt-assistance-ui.js |
| Casa | casa-model.js e modelos Casa especializados | casa-render-ui.js por página; workbench-ui.js para lista/inspetor |
| Páginas unificadas | modelos financeiros existentes | unified-workspace-ui.js |
| Ajuda / ícones / cálculo transitório | funções puras dos modelos | interface-ui.js |

ui-lifecycle.js coordena os donos finais por ID e prioridade, com preparação, pós-render e limpeza garantida em finally. Um ID repetido é rejeitado. Workbench, Interface, Unified e assistência de faturas registam os seus hooks; deixam de encadear wrappers finais. A fronteira de compatibilidade conserva renderers históricos dos domínios. Essa fronteira ainda existe: não foi feita uma reescrita integral do frontend.

A preparação Unified estaciona fontes antes dos renderers anteriores e impede recomposição intermédia. Workbench repõe fontes antes de refazer listas. A recomposição pesada deixa de ocorrer novamente por cada navigate/WealthAnalysisV3.render. Uma alteração do seletor de preços Casa redesenha a lista de forma síncrona e cancela o refresh já agendado. Eventos da assistência de faturas são delegados uma única vez, sem acumulação por abertura de formulário.

ui-styles/*.css são as fontes de estilos por domínio. build-styles.cjs gera ui.css com ordens únicas; não editar o bundle diretamente. Os estilos novos de faturas ficam em receipt-assistance.css. Nem todo override histórico foi apagado: apenas código comprovadamente redundante/morto pode ser eliminado com evidência.

Cache de modelos só dura o ciclo síncrono. categoryList conta movimentos/ancestrais numa passagem, sem contar duas parcelas do mesmo movimento duas vezes. Não existe cache duradoura de saldos. Listas de movimentos continuam paginadas a 50; rascunhos de importação e seleções ficam separados do ledger.

Na .40 navigate partilha esses caches apenas durante a navegação síncrona e chama navigateCore. Finance e Casa constroem índices locais para devoluções e referências, sem guardar índices entre mutações. estimatedForecast agrega despesas variáveis numa passagem e copia apenas a lista de pendências. scheduleMatching limita a correspondência textual aos meses das pendências. summaryCalculation consulta os registos do total mensal em páginas de 50 e abre o movimento exato sem modificar os filtros.

## Cópias, restauro e atualização

snapshotSpaces fixa todos os espaços numa transação. createConsistentBackup gera snapshot SQLite e verifica integridade. Backup JSON/encriptado usa dados da base; restauro valida o documento antes de substituir dados. A .78 acrescenta ensaios de regras/texto nesses percursos.

manual-updater valida integridade, compatibilidade e caminhos; prepara staging/rollback e aplica após fechar. Assinatura opcional e validada quando presente. SHA-256 verifica corrupção; não autentica o autor de pacotes sem assinatura. O pacote cumulativo suporta 0.39.52–0.41.0; a .51 passa primeiro pela .52.

## Verificação e histórico

node scripts/validate-release.cjs é a entrada das 33 suites, incluindo regressão, Electron/SQLite, navegador, OCR/PDF, Casa, responsividade e performance. integration/validate-incremental-package.cjs verifica instalação e rollback nas baselines escolhidas. Relatórios em validacao e na entrega.

A narrativa anterior foi preservada em ../historico/documentacao/ARQUITETURA-ate-v0.39.77.md. O presente documento descreve os contratos atuais, não um histórico cumulativo.

## Consulta de registos e navegação

workspace.js centraliza openMovement: consulta exata com os comandos existentes, independente dos filtros e sem mudar o período. Casa e comprovativos usam o mesmo percurso. LifeUI.openDocument seleciona o comprovativo e remove apenas os filtros da biblioteca que poderiam escondê-lo. UnifiedWorkspaceUI.openRecord seleciona a entidade nas mesas unificadas e verifica a sua existência no espaço atual. A pesquisa verifica o espaço em que os resultados foram obtidos antes de abrir; consultas não chamam commit.

life-model.js intercala tipos de resultado, com limite total de 100, para que milhares de movimentos não escondam as contas e os planos. Pesquisa texto/artigos sem descodificar o binário. Os modelos financeiros, importação, reconciliação e regras de gravação permanecem os mesmos.


## Contratos reforçados na .80

finance.js aplica a liquidação ligada em correção e restauro, protegendo pagamentos de intervenções. features-model.js prepara edição/desfazer/restauro em cópia e só substitui o estado após validação. complete-model.js enumera referências atuais de categorias entre domínios. reconciliation-model.js deriva a conferência do extrato e das datas efetivas. practical-model.js cancela planos ainda não pagos numa única operação. Nenhuma destas operações corrige dados em background.

## Produtividade e recuperação na .41

productivity-model.js contém cálculos puros para ajustes de faturas, comparação de saldos, elegibilidade de lotes, conversão de unidades e histórico de preços. Os índices de períodos e saldos existem apenas no ciclo de render e respeitam devoluções, parcelas e datas efetivas das transferências. Não substituem SQLite nem guardam saldos calculados entre operações.

draft-ui.js guarda os formulários suportados e a revisão de importações por espaço. desktop/drafts.cjs escreve num ficheiro separado em form-drafts, com temporário sincronizado e última cópia válida. A leitura verifica o formato e o espaço. Os rascunhos não fazem parte do ledger nem dos backups financeiros; transportar rascunhos exige conservar o perfil local. No navegador utiliza-se armazenamento local, sujeito à quota disponível. Só o último rascunho concluído de cada espaço é conservado.

Identificadores reservados permitem detetar uma confirmação já gravada antes da limpeza do rascunho, evitando repetir movimentos, compras Casa ou lotes preparados. Recuperar uma edição cuja origem mudou exige revisão explícita. A revisão de um lote só é recuperada se o lote continuar igual. As confirmações de faturas são novamente pedidas.

productivity-ui.js apresenta cenários temporários e contributos para saldos, património e reservas sem gravar alterações. A correção de uma importação MMEX com o mesmo identificador compara campos e atualiza o registo existente apenas após confirmação; registos protegidos mantêm o percurso de edição próprio. Lotes mostram os registos excluídos e exigem confirmação antes de agir apenas nos elegíveis. Ajustes de faturas preservam o texto original e o histórico dos valores distribuídos, com total em cêntimos verificado antes de confirmar.

## Restauro na .41.1

LifeUI.restoreCopy é o percurso comum de restauro individual e multiespaço. Seleciona uma origem e um destino explícito; o padrão substitui o espaço atual através de commitSpaceCatalog, numa transação SQLite, preservando catálogo/nome e outros espaços. Compara o estado autoritativo com a pré-visualização, exige confirmação e guarda proteção anterior. O desktop usa migration:apply e snapshot consistente; o navegador conserva o ledger anterior numa chave separada. Rascunhos anteriores do espaço substituído são removidos. importSpaces mantém a recuperação como espaços novos apenas quando escolhida.

## Relatórios — Mesa de análise

reports-model.js calcula projeções de leitura sobre Finance.expenseEntries e balanceAt; conserva o ledger completo para resolver reembolsos de compras fora do filtro. Soma em cêntimos; transferências/ajustes não são rendimentos/despesas e o capital dos créditos segue o contrato existente. reports-ui.js gere filtros transitórios por espaço, detalhe paginado e exportação HTML com o mesmo âmbito. Categorias e meses abrem parcelas/movimentos exatos. O relatório anual de LifeFinance mantém acontecimentos e análises adicionais num grupo recolhido, explicitamente sobre todas as contas. O ano selecionado é partilhado. Nenhum destes cálculos grava o ledger.

Estilos específicos em ui-styles/reports.css, compilados para ui.css. Ligações de ciclo de vida usam UILifecycle, sem substituição de renderizadores globais.

## Passagem entre espaços e cópias — .41.3

space-transfer-model.js prepara cópias puras dos dois espaços. Fecha o conjunto de referências em ambas as direções: compra/reembolso, crédito/prestações, recorrência/histórico e domínios Casa/práticos. Preserva identificadores e comprovativos; mapeia as contas explicitamente. Colisões, transferências pendentes, reconciliação e meses fechados bloqueiam a operação. Categorias equivalentes por nome e conteúdo podem ter IDs locais distintos; definições incompatíveis exigem resolução explícita. Uma conta selecionada na autonomia exige desassociação prévia.

life-ui.js compara os snapshots apresentados com a leitura atual. commitSpaceCatalog envia todas as versões esperadas ao canal replace-guarded-sync. storage-sqlite.cjs verifica o catálogo e os espaços dentro de BEGIN IMMEDIATE, antes de substituir qualquer domínio. Conflito ou falha faz ROLLBACK dos dois espaços e restaura o espelho da janela. O histórico guarda o mesmo batchId nas duas pontas. O desktop faz backup SQLite antes da passagem; no navegador conserva snapshots locais anteriores. O botão Recuperar cópia anterior abre a lista de proteções locais/configuradas e só prepara o restauro, sem o aplicar.

backup-info.js identifica cópias com UUID, data, versão, origem e nome opcional do PC. Cópias nativas reconstruem os dados exclusivamente do SQLite; do renderer aproveitam apenas o nome do PC, limitado a 80 caracteres, e as cópias automáticas sem snapshot usam a preferência local persistida. Restauro mostra origem e data e substitui integralmente o espaço escolhido. Isto é uma troca manual de cópias: não é sincronização nem fusão automática de edições simultâneas.

O importador e o assistente MMEX foram retirados. Campos históricos mmexId/mmexBalanceAfter continuam apenas para preservar migrações, referências e proteção contra duplicados dos dados já guardados. O parser antigo está fora do programa, no histórico, e os testes históricos usam a baseline congelada .41.2.

Relatórios calculam saldos de todas as contas numa passagem pelo ledger. O relatório anual completo deixa de ser recalculado quando se abre outra página. Índices e caches continuam transitórios; nenhuma otimização escreve saldos ou altera o núcleo financeiro.

## Endurecimento transversal e sincronização — .42

O renderer protege a interface com política CSP explícita em `index.html`, escaping uniforme nos ajudantes de formulário (`select`, `field`, `dateStepperField`, `button`, `empty`, `metric`), validação de protocolo HTTP(S) na abertura de anexos e links externos, verificação estrita de imagens personalizadas em `ProviderIcons.resolve` e isolamento por `sandbox="allow-same-origin"` com `referrerPolicy="no-referrer"` nas pré-visualizações de PDF em iframe.

Painéis pesados fora da vista ativa usam renderização diferida com marcas de atualização pendente e só reconstroem o DOM ao entrar na respetiva rota (respeitando os portais de `UnifiedWorkspaceUI`). Campos de pesquisa incremental atualizam apenas os contentores de resultados para preservar composição IME e cursor no Windows. O observador de valores sensíveis ignora subárvores `.view:not(.active)` e reexamina apenas a vista ativa ao navegar ou alternar privacidade.

No armazenamento nativo e em cópias verificadas, `verified-backup.cjs` serializa escritas atómicas por destino em `writeVerifiedAtomic`. Na partilha em rede (`mobile-sync/server/service.cjs`), rotas autenticadas validam o token (`timingSafeEqual` com verificação de comprimento) antes de qualquer `refresh()` de estado, enquanto `/api/v1/info` mantém descoberta de novos espaços e `pairing.cjs` limpa códigos expirados não reclamados.
