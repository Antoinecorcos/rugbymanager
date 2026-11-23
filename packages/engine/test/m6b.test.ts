import { describe, expect, it } from "vitest";
import {
  addDays,
  agentDemand,
  answerPress,
  boardRequest,
  continueCareer,
  createWorld,
  dealTerms,
  ensureWorldExtensions,
  generateLeagueSchedule,
  generateMatchTeam,
  hireStaff,
  makeOffer,
  medicalJokerAllowed,
  nextSeasonPayroll,
  payroll,
  perceivedLevel,
  playerLevel,
  playMatchDay,
  pressQuestions,
  Rng,
  salaryCap,
  scoutPlayer,
  seasonEndYear,
  startCareer,
  weeklyMarket,
  type SeasonCalendar,
  type World,
} from "../src/index.js";

const PROFILE = { name: "Jean Test", nationality: "FRA", start: "bigClub" as const };

function miniWorld(seed: string, budget = 30_000_000): World {
  const rng = new Rng("mini-m6b");
  const ids = ["a", "b", "c", "d", "e", "f"];
  const clubs = ids.map((id, i) => {
    const team = generateMatchTeam(rng, { id, name: `Club ${id}`, level: 11.5 + i * 0.5 });
    const extra = generateMatchTeam(rng, { id: `${id}x`, name: "x", level: 11 + i * 0.5 }).players;
    return { id, name: `Club ${id}`, shortName: id.toUpperCase(), league: "TOP14", country: "FRA", reputation: 70 + i * 20, budgetEur: budget, capacity: 15000, squad: [...team.players, ...extra].map((player) => ({ player, caps: 0 })) };
  });
  const calendar: SeasonCalendar = { season: "2026-2027", start: "2026-07-01", end: "2027-06-30", leagues: [generateLeagueSchedule("top14", ids, "2026-09-05")], cups: [], internationals: [], windows: [] };
  return createWorld({ seed, calendar, clubs });
}

const toMatchDay = (w: World) => {
  for (let i = 0; i < 60; i++) if (continueCareer(w, 400).reason === "matchDay") return;
  throw new Error("no match day");
};

describe("contracts and money", () => {
  it("gives every squad player an estimated contract within the club's payroll target and the cap", () => {
    const w = miniWorld("contracts");
    for (const id of Object.keys(w.clubs)) {
      for (const pid of w.squads[id]!) {
        const c = w.players[pid]!.contract!;
        expect(c.clubId).toBe(id);
        expect(c.expires).toBeGreaterThanOrEqual(seasonEndYear(w));
        expect(c.salary).toBeGreaterThan(10_000);
      }
      expect(payroll(w, id)).toBeLessThanOrEqual(salaryCap(w, id));
    }
    // Better players earn more.
    const ps = w.squads.f!.map((id) => w.players[id]!).sort((a, b) => playerLevel(b.player) - playerLevel(a.player));
    expect(ps[0]!.contract!.salary).toBeGreaterThan(ps[ps.length - 1]!.contract!.salary);
  });

  it("opens accounts, pays salaries monthly and books gate receipts", () => {
    const w = miniWorld("finances");
    startCareer(w, PROFILE, "c");
    const f = w.clubs.c!.finances!;
    expect(f.wageBudget).toBeGreaterThanOrEqual(payroll(w, "c"));
    toMatchDay(w);
    playMatchDay(w);
    expect(f.expense.wages).toBeGreaterThan(0);
    expect(f.revenue.sponsors).toBeGreaterThan(0);
    expect(f.revenue.gate + f.expense.travel).toBeGreaterThan(0);
    expect(f.ledger.length).toBeGreaterThan(5);
  });

  it("sets objectives, follows results and answers money requests", () => {
    const w = miniWorld("board");
    startCareer(w, PROFILE, "f");
    const b = w.manager!.board!;
    expect(b.objectives[0]!.id).toBe("league");
    expect(b.objectives.some((o) => o.id === "cap")).toBe(true);
    b.confidence = 30;
    expect(boardRequest(w, "transfers").accepted).toBe(false);
    b.confidence = 80;
    w.clubs.f!.finances!.wageBudget = payroll(w, "f");
    const r = boardRequest(w, "wages");
    expect(r.accepted).toBe(true);
    expect(boardRequest(w, "wages").text).toMatch(/Revenez/);
  });

  it("sacks the manager after an ultimatum when confidence collapses", () => {
    const w = miniWorld("sack");
    startCareer(w, PROFILE, "a");
    let reason = "";
    for (let i = 0; i < 400 && !reason; i++) {
      w.manager!.board!.confidence = Math.min(w.manager!.board!.confidence, 5);
      const r = continueCareer(w, 400);
      if (r.reason === "dismissed" || r.reason === "seasonEnd") reason = r.reason;
      else if (r.reason === "matchDay") playMatchDay(w);
    }
    expect(reason).toBe("dismissed");
    expect(w.manager!.dismissed).toBeDefined();
    expect(w.manager!.offers).toBeDefined();
    expect(w.news.some((n) => n.text.includes("Ultimatum"))).toBe(true);
  });
});

describe("market", () => {
  it("knows its own league better than the others, and scouting reveals a player", () => {
    const w = miniWorld("scout");
    startCareer(w, PROFILE, "b");
    const mine = w.squads.b![0]!;
    expect(perceivedLevel(w, mine).knowledge).toBe(1);
    const fa = w.freeAgents![0]!;
    const before = perceivedLevel(w, fa);
    expect(before.high - before.low).toBeGreaterThan(1);
    expect(scoutPlayer(w, fa)).toBeNull();
    expect(scoutPlayer(w, fa)).not.toBeNull();
    w.date = addDays(w.date, 15);
    continueCareer(w, 1);
    const after = perceivedLevel(w, fa);
    expect(after.knowledge).toBe(1);
    expect(after.potential).toBeDefined();
  });

  it("renews a player who gets what he asks, counters a low offer, and blocks after three rounds", () => {
    const w = miniWorld("renew");
    startCareer(w, PROFILE, "d");
    w.clubs.d!.finances!.wageBudget = salaryCap(w, "d");
    const pids = w.squads.d!.filter((id) => w.players[id]!.contract!.expires === seasonEndYear(w));
    expect(pids.length).toBeGreaterThan(1);
    const [p1, p2] = pids;
    const ps1 = w.players[p1!]!;
    ps1.human!.trust = 70;
    ps1.human!.morale = 70;
    // Make room under the cap for the test.
    const demand = agentDemand(w, ps1, "d");
    const res = makeOffer(w, p1!, { salary: demand.salary, years: demand.years, status: demand.status });
    expect("outcome" in res && res.outcome).toBe("accepted");
    expect(ps1.contract!.expires).toBeGreaterThan(seasonEndYear(w));
    const ps2 = w.players[p2!]!;
    ps2.human!.trust = 70;
    const d2 = agentDemand(w, ps2, "d");
    const low = { salary: Math.round(d2.salary * 0.5), years: d2.years, status: d2.status };
    const r1 = makeOffer(w, p2!, low);
    expect("outcome" in r1 && r1.outcome).toBe("countered");
    makeOffer(w, p2!, low);
    const r3 = makeOffer(w, p2!, low);
    expect("outcome" in r3 && r3.text).toMatch(/met fin/);
    expect("error" in makeOffer(w, p2!, { ...d2 })).toBe(true);
  });

  it("refuses an offer that breaks the salary cap", () => {
    const w = miniWorld("cap");
    startCareer(w, PROFILE, "e");
    const target = w.squads.a!.find((id) => w.players[id]!.contract!.expires === seasonEndYear(w))!;
    const r = makeOffer(w, target, { salary: 20_000_000, years: 2, status: "star" });
    expect("error" in r && r.error).toMatch(/salary cap/);
  });

  it("signs a pre-contract for next season, and a medical joker only after a long injury", () => {
    const w = miniWorld("precontract");
    startCareer(w, PROFILE, "f");
    w.clubs.f!.finances!.wageBudget = salaryCap(w, "f");
    const target = w.squads.a!.map((id) => w.players[id]!).find((ps) => ps.contract!.expires === seasonEndYear(w) && playerLevel(ps.player) < 12.5)!;
    const terms = dealTerms(w, target.player.id);
    expect("kind" in terms && terms.kind).toBe("preContract");
    const demand = agentDemand(w, target, "f");
    let res = makeOffer(w, target.player.id, { salary: Math.round(demand.salary * 1.3), years: demand.years, status: "star" });
    expect("outcome" in res && res.outcome).toBe("accepted");
    expect(w.squads.a).toContain(target.player.id);
    expect(nextSeasonPayroll(w, "f")).toBeGreaterThan(0);
    const fa = w.freeAgents![3]!;
    expect(medicalJokerAllowed(w)).toBe(false);
    const injured = w.players[w.squads.f![2]!]!;
    injured.injury = { type: "Rupture du ligament croisé", until: addDays(w.date, 200), concussion: false };
    expect(medicalJokerAllowed(w)).toBe(true);
    const d = agentDemand(w, w.players[fa]!, "f");
    res = makeOffer(w, fa, { salary: Math.round(d.salary * 1.3), years: 1, status: "starter" });
    expect("outcome" in res && res.outcome).toBe("accepted");
    expect(w.squads.f).toContain(fa);
    expect(w.players[fa]!.contract!.joker).toBe(true);
  });

  it("AI clubs sign pre-contracts during the season and warn the manager before taking his players", () => {
    const w = miniWorld("ai-market");
    startCareer(w, PROFILE, "b");
    for (let i = 0; i < 30; i++) {
      w.date = addDays("2026-10-05", i * 7);
      weeklyMarket(w);
    }
    const deals = w.transfers!.filter((t) => t.kind === "preContract");
    expect(deals.length).toBeGreaterThan(3);
    const fromMe = deals.filter((d) => d.from === "b");
    for (const d of fromMe) expect(w.approaches![d.playerId]).toBeDefined();
  });
});

describe("press and staff", () => {
  it("asks questions and turns the answers into morale, confidence and a headline", () => {
    const w = miniWorld("press");
    startCareer(w, PROFILE, "c");
    toMatchDay(w);
    const f = w.fixtures.find((x) => x.date === w.date && (x.home === "c" || x.away === "c"))!;
    const qs = pressQuestions(w, f);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.answers[0]!.id]));
    const headline = answerPress(w, f, answers);
    expect(headline).toContain("Jean Test");
    expect(w.manager!.press![f.id]).toBeGreaterThan(0);
    playMatchDay(w);
    expect(w.manager!.press![f.id]).toBeUndefined();
  });

  it("hires a staff member from the market, paying the outgoing one", () => {
    const w = miniWorld("staff-hire");
    startCareer(w, PROFILE, "a");
    const cand = w.staffMarket!.filter((s) => s.role === "physio").sort((x, y) => y.attributes.medical - x.attributes.medical)[0]!;
    let paid = 0;
    expect(hireStaff(w, cand.id, (_l, a) => ((paid += a), true))).toBeNull();
    expect(w.clubs.a!.staff!.find((s) => s.role === "physio")!.name).toBe(cand.name);
    expect(paid).toBeGreaterThan(0);
  });

  it("migrates an M6a save", () => {
    const w = miniWorld("migrate-m6b");
    startCareer(w, PROFILE, "b");
    for (const ps of Object.values(w.players)) delete ps.contract;
    delete w.clubs.b!.finances;
    delete w.manager!.board;
    delete w.freeAgents;
    ensureWorldExtensions(w);
    expect(w.players[w.squads.b![0]!]!.contract).toBeDefined();
    expect(w.clubs.b!.finances).toBeDefined();
    expect(w.manager!.board).toBeDefined();
    expect(w.freeAgents!.length).toBeGreaterThan(10);
  });
});
