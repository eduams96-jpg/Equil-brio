# Validação da versão 1.0.0

Referência anterior: 0.41.10. O proprietário autorizou a passagem a 1.0, o instalador, a organização das pastas e a publicação privada. Acrescentou o link opcional nos produtos.

- 37 conjuntos de validação e 587 testes automáticos aprovados. Os seletores históricos foram adaptados para manter todos os conjuntos ativos em versões 1.x; seis asserções antigas exigiam indevidamente um major 0.
- Produto com link HTTP/HTTPS: gravação, edição, limpeza, recarga e reabertura de SQLite; protocolos executáveis e credenciais recusados sem mutação.
- OCR de imagem e extração de PDF executados de verdade, com pedidos externos bloqueados. O afterPack materializa e confere os 102 recursos; a primeira conferência detetou oito recursos WASM omitidos pelo empacotador em junctions. O instalador foi regenerado e substituiu a instalação preliminar.
- Executável empacotado e executável realmente instalado: arranque, privacidade no login, produto com link, gravação e reabertura num perfil temporário marcado.
- Atualização 0.41.10 → 1.0.0 e rollback: ficheiros conferidos e SQLite intacto.
- Atualização futura sintética com escrita direta recusada: elevação real, instalação válida e reversão de falha parcial aprovadas. Interrupção simulada: recuperação elevada anterior à abertura de SQLite aprovada. A versão sintética 1.0.1 não foi aplicada ao programa real.
- Instalador NSIS executado com resultado 0; aplicação instalada em Programas (x86), registo do Windows 1.0.0 e atalhos confirmados. Executável de 64 bits. O instalador não tem assinatura Authenticode comercial.

Perfis pessoais e dados reais não usados nos testes. Identidade SQLite e diretório de dados mantidos. A desinstalação conserva os dados por configuração; a desinstalação da aplicação real não foi executada. A instalação e os recursos são conferidos por SHA-256 na entrega.

Primeiras tentativas dos ensaios e correções dos próprios instrumentos de teste ficam preservadas no arquivo local de evidência. O histórico completo local não é substituído pela cópia privada do código no GitHub.
