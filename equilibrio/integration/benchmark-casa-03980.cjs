'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const baseline=path.resolve(__dirname,'../../historico/baselines/baseline-0.39.79'),old=require(path.join(baseline,'casa-complete-model.js')),current=require('../casa-complete-model.js');
const d={casa:{purchases:Array.from({length:10000},(_,i)=>({id:'p'+i,transactionId:'t'+i})),returns:[]},transactions:Array.from({length:10000},(_,i)=>({id:'r'+i,refundOf:'t'+i,date:'2026-08-01',amount:1}))};
const run=fn=>{const times=[];let rows;for(let i=0;i<3;i++){const start=performance.now();rows=fn(d);times.push(performance.now()-start);}return{medianMs:times.sort((a,b)=>a-b)[1],rows};};
const before=JSON.stringify(d),historical=run(old.refunds),updated=run(current.refunds);assert.deepEqual(updated.rows,historical.rows);assert.equal(JSON.stringify(d),before);
const out=path.resolve(__dirname,'../validacao/global-03980');fs.mkdirSync(out,{recursive:true});const report={passed:true,purchases:10000,refunds:10000,repeats:3,baselineVersion:'0.39.79',historicalMs:historical.medianMs,currentMs:updated.medianMs,equivalent:true,readOnly:true};fs.writeFileSync(path.join(out,'casa-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
