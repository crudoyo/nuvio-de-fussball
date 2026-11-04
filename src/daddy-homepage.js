/**
 * Minimal public DaddyLive homepage schedule parser.
 * Uses structural class markers from the provider's schedule page.
 * It does not inspect media players, execute scripts or retrieve streams.
 */
function elementsAtClass(html,cls) {
  const re=/<([a-z][\w:-]*)\b[^>]*\bclass\s*=\s*(["'])([^"']+)\2[^>]*>/gi;
  const results=[];
  for(const match of html.matchAll(re)) {
    if(match[3].split(/\s+/).includes(cls))results.push({
      index:match.index,after:match.index+match[0].length,tag:match[1].toLowerCase()
    });
  }
  return results;
}
function sectionsAtClass(html,cls) {
  const positions=elementsAtClass(html,cls);
  return positions.map((m,i)=>html.slice(m.index,positions[i+1]?.index??html.length));
}
function fromClass(html,cls){
  const entry=elementsAtClass(html,cls)[0];
  if(!entry)return '';
  const after=html.slice(entry.after);
  const close=new RegExp('</'+entry.tag+'\\s*>','i').exec(after);
  return close?after.slice(0,close.index):'';
}
function decodeEntities(str) {
  return String(str||'')
    .replace(/&#x([0-9a-f]{1,6});/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#(\d{1,7});/g,(_,d)=>{const n=Number(d);return n<=0x10ffff?String.fromCodePoint(n):'';})
    .replace(/&(amp|quot|apos|lt|gt|nbsp|ndash|mdash);/gi,(_,e)=>
      ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—'})[e.toLowerCase()]);
}
function cleanText(html) {
  return decodeEntities(String(html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '))
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu,'')
    .replace(/\s+/g,' ').trim();
}
function extractChannels(eventHtml) {
  const links=fromClass(eventHtml,'schedule__channels');
  const list=[],seen=new Set();
  const re=/<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for(const x of links.matchAll(re)){
    const href=/\bhref\s*=\s*(["'])(.*?)\1/i.exec(x[1])?.[2]||'';
    const id=/(?:[?&]id=|\/stream-)(\d{1,6})(?:[&#.]|$)/.exec(decodeEntities(href))?.[1];
    if(!id||id==='0'||seen.has(id))continue;
    seen.add(id);
    list.push({channel_id:id,channel_name:cleanText(x[2]).slice(0,100)||'Kanal '+id});
    if(list.length>=24)break;
  }
  return list;
}
export function parseDaddyHomepage(html) {
  if(typeof html!=='string'||html.length<100)return null;
  const days=sectionsAtClass(html,'schedule__day');
  if(!days.length)return null;
  const schedule={};
  for(const day of days.slice(0,14)) {
    const dayLabel=cleanText(fromClass(day,'schedule__dayTitle'));
    if(!dayLabel||!/20\d{2}/.test(dayLabel))continue;
    const categories={};
    for(const group of sectionsAtClass(day,'schedule__category').slice(0,80)){
      const rawCategory=fromClass(group,'card__meta');
      const category=cleanText(rawCategory).slice(0,100);
      if(!category || (!/soccer|football|fussball|fußball|futbol/i.test(category)
        && !rawCategory.includes('⚽')))continue;
      const events=[];
      for(const event of sectionsAtClass(group,'schedule__event').slice(0,300)){
        const time=cleanText(fromClass(event,'schedule__time'));
        const eventName=cleanText(fromClass(event,'schedule__eventTitle')).slice(0,220);
        const channels=extractChannels(event);
        if(/^\d{1,2}:\d{2}$/.test(time)&&eventName&&channels.length)
          events.push({time,event:eventName,channels,channels2:[]});
      }
      if(events.length)categories[category]=events;
    }
    if(Object.keys(categories).length)schedule[dayLabel]=categories;
  }
  return Object.keys(schedule).length?schedule:null;
}
