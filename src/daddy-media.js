/** Bounded media-container decoding. No page scripts or media-key processing. */
const LIMIT=16*1024*1024;
const text=new TextDecoder();
const bad=()=>{throw new Error('unsupported_segment_container');};
const word=(b,n,l)=>text.decode(b.subarray(n,n+l));
export function isTransportStream(b){
  return b.length>=376&&b.length%188===0&&b[0]===0x47&&b[188]===0x47&&
    (b.length<564||b[376]===0x47);
}
export function isMp4(b){return b.length>=8&&['ftyp','styp','moof'].includes(word(b,4,4));}
export async function readBounded(body,limit=LIMIT,prefix=false){
  if(!body)throw new Error('empty_response');
  const reader=body.getReader(),parts=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;
      if(!prefix&&size+value.length>limit)throw new Error('response_too_large');
      const chunk=value.subarray(0,limit-size);
      size+=chunk.length;parts.push(chunk);
      if(prefix&&size===limit)break;}
  }finally{await reader.cancel().catch(()=>{});}
  const result=new Uint8Array(size);let offset=0;
  for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
async function inflate(bytes,format,limit=LIMIT){
  return readBounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)),limit);
}
function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;}
async function pngPayload(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let offset=8,width=0,height=0,bpp=0,ended=false,header;const idats=[];
  while(offset+12<=bytes.length){
    const length=view.getUint32(offset),type=word(bytes,offset+4,4);
    if(length>bytes.length-offset-12)bad();
    const data=bytes.subarray(offset+8,offset+8+length);offset+=length+12;
    if(type==='IHDR'){
      if(length!==13||header)bad();header=data;
      const h=new DataView(data.buffer,data.byteOffset,data.byteLength);
      width=h.getUint32(0);height=h.getUint32(4);
      bpp=data[9]===6?4:3;
    }else if(type==='IDAT')idats.push(data);
    else if(type==='IEND'){
      if(length)bad();ended=true;
      const appended=bytes.subarray(offset);if(isTransportStream(appended))return appended;
      break;
    }
  }
  if(!ended||!width||!idats.length)bad();
  if(!height||header[8]!==8||![2,6].includes(header[9])||header[10]||header[11]||header[12])bad();
  if(height*(width*bpp+1)>LIMIT||width*height*3>LIMIT)throw new Error('response_too_large');
  const compressed=new Uint8Array(idats.reduce((n,p)=>n+p.length,0));let at=0;
  for(const part of idats){compressed.set(part,at);at+=part.length;}
  const stride=width*bpp,expected=height*(stride+1);
  const raw=await inflate(compressed,'deflate',expected);
  if(raw.length!==expected)bad();
  const rgb=new Uint8Array(width*height*3);let src=0,dst=0,previous=new Uint8Array(stride);
  for(let y=0;y<height;y++){
    const filter=raw[src++];if(filter>4)bad();
    const row=raw.subarray(src,src+stride);src+=stride;
    if(filter){
      for(let x=0;x<stride;x++){
        const a=x>=bpp?row[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0;
        row[x]=(row[x]+(filter===1?a:filter===2?b:filter===3?(a+b)>>1:paeth(a,b,c)))&255;
      }
    }
    if(bpp===3){rgb.set(row,dst);dst+=stride;}
    else for(let x=0;x<stride;x+=4){rgb[dst++]=row[x];rgb[dst++]=row[x+1];rgb[dst++]=row[x+2];}
    previous=row;
  }
  if(rgb.length<12||word(rgb,0,8)!=='TIKTIKPX')bad();
  const length=new DataView(rgb.buffer,rgb.byteOffset+8,4).getUint32(0);
  if(length<2||length>rgb.length-12||rgb[12]!==31||rgb[13]!==139)bad();
  return inflate(rgb.subarray(12,12+length),'gzip');
}
export async function decodeDaddyMedia(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>LIMIT)throw new Error('response_too_large');
  if(isTransportStream(bytes)||isMp4(bytes))return bytes;
  let media;
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){
    media=await pngPayload(bytes);
  }else if(word(bytes,0,4)==='RIFF'&&word(bytes,8,4)==='WEBP'){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let offset=12;offset+8<=bytes.length;){
      const type=word(bytes,offset,4),length=view.getUint32(offset+4,true);offset+=8;
      if(length>bytes.length-offset)bad();
      if(type==='EXIF'){media=bytes.subarray(offset,offset+length);break;}
      offset+=length+(length&1);
    }
  }else if(word(bytes,0,9)==='TIKTIKRAW')media=bytes.subarray(9);
  else if(word(bytes,0,10)==='TIKTIKTSGZ')media=await inflate(bytes.subarray(10),'gzip');
  if(!media||!isTransportStream(media))bad();
  return media;
}
/** Ranges apply to decoded media, never to the source image container. */
export function mediaRange(header,length){
  if(!header)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!match||(!match[1]&&!match[2]))throw new Error('invalid_range');
  let start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2]));
  let end=match[1]&&match[2]?Math.min(length-1,Number(match[2])):length-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=length)throw new Error('invalid_range');
  return {start,end};
}
