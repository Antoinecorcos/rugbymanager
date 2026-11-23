import { describe, expect, it } from "vitest";
import {
  acceptJob,
  addDays,
  advanceTo,
  closeSeason,
  createWorld,
  dealTerms,
  ensureWorldExtensions,
  fitRoundDates,
  generateLeagueSchedule,
  generateMatchTeam,
  joinClub,
  leagueTable,
  makeJobOffers,
  POOL_OF_SIX,
  releaseWorldCupJokers,
  requiredReputation,
  Rng,
  startCareer,
  startNextSeason,
  weekday,
  worldCupJokerAllowed,
  WORLD_CUP_2027,
  WORLD_VERSION,
  type SeasonCalendar,
  type World,
} from "../src/index.js";

const PROFILE = { name: "Jean Test", nationality: "FRA", start: "bigClub" as const };

function miniWorld(seed: string): World {
  const rng = new Rng("mini-m6c");
  const ids = ["a", "b", "c", "d", "e", "f"];
  const clubs = ids.map((id, i) => {
    const team = generateMatchTeam(rng, { id, name: `Club ${id}`, level: 11.5 + i * 0.5 });
    const extra = generateMatchTeam(rng, { id: `${id}x`, name: "x", level: 11 + i * 0.5 }).players;
    return { id, name: `Club ${id}`, shortName: id.toUpperCase(), league: "TOP14", country: "FRA", reputation: 70 + i * 20, budgetEur: 30_000_000, capacity: 15000, president: `Président ${id}`, headCoach: `Coach ${id}`, squad: [...team.players, ...extra].map((player) => ({ player, caps: 0 })) };
  });
  const calendar: SeasonCalendar = { season: "2026-2027", start: "2026-07-01", end: "2027-06-30", leagues: [generateLeagueSchedule("top14", ids, "2026-09-05")], cups: [], internationals: [], windows: [] };
  return createWorld({ seed, calendar, clubs });
}

const endOfSeason = (w: World) => advanceTo(w, addDays(w.calendar.end, 1));

describe("next season calendar", () => {
  it("keeps last year's weekends for the extra rounds a bigger league needs", () => {
    const prev = ["2026-09-05", "2026-09-12", "2026-09-26", "2026-10-10"];
    const { dates, extraWeeks } = fitRoundDates(prev, 6);
    expect(dates).toHaveLength(6);
    expect(new Set(dates).size).toBe(6);
    expect(dates.slice(0, 1)).toEqual(["2027-09-04"]);
    for (const d of dates) expect(weekday(d)).toBe(6);
    expect(extraWeeks).toBe(0);
    expect(fitRoundDates(prev, 8).extraWeeks).toBeGreaterThan(0);
  });

  it("gives every club of a European pool four games against the other leagues, two at home", () => {
    const games = new Map<number, { home: number; away: number; opp: Set<number> }>();
    const seen = new Set<string>();
    for (const round of POOL_OF_SIX) {
      const inRound = new Set<number>();
      for (const [h, a] of round) {
        expect(Math.floor(h / 2)).not.toBe(Math.floor(a / 2));
        for (const t of [h, a]) {
          expect(inRound.has(t)).toBe(false);
          inRound.add(t);
        }
        const key = [Math.min(h, a), Math.max(h, a)].join("-");
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        const g = (t: number) => games.get(t) ?? games.set(t, { home: 0, away: 0, opp: new Set() }).get(t)!;
        g(h).home++;
        g(a).away++;
        g(h).opp.add(a);
        g(a).opp.add(h);
      }
    }
    for (let t = 0; t < 6; t++) expect(games.get(t)).toMatchObject({ home: 2, away: 2 });
  });
});

describe("season rollover", () => {
  it("archives the season and moves to 1 July 2027 with arrivals, departures, retirements and new objectives", () => {
    const w = miniWorld("rollover");
    startCareer(w, PROFILE, "f");
    const m = w.manager!;
    // A veteran of club b retires, a player of club e joins us, one of ours leaves at the end of his contract.
    const veteran = w.players[w.squads.b![0]!]!;
    veteran.player.birthDate = "1988-01-01";
    veteran.contract!.expires = 2027;
    const recruit = w.players[w.squads.e![3]!]!;
    w.transfers = [{ id: "t1", playerId: recruit.player.id, from: "e", to: "f", kind: "preContract", contract: { clubId: "f", salary: 120_000, expires: 2030, estimated: false, status: "rotation" }, fee: 0, agentFee: 0, agreedOn: "2026-12-01", effective: "2027-07-01" }];
    const leaving = w.players[w.squads.f!.find((id) => w.players[id]!.player.birthDate > "1996-01-01")!]!;
    leaving.contract!.expires = 2027;
    endOfSeason(w);
    expect(m.dismissed).toBeUndefined();
    const capsBefore = recruit.caps;
    const r = startNextSeason(w);

    expect(w.season).toBe("2027-2028");
    expect(w.date).toBe("2027-07-01");
    expect(r.retired).toBeGreaterThan(0);
    expect(w.players[veteran.player.id]).toBeUndefined();
    expect(w.squads.f).toContain(recruit.player.id);
    expect(recruit.contract).toMatchObject({ clubId: "f", expires: 2030 });
    expect(recruit.caps).toBeGreaterThanOrEqual(capsBefore);
    expect(w.squads.f).not.toContain(leaving.player.id);
    expect(w.freeAgents).toContain(leaving.player.id);
    expect(recruit.career?.[0]?.season).toBe("2026-2027");
    expect(Object.keys(recruit.stats)).toHaveLength(0);

    const record = w.history!.at(-1)!;
    expect(record.season).toBe("2026-2027");
    expect(record.honours.find((h) => h.competitionId === "top14")?.champion).toBeDefined();
    expect(record.manager?.objective).toBeDefined();

    // New calendar: same weekend one year later, a full double round robin, the 2027 World Cup.
    const first = w.fixtures.filter((f) => f.competitionId === "top14" && f.stage === "J1");
    expect(first[0]!.date).toBe("2027-09-04");
    expect(w.fixtures.filter((f) => f.competitionId === "top14")).toHaveLength(30);
    expect(w.fixtures.every((f) => !f.result)).toBe(true);
    expect(w.competitions["world-cup"]!.groups).toEqual(WORLD_CUP_2027.pools);
    expect(w.calendar.windows.find((x) => x.id === "coupe-du-monde")?.start).toBe("2027-08-02");

    // Manager: new objectives, new accounts, the inbox starts again.
    expect(w.news[0]!.text).toMatch(/Début de la saison 2027-2028/);
    expect(w.news.some((n) => n.topic === "board" && n.text.includes("2027-2028"))).toBe(true);
    expect(w.clubs.f!.finances!.revenue.sponsors).toBe(0);
    expect(m.newsRead).toBe(0);
    expect(m.offers).toEqual([]);
    expect(w.version).toBe(WORLD_VERSION);
  });

  it("deducts JIFF points from next season's table when the rule is missed", () => {
    const w = miniWorld("jiff");
    startCareer(w, PROFILE, "f");
    endOfSeason(w);
    w.jiffLog = { sheets: 26, jiff: 26 * 12 };
    const record = closeSeason(w);
    expect(record.manager?.jiffPenalty).toBe(8);
    startNextSeason(w);
    expect(leagueTable(w, "top14").find((r) => r.team === "f")!.points).toBe(-8);
  });

  it("plays the 2027 World Cup with its knock-out stage and sends the players back to their clubs", () => {
    const w = miniWorld("world-cup");
    endOfSeason(w);
    startNextSeason(w);
    advanceTo(w, "2027-08-03");
    const french = Object.values(w.players).filter((ps) => ps.duty?.nation === "FRA");
    expect(french.length).toBeGreaterThan(20);
    advanceTo(w, "2027-11-20");
    const wc = w.competitions["world-cup"]!;
    expect(wc.outcome?.champion).toBeDefined();
    expect(wc.outcome?.ranking).toHaveLength(4);
    const ko = w.fixtures.filter((f) => f.competitionId === "world-cup" && f.knockout);
    expect(ko.filter((f) => f.stage === "huitieme")).toHaveLength(8);
    expect(ko.some((f) => f.stage === "petite-finale")).toBe(true);
    // No pool rematch in the round of 16.
    const poolOf = (t: string) => wc.groups!.findIndex((g) => g.includes(t));
    for (const f of ko.filter((x) => x.stage === "huitieme")) expect(poolOf(f.home)).not.toBe(poolOf(f.away));
    expect(Object.values(w.players).filter((ps) => ps.duty)).toHaveLength(0);
  });

  it("allows World Cup jokers while internationals are away, until the end of the tournament", () => {
    const w = miniWorld("wc-joker");
    startCareer(w, PROFILE, "f");
    endOfSeason(w);
    startNextSeason(w);
    expect(worldCupJokerAllowed(w)).toBeUndefined();
    advanceTo(w, "2027-08-05");
    const allowed = worldCupJokerAllowed(w);
    expect(allowed?.until).toBe(w.calendar.windows.find((x) => x.id === "coupe-du-monde")!.end);
    const fa = w.players[w.freeAgents![0]!]!;
    const terms = dealTerms(w, fa.player.id);
    expect("kind" in terms && terms.kind).toBe("worldCupJoker");
    joinClub(w, fa, "f", { clubId: "f", salary: 60_000, expires: 2028, estimated: false, joker: true, until: allowed!.until });
    w.date = addDays(allowed!.until, 1);
    releaseWorldCupJokers(w);
    expect(w.squads.f).not.toContain(fa.player.id);
    expect(w.freeAgents).toContain(fa.player.id);
  });
});

describe("job offers", () => {
  it("only offers jobs at clubs matching the manager's reputation, and moves the career when accepted", () => {
    const w = miniWorld("jobs");
    startCareer(w, PROFILE, "a");
    const m = w.manager!;
    for (const rep of [30, 50, 80]) {
      m.reputation = rep;
      for (let k = 0; k < 6; k++) {
        w.date = addDays("2026-08-01", k * 9);
        for (const o of makeJobOffers(w)) {
          const need = requiredReputation(w.clubs[o.clubId]!.reputation);
          expect(need).toBeLessThanOrEqual(rep + 6);
          expect(o.clubId).not.toBe("a");
        }
      }
    }
    m.offers = [{ clubId: "d", date: w.date, objective: "Se qualifier pour les phases finales", until: addDays(w.date, 30) }];
    expect(acceptJob(w, "e")).toMatch(/n'existe pas/);
    expect(acceptJob(w, "d")).toBeNull();
    expect(m.clubId).toBe("d");
    expect(w.clubs.a!.headCoach).toBe("Coach a");
    expect(w.clubs.d!.headCoach).toBe("Jean Test");
    expect(w.clubs.d!.finances).toBeDefined();
    expect(w.clubs.a!.finances).toBeUndefined();
    expect(m.board!.president).toBe("Président d");
    expect(m.spells!.map((s) => s.clubId)).toEqual(["a", "d"]);
    expect(w.players[w.squads.d![0]!]!.human).toBeDefined();
  });

  it("migrates an M6b save (version 3) to the M6c world", () => {
    const w = miniWorld("migrate");
    startCareer(w, PROFILE, "b");
    delete w.history;
    delete w.manager!.spells;
    w.version = 3;
    ensureWorldExtensions(w);
    expect(w.history).toEqual([]);
    expect(w.manager!.spells).toEqual([{ clubId: "b", from: w.manager!.since }]);
    expect(w.version).toBe(4);
  });
});

describe("next fixture", () => {
  it("returns the earliest fixture even when a knock-out match was appended later", async () => {
    const { nextFixture } = await import("../src/index.js");
    const w = miniWorld("next-fixture");
    const later = w.fixtures.find((f) => f.home === "a" || f.away === "a")!;
    w.fixtures.push({ id: "cup:huitieme:a-b", competitionId: "top14", stage: "huitieme", date: addDays(later.date, -3), home: "a", away: "b", knockout: true });
    expect(nextFixture(w, "a")!.id).toBe("cup:huitieme:a-b");
  });
});

describe("contract reminders", () => {
  it("warns the manager in January about players whose contract ends in June", () => {
    const w = miniWorld("reminders");
    startCareer(w, PROFILE, "f");
    const ps = w.players[w.squads.f![0]!]!;
    ps.contract!.expires = 2027;
    advanceTo(w, "2027-01-05");
    const n = w.news.find((x) => x.date === "2027-01-04" && x.text.startsWith("Fins de contrat"));
    expect(n?.text).toContain(`${ps.player.firstName} ${ps.player.lastName}`);
  });
});
