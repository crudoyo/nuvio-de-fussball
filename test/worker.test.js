import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handle, discoverLeagues, startTime, selectUpcoming, matchScore,
  encodeConfig, decodeConfig, manifestUrl, resolveStreams
} from '../src/worker.js';

const iso = new Date(Date.now() + 90 * 60_000).toISOString().replace(/Z$/, '');
const fixture = {
  matchID: 9876, matchDateTimeUTC: iso, matchIsFinished: false,
  team1: {teamName: 'FC Bayern München'}, team2: {teamName: 'Rot-Weiss Essen'}
};
const response = (x, status=200) => new Response(JSON.stringify(x), {
  status, headers: {'content-type': 'application/json'}
});
const upstream='https://sports.example/manifest.json';
const fetchMock=async url=>{
  const u=String(url);
  if(u==='https://api.openligadb.de/getavailableleagues/2026')
    return response([{leagueShortcut:'rlno',leagueName:'Regionalliga Nordost'}]);
  if(u==='https://api.openligadb.de/getmatchdata/bl1/2026') return response([fixture]);
  if(u.startsWith('https://api.openligadb.de/getmatchdata/')) return response([]);
  if(u===upstream) return response({name:'Sports Streams',catalogs:[
    {id:'football',name:'Football',type:'sport'}
  ]});
  if(u==='https://sports.example/catalog/sport/football.json')
    return response({metas:[{id:'evt1',name:'Bayern Munich vs RWE live'}]});
  if(u==='https://sports.example/stream/sport/evt1.json')
    return response({streams:[{url:'https://cdn.example/test.m3u8',name:'HLS'},{infoHash:'torrent'}]});
  return response({error:u},404);
};
const get=p=>handle(new Request('https://test.workers.dev'+p),{SEASON:'2026'},fetchMock);

test('competition catalog discovery',()=>{
  const leagues=discoverLeagues([{leagueShortcut:'rlno',leagueName:'Regionalliga Nordost'}]);
  assert(leagues.some(x=>x.shortcut==='rlno'));
  assert(leagues.some(x=>x.shortcut==='dfb'));
});
test('kickoff and 30-day window',()=>{
  assert.equal(startTime(fixture).toISOString().replace(/Z$/,''),iso);
  assert.equal(selectUpcoming([fixture]).length,1);
});
test('manifest validation, configuration and fixture match',()=>{
  assert.equal(manifestUrl(upstream),upstream);
  assert.equal(manifestUrl('http://127.0.0.1/manifest.json'),null);
  assert.deepEqual(decodeConfig(encodeConfig([upstream])),[upstream]);
  assert(matchScore(fixture,{name:'Bayern Munich vs RWE live'})>=10);
  assert.equal(matchScore(fixture,{name:'Hamburg vs Dortmund'}),-1);
});
test('configuration, league, match and SVG endpoints',async()=>{
  let r=await get('/configure');assert.equal(r.status,200);
  r=await get('/manifest.json');assert((await r.json()).catalogs.some(x=>x.id==='defootball_bl1'));
  r=await get('/catalog/tv/defootball_bl1.json');
  assert.equal((await r.json()).metas.length,1);
  r=await get('/meta/tv/defootball_bl1_9876.json');
  assert((await r.json()).meta.name.includes('Rot-Weiss Essen'));
  r=await get('/poster/bl1/9876.svg');
  assert.equal(r.status,200);
  assert((await r.text()).startsWith('<svg'));
});
test('streams are bridged, excluding torrent/P2P entries',async()=>{
  const streams=await resolveStreams(fixture,[upstream],fetchMock);
  assert.equal(streams.length,1);
  assert.equal(streams[0].url,'https://cdn.example/test.m3u8');
  const r=await get('/u/'+encodeConfig([upstream])+'/stream/tv/defootball_bl1_9876.json');
  assert.equal((await r.json()).streams.length,1);
});

test('native-only stream responses omit upstream browser links and keep direct media',async()=>{
  const direct='https://cdn.example/test.m3u8';
  const browser='https://sports.example/watch.php';
  const isolated='https://fallback.example/manifest.json';
  const fetcher=async url=>String(url)==='https://fallback.example/stream/sport/evt1.json'
    ?response({streams:[{externalUrl:browser},{url:direct,externalUrl:browser}]})
    :fetchMock(String(url).replace('https://fallback.example/','https://sports.example/'));
  const route='/u/'+encodeConfig([isolated])+'/stream/tv/defootball_bl1_9876.json';
  const result=await handle(new Request('https://test.workers.dev'+route),{SEASON:'2026',NATIVE_ONLY:'true'},fetcher);
  const {streams}=await result.json();
  assert.equal(result.status,200);
  assert.deepEqual(streams.map(stream=>stream.url),[direct]);
  assert.equal(streams[0].externalUrl,undefined);
  const withFallback=await handle(new Request('https://test.workers.dev'+route),{SEASON:'2026',NATIVE_ONLY:'false'},fetcher);
  const offered=(await withFallback.json()).streams;
  assert.equal(offered[0].url,direct);
  assert.equal(offered[0].externalUrl,undefined);
  assert.equal(offered[1].externalUrl,browser);
  assert.match(offered[1].name,/^Browser · /);
});

test('Cloudflare Worker requests use a supported redirect mode', async () => {
  const seen = [];
  const cloudflareFetch = async (url, options) => {
    if (!['manual', 'follow'].includes(options?.redirect)) {
      throw new TypeError('Cloudflare Workers supports only manual or follow redirects');
    }
    seen.push({url: String(url), redirect: options.redirect});
    if (String(url) === 'https://api.openligadb.de/getavailableleagues/2037') return response([]);
    if (String(url) === 'https://api.openligadb.de/getmatchdata/bl1/2037') return response([fixture]);
    return response([]);
  };
  const res = await handle(
    new Request('https://test.workers.dev/catalog/tv/defootball_bl1.json'),
    {SEASON: '2037'},
    cloudflareFetch
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).metas.length, 1);
  assert(seen.length >= 2);
  assert(seen.every(({redirect}) => redirect === 'manual'));
});
