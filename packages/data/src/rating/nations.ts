/**
 * Weight of senior caps by nation, from the nation's standing in world rugby (2024-2026 rankings).
 * 1 = top-8 nations; established tier-two nations weigh less.
 */
export const NATION_CAP_WEIGHT: Readonly<Record<string, number>> = {
  RSA: 1, NZL: 1, IRL: 1, FRA: 1, ENG: 1, ARG: 1, AUS: 1, SCO: 1,
  ITA: 0.85, FIJ: 0.85, WAL: 0.8,
  GEO: 0.7, JPN: 0.7, SAM: 0.65, TGA: 0.65,
  URU: 0.5, USA: 0.5, CAN: 0.5, ESP: 0.5, POR: 0.55, ROU: 0.5, CHI: 0.5, NAM: 0.45,
};
/** Weight for any other nation. */
export const DEFAULT_CAP_WEIGHT = 0.35;
