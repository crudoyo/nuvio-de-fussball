import {accessIdPattern,accessStore,accessTokenPattern,base64url,invitationCodePattern,newAccessToken,SETUP_SESSION_SECONDS} from './private-store.js';
import {adminLogin,adminPage,configurationLogin} from './private-admin-page.js';
import {readSettingsForm} from './addon-config.js';

const COOKIE='__Secure-nuvio-admin',SESSION_SECONDS=8*3600,encoder=new TextEncoder();
const SETUP_COOKIE='__Secure-nuvio-setup';
const actions=new Set(['friend','invite','limit','block','revoke','login','logout']);
const hoursOptions=new Map([['24',24],['72',72],['168',168],['forever',null]]);
const limitOptions=new Set(['1','2','3','4']);
// Losing the explicit flag in a later deploy must not reopen a provisioned private Worker.
export const privateAccessEnabled=env=>env.PRIVATE_DB!==undefined||env.PRIVATE_ADMIN_KEY!==undefined||
  (env.PRIVATE_ACCESS!==undefined&&String(env.PRIVATE_ACCESS).toLowerCase()!=='false');
export const isPrivatePath=path=>/^\/(?:a|e|admin|configure)(?:\/|$)/.test(path);
const text=(body,status)=>new Response(body,{status,headers:{'content-type':'text/plain; charset=utf-8'}});
const html=(body,status=200)=>new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8'}});
const missing=()=>text('Nicht gefunden',404);
const forbidden=()=>text('Zugriff verweigert',403);
const sameOrigin=(request,url)=>request.headers.get('origin')===url.origin;
function fixedEqual(a,b){
  if(typeof a!=='string'||a.length!==b.length)return false;
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}
async function sign(secret,body){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return base64url(await crypto.subtle.sign('HMAC',key,encoder.encode('nuvio-admin-v1:'+body)));
}
function cookie(name,value,path,seconds){
  return name+'='+value+'; Path='+path+'; Secure; HttpOnly; SameSite=Strict; Max-Age='+seconds;
}
function readCookie(request,name){
  return (request.headers.get('cookie')||'').split(';')
    .map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1)||'';
}
async function loggedIn(request,secret){
  const token=readCookie(request,COOKIE);
  const found=/^(\d{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token);
  const now=Math.floor(Date.now()/1000),expires=Number(found?.[1]);
  return Boolean(found&&expires>now&&expires<=now+SESSION_SECONDS&&fixedEqual(found[3],await sign(secret,found[1]+'.'+found[2])));
}
function redirectWithCookie(path,setCookie){
  return new Response(null,{status:303,headers:{location:path,'set-cookie':setCookie}});
}
export function protectPrivateResponse(response){
  const headers=new Headers(response.headers);
  headers.set('cache-control','private, no-store');
  headers.set('referrer-policy','no-referrer');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  headers.set('x-content-type-options','nosniff');
  if(headers.get('content-type')?.startsWith('text/html')){
    // no-referrer would turn the Origin of ordinary HTML form POSTs into "null".
    // same-origin keeps the CSRF check functional and sends no referrer off-site.
    headers.set('referrer-policy','same-origin');
    headers.set('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  }
  return new Response(response.body,{status:response.status,headers});
}
async function handleAdmin(request,url,store,secret){
  if(request.method==='GET'&&url.pathname==='/admin')
    return html(await loggedIn(request,secret)?adminPage(await store.list()):adminLogin());
  const action=url.pathname.slice('/admin/'.length);
  if(request.method!=='POST'||!actions.has(action))return missing();
  if(!sameOrigin(request,url))return forbidden();
  if(action!=='login'&&!await loggedIn(request,secret))return forbidden();
  if(action==='logout')return redirectWithCookie('/admin',cookie(COOKIE,'','/admin',0));
  let form;
  try{form=await readSettingsForm(request);}catch{return text('Ungültiges Formular',400);}
  if(action==='login'){
    if(!fixedEqual(form.get('key'),secret))return html(adminLogin('Schlüssel stimmt nicht.'),403);
    const body=(Math.floor(Date.now()/1000)+SESSION_SECONDS)+'.'+newAccessToken();
    return redirectWithCookie('/admin',cookie(COOKIE,body+'.'+await sign(secret,body),'/admin',SESSION_SECONDS));
  }
  const friend=form.get('friend')||'',slot=form.get('slot')||'',limit=form.get('limit');
  const hours=hoursOptions.get(form.get('hours'));
  const show=async (message='',status=200,invite)=>html(adminPage(await store.list(),{
    message,...(invite?{configureUrl:url.origin+'/configure',invitationCode:invite.token,expires:invite.expires}:{})}),status);
  if(action==='friend'){
    const name=(form.get('name')||'').trim();
    if(!name||name.length>48||!limitOptions.has(limit)||hours===undefined)
      return show('Bitte Namen, Schlüsselanzahl und Gültigkeit prüfen.',400);
    return show('',201,await store.createFriend(name,Number(limit),hours));
  }
  if(!accessIdPattern.test(friend))return text('Ungültiger Freund',400);
  if(action==='invite'){
    if(hours===undefined)return text('Ungültige Gültigkeit',400);
    const invite=await store.invite(friend,hours);
    return invite?show('',201,invite):show('Kein freier Platz oder Zugang gesperrt.',409);
  }
  if(action==='limit'){
    if(!limitOptions.has(limit))return text('Ungültiges Limit',400);
    return await store.setLimit(friend,Number(limit))?show('Limit gespeichert.'):show('Erst Plätze freigeben, dann das Limit senken.',409);
  }
  if(action==='block'){
    const blocked=form.get('blocked');
    if(!['0','1'].includes(blocked))return text('Ungültiger Status',400);
    return await store.setBlocked(friend,blocked==='1')?show(blocked==='1'?'Zugang gesperrt.':'Zugang freigegeben.'):missing();
  }
  if(!accessIdPattern.test(slot))return text('Ungültiger Geräteplatz',400);
  return await store.revoke(friend,slot)?show():missing();
}
async function handleConfigure(request,url,store,addon){
  const posting=request.method==='POST';
  if(posting&&!sameOrigin(request,url))return forbidden();
  if(url.pathname==='/configure/login'&&posting){
    let code;
    try{code=(await readSettingsForm(request)).get('code')?.trim()||'';}
    catch{return html(configurationLogin('Ungültiges Formular.'),400);}
    const session=invitationCodePattern.test(code)?await store.startSetup(code):null;
    if(!session)return html(configurationLogin('Einmalpasswort ungültig oder bereits verwendet.'),403);
    return redirectWithCookie('/configure',cookie(SETUP_COOKIE,session,'/configure',SETUP_SESSION_SECONDS));
  }
  if(url.pathname!=='/configure'||!['GET','POST'].includes(request.method))return missing();
  const session=readCookie(request,SETUP_COOKIE);
  const setup=accessTokenPattern.test(session)?await store.setup(session):null;
  if(!setup){
    const message=session?'Bitte eine neue Einladung anfordern.':'';
    return html(configurationLogin(message),posting?403:200);
  }
  const response=await addon({invite:{name:setup.name,action:'/configure',claimed:true,activate:async()=>{
    const key=await store.finishSetup(session);
    return key?'/a/'+key:null;
  }}});
  if(posting&&response.ok)response.headers.append('set-cookie',cookie(SETUP_COOKIE,'','/configure',0));
  return response;
}
export async function handlePrivateAccess(request,env,addon){
  const url=new URL(request.url),path=url.pathname;
  if(!isPrivatePath(path))return protectPrivateResponse(missing());
  // HTTP is useful only for the local Wrangler test environment.
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return protectPrivateResponse(missing());
  if(!env.PRIVATE_DB||!accessTokenPattern.test(env.PRIVATE_ADMIN_KEY||''))
    return protectPrivateResponse(text('Privater Zugang vorübergehend nicht verfügbar',503));
  try{
    const store=accessStore(env.PRIVATE_DB);
    let response;
    if(path==='/admin'||path.startsWith('/admin/')){
      response=await handleAdmin(request,url,store,env.PRIVATE_ADMIN_KEY);
    }else if(path==='/configure'||path==='/configure/login'){
      response=await handleConfigure(request,url,store,addon);
    }else if(path.startsWith('/e/')){
      const token=path.slice(3);
      if(!accessTokenPattern.test(token)||!['GET','POST'].includes(request.method))response=missing();
      else if(request.method==='POST'&&!sameOrigin(request,url))response=forbidden();
      else{
        const invite=await store.invitation(token);
        response=invite?await addon({invite:{name:invite.name,action:path,activate:async()=>{
          const key=await store.activate(token);return key?'/a/'+key:null;
        }}}):missing();
      }
    }else{
      const match=/^\/a\/([A-Za-z0-9_-]{43})(\/.*)$/.exec(path);
      if(!match)response=missing();
      else if(request.method==='POST'&&!sameOrigin(request,url))response=forbidden();
      else{
        const device=await store.device(match[1]);
        response=!device?missing():device.blocked||device.revoked_at!==null?forbidden():
          await addon({accessPrefix:'/a/'+match[1]});
      }
    }
    return protectPrivateResponse(response);
  }catch{
    // Never include a request URL, key, or SQL diagnostic in an error response.
    return protectPrivateResponse(text('Privater Zugang vorübergehend nicht verfügbar',503));
  }
}
