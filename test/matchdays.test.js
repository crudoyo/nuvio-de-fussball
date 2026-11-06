import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMatchday,selectSunday,upcomingSunday,startTime} from '../src/matchdays.js';
import {handle,encodeConfig} from '../src/worker.js';

const friday=Date.parse('2026-11-06T12:00:00Z');
const fixture=(id,round,at,finished=false)=>({
  matchID:id,group:{groupOrderID:round,groupName:round+'. Spieltag'},
  matchDateTimeUTC:at,matchIsFinished:finished,
  team1:{teamName:'Heim '+id},team2:{teamName:'Gast '+id}
});
const games=[
  fixture(3,9,'2026-11-08T18:30:00Z'),
  fixture(12,10,'2026-11-22T16:30:00Z'),
  fixture(1,9,'2026-11-06T19:30:00Z'),
  fixture(11,10,'2026-11-20T19:30:00Z'),
  fixture(2,9,'2026-11-07T14:30:00Z')
];
const ids=rows=>rows.map(m=>m.matchID);

test('selects complete official rounds across an international break, sorted by kickoff',()=>{
  assert.deepEqual(ids(selectMatchday(games,0,friday)),[1,2,3]);
  assert.deepEqual(ids(selectMatchday(games,1,friday)),[11,12]);
  const ongoing=games.map(m=>({...m,matchIsFinished:m.matchID<3}));
  assert.deepEqual(ids(selectMatchday(ongoing,0,Date.parse('2026-11-08T12:00:00Z'))),[1,2,3],
    'finished Friday/Saturday games stay in the active round');
});

test('an old postponed match does not replace the next regular round',()=>{
  const old=[
    fixture(60,6,'2026-09-18T18:00:00Z',true),
    fixture(61,6,'2026-09-19T13:00:00Z',true),
    fixture(62,6,'2026-09-20T15:00:00Z',true),
    fixture(63,6,'2026-11-07T12:00:00Z')
  ];
  assert.deepEqual(ids(selectMatchday([...games,...old],0,friday)),[1,2,3]);
  assert.deepEqual(ids(selectMatchday([...games,...old],1,friday)),[11,12]);
});

test('a postponed fixture stays in its round without holding that round open for weeks',()=>{
  const regular=[...games,fixture(4,9,'2026-12-02T19:30:00Z')];
  assert.deepEqual(ids(selectMatchday(regular,0,friday)),[1,2,3,4]);
  const finished=regular.map(m=>({...m,matchIsFinished:[1,2,3].includes(m.matchID)}));
  assert.deepEqual(ids(selectMatchday(finished,0,Date.parse('2026-11-09T12:00:00Z'))),[11,12]);
});

test('keeps unannounced kickoffs last and never invents a missing matchday',()=>{
  const input=[...games,fixture(4,9,null),fixture(20,null,'2026-11-06T18:00:00Z')];
  assert.deepEqual(ids(selectMatchday(input,0,friday)),[1,2,3,4]);
  assert.deepEqual(selectMatchday([fixture(20,null,'2026-11-06T18:00:00Z')],0,friday),[]);
  assert.deepEqual(selectMatchday(games,2,friday),[]);
});

test('handles final catch-up games, the last round, and the end of the season',()=>{
  const last=[fixture(1,34,'2026-05-23T13:30:00Z',true),
    fixture(2,34,'2026-05-23T13:30:00Z',true),fixture(3,34,'2026-06-02T17:00:00Z')];
  const now=Date.parse('2026-06-01T12:00:00Z');
  assert.deepEqual(ids(selectMatchday(last,0,now)),[1,2,3]);
  assert.deepEqual(selectMatchday(last,1,now),[]);
  assert.deepEqual(selectMatchday(last.map(m=>({...m,matchIsFinished:true})),0,now),[]);
  assert.deepEqual(selectMatchday([],0,now),[]);
});

test('live games remain in their round and stale unfinished results do not block the next one',()=>{
  const playing=[fixture(1,9,'2026-11-06T11:00:00Z'),fixture(2,10,'2026-11-13T19:30:00Z')];
  assert.deepEqual(ids(selectMatchday(playing,0,friday)),[1]);
  assert.deepEqual(ids(selectMatchday(playing,0,friday+4*3600000)),[2]);
  assert.equal(startTime({matchDateTime:'2026-11-06T12:00:00'}),null);
});

test('Sunday selection uses Berlin dates, handles DST, and shows only one Sunday',()=>{
  const now=Date.parse('2026-10-24T12:00:00Z');
  const sunday=[
    fixture(1,8,'2026-10-24T22:30:00Z'), // Sunday 00:30 CEST
    fixture(2,8,'2026-10-25T14:30:00Z'), // Sunday 15:30 CET
    fixture(3,8,'2026-10-25T23:30:00Z'), // Monday
    fixture(4,9,'2026-11-01T14:30:00Z'),fixture(5,8,null)
  ];
  assert.equal(upcomingSunday(now),'2026-10-25');
  assert.deepEqual(ids(selectSunday(sunday,now)),[1,2]);
  assert.equal(upcomingSunday(Date.parse('2026-10-26T00:00:00Z')),'2026-11-01');
  assert.deepEqual(ids(selectSunday(sunday,Date.parse('2026-10-26T00:00:00Z'))),[4]);
  assert.equal(upcomingSunday(Date.parse('2026-03-28T12:00:00Z')),'2026-03-29');
});

test('Sunday includes already played games today and stays empty on a free Sunday',()=>{
  const input=games.map(m=>({...m,matchIsFinished:true}));
  assert.deepEqual(ids(selectSunday(input,Date.parse('2026-11-08T20:00:00Z'))),[3]);
  assert.deepEqual(selectSunday(games,Date.parse('2026-11-09T12:00:00Z')),[]);
});

test('only Bundesliga and 3. Liga get three adjacent rows; catalogs keep canonical game IDs',async t=>{
  t.mock.timers.enable({apis:['Date'],now:friday});
  const fetcher=async url=>new Response(JSON.stringify(
    String(url).includes('/getmatchdata/')?games:[]));
  const prefix='/u/'+encodeConfig(['https://sports.example/manifest.json']);
  const get=async path=>(await handle(new Request('https://addon.test'+path),{SEASON:'2026'},fetcher)).json();
  const manifest=await get(prefix+'/manifest.json');
  for(const league of ['bl1','bl3']){
    const rows=manifest.catalogs.filter(c=>c.id===`defootball_${league}`||c.id.startsWith(`defootball_${league}_`));
    assert.deepEqual(rows.map(c=>c.id),[`defootball_${league}`,`defootball_${league}_following`,`defootball_${league}_sunday`]);
    assert(rows[0].name.endsWith(' · Nächster Spieltag'));
    assert(rows[1].name.endsWith(' · Darauffolgender Spieltag'));
    assert(rows[2].name.endsWith(' · Sonntagsspiele'));
    const next=await get(prefix+`/catalog/tv/defootball_${league}.json`);
    const following=await get(prefix+`/catalog/tv/defootball_${league}_following.json`);
    const sunday=await get(prefix+`/catalog/tv/defootball_${league}_sunday.json`);
    assert.deepEqual(next.metas.map(m=>m.id),[1,2,3].map(id=>`defootball_${league}_${id}`));
    assert.deepEqual(following.metas.map(m=>m.matchday.number),[10,10]);
    assert.deepEqual(sunday.metas.map(m=>m.id),[`defootball_${league}_3`]);
    assert(next.metas.every(m=>m.releaseInfo.startsWith('9. Spieltag · ')));
    assert(next.metas.every(m=>m.poster.startsWith('https://addon.test'+prefix+'/poster/'+league+'/')));
    const detail=await get(prefix+`/meta/tv/defootball_${league}_11.json`);
    assert.equal(detail.meta.id,following.metas[0].id);
    assert.equal(detail.meta.matchday.number,10);
    const svg=await handle(new Request('https://addon.test'+prefix+`/poster/${league}/1.svg`),{SEASON:'2026'},fetcher);
    assert.match(await svg.text(),/9\. Spieltag/);
  }
  assert.deepEqual(manifest.catalogs.filter(c=>c.id.startsWith('defootball_bl2')).map(c=>c.name),['⚽ 2. Bundesliga']);
  assert.deepEqual(manifest.catalogs.filter(c=>c.id.startsWith('defootball_ucl')).map(c=>c.name),['⚽ Champions League']);
  const other=await get('/catalog/tv/defootball_bl2.json');
  assert.equal(other.metas.length,5,'other leagues retain their 30-day overview');
  assert(!other.metas[0].matchday);
  const invalid=await get('/catalog/tv/defootball_bl2_sunday.json');
  assert.deepEqual(invalid,{metas:[]});
});
