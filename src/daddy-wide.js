export const WIDE_PLAYER='https://wideiptv.top';
export const TOSSEQUIP='https://tossequip.net';
export const TOSSEQUIP_RELAY_PATH='/_tossequip/';
const SLUG=/^[A-Za-z0-9_-]{1,80}$/;
export const wideRelayTokenPattern=/^[A-Za-z0-9_-]{43}$/;
const relayFetchers=new WeakMap();

export function widePlayerPage(raw,base){
  try{
    const url=new URL(raw,base);
    if(url.origin!==WIDE_PLAYER||url.username||url.password||url.hash)return null;
    const slug=url.searchParams.get('stream');
    if(url.pathname==='/daddy.php'&&[...url.searchParams].length===1&&SLUG.test(slug||''))return url;
    if(!url.search&&url.pathname.startsWith('/player/')&&SLUG.test(url.pathname.slice('/player/'.length)))return url;
  }catch{}
  return null;
}

export function tossequipMediaUrl(raw){
  try{
    if(String(raw).length>4096)return null;
    const url=new URL(raw);
    if(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&
      /^[a-z0-9-]+\.7odxv0l067ka\.net$/.test(url.hostname)&&url.port==='8443'&&
      /^\/hls\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+\.(?:m3u8|ts|m4s|mp4)$/.test(url.pathname))return url;
  }catch{}
  return null;
}

export function withDaddyRelay(fetcher,setting){
  if(!setting)return fetcher;
  const cached=relayFetchers.get(fetcher);
  if(cached?.setting===setting)return cached.fetcher;
  let relay,token;
  try{
    const config=JSON.parse(setting);
    relay=new URL(config.origin);
    token=config.token;
    if(relay.protocol!=='https:'||relay.username||relay.password||relay.port||relay.pathname!=='/'||relay.search||relay.hash||
      typeof token!=='string'||!wideRelayTokenPattern.test(token))return fetcher;
  }catch{return fetcher;}
  const routed=(raw,options)=>{
    const headers=new Headers(options?.headers);
    const referer=headers.get('referer'),range=headers.get('range');
    const target=widePlayerPage(raw),media=referer===TOSSEQUIP+'/'&&tossequipMediaUrl(raw);
    if(!target&&!media)return fetcher(raw,options);
    const path=target?target.pathname+target.search:TOSSEQUIP_RELAY_PATH+media.host+media.pathname+media.search;
    return fetcher(relay.origin+path,{redirect:'manual',signal:options?.signal,headers:{Authorization:'Bearer '+token,
      ...(target&&referer?{'X-Daddy-Referer':referer}:{}),...(media&&range?{Range:range}:{})}});
  };
  relayFetchers.set(fetcher,{setting,fetcher:routed});
  return routed;
}
