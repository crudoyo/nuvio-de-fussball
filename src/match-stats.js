import {startTime} from './matchdays.js';

const nameKey=name=>String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
const teamId=team=>{
  const id=team?.teamId??team?.teamInfoId;
  return Number.isSafeInteger(id)&&id>0?id:null;
};
function sameTeam(a,b){
  const left=teamId(a),right=teamId(b);
  if(left&&right)return left===right;
  const name=nameKey(a?.teamName);
  return Boolean(name)&&name===nameKey(b?.teamName);
}
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;

export function standingsUrl(shortcut,season){
  return ['bl1','bl2','bl3'].includes(shortcut?.toLowerCase())
    ?`https://api.openligadb.de/getbltable/${shortcut.toLowerCase()}/${season}`:null;
}
export function resultOfType(match,type=2){
  const result=match.matchResults?.find(r=>r.resultTypeID===type);
  return result&&nonnegative(result.pointsTeam1)&&nonnegative(result.pointsTeam2)?result:null;
}

/** Current-season context; never present this as a historical pre-match table. */
export function createStatsContext(games,table=[],now=Date.now()){
  const standings=(Array.isArray(table)?table:[]).map((team,index)=>({team,rank:index+1}))
    .filter(({team})=>Number.isSafeInteger(team.points)&&nonnegative(team.goals)&&
      nonnegative(team.opponentGoals)&&nonnegative(team.matches)&&team.matches>0);
  const seen=new Set();
  const history=games.flatMap(game=>{
    const at=startTime(game),score=resultOfType(game);
    if(game.matchIsFinished!==true||!at||+at>now||!score||seen.has(game.matchID))return [];
    seen.add(game.matchID);return [{game,score}];
  });
  const cache=new Map();
  return team=>{
    const key=teamId(team)?'id:'+teamId(team):'name:'+nameKey(team?.teamName);
    if(cache.has(key))return cache.get(key);
    const entry=standings.find(row=>sameTeam(team,row.team));
    let record=null;
    if(entry&&nonnegative(entry.team.won)&&nonnegative(entry.team.lost)&&entry.team.won+entry.team.lost<=entry.team.matches){
      record={wins:entry.team.won,losses:entry.team.lost};
    }else{
      for(const {game,score} of history){
        const home=sameTeam(team,game.team1),away=sameTeam(team,game.team2);
        if(home===away)continue;
        const scored=home?score.pointsTeam1:score.pointsTeam2;
        const conceded=home?score.pointsTeam2:score.pointsTeam1;
        record??={wins:0,losses:0};
        if(scored>conceded)record.wins++;
        if(scored<conceded)record.losses++;
      }
    }
    const result={standing:entry?{rank:entry.rank,points:entry.team.points,
      goals:entry.team.goals,against:entry.team.opponentGoals}:null,record};
    cache.set(key,result);return result;
  };
}

export function statisticsLines(match,context){
  if(!context)return [];
  return [match.team1,match.team2].flatMap(team=>{
    if(!team?.teamName)return [];
    const {standing,record}=context(team),parts=[];
    if(standing)parts.push(`Platz ${standing.rank}`,`${standing.points} Punkte`);
    if(record)parts.push(`Siege/Niederlagen ${record.wins}:${record.losses}`);
    if(standing)parts.push(`Tore ${standing.goals}:${standing.against}`);
    return parts.length?[team.teamName+': '+parts.join(' · ')+'.']:[];
  });
}
