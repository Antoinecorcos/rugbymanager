/** Game session logic run by the worker (pure functions on the world: testable in Node). */
import { worldFromDatabase, type ClubDatabase } from "@ovalie/data";
import {
  CAREER_LEAGUES,
  continueCareer,
  playerLevel,
  playMatchDay,
  startCareer,
  type ContinueResult,
  type ManagerProfile,
  type SeasonCalendar,
  type World,
} from "@ovalie/engine";
import type { CatalogueClub, ManagerPatch, SaveInfo } from "./protocol";

const PLAYABLE = new Set(Object.values(CAREER_LEAGUES).flat());

export function buildCatalogue(db: readonly ClubDatabase[]): CatalogueClub[] {
  return db
    .filter((d) => PLAYABLE.has(d.club.league))
    .map((d) => {
      const levels = d.squad.map((e) => playerLevel(e.player)).sort((a, b) => b - a).slice(0, 23);
      const c: CatalogueClub = {
        id: d.club.id,
        name: d.club.name,
        shortName: d.club.shortName,
        league: d.club.league,
        colors: d.club.colors,
        stadium: d.club.stadium.name,
        capacity: d.club.stadium.capacity,
        reputation: d.club.reputation,
        strength: Math.round((levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length)) * 10) / 10,
        squadSize: d.squad.length,
      };
      if (d.club.city) c.city = d.club.city;
      if (d.club.budgetEur) c.budgetEur = d.club.budgetEur;
      if (d.club.previousRank) c.previousRank = d.club.previousRank;
      return c;
    })
    .sort((a, b) => b.reputation - a.reputation);
}

export function newCareer(db: ClubDatabase[], calendar: SeasonCalendar, profile: ManagerProfile, clubId: string, seed: string): World {
  const w = worldFromDatabase(db, calendar, seed);
  startCareer(w, profile, clubId);
  return w;
}

export function applyPatch(w: World, patch: ManagerPatch): void {
  if (!w.manager) throw new Error("Aucune carrière en cours");
  Object.assign(w.manager, structuredClone(patch));
}

/**
 * "Continuer", one day at a time so that the interface can show the date while it simulates.
 * Stops like `continueCareer` (match day, important news, end of season), after at most `maxDays`.
 */
export function continueWithProgress(w: World, onDay: (date: string) => void, maxDays = 60): ContinueResult {
  let days = 0;
  for (;;) {
    const r = continueCareer(w, 1);
    days += r.days;
    if (r.reason !== "limit") return { ...r, days };
    onDay(w.date);
    if (days >= maxDays) return { reason: "limit", days };
  }
}

export function playToday(w: World): string | undefined {
  return playMatchDay(w)?.id;
}

export function saveInfoOf(w: World, slot: string, kind: SaveInfo["kind"] = "auto", name?: string): SaveInfo | null {
  const m = w.manager;
  if (!m) return null;
  const club = w.clubs[m.clubId]!;
  const info: SaveInfo = { slot, kind, clubName: club.name, clubShort: club.shortName, managerName: m.profile.name, season: w.season, date: w.date, savedAt: new Date().toISOString() };
  if (club.colors) info.colors = club.colors;
  if (name) info.name = name;
  if (w.edited) info.edited = true;
  return info;
}
