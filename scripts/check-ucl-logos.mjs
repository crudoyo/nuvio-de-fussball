/** Verify current OpenLigaDB UEFA club identities and their real PNG files. */
import {curatedCrest} from '../src/crests.js';
const season=process.env.SEASON||String(new Date().getUTCFullYear()-(new Date().getUTCMonth()<6?1:0));
const response=await fetch(`https://api.openligadb.de/getmatchdata/ucl/${season}`,
  {signal:AbortSignal.timeout(12000)});
if(!response.ok)throw new Error('OpenLigaDB HTTP '+response.status);
const games=await response.json();
const clubs=[...new Set(games.flatMap(m=>[m.team1?.teamName,m.team2?.teamName]).filter(Boolean))];
if(!clubs.length)throw new Error('No Champions League teams available');
const signature=[137,80,78,71,13,10,26,10];
let passed=0;
for(let i=0;i<clubs.length;i+=4){
  await Promise.all(clubs.slice(i,i+4).map(async club=>{
    try{
      const url=curatedCrest(club);
      if(!url)throw new Error('No exact club mapping');
      const image=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{accept:'image/png'}});
      if(!image.ok)throw new Error('HTTP '+image.status);
      if(!(image.headers.get('content-type')||'').toLowerCase().startsWith('image/png'))
        throw new Error('Not a PNG response');
      const bytes=Buffer.from(await image.arrayBuffer());
      if(bytes.length>240000||!signature.every((v,i)=>bytes[i]===v))throw new Error('Invalid/oversized PNG');
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      if(width<64||height<64)throw new Error('Low-resolution crest: '+width+'x'+height);
      console.log('OK',club,`${width}x${height}`,bytes.length+' bytes');
      passed++;
    }catch(error){console.error('FAIL',club,error.message);}
  }));
}
console.log('Champions League logo check:',passed+'/'+clubs.length);
if(passed!==clubs.length)process.exitCode=1;
