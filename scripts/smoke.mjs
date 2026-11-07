// Public production smoke check. Never accepts a personal /u/... manifest URL.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {CALENDAR_VIEWS,weekWindow,berlinDate} from '../src/matchdays.js';
import {daddySiteUrl} from '../src/daddy-domains.js';
import {checkConfiguration} from './check-configuration.mjs';
const base=new URL(process.env.WORKER_SMOKE_URL);
if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
  throw new Error('WORKER_SMOKE_URL must be a public HTTPS origin');
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const verification=Date.now();
async function json(path){
  const url=new URL(path,base);url.searchParams.set('smoke',String(verification));
  const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}
let health;const deadline=Date.now()+120000;
for(let i=0;i<36&&Date.now()<deadline;i++){
  try{const current=await json('/health?release='+version+'&attempt='+i);
    if(current.version===version&&current.nativePlayback?.automaticPublicHls===true){health=current;break;}
  }catch{}
  await delay(3000);
}
if(!health)throw new Error('Deployed version/capabilities not confirmed within deployment window');
if(health.nativePlayback.nativeOnly!==false||health.nativePlayback.browserFallbacks!==true)
  throw new Error('Production worker is missing the browser fallback');
const manifest=await json('/manifest.json?release='+version);
if(manifest.version!==version)throw new Error('Manifest and health versions differ');
console.log(JSON.stringify({version:health.version,nativePlayback:health.nativePlayback,manifestVersion:manifest.version}));
await checkConfiguration(base,version);
const expectedCatalogs=['bl1','bl3'].flatMap(league=>CALENDAR_VIEWS.map(v=>`defootball_${league}${v.suffix}`));
if(JSON.stringify(manifest.catalogs.slice(0,10).map(c=>c.id))!==JSON.stringify(expectedCatalogs))
  throw new Error('Calendar catalog blocks are not in the expected order');
for(const league of ['bl1','bl3']){
  const now=Date.now();
  const rows=await Promise.all(CALENDAR_VIEWS.map(async view=>{
    const id=`defootball_${league}${view.suffix}`;
    if(!manifest.catalogs.some(c=>c.id===id&&c.name.endsWith(' · '+view.label)))
      throw new Error('Missing calendar catalog '+id);
    const catalog=await json('/catalog/tv/'+id+'.json?release='+version);
    if(!Array.isArray(catalog.metas))throw new Error('Invalid catalog '+id);
    if(catalog.metas.some(m=>/Videostreams nur|Sport-Add-on diese Begegnung/.test(m.description||'')))
      throw new Error('Technical stream warning remains in '+id);
    const ids=catalog.metas.map(m=>m.id);
    if(new Set(ids).size!==ids.length||ids.some(id=>!new RegExp(`^defootball_${league}_\\d+$`).test(id)))
      throw new Error('Invalid canonical game IDs in '+id);
    const dates=catalog.metas.map(m=>Date.parse(m.released)).filter(Number.isFinite);
    if(dates.some((d,i)=>i&&d<dates[i-1]))throw new Error('Unsorted kickoffs in '+id);
    const {start,end}=weekWindow(now,view.offset||0);
    if(catalog.metas.some(m=>{
      if(!m.released||!Number.isFinite(Date.parse(m.released)))return true;
      const day=berlinDate(m.released);
      return day<start||day>=end||view.weekday!==undefined&&
        new Date(day+'T12:00:00Z').getUTCDay()!==view.weekday;
    }))throw new Error('Wrong Berlin week/weekday in '+id);
    return catalog.metas;
  }));
  const [current,friday,saturday,sunday,following]=rows;
  for(const [index,weekday] of [[1,5],[2,6],[3,0]]){
    const expected=current.filter(m=>new Date(berlinDate(m.released)+'T12:00:00Z').getUTCDay()===weekday);
    if(JSON.stringify(rows[index].map(m=>m.id))!==JSON.stringify(expected.map(m=>m.id)))
      throw new Error('Weekday row differs from current week in '+league);
  }
  console.log(JSON.stringify({league,currentWeek:weekWindow(now),current:current.length,
    friday:friday.length,saturday:saturday.length,sunday:sunday.length,
    followingWeek:weekWindow(now,1),following:following.length}));
  if(current.length){
    const sample=current[0],detail=(await json('/meta/tv/'+sample.id+'.json?release='+version)).meta;
    for(const preview of [sample,detail]){
      if(!preview?.description||!/Siege\/Niederlagen \d+:\d+/.test(preview.description)||
        /Form \(|Videostreams nur/.test(preview.description))throw new Error('Incorrect season statistics in '+league);
    }
    console.log(JSON.stringify({league,statisticsInCatalogAndDetail:true,
      tableAvailable:sample.description.includes(' Punkte · '),seasonRecordAvailable:true}));
  }
}
// Validate the real Cloudflare -> logo CDN -> PNG embedding path, not only GitHub's network.
const crests=await json('/debug/crests/bl3.json?release='+version);
const rwe=crests.clubs?.find(x=>x.club==='Rot-Weiss Essen');
if(crests.total!==20||crests.ok!==20||!rwe?.usable||
  rwe.imageUrl!=='https://www.footylogos.com/dls/logo/rgba-v1/rot-weiss-essen.png')
  throw new Error('Production 3. Liga badges incomplete: '+crests.ok+'/'+crests.total);
console.log(JSON.stringify({thirdLigaCrests:crests.ok,total:crests.total,rwe:rwe.imageUrl}));
const ucl=await json('/debug/crests/ucl.json?release='+version);
if(ucl.version!==version||!ucl.total||ucl.ok!==ucl.total)
  throw new Error('Production Champions League badges incomplete: '+ucl.ok+'/'+ucl.total);
console.log(JSON.stringify({championsLeagueCrests:ucl.ok,total:ucl.total}));
const catalog=await json('/catalog/tv/defootball_ucl.json?release='+version);
const fixture=catalog.metas?.[0];
if(!fixture?.background||fixture.background===fixture.poster)
  throw new Error('Champions League detail background is missing or reuses the catalog poster');
const image=await fetch(fixture.background,{signal:AbortSignal.timeout(12000)});
if(!image.ok||!image.headers.get('content-type')?.startsWith('image/png'))
  throw new Error('Detail background is not a PNG response');
const bytes=Buffer.from(await image.arrayBuffer());
if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
  bytes.readUInt32BE(16)!==1280||bytes.readUInt32BE(20)!==720)
  throw new Error('Detail background has invalid PNG dimensions');
console.log(JSON.stringify({backgroundPng:'1280x720',separateFromPoster:true}));
const sources=await json('/debug/sources.json?release='+version);
const daddy=sources.providers?.find(p=>p.name==='DaddyLive (direkter Spielplan)');
if(sources.version!==version||!daddy?.reachable||!daddy.footballEvents||!daddy.channels||
  !daddySiteUrl(daddy.siteOrigin))
  throw new Error('Current DaddyLive schedule or checked origin unavailable');
console.log(JSON.stringify({daddyLiveOrigin:daddy.siteOrigin,footballEvents:daddy.footballEvents,
  channels:daddy.channels,source:daddy.source}));
// This is a transport diagnostic, not an assertion of actual device playback.
const diagnostic=await json('/debug/daddy-native/426.json');
console.log(JSON.stringify({channelId:diagnostic.channelId,status:diagnostic.status,
  nativeAvailable:diagnostic.nativeAvailable,devicePlaybackVerified:diagnostic.devicePlaybackVerified,checks:diagnostic.checks}));
