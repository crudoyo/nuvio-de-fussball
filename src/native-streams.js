/**
 * Native stream adapters for ordinary, directly playable HTTPS HLS/DASH.
 *
 * Stremio/Nuvio supports stream.url and behaviorHints.proxyHeaders, but it
 * does not execute Android DataSource classes. Do not attempt to turn HTML
 * player URLs, protected playlists, DRM or packed segments into direct video.
 *
 * NATIVE_CHANNEL_STREAMS_JSON is intended only for PUBLIC, authorized media
 * URLs. The Worker is an unauthenticated internet-facing endpoint: a private
 * entitlement, signed media token, cookie, password or subscription URL must
 * never be placed in this mapping.
 */
const CHANNEL_ID=/^[1-9]\d{0,5}$/;
const MAX_CONFIG_BYTES=32768;
const MEDIA_TYPES=new Map([['.m3u8','application/vnd.apple.mpegurl'],['.mpd','application/dash+xml']]);
const ALLOWED_HEADERS=new Map([
  ['referer','Referer'],['origin','Origin'],['user-agent','User-Agent']
]);
const SENSITIVE_QUERY=/^(?:token|auth|authorization|access_token|api.?key|key|sig|signature|secret|password|pass|jwt|session|sessionid|cookie|expires?|exp|policy)$/i;
function safeHost(host){
  const h=host.toLowerCase();
  return h!=='localhost'&&!h.endsWith('.localhost')&&!h.endsWith('.local')
    &&!h.endsWith('.internal')&&!h.endsWith('.test')&&!h.endsWith('.invalid')
    &&!h.includes(':')&&!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h);
}
export function publicMediaUrl(raw){
  try{
    if(typeof raw!=='string'||raw.length>2048)return null;
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!safeHost(u.hostname)||u.hash)
      return null;
    if(![...MEDIA_TYPES.keys()].some(ext=>u.pathname.toLowerCase().endsWith(ext)))
      return null;
    for(const key of u.searchParams.keys())if(SENSITIVE_QUERY.test(key))return null;
    return u.href;
  }catch{return null;}
}
export function cleanMediaHeaders(headers){
  if(!headers||typeof headers!=='object'||Array.isArray(headers))return {};
  const out={};
  for(const [key,value] of Object.entries(headers)){
    const name=ALLOWED_HEADERS.get(String(key).toLowerCase());
    if(!name||typeof value!=='string'||value.length>256||/[\r\n\u0000-\u001f]/.test(value))continue;
    const v=value.trim();
    if(!v)continue;
    if(name==='Referer'||name==='Origin'){
      try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||!safeHost(u.hostname))continue;}
      catch{continue;}
    }
    out[name]=v;
  }
  return out;
}
export function nativeStreamRecord(entry,channelLabel){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const url=publicMediaUrl(entry.url);
  if(!url)return null;
  const headers=cleanMediaHeaders(entry.headers);
  const path=new URL(url).pathname.toLowerCase();
  const extension=path.endsWith('.mpd')?'.mpd':'.m3u8';
  const format=extension==='.mpd'?'DASH':'HLS';
  const name=String(entry.name||channelLabel||'Direktstream').replace(/[\r\n]/g,' ').slice(0,90);
  return {
    name:'Native '+format+' · '+name,
    url,
    description:'Direkter '+format+'-Stream aus selbst konfigurierter, öffentlich nutzbarer Medienquelle',
    behaviorHints:{
      notWebReady:true,
      ...(Object.keys(headers).length?{proxyHeaders:{request:headers}}:{})
    }
  };
}
export function nativeMappedStreams(game,events,matchScore,env={}){
  const raw=env.NATIVE_CHANNEL_STREAMS_JSON;
  if(typeof raw!=='string'||!raw||raw.length>MAX_CONFIG_BYTES)return [];
  let conf;
  try{conf=JSON.parse(raw);}catch{return [];}
  if(!conf||typeof conf!=='object'||Array.isArray(conf))return [];
  const score=(awaitMatch)=>awaitMatch; // no async fetch: deterministic match only
  void score;
  const matches=events.map(e=>({...e,score:matchScore(game,{name:e.name,startTime:e.startTime})}))
    .filter(e=>e.score>=12&&Math.abs(Date.parse(e.startTime)-Date.parse(game.matchDateTimeUTC))<=8*3600000)
    .sort((a,b)=>b.score-a.score).slice(0,3);
  const results=[],seen=new Set();
  for(const match of matches){
    for(const channel of match.channels||[]){
      const id=String(channel.id||'');
      if(!CHANNEL_ID.test(id)||seen.has(id))continue;
      const value=conf[id];
      if(!value)continue;
      const record=nativeStreamRecord(value,channel.name);
      if(!record)continue;
      seen.add(id);
      results.push(record);
      if(results.length>=12)return results;
    }
  }
  return results;
}
/**
 * Normalize HLS and DASH returned by a connected addon, without overwriting
 * its declared proxy headers. NEVER interpret an HTML URL as a native stream.
 */
export function nativeAddonStream(stream){
  if(!stream||typeof stream!=='object'||typeof stream.url!=='string')return stream;
  const url=stream.url;
  let media=false;
  try{
    const u=new URL(url);
    media=u.protocol==='https:'&&[...MEDIA_TYPES.keys()].some(ext=>u.pathname.toLowerCase().endsWith(ext));
  }catch{return stream;}
  if(!media)return stream;
  return {
    ...stream,
    behaviorHints:{...(stream.behaviorHints||{}),notWebReady:true}
  };
}
