const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../finance.js');
test('v0.39.45+: eixos dos gráficos ficam numa coluna própria e sem abreviação mil',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','workspace.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','ui.css'),'utf8');
 assert.match(src,/summarySvgAxis/); assert.match(src,/summary-plot-svg/);
 assert.doesNotMatch(src,/\} mil €/); assert.match(css,/summary-plot-svg/);
});
