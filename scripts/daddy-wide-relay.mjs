import {timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {DADDY_PRIMARY,daddyChannelPage,daddySiteUrl} from '../src/daddy-domains.js';
import {readBounded} from '../src/daddy-media.js';
import {WIDE_PLAYER,widePlayerPage,wideRelayTokenPattern} from '../src/daddy-wide.js';

const token=process.env.DADDY_WIDE_RELAY_TOKEN;
if(!token||!wideRelayTokenPattern.test(token))throw new Error('DADDY_WIDE_RELAY_TOKEN must be 32 random bytes encoded as base64url');
const expected=Buffer.from('Bearer '+token);
const agent='Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

createServer(async (request,response)=>{
  const target=widePlayerPage(request.url,WIDE_PLAYER);
  const supplied=Buffer.from(request.headers.authorization||'');
  response.setHeader('Cache-Control','no-store');
  if(request.method!=='GET'||!target||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
    response.writeHead(404).end();return;
  }
  const wrapper=target.pathname==='/daddy.php';
  const parent=daddySiteUrl(request.headers['x-daddy-referer']);
  const channelId=parent&&/(?:stream-|\bid=)([1-9]\d{0,5})(?:\.php)?$/.exec(parent.pathname+parent.search)?.[1];
  const referer=wrapper
    ?(channelId&&daddyChannelPage(parent,channelId)||DADDY_PRIMARY+'/')
    :WIDE_PLAYER+'/daddy.php?stream='+target.pathname.slice('/player/'.length);
  try{
    const source=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(4500),
      headers:{'User-Agent':agent,Referer:referer,'Cache-Control':'no-store'}});
    if(!source.ok){
      await source.body?.cancel();response.writeHead(source.status>=400?source.status:502).end();return;
    }
    const page=await readBounded(source.body,wrapper?4*1024*1024:512*1024);
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':page.length}).end(page);
  }catch{response.writeHead(502).end();}
}).listen(Number(process.env.DADDY_WIDE_RELAY_PORT||18797),'127.0.0.1');
