'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function generate(directory,keyId){
 const target=path.resolve(directory);if(target===root||target.startsWith(root+path.sep))throw Error('A chave privada tem de ficar fora da aplicação.');if(!/^[a-z0-9][a-z0-9-]{2,99}$/.test(keyId))throw Error('Identificador de chave inválido.');
 const pair=crypto.generateKeyPairSync('ed25519'),privateKey=pair.privateKey.export({format:'pem',type:'pkcs8'}),publicKey=pair.publicKey.export({format:'pem',type:'spki'});fs.mkdirSync(target,{mode:0o700});
 fs.writeFileSync(path.join(target,'private.pem'),privateKey,{mode:0o600,flag:'wx'});fs.writeFileSync(path.join(target,'public.pem'),publicKey,{flag:'wx'});const metadata={keyId,algorithm:'Ed25519',createdAt:new Date().toISOString(),publicKey};fs.writeFileSync(path.join(target,'rotation.json'),JSON.stringify(metadata,null,2),{flag:'wx'});return metadata;
}
function register(directory,updaterPath=path.join(root,'desktop/manual-updater.cjs')){
 const meta=JSON.parse(fs.readFileSync(path.join(directory,'rotation.json')));if(!/^[a-z0-9][a-z0-9-]{2,99}$/.test(meta.keyId)||crypto.createPublicKey(meta.publicKey).asymmetricKeyType!=='ed25519')throw Error('Chave pública inválida.');
 const source=fs.readFileSync(updaterPath,'utf8'),marker='const UPDATE_TRUSTED_KEYS = Object.freeze({';if(!source.includes(marker)||source.includes("'"+meta.keyId+"'")||source.includes('"'+meta.keyId+'"'))throw Error('Estrutura inesperada ou identificador já registado.');
 const next=source.replace(marker,marker+'\n  '+JSON.stringify(meta.keyId)+': '+JSON.stringify(meta.publicKey)+',');
 fs.writeFileSync(path.join(directory,'updater-before-registration.cjs'),source,{flag:'wx'});fs.writeFileSync(updaterPath,next);return {keyId:meta.keyId,registered:true};
}
if(require.main===module){try{const [mode,directory,value]=process.argv.slice(2);if(!directory)throw Error('Uso: --generate pasta-exterior-nova identificador; --register pasta-da-rotação [updater].');if(mode==='--generate')console.log(JSON.stringify({keyId:generate(directory,value).keyId,directory:path.resolve(directory)}));else if(mode==='--register')console.log(JSON.stringify(register(directory,value)));else throw Error('Modo inválido.');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={generate,register};
