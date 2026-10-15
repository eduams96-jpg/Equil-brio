'use strict';
// Explicitly materialise and verify every runtime resource. electron-builder
// may omit globbed resources when isolated working copies use NTFS junctions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function verifyPackaged(context){
 const root=path.resolve(__dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),destination=path.join(context.appOutDir,'resources','app'),manifest=[];
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 for(const pattern of pkg.build.files){
  const directory=path.dirname(pattern),name=path.basename(pattern);
  if(path.isAbsolute(pattern)||pattern.split(/[\\/]/).includes('..')||directory.includes('*'))throw Error('Padrão de recurso inválido: '+pattern);
  const regex=new RegExp('^'+name.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*')+'$');
  const names=name.includes('*')?fs.readdirSync(path.join(root,directory)).filter(n=>regex.test(n)):[name];
  if(!names.length)throw Error('Recurso de execução ausente: '+pattern);
  for(const item of names){
   const relative=path.join(directory,item),source=path.join(root,relative),target=path.join(destination,relative),bytes=fs.readFileSync(source);
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
   if(fs.lstatSync(target).isSymbolicLink()||hash(fs.readFileSync(target))!==hash(bytes))throw Error('Recurso empacotado divergente: '+relative);
   manifest.push({path:relative.split(path.sep).join('/'),sha256:hash(bytes),size:bytes.length});
  }
 }
 fs.writeFileSync(path.join(path.dirname(context.appOutDir),'RUNTIME-PACKAGE-SHA256.json'),JSON.stringify(manifest,null,2));
 console.log('Recursos de execução materializados e verificados: '+manifest.length);
};
