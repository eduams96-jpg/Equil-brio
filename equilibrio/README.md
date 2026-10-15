# Equilíbrio 1.0

Aplicação desktop de finanças pessoais e organização da Casa para Windows de 64 bits. SQLite é a fonte de verdade; os dados ficam fora da instalação, no perfil habitual do utilizador.

## Instalar e atualizar

Executar **Equilibrio-Setup-1.0.0.exe**. Destino inicial: `C:\Program Files (x86)\Equilibrio`. O instalador inclui o runtime; não exige Node.js ao utilizador.

As próximas alterações mantêm o método **.fpupdate**, em **Definições → Backup e Atualização**. O Windows pede autorização de administrador para atualizar ficheiros protegidos. Cancelar conserva a versão atual. Staging, cópia de reversão e recuperação mantêm-se.

A atualização para 1.0.0 é compatível com 0.41.10. Os dados existentes e a identidade da aplicação são preservados; desinstalar não apaga o perfil.

## Desenvolvimento e validação

Na pasta `equilibrio/` do repositório: `npm ci`, `npm test`, `npm run desktop` e `npm run desktop:build:win`. Os recursos OCR/PDF locais estão em `vendor-receipts/`; a validação histórica utiliza as baselines preservadas na pasta irmã `historico/baselines/`. A versão de Node deve suportar `node:sqlite` (Node 24 utilizado na validação).

Guia de utilização: [DESKTOP-v1.0.0.md](DESKTOP-v1.0.0.md). Arquitetura: [ARQUITETURA.md](ARQUITETURA.md). Histórico: [ATUALIZACOES.md](ATUALIZACOES.md).

A 1.0 inclui o link opcional do produto, além do âmbito aprovado e fechado na 0.41.10. Android e servidor permanecem adiados. Nenhuma base de dados pessoal, cópia de segurança ou chave privada pertence ao repositório.
