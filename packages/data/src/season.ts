/** Quick league simulation with real squads (validation of the database against the match engine). */
import {
  aggregateCalibration,
  DEFAULT_REFEREE,
  Rng,
  selectMatchTeam,
  simulateMatch,
  TOP14_BONUS,
  type BonusRules,
  type CalibrationReport,
  type MatchResult,
  type MatchTeam,
} from "@ovalie/engine";
import type { ClubDatabase } from "./schemas.js";

export interface StandingRow {
  clubId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  bonus: number;
  points: number;
}

export interface SeasonResult {
  table: StandingRow[];
  matches: MatchResult[];
}

export function matchTeamFor(db: ClubDatabase): MatchTeam {
  return selectMatchTeam(
    db.squad.map((e) => e.player),
    { id: db.club.id, name: db.club.name, shortName: db.club.shortName },
  );
}

/** Double round-robin, best XV every week (no fatigue, injuries or internationals yet: M3). */
export function simulateLeagueSeason(clubs: ClubDatabase[], seed: string, bonus: BonusRules = TOP14_BONUS): SeasonResult {
  const rng = new Rng(seed);
  const teams = clubs.map(matchTeamFor);
  const rows = new Map<string, StandingRow>(
    clubs.map((c) => [c.club.id, { clubId: c.club.id, name: c.club.name, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, bonus: 0, points: 0 }]),
  );
  const matches: MatchResult[] = [];
  for (let h = 0; h < teams.length; h++) {
    for (let a = 0; a < teams.length; a++) {
      if (h === a) continue;
      const weather = rng.weighted([["dry", 7], ["wet", 2], ["windy", 1]] as const);
      const res = simulateMatch({ home: teams[h]!, away: teams[a]!, referee: DEFAULT_REFEREE, weather, seed: `${seed}-${h}-${a}`, bonus });
      matches.push(res);
      [h, a].forEach((t, side) => {
        const r = rows.get(teams[t]!.id)!;
        const pf = res.score[side]!;
        const pa = res.score[1 - side]!;
        r.played++;
        r.pointsFor += pf;
        r.pointsAgainst += pa;
        if (pf > pa) r.won++;
        else if (pf === pa) r.drawn++;
        else r.lost++;
        const b = res.bonus[side as 0 | 1];
        r.bonus += (b.offensive ? 1 : 0) + (b.defensive ? 1 : 0);
        r.points += res.competitionPoints[side as 0 | 1];
      });
    }
  }
  const table = [...rows.values()].sort((x, y) => y.points - x.points || y.pointsFor - y.pointsAgainst - (x.pointsFor - x.pointsAgainst));
  return { table, matches };
}

/** Calibration indicators over several simulated seasons of a league. */
export function seasonCalibration(clubs: ClubDatabase[], seasons: number, seed = "season"): { report: CalibrationReport; averageRank: Map<string, number> } {
  const all: MatchResult[] = [];
  const rankSum = new Map<string, number>();
  for (let s = 0; s < seasons; s++) {
    const res = simulateLeagueSeason(clubs, `${seed}-${s}`);
    all.push(...res.matches);
    res.table.forEach((r, i) => rankSum.set(r.clubId, (rankSum.get(r.clubId) ?? 0) + i + 1));
  }
  return { report: aggregateCalibration(all), averageRank: new Map([...rankSum].map(([k, v]) => [k, v / seasons])) };
}
