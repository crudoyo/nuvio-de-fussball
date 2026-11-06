import {curatedCrest} from './crests.js';
/**
 * Branded landscape match cards for Nuvio, with embedded club badges.
 * The URLs are read from fixture providers; unknown or failed images fall back
 * to team initials. Embedding preserves logos in Nuvio/Fire TV SVG renderers.
 */
const badgeCache = new Map();
const MAX_BADGE_BYTES = 240000;
const BADGE_TTL = 4 * 3600000;
const escape = text => String(text ?? '').replace(/[&<>"']/g, x =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[x]);

function safeBadgeUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname.length > 200 ||
      u.hostname === 'localhost' || u.hostname.endsWith('.local') ||
      u.hostname.endsWith('.internal') || u.hostname.endsWith('.test') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) || u.hostname.includes(':')) return null;
    return u.href;
  } catch { return null; }
}
function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 4096)
    binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(binary);
}
/**
 * Wikimedia commonly provides team crests as raw SVG, which cannot safely be
 * embedded in the existing image-data URI pipeline. Ask Wikimedia's own
 * thumbnail service for a compact PNG rendition instead.
 */
export function badgeImageUrl(raw) {
  const safe = safeBadgeUrl(raw);
  if (!safe) return null;
  const u = new URL(safe);
  if (u.hostname !== 'upload.wikimedia.org') return safe;
  const match = u.pathname.match(/^\/wikipedia\/(commons|en|de|fr|es|it)\/(?:thumb\/)?([a-f0-9])\/([a-f0-9]{2})\/([^/]+\.svg)(?:\/[^/]+)?$/i);
  if (!match) return safe;
  const [,project,first,second,file]=match;
  return u.origin + '/wikipedia/' + project + '/thumb/' + first + '/' + second
    + '/' + file + '/240px-' + file + '.png';
}
async function retrieveBadge(url, fetcher) {
  let current = badgeImageUrl(url);
  if (!current) return null;
  const host = new URL(current).hostname;
  for (let i=0; i<3; i++) {
    const res = await fetcher(current, {
      redirect:'manual',
      signal:AbortSignal.timeout(5000),
      headers:{accept:'image/png,image/jpeg,image/webp,image/gif'}
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return null;
      const next = new URL(location,current);
      const safe = safeBadgeUrl(next.href);
      // Don't let an external logo source redirect into a different host.
      if (!safe || next.hostname !== host) return null;
      current = badgeImageUrl(safe);
      continue;
    }
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const length = Number(res.headers.get('content-length') || 0);
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(type) ||
        length > MAX_BADGE_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BADGE_BYTES) return null;
    return 'data:' + type + ';base64,' + toBase64(bytes);
  }
  return null;
}
export async function badgeData(url, fetcher = fetch) {
  const imageUrl = badgeImageUrl(url);
  if (!imageUrl) return null;
  const old = badgeCache.get(imageUrl);
  if (old && old.until > Date.now()) return old.value;
  let result = null;
  try {
    result = await retrieveBadge(imageUrl,fetcher);
  } catch { /* Missing, expired or inaccessible image: initials stay visible. */ }
  // Cache successful logos, and retry missing ones after five minutes.
  if (badgeCache.size > 250) badgeCache.clear();
  badgeCache.set(imageUrl, {
    value:result,
    until:Date.now() + (result ? BADGE_TTL : 300000)
  });
  return result;
}
function abbreviate(name) {
  return String(name || '?').replace(/\b(FC|SC|SV|VfL|1\.)\b/gi,'').trim()
    .split(/\s+/).filter(Boolean).slice(0, 3).map(x=>x[0]).join('').toUpperCase().slice(0,3) || '?';
}
function shortName(name) {
  const n = String(name || 'Unbekannt').trim();
  return n.length > 26 ? n.slice(0, 23).trimEnd() + '…' : n;
}
function badgeArt(name, url, x) {
  const badge = url
    ? '<image href="' + url + '" x="' + (x+15) + '" y="91" width="130" height="130" preserveAspectRatio="xMidYMid meet"/>'
    : '<circle cx="' + (x+80) + '" cy="156" r="61" fill="#2b5060" stroke="#73d7aa" stroke-width="2"/><text x="' + (x+80) + '" y="169" font-family="Arial,sans-serif" font-size="31" fill="white" text-anchor="middle" font-weight="700">' + escape(abbreviate(name)) + '</text>';
  const label = escape(shortName(name));
  return badge + '<text x="' + (x+80) + '" y="255" font-family="Arial,sans-serif" font-size="' + (label.length>20?16:19) + '" fill="#fff" text-anchor="middle" font-weight="600">' + label + '</text>';
}
export async function teamBadgeData(team, fetcher = fetch) {
  // Prefer known raster crests; fall back to independently provided team data.
  const known=curatedCrest(team?.teamName);
  if(known){
    const data=await badgeData(known,fetcher);
    if(data)return data;
  }
  // A dead primary must not delay the other alternative. Prefer the original
  // league image if both succeed, without an extra team-list lookup here.
  const options=[team?.teamIconUrl,team?.teamIconBackupUrl]
    .filter((url,index,all)=>url && url!==known && all.indexOf(url)===index);
  const images=await Promise.all(options.map(url=>badgeData(url,fetcher)));
  return images.find(Boolean)||null;
}
export async function makeMatchPoster(match, competition, kickoffLabel, matchStatus, fetcher = fetch) {
  const home = match.team1?.teamName || 'Heim', away = match.team2?.teamName || 'Gast';
  const [left, right] = await Promise.all([teamBadgeData(match.team1,fetcher),teamBadgeData(match.team2,fetcher)]);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="405" viewBox="0 0 720 405">'
    + '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#092a32"/><stop offset="1" stop-color="#173b46"/></linearGradient></defs>'
    + '<rect width="720" height="405" fill="url(#bg)"/>'
    + '<rect x="24" y="22" width="672" height="48" rx="11" fill="#ffffff" opacity=".10"/>'
    + '<text x="360" y="53" text-anchor="middle" font-family="Arial,sans-serif" fill="#d5f7e8" font-size="22" font-weight="700">' + escape(competition.name) + '</text>'
    + badgeArt(home,left,64) + badgeArt(away,right,496)
    + '<text x="360" y="173" font-size="42" font-family="Arial,sans-serif" font-weight="800" fill="#8fe2bb" text-anchor="middle">VS</text>'
    + '<rect x="116" y="296" width="488" height="77" rx="14" fill="#081e2b" opacity=".86"/>'
    + '<text x="360" y="326" font-size="22" fill="#fff" font-family="Arial,sans-serif" text-anchor="middle">' + escape(kickoffLabel) + '</text>'
    + '<text x="360" y="355" font-size="17" fill="#8fe2bb" font-family="Arial,sans-serif" text-anchor="middle">' + escape(matchStatus) + '</text>'
    + '</svg>';
}

/**
 * Detail heroes crop landscape artwork to a portrait viewport (and may zoom).
 * Keep both crests inside the central 440px of a 1280x720 image. Do not bake
 * the catalog's competition/date/name labels into a backdrop: the app draws
 * those itself and would enlarge or crop them along with the old poster.
 */
export async function makeMatchBackground(match, fetcher = fetch) {
  const [left,right]=await Promise.all([
    teamBadgeData(match.team1,fetcher),teamBadgeData(match.team2,fetcher)
  ]);
  function crest(name,data,x){
    return data
      ? '<image href="'+data+'" x="'+x+'" y="200" width="160" height="160" preserveAspectRatio="xMidYMid meet"/>'
      : '<circle cx="'+(x+80)+'" cy="280" r="72" fill="#173d49" stroke="#73d7aa" stroke-opacity=".4"/>'
        +'<text x="'+(x+80)+'" y="291" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#e7f4ef" text-anchor="middle">'+escape(abbreviate(name))+'</text>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">'
    +'<defs><radialGradient id="glow"><stop stop-color="#244b53"/><stop offset="1" stop-color="#07151e"/></radialGradient></defs>'
    +'<rect width="1280" height="720" fill="url(#glow)"/>'
    +crest(match.team1?.teamName,left,420)+crest(match.team2?.teamName,right,700)
    +'<text x="640" y="290" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#8fe2bb" fill-opacity=".75" text-anchor="middle">VS</text>'
    +'</svg>';
}
