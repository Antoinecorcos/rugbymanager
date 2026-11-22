import { describe, expect, it } from "vitest";
import {
  addDays,
  analystAdvice,
  continueCareer,
  createWorld,
  generateLeagueSchedule,
  generateMatchTeam,
  lineupIssues,
  nextFixture,
  playMatchDay,
  playSeason,
  Rng,
  scoutReport,
  sectorRatings,
  staffLineup,
  startCareer,
  type SeasonCalendar,
  type World,
} from "../src/index.js";

const PROFILE = { name: "Jean Test", nationality: "FRA", start: "bigClub" as const };

function miniWorld(seed: string): World {
  const rng = new Rng("mini-career");
  const ids = ["a", "b", "c", "d", "e", "f"];
  const clubs = ids.map((id, i) => {
    const team = generateMatchTeam(rng, { id, name: `Club ${id}`, level: 11.5 + i * 0.5 });
    const extra = generateMatchTeam(rng, { id: `${id}x`, name: "x", level: 11 + i * 0.5 }).players;
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

describe("manager career", () => {
  it("starts at a playable club only", () => {
    const w = miniWorld("c1");
    expect(() => startCareer(w, PROFILE, "zz")).toThrow();
    const m = startCareer(w, PROFILE, "a");
    expect(m.clubId).toBe("a");
    expect(m.plans.length).toBe(2);
    expect(w.clubs.a!.headCoach).toBe("Jean Test");
    expect(w.news.at(-1)!.text).toContain("Jean Test");
  });

  it("'Continuer' stops on the morning of the club's match, without playing it", () => {
    const w = miniWorld("c2");
    startCareer(w, PROFILE, "a");
    const first = nextFixture(w, "a")!;
    const r = continueCareer(w, 400);
    expect(r.reason).toBe("matchDay");
    expect(r.fixture!.id).toBe(first.id);
    expect(w.date).toBe(first.date);
    expect(first.result).toBeUndefined();
    // Continuing again does not skip the match.
    expect(continueCareer(w).reason).toBe("matchDay");
    const played = playMatchDay(w)!;
    expect(played.id).toBe(first.id);
    expect(played.result).toBeDefined();
    expect(w.reports![first.id]).toBeDefined();
    expect(w.date).toBe(addDays(first.date, 1));
  });

  it("uses the manager's 23, tactics and plan, and records them in the report", () => {
    const w = miniWorld("c3");
    const m = startCareer(w, PROFILE, "b");
    const f = nextFixture(w, "b")!;
    continueCareer(w, 400);
    m.selection = staffLineup(w, "b", w.date, "6-2");
    // Swap the starting fly-half and the bench fly-half, and pick a captain.
    const lu = m.selection.lineup;
    m.selection.captainId = lu[7];
    m.plans[1]!.tactics.attackShape = "wide";
    m.matchPlans[f.id] = 1;
    playMatchDay(w);
    const rep = w.reports![f.id]!;
    const side = f.home === "b" ? 0 : 1;
    expect(rep.teams[side].lineup).toEqual(lu);
    expect(rep.teams[side].captainId).toBe(lu[7]);
    expect(rep.teams[side].tactics.attackShape).toBe("wide");
    expect(rep.planName).toBe(m.plans[1]!.name);
    expect(rep.staffChanges).toEqual([]);
    expect(m.matchPlans[f.id]).toBeUndefined();
    expect(rep.events.length).toBeGreaterThan(20);
  });

  it("replaces unavailable players in a manual 23 and says so", () => {
    const w = miniWorld("c4");
    const m = startCareer(w, PROFILE, "c");
    const f = nextFixture(w, "c")!;
    continueCareer(w, 400);
    m.selection = staffLineup(w, "c", w.date, "5-3");
    const injured = m.selection.lineup[9]!;
    w.players[injured]!.injury = { type: "Ischios", until: addDays(w.date, 20), concussion: false };
    const issues = lineupIssues(w, "c", m.selection, w.date);
    expect(issues.some((i) => i.level === "error" && i.shirt === 10)).toBe(true);
    playMatchDay(w);
    const rep = w.reports![f.id]!;
    const side = f.home === "c" ? 0 : 1;
    expect(rep.teams[side].lineup).not.toContain(injured);
    expect(rep.staffChanges.length).toBe(1);
    expect(rep.staffChanges[0]).toContain("N° 10");
  });

  it("flags a non-specialist prop and a player picked twice", () => {
    const w = miniWorld("c5");
    const m = startCareer(w, PROFILE, "a");
    m.selection = staffLineup(w, "a", w.date, "5-3");
    const lu = m.selection.lineup;
    [lu[0], lu[14]] = [lu[14]!, lu[0]!]; // full-back at loosehead
    lu[22] = lu[21]!;
    const issues = lineupIssues(w, "a", m.selection, w.date);
    expect(issues.some((i) => i.shirt === 1 && i.level === "error" && i.text.includes("mêlées simulées"))).toBe(true);
    expect(issues.some((i) => i.text.includes("deux fois"))).toBe(true);
  });

  it("leaves the simulation unchanged when the staff picks the team (calibration stays valid)", () => {
    const plain = miniWorld("same");
    const career = miniWorld("same");
    startCareer(career, PROFILE, "d");
    playSeason(plain);
    while (continueCareer(career, 400).reason !== "seasonEnd") playMatchDay(career);
    expect(career.fixtures.map((f) => f.result!.score)).toEqual(plain.fixtures.map((f) => f.result!.score));
    expect(Object.keys(career.reports!).length).toBe(career.fixtures.filter((f) => f.home === "d" || f.away === "d").length);
  });
});

describe("analyst", () => {
  it("rates sectors and sees the strongest club as stronger almost everywhere", () => {
    const w = miniWorld("s1");
    const weak = scoutReport(w, "a");
    const strong = scoutReport(w, "f");
    const better = Object.keys(strong.sectors).filter((k) => strong.sectors[k as keyof typeof strong.sectors] > weak.sectors[k as keyof typeof weak.sectors]);
    expect(better.length).toBeGreaterThanOrEqual(8);
    expect(strong.keyPlayers.length).toBe(3);
    expect(strong.team.players.length).toBe(23);
  });

  it("gives advice tied to tactics when a gap is clear", () => {
    const rng = new Rng("adv");
    const big = sectorRatings(generateMatchTeam(rng, { id: "x", name: "x", level: 15 }));
    const small = sectorRatings(generateMatchTeam(rng, { id: "y", name: "y", level: 10 }));
    const adv = analystAdvice(big, small, "wet");
    expect(adv.find((a) => a.id === "scrum-penalty")?.tactic).toEqual({ key: "scrumIntent", value: "penalty" });
    expect(adv.some((a) => a.id === "weather-wet")).toBe(true);
    expect(analystAdvice(small, big).some((a) => a.id === "scrum-quick")).toBe(true);
    expect(analystAdvice(big, big)).toEqual([]);
  });
});
