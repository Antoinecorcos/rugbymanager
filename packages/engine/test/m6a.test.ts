import { describe, expect, it } from "vitest";
import {
  addDays,
  ageOn,
  continueCareer,
  createWorld,
  ensureWorldExtensions,
  generateLeagueSchedule,
  generateMatchTeam,
  humanOf,
  injuryRisk,
  intakeDate,
  playMatchDay,
  playSeason,
  promoteYouth,
  recordInjury,
  Rng,
  rushBack,
  setStatus,
  sharpnessTarget,
  startCareer,
  talkToPlayer,
  teamTalkEffect,
  weeklyAbilityChange,
  type SeasonCalendar,
  type World,
} from "../src/index.js";

const PROFILE = { name: "Jean Test", nationality: "FRA", start: "bigClub" as const };

function miniWorld(seed: string): World {
  const rng = new Rng("mini-m6a");
  const ids = ["a", "b", "c", "d", "e", "f"];
  const clubs = ids.map((id, i) => {
    const team = generateMatchTeam(rng, { id, name: `Club ${id}`, level: 11.5 + i * 0.5 });
    const extra = generateMatchTeam(rng, { id: `${id}x`, name: "x", level: 11 + i * 0.5 }).players;
    for (const p of [...team.players, ...extra]) p.potentialAbility = Math.min(200, (p.currentAbility ?? 120) + 15);
    return { id, name: `Club ${id}`, shortName: id.toUpperCase(), league: "TOP14", country: "FRA", reputation: 60 + i * 25, squad: [...team.players, ...extra].map((player) => ({ player, caps: 0 })) };
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

function toMatchDay(w: World): void {
  for (let i = 0; i < 60; i++) if (continueCareer(w, 400).reason === "matchDay") return;
  throw new Error("no match day");
}

describe("staff and academies", () => {
  it("gives every club a staff whose quality follows its standing, and an academy", () => {
    const w = miniWorld("staff");
    const quality = (id: string) => w.clubs[id]!.staff!.reduce((s, m) => s + m.attributes.coaching, 0);
    expect(w.clubs.a!.staff).toHaveLength(9);
    expect(quality("f")).toBeGreaterThan(quality("a"));
    for (const id of ["a", "f"]) {
      const aca = w.academies![id]!;
      expect(aca.length).toBeGreaterThanOrEqual(9);
      for (const pid of aca) {
        const ps = w.players[pid]!;
        expect(ps.academy).toBe(true);
        expect(ps.profile?.jiff).toBe(true);
        expect(ageOn(ps.player.birthDate, w.date)).toBeLessThanOrEqual(21);
        expect(ps.player.potentialAbility!).toBeGreaterThan(ps.player.currentAbility!);
      }
    }
  });

  it("migrates an old world idempotently", () => {
    const w = miniWorld("migrate");
    for (const c of Object.values(w.clubs)) delete c.staff;
    delete w.academies;
    ensureWorldExtensions(w);
    const snapshot = JSON.stringify(w);
    ensureWorldExtensions(w);
    expect(JSON.stringify(w)).toBe(snapshot);
    expect(w.clubs.c!.staff).toBeDefined();
    expect(w.academies!.c!.length).toBeGreaterThan(0);
  });

  it("brings a yearly intake and lets the manager promote a youngster", () => {
    const w = miniWorld("intake");
    startCareer(w, PROFILE, "b");
    const before = w.academies!.b!.length;
    w.date = intakeDate(w);
    // The intake happens during that day.
    continueCareer(w, 1);
    expect(w.academies!.b!.length).toBeGreaterThan(before + 2);
    expect(w.news.some((n) => n.topic === "academy")).toBe(true);
    const youth = w.academies!.b![0]!;
    expect(promoteYouth(w, youth)).toBeNull();
    expect(w.squads.b).toContain(youth);
    expect(w.players[youth]!.human!.status).toBe("prospect");
    expect(promoteYouth(w, youth)).not.toBeNull();
  });
});

describe("development and training", () => {
  it("young players progress towards their potential and veterans decline over a season", () => {
    const w = miniWorld("dev");
    const all = Object.values(w.players).filter((p) => !p.academy);
    const young = all.filter((p) => ageOn(p.player.birthDate, w.date) <= 22);
    const old = all.filter((p) => ageOn(p.player.birthDate, w.date) >= 33);
    const ca = (l: typeof all) => l.reduce((s, p) => s + p.player.currentAbility!, 0);
    const attrs = (l: typeof all) => l.reduce((s, p) => s + Object.values(p.player.attributes).reduce((a, b) => a + b, 0), 0);
    const [y0, o0, ya0, oa0] = [ca(young), ca(old), attrs(young), attrs(old)];
    playSeason(w);
    expect(young.length).toBeGreaterThan(3);
    expect(old.length).toBeGreaterThan(3);
    expect(ca(young)).toBeGreaterThan(y0);
    expect(ca(old)).toBeLessThan(o0);
    expect(attrs(young)).toBeGreaterThan(ya0);
    expect(attrs(old)).toBeLessThan(oa0);
    // Academy youngsters grow too.
    const aca = w.academies!.a!.map((id) => w.players[id]!);
    expect(aca.some((p) => (p.dev?.caAcc ?? 0) !== 0 || (p.player.currentAbility ?? 0) > 0)).toBe(true);
  });

  it("is deterministic", () => {
    const a = miniWorld("det-dev");
    const b = miniWorld("det-dev");
    playSeason(a);
    playSeason(b);
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
  });

  it("builds automatisms on the training focus and trades injuries for intensity", () => {
    const t = sharpnessTarget({ intensity: "normal", focus: "setPiece", contact: "high" });
    expect(t.setPiece).toBeGreaterThan(0.85);
    expect(t.attack).toBeLessThan(0.5);
    const injuries = (intensity: "light" | "intense", contact: "low" | "high") => {
      const w = miniWorld(`inj-${intensity}`);
      for (const c of Object.values(w.clubs)) c.training = { intensity, focus: "balanced", contact };
      let n = 0;
      playSeason(w);
      for (const ps of Object.values(w.players)) n += (ps.medical?.history ?? []).filter((h) => h.training).length;
      return n;
    };
    expect(injuries("intense", "high")).toBeGreaterThan(injuries("light", "low") * 2);
  });

  it("shapes the ability change by age and minutes", () => {
    const w = miniWorld("abil");
    const ps = Object.values(w.players).find((p) => !p.academy && ageOn(p.player.birthDate, w.date) <= 22)!;
    const benched = weeklyAbilityChange(ps, w.date, w.clubs[ps.clubId!]);
    ps.dev = { progress: {}, caAcc: 0, history: [], minutes: [{ date: w.date, minutes: 240 }] };
    const playing = weeklyAbilityChange(ps, w.date, w.clubs[ps.clubId!]);
    expect(playing).toBeGreaterThan(benched);
  });
});

describe("medical", () => {
  it("lengthens repeated concussions and lets the club rush a player back (not after a concussion)", () => {
    const w = miniWorld("med");
    const ps = w.players[w.squads.a![5]!]!;
    const first = recordInjury(w, ps, w.date, "Commotion cérébrale", 12, true);
    const second = recordInjury(w, ps, addDays(w.date, 40), "Commotion cérébrale", 12, true);
    expect(second).toBeGreaterThan(first + 4);
    expect(rushBack(w, ps.player.id)).toMatch(/commotion/);
    const other = w.players[w.squads.a![6]!]!;
    recordInjury(w, other, w.date, "Blessure à l'épaule", 40, false);
    const until = other.injury!.until;
    expect(rushBack(w, other.player.id)).toBeNull();
    expect(other.injury!.until < until).toBe(true);
    expect(injuryRisk(other, addDays(other.injury!.until, 2)).level).not.toBe("low");
    expect(rushBack(w, other.player.id)).not.toBeNull();
  });
});

describe("relationships", () => {
  it("keeps or breaks playing-time promises", () => {
    const w = miniWorld("promise");
    startCareer(w, PROFILE, "c");
    const pid = w.squads.c!.find((id) => humanOf(w, w.players[id]!).status === "backup")!;
    const ps = w.players[pid]!;
    const r = talkToPlayer(w, pid, "promise");
    expect("reaction" in r).toBe(true);
    expect(talkToPlayer(w, pid, "praise")).toEqual({ error: "Vous lui avez déjà parlé cette semaine." });
    const trustBefore = ps.human!.trust;
    // Never pick him: the promise is broken after his next matches.
    for (let i = 0; i < 8; i++) {
      toMatchDay(w);
      const m = w.manager!;
      m.selection = { auto: false, bench: "5-3", lineup: [] };
      const lineup = w.squads.c!.filter((id) => id !== pid).slice(0, 23);
      m.selection = { auto: false, bench: "5-3", lineup };
      playMatchDay(w);
      if (ps.human!.promises[0]?.outcome) break;
    }
    expect(ps.human!.promises[0]!.outcome).toBe("broken");
    expect(ps.human!.trust).toBeLessThan(trustBefore);
    expect(w.news.some((n) => n.text.includes("promesse"))).toBe(true);
  });

  it("praise works after good games, criticism upsets a player in form, demotion hurts", () => {
    const w = miniWorld("talks");
    startCareer(w, PROFILE, "d");
    const [p1, p2, p3] = w.squads.d!.slice(0, 3);
    const h1 = humanOf(w, w.players[p1!]!);
    h1.recent = [{ date: w.date, available: true, started: true, minutes: 80, rating: 7.6 }];
    const praise = talkToPlayer(w, p1!, "praise");
    expect("morale" in praise && praise.morale > 0).toBe(true);
    const h2 = humanOf(w, w.players[p2!]!);
    h2.recent = [{ date: w.date, available: true, started: true, minutes: 80, rating: 7.6 }];
    const crit = talkToPlayer(w, p2!, "criticise");
    expect("morale" in crit && crit.morale < 0).toBe(true);
    const h3 = humanOf(w, w.players[p3!]!);
    h3.status = "star";
    const before = h3.morale;
    setStatus(w, p3!, "backup");
    expect(h3.morale).toBeLessThan(before);
  });

  it("team talks fit the context", () => {
    expect(teamTalkEffect("demand", { favourite: 0.8, temperament: 12 }).delta).toBeGreaterThan(teamTalkEffect("noPressure", { favourite: 0.8, temperament: 12 }).delta);
    expect(teamTalkEffect("noPressure", { favourite: -0.8, temperament: 12 }).delta).toBeGreaterThan(0);
    expect(teamTalkEffect("calm", { favourite: 0, halfTimeDiff: 12, temperament: 12 }).delta).toBeGreaterThan(0);
    expect(teamTalkEffect("demand", { favourite: 0, halfTimeDiff: -12, temperament: 6 }).delta).toBeLessThan(0);
  });

  it("records the pre-match team talk in the report", () => {
    const w = miniWorld("talk-report");
    startCareer(w, PROFILE, "e");
    toMatchDay(w);
    const f = w.fixtures.find((x) => x.date === w.date && (x.home === "e" || x.away === "e"))!;
    w.manager!.teamTalks = { [f.id]: "motivate" };
    playMatchDay(w);
    expect(w.reports![f.id]!.teamTalk?.talk).toBe("motivate");
    expect(w.manager!.teamTalks![f.id]).toBeUndefined();
  });
});
