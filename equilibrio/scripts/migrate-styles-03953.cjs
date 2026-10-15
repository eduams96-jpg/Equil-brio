'use strict';
// Conversão única, a partir de uma cópia imutável da versão anterior.
const fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const root=path.resolve(__dirname,'..'),baseline=path.resolve(process.argv[2]||path.join(root,'../historico/baselines/baseline-0.39.52'));
const html=fs.readFileSync(path.join(baseline,'index.html'),'utf8');
const files=[...html.matchAll(/href="([^"?#]+\.css)"/g)].map(m=>m[1]);const chunks=[];
function visit(nodes,parents=[],source){for(const node of nodes){if(node.type==='comment')continue;
 if(node.type==='atrule'&&node.nodes&&['media','supports','container','layer'].includes(node.name)){visit(node.nodes,[...parents,node],source);continue;}
 let clone=node.clone();for(const parent of [...parents].reverse()){const wrap=parent.clone({nodes:[]});wrap.append(clone);clone=wrap;}
 const domains=new Set();const selectors=node.type==='rule'?node.selector.split(','):[];
 for(const s of selectors){let domain='common';if(/casa/i.test(s))domain='casa';else if(/modal|dialog|split-workbench|transaction-form/i.test(s))domain='forms';else if(/#dashboard|summary-|#attention|#monthlyReview/i.test(s))domain='summary';else if(/movement|#transactions|#advancedFilters/i.test(s))domain='movements';else if(/planner|planning|agenda|weekly|decision|subscription|#plan/i.test(s))domain='planning';else if(/wealth|asset|investment|portfolio|#netWorth/i.test(s))domain='wealth';else if(/analysis|report|insight|annual|#analytics/i.test(s))domain='analysis';else if(/settings|dataHub|backup|fileProtection|desktop-diagnostic|category-manager/i.test(s))domain='settings';domains.add(domain);}
 const domain=domains.size===1?[...domains][0]:'common';chunks.push({order:chunks.length+1,domain,css:clone.toString()+(clone.type==='atrule'&&!clone.nodes?';':''),source,line:node.source.start.line});
}}
for(const file of files)visit(postcss.parse(fs.readFileSync(path.join(baseline,file),'utf8'),{from:file}).nodes,[],file);
// Apenas regras inteiras exatamente repetidas no mesmo contexto. Não eliminar
// fallbacks, propriedades isoladas ou seletores por ausência no HTML estático.
const seen=new Set(),removed=[];for(let i=chunks.length-1;i>=0;i--){const c=chunks[i],signature=postcss.parse(c.css).toString().replace(/\/\*[\s\S]*?\*\//g,'').trim();if(seen.has(signature)){removed.push(c);chunks.splice(i,1);}else seen.add(signature);}
const directory=path.join(root,'ui-styles');fs.mkdirSync(directory,{recursive:true});
for(const domain of ['common','summary','movements','planning','wealth','analysis','casa','settings','forms'])fs.writeFileSync(path.join(directory,domain+'.css'),'/* Fonte de estilos: '+domain+'. @order preserva a cascata; novos blocos usam uma ordem única. */\n'+chunks.filter(c=>c.domain===domain).map(c=>'/* @order '+c.order+' */\n'+c.css).join('\n')+'\n');
fs.mkdirSync(path.join(root,'validacao'),{recursive:true});fs.writeFileSync(path.join(root,'validacao/frontend-03953-migration.json'),JSON.stringify({baseline:'0.39.52',files,kept:chunks.length,removedExactRules:removed.length,removed:removed.map(({css,...c})=>c),domains:Object.fromEntries([...new Set(chunks.map(c=>c.domain))].map(d=>[d,chunks.filter(c=>c.domain===d).length])),origins:chunks.map(({css,...c})=>c)},null,2));
fs.writeFileSync(path.join(root,'ui.css'),require('./build-styles.cjs').compile());
console.log(JSON.stringify({kept:chunks.length,removed:removed.length}));
