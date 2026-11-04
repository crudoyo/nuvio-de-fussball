/**
 * Branded landscape match cards for Nuvio, with embedded club badges.
 * The URLs are read from fixture providers; unknown or failed images fall back
 * to team initials. Embedding preserves logos in Nuvio/Fire TV SVG renderers.
 */
const badgeCache = new Map();
const MAX_BADGE_BYTES = 140000;
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
export async function badgeData(url, fetcher = fetch) {
  const safe = safeBadgeUrl(url);
  if (!safe) return null;
  const old = badgeCache.get(safe);
  if (old && old.until > Date.now()) return old.value;
  try {
    const res = await fetcher(safe, {redirect:'manual', signal:AbortSignal.timeout(4000),
      headers:{accept:'image/png,image/jpeg,image/webp,image/gif'}});
    const type = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const length = Number(res.headers.get('content-length') || 0);
    if (!res.ok || !['image/png','image/jpeg','image/webp','image/gif'].includes(type) ||
      length > MAX_BADGE_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BADGE_BYTES) return null;
    const value = 'data:' + type + ';base64,' + toBase64(bytes);
    if (badgeCache.size > 250) badgeCache.clear();
    badgeCache.set(safe, {value, until: Date.now() + BADGE_TTL});
    return value;
  } catch { return null; }
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
export async function makeMatchPoster(match, competition, kickoffLabel, matchStatus, fetcher = fetch) {
  const home = match.team1?.teamName || 'Heim', away = match.team2?.teamName || 'Gast';
  const [left, right] = await Promise.all([
    badgeData(match.team1?.teamIconUrl, fetcher),
    badgeData(match.team2?.teamIconUrl, fetcher)
  ]);
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
