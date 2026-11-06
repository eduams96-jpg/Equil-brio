### Task 2: CSS novo e pré-visualização estática

**Files:**
- Modify (reescrita): `android/app/src/style.css`
- Create: `android/app/scripts/preview.cjs`, `android/app/scripts/preview-serve.cjs`, `android/app/src/screens/fixtures.cjs`
- Modify: `.claude/launch.json` (nova configuração `android-preview`, porta 4174)
- Modify: `.gitignore` em `android/` (acrescentar `app/www-preview/`)

**Interfaces:**
- Produces: `fixtures.cjs` → `empty()`, `demo()` (a partir de `P.fixture()` de `android/shared/protocol.cjs`, com `casa.shopping`, `investments`, `assets`, `debts`, `wealthHistory` e `pendingPayments` preenchidos), `ctx(ledger, overrides?)` → `{ledger, state:{hidden:false}, today:'2026-11-05', lastSync:null, settings:{notifications:false, hour:9, theme:'auto', hideOnOpen:false}, ...overrides}`. É o mesmo `ctx` que os ecrãs recebem em produção (Task 3).
- Produces: `node android/app/scripts/preview.cjs` gera `android/app/www-preview/<ecrã>-<demo|vazio>-<claro|escuro>.html` e um `index.html` com ligações. Cada página tem `style.css` e o HTML de `render(ctx)` dentro da moldura da app (cabeçalho e barra inferior). `preview-serve.cjs` serve essa pasta na porta 4174.

- [ ] **Step 1: Obter os tokens efetivos do PC.** Arrancar a configuração `equilibrio` (porta 4173) e ler `getComputedStyle(document.body)` de `--ink --muted --line --paper --blue --green --red` e de âmbar e roxo, nos temas claro e escuro. Copiar os valores para `:root` e para `@media (prefers-color-scheme: dark)` / `[data-theme=dark]` em `style.css`. Copiar também as regras de `.ch-tile`, `.ch-tile-icon`, `.cs-pills` e `.cs-search` de `equilibrio/ui-styles/round-120.css`, sem os seletores `:is(#page…)`.
- [ ] **Step 2: Escrever o resto de `style.css`:** moldura (cabeçalho, `main` com scroll, barra inferior fixa com 4 botões e FAB «+» acima à direita), `.card`, `.row`, `.amount`, formulários e diálogos que já existem, tema forçado por `html[data-theme]`. Alvos de toque com pelo menos 44 px.
- [ ] **Step 3: Implementar `preview.cjs` e `preview-serve.cjs`.** Nesta tarefa o preview só tem a página «moldura» com um mosaico de cada cor. Os ecrãs juntam-se a partir da Task 3.
- [ ] **Step 4: Verify.** `preview_start {name:'android-preview'}`, abrir a moldura a 375×812 em claro e escuro, `read_console_messages` sem erros, capturas. Medir com `document.documentElement.scrollWidth <= 375` a confirmação de que não há scroll horizontal.
- [ ] **Step 5: Commit** `git commit -m "Android: CSS com a identidade do PC e pré-visualização"`

