import test from 'node:test';
import assert from 'node:assert/strict';
import {literalMedia,ordinarySegment,resolveDaddyChannel,automaticDaddyStreams} from '../src/daddy-native.js';
import {handle,VERSION,encodeConfig,resolveStreams} from '../src/worker.js';
import {readFile} from 'node:fs/promises';
const media='https://cdn.example.org/live.m3u8';
const master='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nchild.m3u8';
const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts';
const ts=new Uint8Array(376);ts[0]=ts[188]=0x47;
const game={matchDateTimeUTC:'2026-11-04T20:00:00Z',team1:{teamName:'Home'},team2:{teamName:'Away'}};
const events=[{name:'Home vs Away',startTime:game.matchDateTimeUTC,channels:[{id:'426',name:'Sport'}]}];
function network(overrides={}){
  return async (url,options)=>{
    assert.equal(options.redirect,'manual');assert(options.signal);
    if(Object.hasOwn(overrides,url))return overrides[url](options);
    if(url==='https://thedaddy.pk/stream/stream-426.php')return new Response('<script>const SRC="'+media+'";</script>');
    if(url===media)return new Response(master);
    if(url==='https://cdn.example.org/child.m3u8')return new Response(playlist);
    if(url==='https://cdn.example.org/seg.ts'){
      assert.equal(options.headers.Range,'bytes=0-4095');
      return new Response(ts,{status:206});
    }
    return new Response('',{status:404});
  };
}
test('reads literal media and explicit Base64 data expressions without executing page functions',()=>{
  assert.equal(literalMedia('const SRC="'+media+'";'),media);
  assert.equal(literalMedia('file:"https:\\/\\/cdn.example.org/live.m3u8"'),media);
  const encoded=btoa(media);
  assert.equal(literalMedia(`const a='${encoded}';const video=atob(a);source:{src:video,type:'hls'}`),media);
  assert.equal(literalMedia(`function decode(v){return atob(v);}const a='${encoded}';const video=decode(a);source:{src:video,type:'hls'}`),media);
  assert.equal(literalMedia(`const a='${encoded}';const video=evil(a);source:{src:video,type:'hls'}`),null);
  for(const url of [media+'?token=private',media+'?t=private','https://localhost/a.m3u8','https://thedaddy.pk/player.php'])
    assert.equal(literalMedia('const SRC="'+url+'";'),null);
});
test('automatic HLS resolves master, media playlist and ordinary TS with native headers',async()=>{
  const result=await resolveDaddyChannel('426',network());
  assert.equal(result.status,'resolved');assert.equal(result.stream.url,media);
  assert.equal(result.stream.externalUrl,undefined);
  assert.equal(result.stream.behaviorHints.proxyHeaders.request.Referer,'https://thedaddy.pk/');
  assert.equal(result.stream.behaviorHints.proxyHeaders.request.Origin,'https://thedaddy.pk');
  assert.equal(result.stream.behaviorHints.notWebReady,true);
});
test('follows named provider iframe while ignoring ads and allows offered same-channel alternative',async()=>{
  const root='https://thedaddy.pk/stream/stream-426.php';
  const fallback='https://thedaddy.pk/cast/stream-426.php';
  const packed='https://dembed.st/player/426';
  const result=await resolveDaddyChannel('426',network({
    [root]:()=>new Response(`<iframe src="https://ad.example.org/"></iframe><iframe src="${packed}" id="playerFrame"></iframe><button data-url="${fallback}">Player</button>`),
    [packed]:()=>new Response('const SRC="'+media+'";'),
    [fallback]:()=>new Response('const SRC="'+media+'";')
  }));
  assert.equal(result.status,'resolved');
});
test('provider transport requirements never trigger a playlist-token request',async()=>{
  const seen=[];
  const fake=async(url,options)=>{seen.push(url);return url.includes('thedaddy.pk')
    ?new Response('<iframe id="thatframe" src="https://dembed.st/player/426"></iframe>')
    :new Response('const SRC="'+media+'";');};
  const result=await resolveDaddyChannel('426',fake);
  assert.equal(result.status,'provider_transport_required');assert.equal(result.stream,null);
  assert.equal(seen.length,2);assert(seen.every(u=>!u.includes('playlist-token')));
});
test('an incompatible manifest does not hide an offered same-channel hub player',async()=>{
  const root='https://thedaddy.pk/stream/stream-426.php';
  const hub='https://thedaddy.pk/hub/stream-426.php';
  const bad='https://cdn.example.org/unusable.m3u8';
  const result=await resolveDaddyChannel('426',network({
    [root]:()=>new Response(`<script>const SRC="${bad}";</script><button data-url="${hub}">Player</button>`),
    [bad]:()=>new Response('<html>unavailable</html>'),
    [hub]:()=>new Response(`const SRC="${media}";`)
  }));
  assert.equal(result.status,'resolved');
  assert.equal(result.stream.url,media);
});
test('known custom frames do not consume the standard-player page budget',async()=>{
  const folders=['cast','watch','plus','casting','player'];
  const root='https://thedaddy.pk/stream/stream-426.php';
  const overrides={[root]:()=>new Response('<iframe id="thatframe" src="https://dembed.st/primary"></iframe>'+
    folders.map(folder=>`<button data-url="https://thedaddy.pk/${folder}/stream-426.php">Player</button>`).join(''))};
  for(const folder of folders)overrides[`https://thedaddy.pk/${folder}/stream-426.php`]=()=>new Response(folder==='player'
    ?'const SRC="'+media+'";':`<iframe id="thatframe" src="https://dembed.st/${folder}"></iframe>`);
  const base=network(overrides);
  const result=await resolveDaddyChannel('426',async(url,options)=>{
    assert(!url.includes('dembed.st'));return base(url,options);
  });
  assert.equal(result.status,'resolved');assert.equal(result.stream.url,media);
});
test('refuses denied access and unsafe redirects without forwarding credentials',async()=>{
  for(const [response,status] of [
    [new Response('',{status:403}),'access_denied'],
    [new Response('',{status:302,headers:{location:'https://unknown.example.org/'}}),'redirect_not_supported']
  ]){
    let requests=0;
    const result=await resolveDaddyChannel('426',async()=>{requests++;return response;});
    assert.equal(result.status,status);assert.equal(requests,1);
    assert(!JSON.stringify(result).includes('private'));
  }
});
test('ignores optional cookies but never sends them or works around denied media access',async()=>{
  const base=network({'https://thedaddy.pk/stream/stream-426.php':()=>new Response('const SRC="'+media+'";',
    {headers:{'set-cookie':'tracking=private'}})});
  const cookieFree=async(url,options)=>{
    assert(!Object.keys(options.headers).some(k=>/cookie|authorization/i.test(k)));
    return base(url,options);
  };
  assert.equal((await resolveDaddyChannel('426',cookieFree)).status,'resolved');
  const denied=async(url,options)=>url===media?new Response('',{status:403}):cookieFree(url,options);
  assert.equal((await resolveDaddyChannel('426',denied)).status,'access_denied');
});
test('does not advertise HTML, packed segments, encrypted playlists or DASH as automatic native HLS',async()=>{
  for(const [url,body,status] of [
    [media,'<html>Player</html>','unsupported_manifest'],
    ['https://cdn.example.org/seg.ts',new Uint8Array([137,80,78,71,13,10,26,10]),'unsupported_segment_container'],
    ['https://cdn.example.org/child.m3u8',playlist+'\n#EXT-X-KEY:METHOD=AES-128,URI="key"','encrypted_playlist']
  ]){
    const result=await resolveDaddyChannel('426',network({[url]:()=>new Response(body)}));
    assert.equal(result.status,status);assert.equal(result.stream,null);
  }
  assert.equal((await resolveDaddyChannel('426',async()=>new Response('const SRC="https://cdn.example.org/live.mpd";'))).status,'dash_requires_configured_source');
});
test('rejects excessive page bodies and invalid channel IDs',async()=>{
  assert.equal((await resolveDaddyChannel('0',()=>{throw new Error('must not fetch');})).status,'invalid_channel');
  assert.equal((await resolveDaddyChannel('426',async()=>new Response('x'.repeat(4*1024*1024+1)))).status,'response_too_large');
});
test('handles large current player pages without increasing manifest limits',async()=>{
  const root='https://thedaddy.pk/stream/stream-426.php';
  const result=await resolveDaddyChannel('426',network({[root]:()=>new Response(' '.repeat(300000)+'const SRC="'+media+'";')}));
  assert.equal(result.status,'resolved');
  const largeManifest=await resolveDaddyChannel('426',network({[media]:()=>new Response(' '.repeat(262145))}));
  assert.equal(largeManifest.status,'response_too_large');
});
test('native availability diagnostic omits source URLs and never claims device playback',async()=>{
  const r=await handle(new Request('https://addon.example.org/debug/daddy-native/426.json'),{},network());
  const diagnostic=await r.json();
  assert.equal(diagnostic.nativeAvailable,true);assert.equal(diagnostic.devicePlaybackVerified,false);
  assert.equal(diagnostic.status,'resolved');assert(!JSON.stringify(diagnostic).includes(media));
});
test('automatic resolution is gated, matches schedule channels and returns native streams',async()=>{
  assert.deepEqual(await automaticDaddyStreams(game,events,()=>15,{},()=>{throw new Error('disabled');}),[]);
  const streams=await automaticDaddyStreams(game,events,()=>15,{DADDY_NATIVE_RESOLVE:'true'},network());
  assert.equal(streams.length,1);assert.equal(streams[0].url,media);
});
test('segment sniffing rejects HTML and image containers',()=>{
  assert(ordinarySegment(ts));
  assert(ordinarySegment(new Uint8Array([0,0,0,8,102,116,121,112])));
  assert(!ordinarySegment(new TextEncoder().encode('<html>not video</html>')));
});
test('package, manifest and health expose the same new version and capability switches',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const get=p=>handle(new Request('https://addon.example.org'+p),{DADDY_NATIVE_RESOLVE:'true',NATIVE_VERIFY_MANIFESTS:'true'},async()=>new Response('[]'));
  assert.notEqual(VERSION,'0.4.5');assert.equal(pkg.version,VERSION);
  const health=await(await get('/health')).json();assert.equal(health.version,VERSION);
  assert.equal(health.nativePlayback.automaticPublicHls,true);assert.equal(health.nativePlayback.packedSegments,false);
  const manifest=await(await get('/manifest.json')).json();assert.equal(manifest.version,VERSION);
  assert.equal((await get('/u/'+encodeConfig([])+'/configure')).status,200);
});
test('automatic HLS appears before external fallbacks in the actual stream handler',async()=>{
  const when=new Date(Date.now()+3600000),time=when.toISOString().slice(11,16),date=when.toISOString().slice(0,10);
  const fixture={team1:{teamName:'Borussia Dortmund'},team2:{teamName:'Real Betis'},matchDateTimeUTC:when.toISOString()};
  const schedule={[date]:{Soccer:[{time,event:'Borussia Dortmund vs Real Betis',channels:[{channel_id:'426',channel_name:'Sport'}]}]}};
  const transport=network();
  const fake=async(url,options)=>url.includes('schedule-generated.json')?new Response(JSON.stringify(schedule)):transport(url,options);
  const streams=await resolveStreams(fixture,[],fake,{DADDY_NATIVE_RESOLVE:'true',DADDY_WEB_PLAYERS:'true'});
  assert.equal(streams[0].url,media);assert.equal(streams[0].externalUrl,undefined);
  assert(streams[1].name.startsWith('Browser ·'));assert(streams[1].externalUrl.endsWith('.php'));
  const denied=await resolveStreams(fixture,[],async(url,options)=>url.includes('schedule-generated.json')
    ?new Response(JSON.stringify(schedule)):new Response('',{status:403}),
    {DADDY_NATIVE_RESOLVE:'true',DADDY_WEB_PLAYERS:'true'});
  assert.equal(denied.length,1);assert.equal(denied[0].url,undefined);
  assert(denied[0].name.startsWith('Browser ·'));
});
test('follows bounded public player redirects only to known hosts',async()=>{
  const redirected='https://thedaddy.pk/cast/stream-426.php';
  const result=await resolveDaddyChannel('426',network({
    'https://thedaddy.pk/stream/stream-426.php':()=>new Response('',{status:302,headers:{location:redirected}}),
    [redirected]:()=>new Response('const SRC="'+media+'";')
  }));
  assert.equal(result.status,'resolved');
});
