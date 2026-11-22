/** Automatic match-day selection (AI clubs, quick tests): best 23 from a squad. */
import type { MatchTeam } from "../domain/match-setup.js";
import type { Player } from "../domain/player.js";
import { SHIRT_POSITION, type Position } from "../domain/positions.js";
import { DEFAULT_TACTICS, type Tactics } from "../domain/tactics.js";
import { BENCH_LAYOUT, type BenchSplit } from "../gen/team-gen.js";

/** Overall level (1–20) of a player, from his current ability or his attributes. */
export function playerLevel(p: Player): number {
  if (p.currentAbility) return p.currentAbility / 10;
  const v = Object.values(p.attributes);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Expected quality of a player at a position: level × familiarity factor (same factor as the match engine). */
export function positionalQuality(p: Player, pos: Position): number {
  const fam = p.positions[pos] ?? 1;
  return playerLevel(p) * (0.82 + 0.18 * (fam / 20));
}

/**
 * Selection score: much stricter than the in-match familiarity factor, so that coaches field
 * players in their positions. Front-row slots require a front-row specialist (familiarity ≥ 10).
 */
export function selectionScore(p: Player, pos: Position): number {
  const fam = p.positions[pos] ?? 1;
  if ((pos === "LH" || pos === "TH" || pos === "HK") && fam < 10) return -100 + fam;
  return playerLevel(p) - 0.3 * Math.max(0, 19 - fam);
}

/** Starters are picked scarcest position first so that specialists are not used elsewhere. */
const STARTER_ORDER = [3, 1, 2, 9, 10, 8, 7, 6, 4, 5, 15, 12, 13, 11, 14];

export interface SelectionOptions {
  id: string;
  name: string;
  shortName: string;
  bench?: BenchSplit;
  tactics?: Partial<Tactics>;
  controller?: "ai" | "human";
  captainTrust?: number;
  morale?: number;
  /** Players not available (injured, suspended, away with their country…). */
  unavailable?: ReadonlySet<string>;
  /** Freshness 0–100 of each player (missing = 100): tired players are rotated. */
  freshness?: ReadonlyMap<string, number>;
}

/** Selection malus (level points) for a tired player: 0 above 85 freshness, −2 at 45. */
export const fatiguePenalty = (freshness: number): number => Math.max(0, 85 - freshness) * 0.05;

/** Picks the 23 (shirts 1–23) of a squad. Throws if the squad cannot field 15 + the bench. */
export function selectMatchTeam(squad: readonly Player[], opts: SelectionOptions): MatchTeam {
  const pool = squad.filter((p) => !opts.unavailable?.has(p.id));
  const used = new Set<string>();
  const pick = (pos: Position): Player => {
    let best: Player | undefined;
    let bestQ = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const q = selectionScore(p, pos) - fatiguePenalty(opts.freshness?.get(p.id) ?? 100);
      if (q > bestQ) {
        bestQ = q;
        best = p;
      }
    }
    if (!best) throw new Error(`${opts.name}: not enough players to fill ${pos}`);
    used.add(best.id);
    return best;
  };
  const shirts = new Array<Player>(23);
  for (const shirt of STARTER_ORDER) shirts[shirt - 1] = pick(SHIRT_POSITION[shirt]!);
  BENCH_LAYOUT[opts.bench ?? "5-3"].forEach((pos, i) => (shirts[15 + i] = pick(pos)));

  const starters = shirts.slice(0, 15);
  const captain = starters.reduce((a, b) => (b.attributes.leadership + playerLevel(b) * 0.5 > a.attributes.leadership + playerLevel(a) * 0.5 ? b : a));
  const kicker = starters.reduce((a, b) => (b.attributes.goalKicking > a.attributes.goalKicking ? b : a));
  return {
    id: opts.id,
    name: opts.name,
    shortName: opts.shortName,
    players: shirts,
    tactics: { ...DEFAULT_TACTICS, ...opts.tactics },
    captainId: captain.id,
    goalKickerId: kicker.id,
    captainTrust: opts.captainTrust ?? 0.7,
    controller: opts.controller ?? "ai",
    morale: opts.morale ?? 0.5,
  };
}

/** Average level of the starting XV and of the 23. */
export function teamStrength(team: MatchTeam): { xv: number; matchday: number } {
  const q = (p: Player, i: number) => (i < 15 ? positionalQuality(p, SHIRT_POSITION[i + 1]!) : playerLevel(p));
  const xv = team.players.slice(0, 15).reduce((a, p, i) => a + q(p, i), 0) / 15;
  const md = team.players.reduce((a, p, i) => a + q(p, i), 0) / team.players.length;
  return { xv, matchday: md };
}
