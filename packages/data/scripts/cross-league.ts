/**
 * Every Top 14, PREM and URC club against every club of the two other leagues (home and away):
 * share of wins per league, to check the relative level of the leagues.
 * Usage: pnpm --filter @ovalie/data cross-league
 */
import { DEFAULT_REFEREE, simulateMatch } from "@ovalie/engine";
import { readDatabase } from "../src/io.js";
import { matchTeamFor } from "../src/season.js";

const teams = readDatabase()
  .filter((d) => ["TOP14", "PREM", "URC"].includes(d.club.league))
  .map((d) => ({ league: d.club.league, team: matchTeamFor(d) }));
const wins: Record<string, { won: number; played: number }> = {};
let n = 0;
for (const h of teams)
  for (const a of teams) {
    if (h.league === a.league) continue;
    const r = simulateMatch({ home: h.team, away: a.team, referee: DEFAULT_REFEREE, weather: "dry", seed: `cross-${n++}` });
    for (const [side, t] of [[0, h], [1, a]] as const) {
      const w = (wins[t.league] ??= { won: 0, played: 0 });
      w.played++;
      if (r.score[side]! > r.score[1 - side]!) w.won++;
    }
  }
for (const [league, w] of Object.entries(wins)) console.log(`${league.padEnd(6)} ${((100 * w.won) / w.played).toFixed(1).padStart(5)} % de victoires contre les autres ligues (${w.played} matchs)`);
