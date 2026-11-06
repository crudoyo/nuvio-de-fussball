import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Resvg,initWasm} from '@resvg/resvg-wasm';
import {handle} from '../src/worker.js';

const pngSignature=Uint8Array.of(137,80,78,71,13,10,26,10);
const fixture={
  matchID:62501,
  matchDateTimeUTC:'2026-11-06T20:30:00Z',
  team1:{teamName:'FC Bayern München'},
  team2:{teamName:'Borussia Dortmund'}
};
const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
const fetcher=async url=>{
  const u=String(url);
  if(u.includes('/getavailableleagues/'))return new Response('[]');
  if(u.includes('/getmatchdata/bl1/'))return new Response(JSON.stringify([fixture]));
  if(u.includes('/i/teamlogos/')||u.includes('/images/media/team/badge/'))
    return new Response(Uint8Array.from(Buffer.from(tinyPng,'base64')),
      {headers:{'content-type':'image/png'}});
  return new Response('not found',{status:404});
};

test('all football catalog posters now advertise versioned PNG, not SVG',async()=>{
  const request=new Request('https://addon.test/catalog/tv/defootball_bl1.json');
  const reply=await handle(request,{SEASON:'2026'},fetcher);
  const result=await reply.json();
  assert.equal(reply.status,200);
  const [card]=result.metas;
  assert.match(card.poster,/\/poster\/bl1\/62501\.png\?v=0\.4\.15$/);
  assert.equal(card.background,card.poster);
});

test('poster PNG endpoint emits raster Content-Type and supports SVG compatibility',async()=>{
  let observed='';
  const renderer=async svg=>{
    observed=svg;
    return pngSignature;
  };
  const png=await handle(new Request('https://addon.test/poster/bl1/62501.png'),
    {SEASON:'2026',__testPngRenderer:renderer},fetcher);
  assert.equal(png.status,200);
  assert.match(png.headers.get('content-type'),/^image\/png/);
  assert.deepEqual(new Uint8Array(await png.arrayBuffer()),pngSignature);
  assert.match(observed,/<svg/);
  const svg=await handle(new Request('https://addon.test/poster/bl1/62501.svg'),
    {SEASON:'2026'},fetcher);
  assert.equal(svg.status,200);
  assert.match(svg.headers.get('content-type'),/image\/svg\+xml/);
});

test('resvg WASM encodes an SVG with embedded club badge as real PNG',async()=>{
  const wasm=await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm',import.meta.url));
  await initWasm(wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40">'+
    '<rect width="60" height="40" fill="#254d4d"/>'+
    '<image href="data:image/png;base64,'+tinyPng+'" x="6" y="5" width="30" height="30"/>'+
    '</svg>';
  const output=new Resvg(svg,{font:{loadSystemFonts:false}}).render().asPng();
  assert.deepEqual(Array.from(output.slice(0,8)),Array.from(pngSignature));
  // PNG IHDR holds the original SVG dimensions.
  const img=Buffer.from(output);
  assert.equal(img.readUInt32BE(16),60);
  assert.equal(img.readUInt32BE(20),40);
});
