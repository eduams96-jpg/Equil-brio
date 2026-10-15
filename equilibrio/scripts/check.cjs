const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root=path.resolve(__dirname,'..');
let count=0;
for(const dir of [root,path.join(root,'desktop'),path.join(root,'integration'),__dirname,path.join(root,'tests')]){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(!entry.isFile() || !/\.(?:cjs|js)$/.test(entry.name))continue;
  const result=spawnSync(process.execPath,['--check',path.join(dir,entry.name)],{stdio:'inherit',windowsHide:true});
  if(result.status!==0)process.exit(result.status||1);count++;
 }
}
const fail=(message)=>{console.error('CHECK:',message);process.exit(1);};
const htmlPath=path.join(root,'index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const packagePath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
const versionText=fs.readFileSync(path.join(root,'desktop','version.cjs'),'utf8');
const versionMatch=versionText.match(/APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]/);
if(!versionMatch)fail('desktop/version.cjs não expõe APP_VERSION.');
if(versionMatch[1]!==pkg.version)fail(`Versões inconsistentes: package.json=${pkg.version}; desktop=${versionMatch[1]}.`);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const duplicateIds=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
if(duplicateIds.length)fail('IDs HTML duplicados: '+duplicateIds.join(', '));
const refs=[...html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)].map(m=>m[1]);
const buildFiles=new Set(pkg.build?.files||[]);
const historicalBuildDocs=[...buildFiles].filter((file)=>/\.md$/i.test(file) && !/^assets\/licenses\/[^/]*(?:LICENSE|NOTICE)[^/]*$/i.test(file));
if(historicalBuildDocs.length)fail('Documentação histórica incluída no build de produção: '+historicalBuildDocs.join(', '));
for(const ref of refs){
 if(!fs.existsSync(path.join(root,ref)))fail(`Recurso HTML inexistente: ${ref}`);
 if(!buildFiles.has(ref))fail(`Recurso HTML não incluído no build Desktop: ${ref}`);
}
const cssRefs=refs.filter(x=>x.endsWith('.css'));
const finalCss=["ui.css"];
if(JSON.stringify(cssRefs)!==JSON.stringify(finalCss))fail('Folhas de estilos finais fora de ordem.');
for(const required of ['desktop/main.cjs','desktop/preload.cjs','desktop/version.cjs','desktop/manual-updater.cjs','desktop/encrypted-backup.cjs','desktop/storage-sqlite.cjs','desktop/data-service.cjs']){
 if(!buildFiles.has(required))fail(`Ficheiro Desktop essencial fora do pacote: ${required}`);
 if(!fs.existsSync(path.join(root,required)))fail(`Ficheiro Desktop essencial inexistente: ${required}`);
}
const preload=fs.readFileSync(path.join(root,'desktop','preload.cjs'),'utf8');
if(/require\(['\"]\.\//.test(preload))fail('O preload sandboxed não pode importar módulos locais com require().');
const missingButtonTypes=[];
for(const file of ['index.html',...fs.readdirSync(root).filter(x=>x.endsWith('.js'))]){
 const text=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of text.matchAll(/<button\b([^>]*)>/gis)) if(!/\btype\s*=/.test(match[1])) missingButtonTypes.push(file);
}
if(missingButtonTypes.length)fail('Existem botões sem type explícito em: '+[...new Set(missingButtonTypes)].join(', '));
console.log(`${count} scripts: sintaxe válida.`);
console.log(`Build: ${refs.length} recursos HTML verificados, ${ids.length} IDs únicos, versão ${pkg.version} consistente.`);

// v0.38.3: o .fpupdate deve validar contra o schema SQLite, não contra o schema JSON de backup.
const mainText=fs.readFileSync(path.join(root,'desktop','main.cjs'),'utf8');
if(!/schemaVersion:\s*updateSchemaVersion/.test(mainText))fail('O atualizador não está a usar o schema SQLite real.');
if(/readAndValidatePackage\(filePath,[\s\S]{0,180}schemaVersion:\s*CURRENT_SCHEMA_VERSION/.test(mainText))fail('O atualizador voltou a confundir schema JSON com schema SQLite.');
if(!/dbSchemaVersion:\s*storage\.dbSchemaVersion/.test(mainText))fail('app-info não expõe dbSchemaVersion separadamente.');

require('./build-styles.cjs').compile();
if(fs.readFileSync(path.join(root,'ui.css'),'utf8')!==require('./build-styles.cjs').compile())fail('ui.css desatualizado.');
