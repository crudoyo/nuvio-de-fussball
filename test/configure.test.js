import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,VERSION,encodeConfig,decodeConfig} from '../src/worker.js';
import {encodeSettings,decodeSettings,installLinks,readSettingsForm,MAX_CONFIG_LENGTH} from '../src/addon-config.js';

const origin='https://configure.example.org';
const source='https://personal-sports.example/manifest.json';
const now=new Date().toISOString();
const fixture={matchID:123456,matchDateTimeUTC:now,team1:{teamName:'FC Bayern München'},team2:{teamName:'Borussia Dortmund'}};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function network(){
  const requests=[];
  const fetcher=async url=>{
    const u=String(url);requests.push(u);
    if(u.includes('/getavailableleagues/'))return json([{leagueShortcut:'rlno',leagueName:'Regionalliga Nordost'}]);
    if(u.includes('/getmatchdata/'))return json([fixture]);
    if(u===source)return json({name:'Personal Sports',catalogs:[{id:'football',name:'Football',type:'sport'}]});
    if(u==='https://personal-sports.example/catalog/sport/football.json')return json({metas:[{id:'match',name:'Bayern Munich vs Dortmund',released:now}]});
    if(u==='https://personal-sports.example/stream/sport/match.json')return json({streams:[
      {name:'Native',url:'https://media.example.org/play.m3u8'},{name:'Web',externalUrl:'https://personal-sports.example/watch'}
    ]});
    return json({},404);
  };
  return {fetcher,requests};
}
const personal=settings=>'/u/'+encodeSettings(settings);
const get=(path,fetcher,env={})=>handle(new Request(origin+path),{SEASON:'2026',...env},fetcher);
function formRequest(fields){
  const body=new URLSearchParams();for(const [name,value] of fields)body.append(name,value);
  return new Request(origin+'/generate',{method:'POST',body});
}
function inputValue(html,id){return new RegExp('<input[^>]*id="'+id+'"[^>]*value="([^"]*)"').exec(html)?.[1].replace(/&amp;/g,'&');}
function href(html,id){return new RegExp('<a[^>]*id="'+id+'"[^>]*href="([^"]*)"').exec(html)?.[1].replace(/&amp;/g,'&');}

test('old provider-only configuration URLs still round-trip without catalog or playback overrides',()=>{
  const token=encodeConfig([source]);assert.deepEqual(decodeConfig(token),[source]);
  assert.deepEqual(decodeSettings(token),{m:[source]});
});

test('portable settings preserve catalog order, native-only preference and exact personal source configuration',()=>{
  const settings={m:[source+'?key=personal%2Fvalue'],c:['defootball_bl3_sunday','defootball_bl1_friday','defootball_bl3_sunday'],b:false};
  assert.deepEqual(decodeSettings(encodeSettings(settings)),{...settings,c:settings.c.slice(0,2)});
  for(const value of [{m:[],c:['<script>']},{m:[],b:'false'},{m:[],c:'all'},[],null])
    assert.throws(()=>encodeSettings(value));
  for(const token of ['not-json','A'.repeat(MAX_CONFIG_LENGTH+1)])assert.throws(()=>decodeSettings(token));
});

test('selected catalog order is per-install and does not change the public manifest or another profile',async()=>{
  const {fetcher,requests}=network();
  const a=personal({m:[],c:['defootball_bl3_sunday','defootball_bl1_friday'],b:false});
  const b=personal({m:[],c:['defootball_ucl']});
  const custom=await(await get(a+'/manifest.json',fetcher)).json();
  assert.deepEqual(custom.catalogs.map(c=>c.id),['defootball_bl3_sunday','defootball_bl1_friday']);
  const other=await(await get(b+'/manifest.json',fetcher)).json();assert.deepEqual(other.catalogs.map(c=>c.id),['defootball_ucl']);
  const defaults=await(await get('/manifest.json',fetcher)).json();
  assert.equal(defaults.catalogs[0].id,'defootball_bl1');assert(defaults.catalogs.some(c=>c.id==='defootball_rlno'));
  const before=requests.filter(u=>u.includes('/getmatchdata/')).length;
  assert.deepEqual(await(await get(a+'/catalog/tv/defootball_ucl.json',fetcher)).json(),{metas:[]});
  assert.equal(requests.filter(u=>u.includes('/getmatchdata/')).length,before,'hidden catalogs do not fetch fixtures');
  const detail=await(await get(a+'/meta/tv/defootball_bl1_123456.json',fetcher)).json();
  assert.equal(detail.meta.id,'defootball_bl1_123456','saved match IDs remain accessible');
});

test('the form generates HTTPS, Nuvio and Stremio links for exactly the same settings',async()=>{
  const {fetcher}=network();
  const fields=[['customize','1'],['catalog','defootball_bl3_sunday'],['catalog','defootball_bl1_friday'],['sources',source]];
  const response=await handle(formRequest(fields),{SEASON:'2026'},fetcher);
  assert.equal(response.status,200);const html=await response.text();
  const url=inputValue(html,'manifest-url');assert(url.startsWith(origin+'/u/'));
  assert.equal(href(html,'install-nuvio'),url.replace('https://','nuvio://'));
  assert.equal(href(html,'install-stremio'),url.replace('https://','stremio://'));
  assert.equal(href(html,'edit-settings'),url.replace(/manifest.json$/,'configure'));
  const settings=decodeSettings(new URL(url).pathname.split('/')[2]);
  assert.deepEqual(settings,{m:[source],c:['defootball_bl3_sunday','defootball_bl1_friday'],b:false});
  const manifest=await(await handle(new Request(url),{SEASON:'2026'},fetcher)).json();
  assert.equal(manifest.version,VERSION);assert.deepEqual(manifest.catalogs.map(c=>c.id),settings.c);
});

test('reopening the personal configure page restores checked catalogs, order, sources and browser preference',async()=>{
  const {fetcher}=network();
  const prefix=personal({m:[source],c:['defootball_bl3_sunday','defootball_ucl'],b:false});
  const html=await(await get(prefix+'/configure',fetcher)).text();
  assert(html.includes(source));
  assert(html.indexOf('value="defootball_bl3_sunday"')<html.indexOf('value="defootball_ucl"'));
  assert.match(html,/<input[^>]*value="defootball_bl3_sunday" checked>/);
  assert.doesNotMatch(html,/<input[^>]*value="defootball_bl1" checked>/);
  assert.doesNotMatch(html,/<input[^>]*name="browser"[^>]*checked/);
  assert.doesNotMatch(html,/<input[^>]*name="browser"[^>]*disabled/,'a personal off switch remains editable');
});

test('native-only preference removes browser streams without affecting the other profile',async()=>{
  const {fetcher}=network();
  for(const [browser,count] of [[false,1],[true,2]]){
    const prefix=personal({m:[source],c:['defootball_bl1'],b:browser});
    const response=await get(prefix+'/stream/tv/defootball_bl1_123456.json',fetcher);
    const {streams}=await response.json();assert.equal(streams.length,count);
    assert.equal(streams[0].url,'https://media.example.org/play.m3u8');
    assert.equal(streams.some(s=>s.externalUrl),browser);
  }
});

test('invalid form data returns a usable form, preserving valid selections and escaping input',async()=>{
  const {fetcher}=network();
  for(const sources of ['javascript:alert(1)','https://example.org/configure','</textarea><script>alert(1)</script>']){
    const r=await handle(formRequest([['customize','1'],['catalog','defootball_ucl'],['sources',sources],['browser','on']]),{SEASON:'2026'},fetcher);
    const html=await r.text();assert.equal(r.status,400);assert.match(html,/role="alert"/);
    assert.match(html,/value="defootball_ucl" checked/);assert(!html.includes('<script>alert(1)</script>'));
    assert(!html.includes('id="install-nuvio"'));
  }
  const empty=await handle(formRequest([['customize','1']]),{},fetcher);assert.equal(empty.status,400);
});

test('legacy generation also gains both app buttons, and unsupported POST routes remain blocked',async()=>{
  const {fetcher}=network();const response=await get('/generate?sources='+encodeURIComponent(source),fetcher);
  const html=await response.text();const url=inputValue(html,'manifest-url');
  assert.deepEqual(decodeConfig(new URL(url).pathname.split('/')[2]),[source]);
  assert.equal(href(html,'install-nuvio'),url.replace('https://','nuvio://'));
  assert.equal((await handle(new Request(origin+'/manifest.json',{method:'POST'}),{},fetcher)).status,405);
});

test('form bodies have bounded size and direct app links keep the complete manifest path',async()=>{
  const url=origin+'/u/'+encodeSettings({m:[],c:['defootball_bl1_sunday'],b:false})+'/manifest.json';
  const links=installLinks(url);assert.equal(links.nuvio.replace('nuvio://','https://'),url);
  assert.equal(links.stremio.replace('stremio://','https://'),url);
  await assert.rejects(()=>readSettingsForm(new Request(origin+'/generate',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'x='+('a'.repeat(32768))})),/groß/);
  await assert.rejects(()=>readSettingsForm(new Request(origin+'/generate',{method:'POST',body:'{}',headers:{'content-type':'application/json'}})),/formular/i);
});
