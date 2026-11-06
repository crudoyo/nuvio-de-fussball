import test from 'node:test';
import assert from 'node:assert/strict';
import {espnScoreboardUrl, normalizeEspnEvents} from '../src/international.js';
import {badgeData, badgeImageUrl, makeMatchPoster} from '../src/graphics.js';
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
  assert(data.metas[0].poster.includes('/poster/uel/551122.png'));
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
  const source='https://sports.highfly.to/manifest.json';
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
  assert.equal(result.length,1); // identical stream URLs from multiple providers are deduplicated
  assert(result.every(s=>s.url.startsWith('https:')));
  assert(result.every(s=>!s.infoHash));
});


test('raw Wikimedia SVG club crests are converted into embeddable 240px PNG thumbnails',async()=>{
  const original='https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg';
  const thumbnail=badgeImageUrl(original);
  assert.equal(thumbnail,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Borussia_Dortmund_logo.svg/240px-Borussia_Dortmund_logo.svg.png');
  assert.equal(badgeImageUrl(
    'https://upload.wikimedia.org/wikipedia/en/thumb/0/04/RB_Leipzig_2014_logo.svg/800px-RB_Leipzig_2014_logo.svg.png'
  ),'https://upload.wikimedia.org/wikipedia/en/thumb/0/04/RB_Leipzig_2014_logo.svg/240px-RB_Leipzig_2014_logo.svg.png');
  const img=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const called=[];
  const fetcher=async (url,options)=>{
    called.push(String(url));
    assert.equal(options.redirect,'manual');
    return new Response(img,{headers:{'content-type':'image/png'}});
  };
  const output=await badgeData(original,fetcher);
  assert(output.startsWith('data:image/png;base64,'));
  assert.deepEqual(called,[thumbnail]);
});
test('badge fetch follows only same-host redirects, keeping fallback on cross-host redirects',async()=>{
  const img=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const source='https://assets.example.com/team-green.png';
  const seen=[];
  const data=await badgeData(source, async (url,options)=>{
    seen.push(String(url));
    assert.equal(options.redirect,'manual');
    if(seen.length===1)return new Response(null,{
      status:302,headers:{location:'/logos/team-green-final.png'}
    });
    return new Response(img,{headers:{'content-type':'image/png'}});
  });
  assert(data.startsWith('data:image/png;base64,'));
  assert.deepEqual(seen,[source,'https://assets.example.com/logos/team-green-final.png']);
  let requests=0;
  const blocked=await badgeData('https://assets.example.com/team-crossdomain.png',async()=>{
    requests++;
    return new Response(null,{status:302,headers:{location:'https://other.example.com/image.png'}});
  });
  assert.equal(blocked,null);
  assert.equal(requests,1);
});
