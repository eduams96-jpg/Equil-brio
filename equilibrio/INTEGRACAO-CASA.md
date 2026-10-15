# Integração a partir do Casa v0.3.9

## Estado em v0.37.0

A área Casa passa a ter um Resumo operacional próprio, com dados reais do espaço: compras líquidas, orçamento, lista, stock, alertas, refeições, compras recentes e acesso direto às restantes páginas. A importação Casa+ está agora visível na navegação do módulo. Compras ligadas permitem abrir diretamente o movimento financeiro; compras não ligadas continuam a suportar criação ou associação de uma despesa existente. O Resumo financeiro geral mantém-se exclusivamente financeiro. Não há nova migração SQLite nem nova versão do documento Casa.

## Estado em v0.33.0

`casa-complete-model.js` valida as extensões do documento Casa 4: categorias por loja, contagens de embalagens e devoluções ligadas aos movimentos e saídas de stock. A primeira mutação promove o documento; leituras antigas continuam suportadas. SQLite e Desktop não mudam de schema. Os reembolsos antigos criados por Movimentos entram nas análises e no limite acumulado sem migração destrutiva.

O módulo também prepara sugestões semanais e previsões de consumo; confirmações são verificadas novamente antes de gravar. A interface mantém ações nos formulários e páginas existentes, com callbacks explícitos para redesenho após pesquisa ou mudança de semana. A bateria inclui simulação anual e interrupção de uma transação SQLite.

## Estado em v0.32.0

`casa-daily-model.js` reúne listas reutilizáveis, comparação por custo de embalagens, orçamento e análises. As extensões opcionais são validadas também na persistência SQLite através de `casa-life-model.js`; não há nova tabela ou migração de schema. `casa-daily-ui.js` integra os fluxos nas páginas existentes. Correções e associações financeiras passam pela cópia transacional de `CasaFinance.change`.

A importação antiga saiu da navegação principal. O foco atual é o uso diário, sem transferência de dados do Casa antigo. Ver `COMPARACAO-CASA.md` para as diferenças funcionais explícitas.

## Estado em v0.31.0

`casa-life-model.js` estende o documento Casa para versão 3 com movimentos de stock, receitas, planos, preços históricos e origens de importação. A quantidade de entrada de cada lote é imutável; a disponibilidade resulta da entrada mais os movimentos validados, sem permitir saldos negativos. A eliminação de compras com lotes já usados é impedida. Receitas alocam lotes por validade e excluem expirados; a confirmação confere a alocação e impede repetição de refeições.

`casa-import.js` prepara uma cópia independente do JSON 0.3.9 e uma impressão SHA-256 dos dados canónicos. Converte inventário, catálogo, compras históricas, lista, receitas, plano semanal e históricos de consumo/desperdício. Os talões importados não dão stock nem criam movimentos financeiros. O envelope original é preservado para reexportação. Duplicados ambíguos e incoerências são recusados; campos auxiliares não convertidos são mantidos no arquivo.

`casa-life-ui.js` apresenta os novos fluxos e garante backup antes de aplicar a importação. O destino é um novo espaço, ou Casa vazio no espaço atual; não existe merge automático de duas despensas. A gravação usa os mecanismos transacionais já existentes. As migrações SQLite e Desktop não mudaram.

Foi removido `casa-prototype.js` e substituídas as análises de demonstração. Os estilos Casa existentes continuam reutilizados. As secções abaixo documentam as etapas anteriores.

## Estado em v0.30.0

O documento Casa interno aceita versões 1 e 2; só uma escrita promove a versão 1 para 2. Acrescenta `catalog`, `stores` e `stock`, mantendo `purchases` e `shopping`. As quantidades usam até três casas decimais, em un/kg/L. Os preços são por embalagem e loja (`offers[storeId]`), com comparação por unidade. As categorias são etiquetas de texto reutilizáveis, ainda sem árvore autónoma de categorias.

`quote` prepara grupos por loja sem gravar. `checkout` exige a mesma proposta e uma identificação de confirmação, cria um talão por loja com valores históricos, lotes de entrada referenciados por compra/linha e movimentos opcionais; retira os artigos selecionados da lista. O serviço Desktop existente grava o documento e os movimentos na mesma transação. A fronteira SQLite valida também estas relações.

As regras de embalagens adaptam `shoppingPackagesNeeded`, `shoppingPurchasedQty`, `shoppingLineCost` e o agrupamento de `completePurchased` do Casa 0.3.9. A interface foi isolada em `casa-catalog-ui.js`, sem carregar os globais do programa original. Consumo, desperdício, localizações, validades, receitas, análises reais e importação ainda não estão ligados.

## Estado em v0.29.0

`casa-model.js` encapsula compras manuais e lista de compras; `casa-ui.js` liga-os à interface. O estado `casa` é opcional por espaço, com versão própria 1, arrays `purchases` e `shopping`, sem copiar os globais ou dados pessoais do Casa original. Cada compra guarda artigos, total, data, loja e, quando aplicável, `transactionId`; o movimento usa `source: 'Casa integrado'` e `sourceId` igual ao ID da compra.

O serviço Desktop existente grava a extensão Casa e o delta financeiro dentro da mesma transação SQLite. A validação também ocorre na persistência, incluindo restauro integral. O adaptador `integration/casa-contract.cjs` continua separado e não é usado para importar backups. Quantidades normalizadas, stock, catálogo e compras provenientes do Casa 0.3.9 ainda requerem adaptação própria.

As secções seguintes documentam a análise inicial da v0.28.2 e a origem do formato.

Origem: `Casa-v0.3.9.zip`, SHA-256 `df391840582ad5522a5de13bddfa58a43aaadd0edf32e0b2c5b8b13d510f27f2`.

## Compatibilidade verificada

O ZIP é código da aplicação, não uma exportação da base pessoal. Usa IndexedDB `CasaComprasInventarioDB`, versão 2, stores `state` e `backups`, chave `main`; localStorage conserva a camada histórica. Os 23 ficheiros JS são scripts clássicos com globais partilhadas.

Não podem ser incluídos diretamente no Finanças: ambos declaram `data`, helpers monetários e funções de desenho. A solução deve isolar o modelo Casa e encaminhar a persistência pelo serviço Desktop. Manter duas bases independentes dentro da aplicação introduziria divergências entre compras, movimentos e backups.

| Casa 0.3.9 | Responsabilidade na fusão |
|---|---|
| `receipts` | Compra concluída por loja, com ID estável e total |
| `history` | Linhas de compra e histórico; não criar movimentos por linha |
| `catalog` | Produtos, embalagens, preços por loja e histórico de preços |
| `items` | Stock, localização, embalagens e unidades soltas |
| `shopping` | Lista pendente e escolhas de loja |
| `stores` / `categories` | Catálogos Casa e categorias hierárquicas |
| `consumption` / `waste` | Consumo e desperdício |
| `recipes` / `planner` | Refeições e planeamento semanal |

## Primeira peça implementada

`integration/casa-contract.cjs` é uma fronteira pura, sem armazenamento:

- `inspectBackup` valida a forma do formato v0.3.9 e preserva campos adicionais numa cópia independente.
- `receiptSummary` confere data, loja, artigos e soma do total, arredondando ao cêntimo na fronteira financeira.
- `prepareMovement` cria uma proposta de despesa única, valida conta/categoria/mês e deteta uma ligação existente por `datasetId + receiptId`.
- Uma compra já ligada cujo valor/data tenha mudado exige reconciliação explícita. Repetir a preparação não gera outro movimento gravado.

O `datasetId` terá de ser criado e persistido uma vez por origem Casa na fase de ligação; não deve ser o nome da loja nem um valor novo em cada importação. Nenhum dado financeiro é alterado por estas funções.

## Trabalho seguinte, separado da estabilização

1. Isolar as regras de compra e encapsular o estado Casa, preservando preços por embalagem e unidades normalizadas.
2. Criar o serviço de compras no Desktop, com operação atómica de compra + ligação opcional ao movimento e respetiva reversão.
3. Ligar a interface Casa existente ao serviço, começando por Compras e Lista de compras.
4. Acrescentar produtos/stock, preços, supermercados, receitas e análises por fases, usando os testes do Casa como referências.
5. Só depois disponibilizar importação explícita de backup pessoal, com pré-visualização, cópia de segurança e verificação de totais.

Não estão implementados nesta versão o serviço de compras real, a persistência de ligações, a importação da base pessoal ou a atualização bidirecional compra/movimento. O adaptador foi testado com dados fictícios. Esta separação mantém a v0.28.2 utilizável como estabilização enquanto a fusão evolui.
