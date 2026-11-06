import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStreams} from '../src/worker.js';

test('a cold source lookup leaves room for native Daddy playback within 50 Worker subrequests',async()=>{
  const previous=globalThis.caches;let calls=0,tokenCalls=0;
  const take=()=>{if(++calls>50)throw new TypeError('Too many subrequests by single Worker invocation');};
  globalThis.caches={default:{async match(){take();},async put(){take();}}};
  const now=new Date(),time=now.toISOString().slice(11,16);
  const day=`${now.getUTCDate()} ${now.toLocaleString('en-US',{month:'long',timeZone:'UTC'})} ${now.getUTCFullYear()}`;
  const fixture={matchDateTimeUTC:now.toISOString(),team1:{teamName:'Bayern'},team2:{teamName:'Bremen'}};
  const html=`<section class="schedule__day"><h3 class="schedule__dayTitle">${day} - Schedule Time UK GMT</h3>
    <div class="schedule__category"><div class="card__meta">All Soccer Events</div>
    <div class="schedule__event"><div class="schedule__time">${time}</div><h4 class="schedule__eventTitle">Bayern vs Bremen</h4>
    <div class="schedule__channels"><a href="/watch.php?id=11">Magenta Sport 303</a><a href="/watch.php?id=426">DAZN1 DE</a></div></div></div></section>`;
  const source='https://nuviosports.xyz',edge='https://edge.wedd48c.top';
  const fetcher=async(raw,options)=>{
    take();const url=String(raw);
    if(url===source+'/manifest.json')return Response.json({name:'Sports',catalogs:[
      {type:'tv',id:'football',name:'Soccer',extra:[{name:'search'}]},
      ...['american_football','basketball','cricket','motorsport','hockey','rugby','golf','tennis'].map(id=>({type:'tv',id,name:id,extra:[{name:'search'}]})),
      {type:'tv',id:'live',name:'Live Now'},{type:'tv',id:'upcoming',name:'Upcoming'}
    ]});
    if(url.startsWith(source+'/catalog/'))return Response.json({metas:[{id:'event',type:'tv',name:'Bayern vs Bremen',released:now.toISOString()}]});
    if(url===source+'/stream/tv/event.json')return Response.json({streams:[{url:'https://media.example.org/direct.m3u8'}]});
    if(url==='https://thedaddy.li/')return new Response(html);
    const wrapper=/^https:\/\/thedaddy.li\/stream\/stream-(11|426)\.php$/.exec(url);
    if(wrapper)return new Response(`<iframe id="thatframe" src="https://dembed.st/premiumtv/daddy.php?id=${wrapper[1]}"></iframe>`);
    const embed=/^https:\/\/dembed.st\/premiumtv\/daddy.php\?id=(11|426)$/.exec(url);
    if(embed)return new Response(`const SRC="${edge}/premium${embed[1]}/index.m3u8";const EDGE="${edge}";const CHANNEL="premium${embed[1]}";fetch('/api/playlist-token?slug=');`);
    if(url.startsWith(edge+'/api/playlist-token?slug=premium')){tokenCalls++;return Response.json({token:'public-test-value',ttl:120});}
    if(url.startsWith(edge+'/premium'))return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts');
    return new Response('',{status:403});
  };
  try{
    const streams=await resolveStreams(fixture,[],fetcher,{DADDY_NATIVE_RESOLVE:'true'},undefined,{playbackOrigin:'https://addon.example.org'});
    assert(streams.some(s=>s.url?.includes('/daddy/live/426.m3u8')),'native playback must survive the full concurrent source query');
    assert(streams.some(s=>s.url?.includes('/daddy/live/11.m3u8')));
    assert(streams.some(s=>s.url==='https://media.example.org/direct.m3u8'));
    assert.equal(tokenCalls,0,'the selected HLS endpoint owns token requests, not the stream listing');
    assert(calls<=40,`leave headroom for fixture requests: used ${calls}/50`);
  }finally{globalThis.caches=previous;}
});
