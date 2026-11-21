import type { MatchTeam } from "../domain/match-setup.js";
import type { Player } from "../domain/player.js";
import { SHIRT_POSITION, type Position } from "../domain/positions.js";
import { DEFAULT_TACTICS, type Tactics } from "../domain/tactics.js";
import { Rng } from "../rng.js";
import { generatePlayer } from "./player-gen.js";

export type BenchSplit = "5-3" | "6-2" | "7-1";

/** Positions of bench shirts 16..23 for each split. */
export const BENCH_LAYOUT: Record<BenchSplit, Position[]> = {
  "5-3": ["HK", "LH", "TH", "LO", "BF", "SH", "FH", "OC"],
  "6-2": ["HK", "LH", "TH", "LO", "LO", "BF", "SH", "FH"],
  "7-1": ["HK", "LH", "TH", "LO", "LO", "BF", "N8", "SH"],
};

export interface GenTeamOptions {
  id: string;
  name: string;
  shortName?: string;
  /** Average level on the 1–20 scale. */
  level: number;
  bench?: BenchSplit;
  tactics?: Partial<Tactics>;
  controller?: "ai" | "human";
  captainTrust?: number;
}

/** Generates a full 23-man match-day squad. Bench players are slightly weaker. */
export function generateMatchTeam(rng: Rng, opts: GenTeamOptions): MatchTeam {
  const players: Player[] = [];
  for (let shirt = 1; shirt <= 15; shirt++) {
    const pos = SHIRT_POSITION[shirt]!;
    players.push(
      generatePlayer(rng, { position: pos, level: opts.level + rng.normal(0, 0.7), id: `${opts.id}-${shirt}` }),
    );
  }
  const bench = BENCH_LAYOUT[opts.bench ?? "5-3"];
  bench.forEach((pos, i) => {
    players.push(
      generatePlayer(rng, { position: pos, level: opts.level - 0.6 + rng.normal(0, 0.7), id: `${opts.id}-${16 + i}` }),
    );
  });

  // Captain: best leader among starters. Kicker: best goal kicker among starters.
  const starters = players.slice(0, 15);
  const captain = starters.reduce((a, b) => (b.attributes.leadership > a.attributes.leadership ? b : a));
  const kicker = starters.reduce((a, b) => (b.attributes.goalKicking > a.attributes.goalKicking ? b : a));

  return {
    id: opts.id,
    name: opts.name,
    shortName: opts.shortName ?? opts.name.slice(0, 3).toUpperCase(),
    players,
    tactics: { ...DEFAULT_TACTICS, ...opts.tactics },
    captainId: captain.id,
    goalKickerId: kicker.id,
    captainTrust: opts.captainTrust ?? 0.7,
    controller: opts.controller ?? "ai",
    morale: 0.5,
  };
}
