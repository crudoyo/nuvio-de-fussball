/**
 * Live CDN verification: real HTTP GET + MIME + PNG magic + 240 kB poster budget.
 * Usage: npm run check:crests
 * This supplements deterministic offline unit tests; it needs internet access.
 */
import {THIRD_LIGA_CLUBS_2026,thirdLigaCrest} from '../src/third-league-crests.js';

const MAX_BYTES=240_000;
const signature=[137,80,78,71,13,10,26,10];
async function verify(club){
  const url=thirdLigaCrest(club.name);
  let lastError='';
  for(let attempt=0;attempt<2;attempt++){
    try {
      const response=await fetch(url,{headers:{accept:'image/png'},
        signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('HTTP '+response.status);
      if(!(response.headers.get('content-type')||'').toLowerCase().startsWith('image/png'))
        throw Error('not image/png: '+response.headers.get('content-type'));
      const length=Number(response.headers.get('content-length')||0);
      if(length>MAX_BYTES)throw Error('too large by Content-Length: '+length);
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>MAX_BYTES)throw Error('too large: '+bytes.length);
      if(!signature.every((v,i)=>bytes[i]===v))throw Error('invalid PNG signature');
      console.log('OK',club.name,bytes.length+' bytes');
      return true;
    }catch(e){
      lastError=String(e.message||e);
    }
  }
  console.error('FAIL',club.name,lastError,url);
  return false;
}
let passed=0;
for(let i=0;i<THIRD_LIGA_CLUBS_2026.length;i+=4){
  const group=THIRD_LIGA_CLUBS_2026.slice(i,i+4);
  const outcome=await Promise.all(group.map(verify));
  passed+=outcome.filter(Boolean).length;
}
console.log('3. Liga logo check:',passed+'/'+THIRD_LIGA_CLUBS_2026.length);
if(passed!==THIRD_LIGA_CLUBS_2026.length)process.exitCode=1;
