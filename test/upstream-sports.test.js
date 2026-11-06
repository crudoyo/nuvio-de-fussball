import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsCatalogRequests,forwardSportsStream} from '../src/upstream-sports.js';
import {resolveStreams,matchScore,diagnoseSources} from '../src/worker.js';

const game={
  matchDateTimeUTC:'2026-11-06T20:30:00Z',
  team1:{teamName:'FC Bayern München'},
  team2:{teamName:'Borussia Dortmund'}
};
const manifest='https://example.org/manifest.json';
const json=(obj,status=200)=>new Response(JSON.stringify(obj),
  {status,headers:{'content-type':'application/json'}});

test('searches advertised football catalogs, not replay or TV network hubs',()=>{
  const requests=sportsCatalogRequests({catalogs:[
    {type:'tv',id:'nuvio_sports_replays_football',name:'Football Replays'},
    {type:'tv',id:'nuvio_sports_networks',name:'24/7 TV'},
    {type:'tv',id:'nuvio_sports_live',name:'Live Now'},
    {type:'tv',id:'nuvio_sports_football',name:'Soccer',
      extra:[{name:'search',isRequired:false}]},
    {type:'tv',id:'nuvio_sports_upcoming',name:'Upcoming'},
    {type:'movie',id:'movies',name:'Movies'}
  ]},game);
  assert.equal(requests[0].catalog,'nuvio_sports_football');
  assert(requests.some(r=>r.path.endsWith('/search=FC%20Bayern%20M%C3%BCnchen.json')));
  assert(requests.some(r=>r.path.endsWith('/search=Borussia%20Dortmund.json')));
  assert(requests.some(r=>r.catalog==='nuvio_sports_live'));
  assert(!requests.some(r=>/replay|networks|movies/.test(r.catalog)));
  const crowded=sportsCatalogRequests({catalogs:[
    {type:'tv',id:'nuvio_sports_football',name:'Soccer',extra:[{name:'search'}]},
    ...['american_football','basketball','cricket','motorsport','hockey','rugby','golf','tennis'].map(id=>
      ({type:'tv',id:'nuvio_sports_'+id,name:id,extra:[{name:'search'}]})),
    {type:'tv',id:'nuvio_sports_live',name:'Live Now'},
    {type:'tv',id:'nuvio_sports_upcoming',name:'Upcoming'}
  ]},game);
  assert.equal(crowded.length,5);
  assert.deepEqual([...new Set(crowded.map(r=>r.catalog))],['nuvio_sports_football','nuvio_sports_live','nuvio_sports_upcoming']);
});

test('forwards the exact Nuvio Live Sports player headers and notWebReady=false',()=>{
  const hints={notWebReady:false,proxyHeaders:{request:{
    Referer:'https://example.org/',Origin:'https://example.org',
    'User-Agent':'Original player'
  }},bingeGroup:'upstream'};
  const upstream={name:'⚡ Direct Stream',url:'https://example.org/api/manifest?sid=abc',
    behaviorHints:hints,description:'HLS as resolved by provider',subtitles:[{id:'de',lang:'de',url:'https://example.org/sub.vtt'}]};
  const result=forwardSportsStream(upstream,manifest,'Nuvio Live Sports');
  assert.strictEqual(result.url,upstream.url);
  assert.deepEqual(result.behaviorHints,hints);
  assert.deepEqual(result.subtitles,upstream.subtitles);
  assert.equal(result.name,'Nuvio Live Sports · ⚡ Direct Stream');
  assert.deepEqual(upstream.behaviorHints,hints); // source object not changed
});

test('resolves only relative browser fallbacks against their original addon',()=>{
  const browser=forwardSportsStream({externalUrl:'/watch?id=abc',name:'Web'},
    manifest,'Nuvio Live Sports');
  assert.equal(browser.externalUrl,'https://example.org/watch?id=abc');
  assert.match(browser.name,/^Browser · /);
  assert.equal(forwardSportsStream({externalUrl:'/watch'},manifest,'Sport',false),null);
  assert.equal(forwardSportsStream({infoHash:'x',url:'https://example.org/a'},
    manifest,'Sport'),null);
  assert.equal(forwardSportsStream({url:'magnet:?xt=abc'},manifest,'Sport'),null);
});

test('finds an event using the existing addon search and forwards its native relay unchanged',async()=>{
  const direct='https://example.org/api/manifest?stream=abc123';
  const hints={notWebReady:false,proxyHeaders:{request:{Referer:'https://example.org'}}};
  const called=[];
  const mock=async url=>{
    const u=String(url);called.push(u);
    if(u===manifest)return json({name:'Nuvio Live Sports',catalogs:[
      {type:'tv',id:'nuvio_sports_football',name:'Soccer',extra:[{name:'search'}]}
    ]});
    if(u.endsWith('/catalog/tv/nuvio_sports_football.json'))return json({metas:[]});
    if(u.includes('/catalog/tv/nuvio_sports_football/search='))return json({metas:[
      {id:'nuvio_sport_match123',type:'tv',
       name:'🔴 LIVE: FC Bayern München vs Borussia Dortmund',
       released:'2026-11-06T20:30:00Z'}
    ]});
    if(u.endsWith('/stream/tv/nuvio_sport_match123.json'))
      return json({streams:[{name:'⚡ Direct Stream',url:direct,behaviorHints:hints}]});
    return json({},404);
  };
  const streams=await resolveStreams(game,[manifest],mock,{});
  assert(called.some(s=>s.includes('search=FC%20Bayern')));
  assert.equal(streams.length,1);
  assert.equal(streams[0].url,direct);
  assert.deepEqual(streams[0].behaviorHints,hints);
});

const womenGame={
  matchDateTimeUTC:'2026-11-06T17:30:00Z',
  team1:{teamName:'FC Bayern München Frauen'},
  team2:{teamName:'SV Werder Bremen Frauen'}
};
const womenEvent={
  id:'nuvio_sport_dlv_event_bayern_bremen',type:'tv',
  name:'🔴 LIVE: Bayern vs Werder Bremen',released:'2026-11-06T17:30:00Z',
  description:'🏆 League: Frauen-Bundesliga\n📅 Category: FOOTBALL'
};

test('requires both club identities even when every event contains Frauen or Women',()=>{
  assert(matchScore(womenGame,womenEvent)>=12);
  for(const name of ['Frauen-Bundesliga: Frankfurt vs Leverkusen',
    'Frauen-Bundesliga: Bayern vs Köln','Frauen-Bundesliga: Essen vs Werder Bremen']){
    assert.equal(matchScore(womenGame,{...womenEvent,name}),-1,name);
  }
  const english={...womenGame,team1:{teamName:'Bayern Munich Women'},team2:{teamName:'Werder Bremen Women'}};
  assert.equal(matchScore(english,{name:'Women Bundesliga: Frankfurt vs Leverkusen'}),-1);
  assert(matchScore(english,womenEvent)>=12);
});

test('the default source uses the announced Nuvio Live Sports domain and keeps its native streams',async()=>{
  const origin='https://nuviosports.xyz',seen=[];
  const hints={notWebReady:false,bingeGroup:'original-match',proxyHeaders:{request:{Referer:origin+'/'}}};
  const direct=origin+'/api/manifest.m3u8?sid=public-test-value';
  const sourceStream={name:'⚡ Direct Stream',title:'DaddyLive | Magenta Sport 303',url:direct,behaviorHints:hints};
  const mock=async url=>{
    const u=String(url);seen.push(u);
    if(u===origin+'/manifest.json')return json({name:'🏆 Nuvio Live Sports',types:['tv'],resources:['stream'],
      catalogs:[{type:'tv',id:'nuvio_sports_football',name:'Soccer',extra:[{name:'search'}]}]});
    if(u.startsWith(origin+'/catalog/tv/nuvio_sports_football'))return json({metas:[
      {...womenEvent,id:'wrong-women-match',name:'🔴 LIVE: Frankfurt vs Leverkusen'},womenEvent
    ]});
    if(u===origin+'/stream/tv/'+womenEvent.id+'.json')return json({streams:[sourceStream]});
    return json({},404);
  };
  const streams=await resolveStreams(womenGame,[],mock,{});
  assert.equal(streams.length,1);
  assert.equal(streams[0].url,direct);
  assert.equal(streams[0].externalUrl,undefined);
  assert.deepEqual(streams[0].behaviorHints,hints);
  assert(!seen.some(url=>url.includes('nuvio.moaqeel6679.my.id')));
  assert(!seen.some(url=>url.endsWith('/stream/tv/wrong-women-match.json')));
  const report=await diagnoseSources([],mock,{});
  assert(report.some(p=>p.name==='Nuvio Live Sports'&&p.reachable&&p.hasStreamResource));
});

test('failed addon responses release their bodies before native playback requests continue',async()=>{
  const rejected=[],cancelled=[];
  const mock=async url=>{
    if(String(url).endsWith('/manifest.json')){
      rejected.push(String(url));
      return new Response(new ReadableStream({
        start(controller){controller.enqueue(new TextEncoder().encode('Denied'));},
        cancel(){cancelled.push(String(url));}
      }),{status:403});
    }
    return new Response('',{status:404});
  };
  await diagnoseSources([],mock,{});
  assert(rejected.length>=3); // Other manifests may already be cached.
  assert.deepEqual(cancelled.sort(),rejected.sort());
});
