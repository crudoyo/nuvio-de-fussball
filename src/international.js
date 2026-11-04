/**
 * UEFA Europa League and Conference League fixture adapter.
 * Uses ESPN's public soccer scoreboard; only schedules and team logos, no streams.
 */
export const UEFA_ESPN_CODES = Object.freeze({
  uel: 'uefa.europa',
  uecl: 'uefa.europa.conf'
});

const dateKey = date => date.toISOString().slice(0, 10).replace(/-/g, '');

export function espnScoreboardUrl(shortcut, now = new Date()) {
  const league = UEFA_ESPN_CODES[shortcut];
  if (!league) return null;
  const start = new Date(now.getTime() - 24 * 3600000);
  const end = new Date(now.getTime() + 31 * 86400000);
  return 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
    + league + '/scoreboard?dates=' + dateKey(start) + '-' + dateKey(end) + '&limit=300';
}
function displayName(team) {
  return team?.displayName || team?.name || team?.shortDisplayName || '';
}
function teamIcon(team) {
  return team?.logo || team?.logos?.[0]?.href || '';
}
export function normalizeEspnEvents(payload) {
  if (!Array.isArray(payload?.events)) return [];
  return payload.events.flatMap(event => {
    const competitors = event?.competitions?.[0]?.competitors;
    if (!Array.isArray(competitors)) return [];
    const home = competitors.find(x => x.homeAway === 'home');
    const away = competitors.find(x => x.homeAway === 'away');
    const kickoff = new Date(event.date);
    if (!home?.team || !away?.team || !Number.isFinite(+kickoff)
      || !/^\d+$/.test(String(event.id))) return [];
    const finished = event.status?.type?.completed === true;
    const result = finished && Number.isFinite(Number(home.score)) && Number.isFinite(Number(away.score))
      ? [{resultTypeID: 2, pointsTeam1: Number(home.score), pointsTeam2: Number(away.score)}] : [];
    return [{
      matchID: Number(event.id),
      matchDateTimeUTC: kickoff.toISOString(),
      matchIsFinished: finished,
      matchResults: result,
      team1: {teamName: displayName(home.team), teamIconUrl: teamIcon(home.team)},
      team2: {teamName: displayName(away.team), teamIconUrl: teamIcon(away.team)}
    }];
  });
}
