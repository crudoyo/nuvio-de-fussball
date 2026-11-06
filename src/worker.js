/**
 * Nuvio German Football – Cloudflare Worker, Stremio addon protocol.
 * Data: OpenLigaDB (ODbL). Streams: optional user-configured Stremio sports addons.
 * No direct scraping, DRM circumvention, torrent/P2P support or stream fabrication.
 */
import { espnScoreboardUrl, normalizeEspnEvents } from './international.js';
import { makeMatchPoster } from './graphics.js';
import { espnTeamsUrl, attachFallbackCrests, curatedCrest } from './crests.js';
import { badgeImageUrl } from './graphics.js';
import {
  getDaddySchedule, matchDaddyEvents, externalDaddyPlayers, daddyPublicDiagnostic,
  diagnoseDaddyFixture
} from './daddylive.js';
import {nativeMappedStreams} from './native-streams.js';
import {sportsCatalogRequests,forwardSportsStream} from './upstream-sports.js';
import {verifiedNativeStreams} from './manifest-check.js';
import {automaticDaddyStreams,resolveDaddyChannel} from './daddy-native.js';
export const VERSION = '0.4.15';
const API = 'https://api.openligadb.de';
const MAX_UPSTREAMS = 8;
// Public addons provide their own catalogs/stream endpoints.
// PenguPlay's bare manifest has no Live TV settings: use the personal config URL.
const BUILTIN_MANIFESTS = [
  'https://sports.highfly.to/manifest.json',
  'https://sportsfree.highfly.to/manifest.json',
  'https://sportsfree-us2.highfly.to/manifest.json',
  'https://nuvio.moaqeel6679.my.id/manifest.json'
];
function streamSources(personal = []) {
  return safeUrls([...personal, ...BUILTIN_MANIFESTS]);
}
const core = [
  ['bl1', '1. Bundesliga'], ['bl2', '2. Bundesliga'], ['bl3', '3. Liga'],
  ['ucl', 'Champions League'], ['uel', 'Europa League'], ['uecl', 'Conference League'],
  ['dfb', 'DFB-Pokal'], ['ffb1', 'Frauen-Bundesliga'],
  ['ffb2', '2. Frauen-Bundesliga'], ['dfbf', 'DFB-Pokal Frauen'],
  ['BLSupercup', 'Supercup'], ['wsc', 'Frauen-Supercup'],
];
const leaguePattern = /(regionalliga|oberliga|bayernliga|landesliga|verbandsliga|thüringenliga|hessenliga|mittelrheinliga|niedersachsenliga|nordostliga|brandenburgliga|schleswig-holstein-liga|frauen.*liga|liga.*frauen|pokal|kreisliga|bezirksliga)/i;
const excludedPattern = /(test|prob(e|ier)|hockey|admiral|österreich|la liga|premier league|weltmeisterschaft)/i;
const memoryCache = new Map();
const txt = new TextEncoder();
const decoder = new TextDecoder();

function seasonOf(now = new Date()) { return now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0); }
function clean(v) { return String(v ?? '').trim(); }
function cacheTTL(ttl) { return Math.min(ttl, 21600); }
function corsHeaders(age = 90) { return { 'access-control-allow-origin': '*', 'cache-control': `public, max-age=${age}`, 'x-content-type-options': 'nosniff' }; }
function json(body, status = 200, age = 90) { return new Response(JSON.stringify(body), {status, headers: {'content-type':'application/json; charset=utf-8', ...corsHeaders(age)}}); }
function html(body, status = 200) { return new Response(body, {status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}}); }
const escape = s => String(s ?? '').replace(/[&<>"']/g, x=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[x]);

function hostIsUnsafe(host) {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
}
export function manifestUrl(input) {
  try {
    const url = new URL(clean(input));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.pathname.endsWith('/manifest.json') || hostIsUnsafe(url.hostname)) return null;
    if (url.href.length > 512) return null;
    return url.href;
  } catch { return null; }
}
function safeUrls(xs) { return [...new Set(xs.map(manifestUrl).filter(Boolean))].slice(0, MAX_UPSTREAMS); }
function b64encode(s) { return btoa(String.fromCharCode(...txt.encode(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64decode(s) { return decoder.decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4)), c=>c.charCodeAt(0))); }
export function encodeConfig(xs) { return b64encode(JSON.stringify({m:safeUrls(xs)})); }
export function decodeConfig(s) {
  if (!/^[A-Za-z0-9_-]{1,3500}$/.test(s)) throw new Error('Ungültige Konfiguration');
  const value=JSON.parse(b64decode(s));
  if (!Array.isArray(value.m)) throw new Error('Ungültige Konfiguration');
  return safeUrls(value.m);
}
function catalogId(shortcut) { return `defootball_${shortcut.toLowerCase().replace(/[^a-z0-9_-]/g,'')}`; }
export function discoverLeagues(rows = [], extras='') {
  const all = new Map(core.map(([shortcut,name]) => [shortcut.toLowerCase(),{shortcut,name,priority:0}]));
  for (const item of rows) {
    const shortcut=clean(item.leagueShortcut || item.shortcut), name=clean(item.leagueName || item.name);
    if (!/^[a-z0-9_-]{2,40}$/i.test(shortcut) || !name || excludedPattern.test(name) || !leaguePattern.test(name)) continue;
    if (!all.has(shortcut.toLowerCase())) all.set(shortcut.toLowerCase(), {shortcut,name,priority:1});
  }
  for (const item of extras.split(',')) {
    const idx=item.indexOf(':'); if (idx<1) continue;
    const shortcut=clean(item.slice(0,idx)),name=clean(item.slice(idx+1));
    if (/^[a-z0-9_-]{2,40}$/i.test(shortcut) && name && name.length<=80) all.set(shortcut.toLowerCase(),{shortcut,name,priority:1});
  }
  return [...all.values()].sort((a,b)=>a.priority-b.priority || a.name.localeCompare(b.name,'de'));
}
async function loadJSON(url, ttl, fetcher=fetch) {
  const key=String(url), old=memoryCache.get(key);
  if (old?.until > Date.now()) return old.value;
  if (old?.pending) return old.pending;
  const pending=(async()=>{
    const headers={accept:'application/json'};
    const cache=typeof caches !== 'undefined' && caches.default ? caches.default : null;
    const req=new Request(key,{headers});
    if (cache) {
      const hit=await cache.match(req);
      if (hit) { const value=await hit.json(); memoryCache.set(key,{value,until:Date.now()+60_000}); return value; }
    }
    const res=await fetcher(key,{headers,signal:AbortSignal.timeout(8500),redirect:'manual'});
    if (!res.ok) throw new Error(`Datenquelle HTTP ${res.status}`);
    const value=await res.json();
    memoryCache.set(key,{value,until:Date.now()+ttl*1000});
    if (cache) {
      const reply=new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':`public,max-age=${cacheTTL(ttl)}`}});
      await cache.put(req,reply);
    }
    return value;
  })().catch(e=>{ if(old?.value) return old.value; throw e; }).finally(()=>{ const cur=memoryCache.get(key); if(cur?.pending) memoryCache.delete(key); });
  memoryCache.set(key,{...old,pending});
  return pending;
}
async function leagues(env, fetcher) {
  const season=Number(env.SEASON)||seasonOf();
  let rows=[];
  try { rows=await loadJSON(`${API}/getavailableleagues/${season}`,21600,fetcher); }
  catch { /* use core leagues if discovery is unavailable */ }
  return discoverLeagues(Array.isArray(rows)?rows:[],env.EXTRA_LEAGUES||'');
}
async function fixtures(league,env,fetcher) {
  const external=espnScoreboardUrl(league.shortcut);
  let matches;
  if(external) matches=normalizeEspnEvents(await loadJSON(external,600,fetcher));
  else {
    const season=Number(env.SEASON)||seasonOf();
    const rows=await loadJSON(API + '/getmatchdata/' + encodeURIComponent(league.shortcut) + '/' + season,600,fetcher);
    matches=Array.isArray(rows)?rows.filter(x=>Number.isInteger(x.matchID)&&x.team1?.teamName&&x.team2?.teamName):[];
  }
  // The second source only improves artwork; missing/blocked ESPN must
  // never prevent the match catalog from being shown.
  const crestUrl=espnTeamsUrl(league.shortcut);
  if(!crestUrl || !matches.length) return matches;
  try {
    return attachFallbackCrests(matches, await loadJSON(crestUrl,14400,fetcher));
  } catch { return matches; }
}
export function startTime(m) {
  const raw=m.matchDateTimeUTC;
  if (raw) { const s=String(raw); const d=new Date(s + (/[zZ]|[+-]\d\d:?\d\d$/.test(s)?'':'Z')); if(!Number.isNaN(+d)) return d; }
  return null; // UTC missing: do not invent a timezone for German local timestamps
}
const dateLabel = m => { const d=startTime(m); return d ? new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)+' Uhr' : 'Termin offen'; };
export function selectUpcoming(items, now=Date.now()) {
  return items.filter(m=>{const t=+startTime(m);return t && t>now-86400_000 && t<now+30*86400_000;})
    .sort((a,b)=>startTime(a)-startTime(b)).slice(0,150);
}
function gameId(league,game) { return `${catalogId(league.shortcut)}_${game.matchID}`; }
function parseGame(id,list) {
  for(const league of list){const prefix=`${catalogId(league.shortcut)}_`;if(id.startsWith(prefix)&&/^\d+$/.test(id.slice(prefix.length)))return {league,mid:id.slice(prefix.length)};}
  return null;
}
function status(m,now=Date.now()) {
  if(m.matchIsFinished)return 'Beendet';
  const t=+startTime(m);if(!t)return 'Termin offen';
  if(t<=now && now-t<3*3600000)return 'Anstoß erfolgt / läuft möglicherweise';
  if(new Date(t).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'})===new Date(now).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}))return 'Heute';
  return 'Demnächst';
}
function teamLogo(team) {
  return curatedCrest(team?.teamName) || badgeImageUrl(team?.teamIconBackupUrl) ||
    badgeImageUrl(team?.teamIconUrl) || null;
}
function meta(m,league,origin,prefix='') {
  const id=gameId(league,m), home=m.team1.teamName,away=m.team2.teamName;
  const poster=`${origin}${prefix}/poster/${encodeURIComponent(league.shortcut)}/${m.matchID}.png?v=${VERSION}`;
  const score=m.matchIsFinished && m.matchResults?.length? m.matchResults.find(r=>r.resultTypeID===2)||m.matchResults.at(-1):null;
  const description=`${league.name} · ${dateLabel(m)} · ${status(m)}. ${home} gegen ${away}.`+(score?` Endstand: ${score.pointsTeam1}:${score.pointsTeam2}.`:'')+' Videostreams nur, wenn ein verbundenes Sport-Add-on diese Begegnung eindeutig zuordnet.';
  return {id,type:'tv',name:`${home} – ${away}`,poster,background:poster,posterShape:'landscape',description,genres:['Fußball',league.name],releaseInfo:dateLabel(m),released:startTime(m)?.toISOString(),
    team1:{name:home,logo:teamLogo(m.team1)},team2:{name:away,logo:teamLogo(m.team2)},
    behaviorHints:{defaultVideoId:id}};
}
function manifest(list) {
  return {id:'com.community.nuvio.defootball',version:VERSION,name:'Deutscher Fußball · Spielpläne',description:'Deutsche Fußballligen als einzelne Spielkataloge. OpenLigaDB + optionale Quellen aus bereits vorhandenen Sport-Add-ons.',types:['tv'],resources:[{name:'catalog',types:['tv']},{name:'meta',types:['tv'],idPrefixes:['defootball_']},{name:'stream',types:['tv'],idPrefixes:['defootball_']}],catalogs:list.map(l=>({type:'tv',id:catalogId(l.shortcut),name:`⚽ ${l.name}`})),behaviorHints:{configurable:true}};
}
const simplify=s=>clean(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const aliases=[[/\brot weiss essen\b|\brw essen\b|\brwe\b/g,'essen'],[/\bbayern munchen\b|\bbayern munich\b/g,'bayern'],[/\bborussia dortmund\b|\bbvb\b/g,'dortmund'],[/\bborussia monchengladbach\b|\bgladbach\b/g,'monchengladbach'],[/\bkoln\b|\bcologne\b/g,'koln'],[/\bfortuna dusseldorf\b/g,'dusseldorf'],[/\brb leipzig\b/g,'leipzig'],[/\bwerder bremen\b/g,'bremen']];
function normalize(x) { let s=simplify(x);for(const [re,to]of aliases)s=s.replace(re,to);return s; }
const common=new Set('fc sv sc vfl vfb bsc tsv fsv ssv club e v ev football soccer the vs live sport match 1 2 04 05 06'.split(' '));
const needles=x=>[...new Set(normalize(x).split(' ').filter(w=>w.length>3&&!common.has(w)))].sort((a,b)=>b.length-a.length).slice(0,2);
export function matchScore(fixture,event) {
  const s=normalize([event.name,event.title,event.description].filter(Boolean).join(' '));
  const home=needles(fixture.team1?.teamName),away=needles(fixture.team2?.teamName);
  if(!home.length||!away.length||!home.some(w=>s.includes(w))||!away.some(w=>s.includes(w)))return -1;
  const date=event.startTime||event.startsAt||event.released||event.date;
  const t=date?Date.parse(date):NaN,ref=+startTime(fixture);
  if(Number.isFinite(t)&&ref&&Math.abs(t-ref)>36*3600_000)return -1;
  return 10+home.filter(w=>s.includes(w)).length+away.filter(w=>s.includes(w)).length+(Number.isFinite(t)&&Math.abs(t-ref)<4*3600_000?5:0);
}
function addonPath(manifest,path) { const u=new URL(manifest);u.pathname=u.pathname.slice(0,-'manifest.json'.length)+path;return u.href; }
function playbackUrl(value){
  try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}
}
function isDirect(s, allowExternal){
  if (!s || typeof s !== 'object' || s.infoHash || s.fileIdx!==undefined || s.sources?.length)return false;
  return playbackUrl(s.url)||(allowExternal&&playbackUrl(s.externalUrl));
}
export async function resolveStreams(game, sources, fetcher=fetch, env={}) {
  const nativeOnly=String(env.NATIVE_ONLY||'').toLowerCase()==='true';
  // Independent providers are queried concurrently so an unavailable one
  // does not block the user's other stream options.
  const addonTask=Promise.allSettled(streamSources(sources).map(async source=>{
    const streams=[];
    const addon=await loadJSON(source,3600,fetcher);
    // Use the actual catalogs and optional search extras declared by the source.
    // This includes the Nuvio Live Sports soccer catalog, not its replay hubs.
    const requests=sportsCatalogRequests(addon,game);
    const eventResponses=await Promise.allSettled(requests.map(c=>
      loadJSON(addonPath(source,c.path),80,fetcher)
        .then(json=>(Array.isArray(json.metas)?json.metas:[])
          .map(m=>({...m,_type:m.type||c.type})))
    ));
    const events=new Map();
    for(const m of eventResponses.filter(r=>r.status==='fulfilled').flatMap(r=>r.value)){
      const key=String(m._type)+'/'+String(m.id);
      if(m.id!=null&&!events.has(key))events.set(key,m);
    }
    const matches=[...events.values()]
      .map(m=>({m,score:matchScore(game,m)})).filter(x=>x.score>=10)
      .sort((a,b)=>b.score-a.score).slice(0,4);
    const variants=await Promise.allSettled(matches.map(async({m})=>{
      const result=await loadJSON(addonPath(source,
        'stream/'+encodeURIComponent(m._type)+'/'+encodeURIComponent(m.id)+'.json'),30,fetcher);
      return (Array.isArray(result.streams)?result.streams:[])
        .map(s=>forwardSportsStream(s,source,addon.name,!nativeOnly))
        .filter(Boolean).slice(0,12);
    }));
    for(const v of variants)if(v.status==='fulfilled')streams.push(...v.value);
    return streams;
  }));
  const daddyTask=getDaddySchedule(env,fetcher);
  // Resolve in parallel with the other addons so probing does not add its
  // entire deadline after an already slow provider query.
  const nativeTask=daddyTask.then(async daddy=>{
    if(!daddy.reachable)return [];
    const configured=nativeMappedStreams(game,daddy.events,matchScore,env);
    const [mapped,automatic]=await Promise.all([
      String(env.NATIVE_VERIFY_MANIFESTS||'').toLowerCase()==='true'?verifiedNativeStreams(configured,fetcher):configured,
      automaticDaddyStreams(game,daddy.events,matchScore,env,fetcher)
    ]);
    return [...mapped,...automatic];
  });
  const [all,daddy,native]=await Promise.all([addonTask,daddyTask,nativeTask]);
  const found=all.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);
  const players=!nativeOnly && String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true' && daddy.reachable
    ? externalDaddyPlayers(game,daddy.events,matchScore)
    : [];
  // Native entries are first; HTML players remain a clearly labeled fallback.
  return [...new Map([...native,...found.filter(s=>s.url),...found.filter(s=>!s.url),...players]
    .map(s=>[s.url||s.externalUrl,s])).values()];
}
export async function diagnoseSources(personal=[], fetcher=fetch, env={}) {
  const all=streamSources(personal);
  const providerStatuses=await Promise.all(all.map(async (url,i)=>{
    const id=url.includes('sports.highfly.to')?'Sports Streams (Hauptserver)':
      url.includes('sportsfree.highfly.to')?'Sports Streams (Mirror 1)':
      url.includes('sportsfree-us2.highfly.to')?'Sports Streams (Mirror 2)':
      url.includes('nuvio.moaqeel6679.my.id')?'Nuvio Live Sports':
      url.includes('pengu.uk')?'PenguPlay':'Persönlicher Anbieter '+(i+1);
    try {
      const manifest=await loadJSON(url,300,fetcher);
      const types=manifest.types||[];
      const catalogs=manifest.catalogs||[];
      const sports=catalogs.filter(c=>/sport|soccer|football|fußball|fussball|live|upcoming/i.test(String(c.type)+' '+String(c.id)+' '+String(c.name)));
      return {name:id,reachable:true,declaredTypes:types,
        catalogCount:catalogs.length,sportsCatalogs:sports.length,hasStreamResource:
          (manifest.resources||[]).some(r=>r==='stream'||r?.name==='stream')};
    } catch(e) {
      const message=String(e?.message||'');
      const status=message.match(/HTTP (\d{3})/);
      return {name:id,reachable:false,reason:status?'HTTP '+status[1]:'Not reachable'};
    }
  }));
  const daddy=await getDaddySchedule(env,fetcher);
  return [...providerStatuses,{
    ...daddyPublicDiagnostic(daddy),
    playerLinksEnabled:String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true'
  }];
}
const CSS=`<style>body{margin:0;background:#0e1825;color:#f2f7fb;font:16px system-ui,sans-serif;line-height:1.6}main{max-width:760px;margin:42px auto;padding:0 20px}.panel{background:#16283a;border:1px solid #30465a;padding:20px;border-radius:14px;margin:20px 0}h1{font-size:28px}p,li{color:#c4d3dd}a{color:#9be2c9}textarea,input{box-sizing:border-box;width:100%;background:#081726;color:#fff;border:1px solid #52677b;border-radius:8px;padding:12px;font:inherit}button{background:#8ee0bc;color:#082019;padding:12px 17px;border:0;border-radius:8px;font-weight:bold;cursor:pointer}small{color:#9daebd}</style>`;
const page=()=>`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nuvio Fußball</title>${CSS}<main><h1>⚽ Deutscher Fußball für Nuvio</h1><p>Addon-Version ${VERSION}. Unterstützte Direktquellen öffnen im nativen Player; Browser-Fallbacks sind entsprechend gekennzeichnet.</p><p>Je Liga und Pokalwettbewerb ein Katalog, je Spiel eine Kachel. OpenLigaDB liefert die Spielpläne.</p><div class="panel"><h2>Streams aus vorhandenen Add-ons (optional)</h2><p>Die öffentlichen Schnittstellen von Sports Streams und Nuvio Live Sports werden probeweise geprüft. <strong>PenguPlay Live TV funktioniert nur mit deiner persönlichen konfigurierten Manifest-URL.</strong> Füge sie hier hinzu, auch wenn du die Pengu-Kataloge in Nuvio ausgeblendet hast. Nicht die /configure-URL.</p><form action="/generate" method="get"><label for="sources">Manifest-URLs, eine pro Zeile:</label><textarea id="sources" name="sources" rows="5" placeholder="https://…/manifest.json"></textarea><p><button type="submit">Installations-URL erstellen</button></p></form><small>Ohne persönliche URL kann der Worker nicht auf deine PenguPlay-Live-TV-Konfiguration zugreifen. Streams erscheinen nur, wenn ein Anbieter eine Begegnung zuordnen und einen Direktstream liefern kann. Vor dem Spielbeginn sind Streams oft noch nicht verfügbar. Ein eigener DaddyLive-Spielplanadapter wird zusätzlich geprüft. Dessen dokumentierte Playerlinks öffnen HTML-Seiten und sind keine nativen HLS-Streams. Nicht jeder Event ist in den externen Add-ons auffindbar.</small></div><div class="panel"><p><a href="/manifest.json">Manifest ohne Streams</a> · <a href="/health">Status</a> · <a href="/debug/sources.json">Quellen-Diagnose</a></p><p>Für Nuvio die generierte URL unter Add-ons hinzufügen, nicht unter JavaScript-Plugins.</p></div><p><small>Daten: <a href="https://openligadb.de/">OpenLigaDB</a> (ODbL 1.0). Keine Gewähr für die Abdeckung aller deutschen Ligen. Unabhängiges Community-Projekt.</small></p></main></html>`;
function installPage(url,count) {return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nuvio installieren</title>${CSS}<main><h1>⚽ Nuvio-Installation</h1><div class="panel"><p>${count} Sport-Add-on(s) konfiguriert.</p><p>Diese URL unter <strong>Nuvio → Add-ons</strong> hinzufügen:</p><input id="u" readonly value="${escape(url)}"><p><button id="copy" onclick="navigator.clipboard.writeText(document.getElementById('u').value).then(()=>this.innerText='Kopiert!')">URL kopieren</button></p><a href="${escape(url)}">Manifest öffnen</a> · <a href="${escape(url.replace(/manifest\.json$/,'debug/sources.json'))}">Quellen prüfen</a></div><small>Die Installations-URL kann persönliche Zugriffstoken deiner Sport-Add-ons enthalten. Nicht öffentlich teilen.</small><p><a href="/configure">Zurück</a></p></main></html>`;}
export async function handle(request,env={},fetcher=fetch) {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS'}});
  if(request.method!=='GET')return json({error:'Nur GET erlaubt'},405);
  const url=new URL(request.url), origin=url.origin;
  try {
    if(url.pathname==='/'||url.pathname==='/configure')return html(page());
    if(url.pathname==='/health')return json({ok:true,version:VERSION,season:Number(env.SEASON)||seasonOf(),
      nativePlayback:{automaticPublicHls:String(env.DADDY_NATIVE_RESOLVE||'').toLowerCase()==='true',
        verifyConfiguredManifests:String(env.NATIVE_VERIFY_MANIFESTS||'').toLowerCase()==='true',
        nativeOnly:String(env.NATIVE_ONLY||'').toLowerCase()==='true',
        browserFallbacks:String(env.NATIVE_ONLY||'').toLowerCase()!=='true'&&String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true',
        providerTokenRenewal:false,packedSegments:false}},200,0);
    if(url.pathname==='/generate'){
      const sources=safeUrls((url.searchParams.get('sources')||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).slice(0,12));
      const prefix=sources.length?`/u/${encodeConfig(sources)}`:'';
      return html(installPage(`${origin}${prefix}/manifest.json`,sources.length));
    }
    let pathname=url.pathname,prefix='',sources=safeUrls((env.UPSTREAM_MANIFESTS||'').split(','));
    const match=pathname.match(/^\/u\/([A-Za-z0-9_-]{1,3500})(\/.*)$/);
    if(match){pathname=match[2];prefix=`/u/${match[1]}`;sources=decodeConfig(match[1]);}
    if(pathname==='/configure')return html(page());
    const nativeCheck=pathname.match(/^\/debug\/daddy-native\/([1-9]\d{0,5})\.json$/);
    if(nativeCheck){
      const result=await resolveDaddyChannel(nativeCheck[1],fetcher);
      return json({version:VERSION,channelId:nativeCheck[1],status:result.status,
        nativeAvailable:Boolean(result.stream),checked:'entry_manifest_and_first_segment',
        devicePlaybackVerified:false,checks:result.checks},200,0);
    }
    if(pathname==='/debug/sources.json')return json({version:VERSION,providers:await diagnoseSources(sources,fetcher,env)},200,0);
    if(pathname==='/debug/daddy-lookup.json'){
      const home=clean(url.searchParams.get('home')).slice(0,90);
      const away=clean(url.searchParams.get('away')).slice(0,90);
      const kickoff=clean(url.searchParams.get('kickoff'));
      const parsed=Date.parse(kickoff);
      if(!home||!away||home===away||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(kickoff)
        ||!Number.isFinite(parsed))
        return json({error:'home, away und kickoff (UTC, ISO-8601) erforderlich'},400,0);
      const fixture={
        team1:{teamName:home},team2:{teamName:away},
        matchDateTimeUTC:new Date(parsed).toISOString()
      };
      const daddy=await getDaddySchedule(env,fetcher);
      const matched=matchDaddyEvents(fixture,daddy.events,matchScore);
      return json({
        version:VERSION,
        daddy:daddyPublicDiagnostic(daddy),
        matchedEvents:matched.map(e=>({
          name:e.name,startTime:e.startTime,
          channels:e.channels.map(c=>({id:c.id,name:c.name}))
        })),
        matchDiagnosis:diagnoseDaddyFixture(fixture,daddy.events,matchScore),
        externalPlayerLinksEnabled:String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true'
      },200,0);
    }
    const daddyMatch=pathname.match(/^\/debug\/daddy-match\/([^/]+)\.json$/);
    if(daddyMatch) {
      const available=await leagues(env,fetcher),found=parseGame(daddyMatch[1],available);
      if(!found)return json({error:'Spiel nicht gefunden'},404);
      const fixturesInLeague=await fixtures(found.league,env,fetcher);
      const game=fixturesInLeague.find(x=>String(x.matchID)===found.mid);
      if(!game)return json({error:'Spiel nicht gefunden'},404);
      const daddy=await getDaddySchedule(env,fetcher);
      const candidates=matchDaddyEvents(game,daddy.events,matchScore);
      return json({
        version:VERSION, fixture:gameId(found.league,game),
        daddy:daddyPublicDiagnostic(daddy),
        matchedEvents:candidates.map(e=>({
          name:e.name,startTime:e.startTime,
          channels:e.channels.map(c=>({id:c.id,name:c.name}))
        })),
        matchDiagnosis:diagnoseDaddyFixture(game,daddy.events,matchScore),
        externalPlayerLinksEnabled:String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true'
      },200,0);
    }
    if(!(/^(\/manifest\.json|\/catalog\/|\/meta\/|\/stream\/|\/poster\/)/.test(pathname)))return json({error:'Nicht gefunden'},404);
    const list=await leagues(env,fetcher);
    if(pathname==='/manifest.json')return json(manifest(list),200,3600);
    const catalog=pathname.match(/^\/catalog\/tv\/([^/]+)\.json$/);
    if(catalog){const league=list.find(x=>catalogId(x.shortcut)===catalog[1]);if(!league)return json({metas:[]});const games=await fixtures(league,env,fetcher);return json({metas:selectUpcoming(games).map(m=>meta(m,league,origin,prefix))},200,120);}
    const details=pathname.match(/^\/(meta|stream)\/tv\/([^/]+)\.json$/);
    if(details){const found=parseGame(details[2],list);if(!found)return json({error:'Spiel nicht gefunden'},404);const games=await fixtures(found.league,env,fetcher),game=games.find(x=>String(x.matchID)===found.mid);if(!game)return json({error:'Spiel nicht gefunden'},404);if(details[1]==='meta')return json({meta:meta(game,found.league,origin,prefix)});const response=json({streams:await resolveStreams(game,sources,fetcher,env)},200,0);response.headers.set('cache-control','no-store');return response;}
    const image=pathname.match(/^\/poster\/([a-zA-Z0-9_-]{2,40})\/(\d+)\.(svg|png)$/);
    if(image){const league=list.find(x=>x.shortcut.toLowerCase()===image[1].toLowerCase());if(!league)return json({error:'Liga nicht gefunden'},404);const games=await fixtures(league,env,fetcher);const game=games.find(x=>String(x.matchID)===image[2]);if(!game)return json({error:'Spiel nicht gefunden'},404);const svg=await makeMatchPoster(game,league,dateLabel(game),status(game),fetcher);
      if(image[3]==='svg')return new Response(svg,{headers:{'content-type':'image/svg+xml; charset=utf-8',...corsHeaders(300)}});
      const renderer=typeof env.__testPngRenderer==='function' ? env.__testPngRenderer :
        (await import('./poster-png.js')).renderPng;
      const png=await renderer(svg);
      return new Response(png,{headers:{'content-type':'image/png',...corsHeaders(1800)}});}
    return json({error:'Nicht gefunden'},404);
  }catch(err){return json({error:'Anfrage fehlgeschlagen',detail:String(err.message||err).slice(0,130)},400,20);}
}
export default {fetch(request,env){return handle(request,env);}};
