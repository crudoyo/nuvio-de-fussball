/** Entry-manifest preflight only: does not prove segment compatibility or rights. */
import {publicMediaUrl,cleanMediaHeaders} from './native-streams.js';
const LIMIT=256*1024;
export function manifestKind(text){
  const s=text.replace(/^\uFEFF/,'').trim();
  if(/^#EXTM3U(?:\r?\n|$)/.test(s)&&/^#EXT-X-(?:STREAM-INF|TARGETDURATION):/m.test(s))return 'hls';
  if(/^(?:<\?xml[^>]*>\s*)?<MPD\b/.test(s)&&s.includes('</MPD>'))return 'dash';
  return null;
}
export async function checkNativeManifest(stream,fetcher=fetch){
  const url=publicMediaUrl(stream?.url);
  if(!url)return false;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  let reader,response;
  try{
    response=await fetcher(url,{redirect:'manual',signal:controller.signal,
      headers:{...cleanMediaHeaders(stream.behaviorHints?.proxyHeaders?.request),'Cache-Control':'no-store'}});
    if(response.status!==200||response.headers.has('set-cookie'))return false;
    if(Number(response.headers.get('content-length'))>LIMIT||!response.body)return false;
    reader=response.body.getReader();
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>LIMIT)return false;chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const kind=manifestKind(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return kind===(new URL(url).pathname.toLowerCase().endsWith('.mpd')?'dash':'hls');
  }catch{return false;}
  finally{
    clearTimeout(timer);
    if(reader)await reader.cancel().catch(()=>{});
    else if(response?.body)await response.body.cancel().catch(()=>{});
  }
}
export async function verifiedNativeStreams(streams,fetcher){
  const checked=await Promise.all(streams.map(async s=>await checkNativeManifest(s,fetcher)?s:null));
  return checked.filter(Boolean);
}
