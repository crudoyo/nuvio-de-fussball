import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/worker.js';
import {getDaddySchedule} from '../src/daddylive.js';

const dt=new Date(Date.now()+3*3600000);
const yyyy=dt.getUTCFullYear(), mm=dt.getUTCMonth(), dd=dt.getUTCDate();
const months=['January','February','March','April','May','June','July','August',
  'September','October','November','December'];
const dayHeader='Wednesday '+dd+'th '+months[mm]+' '+yyyy+' - Schedule Time UK GMT';
const hh=String(dt.getUTCHours()).padStart(2,'0');
const min=String(dt.getUTCMinutes()).padStart(2,'0');
const nowISO=new Date(Date.UTC(yyyy,mm,dd,Number(hh),Number(min))).toISOString();
const body={
  [dayHeader]:{'Soccer':[
    {time:hh+':'+min,event:'UEFA Champions League : Borussia Dortmund vs Real Betis',
      channels:[{channel_id:'302',channel_name:'Test Channel'}]},
    {time:hh+':'+min,event:'UEFA Champions League : Arsenal vs Inter',
      channels:[{channel_id:'401',channel_name:'Other Channel'}]}
  ]},
  'Tuesday 28th April 2026 - Schedule Time UK GMT':{
    Soccer:[{time:'12:00',event:'Old Historical Match vs Other Team',
      channels:[{channel_id:'333',channel_name:'Old Channel'}]}]
  }
};
const response=value=>new Response(JSON.stringify(value),
  {headers:{'content-type':'application/json'}});
test('public recent schedule excludes 2026 historical outliers',async()=>{
  const status=await getDaddySchedule({},async()=>response(body));
  assert.equal(status.reachable,true);
  assert.equal(status.footballEvents,2);
  assert.equal(status.channelCount,2);
  assert(status.events.every(x=>Date.parse(x.startTime)>Date.now()-7*86400000));
});
test('direct football lookup matches today Champions League and shows matching channel',async()=>{
  const query=new URLSearchParams({
    home:'Borussia Dortmund',away:'Real Betis',kickoff:nowISO
  });
  const url='https://example.workers.dev/debug/daddy-lookup.json?'+query;
  const result=await handle(new Request(url),{},async()=>response(body));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.matchedEvents.length,1);
  assert.equal(data.matchedEvents[0].channels[0].id,'302');
  assert.equal(data.matchDiagnosis.assessment,'matched');
  assert.equal(data.matchDiagnosis.scheduleCoverage.totalFootballEvents,2);
  assert.equal(data.matchDiagnosis.scheduleCoverage.datesUTC.length,1);
  assert(!JSON.stringify(data).includes('stream-302.php'));
});
test('direct lookup rejects missing or malformed kickoff parameters',async()=>{
  const testUrl='https://example.workers.dev/debug/daddy-lookup.json?home=Yes&away=No&kickoff=not-a-date';
  const res=await handle(new Request(testUrl),{},async()=>response(body));
  assert.equal(res.status,400);
});
