/**
 * Rating pipeline: raw facts (packages/data/raw) + manual overrides → game database entries.
 * Pure and deterministic: the same inputs always give the same players.
 */
import { generatePlayer, naturalPosition, Rng, type Player, type Position } from "@ovalie/engine";
import type { RawPlayer, RawSquad } from "../raw.js";
import type { Club, ClubDatabase, ClubOverride, League, PlayerOverride, SquadEntry } from "../schemas.js";
import { buildAttributes } from "./attributes.js";
import { ageAt, estimateLevel, type LevelContext } from "./level.js";
import { resolvePositions, typicalBody } from "./positions.js";

export interface BuildOptions {
  /** Most recent season whose statistics are used (later seasons are ignored). */
  season: string;
  /** Reference date for ages and approximate birth dates. */
  referenceDate: string;
  playerOverrides?: Record<string, PlayerOverride>;
  clubOverrides?: Record<string, ClubOverride>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Growth still expected from a player of this age (level points). */
export function growthPotential(age: number): number {
  if (age <= 19) return 3.2;
  if (age >= 29) return 0;
  return [3.2, 2.8, 2.3, 1.8, 1.3, 0.9, 0.5, 0.25, 0.1, 0][age - 19]!;
}

export function buildDatabase(squads: RawSquad[], opts: BuildOptions): ClubDatabase[] {
  // Rounds played so far in each competition this season (busiest player of each competition).
  const roundsSoFar: Record<string, number> = {};
  for (const s of squads)
    for (const p of s.players)
      for (const c of p.career)
        if (c.season === opts.season) roundsSoFar[c.competition] = Math.max(roundsSoFar[c.competition] ?? 0, c.matches);

  // Club strength z-score per league: budget when known, else last season's rank.
  const budgetZ = new Map<string, number>();
  const byLeague = new Map<League, RawSquad[]>();
  for (const s of squads) byLeague.set(s.club.league, [...(byLeague.get(s.club.league) ?? []), s]);
  for (const list of byLeague.values()) {
    const vals = list.map((s) => s.club.budgetEur).filter((b): b is number => b !== undefined);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length)) || 1;
    const n = list.length;
    for (const s of list) {
      const rank = s.club.previousRank?.league === s.club.league ? s.club.previousRank.rank : undefined;
      const z = s.club.budgetEur !== undefined ? (s.club.budgetEur - mean) / sd : rank !== undefined ? ((n + 1) / 2 - rank) / (n / 4) : 0;
      budgetZ.set(s.club.id, z);
    }
  }

  return squads.map((s) => {
    const ctx: LevelContext = {
      league: s.club.league,
      clubBudgetZ: budgetZ.get(s.club.id) ?? 0,
      season: opts.season,
      roundsSoFar,
      referenceDate: opts.referenceDate,
    };
    const club = buildClub(s, budgetZ.get(s.club.id) ?? 0, opts.clubOverrides?.[s.club.id]);
    const squad = s.players.map((p) => buildPlayer(p, s, ctx, opts));
    completeSquad(squad, s, ctx, opts);
    return { club, squad };
  });
}

function buildClub(s: RawSquad, z: number, ov: ClubOverride | undefined): Club {
  const c = s.club;
  const base: Record<League, number> = { TOP14: 135, PREM: 130, URC: 125, PROD2: 80, NATIONALE: 50, OTHER: 40 };
  let reputation = base[c.league] + 14 * clamp(z, -2, 2.5);
  if (c.previousRank) reputation += c.previousRank.league === c.league ? clamp(4 - c.previousRank.rank * 0.6, -5, 4) : c.previousRank.league === "TOP14" ? 8 : -6;
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    country: c.country,
    league: c.league,
    city: c.city,
    colors: ov?.colors ?? c.colors ?? ["#333333", "#FFFFFF"],
    stadium: { name: c.stadium.name, city: c.stadium.city ?? c.city ?? "?", capacity: c.stadium.capacity ?? 5000 },
    budgetEur: c.budgetEur,
    reputation: Math.round(clamp(ov?.reputation ?? reputation, 1, 200)),
    founded: c.founded,
    honours: [],
    president: c.president,
    headCoach: c.headCoach,
    previousRank: c.previousRank,
    sources: Object.fromEntries(Object.entries(c.sources).filter(([, v]) => v)) as Record<string, string>,
  };
}

function buildPlayer(p: RawPlayer, s: RawSquad, ctx: LevelContext, opts: BuildOptions): SquadEntry {
  const ov = opts.playerOverrides?.[p.id];
  const estimated: string[] = [];
  const pos = resolvePositions(p);
  const primary: Position = ov?.primary ?? pos.primary;
  const familiarity = { ...pos.familiarity, ...(ov?.positions ?? {}) };
  if (ov?.primary) familiarity[ov.primary] = Math.max(familiarity[ov.primary] ?? 0, 19);

  const body = typicalBody(primary);
  const heightCm = ov?.heightCm ?? p.heightCm ?? body.heightCm;
  const weightKg = ov?.weightKg ?? p.weightKg ?? body.weightKg;
  if (!p.heightCm && !ov?.heightCm) estimated.push("heightCm");
  if (!p.weightKg && !ov?.weightKg) estimated.push("weightKg");

  let birthDate = p.birthDate;
  if (!birthDate) {
    // Published age only: assume a birthday half a year before the reference date.
    const ref = new Date(opts.referenceDate);
    const y = ref.getFullYear() - (p.age ?? 26) - 1;
    birthDate = `${y}-${String(ref.getMonth() + 1).padStart(2, "0")}-01`;
    estimated.push("birthDate");
  }
  const age = ageAt(birthDate, p.age, opts.referenceDate);

  const rating = estimateLevel(p, primary, ctx);
  if (ov?.level !== undefined) {
    rating.override = ov.level;
    rating.level = ov.level;
  }
  const level = rating.level;
  const { attributes, hidden } = buildAttributes({ player: p, position: primary, level, age, season: opts.season, heightCm, weightKg });
  if (ov?.attributes) Object.assign(attributes, ov.attributes);

  const potential = ov?.potential ?? clamp(level + growthPotential(age) + (p.caps && age <= 23 ? 0.5 : 0), level, 20);

  const player: Player = {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    birthDate,
    nationality: p.nationality,
    heightCm: clamp(Math.round(heightCm), 160, 220),
    weightKg: clamp(Math.round(weightKg), 60, 160),
    positions: Object.fromEntries(Object.entries(familiarity).map(([k, v]) => [k, Math.round(clamp(v!, 1, 20))])),
    attributes,
    hidden,
    currentAbility: Math.round(clamp(level * 10, 1, 200)),
    potentialAbility: Math.round(clamp(potential * 10, 1, 200)),
  };

  let jiff = p.jiff;
  if (jiff === undefined && s.club.country === "FRA") {
    estimated.push("jiff");
    const birthYear = Number(birthDate.slice(0, 4));
    jiff = !!p.homegrown || p.nationality === "FRA" || (p.arrivalYear !== undefined && p.arrivalYear - birthYear <= 19);
  }
  const contract: SquadEntry["contract"] = { clubId: s.club.id };
  if (p.contractUntil) contract.expires = `${p.contractUntil}-06-30`;
  if (jiff !== undefined) contract.jiff = jiff;

  const info: NonNullable<SquadEntry["info"]> = {
    positionGroup: p.positionGroup,
    estimated,
    rating,
    sources: Object.fromEntries(Object.entries(p.sources).filter(([, v]) => v)) as Record<string, string>,
  };
  if (p.caps !== undefined) info.caps = p.caps;
  if (p.homegrown !== undefined) info.homegrown = p.homegrown;
  if (p.previousClub) info.previousClub = p.previousClub;
  if (p.arrivalYear) info.arrivalYear = p.arrivalYear;
  return { player, contract, info };
}

/** Typical 36-man squad, used when a club's real roster is unknown. */
export const SQUAD_TEMPLATE: Readonly<Record<Position, number>> = {
  LH: 3, HK: 3, TH: 3, LO: 5, BF: 3, OF: 2, N8: 2, SH: 3, FH: 2, IC: 2, OC: 2, WG: 4, FB: 2,
};
/** Players able to play each position (familiarity ≥ 14) that a real squad must have. */
export const SQUAD_MINIMUM: Readonly<Record<Position, number>> = {
  LH: 2, HK: 2, TH: 2, LO: 4, BF: 2, OF: 2, N8: 1, SH: 2, FH: 2, IC: 2, OC: 2, WG: 3, FB: 2,
};

/**
 * Completes a squad with generated (fictional) players where the real roster is unknown or too
 * thin at a position, so that every club can field a legal 23 all season. Deterministic (seeded by club id).
 */
function completeSquad(squad: SquadEntry[], s: RawSquad, ctx: LevelContext, opts: BuildOptions): void {
  const unknownRoster = squad.length < 25;
  const target = unknownRoster ? SQUAD_TEMPLATE : SQUAD_MINIMUM;
  const count = new Map<Position, number>();
  for (const e of squad) {
    if (unknownRoster) count.set(naturalPosition(e.player), (count.get(naturalPosition(e.player)) ?? 0) + 1);
    else for (const [pos, fam] of Object.entries(e.player.positions) as [Position, number][]) if (fam >= 14) count.set(pos, (count.get(pos) ?? 0) + 1);
  }
  const rng = new Rng(`complete:${s.club.id}`);
  const base = s.club.levelHint ?? estimateLevel({ id: "", firstName: "", lastName: "", nationality: "FRA", positionGroup: "", positionHints: [], career: [], sources: {} }, "FH", ctx).level;
  let n = 0;
  for (const [pos, min] of Object.entries(target) as [Position, number][]) {
    for (let k = count.get(pos) ?? 0; k < min; k++) {
      const level = Math.round((base - 0.3 + rng.normal(0, 0.6)) * 100) / 100;
      const nationality = s.club.country === "FRA" ? rng.weighted([["FRA", 85], ["GEO", 4], ["FIJ", 4], ["TGA", 2], ["ARG", 3], ["RSA", 2]] as const) : s.club.country;
      const player = generatePlayer(rng, { position: pos, level, nationality, id: `gen-${s.club.id}-${++n}`, referenceDate: opts.referenceDate });
      player.potentialAbility = Math.round(Math.min(200, (level + growthPotential(ageAt(player.birthDate, undefined, opts.referenceDate))) * 10));
      squad.push({
        player,
        contract: { clubId: s.club.id, jiff: nationality === "FRA" },
        info: {
          positionGroup: pos,
          generated: true,
          estimated: ["birthDate", "heightCm", "weightKg", "jiff"],
          rating: { club: level, international: 0, age: 0, clubStrength: 0, estimate: level, level, evidence: 0 },
          sources: {},
        },
      });
    }
  }
}
