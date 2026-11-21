/**
 * Attributes from a level + real facts (morphology, kicking record, tries, cards, age, caps).
 * Deterministic: the noise is seeded by the player id, so a rebuild gives the same player.
 */
import {
  isForward,
  POSITION_BODY,
  rollAttributes,
  rollHiddenAttributes,
  Rng,
  type AttributeKey,
  type Attributes,
  type HiddenAttributes,
  type Position,
} from "@ovalie/engine";
import type { CareerSeason, RawPlayer } from "../raw.js";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface KickingRecord {
  minutes: number;
  tries: number;
  penaltyGoals: number;
  conversions: number;
  drops: number;
  yellowCards: number;
  redCards: number;
}

/** Sums the last three seasons of league statistics. */
export function recentRecord(career: CareerSeason[], season: string): KickingRecord {
  const y = Number(season.slice(0, 4));
  const recent = new Set([0, 1, 2].map((k) => `${y - k}-${y - k + 1}`));
  const r: KickingRecord = { minutes: 0, tries: 0, penaltyGoals: 0, conversions: 0, drops: 0, yellowCards: 0, redCards: 0 };
  for (const s of career.filter((c) => recent.has(c.season))) {
    r.minutes += s.minutes;
    r.tries += s.tries;
    r.penaltyGoals += s.penalties;
    r.drops += s.drops;
    r.conversions += Math.max(0, Math.round((s.points - 5 * s.tries - 3 * s.penalties - 3 * s.drops) / 2));
    r.yellowCards += s.yellowCards;
    r.redCards += s.redCards;
  }
  return r;
}

export interface AttributeInput {
  player: RawPlayer;
  position: Position;
  level: number;
  age: number;
  season: string;
  heightCm: number;
  weightKg: number;
}

export function buildAttributes(input: AttributeInput): { attributes: Attributes; hidden: HiddenAttributes } {
  const { player, position: pos, level, age } = input;
  const rng = new Rng(`attributes:${player.id}`);
  const a = rollAttributes(rng, pos, level, 1.3);
  const hidden = rollHiddenAttributes(rng);
  const fwd = isForward(pos);
  const add = (k: AttributeKey, v: number) => (a[k] = a[k] + v);

  // --- Morphology relative to the position's average.
  const [hMean, wMean] = POSITION_BODY[pos];
  const dW = clamp(input.weightKg - wMean, -20, 25);
  const dH = clamp(input.heightCm - hMean, -15, 15);
  add("strength", clamp(0.12 * dW, -2.5, 2.5));
  add("contactResilience", clamp(0.06 * dW, -1.5, 1.5));
  if (fwd) {
    add("scrummaging", clamp((pos === "LH" || pos === "TH" || pos === "HK" ? 0.09 : 0.05) * dW, -2, 2));
    add("maul", clamp(0.05 * dW, -1.5, 1.5));
  }
  add("pace", clamp(-(fwd ? 0.05 : 0.08) * dW, -2, 2));
  add("acceleration", clamp(-(fwd ? 0.04 : 0.07) * dW, -2, 2));
  add("agility", clamp(-0.05 * dW, -1.5, 1.5));
  if (pos === "LO" || pos === "BF" || pos === "N8") add("lineoutJumping", clamp(0.25 * dH, -2.5, 2.5));
  add("jumping", clamp(0.1 * dH, -1.5, 1.5));
  if (!fwd) add("highBall", clamp(0.08 * dH, -1, 1));

  // --- League record (last three seasons).
  const rec = recentRecord(player.career, input.season);
  const per80 = (n: number) => (rec.minutes > 0 ? (n * 80) / rec.minutes : 0);
  const kickPoints = 3 * rec.penaltyGoals + 2 * rec.conversions;
  const kickPer80 = per80(kickPoints);
  if (kickPoints >= 60 && kickPer80 >= 4) a.goalKicking = Math.max(a.goalKicking, level + 2 + clamp((kickPer80 - 4) / 3, 0, 1.5));
  else if (kickPoints >= 20 && kickPer80 >= 1.5) a.goalKicking = Math.max(a.goalKicking, level + 1);
  else if (kickPoints >= 6) a.goalKicking = Math.max(a.goalKicking, level - 1);
  if (rec.drops >= 2) add("tacticalKicking", 1);
  const triesPer80 = per80(rec.tries);
  if (rec.minutes >= 600) {
    if (!fwd && triesPer80 >= 0.45) {
      add("pace", 1);
      add("footwork", 1);
    } else if (fwd && triesPer80 >= 0.2) {
      add("strength", 0.5);
      add("footwork", 0.5);
    }
    const cardsPer80 = per80(rec.yellowCards + 2 * rec.redCards);
    if (cardsPer80 >= 0.1) add("discipline", -2.5);
    else if (cardsPer80 >= 0.05) add("discipline", -1);
    else if (rec.minutes >= 1500 && rec.yellowCards + rec.redCards === 0) add("discipline", 1);
  }

  // --- Age: physical decline, experience.
  if (age > 29) {
    add("pace", -0.35 * (age - 29));
    add("acceleration", -0.35 * (age - 29));
    add("recovery", -0.3 * (age - 29));
    add("agility", -0.2 * (age - 29));
  }
  const experience = clamp((age - 23) * 0.25, -1, 2);
  for (const k of ["decisions", "composure", "positioning", "anticipation", "leadership"] as const) add(k, experience);

  // --- International experience.
  const caps = player.caps ?? (player.capped ? 5 : 0);
  if (caps > 0) {
    const c = clamp(Math.log(1 + caps / 5), 0, 3);
    add("composure", 0.4 * c);
    add("leadership", 0.4 * c);
    hidden.bigMatches = hidden.bigMatches + 1.2 * c;
    hidden.professionalism = hidden.professionalism + 0.6 * c;
  }
  if (age >= 31) hidden.consistency = hidden.consistency + 1;

  for (const k of Object.keys(a) as AttributeKey[]) a[k] = Math.round(clamp(a[k], 1, 20));
  for (const k of Object.keys(hidden) as (keyof HiddenAttributes)[]) hidden[k] = Math.round(clamp(hidden[k], 1, 20));
  return { attributes: a, hidden };
}
