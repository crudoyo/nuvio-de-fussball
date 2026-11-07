// End-to-end test in workerd with an isolated local D1 database and throwaway credentials.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {basename,dirname,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {accessHash,invitationCodePattern,newAccessToken} from '../src/private-store.js';
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
const redact=value=>String(value??'').replace(/NV-[A-Za-z0-9_-]{24}|[A-Za-z0-9_-]{43}/g,'[redacted]');
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
  const expiredFriend=crypto.randomUUID(),expiredSlot=crypto.randomUUID(),expiredToken=newAccessToken(),past=Date.now()-1000;
  const legacyFriend=crypto.randomUUID(),legacyToken=newAccessToken();
  const oldFriend=crypto.randomUUID(),oldSlot=crypto.randomUUID(),oldCode='NV-'+newAccessToken().slice(0,24);
  const setupFriend=crypto.randomUUID(),expiredCode='NV-'+newAccessToken().slice(0,24),expiredSetup=newAccessToken();
  wrangler(['d1','execute','PRIVATE_DB','--command',
    `INSERT INTO friends(id,name,slot_limit,created_at) VALUES('${expiredFriend}','Ablaufprobe',1,${past});
    INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at)
    VALUES('${expiredSlot}','${expiredFriend}','${await accessHash(expiredToken)}',${past},${past});
    INSERT INTO friends(id,name,slot_limit,created_at) VALUES('${legacyFriend}','Bisheriger Einladungslink',1,${past});
    INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at)
    VALUES('${crypto.randomUUID()}','${legacyFriend}','${await accessHash(legacyToken)}',0,${past});
    INSERT INTO friends(id,name,slot_limit,created_at) VALUES('${oldFriend}','Bisheriges Passwort',1,${past});
    INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at)
    VALUES('${oldSlot}','${oldFriend}','${await accessHash(oldCode)}',0,${past});
    INSERT INTO friends(id,name,slot_limit,created_at) VALUES('${setupFriend}','Abgelaufene Konfiguration',1,${past});
    INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at,setup_hash,setup_expires_at)
    VALUES('${crypto.randomUUID()}','${setupFriend}','${await accessHash(expiredCode)}',0,${past},'${await accessHash(expiredSetup)}',${past});`]);
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
  for(const path of ['/','/manifest.json','/u/'+encodeSettings({m:[]})+'/manifest.json',
    '/poster/bl1/42.png','/stream/tv/defootball_bl1_42.json','/debug/sources.json','/daddy/live/426.m3u8']){
    await expect(await request(path),404,'Public route must stay closed');
  }
  const configure='/configure',configurationLogin=configure+'/login';
  const gate=await expect(await request(configure),200,'Shared configuration address');
  assert.match(gate,/<h1>SoccerDE<\/h1>/);
  assert.match(gate,/<label>Passwort<input/);
  assert.doesNotMatch(gate,/name="catalog"/);
  await expect(await request(configure,{body:{catalog:'defootball_bl1'}}),403,'Anonymous configuration submission');
  await expect(await request(configurationLogin,{body:{code:expiredCode}}),403,'Expired session never makes a used password reusable');
  const expiredGate=await expect(await request(configure,{cookie:'__Secure-nuvio-setup='+expiredSetup}),200,'Expired configuration session');
  assert.doesNotMatch(expiredGate,/name="catalog"/);
  await expect(await request('/e/'+expiredToken),404,'Expired invitation');
  assert.match(await expect(await request('/e/'+legacyToken),200,'Open existing invitation'),/Einladung einlösen/);
  await expect(await request('/e/'+legacyToken,{body:{catalog:'defootball_bl1'}}),200,'Redeem existing invitation');
  await expect(await request('/e/'+legacyToken),404,'Existing invitation is consumed');
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
  await admin('password',{friend:expiredFriend,slot:expiredSlot},404);
  const oldFields={friend:oldFriend,slot:oldSlot};
  const oldPassword=await admin('password',oldFields,200);
  assert(!field(oldPassword,'invitation-code'),'Old random passwords cannot be reconstructed');
  assert.match(oldPassword,/action="\/admin\/replace-password"/);
  const replacement=await admin('replace-password',oldFields,200);
  assert.match(replacement,/Einmal einlösbar · ohne Ablaufdatum/);
  const replaced=field(replacement,'invitation-code');
  assert(invitationCodePattern.test(replaced)&&replaced!==oldCode);
  await admin('invite',{friend:oldFriend,hours:'24'},409);
  assert.equal(field(await admin('password',oldFields,200),'invitation-code'),replaced);
  await expect(await request(configurationLogin,{body:{code:oldCode}}),403,'Replaced password no longer works');
  await expect(await request(configurationLogin,{body:{code:replaced}}),303,'Replacement is redeemable');
  await admin('invite',{friend:expiredFriend,hours:'24'},201);
  await admin('invite',{friend:setupFriend,hours:'24'},201);
  const created=await admin('friend',{name:'Max <Test>',limit:'2',hours:'forever'},201);
  assert(created.includes('Max &lt;Test&gt;')&&!created.includes('Max <Test>'),'Escaped friend label');
  assert.match(created,/Einmal einlösbar · ohne Ablaufdatum/);
  const friend=/<section class="panel" id="friend-([^"]+)"><div class="row"><div><h2>Max &lt;Test&gt;<\/h2>/.exec(created)?.[1];
  const code=field(created,'invitation-code');
  assert.equal(field(created,'configure-url'),origin+configure);
  assert(friend&&invitationCodePattern.test(code),'Friend and password were created');
  const mainSlot=slotFor(created,friend,'Einladung offen');
  assert(mainSlot);
  const mainFields={friend,slot:mainSlot};
  assert(!(await expect(await request('/admin',{cookie:session}),200,'Admin overview')).includes(code),'Overview does not reveal open passwords');
  await expect(await request('/admin/password',{body:mainFields}),403,'Password lookup requires admin login');
  await admin('password',mainFields,403,'https://other.example');
  await admin('password',{...mainFields,friend:oldFriend},404);
  await admin('block',{friend,blocked:'1'},200);
  await admin('password',mainFields,404);
  await admin('block',{friend,blocked:'0'},200);
  assert.equal(field(await admin('password',mainFields,200),'invitation-code'),code,'Reopening reveals the original password');
  await admin('block',{friend,blocked:'1'},403,'https://other.example');
  const phone='Nuvio test mobile browser',tv='Nuvio test television';
  await expect(await request('/e/'+code),404,'Password cannot be used in the legacy link route');
  await expect(await request(configurationLogin,{body:{code},from:'https://other.example'}),403,'Cross-origin password login');
  const claims=await Promise.all([request(configurationLogin,{body:{code},client:phone}),request(configurationLogin,{body:{code}})]);
  assert.deepEqual(claims.map(r=>r.status).sort(),[303,403],'Exactly one concurrent login succeeds');
  const claim=claims.find(r=>r.status===303);
  assert.equal(claim.headers.get('location'),configure);
  const setupCookie=claim.headers.get('set-cookie');
  assert(setupCookie&&/Path=\/configure; Secure; HttpOnly; SameSite=Strict; Max-Age=1800/.test(setupCookie)&&!setupCookie.includes(code));
  const setupSession=setupCookie.split(';')[0];
  await expect(await request(configurationLogin,{body:{code}}),403,'Password is consumed at login');
  await admin('password',mainFields,404);
  await admin('replace-password',mainFields,404);
  const opening=await expect(await request(configure,{cookie:setupSession,client:phone}),200,'Open configuration on phone');
  assert.match(opening,/Importlink erstellen/);
  assert.match(opening,/name="catalog"/);
  assert.doesNotMatch(opening,/name="deviceName"/);
  await expect(await request(configure,{cookie:setupSession}),200,'Reload configuration in the same session');
  const selected=['defootball_bl3_sunday','defootball_bl1_friday'];
  const activation={body:selected.map(id=>['catalog',id]),cookie:setupSession,client:phone};
  await expect(await request(configure,{...activation,from:'https://other.example'}),403,'Cross-origin activation');
  await expect(await request(configure,{...activation,body:{customize:'1'}}),400,'Invalid configuration must not consume session');
  const simultaneous=await Promise.all([request(configure,activation),request(configure,activation)]);
  assert.equal(simultaneous.filter(r=>r.status===200).length,1,'Exactly one concurrent activation can succeed');
  assert(simultaneous.every(r=>[200,403,410].includes(r.status)),'Only the winning request receives a key');
  assert.match(simultaneous.find(r=>r.ok).headers.get('set-cookie')||'',/Max-Age=0/,'Activation clears the setup cookie');
  const [install]=await Promise.all(simultaneous.sort((a,b)=>a.status-b.status).map(r=>r.text()));
  const tvImport=field(install,'manifest-url');
  assert(tvImport?.includes('/a/')&&tvImport.endsWith('/manifest.json'),'Protected import URL');
  assert(install.includes('auch für andere Geräte'),'Import label covers another device');
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
  await expect(await request(configure,activation),403,'Completed configuration cannot issue another key');
  await expect(await request(prefix+'/debug/sources.json'),404,'Friend diagnostics remain closed');
  const reservations=await Promise.all([request('/admin/invite',{cookie:session,body:{friend,hours:'forever'}}),
    request('/admin/invite',{cookie:session,body:{friend,hours:'forever'}})]);
  assert.deepEqual(reservations.map(r=>r.status).sort(),[201,409],'Concurrent reservations obey the limit');
  const reservationsHtml=await Promise.all(reservations.map(r=>r.text()));
  const reserved=reservationsHtml[reservations.findIndex(r=>r.status===201)];
  const pending=field(reserved,'invitation-code');
  const pendingSlot=slotFor(reserved,friend,'Einladung offen');
  assert(pending&&pendingSlot&&pending!==code,'Second invitation reserves a slot with a distinct password');
  assert.match(reserved,/Einladung offen<\/h3><p class="hint">ohne Ablaufdatum/);
  await admin('limit',{friend,limit:'1'},409);
  await admin('revoke',{friend,slot:pendingSlot},200);
  await admin('password',{friend,slot:pendingSlot},404);
  await expect(await request(configurationLogin,{body:{code:pending}}),403,'Revoked password without a deadline cannot be used');
  const second=field(await admin('invite',{friend,hours:'72'},201),'invitation-code');
  assert(invitationCodePattern.test(second),'A timed invitation can reserve the freed slot');
  const secondClaim=await request(configurationLogin,{body:{code:second}});
  await expect(secondClaim,303,'Claim timed password');
  const laptop=field(await expect(await request(configure,{cookie:secondClaim.headers.get('set-cookie').split(';')[0],
    body:{catalog:'defootball_bl1'}}),200,'Activate second key'),'manifest-url');
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
  console.log('Private workerd/D1 verified: password lookup and replacement, one-time login, setup expiry, concurrent slot limits, revocation and protected imports.');
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
