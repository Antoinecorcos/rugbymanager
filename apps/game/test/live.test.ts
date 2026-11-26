import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readCalendar, readDatabase } from "@ovalie/data/node";
import { DEFAULT_PENALTY_RULES, LiveSession, type World } from "@ovalie/engine";
import { continueWithProgress, newCareer, playToday } from "../src/game/session";

const db = readDatabase();
const calendar = readCalendar();
const PROFILE = { name: "Test", nationality: "FRA", start: "bigClub" as const };

function toMatchDay(seed: string): World {
  const w = newCareer(db, calendar, PROFILE, "toulouse", seed);
  for (let i = 0; i < 40; i++) {
    const stop = continueWithProgress(w, () => {});
    if (stop.reason === "matchDay") return w;
  }
  throw new Error("no match day");
}

describe("live match", () => {
  it("following the staff's advice gives exactly the simulated match", () => {
    const a = toMatchDay("live-same");
    const b = structuredClone(a);
    const live = new LiveSession(a);
    let chunk = live.next();
    let steps = chunk.steps.length;
    while (!chunk.finished) {
      chunk = chunk.decision ? live.decide(chunk.decision.recommended) : chunk.halfTime ? (live.halfTimeTalk(a, "none"), live.next()) : live.next();
      steps += chunk.steps.length;
    }
    expect(steps).toBeGreaterThan(300);
    const fa = live.finish(a);
    const fbId = playToday(b)!;
    const fb = b.fixtures.find((f) => f.id === fbId)!;
    expect(fa.id).toBe(fb.id);
    expect(fa.result).toEqual(fb.result);
    expect(a.reports![fa.id]!.score).toEqual(b.reports![fb.id]!.score);
    expect(a.date).toBe(b.date);
  });

  it("stops for the manager's penalty decisions, applies rules, and records the match", () => {
    const w = toMatchDay("live-rules");
    w.manager!.penaltyRules = DEFAULT_PENALTY_RULES.map((r) => ({ ...r, enabled: r.id === "own-half-touch" }));
    const live = new LiveSession(w);
    const info = live.info(w);
    expect(info.teams[info.side].id).toBe("toulouse");
    expect(info.referee.name.length).toBeGreaterThan(3);
    let asked = 0;
    let auto = 0;
    let chunk = live.next();
    while (!chunk.finished) {
      auto += chunk.autoDecisions.length;
      if (chunk.decision) {
        asked++;
        expect(chunk.decision.side).toBe(info.side);
        // The rule covers our own half: we are only asked beyond halfway.
        expect(chunk.decision.advance).toBeGreaterThan(50);
        chunk = live.decide("touch");
      } else if (chunk.halfTime) {
        live.halfTimeTalk(w, "none");
        chunk = live.next();
      } else chunk = live.next();
    }
    expect(asked).toBeGreaterThan(0);
    expect(auto + asked).toBeGreaterThan(2);
    const f = live.finish(w);
    expect(f.result).toBeDefined();
    expect(w.reports![f.id]).toBeDefined();
  });

  it("lets the manager substitute and change tactics during the match", () => {
    const w = toMatchDay("live-subs");
    const live = new LiveSession(w);
    const info = live.info(w);
    const mine = info.teams[info.side];
    live.setAutoSubs(false);
    let chunk = live.next(60);
    expect(live.substitute(mine.players[11]!.id, mine.players[22]!.id)).toBeNull();
    live.setTactics({ ...live.snapshot().teams[info.side].tactics, kickingGame: "territory" });
    expect(live.snapshot().teams[info.side].tactics.kickingGame).toBe("territory");
    for (let i = 0; i < 20 && !chunk.finished; i++) chunk = chunk.decision ? live.decide(chunk.decision.recommended) : chunk.halfTime ? (live.halfTimeTalk(w, "none"), live.next()) : live.next();
    // On the field (or since sin-binned / replaced again): no longer on the bench.
    expect(live.snapshot().teams[info.side].players[mine.players[22]!.id]!.state).not.toBe("bench");
    expect(live.snapshot().teams[info.side].players[mine.players[11]!.id]!.state).toBe("off");
    live.finish(w);
  });
});

describe("live playback timeline", () => {
  it("shows tries in every highlight mode and nothing in 'Sans images'", async () => {
    const { isHighlight, stepTiming } = await import("../src/live/timeline");
    const w = toMatchDay("timeline");
    const live = new LiveSession(w);
    const steps = [];
    const events: Parameters<typeof isHighlight>[1] extends (i: number) => infer E ? E[] : never = [];
    let chunk = live.next(600);
    for (;;) {
      steps.push(...chunk.steps);
      chunk.events.forEach((e, k) => (events[chunk.eventOffset + k] = e));
      if (chunk.finished) break;
      if (chunk.halfTime) live.halfTimeTalk(w, "none");
      chunk = chunk.decision ? live.decide(chunk.decision.recommended, 600) : live.next(600);
    }
    const ev = (i: number) => events[i];
    const tries = steps.filter((s) => s.kind === "try");
    expect(tries.length).toBeGreaterThan(0);
    for (const s of tries) {
      expect(isHighlight(s, ev, "key")).toBe(true);
      expect(isHighlight(s, ev, "extended")).toBe(true);
      expect(isHighlight(s, ev, "result")).toBe(false);
    }
    const key = steps.filter((s) => isHighlight(s, ev, "key")).length;
    const ext = steps.filter((s) => isHighlight(s, ev, "extended")).length;
    expect(key).toBeLessThan(ext);
    expect(ext).toBeLessThan(steps.length / 2);
    // A whole match at ×1 lasts about 8 to 18 minutes of real time (rucks shown in full since M8).
    const ms = steps.reduce((t, s) => t + stepTiming(s, 1).setup + stepTiming(s, 1).action, 0);
    expect(ms / 60000).toBeGreaterThan(8);
    expect(ms / 60000).toBeLessThan(18);
    live.finish(w);
  });
});
