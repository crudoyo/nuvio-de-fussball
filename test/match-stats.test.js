import test from 'node:test';
import assert from 'node:assert/strict';
import {standingsUrl,resultOfType,createStatsContext,statisticsLines} from '../src/match-stats.js';
import {handle,encodeConfig} from '../src/worker.js';

const now=Date.parse('2026-11-06T12:00:00Z');
const home={teamId:1,teamName:'SV Meppen'},away={teamId:2,teamName:'Jahn Regensburg'};
const result=(a,b,type=2)=>({resultTypeID:type,pointsTeam1:a,pointsTeam2:b});
const match=(id,day,atHome,a,b)=>({matchID:id,matchDateTimeUTC:`2026-10-${String(day).padStart(2,'0')}T12:00:00Z`,
  matchIsFinished:true,team1:atHome?home:{teamId:100+id,teamName:'Gegner '+id},
  team2:atHome?{teamId:100+id,teamName:'Gegner '+id}:home,matchResults:[result(a,b)]});
const history=[match(1,1,true,2,0),match(2,2,false,2,1),match(3,3,true,1,1),
  match(4,4,false,0,2),match(5,5,true,0,1),match(6,6,false,2,2)];
const game={matchID:84873,matchDateTimeUTC:'2026-11-08T12:30:00Z',matchIsFinished:false,
  group:{groupOrderID:13,groupName:'13. Spieltag'},team1:home,team2:away,matchResults:[]};
const table=[{teamInfoId:1,teamName:'Meppen',matches:12,points:15,won:4,lost:5,goals:16,opponentGoals:17},
  {teamInfoId:2,teamName:'Regensburg',matches:12,points:13,won:3,lost:5,goals:22,opponentGoals:21}];

test('standings are limited to the three verified German league endpoints',()=>{
  assert.equal(standingsUrl('bl3',2026),'https://api.openligadb.de/getbltable/bl3/2026');
  assert(standingsUrl('BL1',2026));assert(standingsUrl('bl2',2026));
  assert.equal(standingsUrl('ucl',2026),null);assert.equal(standingsUrl('dfb',2026),null);
});

test('season record counts all completed finals, ignoring duplicates, draws and games without a final score',()=>{
  const halfOnly={...match(7,7,true,9,0),matchResults:[result(9,0,1)]};
  const unfinished={...match(8,8,true,9,0),matchIsFinished:false};
  const future={...match(9,9,true,9,0),matchDateTimeUTC:'2026-11-07T12:00:00Z'};
  const invalid={...match(10,10,true,9,0),matchResults:[result(null,0)]};
  const context=createStatsContext([history[0],halfOnly,unfinished,...history,future,invalid],[],now);
  assert.deepEqual(context(home),{standing:null,record:{wins:2,losses:2}});
  assert.deepEqual(context(away),{standing:null,record:null});
  assert.equal(resultOfType(halfOnly),null,'a halftime score must not become a final score');
});

test('team IDs survive name changes without mixing reserve teams or similar names',()=>{
  const context=createStatsContext(history,table,now);
  assert.deepEqual(context({...home,teamName:'Umbenannter Verein'}).record,{wins:4,losses:5});
  assert.deepEqual(context({teamId:999,teamName:'SV Meppen'}),{standing:null,record:null});
  assert.deepEqual(context({teamName:'SV Meppen II'}),{standing:null,record:null});
  assert.deepEqual(context({teamName:'SV Meppen'}).record,{wins:2,losses:2});
});

test('missing statistics are omitted; actual zeroes and point deductions remain valid',()=>{
  const rows=[{...table[0],points:-2,won:0,lost:0,goals:0,opponentGoals:0},
    {...table[1],points:null}];
  const context=createStatsContext([],rows,now);
  assert.deepEqual(context(home).standing,{rank:1,points:-2,goals:0,against:0});
  assert.deepEqual(context(home).record,{wins:0,losses:0});
  assert.equal(context(away).standing,null);
  assert.deepEqual(statisticsLines(game,createStatsContext([],[],now)),[]);
  assert.deepEqual(statisticsLines(game,createStatsContext([],{error:'offline'},now)),[]);
  assert.equal(createStatsContext([],[{...table[0],matches:0}],now)(home).standing,null);
});

test('description places the standings record between points and goals',()=>{
  const lines=statisticsLines(game,createStatsContext(history,table,now));
  assert.deepEqual(lines,[
    'SV Meppen: Platz 1 · 15 Punkte · Siege/Niederlagen 4:5 · Tore 16:17.',
    'Jahn Regensburg: Platz 2 · 13 Punkte · Siege/Niederlagen 3:5 · Tore 22:21.']);
  const partial=statisticsLines(game,createStatsContext(history.slice(0,2),[],now)).join('\n');
  assert(partial.includes('Siege/Niederlagen 1:1'));
  assert(!partial.includes('Platz')&&!partial.includes('Punkte'));
});

test('catalog previews and personal detail pages both replace the technical hint with statistics',async t=>{
  t.mock.timers.enable({apis:['Date'],now});
  const visited=[];
  const fetcher=async(url,options)=>{
    const value=String(url);visited.push(value);
    if(value.includes('/getbltable/')){
      assert.equal(options.redirect,'manual');assert(options.signal instanceof AbortSignal);
      return new Response(JSON.stringify(table));
    }
    return new Response(JSON.stringify(value.includes('/getmatchdata/')?[...history,game]:[]));
  };
  const prefix='/u/'+encodeConfig(['https://sports.example/manifest.json']);
  for(const path of ['/catalog/tv/defootball_bl3_sunday.json',prefix+'/meta/tv/defootball_bl3_84873.json']){
    const response=await handle(new Request('https://addon.test'+path),{SEASON:'2026'},fetcher);
    assert.equal(response.status,200);
    const body=await response.json(),preview=body.meta||body.metas[0];
    assert(preview.description.startsWith('SV Meppen: Platz 1 · 15 Punkte · Siege/Niederlagen 4:5 · Tore 16:17'));
    assert(!/Form \(|Videostreams|Sport-Add-on|zuordnet/.test(preview.description));
    assert.equal(preview.id,'defootball_bl3_84873');
  }
  assert.equal(visited.filter(s=>s.includes('/getbltable/')).length,1,'table lookup is cached between views');
});

test('table failures preserve the record from completed season matches',async t=>{
  t.mock.timers.enable({apis:['Date'],now});
  const response=await handle(new Request('https://addon.test/meta/tv/defootball_bl1_84873.json'),{SEASON:'2026'},
    async url=>String(url).includes('/getbltable/')?new Response('offline',{status:503}):
      new Response(JSON.stringify(String(url).includes('/getmatchdata/')?[...history,game]:[])));
  const {meta}=await response.json();
  assert.equal(response.status,200);assert(meta.description.includes('Siege/Niederlagen 2:2'));
  assert(!/Platz|Punkte|offline|HTTP|Videostreams/.test(meta.description));
});

test('completed matches show final and halftime scores, not a guessed result',async t=>{
  t.mock.timers.enable({apis:['Date'],now});
  const completed={...game,matchIsFinished:true,matchDateTimeUTC:'2026-11-05T12:30:00Z',
    matchResults:[result(0,1,1),result(2,1)]};
  const response=await handle(new Request('https://addon.test/meta/tv/defootball_dfb_84873.json'),{SEASON:'2026'},
    async url=>new Response(JSON.stringify(String(url).includes('/getmatchdata/')?[completed]:[])));
  const {meta}=await response.json();
  assert(meta.description.startsWith('SV Meppen: Siege/Niederlagen 1:0.'));
  assert(meta.description.includes('Endstand: 2:1 (Halbzeit 0:1).'));
  assert(!meta.description.includes('Videostreams'));
});

test('image and stream requests do not fetch optional standings',async t=>{
  t.mock.timers.enable({apis:['Date'],now});
  const visited=[];
  const fetcher=async url=>{
    const value=String(url);visited.push(value);
    return new Response(JSON.stringify(value.includes('/getmatchdata/')?[game]:[]));
  };
  for(const path of ['/poster/bl2/84873.svg','/stream/tv/defootball_bl2_84873.json']){
    const response=await handle(new Request('https://addon.test'+path),{SEASON:'2026'},fetcher);
    assert.equal(response.status,200);
  }
  assert(!visited.some(url=>url.includes('/getbltable/')));
});
