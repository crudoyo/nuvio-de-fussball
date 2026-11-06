
/**
 * Reuse the published club crest seed from Nuvio Live Sports. The free
 * TheSportsDB key now restricts arbitrary team lookups, so a bundled static
 * lookup is more reliable than a network search for every generated poster.
 * Match exact normalized names or explicit aliases only: don't confuse a
 * football club with a basketball/hockey club from the same city.
 */
import {CLUB_LOGOS} from './club-logo-seed.js';
import {thirdLigaCrest} from './third-league-crests.js';

const LOCAL_ALIASES={
  'fcbayernmunchen':'bayernmunich',
  'fcbayernmunich':'bayernmunich',
  'fcbarcelona':'barcelona',
  'fckoln':'cologne',
  '1fckoln':'cologne',
  'koln':'cologne',
  'fcstpauli':'stpauli',
  '1fcmagdeburg':'1fcmagdeburg',
  '1fcnurnberg':'1fcnurnberg',
  '1fcnuremberg':'1fcnurnberg',
  'hansarostock':'rostock',
  'fchansarostock':'rostock',
  'rotweissessen':'essen',
  'rotweisesessen':'essen',
  'rwe':'essen',
  'svwehenwiesbaden':'wehenwiesbaden',
  'fcenergiecottbus':'energiecottbus',
  'bayer04leverkusen':'bayerleverkusen',
  'hamburgersv':'hamburg',
  'svwerderbremen':'werderbremen',
  '1fcunionberlin':'unionberlin',
  'vflwolfsburg':'wolfsburg',
  'vfbstuttgart':'vfbstuttgart',
  'borussiadortmund':'borussiadortmund',
  'bvb09dortmund':'borussiadortmund',
  'borussiamonchengladbach':'gladbach',
  'spvgggreutherfurth':'spvgggreutherfurth',
  'greutherfurth':'greutherfurth',
  'dynamodresden':'dynamodresden',
  'scfreiburg':'scfreiburg',
  'sv07elversberg':'svelversberg',
  'svsandelversberg':'svelversberg',
  'schalke04':'schalke04',
  'fcaschalke04':'schalke04',
  'rbleipzig':'rbleipzig',
  'fcausgburg':'fcaugsburg',
  'fcaugsburg':'fcaugsburg',
  'sc07paderborn':'scpaderborn07',
  'scpaderborn':'scpaderborn07',
  '1fcheidenheim':'1fcheidenheim1846',
  '1fcheidenheim1846':'1fcheidenheim1846',
  '1fckaiserslautern':'kaiserslautern',
  'fckaiserslautern':'kaiserslautern',
  'herthabsc':'herthaberlin',
  'herthabscberlin':'herthaberlin',
  // OpenLigaDB's German UEFA names differ from the international logo seed.
  // Keep these explicit: e.g. Inter Mailand must never resolve to Inter Miami.
  'aekathen':'aekathens',
  'asrom':'asroma',
  'fcbrugge':'clubbrugge',
  'intermailand':'intermilan',
  'internazionale':'intermilan',
  'fcinternazionalemilano':'intermilan',
  'villarrealcf':'villarreal',
  'lilleosc':'lille',
  'parisstgermain':'parissaintgermain',
  'parissaintgermainfc':'parissaintgermain',
  'sscnapoli':'napoli',
  'galatasarayistanbul':'galatasaray',
  'fenerbahcesk':'fenerbahce',
  'fkbodoglimt':'bodo',
  'bodoglimt':'bodo',
  'manchesterunitedfc':'manchesterunited',
  'como1907':'como',
  'slaviaprag':'slaviaprague',
  'slaviapraha':'slaviaprague',
  'skslaviapraha':'slaviaprague',
  'rclens':'lens',
  'lask':'lasklinz',
  'viking':'vikingfk'
};
const compactLogoKey=name=>String(name||'').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/ä/g,'a').replace(/ö/g,'o')
  .replace(/ü/g,'u').replace(/ø/g,'o').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
function candidatesForCrest(name){
  const key=compactLogoKey(name),out=new Set([LOCAL_ALIASES[key]||key,key]);
  // Preserve the full exact club name first to distinguish second teams.
  const bare=key.replace(/(?:frauen|women|damen|u2[013]|u19|u17|i{2}|2)$/,'');
  if(bare.length>5)out.add(bare);
  for(const candidate of [...out]){
    if(LOCAL_ALIASES[candidate])out.add(LOCAL_ALIASES[candidate]);
    // A leading FC/SC/SV is often absent from an international club name.
    const prefix=candidate.replace(/^(?:1fc|fc|sc|sv|vfl|vfb|tsv|spvgg)/,'');
    if(prefix.length>=6 && CLUB_LOGOS[prefix])out.add(prefix);
  }
  return [...out];
}
export function curatedCrest(name){
  // An exact, season-checked 3. Liga identity beats generic city-based seeds.
  const thirdLeague=thirdLigaCrest(name);
  if(thirdLeague)return thirdLeague;
  for(const key of candidatesForCrest(name)){
    const value=CLUB_LOGOS[key];
    if(value && /^https:\/\/(?:a\.espncdn\.com|r2\.thesportsdb\.com)\//.test(value))return value;
  }
  return null;
}

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
 'sv 07 elversberg':['sv elversberg','elversberg'],
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
  const key=compactLogoKey(team),canonical=LOCAL_ALIASES[key]||key;
  let winner='';
  for(const e of entries){
    const k=crestKey(e.name);
    const entryKey=compactLogoKey(e.name);
    if(canonical===(LOCAL_ALIASES[entryKey]||entryKey))return e.logo;
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
