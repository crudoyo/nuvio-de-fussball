// Read-only public-page inspection. No media requests or page-code execution.
import {pathToFileURL} from 'node:url';
const HOSTS=new Set(['thedaddy.pk','www.thedaddy.pk','tossequip.net','api.cdnlivetv.tv','out-3.welovetocare.shop']);
export function syntaxOnly(code){
  const keywords=new Set(['atob','decodeURIComponent','escape','return','function','const','let','var',
    'source','src','String','TextDecoder','Uint8Array','fromCharCode','charCodeAt','replace','split','join','map']);
  return code.replace(/(["'`])(?:\\[^]|(?!\1)[^])*?\1/g,'"<literal>"')
    .replace(/\/\*[^]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')
    .replace(/https?:\/\/[^\s<>]+/g,'<url>')
    .replace(/[A-Za-z_$][\w$]*/g,value=>keywords.has(value)?value:'id')
    .replace(/\d+/g,'N').replace(/\s+/g,' ');
}
export function pageStructure(html){
  const clean=syntaxOnly(html);
  return {
    bytes:new TextEncoder().encode(html).length,
    hasAtob:html.includes('atob('),
    decoderSyntax:[...clean.matchAll(/atob\s*\(/g)].slice(0,3).map(m=>clean.slice(Math.max(0,m.index-180),m.index+450)),
    sourceSyntax:[...clean.matchAll(/\bsource\s*:\s*\{\s*src\s*:[^,}]{1,180}/g)].slice(0,3).map(m=>m[0]),
    literalMediaMentions:[...html.matchAll(/\.m3u8|\.mpd/g)].length
  };
}
function attributes(tag){return Object.fromEntries([...tag.matchAll(/\b([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1].toLowerCase(),m[3].replace(/&amp;/g,'&')]));}
function allowed(raw,base){
  try{const u=new URL(raw,base);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))return null;
    if([...u.searchParams.keys()].some(k=>/^(token|t|key|auth|signature|sig|session)$/i.test(k)))return null;
    return u.href;
  }catch{return null;}
}
async function inspect(){
  const queue=['https://thedaddy.pk/stream/stream-426.php','https://thedaddy.pk/watch.php?id=426'];
  const seen=new Set();const signal=AbortSignal.timeout(45000);
  for(let count=0;queue.length&&count<12;){
    const url=queue.shift();if(seen.has(url))continue;seen.add(url);count++;
    const u=new URL(url),label=u.hostname==='thedaddy.pk'?u.pathname.split('/')[1]:u.hostname;
    try{
      const response=await fetch(url,{redirect:'manual',signal,
        headers:{Referer:'https://thedaddy.pk/','User-Agent':'Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}});
      if(response.status!==200){await response.body?.cancel();console.log(JSON.stringify({label,http:response.status}));continue;}
      const reader=response.body.getReader();let text='',length=0;const decoder=new TextDecoder();
      try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024)throw new Error('page_too_large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
      finally{await reader.cancel().catch(()=>{});}
      console.log(JSON.stringify({label,http:response.status,setsCookie:response.headers.has('set-cookie'),...pageStructure(text)}));
      for(const tag of text.matchAll(/<(?:iframe|button|a)\b[^>]*>/gi)){
        const a=attributes(tag[0]);
        const raw=a['data-url']||(tag[0].toLowerCase().startsWith('<iframe')&&['thatframe','playerFrame'].includes(a.id)?a.src:null);
        if(!raw)continue;
        const next=allowed(raw,url);if(!next||seen.has(next)||queue.length>=12)continue;
        const target=new URL(next);
        if(target.hostname==='thedaddy.pk'&&!/^\/(?:stream|cast|watch|plus|casting|player)\/stream-426\.php$/.test(target.pathname))continue;
        queue.push(next);
      }
    }catch{console.log(JSON.stringify({label,error:signal.aborted?'timeout':'page_unavailable'}));}
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await inspect();
