export const SIMULCAST_LEAGUES=new Map([
  {shortcut:'bl1',name:'Bundesliga-Konferenz',label:'1. Bundesliga',
    title:/^(?:(?:Germany|Deutschland)\s*[-–]\s*)?(?:1\.\s*)?Bundesliga\s*:\s*Simulcast$/i},
  {shortcut:'bl3',name:'3. Liga-Konferenz',label:'3. Liga',
    title:/^(?:(?:Germany|Deutschland)\s*[-–]\s*)?3\.\s*Liga\s*:\s*Simulcast$/i}
].map(league=>[league.shortcut,league]));
const germanChannel=channel=>/\b(?:DE|Deutsch|Germany)\b/i.test(channel.name);

export function leagueSimulcasts(events,league){
  const slots=new Map();
  for(const event of events){
    const start=Date.parse(event.startTime);
    if(!league.title.test(event.name.trim())||!Number.isFinite(start)||!event.channels.length)continue;
    const matchID=Math.floor(start/1000);
    if(!slots.has(matchID))slots.set(matchID,{matchID,matchDateTimeUTC:new Date(start).toISOString(),channels:new Map()});
    const {channels}=slots.get(matchID);
    for(const channel of event.channels)if(!channels.has(channel.id))channels.set(channel.id,channel);
  }
  return [...slots.values()].map(slot=>({...slot,channels:[...slot.channels.values()]
    .sort((a,b)=>Number(germanChannel(b))-Number(germanChannel(a)))}));
}

export function simulcastArtwork(league,background){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="405" viewBox="0 0 720 405">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#092a32"/><stop offset="1" stop-color="#173b46"/></linearGradient></defs>
    <rect width="720" height="405" fill="url(#bg)"/>
    <g stroke="#8fe2bb" stroke-opacity="${background?'.26':'.16'}" fill="none" stroke-width="3">
      <rect x="50" y="42" width="620" height="321" rx="8"/><path d="M360 42v321 M50 116h98v173H50 M670 116h-98v173h98"/><circle cx="360" cy="202" r="56"/>
    </g>
    ${background?'':`<rect x="103" y="111" width="514" height="184" rx="17" fill="#09242e"/>
    <text x="360" y="174" text-anchor="middle" font-family="Arial,sans-serif" fill="#8fe2bb" font-size="26" font-weight="700">${league.label}</text>
    <text x="360" y="238" text-anchor="middle" font-family="Arial,sans-serif" fill="#fff" font-size="58" font-weight="700">Konferenz</text>`}
  </svg>`;
}
