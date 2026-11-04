/**
 * DaddyLive schedule adapter for Cloudflare Workers.
 *
 * Data access only: (1) public JSON schedule published by the provider
 * or (2) the provider's protected schedule API when the owner supplies
 * DADDY_API_KEY as a Cloudflare secret.
 *
 * No iframe scraping, token reconstruction, DRM workarounds or CDN proxying.
 * Documented channel URLs are HTML player pages, NOT native HLS streams.
 */
export const DADDY_PUBLIC_SCHEDULE =
  'https://dlstreams.st/schedule/schedule-generated.json';
export const DADDY_API_BASE = 'https://thedaddy.pk/daddyapi.php';
export const DADDY_PLAYER_BASE = 'https://thedaddy.pk/stream/stream-';
const MAX_BODY_BYTES = 8_000_000;
const CACHE_MS = 180_000;
const FAILED_CACHE_MS = 20_000;
const cache = new Map();

function text(value) {
  return String(value ?? '').replace(/<[^>]*>/g,' ')
    .replace(/&(?:amp|#38);/gi,'&').replace(/&(?:quot|#34);/gi,'"')
    .replace(/&(?:apos|#39|#039);/gi,"'")
    .replace(/&(?:lt|#60);/gi,'<').replace(/&(?:gt|#62);/gi,'>')
    .replace(/\s+/g,' ').trim();
}
const isFootballCategory = value =>
  /(?:soccer|football|fussball|fußball|fútbol|futbol)/i.test(text(value));
const MONTHS = {
  january:0,february:1,march:2,april:3,may:4,june:5,
  july:6,august:7,september:8,october:9,november:10,december:11
};

export function parseUkScheduleDate(dayLabel, time) {
  const clock = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time||'').trim());
  if(!clock) return null;
  const label=text(dayLabel);
  const m=/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i.exec(label);
  let y,month,day;
  if(m) {
    day=Number(m[1]);month=MONTHS[m[2].toLowerCase()];y=Number(m[3]);
  } else {
    const iso=/\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(label);
    if(!iso)return null;
    y=Number(iso[1]);month=Number(iso[2])-1;day=Number(iso[3]);
  }
  const date = new Date(Date.UTC(y,month,day,Number(clock[1]),Number(clock[2])));
  if(date.getUTCFullYear()!==y || date.getUTCMonth()!==month ||
    date.getUTCDate()!==day)return null;
  // The documented API labels schedule times UK GMT, i.e. UTC.
  // If the upstream changes to BST/London local time, their metadata must be
  // corrected rather than silently assuming the offset.
  return date.toISOString();
}
function validChannel(raw) {
  if(!raw || typeof raw !== 'object')return null;
  const id=String(raw.channel_id??raw.id??'').trim();
  if(!/^\d{1,6}$/.test(id) || Number(id)===0)return null;
  const name=text(raw.channel_name||raw.name).slice(0,100);
  return {id,name:name||'Kanal '+id};
}
export function parseDaddySchedule(payload) {
  const root = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data : payload;
  if(!root || typeof root !== 'object' || Array.isArray(root))return [];
  const output=[];
  for(const [day, categories] of Object.entries(root).slice(0,45)) {
    if(!categories || typeof categories !== 'object' || Array.isArray(categories))continue;
    for(const [category,events] of Object.entries(categories).slice(0,80)) {
      if(!isFootballCategory(category) || !Array.isArray(events))continue;
      for(const item of events.slice(0,300)) {
        if(!item || typeof item !== 'object')continue;
        const name=text(item.event||item.name||item.title).slice(0,220);
        const startTime=parseUkScheduleDate(day,item.time);
        if(!name || !startTime)continue;
        const channels=[],seen=new Set();
        for(const ch of [...(Array.isArray(item.channels)?item.channels:[]),
                          ...(Array.isArray(item.channels2)?item.channels2:[])].slice(0,30)){
          const c=validChannel(ch);
          if(c && !seen.has(c.id)){seen.add(c.id);channels.push(c);}
        }
        if(channels.length)output.push({name,startTime,category:text(category),channels});
        if(output.length>=1200)return output;
      }
    }
  }
  return output;
}
export function daddyPlayerUrl(channelId) {
  const id=String(channelId??'').trim();
  if(!/^\d{1,6}$/.test(id) || Number(id)===0)return null;
  return DADDY_PLAYER_BASE+id+'.php';
}
function apiUrl(apiKey) {
  const base=new URL(DADDY_API_BASE);
  base.searchParams.set('key',apiKey);
  base.searchParams.set('endpoint','schedule');
  return base.toString();
}
async function downloadSchedule(url, fetcher) {
  const response=await fetcher(url,{
    headers:{accept:'application/json'},
    redirect:'manual',
    signal:AbortSignal.timeout(8500)
  });
  if(!response.ok)throw new Error('HTTP '+response.status);
  const length=Number(response.headers.get('content-length')||0);
  if(length>MAX_BODY_BYTES)throw new Error('Payload too large');
  const raw=await response.text();
  if(raw.length>MAX_BODY_BYTES)throw new Error('Payload too large');
  let payload;
  try {payload=JSON.parse(raw);}catch{throw new Error('Invalid JSON');}
  if(payload?.success===false)throw new Error('API denied request');
  if(!payload || typeof payload !== 'object')throw new Error('Invalid schema');
  return parseDaddySchedule(payload);
}
/**
 * Does not expose the API key or full remote URLs in diagnostics.
 * A source returning HTTP 200 but zero compatible football events is reported
 * distinctly from a network error.
 */
export async function getDaddySchedule(env={},fetcher=fetch) {
  const key=String(env.DADDY_API_KEY||'').trim();
  // Keep mocked fetchers uncached so tests and diagnostics remain independent.
  // API keys stay only in memory and are never included in response data.
  const cacheKey=key?'protected:'+key:'public';
  const useCache=fetcher===fetch;
  const old=useCache?cache.get(cacheKey):null;
  if(old && old.expires>Date.now())return old.result;
  if(old?.pending)return old.pending;
  const pending=(async()=>{
    const attempts=[];
    const candidates=[
      ...(key?[{name:'DaddyLive API (Schlüssel)',url:apiUrl(key)}]:[]),
      {name:'DaddyLive öffentlicher Spielplan',url:DADDY_PUBLIC_SCHEDULE}
    ];
    for(const source of candidates){
      try{
        const events=await downloadSchedule(source.url,fetcher);
        const result={reachable:true,source:source.name,events,attempts,
          footballEvents:events.length,channelCount:
            new Set(events.flatMap(x=>x.channels.map(c=>c.id))).size};
        if(useCache)cache.set(cacheKey,{result,expires:Date.now()+CACHE_MS});
        return result;
      }catch(e){
        const msg=String(e?.message||'request failed');
        attempts.push({source:source.name,
          reason:/^HTTP \d{3}$/.test(msg)?msg:msg==='Invalid JSON'?'Invalid JSON':
            msg==='Invalid schema'?'Invalid schema':msg==='API denied request'?'API denied request':
            msg==='Payload too large'?'Payload too large':'Not reachable'});
      }
    }
    const result={reachable:false,source:null,events:[],attempts,
      footballEvents:0,channelCount:0};
    if(useCache)cache.set(cacheKey,{result,expires:Date.now()+FAILED_CACHE_MS});
    return result;
  })();
  if(useCache)cache.set(cacheKey,{pending,expires:0});
  return pending;
}
export function matchDaddyEvents(game,events,matchScore) {
  const kickoff=Date.parse(game?.matchDateTimeUTC||'');
  if(!Number.isFinite(kickoff))return [];
  return events.map(e=>({...e,score:matchScore(game,{name:e.name,startTime:e.startTime})}))
    .filter(e=>e.score>=12 && Number.isFinite(Date.parse(e.startTime)) &&
      Math.abs(Date.parse(e.startTime)-kickoff)<=8*3600000)
    .sort((a,b)=>b.score-a.score).slice(0,3);
}
/** Public HTML player entry, not a decrypted playlist nor guaranteed playable. */
export function externalDaddyPlayers(game,events,matchScore) {
  const matches=matchDaddyEvents(game,events,matchScore);
  const streams=[],seen=new Set();
  for(const match of matches){
    for(const channel of match.channels){
      const externalUrl=daddyPlayerUrl(channel.id);
      if(!externalUrl||seen.has(externalUrl))continue;
      seen.add(externalUrl);
      streams.push({name:'DaddyLive · '+channel.name,externalUrl,
        description:'Externe HTML-Playerseite (kein nativer HLS-Stream)'});
      if(streams.length>=12)return streams;
    }
  }
  return streams;
}
export function daddyPublicDiagnostic(result) {
  return {
    name:'DaddyLive (direkter Spielplan)',
    reachable:result.reachable,source:result.source,
    footballEvents:result.footballEvents,channels:result.channelCount,
    externalPlayerType:'HTML (kein HLS)',
    attempts:result.attempts
  };
}
