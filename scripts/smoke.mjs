// Public production smoke check. Never accepts a personal /u/... manifest URL.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {MATCHDAY_VIEWS,upcomingSunday,berlinDate} from '../src/matchdays.js';
const base=new URL(process.env.WORKER_SMOKE_URL);
if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
  throw new Error('WORKER_SMOKE_URL must be a public HTTPS origin');
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
async function json(path){
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(12000),headers:{'Cache-Control':'no-cache'}});
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
for(const league of ['bl1','bl3']){
  const rows=await Promise.all(MATCHDAY_VIEWS.map(async view=>{
    const id=`defootball_${league}${view.suffix}`;
    if(!manifest.catalogs.some(c=>c.id===id&&c.name.endsWith(' · '+view.label)))
      throw new Error('Missing matchday catalog '+id);
    const catalog=await json('/catalog/tv/'+id+'.json?release='+version);
    if(!Array.isArray(catalog.metas))throw new Error('Invalid catalog '+id);
    const ids=catalog.metas.map(m=>m.id);
    if(new Set(ids).size!==ids.length||ids.some(id=>!new RegExp(`^defootball_${league}_\\d+$`).test(id)))
      throw new Error('Invalid canonical game IDs in '+id);
    const dates=catalog.metas.map(m=>Date.parse(m.released)).filter(Number.isFinite);
    if(dates.some((d,i)=>i&&d<dates[i-1]))throw new Error('Unsorted kickoffs in '+id);
    if(view.view==='sunday'){
      if(catalog.metas.some(m=>!m.released||berlinDate(m.released)!==upcomingSunday()))
        throw new Error('Wrong Berlin Sunday in '+id);
    }else if(catalog.metas.some(m=>!m.matchday?.number||m.matchday.number!==catalog.metas[0].matchday?.number))
      throw new Error('Mixed/missing official rounds in '+id);
    return catalog.metas;
  }));
  const [next,following,sunday]=rows;
  if(!next.length)throw new Error('No next matchday in '+league);
  if(following.length&&following[0].matchday.number<=next[0].matchday.number)
    throw new Error('Following round does not follow next round in '+league);
  console.log(JSON.stringify({league,nextMatchday:next[0].matchday.number,next:next.length,
    followingMatchday:following[0]?.matchday.number,following:following.length,
    sunday:upcomingSunday(),sundayGames:sunday.length}));
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
// This is a transport diagnostic, not an assertion of actual device playback.
const diagnostic=await json('/debug/daddy-native/426.json');
console.log(JSON.stringify({channelId:diagnostic.channelId,status:diagnostic.status,
  nativeAvailable:diagnostic.nativeAvailable,devicePlaybackVerified:diagnostic.devicePlaybackVerified,checks:diagnostic.checks}));
