# Validação Windows 1.0.10 — 27/10/2026

- Ronda completa: 37 baterias de validação.
- Regressão: 665 testes automáticos; inclui 12 novos casos para crédito pago, prestações parciais, preferências por espaço, prendas por ano, operações atómicas e importação de stock/links.
- Chromium e Electron real: navegação, três comandos da Agenda em ciclos repetidos, Ver análises, configuração de avisos, Definições, catálogo, Excel com duas lojas e hiperligações, ficheiro inválido após pré-visualização válida, prendas e tutorial.
- Gestor de subscrições verificado a 390, 768 e 1440 px. As baterias existentes incluem temas claro/escuro, compras, restauro, transferências, relatórios, isolamento e desempenho.
- Reabertura Electron/SQLite e atualização/rollback documentados na entrega e na evidência da ronda.

A fonte recebida tinha 17 diferenças relativamente ao manifesto da entrega 1.0.9. Foram preservados os 323 ficheiros da fonte efetiva em `work/windows-110/source-before/`, além das baselines e entregas anteriores. Não se copiou uma baseline antiga sobre o desenvolvimento recebido.

O resumo dos erros observados na primeira execução está em `work/windows-110/evidence/FALHAS-INICIAIS.json`; os relatórios finais incluem as reverificações. Foram corrigidas falhas reais do catálogo, compras, avisos e disposição dos controlos. Os guiões antigos foram adaptados aos acessos aprovados para o simulador e Definições, e à desativação dos rascunhos que já existia na 1.0.9. A recuperação automática de rascunhos não é declarada testada nem disponível.

Todos os ensaios usam dados sintéticos e perfis isolados. Não se utilizaram dados pessoais nem se alterou a instalação habitual. Testes de modelos e ensaios de documentos sintéticos não certificam leitura de todas as faturas reais. Homologação Android num aparelho físico e ligação a um segundo PC continuam fora desta ronda.
