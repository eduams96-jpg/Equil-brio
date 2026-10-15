'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{validateDraft}=require('../productivity-model.js');
function draftStore(directory){
 const folder=path.join(directory,'form-drafts');
 const file=space=>{if(typeof space!=='string'||!space||space.length>200)throw Error('Espaço inválido.');return path.join(folder,crypto.createHash('sha256').update(space).digest('hex')+'.json');};
 return {read(space){const target=file(space);let damaged=false;for(const p of [target,target+'.previous']){try{const value=validateDraft(JSON.parse(fs.readFileSync(p,'utf8')));if(value.space!==space)throw Error('Espaço do rascunho inválido.');return value;}catch(e){if(e.code!=='ENOENT')damaged=true;}}if(damaged)throw Error('Não foi possível recuperar o rascunho.');return null;},
 write(space,value){const target=file(space),validated=validateDraft(value);if(validated.space!==space)throw Error('Espaço do rascunho inválido.');fs.mkdirSync(folder,{recursive:true});const temp=target+'.tmp';const handle=fs.openSync(temp,'w');try{fs.writeFileSync(handle,JSON.stringify(validated));fs.fsyncSync(handle);}finally{fs.closeSync(handle);}let previousValid=false;if(fs.existsSync(target)){try{previousValid=validateDraft(JSON.parse(fs.readFileSync(target,'utf8'))).space===space;}catch{}}if(previousValid)fs.copyFileSync(target,target+'.previous');fs.renameSync(temp,target);return true;},
 remove(space){const target=file(space);for(const p of [target,target+'.previous',target+'.tmp'])fs.rmSync(p,{force:true});return true;}};
}
module.exports={draftStore};
