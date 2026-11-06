import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {curatedCrest,attachFallbackCrests} from '../src/crests.js';
import {makeMatchPoster,makeMatchBackground} from '../src/graphics.js';
import {handle} from '../src/worker.js';

// Names from OpenLigaDB /getmatchdata/ucl/2026, independently cross-checked
// against ESPN /soccer/uefa.champions/teams?limit=150 on 2026-11-06.
const clubs=JSON.parse(await readFile(new URL('./fixtures/ucl-clubs-2026.json',import.meta.url)));
const png=Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64'));
const image=async()=>new Response(png,{headers:{'content-type':'image/png'}});

test('all 36 current Champions League names map to the independently checked football club',()=>{
  assert.equal(clubs.length,36);
  const urls=clubs.map(([name,id])=>{
    const url=curatedCrest(name);
    assert.equal(url,`https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`,name);
    return url;
  });
  assert.equal(new Set(urls).size,36,'distinct clubs must not share an accidental city match');
  assert.notEqual(curatedCrest('Inter Mailand'),curatedCrest('Inter Miami CF'));
  assert.notEqual(curatedCrest('Paris St. Germain'),curatedCrest('Paris FC'));
  assert.equal(curatedCrest('FK Bodø/Glimt'),curatedCrest('FK Bodö/Glimt'));
});

test('screenshot clubs embed their crests in catalog posters and detail backgrounds',async()=>{
  for(const [home,away] of [['Slavia Prag','Villarreal CF'],['Inter Mailand','VfB Stuttgart']]){
    const fixture={team1:{teamName:home},team2:{teamName:away}};
    for(const art of [await makeMatchPoster(fixture,{name:'Champions League'},'21:00','Demnächst',image),
      await makeMatchBackground(fixture,image)]){
      assert.equal((art.match(/<image /g)||[]).length,2,`${home} / ${away}`);
      assert(!art.includes('<circle'),'no initial-only fallback for screenshot clubs');
    }
  }
});

test('ESPN artwork fallback also recognizes the German club names',()=>{
  const [game]=attachFallbackCrests([{
    team1:{teamName:'Slavia Prag'},team2:{teamName:'Inter Mailand'}
  }],{teams:[
    {displayName:'Slavia Prague',logo:'https://logos.example/slavia.png'},
    {displayName:'Internazionale',logo:'https://logos.example/inter.png'},
    {displayName:'Inter Miami',logo:'https://logos.example/miami.png'}
  ]});
  assert.equal(game.team1.teamIconBackupUrl,'https://logos.example/slavia.png');
  assert.equal(game.team2.teamIconBackupUrl,'https://logos.example/inter.png');
});

test('live UEFA diagnostic uses every fixture team and the actual badge embedding pipeline',async()=>{
  const games=clubs.map(([name],i)=>({matchID:i+1,team1:{teamName:name},team2:{teamName:clubs[0][0]}}));
  const response=await handle(new Request('https://addon.test/debug/crests/ucl.json'),{SEASON:'2026'},
    async url=>String(url).includes('/getmatchdata/ucl/')
      ?new Response(JSON.stringify(games)):image());
  const diagnostic=await response.json();
  assert.equal(response.status,200);
  assert.equal(diagnostic.total,36);
  assert.equal(diagnostic.ok,36);
  assert.equal(diagnostic.clubs.length,36);
});
