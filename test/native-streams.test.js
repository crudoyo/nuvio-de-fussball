import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publicMediaUrl,cleanMediaHeaders,nativeStreamRecord,
  nativeMappedStreams,nativeAddonStream
} from '../src/native-streams.js';
import {matchScore,resolveStreams} from '../src/worker.js';

const fixture={
  matchDateTimeUTC:'2026-11-04T20:00:00Z',
  team1:{teamName:'Borussia Dortmund'},team2:{teamName:'Real Betis'}
};
const events=[{name:'UEFA Champions League : Borussia Dortmund vs Real Betis',
  startTime:'2026-11-04T20:00:00.000Z',
  channels:[{id:'426',name:'Example Sport DE'}]}];
const url='https://cdn.example.org/live/master.m3u8';
test('only public HTTPS media URLs count as native, not PHP player pages',()=>{
  assert.equal(publicMediaUrl(url),url);
  assert.equal(publicMediaUrl('https://cdn.example.org/live/index.mpd'),
    'https://cdn.example.org/live/index.mpd');
  for(const bad of [
    'http://cdn.example.org/live/master.m3u8',
    'https://thedaddy.pk/stream/stream-426.php',
    'https://localhost/live/a.m3u8',
    'https://127.0.0.1/live/a.m3u8',
    'https://admin:pass@cdn.example.org/live/master.m3u8',
    'https://cdn.example.org/live/master.m3u8?token=secret',
    'https://cdn.example.org/live/master.m3u8#private'
  ])assert.equal(publicMediaUrl(bad),null,bad);
});
test('request headers allow only safe client-side playback hints',()=>{
  assert.deepEqual(cleanMediaHeaders({
    'referer':'https://portal.example.org/',origin:'https://portal.example.org',
    'User-Agent':'Example Player',
    'Authorization':'Bearer secret','Cookie':'private=1',
    'X-Extra-Header':'ignored',
    'Range':'bytes=0-'
  }),{
    Referer:'https://portal.example.org/',Origin:'https://portal.example.org',
    'User-Agent':'Example Player'
  });
  assert.deepEqual(cleanMediaHeaders({Referer:'http://example.org/',
    Origin:'https://localhost/', 'User-Agent':'ok\r\nX-Evil: test'}),{});
});
test('native channel ID maps to direct HLS without replacing HTML players',()=>{
  const env={NATIVE_CHANNEL_STREAMS_JSON:JSON.stringify({
    '426':{name:'Mein freier Stream',url,
      headers:{Referer:'https://portal.example.org/'}}
  })};
  const s=nativeMappedStreams(fixture,events,matchScore,env);
  assert.equal(s.length,1);
  assert.equal(s[0].url,url);
  assert.equal(s[0].externalUrl,undefined);
  assert.equal(s[0].behaviorHints.notWebReady,true);
  assert.equal(s[0].behaviorHints.proxyHeaders.request.Referer,
    'https://portal.example.org/');
  assert(!JSON.stringify(s).includes('token='));
});
test('invalid mappings are rejected and do not leak secrets',()=>{
  const env={NATIVE_CHANNEL_STREAMS_JSON:JSON.stringify({
    '426':{url:'https://cdn.example.org/live/master.m3u8?access_token=private',
      headers:{Authorization:'Bearer secret'}}
  })};
  assert.deepEqual(nativeMappedStreams(fixture,events,matchScore,env),[]);
  assert.deepEqual(nativeMappedStreams(fixture,events,matchScore,{
    NATIVE_CHANNEL_STREAMS_JSON:'{broken'
  }),[]);
});
test('already provided direct upstream streams gain Stremio-native HLS hint',()=>{
  const input={url,name:'HLS',behaviorHints:{proxyHeaders:{request:{
    Referer:'https://portal.example.org/'
  }}}};
  const output=nativeAddonStream(input);
  assert.equal(output.behaviorHints.notWebReady,true);
  assert.deepEqual(output.behaviorHints.proxyHeaders,input.behaviorHints.proxyHeaders);
  assert.equal(nativeAddonStream({url:'https://provider.example/watch.php'}).behaviorHints,undefined);
});
test('the stream endpoint returns native HLS first and external HTML fallback',async()=>{
  const day='Wednesday 4th November 2026 - Schedule Time UK GMT';
  const schedule={[day]:{Soccer:[{
    time:'20:00',event:'UEFA Champions League : Borussia Dortmund vs Real Betis',
    channels:[{channel_id:'426',channel_name:'Example Sport DE'}]
  }]}};
  const config={NATIVE_CHANNEL_STREAMS_JSON:JSON.stringify({
    '426':{name:'Direktes HLS',url}
  }),DADDY_WEB_PLAYERS:'true'};
  const fake=async requestUrl=>{
    if(String(requestUrl).includes('/schedule/schedule-generated.json'))
      return new Response(JSON.stringify(schedule),
        {headers:{'content-type':'application/json'}});
    return new Response('not available',{status:404});
  };
  const streams=await resolveStreams(fixture,[],fake,config);
  assert.equal(streams.length,2);
  assert.equal(streams[0].url,url);
  assert.equal(streams[0].behaviorHints.notWebReady,true);
  assert.equal(streams[1].externalUrl,
    'https://thedaddy.pk/stream/stream-426.php');
});
