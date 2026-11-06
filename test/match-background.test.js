import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Resvg,initWasm} from '@resvg/resvg-wasm';
import {makeMatchBackground} from '../src/graphics.js';
import {handle,encodeConfig} from '../src/worker.js';

const wasm=await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm',import.meta.url));
await initWasm(wasm);
const solid=color=>new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${color}"/></svg>`).render().asPng();
const homeBadge=solid('#ff0000'),awayBadge=solid('#00ff00');
const game={matchID:998877,matchDateTimeUTC:new Date().toISOString(),
  group:{groupOrderID:9,groupName:'9. Spieltag'},
  team1:{teamName:'Detail Home',teamIconUrl:'https://crests.example/detail-home.png'},
  team2:{teamName:'Detail Away',teamIconUrl:'https://crests.example/detail-away.png'}};
const fetcher=async url=>{
  if(String(url).includes('/getavailableleagues/'))return new Response('[]');
  if(String(url).includes('/getmatchdata/bl1/'))return new Response(JSON.stringify([game]));
  return new Response(String(url).includes('detail-home.png')?homeBadge:awayBadge,{headers:{'content-type':'image/png'}});
};
const render=svg=>new Resvg(svg,{font:{loadSystemFonts:false}}).render();

test('both full crests survive real rasterization and mobile/TV center crops with client zoom',async()=>{
  const svg=await makeMatchBackground(game,fetcher);
  assert(!svg.includes(game.team1.teamName),'app supplies its own title');
  const output=render(svg),pixels=output.pixels;
  assert.equal(output.width,1280);
  assert.equal(output.height,720);
  const boxes=[{minX:Infinity,maxX:0,minY:Infinity,maxY:0,count:0},
    {minX:Infinity,maxX:0,minY:Infinity,maxY:0,count:0}];
  for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
    const p=(y*output.width+x)*4;
    const kind=pixels[p]>250&&pixels[p+1]<5?0:pixels[p+1]>250&&pixels[p]<5?1:-1;
    if(kind<0)continue;
    const box=boxes[kind];box.minX=Math.min(box.minX,x);box.maxX=Math.max(box.maxX,x);
    box.minY=Math.min(box.minY,y);box.maxY=Math.max(box.maxY,y);box.count++;
  }
  for(const box of boxes){
    assert(box.count>24000,'both decoded club images must actually be visible');
    for(const aspect of [0.7,0.75,1,16/9,2.4]){
      // Nuvio uses center-cover, with an additional 1.08x hero zoom.
      const width=Math.min(1280,720*aspect)/1.08;
      const height=Math.min(720,1280/aspect)/1.08;
      assert(box.minX>=(1280-width)/2&&box.maxX<(1280+width)/2,`horizontal crop ${aspect}`);
      assert(box.minY>=(720-height)/2&&box.maxY<(720+height)/2,`vertical crop ${aspect}`);
    }
  }
});

test('catalog and personal detail metadata use a separate, versioned background PNG',async()=>{
  const prefix='/u/'+encodeConfig(['https://sports.example/manifest.json']);
  for(const path of ['/catalog/tv/defootball_bl1.json',prefix+'/meta/tv/defootball_bl1_998877.json']){
    const reply=await handle(new Request('https://addon.test'+path),{SEASON:'2026'},fetcher);
    const body=await reply.json(),meta=body.meta||body.metas[0];
    assert.equal(reply.status,200);
    assert.notEqual(meta.poster,meta.background);
    assert.equal(meta.background,`https://addon.test${path.startsWith(prefix)?prefix:''}/background/bl1/998877.png?v=0.4.23`);
    let observed;
    const image=await handle(new Request(meta.background),{SEASON:'2026',
      __testPngRenderer:async svg=>{observed=render(svg);return observed.asPng();}},fetcher);
    assert.equal(image.status,200);
    assert.equal(image.headers.get('content-type'),'image/png');
    assert.equal(image.headers.get('cache-control'),'public, max-age=900');
    assert.equal(observed.width,1280);
    assert.equal(observed.height,720);
    const bytes=Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16),1280);
    assert.equal(bytes.readUInt32BE(20),720);
  }
});
