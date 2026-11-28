import { DEFAULT_REFEREE } from "../domain/match-setup.js";
import { generateMatchTeam } from "../gen/team-gen.js";
import { Rng } from "../rng.js";
import { simulateMatch } from "./engine.js";
import type { MatchResult } from "./types.js";

/**
 * Real-world targets (Top 14, per match, both teams combined unless stated).
 * Ranges are deliberately a bit wide: they encode "plausible professional rugby",
 * not one specific season.
 * Points, tries, draws and bonus points were checked in M2 against the real Top 14 regular
 * seasons 2021-22 → 2025-26 (910 matches, `pnpm --filter @ovalie/data real-stats`):
 * 49.7 points, 5.66 tries, 2.3 % draws, 0.34 offensive and 0.32 defensive bonus points per match.
 */
export const TARGETS = {
  points: { label: "Points", min: 45, max: 60 },
  tries: { label: "Essais", min: 4.8, max: 7 },
  penaltiesConceded: { label: "Pénalités concédées", min: 17, max: 25 },
  penaltyGoalAttempts: { label: "Tentatives de pénalité", min: 4, max: 8 },
  penaltyGoalPct: { label: "% réussite pénalités", min: 72, max: 86 },
  conversionPct: { label: "% réussite transformations", min: 66, max: 80 },
  dropGoals: { label: "Drops réussis", min: 0.05, max: 0.45 },
  lineouts: { label: "Touches", min: 20, max: 32 },
  lineoutRetention: { label: "% touches conservées", min: 83, max: 92 },
  scrums: { label: "Mêlées", min: 10, max: 18 },
  scrumPenalties: { label: "Pénalités en mêlée", min: 2, max: 5 },
  rucks: { label: "Rucks", min: 140, max: 210 },
  fastRuckPct: { label: "% rucks rapides (<3 s)", min: 40, max: 65 },
  tackles: { label: "Plaquages réussis", min: 220, max: 340 },
  missedTackles: { label: "Plaquages manqués", min: 25, max: 50 },
  lineBreaks: { label: "Franchissements", min: 6, max: 14 },
  offloads: { label: "Offloads", min: 10, max: 26 },
  turnovers: { label: "Turnovers gagnés", min: 9, max: 20 },
  kicksInPlay: { label: "Coups de pied dans le jeu", min: 38, max: 66 },
  // Real Top 14: 259 yellow cards in 2023-24 (182 matches, 1.42 per match), 168 in the first half
  // of 2024-25 (91 matches, 1.85). Cards for repeated infringements (team warning) since M8.
  yellowCards: { label: "Cartons jaunes", min: 1.1, max: 2 },
  redCards: { label: "Cartons rouges", min: 0.02, max: 0.15 },
  ballInPlayMin: { label: "Temps de jeu effectif (min)", min: 31, max: 40 },
  durationMin: { label: "Durée totale (min)", min: 80, max: 86 },
  injuries: { label: "Sorties sur blessure", min: 0.7, max: 2.5 },
  hias: { label: "Protocoles commotion", min: 0.3, max: 1.2 },
  homeWinPct: { label: "% victoires à domicile", min: 60, max: 77 },
  drawPct: { label: "% matchs nuls", min: 0.5, max: 5 },
  // Real Top 14 (+3 tries rule): 0.30–0.48 per season, 0.34 on average (2021-2026).
  offensiveBonusPerMatch: { label: "Bonus offensifs / match", min: 0.22, max: 0.45 },
  // Real Top 14: 0.29–0.34 per season. The engine sits in the lower part of the range (close games are a bit rare).
  defensiveBonusPerMatch: { label: "Bonus défensifs / match", min: 0.2, max: 0.4 },
} as const;

export type CalibrationReport = Record<keyof typeof TARGETS, number>;

export function runCalibration(matches: number, seed = "calibration"): CalibrationReport {
  const rng = new Rng(seed);
  const levels = Array.from({ length: 14 }, (_, i) => 12.1 + i * 0.14);
  const teams = levels.map((level, i) =>
    generateMatchTeam(rng, { id: `t${i}`, name: `Équipe ${i}`, level, bench: rng.weighted([["5-3", 6], ["6-2", 3], ["7-1", 1]] as const) }),
  );
  const results: MatchResult[] = [];
  for (let m = 0; m < matches; m++) {
    const h = rng.int(0, 13);
    let a = rng.int(0, 12);
    if (a >= h) a += 1;
    results.push(simulateMatch({ home: teams[h]!, away: teams[a]!, referee: DEFAULT_REFEREE, weather: rng.weighted([["dry", 7], ["wet", 2], ["windy", 1]] as const), seed: `${seed}-${m}` }));
  }
  return aggregateCalibration(results);
}

/** Averages the calibration indicators over a set of simulated matches. */
export function aggregateCalibration(list: readonly MatchResult[]): CalibrationReport {
  const matches = Math.max(1, list.length);
  const acc: Record<string, number> = {};
  const add = (k: string, v: number) => (acc[k] = (acc[k] ?? 0) + v);
  let homeWins = 0;
  let draws = 0;
  for (const res of list) {
    const [s0, s1] = res.teamStats;
    const both = (f: (s: typeof s0) => number) => f(s0) + f(s1);
    add("points", both((s) => s.points));
    add("tries", both((s) => s.tries));
    add("penaltiesConceded", both((s) => s.penaltiesConceded));
    add("penaltyGoalAttempts", both((s) => s.penaltyGoalsAttempted));
    add("penaltyGoalsMade", both((s) => s.penaltyGoalsMade));
    add("conversionsAttempted", both((s) => s.conversionsAttempted));
    add("conversionsMade", both((s) => s.conversionsMade));
    add("dropGoals", both((s) => s.dropGoalsMade));
    add("lineouts", both((s) => s.lineoutsThrown));
    add("lineoutsWon", both((s) => s.lineoutsWon));
    add("scrums", both((s) => s.scrumsFed));
    add("scrumPenalties", both((s) => s.scrumPenaltiesWon));
    add("rucks", both((s) => s.rucksWon + s.rucksLost));
    add("fastRucks", both((s) => s.fastRucks));
    add("rucksWon", both((s) => s.rucksWon));
    add("tackles", both((s) => s.tacklesMade));
    add("missedTackles", both((s) => s.tacklesMissed));
    add("lineBreaks", both((s) => s.lineBreaks));
    add("offloads", both((s) => s.offloads));
    add("turnovers", both((s) => s.turnoversWon));
    add("kicksInPlay", both((s) => s.kicksInPlay));
    add("yellowCards", both((s) => s.yellowCards));
    add("redCards", both((s) => s.redCards));
    add("injuries", both((s) => s.injuries));
    add("hias", both((s) => s.hias));
    add("ballInPlayMin", res.ballInPlaySeconds / 60);
    add("durationMin", res.totalSeconds / 60);
    add("offensiveBonusPerMatch", (res.bonus[0].offensive ? 1 : 0) + (res.bonus[1].offensive ? 1 : 0));
    add("defensiveBonusPerMatch", (res.bonus[0].defensive ? 1 : 0) + (res.bonus[1].defensive ? 1 : 0));
    if (res.score[0] > res.score[1]) homeWins++;
    else if (res.score[0] === res.score[1]) draws++;
  }
  const avg = (k: string) => (acc[k] ?? 0) / matches;
  return {
    points: avg("points"),
    tries: avg("tries"),
    penaltiesConceded: avg("penaltiesConceded"),
    penaltyGoalAttempts: avg("penaltyGoalAttempts"),
    penaltyGoalPct: (100 * (acc.penaltyGoalsMade ?? 0)) / Math.max(1, acc.penaltyGoalAttempts ?? 0),
    conversionPct: (100 * (acc.conversionsMade ?? 0)) / Math.max(1, acc.conversionsAttempted ?? 0),
    dropGoals: avg("dropGoals"),
    lineouts: avg("lineouts"),
    lineoutRetention: (100 * (acc.lineoutsWon ?? 0)) / Math.max(1, acc.lineouts ?? 0),
    scrums: avg("scrums"),
    scrumPenalties: avg("scrumPenalties"),
    rucks: avg("rucks"),
    fastRuckPct: (100 * (acc.fastRucks ?? 0)) / Math.max(1, acc.rucksWon ?? 0),
    tackles: avg("tackles"),
    missedTackles: avg("missedTackles"),
    lineBreaks: avg("lineBreaks"),
    offloads: avg("offloads"),
    turnovers: avg("turnovers"),
    kicksInPlay: avg("kicksInPlay"),
    yellowCards: avg("yellowCards"),
    redCards: avg("redCards"),
    ballInPlayMin: avg("ballInPlayMin"),
    durationMin: avg("durationMin"),
    injuries: avg("injuries"),
    hias: avg("hias"),
    homeWinPct: (100 * homeWins) / matches,
    drawPct: (100 * draws) / matches,
    offensiveBonusPerMatch: avg("offensiveBonusPerMatch"),
    defensiveBonusPerMatch: avg("defensiveBonusPerMatch"),
  };
}
