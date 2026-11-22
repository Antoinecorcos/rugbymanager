import { daysBetween, playSeason, seasonSummary, TARGETS } from "@ovalie/engine";
import { describe, expect, it } from "vitest";
import { readCalendar, readDatabase } from "../src/io.js";
import { worldFromDatabase } from "../src/world.js";

const calendar = readCalendar();
const db = readDatabase();

describe("2026-27 calendar (real)", () => {
  const count = (rounds: { matches: unknown[] }[]) => rounds.reduce((a, r) => a + r.matches.length, 0);
  const league = (id: string) => calendar.leagues.find((l) => l.id === id)!;

  it("starts on 1 July 2026 and contains every competition", () => {
    expect(calendar.start).toBe("2026-07-01");
    expect(count(league("top14").rounds)).toBe(182);
    expect(count(league("prod2").rounds)).toBe(240);
    expect(count(league("nationale").rounds)).toBe(182);
    expect(count(league("prem").rounds)).toBe(90);
    expect(count(league("urc").rounds)).toBe(144);
    expect(calendar.cups.map((c) => [c.id, c.pools.length, count(c.rounds)])).toEqual([["champions-cup", 4, 48], ["challenge-cup", 3, 36]]);
    expect(calendar.internationals.map((i) => [i.id, count(i.rounds)])).toEqual([["nations-championship", 36], ["six-nations", 15]]);
  });

  it("has the real Top 14 dates (J1 on 5-6 September 2026, final on 26 June 2027)", () => {
    expect(league("top14").rounds[0]!.matches.map((m) => m.date).sort()[0]).toBe("2026-09-05");
    expect(league("top14").knockout.finale).toBe("2027-06-26");
    expect(calendar.cups[0]!.knockout.finale).toBe("2027-05-22");
  });

  it("only references clubs of the database, each once per round", () => {
    const ids = new Set(db.map((d) => d.club.id));
    for (const l of [...calendar.leagues, ...calendar.cups])
      for (const r of l.rounds) {
        const seen = new Set<string>();
        for (const m of r.matches) {
          expect(ids.has(m.home) && ids.has(m.away), `${l.id} ${m.home}-${m.away}`).toBe(true);
          expect(seen.has(m.home) || seen.has(m.away)).toBe(false);
          seen.add(m.home).add(m.away);
        }
      }
  });
});

describe("2026-27 season simulated from 1 July 2026", () => {
  const t0 = Date.now();
  const w = worldFromDatabase(db, calendar, "ci-season");
  playSeason(w);
  const ms = Date.now() - t0;
  const summary = seasonSummary(w);
  const comp = (id: string) => summary.competitions.find((c) => c.id === id)!;

  it("plays every fixture and crowns a champion everywhere (in under 30 s)", () => {
    expect(w.fixtures.every((f) => f.result)).toBe(true);
    for (const c of summary.competitions) expect(c.champion, c.id).toBeDefined();
    expect(ms).toBeLessThan(30000);
  });

  it("follows the real formats", () => {
    const stages = (id: string) => w.fixtures.filter((f) => f.competitionId === id && f.knockout).map((f) => f.stage);
    expect(stages("top14").sort()).toEqual(["access", "barrage", "barrage", "demi", "demi", "finale"]);
    expect(stages("prod2").sort()).toEqual(["access", "barrage", "barrage", "demi", "demi", "finale"]);
    expect(stages("urc").filter((s) => s === "quart")).toHaveLength(4);
    expect(stages("champions-cup").filter((s) => s === "huitieme")).toHaveLength(8);
    expect(stages("challenge-cup").filter((s) => s === "huitieme")).toHaveLength(8);
    expect(w.fixtures.find((f) => f.competitionId === "top14" && f.stage === "finale")!.neutral).toBe(true);
    expect(stages("nations-championship")).toHaveLength(6);
    // Four Champions Cup clubs drop into the Challenge Cup round of 16.
    const ccPools = new Set(calendar.cups[0]!.pools.flat());
    expect(w.competitions["challenge-cup"]!.seeds!.slice(12).every((t) => ccPools.has(t))).toBe(true);
  });

  it("moves clubs between the French divisions", () => {
    const down = summary.movements.filter((m) => m.from === "TOP14");
    const up = summary.movements.filter((m) => m.to === "TOP14");
    expect(down.length).toBeGreaterThanOrEqual(1);
    expect(down.length).toBe(up.length);
    expect(summary.movements.filter((m) => m.from === "NATIONALE").length).toBe(summary.movements.filter((m) => m.to === "NATIONALE").length);
  });

  it("produces doublons during the international windows only", () => {
    const missing = (round: string) => w.fixtures.filter((f) => f.competitionId === "top14" && f.stage === round).reduce((a, f) => a + f.result!.missingInternationals[0] + f.result!.missingInternationals[1], 0);
    for (const r of ["J1", "J2", "J3", "J4", "J5", "J6", "J11", "J12"]) expect(missing(r), r).toBe(0);
    for (const r of ["J9", "J10", "J16", "J17", "J18"]) expect(missing(r), r).toBeGreaterThan(30);
  });

  it("never asks a club to play twice within four days", () => {
    const byClub = new Map<string, string[]>();
    for (const f of w.fixtures) {
      if (w.competitions[f.competitionId]!.kind === "international") continue;
      for (const c of [f.home, f.away]) (byClub.get(c) ?? byClub.set(c, []).get(c)!).push(f.date);
    }
    for (const [club, dates] of byClub) {
      dates.sort();
      for (let i = 1; i < dates.length; i++) expect(daysBetween(dates[i - 1]!, dates[i]!), `${club} ${dates[i]}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("manages the internationals' workload", () => {
    const dupont = w.players["antoine-dupont"]!;
    expect(dupont.stats["six-nations"]!.caps).toBeGreaterThanOrEqual(3);
    expect(dupont.stats.top14!.starts).toBeLessThanOrEqual(18);
    const total = Object.values(dupont.stats).reduce((a, s) => a + s.appearances, 0);
    expect(total).toBeGreaterThan(20);
    expect(total).toBeLessThan(40);
  });

  it("keeps realistic Top 14 scores", () => {
    const games = w.fixtures.filter((f) => f.competitionId === "top14");
    const points = games.reduce((a, f) => a + f.result!.score[0] + f.result!.score[1], 0) / games.length;
    const tries = games.reduce((a, f) => a + f.result!.tries[0] + f.result!.tries[1], 0) / games.length;
    expect(points).toBeGreaterThanOrEqual(TARGETS.points.min);
    expect(points).toBeLessThanOrEqual(TARGETS.points.max);
    expect(tries).toBeGreaterThanOrEqual(TARGETS.tries.min);
    expect(tries).toBeLessThanOrEqual(TARGETS.tries.max);
    expect(comp("top14").topPointScorers[0]!.value).toBeGreaterThan(150);
  });
});
