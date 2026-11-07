// End-to-end test in workerd with an isolated local D1 database and throwaway credentials.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {basename,dirname,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {accessHash,newAccessToken} from '../src/private-store.js';
import {encodeSettings} from '../src/addon-config.js';
import {VERSION} from '../src/worker.js';

const cwd=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const parent=join(cwd,'.wrangler');
await mkdir(parent,{recursive:true});
assert.equal(await realpath(parent),parent,'Test database must stay inside the workspace');
const directory=await mkdtemp(join(parent,'private-test-'));
const cli=join(cwd,'node_modules','wrangler','bin','wrangler.js');
const flags=['--local','--config','wrangler.private.jsonc','--persist-to',directory];
const adminKey=newAccessToken();
const redact=value=>String(value??'').replace(/[A-Za-z0-9_-]{43}/g,'[redacted]');
function wrangler(args){
  const result=spawnSync(process.execPath,[cli,...args,...flags],{cwd,encoding:'utf8',windowsHide:true,timeout:45000});
  if(result.status!==0)throw Error('Local D1 setup failed: '+redact(result.error||result.stderr||result.stdout));
}
async function freePort(){
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const {port}=server.address();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}
let child,log='';
try{
  wrangler(['d1','migrations','apply','PRIVATE_DB']);
  const expiredFriend=crypto.randomUUID(),expiredToken=newAccessToken(),past=Date.now()-1000;
  wrangler(['d1','execute','PRIVATE_DB','--command',
    `INSERT INTO friends(id,name,slot_limit,created_at) VALUES('${expiredFriend}','Ablaufprobe',1,${past});
    INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at)
    VALUES('${crypto.randomUUID()}','${expiredFriend}','${await accessHash(expiredToken)}',${past},${past});`]);
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[cli,'dev',...flags,'--ip','127.0.0.1','--port',String(port),
    '--var','PRIVATE_ADMIN_KEY:'+adminKey,'--log-level','error','--show-interactive-dev-session','false'],
  {cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{log=(log+part).slice(-4500);});
  let session='';
  async function request(path,{body,cookie='',from=origin,client,method=body?'POST':'GET'}={}){
    return fetch(new URL(path,origin),{method,redirect:'manual',
      headers:{...(cookie?{cookie}:{}),...(method==='POST'?{origin:from}:{}),...(client?{'user-agent':client}:{})},
      body:body?new URLSearchParams(body):undefined,signal:AbortSignal.timeout(17000)});
  }
  async function expect(response,status,label){
    assert.equal(response.status,status,label);
    assert.equal(response.headers.get('cache-control'),'private, no-store',label);
    return response.text();
  }
  async function admin(action,body,status,from){
    return expect(await request('/admin/'+action,{body,cookie:session,from}),status,'Admin '+action);
  }
  function field(html,id){
    return new RegExp('<input[^>]*id="'+id+'"[^>]*value="([^"]+)"').exec(html)?.[1];
  }
  function href(html,id){
    return new RegExp('<a[^>]*id="'+id+'"[^>]*href="([^"]+)"').exec(html)?.[1];
  }
  function slotFor(html,friendId,label){
    const section=html.split('id="friend-'+friendId+'"')[1]?.split('</section>')[0]||'';
    return new RegExp('<h3>'+label+'</h3>[\\s\\S]*?name="slot" value="([^"]+)"').exec(section)?.[1];
  }
  let ready=false;
  for(let i=0;i<45&&child.exitCode===null;i++){
    try{
      const response=await fetch(origin+'/admin',{signal:AbortSignal.timeout(1000)});
      if(response.ok&&/Verwaltung anmelden/.test(await response.text())){
        assert.equal(response.headers.get('referrer-policy'),'same-origin','Login form must retain its POST Origin');
        ready=true;break;
      }
    }catch{}
    await delay(400);
  }
  assert(ready,'Private workerd did not start: '+redact(log));
  for(const path of ['/','/configure','/manifest.json','/u/'+encodeSettings({m:[]})+'/manifest.json',
    '/poster/bl1/42.png','/stream/tv/defootball_bl1_42.json','/debug/sources.json','/daddy/live/426.m3u8']){
    await expect(await request(path),404,'Public route must stay closed');
  }
  await expect(await request('/e/'+expiredToken),404,'Expired invitation');
  await expect(await request('/admin/friend',{body:{name:'Test',limit:'2',hours:'72'}}),403,'Unauthenticated admin');
  await expect(await request('/admin/login',{body:{key:adminKey},from:'https://other.example'}),403,'Cross-origin login');
  await expect(await request('/admin/login',{body:{key:adminKey},from:'null'}),403,'Opaque origin is not trusted');
  await expect(await request('/admin/login',{body:{key:newAccessToken()}}),403,'Wrong admin secret');
  const login=await request('/admin/login',{body:{key:adminKey}});
  await expect(login,303,'Admin login');
  const cookie=login.headers.get('set-cookie');
  assert(cookie&&/Secure; HttpOnly; SameSite=Strict/.test(cookie)&&!cookie.includes(adminKey),'Secure admin session');
  session=cookie.split(';')[0];
  await expect(await request('/admin/friend',{cookie:session.slice(0,-1)+(session.endsWith('A')?'B':'A'),
    body:{name:'Test',limit:'2',hours:'72'}}),403,'Modified session signature');
  await admin('invite',{friend:expiredFriend,hours:'24'},201);
  const created=await admin('friend',{name:'Max <Test>',limit:'2',hours:'forever'},201);
  assert(created.includes('Max &lt;Test&gt;')&&!created.includes('Max <Test>'),'Escaped friend label');
  assert.match(created,/Einmal einlösbar · ohne Ablaufdatum/);
  const friend=/<section class="panel" id="friend-([^"]+)"><div class="row"><div><h2>Max &lt;Test&gt;<\/h2>/.exec(created)?.[1];
  const invite=field(created,'invite-url');
  assert(friend&&invite,'Friend and invitation were created');
  assert(!(await expect(await request('/admin',{cookie:session}),200,'Admin overview')).includes(invite),'Cleartext invitation only shown at creation');
  await admin('block',{friend,blocked:'1'},403,'https://other.example');
  const phone='Nuvio test mobile browser',tv='Nuvio test television';
  const opening=await expect(await request(invite,{client:phone}),200,'Open invitation on phone');
  assert(opening.includes('Einladung einlösen')&&!opening.includes('name="deviceName"'),'Invitation requires no device label');
  await expect(await request(invite),200,'Preview must not consume invite');
  const selected=['defootball_bl3_sunday','defootball_bl1_friday'];
  const activation=selected.map(id=>['catalog',id]);
  await expect(await request(invite,{body:activation,from:'https://other.example'}),403,'Cross-origin activation');
  await expect(await request(invite,{body:{customize:'1'}}),400,'Invalid configuration must not consume invite');
  const simultaneous=await Promise.all([request(invite,{body:activation,client:phone}),request(invite,{body:activation,client:phone})]);
  assert.equal(simultaneous.filter(r=>r.status===200).length,1,'Exactly one concurrent redemption can succeed');
  assert(simultaneous.every(r=>[200,404,410].includes(r.status)),'Only the winning request receives a key');
  const [install]=await Promise.all(simultaneous.sort((a,b)=>a.status-b.status).map(r=>r.text()));
  const tvImport=field(install,'manifest-url');
  assert(tvImport?.includes('/a/')&&tvImport.endsWith('/manifest.json'),'Protected import URL');
  assert(install.includes('Auf einem anderen Gerät installieren'),'Import instructions cover another device');
  for(const app of ['nuvio','stremio'])assert.equal(href(install,'install-'+app),tvImport.replace('http:',app+':'),'App link preserves full private path');
  const manifest=JSON.parse(await expect(await request(tvImport,{client:tv}),200,'Import on TV after phone activation'));
  await expect(await request(tvImport,{client:tv}),200,'Installed TV can fetch the manifest again');
  assert.equal(manifest.version,VERSION);
  assert.deepEqual(manifest.catalogs.map(c=>c.id),selected);
  const prefix=new URL(tvImport).pathname.split('/').slice(0,3).join('/');
  const edit=await expect(await request(href(install,'edit-settings')),200,'Restore private settings');
  assert(edit.includes('action="'+prefix+'/generate"'),'Edit form retains key');
  assert(edit.includes('value="defootball_bl3_sunday" checked'),'Edit form retains selection');
  const changed=await expect(await request(prefix+'/generate',{body:{customize:'1',catalog:'defootball_ucl',browser:'on'}}),200,'Update private settings');
  assert(field(changed,'manifest-url')?.startsWith(origin+prefix+'/u/'),'Updated profile uses the same key');
  await expect(await request(invite),404,'Consumed invite cannot be opened again');
  await expect(await request(prefix+'/debug/sources.json'),404,'Friend diagnostics remain closed');
  const reservations=await Promise.all([request('/admin/invite',{cookie:session,body:{friend,hours:'forever'}}),
    request('/admin/invite',{cookie:session,body:{friend,hours:'forever'}})]);
  assert.deepEqual(reservations.map(r=>r.status).sort(),[201,409],'Concurrent reservations obey the limit');
  const reservationsHtml=await Promise.all(reservations.map(r=>r.text()));
  const reserved=reservationsHtml[reservations.findIndex(r=>r.status===201)];
  const pending=field(reserved,'invite-url');
  const pendingSlot=slotFor(reserved,friend,'Einladung offen');
  assert(pending&&pendingSlot,'Second invitation without a deadline reserves a slot');
  assert.match(reserved,/Einladung offen<\/h3><p class="hint">ohne Ablaufdatum/);
  await admin('limit',{friend,limit:'1'},409);
  await admin('revoke',{friend,slot:pendingSlot},200);
  await expect(await request(pending),404,'Revoked invitation without a deadline cannot be opened');
  const second=field(await admin('invite',{friend,hours:'72'},201),'invite-url');
  assert(second,'A timed invitation can reserve the freed slot');
  const laptop=field(await expect(await request(second,{body:{catalog:'defootball_bl1'}}),200,'Activate second key'),'manifest-url');
  assert(laptop&&laptop!==tvImport,'Each device receives a distinct key');
  await admin('limit',{friend,limit:'1'},409);
  const overview=await expect(await request('/admin',{cookie:session}),200,'List devices');
  assert(overview.includes('2 / 2 belegt'));
  const tvSlot=slotFor(overview,friend,'Schlüssel 1');
  assert(tvSlot,'First key listed');
  await admin('revoke',{friend,slot:tvSlot},200);
  await expect(await request(tvImport),403,'TV is revoked');
  await expect(await request(laptop),200,'Laptop remains authorized');
  await admin('limit',{friend,limit:'1'},200);
  await admin('block',{friend,blocked:'1'},200);
  await expect(await request(laptop),403,'Friend-wide pause blocks active laptop');
  await admin('block',{friend,blocked:'0'},200);
  await expect(await request(laptop),200,'Laptop works after unpause');
  await expect(await request(tvImport),403,'Previously revoked TV stays revoked');
  await admin('logout',{},303);
  console.log('Private workerd/D1 verified: single-use invites, concurrent slot limits, per-device revocation, protected imports and admin sessions.');
}finally{
  if(child&&child.exitCode===null){
    const exit=once(child,'exit');
    child.kill('SIGTERM');
    await Promise.race([exit,delay(2000)]);
  }
  const resolved=await realpath(directory);
  if(dirname(resolved)!==parent||!basename(resolved).startsWith('private-test-'))throw Error('Unexpected test directory');
  await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
