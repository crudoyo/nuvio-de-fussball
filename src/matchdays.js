/** Berlin calendar weeks and weekdays for the Bundesliga / 3. Liga trial. */
const dateFormatter=new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
});

const weekdayFormatter=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long'});
export const CALENDAR_VIEWS=Object.freeze([
  {suffix:'',view:'week',label:'Aktuelle Woche (Mo–So)',offset:0},
  {suffix:'_friday',view:'friday',label:'Freitag',weekday:5},
  {suffix:'_saturday',view:'saturday',label:'Samstag',weekday:6},
  {suffix:'_sunday',view:'sunday',label:'Sonntag',weekday:0},
  {suffix:'_following',view:'following',label:'Kommende Woche (Mo–So)',offset:1}
]);
export const hasCalendarCatalogs=shortcut=>['bl1','bl3'].includes(String(shortcut).toLowerCase());

export function startTime(match){
  const raw=match.matchDateTimeUTC;
  if(raw){
    const s=String(raw),date=new Date(s+(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?'':'Z'));
    if(!Number.isNaN(+date))return date;
  }
  return null; // Don't invent UTC from an unqualified local matchDateTime.
}
export function matchdayNumber(match){
  const n=Number(match.group?.groupOrderID);
  return Number.isSafeInteger(n)&&n>0?n:null;
}
export function matchdayLabel(match){
  const n=matchdayNumber(match);
  return n?(String(match.group?.groupName||'').trim()||`${n}. Spieltag`):null;
}
export const berlinDate=timestamp=>dateFormatter.format(new Date(timestamp));
export function weekdayLabel(match){
  const at=startTime(match);
  return at?weekdayFormatter.format(at):null;
}
function ordered(games){
  return [...games].sort((a,b)=>
    (startTime(a)?.getTime()??Infinity)-(startTime(b)?.getTime()??Infinity)||a.matchID-b.matchID);
}

export function weekWindow(now=Date.now(),offset=0){
  // Calendar arithmetic avoids 23/25-hour DST days. This UTC date represents
  // a Berlin calendar day, never a UTC kickoff or a local-midnight instant.
  const monday=new Date(berlinDate(now)+'T12:00:00Z');
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7+offset*7);
  const start=monday.toISOString().slice(0,10);
  monday.setUTCDate(monday.getUTCDate()+7);
  return {start,end:monday.toISOString().slice(0,10)}; // end is exclusive
}
export function selectWeek(games,offset=0,now=Date.now()){
  if(![0,1].includes(offset))return [];
  const {start,end}=weekWindow(now,offset);
  return ordered(games.filter(game=>{
    const at=startTime(game);
    if(!at)return false;
    const date=berlinDate(at);
    return date>=start&&date<end;
  }));
}
export function selectWeekday(games,weekday,now=Date.now()){
  if(!Number.isInteger(weekday)||weekday<0||weekday>6)return [];
  return selectWeek(games,0,now).filter(game=>
    new Date(berlinDate(startTime(game))+'T12:00:00Z').getUTCDay()===weekday);
}
export function selectCalendarView(games,view,now=Date.now()){
  const config=CALENDAR_VIEWS.find(v=>v.view===view);
  if(!config)return [];
  return config.weekday===undefined?selectWeek(games,config.offset,now):
    selectWeekday(games,config.weekday,now);
}
