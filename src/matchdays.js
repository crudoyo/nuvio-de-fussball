/** Official round selection for the Bundesliga / 3. Liga catalog trial. */
const DAY=86400000;
const LIVE_WINDOW=3*3600000;
const dateFormatter=new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
});

export const MATCHDAY_VIEWS=Object.freeze([
  {suffix:'',view:'next',label:'Nächster Spieltag'},
  {suffix:'_following',view:'following',label:'Darauffolgender Spieltag'},
  {suffix:'_sunday',view:'sunday',label:'Sonntagsspiele'}
]);
export const hasMatchdayCatalogs=shortcut=>['bl1','bl3'].includes(String(shortcut).toLowerCase());

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
  return n?String(match.group?.groupName||`${n}. Spieltag`).trim():null;
}
export const berlinDate=timestamp=>dateFormatter.format(new Date(timestamp));
function ordered(games){
  return [...games].sort((a,b)=>
    (startTime(a)?.getTime()??Infinity)-(startTime(b)?.getTime()??Infinity)||a.matchID-b.matchID);
}

export function selectMatchday(games,offset=0,now=Date.now()){
  if(![0,1].includes(offset))return [];
  const groups=new Map();
  for(const game of games){
    const number=matchdayNumber(game);
    if(number){
      if(!groups.has(number))groups.set(number,[]);
      groups.get(number).push(game);
    }
  }
  const rounds=[...groups].sort(([a],[b])=>a-b).map(([number,matches])=>{
    const times=matches.map(m=>startTime(m)?.getTime()).filter(Number.isFinite).sort((a,b)=>a-b);
    const anchor=times[Math.floor(times.length/2)];
    const pending=matches.filter(m=>!m.matchIsFinished&&
      startTime(m)?.getTime()+LIVE_WINDOW>=now);
    // The majority's dates locate the regular round. A single postponed game
    // weeks later stays in its original round without becoming the next round.
    const regular=pending.filter(m=>Math.abs(startTime(m).getTime()-anchor)<=4*DAY);
    return {number,matches,pending,regular};
  });
  const next=rounds.find(r=>r.regular.length)||
    // At the end of the season only a catch-up fixture may remain.
    rounds.filter(r=>r.pending.length).sort((a,b)=>
      +startTime(ordered(a.pending)[0])-+startTime(ordered(b.pending)[0]))[0]||
    rounds.find(r=>r.matches.some(m=>!m.matchIsFinished)&&r.matches.every(m=>!startTime(m)));
  if(!next)return [];
  const selected=offset===0?next:rounds.find(r=>r.number>next.number);
  return selected?ordered(selected.matches):[];
}

export function upcomingSunday(now=Date.now()){
  // Work with Berlin's calendar date, not elapsed 24h blocks across DST.
  const day=new Date(berlinDate(now)+'T12:00:00Z');
  day.setUTCDate(day.getUTCDate()+(7-day.getUTCDay())%7);
  return day.toISOString().slice(0,10);
}
export function selectSunday(games,now=Date.now()){
  const sunday=upcomingSunday(now);
  return ordered(games.filter(m=>startTime(m)&&berlinDate(startTime(m))===sunday));
}
