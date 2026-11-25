# 1.0.43 · Revisão profunda e endurecimento

Auditoria completa ao projeto Windows, partilha em rede e Android, empacotada na **1.0.43** (`D:\Equilibrio\Entrega-v1.0.43-20261124`):

- **Instalador e higiene:** resgate e correção de [build/Setup1042.cs](build/Setup1042.cs) e [build/build-setup-1042.py](build/build-setup-1042.py), remoção de caminhos fixos em scripts/testes, correção de fugas para `perfis/`, atualização de `package.json:build.files` e `.gitignore`, e recuperação de ~9,65 GB pela limpeza de artefactos obsoletos.
- **Desktop, SQLite e atualizador:** endurecimento de `storage-sqlite.cjs`, `data-service.cjs`, `desktop-bridge.js`, `attachment.cjs`, `verified-backup.cjs` (serialização e limpeza não-rejeitante), `manual-updater.cjs`, `update-helper.cjs` (`writeVerifiedAtomic`, `ESRCH` e limpeza de `profile`) e `main.cjs`.
- **Núcleo financeiro, Casa, Prendas e Dossiers:** normalização uniforme de IDs string/numéricos, validações atómicas e de meses fechados em `finance.js`, `planning-model.js`, `space-transfer-model.js`, `features-model.js` e `complete-model.js`; melhorias de importação/OCR e de cálculo de autonomia/experiência; correções críticas em `gifts-ui.js` (modo histórico), `casa-model.js` (`setOffersBatch`, proteção contra remoção com ligações ativas), `casa-catalog-ui.js`, `casa-life-ui.js`, `casa-daily-ui.js` e `dossiers-ui.js` (Consumos, Veículos, Habitação e lotes de PDF).
- **Segurança, acessibilidade e fluidez UI:** política CSP no HTML, escaping em `select()`, `field()`, `empty()`, `metric()` e `button()`, validação HTTPS em `window.open` e `ProviderIcons.resolve`, `sandbox="allow-same-origin"` na pré-visualização PDF, restauração de foco em modais, suporte a tecla Espaço, guardas por vista ativa com flags dirty, `MutationObserver` restrito às vistas ativas e 10 campos de pesquisa refatorados sem perda de foco/IME no Windows.
- **Sincronização móvel e Android 1.0.3:** autenticação antes de `refresh()` em rotas protegidas, comparação em tempo constante com verificação de comprimento e tratamento seguro de `revoke()` em `mobile-sync/server/service.cjs`; melhorias em `mobile-connection-ui.js`, `client.cjs`, `protocol.cjs`, `pairing.cjs`, `shared-space-client.cjs` e `mobile-sync-runtime.cjs`; alinhamento do bundle Android para `1.0.3` (`versionCode` `8`, `coreVersion` `1.0.42`).

# 1.0.41 · Integridade e desempenho

As instalações de produção verificam a assinatura Ed25519 dos pacotes `.fpupdate` antes de preparar a atualização, antes de a aplicar e durante a recuperação. Para gerar um pacote, define `EQUILIBRIO_UPDATE_SIGNING_KEY` com o caminho absoluto da chave privada de publicação. Usa `EQUILIBRIO_UPDATE_SIGNING_KEY_ID` se a chave corresponder a outro identificador reconhecido.

A migração SQLite recupera a base original quando é interrompida entre as duas renomeações. A passagem entre dispositivos e o emparelhamento protegem os dados da Lista de compras mesmo sem movimentos.

Em Casa, **Preços** mostra 40 produtos por página e **Produtos** mostra 48 cartões. A pesquisa abrange todo o catálogo. É possível editar preços em várias páginas e guardá-los em conjunto. Enter e Shift+Enter avançam e recuam na mesma coluna.

Para atualizar uma instalação numa pasta protegida do Windows, usa o instalador oficial. O atualizador integrado destina-se a instalações em pastas onde a conta consegue escrever. As instruções abaixo sobre pacotes históricos aplicam-se às versões a que se referem.

# 1.0.39 — Revisão UI transversal, performance e auditoria total

Melhoria abrangente de fluidez, alinhamento e clareza em todas as áreas do Equilíbrio: otimização de renderização e scroll no modo escuro (substituição de `html:has(...)` por `html[data-theme]` e remoção de `backdrop-filter`/sombras pesadas), novo ecrã inicial de seleção de espaço em cartões de perfil centrados (estilo desktop/Netflix), alinhamento exato de cartões e modais no **Resumo** (incluindo correção do rodapé `Fechar` em `Explicar variação` e setas de mês compactas), unificação de **Revisão e análise** numa única página com alturas idênticas (`Extrato`/`Conferir` e fecho de mês) e remoção de quadros redundantes, relatório **Exportar HTML** redesenhado com KPIs e gráfico SVG mensal, reformulação em 3 blocos orientados a compras em **Novo movimento** (sem corte de «Nota e cor (opcional)»), filtro `Intervalo de datas` em linha, botões de ação uniformes e fundos grafite corretos em **Movimentos**, **Planos** e **Agenda** (bordas fechadas nos compromissos do dia, menu `•••` grafite a fechar ao clicar fora e subscrições pagas visíveis no mês), renovação completa de **Decisões**, remoção de duplicações na Visão Geral do **Património** com rework do **Inventário**, e refinamento de **Casa**, **Dados**, **Avisos** e **Definições**. Atualização direta desde 1.0.33 a 1.0.38.

# 1.0.38 — Tema Grafite e Esmeralda — renovação visual

Renovação completa do modo escuro para uma paleta neutra Grafite/Carvão (`#0c0d10` fundo, `#14161a` cartões elevados, bordas subtis `rgba` e destaque verde-esmeralda `#10b981`) em todas as áreas do programa: barra superior translúcida com ícones utilitários limpos (*ghost*), modais com fundo desfocado e destaque inequívoco entre `Despesa` (coral) e `Receita` (esmeralda), correção do stepper de data, cartão hero de Cobertura renovado em Planos e decisões, cabeçalho aberto sem caixa em Definições, filtros/ações afinados no Centro de avisos e cartões KPI uniformes em Resumo, Movimentos, Património, Relatórios e Dados. Atualização direta desde 1.0.33 a 1.0.37.

# 1.0.37 — Polimento visual e barra superior compacta

Ronda de polimento UI transversal: barra superior compactada numa única linha em desktop (≥ 1181 px) com seletor de espaço sem corte (`Espaço: Eduardo`), barras de deslocação discretas adaptadas ao modo escuro e claro (`color-scheme`), barra de ferramentas de Movimentos numa linha com filtro lateral de categoria compacto e valores tabulares, sub-abas de 2.º nível com separador fino em sublinhado, profundidade uniforme nos cartões KPI de Património, Relatórios e Dados, paleta de gráficos unificada entre Resumo e Relatórios, aviso toast compacto no canto inferior direito, grelha equilibrada no ecrã de escolha de espaço e remoção do contorno de foco programático no título principal. Atualização desde 1.0.33, 1.0.34, 1.0.35 e 1.0.36.

# 1.0.36 — Edição de movimentos 5× mais rápida

Conclui a otimização P2 da edição de movimentos no Windows Desktop: introdução de gravação incremental por patch (`commitLedgerPatch`) com confirmação de releitura e controlo de concorrência dentro da transação SQLite (enviando ~2 KB em vez de ~13,8 MB por IPC), preservação da posição original do movimento em `F.update` sem deslocar centenas de `sort_order`, clonagem seletiva em `F.update` e atualização diferida da cache local `localStorage` no Desktop. A edição completa de um movimento caiu de **1,68 s para 335 ms** de mediana (-80%). Atualização desde 1.0.33, 1.0.34 e 1.0.35.

# 1.0.35 — Correção Desktop e gravação mais rápida

Corrige o erro no arranque Desktop (`FileProtection.lastForSpace`) que impedia o tema escuro e o acesso às Definições após a 1.0.34. Reduz para metade o tempo de escrita e confirmação no SQLite ao editar movimentos (de 561 ms para 280 ms de mediana no ensaio isolado) através de prepared statements pré-compilados, comparação rápida de JSON antes da verificação profunda, eliminação da escrita redundante de 6,9 MB em `app_state` e redução de clones e redesenhos ocultos. Atualização desde 1.0.33 e 1.0.34.

# 1.0.34 — Revisão de UX e navegação

Revisão transversal de clareza, cálculos e navegação nas 6 áreas do Equilíbrio: percentagens e médias fiáveis com meses completos e indicação de período parcial; filtros de Movimentos unificados, divisão de compra com soma exata e motivo de bloqueio no fecho mensal; pendências e avisos com origem e ação direta, separação de regras/importações/subscrições e aviso de cópia ligado à última cópia válida; Cobertura, Objetivos, Reservas e Orçamentos clarificados; correções em Casa (lojas, comparação, arredondamento e consumos); e padrões uniformes de contraste, foco, botões Cancelar em modais, remoção de atalhos duplicados e Ajuda alinhada. Atualização desde 1.0.33.

# 1.0.25 — Semana-tipo nas refeições e correções sugeridas

Refeições: «Repetir esta semana todas as semanas» cria uma semana-tipo que aparece em todas as semanas seguintes; um dia pode ser alterado ou saltado. Categorias: «Correções sugeridas» aplica, com confirmação, as correções da revisão dos dados (categorias repetidas, IUC anual, vendas em Receita, idas ao supermercado sem divisão). Atualização desde 1.0.20 a 1.0.24.

# 1.0.24 — Receitas com qualquer unidade e lojas com deslocação

Receitas aceitam todas as unidades (un, kg, g, L, ml, cl) em qualquer produto, com equivalência quando o tipo é diferente (por exemplo 1 un de banana = 0,12 kg); botão «Remover» alinhado. «Comparar lojas» soma a deslocação: distância de cada loja × custo por km (0,20 € por omissão). Seletores de mês/ano sem lista branca no modo escuro. Atualização desde 1.0.20, 1.0.21, 1.0.22 e 1.0.23.

# 1.0.23 — Refeições, receitas com unidades e Casa mais rápida

Refeições com Pequeno-almoço, Lanche da manhã, Lanche da tarde e Ceia. Receitas com unidade por ingrediente (g, ml, cl) e custo convertido. Lista de compras com «Escolher do catálogo» e gravação mais rápida nas páginas da Casa. Análises com um só controlo de mês. Consumos com Vazio, Ponta e Cheio na eletricidade e sem gás. Atualização desde 1.0.20, 1.0.21 e 1.0.22.

# 1.0.22 — Lista de compras no telemóvel

O PC central aceita as alterações à lista de compras feitas na app Android 1.0.0: marcar, acrescentar e conferir artigos. Sem mudanças visíveis no PC. Interno: cálculo do Património partilhado com o telemóvel e períodos mensais nos Relatórios. Atualização desde 1.0.20 e 1.0.21.

# 1.0.21 — Património redesenhado e Ler Fatura retirado

Património com blocos de resumo, evolução com «Guardar valor de hoje», composição e «A rever» em cartões; Inventário com filtros em pílulas e cartões. Ler Fatura retirado; dados já lidos e pesquisa de texto em PDFs conservados. Separadores certos ao abrir; «Fluxo de caixa» leva à Agenda. Atualização desde 1.0.20.

# 1.0.20 — Revisão geral: espaçamentos, menus e tema claro

Sem quadros colados nem molduras duplas em Revisão, Dados, Agenda, Avisos, Movimentos e Inventário. Menus suspensos fecham ao escolher ou clicar fora. Movimentos correto no tema claro. Casa sem botões duplicados e com filtros ativos realçados; Refeições sem receitas explica o que fazer. Atualização desde 1.0.19.

# 1.0.19 — Revisão, Casa, Dados, Avisos, Definições e Movimentos redesenhados

Revisão e análise com o fecho do mês em três passos e contas em cartões. Mês a mês com uma cor por categoria. Casa (Visão geral, Lista de compras, Compras, Despensa, Análises, Refeições, Receitas), Dados, Avisos e Definições com blocos de resumo, filtros em pílulas e cartões. Movimentos numa linha, com as ações secundárias no menu «•••». Atualização desde 1.0.18.

# 1.0.18 — Relatórios detalhados, catálogo e Agenda redesenhados, mais rápido

Gravar fica mais rápido: a conferência do extrato só é recalculada com a página aberta e os compromissos futuros usam índices. Relatórios com Categorias e subcategorias, Mês a mês, Comparar anos, Onde gastas e Receitas (Visão anual igual). Agenda, Planos e decisões, Equipamentos, Produtos, Lojas e Preços (tabela editável) redesenhados. «Arrumar repetidas» junta categorias repetidas. Atualização desde 1.0.17.

# 1.0.17 — Layout em cartões e catálogo sem categorias

Agenda com cartão do dia à altura do calendário e menu de ações visível. Planos e decisões, Inventário, Habitação, Veículos e Rotinas em cartões. Catálogo com menor preço destacado, filtro Ativos/Arquivados, eliminar produtos e sem categorias. Ecrã inicial mais compacto e Revisão sem a Revisão semanal. Atualização desde 1.0.16.

# 1.0.16 — Correções Casa e Planeamento

Corrige guardar produtos editados, categorias duplicadas nos produtos, botões da lista de compras e sugestões de categoria dos movimentos; avisos deixam de ser recalculados em cada página. Ajustes em Agenda, Subscrições, Resumo, Catálogo, Prendas, Habitação, Veículos e Equipamentos. Atualização direta desde 1.0.14 e 1.0.15.

# 1.0.0 — Primeira versão estável

Instalador Windows para Programas (x86), atalhos Equilíbrio e preservação do perfil existente. Atualização .fpupdate com elevação quando o destino está protegido e recuperação antes da abertura dos dados. Link opcional HTTP/HTTPS na ficha de produto Casa. Atualização desde 0.41.10; versões futuras mantêm o mesmo método. Publicação privada no GitHub autorizada pelo proprietário.

# 0.41.10 — Privacidade, Dados e catálogo Casa

Ocultar valores antes de entrar; ajustes finais Resumo/Planeamento; Fontes, arquivo, Qualidade, Regras e Comprovativos revistos. Casa: categorias/subcategorias, 16 unidades e preços por supermercado numa operação atómica; novos registos sem ligações financeiras, histórico conservado. FAQ, análise, desempenho e limpeza verificados. Atualização desde 0.41.9. GitHub aguarda ordem; servidor fica para Android.

# 0.41.9 — Definições, Dados e Ajuda

Geral reúne perfil/apresentação/espaços/guias; Backup e Atualização reúne manutenção; Capturas sai dos acessos; Caixa de entrada, Regras, Comprovativos, Agenda, seletores, login e FAQ revistos. Corrigido restauro de pacotes de vários espaços pelo navegador. Modelos e esquema SQLite preservados. Atualização desde 0.41.8.

# 0.41.8 — Despensa, organização e leitura

Despensa em lista e detalhe; cópias e atualizações nas Definições; contraste nos dois temas; comparação e fecho reunidos; revisão semanal, património, simulador e cabeçalhos revistos; ícones locais nas contas. Modelos financeiros e esquema SQLite preservados. Atualização apenas desde 0.41.7.

# 0.41.7 — Apresentação, restauro e navegação

Login centrado, Resumo e Revisão mais legíveis, Relatórios simplificados, correções visuais nos Movimentos/Planos/Agenda e ajuda sem títulos repetidos. Cálculos de páginas ocultas adiados para as páginas relevantes. Restauro integral e transferência de créditos/movimentos validados com SQLite em perfis sintéticos. Atualização apenas desde 0.41.6.

# 0.41.6 — Coerência de reembolsos e análises

Proteção de reembolsos conciliados, diagnóstico de associações de manutenção, classificação analítica de reembolsos e períodos acumulados coerentes. O Resumo explica total líquido e ajustes. Histórico e SQLite preservados. Atualização apenas desde 0.41.5.

# 0.41.3 — Passagem entre espaços e revisão geral

Mover um ou vários movimentos/créditos ou contas completas, com todas as ligações necessárias, pré-visualização, contas mapeadas, backup e confirmação. Gravação conjunta com controlo de concorrência dentro da transação SQLite. Origem/data/PC nas cópias e no restauro. Importação MMEX retirada; dados históricos preservados. Relatórios calculam saldos num único percurso e o relatório anual só é atualizado na sua página. FAQ, regressões de migração e percurso nativo permanente. Pacote cumulativo .52–.41.2; Android adiado.

# 0.41.2 — Relatórios · Mesa de análise

Implementa a proposta A aprovada: navegação lateral Visão anual/Categorias/Contas/Evolução, ano e filtros de semestre/trimestre/conta, indicadores compactos, gráfico mensal, despesas por categoria e detalhe mensal. Exportação HTML respeita os filtros; drill-down conserva notas das parcelas e abre o movimento exato. Relatório anual completo e acontecimentos preservados num grupo recolhido. Consulta sem alterar os dados. Pacote cumulativo .52–.41.1; Android adiado.

# 0.41.1 — Restauro e apresentação

Restauro integral do espaço atual com origem selecionada e proteção anterior. Revisão sem gráfico duplicado, temas e grupos corrigidos. Formulário e ações/ícones dos movimentos alinhados. FAQ de restauro e rascunhos.

# v0.41.0 — Produtividade e compreensão

Rascunhos locais separados do ledger e recuperação de movimentos/divisões/importações/faturas/Casa, com identificador contra confirmação repetida. Revisão de ajustes de fatura em cêntimos, comparação explícita de alterações MMEX, variação do saldo e composição patrimonial/reservas consultáveis. Previsão temporária com hipóteses e incerteza, conversão g/kg/ml/L e preços Casa por unidade/histórico. Alterações em lote apresentam exclusões protegidas e preservam seleção. Índices transitórios para totais e saldos dos gráficos. Pacote cumulativo .52–.40; programa completo na pasta, sem ZIP, EXE ou instalador. Android adiado.

# v0.40.0 — Consolidação e recuperação

Formulários protegidos contra duplo envio, saída e mudança de espaço durante gravação; erros mantêm os campos e gravações duráveis sem releitura bloqueiam novas escritas. Snapshot SQLite único por espaço e testes de interrupção real antes/depois de COMMIT. CSV/MMEX conserva os valores submetidos; negativos contabilísticos, faturas ambíguas e categorias Casa corrigidos. Índices transitórios e previsão/Agenda sem cópias e scans redundantes; ensaios com 50 mil movimentos e sessão longa. Resumo permite consultar o cálculo mensal. Regressões históricas continuam ativas em .40; pacote cumulativo .52–.80 e rollback em cópias isoladas. Android adiado.

# v0.39.80 — Revisão global dos percursos e ligações

Correção e restauro de pagamentos parciais/prestações conservam a liquidação; notas preservam extratos/capturas/intervenções e alterações financeiras pedem conferência. Transferências protegem ambos os meses; importação usa a seleção real e desfazer lotes é atómico. Reorganização de categorias acompanha todos os domínios; arquivo de contas exposto no inventário; cancelamento explícito de planos de equipamentos ainda não pagos; análise Casa corrigida e associação de devoluções otimizada. Pesquisa navegável por teclado. Programa completo na pasta e pacote cumulativo .52–.79; Android adiado.
# v0.39.79 — Percursos e pesquisa de ponta a ponta

Pesquisa abre o registo exato nas mesas unificadas, incluindo subscrições canceladas. Comprovativos deixam de falhar por nome de tipo incompatível; documentos selecionados são apresentados na biblioteca. Casa e comprovativos abrem o movimento associado mesmo fora do mês/filtros atuais, sem alterar esses filtros. Pesquisa inclui créditos, reservas, orçamentos, compras Casa e texto/artigos, e intercala os tipos para não esconder entidades atrás de milhares de movimentos. Corrigida sobreposição de resultados causada por estilo do cabeçalho. Pacote cumulativo .52–.78; Android adiado.

# v0.39.78 — Faturas assistidas e consolidação

Sugestões confirmadas por artigo/loja com âmbito e exceções; pesquisa no texto/artigos dos comprovativos e faturas Casa; OCR de documentos antigos confirmado antes de guardar. Revisão de faturas compacta, estados Artigos/Stock/Pagamento e seleção preservada na Casa. Pipeline dos donos finais da interface, redução de renders duplicados e contagem hierárquica numa passagem. Documentação atual separada da narrativa histórica. Regressões e backup/restauro cobrem regras/texto; pacote cumulativo .52–.77. Android adiado.

# v0.39.77 — Mesas de trabalho unificadas

Implementadas as oito propostas aprovadas: revisão/análise, planos/decisões, subscrições laterais e gestor, visão geral/inventário de património, Dados/importações/comprovativos e Definições por assunto. Seleção consistente, rascunhos de importação preservados, conferência explícita e mesmos editores. Novos testes de 70 estados visuais e percursos completos. Android adiado. Atualização cumulativa 0.39.52–0.39.76.

# v0.39.76 — Movimentos essenciais e correções de seleção

Barra única, formulário Essencial primeiro, ícones locais, níveis dependentes das parcelas limpos ao mudar o pai, seleção por linha, ano mais largo e FAQ. Agenda/importações desenhadas na página própria e cálculos repetidos partilhados apenas por ciclo síncrono. Propostas de fusão das páginas em oito imagens, sem implementar essas fusões. Pacote cumulativo 0.39.52–0.39.75.

# v0.39.75 — Apresentação compacta de Movimentos

Ajustes de apresentação no cabeçalho, indicadores, Novo movimento e painel de filtros, preservando os comportamentos atuais. Pacote cumulativo para 0.39.52–0.39.74.

# v0.39.74 — Movimentos e biblioteca de comprovativos

Pesquisa e filtros reunidos, separadores com distância do cabeçalho, painel lateral recolhível e formulário com campos agrupados e rodapé fixo. Etiquetas retiradas da interface, mantendo dados históricos. Comprovativos com lista, seleção, pré-visualização local e operações originais.

Pacote cumulativo para 0.39.52–0.39.73. Programa completo na pasta, sem novo ZIP, EXE ou instalador. Critérios em AUDITORIA-v0.39.74.md.

# v0.39.73 — Padrão visual comum do Equilíbrio

Regras comuns derivadas dos componentes editáveis do Figma: tipografia DM Sans incluída localmente, botões, separadores, títulos, espaçamentos, seleção e foco. Aplicação a todas as áreas, incluindo Resumo/Revisão/Análise, Movimentos e Planeamento. Dados alinhado e caixa de entrada adaptada ao detalhe; seleção de listas com setas, Home e End. Operações financeiras e editores originais preservados.

Pacote cumulativo para 0.39.52–0.39.72. Programa completo na pasta, sem novo ZIP, EXE ou instalador. Critérios em AUDITORIA-v0.39.73.md.

# v0.39.72 — Mesa de trabalho e revisão da Casa

Reestruturação das quinze páginas aprovadas, com listas e detalhe selecionado. Despensa agrupada por produto, Compras com Artigos/Stock/Pagamento, semana de refeições e tarefas de Dados/Importações. Renderizações da Casa por página e correção de enriquecimentos duplicados. Modelos, confirmações e histórico preservados.

Pacote cumulativo para 0.39.52–0.39.71. Programa completo na pasta, sem novo ZIP, EXE ou instalador. Critérios em AUDITORIA-v0.39.72.md.

# v0.39.71 — Sugestões de categorias e organização prática

Sugestões ao escrever em todos os níveis das parcelas, mantendo uma única seta e seleção pelo teclado. Cabeçalho de Movimentos com ações separadas dos filtros; Revisão mais compacta sem os botões antigos de período. Importação Casa antiga retirada da interface, editor e carregamento; arquivos e dados históricos preservados. Revisão das onze páginas da Casa e propostas para quinze páginas, sem implementar esses novos layouts.

Pacote cumulativo para 0.39.52–0.39.70. Programa completo na pasta, sem novo ZIP, EXE ou instalador. Critérios em AUDITORIA-v0.39.71.md.

# v0.39.70 — Consistência visual e gravação em bases antigas

Parcelas compactas, seta única, Duplicar alinhado com Valor, hierarquia de categorias explícita, comandos da Agenda em linha e margens comuns incluindo Análise e Casa. Corrige o falso conflito por campos vazios ausentes em bases antigas, preservando conflitos reais. Verificação permanente de 184 estados visuais e três novas regressões SQLite.

Pacote cumulativo para 0.39.52–0.39.69. Programa completo na pasta, sem novo ZIP, EXE ou instalador. Critérios em AUDITORIA-v0.39.70.md.

# v0.39.69 — Agenda, subscrições e movimentos mais práticos

Gestão de subscrições e Histórico e recuperação em popups; Agenda simplificada; Planos e Decisões reorganizados; margens uniformes. Duplicação de parcelas com notas, preenchimento hierárquico pelo histórico e rascunho preservado ao voltar da revisão da fatura. Leitura local de imagem e PDF exercitada, incluindo Electron e erro de idioma. Despesas partilhadas retirada da interface, conservando dados históricos.

Programa completo na pasta e pacote cumulativo para 0.39.52–0.39.68, sem novo ZIP, EXE ou instalador. Critérios e validação em AUDITORIA-v0.39.69.md.

# v0.39.65 — otimização geral

Melhorias de pesquisa, desenho de tabelas e gráficos, paginação da Agenda e verificação agrupada das exportações. Correções de arredondamento de médias, identificação de recorrências, devoluções na comparação de acontecimentos e atomicidade de erros de equipamentos. Não altera movimentos guardados ou operações de reconciliação.

Pacote cumulativo para 0.39.52–0.39.64, sem assinatura obrigatória, ZIP, EXE ou novo instalador.

# v0.39.64 — Organização prática global

Agenda única com calendário/lista, mês e ano diretos, dia selecionado e subscrições recolhidas numa área de gestão. Planos com Objetivos, Reservas, Orçamentos e Acontecimentos. Decisões com formulário e resultado lado a lado; compras e despesas mensais só criam compromissos após confirmação. Revisão orientada a resolver, conferir e fechar. Análise compara mês anterior, média de três meses e período homólogo, com categorias, fornecedores, orçamentos e indicação de dados incompletos. Património distingue liquidez, ativos e dívida, com datas das avaliações. Casa apresenta Comprar, Usar primeiro e Manutenções, com catálogo agrupado.

Equipamentos permitem concluir um plano usando intervenção/pagamento existentes e preparar o seguinte. Previsão inicial, intervenção, pagamento e reserva ficam conservados. A reserva anterior não é libertada automaticamente: revê-a em Planos. Não são criados pagamentos pela conclusão.

Pacote cumulativo para 0.39.52–0.39.63. Pasta completa e .fpupdate, sem ZIP, EXE ou instalador. A 0.39.51 continua a precisar da passagem pela 0.39.52.

# Atualização atual: 0.39.63

Pacote cumulativo financas-pessoais-v0.39.63.fpupdate, compatível com 0.39.52–0.39.62. SHA-256 sem exigência de chave privada. Inclui guia, auditoria e propostas visuais. Sem novo ZIP/EXE/instalador. A passagem inicial da 0.39.51 permanece pela entrega 0.39.52.

# Atualização atual: 0.39.62

Pacote cumulativo financas-pessoais-v0.39.62.fpupdate, compatível com 0.39.52–0.39.61. Integridade SHA-256, sem necessidade de chave privada. Preparação, instalação e rollback verificados. Não foi gerado novo ZIP/EXE/instalador. Para a 0.39.51, usar primeiro a passagem sem chave da entrega 0.39.52.

# Backup, restauro e atualização

Desde a 0.39.52, atualizações não exigem chave privada. Os pacotes verificam o manifesto, tamanhos e hashes SHA-256, preparam uma cópia de reversão, verificam ficheiros instalados e revertem se a instalação falhar. Os dados SQLite ficam fora da pasta de aplicação; antes de atualizar há uma cópia consistente da base.

O pacote cumulativo 0.39.61 aceita instalações 0.39.52–0.39.60. Para a 0.39.51 mantém-se o procedimento de passagem para 0.39.52 na entrega anterior. Não é necessário EXE/instalador novo.

As cópias JSON e encriptadas partem de uma leitura consistente de todos os espaços SQLite. A escrita passa por ficheiro temporário, sincronização, verificação de tamanho/hash e renomeação. Falhas de disco cheio, bloqueio ou pasta recusada preservam a cópia anterior. O restauro carrega todos os validadores de domínios antes de preparar a substituição. A cópia antes do restauro usa os dados duráveis atuais.

## Rotação opcional de assinatura

A assinatura continua opcional; estes passos destinam-se apenas a quem decidir utilizá-la. A falta de uma chave nunca bloqueia as entregas deste ciclo.

1. Executar `node scripts/rotate-update-key.cjs --generate CAMINHO_EXTERIOR_NOVO identificador-novo`. A pasta deve ficar fora da aplicação; não é permitida a substituição de chaves existentes. São criados a chave privada, a pública e o registo de rotação. A ferramenta não imprime o conteúdo privado.
2. Executar `node scripts/rotate-update-key.cjs --register CAMINHO_DA_ROTACAO`. A chave pública é registada no atualizador e a fonte anterior é preservada na pasta da rotação. As chaves públicas antigas continuam aceites.
3. Distribuir primeiro uma atualização sem assinatura com essa nova chave pública. As instalações antigas ainda não conhecem a nova chave.
4. Depois dessa passagem, definir `EQUILIBRIO_UPDATE_SIGNING_KEY` para o ficheiro privado e `EQUILIBRIO_UPDATE_SIGNING_KEY_ID` para o novo identificador ao produzir pacotes assinados.

Se a chave privada desaparecer, produzir um pacote sem assinatura e repetir a rotação opcional quando necessário. Preservar a pasta de chaves fora das entregas e guardar a sua cópia separadamente.

## Limites dos testes

Disco cheio e bloqueio de ficheiro são falhas injetadas deterministicamente. Caminhos longos, Unicode e uma pasta com nome OneDrive usam escrita real, mas não simulam todo o serviço de sincronização remoto. A regressão e os testes nativos usam bases sintéticas e perfis temporários. Não houve utilização prolongada nem teste de uma cópia da base pessoal.

