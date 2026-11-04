import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUkScheduleDate,parseDaddySchedule,daddyPlayerUrl,getDaddySchedule,
  matchDaddyEvents,externalDaddyPlayers,daddyPublicDiagnostic
} from '../src/daddylive.js';
import {handle,matchScore} from '../src/worker.js';

const fixture={
  matchID:43210,
  matchDateTimeUTC:'2026-11-07T14:30:00Z',
  team1:{teamName:'Borussia Dortmund'},
  team2:{teamName:'SV 07 Elversberg'}
};
const schedule={
  'Saturday 7th November 2026 - Schedule Time UK GMT':{
    'Football</span>':[
      {time:'14:30',event:'Bundesliga: Borussia Dortmund vs SV Elversberg',
        channels:[{channel_name:'Sports Channel',channel_id:'302'}],
        channels2:[{channel_name:'Alternative Channel',channel_id:'401'},
          {channel_name:'Duplicated',channel_id:'302'}]},
      {time:'11:00',event:'Hamburger SV vs Bayern',channels:[{channel_id:'398'}]}
    ],
    'Tennis</span>':[
      {time:'18:00',event:'Tennis final',channels:[{channel_id:'10'}]}
    ]
  }
};
const asJson=(v,status=200)=>new Response(JSON.stringify(v),{
  status,headers:{'content-type':'application/json'}
});
test('DaddyLive UK GMT schedule parsing, football-only filtering and channel deduplication',()=>{
  assert.equal(parseUkScheduleDate('Saturday 7th November 2026 - Schedule Time UK GMT','14:30'),
    '2026-11-07T14:30:00.000Z');
  assert.equal(parseUkScheduleDate('2026-11-07','21:00'),'2026-11-07T21:00:00.000Z');
  assert.equal(parseUkScheduleDate('2026-02-31','21:00'),null);
  const events=parseDaddySchedule(schedule);
  assert.equal(events.length,2);
  assert.deepEqual(events[0].channels.map(x=>x.id),['302','401']);
  assert.equal(events[0].name,'Bundesliga: Borussia Dortmund vs SV Elversberg');
  assert.equal(parseDaddySchedule({success:true,data:schedule}).length,2);
  assert.deepEqual(parseDaddySchedule({success:true,data:{}}),[]);
});
test('strong match checks include both teams and UK kickoff time, prevent unrelated events',()=>{
  const events=parseDaddySchedule(schedule);
  const matches=matchDaddyEvents(fixture,events,matchScore);
  assert.equal(matches.length,1);
  assert.equal(matches[0].channels.length,2);
  assert.equal(matchDaddyEvents({...fixture,matchDateTimeUTC:'2026-11-08T21:00:00Z'},
    events,matchScore).length,0);
  assert.deepEqual(externalDaddyPlayers(fixture,events,matchScore).map(x=>x.externalUrl),[
    'https://thedaddy.pk/stream/stream-302.php',
    'https://thedaddy.pk/stream/stream-401.php'
  ]);
});
test('only documented numeric player ids are transformed into HTML web player URLs',()=>{
  assert.equal(daddyPlayerUrl('302'),'https://thedaddy.pk/stream/stream-302.php');
  for(const bad of ['1/../../etc','https://evil.example','',0,'3?redir=1'])
    assert.equal(daddyPlayerUrl(bad),null);
});
test('protected API key stays in Worker env and diagnostics never expose it',async()=>{
  const secret='TEST_PRIVATE_DO_NOT_SHOW';
  const requested=[];
  const result=await getDaddySchedule({DADDY_API_KEY:secret},async url=>{
    const u=String(url);
    requested.push(u);
    if(u.includes('daddyapi.php'))return asJson({error:'denied'},403);
    if(u.includes('/schedule/schedule-generated.json'))return asJson(schedule);
    return asJson({},404);
  });
  assert(result.reachable);
  assert(result.attempts.some(x=>x.reason==='HTTP 403'));
  assert.equal(result.footballEvents,2);
  assert.equal(result.channelCount,3);
  const diagnostic=daddyPublicDiagnostic(result);
  assert(!JSON.stringify(diagnostic).includes(secret));
  assert(requested[0].includes('key=TEST_PRIVATE_DO_NOT_SHOW'));
  assert(!JSON.stringify(result).includes(secret));
});
test('DaddyLive source diagnostics distinguish HTTP 403 from lack of football events',async()=>{
  const f=async()=>asJson({},403);
  const result=await getDaddySchedule({},f);
  assert.equal(result.reachable,false);
  assert.equal(result.attempts[0].reason,'HTTP 403');
  const empty=await getDaddySchedule({},async()=>asJson({'Saturday 7th November 2026':{Football:[]}}));
  assert.equal(empty.reachable,true);
  assert.equal(empty.footballEvents,0);
});
test('Worker exposes documented HTML player only after explicit setting, not a fake HLS stream',async()=>{
  const calls=[];
  const fetcher=async url=>{
    const u=String(url);calls.push(u);
    if(u.includes('/getavailableleagues/2026'))return asJson([]);
    if(u.includes('/getmatchdata/bl1/2026'))return asJson([fixture]);
    if(u.includes('/ger.1/teams'))return asJson({sports:[]});
    if(u.includes('/schedule/schedule-generated.json'))return asJson(schedule);
    return asJson({},404);
  };
  const url='https://example.workers.dev/stream/tv/defootball_bl1_43210.json';
  const enabled=await handle(new Request(url),{SEASON:'2026',DADDY_WEB_PLAYERS:'true'},fetcher);
  const enabledStreams=(await enabled.json()).streams;
  assert.equal(enabledStreams.length,2);
  assert(enabledStreams.every(x=>x.externalUrl.endsWith('.php')));
  assert(enabledStreams.every(x=>x.description.includes('kein nativer HLS')));
  const disabled=await handle(new Request(url),{SEASON:'2026'},fetcher);
  assert.equal((await disabled.json()).streams.length,0);
  const status=await handle(new Request('https://example.workers.dev/debug/sources.json'),
    {SEASON:'2026',DADDY_WEB_PLAYERS:'true'},fetcher);
  const diagnostics=await status.json();
  assert(diagnostics.providers.some(x=>x.name==='DaddyLive (direkter Spielplan)'&&
    x.footballEvents===2&&x.playerLinksEnabled));
  const matchInfo=await handle(new Request(
    'https://example.workers.dev/debug/daddy-match/defootball_bl1_43210.json'),
    {SEASON:'2026',DADDY_WEB_PLAYERS:'true'},fetcher);
  assert.equal(matchInfo.status,200);
  const matchData=await matchInfo.json();
  assert.equal(matchData.matchedEvents.length,1);
  assert.deepEqual(matchData.matchedEvents[0].channels.map(x=>x.id),['302','401']);
  assert.equal(matchData.daddy.footballEvents,2);
});
