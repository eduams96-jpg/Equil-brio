### Task 1: Peças comuns de interface

**Files:**
- Create: `android/app/src/ui/kit.cjs`, `android/app/src/ui/icons.cjs`
- Test: `android/app/src/ui/kit.test.cjs`

**Interfaces:**
- Produces (`kit.cjs`): `escape(value): string`; `money(cents:number, hidden:boolean): string` (Intl `pt-PT` EUR, `'•••• €'` quando oculto); `tile({tone:'green'|'amber'|'red'|'purple'|'blue', icon:string, label:string, value:string, detail?:string, page?:string}): string` (`<article class="ch-tile is-…">`, que passa a `<button data-page>` quando há `page`); `pills(name:string, options:{value,label,count?}[], selected:string): string` (`<div class="cs-pills" role="tablist">`, botões com `data-pill-<name>` e `aria-pressed`); `card({title, subtitle?, body, className?}): string`; `search(id, value, placeholder): string`; `errorCard(message): string` («Não foi possível calcular: …»); `syncStamp(isoOrNull, now:Date): string` («Dados de há 5 min», «Dados de há 2 h», «Dados de ontem», «Ainda não sincronizado»).
- Produces (`icons.cjs`): `icon(name): string` (SVG inline com `aria-hidden="true"`, ou `''` se o nome não existir). Os SVG são copiados de `equilibrio/interface-ui.js` para os nomes `chart, account, box, alert, cart, calendar, bell, home, list, settings, link, plus, search, check, arrow`. Se algum nome não existir lá, usa-se o mais próximo e regista-se o mapeamento num comentário.

- [ ] **Step 1: Write the failing tests** em `kit.test.cjs`: `money(123456,false)==='1234,56 €'` (comparar depois de normalizar NBSP); `money(5,true)==='•••• €'`; `escape('<a "x">')==='&lt;a &quot;x&quot;&gt;'`; `tile({tone:'red',icon:'alert',label:'Avisos',value:'3',page:'avisos'})` contém `class="ch-tile is-red"`, `data-page="avisos"` e um `<svg`; `pills('estado',[{value:'a',label:'A'},{value:'b',label:'B'}],'b')` tem `aria-pressed="true"` só em `b`; `syncStamp(null,now)==='Ainda não sincronizado'`; `syncStamp(new Date(now-5*60e3).toISOString(),now)==='Dados de há 5 min'`; `errorCard('x<y')` contém `x&lt;y`.
- [ ] **Step 2: Run** `node --test android/app/src/ui/kit.test.cjs`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `kit.cjs` e `icons.cjs` com as assinaturas acima.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit** `git add android/app/src/ui && git commit -m "Android: peças comuns de interface"`

