# Equilíbrio — ponto de situação consolidado

28/10/2026 · Direção · Windows 1.0.14 · Android 0.9.0-rc.3.

## Windows: trabalho aprovado concluído

- Correções financeiras e de Agenda, transferências sem despesa, recorrências, subscrições, equipamentos e proteção de dados integradas nas rondas anteriores.
- Casa: Consumos, rotinas/manutenção, custo acumulado dos equipamentos, veículo, habitação, prendas e pesquisa local no conteúdo dos PDFs já implementados; não são funcionalidades por iniciar.
- Centro de avisos geral e respetivas preferências implementados. Dados, Definições e Ajuda seguem os visuais aprovados. Planos e decisões segue a proposta aprovada: lista/detalhe, ferramentas no topo e contexto aberto.
- Excel: importação/colagem com variantes por embalagem/marca/oferta e preservação dos links; reimportação sem repetir o stock inicial. Linhas sem embalagem exigem revisão antes da confirmação.
- Piloto Compras/Finanças retirado da interface por decisão do proprietário. Dados e ligações históricas preservados; não há ligação automática nova.
- Windows mantém SQLite e atualização manual por `.fpupdate`. Os resultados das cópias isoladas não substituem a utilização real nos equipamentos do proprietário.

## O que depende agora do proprietário

1. Aplicar a atualização Windows e conferir os percursos com o seu espaço habitual.
2. Testar guardar/restaurar cópias entre os dois PCs reais e confirmar os dados no destino.
3. Rever as embalagens não indicadas no Excel; não se inventam quantidades/unidades.
4. Avaliar Ler Fatura/Pesquisa em PDFs com documentos reais representativos e comunicar divergências. A leitura continua sujeita a revisão; os ensaios sintéticos não certificam todas as faturas.
5. Iniciar o piloto Android offline: instalar/atualizar, teclado/Voltar, suspensão/reabertura, cópias e recuperação. A RC3 existente já foi ensaiada em emulador; o telemóvel real continua pendente.
6. Confirmar a guarda externa segura da chave de assinatura Android. Não guardar chaves no repositório nem enviá-las pelo chat.

## Expressamente adiado

**Sincronização entre PC e telemóvel:** o proprietário quer avaliar essa parte mais tarde. Conservar código, contratos e provas existentes; não renovar nem ativar a ligação nesta ronda. Quando for retomada, verificar a compatibilidade com a versão Windows então escolhida e testar rede/certificado/conflitos no aparelho e segundo PC reais.

## Hipóteses para outra ronda

- Preços através dos links: análise existente em `coordenacao/relatorios/WIN-109/VIABILIDADE-PRECOS-LINKS.md`. A análise não equivale a recolha automática implementada; nenhuma recolha periódica foi ativada por esta ronda.
- Servidor permanente/Internet, distribuição em loja e funcionalidades adicionais dependem de âmbito próprio; não bloqueiam o piloto offline atual.

## Referências e preservação

Estado operativo: `coordenacao/ESTADO.md`; relatórios por ronda em `coordenacao/relatorios/`. Os planos de outubro anteriores conservam o seu valor histórico; o seu texto «por iniciar» não substitui este estado consolidado. Baselines, entregas, evidência e dados preservados. A publicação do código exclui perfis, bases pessoais, anexos, Excel, chaves, APKs e pacotes de ensaio.
