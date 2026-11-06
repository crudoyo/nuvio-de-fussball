// Public production smoke check. Never accepts a personal /u/... manifest URL.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
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
