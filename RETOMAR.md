# Retomar o Equilíbrio

Estado em 29/10/2026. Lê isto primeiro quando voltares a pegar no projeto.

## Onde ficou

- **Windows 1.0.16** pronto em `entrega-v1.0.16/` (atualização `.fpupdate`, hash e instruções). Aceita instalações 1.0.14 e 1.0.15. Validado com instalação incremental e reposição automática numa cópia isolada.
- **Instalado neste PC:** 1.0.14 (até instalares a 1.0.16).
- **Android:** RC4, sem alterações desde a 1.0.15 (`entrega-v1.0.15/`).
- **Código:** ramo `correcoes-feedback-casa-planeamento`, 4 commits à frente do `main`, não enviados para o GitHub.
- **Testes:** 697 a passar (`npm test` em `equilibrio/`).

## Próximos passos, por ordem

1. **Instalar a 1.0.16.** Definições → Backup e Atualização: guardar cópia, escolher `entrega-v1.0.16/financas-pessoais-v1.0.16.fpupdate`, confirmar a versão depois de reiniciar. Rever no programa: Agenda, guardar um produto no catálogo, Prendas, Habitação, Veículos, sugestões de categoria num movimento novo.
2. **Juntar o ramo ao `main`** (o histórico do projeto é feito no `main`):
   ```bash
   git checkout main
   git merge --ff-only correcoes-feedback-casa-planeamento
   ```
3. **Ler Fatura** — o único ponto do feedback ainda por fazer. Precisa de 2–3 faturas reais (talão de supermercado e um PDF de fornecedor) e da descrição do que deve ficar preenchido. Código: `equilibrio/receipt-reader.js` (OCR), `receipt-model.js` (`parse`), `receipt-ui.js` e `receipt-assistance-ui.js`.
4. **Pendentes antigos que dependem de ti** (da 1.0.15):
   - Piloto físico da partilha entre os dois PCs e o telemóvel — guião em `PILOTO-FINAL.md`.
   - Guardar fora deste PC a chave de assinatura Android e a palavra-passe — `RECUPERACAO-DA-ASSINATURA.md`. Sem isto, perder o PC impede atualizar a app Android por cima.
5. **Git por arrumar:** a alteração a `.gitignore` e `historico/baselines/baseline-0.39.79/` já estavam por gravar antes desta ronda (referência mínima para um teste da Casa). Confirmar e fazer commit.

## O que foi feito nesta ronda (1.0.16)

- Corrigido: guardar produto editado (erro `Cannot read properties of null`); caminho da categoria duplicado ao criar produtos por níveis; botões da lista de compras ligados ao catálogo (partidos desde a 1.0.14); sugestões de categoria dos movimentos misturadas com as categorias dos produtos da Casa; avisos recalculados em cada mudança de página.
- Ajustado: Agenda (Por pagar / Já pago / Saldo previsto); Subscrições sem "Outras opções do serviço"; gráfico de distribuição no Resumo; catálogo com melhor preço e stock; seta em todos os níveis de categoria; Prendas sem cabeçalho nem orçamentos e com várias pessoas por ocasião; Habitação com valor patrimonial direto e ficha simplificada; Veículos sem abastecimento e filtro de manutenção; Equipamentos com histórico separado e rotinas compactas.
- Verificado com uma cópia dos dados reais (apagada no fim): 41 ecrãs e 81 formulários sem erros.

## Como trabalhar no código

Dentro de `equilibrio/` (Windows, Node.js 24):

```bash
npm test
```

```bash
npm run styles:build
```

```bash
npm run desktop
```

- **CSS:** editar só `ui-styles/*.css` (cada regra precisa de um comentário `/* @order N */` único) e depois `npm run styles:build`; `ui.css` é gerado. As correções desta ronda estão em `ui-styles/round-117.css`.
- **Pré-visualização no browser:** `node serve.cjs` e abrir `http://localhost:4173` (modo demonstração, sem SQLite).
- **Quebras de linha:** muitos ficheiros são CRLF. `sed -i` no Git Bash converte para LF e gera diffs gigantes — confirmar com `git diff --stat` antes de fazer commit.
- **Armadilhas encontradas:** vários scripts movem e escondem elementos de outros scripts (`workbench-ui.js`, `approved-visual-ui.js`); seletores globais como `document.querySelectorAll('[data-...]')` apanham botões de outras páginas — limitar sempre ao formulário. Há regras `display:none!important` antigas que podem esconder secções inteiras.

## Gerar a próxima atualização

1. `node scripts/advance-version.cjs 1.0.17 "Descrição"` (repor CRLF em `package.json`, `package-lock.json`, `desktop/version.cjs` se o diff ficar gigante).
2. Criar `DESKTOP-v1.0.17.md` e uma entrada no topo de `ATUALIZACOES.md`; correr `node scripts/check.cjs` e `npm test`.
3. Gerar a partir da versão instalada mais antiga a suportar (ex.: baseline 1.0.16, aceitando até 1.0.16):
   ```bash
   node scripts/package-release.cjs ../historico/baselines/baseline-1.0.16 ../entrega-v1.0.17 1.0.16
   ```
4. Validar (instala numa cópia e testa a reposição):
   ```bash
   ELECTRON_PATH="$PWD/node_modules/electron/dist/electron.exe" node integration/validate-incremental-package.cjs ../historico/baselines/baseline-1.0.16 ../entrega-v1.0.17
   ```
5. Guardar a baseline nova: `node scripts/advance-version.cjs --snapshot`.

## Dados pessoais

Ficam em `%APPDATA%\Financas Pessoais\financas.db`, fora do projeto e do Git. Para testar com dados reais, trabalhar sempre sobre uma cópia.

## Fora de âmbito (decidido)

Novas funcionalidades e reorganização da arquitetura (CSS de ~920 KB em camadas, ~40 mil elementos carregados, scripts que alteram ecrãs uns dos outros). Só compensa se o projeto continuar a evoluir a longo prazo.
