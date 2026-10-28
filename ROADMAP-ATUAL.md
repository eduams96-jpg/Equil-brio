# Equilíbrio — roadmap final de fecho

28/10/2026 · 01 — Direção · Documento ativo de execução e fecho.

**Objetivo:** entregar Windows e Android para utilização diária, com uma única solução de partilha entre dispositivos, recuperação comprovada e projeto organizado. Depois deste roteiro, termina o desenvolvimento contínuo; ficam apenas manutenção corretiva e pedidos futuros separados.

Execução autorizada pelo proprietário: «Ok, avança com o que for teu». Direção executa as partes independentes em ambiente isolado, prepara as candidatas e mantém separados os testes físicos e a guarda externa da chave. Não ligar os dados pessoais nem alterar a instalação habitual durante os ensaios. Estado de execução em coordenacao/ESTADO.md.

**Este é o único roadmap ativo.** Os restantes roadmaps são registos históricos; as suas listas antigas de «por fazer» não constituem trabalho adicional.

## Execução técnica — 28/10/2026

Windows **1.0.15** e Android **RC4** preparados; guia único em GUIA-CANDIDATA.md e entrega em entrega-v1.0.15/. Relatório local: coordenacao/relatorios/FECHO-001/RELATORIO.md.

| Etapa | Estado atual |
|---|---|
| 1 — Windows | Consolidação e regressão técnica concluídas: 697 testes |
| 2 — Partilha | Cliente Windows e Android ensaiados com o central isolado; rede física pendente |
| 3 — Android | Fonte canónica, 194 testes e candidata assinada; piloto físico pendente |
| 4 — Pacotes | Instalador/atualização/APK conferidos; atualização e rollback em cópias passaram; destino Windows final por confirmar no piloto |
| 5 — Piloto | Preparado no guia; aguarda telefone e segundo PC reais |
| 6 — Fecho | Fontes e instruções consolidadas; publicação/limpeza registadas no relatório; guarda externa da chave pendente |

O ponto de partida abaixo é histórico. Não reiniciar estas etapas a partir das versões antigas. O fecho definitivo continua condicionado ao piloto e à chave recuperável fora do PC.

## 0. Ponto de partida confirmado

- Windows 1.0.14: funcionalidades e visuais aprovados integrados, baseline completa e atualização entregues; código publicado no GitHub privado.
- Casa, Prendas, Consumos, equipamentos, habitação, veículo, avisos, Dados, Definições, Ajuda e pesquisa em PDFs já têm desenvolvimento integrado. Entram na verificação final, não como novas funcionalidades.
- Android 0.9.0-rc.3: APK assinado existente. ANDROID-024 passou 122 testes automáticos e 13 verificações no APK em emulador, incluindo registo e reabertura sem rede.
- A ligação experimental existente foi ensaiada anteriormente com Windows 1.0.11. A compatibilidade com a versão final tem de ser renovada.
- Permanecem por confirmar o piloto num telefone e segundo PC reais, a guarda externa recuperável da chave Android e os documentos reais de faturas/PDFs.
- Há 16 linhas do Excel com embalagem por indicar. São decisões sobre dados pessoais, não 16 funcionalidades por implementar.

## Âmbito que fechamos

Windows mantém as funcionalidades e o visual aprovados. Android cobre os percursos acordados de Resumo, contas, movimentos/transferências, Agenda e Casa → Compras e Stock. Os registos especializados que não tenham edição integral no Android devem conservar todos os campos e permanecer protegidos contra alterações incompletas.

A partilha proposta usa um PC central com o programa/ligação em funcionamento e acesso privado pelos outros PCs e Android. Cada dispositivo conserva estado local para trabalhar offline. Não se abre o mesmo SQLite diretamente numa pasta de rede. Cópias de segurança continuam independentes da sincronização.

A instalação de um servidor autónomo permanente, alojamento externo, exposição pública à Internet e publicação em loja não são requisitos deste fecho. Uma eventual alteração desse âmbito é decidida antes de iniciar a etapa 2.

## Sequência de execução

| Etapa | Resultado concreto | Quem executa |
|---|---|---|
| 1 | Windows consolidado e lista de defeitos fechada | Direção |
| 2 | Partilha privada entre PCs e Android concluída em ambiente isolado | Direção |
| 3 | Android preparado para utilização diária e atualização | Direção |
| 4 | Candidatas finais empacotadas e verificadas | Direção |
| 5 | Um piloto guiado nos equipamentos reais e correção dos defeitos encontrados | Direção + proprietário |
| 6 | Entregas finais, fontes publicadas, recuperação, limpeza e encerramento | Direção; proprietário participa na guarda externa |

As etapas 2 e 3 podem sobrepor-se quando forem independentes. O piloto offline com a RC3 existente pode começar antes. A promoção definitiva depende do resultado do piloto e da conferência dos ficheiros finais.

## 1. Consolidar o Windows

- Conferir que a versão executada, os recursos carregados e o pacote entregue correspondem à mesma fonte. As imagens de validação têm de representar o programa efetivamente instalado.
- Resolver divergências de identificação/metadados no próximo pacote: a fonte 1.0.14 ainda contém uma descrição de pacote com «v1.0.12». Não alterar retroativamente a baseline nem a entrega congelada.
- Fechar defeitos reproduzidos nos percursos existentes: movimentos, transferências, recorrências anuais/bimestrais, subscrições, avisos, Planos, património e Casa. Preservar os visuais aprovados.
- Confirmar importação do Excel com variantes, preços e links por supermercado, reimportação sem repetir stock e tratamento explícito das linhas incompletas.
- Confirmar cópia/restauro do espaço escolhido: substituir o conteúdo conforme a opção apresentada, sem criar inesperadamente outro «recuperado» nem modificar outros espaços. Incluir anexos e ícones necessários ao uso noutro PC.
- Avaliar apenas atrasos reproduzidos e corrigir a sua causa. Reutilizar os resultados já aprovados; repetir testes quando uma alteração, falha ou risco novo o justificar.

**Fecha quando:** não houver defeitos conhecidos que alterem valores, percam/dupliquem dados, impeçam os percursos essenciais ou apresentem uma entrega diferente da fonte validada.

## 2. Concluir a partilha entre dispositivos

- Consolidar o desenho de PROPOSTA-DADOS-PARTILHADOS.md e o contrato existente: uma autoridade central, espaços separados, dispositivos autorizados e recuperação definida.
- Integrar a versão Windows final e o Android atual sobre o desenvolvimento existente; identificar os campos/comandos não suportados antes de permitir gravações.
- Implementar/verificar o envio nos dois sentidos, operações offline duráveis, confirmação do estado recebido e indicação simples de alterações por enviar ou problemas.
- Conservar campos, anexos e ícones necessários. Uma edição móvel não pode apagar informação especializada que o formulário não representa.
- Resolver alterações simultâneas de forma explícita. Repetir um envio ou perder a resposta não pode duplicar movimentos, pagamentos ou alterações de stock.
- Proteger a associação e a comunicação, permitir revogar um dispositivo e recusar versões incompatíveis sem sobrescrever dados.
- Tratar restauro da base central, mudança de PC e reconexão de aparelhos antigos: operações anteriores não podem ser reaplicadas indevidamente sobre os dados restaurados.
- Ensaiar primeiro num PC central de teste, segundo cliente Windows isolado e Android emulado, com dados fictícios e leitura independente dos resultados.

**Fecha em laboratório quando:** os três clientes convergirem para os mesmos dados após edição, interrupção, repetição, conflito e recuperação. A rede e os equipamentos reais são confirmados na etapa 5.

## 3. Fechar o Android

- Completar/corrigir os percursos acordados: consultar Resumo; gerir contas; registar/editar movimentos e transferências simples; compromissos/pagamentos da Agenda; produtos, ofertas/links por supermercado, compras e stock.
- Conferir teclado, Voltar, cancelar, rascunhos, texto ampliado, temas e ocultação de valores; nenhum formulário incompleto pode gravar um movimento por engano.
- Verificar encerramento, suspensão e reabertura, mantendo operações locais e rascunhos, com ou sem ligação.
- Fechar exportação, escolha de ficheiro e recuperação; erro de palavra-passe ou ficheiro inválido não substitui dados.
- Manter a identidade e a chave de assinatura da app. A atualização tem de conservar os dados da RC3. Se houver dados no antigo protótipo, documentar a passagem explícita; não desinstalar para «resolver» a atualização.
- Rever avisos de compilação/dependências com impacto real e tratar bloqueios de utilização ou proteção dos dados.
- Preparar a atualização por APK assinado, com instruções simples. Acumular as alterações antes de gerar a candidata; não compilar um APK por pequeno ajuste.

**Fecha em laboratório quando:** todos os percursos essenciais funcionarem na candidata assinada e a atualização a partir da RC3 preservar dados, privacidade e histórico.

## 4. Validar as candidatas finais

- Produzir instalador Windows completo e .fpupdate coerentes com a mesma fonte; produzir o APK Android consolidado depois dos testes de fonte.
- Aplicar o pacote a cópias das versões Windows suportadas, incluindo a versão efetivamente instalada nos PCs do proprietário.
- Ensaiar instalação Windows limpa em Programas (x86), conforme o pedido original e mantendo a arquitetura existente, uso diário sem permissões administrativas desnecessárias, atualização e rollback, preservando os dados fora da pasta do programa.
- Ensaiar instalação Android limpa e atualização assinada, conferindo os recursos efetivamente incluídos, versão, identidade e ausência de dados/chaves de desenvolvimento.
- Executar os testes afetados pelas alterações e a regressão final proporcional. Nas páginas alteradas, conferir dados vazios/preenchidos, textos longos, temas e tamanhos de ecrã.
- Conferir hashes, versões, cópias e resultados de cada ficheiro que será entregue. Não validar apenas a pasta de desenvolvimento.

### Verificações obrigatórias de integridade

| Percurso | Resultado exigido |
|---|---|
| Transferência entre contas | Visível onde programada; não conta como despesa |
| Recorrência e pagamento | Data/frequência corretas; pagamento aplicado uma vez |
| Guardar/cancelar/retomar | Só gravam os dados confirmados; rascunhos recuperáveis |
| Restauro | Espaço certo, conteúdo esperado e restantes espaços preservados |
| Casa | Compras/stock coerentes; sem ligação financeira automática reintroduzida |
| Partilha | Sem perda de campos nem duplicação após repetição/conflito/interrupção |
| Atualização | Dados e preferências conservados; versão instalada corresponde ao pacote |
| Falha de atualização/recuperação | Estado anterior utilizável ou recuperação explícita comprovada |

**Fecha quando:** os ficheiros candidatos passarem estes percursos e não houver bloqueios de integridade, recuperação, atualização ou utilização essencial.

## 5. Fazer um piloto real único e guiado

Direção prepara os dados, o guião e a recolha dos resultados. O proprietário participa apenas no que exige os seus equipamentos ou documentos.

- Dois PCs: instalar/atualizar, abrir o espaço de ensaio, alterar em ambos, sincronizar, interromper/repor a ligação e confirmar os resultados.
- Telefone Android: instalar/atualizar, teclado/Voltar, registos locais, suspensão, encerramento, reinício e reconexão.
- Testar o seletor de ficheiros real para guardar/restaurar cópias; conferir palavra-passe errada e recuperação.
- Conferir confiança da ligação, associação/revogação e conservação dos espaços no ambiente real.
- Se houver documentos disponíveis, verificar Ler Fatura e pesquisa em PDFs com uma amostra representativa. Resultados incertos devem exigir revisão; uma leitura errada não pode gerar dados financeiros silenciosamente.
- Registar defeitos, corrigir os reproduzidos e repetir os percursos afetados. Não abrir uma nova ronda de redesenho.

**Fecha quando:** os percursos essenciais passarem nos equipamentos reais e o proprietário confirmar que consegue utilizar o conjunto. Enquanto não houver aparelho, a validação física fica pendente; não é substituída pela emulação.

As 16 embalagens do Excel podem ser completadas pelo proprietário com orientação da Direção. Se não houver documentos reais para os ensaios de faturas/PDFs, o adiamento já pedido fica registado com a limitação da função; não se promete certificação de documentos não testados.

## 6. Entregar, organizar e encerrar

- Incorporar as correções do piloto, conferir os ficheiros finais e repetir as verificações afetadas se a candidata tiver mudado.
- Entregar numa pasta clara: instalador Windows, .fpupdate, APK assinado, notas da versão e instruções curtas de instalação, atualização, partilha e recuperação.
- Promover fontes Android e da ligação para uma localização definitiva. O projeto não pode depender exclusivamente de uma cópia ignorada em work/ para voltar a ser compilado.
- Publicar no GitHub privado as fontes finais Windows/Android/ligação e o necessário para reproduzir a compilação, com versões e referências coerentes. Excluir dados pessoais, Excel, anexos, perfis, credenciais e chaves.
- Confirmar uma cópia externa protegida da chave Android e um modo recuperável de acesso à palavra-passe. Não basta copiar apenas a proteção local vinculada ao Windows deste PC.
- Fazer a limpeza final inventariada: temporários, caches e cópias de trabalho comprovadamente dispensáveis. Preservar fontes, baselines, entregas, evidência essencial, dados, anexos e material de rollback. Verificar caminhos e dependências antes de apagar.
- Deixar um único ponto de entrada documental com versão final, onde está cada entrega, o que foi testado, limitações aceites e como retomar manutenção no futuro.
- Conferir que o conjunto consegue ser reconstruído a partir das fontes preservadas e dependências documentadas, sem depender de pastas de outros projetos não declaradas.

**Fecha quando:** entregas conferidas, código preservado/publicado, recuperação preparada, chave recuperável fora do PC e projeto organizado.

## Participação indispensável do proprietário

1. Disponibilizar um telefone Android e o segundo PC para o piloto guiado; Direção faz toda a preparação e automação possível.
2. Confirmar um local externo seguro para guardar a cópia recuperável da chave, sem a enviar no chat.
3. Indicar as embalagens em falta quando quiser completar esses dados; disponibilizar documentos reais quando retomar o teste adiado de faturas/PDFs.

Usar o PC já escolhido como central; confirmar a sua disponibilidade e o alcance privado da ligação antes da etapa 2. Nenhum bloqueio de equipamento impede concluir o restante trabalho independente.

## Definição de «programa concluído»

- Windows e Android cumprem os percursos acordados.
- A partilha privada passa o ensaio entre dois PCs e Android.
- Não há defeitos conhecidos de perda/duplicação de dados, valores financeiros errados, recuperação ou atualização.
- O piloto físico essencial passou; limitações e adiamentos opcionais estão escritos e aceites.
- Instalador, .fpupdate e APK finais correspondem às fontes validadas.
- Cópias, chave, fontes, instruções e rollback estão preservados.
- Projeto limpo e fontes finais no GitHub privado.

**Cumpridos estes critérios, encerramos o desenvolvimento.** Só regressamos por um defeito concreto ou um novo pedido do proprietário.

## Fora deste fecho — lista de futuro, sem execução automática

- Atualização automática de preços pelos links.
- IA adicional para além da assistência local aprovada e das correções de Ler Fatura.
- Servidor autónomo permanente, alojamento/cloud e acesso público pela Internet.
- Publicação na Play Store.
- Novas funcionalidades, módulos ou novos redesenhos visuais.
- Ligação automática Compras ↔ Movimentos retirada da interface por decisão do proprietário.

Estas ideias não impedem o encerramento. No final, serão entregues apenas como lista de possibilidades futuras.

## Referências

Estado: coordenacao/ESTADO.md. Passagem: coordenacao/PASSAGEM-DE-CONTEXTO.md. Relatório técnico atual: coordenacao/relatorios/FECHO-001/RELATORIO.md. Guia da candidata e piloto: GUIA-CANDIDATA.md. Proposta de partilha: coordenacao/PROPOSTA-DADOS-PARTILHADOS.md. ANDROID-024 e WIN-115 são referências históricas do ponto de partida.
