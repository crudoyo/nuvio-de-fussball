import test from 'node:test';
import assert from 'node:assert/strict';
import {manifestKind,checkNativeManifest,verifiedNativeStreams} from '../src/manifest-check.js';
const hls='#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n';
const dash='<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period/></MPD>';
const stream={url:'https://cdn.example.org/live.m3u8',behaviorHints:{proxyHeaders:{request:{Referer:'https://portal.example.org/',Cookie:'private'}}}};
test('recognizes entry manifests without treating HTML or arbitrary text as media',()=>{
  assert.equal(manifestKind(hls),'hls');assert.equal(manifestKind(dash),'dash');
  assert.equal(manifestKind('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nchild.m3u8'),'hls');
  for(const text of ['<html>#EXTM3U</html>','#EXTM3U','not media'])assert.equal(manifestKind(text),null);
});
test('uses bounded public requests with supported playback headers',async()=>{
  assert.equal(await checkNativeManifest(stream,async(url,options)=>{
    assert.equal(url,stream.url);assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Referer,'https://portal.example.org/');
    assert.equal(options.headers.Cookie,undefined);assert(options.signal);
    return new Response(hls);
  }),true);
  assert.equal(await checkNativeManifest({url:'https://cdn.example.org/live.mpd'},async()=>new Response(dash)),true);
});
test('rejects HTML, wrong format, redirects, denied access, cookies and excessive bodies',async()=>{
  for(const response of [new Response('<html>player</html>'),new Response(dash),
    new Response('',{status:302,headers:{location:'https://other.example.org/a.m3u8'}}),
    new Response('',{status:403}),new Response(hls,{headers:{'set-cookie':'session=x'}}),
    new Response(hls,{headers:{'content-length':'999999'}}),new Response('x'.repeat(262145))])
    assert.equal(await checkNativeManifest(stream,async()=>response),false);
});
test('never requests PHP, private, signed or malformed addresses; failures stay isolated',async()=>{
  for(const url of ['https://cdn.example.org/player.php','https://localhost/a.m3u8',stream.url+'?token=secret'])
    assert.equal(await checkNativeManifest({url},()=>{throw new Error('must not fetch');}),false);
  assert.equal(await checkNativeManifest(stream,async()=>{throw new Error('offline');}),false);
  const other={url:'https://cdn.example.org/other.m3u8'};
  assert.deepEqual(await verifiedNativeStreams([stream,other],async url=>new Response(url===stream.url?hls:'denied')),[stream]);
});
