'use strict';

const P=require('../shared/protocol.cjs'),{same}=require('../shared/equality.cjs'),{validateLedger}=require('../../desktop/ledger-validation.cjs'),{createSqliteStorage}=require('../../desktop/storage-sqlite.cjs'),{SqliteStore}=require('./sqlite-store.cjs'),{createService}=require('./service.cjs');

function createDesktopBridge(profile,options={}){

 const desktop=options.desktop||createSqliteStorage(profile);

 const ownsDesktop=!options.desktop;

 if(!desktop.listSpaces().length&&!options.desktop){desktop.writeState({equilibrioSpaces:JSON.stringify([{id:'main',name:'Casa de ensaio',key:'equilibrioData'}]),equilibrioData:JSON.stringify(P.fixture())});}

 const ids=desktop.listSpaces().map(s=>s.id),initial={format:1,serverId:P.id(),epoch:P.id(),devices:{},pairings:{},spaces:{}};

 for(const id of ids){const l=validateLedger(desktop.readSpace(id).data);initial.spaces[id]={ledger:l,revisions:P.revisions(l),cursor:0,events:[],receipts:{}};}

 const store=new SqliteStore(desktop.dbPath,initial,{db:desktop.bridgeDatabase});

 const refresh=()=>{
  const registered=desktop.listSpaces(),current=store.read().state,changes=[];
  for(const row of registered){const raw=desktop.readSpace(row.id);if(!raw?.data)throw Error('O espaço Windows deixou de estar disponível.');const ledger=validateLedger(raw.data),prior=current.spaces[row.id];if(!prior||!same(ledger,prior.ledger))changes.push({id:row.id,ledger});}
  if(!changes.length)return;
  store.transact(state=>{for(const {id,ledger:l} of changes){let space=state.spaces[id];if(!space){state.spaces[id]={ledger:l,revisions:P.revisions(l),cursor:0,events:[],receipts:{}};continue;}
   const before=space.ledger,keys=new Set(['months','categories','accounts','commitments','house',...Object.keys(P.revisions(before)),...Object.keys(P.revisions(l)),...['catalog','stock','shopping'].flatMap(k=>[...(before.casa?.[k]||[]),...(l.casa?.[k]||[])].map(x=>'house:'+x.id))]);for(const key of keys)space.revisions[key]=(space.revisions[key]||0)+1;space.ledger=P.copy(l);space.cursor++;space.events.push({sequence:space.cursor,source:'windows',snapshot:{ledger:P.copy(l),revisions:P.copy(space.revisions),cursor:space.cursor}});
  }});
 };
 const applyLedger=(id,before,after)=>{const actual=validateLedger(desktop.readSpace(id).data);if(!same(actual,before))throw Error('O programa Windows mudou durante a operação. Reabre antes de guardar.');const row=desktop.listSpaces().find(s=>s.id===id);const db=desktop.bridgeDatabase;db.exec('SAVEPOINT bridge_ledger_write');try{desktop.writeSpace(row.storageKey||row.key||('equilibrioData'+(id==='main'?'':':'+id)),after);db.exec('RELEASE bridge_ledger_write');}catch(e){db.exec('ROLLBACK TO bridge_ledger_write; RELEASE bridge_ledger_write');throw e;}};

 const service=createService(desktop.dbPath,{...options,contractVersion:2,store,refresh,isAvailable:id=>desktop.listSpaces().some(row=>row.id===id),applyLedger});if(options.recovered===true)service.rotateEpoch();

 return {...service,desktop,refresh,close:async()=>{await service.close();if(ownsDesktop)desktop.close();}};

}

module.exports={createDesktopBridge};

