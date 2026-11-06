/** Explicitly checked aliases; no wildcard domains or mirror-directory origin. */
export const DADDY_ORIGINS=Object.freeze([
  'https://thedaddy.li','https://thedaddy.pk','https://dlhd.pk',
  'https://dlhd.st','https://dlstreams.st','https://dlive.sx'
]);
export const DADDY_PRIMARY=DADDY_ORIGINS[0];
const hosts=new Set([...DADDY_ORIGINS.map(origin=>new URL(origin).hostname),'www.thedaddy.pk']);
const preferred=new WeakMap();
export function daddySiteUrl(raw,base){
  try{
    const url=new URL(raw,base);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&
      hosts.has(url.hostname)?url:null;
  }catch{return null;}
}
export function sameDaddyRoute(raw,base){
  const from=daddySiteUrl(base),to=daddySiteUrl(raw,base);
  return Boolean(from&&to&&from.pathname===to.pathname&&from.search===to.search);
}
export function daddyChannelPage(raw,channelId,base){
  const url=daddySiteUrl(raw,base),id=String(channelId);
  if(!url||!/^\d{1,6}$/.test(id)||Number(id)===0)return null;
  if(url.pathname==='/watch.php'&&url.search==='?id='+id)return url.href;
  return !url.search&&new RegExp('^/(?:stream|cast|watch|plus|casting|player|hub)/stream-'+id+'\\.php$')
    .test(url.pathname)?url.href:null;
}
export function daddyRequestContext({signal,timeout=7500,maxRequests=20}={}){
  const controller=new AbortController();
  const abort=()=>controller.abort(signal?.reason||new DOMException('Aborted','AbortError'));
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','TimeoutError')),timeout);
  return {signal:controller.signal,requests:0,fallbacks:0,
    take(){
      if(controller.signal.aborted)throw controller.signal.reason;
      if(this.requests>=maxRequests)throw new Error('request_limit');
      this.requests++;
    },
    close(){clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  };
}
function retryable(error){
  return error?.name==='TypeError'||error?.name==='TimeoutError'||
    error?.status===404||error?.status>=500||/^HTTP (?:404|5\d\d)$/.test(error?.message)||
    ['Homepage schedule unavailable','Invalid schema','Invalid JSON','Stale schedule'].some(code=>
      String(error?.message).startsWith(code));
}
export async function withDaddyAbort(task,signal){
  if(signal.aborted)throw signal.reason;
  let onAbort;
  const interrupted=new Promise((_,reject)=>{
    onAbort=()=>reject(signal.reason);signal.addEventListener('abort',onAbort,{once:true});
  });
  try{return await Promise.race([Promise.resolve().then(task),interrupted]);}
  finally{signal.removeEventListener('abort',onAbort);}
}
/** Retry the identical route on checked aliases, within one operation budget. */
export async function withDaddyFallback(url,fetcher,task,context,{fallback=true}={}){
  const original=daddySiteUrl(url);
  const origins=original&&fallback?[...new Set([
    preferred.get(fetcher)||original.origin,original.origin,...DADDY_ORIGINS
  ])]:[null];
  let last;
  for(let index=0;index<origins.length;index++){
    if(context.signal.aborted)throw context.signal.reason;
    const candidate=origins[index]?origins[index]+original.pathname+original.search:url;
    if(index)context.fallbacks++;
    const controller=new AbortController();
    const abort=()=>controller.abort(context.signal.reason);
    context.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','TimeoutError')),1500);
    try{
      const result=await withDaddyAbort(()=>task(candidate,controller.signal),controller.signal);
      if(context.signal.aborted)throw context.signal.reason;
      const success=daddySiteUrl(result?.url||candidate);
      if(success&&fallback)preferred.set(fetcher,success.origin);
      return result;
    }catch(error){
      if(context.signal.aborted)throw context.signal.reason;
      last=controller.signal.aborted?controller.signal.reason:error;
      if(!retryable(last))throw last;
    }finally{clearTimeout(timer);context.signal.removeEventListener('abort',abort);}
  }
  throw last;
}
