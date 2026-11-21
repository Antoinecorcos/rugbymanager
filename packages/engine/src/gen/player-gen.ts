import { ALL_ATTRIBUTES, HIDDEN_ATTRIBUTES, type AttributeKey, type Attributes, type HiddenAttributes } from "../domain/attributes.js";
import type { Player } from "../domain/player.js";
import type { Position } from "../domain/positions.js";
import { clamp, Rng } from "../rng.js";
import { NAME_POOLS, NATIONALITY_WEIGHTS_TOP14 } from "./names.js";

/**
 * Per-position attribute offsets relative to the player's overall level.
 * Positive = key attribute for the role, negative = rarely needed.
 */
type Profile = Partial<Record<AttributeKey, number>>;

const FORWARD_BASE: Profile = {
  kicking: -7, tacticalKicking: -7, goalKicking: -9, passing: -3, footwork: -3, flair: -2,
  pace: -3, acceleration: -2, agility: -3, highBall: -3, lineoutThrowing: -9,
  rucking: 2, strength: 2, maul: 1, contactResilience: 1, workRate: 1, tackling: 1,
};
const BACK_BASE: Profile = {
  scrummaging: -10, lineoutThrowing: -10, lineoutJumping: -9, maul: -6, jackal: -4, rucking: -3,
  strength: -2, pace: 2, acceleration: 1, agility: 1, footwork: 1, handling: 1, passing: 1,
};

const PROFILES: Record<Position, Profile> = {
  LH: { ...FORWARD_BASE, scrummaging: 4, strength: 3, pace: -6, acceleration: -5, agility: -5, jumping: -4, lineoutJumping: -6, jackal: -1, offloading: -2 },
  TH: { ...FORWARD_BASE, scrummaging: 5, strength: 4, pace: -7, acceleration: -5, agility: -6, jumping: -5, lineoutJumping: -6, jackal: -2, offloading: -2 },
  HK: { ...FORWARD_BASE, scrummaging: 2, lineoutThrowing: 4, jackal: 1, maul: 2, pace: -3, lineoutJumping: -6 },
  LO: { ...FORWARD_BASE, lineoutJumping: 4, jumping: 2, scrummaging: 0, maul: 2, highBall: 0, pace: -3, agility: -3 },
  BF: { ...FORWARD_BASE, tackling: 3, lineoutJumping: 1, scrummaging: -3, jackal: 1, workRate: 3, aggression: 1 },
  OF: { ...FORWARD_BASE, jackal: 4, tackling: 3, workRate: 3, anticipation: 2, pace: 0, scrummaging: -3, lineoutJumping: -2 },
  N8: { ...FORWARD_BASE, strength: 3, footwork: 0, offloading: 1, lineoutJumping: 0, scrummaging: -2, pace: -1 },
  SH: { ...BACK_BASE, passing: 4, tacticalKicking: 3, kicking: 1, decisions: 2, vision: 1, anticipation: 1, goalKicking: -2, strength: -3, tackling: -1 },
  FH: { ...BACK_BASE, kicking: 4, tacticalKicking: 3, goalKicking: 3, passing: 3, decisions: 3, vision: 3, composure: 2, tackling: -2, strength: -2 },
  IC: { ...BACK_BASE, strength: 1, tackling: 2, passing: 1, kicking: -2, goalKicking: -4, pace: 0, offloading: 1 },
  OC: { ...BACK_BASE, pace: 2, tackling: 1, footwork: 2, kicking: -3, goalKicking: -5, positioning: 1 },
  WG: { ...BACK_BASE, pace: 4, acceleration: 3, footwork: 2, highBall: 1, kicking: -3, goalKicking: -6, passing: -1, tackling: -2 },
  FB: { ...BACK_BASE, highBall: 4, kicking: 2, tacticalKicking: 1, positioning: 2, pace: 2, goalKicking: -2, tackling: -1 },
};

/** Mean height (cm) and weight (kg) per position for professional players. */
const BODY: Record<Position, [number, number]> = {
  LH: [183, 118], HK: [180, 106], TH: [185, 124], LO: [200, 117], BF: [192, 110], OF: [188, 106],
  N8: [192, 114], SH: [176, 82], FH: [182, 88], IC: [185, 98], OC: [185, 95], WG: [183, 91], FB: [185, 91],
};

/** Secondary positions commonly covered. */
const COVER: Record<Position, Position[]> = {
  LH: ["TH"], TH: ["LH"], HK: [], LO: ["BF"], BF: ["LO", "N8", "OF"], OF: ["BF"], N8: ["BF"],
  SH: ["WG"], FH: ["FB", "IC"], IC: ["OC", "FH"], OC: ["IC", "WG"], WG: ["FB", "OC"], FB: ["WG", "FH"],
};

export interface GenPlayerOptions {
  position: Position;
  /** Overall level on the 1–20 scale (≈11 Pro D2, ≈13 Top 14, ≈15.5 international star). */
  level: number;
  nationality?: string;
  age?: number;
  id?: string;
  /** Reference date for birthDate computation (ISO). */
  referenceDate?: string;
}

export function generatePlayer(rng: Rng, opts: GenPlayerOptions): Player {
  const { position, level } = opts;
  const profile = PROFILES[position];
  const nationality = opts.nationality ?? rng.weighted(NATIONALITY_WEIGHTS_TOP14);
  const pool = NAME_POOLS[nationality] ?? NAME_POOLS.FRA!;

  const attributes = {} as Attributes;
  for (const key of ALL_ATTRIBUTES) {
    const offset = profile[key] ?? 0;
    attributes[key] = Math.round(clamp(rng.normal(level + offset, 1.6), 1, 20));
  }
  const hidden = {} as HiddenAttributes;
  for (const key of HIDDEN_ATTRIBUTES) hidden[key] = Math.round(clamp(rng.normal(11, 3.2), 1, 20));

  const [h, w] = BODY[position];
  const heightCm = Math.round(rng.normal(h, 4));
  // Heavier players for stronger forwards.
  const weightKg = Math.round(rng.normal(w + (attributes.strength - level) * 0.8, 5));

  const positions: Partial<Record<Position, number>> = { [position]: Math.round(clamp(rng.normal(18.5, 1), 15, 20)) };
  for (const cover of COVER[position]) {
    if (rng.chance(0.35)) positions[cover] = Math.round(clamp(rng.normal(13, 2.5), 6, 17));
  }

  const age = opts.age ?? Math.round(clamp(rng.normal(27, 3.5), 19, 36));
  const ref = new Date(opts.referenceDate ?? "2026-09-01");
  const birth = new Date(ref.getTime() - (age * 365.25 + rng.int(0, 364)) * 86400000);

  return {
    id: opts.id ?? `gen-${rng.int(0, 2 ** 31)}`,
    firstName: rng.pick(pool.first),
    lastName: rng.pick(pool.last),
    birthDate: birth.toISOString().slice(0, 10),
    nationality,
    heightCm,
    weightKg,
    positions,
    attributes,
    hidden,
    currentAbility: Math.round(clamp(level * 10, 1, 200)),
  };
}
