import test from 'node:test';
import assert from 'node:assert/strict';
import {curatedCrest} from '../src/crests.js';
import {makeMatchPoster} from '../src/graphics.js';
import {handle} from '../src/worker.js';

const png=Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64'));

test('covers club aliases and Bundesliga/3. Liga sides from the curated seed',()=>{
  for(const club of [
    'FC Bayern München','Borussia Dortmund','1. FC Nürnberg','1. FC Köln',
    'FC Hansa Rostock','Rot-Weiss Essen','Dynamo Dresden','Energie Cottbus',
    'VfL Osnabrück','FC Bayern München II','SC Freiburg Frauen'
  ]){
    const crest=curatedCrest(club);
    assert(crest?.startsWith('https://'),`missing crest for ${club}`);
  }
  assert.equal(curatedCrest('SSV Ulm 1846'),null,
    'must not mistake Ulm football for a college or other sports team');
  assert.equal(curatedCrest('Chemnitzer FC'),null,
    'do not confuse soccer teams with unrelated city sports teams');
});

test('poster embeds PNG crest from seed even when OpenLigaDB points at a missing SVG',async()=>{
  const visits=[];
  const network=async(url)=>{
    visits.push(String(url));
    if(String(url).startsWith('https://a.espncdn.com/'))
      return new Response(png,{headers:{'content-type':'image/png'}});
    return new Response('',{status:404});
  };
  const html=await makeMatchPoster({
    team1:{teamName:'FC Bayern München',teamIconUrl:'https://upload.wikimedia.org/wikipedia/commons/0/00/broken.svg'},
    team2:{teamName:'Borussia Dortmund'}
  },{name:'Bundesliga'},'06.11. 20:30 Uhr','Demnächst',network);
  assert.match(html,/data:image\/png;base64,/);
  assert.equal((html.match(/data:image\/png;base64,/g)||[]).length,2);
  assert(!visits.some(u=>u.includes('broken.svg')),
    'prefer known local PNG to broken SVG URLs');
});

test('poster tries OpenLigaDB image and ESPN when no curated crest exists',async()=>{
  const source='https://test.example/invalid.svg';
  const backup='https://test.example/available.png';
  const visits=[];
  const result=await makeMatchPoster({
    team1:{teamName:'Unbekannter SC Beispiel',teamIconUrl:source,teamIconBackupUrl:backup},
    team2:{teamName:'Gäste FC'}
  },{name:'Regionalliga West'},'10:00','Demnächst',async url=>{
    visits.push(String(url));
    return String(url)===backup
      ?new Response(png,{headers:{'content-type':'image/png'}})
      :new Response('',{status:404});
  });
  assert(visits.includes(source));
  assert(visits.includes(backup));
  assert.match(result,/data:image\/png;base64,/);
});

test('match metadata publishes team crest URLs to native Nuvio clients',async()=>{
  const match={
    matchID:50000,matchDateTimeUTC:'2026-11-06T20:30:00Z',
    team1:{teamName:'1. FC Nürnberg'},team2:{teamName:'Rot-Weiss Essen'}
  };
  const fetcher=async url=>{
    if(String(url).includes('/getavailableleagues/'))return new Response('[]');
    if(String(url).includes('/getmatchdata/bl3/'))return new Response(JSON.stringify([match]));
    return new Response('[]');
  };
  const r=await handle(new Request('https://addon.test/meta/tv/defootball_bl3_50000.json'),
    {SEASON:'2026'},fetcher);
  assert.equal(r.status,200);
  const {meta}=await r.json();
  assert(meta.team1.logo.startsWith('https://a.espncdn.com/'));
  assert(meta.team2.logo.startsWith('https://r2.thesportsdb.com/'));
  assert.equal(meta.team1.name,match.team1.teamName);
  assert.equal(meta.team2.name,match.team2.teamName);
  assert.match(meta.poster,/\.png\?v=0\.4\.15$/);
});
