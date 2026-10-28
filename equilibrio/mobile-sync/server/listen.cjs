'use strict';
// Fetch-standard blocked ports can be returned by this host's dynamic port range.
// Keep the local service usable by native clients and browser-based test transports.
const blocked=new Set([1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
async function listen(server,port=0,host='127.0.0.1',scheme='http'){
 if(host!=='127.0.0.1'&&scheme!=='https')throw Error('Ligação de rede exige HTTPS.');
 if(!Number.isInteger(port)||port<0||port>65535||blocked.has(port))throw Error('Porta de ensaio inválida ou bloqueada.');
 for(let attempt=0;attempt<20;attempt++){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
  if(!blocked.has(server.address().port))return scheme+'://'+(host==='0.0.0.0'?'localhost':host)+':'+server.address().port;
  await new Promise(resolve=>server.close(resolve));
 }
 throw Error('Não foi possível escolher uma porta local utilizável.');
}
module.exports={listen};
