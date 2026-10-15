'use strict';
// Candidatos apenas: os identificadores podem ser chamados por templates ou
// por nomes dinâmicos. A remoção exige confirmação e testes do fluxo.
const fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(root).filter(f=>f.endsWith('.js'));
const corpus=files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+fs.readFileSync(path.join(root,'index.html'),'utf8');
const candidates=[];
for(const file of files){const ast=acorn.parse(fs.readFileSync(path.join(root,file),'utf8'),{ecmaVersion:'latest',locations:true});
 function visit(n){if(!n||typeof n!=='object')return;
  if(n.type==='FunctionDeclaration'&&n.id){const name=n.id.name,escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const refs=[...corpus.matchAll(new RegExp('\\b'+escaped+'\\b','g'))].length;if(refs===1)candidates.push({file,line:n.loc.start.line,name});}
  for(const [k,v] of Object.entries(n)){if(k==='loc')continue;if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
 }visit(ast);
}
console.log(JSON.stringify({files:files.length,candidates,automaticRemoval:false},null,2));
