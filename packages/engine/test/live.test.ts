import { describe, expect, it } from "vitest";
import { DEFAULT_REFEREE, DEFAULT_TACTICS, generateMatchTeam, MatchSimulation, Rng, simulateMatch, type MatchSetup, type MatchTeam } from "../src/index.js";

const teams = (seed: string): [MatchTeam, MatchTeam] => {
  const rng = new Rng(seed);
  return [generateMatchTeam(rng, { id: "h", name: "Domicile", level: 13 }), generateMatchTeam(rng, { id: "a", name: "Extérieur", level: 13 })];
};
const setup = (h: MatchTeam, a: MatchTeam, seed: string | number): MatchSetup => ({ home: h, away: a, referee: DEFAULT_REFEREE, weather: "dry", seed });

describe("live trace", () => {
  it("never changes the match", () => {
    const [h, a] = teams("trace");
    for (let i = 0; i < 30; i++) {
      const s = setup(h, a, i);
      const r1 = simulateMatch(s);
      const r2 = simulateMatch(s, { trace: true });
      expect(r2.teamStats).toEqual(r1.teamStats);
      expect(r2.events.length).toBe(r1.events.length);
    }
  });

  it("covers the whole match without gaps and every event", () => {
    const [h, a] = teams("cover");
    const sim = new MatchSimulation(setup(h, a, "c"), { trace: true });
    sim.run();
    const tr = sim.getTrace();
    expect(tr.length).toBeGreaterThan(300);
    expect(tr[0]!.lineup).toBeDefined();
    for (let i = 1; i < tr.length; i++) {
      expect(Math.abs(tr[i]!.t - (tr[i - 1]!.t + tr[i - 1]!.dur))).toBeLessThan(0.21);
      expect(tr[i]!.ev[0]).toBe(tr[i - 1]!.ev[1]);
    }
    expect(tr[tr.length - 1]!.ev[1]).toBe(sim.getEvents().length);
    for (const s of tr) for (const v of [...s.from, ...s.to]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("live control", () => {
  it("applies a tactical change from the next action", () => {
    const [h, a] = teams("tactics");
    let before = 0;
    let after = 0;
    for (let i = 0; i < 20; i++) {
      const sim = new MatchSimulation(setup(h, a, `t${i}`), { trace: true });
      while (!sim.isFinished() && sim.getClock() < 2400) sim.step();
      const mid = sim.getTrace().length;
      sim.setTactics(0, { ...DEFAULT_TACTICS, kickingGame: "territory" });
      sim.run();
      const tr = sim.getTrace();
      before += tr.slice(0, mid).filter((s) => s.kind === "kick" && s.side === 0).length;
      after += tr.slice(mid).filter((s) => s.kind === "kick" && s.side === 0).length;
    }
    expect(after).toBeGreaterThan(before * 1.2);
  });

  it("makes a requested substitution at the next stoppage and validates it", () => {
    const [h, a] = teams("subs");
    const sim = new MatchSimulation(setup(h, a, "s"), { trace: true });
    sim.setAutoSubstitutions(0, false);
    while (sim.getClock() < 600) sim.step();
    expect(sim.requestSubstitution(0, h.players[0]!.id, h.players[22]!.id)).toMatch(/première ligne/);
    expect(sim.requestSubstitution(0, h.players[0]!.id, "nobody")).not.toBeNull();
    expect(sim.requestSubstitution(0, h.players[12]!.id, h.players[22]!.id)).toBeNull();
    expect(sim.snapshot().teams[0].pendingSubs).toHaveLength(1);
    while (sim.snapshot().teams[0].players[h.players[22]!.id]!.state !== "field" && !sim.isFinished()) sim.step();
    const snap = sim.snapshot().teams[0];
    expect(snap.players[h.players[12]!.id]!.state).toBe("off");
    expect(snap.pendingSubs).toHaveLength(0);
    sim.run();
    // Manual mode: no other planned substitutions (only injuries/HIA may bring players on).
    const subs = sim.getEvents().filter((e) => e.type === "substitution" && e.side === 0);
    expect(subs.length).toBeLessThanOrEqual(4);
  });

  it("targeted instructions shift the engine towards the target", () => {
    const [h, a] = teams("targets");
    const target = a.players[9]!.id; // their fly-half
    const kickTarget = a.players[10]!.id; // their left wing
    const tackles: [number, number] = [0, 0];
    const catches: [number, number] = [0, 0];
    for (const [k, on] of [[0, false], [1, true]] as const) {
      for (let i = 0; i < 25; i++) {
        const home: MatchTeam = on ? { ...h, targets: { carryAt: target, kickAt: kickTarget } } : h;
        const r = simulateMatch(setup(home, a, `g${i}`));
        tackles[k] += r.playerStats[1].find((p) => p.playerId === target)?.tacklesMade ?? 0;
        catches[k] += r.events.filter((e) => (e.type === "kickCaught" || e.type === "knockOn") && e.side === 1 && e.playerId === kickTarget).length;
      }
    }
    expect(tackles[1]).toBeGreaterThan(tackles[0] * 1.5);
    expect(catches[1]).toBeGreaterThan(catches[0] * 1.5);
  });

  it("exposes a consistent snapshot", () => {
    const [h, a] = teams("snap");
    const sim = new MatchSimulation(setup(h, a, "n"));
    for (let i = 0; i < 200; i++) sim.step();
    const snap = sim.snapshot();
    expect(snap.score).toEqual(sim.getScore());
    for (const t of snap.teams) {
      const onField = Object.values(t.players).filter((p) => p.state === "field");
      expect(onField.length).toBeLessThanOrEqual(15);
      expect(new Set(onField.map((p) => p.slot)).size).toBe(onField.length);
    }
  });
});
