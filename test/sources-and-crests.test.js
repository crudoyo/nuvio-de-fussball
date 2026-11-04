import test from 'node:test';
import assert from 'node:assert/strict';
import {attachFallbackCrests, readESPNTeamCrests, espnTeamsUrl} from '../src/crests.js';
import {makeMatchPoster} from '../src/graphics.js';
import {handle, diagnoseSources} from '../src/worker.js';

const match={
  matchID:878765,matchDateTimeUTC:new Date(Date.now()+24*3600000).toISOString(),
  team1:{teamName:'Borussia Dortmund',teamIconUrl:'https://badges.example/old.svg'},
  team2:{teamName:'SV 07 Elversberg',teamIconUrl:''}
};
const espnTeams={sports:[{leagues:[{teams:[
  {team:{displayName:'Borussia Dortmund',logos:[{href:'https://a.espncdn.com/i/teamlogos/soccer/500/124.png'}]}},
  {team:{displayName:'SV Elversberg',logos:[{href:'https://a.espncdn.com/i/teamlogos/soccer/500/999.png'}]}}
]}]}]};
const j=o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
test('public alternative crests map matching club names, not unrelated clubs',()=>{
  assert(espnTeamsUrl('bl1').endsWith('/ger.1/teams?limit=150'));
  assert(espnTeamsUrl('bl2').includes('ger.2'));
  assert.equal(espnTeamsUrl('bl3'),null);
  assert.equal(readESPNTeamCrests(espnTeams).length,2);
  const [m]=attachFallbackCrests([match],espnTeams);
  assert(m.team1.teamIconBackupUrl.endsWith('/124.png'));
  assert(m.team2.teamIconBackupUrl.endsWith('/999.png'));
});
test('when primary logo fails, the embedded card displays the secondary crest',async()=>{
  const [m]=attachFallbackCrests([match],espnTeams);
  const calls=[];
  const fake=async(url)=>{
    calls.push(String(url));
    if(String(url).includes('badges.example'))return new Response('missing',{status:404});
    return new Response(Uint8Array.from([137,80,78,71,13,10,26,10]),
      {headers:{'content-type':'image/png'}});
  };
  const art=await makeMatchPoster(m,{name:'1. Bundesliga'},'07.11., 15:30 Uhr','Demnächst',fake);
  assert(art.includes('data:image/png;base64,'));
  assert(calls.some(s=>s.includes('badges.example')));
  assert(calls.some(s=>s.includes('a.espncdn.com')));
});
test('providers diagnostic does not display personal URL or token and flags catalog-less provider',async()=>{
  const personal='https://pengu.uk/token-sensitive-private/manifest.json';
  const fetcher=async url=>{
    const u=String(url);
    if(u.includes('token-sensitive-private'))return j({name:'PenguPlay',types:['tv'],
      resources:['stream','catalog'],catalogs:[]});
    if(u.includes('sports.highfly.to'))return j({name:'Sports Streams',types:['sport'],
      resources:['stream','catalog'],catalogs:[{type:'sport',id:'soccer',name:'Soccer'}]});
    return new Response('offline',{status:503});
  };
  const result=await diagnoseSources([personal],fetcher);
  assert(result.some(x=>x.name==='Sports Streams'&&x.sportsCatalogs===1));
  assert(result.some(x=>x.name==='PenguPlay'&&x.catalogCount===0));
  assert(result.some(x=>x.name==='Nuvio Live Sports'&&x.reason==='HTTP 503'));
  assert(!JSON.stringify(result).includes('token-sensitive-private'));
  const uri='https://test.workers.dev/debug/sources.json';
  const r=await handle(new Request(uri),{},fetcher);
  assert.equal(r.status,200);
  assert.equal((await r.json()).providers.length,4);
});

test('Sports Streams mirrors remain available for matching when main instance blocks the Worker',async()=>{
  const fixture={
    matchID:828282,
    matchDateTimeUTC:new Date(Date.now()+3600000).toISOString(),
    team1:{teamName:'FC Bayern München'},team2:{teamName:'Borussia Dortmund'}
  };
  const seen=[];
  const fetcher=async url=>{
    const x=String(url);
    seen.push(x);
    if(x.includes('sports.highfly.to')||x.includes('sportsfree-us2.highfly.to'))
      return new Response('forbidden',{status:403});
    if(x==='https://sportsfree.highfly.to/manifest.json')
      return j({name:'Sports Streams mirror',catalogs:[{id:'football',type:'sport',name:'Football'}]});
    if(x==='https://sportsfree.highfly.to/catalog/sport/football.json')
      return j({metas:[{id:'one',name:'Bayern Munich vs Borussia Dortmund'}]});
    if(x==='https://sportsfree.highfly.to/stream/sport/one.json')
      return j({streams:[{url:'https://media.example.com/bayern-dortmund.m3u8',name:'HLS'}]});
    return new Response('unavailable',{status:503});
  };
  const {resolveStreams}=await import('../src/worker.js');
  const streams=await resolveStreams(fixture,[],fetcher);
  assert.equal(streams.length,1);
  assert(streams[0].url.endsWith('/bayern-dortmund.m3u8'));
  assert(seen.some(x=>x.includes('sportsfree.highfly.to/stream/sport/one.json')));
});
