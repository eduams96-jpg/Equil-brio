'use strict';
const fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const root=path.resolve(__dirname,'..');
function compile(directory=path.join(root,'ui-styles')){
 const chunks=[],orders=new Set();
 for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.css')).sort()){
  const ast=postcss.parse(fs.readFileSync(path.join(directory,file),'utf8'),{from:file});let order=null;
  for(const node of ast.nodes){
   if(node.type==='comment'){
    const match=node.text.match(/^@order (\d+)$/);if(match){if(order!==null)throw Error('Marcador sem regra: '+file);order=Number(match[1]);}continue;
   }
   if(order===null||orders.has(order))throw Error('Ordem ausente ou repetida: '+file);
   orders.add(order);chunks.push({order,file,css:node.toString()+(node.type==='atrule'&&!node.nodes?';':'')});order=null;
  }
  if(order!==null)throw Error('Marcador final sem regra: '+file);
 }
 chunks.sort((a,b)=>a.order-b.order);
 return '/* Gerado por npm run styles:build. Editar ui-styles/*.css. */\n'+chunks.map(c=>c.css).join('\n')+'\n';
}
if(require.main===module){const output=compile(),target=path.join(root,'ui.css');if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error('ui.css desatualizado. Executa npm run styles:build.');console.log('Estilos: fontes válidas e bundle atualizado.');}else{fs.writeFileSync(target,output);console.log('ui.css gerado: '+Buffer.byteLength(output)+' bytes.');}}
module.exports={compile};
