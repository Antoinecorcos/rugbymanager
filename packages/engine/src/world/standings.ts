/** League / pool tables computed from played fixtures. */
import type { Fixture } from "./types.js";

export interface TableRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  triesAgainst: number;
  offensiveBonus: number;
  defensiveBonus: number;
  /** Extra points (Grand Slam bonus…) or deductions. */
  adjustments: number;
  points: number;
}

const emptyRow = (team: string): TableRow => ({
  team, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, triesFor: 0, triesAgainst: 0,
  offensiveBonus: 0, defensiveBonus: 0, adjustments: 0, points: 0,
});

/** Standard ordering: points, then point difference, try difference, points scored. */
export function compareRows(a: TableRow, b: TableRow): number {
  return (
    b.points - a.points ||
    b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
    b.triesFor - b.triesAgainst - (a.triesFor - a.triesAgainst) ||
    b.pointsFor - a.pointsFor ||
    a.team.localeCompare(b.team)
  );
}

export function computeTable(teams: readonly string[], fixtures: readonly Fixture[], adjustments: Record<string, number> = {}): TableRow[] {
  const rows = new Map(teams.map((t) => [t, emptyRow(t)]));
  for (const f of fixtures) {
    const r = f.result;
    if (!r) continue;
    ([f.home, f.away] as const).forEach((team, side) => {
      const row = rows.get(team);
      if (!row) return;
      const s = side as 0 | 1;
      const o = (1 - s) as 0 | 1;
      row.played++;
      row.pointsFor += r.score[s];
      row.pointsAgainst += r.score[o];
      row.triesFor += r.tries[s];
      row.triesAgainst += r.tries[o];
      if (r.score[s] > r.score[o]) row.won++;
      else if (r.score[s] === r.score[o]) row.drawn++;
      else row.lost++;
      if (r.bonus[s].offensive) row.offensiveBonus++;
      if (r.bonus[s].defensive) row.defensiveBonus++;
      row.points += r.competitionPoints[s];
    });
  }
  for (const [team, adj] of Object.entries(adjustments)) {
    const row = rows.get(team);
    if (row) {
      row.adjustments += adj;
      row.points += adj;
    }
  }
  return [...rows.values()].sort(compareRows);
}
