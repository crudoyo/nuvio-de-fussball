/**
 * Exact 2026/27 3. Liga crest mapping.
 * DFB confirmed the final 20 participants on 2026-06-11 (Havelse, not 1860).
 * Public 512px PNG assets: https://www.footylogos.com/competition/3-liga
 * The two reserve sides use their parent clubs' ESPN badges.
 * Never match by substring or city alone: Essen is not a universal club ID.
 */
export const THIRD_LIGA_CLUBS_2026 = Object.freeze([
  {name:'Fortuna Düsseldorf',slug:'fortuna-dusseldorf',aliases:['Fortuna Duesseldorf','Fortuna Dusseldorf','Düsseldorf']},
  {name:'SC Preußen Münster',slug:'preussen-munster',aliases:['Preußen Münster','Preussen Muenster','Preussen Munster']},
  {name:'Rot-Weiss Essen',slug:'rot-weiss-essen',aliases:['Rot-Weiß Essen','Rot Weiss Essen','RW Essen','RWE']},
  {name:'MSV Duisburg',slug:'msv-duisburg',aliases:['Duisburg']},
  {name:'F.C. Hansa Rostock',slug:'hansa-rostock',aliases:['FC Hansa Rostock','Hansa Rostock']},
  {name:'SC Verl',slug:'sc-verl',aliases:['Verl']},
  {name:'Alemannia Aachen',slug:'alemannia-aachen',aliases:['TSV Alemannia Aachen']},
  {name:'SV Wehen Wiesbaden',slug:'sv-wehen-wiesbaden',aliases:['Wehen Wiesbaden','Wehen']},
  {name:'SV Waldhof Mannheim',slug:'waldhof-mannheim',aliases:['Waldhof Mannheim']},
  {name:'FC Viktoria Köln',slug:'viktoria-koln',aliases:['Viktoria Köln','Viktoria Koeln','FC Viktoria Koeln']},
  {name:'FC Ingolstadt 04',slug:'fc-ingolstadt',aliases:['FC Ingolstadt','Ingolstadt 04','Ingolstadt']},
  {name:'SSV Jahn Regensburg',slug:'jahn-regensburg',aliases:['Jahn Regensburg','SSV Jahn','Regensburg']},
  {name:'VfB Stuttgart II',logo:'https://a.espncdn.com/i/teamlogos/soccer/500/134.png',aliases:['VfB Stuttgart 2','Stuttgart II','VfB Stuttgart U23']},
  {name:'1. FC Saarbrücken',slug:'1-fc-saarbrucken',aliases:['FC Saarbrücken','1 FC Saarbrücken','1. FC Saarbruecken']},
  {name:'TSG Hoffenheim II',logo:'https://a.espncdn.com/i/teamlogos/soccer/500/7911.png',aliases:['TSG 1899 Hoffenheim II','TSG 1899 Hoffenheim 2','Hoffenheim II','TSG Hoffenheim 2']},
  {name:'TSV Havelse',slug:'tsv-havelse',aliases:['Havelse']},
  {name:'SV Meppen',slug:'sv-meppen',aliases:['Meppen']},
  {name:'SC Fortuna Köln',slug:'fortuna-koln',aliases:['Fortuna Köln','Fortuna Koeln','SC Fortuna Koeln']},
  {name:'SG Sonnenhof Großaspach',slug:'sg-sonnenhof-grossaspach',aliases:['Sonnenhof Großaspach','SG Sonnenhof Grossaspach','Sonnenhof Grossaspach']},
  {name:'FC Würzburger Kickers',slug:'wurzburger-kickers',aliases:['Würzburger Kickers','Wuerzburger Kickers','FC Wuerzburger Kickers']}
].map(club=>Object.freeze({...club,aliases:Object.freeze(club.aliases)})));

const keyOf = value => String(value || '').toLowerCase().replace(/ß/g,'ss')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const crestMap = new Map();
for (const club of THIRD_LIGA_CLUBS_2026) {
  const url = club.logo || 'https://www.footylogos.com/dls/logo/rgba-v1/' + club.slug + '.png';
  for (const variant of [club.name,...club.aliases]) {
    const key = keyOf(variant);
    if (crestMap.has(key) && crestMap.get(key) !== url)
      throw new Error('3. Liga crest alias collision: '+variant);
    crestMap.set(key,url);
  }
}
export function thirdLigaCrest(name) {
  return crestMap.get(keyOf(name)) || null;
}
