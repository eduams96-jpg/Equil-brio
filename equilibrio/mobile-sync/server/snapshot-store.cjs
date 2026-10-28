'use strict';
// Historical wire snapshots are immutable. Store each once, compressed, inside
// the same SQLite transaction as the financial write and its receipt. Decode
// only snapshots actually requested by an authorized client.
const crypto=require('node:crypto'),zlib=require('node:zlib');
const tag='__equilibrioSnapshot';
class SnapshotStore{
 constructor(db){this.db=db;this.refs=new WeakMap();this.cache=new Map();db.exec('CREATE TABLE IF NOT EXISTS sync_snapshot_blobs(hash TEXT PRIMARY KEY,payload BLOB NOT NULL,raw_bytes INTEGER NOT NULL)');}
 put(snapshot){const raw=Buffer.from(JSON.stringify(snapshot)),hash=crypto.createHash('sha256').update(raw).digest('hex');this.db.prepare('INSERT OR IGNORE INTO sync_snapshot_blobs VALUES(?,?,?)').run(hash,zlib.deflateSync(raw,{level:3}),raw.length);return hash;}
 get(hash){if(this.cache.has(hash)){const value=this.cache.get(hash);this.cache.delete(hash);this.cache.set(hash,value);return value;}const row=this.db.prepare('SELECT payload FROM sync_snapshot_blobs WHERE hash=?').get(hash);if(!row)throw Error('Histórico de sincronização indisponível. Os dados financeiros foram conservados.');const value=JSON.parse(zlib.inflateSync(row.payload,{maxOutputLength:128*1024*1024}));this.cache.set(hash,value);while(this.cache.size>8)this.cache.delete(this.cache.keys().next().value);return value;}
 packRecord(record){if(!record||typeof record!=='object')return record;const output={};for(const key of Object.keys(record)){if(key!=='snapshot'){output[key]=record[key];continue;}const existing=this.refs.get(record);if(existing){output.snapshot={[tag]:existing};continue;}const value=record[key];output.snapshot=value?.[tag]?value:value?{[tag]:this.put(value)}:value;}return output;}
 unpackRecord(record){if(!record||!record.snapshot?.[tag])return record;const hash=record.snapshot[tag];if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Referência inválida no histórico de sincronização.');this.refs.set(record,hash);Object.defineProperty(record,'snapshot',{enumerable:true,configurable:true,get:()=>this.get(hash),set:value=>{this.refs.delete(record);Object.defineProperty(record,'snapshot',{value,writable:true,enumerable:true,configurable:true});}});return record;}
 spaces(spaces,pack){return Object.fromEntries(Object.entries(spaces||{}).map(([id,space])=>[id,{...space,events:(space.events||[]).map(event=>pack?this.packRecord(event):this.unpackRecord(event)),receipts:Object.fromEntries(Object.entries(space.receipts||{}).map(([key,row])=>[key,{...row,result:pack?this.packRecord(row.result):this.unpackRecord(row.result)}]))}]));}
 pack(state){if(!state?.spaces)return state;return {...state,snapshotStore:1,spaces:this.spaces(state.spaces,true),...(state.generations?{generations:state.generations.map(g=>({...g,spaces:this.spaces(g.spaces,true)}))}:{})};}
 unpack(state){if(!state?.spaces)return state;if(state.snapshotStore!==undefined&&state.snapshotStore!==1)throw Error('Atualiza o programa para abrir este histórico de sincronização.');state.spaces=this.spaces(state.spaces,false);if(state.generations)state.generations=state.generations.map(g=>({...g,spaces:this.spaces(g.spaces,false)}));return state;}
 archiveSpaces(spaces){return this.spaces(spaces,true);}
}
module.exports={SnapshotStore};
