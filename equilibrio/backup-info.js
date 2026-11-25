(function(root){'use strict';function stamp(space){const copyId=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():('copy-'+Date.now()+'-'+Math.random().toString(16).slice(2));return {version:1,copyId,createdAt:new Date().toISOString(),appVersion:document.body.dataset.build||'',origin:space||'Espaços financeiros',device:localStorage.getItem('equilibrioDeviceName')||'PC sem nome definido'};}function describe(raw,filename){raw=raw||{};const m=raw.backupMetadata||{};return {filename:filename||'',createdAt:m.createdAt||raw.exportedAt||raw.lastBackup||'',origin:m.origin||raw.spaceName||'Origem não identificada',device:m.device||'PC não identificado',version:m.appVersion||'',copyId:m.copyId||''};}function latestTimestamp(...dates){
 const now=Date.now()+5*60*1000;
 return dates.reduce((latest,date)=>{
  const time=Date.parse(date||'');
  return Number.isFinite(time)&&time<=now&&(latest===null||time>latest)?time:latest;
 },null);
}
root.BackupInfo={stamp,describe,latestTimestamp};})(globalThis);
