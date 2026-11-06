import test from 'node:test';
import assert from 'node:assert/strict';
import {THIRD_LIGA_CLUBS_2026,thirdLigaCrest} from '../src/third-league-crests.js';
import {curatedCrest} from '../src/crests.js';
import {makeMatchPoster} from '../src/graphics.js';
import {handle} from '../src/worker.js';

const png=Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64'));

test('the final DFB 2026/27 field contains 20 unambiguous, mapped clubs',()=>{
  assert.equal(THIRD_LIGA_CLUBS_2026.length,20);
  assert(!THIRD_LIGA_CLUBS_2026.some(x=>x.name.includes('1860')));
  const urls=THIRD_LIGA_CLUBS_2026.map(x=>{
    const url=thirdLigaCrest(x.name);
    assert(url?.endsWith('.png'), 'missing PNG for '+x.name);
    assert.equal(curatedCrest(x.name),url,'worker must use the same badge: '+x.name);
    return url;
  });
  assert.equal(new Set(urls).size,20,'do not swap two distinct club identities');
});

test('the Essen, Fortuna, Cologne and reserve-team identities never collide',()=>{
  const rwe='https://www.footylogos.com/dls/logo/rgba-v1/rot-weiss-essen.png';
  for(const name of ['Rot-Weiss Essen','Rot-Weiß Essen','Rot Weiss Essen','RW Essen','RWE']){
    assert.equal(curatedCrest(name),rwe,name);
  }
  assert.notEqual(thirdLigaCrest('SC Fortuna Köln'),thirdLigaCrest('Fortuna Düsseldorf'));
  assert.notEqual(thirdLigaCrest('FC Viktoria Köln'),thirdLigaCrest('SC Fortuna Köln'));
  assert.equal(thirdLigaCrest('TSG 1899 Hoffenheim II'),
    'https://a.espncdn.com/i/teamlogos/soccer/500/7911.png');
  assert.equal(thirdLigaCrest('VfB Stuttgart II'),
    'https://a.espncdn.com/i/teamlogos/soccer/500/134.png');
  assert.equal(thirdLigaCrest('TSV 1860 München'),null);
  assert.equal(thirdLigaCrest('FC Bayern München'),null);
  assert.equal(thirdLigaCrest('Waldhof Mannheim II'),null);
  assert.equal(thirdLigaCrest('Essen'),null,'a city alone is not a safe club identity');
});

test('all 20 curated crests embed as a PNG in the same poster pipeline as Fire TV',async()=>{
  const requests=[];
  const fetcher=async url=>{
    requests.push(String(url));
    return new Response(png,{headers:{'content-type':'image/png'}});
  };
  for(const club of THIRD_LIGA_CLUBS_2026){
    const art=await makeMatchPoster({team1:{teamName:club.name},
      team2:{teamName:'Unbekannter Testgegner'}},
      {name:'3. Liga'},'07.11. 14:00 Uhr','Demnächst',fetcher);
    assert.equal((art.match(/data:image\/png;base64,/g)||[]).length,1,club.name);
  }
  for(const club of THIRD_LIGA_CLUBS_2026)
    assert(requests.includes(thirdLigaCrest(club.name)), 'fetch missing for '+club.name);
});

test('live image diagnostic reports all teams and tests actual image decoding',async()=>{
  const fetcher=async()=>new Response(png,{headers:{'content-type':'image/png'}});
  const response=await handle(new Request('https://example.test/debug/crests/bl3.json'),
    {SEASON:'2026'},fetcher);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.season,2026);
  assert.equal(body.total,20);
  assert.equal(body.ok,20);
  assert.equal(body.clubs.length,20);
  assert(body.clubs.every(x=>x.usable && x.imageUrl.endsWith('.png')));
});
