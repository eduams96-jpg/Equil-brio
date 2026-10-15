# Casa 0.3.9 e Finanças 0.33.0

Referência: código local de `casa-reference/Casa-v0.3.9/casa`, em particular catálogo, inventário, compras, comparador, receitas, planeamento, sugestões e análises. A comparação não pressupõe importar dados do programa anterior.

| Área | Situação na aplicação integrada |
| --- | --- |
| Produtos, lojas, preço e conteúdo por embalagem | Implementado; kg/L/unidades e preço normalizado |
| Marca, código de barras, notas | Implementado; código introduzido como texto |
| Categorias | Categoria geral e caminho textual por supermercado; sem árvore com herança |
| Compras, talões e lista | Implementado; entrada de stock e despesa opcional numa gravação conjunta |
| Correção de preço após consumir | Implementado com ajuste financeiro e conservação dos lotes |
| Despesa já existente | Associação explícita sem duplicar o débito |
| Listas especiais/reutilizáveis | Modelos editáveis de produtos do catálogo, reutilização sem duplicar pendentes e remoção |
| Comparar 1/2/3 lojas | Implementado com embalagens completas, cobertura e confirmação |
| Despensa, validades, locais e saídas | Implementado, com histórico e filtros |
| Packs e embalagens individuais | Conteúdo do pack e contagem de embalagens físicas fechadas/quantidade aberta por lote |
| Reposição por mínimo/alvo | Implementado, descontando pendentes |
| Previsão estatística por hábitos | Estimativa por consumo dos últimos 90 dias, com confiança e confirmação antes de adicionar à lista |
| Receitas e planeamento semanal | Implementado, com porções, consumo, faltas e sugestões por validade/abertura |
| Preenchimento automático de uma semana | Sugestão de lugares vazios com pré-visualização; refeições podem ser trocadas/editadas |
| Evolução mensal, preços, lojas e categorias | Implementado; seis meses, preços normalizados e indicação das limitações |
| Desperdício e custo de receita | Implementado; custo de lote para desperdício e estimativa com preços registados para receitas |
| Descontos, devoluções e reembolsos | Integrados com stock e conta; anulação conjunta e limites acumulados |
| Backup/restauro | Integrado no Finanças e testado em SQLite/Electron |
| Importação Casa antigo/Excel | Fora da prioridade atual; compatibilidade JSON existente preservada |
| Preços online, sincronização e cloud | Fora do âmbito local, tal como no Casa 0.3.9 |

Critério de entrega desta versão: operações diárias implementadas, integridade, recuperação e atualização verificadas. As diferenças acima não são apresentadas como funcionalidades já concluídas.
