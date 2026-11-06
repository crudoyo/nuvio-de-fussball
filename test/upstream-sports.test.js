import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsCatalogRequests,forwardSportsStream} from '../src/upstream-sports.js';
import {resolveStreams} from '../src/worker.js';

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
