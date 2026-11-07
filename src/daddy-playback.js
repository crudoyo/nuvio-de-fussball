/** Channel-bound HLS adapter for the checked Daddy player formats.
 * Fetches only listed player/media hosts; never executes third-party scripts.
 */
import {DADDY_PRIMARY,daddySiteUrl,sameDaddyRoute,daddyRequestContext,withDaddyFallback,withDaddyAbort} from './daddy-domains.js';
import {readBounded,decodeDaddyMedia,isMp4,mediaRange} from './daddy-media.js';
import {WIDE_PLAYER,TOSSEQUIP,tossequipMediaUrl,tossequipPlayerPage,widePlayerPage} from './daddy-wide.js';
const AGENT='Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const VARIANTS=new Set(['stream','cast','watch','plus','casting','player','hub']);
const EDGE='https://edge.wedd48c.top';
const WIDE_CDN='https://cdn.wideiptv.top';
const ADAPTER_REFERERS={dembed:'https://dembed.st/',assetrage:'https://assetrage.net/',
  tossequip:TOSSEQUIP+'/',wideiptv:WIDE_PLAYER+'/'};
const SEGMENT_HOSTS=new Set(['p16-common-sign.tiktokcdn-us.com','p19-common-sign.tiktokcdn-us.com']);
const stores=new WeakMap(),encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const error=(code,status=502)=>Object.assign(new Error(code),{status});
function store(fetcher){let s=stores.get(fetcher);if(!s){s={configs:new Map(),tokens:new Map()};stores.set(fetcher,s);}return s;}
function put(map,key,value,max){if(map.size>=max&&!map.has(key))map.delete(map.keys().next().value);map.set(key,value);}
const htmlDecode=s=>s.replace(/&amp;|&#0*38;|&#x0*26;/gi,'&').replace(/\\u0026/gi,'&').replace(/\\\//g,'/');
function validId(id){return /^[1-9]\d{0,5}$/.test(String(id));}
function validSession(s){return typeof s==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(s);}
function variantOf(raw,id){const u=daddySiteUrl(raw);return u&&new RegExp('^/(stream|cast|watch|plus|casting|player|hub)/stream-'+id+'\\.php$').exec(u.pathname)?.[1]||'stream';}
export function adapterPlayerUrl(raw,channelId,base){
  try{
    const u=new URL(htmlDecode(raw),base);
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return null;
    if(u.hostname==='dembed.st'&&u.pathname==='/premiumtv/daddy.php'&&u.searchParams.get('id')===String(channelId))return u.href;
    if(u.hostname==='assetrage.net'&&/^\/(?:embed|player|e)\//.test(u.pathname))return u.href;
    if(tossequipPlayerPage(u))return u.href;
    if(u.pathname==='/daddy.php'&&widePlayerPage(u))return u.href;
  }catch{}return null;
}
/** Data decoding only, based on the reference player's four-part configuration. */
export function decodeDaddyConfig(raw){
  if(typeof raw!=='string'||raw.length>262144||!/^[A-Za-z0-9+/=]+$/.test(raw))return null;
  try{
    const first=atob(raw),size=Math.ceil(first.length/4),parts=[];
    if(size<5)return null;
    for(const [i,to] of [2,0,3,1].entries()){
      const part=first.slice(i*size,(i+1)*size);parts[to]=atob(part.slice(0,3)+part.slice(4));
    }
    const value=JSON.parse(atob(parts.join('')));
    return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  }catch{return null;}
}
function mediaUrl(raw,profile,channelId,kind='media',base){
  try{
    if(typeof raw!=='string'||raw.length>4096)return null;
    const u=new URL(htmlDecode(raw),base);
    if(u.protocol!=='https:'||u.username||u.password||u.hash)return null;
    if(profile==='dembed'){
      if(u.origin===EDGE&&u.pathname.startsWith('/premium'+channelId+'/')&&
        (kind==='playlist'?u.pathname.endsWith('.m3u8'):/\.(?:ts|m4s|mp4)$/.test(u.pathname)))return u.href;
      if(kind==='media'&&!u.port&&SEGMENT_HOSTS.has(u.hostname)&&
        /^\/tiktok-obj-tx\/[a-f0-9]+~tplv-tiktokx-origin\.image$/.test(u.pathname))return u.href;
    }
    if(profile==='assetrage'&&/^[a-z0-9-]+\.7odxv0l067ka\.net$/.test(u.hostname)&&
      (!u.port||u.port==='8443')&&u.pathname.startsWith('/hls/')&&
      (kind==='playlist'?u.pathname.endsWith('.m3u8'):/\.(?:ts|m4s|mp4)$/.test(u.pathname)))return u.href;
    if(profile==='tossequip'&&tossequipMediaUrl(u)&&((kind==='playlist')===u.pathname.endsWith('.m3u8')))return u.href;
    if(profile==='wideiptv'&&u.origin===WIDE_CDN){
      u.pathname=u.pathname.replace(/\/{2,}/g,'/');
      if(/^\/[A-Za-z0-9_-]+\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:m3u8|ts|m4s|mp4)$/.test(u.pathname)&&
        (!base||u.pathname.split('/')[1]===new URL(base).pathname.split('/')[1])&&
        (kind==='playlist'?u.pathname.endsWith('.m3u8'):!u.pathname.endsWith('.m3u8')))return u.href;
    }
  }catch{}return null;
}
export function daddyPlayerConfig(html,pageUrl,channelId){
  if(!validId(channelId)||!adapterPlayerUrl(pageUrl,channelId))return null;
  if(new URL(pageUrl).origin===WIDE_PLAYER)return null;
  const profile={ 'dembed.st':'dembed','assetrage.net':'assetrage','tossequip.net':'tossequip' }[new URL(pageUrl).hostname];
  let url;
  if(profile==='dembed'){
    url=/\bconst\s+SRC\s*=\s*["']([^"']+)["']/.exec(html)?.[1];
    const edge=/\bconst\s+EDGE\s*=\s*["']([^"']+)["']/.exec(html)?.[1];
    const slug=/\bconst\s+CHANNEL\s*=\s*["']([^"']+)["']/.exec(html)?.[1];
    if(edge!==EDGE||slug!=='premium'+channelId||!html.includes('/api/playlist-token?slug='))return null;
  }else{
    const data=decodeDaddyConfig(/\b_econfig\s*=\s*["']([^"']+)["']/.exec(html)?.[1]);
    url=data?.stream_url_nop2p||data?.stream_url;
  }
  url=mediaUrl(url,profile,channelId,'playlist');if(!url)return null;
  return {profile,url,channelId:String(channelId),referer:ADAPTER_REFERERS[profile]};
}
async function bytes(url,headers,fetcher,context,limit=262144,prefix=false){
  for(let attempt=0;;attempt++){
    const controller=new AbortController(),abort=()=>controller.abort(context.signal.reason);
    if(context.signal.aborted)abort();else context.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','TimeoutError')),8000);
    try{
      return await withDaddyAbort(async()=>{
        context.take();
        const response=await fetcher(url,{redirect:'manual',signal:controller.signal,headers:{...headers,'Cache-Control':'no-store'}});
        if(!response.ok){await response.body?.cancel().catch(()=>{});throw error(
          response.status===401||response.status===403?'access_denied':'upstream_http_error',response.status>=400&&response.status<600?response.status:502);}
        if(!prefix&&Number(response.headers.get('content-length'))>limit){await response.body?.cancel().catch(()=>{});throw error('response_too_large');}
        return readBounded(response.body,limit,prefix);
      },controller.signal);
    }catch(e){
      if(attempt||context.signal.aborted||!(e.name==='TypeError'||e.name==='TimeoutError'||e.status>=500))throw e;
    }finally{clearTimeout(timer);context.signal.removeEventListener('abort',abort);}
  }
}
function headers(config){return {'User-Agent':AGENT,Referer:config.referer,Origin:new URL(config.referer).origin};}
async function playerConfig(id,html,pageUrl,fetcher,context){
  const page=new URL(pageUrl);
  if(page.origin!==WIDE_PLAYER)return daddyPlayerConfig(html,pageUrl,id);
  if(!adapterPlayerUrl(pageUrl,id))return null;
  const slug=page.searchParams.get('stream');
  const path='/player/'+slug;
  const frame=[...html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map(match=>match[1]).find(src=>src===path||src===WIDE_PLAYER+path);
  if(!frame)return null;
  const terminal=decoder.decode(await bytes(WIDE_PLAYER+path,{'User-Agent':AGENT,Referer:pageUrl},fetcher,context,512*1024));
  const raw=/\bstreamUrl\s*:\s*["']([^"']+)["']/.exec(terminal)?.[1];
  const url=mediaUrl(raw,'wideiptv',id,'playlist');
  if(!url||new URL(url).pathname!=='/'+slug+'/index.m3u8')return null;
  return {profile:'wideiptv',url,channelId:String(id),referer:WIDE_PLAYER+'/'};
}
async function token(config,session,fetcher,context,force=false){
  const map=store(fetcher).tokens,key=config.channelId+':'+session;
  const old=map.get(key),now=Date.now();
  if(!force&&old?.until>now)return old.value;
  if(old?.pending)return withDaddyAbort(()=>old.pending,context.signal);
  const pending=(async()=>{
    try{
      const data=JSON.parse(decoder.decode(await bytes(EDGE+'/api/playlist-token?slug=premium'+config.channelId,headers(config),fetcher,context,16384)));
      if(typeof data.token!=='string'||!data.token||data.token.length>4096)throw error('invalid_playlist_token');
      const ttl=Math.min(1200,Math.max(20,Number(data.ttl)||120))*1000;
      put(map,key,{value:data.token,until:Date.now()+ttl/2,expires:Date.now()+ttl-2000},128);
      return data.token;
    }catch(e){
      if(!force&&old?.expires>Date.now()&&!context.signal.aborted&&e.status>=500){map.set(key,old);return old.value;}
      map.delete(key);throw e;
    }
  })();
  put(map,key,{...old,pending},128);return pending;
}
async function playlist(config,url,session,fetcher,context,retry=true){
  if(!mediaUrl(url,config.profile,config.channelId,'playlist'))throw error('unsupported_media_address',400);
  let target=url;
  if(config.profile==='dembed'){
    const u=new URL(url);u.searchParams.delete('_');u.searchParams.set('t',await token(config,session,fetcher,context));target=u.href;
  }
  let body;
  try{body=await bytes(target,headers(config),fetcher,context);}
  catch(e){
    // The public player's normal token lifecycle: one refresh, no mirror switch.
    if(config.profile!=='dembed'||e.status!==403||!retry)throw e;
    await token(config,session,fetcher,context,true);return playlist(config,url,session,fetcher,context,false);
  }
  const text=decoder.decode(body).replace(/^\uFEFF/,'');
  if(!/^#EXTM3U(?:\r?\n|$)/.test(text)||!text.split(/\r?\n/).some(l=>l.trim()&&!l.startsWith('#')))throw error('unsupported_manifest');
  if(/^#EXT-X-(?:SESSION-KEY|KEY):.*\bMETHOD=(?!NONE\b)/m.test(text))throw error('encrypted_playlist');
  return text;
}
async function checkAdapterMedia(config,session,fetcher,context){
  let address=config.url;
  for(let depth=0;depth<3;depth++){
    const text=await playlist(config,address,session,fetcher,context);
    const master=/^#EXT-X-STREAM-INF:/m.test(text);
    const raw=text.split(/\r?\n/).map(line=>line.trim()).find(line=>line&&!line.startsWith('#'));
    const target=mediaUrl(raw,config.profile,config.channelId,master?'playlist':'media',address);
    if(!target)throw error('unsupported_media_address');
    if(master){address=target;continue;}
    const sample=await bytes(target,{...headers(config),Range:'bytes=0-4095'},fetcher,context,4096,true);
    if((sample[0]===0x47&&sample[188]===0x47)||isMp4(sample))return;
    throw error('unsupported_segment_container');
  }
  throw error('unsupported_manifest');
}
async function channelConfig(id,variant,fetcher,context,origin=DADDY_PRIMARY){
  const key=id+':'+variant,map=store(fetcher).configs,old=map.get(key);
  if(old?.until>Date.now())return old.config;
  const path='/'+variant+'/stream-'+id+'.php';
  const page=await withDaddyFallback(origin+path,fetcher,async(candidate,signal)=>{
    let current=candidate;
    for(let hop=0;hop<4;hop++){
      context.take();const r=await fetcher(current,{signal,redirect:'manual',headers:{'User-Agent':AGENT,Referer:new URL(current).origin+'/'}});
      if(r.status>=300&&r.status<400){
        const next=r.headers.get('location');await r.body?.cancel().catch(()=>{});
        if(!next||!sameDaddyRoute(new URL(next,current).href,current))throw error('redirect_not_supported');
        current=new URL(next,current).href;continue;
      }
      if(!r.ok){await r.body?.cancel().catch(()=>{});throw error('upstream_http_error',r.status);}
      return {url:current,html:decoder.decode(await readBounded(r.body,4*1024*1024))};
    }throw error('redirect_not_supported');
  },context);
  const frames=[...page.html.matchAll(/<iframe\b[^>]*>/gi)];
  for(const frame of frames){
    if(!/\bid\s*=\s*["'](?:thatframe|playerFrame)["']/i.test(frame[0]))continue;
    const raw=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(frame[0])?.[1];
    const url=raw&&adapterPlayerUrl(raw,id,page.url);if(!url)continue;
    const html=decoder.decode(await bytes(url,{'User-Agent':AGENT,Referer:page.url},fetcher,context,4*1024*1024));
    const config=await playerConfig(id,html,url,fetcher,context);
    if(config){put(map,key,{config,until:Date.now()+30000},32);return config;}
  }
  throw error('unsupported_player_configuration');
}
export async function resolveDaddyAdapterPage(id,html,pageUrl,fetcher,context,{playbackOrigin,referer}={}){
  const session=crypto.randomUUID(),variant=variantOf(referer,id);
  const verify=[WIDE_PLAYER,TOSSEQUIP].includes(new URL(pageUrl).origin);
  let config;
  try{
    config=await playerConfig(id,html,pageUrl,fetcher,context);
    if(!config)return null;
    if(!playbackOrigin)return {status:'playback_origin_required',stream:null};
    if(verify)await checkAdapterMedia(config,session,fetcher,context);
  }catch(e){
    if(!verify||context.signal.aborted||e.message==='request_limit')throw e;
    return null;
  }
  put(store(fetcher).configs,id+':'+variant,{config,until:Date.now()+30000},32);
  return {status:'resolved',adapter:config.profile,verification:verify?'entry_manifest_and_first_segment':'player_configuration',stream:{
    name:'DaddyLive HLS · Kanal '+id,
    url:new URL('daddy/live/'+id+'.m3u8?sid='+session+'&variant='+variant,playbackOrigin.replace(/\/$/,'')+'/').href,
    description:'HLS für den Nuvio-Player; Playlist-Erneuerung und Mediencontainer werden serverseitig verarbeitet.',
    behaviorHints:{notWebReady:false}
  }};
}
function encode(data){return btoa(String.fromCharCode(...encoder.encode(JSON.stringify(data)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(raw){
  if(raw.length>8192||!/^[A-Za-z0-9_-]+$/.test(raw))throw error('invalid_resource',400);
  try{return JSON.parse(decoder.decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0))));}
  catch{throw error('invalid_resource',400);}
}
export function rewriteDaddyPlaylist(text,base,config,session,origin){
  let variantNext=false;
  function resource(raw,kind){
    const url=mediaUrl(raw,config.profile,config.channelId,kind,base);
    if(!url)throw error('unsupported_media_address');
    const payload=encode([url,config.profile,session,Date.now()+180000]);
    return origin+'/daddy/resource/'+config.channelId+'/'+kind+'/'+payload+(kind==='playlist'?'.m3u8':'.ts');
  }
  return text.split(/\r?\n/).map(line=>{
    const value=line.trim();if(!value)return line;
    if(value.startsWith('#')){
      if(value.startsWith('#EXT-X-STREAM-INF:'))variantNext=true;
      return line.replace(/\bURI="([^"]+)"/g,(_,uri)=>'URI="'+resource(uri,
        /^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(value)?'playlist':'media')+'"');
    }
    const kind=variantNext||new URL(value,base).pathname.endsWith('.m3u8')?'playlist':'media';variantNext=false;
    return resource(value,kind);
  }).join('\n');
}
function response(body,status=200,extra={}){return new Response(body,{status,headers:{
  'access-control-allow-origin':'*','access-control-allow-headers':'Range','access-control-expose-headers':'Content-Range,Accept-Ranges',
  'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});}
export async function handleDaddyPlayback(request,env={},fetcher=fetch,route={}){
  const url=new URL(request.url),pathname=route.pathname||url.pathname,playbackBase=route.playbackBase||url.origin;
  const root=/^\/daddy\/live\/([1-9]\d{0,5})\.m3u8$/.exec(pathname);
  const resource=/^\/daddy\/resource\/([1-9]\d{0,5})\/(playlist|media)\/([A-Za-z0-9_-]{1,8192})\.(?:m3u8|ts)$/.exec(pathname);
  if(!root&&!resource)return response('Not found',404);
  const context=daddyRequestContext({signal:request.signal,timeout:20000,maxRequests:20});
  try{
    if(root){
      const session=url.searchParams.get('sid'),variant=url.searchParams.get('variant')||'stream';
      if(!validSession(session)||!VARIANTS.has(variant))throw error('invalid_playback_request',400);
      const config=await channelConfig(root[1],variant,fetcher,context);
      const text=await playlist(config,config.url,session,fetcher,context);
      return response(rewriteDaddyPlaylist(text,config.url,config,session,playbackBase),200,{'content-type':'application/vnd.apple.mpegurl'});
    }
    const descriptor=decode(resource[3]);
    if(!Array.isArray(descriptor)||descriptor.length!==4)throw error('invalid_resource',400);
    const [target,profile,session,expiry]=descriptor;
    if(!Object.hasOwn(ADAPTER_REFERERS,profile)||!validSession(session)||!Number.isSafeInteger(expiry)||expiry>Date.now()+600000)throw error('invalid_resource',400);
    if(expiry<Date.now())throw error('expired_resource',410);
    const referer=ADAPTER_REFERERS[profile];
    const config={channelId:resource[1],profile,referer};
    if(!mediaUrl(target,profile,resource[1],resource[2]))throw error('unsupported_media_address',400);
    if(resource[2]==='playlist'){
      const text=await playlist(config,target,session,fetcher,context);
      return response(rewriteDaddyPlaylist(text,target,config,session,playbackBase),200,{'content-type':'application/vnd.apple.mpegurl'});
    }
    const media=await decodeDaddyMedia(await bytes(target,headers(config),fetcher,context,16*1024*1024));
    const info={'content-type':isMp4(media)?'video/mp4':'video/mp2t','accept-ranges':'bytes'};
    let range;
    try{range=mediaRange(request.headers.get('range'),media.length);}
    catch{return response(null,416,{...info,'content-range':'bytes */'+media.length});}
    return range?response(media.subarray(range.start,range.end+1),206,{...info,'content-range':`bytes ${range.start}-${range.end}/${media.length}`}):response(media,200,info);
  }catch(e){
    const codes=new Set(['access_denied','upstream_http_error','response_too_large','unsupported_manifest','encrypted_playlist','unsupported_segment_container',
      'invalid_resource','expired_resource','unsupported_media_address','invalid_playback_request','unsupported_player_configuration','redirect_not_supported','invalid_playlist_token']);
    return response(JSON.stringify({error:context.signal.aborted?'playback_timeout':codes.has(e.message)?e.message:'playback_unavailable'}),context.signal.aborted?504:e.status>=400&&e.status<=599?e.status:502,{'content-type':'application/json'});
  }finally{context.close();}
}
