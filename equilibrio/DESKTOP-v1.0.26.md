# Equilíbrio Windows 1.0.26 — Correções sugeridas: descartar pendentes

Atualização sobre a 1.0.25. Aplica-se por .fpupdate em Definições → Backup e Atualização. Dados pessoais preservados.

Categorias: em «Correções sugeridas», o botão «Descartar todas as pendentes» tira da lista as correções que ainda não aplicaste. Pede confirmação. Não altera movimentos, categorias nem recorrências. As correções aplicadas continuam aplicadas.

Otimização: a validação de datas deixou de criar um objeto Date por cada data. A normalização dos dados fica mais rápida (com 20 mil movimentos, cerca de 25% menos tempo).

Correções:
- As teclas premidas fora de um campo deixaram de gerar um erro na consola (Documentos e recibos).
- Ir para «Contas» volta a abrir a conferência de saldos (usava uma variável errada e ficava fechada).
- A revisão semanal deixou de ser duplicada a cada atualização do ecrã. Os elementos repetidos acumulavam-se na página e gastavam memória em sessões longas.
- Os cartões de produto da Casa passam a ter nome acessível («Abrir ficha de …»).

## Validação

- Testes unitários: 712 a passar.
- Validação completa de release: **35 de 35 suites a passar** (relatório em `validacao/release-1026/`).
- Pacote de atualização (.fpupdate) a partir da baseline 1.0.20: validado, com SHA-256 e reversão em caso de corrupção.
- Testes de interface atualizados para os ecrãs redesenhados. Foram retiradas apenas as verificações de funcionalidades que já não existem: a revisão semanal como tópico separado e a seleção por teclado na lista de Stock.
- O Playwright passou a ser dependência do projeto (playwright-core 1.64.1), em vez de vir de uma pasta externa.

## Instalador completo

- `Equilibrio-Setup-v1.0.26.exe` (NSIS, x64, pt-PT): instala em `Program Files (x86)\Equilibrio`, cria atalhos no ambiente de trabalho e no menu Iniciar e regista «Equilíbrio» com a versão em Aplicações instaladas.
- Os dados pessoais ficam em `%APPDATA%\Financas Pessoais`, fora da pasta de instalação. A desinstalação não os apaga (`deleteAppDataOnUninstall: false`) e uma reinstalação ou atualização reaproveita-os.
- O mesmo `appId` impede instalações duplicadas: instalar por cima de uma versão anterior substitui-a.
- Instalador completo e pacote `.fpupdate` são independentes: o `.fpupdate` atualiza uma versão já instalada (1.0.20 a 1.0.25) sem reinstalar.
