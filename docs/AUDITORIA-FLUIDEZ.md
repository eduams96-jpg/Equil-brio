# Auditoria de fluidez do Equilíbrio

Comparar a **v1.0.29** com a **v1.0.30** neste PC. A v1.0.29 é a referência anterior à otimização do Resumo. Os números históricos das 36 páginas orientam a análise. A comparação usa medições novas, feitas nas mesmas condições.

## Preparação

- Na pasta `equilibrio`, executar `node integration/preparar-auditoria-fluidez.cjs`. O programa verifica as versões pelos ficheiros de entrega, confirma que o navegador e o Electron estão disponíveis e cria dois perfis isolados a partir da mesma cópia SQLite. A base original é aberta em modo de leitura. O manifesto `preparacao.json`, na pasta temporária indicada no resultado, regista os caminhos e a data da cópia.
- Para abrir cada versão no Windows, usar o Electron instalado no projeto, o `desktop/main.cjs` da versão correspondente, o argumento `--equilibrio-validation` e o caminho do respetivo perfil em `EQUILIBRIO_VALIDATION_ROOT`. Guardar movimentos, compras e consumos apenas nesses perfis. Repor a cópia original de teste antes de cada nova série de gravações.
- Para as 36 páginas, reutilizar `node integration/auditoria-1029.cjs <pasta-da-v1.0.29> <pasta-de-resultados>`. A lista de páginas e as larguras de 390, 768 e 1440 px são as mesmas da auditoria anterior. Esta passagem usa dados de teste e complementa a medição no Windows com a cópia dos dados reais.

## Execução repetível

- Definir `EQUILIBRIO_AUDIT_REPETITIONS=12` e correr `auditoria-1029.cjs` para a subpasta `navegacao-repetida`. A saída inclui as 12 amostras por página, versão e largura.
- Usar `node integration/auditoria-fluidez.cjs <preparacao.json> <pasta-de-resultados>/sessao-final 15` para duas sessões de cerca de 15 minutos. Cada sessão abre uma cópia nova do perfil, acrescenta registos identificados de teste e guarda os resultados à medida que os percursos terminam. Um quarto argumento com a versão limita a execução a essa versão.
- Usar `node integration/relatorio-fluidez.cjs <pasta-de-resultados> <preparacao.json>` após as duas sessões. O relatório agrega navegação, interação, gravação, verificações e memória.

## O que medir

| Percurso | Ações a cronometrar | O que confirmar |
| --- | --- | --- |
| Navegação geral | Abrir cada uma das 36 páginas e repetir com a aplicação já em uso. Registar tempo de processamento e tempo até a página estar visível e pronta a responder. | Página e separador certos, sem erros de navegação ou conteúdo cortado. |
| Resumo e Movimentos | Voltar ao Resumo, mudar de mês, abrir o cálculo de uma despesa, pesquisar, aplicar filtros, abrir um movimento, editar e guardar. | Os resultados, o movimento guardado e os totais apresentados correspondem ao período. |
| Agenda | Mudar de mês, alternar entre lista e calendário, abrir um compromisso e alterar uma ocorrência. | Data, valor e estado aparecem corretamente nas duas vistas. |
| Planos e Decisões | Abrir Cobertura, pesquisar e expandir um plano, editar uma reserva ou um objetivo e executar uma simulação. | A cobertura reflete a gravação e a simulação apresenta o resultado esperado. |
| Casa | Pesquisar um produto, abrir e guardar uma compra de teste, registar um consumo de água e editar um consumo de eletricidade. | Compra e consumos aparecem nos respetivos históricos, com as datas, unidades e comercializadora indicadas. |
| Sessão prolongada | Alternar entre áreas e repetir pesquisas, filtros e gravações durante cerca de 30 minutos. Medir no início, a meio e no fim. | Comparar tempo de resposta e memória após o aquecimento. Se houver crescimento persistente, repetir o percurso que o desencadeia. |

## Comparação e prioridades

- Usar os mesmos dados, mês, tamanho de janela e sequência de ações nas duas versões. Separar o arranque a frio da navegação com a aplicação aberta. Alternar a ordem das versões entre séries para reduzir a influência do aquecimento.
- Registar amostras por página e por ação. Comparar mediana e percentil 90 nos percursos com pelo menos dez medições. Apresentar as amostras individuais quando houver menos medições.
- Distinguir o tempo de abrir a página, o de reagir a uma ação e o de gravar e atualizar a interface. Nos atrasos reproduzíveis, medir a leitura dos dados, os cálculos, a gravação e o desenho do ecrã antes de alterar o programa.
- Entregar os resultados das 36 páginas e dos percursos principais, com os problemas reproduzíveis, as condições de teste e a ordem de correção. Repetir os percursos afetados depois de cada correção. Guardar no relatório apenas tempos, contagens e descrições dos testes.
