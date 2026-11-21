import type { Attributes, HiddenAttributes } from "./attributes.js";
import type { Position } from "./positions.js";

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  /** ISO date (YYYY-MM-DD). */
  birthDate: string;
  /** Sporting nationality, ISO 3166-1 alpha-3 (FRA, NZL, RSA, FIJ...). */
  nationality: string;
  secondNationality?: string;
  heightCm: number;
  weightKg: number;
  /** Familiarity with each position, 1–20. Missing = unfamiliar (treated as 1). */
  positions: Partial<Record<Position, number>>;
  attributes: Attributes;
  hidden: HiddenAttributes;
  /** FM-style current / potential ability on a 1–200 scale (hidden). */
  currentAbility?: number;
  potentialAbility?: number;
}

export const playerDisplayName = (p: Pick<Player, "firstName" | "lastName">): string =>
  `${p.firstName.charAt(0)}. ${p.lastName}`;

export const positionFamiliarity = (p: Player, pos: Position): number => p.positions[pos] ?? 1;

/** Best position = highest familiarity. */
export const naturalPosition = (p: Player): Position => {
  let best: Position | undefined;
  let bestVal = -1;
  for (const [pos, v] of Object.entries(p.positions) as [Position, number][]) {
    if (v > bestVal) {
      best = pos;
      bestVal = v;
    }
  }
  if (!best) throw new Error(`Player ${p.id} has no position`);
  return best;
};
