# Equilíbrio Windows 1.0.11

Correção da apresentação do Resumo e do botão de avisos.

- Contas, Últimos movimentos e Próximos pagamentos passam a usar uma coluna com a largura completa do quadro. Os valores alinham à direita.
- A altura dos cartões acompanha os registos apresentados, evitando linhas e ícones cortados nas listas do Resumo.
- O botão Avisos mantém a apresentação discreta com zero, um ou vários avisos. A prioridade continua identificada no contador e no Centro de avisos.

Ensaios com quatro contas, oito movimentos (cinco apresentados) e pagamentos agendados; larguras 390, 768, 1440, 1920 e 2560, temas claro e escuro, Chromium e Electron real. Quatro estados de avisos: nenhum, próximo, urgente e vários. As larguras de todas as linhas são medidas; é verificado que a primeira e a última não ficam cortadas.

Atualizar da 1.0.10 com `financas-pessoais-v1.0.11.fpupdate` pelo método habitual de Backup e Atualização. Instalação habitual e dados pessoais preservados; ensaios com dados sintéticos.
