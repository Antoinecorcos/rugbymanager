/**
 * Rating pipeline: raw facts (packages/data/raw) + manual overrides → game database entries.
 * Pure and deterministic: the same inputs always give the same players.
 */
import type { Player, Position } from "@ovalie/engine";
import type { RawPlayer, RawSquad } from "../raw.js";
import type { Club, ClubDatabase, ClubOverride, League, PlayerOverride, SquadEntry } from "../schemas.js";
import { buildAttributes } from "./attributes.js";
import { ageAt, estimateLevel, type LevelContext } from "./level.js";
import { resolvePositions, typicalBody } from "./positions.js";

export interface BuildOptions {
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

  // Budget z-score per league.
  const budgetZ = new Map<string, number>();
  const byLeague = new Map<League, RawSquad[]>();
  for (const s of squads) byLeague.set(s.club.league, [...(byLeague.get(s.club.league) ?? []), s]);
  for (const list of byLeague.values()) {
    const vals = list.map((s) => s.club.budgetEur).filter((b): b is number => b !== undefined);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length)) || 1;
    for (const s of list) budgetZ.set(s.club.id, s.club.budgetEur !== undefined ? (s.club.budgetEur - mean) / sd : 0);
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
