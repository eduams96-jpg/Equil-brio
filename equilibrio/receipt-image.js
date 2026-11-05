/* Image preparation for the local text reader (scanned PDFs and photos); no financial state is read here. */
(function(root){'use strict';
 const MAX_PIXELS=12000000;
 function geometry(width,height,options={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>40000000)throw Error('A imagem é demasiado grande ou tem dimensões inválidas.');
  const rotation=Number(options.rotation??0),angle=Number(options.angle??0),margins=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,Number(options[k]??0)]));
  if(![0,90,180,270].includes(rotation)||!Number.isFinite(angle)||Math.abs(angle)>10||Object.values(margins).some(v=>!Number.isFinite(v)||v<0||v>35))throw Error('Confirma a rotação, inclinação e margens da fotografia.');
  // Margins follow the rotated preview, so left/top mean what the user sees.
  const turned=rotation%180!==0,orientedWidth=turned?height:width,orientedHeight=turned?width:height;
  const x=Math.round(orientedWidth*margins.left/100),y=Math.round(orientedHeight*margins.top/100),cropWidth=Math.round(orientedWidth*(1-(margins.left+margins.right)/100)),cropHeight=Math.round(orientedHeight*(1-(margins.top+margins.bottom)/100));
  if(cropWidth<64||cropHeight<64)throw Error('A imagem ou o recorte tem pouco detalhe. Usa uma fotografia maior ou reduz as margens.');
  const radians=angle*Math.PI/180,boxWidth=Math.ceil(Math.abs(cropWidth*Math.cos(radians))+Math.abs(cropHeight*Math.sin(radians))),boxHeight=Math.ceil(Math.abs(cropWidth*Math.sin(radians))+Math.abs(cropHeight*Math.cos(radians)));
  const scale=Math.min(cropWidth<800?Math.min(2,800/cropWidth):1,2200/boxWidth,12000/boxHeight,Math.sqrt(MAX_PIXELS/(boxWidth*boxHeight)));
  return{rotation,angle,margins,orientedWidth,orientedHeight,x,y,cropWidth,cropHeight,boxWidth,boxHeight,scale,width:Math.max(1,Math.floor(boxWidth*scale)),height:Math.max(1,Math.floor(boxHeight*scale)),contrast:options.contrast===true};
 }
 function contrastPixels(pixels){const out=new Uint8ClampedArray(pixels.length),hist=new Uint32Array(256);for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3]/255,v=Math.round((.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])*alpha+255*(1-alpha));out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;hist[v]++;}const count=pixels.length/4;let acc=0,lo=0,hi=255;for(let i=0;i<256;i++){acc+=hist[i];if(acc>=count*.01){lo=i;break;}}acc=0;for(let i=255;i>=0;i--){acc+=hist[i];if(acc>=count*.01){hi=i;break;}}if(hi-lo>=20)for(let i=0;i<out.length;i+=4){const v=Math.max(0,Math.min(255,Math.round((out[i]-lo)*255/(hi-lo))));out[i]=out[i+1]=out[i+2]=v;}return out;}
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,w,h);return c;}
 function prepare(image,options={}){const g=geometry(image.width,image.height,options),result=canvas(g.width,g.height),ctx=result.getContext('2d');
  // Work directly from the source with one bounded output surface, even for long receipts.
  ctx.translate(g.width/2,g.height/2);ctx.scale(g.scale,g.scale);ctx.rotate(g.angle*Math.PI/180);ctx.beginPath();ctx.rect(-g.cropWidth/2,-g.cropHeight/2,g.cropWidth,g.cropHeight);ctx.clip();ctx.translate(g.orientedWidth/2-g.x-g.cropWidth/2,g.orientedHeight/2-g.y-g.cropHeight/2);ctx.rotate(g.rotation*Math.PI/180);ctx.drawImage(image,-image.width/2,-image.height/2);ctx.resetTransform();
  if(g.contrast){const pixels=ctx.getImageData(0,0,result.width,result.height);pixels.data.set(contrastPixels(pixels.data));ctx.putImageData(pixels,0,0);}return{canvas:result,geometry:g,warnings:[...(g.cropWidth<500?['A fotografia tem pouca resolução na largura do talão. Aproxima a câmara e confirma os números.']:[]),...(g.scale<.75?['A imagem foi reduzida para respeitar os limites de leitura. Confirma os artigos mais pequenos.']:[])]};
 }
 root.ReceiptImage={geometry,contrastPixels,prepare,MAX_PIXELS};if(typeof module==='object')module.exports=root.ReceiptImage;
})(globalThis);
