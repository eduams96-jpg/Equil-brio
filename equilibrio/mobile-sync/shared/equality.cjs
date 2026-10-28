'use strict';
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
module.exports={same};
