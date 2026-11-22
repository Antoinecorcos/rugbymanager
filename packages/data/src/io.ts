/** Node-only helpers to read/write the data folders (raw facts, overrides, built database). */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SeasonCalendar } from "@ovalie/engine";
import { seasonCalendarSchema } from "./calendar.js";
import { rawSquadSchema, type RawSquad } from "./raw.js";
import { clubDatabaseSchema, clubOverrideSchema, playerOverrideSchema, type ClubDatabase, type ClubOverride, type PlayerOverride } from "./schemas.js";

export const DATA_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RAW_DIR = join(DATA_ROOT, "raw");
export const DB_DIR = join(DATA_ROOT, "db");
export const OVERRIDES_DIR = join(DATA_ROOT, "overrides");

/** Season played with the bundled database, and the game's start date (ages are computed on it). */
export const DATABASE_SEASON = "2026-2027";
export const DATABASE_REFERENCE_DATE = "2026-07-01";
/**
 * Last season whose statistics may be used by the ratings. The game starts on 1 July 2026:
 * the 2026-27 statistics collected in November 2026 are "the future" and are ignored.
 */
export const DATABASE_STATS_SEASON = "2025-2026";

const jsonFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith(".json") && !f.split("/").pop()!.startsWith("_"))
        .sort()
    : [];

export function readRawSquads(): RawSquad[] {
  return jsonFiles(RAW_DIR).map((f) => rawSquadSchema.parse(JSON.parse(readFileSync(join(RAW_DIR, f), "utf8"))));
}

export function readOverrides(): { players: Record<string, PlayerOverride>; clubs: Record<string, ClubOverride> } {
  const read = <T>(file: string, schema: z.ZodType<T>): Record<string, T> => {
    const p = join(OVERRIDES_DIR, file);
    if (!existsSync(p)) return {};
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, schema.parse(v)]));
  };
  return { players: read("players.json", playerOverrideSchema), clubs: read("clubs.json", clubOverrideSchema) };
}

export const dbFile = (db: ClubDatabase): string => join(db.club.league.toLowerCase(), `${db.club.id}.json`);

export function writeDatabase(dbs: ClubDatabase[]): void {
  for (const db of dbs) {
    const p = join(DB_DIR, dbFile(db));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, serialiseClub(db));
  }
}

/** Compact but diff-friendly JSON: one player per line. */
export function serialiseClub(db: ClubDatabase): string {
  const squad = db.squad.map((e) => "  " + JSON.stringify(e)).join(",\n");
  return `{\n "club": ${JSON.stringify(db.club)},\n "squad": [\n${squad}\n ]\n}\n`;
}

/** Raw facts, one player per line. */
export function serialiseRawSquad(squad: RawSquad): string {
  const players = squad.players.map((p) => "  " + JSON.stringify(p)).join(",\n");
  return `{\n "club": ${JSON.stringify(squad.club)},\n "importedAt": ${JSON.stringify(squad.importedAt)},\n "players": [\n${players}\n ]\n}\n`;
}

export const CALENDAR_DIR = join(DATA_ROOT, "calendar");

export function readCalendar(season = DATABASE_SEASON): SeasonCalendar {
  return seasonCalendarSchema.parse(JSON.parse(readFileSync(join(CALENDAR_DIR, `${season}.json`), "utf8")));
}

export function readDatabase(): ClubDatabase[] {
  return jsonFiles(DB_DIR).map((f) => clubDatabaseSchema.parse(JSON.parse(readFileSync(join(DB_DIR, f), "utf8"))));
}
