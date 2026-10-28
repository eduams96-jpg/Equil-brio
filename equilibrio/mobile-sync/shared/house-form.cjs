'use strict';
function decimal(text,places=3){if(typeof text!=='string'||!(new RegExp('^\\d+(?:[.,]\\d{1,'+places+'})?$')).test(text.trim()))throw Error('Indica uma quantidade válida.');const n=Number(text.replace(',','.'));if(!Number.isFinite(n)||n<=0)throw Error('Indica um valor superior a zero.');return n;}
function offerPayload(r){
 const storeName=String(r.storeName||'').trim();
 if(!storeName)throw Error('Indica o supermercado da oferta.');
 const priceText=String(r.price??'').trim();
 const price=priceText===''||/^0(?:[.,]0{1,2})?$/.test(priceText)?0:decimal(priceText,2);
 return{storeName,packageQty:String(r.packageQty??'').trim()===''?1:decimal(String(r.packageQty)),price,...(r.url?{url:String(r.url).trim()}:{})};
}
function payload(f){let values;if(f.command==='house.product')values={name:f.name,brand:f.brand,category:[f.category,f.sub1,f.sub2,f.sub3].filter(Boolean).join(' / '),unit:f.unit,url:f.url,offersRows:f.offers.filter(r=>r.storeName||r.packageQty||r.price||r.url).map(offerPayload)};else if(f.command==='house.lot')values={catalogId:f.catalogId,qty:decimal(f.qty),location:f.location,expiry:f.expiry,opened:f.opened===true};else if(f.command==='house.consume')values={lotId:f.id,qty:decimal(f.qty),type:f.type,note:f.note};else throw Error('Formulário Casa indisponível.');return {id:f.id,seed:f.seed,changedOn:f.changedOn,mode:f.mode,values};}
module.exports={payload,decimal};
