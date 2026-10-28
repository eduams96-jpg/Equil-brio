# Equilíbrio

Fonte Windows **1.0.15** em `equilibrio/`; Android **0.9.0-rc.4** em `android/`. SQLite mantém os dados locais. Candidatas preparadas para o piloto; a homologação nos equipamentos reais ainda está pendente.

[Roadmap único](ROADMAP-ATUAL.md) · [Guia da candidata](GUIA-CANDIDATA.md) · [Android](android/README.md)

A entrega local `entrega-v1.0.15/` reúne instalador Windows, atualização .fpupdate, APK assinado e hashes. O atualizador aceita **1.0.11 a 1.0.14** diretamente. A instalação inicial mantém `C:/Program Files (x86)/Equilibrio`; os dados ficam fora da instalação, em `%APPDATA%/Financas Pessoais`. Baselines e entregas anteriores foram preservadas.

Um PC central com o programa aberto pode partilhar um espaço com outros PCs e Android. Os clientes trabalham offline e sincronizam por ação explícita. Não abrir o mesmo SQLite numa pasta de rede. Associação e HTTPS são obrigatórios; conflitos não substituem silenciosamente o trabalho local. Sincronização não substitui cópias de segurança.

## Desenvolvimento

Windows de 64 bits e Node.js 24. Dentro de `equilibrio/`: `npm ci`, `npm test`, `npm run desktop:check`, `npm run styles:check` e `npm run desktop`. Instalador: `npm run desktop:build:win`. CSS editável em `ui-styles/`, compilado com `npm run styles:build`.

As referências mínimas dos testes estão em `historico/baselines/`. Android usa as mesmas regras de `equilibrio/mobile-sync/shared/`. Instruções em `android/README.md`.

## Preservação e limites

O GitHub privado recebe código e recursos; não recebe dados pessoais, perfis, backups, chaves, credenciais ou instaladores. Relatórios locais: `coordenacao/relatorios/FECHO-001/`. A instalação habitual e os dados pessoais não foram alterados.

Restam o piloto no telefone e segundo PC reais, instalação Windows no destino habitual e guarda externa recuperável da chave Android. Faturas/PDFs reais e 16 embalagens incompletas do Excel continuam identificados no roadmap. Preços online, novas funcionalidades de IA, servidor público e publicação em loja ficam fora deste fecho.

[Avisos de terceiros](equilibrio/THIRD-PARTY-NOTICES.txt)
