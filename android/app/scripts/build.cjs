'use strict';
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
async function build(){
const root=path.resolve(__dirname,'..');
const canonicalCore=path.resolve(root,'../../equilibrio'),core=path.resolve(process.env.EQUILIBRIO_CORE_SOURCE||canonicalCore);
fs.mkdirSync(path.join(root,'www'),{recursive:true});
for(const name of ['index.html','style.css'])fs.copyFileSync(path.join(root,'src',name),path.join(root,'www',name));
fs.mkdirSync(path.join(root,'www/assets'),{recursive:true});
for(const name of ['dm-sans.ttf','OFL-DM-Sans.txt'])fs.copyFileSync(path.join(core,'assets/fonts',name),path.join(root,'www/assets',name));
await esbuild.build({entryPoints:[path.join(root,'src/main.js')],bundle:true,platform:'browser',format:'iife',outfile:path.join(root,'www/main.js'),sourcemap:false,target:['chrome100'],plugins:[{name:'shared-financial-source',setup(build){build.onResolve({filter:/^\./},args=>{const file=path.resolve(args.resolveDir,args.path);if(file.startsWith(canonicalCore+path.sep))return {path:path.join(core,path.relative(canonicalCore,file))};});}}],define:{'process.env.NODE_ENV':'"production"','__RELEASE__':process.env.EQUILIBRIO_BUILD_CHANNEL==='release'?'true':'false','__APP_VERSION__':JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version),'__CORE_VERSION__':JSON.stringify(JSON.parse(fs.readFileSync(path.join(core,'package.json'),'utf8')).version)}});

const crypto=require('node:crypto');
fs.writeFileSync(path.join(root,'www/build-info.json'),JSON.stringify({appVersion:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,coreVersion:JSON.parse(fs.readFileSync(path.join(core,'package.json'),'utf8')).version,release:process.env.EQUILIBRIO_BUILD_CHANNEL==='release',bundleSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'www/main.js'))).digest('hex')},null,2));

if(process.env.EQUILIBRIO_BUILD_CHANNEL==='release'){
 const file=path.join(root,'www/index.html');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Equilíbrio — Ensaio','Equilíbrio').replace('Ensaio Android · dados fictícios','Android · candidata de validação'));
}
}
build().catch(error=>{console.error(error);process.exitCode=1;});
