export const WIDE_PLAYER='https://wideiptv.top';
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

export function withWidePlayerRelay(fetcher,setting){
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
    const target=widePlayerPage(raw);
    if(!target)return fetcher(raw,options);
    const referer=new Headers(options?.headers).get('referer');
    return fetcher(relay.origin+target.pathname+target.search,{redirect:'manual',signal:options?.signal,
      headers:{Authorization:'Bearer '+token,...(referer?{'X-Daddy-Referer':referer}:{})}});
  };
  relayFetchers.set(fetcher,{setting,fetcher:routed});
  return routed;
}
