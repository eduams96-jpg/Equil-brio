# Android 1.0.0 — app companheira redesenhada

Data: 05/11/2026 · Estado: aprovado em conversa, por rever por escrito.

## Objetivo

Levar o Android da RC4 (0.9.0-rc.4) a uma **1.0.0 companheira do PC**: app de bolso ligada ao PC central, com a identidade visual do Windows 1.0.21 adaptada ao telemóvel e quatro funções novas — Lista de compras, Património (consulta), Relatórios rápidos (consulta) e Avisos com notificação diária local.

**Não é** um programa completo no telemóvel. O PC continua a ser o sítio para Planos, Inventário, Revisão mensal, Refeições, Despensa e Receitas.

### Critérios de sucesso

- Os totais de Património, Relatórios e Avisos no telemóvel são iguais aos do PC para o mesmo ledger (garantido por usar os mesmos modelos e por testes).
- Riscar a lista de compras funciona sem rede e sincroniza sem duplicar nem perder alterações.
- Instala-se por cima da RC4 sem desinstalar, com os dados e a associação preservados.
- O visual segue o PC 1.0.21 (cartões, `ch-tile`, pills, tokens de cor, tema claro e escuro) e funciona a 375 px de largura.

## Ponto de partida

- `android/app/` — Capacitor 8.5.3, interface num `src/main.js` de ~585 linhas densas, `style.css` de 46 linhas. Ecrãs: Resumo, Movimentos (lista, detalhe, novo/editar, eliminar, rascunhos), Contas (editar, arquivar), Agenda/compromissos (novo, pagar, reagendar), Casa (Produtos, Stock, consumo), Ligação (emparelhamento, conflito, recuperação, passagem).
- `android/shared/` e `equilibrio/mobile-sync/` — protocolo, cliente, associação, rascunhos e regras Casa (`house.cjs`, comandos `house.product`, `house.lot`, `house.consume`, `house.shopping`).
- A sincronização envia ao telemóvel o **ledger inteiro** do espaço (`desktop-snapshot.cjs`), por isso os cálculos podem ser feitos no telemóvel sem mudar o protocolo.
- Modelos puros do PC reutilizáveis (`module.exports`): `reports-model.js` (`ReportAnalysis.analyse`, `detail`), `dossiers-model.js` (`notices(d, options)`), `finance.js`, `casa-model.js`, `casa-life-model.js`.
- `wealth-analysis-v3.js` mistura cálculo e desenho (`window.WealthAnalysisV3 = { render }`).

## Abordagem escolhida

**Modelos partilhados + interface móvel própria.** O Android inclui no bundle (esbuild) os modelos puros do PC; o cálculo do Património é extraído para um modelo puro novo, usado pelos dois lados. A interface móvel é reescrita em módulos por ecrã, com CSS próprio que replica tokens, ícones e peças do PC.

Rejeitadas: carregar a interface do PC no Capacitor (~950 KB de CSS, ~40 mil elementos, scripts que reescrevem ecrãs uns dos outros, layout de secretária) e reimplementar cálculos no Android (divergência de totais).

## 1. Estrutura da app

### Navegação

Barra inferior com 4 destinos e botão flutuante «+» (novo movimento rápido):

| Separador | Conteúdo |
|---|---|
| Resumo | Saldo total, gastos do mês, mosaicos `ch-tile` (Avisos com contador, Agenda próximos dias, Lista de compras com nº de itens), últimos movimentos |
| Movimentos | Lista com pesquisa e pills de filtro, detalhe, edição |
| Casa | Pills: Lista de compras · Produtos · Stock |
| Mais | Contas · Agenda · Património · Relatórios · Avisos · Ligação · Definições |

Os fluxos existentes (formulários, conflito, recuperação, passagem, rascunhos, descartes) mantêm a lógica atual; mudam só de visual e de módulo.

### Ficheiros em `android/app/src/`

- `main.js` — arranque, router de páginas, estado comum (ligação, privacidade, rascunhos, sincronização). Deixa de conter HTML dos ecrãs.
- `screens/` — um módulo por ecrã: `resumo.js`, `movimentos.js`, `contas.js`, `agenda.js`, `casa.js`, `compras.js`, `patrimonio.js`, `relatorios.js`, `avisos.js`, `ligacao.js`, `definicoes.js`. Cada um exporta `render(ctx)` (função pura de `ctx` → HTML) e `bind(ctx, root)` (eventos).
- `ui/` — peças comuns: `tile`, `pills`, `search`, `card`, `icon` (SVGs dos ícones do PC num só ficheiro), `money` (formatação e ocultação).
- `style.css` — refeito com os tokens do PC (`--ink`, `--muted`, `--line`, `--paper`, teal `#116e59`), tema claro/escuro (sistema ou forçado), alvos de toque ≥ 44 px, `safe-area-inset`.
- Os módulos existentes `agenda.cjs`, `house-ui.cjs`, `financial-consultation.cjs` e `view-model.cjs` continuam a ser a lógica de apresentação; os ecrãs usam-nos.

### Modelos partilhados no bundle

- `equilibrio/reports-model.js` e `equilibrio/dossiers-model.js` importados diretamente (com `finance.js`).
- `equilibrio/wealth-model.js` (novo) — cálculo do Património extraído de `wealth-analysis-v3.js`; o PC passa a usá-lo sem mudança de comportamento. Com os `ranges` mensais de `reports-model.js` (secção 2), são as únicas alterações ao PC.
- Lista de compras usa `house.cjs` e o comando `house.shopping` existente; acrescentam-se apenas os campos que faltarem para riscar/desfazer e para itens livres.

### Inalterado

Protocolo de sincronização, emparelhamento, certificado, identidade `pt.equilibrio.mobile` e chave de assinatura.

## 2. Ecrãs novos

### Lista de compras (Casa → Lista de compras)

- Pills por estado (Por comprar · No carrinho · Tudo) e por supermercado; pesquisa; interruptor «Estou na loja» que filtra pela loja escolhida, como no PC (`casa-shopping-ui.js`).
- Linha: nome, quantidade, preço da embalagem, total; caixa grande para riscar/desfazer.
- Toque no nome abre a folha «Conferir artigo»: embalagens, preço por embalagem, onde guardar, validade, nota (equivalente ao `editItem` do PC).
- Rodapé fixo: total estimado e total no carrinho.
- Acrescentar: do catálogo ou com nome livre.
- Offline: cada alteração é uma operação `house.shopping` em rascunho, enviada na sincronização.

### Património (Mais → Património, só leitura)

- Mosaicos: património líquido, ativos, passivos, variação do mês.
- Cartões: Composição (barra empilhada por tipo), Evolução (linha de 12 meses), Receitas e despesas do mês.
- Dados de `wealth-model.js`.
- Fora: Inventário, «A rever», Revisão mensal, Fecho.

### Relatórios (Mais → Relatórios, só leitura)

- Seletor de período (mês, trimestre, ano) e de conta.
- Mosaicos: receitas, despesas, saldo do período, diferença face ao período anterior (€ e %).
- Onde gastas: categorias ordenadas com barra horizontal e cor do PC; toque abre subcategorias.
- Mês a mês: barras do período.
- Dados de `ReportAnalysis.analyse` e `detail`. `analyse` só aceita hoje `year`, `h1`, `h2` e `q1`–`q4`; acrescentam-se `m01`–`m12` a `ranges` em `reports-model.js` (alteração aditiva ao PC, com testes).

### Avisos (Mais → Avisos; contador no mosaico do Resumo)

- Grupos: Atrasados · Hoje · Próximos dias; prioridade por cor (vermelho alta, âmbar média, azul baixa).
- Toque leva ao destino: pagamento → «Registar pagamento» do compromisso; Agenda → dia; Casa → produto/stock. Sem destino no telemóvel → apenas detalhe.
- Dados de `notices(data)` com as preferências do PC (áreas ativas, dias de antecedência).

## 3. Notificações, definições e fluxo de dados

### Notificação diária local (`@capacitor/local-notifications`)

- Após cada sincronização e cada abertura, recalcula os avisos e agenda **uma** notificação para a hora escolhida, com id fixo (substitui a anterior).
- Conta só prioridade alta e média; se não houver, cancela a notificação.
- Texto: «3 avisos hoje: Luz (vence hoje), Seguro carro (atrasado)…». Com valores ocultos ativos: só «3 avisos hoje», sem nomes nem montantes.
- Toque abre a app em Avisos.
- A permissão é pedida só ao ativar a opção em Definições. Se for recusada, a opção volta a desligada com explicação.
- Texto produzido por função pura `dailyDigest(notices, {hidden, today})`; agendamento atrás de um adaptador para testes.

### Definições (Mais → Definições)

- Notificações: ligar/desligar e hora (09:00 por defeito).
- Tema: automático, claro, escuro.
- Ocultar valores ao abrir.
- Versão e `build-info`.
- Preferências de avisos do PC apenas para leitura, com «alterar no PC».

### Fluxo de dados

- Ecrãs leem o ledger local da última sincronização. Património, Relatórios e Avisos são calculados ao abrir e guardados em cache até ao próximo commit ou sincronização.
- Escritas (lista de compras, movimentos, pagamentos) seguem o caminho atual: rascunho → operação → envio → conflitos/recuperação como hoje.
- Ecrãs de consulta mostram «Dados de há X» com a hora da última sincronização.

### Erros

- Falha de um modelo → cartão «Não foi possível calcular: <mensagem>» nesse ecrã; o resto da app continua; nada é escrito.

## 4. Testes, versão e entrega

### Testes (`node --test`)

- `wealth-model.js`: comparação com o resultado atual de `wealth-analysis-v3.js` sobre fixtures e uma cópia dos dados reais (nunca a base viva). Os 683 testes do PC continuam a passar.
- Paridade: Relatórios, Avisos e Património no bundle Android dão os mesmos números que no PC para o mesmo ledger.
- Lista de compras: riscar, desfazer, item livre, conflito com alteração vinda do PC.
- `dailyDigest`: texto, ocultação, sem avisos.
- Ecrãs: `render` de cada `screens/*.js` sem erros com ledger vazio, de demonstração e real.
- Os 194 testes Android existentes continuam a passar.
- Visual: pré-visualização de `www/` no browser a 375 px, claro e escuro, com capturas, antes de compilar.

### Versão e entrega

- Android **1.0.0**, versionCode 5, identidade `pt.equilibrio.mobile`, mesma chave; por cima da RC4.
- Extração do `wealth-model.js` e os `ranges` mensais seguem no Windows 1.0.22; o Android não depende dessa atualização.
- `entrega-android-1.0.0/`: APK assinado, SHA256, instruções curtas.
- Compilação com `android/scripts/build-release.ps1`; lint com zero erros.

### Fases (revisão entre cada uma)

1. Base: router, `ui/`, CSS novo, ecrãs atuais migrados para o visual novo, sem funções novas.
2. Lista de compras.
3. Relatórios e Património (inclui `wealth-model.js` no PC).
4. Avisos e notificações.
5. Definições, APK 1.0.0 e entrega.

## Fora de âmbito

Editar Património, Planos, Refeições, Despensa e Receitas no telemóvel; notificações push; Play Store; piloto físico da partilha (continua pendente do proprietário, `PILOTO-FINAL.md`); cópia externa da chave de assinatura (`RECUPERACAO-DA-ASSINATURA.md`).
