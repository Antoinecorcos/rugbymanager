import { describe, expect, it } from "vitest";
import { createWorld, editClub, editPlayer, editsAsOverrides, generateLeagueSchedule, generateMatchTeam, playerLevel, Rng, startCareer, type SeasonCalendar, type World } from "../src/index.js";

function miniWorld(): World {
  const rng = new Rng("mini-m8");
  const ids = ["a", "b", "c", "d"];
  const clubs = ids.map((id, i) => ({
    id,
    name: `Club ${id}`,
    shortName: id.toUpperCase(),
    league: "TOP14",
    country: "FRA",
    reputation: 100 + i * 10,
    budgetEur: 25_000_000,
    squad: [...generateMatchTeam(rng, { id, name: id, level: 12 + i * 0.3 }).players, ...generateMatchTeam(rng, { id: `${id}x`, name: "x", level: 11.5 }).players].map((player, k) => {
      // Two "real" players per club (the others look generated).
      player.id = k < 2 ? `real-${id}-${k}` : `gen-${id}-${k}`;
      return { player, caps: 0 };
    }),
  }));
  const calendar: SeasonCalendar = { season: "2026-2027", start: "2026-07-01", end: "2027-06-30", leagues: [generateLeagueSchedule("top14", ids, "2026-09-05")], cups: [], internationals: [], windows: [] };
  const w = createWorld({ seed: "m8", calendar, clubs });
  startCareer(w, { name: "Test", nationality: "FRA", start: "bigClub" }, "a");
  return w;
}

describe("editor", () => {
  it("changes a player's level: attributes and current ability follow, the correction is recorded", () => {
    const w = miniWorld();
    const ps = w.players["real-b-0"]!;
    const before = { ...ps.player.attributes };
    expect(editPlayer(w, "real-b-0", { level: 16.5, potential: 17 })).toBeNull();
    expect(playerLevel(ps.player)).toBeCloseTo(16.5);
    expect(ps.player.attributes.handling).toBeGreaterThanOrEqual(before.handling);
    expect(ps.player.potentialAbility).toBe(170);
    expect(w.edited).toBe(true);
    expect(editsAsOverrides(w).players["real-b-0"]).toMatchObject({ level: 16.5, potential: 17 });
  });

  it("refuses invalid edits without changing anything", () => {
    const w = miniWorld();
    const ps = w.players["real-b-1"]!;
    const name = ps.player.lastName;
    expect(editPlayer(w, "real-b-1", { lastName: "Nouveau", level: 25 })).toMatch(/1 à 20/);
    expect(ps.player.lastName).toBe(name);
    expect(editPlayer(w, "real-b-1", { positions: Object.fromEntries(Object.keys(ps.player.positions).map((p) => [p, 0])) })).toMatch(/au moins un poste/);
    expect(editPlayer(w, "real-b-1", { contract: { expires: 2020 } })).toMatch(/au moins jusqu'en juin 2027/);
    expect(editClub(w, "b", { colors: ["red", "#ffffff"] })).toMatch(/#RRGGBB/);
    expect(editClub(w, "b", { balance: 1 })).toMatch(/votre club/);
    expect(w.edited).toBeUndefined();
  });

  it("moves a player to another club, then releases him", () => {
    const w = miniWorld();
    expect(editPlayer(w, "real-c-0", { clubId: "a", contract: { salary: 250_000, expires: 2029 } })).toBeNull();
    const ps = w.players["real-c-0"]!;
    expect(w.squads.a).toContain("real-c-0");
    expect(w.squads.c).not.toContain("real-c-0");
    expect(ps.contract).toMatchObject({ clubId: "a", salary: 250_000, expires: 2029 });
    expect(ps.human).toBeDefined();
    expect(editPlayer(w, "real-c-0", { clubId: null })).toBeNull();
    expect(w.squads.a).not.toContain("real-c-0");
    expect(w.freeAgents).toContain("real-c-0");
    expect(ps.contract).toBeUndefined();
  });

  it("edits a club and the manager's accounts; generated players are not exported as corrections", () => {
    const w = miniWorld();
    expect(editClub(w, "a", { colors: ["#112233", "#FFFFFF"], reputation: 150, balance: 5_000_000, president: "Mme Test" })).toBeNull();
    expect(w.clubs.a!.colors).toEqual(["#112233", "#ffffff"]);
    expect(w.clubs.a!.finances!.balance).toBe(5_000_000);
    expect(w.manager!.board!.president).toBe("Mme Test");
    expect(editPlayer(w, "gen-a-5", { level: 14 })).toBeNull();
    const out = editsAsOverrides(w);
    expect(out.clubs.a).toMatchObject({ colors: ["#112233", "#ffffff"], reputation: 150 });
    expect(out.players["gen-a-5"]).toBeUndefined();
  });
});

describe("world creation", () => {
  it("copies the database players: playing a career never changes the next one", () => {
    const rng = new Rng("copy");
    const players = generateMatchTeam(rng, { id: "a", name: "a", level: 12 }).players;
    const setup = (seed: string) => ({
      seed,
      calendar: { season: "2026-2027", start: "2026-07-01", end: "2027-06-30", leagues: [], cups: [], internationals: [], windows: [] },
      clubs: [{ id: "a", name: "A", shortName: "A", league: "TOP14", country: "FRA", reputation: 100, squad: players.map((player) => ({ player, caps: 0 })) }],
    });
    const w1 = createWorld(setup("one"));
    const id = players[0]!.id;
    w1.players[id]!.player.attributes.passing = 1;
    w1.clubs.a!.name = "Changé";
    const w2 = createWorld(setup("two"));
    expect(players[0]!.attributes.passing).not.toBe(1);
    expect(w2.players[id]!.player.attributes.passing).toBe(players[0]!.attributes.passing);
    expect(w2.clubs.a!.name).toBe("A");
  });
});
