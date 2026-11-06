/** Resolve ordinary HLS and the explicitly supported Daddy HLS adapters.
 * No arbitrary script execution, cookies or DRM. Failures retain browser options.
 */
import {daddyPlayerUrl,matchDaddyEvents} from './daddylive.js';
import {publicMediaUrl,publicResourceUrl,nativeStreamRecord} from './native-streams.js';
import {manifestKind} from './manifest-check.js';
import {adapterPlayerUrl,resolveDaddyAdapterPage} from './daddy-playback.js';
import {DADDY_PRIMARY,daddySiteUrl,sameDaddyRoute,daddyChannelPage,daddyRequestContext,withDaddyFallback,withDaddyAbort} from './daddy-domains.js';
const HOSTS=new Set(['assetrage.net','dembed.st','ksohls.ru',
  'www.ksohls.ru','tossequip.net','api.cdnlivetv.tv','out-3.welovetocare.shop']);
const SPECIAL=new Set(['dembed.st','ksohls.ru','www.ksohls.ru']);
const AGENT='Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const fail=(code,status)=>{const error=new Error(code);error.status=status;throw error;};
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#(?:0*38|x0*26);/gi,'&').replace(/\\\//g,'/');
function resource(raw,base){
  try{
    const url=publicResourceUrl(new URL(decode(raw),base).href);
    if(!url||new URL(url).searchParams.has('t'))return null;
    return url;
  }catch{return null;}
}
function player(raw,base){const u=resource(raw,base);return u&&(daddySiteUrl(u)||HOSTS.has(new URL(u).hostname))?u:null;}
function attributes(tag){
  const out={};
  for(const m of tag.matchAll(/\b([\w-]+)\s*=\s*(["'])(.*?)\2/gs))out[m[1].toLowerCase()]=decode(m[3]);
  return out;
}
export function literalMedia(html){
  const source=html.replace(/<!--[^]*?-->/g,'');
  for(const m of source.matchAll(/(?:\b(?:const|let|var)\s+SRC\s*=|["']?\b(?:file|source|src)["']?\s*:)\s*["'](https:[^"'<>\s]+)["']/gi)){
    const url=resource(m[1]);if(url&&publicMediaUrl(url))return url;
  }
  // Only explicit atob data expressions; never invoke arbitrary page functions.
  const usage=/source\s*:\s*\{\s*src\s*:\s*([\w$]+)\s*[,}]/.exec(source);
  if(!usage)return null;
  const values=new Map([...source.matchAll(/\b(?:var|let|const)\s+([\w$]+)\s*=\s*["']([A-Za-z0-9+/=_-]{1,8192})["']/g)].map(m=>[m[1],m[2]]));
  const decoders=new Set(['atob']);
  for(const wrapper of source.matchAll(/\bfunction\s+([\w$]+)\s*\(\s*([\w$]+)\s*\)\s*\{\s*return\s+atob\(\s*\2\s*\)\s*;?\s*\}/g))decoders.add(wrapper[1]);
  for(const assignment of source.matchAll(/\b(?:var|let|const)\s+([\w$]+)\s*=\s*([^;]{1,16000});/g)){
    if(assignment[1]!==usage[1])continue;
    const parts=assignment[2].split('+');if(parts.length>24)return null;
    try{
      const url=parts.map(part=>{
        const call=/^\s*([\w$]+)\(\s*([\w$]+)\s*\)\s*$/.exec(part);
        if(!call||!decoders.has(call[1])||!values.has(call[2]))throw new Error();
        return atob(values.get(call[2]).replace(/-/g,'+').replace(/_/g,'/'));
      }).join('');
      return url.length<=2048&&resource(url)&&publicMediaUrl(url)?url:null;
    }catch{return null;}
  }
  return null;
}
async function read(response,limit,prefix=false){
  if(!response.body)fail('empty_response');
  const reader=response.body.getReader(),parts=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      if(length+value.length>limit&&!prefix)fail('response_too_large');
      const part=value.subarray(0,limit-length);parts.push(part);length+=part.length;
      if(prefix&&length===limit)break;
    }
  }finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let at=0;
  for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
}
async function getOnce(url,headers,fetcher,signal,context,segment=false,page=false){
  let current=url;const visited=new Set();
  for(let redirect=0;;redirect++){
  if(visited.has(current))fail('redirect_not_supported');visited.add(current);
  context.take();
  const site=daddySiteUrl(current),referer=daddySiteUrl(headers.Referer);
  const requestHeaders={...headers};
  if(site&&referer)requestHeaders.Referer=site.origin+referer.pathname+referer.search;
  const response=await fetcher(current,{redirect:'manual',signal,
    headers:{...requestHeaders,'Cache-Control':'no-store',...(segment?{Range:'bytes=0-4095'}:{})}});
  if(page&&response.status>=300&&response.status<400){
    const location=response.headers.get('location'),next=location&&player(location,current);
    await response.body?.cancel().catch(()=>{});
    if(!next||next===current||redirect>=3||
      (daddySiteUrl(current)&&!sameDaddyRoute(next,current))||
      (daddySiteUrl(next)&&!daddyChannelPage(next,context.channelId)))fail('redirect_not_supported');
    current=next;continue;
  }
  if(response.status!==200&&!(segment&&response.status===206)){
    await response.body?.cancel().catch(()=>{});
    fail(response.status===401||response.status===403?'access_denied':
      response.status>=300&&response.status<400?'redirect_not_supported':'upstream_http_error',response.status);
  }
  // Ignore optional response cookies. They do not prove session dependence.
  // Subsequent requests remain cookie-free; 401/403 is still a hard stop.
  // Current player pages embed large channel lists. Match the Android page
  // budget while keeping manifests and media-prefix probes much smaller.
  const bytes=await read(response,page?4*1024*1024:segment?4096:256*1024,segment);
  return page?{bytes,url:current}:bytes;
  }
}
async function get(url,headers,fetcher,context,segment=false,page=false){
  return page?withDaddyFallback(url,fetcher,(candidate,signal)=>
    getOnce(candidate,headers,fetcher,signal,context,false,true),context):
    withDaddyAbort(()=>getOnce(url,headers,fetcher,context.signal,context,segment,false),context.signal);
}
export function ordinarySegment(bytes){
  if(bytes.length>188&&bytes[0]===0x47&&bytes[188]===0x47)return true;
  return bytes.length>=8&&['ftyp','styp','moof'].includes(new TextDecoder().decode(bytes.subarray(4,8)));
}
async function checkHls(url,headers,fetcher,context){
  let current=url;const visited=new Set();
  for(let hop=0;hop<3;hop++){
    if(visited.has(current))fail('playlist_loop');visited.add(current);
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await get(current,headers,fetcher,context));
    if(manifestKind(text)!=='hls')fail('unsupported_manifest');
    if(/^#EXT-X-(?:SESSION-KEY|KEY):/m.test(text))fail('encrypted_playlist');
    const uris=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
    if(!uris.length)fail('empty_playlist');
    const next=resource(uris[0],current);if(!next)fail('session_media_address');
    if(/^#EXT-X-STREAM-INF:/m.test(text)){current=next;continue;}
    if(!ordinarySegment(await get(next,headers,fetcher,context,true)))fail('unsupported_segment_container');
    return;
  }
  fail('playlist_depth_limit');
}
export async function resolveDaddyChannel(channelId,fetcher=fetch,{signal,origin=DADDY_PRIMARY,playbackOrigin}={}){
  if(signal?.aborted)throw signal.reason;
  const start=daddyPlayerUrl(channelId,origin);
  if(!start)return {status:'invalid_channel',stream:null};
  const context=daddyRequestContext({signal,timeout:6000});context.channelId=String(channelId).trim();
  const queue=[{url:start,referer:new URL(start).origin+'/',entry:true}],seen=new Set();let status='no_public_media';
  const checks={pages:0,contentFrames:0,offeredAlternatives:0,mediaConfigurations:0,providerTransportPages:0};
  try{
    for(let count=0;queue.length&&count<8;){
      const page=queue.shift();if(seen.has(page.url))continue;seen.add(page.url);
      // Skip unsupported legacy transports. The checked current Daddy page
      // has a server-side adapter and is resolved below.
      if(SPECIAL.has(new URL(page.url).hostname)&&!adapterPlayerUrl(page.url,channelId)){
        status='provider_transport_required';checks.providerTransportPages++;continue;
      }
      count++;
      checks.pages++;
      let response;
      try{
        response=await get(page.url,{'User-Agent':AGENT,Referer:page.referer},fetcher,context,false,true);
      }catch(error){
        if(!page.optional||error.message!=='upstream_http_error')throw error;
        continue;
      }
      page.url=response.url;
      seen.add(page.url);
      const origin=new URL(page.url).origin;
      const html=new TextDecoder('utf-8',{fatal:true}).decode(response.bytes);
      if(SPECIAL.has(new URL(page.url).hostname)){status='provider_transport_required';checks.providerTransportPages++;}
      if(adapterPlayerUrl(page.url,channelId)){
        const adapted=await resolveDaddyAdapterPage(channelId,html,page.url,fetcher,context,{playbackOrigin,referer:page.referer});
        if(adapted){checks.mediaConfigurations++;return {...adapted,checks};}
      }
      const media=literalMedia(html);
      if(media){
        checks.mediaConfigurations++;
        if(SPECIAL.has(new URL(page.url).hostname))status='provider_transport_required';
        else if(new URL(media).pathname.toLowerCase().endsWith('.mpd'))status='dash_requires_configured_source';
        else{
          const headers={'User-Agent':AGENT,Referer:origin+'/',Origin:origin};
          try{
            await checkHls(media,headers,fetcher,context);
            const stream=nativeStreamRecord({url:media,headers,name:'DaddyLive · Kanal '+channelId});
            stream.description='Öffentliche HLS-Konfiguration automatisch aufgelöst; Manifest und erstes Segment geprüft. Gerätewiedergabe nicht bestätigt.';
            return {status:'resolved',stream,checks};
          }catch(error){
            if(!['unsupported_manifest','empty_playlist','unsupported_segment_container','playlist_loop','playlist_depth_limit'].includes(error.message))throw error;
            status=error.message;
          }
        }
      }
      // The provider identifies its content iframe explicitly. Ignore ad frames.
      for(const tag of html.matchAll(/<iframe\b[^>]*>/gi)){
        const a=attributes(tag[0]);if(!['thatframe','playerFrame'].includes(a.id))continue;
        const url=player(a.src,page.url);if(url&&!seen.has(url)&&queue.length<12){checks.contentFrames++;queue.unshift({url,referer:page.url});}
      }
      // Only offered same-channel alternatives; never manufacture media addresses.
      for(const tag of html.matchAll(/<(?:button|a)\b[^>]*\bdata-url\s*=[^>]*>/gi)){
        const a=attributes(tag[0]),url=player(a['data-url'],page.url);
        if(url&&daddyChannelPage(url,channelId)&&!seen.has(url)&&queue.length<12){checks.offeredAlternatives++;queue.push({url,referer:page.url});}
      }
      // Current Android catalogue uses this public channel-selection page.
      // Read its offered buttons too; the legacy stream page may omit them.
      if(page.entry)queue.push({url:new URL('/watch.php?id='+String(channelId).trim(),page.url).href,referer:page.url,optional:true});
    }
    return {status,stream:null,checks};
  }catch(error){
    if(signal?.aborted)throw signal.reason;
    checks.failure=/too many subrequests/i.test(error.message)?'worker_subrequest_limit':String(error.name||'Error').replace(/[^a-zA-Z]/g,'').slice(0,30);
    const codes=new Set(['empty_response','response_too_large','access_denied','redirect_not_supported',
      'upstream_http_error','session_required','playlist_loop','unsupported_manifest','encrypted_playlist',
      'empty_playlist','session_media_address','unsupported_segment_container','playlist_depth_limit','request_limit','invalid_playlist_token']);
    return {status:context.signal.aborted||error.name==='TimeoutError'?'timeout':codes.has(error.message)?error.message:'not_reachable',stream:null,checks};
  }finally{checks.requests=context.requests;checks.domainFallbacks=context.fallbacks;context.close();}
}
export async function automaticDaddyStreams(game,events,matchScore,env,fetcher,options={}){
  if(String(env.DADDY_NATIVE_RESOLVE||'').toLowerCase()!=='true')return [];
  const channels=[...new Map(matchDaddyEvents(game,events,matchScore).flatMap(e=>e.channels).map(c=>[c.id,c])).values()].slice(0,2);
  const results=await Promise.all(channels.map(async channel=>{
    const result=await resolveDaddyChannel(channel.id,fetcher,options);
    options.onDiagnostic?.(channel.id,result);
    if(result.stream&&result.stream.url.includes('/daddy/live/'))result.stream.name='DaddyLive HLS · '+channel.name;
    return result;
  }));
  return results.flatMap(r=>r.stream?[r.stream]:[]);
}
