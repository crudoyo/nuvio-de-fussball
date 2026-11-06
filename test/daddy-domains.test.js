import test from 'node:test';
import assert from 'node:assert/strict';
import {DADDY_ORIGINS,daddySiteUrl,daddyChannelPage,sameDaddyRoute,daddyRequestContext,withDaddyFallback} from '../src/daddy-domains.js';
import {getDaddySchedule,daddyPlayerUrl,daddyPublicDiagnostic} from '../src/daddylive.js';
import {resolveDaddyChannel} from '../src/daddy-native.js';
import {resolveStreams} from '../src/worker.js';

const date=new Date().toISOString().slice(0,10);
const site='<html><section class="schedule__day"><h3 class="schedule__dayTitle">'+date+'</h3>'+
  '<div class="schedule__category"><div class="card__meta">Football</div>'+
  '<div class="schedule__event"><div class="schedule__time">20:00</div>'+
  '<h4 class="schedule__eventTitle">Home vs Away</h4><div class="schedule__channels">'+
  '<a href="https://thedaddy.li/watch.php?id=31">TNT Sports 1</a></div></div></div></section></html>';
const html=()=>new Response(site,{headers:{'content-type':'text/html'}});
const redirect=url=>new Response(null,{status:301,headers:{location:url}});

test('the shared alias list is explicit and preserves player identity',()=>{
  assert.equal(DADDY_ORIGINS[0],'https://thedaddy.li');
  for(const origin of DADDY_ORIGINS){
    assert(daddySiteUrl(origin));
    assert.equal(daddyPlayerUrl('31',origin),origin+'/stream/stream-31.php');
    assert(daddyChannelPage(origin+'/watch.php?id=31','31'));
    assert(sameDaddyRoute(origin+'/cast/stream-31.php','https://thedaddy.li/cast/stream-31.php'));
  }
  for(const bad of ['https://thedaddy.li.evil.example','https://thedaddy.unknown',
    'https://daddylive.pk','http://thedaddy.li','https://user@thedaddy.li','https://thedaddy.li:8443'])
    assert.equal(daddySiteUrl(bad),null,bad);
  assert.equal(daddyChannelPage('https://thedaddy.li/cast/stream-32.php','31'),null);
  assert.equal(daddyChannelPage('https://thedaddy.li/watch.php?id=31&token=private','31'),null);
  assert(!sameDaddyRoute('https://thedaddy.li/cast/stream-31.php','https://thedaddy.pk/stream/stream-31.php'));
});

test('fresh .li HTML is used without requesting stale JSON or media',async()=>{
  const calls=[];
  const result=await getDaddySchedule({},async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'manual');
    assert(!Object.keys(options.headers).some(key=>/cookie|authorization/i.test(key)));
    return html();
  });
  assert.deepEqual(calls,['https://thedaddy.li/']);
  assert(result.reachable);assert.equal(result.siteOrigin,'https://thedaddy.li');
  assert.equal(result.footballEvents,1);assert.equal(result.events[0].channels[0].id,'31');
});

test('schedule falls back to a working alias and prefers it on subsequent requests',async()=>{
  const calls=[];
  const fetcher=async url=>{
    calls.push(url);
    if(url==='https://thedaddy.li/')throw new TypeError('network unavailable');
    if(url==='https://thedaddy.pk/')return new Response('',{status:503});
    if(url==='https://dlhd.pk/')return html();
    throw Error('Unexpected URL');
  };
  const result=await getDaddySchedule({},fetcher);
  assert(result.reachable);assert.equal(result.siteOrigin,'https://dlhd.pk');
  assert.deepEqual(calls,['https://thedaddy.li/','https://thedaddy.pk/','https://dlhd.pk/']);
  calls.length=0;
  assert((await getDaddySchedule({},fetcher)).reachable);
  assert.deepEqual(calls,['https://dlhd.pk/']);
});

test('the full dlstreams -> dlive -> .pk -> .li chain preserves the selected route',async()=>{
  const route='/stream/stream-31.php',seen=[];
  const result=await resolveDaddyChannel('31',async url=>{
    seen.push(url);
    if(url==='https://dlstreams.st'+route)return redirect('https://dlive.sx'+route);
    if(url==='https://dlive.sx'+route)return redirect('https://thedaddy.pk'+route);
    if(url==='https://thedaddy.pk'+route)return redirect('https://thedaddy.li'+route);
    return new Response('<html>No direct media</html>');
  },{origin:'https://dlstreams.st'});
  assert.equal(result.status,'no_public_media');
  assert.deepEqual(seen,['https://dlstreams.st'+route,'https://dlive.sx'+route,
    'https://thedaddy.pk'+route,'https://thedaddy.li'+route,'https://thedaddy.li/watch.php?id=31']);
  assert.equal(result.checks.requests,5);
});

test('native resolution retains the selected path and channel across fallback domains',async()=>{
  const seen=[],media='https://cdn.example.org/domain-test.m3u8';
  const ts=new Uint8Array(376);ts[0]=ts[188]=0x47;
  const result=await resolveDaddyChannel('31',async(url,options)=>{
    seen.push(url);
    assert(!Object.keys(options.headers).some(key=>/cookie|authorization/i.test(key)));
    if(url==='https://thedaddy.li/stream/stream-31.php')return new Response('',{status:503});
    if(url==='https://thedaddy.pk/stream/stream-31.php')return new Response('',{status:404});
    if(url==='https://dlhd.pk/stream/stream-31.php')return redirect('https://dlhd.st/stream/stream-31.php');
    if(url==='https://dlhd.st/stream/stream-31.php')return new Response(
      '<button data-url="https://thedaddy.li/cast/stream-31.php">Selected</button>'+
      '<button data-url="https://thedaddy.li/cast/stream-32.php">Other channel</button>');
    if(url==='https://dlhd.st/cast/stream-31.php')return new Response('const SRC="'+media+'";');
    if(url===media)return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts');
    if(url==='https://cdn.example.org/segment.ts')return new Response(ts,{status:206});
    throw Error('Unexpected URL '+url);
  });
  assert.equal(result.status,'resolved');assert.equal(result.stream.url,media);
  assert.equal(result.stream.behaviorHints.proxyHeaders.request.Origin,'https://dlhd.st');
  assert(seen.includes('https://dlhd.st/cast/stream-31.php'));
  assert(!seen.some(url=>url.includes('stream-32')));
  assert(result.checks.requests<=20);assert(result.checks.domainFallbacks>=2);
});

test('redirects may not change a selected player path or channel or leave the allowlist',async()=>{
  for(const destination of ['https://thedaddy.pk/cast/stream-31.php',
    'https://thedaddy.pk/stream/stream-32.php','https://unknown.example/stream/stream-31.php',
    'http://thedaddy.pk/stream/stream-31.php']){
    let requests=0;
    const result=await resolveDaddyChannel('31',async()=>{requests++;return redirect(destination);});
    assert.equal(result.status,'redirect_not_supported',destination);assert.equal(requests,1);
  }
});

test('API-key redirects remain blocked even between known aliases',async()=>{
  const secret='PRIVATE_TEST_KEY',calls=[];
  const result=await getDaddySchedule({DADDY_API_KEY:secret},async url=>{
    calls.push(url);
    return url.includes('daddyapi.php')?redirect('https://thedaddy.pk/daddyapi.php?key='+secret):html();
  });
  assert(result.reachable);assert.equal(result.attempts[0].reason,'Protected API redirect blocked');
  assert(calls[0].startsWith('https://thedaddy.li/daddyapi.php?'));
  assert(calls.slice(1).every(url=>!url.includes(secret)));
  assert(!JSON.stringify(daddyPublicDiagnostic(result)).includes(secret));
});

test('fallback operations obey their request budget',async()=>{
  const context=daddyRequestContext({maxRequests:2});let requests=0;
  try{
    await assert.rejects(withDaddyFallback('https://thedaddy.li/',async()=>{},async()=>{
      context.take();requests++;throw new TypeError('unavailable');
    },context),/request_limit/);
    assert.equal(requests,2);
  }finally{context.close();}
});

test('global timeout ends an uncooperative request without trying more domains',async()=>{
  const context=daddyRequestContext({timeout:20});let requests=0;
  try{
    await assert.rejects(withDaddyFallback('https://thedaddy.li/',async()=>{},async()=>{
      context.take();requests++;return new Promise(()=>{});
    },context),{name:'TimeoutError'});
    assert.equal(requests,1);
  }finally{context.close();}
});

test('caller cancellation is propagated immediately without a fallback attempt',async()=>{
  for(const operation of ['schedule','player']){
    const controller=new AbortController();let requests=0;
    const fetcher=async()=>{
      requests++;controller.abort(new DOMException('Caller stopped','AbortError'));
      return new Promise(()=>{});
    };
    const task=operation==='schedule'?getDaddySchedule({},fetcher,{signal:controller.signal}):
      resolveDaddyChannel('31',fetcher,{signal:controller.signal});
    await assert.rejects(task,{name:'AbortError'});assert.equal(requests,1);
  }
});

test('browser entries use the successful schedule origin and the stable channel ID',async()=>{
  const game={team1:{teamName:'Home'},team2:{teamName:'Away'},matchDateTimeUTC:date+'T20:00:00Z'};
  const streams=await resolveStreams(game,[],async url=>url==='https://dlhd.st/'?html():new Response('',{status:404}),
    {DADDY_WEB_PLAYERS:'true'});
  assert.equal(streams.length,1);assert.equal(streams[0].externalUrl,'https://dlhd.st/stream/stream-31.php');
});

test('caller cancellation also stops manifest requests that ignore the fetch signal',async()=>{
  const controller=new AbortController(),seen=[],media='https://cdn.example.org/cancel.m3u8';
  const result=resolveDaddyChannel('31',async url=>{
    seen.push(url);
    if(url===media){
      controller.abort(new DOMException('Caller stopped','AbortError'));
      return new Promise(()=>{});
    }
    return new Response('const SRC="'+media+'";');
  },{signal:controller.signal});
  await assert.rejects(result,{name:'AbortError'});
  assert.deepEqual(seen,['https://thedaddy.li/stream/stream-31.php',media]);
});
