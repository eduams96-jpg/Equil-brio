'use strict';
const F=require('../../finance.js'),Casa=require('../../casa-model.js'),Life=require('../../casa-life-model.js');
const safe=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(x);
const commands=['house.product','house.lot','house.consume','house.shopping'];
function requirements(d,command,p){if(!commands.includes(command)||!safe(p.seed)||!F.validDate(p.changedOn)||!p.values||typeof p.values!=='object')throw Error('OperaÃ§Ã£o Casa invÃ¡lida.');return ['house','house:'+p.id];}
function apply(d,command,p){requirements(d,command,p);const before=JSON.stringify([d.transactions,d.accounts]),c=Casa.state(d),v=structuredClone(p.values);let creating=false;
 if(command==='house.product'){const old=c.catalog.find(x=>x.id===p.id);if(p.mode==='create'&&old||p.mode==='update'&&!old||!['create','update'].includes(p.mode))throw Error('O produto mudou ou jÃ¡ existe.');if(Object.keys(v).some(k=>!['name','brand','category','unit','url','offersRows'].includes(k)))throw Error('Campo de produto nÃ£o suportado.');v.category=F.categoryPath(v.category);if(F.categoryParts(v.category).length>4)throw Error('Usa categoria e atÃ© trÃªs subcategorias.');creating=!old;if(old){v.id=old.id;v.archived=old.archived;}}
 else if(command==='house.lot'){const old=c.stock.find(x=>x.id===p.id);if(p.mode==='create'&&old||p.mode==='update'&&!old||!['create','update'].includes(p.mode))throw Error('O lote mudou ou jÃ¡ existe.');creating=!old;if(old){v.id=old.id;v.archived=old.archived;}}
 else if(command==='house.consume'){if(v.lotId!==p.id||!['consume','waste'].includes(v.type)||!Number.isFinite(v.qty)||v.qty<=0)throw Error('Consumo invÃ¡lido.');}
 else if(!c.shopping.some(x=>x.id===p.id)||!['toggle','remove'].includes(v.operation))throw Error('Artigo indisponÃ­vel.');
 const permitted=command==='house.product'?['name','brand','category','unit','url','offersRows','id','archived']:command==='house.lot'?['catalogId','qty','location','expiry','opened','id','archived']:command==='house.consume'?['lotId','qty','type','note']:['operation'];if(Object.keys(v).some(k=>!permitted.includes(k)))throw Error('Campo Casa nÃ£o suportado.');if(command==='house.product'&&v.offersRows?.some(r=>Object.keys(r).some(k=>!['storeName','packageQty','price','url'].includes(k))))throw Error('Campo de preÃ§o nÃ£o suportado.');
 const oldId=F.id,oldToday=F.today;let n=0;F.id=()=>creating&&n++===0?p.id:p.seed+'-h'+(++n);F.today=()=>p.changedOn;
 try{if(command==='house.product')Casa.saveProductOffers(d,v,v.offersRows||[]);else if(command==='house.lot')Life.lot(d,v);else if(command==='house.consume')Life.record(d,v);else Casa.shopping(d,v.operation,{id:p.id});Casa.validate(d);Life.validate(d);}finally{F.id=oldId;F.today=oldToday;}
 if(JSON.stringify([d.transactions,d.accounts])!==before)throw Error('Casa nÃ£o pode alterar as FinanÃ§as neste percurso.');
}
module.exports={commands,requirements,apply,Casa,Life};
