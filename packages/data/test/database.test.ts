import { isFrontRow, naturalPosition, playerLevel, selectMatchTeam, TARGETS, teamStrength } from "@ovalie/engine";
import { describe, expect, it } from "vitest";
import { DATABASE_REFERENCE_DATE, DATABASE_STATS_SEASON, readDatabase, readOverrides, readRawSquads, serialiseClub, dbFile } from "../src/io.js";
import { buildDatabase } from "../src/rating/build.js";
import { clubDatabaseSchema } from "../src/schemas.js";
import { seasonCalibration } from "../src/season.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DB_DIR } from "../src/io.js";

const db = readDatabase();
const byId = new Map(db.map((d) => [d.club.id, d]));
const allPlayers = db.flatMap((d) => d.squad.map((e) => ({ club: d.club, ...e })));

describe("real database: content", () => {
  it("contains the 2026-2027 clubs of the Top 14, Pro D2, PREM and URC", () => {
    expect(db.filter((d) => d.club.league === "TOP14")).toHaveLength(14);
    expect(db.filter((d) => d.club.league === "PROD2")).toHaveLength(16);
    expect(db.filter((d) => d.club.league === "PREM")).toHaveLength(10);
    expect(db.filter((d) => d.club.league === "URC")).toHaveLength(16);
    expect(db.filter((d) => d.club.league === "NATIONALE")).toHaveLength(14);
  });

  it("uses generated players only to complete thin squads", () => {
    const generated = allPlayers.filter((p) => p.info?.generated);
    expect(generated.every((p) => p.player.id.startsWith("gen-"))).toBe(true);
    // Professional French squads are complete: at most a couple of fillers per club.
    for (const d of db.filter((x) => x.club.league === "TOP14" || x.club.league === "PROD2")) {
      expect(d.squad.filter((e) => e.info?.generated).length, d.club.id).toBeLessThanOrEqual(2);
    }
  });

  it("validates against the schemas, with unique player ids", () => {
    for (const d of db) clubDatabaseSchema.parse(d);
    const ids = allPlayers.map((p) => p.player.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has real squads (size, front-row depth, morphology mostly from sources)", () => {
    for (const d of db) {
      expect(d.squad.length).toBeGreaterThanOrEqual(35);
      const frontRow = d.squad.filter((e) => isFrontRow(naturalPosition(e.player))).length;
      expect(frontRow, d.club.id).toBeGreaterThanOrEqual(8);
    }
    // Academy players (≤ 20) often have no published measurements; senior players almost always do
    // in France (official LNR profiles), less often in PREM/URC (Wikipedia infoboxes only).
    const share = (leagues: string[]) => {
      const seniors = allPlayers.filter((p) => leagues.includes(p.club.league) && !p.info?.generated && p.player.birthDate < "2006-01-01");
      return seniors.filter((p) => !p.info?.estimated.includes("weightKg")).length / seniors.length;
    };
    expect(share(["TOP14", "PROD2"])).toBeGreaterThan(0.9);
    expect(share(["PREM", "URC"])).toBeGreaterThan(0.75);
  });

  it("knows a few well-documented facts", () => {
    const dupont = allPlayers.find((p) => p.player.id === "antoine-dupont")!;
    expect(dupont.club.id).toBe("toulouse");
    expect(naturalPosition(dupont.player)).toBe("SH");
    expect(dupont.player.birthDate).toBe("1996-11-15");
    expect(dupont.player.heightCm).toBe(175);
    const alldritt = allPlayers.find((p) => p.player.id === "gregory-alldritt")!;
    expect(naturalPosition(alldritt.player)).toBe("N8");
  });

  it("has no override pointing to an unknown player", () => {
    const ids = new Set(allPlayers.map((p) => p.player.id));
    for (const id of Object.keys(readOverrides().players)) expect(ids.has(id), id).toBe(true);
  });
});

describe("real database: build pipeline", () => {
  it("is up to date with raw facts and overrides (run `pnpm --filter @ovalie/data build-db`)", () => {
    const ov = readOverrides();
    const rebuilt = buildDatabase(readRawSquads(), { season: DATABASE_STATS_SEASON, referenceDate: DATABASE_REFERENCE_DATE, playerOverrides: ov.players, clubOverrides: ov.clubs });
    expect(rebuilt).toHaveLength(db.length);
    for (const d of rebuilt) expect(serialiseClub(d)).toBe(readFileSync(join(DB_DIR, dbFile(d)), "utf8"));
  });
});

describe("real database: levels", () => {
  const strength = new Map(db.map((d) => [d.club.id, teamStrength(selectMatchTeam(d.squad.map((e) => e.player), { id: d.club.id, name: d.club.name, shortName: d.club.shortName })).xv]));
  const avg = (league: string) => {
    const v = db.filter((d) => d.club.league === league).map((d) => strength.get(d.club.id)!);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };

  it("puts the Top 14 well above the Pro D2", () => {
    expect(avg("TOP14") - avg("PROD2")).toBeGreaterThan(1.5);
    const weakestTop14 = Math.min(...db.filter((d) => d.club.league === "TOP14").map((d) => strength.get(d.club.id)!));
    const medianProD2 = db.filter((d) => d.club.league === "PROD2").map((d) => strength.get(d.club.id)!).sort((a, b) => a - b)[8]!;
    expect(weakestTop14).toBeGreaterThan(medianProD2);
  });

  it("stays on the engine's calibrated scale (Top 14 XV ≈ 11.5–15.5)", () => {
    for (const d of db.filter((x) => x.club.league === "TOP14")) {
      expect(strength.get(d.club.id)!).toBeGreaterThan(11.5);
      expect(strength.get(d.club.id)!).toBeLessThan(15.5);
    }
  });

  it("rates the champion and the stars sensibly", () => {
    const top = [...strength].filter(([id]) => byId.get(id)!.club.league === "TOP14").sort((a, b) => b[1] - a[1]);
    expect(top[0]![0]).toBe("toulouse");
    const best = [...allPlayers].sort((a, b) => playerLevel(b.player) - playerLevel(a.player))[0]!;
    expect(best.player.id).toBe("antoine-dupont");
  });
});

describe("real database: Top 14 seasons keep the match engine calibrated", () => {
  const top14 = db.filter((d) => d.club.league === "TOP14");
  const { report, averageRank } = seasonCalibration(top14, 2, "ci-real-season");
  for (const [key, target] of Object.entries(TARGETS)) {
    it(`${target.label} within [${target.min}, ${target.max}]`, () => {
      const v = report[key as keyof typeof TARGETS];
      expect(v).toBeGreaterThanOrEqual(target.min);
      expect(v).toBeLessThanOrEqual(target.max);
    });
  }
  it("ranks Toulouse in the top 3 and Vannes in the bottom 3 on average", () => {
    expect(averageRank.get("toulouse")!).toBeLessThanOrEqual(3);
    expect(averageRank.get("vannes")!).toBeGreaterThanOrEqual(12);
  });
});
