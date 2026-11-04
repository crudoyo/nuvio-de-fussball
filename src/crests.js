/**
 * Optional supplementary club crests from ESPN's public league team listings.
 * These are only used when the OpenLigaDB logo cannot be loaded.
 * ESPN is not an officially supported API; failures are harmless.
 */
const LEAGUES={
  bl1:'ger.1',
  bl2:'ger.2',
  dfb:'ger.dfb_pokal',
  ucl:'uefa.champions',
  uel:'uefa.europa',
  uecl:'uefa.europa.conf'
};
const fallbackNames={
 'borussia dortmund':['dortmund','bvb'],
 'fc bayern munchen':['bayern munich','bayern munchen'],
 'borussia monchengladbach':['borussia m gladbach','gladbach'],
 'rb leipzig':['leipzig'],
 'sv 07 elversberg':['elversberg'],
 'hamburger sv':['hamburg','hamburger sv'],
 'rot weiss essen':['rw essen','rwe','essen'],
 'spvgg greuther furth':['greuther furth','furth'],
 'dynamo dresden':['dresden'],
 'eintracht braunschweig':['braunschweig'],
 'energie cottbus':['cottbus']
};
export const crestKey=name=>String(name||'').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const namesFor=name=>[crestKey(name),...(fallbackNames[crestKey(name)]||[])];
export function readESPNTeamCrests(data) {
  const entries=data?.sports?.[0]?.leagues?.[0]?.teams||data?.teams||[];
  return entries.map(x=>x.team||x).filter(x=>x && typeof x==='object')
    .map(x=>({name:x.displayName||x.name||x.shortDisplayName,
      logo:x.logos?.[0]?.href||x.logo||''}))
    .filter(x=>x.name && typeof x.logo==='string' && x.logo.startsWith('https://'));
}
export function bestCrest(team,entries) {
  const variants=namesFor(team);
  let winner='';
  for(const e of entries){
    const k=crestKey(e.name);
    if(variants.includes(k))return e.logo;
    // Avoid accidental collisions between unrelated club names.
    if(variants.some(x=>x.length>5 && (k.startsWith(x+' ')||x.startsWith(k+' '))))winner=e.logo;
  }
  return winner;
}
export function espnTeamsUrl(shortcut) {
  const league=LEAGUES[shortcut?.toLowerCase()];
  return league?'https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/teams?limit=150':null;
}
export function attachFallbackCrests(matches, data) {
  const teams=readESPNTeamCrests(data);
  if(!teams.length)return matches;
  return matches.map(m=>({
    ...m,
    team1:{...m.team1,teamIconBackupUrl:bestCrest(m.team1?.teamName,teams)},
    team2:{...m.team2,teamIconBackupUrl:bestCrest(m.team2?.teamName,teams)}
  }));
}
