'use strict';
const fs=require('node:fs'),path=require('node:path');
// Only identical sibling rules are removable. Media/container/layer scopes
// and their relative order stay intact; inherited overrides are not guessed.
function identicalRules(source){
 const removals=[];
 function scope(start,end,context){
  const blocks=[];let boundary=start,quote='',comment=false,depth=0,open=-1;
  for(let i=start;i<end;i++){
   const c=source[i],next=source[i+1];
   if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
   if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
   if(c==='/'&&next==='*'){comment=true;i++;continue;}if(c==='"'||c==="'"){quote=c;continue;}
   if(c==='{' ){if(depth++===0)open=i;}
   else if(c==='}'&&--depth===0){
    const raw=source.slice(boundary,open),header=raw.replace(/\/\*[\s\S]*?\*\//g,'').trim();
    const offset=raw.lastIndexOf(header);
    if(header&&offset>=0)blocks.push({start:boundary+offset,open,end:i+1,header,body:source.slice(open+1,i)});
    boundary=i+1;
   }else if(c===';'&&depth===0)boundary=i+1;
  }
  const seen=new Map();
  for(let i=blocks.length-1;i>=0;i--){const b=blocks[i];
   if(/^@(media|container|supports|layer)\b/.test(b.header)){scope(b.open+1,b.end-1,context+' '+b.header);continue;}
   if(b.header.startsWith('@'))continue;
   const key=b.header+'{'+b.body+'}';
   if(seen.has(key))removals.push({...b,context});else seen.set(key,b);
  }
 }
 scope(0,source.length,'root');
 return removals.sort((a,b)=>b.start-a.start);
}
if(require.main===module){
 const root=path.resolve(__dirname,'..'),report=[];
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.css'))){
  let source=fs.readFileSync(path.join(root,file),'utf8');const matches=identicalRules(source);
  for(const m of matches)report.push({file,selector:m.header,context:m.context,bytes:m.end-m.start});
  if(process.argv.includes('--write')&&matches.length){for(const m of matches)source=source.slice(0,m.start)+source.slice(m.end);fs.writeFileSync(path.join(root,file),source);}
 }
 console.log(JSON.stringify({removed:process.argv.includes('--write'),rules:report.length,bytes:report.reduce((n,r)=>n+r.bytes,0),entries:report},null,2));
}
module.exports={identicalRules};
