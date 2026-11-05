'use strict';
const kit=require('./ui/kit.cjs');
function priceReference(unit,offer){const normal={g:[1000,'kg'],ml:[1000,'L'],cl:[100,'L']}[unit]||[1,unit];return {per:offer.per*normal[0],unit:normal[1]};}
function priceLabel(unit,offer,hidden){const q=priceReference(unit,offer),text=kit.money(Math.round(q.per*100),hidden);return (q.per>0&&q.per<.01&&!hidden?'&lt; '+kit.money(1):text)+'/'+kit.escape(q.unit);}
module.exports={priceReference,priceLabel};
