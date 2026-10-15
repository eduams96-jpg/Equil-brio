'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),write=(f,s)=>fs.writeFileSync(path.join(root,f),s),pkg=JSON.parse(read('package.json'));
if(process.argv[2]==='--snapshot'){
 const destination=path.resolve(root,'../historico/baselines/baseline-'+pkg.version);if(fs.existsSync(destination))throw Error('A baseline já existe: '+pkg.version);
 fs.cpSync(root,destination,{recursive:true,filter:p=>!['node_modules','validacao','dist-desktop','.git'].includes(path.basename(p))});console.log('Baseline preservada: '+destination);
}else{
 const next=process.argv[2],title=process.argv[3];if(!/^\d+\.\d+\.\d+$/.test(next||'')||!title)throw Error('Indica versão semântica e descrição.');
 if(require('../desktop/manual-updater.cjs').compareVersions(next,pkg.version)<=0)throw Error('A versão tem de avançar.');
 const previous=pkg.version;pkg.version=next;pkg.description=`Equilíbrio v${next} — ${title}`;write('package.json',JSON.stringify(pkg,null,2)+'\n');const lock=JSON.parse(read('package-lock.json'));lock.version=next;lock.packages[''].version=next;write('package-lock.json',JSON.stringify(lock,null,2)+'\n');
 write('desktop/version.cjs',`const APP_VERSION = '${next}';\nconst APP_DISPLAY_VERSION = 'v${next} · ${title}';\nconst WEB_VERSION = '${next}';\nmodule.exports = { APP_VERSION, APP_DISPLAY_VERSION, WEB_VERSION };\n`);
 write('index.html',read('index.html').replace(/data-build="[^"]+"/,`data-build="${next}"`).replace(`>v${previous}</div>`,`>v${next}</div>`));
 console.log('Versão: '+next);
}
