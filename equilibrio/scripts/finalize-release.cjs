'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,U=require('../desktop/manual-updater.cjs');
const baselines=path.resolve(root,'../historico/baselines');
const previous=fs.readdirSync(baselines).filter(n=>n.startsWith('baseline-')).map(n=>n.slice(9)).filter(v=>U.compareVersions(v,version)<0).sort(U.compareVersions).at(-1);
const args=process.argv.slice(2),positional=args.filter(a=>!a.startsWith('--'));
if(!positional[0]&&!previous)throw Error('Indica uma baseline anterior à versão atual.');
const baseline=path.resolve(positional[0]||path.join(baselines,'baseline-'+previous)),out=path.resolve(positional[1]||path.join(root,'../entrega-v'+version));
const env={...process.env,ELECTRON_PATH:process.env.ELECTRON_PATH||path.resolve(root,'node_modules/electron/dist/electron.exe')};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function run(command,name){const r=spawnSync(process.execPath,command,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:900000,maxBuffer:10*1024*1024});fs.writeFileSync(path.join(out,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error(name+' falhou: '+(r.error?.message||r.stdout+r.stderr));console.log(name+': OK');}
function filesIn(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const file=prefix+e.name;if(e.isDirectory()){if(['node_modules','dist-desktop','release-secrets','.git'].includes(e.name))return [];return filesIn(path.join(dir,e.name),file+'/');}return [file];});}
fs.mkdirSync(out,{recursive:true});
try{
 run(['scripts/package-release.cjs',baseline,out,...(positional[2]?[positional[2]]:[])],'package');
 const update=`financas-pessoais-v${version}.fpupdate`;fs.copyFileSync(path.join(out,update),path.join(root,update));
 if(!args.includes('--packages-only'))run(['scripts/validate-release.cjs'],'validation');
 run(['integration/validate-incremental-package.cjs',baseline,out],'package-validation');
 const reportPath=path.join(root,'validacao','release-'+version.replaceAll('.',''),'VALIDACAO.json');
 const validation=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath)):null;
 const report={version,passed:validation?.passed===true,validation,packages:JSON.parse(fs.readFileSync(path.join(out,'VALIDACAO-PACOTES.json'))),sourceDirectory:root,zip:null};const artifacts=[update];
 // O ZIP só é criado quando solicitado explicitamente com --zip.
 if(args.includes('--zip')){
  const files=filesIn(root).filter(f=>!f.endsWith('.log')||f.startsWith('validacao/'));
  for(const f of files)if(/\.(exe|db|pem)$/i.test(f)||/(^|\/)financas\.db|private|browser-state\.json/i.test(f))throw Error('Ficheiro indevido no ZIP: '+f);
  const manifest=Object.fromEntries(files.map(f=>[f,hash(path.join(root,f))]));fs.writeFileSync(path.join(out,'ZIP-MANIFEST-SHA256.json'),JSON.stringify(manifest,null,2));
  const name=`financas-pessoais-desktop-v${version}.zip`,target=path.join(out,name),python=process.env.PYTHON_PATH||'python';
  const code="import sys,json,zipfile,hashlib,pathlib\nroot=pathlib.Path(sys.argv[1]);manifest=json.loads(pathlib.Path(sys.argv[2]).read_text());out=pathlib.Path(sys.argv[3])\nwith zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for name in manifest:z.write(root/name,name)\nwith zipfile.ZipFile(out) as z:\n assert z.testzip() is None\n assert set(z.namelist())==set(manifest)\n for name,digest in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest,name";
  const r=spawnSync(python,['-c',code,root,path.join(out,'ZIP-MANIFEST-SHA256.json'),target],{windowsHide:true,encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stdout+r.stderr);
  report.zip={verified:true,files:files.length,sha256:hash(target),size:fs.statSync(target).size};artifacts.push(name);
 }
 fs.writeFileSync(path.join(out,'SHA256.txt'),artifacts.map(f=>hash(path.join(out,f))+'  '+f).join('\n')+'\n');fs.writeFileSync(path.join(out,'VALIDACAO.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version,passed:report.passed,zipCreated:!!report.zip}));
}catch(e){console.error(e.stack);process.exitCode=1;}
