import { isForward } from "../domain/positions.js";
import type { PlayerMatchStats } from "./types.js";

/**
 * FM-style match rating out of 10 (6.0 = average performance).
 * Contributions are weighted per minute played so that a 10-minute cameo is not over-rated.
 */
export function computeRatings(teams: [PlayerMatchStats[], PlayerMatchStats[]], score: [number, number]): void {
  teams.forEach((list, side) => {
    const diff = score[side]! - score[side === 0 ? 1 : 0]!;
    const resultBonus = diff > 0 ? 0.25 : diff < 0 ? -0.25 : 0;
    for (const ps of list) {
      if (ps.minutes <= 0) {
        ps.rating = 6;
        continue;
      }
      const fwd = isForward(ps.position);
      let c = 0;
      c += ps.tries * 0.75;
      c += ps.lineBreaks * 0.3;
      c += ps.defendersBeaten * 0.1;
      c += ps.metres * (fwd ? 0.012 : 0.008);
      c += ps.carries * (fwd ? 0.03 : 0.015);
      c += ps.offloads * 0.08;
      c += ps.tacklesMade * (fwd ? 0.035 : 0.04);
      c -= ps.tacklesMissed * 0.12;
      c += ps.turnoversWon * 0.3;
      c += ps.lineoutWins * 0.06;
      c += ps.goalKicksMade * 0.12;
      c -= ps.goalKicksMissed * 0.12;
      c -= ps.handlingErrors * 0.18;
      c -= ps.penaltiesConceded * 0.2;
      c -= ps.yellowCards * 0.9;
      c -= ps.redCards * 2;
      // Normalise to an 80-minute performance, dampened for short stints.
      const share = Math.min(1, ps.minutes / 80);
      const expected = (fwd ? 1.1 : 0.9) * share;
      const perf = (c - expected) / Math.max(0.35, Math.sqrt(share));
      const rating = 6.3 + perf * 0.55 + resultBonus * share;
      ps.rating = Math.round(Math.min(10, Math.max(3, rating)) * 10) / 10;
    }
  });
}
