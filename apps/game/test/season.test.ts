import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readCalendar, readDatabase } from "@ovalie/data/node";
import { addDays, advanceTo, continueCareer, startNextSeason, WORLD_CUP_2027 } from "@ovalie/engine";
import { newCareer } from "../src/game/session";

describe("season 2027-2028 on the real database", () => {
  it("plays 2026-27 then moves to 2027-28: promotions, European places, World Cup, new objectives", () => {
    const db = readDatabase();
    const w = newCareer(db, readCalendar(), { name: "Test", nationality: "FRA", start: "bigClub" }, "toulouse", "season-real");
    advanceTo(w, addDays(w.calendar.end, 1));
    expect(continueCareer(w).reason).toMatch(/seasonEnd|dismissed/);
    const top14Before = w.competitions.top14!.outcome!;
    const sixBefore = w.calendar.internationals.find((i) => i.id === "six-nations")!.rounds[0]!.matches[0]!;
    const r = startNextSeason(w);

    expect(w.season).toBe("2027-2028");
    expect(r.transfers).toBeGreaterThan(100);
    expect(r.retired).toBeGreaterThan(20);
    // Leagues keep their size; Nationale grows to 16 with two clubs from Nationale 2.
    expect(w.competitions.top14!.teams).toHaveLength(14);
    expect(w.competitions.prod2!.teams).toHaveLength(16);
    expect(w.competitions.nationale!.teams).toHaveLength(16);
    for (const id of top14Before.relegated!) expect(w.clubs[id]!.league).toBe("PROD2");
    expect(w.competitions.top14!.teams).not.toContain(top14Before.relegated![0]);
    // Champions Cup: the top 8 of last season's Top 14.
    const cc = w.competitions["champions-cup"]!;
    expect(cc.teams).toHaveLength(24);
    for (const id of top14Before.ranking!.slice(0, 8)) expect(cc.teams).toContain(id);
    expect(w.competitions["challenge-cup"]!.teams).toHaveLength(18);
    // Internationals: World Cup in Australia, Six Nations with venues swapped.
    expect(w.competitions["world-cup"]!.groups).toEqual(WORLD_CUP_2027.pools);
    const six = w.calendar.internationals.find((i) => i.id === "six-nations")!.rounds[0]!.matches[0]!;
    expect([six.home, six.away]).toEqual([sixBefore.away, sixBefore.home]);
    // The manager: new objectives, accounts, previous rank on the club page.
    const m = w.manager!;
    if (!m.dismissed) {
      expect(m.board!.objectives[0]!.label).toBeTruthy();
      expect(w.clubs.toulouse!.previousRank?.league).toBe("TOP14");
      expect(w.history!.at(-1)!.manager?.clubId).toBe("toulouse");
    }
    // Every squad can field a team and every player has a contract.
    for (const [id, c] of Object.entries(w.clubs)) {
      if (c.league === "NATIONALE2") continue;
      expect(w.squads[id]!.length).toBeGreaterThanOrEqual(28);
      for (const pid of w.squads[id]!) expect(w.players[pid]!.contract?.clubId).toBe(id);
    }
  }, 180_000);
});
