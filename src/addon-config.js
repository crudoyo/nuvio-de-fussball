/** Portable, per-install settings. Existing {m:[...]} URLs remain compatible. */
export const MAX_CONFIG_LENGTH=12000;
const MAX_SOURCES=8,MAX_CATALOGS=256;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const catalogId=/^defootball_[a-z0-9_-]{2,90}$/;
const invalid=()=>{throw new Error('Ungültige Add-on-Konfiguration.');};
function unsafeHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':');
}
export function manifestUrl(input){
  try{
    const url=new URL(String(input??'').trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!url.pathname.endsWith('/manifest.json')||unsafeHost(url.hostname)||url.href.length>512)return null;
    return url.href;
  }catch{return null;}
}
export function safeUrls(values){return [...new Set(values.map(manifestUrl).filter(Boolean))].slice(0,MAX_SOURCES);}
export function normalizeSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.m))invalid();
  const result={m:safeUrls(value.m)};
  if(Object.hasOwn(value,'c')){
    if(!Array.isArray(value.c)||value.c.length>MAX_CATALOGS||value.c.some(id=>typeof id!=='string'||!catalogId.test(id)))invalid();
    result.c=[...new Set(value.c)];
  }
  if(Object.hasOwn(value,'b')){if(typeof value.b!=='boolean')invalid();result.b=value.b;}
  return result;
}
export function encodeSettings(value){
  const data=JSON.stringify(normalizeSettings(value));
  const encoded=btoa(String.fromCharCode(...encoder.encode(data))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(encoded.length>MAX_CONFIG_LENGTH)throw new Error('Die Auswahl ist zu umfangreich. Bitte weniger Kataloge oder Streamquellen auswählen.');
  return encoded;
}
export function decodeSettings(encoded){
  if(typeof encoded!=='string'||encoded.length>MAX_CONFIG_LENGTH||!/^[A-Za-z0-9_-]+$/.test(encoded))invalid();
  try{
    return normalizeSettings(JSON.parse(decoder.decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4)),c=>c.charCodeAt(0)))));
  }catch{invalid();}
}
export const encodeConfig=sources=>encodeSettings({m:sources});
export const decodeConfig=encoded=>decodeSettings(encoded).m;
export function selectedCatalogs(catalogs,settings={}){
  if(!settings.c)return catalogs;
  const byId=new Map(catalogs.map(c=>[c.id,c]));
  return settings.c.map(id=>byId.get(id)).filter(Boolean);
}
export function configuredPlayback(env,settings={}){
  return settings.b===false?{...env,NATIVE_ONLY:'true',DADDY_WEB_PLAYERS:'false'}:env;
}
export function installLinks(url){
  const parsed=new URL(url);
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||!parsed.pathname.endsWith('/manifest.json'))invalid();
  const rest=url.slice(url.indexOf('://')+3);
  return {manifest:url,nuvio:'nuvio://'+rest,stremio:'stremio://'+rest,configure:url.replace(/manifest\.json$/,'configure')};
}
export function settingsFromForm(form,catalogs){
  const raw=(form.get('sources')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(raw.length>MAX_SOURCES)throw new Error('Bitte höchstens acht Streamquellen eintragen.');
  for(const [i,url] of raw.entries())if(!manifestUrl(url))throw new Error(`Streamquelle ${i+1} braucht eine gültige HTTPS-Adresse mit /manifest.json.`);
  const selected=form.getAll('catalog');
  if(!selected.length)throw new Error('Bitte mindestens einen Katalog auswählen.');
  // The default order stays compact and automatically includes future catalogs.
  const defaults=JSON.stringify(selected)===JSON.stringify(catalogs.map(c=>c.id));
  return normalizeSettings({m:raw,...(defaults?{}:{c:selected}),b:form.get('browser')==='on'});
}
export async function readSettingsForm(request){
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type')||''))throw new Error('Bitte das Konfigurationsformular verwenden.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Das Formular ist leer.');
  const parts=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>32768)throw new Error('Das Formular ist zu groß. Bitte die Auswahl verkleinern.');parts.push(value);}
  }finally{await reader.cancel().catch(()=>{});}
  const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
  return new URLSearchParams(decoder.decode(data));
}
