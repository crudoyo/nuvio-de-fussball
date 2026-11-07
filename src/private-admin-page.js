import {NO_INVITE_EXPIRY} from './private-store.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'}).format(value);
const isExpired=(slot,now)=>slot.activated_at===null&&slot.expires_at!==NO_INVITE_EXPIRY&&slot.expires_at<=now;
const counts=(slots,now)=>slots.filter(slot=>slot.revoked_at===null&&!isExpired(slot,now)).length;
const validity=expires=>expires===NO_INVITE_EXPIRY?'ohne Ablaufdatum':'bis '+date(expires)+' (Berlin)';
const events={friend_created:'Freund angelegt',friend_blocked:'Zugang gesperrt',friend_unblocked:'Zugang freigegeben',
  limit_changed:'Geräteplätze geändert',invite_created:'Einladung erstellt',device_activated:'Gerät aktiviert',
  invite_cancelled:'Einladung zurückgezogen',device_revoked:'Schlüssel gesperrt'};
const style=`
:root{color-scheme:dark;background:#08151e;color:#eff8f6;font:16px/1.55 system-ui,sans-serif}*{box-sizing:border-box}body{margin:0}main{max-width:940px;margin:auto;padding:26px 20px 42px}h1,h2,h3,p{margin:0 0 .65rem}h1{font-size:clamp(26px,5vw,39px);line-height:1.15}h2{font-size:20px}h3{font-size:16px}.brand{color:#9ce4c2;font-weight:700;letter-spacing:.04em;font-size:13px}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.panel{padding:18px;border:1px solid #29414e;border-radius:13px;background:#10232e;margin-top:16px}.actions{display:flex;align-items:end;gap:10px;flex-wrap:wrap}form{margin:0}label{display:grid;gap:5px;color:#a9c1ca;font-size:14px}button,input,select{font:inherit;border:1px solid #4c6876;border-radius:8px;color:#eff8f6;background:#081923;padding:9px 11px;min-height:42px;max-width:100%}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}.primary{color:#09251c;background:#9ce4c2;border-color:#9ce4c2;font-weight:650}.danger{color:#ffb7a9}input{width:100%;min-width:0}.message{color:#9ce4c2}.hint{color:#a9c1ca;font-size:14px}.slot{border-top:1px solid #29414e;padding:10px 0;margin-top:8px}.slot p{margin:0}.heading{padding:16px 0 8px}.login{max-width:560px}.login form{display:grid;gap:12px}summary{cursor:pointer}ol{padding-left:22px}a{color:#9ce4c2}.wide{width:100%}
`;
function page(content,title='Verwaltung',script=''){
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deutscher Fußball · ${escape(title)}</title><style>${style}</style></head><body><main>${content}</main>${script}</body></html>`;
}
const form=(action,content,hidden={})=>`<form method="post" action="${escape(action)}" class="actions">${Object.entries(hidden).map(([name,value])=>`<input type="hidden" name="${escape(name)}" value="${escape(value)}">`).join('')}${content}</form>`;
const limits=value=>[1,2,3,4].map(n=>`<option value="${n}"${n===value?' selected':''}>${n}</option>`).join('');
const expiry=`<label>Gültig für<select name="hours"><option value="24">24 Stunden</option><option value="72" selected>72 Stunden</option><option value="168">7 Tage</option><option value="forever">Immer</option></select></label>`;
export function adminLogin(message=''){
  return page(`<section class="login"><p class="brand">DEUTSCHER FUSSBALL</p><h1>Privater Zugang</h1><div class="panel"><h2>Verwaltung anmelden</h2>${message?`<p class="danger" role="alert">${escape(message)}</p>`:''}
    <form method="post" action="/admin/login"><label>Verwaltungsschlüssel<input type="password" name="key" autocomplete="current-password" maxlength="43" required></label><button class="primary" type="submit">Anmelden</button></form></div></section>`,'Anmelden');
}
export function adminPage(data,{message='',inviteUrl='',expires}={}){
  const {friends,slots,audit,now}=data;
  const friendRows=friends.map(friend=>{
    const own=slots.filter(s=>s.friend_id===friend.id),used=counts(own,now);
    const slotRows=own.map((slot,index)=>{
      const active=slot.activated_at!==null,expired=isExpired(slot,now);
      const status=slot.revoked_at!==null?(active?'Schlüssel gesperrt':'Einladung zurückgezogen'):
        expired?'Einladung abgelaufen':friend.blocked?(active?'Zugang pausiert':'Einladung pausiert'):active?'Schlüssel aktiv':'Einladung offen';
      const action=slot.revoked_at===null&&!expired?form('/admin/revoke',
        `<button class="danger" type="submit">${active?'Schlüssel sperren':'Einladung zurückziehen'}</button>`,{friend:friend.id,slot:slot.id}):'';
      const label=active?'Schlüssel '+(index+1):status;
      let detail=active?status:'';
      if(!active&&!expired&&slot.revoked_at===null)detail=validity(slot.expires_at);
      return `<div class="slot row"><div><h3>${escape(label)}</h3>${detail?`<p class="hint">${escape(detail)}</p>`:''}</div>${action}</div>`;
    }).join('');
    return `<section class="panel" id="friend-${escape(friend.id)}"><div class="row"><div><h2>${escape(friend.name)}</h2><p class="hint">${used} / ${friend.slot_limit} belegt · ${friend.blocked?'Gesperrt':'Freigegeben'}</p></div>
      ${form('/admin/block',`<button class="${friend.blocked?'':'danger'}" type="submit">${friend.blocked?'Zugang freigeben':'Zugang sperren'}</button>`,{friend:friend.id,blocked:friend.blocked?'0':'1'})}</div>
      ${slotRows}
      <div class="row" style="margin-top:14px">${form('/admin/limit',`<label>Max. Schlüssel<select name="limit">${limits(friend.slot_limit)}</select></label><button type="submit">Limit speichern</button>`,{friend:friend.id})}
      ${!friend.blocked&&used<friend.slot_limit?form('/admin/invite',expiry+'<button type="submit">Weitere Einladung</button>',{friend:friend.id}):''}</div></section>`;
  }).join('');
  return page(`<div class="row"><p class="brand">DEUTSCHER FUSSBALL</p>${form('/admin/logout','<button type="submit">Abmelden</button>')}</div><div class="heading"><h1>Privater Zugang</h1></div>
    ${message?`<p class="message" role="status">${escape(message)}</p>`:''}
    ${inviteUrl?`<section class="panel"><h2>Einladung bereit</h2><p class="hint">Einmal einlösbar · ${escape(validity(expires))}</p><label>Einladungslink<input id="invite-url" type="url" readonly value="${escape(inviteUrl)}"></label><div class="actions" style="margin-top:10px"><button type="button" id="copy-invite">Einladungslink kopieren</button><span id="copy-feedback" class="hint" role="status"></span></div></section>`:''}
    <section class="panel"><h2>Einladung bereitstellen</h2>${form('/admin/friend',`<label>Name<input name="name" maxlength="48" required></label><label>Max. Schlüssel<select name="limit">${limits(2)}</select></label>${expiry}<button class="primary" type="submit">Einladung erstellen</button>`)}</section>
    ${friendRows}
    <details class="panel"><summary>Verwaltungsprotokoll</summary>${audit.length?`<ol>${audit.map(e=>`<li>${escape(date(e.at))} · ${escape(e.name)} · ${escape(events[e.event]||e.event)}</li>`).join('')}</ol>`:'<p class="hint">Noch keine Einträge.</p>'}</details>`,
    'Verwaltung',inviteUrl?`<script>
      const input=document.getElementById('invite-url'),status=document.getElementById('copy-feedback');
      document.getElementById('copy-invite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(input.value);status.textContent='Einladung kopiert.';}catch{input.focus();input.select();status.textContent='Einladung markiert. Bitte kopieren.';}});
    </script>`:'');
}
