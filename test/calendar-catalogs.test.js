import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWeek,selectWeekday,selectCalendarView,weekWindow,startTime,weekdayLabel} from '../src/matchdays.js';
import {handle,encodeConfig} from '../src/worker.js';
import {encodeSettings} from '../src/addon-config.js';
import {DADDY_CURRENT_SCHEDULE} from '../src/daddylive.js';

const friday=Date.parse('2026-11-06T12:00:00Z');
const fixture=(id,round,at,finished=false)=>({
  matchID:id,group:{groupOrderID:round,groupName:round+'. Spieltag'},
  matchDateTimeUTC:at,matchIsFinished:finished,
  team1:{teamName:'Heim '+id},team2:{teamName:'Gast '+id}
});
const games=[
  fixture(5,9,'2026-11-08T18:30:00Z'),fixture(14,11,'2026-11-15T16:30:00Z'),
  fixture(1,8,'2026-11-02T19:30:00Z',true),fixture(3,9,'2026-11-06T19:30:00Z'),
  fixture(2,9,'2026-11-04T19:30:00Z',true),fixture(13,11,'2026-11-13T19:30:00Z'),
  fixture(4,9,'2026-11-07T14:30:00Z'),fixture(11,10,'2026-11-09T19:30:00Z'),
  fixture(12,10,'2026-11-11T19:30:00Z'),fixture(20,12,'2026-11-20T19:30:00Z')
];
const ids=rows=>rows.map(m=>m.matchID);

test('current week includes the whole Monday-Sunday calendar week across official round numbers',()=>{
  assert.deepEqual(weekWindow(friday),{start:'2026-11-02',end:'2026-11-09'});
  assert.deepEqual(ids(selectWeek(games,0,friday)),[1,2,3,4,5]);
  assert.deepEqual(ids(selectWeek(games.map(m=>({...m,matchIsFinished:true})),0,friday)),[1,2,3,4,5]);
});

test('next week includes midweek and weekend games in chronological order',()=>{
  assert.deepEqual(weekWindow(friday,1),{start:'2026-11-09',end:'2026-11-16'});
  assert.deepEqual(ids(selectWeek(games,1,friday)),[11,12,13,14]);
  const noNextWeek=games.filter(m=>m.matchID<10||m.matchID===20);
  assert.deepEqual(selectWeek(noNextWeek,1,friday),[],'do not skip a free calendar week');
});

test('Friday, Saturday and Sunday are separate subsets of this same week',()=>{
  assert.deepEqual(ids(selectWeekday(games,5,friday)),[3]);
  assert.deepEqual(ids(selectWeekday(games,6,friday)),[4]);
  assert.deepEqual(ids(selectWeekday(games,0,friday)),[5]);
  assert.deepEqual(ids(selectWeekday(games,5,Date.parse('2026-11-07T12:00:00Z'))),[3],
    'Saturday must not move the Friday row to the next week');
});

test('Berlin midnight places Sunday-night UTC kickoffs into the right calendar week',()=>{
  const boundary=[fixture(1,8,'2026-11-01T22:30:00Z'),fixture(2,8,'2026-11-01T23:30:00Z'),
    fixture(3,9,'2026-11-08T22:30:00Z'),fixture(4,10,'2026-11-08T23:30:00Z')];
  assert.deepEqual(ids(selectWeek(boundary,0,friday)),[2,3]);
  assert.deepEqual(ids(selectWeek(boundary,1,friday)),[4]);
  assert.deepEqual(ids(selectWeekday(boundary,0,friday)),[3]);
});

test('calendar weeks handle spring and autumn clock changes without fixed 24h assumptions',()=>{
  const spring=Date.parse('2026-03-28T12:00:00Z');
  assert.deepEqual(weekWindow(spring),{start:'2026-03-23',end:'2026-03-30'});
  const springGames=[fixture(1,1,'2026-03-29T21:30:00Z'),fixture(2,1,'2026-03-29T22:30:00Z')];
  assert.deepEqual(ids(selectWeek(springGames,0,spring)),[1]);
  assert.deepEqual(ids(selectWeek(springGames,1,spring)),[2]);
  const autumn=Date.parse('2026-10-24T12:00:00Z');
  assert.deepEqual(weekWindow(autumn),{start:'2026-10-19',end:'2026-10-26'});
  const autumnGames=[fixture(1,1,'2026-10-25T22:30:00Z'),fixture(2,1,'2026-10-25T23:30:00Z')];
  assert.deepEqual(ids(selectWeek(autumnGames,0,autumn)),[1]);
  assert.deepEqual(ids(selectWeek(autumnGames,1,autumn)),[2]);
});

test('Monday rollover and the year boundary advance both weekly and daily rows together',()=>{
  const monday=Date.parse('2026-11-08T23:30:00Z');
  assert.deepEqual(ids(selectWeek(games,0,monday)),[11,12,13,14]);
  assert.deepEqual(ids(selectWeekday(games,5,monday)),[13]);
  const newYear=Date.parse('2027-01-01T12:00:00Z');
  assert.deepEqual(weekWindow(newYear),{start:'2026-12-28',end:'2027-01-04'});
  assert.deepEqual(weekWindow(newYear,1),{start:'2027-01-04',end:'2027-01-11'});
});

test('dated catch-up games appear in their actual week even without an official round number',()=>{
  const input=[fixture(6,2,'2026-11-03T19:30:00Z'),fixture(7,null,'2026-11-05T19:30:00Z'),fixture(8,9,null)];
  assert.deepEqual(ids(selectWeek(input,0,friday)),[6,7]);
  assert.equal(startTime({matchDateTime:'2026-11-06T12:00:00'}),null);
  assert.equal(weekdayLabel(games.find(m=>m.matchID===3)),'Freitag');
  assert.deepEqual(selectWeek(games,2,friday),[]);
  assert.deepEqual(selectWeekday(games,7,friday),[]);
  assert.deepEqual(selectCalendarView(games,'unknown',friday),[]);
});

test('a Bundesliga simulcast is a separate calendar entry with its own channels and artwork',async t=>{
  t.mock.timers.enable({apis:['Date'],now:friday});
  const channel=(channel_id,channel_name)=>({channel_id,channel_name});
  const event=(event,...channels)=>({time:'14:30',event,channels});
  const schedule={'Saturday 7th November 2026':{Football:[
    event('Germany - Bundesliga : Simulcast',channel('118','International'),channel('426','DAZN1 DE')),
    event('1. Bundesliga : Simulcast',channel('426','DAZN1 DE'),channel('427','Alternate')),
    event('Bundesliga 2 : Simulcast',channel('301','2. Bundesliga')),
    event('Germany - Bundesliga : Multiview',channel('302','Multiview')),
    event('England - Premier League : Simulcast',channel('303','Other competition'))
  ]}};
  const fetcher=async url=>{
    const path=String(url);
    if(path===DADDY_CURRENT_SCHEDULE)return Response.json(schedule);
    if(path.includes('/getmatchdata/'))return Response.json(games);
    return new Response(null,{status:404});
  };
  const env={SEASON:'2026',DADDY_WEB_PLAYERS:'true',NATIVE_CHANNEL_STREAMS_JSON:JSON.stringify({'426':{url:'https://media.example/conference.m3u8'}})};
  const prefix='/u/'+encodeSettings({m:[],c:['defootball_bl1','defootball_bl1_saturday','defootball_bl1_sunday'],b:true});
  const get=path=>handle(new Request('https://addon.test'+path),env,fetcher);
  const catalog=async suffix=>(await (await get(prefix+'/catalog/tv/defootball_bl1'+suffix+'.json')).json()).metas;
  const saturday=await catalog('_saturday');
  assert.deepEqual(saturday.map(m=>m.name),['Bundesliga-Konferenz','Heim 4 – Gast 4']);
  const [conference]=saturday;
  assert.equal((await catalog('')).filter(m=>m.id===conference.id).length,1);
  assert(!(await catalog('_sunday')).some(m=>m.id===conference.id));
  assert.equal(conference.released,'2026-11-07T14:30:00.000Z');
  assert.deepEqual((await (await get(prefix+'/meta/tv/'+conference.id+'.json')).json()).meta,conference);
  const poster=await get(new URL(conference.poster).pathname.replace('.png','.svg'));
  assert.match(await poster.text(),/>Konferenz</);
  const streamPath='/stream/tv/'+conference.id+'.json';
  const {streams}=await (await get(prefix+streamPath)).json();
  assert.equal(streams[0].url,'https://media.example/conference.m3u8');
  assert.deepEqual(streams.slice(1).map(s=>s.externalUrl?.split('-').at(-1)),['426.php','118.php','427.php']);
  const native='/u/'+encodeSettings({m:[],b:false});
  assert.equal((await (await get(native+streamPath)).json()).streams.length,1);
});

test('two five-row league blocks lead the catalog; every row preserves playable game IDs',async t=>{
  t.mock.timers.enable({apis:['Date'],now:friday});
  const fetcher=async url=>new Response(JSON.stringify(String(url).includes('/getmatchdata/')?games:[]));
  const prefix='/u/'+encodeConfig(['https://sports.example/manifest.json']);
  const get=async path=>(await handle(new Request('https://addon.test'+path),{SEASON:'2026'},fetcher)).json();
  const manifest=await get(prefix+'/manifest.json');
  assert.equal(manifest.name,'SoccerDE');
  assert.equal(manifest.id,'com.community.nuvio.defootball');
  assert(manifest.catalogs.every(c=>!c.name.includes('⚽')));
  const suffixes=['','_friday','_saturday','_sunday','_following'];
  const labels=['Aktuelle Woche (Mo–So)','Freitag','Samstag','Sonntag','Kommende Woche (Mo–So)'];
  const expectedIds=['bl1','bl3'].flatMap(league=>suffixes.map(suffix=>`defootball_${league}${suffix}`));
  assert.deepEqual(manifest.catalogs.slice(0,10).map(c=>c.id),expectedIds);
  assert.equal(manifest.catalogs[10].id,'defootball_bl2');
  assert.deepEqual(manifest.catalogs.slice(10).map(c=>c.id),[
    'defootball_bl2','defootball_ucl','defootball_uel','defootball_uecl','defootball_dfb',
    'defootball_blsupercup','defootball_ffb1','defootball_ffb2','defootball_dfbf','defootball_wsc'
  ]);
  for(const league of ['bl1','bl3']){
    const rows=manifest.catalogs.filter(c=>c.id===`defootball_${league}`||c.id.startsWith(`defootball_${league}_`));
    assert.deepEqual(rows.map(c=>c.name.split(' · ').at(-1)),labels);
    const expected=[[1,2,3,4,5],[3],[4],[5],[11,12,13,14]];
    for(let i=0;i<suffixes.length;i++){
      const row=await get(prefix+`/catalog/tv/defootball_${league}${suffixes[i]}.json`);
      assert.deepEqual(row.metas.map(m=>m.id),expected[i].map(id=>`defootball_${league}_${id}`));
      assert(row.metas.every(m=>m.poster.startsWith('https://addon.test'+prefix+'/poster/'+league+'/')));
    }
    const following=await get(prefix+`/catalog/tv/defootball_${league}_following.json`);
    const detail=await get(prefix+`/meta/tv/defootball_${league}_13.json`);
    assert.equal(detail.meta.id,following.metas[2].id);
    assert(detail.meta.releaseInfo.startsWith('Freitag · '));
    const svg=await handle(new Request('https://addon.test'+prefix+`/poster/${league}/3.svg`),{SEASON:'2026'},fetcher);
    assert.match(await svg.text(),/Freitag/);
  }
  assert.deepEqual(manifest.catalogs.filter(c=>c.id.startsWith('defootball_bl2')).map(c=>c.name),['2. Bundesliga']);
  assert.deepEqual(manifest.catalogs.filter(c=>c.id.startsWith('defootball_ucl')).map(c=>c.name),['Champions League']);
  const other=await get('/catalog/tv/defootball_bl2.json');
  assert.deepEqual(other.metas.map(m=>Number(m.id.split('_').at(-1))),[3,4,5,11,12,13,14,20]);
  assert(!other.metas[0].matchday);
  assert.deepEqual(await get('/catalog/tv/defootball_bl2_friday.json'),{metas:[]});
});
