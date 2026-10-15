# Equilíbrio 1.0

Projeto privado de finanças pessoais e organização da Casa para Windows de 64 bits.

O programa encontra-se em `equilibrio/`. O instalador coloca-o inicialmente em `C:\Program Files (x86)\Equilibrio`, com atalhos e desinstalador. Os dados continuam em `%APPDATA%\Financas Pessoais`; SQLite é a fonte de verdade. As próximas versões continuam a utilizar `.fpupdate` em **Definições → Backup e Atualização**.

## Desenvolvimento

Na pasta `equilibrio/`: `npm ci`, `npm test` e `npm run desktop`. Para gerar o instalador: `npm run desktop:build:win`. Node 24 foi utilizado para a validação. O instalador inclui o runtime, sem exigir Node ao utilizador.

Para a validação completa, instalar também a ferramenta de testes com `npm install --no-save --package-lock=false playwright` e, se não existir navegador compatível, `npx playwright install chromium`. Executar `npm run test:release`. As baselines mínimas utilizadas pela ronda atual estão preservadas em `historico/baselines/`; os restantes arquivos históricos permanecem no projeto local.

Guia: [DESKTOP-v1.0.0.md](equilibrio/DESKTOP-v1.0.0.md). Validação: [AUDITORIA-v1.0.0.md](equilibrio/AUDITORIA-v1.0.0.md). Componentes de terceiros: [avisos](equilibrio/THIRD-PARTY-NOTICES.txt).

O repositório contém código e recursos locais do programa, incluindo OCR/PDF. Não contém bases de dados pessoais, perfis, cópias de segurança, chaves privadas, arquivos de trabalho ou o instalador compilado. A entrega compilada fica na pasta local de entrega.

Android e servidor permanecem adiados. Alterações futuras partem desta versão e mantêm o método de atualização existente.
