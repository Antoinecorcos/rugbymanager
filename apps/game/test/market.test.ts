import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readCalendar, readDatabase } from "@ovalie/data/node";
import { agentDemand, interestIn, makeOffer, payroll, playerLevel, salaryCap, seasonEndYear } from "@ovalie/engine";
import { newCareer } from "../src/game/session";

const db = readDatabase();
const calendar = readCalendar();

describe("money and market on the real database", () => {
  it("gives every Top 14 club an estimated payroll under its salary cap, stars paid the most", () => {
    const w = newCareer(db, calendar, { name: "Test", nationality: "FRA", start: "bigClub" }, "toulouse", "market-real");
    for (const [id, c] of Object.entries(w.clubs)) {
      if (c.league !== "TOP14") continue;
      expect(payroll(w, id)).toBeLessThanOrEqual(salaryCap(w, id));
      expect(payroll(w, id)).toBeGreaterThan(8_000_000);
    }
    const dupont = w.players["antoine-dupont"]!;
    const squad = w.squads.toulouse!.map((id) => w.players[id]!);
    expect(dupont.contract!.salary).toBeGreaterThan(squad.reduce((s, p) => s + p.contract!.salary, 0) / squad.length * 2);
    expect(w.manager!.board!.objectives[0]!.label).toMatch(/titre|demi/i);
    expect(w.clubs.toulouse!.finances!.wageBudget).toBeLessThanOrEqual(salaryCap(w, "toulouse"));
  });

  it("signs a willing Pro D2 player on a pre-contract when the offer meets his demand", () => {
    const w = newCareer(db, calendar, { name: "Test", nationality: "FRA", start: "bigClub" }, "pau", "market-offer");
    w.clubs.pau!.finances!.wageBudget = salaryCap(w, "pau");
    const end = seasonEndYear(w);
    const target = Object.values(w.players)
      .filter((ps) => ps.clubId && !ps.academy && w.clubs[ps.clubId]!.league === "PROD2" && ps.contract?.expires === end && ps.player.nationality === "FRA")
      .filter((ps) => interestIn(w, ps, "pau").score >= 0.5)
      .sort((a, b) => playerLevel(b.player) - playerLevel(a.player))[0]!;
    expect(target).toBeDefined();
    const d = agentDemand(w, target, "pau");
    const r = makeOffer(w, target.player.id, { salary: d.salary, years: d.years, status: d.status });
    expect("outcome" in r ? r.outcome : r.error).toBe("accepted");
    expect(w.transfers!.some((t) => t.playerId === target.player.id && t.to === "pau" && t.kind === "preContract")).toBe(true);
  });
});
