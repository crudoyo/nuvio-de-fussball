import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,deflateSync} from 'node:zlib';
import {decodeDaddyMedia,mediaRange} from '../src/daddy-media.js';
import {decodeDaddyConfig,daddyPlayerConfig,handleDaddyPlayback,rewriteDaddyPlaylist} from '../src/daddy-playback.js';
import {automaticDaddyEventStreams,automaticDaddyStreams} from '../src/daddy-native.js';
import {withDaddyRelay} from '../src/daddy-wide.js';
import {handle} from '../src/worker.js';
import {accessHash,newAccessToken} from '../src/private-store.js';

const origin='https://addon.example.org',edge='https://edge.wedd48c.top',sid='playback-test-session-one';
const player='https://dembed.st/premiumtv/daddy.php?id=426';
const source=edge+'/premium426/index.m3u8';
const segment='https://p19-common-sign.tiktokcdn-us.com/tiktok-obj-tx/abcdef0123456789~tplv-tiktokx-origin.image?x-signature=public-fixture';
const html=`const SRC="${source}";const EDGE="${edge}";const CHANNEL="premium426";fetch(EDGE+'/api/playlist-token?slug='+CHANNEL);`;
const playlist=`#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n${segment}\n`;
const ts=Buffer.alloc(188*8);
for(let i=0;i<ts.length;i++)ts[i]=i%188===0?0x47:i%251;
function chunk(name,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);return out;}
function wrappedPng(media,{rgba=false,filter=0}={}){
  const gz=gzipSync(media),width=16,height=Math.ceil((gz.length+12)/(width*3));
  const rgb=Buffer.alloc(width*height*3);rgb.write('TIKTIKPX');rgb.writeUInt32BE(gz.length,8);gz.copy(rgb,12);
  const bpp=rgba?4:3,stride=width*bpp,raw=Buffer.alloc(height*(stride+1)),rows=[];
  for(let y=0;y<height;y++){
    const row=Buffer.alloc(stride);for(let x=0;x<width;x++){
      rgb.copy(row,x*bpp,(y*width+x)*3,(y*width+x)*3+3);if(rgba)row[x*bpp+3]=255;
    }rows.push(row);
    const f=filter==='all'?y%5:filter;raw[y*(stride+1)]=f;
    for(let x=0;x<stride;x++){
      const a=x>=bpp?row[x-bpp]:0,b=y?rows[y-1][x]:0,c=y&&x>=bpp?rows[y-1][x-bpp]:0;
      const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
      const prediction=f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?(da<=db&&da<=dc?a:db<=dc?b:c):0;
      raw[y*(stride+1)+1+x]=(row[x]-prediction)&255;
    }
  }
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=rgba?6:2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const root=origin+'/daddy/live/426.m3u8?sid='+sid;
function network({manifest=playlist,denied=0,ttl=120}={}){
  const seen=[],state={tokens:0,denied};
  const fetcher=async(url,options)=>{
    const u=String(url);seen.push({url:u,options});assert.equal(options.redirect,'manual');assert(options.signal);
    if(u==='https://thedaddy.li/stream/stream-426.php')return new Response(`<iframe id="thatframe" src="${player}"></iframe>`);
    if(u===player)return new Response(html);
    if(u===edge+'/api/playlist-token?slug=premium426'){
      state.tokens++;assert.equal(options.headers.Referer,'https://dembed.st/');assert.equal(options.headers.Origin,'https://dembed.st');
      return Response.json({token:'test-token-'+state.tokens,ttl});
    }
    if(u.startsWith(source)){
      assert(new URL(u).searchParams.get('t').startsWith('test-token-'));
      if(state.denied){const status=state.denied;state.denied=0;return new Response('',{status});}
      return new Response(manifest);
    }
    if(u===segment){assert.equal(options.headers.Range,undefined);return new Response(wrappedPng(ts));}
    return new Response('',{status:404});
  };
  return {fetcher,seen,state};
}
function resource(url,kind='media',{profile='dembed',channel='426',expiry=Date.now()+120000}={}){
  const token=Buffer.from(JSON.stringify([url,profile,sid,expiry])).toString('base64url');
  return `${origin}/daddy/resource/${channel}/${kind}/${token}.${kind==='playlist'?'m3u8':'ts'}`;
}

test('decodes RGB and RGBA pixel containers with every PNG row filter into identical TS bytes',async()=>{
  for(const rgba of [false,true])for(const filter of [0,1,2,3,4,'all']){
    assert.deepEqual(Buffer.from(await decodeDaddyMedia(wrappedPng(ts,{rgba,filter}))),ts);
  }
  assert.deepEqual(Buffer.from(await decodeDaddyMedia(ts)),ts);
});

test('also handles appended PNG TS, WebP EXIF, raw and gzip media containers',async()=>{
  const png=Buffer.concat([wrappedPng(ts),ts]);
  const palette=Buffer.from(png);palette[25]=3;
  const webp=Buffer.alloc(ts.length+20);webp.write('RIFF');webp.writeUInt32LE(webp.length-8,4);webp.write('WEBP',8);webp.write('EXIF',12);webp.writeUInt32LE(ts.length,16);ts.copy(webp,20);
  for(const source of [png,palette,webp,Buffer.concat([Buffer.from('TIKTIKRAW'),ts]),Buffer.concat([Buffer.from('TIKTIKTSGZ'),gzipSync(ts)])])
    assert.deepEqual(Buffer.from(await decodeDaddyMedia(source)),ts);
});

test('rejects malformed images, non-video payloads and excessive inflated dimensions',async()=>{
  for(const source of [Buffer.from('<html>error</html>'),wrappedPng(Buffer.from('not video')),wrappedPng(ts).subarray(0,40)])
    await assert.rejects(()=>decodeDaddyMedia(source));
  const png=wrappedPng(ts);png.writeUInt32BE(0x7fffffff,16);
  await assert.rejects(()=>decodeDaddyMedia(png),/response_too_large/);
});

test('the advertised native option goes through the actual Worker router and returns decoded video',async()=>{
  const {fetcher}=network();
  const fixture={matchDateTimeUTC:'2026-11-06T17:30:00Z',team1:{teamName:'Bayern'},team2:{teamName:'Bremen'}};
  const events=[{name:'Bayern vs Bremen',startTime:fixture.matchDateTimeUTC,channels:[{id:'426',name:'DAZN1 DE'}]}];
  const streams=await automaticDaddyStreams(fixture,events,()=>17,{DADDY_NATIVE_RESOLVE:'true'},fetcher,{playbackOrigin:origin});
  assert.equal(streams.length,1);assert.equal(streams[0].name,'DaddyLive HLS · DAZN1 DE');
  assert.equal(streams[0].externalUrl,undefined);assert.equal(streams[0].behaviorHints.notWebReady,false);
  const response=await handle(new Request(streams[0].url),{},fetcher);
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/mpegurl/);
  const uri=(await response.text()).split('\n').find(l=>l.startsWith('https:'));
  assert(uri.startsWith(origin+'/daddy/resource/426/media/'));
  const media=await handle(new Request(uri),{},fetcher);
  assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'video/mp2t');
  assert.equal(media.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await media.arrayBuffer()),ts);
});

test('a later conference channel exposes both verified WideIPTV and Tossequip players',async()=>{
  const site='https://thedaddy.li',wide='https://wideiptv.top',cdn='https://cdn.wideiptv.top';
  const relay='https://relay.example.org',token='r'.repeat(43);
  const env={DADDY_NATIVE_RESOLVE:'true',DADDY_WIDE_RELAY:JSON.stringify({origin:relay,token})};
  const signedMaster=cdn+'/Conference/index.m3u8?token=fixture';
  const signedRendition=cdn+'/Conference/tracks-v1a1/mono.m3u8?token=fixture';
  const signedSegment=cdn+'/Conference/tracks-v1a1/part.ts?token=fixture';
  const castCdn='video.7odxv0l067ka.net:8443';
  const castManifest=`https://${castCdn}/hls/live.m3u8?s=fixture&e=1000`;
  const castSegment=`https://${castCdn}/hls/part.ts?s=fixture&e=1000`;
  const castConfig=encodeConfig({stream_url_nop2p:castManifest,padding:'x'.repeat(85000)});
  const castBytes=Buffer.concat(Array.from({length:25},()=>ts));
  const requests=[];
  const fetcher=async (raw,options)=>{
    const url=String(raw);requests.push(url);
    if([site+'/stream/stream-901.php',site+'/stream/stream-902.php'].includes(url))return new Response('No media');
    if([site+'/watch.php?id=901',site+'/watch.php?id=902',site+'/watch.php?id=903'].includes(url))return new Response('',{status:403});
    if(url===site+'/stream/stream-903.php')return new Response(
      `<button data-url="${site}/cast/stream-903.php">Cast</button><button data-url="${site}/player/stream-903.php">Player</button>`);
    if(url===site+'/player/stream-903.php')return new Response(`<iframe id="thatframe" src="${wide}/daddy.php?stream=Conference"></iframe>`);
    if(url===site+'/cast/stream-903.php')return new Response('<iframe id="thatframe" src="https://tossequip.net/e/test903"></iframe>');
    if(url.startsWith(relay+'/')){
      assert.equal(options.redirect,'manual');
      assert.equal(options.headers.Authorization,'Bearer '+token);
      if(url===relay+'/daddy.php?stream=Conference'){
        assert.equal(options.headers['X-Daddy-Referer'],site+'/player/stream-903.php');
        return new Response('<iframe src="/player/Conference"></iframe>');
      }
      if(url===relay+'/player/Conference')return new Response(`streamUrl: "${cdn}//Conference//index.m3u8?token=fixture"`);
      if(url===relay+'/_tossequip/e/test903'){
        assert.equal(options.headers['X-Daddy-Referer'],site+'/cast/stream-903.php');
        return new Response(`var _econfig='${castConfig}';`);
      }
      if(url===castManifest.replace('https://',relay+'/_tossequip/'))return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n${castSegment}`);
      if(url===castSegment.replace('https://',relay+'/_tossequip/'))return new Response(castBytes,{headers:{'content-length':castBytes.length}});
    }
    assert.equal(new Headers(options.headers).get('authorization'),null);
    assert.equal(options.headers.Referer,wide+'/');
    assert.equal(options.headers.Origin,wide);
    if(url===signedMaster)return new Response(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200\n${signedRendition}`);
    if(url===signedRendition)return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n${signedSegment}`);
    if(url===signedSegment)return new Response(ts,{status:options.headers.Range?206:200});
    assert.fail('Unexpected player or media request');
  };
  const channels=['901','902','903'].map(id=>({id,name:'Sender '+id}));
  const options=await automaticDaddyEventStreams([{channels}],env,withDaddyRelay(fetcher,env.DADDY_WIDE_RELAY),
    {playbackOrigin:origin,maxChannels:5});
  assert.equal(options.length,2);
  assert.deepEqual(options.map(s=>s.name),['DaddyLive HLS · Sender 903 · WideIPTV','DaddyLive HLS · Sender 903 · Tossequip']);
  assert.deepEqual(options.map(s=>new URL(s.url).searchParams.get('variant')),['player','cast']);
  assert(!options[0].url.includes('token='));
  assert(requests.indexOf(site+'/player/stream-903.php')<requests.indexOf(site+'/cast/stream-903.php'));
  const cold=(url,options)=>fetcher(url,options);
  const master=await handle(new Request(options[0].url),env,cold);
  assert.equal(master.status,200);
  const rendition=(await master.text()).split('\n').find(line=>line.startsWith(origin));
  const mediaPlaylist=await handle(new Request(rendition),env,cold);
  const media=(await mediaPlaylist.text()).split('\n').find(line=>line.startsWith(origin));
  const response=await handle(new Request(media,{headers:{Range:'bytes=0-375'}}),env,cold);
  assert.equal(response.status,206);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),ts.subarray(0,376));
  const castRoot=await handle(new Request(options[1].url),env,cold);
  assert.equal(castRoot.status,200);
  const castMedia=(await castRoot.text()).split('\n').find(line=>line.startsWith(origin));
  const castResponse=await handle(new Request(castMedia,{headers:{Range:'bytes=0-375'}}),env,cold);
  assert.equal(castResponse.status,206);
  assert.deepEqual(Buffer.from(await castResponse.arrayBuffer()),ts.subarray(0,376));
});

test('a private HLS option carries its device key through the playlist and segments, then stops after revocation',async()=>{
  const {fetcher,seen}=network(),key=newAccessToken(),hash=await accessHash(key),prefix='/a/'+key;
  let revoked_at=null;
  const env={PRIVATE_ACCESS:'true',PRIVATE_ADMIN_KEY:newAccessToken(),
    PRIVATE_DB:{prepare(){return {bind(value){return {first:async()=>value===hash?{blocked:0,revoked_at}:null};}};}}};
  const fixture={matchDateTimeUTC:'2026-11-06T17:30:00Z',team1:{teamName:'Bayern'},team2:{teamName:'Bremen'}};
  const events=[{name:'Bayern vs Bremen',startTime:fixture.matchDateTimeUTC,channels:[{id:'426',name:'DAZN1 DE'}]}];
  const [stream]=await automaticDaddyStreams(fixture,events,()=>17,{DADDY_NATIVE_RESOLVE:'true'},fetcher,{playbackOrigin:origin+prefix});
  assert.equal(new URL(stream.url).pathname,prefix+'/daddy/live/426.m3u8');
  const get=url=>handle(new Request(url),env,fetcher);
  const master=await get(stream.url);assert.equal(master.status,200);
  const uri=(await master.text()).split('\n').find(line=>line.startsWith('https:'));
  assert(uri.startsWith(origin+prefix+'/daddy/resource/426/media/'));
  const media=await get(uri);
  assert.equal(media.status,200);
  assert.equal(media.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await media.arrayBuffer()),ts);
  assert(!seen.some(x=>x.url.includes(key)||JSON.stringify(x.options.headers).includes(key)),'credentials stay on the Worker origin');
  const before=seen.length;
  assert.equal((await get(uri.replace(prefix,''))).status,404);
  revoked_at=Date.now();
  assert.equal((await get(stream.url)).status,403);
  assert.equal((await get(uri)).status,403);
  assert.equal(seen.length,before,'revocation blocks upstream traffic before playlist or media fetch');
});

test('Range and suffix requests use decoded bytes and unsatisfiable ranges report their real length',async()=>{
  const {fetcher}=network();
  for(const [range,expected] of [['bytes=188-375',ts.subarray(188,376)],['bytes=-188',ts.subarray(-188)]]){
    const r=await handleDaddyPlayback(new Request(resource(segment),{headers:{Range:range}}),{},fetcher);
    assert.equal(r.status,206);assert(r.headers.get('content-range').endsWith('/'+ts.length));
    assert.deepEqual(Buffer.from(await r.arrayBuffer()),expected);
  }
  const r=await handleDaddyPlayback(new Request(resource(segment),{headers:{Range:'bytes=999999-'}}),{},fetcher);
  assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */'+ts.length);
  assert.deepEqual(mediaRange('bytes=0-',376),{start:0,end:375});
});

test('public playlist tokens renew at half-life, remain viewer-specific, and retry a stale token only once',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-06T18:00:00Z')});
  const {fetcher,state}=network({ttl:20});
  assert.equal((await handleDaddyPlayback(new Request(root),{},fetcher)).status,200);assert.equal(state.tokens,1);
  assert.equal((await handleDaddyPlayback(new Request(root),{},fetcher)).status,200);assert.equal(state.tokens,1);
  t.mock.timers.tick(11000);
  assert.equal((await handleDaddyPlayback(new Request(root),{},fetcher)).status,200);assert.equal(state.tokens,2);
  const other=root.replace(sid,'playback-test-session-two');
  assert.equal((await handleDaddyPlayback(new Request(other),{},fetcher)).status,200);assert.equal(state.tokens,3);
  state.denied=403;
  assert.equal((await handleDaddyPlayback(new Request(root),{},fetcher)).status,200);assert.equal(state.tokens,4);
});

test('denied access, encrypted playlists and HTML are reported without exposing provider tokens',async()=>{
  for(const options of [{denied:401},{manifest:'<html>not video</html>'},{manifest:playlist+'#EXT-X-KEY:METHOD=AES-128,URI="key"'}]){
    const {fetcher}=network(options);const r=await handleDaddyPlayback(new Request(root),{},fetcher);
    assert(r.status>=400);assert(!(await r.text()).includes('test-token-'));
  }
});

test('resource validation blocks foreign hosts, ports, channels, credentials, expiry and malformed tokens before fetch',async()=>{
  const fetcher=()=>{throw Error('must not fetch');};
  const invalid=[resource('https://127.0.0.1/a.ts'),resource('https://example.org/a.ts'),resource('http://p19-common-sign.tiktokcdn-us.com/a.ts'),
    resource(segment.replace('.com/','.com:8443/')),resource(source,'playlist',{channel:'11'}),
    resource(segment.replace('https://','https://user:pass@')),resource(segment,'media',{expiry:Date.now()-1000}),
    origin+'/daddy/resource/426/media/bm90LWpzb24.ts',root.replace(sid,'bad')];
  for(const url of invalid){const r=await handleDaddyPlayback(new Request(url),{},fetcher);assert(r.status>=400,url);}
});

test('caller cancellation stops an ignored fetch without visiting more mirrors',async()=>{
  const controller=new AbortController();let calls=0;
  const fetcher=async()=>{calls++;controller.abort();return new Promise(()=>{});};
  const r=await handleDaddyPlayback(new Request(root,{signal:controller.signal}),{},fetcher);
  assert.equal(r.status,504);assert.equal(calls,1);
});

test('a transient media failure retries once, while access denial does not retry',async()=>{
  for(const status of [503,403]){
    const base=network();let calls=0;
    const fetcher=async(url,options)=>{
      if(String(url)===segment&&++calls===1)return new Response('',{status});
      return base.fetcher(url,options);
    };
    const r=await handleDaddyPlayback(new Request(resource(segment)),{},fetcher);
    assert.equal(r.status,status===503?200:403);
    assert.equal(calls,status===503?2:1);
  }
});

test('rewrites master, rendition and initialization URIs through the same checked adapter',()=>{
  const config={profile:'dembed',channelId:'426'};
  const master='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8';
  const out=rewriteDaddyPlaylist(master,source,config,sid,origin);
  assert.equal((out.match(/\/playlist\//g)||[]).length,2);
  const init=rewriteDaddyPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n'+segment,source,config,sid,origin);
  assert.equal((init.match(/\/media\//g)||[]).length,2);
  assert.throws(()=>rewriteDaddyPlaylist('#EXTM3U\nhttps://unknown.example/a.ts',source,config,sid,origin),/unsupported_media_address/);
});

function encodeConfig(value){
  const data=btoa(JSON.stringify(value)),n=data.length/4,order=[2,0,3,1];
  return btoa(order.map(index=>{const p=btoa(data.slice(index*n,(index+1)*n));return p.slice(0,3)+'X'+p.slice(3);}).join(''));
}
test('decodes the attached provider’s econfig format and preserves signed CDN queries and port 8443',()=>{
  const value={stream_url:'https://abc.7odxv0l067ka.net:8443/hls/live.m3u8?s=public&e=2000000000'};
  const encoded=encodeConfig(value);assert.deepEqual(decodeDaddyConfig(encoded),value);
  const config=daddyPlayerConfig(`var _econfig='${encoded}';`,'https://assetrage.net/e/426','426');
  assert.equal(config.url,value.stream_url);assert.equal(config.referer,'https://assetrage.net/');
  assert.equal(decodeDaddyConfig('invalid'),null);assert.equal(decodeDaddyConfig('A'.repeat(262145)),null);
  assert.equal(daddyPlayerConfig(html,player,'11'),null);
});
