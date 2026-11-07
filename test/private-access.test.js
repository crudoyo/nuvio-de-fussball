import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/worker.js';
import {encodeSettings} from '../src/addon-config.js';
import {newAccessToken} from '../src/private-store.js';

test('private mode closes unkeyed routes even with missing bindings, and does not contact upstreams',async()=>{
  const legacy='/u/'+encodeSettings({m:[],c:['defootball_bl1']});
  const fetcher=()=>assert.fail('anonymous request must never fetch an upstream');
  for(const path of ['/','/generate','/manifest.json',legacy+'/manifest.json',legacy+'/configure',
    '/catalog/tv/defootball_bl1.json','/meta/tv/defootball_bl1_42.json','/stream/tv/defootball_bl1_42.json',
    '/debug/sources.json','/poster/bl1/42.png','/background/bl1/42.png','/daddy/live/426.m3u8',
    '/daddy/resource/426/media/abcdef.ts','/health']){
    const response=await handle(new Request('https://addon.example'+path),{PRIVATE_ACCESS:'true'},fetcher);
    assert.equal(response.status,404,path);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
  }
  for(const path of ['/admin','/configure','/configure/login'])
    assert.equal((await handle(new Request('https://addon.example'+path),{PRIVATE_ACCESS:'true'},fetcher)).status,503);
  for(const env of [{PRIVATE_DB:{}},{PRIVATE_ADMIN_KEY:newAccessToken()}])
    assert.equal((await handle(new Request('https://addon.example/manifest.json'),env,fetcher)).status,404);
});

test('private access fails closed when a database request fails',async()=>{
  const token=newAccessToken();
  const response=await handle(new Request('https://addon.example/a/'+token+'/manifest.json'),{
    PRIVATE_ACCESS:'true',PRIVATE_ADMIN_KEY:newAccessToken(),PRIVATE_DB:{prepare(){throw new Error('DB '+token);}}
  },()=>assert.fail('database outage must not bypass authentication'));
  assert.equal(response.status,503);
  assert(!((await response.text()).includes(token)));
});
