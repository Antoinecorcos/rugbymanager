/**
 * Level estimation: turns public facts into an overall level on the engine's 1–20 scale
 * (≈ 11 Pro D2 regular, ≈ 13 Top 14 regular, ≈ 15.5 international, 17+ world class).
 *
 * Every component is kept in a breakdown so that the game (and the editor) can explain a rating.
 */
import type { Position } from "@ovalie/engine";
import type { CareerSeason, RawPlayer } from "../raw.js";
import type { League } from "../schemas.js";
import { DEFAULT_CAP_WEIGHT, NATION_CAP_WEIGHT } from "./nations.js";

export interface LevelContext {
  league: League;
  /** Club strength z-score inside its league (budget, or last season's rank when no budget is known). */
  clubBudgetZ: number;
  /** Current season label, e.g. "2026-2027". */
  season: string;
  /** Matches played so far by the busiest player of each competition in the current season. */
  roundsSoFar: Record<string, number>;
  /** Reference date for ages (ISO). */
  referenceDate: string;
}

export interface LevelBreakdown {
  /** Level implied by domestic playing time (league strength + usage). */
  club: number;
  international: number;
  age: number;
  clubStrength: number;
  /** Total before manual override. */
  estimate: number;
  /** Set when a manual override replaced the estimate. */
  override?: number;
  /** Final level. */
  level: number;
  /** Data quality: share of the estimate coming from real statistics (0..1). */
  evidence: number;
}

/** Strength of each domestic competition on the level scale (regular-season starter ≈ base + 1). */
export const COMPETITION_BASE: Record<string, number> = {
  "TOP 14": 11.6,
  "PRO D2": 10.1,
  NATIONALE: 9.4,
  PREM: 11.3,
  URC: 11.1,
};

export const LEAGUE_BASE: Record<League, number> = {
  TOP14: 11.6,
  PROD2: 10.1,
  NATIONALE: 9.4,
  PREM: 11.3,
  URC: 11.1,
  OTHER: 9.0,
};

/**
 * Rounds used to measure usage. PREM / URC lines are estimated from club appearances in all
 * competitions (Wikipedia infobox), hence a larger denominator than their 18 league rounds.
 */
const ROUNDS: Record<string, number> = { "TOP 14": 26, "PRO D2": 30, NATIONALE: 26, PREM: 24, URC: 24 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ageAt(birthDate: string | undefined, age: number | undefined, ref: string): number {
  if (birthDate) {
    const b = new Date(birthDate);
    const r = new Date(ref);
    let a = r.getFullYear() - b.getFullYear();
    if (r.getMonth() < b.getMonth() || (r.getMonth() === b.getMonth() && r.getDate() < b.getDate())) a--;
    return a;
  }
  return age ?? 26;
}

const previousSeason = (s: string, back: number) => {
  const y = Number(s.slice(0, 4)) - back;
  return `${y}-${y + 1}`;
};

/**
 * Usage of a player in one season, 0..1. Mixes availability (share of all minutes)
 * and status when selected (minutes per appearance), so that internationals who miss
 * club games are not mistaken for fringe players.
 */
export function seasonUsage(row: CareerSeason, rounds: number): number {
  if (row.matches <= 0 || rounds <= 0) return 0;
  const share = row.minutes / (rounds * 80);
  const perMatch = row.minutes / row.matches / 80;
  const status = perMatch * Math.min(1, row.matches / Math.max(4, rounds * 0.3));
  return clamp(Math.max(share, 0.85 * status), 0, 1);
}

/** Level bonus for usage: fringe −1.3 … key starter +1.2. */
export const usageBonus = (u: number) => clamp(-1.3 + 3.4 * u, -1.3, 1.2);

/** Level implied by the last seasons of domestic statistics; undefined when no data. */
export function clubLevel(career: CareerSeason[], ctx: LevelContext): { level: number; evidence: number } | undefined {
  const weights: [string, number][] = [
    [ctx.season, 1],
    [previousSeason(ctx.season, 1), 1],
    [previousSeason(ctx.season, 2), 0.45],
  ];
  let sum = 0;
  let wsum = 0;
  let evidence = 0;
  for (const [season, baseW] of weights) {
    // A player can have two rows in a season (transfer): merge them per competition.
    const rows = career.filter((r) => r.season === season);
    if (!rows.length) continue;
    const byComp = new Map<string, CareerSeason>();
    for (const r of rows) {
      const prev = byComp.get(r.competition);
      byComp.set(r.competition, prev ? { ...prev, matches: prev.matches + r.matches, minutes: prev.minutes + r.minutes } : r);
    }
    for (const [comp, r] of byComp) {
      const base = COMPETITION_BASE[comp];
      if (base === undefined) continue;
      const fullRounds = ROUNDS[comp] ?? 26;
      const rounds = season === ctx.season ? Math.min(fullRounds, Math.max(1, ctx.roundsSoFar[comp] ?? fullRounds)) : fullRounds;
      const progress = rounds / fullRounds;
      const w = baseW * (season === ctx.season ? progress : 1);
      if (w <= 0) continue;
      sum += w * (base + usageBonus(seasonUsage(r, rounds)));
      wsum += w;
      evidence += w * Math.min(1, r.minutes / 600);
    }
  }
  if (wsum === 0) return undefined;
  return { level: sum / wsum, evidence: clamp(evidence / 2, 0, 1) };
}

/** International recognition bonus from senior caps. */
export function internationalBonus(p: Pick<RawPlayer, "caps" | "capped" | "sevens" | "nationality">): number {
  const caps = p.caps ?? (p.capped ? 5 : 0);
  let bonus = 0;
  if (caps > 0) {
    const nationFactor = NATION_CAP_WEIGHT[p.nationality] ?? DEFAULT_CAP_WEIGHT;
    bonus = nationFactor * Math.min(1.8, 0.5 + 0.35 * Math.log(1 + caps / 2));
  }
  if (p.sevens) bonus = Math.max(bonus, 0.25);
  return bonus;
}

/** Age effect: still developing below 22 (front row/locks below 24), declining after the position's peak. */
export function ageAdjustment(age: number, pos: Position): number {
  const lateDeveloper = pos === "LH" || pos === "TH" || pos === "HK" || pos === "LO";
  const matureAt = lateDeveloper ? 24 : 22;
  const peakEnd = lateDeveloper ? 33 : pos === "WG" || pos === "OC" || pos === "FB" ? 30 : 32;
  if (age < matureAt) return -0.3 * (matureAt - age);
  if (age > peakEnd) return -0.3 * (age - peakEnd);
  return 0;
}

export function estimateLevel(p: RawPlayer, pos: Position, ctx: LevelContext): LevelBreakdown {
  const base = LEAGUE_BASE[ctx.league];
  const cl = clubLevel(p.career, ctx);
  const age = ageAt(p.birthDate, p.age, ctx.referenceDate);
  // No league statistics: new arrival (abroad / lower league) or academy player.
  // Usage-free prior = a squad player of the league, slightly below a regular.
  const club = cl ? cl.level : base - 0.6;
  const evidence = cl?.evidence ?? 0;
  const international = internationalBonus(p);
  // With no domestic evidence, the club's financial strength says more about the player.
  const clubStrength = clamp(ctx.clubBudgetZ, -2, 2) * (0.15 + 0.25 * (1 - evidence));
  const ageAdj = cl ? ageAdjustment(age, pos) * 0.6 : ageAdjustment(age, pos); // statistics already reflect most of it
  const estimate = clamp(club + international + ageAdj + clubStrength, 5, 19.5);
  return {
    club: round2(club),
    international: round2(international),
    age: round2(ageAdj),
    clubStrength: round2(clubStrength),
    estimate: round2(estimate),
    level: round2(estimate),
    evidence: round2(evidence),
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
