import {ADDON_NAME,installLinks} from './addon-config.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CSS=`
:root{color-scheme:dark;--bg:#08151e;--panel:#10232e;--line:#29414e;--text:#eff8f6;--muted:#a9c1ca;--mint:#9ce4c2}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 85% 0,#15382f 0,transparent 48%),var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--mint)}button,input,textarea{font:inherit}button,a.button{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:default;opacity:.35}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--mint);outline-offset:3px}[hidden]{display:none!important}.wrap{max-width:1140px;margin:0 auto;padding:34px 24px 44px}.brand{display:flex;align-items:center;gap:12px;color:var(--mint);font-size:14px;font-weight:750;letter-spacing:.04em}.version{margin-left:auto;font-size:12px;color:var(--muted);border:1px solid var(--line);padding:5px 10px;border-radius:30px;letter-spacing:0}header{padding:20px 0}h1{max-width:790px;font-size:clamp(27px,4vw,36px);line-height:1.12;letter-spacing:-.045em;margin:0}h2{font-size:20px;line-height:1.25;margin:0 0 8px;letter-spacing:-.02em}.layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:22px;align-items:start}.card{background:var(--panel);border:1px solid var(--line);border-radius:19px;padding:23px;min-width:0}.card+.card{margin-top:17px}.side{position:sticky;top:20px}.label{display:block;font-size:13px;color:var(--muted);font-weight:650;margin-bottom:7px}input[type=search],input[type=url],textarea{width:100%;min-width:0;border:1px solid #3b5663;border-radius:10px;background:#081923;color:var(--text);padding:12px 13px;outline-offset:2px}input[type=checkbox]{width:20px;height:20px;accent-color:var(--mint);flex-shrink:0;margin:2px 0}.tools{display:flex;flex-wrap:wrap;gap:8px;margin:13px 0}.small-button,.group-button{border:1px solid #3b5663;border-radius:8px;padding:8px 11px;min-height:40px;background:transparent;color:var(--text);font-size:13px}.groups{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0 17px}.group-button{border-radius:30px;min-height:34px;padding:5px 10px;font-size:12px}.group-button[aria-pressed=true]{color:var(--mint);border-color:#5c9b83;background:#173b33}.group-button[aria-pressed=mixed]{border-style:dashed;color:var(--mint)}.catalog-list{padding:0;margin:0;list-style:none;max-height:510px;overflow:auto;scrollbar-color:#486776 transparent;border-top:1px solid var(--line)}.catalog-row{display:flex;align-items:center;gap:8px;min-height:67px;border-bottom:1px solid var(--line);padding:9px 0}.catalog-row.selected{background:linear-gradient(90deg,#153a332e,transparent)}.catalog-label{display:flex;gap:12px;align-items:center;flex:1;min-width:0;padding:4px;cursor:pointer}.catalog-label span{min-width:0;overflow-wrap:anywhere}.catalog-label strong{font-size:14px;font-weight:650;display:block}.catalog-label small{display:block;color:var(--muted);font-size:12px}.move{display:none;gap:4px}.ready .move{display:flex}.move button{width:36px;height:40px;border:1px solid #36505d;border-radius:8px;background:#142b37;color:var(--text);font-size:18px}.filtered .move{display:none}.filter-help{display:none}.filtered .filter-help{display:block}summary{cursor:pointer;font-weight:650}details.card>summary{display:flex;justify-content:space-between;align-items:center;min-height:32px}details.card[open]>summary{margin-bottom:15px}.check-label{display:flex;gap:12px;align-items:flex-start;cursor:pointer;font-size:14px}.caption{font-size:13px;color:var(--muted);margin:0 0 20px}.button{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;text-align:center;min-height:49px;padding:12px 16px;border:1px solid var(--mint);border-radius:11px;background:var(--mint);color:#09251c;font-weight:750;text-decoration:none;line-height:1.3}.button.secondary{background:transparent;color:var(--text);border-color:#4c6876}.button+.button{margin-top:10px}.hint{font-size:12px;color:var(--muted);margin:13px 0 0}.error{padding:14px 17px;border:1px solid #bd7d5d;background:#472e25;border-radius:11px;margin-bottom:20px;color:#ffe4d6}.empty{padding:20px 3px;color:var(--muted);font-size:14px}.install{max-width:760px}.app-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 18px}.app-actions .button{margin:0}.status{min-height:24px;font-size:13px;color:var(--mint);margin:12px 0}.status:empty{display:none}.copy-row{display:flex;gap:10px}.copy-row input{font-size:12px;font-family:ui-monospace,monospace}.copy-row button{width:auto;min-width:104px}.links{display:flex;flex-wrap:wrap;gap:17px;margin-top:20px;font-size:13px}footer{font-size:12px;color:var(--muted);margin-top:26px}footer a{color:var(--muted)}@media(max-width:760px){.wrap{padding:22px 16px 32px}.layout{grid-template-columns:1fr;gap:17px}.card{padding:18px;border-radius:15px}.side{position:static}.catalog-list{max-height:460px}.app-actions{grid-template-columns:1fr}.copy-row{flex-direction:column}.copy-row button{width:100%}.version{font-size:11px}.brand{font-size:12px}.move button{width:34px;min-height:42px}.catalog-label{gap:9px}}
`;
const CONFIG_SCRIPT=String.raw`
(()=>{
 const form=document.getElementById('config-form'),list=document.getElementById('catalog-list'),search=document.getElementById('catalog-search');
 const rows=()=>[...list.querySelectorAll('.catalog-row')];
 const selected=()=>rows().filter(r=>r.querySelector('input').checked);
 const count=document.getElementById('catalog-count'),submit=document.getElementById('generate'),empty=document.getElementById('selection-empty');
 function update(){
  const chosen=selected();count.textContent=chosen.length;submit.disabled=!chosen.length;empty.hidden=!!chosen.length;
  for(const row of rows()){
   const checked=row.querySelector('input').checked,index=chosen.indexOf(row);row.classList.toggle('selected',checked);
   row.querySelector('[data-move="up"]').disabled=!checked||index===0;
   row.querySelector('[data-move="down"]').disabled=!checked||index===chosen.length-1;
  }
  for(const button of document.querySelectorAll('[data-league]')){
   const group=rows().filter(r=>r.dataset.group===button.dataset.league),n=group.filter(r=>r.querySelector('input').checked).length;
   button.setAttribute('aria-pressed',n===group.length?'true':n?'mixed':'false');
  }
 }
 list.addEventListener('change',update);
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-move]');if(!button)return;
  const row=button.closest('.catalog-row'),chosen=selected(),index=chosen.indexOf(row),next=chosen[index+(button.dataset.move==='up'?-1:1)];
  if(!next)return;
  if(button.dataset.move==='up')list.insertBefore(row,next);else next.after(row);
  update();button.focus();document.getElementById('order-status').textContent='Reihenfolge geändert.';
 });
 document.querySelectorAll('[data-league]').forEach(button=>button.addEventListener('click',()=>{
  const group=rows().filter(r=>r.dataset.group===button.dataset.league),on=!group.every(r=>r.querySelector('input').checked);
  group.forEach(r=>{r.querySelector('input').checked=on;});update();
 }));
 document.querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>{
  const preset=button.dataset.select;
  rows().forEach(row=>{row.querySelector('input').checked=preset==='all'||preset==='trial'&&['bl1','bl3'].includes(row.dataset.group);});update();
 }));
 search.addEventListener('input',()=>{
  const query=search.value.trim().toLocaleLowerCase('de');let visible=0;
  rows().forEach(row=>{row.hidden=!row.dataset.label.toLocaleLowerCase('de').includes(query);if(!row.hidden)visible++;});
  document.getElementById('catalog-card').classList.toggle('filtered',!!query);document.getElementById('search-empty').hidden=!!visible;
 });
 form.addEventListener('submit',event=>{if(!selected().length){event.preventDefault();empty.hidden=false;empty.focus();}});
 document.documentElement.classList.add('ready');update();
})();`;
const INSTALL_SCRIPT=String.raw`
(()=>{
 const input=document.getElementById('manifest-url'),status=document.getElementById('install-status');
 document.getElementById('copy-url').addEventListener('click',async()=>{
  try{
   if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(input.value);
   else{input.focus();input.select();input.setSelectionRange(0,input.value.length);if(!document.execCommand('copy'))throw Error();}
   status.textContent='Import-URL kopiert.';
  }catch{input.focus();input.select();input.setSelectionRange(0,input.value.length);status.textContent='URL markiert.';}
 });
 input.addEventListener('focus',()=>input.select());
})();`;
function shell(version,content,script,install=false,privateMode=false){return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${ADDON_NAME} · ${install?'Installieren':'Konfiguration'}</title><style>${CSS}</style></head><body><main class="wrap${install?' install':''}"><div class="brand">${ADDON_NAME}${privateMode?'':`<span class="version">v${escape(version)}</span>`}</div>${content}${privateMode?'':'<footer><a href="/health">Status</a></footer>'}</main><script>${script}</script></body></html>`;}
function sortedRows(catalogs,settings){
  const byId=new Map(catalogs.map(c=>[c.id,c]));
  const chosen=settings.c||catalogs.map(c=>c.id);
  const ordered=chosen.map(id=>byId.get(id)||{id,name:id.replace(/^defootball_/,''),league:'saved',leagueName:'Gespeicherte Kataloge',unavailable:true});
  return [...ordered,...catalogs.filter(c=>!chosen.includes(c.id))];
}
export function configurePage({version,catalogs,settings={m:[]},browserAllowed=true,error='',rawSources,accessPrefix='',invite}){
  const rows=sortedRows(catalogs,settings),chosen=new Set(settings.c||catalogs.map(c=>c.id));
  const groups=[...new Map(rows.map(c=>[c.league,c.leagueName])).entries()];
  const showBrowser=browserAllowed&&settings.b!==false;
  const button=invite&&!invite.claimed?'Einladung einlösen':'Importlink erstellen';
  const content=`<header><h1>Konfiguration</h1></header>
  ${error?`<div class="error" role="alert">${escape(error)}</div>`:''}
  <form id="config-form" method="post" action="${escape(invite?.action||accessPrefix+'/generate')}"><input type="hidden" name="customize" value="1"><div class="layout"><div>
  <section class="card" id="catalog-card" aria-labelledby="catalog-heading"><h2 id="catalog-heading">Kataloge</h2>
  <input id="catalog-search" type="search" aria-label="Kataloge suchen" placeholder="Kataloge suchen" autocomplete="off">
  <div class="tools"><button class="small-button" type="button" data-select="all">Alle auswählen</button><button class="small-button" type="button" data-select="trial">Bundesliga & 3. Liga</button><button class="small-button" type="button" data-select="none">Auswahl leeren</button></div>
  <div class="groups" aria-label="Wettbewerbe gemeinsam auswählen">${groups.map(([key,name])=>`<button type="button" class="group-button" data-league="${escape(key)}" aria-pressed="false" aria-label="${escape(name)} gemeinsam auswählen oder abwählen">${escape(name)}</button>`).join('')}</div>
  <p class="hint filter-help">Zum Ändern der Reihenfolge die Suche leeren.</p>
  <ol class="catalog-list" id="catalog-list">${rows.map(c=>{
    const [name,...parts]=c.name.split(' · '),checked=chosen.has(c.id);
    const subtitle=c.unavailable?'Derzeit nicht verfügbar':parts.join(' · ');
    return `<li class="catalog-row${checked?' selected':''}" data-group="${escape(c.league)}" data-label="${escape(c.name)}"><label class="catalog-label"><input type="checkbox" name="catalog" value="${escape(c.id)}"${checked?' checked':''}><span><strong>${escape(name)}</strong>${subtitle?`<small>${escape(subtitle)}</small>`:''}</span></label><span class="move"><button type="button" data-move="up" aria-label="${escape(c.name)} nach oben">↑</button><button type="button" data-move="down" aria-label="${escape(c.name)} nach unten">↓</button></span></li>`;
  }).join('')}</ol><p id="search-empty" class="empty" hidden>Kein passender Katalog gefunden.</p><span id="order-status" class="status" role="status"></span></section>
  <details class="card"><summary>Zusätzliche Quellen</summary><label for="sources" class="label">HTTPS-Manifest-URLs (eine pro Zeile, max. 8)</label><textarea id="sources" name="sources" rows="4" placeholder="https://…/manifest.json" spellcheck="false">${escape(rawSources??settings.m.join('\n'))}</textarea></details>
  </div><aside class="side"><section class="card" aria-labelledby="selection-heading"><h2 id="selection-heading">Auswahl</h2><p class="caption"><output id="catalog-count" aria-live="polite">${chosen.size}</output> ausgewählt</p>
  <label class="check-label"><input type="checkbox" name="browser"${showBrowser?' checked':''}${!browserAllowed?' disabled':''}>Browser-Links anzeigen</label>
  <p id="selection-empty" class="error" tabindex="-1"${chosen.size?' hidden':''}>Bitte mindestens einen Katalog auswählen.</p>
  <div style="margin-top:23px"><button class="button" id="generate" type="submit"${chosen.size?'':' disabled'}>${button}</button></div></section></aside></div></form>`;
  return shell(version,content,CONFIG_SCRIPT,false,Boolean(accessPrefix||invite));
}
export function installationPage({version,url,privateMode=false}){
  const links=installLinks(url);
  return shell(version,`<header><h1>Add-on installieren</h1></header><section class="card">
  <div class="app-actions"><a id="install-nuvio" class="button" href="${escape(links.nuvio)}">In Nuvio installieren</a><a id="install-stremio" class="button secondary" href="${escape(links.stremio)}">In Stremio installieren</a></div>
  <label class="label" for="manifest-url">Import-URL (auch für andere Geräte)</label><div class="copy-row"><input id="manifest-url" type="url" readonly value="${escape(links.manifest)}"><button id="copy-url" type="button" class="button secondary">URL kopieren</button></div><p id="install-status" class="status" role="status" aria-live="polite"></p>
  <div class="links"><a id="edit-settings" href="${escape(links.configure)}">Auswahl bearbeiten</a>${privateMode?'':`<a href="${escape(links.manifest)}">Manifest öffnen</a><a href="${escape(links.manifest.replace(/manifest\.json$/,'debug/sources.json'))}">Quellen prüfen</a>`}</div></section>`,INSTALL_SCRIPT,true,privateMode);
}
