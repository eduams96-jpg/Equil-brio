# Equilíbrio — Windows 1.0.14

Planos e decisões reorganizados conforme proposta aprovada. [Roadmap atual](ROADMAP-ATUAL.md). Atualização manual compatível com 1.0.11/1.0.12/1.0.13: `entrega-v1.0.14/financas-pessoais-v1.0.14.fpupdate`, disponibilizada na entrega local. Fonte em `equilibrio/`; relatórios locais em `coordenacao/relatorios/WIN-115/`. Android RC3 mantida; sincronização PC/telemóvel adiada.

---

# Equilíbrio — Windows 1.0.13

Visuais aprovados de Dados, Definições e Ajuda aplicados. Atualização desde 1.0.11 ou 1.0.12: `entrega-v1.0.13/financas-pessoais-v1.0.13.fpupdate`. Relatório: `coordenacao/relatorios/WIN-114/RELATORIO.md`.

---

# Equilíbrio — Windows 1.0.12

Atualização manual desde 1.0.11: `entrega-v1.0.12/financas-pessoais-v1.0.12.fpupdate`. Relatório: `coordenacao/relatorios/WIN-113/RELATORIO.md`. Propostas de Dados/Definições/Ajuda na entrega, ainda não aplicadas.

---

# Equilíbrio — Windows 1.0.11

Atualização para a 1.0.10: `entrega-v1.0.11/financas-pessoais-v1.0.11.fpupdate`. Relatório: `coordenacao/relatorios/WIN-111/RELATORIO.md`.

# Equilíbrio — Windows 1.0.10

**Correção de compatibilidade · 27/10/2026:** para instalar a Windows 1.0.10, usar `entrega-v1.0.10/financas-pessoais-v1.0.10-compat.fpupdate`, que também aceita a revisão instalada 1.0.9.2. Conteúdo da aplicação inalterado; atualização/rollback e Electron validados numa cópia da instalação real. SHA-256 `7917DFD5A7E137A99CDD080125F47CA5C47C92D849078326A6162DB96F983EA1`. A instalação habitual foi preservada. Detalhes em `entrega-v1.0.10/LEIA-ME-COMPATIBILIDADE.md`.

Programa: `equilibrio/`. Atualização: `entrega-v1.0.10/financas-pessoais-v1.0.10.fpupdate`. Relatório: `coordenacao/relatorios/WIN-110/RELATORIO.md`. Instalação habitual preservada.

# Equilíbrio

Programa local de finanças pessoais, património, dossiês práticos e organização da Casa para Windows de 64 bits, com suporte a sincronização local Android. SQLite é a fonte de verdade; dados pessoais fora da instalação, em `%APPDATA%/Financas Pessoais`.

## Windows

Referência **1.0.9**, promovida após a ronda WIN-109 (Centro de avisos geral, equipamentos/rotinas/custo acumulado, consumos de água/luz/gás, pesquisa em PDFs, ficha do veículo, dossier da habitação e painel local Dispositivos; piloto Compras ↔ Movimentos opcional). Fonte em `equilibrio/`; atualização atual em `entrega-v1.0.9/financas-pessoais-v1.0.9.fpupdate`, validada desde `1.0.0` e `1.0.2` a `1.0.8`. Entregas anteriores preservadas. Consultar [estado atual](coordenacao/ESTADO.md) para os resultados e pendências.

Instalação inicial: `entrega-v1.0.0/Equilibrio-Setup-1.0.0.exe`, em `C:/Program Files (x86)/Equilibrio`. Atualizações em **Definições → Backup e Atualização**, pelo `.fpupdate`; não é necessário reinstalar.

## Desenvolvimento e validação

Na pasta `equilibrio/`: `npm ci`, `npm test`, `npm run desktop`. Verificação estática: `npm run desktop:check`. As referências históricas usadas pelos testes ficam em `historico/baselines/`.

## Android e ligação local

Candidata consolidada em `work/android-022/entrega-ensaio/` (`Equilibrio-Android-0.9.0-rc.2.apk` para distribuição com identidade `pt.equilibrio.mobile` e `Equilibrio-Android-0.1.0-prototipo.13.apk` para ensaio com identidade `pt.equilibrio.prototype`). Consultar [relatório ANDROID-022](coordenacao/relatorios/ANDROID-022/RELATORIO.md) e [guião de homologação física](coordenacao/relatorios/ANDROID-022/PILOTO-E-DISTRIBUICAO.md).

## Organização

[Guia dos chats](GUIA-CHATS-EQUILIBRIO.md), [mapa de pastas](PASTAS-DO-PROJETO.md) e [contexto operacional](coordenacao/PASSAGEM-DE-CONTEXTO.md). O GitHub privado contém apenas código e recursos locais do programa; não inclui dados pessoais, perfis, backups, chaves ou arquivos de trabalho. [Avisos de terceiros](equilibrio/THIRD-PARTY-NOTICES.txt).
