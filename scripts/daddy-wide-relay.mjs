import {timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DADDY_PRIMARY,daddyChannelPage,daddySiteUrl} from '../src/daddy-domains.js';
import {readBounded} from '../src/daddy-media.js';
import {WIDE_PLAYER,TOSSEQUIP,TOSSEQUIP_RELAY_PATH,tossequipMediaUrl,widePlayerPage,wideRelayTokenPattern} from '../src/daddy-wide.js';

const token=process.env.DADDY_WIDE_RELAY_TOKEN;
if(!token||!wideRelayTokenPattern.test(token))throw new Error('DADDY_WIDE_RELAY_TOKEN must be 32 random bytes encoded as base64url');
const expected=Buffer.from('Bearer '+token);
const agent='Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

createServer(async (request,response)=>{
  const supplied=Buffer.from(request.headers.authorization||'');
  response.setHeader('Cache-Control','no-store');
  if(request.method!=='GET'||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
    response.writeHead(404).end();return;
  }
  const page=widePlayerPage(request.url,WIDE_PLAYER);
  const media=request.url.startsWith(TOSSEQUIP_RELAY_PATH)&&tossequipMediaUrl('https://'+request.url.slice(TOSSEQUIP_RELAY_PATH.length));
  if(!page&&!media){
    response.writeHead(404).end();return;
  }
  const wrapper=page?.pathname==='/daddy.php';
  const parent=daddySiteUrl(request.headers['x-daddy-referer']);
  const channelId=parent&&/(?:stream-|\bid=)([1-9]\d{0,5})(?:\.php)?$/.exec(parent.pathname+parent.search)?.[1];
  const referer=media?TOSSEQUIP+'/':wrapper
    ?(channelId&&daddyChannelPage(parent,channelId)||DADDY_PRIMARY+'/')
    :WIDE_PLAYER+'/daddy.php?stream='+page.pathname.slice('/player/'.length);
  const upstreamHeaders={'User-Agent':agent,Referer:referer,'Cache-Control':'no-store'};
  if(media){
    upstreamHeaders.Origin=TOSSEQUIP;
    upstreamHeaders['Accept-Encoding']='identity';
    if(request.headers.range==='bytes=0-4095')upstreamHeaders.Range=request.headers.range;
  }
  const cancel=new AbortController();
  response.once('close',()=>cancel.abort());
  try{
    const source=await fetch(page||media,{redirect:'manual',signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(media?8000:4500)]),
      headers:upstreamHeaders});
    if(!source.ok){
      await source.body?.cancel();response.writeHead(source.status>=400?source.status:502).end();return;
    }
    if(media){
      const headers={};
      for(const name of ['content-type','content-range','accept-ranges']){
        const value=source.headers.get(name);if(value)headers[name]=value;
      }
      const length=source.headers.get('content-length');
      if(length&&!source.headers.has('content-encoding'))headers['content-length']=length;
      response.writeHead(source.status,headers);
      await pipeline(Readable.fromWeb(source.body),response);
      return;
    }
    const body=await readBounded(source.body,wrapper?4*1024*1024:512*1024);
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':body.length}).end(body);
  }catch{
    if(response.headersSent)response.destroy();
    else if(!response.destroyed)response.writeHead(502).end();
  }
}).listen(Number(process.env.DADDY_WIDE_RELAY_PORT||18797),'127.0.0.1');
