/**
 * Nuvio German Football – Cloudflare Worker, Stremio addon protocol.
 * Data: OpenLigaDB (ODbL). Streams: optional user-configured Stremio sports addons.
 * No direct scraping, DRM circumvention, torrent/P2P support or stream fabrication.
 */
import { espnScoreboardUrl, normalizeEspnEvents, UEFA_ESPN_CODES } from './international.js';
import {startTime,matchdayNumber,matchdayLabel,weekdayLabel,hasCalendarCatalogs,
  CALENDAR_VIEWS,selectCalendarView} from './matchdays.js';
import {standingsUrl,resultOfType,createStatsContext,statisticsLines} from './match-stats.js';
export {startTime} from './matchdays.js';
import { makeMatchPoster, makeMatchBackground, teamBadgeData } from './graphics.js';
import { espnTeamsUrl, attachFallbackCrests, curatedCrest } from './crests.js';
import { badgeImageUrl, badgeData } from './graphics.js';
import { THIRD_LIGA_CLUBS_2026, thirdLigaCrest } from './third-league-crests.js';
import {
  getDaddySchedule, matchDaddyEvents, externalDaddyPlayers, daddyPlayersForEvents, daddyPublicDiagnostic,
  diagnoseDaddyFixture
} from './daddylive.js';
import {nativeMappedStreams,nativeMappedEventStreams} from './native-streams.js';
import {sportsCatalogRequests,forwardSportsStream} from './upstream-sports.js';
import {verifiedNativeStreams} from './manifest-check.js';
import {automaticDaddyStreams,automaticDaddyEventStreams,resolveDaddyChannel} from './daddy-native.js';
import {handleDaddyPlayback} from './daddy-playback.js';
import {bundesligaSimulcasts,simulcastArtwork,SIMULCAST_ART,SIMULCAST_NAME,SIMULCAST_PREFIX} from './bundesliga-simulcast.js';
import {ADDON_NAME,MAX_CONFIG_LENGTH,safeUrls,decodeSettings,encodeSettings,selectedCatalogs,configuredPlayback,settingsFromForm,readSettingsForm} from './addon-config.js';
import {configurePage,installationPage} from './configure-page.js';
import {handlePrivateAccess,privateAccessEnabled} from './private-access.js';
export {encodeConfig,decodeConfig,manifestUrl} from './addon-config.js';
export const VERSION = '0.6.0';
const API = 'https://api.openligadb.de';
// Public addons provide their own catalogs/stream endpoints.
// PenguPlay's bare manifest has no Live TV settings: use the personal config URL.
const BUILTIN_MANIFESTS = [
  'https://sports.highfly.to/manifest.json',
  'https://sportsfree.highfly.to/manifest.json',
  'https://sportsfree-us2.highfly.to/manifest.json',
  'https://nuviosports.xyz/manifest.json'
];
function streamSources(personal = []) {
  return safeUrls([...personal, ...BUILTIN_MANIFESTS]);
}
const core = [
  ['bl1', '1. Bundesliga'], ['bl3', '3. Liga'], ['bl2', '2. Bundesliga'],
  ['ucl', 'Champions League'], ['uel', 'Europa League'], ['uecl', 'Conference League'],
  ['dfb', 'DFB-Pokal'], ['BLSupercup', 'Supercup'], ['ffb1', 'Frauen-Bundesliga'],
  ['ffb2', '2. Frauen-Bundesliga'], ['dfbf', 'DFB-Pokal Frauen'],
  ['wsc', 'Frauen-Supercup'],
];
const coreOrder=new Map(core.map(([shortcut],index)=>[shortcut.toLowerCase(),index]));
const leaguePattern = /(regionalliga|oberliga|bayernliga|landesliga|verbandsliga|thüringenliga|hessenliga|mittelrheinliga|niedersachsenliga|nordostliga|brandenburgliga|schleswig-holstein-liga|frauen.*liga|liga.*frauen|pokal|kreisliga|bezirksliga)/i;
const excludedPattern = /(test|prob(e|ier)|hockey|admiral|österreich|la liga|premier league|weltmeisterschaft)/i;
const memoryCache = new Map();

function seasonOf(now = new Date()) { return now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0); }
function clean(v) { return String(v ?? '').trim(); }
function cacheTTL(ttl) { return Math.min(ttl, 21600); }
function corsHeaders(age = 90) { return { 'access-control-allow-origin': '*', 'cache-control': `public, max-age=${age}`, 'x-content-type-options': 'nosniff' }; }
function json(body, status = 200, age = 90) { return new Response(JSON.stringify(body), {status, headers: {'content-type':'application/json; charset=utf-8', ...corsHeaders(age)}}); }
function html(body, status = 200) { return new Response(body, {status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}}); }

function catalogId(shortcut) { return `defootball_${shortcut.toLowerCase().replace(/[^a-z0-9_-]/g,'')}`; }
function leagueCatalogs(league){
  const base={type:'tv',id:catalogId(league.shortcut),name:league.name};
  return hasCalendarCatalogs(league.shortcut)?CALENDAR_VIEWS.map(view=>({
    ...base,id:base.id+view.suffix,name:base.name+' · '+view.label
  })):[base];
}
function configurationCatalogs(list){
  return list.flatMap(league=>leagueCatalogs(league).map(c=>({...c,league:league.shortcut.toLowerCase(),leagueName:league.name})));
}
function parseCatalog(id,list){
  for(const league of list){
    const base=catalogId(league.shortcut);
    if(hasCalendarCatalogs(league.shortcut)){
      const view=CALENDAR_VIEWS.find(v=>id===base+v.suffix);
      if(view)return {league,view:view.view};
    }else if(id===base)return {league,view:'upcoming'};
  }
  return null;
}
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
  return [...all.values()].sort((a,b)=>a.priority-b.priority ||
    (coreOrder.get(a.shortcut.toLowerCase())??Infinity)-(coreOrder.get(b.shortcut.toLowerCase())??Infinity) ||
    a.name.localeCompare(b.name,'de'));
}
async function loadJSON(url, ttl, fetcher=fetch) {
  const cacheable=ttl>0,key=String(url),old=cacheable?memoryCache.get(key):null;
  if (old?.until > Date.now()) return old.value;
  if (old?.pending) return old.pending;
  const pending=(async()=>{
    const headers={accept:'application/json'};
    const cache=cacheable&&typeof caches !== 'undefined' && caches.default ? caches.default : null;
    const req=new Request(key,{headers});
    if (cache) {
      const hit=await cache.match(req);
      if (hit) { const value=await hit.json(); memoryCache.set(key,{value,until:Date.now()+60_000}); return value; }
    }
    const res=await fetcher(key,{headers,signal:AbortSignal.timeout(8500),redirect:'manual'});
    if (!res.ok) {
      // Release Cloudflare's limited outgoing connections even for denied sources.
      await res.body?.cancel().catch(()=>{});
      throw new Error(`Datenquelle HTTP ${res.status}`);
    }
    const value=await res.json();
    if(cacheable)memoryCache.set(key,{value,until:Date.now()+ttl*1000});
    if (cache) {
      const reply=new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':`public,max-age=${cacheTTL(ttl)}`}});
      await cache.put(req,reply);
    }
    return value;
  })().catch(e=>{ if(old?.value) return old.value; throw e; }).finally(()=>{ const cur=memoryCache.get(key); if(cur?.pending) memoryCache.delete(key); });
  if(cacheable)memoryCache.set(key,{...old,pending});
  return pending;
}
async function leagues(env, fetcher) {
  const season=Number(env.SEASON)||seasonOf();
  let rows=[];
  try { rows=await loadJSON(`${API}/getavailableleagues/${season}`,21600,fetcher); }
  catch { /* use core leagues if discovery is unavailable */ }
  return discoverLeagues(Array.isArray(rows)?rows:[],env.EXTRA_LEAGUES||'');
}
async function fixtures(league,env,fetcher,loadArtworkBackups=true) {
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
  if(!loadArtworkBackups || !crestUrl || !matches.length) return matches;
  try {
    return attachFallbackCrests(matches, await loadJSON(crestUrl,14400,fetcher));
  } catch { return matches; }
}
async function standings(league,env,fetcher){
  const url=standingsUrl(league.shortcut,Number(env.SEASON)||seasonOf());
  if(!url)return [];
  try{
    return await loadJSON(url,600,(target,options)=>fetcher(target,{
      ...options,signal:AbortSignal.timeout(1500)
    }));
  }catch{return [];}
}
function seasonStatistics(league,games,table){
  // The ESPN scoreboard feed only covers a short window of the season.
  return createStatsContext(Object.hasOwn(UEFA_ESPN_CODES,league.shortcut)?[]:games,table);
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
function matchCompetition(game,league){
  const day=hasCalendarCatalogs(league.shortcut)&&weekdayLabel(game);
  return day?{...league,name:league.name+' · '+day}:league;
}
function meta(m,league,origin,prefix='',statistics=null) {
  const id=gameId(league,m), home=m.team1.teamName,away=m.team2.teamName;
  const poster=`${origin}${prefix}/poster/${encodeURIComponent(league.shortcut)}/${m.matchID}.png?v=${VERSION}`;
  const background=`${origin}${prefix}/background/${encodeURIComponent(league.shortcut)}/${m.matchID}.png?v=${VERSION}`;
  const score=m.matchIsFinished?resultOfType(m):null;
  const halftime=m.matchIsFinished?resultOfType(m,1):null;
  const round=hasCalendarCatalogs(league.shortcut)&&matchdayLabel(m);
  const day=hasCalendarCatalogs(league.shortcut)&&weekdayLabel(m);
  const description=[
    ...statisticsLines(m,statistics),
    ...(score?[`Endstand: ${score.pointsTeam1}:${score.pointsTeam2}`+
      (halftime?` (Halbzeit ${halftime.pointsTeam1}:${halftime.pointsTeam2}).`:'.')]:[]),
    `${matchCompetition(m,league).name} · ${dateLabel(m)} · ${status(m)}.`
  ].join('\n');
  return {id,type:'tv',name:`${home} – ${away}`,poster,background,posterShape:'landscape',description,genres:['Fußball',league.name],releaseInfo:(day?day+' · ':'')+dateLabel(m),released:startTime(m)?.toISOString(),
    ...(round?{matchday:{number:matchdayNumber(m),name:round}}:{}),
    team1:{name:home,logo:teamLogo(m.team1)},team2:{name:away,logo:teamLogo(m.team2)},
    behaviorHints:{defaultVideoId:id}};
}
function simulcastMeta(event,origin,prefix){
  const id=SIMULCAST_PREFIX+event.matchID,kickoff=dateLabel(event);
  return {id,type:'tv',name:SIMULCAST_NAME,description:kickoff,posterShape:'landscape',
    poster:`${origin}${prefix}/poster/${SIMULCAST_ART}.png`,background:`${origin}${prefix}/background/${SIMULCAST_ART}.png`,
    released:event.matchDateTimeUTC,releaseInfo:`${weekdayLabel(event)} · ${kickoff}`,behaviorHints:{defaultVideoId:id}};
}
function manifest(list,settings={}) {
  return {id:'com.community.nuvio.defootball',version:VERSION,name:ADDON_NAME,description:'Spielpläne deutscher Ligen und europäischer Wettbewerbe.',types:['tv'],resources:[{name:'catalog',types:['tv']},{name:'meta',types:['tv'],idPrefixes:['defootball_']},{name:'stream',types:['tv'],idPrefixes:['defootball_']}],catalogs:selectedCatalogs(list.flatMap(leagueCatalogs),settings),behaviorHints:{configurable:true}};
}
const simplify=s=>clean(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const aliases=[[/\brot weiss essen\b|\brw essen\b|\brwe\b/g,'essen'],[/\bbayern munchen\b|\bbayern munich\b/g,'bayern'],[/\bborussia dortmund\b|\bbvb\b/g,'dortmund'],[/\bborussia monchengladbach\b|\bgladbach\b/g,'monchengladbach'],[/\bkoln\b|\bcologne\b/g,'koln'],[/\bfortuna dusseldorf\b/g,'dusseldorf'],[/\brb leipzig\b/g,'leipzig'],[/\bwerder bremen\b/g,'bremen']];
function normalize(x) { let s=simplify(x);for(const [re,to]of aliases)s=s.replace(re,to);return s; }
// Shared competition/gender labels are not evidence of either club's identity.
const common=new Set('fc sv sc vfl vfb bsc tsv fsv ssv club e v ev football soccer the vs live sport match frauen women womens woman ladies 1 2 04 05 06'.split(' '));
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
export async function resolveStreams(game, sources, fetcher=fetch, env={},signal,{playbackOrigin,onNativeDiagnostic}={}) {
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
        'stream/'+encodeURIComponent(m._type)+'/'+encodeURIComponent(m.id)+'.json'),0,fetcher);
      return (Array.isArray(result.streams)?result.streams:[])
        .map(s=>forwardSportsStream(s,source,addon.name,!nativeOnly))
        .filter(Boolean).slice(0,12);
    }));
    for(const v of variants)if(v.status==='fulfilled')streams.push(...v.value);
    return streams;
  }));
  const daddyTask=getDaddySchedule(env,fetcher,{signal});
  // Resolve in parallel with the other addons so probing does not add its
  // entire deadline after an already slow provider query.
  const nativeTask=daddyTask.then(async daddy=>{
    if(!daddy.reachable)return [];
    const configured=nativeMappedStreams(game,daddy.events,matchScore,env);
    const [mapped,automatic]=await Promise.all([
      String(env.NATIVE_VERIFY_MANIFESTS||'').toLowerCase()==='true'?verifiedNativeStreams(configured,fetcher):configured,
      automaticDaddyStreams(game,daddy.events,matchScore,env,fetcher,{signal,origin:daddy.siteOrigin,playbackOrigin,onDiagnostic:onNativeDiagnostic})
    ]);
    return [...mapped,...automatic];
  });
  const [all,daddy,native]=await Promise.all([addonTask,daddyTask,nativeTask]);
  const found=all.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);
  const players=!nativeOnly && String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true' && daddy.reachable
    ? externalDaddyPlayers(game,daddy.events,matchScore,daddy.siteOrigin)
    : [];
  // Native entries are first; HTML players remain a clearly labeled fallback.
  return [...new Map([...native,...found.filter(s=>s.url),...found.filter(s=>!s.url),...players]
    .map(s=>[s.url||s.externalUrl,s])).values()];
}
export async function diagnoseSources(personal=[], fetcher=fetch, env={},options={}) {
  const all=streamSources(personal);
  const providerStatuses=await Promise.all(all.map(async (url,i)=>{
    const id=url.includes('sports.highfly.to')?'Sports Streams (Hauptserver)':
      url.includes('sportsfree.highfly.to')?'Sports Streams (Mirror 1)':
      url.includes('sportsfree-us2.highfly.to')?'Sports Streams (Mirror 2)':
      ['nuviosports.xyz','nuvio.moaqeel6679.my.id'].includes(new URL(url).hostname)?'Nuvio Live Sports':
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
  const daddy=await getDaddySchedule(env,fetcher,options);
  return [...providerStatuses,{
    ...daddyPublicDiagnostic(daddy),
    playerLinksEnabled:String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true'
  }];
}
async function handleAddon(request,env,fetcher,{accessPrefix='',invite}={}) {
  const url=new URL(request.url), origin=url.origin;
  const privateMode=Boolean(accessPrefix||invite);
  if(accessPrefix)url.pathname=url.pathname.slice(accessPrefix.length);
  if(invite)url.pathname=request.method==='GET'?'/configure':'/generate';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Range'}});
  if(request.method!=='GET'&&!(request.method==='POST'&&url.pathname==='/generate'))return json({error:'Methode nicht erlaubt'},405);
  const browserAllowed=String(env.NATIVE_ONLY||'').toLowerCase()!=='true';
  try {
    if(url.pathname.startsWith('/daddy/'))return handleDaddyPlayback(request,env,fetcher,{pathname:url.pathname,playbackBase:origin+accessPrefix});
    if(url.pathname==='/'||url.pathname==='/configure')return html(configurePage({version:VERSION,catalogs:configurationCatalogs(await leagues(env,fetcher)),browserAllowed,accessPrefix,invite}));
    if(url.pathname==='/health')return json({ok:true,version:VERSION,season:Number(env.SEASON)||seasonOf(),
      nativePlayback:{automaticPublicHls:String(env.DADDY_NATIVE_RESOLVE||'').toLowerCase()==='true',
        verifyConfiguredManifests:String(env.NATIVE_VERIFY_MANIFESTS||'').toLowerCase()==='true',
        nativeOnly:String(env.NATIVE_ONLY||'').toLowerCase()==='true',
        browserFallbacks:String(env.NATIVE_ONLY||'').toLowerCase()!=='true'&&String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true',
        providerTokenRenewal:true,packedSegments:true}},200,0);
    if(url.pathname==='/generate'){
      const catalogs=configurationCatalogs(await leagues(env,fetcher));let form=new URLSearchParams();
      let settings,configPrefix;
      try{
        form=request.method==='POST'?await readSettingsForm(request):url.searchParams;
        const customized=Boolean(invite)||form.get('customize')==='1';
        settings=customized?settingsFromForm(form,catalogs):{m:safeUrls((form.get('sources')||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean))};
        if(customized&&!selectedCatalogs(catalogs,settings).length)throw new Error('Bitte mindestens einen verfügbaren Katalog auswählen.');
        const personal=customized||settings.m.length;
        configPrefix=personal?'/u/'+encodeSettings(settings):'';
      }catch(error){
        const chosen=form.getAll('catalog').filter(id=>/^defootball_[a-z0-9_-]{2,90}$/.test(id)).slice(0,256);
        return html(configurePage({version:VERSION,catalogs,settings:{m:[],c:chosen,b:form.get('browser')==='on'},
          rawSources:form.get('sources')||'',browserAllowed,accessPrefix,invite,
          error:error.message}),400);
      }
      const authorizedPrefix=invite?await invite.activate():accessPrefix;
      if(invite&&!authorizedPrefix)return html('<!doctype html><meta charset="utf-8"><p>Einladung nicht mehr verfügbar.</p>',410);
      return html(installationPage({version:VERSION,url:origin+authorizedPrefix+configPrefix+'/manifest.json',privateMode}));
    }
    let pathname=url.pathname,prefix=accessPrefix,sources=safeUrls((env.UPSTREAM_MANIFESTS||'').split(',')),settings={m:[]};
    const match=pathname.match(new RegExp('^/u/([A-Za-z0-9_-]{1,'+MAX_CONFIG_LENGTH+'})(/.*)$'));
    if(match){pathname=match[2];prefix+=`/u/${match[1]}`;settings=decodeSettings(match[1]);sources=settings.m;env=configuredPlayback(env,settings);}
    if(pathname==='/configure')return html(configurePage({version:VERSION,catalogs:configurationCatalogs(await leagues(env,fetcher)),settings,browserAllowed,accessPrefix}));
    if(privateMode&&pathname.startsWith('/debug/'))return json({error:'Nicht gefunden'},404);
    const nativeCheck=pathname.match(/^\/debug\/daddy-native\/([1-9]\d{0,5})\.json$/);
    if(nativeCheck){
      const result=await resolveDaddyChannel(nativeCheck[1],fetcher,{signal:request.signal,playbackOrigin:origin});
      return json({version:VERSION,channelId:nativeCheck[1],status:result.status,
        nativeAvailable:Boolean(result.stream),checked:result.verification||'entry_manifest_and_first_segment',
        devicePlaybackVerified:false,checks:result.checks},200,0);
    }
    if(pathname==='/debug/crests/bl3.json'){
      // Probe the actual raster image pipeline used by Cloudflare's match posters.
      // A valid URL is not enough: wrong MIME, oversized and blocked images fail.
      const clubs=await Promise.all(THIRD_LIGA_CLUBS_2026.map(async club=>{
        const imageUrl=thirdLigaCrest(club.name);
        const image=await badgeData(imageUrl,fetcher);
        return {club:club.name,imageUrl,usable:Boolean(image)};
      }));
      return json({version:VERSION,season:2026,league:'3. Liga',ok:clubs.filter(x=>x.usable).length,
        total:clubs.length,clubs},200,0);
    }
    if(pathname==='/debug/crests/ucl.json'){
      const games=await fixtures({shortcut:'ucl'},env,fetcher,false);
      const teams=[...new Map(games.flatMap(m=>[m.team1,m.team2])
        .map(team=>[team.teamName,team])).values()];
      const clubs=await Promise.all(teams.map(async team=>({
        club:team.teamName,preferredImageUrl:teamLogo(team),
        usable:Boolean(await teamBadgeData(team,fetcher))
      })));
      return json({version:VERSION,season:Number(env.SEASON)||seasonOf(),league:'Champions League',
        ok:clubs.filter(x=>x.usable).length,total:clubs.length,clubs},200,0);
    }
    if(pathname==='/debug/sources.json')return json({version:VERSION,providers:await diagnoseSources(sources,fetcher,env,{signal:request.signal})},200,0);
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
      const daddy=await getDaddySchedule(env,fetcher,{signal:request.signal});
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
      const daddy=await getDaddySchedule(env,fetcher,{signal:request.signal});
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
    if(!(/^(\/manifest\.json|\/catalog\/|\/meta\/|\/stream\/|\/poster\/|\/background\/)/.test(pathname)))return json({error:'Nicht gefunden'},404);
    const details=pathname.match(/^\/(meta|stream)\/tv\/([^/]+)\.json$/);
    if(details?.[2].startsWith(SIMULCAST_PREFIX)){
      const daddy=await getDaddySchedule(env,fetcher,{signal:request.signal});
      if(!daddy.reachable)return json({error:'Spielplan nicht verfügbar'},503,0);
      const event=bundesligaSimulcasts(daddy.events).find(entry=>SIMULCAST_PREFIX+entry.matchID===details[2]);
      if(!event)return json({error:'Konferenz nicht gefunden'},404,0);
      if(details[1]==='meta')return json({meta:simulcastMeta(event,origin,prefix)});
      const mapped=nativeMappedEventStreams([event],env);
      const [verified,native]=await Promise.all([
        String(env.NATIVE_VERIFY_MANIFESTS||'').toLowerCase()==='true'?verifiedNativeStreams(mapped,fetcher):mapped,
        automaticDaddyEventStreams([event],env,fetcher,{signal:request.signal,origin:daddy.siteOrigin,playbackOrigin:origin+accessPrefix})
      ]);
      const browser=String(env.NATIVE_ONLY||'').toLowerCase()!=='true'&&String(env.DADDY_WEB_PLAYERS||'').toLowerCase()==='true'
        ?daddyPlayersForEvents([event],daddy.siteOrigin):[];
      const streams=[...new Map([...verified,...native,...browser].map(stream=>[stream.url||stream.externalUrl,stream])).values()];
      const response=json({streams},200,0);
      response.headers.set('cache-control','no-store');
      return response;
    }
    const list=await leagues(env,fetcher);
    if(pathname==='/manifest.json')return json(manifest(list,settings),200,3600);
    const catalog=pathname.match(/^\/catalog\/tv\/([^/]+)\.json$/);
    if(catalog){
      if(settings.c&&!settings.c.includes(catalog[1]))return json({metas:[]});
      const found=parseCatalog(catalog[1],list);if(!found)return json({metas:[]});
      const [games,table,simulcasts]=await Promise.all([
        fixtures(found.league,env,fetcher),standings(found.league,env,fetcher),
        found.league.shortcut.toLowerCase()==='bl1'
          ?getDaddySchedule(env,fetcher,{signal:request.signal}).then(schedule=>selectCalendarView(bundesligaSimulcasts(schedule.events),found.view))
          :[]
      ]);
      const selected=found.view==='upcoming'?selectUpcoming(games):selectCalendarView(games,found.view);
      const statistics=seasonStatistics(found.league,games,table);
      const metas=[...simulcasts.map(event=>simulcastMeta(event,origin,prefix)),...selected.map(m=>meta(m,found.league,origin,prefix,statistics))];
      if(simulcasts.length)metas.sort((a,b)=>Date.parse(a.released)-Date.parse(b.released));
      return json({metas},200,120);
    }
    if(details){
      const found=parseGame(details[2],list);if(!found)return json({error:'Spiel nicht gefunden'},404);
      const [games,table]=await Promise.all([fixtures(found.league,env,fetcher),
        details[1]==='meta'?standings(found.league,env,fetcher):Promise.resolve([])]);
      const game=games.find(x=>String(x.matchID)===found.mid);if(!game)return json({error:'Spiel nicht gefunden'},404);
      if(details[1]==='meta')return json({meta:meta(game,found.league,origin,prefix,seasonStatistics(found.league,games,table))});
      const nativeStatuses=[];
      const streams=await resolveStreams(game,sources,fetcher,env,request.signal,{playbackOrigin:origin+accessPrefix,
        onNativeDiagnostic:(channel,result)=>nativeStatuses.push(channel+':'+result.status+
          (result.checks?.failure?':'+result.checks.failure:''))});
      const response=json({streams},200,0);
      response.headers.set('x-daddy-resolution',nativeStatuses.join(',')||'none');
      response.headers.set('cache-control','no-store');return response;
    }
    const image=pathname.match(/^\/(poster|background)\/([a-zA-Z0-9_-]{2,40})\/(\d+)\.(svg|png)$/);
    if(image){
      const isSimulcast=image[2]+'/'+image[3]===SIMULCAST_ART;
      const league=list.find(x=>x.shortcut.toLowerCase()===image[2].toLowerCase());
      if(!isSimulcast&&!league)return json({error:'Liga nicht gefunden'},404);
      // Avoid a second, serial ESPN request in image paths. An 8s delay is
      // enough for NuvioTV's image loader to time out on the poster.
      const cache=typeof caches!=='undefined' && caches.default ? caches.default : null;
      const cacheKey=new Request(privateMode?origin+pathname+url.search:request.url);
      if(cache){const hit=await cache.match(cacheKey);if(hit)return hit;}
      let svg;
      if(isSimulcast)svg=simulcastArtwork(image[1]==='background');
      else{
        const games=await fixtures(league,env,fetcher,false);const game=games.find(x=>String(x.matchID)===image[3]);
        if(!game)return json({error:'Spiel nicht gefunden'},404);
        svg=image[1]==='background' ? await makeMatchBackground(game,fetcher) :
          await makeMatchPoster(game,matchCompetition(game,league),dateLabel(game),status(game),fetcher);
      }
      if(image[4]==='svg')return new Response(svg,{headers:{'content-type':'image/svg+xml; charset=utf-8',...corsHeaders(300)}});
      const renderer=typeof env.__testPngRenderer==='function' ? env.__testPngRenderer :
        (await import('./poster-png.js')).renderPng;
      const png=await renderer(svg);
      const response=new Response(png,{headers:{'content-type':'image/png',...corsHeaders(900)}});
      if(cache)await cache.put(cacheKey,response.clone());
      return response;}
    return json({error:'Nicht gefunden'},404);
  }catch(err){return json({error:'Anfrage fehlgeschlagen',...(privateMode?{}:{detail:String(err.message||err).slice(0,130)})},400,20);}
}
export async function handle(request,env={},fetcher=fetch) {
  if(privateAccessEnabled(env))return handlePrivateAccess(request,env,route=>handleAddon(request,env,fetcher,route));
  return handleAddon(request,env,fetcher);
}
export default {fetch(request,env){return handle(request,env);}};
