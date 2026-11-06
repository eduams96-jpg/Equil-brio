'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

test('A notificação com compra por guardar navega diretamente ao descartar (sem botão solto)', () => {
  assert.ok(!source.includes("const stub=document.createElement('button')"), 'sem botão solto fora do documento');
  assert.ok(source.includes('shopPendingButton={page:target}'));
  assert.ok(source.includes("if(next&&typeof next.page==='string')"));
  assert.ok(source.includes('const target=next.page;run(async()=>{renderedPage=null;page=target;});return;}'));
});
