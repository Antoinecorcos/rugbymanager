/**
 * National teams: strength, federation selection policies and call-up pools.
 * Players of nations whose players mostly play outside the database (New Zealand, Australia,
 * Japan…) are completed by virtual players, so that their national teams have a realistic level.
 */
import type { Player } from "../domain/player.js";
import type { Position } from "../domain/positions.js";
import { generatePlayer } from "../gen/player-gen.js";
import { Rng } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import type { PlayerState, World, WorldClub } from "./types.js";

/** Approximate level (1–20 scale) of each nation's best players, 2026 (World Rugby ranking order). */
export const NATION_LEVEL: Record<string, number> = {
  RSA: 15.6, IRL: 15.4, NZL: 15.4, FRA: 15.3, ENG: 15.0, ARG: 14.6, SCO: 14.6, AUS: 14.3, ITA: 13.9, FIJ: 13.7, WAL: 13.4, JPN: 13.0,
  GEO: 12.8, SAM: 12.2, TGA: 12.0, ESP: 11.6, POR: 11.8, URU: 11.6, USA: 11.4, ROU: 11.2, CHI: 11.0, CAN: 11.0, NAM: 10.6, BEL: 10.4, NED: 10.2, ZIM: 10.0, HKG: 9.6,
};

/**
 * Federation policies (research dossier §3.2):
 * - New Zealand only selects players contracted in New Zealand (none in the database);
 * - England only selects PREM players; Ireland only its provinces;
 * - Australia: players abroad need 30+ caps ("Giteau law"); Wales: 25+ caps abroad;
 * - other nations select anywhere.
 */
export function isEligible(nation: string, club: WorldClub | undefined, caps: number): boolean {
  if (!club) return true;
  switch (nation) {
    case "NZL":
      return false;
    case "ENG":
      return club.league === "PREM";
    case "IRL":
      return club.country === "IRL";
    case "AUS":
      return caps >= 30;
    case "WAL":
      return club.country === "WAL" || caps >= 25;
    default:
      return true;
  }
}

/** 33-man squad shape used to complete a nation's pool with virtual players. */
const POOL_TEMPLATE: Record<Position, number> = { LH: 3, HK: 3, TH: 3, LO: 4, BF: 2, OF: 2, N8: 2, SH: 3, FH: 2, IC: 2, OC: 2, WG: 3, FB: 2 };

/**
 * Builds each nation's selectable pool (eligible players of the world) and, for the nations
 * playing international competitions, virtual players where the database lacks depth.
 */
export function buildNationPools(w: World, competitionNations: readonly string[], seed: string): void {
  const byNation = new Map<string, PlayerState[]>();
  for (const ps of Object.values(w.players)) {
    const nat = ps.player.nationality;
    if (!isEligible(nat, ps.clubId ? w.clubs[ps.clubId] : undefined, ps.caps)) continue;
    (byNation.get(nat) ?? byNation.set(nat, []).get(nat)!).push(ps);
  }
  for (const [nation, list] of byNation) w.nationPools[nation] = list.map((p) => p.player.id);

  for (const nation of competitionNations) {
    const level = NATION_LEVEL[nation] ?? 12;
    const rng = new Rng(`${seed}:nation:${nation}`);
    const real = (byNation.get(nation) ?? []).filter((p) => playerLevel(p.player) >= level - 2.5);
    // Players outside the database are as good as the nation; elsewhere virtual players only
    // fill gaps, at the level of the real selectable players (they must not take their places).
    const best = real.map((p) => playerLevel(p.player)).sort((a, b) => b - a).slice(0, 15);
    const realLevel = best.length ? best.reduce((a, b) => a + b, 0) / best.length : level;
    const virtualLevel = EXTERNAL_NATIONS.has(nation) ? level - 0.3 : Math.min(level - 0.3, realLevel - 0.3);
    let n = 0;
    for (const [pos, need] of Object.entries(POOL_TEMPLATE) as [Position, number][]) {
      const depth = real.filter((p) => (p.player.positions[pos] ?? 0) >= 14).length;
      for (let k = depth; k < need; k++) {
        const player: Player = generatePlayer(rng, {
          position: pos,
          level: virtualLevel + rng.normal(0, 0.4),
          nationality: nation,
          id: `nat-${nation}-${++n}`,
          referenceDate: w.calendar.start,
          age: Math.round(rng.normal(27, 3)),
        });
        w.players[player.id] = newPlayerState(player, undefined, 20, true);
        (w.nationPools[nation] ??= []).push(player.id);
      }
    }
  }
}

/** Nations whose players almost all play outside the database (Super Rugby, Japan League One). */
export const EXTERNAL_NATIONS: ReadonlySet<string> = new Set(["NZL", "AUS", "JPN"]);

export function newPlayerState(player: Player, clubId: string | undefined, caps: number, virtual = false): PlayerState {
  const s: PlayerState = { player, caps, freshness: 100, startStreak: 0, yellowCount: 0, stats: {} };
  if (clubId) s.clubId = clubId;
  if (virtual) s.virtual = true;
  return s;
}
