// Exercise the actual HTTP configuration flow without private sources or app launches.
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';

export async function checkConfiguration(base,version){
  const selected=['defootball_bl3_sunday','defootball_bl1_friday'];
  async function request(path,options={}){
    const response=await fetch(new URL(path,base),{...options,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Configuration check HTTP '+response.status);
    return response;
  }
  const page=await(await request('/configure')).text();
  if(!page.includes('id="catalog-list"')||!page.includes('method="post"'))
    throw new Error('Configuration form missing');
  const form=new URLSearchParams({customize:'1',sources:''});
  for(const id of selected)form.append('catalog',id);
  const html=await(await request('/generate',{method:'POST',body:form})).text();
  const url=/<input[^>]*id="manifest-url"[^>]*value="([^"]+)"/.exec(html)?.[1];
  if(!url?.startsWith(new URL(base).origin+'/u/')||!url.endsWith('/manifest.json'))
    throw new Error('Personal import URL missing');
  for(const app of ['nuvio','stremio']){
    const href=new RegExp('<a[^>]*id="install-'+app+'"[^>]*href="([^"]+)"').exec(html)?.[1];
    if(href!==url.replace(/^https?:/,app+':'))throw new Error('Incorrect '+app+' installation URL');
  }
  const manifest=await(await request(url)).json();
  if(manifest.version!==version||JSON.stringify(manifest.catalogs.map(c=>c.id))!==JSON.stringify(selected))
    throw new Error('Personal catalog selection or order lost');
  const restored=await(await request(url.replace(/manifest.json$/,'configure'))).text();
  for(const id of selected)if(!restored.includes('value="'+id+'" checked'))throw new Error('Saved selection not restored');
  if(restored.indexOf('value="'+selected[0]+'"')>restored.indexOf('value="'+selected[1]+'"')||
    /<input[^>]*name="browser"[^>]*checked/.test(restored))throw new Error('Saved order or playback preference lost');
  const defaults=await(await request('/manifest.json')).json();
  if(defaults.catalogs[0]?.id!=='defootball_bl1'||defaults.catalogs.length<=selected.length)
    throw new Error('Personal selection affected default manifest');
  console.log(JSON.stringify({configuration:'verified',version,catalogOrder:selected,appLinks:['nuvio','stremio'],restored:true,defaultManifestUnchanged:true}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const base=new URL(process.env.WORKER_SMOKE_URL);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
    throw new Error('WORKER_SMOKE_URL must be a public HTTPS origin');
  const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  await checkConfiguration(base,version);
}
