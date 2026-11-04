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
const manifest=await json('/manifest.json?release='+version);
if(manifest.version!==version)throw new Error('Manifest and health versions differ');
console.log(JSON.stringify({version:health.version,nativePlayback:health.nativePlayback,manifestVersion:manifest.version}));
// This is a transport diagnostic, not an assertion of actual device playback.
const diagnostic=await json('/debug/daddy-native/426.json');
console.log(JSON.stringify({channelId:diagnostic.channelId,status:diagnostic.status,
  nativeAvailable:diagnostic.nativeAvailable,devicePlaybackVerified:diagnostic.devicePlaybackVerified,checks:diagnostic.checks}));
