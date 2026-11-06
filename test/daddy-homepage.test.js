import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDaddyHomepage} from '../src/daddy-homepage.js';
import {getDaddySchedule,parseUkScheduleDate} from '../src/daddylive.js';

const freshDay=new Date();
const day=freshDay.getUTCDate();
const month=freshDay.toLocaleString('en-US',{month:'short',timeZone:'UTC'});
const year=freshDay.getUTCFullYear();
const dateLabel='Wednesday '+String(day).padStart(2,'0')+'th '+month+' '+year+' - Schedule Time UK GMT';
const site=[
'<html><body><section class="schedule__day"><h3 class="schedule__dayTitle">',
dateLabel,
'</h3><div class="schedule__category"><div class="card__meta">All Soccer Events ⚽</div>',
'<div class="schedule__event"><div class="schedule__time">14:30</div>',
'<h4 class="schedule__eventTitle">Bundesliga : Borussia Dortmund 🇩🇪 vs SV Elversberg 🇩🇪</h4>',
'<div class="schedule__channels">',
'<a href="/watch.php?id=302">Sport Channel 1</a>',
'<a href="/watch.php?id=402">Sport Channel 2</a>',
'<a href="/watch.php?id=302">Duplicate</a>',
'</div></div>',
'<div class="schedule__event"><div class="schedule__time">16:00</div>',
'<h4 class="schedule__eventTitle">Bundesliga : HSV vs Bayern</h4>',
'<div class="schedule__channels"><a href="/watch.php?id=303">Sky Sport</a></div></div></div>',
'<div class="schedule__category"><div class="card__meta">Tennis</div>',
'<div class="schedule__event"><div class="schedule__time">18:00</div>',
'<h4 class="schedule__eventTitle">Tennis final</h4>',
'<div class="schedule__channels"><a href="/watch.php?id=444">Tennis TV</a>',
'</div></div></div></section></body></html>'
].join('');
const asText=(body,status=200,type='text/html')=>new Response(body,{
  status,headers:{'content-type':type}
});
const asJson=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
test('homepage HTML parser extracts current soccer fixtures and channel IDs',()=>{
  const data=parseDaddyHomepage(site);
  assert(data);
  assert.deepEqual(Object.keys(data),[dateLabel]);
  assert.equal(data[dateLabel]['All Soccer Events'].length,2);
  assert.deepEqual(data[dateLabel]['All Soccer Events'][0].channels.map(x=>x.channel_id),['302','402']);
  assert(data[dateLabel]['All Soccer Events'][0].event.includes('Borussia Dortmund'));
  assert(!JSON.stringify(data).includes('Tennis final'));
});
test('abbreviated month dates in actual DaddyLive headings parse as GMT',()=>{
  assert.equal(parseUkScheduleDate('Wednesday 04th Nov 2026 - Schedule Time UK GMT','19:45'),
    '2026-11-04T19:45:00.000Z');
});
test('fresh homepage is preferred without waiting for the obsolete JSON feeds',async()=>{
  const older={'Thursday 20th March 2025 - Schedule Time UK GMT':{
    Soccer:[{time:'23:00',event:'Paraguay vs Chile',channels:[{channel_id:'555'}]}]
  }};
  const calls=[];
  const result=await getDaddySchedule({},async (url,options)=>{
    const u=String(url);calls.push(u);
    assert.equal(options.redirect,'manual');
    if(u.includes('/schedule/schedule-generated.json'))return asJson(older);
    if(u==='https://thedaddy.li/')return asText(site);
    return asText('Not found',404);
  });
  assert.equal(result.reachable,true);
  assert.equal(result.source,'DaddyLive aktuelle Webseite');
  assert.equal(result.footballEvents,2);
  assert.deepEqual(result.attempts,[]);
  assert(!calls.some(url=>url.includes('/schedule/')));
  assert(calls.includes('https://thedaddy.li/'));
});
test('a stale JSON feed without an accessible homepage does not claim availability',async()=>{
  const older={'Thursday 20th March 2025 - Schedule Time UK GMT':{
    Soccer:[{time:'23:00',event:'Paraguay vs Chile',channels:[{channel_id:'555'}]}]
  }};
  const result=await getDaddySchedule({},async url=>{
    if(String(url).includes('/schedule/schedule-generated.json'))return asJson(older);
    return asText('Forbidden',403);
  });
  assert.equal(result.reachable,false);
  assert.equal(result.footballEvents,0);
  assert.equal(result.attempts.length,3);
  assert.equal(result.attempts[0].reason,'HTTP 403');
  assert(result.attempts.slice(1).every(x=>x.reason==='Stale schedule (2025-03-20)'));
});
test('HTML without schedule markup is not treated as valid data',()=>{
  assert.equal(parseDaddyHomepage('<html><body>Login required</body></html>'),null);
});
