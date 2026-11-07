// Verify a private deployment without passing a real invitation, admin or device key into CI.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {encodeSettings} from '../src/addon-config.js';

const base=new URL(process.env.WORKER_SMOKE_URL);
if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
  throw Error('WORKER_SMOKE_URL must be a public HTTPS origin');
async function get(path){
  return fetch(new URL(path,base),{redirect:'manual',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(10000)});
}
const deadline=Date.now()+120000;
let ready=false;
while(Date.now()<deadline){
  try{
    const response=await get('/admin');
    if(response.ok&&response.headers.get('cache-control')?.includes('no-store')&&
      /Verwaltung anmelden/.test(await response.text())){ready=true;break;}
    await response.body?.cancel();
  }catch{}
  await delay(3000);
}
assert(ready,'Private admin login not confirmed within deployment window');
const configure=await get('/configure');
assert.equal(configure.status,200);
assert.match(configure.headers.get('cache-control')||'',/no-store/);
const loginPage=await configure.text();
assert.match(loginPage,/Einmalpasswort/);
assert.doesNotMatch(loginPage,/name="catalog"/);
for(const path of ['/','/manifest.json','/u/'+encodeSettings({m:[]})+'/manifest.json',
  '/catalog/tv/defootball_bl1.json','/stream/tv/defootball_bl1_42.json','/poster/bl1/42.png',
  '/debug/sources.json','/daddy/live/426.m3u8','/daddy/resource/426/media/abcdef.ts']){
  const response=await get(path);
  assert.equal(response.status,404,path);
  assert.match(response.headers.get('cache-control')||'',/no-store/,path);
  await response.body?.cancel();
}
console.log('Private deployment denies anonymous add-on and media routes.');
