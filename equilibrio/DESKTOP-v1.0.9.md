# Equilíbrio Windows 1.0.9 — Avisos, rotinas, consumos, dossiês, PDFs e ligação Android

Aplicar o `.fpupdate` em **Definições → Backup e Atualização**. Compatível com Windows `1.0.0` e `1.0.2` a `1.0.8`. A instalação habitual não é modificada automaticamente.

## O que inclui a versão 1.0.9

1. **Centro de avisos geral**: agrega pagamentos próximos e em atraso, garantias de equipamentos e de movimentos, validades de produtos em stock, rotinas domésticas e renovações de veículos e habitação. Permite filtrar por origem e prioridade, abrir o registo de origem, adiar, dispensar, resolver ou reabrir o alerta sem pagar, apagar ou alterar silenciosamente o registo original.
2. **Equipamentos, manutenção, rotinas e custo acumulado**: permite registar rotinas domésticas recorrentes com checklist e histórico de execução, bem como calcular o custo acumulado efetivo de cada equipamento (preço de aquisição + intervenções efetivas + movimentos pagos associados sem dupla contagem), distinguindo previsões futuras e equipamentos sem plano.
3. **Casa → Consumos**: regista leituras de contadores de água (`m³`), eletricidade (`kWh`) e gás (`m³` ou `kWh`), calculando deltas e médias diárias em leituras cumulativas ou diretas, tratando substituições/resets de contador (`kind: 'reset'`) e intervalos incompletos sem inventar consumos nem criar movimentos financeiros.
4. **Ficha do veículo**: reúne matrícula/identificação, histórico de quilometragem, abastecimentos, manutenções, renovações (IUC, seguro, inspeção), documentos PDF anexados e resumo de custos sem duplicar movimentos financeiros.
5. **Dossier da habitação**: reúne imóveis/habitações, renovações, documentos PDF anexados e ligações diretas a equipamentos, rotinas, património e despesas associadas.
6. **Pesquisa local no conteúdo dos PDFs**: indexa texto extraído localmente (incluindo OCR local quando disponível) em PDFs de movimentos, equipamentos, veículos e habitação, mantendo os ficheiros originais intactos mesmo quando um PDF falha ou está corrompido.
7. **Ligação local Dispositivos (Android ↔ Windows)**: integra o painel **Dispositivos** na barra superior para iniciar/parar o anfitrião local com a janela aberta, preparar certificado HTTPS protegido por DPAPI, gerar códigos temporários de associação por espaço e revogar dispositivos, preservando todos os domínios de `1.0.8` e `1.0.9`.
8. **Piloto Compras ↔ Movimentos e Leitura de faturas**: preserva o piloto opcional desligado por defeito em cada espaço e mantém a revisão obrigatória antes de gravar qualquer fatura ou recibo.
