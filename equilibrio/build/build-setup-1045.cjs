// Gera o pacote de manutenção 1.0.44 -> 1.0.45 a partir do manifesto publicado da 1.0.44.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const project=path.resolve(__dirname,'..'),workspace=path.resolve(project,'..','..');
const records=JSON.parse(fs.readFileSync(path.join(workspace,'Entrega-v1.0.44','RUNTIME-PACKAGE-SHA256.json'),'utf8'));
const destination=path.join(workspace,'Entrega-v1.0.45');fs.mkdirSync(destination,{recursive:true});
const stage=path.join(__dirname,'payload-1045');fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage);
const changed=[];
for(const r of records){const content=fs.readFileSync(path.join(project,r.path));const digest=crypto.createHash('sha256').update(content).digest('hex');
 if(digest!==r.sha256){const t=path.join(stage,'app',...r.path.split('/'));fs.mkdirSync(path.dirname(t),{recursive:true});fs.writeFileSync(t,content);r.sha256=digest;r.size=content.length;changed.push(r.path);}}
fs.writeFileSync(path.join(stage,'sha256.txt'),records.map(r=>r.sha256+' '+r.path+'\n').join(''));
const zip=path.join(__dirname,'Setup1045.payload.zip');fs.rmSync(zip,{force:true});
execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'zip-forward.ps1'),stage,zip],{stdio:'inherit'});
fs.writeFileSync(path.join(destination,'RUNTIME-PACKAGE-SHA256.json'),JSON.stringify(records,null,2));
console.log('Alterados:',changed.join(', '));
