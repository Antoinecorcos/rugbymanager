import { describe, expect, it } from "vitest";
import {
  addDays,
  ageOn,
  computeTable,
  createWorld,
  daysBetween,
  generateLeagueSchedule,
  generateMatchTeam,
  isEligible,
  playSeason,
  roundRobin,
  Rng,
  weekday,
  type SeasonCalendar,
  type World,
} from "../src/index.js";

describe("dates", () => {
  it("adds days across months and years, knows weekdays and ages", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-07-01", "2027-06-30")).toBe(364);
    expect(weekday("2026-07-01")).toBe(3); // Wednesday
    expect(ageOn("1996-11-15", "2026-07-01")).toBe(29);
    expect(ageOn("1996-11-15", "2026-11-15")).toBe(30);
  });
});

describe("round robin", () => {
  it("makes every team meet every other team home and away, once per round", () => {
    const teams = ["a", "b", "c", "d", "e", "f", "g"];
    const rounds = roundRobin(teams);
    expect(rounds).toHaveLength(2 * (teams.length + 1 - 1));
    const pairs = new Map<string, number>();
    for (const r of rounds) {
      const seen = new Set<string>();
      for (const [h, a] of r) {
        expect(seen.has(h) || seen.has(a)).toBe(false);
        seen.add(h).add(a);
        pairs.set(`${h}>${a}`, (pairs.get(`${h}>${a}`) ?? 0) + 1);
      }
    }
    for (const h of teams) for (const a of teams) if (h !== a) expect(pairs.get(`${h}>${a}`)).toBe(1);
  });

  it("schedules rounds on Saturdays and skips blocked weekends", () => {
    const s = generateLeagueSchedule("x", ["a", "b", "c", "d"], "2026-09-01", ["2026-09-12"]);
    expect(s.rounds.map((r) => r.matches[0]!.date)).toEqual(["2026-09-05", "2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17"]);
    expect(s.rounds.every((r) => weekday(r.matches[0]!.date) === 6)).toBe(true);
  });
});

describe("tables", () => {
  it("orders by points then point difference", () => {
    const res = (h: number, a: number) => ({
      score: [h, a] as [number, number], tries: [0, 0] as [number, number], winner: (h > a ? 0 : h < a ? 1 : null) as 0 | 1 | null,
      competitionPoints: [h > a ? 4 : h === a ? 2 : 0, a > h ? 4 : h === a ? 2 : 0] as [number, number],
      bonus: [{ offensive: false, defensive: false }, { offensive: false, defensive: false }] as [{ offensive: boolean; defensive: boolean }, { offensive: boolean; defensive: boolean }],
      missingInternationals: [0, 0] as [number, number],
    });
    const t = computeTable(["a", "b", "c"], [
      { id: "1", competitionId: "x", stage: "J1", date: "2026-09-05", home: "a", away: "b", result: res(20, 10) },
      { id: "2", competitionId: "x", stage: "J2", date: "2026-09-12", home: "c", away: "b", result: res(30, 10) },
    ]);
    expect(t.map((r) => r.team)).toEqual(["c", "a", "b"]);
  });
});

describe("national selection policies", () => {
  const club = (league: string, country: string) => ({ id: "x", name: "x", shortName: "X", league, country, reputation: 100 });
  it("follows each federation's rules", () => {
    expect(isEligible("NZL", club("TOP14", "FRA"), 80)).toBe(false);
    expect(isEligible("ENG", club("TOP14", "FRA"), 50)).toBe(false);
    expect(isEligible("ENG", club("PREM", "ENG"), 0)).toBe(true);
    expect(isEligible("AUS", club("TOP14", "FRA"), 29)).toBe(false);
    expect(isEligible("AUS", club("TOP14", "FRA"), 30)).toBe(true);
    expect(isEligible("FIJ", club("PROD2", "FRA"), 3)).toBe(true);
  });
});

describe("world season (synthetic league)", () => {
  function miniWorld(seed: string): World {
    const rng = new Rng("mini-league");
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const clubs = ids.map((id, i) => {
      const team = generateMatchTeam(rng, { id, name: `Club ${id}`, level: 12 + i * 0.25 });
      // 46-man squads, like real professional clubs.
      const extra = generateMatchTeam(rng, { id: `${id}x`, name: "x", level: 11.5 + i * 0.25 }).players;
      return { id, name: `Club ${id}`, shortName: id.toUpperCase(), league: "TOP14", country: "FRA", reputation: 100, squad: [...team.players, ...extra].map((player) => ({ player, caps: 0 })) };
    });
    const calendar: SeasonCalendar = {
      season: "2026-2027",
      start: "2026-07-01",
      end: "2027-06-30",
      leagues: [generateLeagueSchedule("top14", ids, "2026-09-05")],
      cups: [],
      internationals: [],
      windows: [],
    };
    return createWorld({ seed, calendar, clubs });
  }

  it("plays the regular season, the playoffs and names a champion", () => {
    const w = miniWorld("s1");
    playSeason(w);
    expect(w.fixtures.every((f) => f.result)).toBe(true);
    const stages = w.fixtures.filter((f) => f.knockout).map((f) => f.stage);
    expect(stages).toEqual(["barrage", "barrage", "demi", "demi", "finale"]);
    const out = w.competitions.top14!.outcome!;
    expect(out.champion).toBeDefined();
    expect(out.relegated).toEqual([out.ranking!.at(-1)]);
    expect(w.news.some((n) => n.text.includes("Bouclier de Brennus"))).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const a = miniWorld("same");
    const b = miniWorld("same");
    playSeason(a);
    playSeason(b);
    expect(a.fixtures.map((f) => f.result!.score)).toEqual(b.fixtures.map((f) => f.result!.score));
    const c = miniWorld("other");
    playSeason(c);
    expect(c.fixtures.map((f) => f.result!.score)).not.toEqual(a.fixtures.map((f) => f.result!.score));
  });

  it("rotates players (nobody starts every match) and tracks injuries", () => {
    const w = miniWorld("rotation");
    playSeason(w);
    const games = (club: string) => w.fixtures.filter((f) => f.home === club || f.away === club).length;
    const shares = Object.values(w.players).filter((p) => p.clubId).map((p) => (p.stats.top14?.starts ?? 0) / games(p.clubId!));
    expect(Math.max(...shares)).toBeLessThanOrEqual(0.85);
    expect(Math.max(...shares)).toBeGreaterThan(0.5);
    expect(w.news.filter((n) => n.topic === "medical").length).toBeGreaterThan(0);
  });
});
