import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFEREE,
  generateMatchTeam,
  MatchSimulation,
  Rng,
  simulateMatch,
  type MatchSetup,
  type MatchTeam,
  type Tactics,
} from "../src/index.js";

function teams(seed: string, lh = 13, la = 13, th?: Partial<Tactics>, ta?: Partial<Tactics>): [MatchTeam, MatchTeam] {
  const rng = new Rng(seed);
  return [
    generateMatchTeam(rng, { id: "h", name: "Domicile", level: lh, tactics: th }),
    generateMatchTeam(rng, { id: "a", name: "Extérieur", level: la, tactics: ta }),
  ];
}
const setup = (h: MatchTeam, a: MatchTeam, seed: string | number): MatchSetup => ({ home: h, away: a, referee: DEFAULT_REFEREE, weather: "dry", seed });

describe("match engine", () => {
  it("is fully deterministic for a given seed", () => {
    const [h, a] = teams("det");
    const r1 = simulateMatch(setup(h, a, 42));
    const r2 = simulateMatch(setup(h, a, 42));
    expect(r1.score).toEqual(r2.score);
    expect(r1.events.length).toBe(r2.events.length);
    expect(r1.teamStats).toEqual(r2.teamStats);
  });

  it("keeps the scoreboard consistent with scoring stats", () => {
    const [h, a] = teams("consistency");
    for (let i = 0; i < 60; i++) {
      const r = simulateMatch(setup(h, a, `c${i}`));
      r.teamStats.forEach((s, side) => {
        const penaltyTries = r.events.filter((e) => e.type === "try" && e.side === side && e.detail?.how === "penaltyTry").length;
        const expected = 5 * s.tries + 2 * s.conversionsMade + 3 * (s.penaltyGoalsMade + s.dropGoalsMade) + 2 * penaltyTries;
        expect(s.points).toBe(expected);
        expect(r.score[side]).toBe(s.points);
        expect(s.conversionsAttempted).toBe(s.tries - penaltyTries);
      });
    }
  });

  it("never fields more than 15 players and plays roughly 80 minutes", () => {
    const [h, a] = teams("minutes");
    for (let i = 0; i < 40; i++) {
      const r = simulateMatch(setup(h, a, `m${i}`));
      const total = r.totalSeconds / 60;
      expect(total).toBeGreaterThanOrEqual(80);
      expect(total).toBeLessThan(90);
      for (const list of r.playerStats) {
        const minutes = list.reduce((s, p) => s + p.minutes, 0);
        expect(minutes).toBeLessThanOrEqual(15 * Math.ceil(total) + list.length);
        expect(list.length).toBeLessThanOrEqual(23);
        for (const p of list) {
          expect(p.rating).toBeGreaterThanOrEqual(3);
          expect(p.rating).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("lets a much stronger team win most of the time", () => {
    const [h, a] = teams("strength", 11.5, 14.5);
    let awayWins = 0;
    for (let i = 0; i < 100; i++) if (simulateMatch(setup(h, a, `s${i}`)).winner === 1) awayWins++;
    expect(awayWins).toBeGreaterThan(80);
  });

  it("reflects the kicking tactic", () => {
    const [h, a] = teams("kick", 13, 13, { kickingGame: "territory" }, { kickingGame: "possession" });
    let hk = 0;
    let ak = 0;
    for (let i = 0; i < 50; i++) {
      const r = simulateMatch(setup(h, a, `k${i}`));
      hk += r.teamStats[0].kicksInPlay;
      ak += r.teamStats[1].kicksInPlay;
    }
    expect(hk).toBeGreaterThan(ak * 1.3);
  });

  it("resolves knockout draws", () => {
    const [h, a] = teams("ko");
    for (let i = 0; i < 80; i++) {
      const r = simulateMatch({ ...setup(h, a, `ko${i}`), knockout: true });
      expect(r.winner).not.toBeNull();
    }
  });
});

describe("penalty decisions", () => {
  it("pauses for a human decision and resumes", () => {
    const [h, a] = teams("human");
    h.controller = "human";
    const sim = new MatchSimulation(setup(h, a, "h1"));
    let decisions = 0;
    while (!sim.isFinished()) {
      sim.step();
      if (sim.pendingDecision) {
        expect(sim.pendingDecision.side).toBe(0);
        expect(sim.pendingDecision.options).toContain("touch");
        decisions++;
        sim.submitPenaltyDecision("touch");
      }
    }
    expect(decisions).toBeGreaterThan(2);
    const kicks = sim.getEvents().filter((e) => e.type === "penaltyGoal" && e.side === 0);
    // Coach always chose touch: home kicks at goal only come from captain overrides (rare).
    expect(kicks.length).toBeLessThanOrEqual(1);
  });

  it("captain never overrides with full trust, sometimes with very low trust", () => {
    const count = (trust: number) => {
      let overrides = 0;
      for (let i = 0; i < 120; i++) {
        const [h, a] = teams("trust");
        h.controller = "human";
        h.captainTrust = trust;
        const r = simulateMatch(setup(h, a, `t${i}`), { decisionHandler: (req) => (req.options.includes("goal") ? "goal" : "tap") });
        overrides += r.events.filter((e) => e.type === "captainOverride").length;
      }
      return overrides;
    };
    expect(count(1)).toBe(0);
    const low = count(0);
    expect(low).toBeGreaterThan(0);
    // Rare: well under 5% of decisions.
    expect(low).toBeLessThan(120 * 10 * 0.05);
  });
});
