import { describe, expect, it } from "vitest";
import { CROSSBAR_HEIGHT, DEFAULT_REFEREE, generateMatchTeam, goalKickFlight, lineupAfter, MatchSimulation, POSTS_HALF_WIDTH, Rng, stepPoses, type Lineup } from "../src/index.js";

function tracedMatch(seed: string) {
  const rng = new Rng(seed);
  const h = generateMatchTeam(rng, { id: "h", name: "H", level: 13 });
  const a = generateMatchTeam(rng, { id: "a", name: "A", level: 13 });
  const sim = new MatchSimulation({ home: h, away: a, referee: DEFAULT_REFEREE, weather: "dry", seed }, { trace: true });
  sim.run();
  return sim.getTrace();
}

describe("spatial layer", () => {
  const trace = tracedMatch("spatial");

  it("places every player on the field within bounds, and hides empty slots", () => {
    let lineup: Lineup = [[], []];
    trace.forEach((step, i) => {
      lineup = lineupAfter(lineup, step);
      const p = stepPoses(step, lineup, i);
      for (const pose of [p.setup, p.end]) {
        if (!pose) continue;
        for (const side of [0, 1] as const) {
          pose.players[side].forEach((pos, slot) => {
            expect(pos === null).toBe(lineup[side][slot] === null);
            if (pos) {
              expect(pos.x).toBeGreaterThanOrEqual(-9);
              expect(pos.x).toBeLessThanOrEqual(109);
              expect(pos.y).toBeGreaterThanOrEqual(1);
              expect(pos.y).toBeLessThanOrEqual(69);
            }
          });
        }
      }
    });
  });

  it("is deterministic", () => {
    let lineup: Lineup = [[], []];
    lineup = lineupAfter(lineup, trace[0]!);
    expect(stepPoses(trace[5]!, lineup, 5)).toEqual(stepPoses(trace[5]!, lineup, 5));
  });

  it("keeps the defence on its side of the breakdown and packs the scrum around the ball", () => {
    let lineup: Lineup = [[], []];
    let onside = 0;
    let rucks = 0;
    trace.forEach((step, i) => {
      lineup = lineupAfter(lineup, step);
      const p = stepPoses(step, lineup, i);
      const att = step.side;
      const def = att === 0 ? 1 : 0;
      const d = att === 0 ? 1 : -1;
      if (step.kind === "ruck" && step.defOrg >= 0.5) {
        rucks++;
        const defs = p.end.players[def].filter((x): x is NonNullable<typeof x> => !!x);
        const ahead = defs.filter((q) => (q.x - p.end.ball.x) * d > 0).length;
        if (ahead >= defs.length - 1) onside++;
      }
      if (step.kind === "scrum") {
        for (const side of [0, 1] as const)
          for (const q of p.end.players[side].slice(0, 8)) if (q) expect(Math.hypot(q.x - p.end.ball.x, q.y - p.end.ball.y)).toBeLessThan(4);
      }
    });
    expect(rucks).toBeGreaterThan(20);
    expect(onside / rucks).toBeGreaterThan(0.9);
  });

  it("gives kicks a flight and carries a carrier", () => {
    let lineup: Lineup = [[], []];
    let kicks = 0;
    let carries = 0;
    trace.forEach((step, i) => {
      lineup = lineupAfter(lineup, step);
      const p = stepPoses(step, lineup, i);
      if (step.kind === "kick") {
        kicks++;
        expect(p.inAir).toBe(true);
      }
      if (step.kind === "carry" && p.carrier) {
        carries++;
        expect(p.end.players[p.carrier.side][p.carrier.slot - 1]).toEqual(p.end.ball);
      }
    });
    expect(kicks).toBeGreaterThan(10);
    expect(carries).toBeGreaterThan(50);
  });

  it("sends the ball between the posts when a kick at goal goes over, and wide or short when it misses", () => {
    let made = 0;
    let missed = 0;
    for (const seed of ["spatial", "goal-1", "goal-2", "goal-3"]) {
      const steps = seed === "spatial" ? trace : tracedMatch(seed);
      let lineup: Lineup = [[], []];
      steps.forEach((step, i) => {
        lineup = lineupAfter(lineup, step);
        const isGoal = step.kind === "conversion" || step.kind === "dropGoal" || (step.kind === "penaltyKick" && step.detail === "goal");
        if (!isGoal) return;
        expect(typeof step.made).toBe("boolean");
        const { ball } = stepPoses(step, lineup, i);
        const line = step.side === 0 ? 100 : 0;
        // Where (and how high) the ball is when it reaches the goal line, if it does.
        const t = (line - ball.from.x) / (ball.to.x - ball.from.x);
        const reaches = t > 0 && t <= 1;
        const y = ball.from.y + (ball.to.y - ball.from.y) * t;
        const h = 4 * ball.height * t * (1 - t);
        const between = reaches && Math.abs(y - 35) < POSTS_HALF_WIDTH - 0.3 && h > CROSSBAR_HEIGHT + 0.5;
        expect(between).toBe(step.made);
        if (step.made) made++;
        else {
          missed++;
          // A miss is clearly wide of an upright (seen from the kicker), even when it comes down short.
          const aimY = ball.from.y + (ball.to.y - ball.from.y) * ((line - ball.from.x) / (ball.to.x - ball.from.x));
          expect(Math.abs(aimY - 35)).toBeGreaterThan(POSTS_HALF_WIDTH + 0.5);
        }
      });
    }
    expect(made).toBeGreaterThan(20);
    expect(missed).toBeGreaterThan(5);
    // From the touchline and from 50 m, a successful kick still clears the bar.
    for (const tee of [{ x: 74, y: 5 }, { x: 50, y: 20 }]) {
      const f = goalKickFlight(0, tee, true, 3, 11);
      const t = (100 - tee.x) / (f.to.x - tee.x);
      expect(4 * f.height * t * (1 - t)).toBeGreaterThan(4);
      expect(Math.abs(tee.y + (f.to.y - tee.y) * t - 35)).toBeLessThan(POSTS_HALF_WIDTH);
    }
  });

  it("stages each ruck like law 15: tackled player down, jackal on the ball then cleaned out, scrum-half at the base", () => {
    let lineup: Lineup = [[], []];
    let rucks = 0;
    trace.forEach((step, i) => {
      lineup = lineupAfter(lineup, step);
      if (step.kind !== "ruck") return;
      const p = stepPoses(step, lineup, i);
      const r = p.roles!;
      const d = step.side === 0 ? 1 : -1;
      const ball = p.end.ball;
      const at = (ref: { side: 0 | 1; slot: number } | undefined, pose = p.end.players) => (ref ? pose[ref.side][ref.slot - 1] : null);
      const ahead = (q: { x: number } | null | undefined) => (q ? (q.x - ball.x) * d : NaN);
      rucks++;
      expect(r.cleaners.length).toBe(2);
      expect(step.support?.length ?? 0).toBeGreaterThan(0);
      // The tackled player lies just in front of the ball he placed back.
      if (r.tackled) expect(ahead(at(r.tackled))).toBeGreaterThan(0.3);
      // Mid-ruck: the jackal is over the ball while the cleaners arrive from behind it.
      expect(Math.abs(ahead(at(r.jackal, p.mid!.players)))).toBeLessThan(1);
      for (const c of r.cleaners) expect(ahead(at(c, p.mid!.players))).toBeLessThan(0);
      // End: a won ruck has the cleaners beyond the ball and the jackal driven off; the scrum-half is at the base.
      if (r.outcome !== "turnover" && r.outcome !== "penalty") {
        expect(ahead(at(r.cleaners[0]))).toBeGreaterThan(0.3);
        expect(ahead(at(r.jackal))).toBeGreaterThan(1.5);
      }
      expect(ahead(at(r.scrumHalf))).toBeLessThan(-0.5);
      // Defenders outside the ruck stand behind the offside line.
      p.end.players[step.side === 0 ? 1 : 0].forEach((q, k) => {
        if (q && k + 1 !== r.jackal?.slot) expect(ahead(q)).toBeGreaterThan(1.3);
      });
    });
    expect(rucks).toBeGreaterThan(50);
  });
});
