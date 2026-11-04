import test from 'node:test';
import assert from 'node:assert/strict';
import {espnScoreboardUrl, normalizeEspnEvents} from '../src/international.js';
import {badgeData, makeMatchPoster} from '../src/graphics.js';
import {handle, resolveStreams} from '../src/worker.js';

const soon = new Date(Date.now()+2*86400000);
const match = {
  matchID: 551122, matchDateTimeUTC:soon.toISOString(), matchIsFinished:false,
  team1:{teamName:'FC Bayern München'},team2:{teamName:'Borussia Dortmund'}
};
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
function espnEvent() {
  return {id:'551122',date:soon.toISOString(),status:{type:{completed:false}},competitions:[{
    competitors:[
      {homeAway:'home',team:{displayName:'Bayern Munich',logo:'https://a.espncdn.com/i/teamlogos/soccer/500/132.png'}},
      {homeAway:'away',team:{displayName:'Borussia Dortmund',logos:[{href:'https://a.espncdn.com/i/teamlogos/soccer/500/124.png'}]}}
    ]
  }]};
}
test('European cup endpoints use ESPN range queries without an API key',()=>{
  assert(espnScoreboardUrl('uel').includes('uefa.europa/scoreboard?dates='));
  assert(espnScoreboardUrl('uecl').includes('uefa.europa.conf/scoreboard?dates='));
  assert.equal(espnScoreboardUrl('ucl'),null); // OpenLigaDB handles Champions League
});
test('ESPN metadata is normalized into match model, including team crests',()=>{
  const out=normalizeEspnEvents({events:[espnEvent()]});
  assert.equal(out.length,1);
  assert.equal(out[0].matchID,551122);
  assert.equal(out[0].team1.teamName,'Bayern Munich');
  assert(out[0].team2.teamIconUrl.endsWith('/124.png'));
});
test('all UEFA competitions are exposed and international catalogs deliver matches',async()=>{
  const fetcher=async (url, options)=>{
    assert.equal(options?.redirect,'manual');
    const u=String(url);
    if(u.includes('/getavailableleagues/2026')) return json([]);
    if(u.includes('uefa.europa/scoreboard')||u.includes('uefa.europa.conf/scoreboard'))
      return json({events:[espnEvent()]});
    return json([]);
  };
  const manifest=await handle(new Request('https://test.workers.dev/manifest.json'),{SEASON:'2026'},fetcher);
  const m=await manifest.json();
  for(const id of ['defootball_ucl','defootball_uel','defootball_uecl'])
    assert(m.catalogs.some(c=>c.id===id),id);
  const catalog=await handle(new Request('https://test.workers.dev/catalog/tv/defootball_uel.json'),{SEASON:'2026'},fetcher);
  const data=await catalog.json();
  assert.equal(data.metas.length,1);
  assert(data.metas[0].poster.includes('/poster/uel/551122.svg'));
});
test('embedded club badge images and fallback abbreviations render in SVG cards',async()=>{
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const image=async()=>new Response(bytes,{headers:{'content-type':'image/png'}});
  const matchWithLogo={...match,team1:{...match.team1,teamIconUrl:'https://example.org/team.png'}};
  const art=await makeMatchPoster(matchWithLogo,{name:'Champions League'},'04.11., 21:00 Uhr','Heute',image);
  assert(art.startsWith('<svg'));
  assert(art.includes('data:image/png;base64,'));
  assert(art.includes('Champions League'));
  assert(art.includes('Borussia Dortmund')||art.includes('Borussia Dortm'));
  assert(!art.includes('undefined'));
  assert.equal(await badgeData('http://localhost/private.png',image),null);
});
test('public Sports Streams plus configured sports manifest can be bridged without torrents',async()=>{
  const source='https://sports.highfly.dev/manifest.json';
  const personal='https://personal.example/manifest.json';
  const sources=[source,personal];
  const fetcher=async url=>{
    const u=String(url);
    if(sources.includes(u))return json({name:u===source?'Sports Streams':'Nuvio Live Sports',
      catalogs:[{id:'football',name:'Football',type:'sport'}]});
    if(sources.some(s=>u===s.replace('manifest.json','catalog/sport/football.json')))
      return json({metas:[{id:'evt1',name:'Bayern Munich versus Borussia Dortmund'}]});
    if(sources.some(s=>u===s.replace('manifest.json','stream/sport/evt1.json')))
      return json({streams:[
        {name:'HLS',url:'https://media.example/live.m3u8'},
        {infoHash:'abcde1234567890'},
        {url:'magnet:?xt=urn:btih:test'}
      ]});
    return new Response('not found',{status:404});
  };
  const result=await resolveStreams(match,[personal],fetcher);
  assert.equal(result.length,2); // one per provider, duplicated URL dedupes below
  assert(result.every(s=>s.url.startsWith('https:')));
  assert(result.every(s=>!s.infoHash));
});
