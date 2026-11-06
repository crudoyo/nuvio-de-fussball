import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/worker.js';

test('a new PNG poster does not wait for ESPN team-list requests',async()=>{
  const requested=[];
  const match={matchID:778899,matchDateTimeUTC:'2026-11-06T18:30:00Z',
    team1:{teamName:'Borussia Dortmund'},team2:{teamName:'FC Bayern München'}};
  const mock=async url=>{
    const key=String(url);requested.push(key);
    if(key.includes('/getavailableleagues/'))return new Response('[]');
    if(key.includes('/getmatchdata/bl1/'))return new Response(JSON.stringify([match]));
    if(key.includes('site.api.espn.com'))throw Error('unexpected slow ESPN listing');
    return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),
      {headers:{'content-type':'image/png'}});
  };
  const result=await handle(new Request('https://addon.test/poster/bl1/778899.png'),
    {SEASON:'2026',__testPngRenderer:async()=>Uint8Array.of(137,80,78,71,13,10,26,10)},mock);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'image/png');
  assert(requested.some(x=>x.includes('/getmatchdata/bl1/')));
  assert(!requested.some(x=>x.includes('site.api.espn.com')));
});
