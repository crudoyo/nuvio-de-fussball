/**
 * Bridge existing Stremio sport addons instead of re-resolving their player pages.
 * Their server returns the final playback URL and the exact player hints required.
 * An addon cannot transfer its custom Android player or bypass media protection.
 */
const TYPES = new Set(['tv','sport','sports','movie','other']);
const FOOTBALL = /football|soccer|fu(?:ss|ß)ball|bundesliga|dfb|uefa/i;
const EVENT = /\b(?:live|events?|matches|today|upcoming|schedule)\b/i;
const OTHER_SPORT = /american[\s_-]*football|basketball|cricket|motorsport|motor[\s_-]*sports?|baseball|hockey|rugby|tennis|golf|mma|boxing|darts|college|cycling|\bnfl\b|\bnba\b|\bnhl\b|\bufc\b/i;
const UNRELATED = /replay|highlight|network|24.?7|channel|favorite|favourite|teams/i;
const WEB = /^https?:\/\//i;

function rankCatalog(c) {
  if (!c || !TYPES.has(c.type) || typeof c.id !== 'string') return -1;
  const label = `${c.id} ${c.name || ''}`;
  if (UNRELATED.test(label)||OTHER_SPORT.test(label)) return -1;
  if (FOOTBALL.test(label)) return 100;
  if (EVENT.test(label.replace(/[_-]/g,' '))) return 50;
  if (['sport','sports'].includes(c.type)&&(!c.name||/^sports?$/i.test(c.name))) return 20;
  return -1;
}

/**
 * The source manifest is authoritative. Search extras are supported by the
 * Stremio catalog protocol; use them only when the source advertises search.
 * Do not guess private provider routes.
 */
export function sportsCatalogRequests(manifest, game) {
  const catalogs = (Array.isArray(manifest?.catalogs) ? manifest.catalogs : [])
    .map((c, index) => ({c, index, score:rankCatalog(c)}))
    .filter(x => x.score >= 0)
    .sort((a,b) => b.score-a.score || a.index-b.index)
    // Leave enough of the Worker's 50-request budget for both Daddy players.
    .slice(0,3);
  const requests = [];
  let searched = 0;
  for (const {c,score} of catalogs) {
    const prefix = `catalog/${encodeURIComponent(c.type)}/${encodeURIComponent(c.id)}`;
    requests.push({path:prefix+'.json', type:c.type, catalog:c.id});
    if (score !== 100 || !Array.isArray(c.extra) ||
        !c.extra.some(e => e && e.name === 'search') || searched >= 1) continue;
    searched++;
    for (const name of [game?.team1?.teamName,game?.team2?.teamName]) {
      if (typeof name === 'string' && name.trim()) {
        requests.push({path:prefix+'/search='+encodeURIComponent(name.trim())+'.json',
          type:c.type,catalog:c.id});
      }
    }
  }
  return requests;
}

function httpUrl(raw, base) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    // Keep upstream-provided signed URLs and query strings untouched.
    const url = WEB.test(raw) ? new URL(raw) : new URL(raw,base);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null;
    return WEB.test(raw) ? raw : url.href;
  } catch {return null;}
}

/**
 * Forward the original stream object, including its full behaviorHints,
 * request headers, proxy URL, subtitles and upstream-defined player flags.
 * In particular DO NOT force notWebReady=true for an existing HLS URL:
 * Nuvio Live Sports deliberately sets it false for some live streams.
 */
export function forwardSportsStream(s, manifestUrl, addonName, allowExternal=true) {
  if (!s || typeof s !== 'object' || Array.isArray(s) ||
      s.infoHash || s.fileIdx !== undefined ||
      (Array.isArray(s.sources) && s.sources.length)) return null;
  const label=String(s.name||'').trim();
  if(/^please reinstall the addon[.!]?$/i.test(label)||(!s.url&&/^\W*support us$/i.test(label)))return null;
  const url = httpUrl(s.url,manifestUrl);
  const externalUrl = allowExternal ? httpUrl(s.externalUrl,manifestUrl) : null;
  if (!url && !externalUrl) return null;
  const direct = Boolean(url);
  const forwarded = {...s};
  forwarded.name = (direct ? '' : 'Browser · ') +
    String(addonName || 'Sport')+' · '+String(s.name || 'Quelle');
  forwarded.name = forwarded.name.slice(0,150);
  if (direct) {
    forwarded.url = url;
    delete forwarded.externalUrl;
  } else {
    forwarded.externalUrl = externalUrl;
    delete forwarded.url;
  }
  return forwarded;
}
