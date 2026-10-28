'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
class SqliteStore{
 constructor(file,initial,options={}){this.ownsDatabase=!options.db;fs.mkdirSync(path.dirname(file),{recursive:true});this.db=options.db||new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL)');if(initial&& !this.db.prepare('SELECT id FROM state WHERE id=1').get())this.db.prepare('INSERT INTO state VALUES(1,1,?)').run(JSON.stringify(initial));}
 read(){const row=this.db.prepare('SELECT revision,payload FROM state WHERE id=1').get();return row?{revision:row.revision,state:JSON.parse(row.payload)}:{revision:0,state:null};}
 transact(fn,expected){this.db.exec('BEGIN IMMEDIATE');try{const current=this.read();if(expected!==undefined&&expected!==current.revision)throw Error('LOCAL_REVISION_CONFLICT');const result=fn(current.state);this.db.prepare('INSERT INTO state VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(current.revision+1,JSON.stringify(current.state));this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 replace(state,expected){this.db.exec('BEGIN IMMEDIATE');try{const old=this.read();if(old.revision!==expected)throw Error('LOCAL_REVISION_CONFLICT');this.db.prepare('INSERT INTO state VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(expected+1,JSON.stringify(state));this.db.exec('COMMIT');return this.read();}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){if(this.ownsDatabase)this.db.close();}
}
module.exports={SqliteStore};
