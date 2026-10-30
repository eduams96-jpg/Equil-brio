# Retomar o Equilíbrio

Estado em 30/10/2026. Lê isto primeiro quando voltares a pegar no projeto.

## Onde ficou

- **Windows 1.0.17** pronto em `entrega-v1.0.17/` (atualização `.fpupdate`, hash e instruções). Aceita a instalação 1.0.16. Validado com instalação incremental e reposição automática numa cópia isolada.
- **Instalado neste PC:** 1.0.16 (até instalares a 1.0.17).
- **Android:** RC4, sem alterações desde a 1.0.15 (`entrega-v1.0.15/`).
- **Código:** tudo gravado no `main` (o ramo `correcoes-feedback-casa-planeamento` foi junto ao `main`). Não enviado para o GitHub.
- **Testes:** 701 a passar (`npm test` em `equilibrio/`).
- **`historico/`:** a pasta desapareceu do disco em 30/10/2026. Foram repostos do Git as baselines usadas nos testes e dois guias; a baseline 1.0.16 foi reconstruída do commit `15e4a48` (os 34 ficheiros da entrega 1.0.16 coincidem por hash). As entregas até 1.0.14 e a baseline 0.39.79 (só usada num benchmark de integração) perderam-se.

## Próximos passos, por ordem

1. **Instalar a 1.0.17.** Definições → Backup e Atualização: guardar cópia, escolher `entrega-v1.0.17/financas-pessoais-v1.0.17.fpupdate`, confirmar a versão depois de reiniciar. Rever no programa: Agenda (vista Calendário, menu «•••»), Planos e decisões, Património → Inventário, Casa → Equipamentos (Habitação, Veículos, Rotinas) e Gerir catálogo. No catálogo, carregar em «Retirar categorias» para limpar as categorias antigas dos produtos.
2. **Ler Fatura** — adiado. Precisa de 2–3 faturas reais (talão de supermercado e um PDF de fornecedor) e da descrição do que deve ficar preenchido. Código: `equilibrio/receipt-reader.js` (OCR), `receipt-model.js` (`parse`), `receipt-ui.js` e `receipt-assistance-ui.js`.
3. **Pendentes que dependem de ti** (da 1.0.15):
   - Piloto físico da partilha entre os dois PCs e o telemóvel — guião em `PILOTO-FINAL.md`.
   - Guardar fora deste PC a chave de assinatura Android e a palavra-passe — `RECUPERACAO-DA-ASSINATURA.md`. Sem isto, perder o PC impede atualizar a app Android por cima.

## O que foi feito na 1.0.17

- Ecrã inicial com as opções lado a lado; Revisão e análise sem a Revisão semanal.
- Agenda: cartão do dia e Subscrições à altura do calendário, com scroll; o menu de ações abre por cima da página (`workspace.js`, portal `.agenda31-menu-portal`).
- Em cartões: Planos e decisões, Inventário (totais por tipo, Apagar, conferências recolhidas), Habitação e Veículos (`dossiers-ui.js`, classes `dossier2-*`), Rotinas.
- Catálogo: menor preço destacado, filtro Ativos/Arquivados/Todos, eliminar produtos sem histórico (`CasaFinance.removeProduct`), sem Limites, produtos sem categoria nem «Categorias por loja», limpeza das antigas (`CasaFinance.clearProductCategories`).

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

- **CSS:** editar só `ui-styles/*.css` (cada regra precisa de um comentário `/* @order N */` único) e depois `npm run styles:build`; `ui.css` é gerado. As alterações da 1.0.17 estão em `ui-styles/round-118.css`. Um ficheiro novo em `ui-styles/` tem de ser acrescentado à lista em `tests/frontend-03953.cjs`.
- **Pré-visualização no browser:** `node serve.cjs` e abrir `http://localhost:4173` (modo demonstração, sem SQLite).
- **Quebras de linha:** muitos ficheiros são CRLF. `sed -i` no Git Bash e `scripts/advance-version.cjs` convertem para LF e geram diffs gigantes — confirmar com `git diff --stat` antes de fazer commit.
- **Armadilhas encontradas:** vários scripts movem e escondem elementos de outros scripts (`workbench-ui.js`, `approved-visual-ui.js`); seletores globais como `document.querySelectorAll('[data-...]')` apanham botões de outras páginas — limitar sempre ao formulário. Há regras antigas com `!important` e seletores fortes (ex.: `#plansHub #unifiedPlans>.u-plans-list`); as novas usam seletores igualmente específicos. Os painéis com `container-type` cortam menus absolutos e fixos.

## Gerar a próxima atualização

1. `node scripts/advance-version.cjs 1.0.18 "Descrição"` (repor CRLF em `package.json`, `package-lock.json`, `desktop/version.cjs`).
2. Criar `DESKTOP-v1.0.18.md` e uma entrada no topo de `ATUALIZACOES.md`; correr `node scripts/check.cjs` e `npm test`.
3. Gerar a partir da versão instalada mais antiga a suportar (ex.: baseline 1.0.17, aceitando até 1.0.17):
   ```bash
   node scripts/package-release.cjs ../historico/baselines/baseline-1.0.17 ../entrega-v1.0.18 1.0.17
   ```
4. Validar (instala numa cópia e testa a reposição):
   ```bash
   ELECTRON_PATH="$PWD/node_modules/electron/dist/electron.exe" node integration/validate-incremental-package.cjs ../historico/baselines/baseline-1.0.17 ../entrega-v1.0.18
   ```
5. Guardar a baseline nova: `node scripts/advance-version.cjs --snapshot`.

## Dados pessoais

Ficam em `%APPDATA%\Financas Pessoais\financas.db`, fora do projeto e do Git. Para testar com dados reais, trabalhar sempre sobre uma cópia.

## Fora de âmbito (decidido)

Novas funcionalidades e reorganização da arquitetura (CSS de ~950 KB em camadas, ~40 mil elementos carregados, scripts que alteram ecrãs uns dos outros). Só compensa se o projeto continuar a evoluir a longo prazo.
