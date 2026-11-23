import { describe, expect, it } from "vitest";
import type { Vec } from "@ovalie/engine";
import type { Frame, FrameAction } from "../src/live/renderer";
import { playerGestures, velocitiesBetween } from "../src/live3d/gestures";
import { CUT_SHOTS, shotFor } from "../src/live3d/director";

const none = (): [(Vec | null)[], (Vec | null)[]] => [Array(15).fill(null), Array(15).fill(null)];
const still = () => none();

function frame(players: [(Vec | null)[], (Vec | null)[]], ball: Vec, action?: Partial<FrameAction>, extra: Partial<Frame> = {}): Frame {
  const f: Frame = { players, ball, height: 0, ...extra };
  if (action) f.action = { kind: "carry", side: 0, phase: "action", t: 0.5, from: ball, to: ball, inAir: false, apex: 0, ...action };
  return f;
}

describe("3D gestures", () => {
  it("binds the forwards in a scrum and leaves the backs standing", () => {
    const p = none();
    for (let s = 1; s <= 8; s++) {
      p[0][s - 1] = { x: 48.5 - (s > 3 ? 1.2 : 0), y: 35 + (s % 3) - 1 };
      p[1][s - 1] = { x: 51.5 + (s > 3 ? 1.2 : 0), y: 35 + (s % 3) - 1 };
    }
    p[0][9] = { x: 40, y: 42 };
    const g = playerGestures(frame(p, { x: 50, y: 35 }, { kind: "scrum", phase: "action", t: 0.3 }), still());
    for (let s = 1; s <= 8; s++) {
      expect(g[0][s - 1]!.kind).toBe("scrum");
      expect(g[1][s - 1]!.kind).toBe("scrum");
    }
    expect(g[0][0]!.face).toBe(0);
    expect(g[1][0]!.face).toBeCloseTo(Math.PI);
    expect(g[0][9]!.kind).toBe("idle");
  });

  it("makes the jumper jump and his neighbours lift in a lineout", () => {
    const p = none();
    [1, 4, 3, 5, 6, 8, 7].forEach((s, i) => {
      p[0][s - 1] = { x: 30, y: 6 + i * 1.4 };
      p[1][s - 1] = { x: 31.2, y: 6 + i * 1.4 };
    });
    p[0][1] = { x: 30, y: 0 };
    const g = playerGestures(frame(p, { x: 30, y: 8 }, { kind: "lineout", phase: "action", t: 0.4, from: { x: 30, y: 0 }, to: { x: 30, y: 8.2 } }), still());
    const jumper = g[0].findIndex((x) => x?.kind === "jump");
    expect(jumper).toBe(3); // shirt 4 (props lift, they do not jump)
    expect(g[0].filter((x) => x?.kind === "lift").length).toBeGreaterThanOrEqual(2);
    expect(g[1].some((x) => x?.kind === "jump")).toBe(true);
  });

  it("shows the kick, the try dive and the tackle at the end of a carry", () => {
    const p = none();
    p[0][9] = { x: 30, y: 30 };
    p[1][5] = { x: 31.5, y: 30.5 };
    const kick = playerGestures(frame(p, { x: 30, y: 30 }, { kind: "kick", t: 0.2, to: { x: 70, y: 40 }, inAir: true }, { carrier: { side: 0, slot: 10 } }), still());
    expect(kick[0][9]!.kind).toBe("kick");
    const tackle = playerGestures(frame(p, { x: 30, y: 30 }, { kind: "carry", t: 0.9 }, { carrier: { side: 0, slot: 10 } }), still());
    expect(tackle[0][9]!.kind).toBe("tackled");
    expect(tackle[1][5]!.kind).toBe("tackle");
    p[0][9] = { x: 101, y: 30 };
    const dive = playerGestures(frame(p, { x: 101, y: 30 }, { kind: "try", t: 0.8 }, { carrier: { side: 0, slot: 10 } }), still());
    expect(dive[0][9]!.kind).toBe("dive");
  });

  it("runs in the direction of movement", () => {
    const a = none();
    const b = none();
    a[1][14] = { x: 60, y: 20 };
    b[1][14] = { x: 59.7, y: 20 };
    const f = frame(b, { x: 40, y: 20 });
    const g = playerGestures(f, velocitiesBetween(frame(a, { x: 40, y: 20 }), f, 50));
    expect(g[1][14]!.kind).toBe("run");
    expect(Math.abs(g[1][14]!.face)).toBeCloseTo(Math.PI);
  });
});

describe("TV direction", () => {
  it("films goal kicks from behind the kicker, set pieces tight and open play from the main camera", () => {
    const p = none();
    const conv = shotFor("tv", frame(p, { x: 80, y: 20 }, { kind: "conversion", phase: "setup", t: 0.5, from: { x: 80, y: 20 }, to: { x: 104, y: 35 } }));
    expect(conv.name).toBe("goalKick");
    expect(conv.position[0]).toBeLessThan(30); // behind the tee (tee at X = 30), facing the posts at X = 50
    expect(shotFor("tv", frame(p, { x: 50, y: 35 }, { kind: "scrum", phase: "setup", t: 0.8 })).name).toBe("tight");
    expect(shotFor("tv", frame(p, { x: 50, y: 35 }, { kind: "scrum", phase: "setup", t: 0.2 })).name).toBe("main");
    expect(shotFor("tv", frame(p, { x: 50, y: 35 }, { kind: "carry" })).name).toBe("main");
    expect(shotFor("wide", frame(p, { x: 50, y: 35 }, { kind: "scrum" })).name).toBe("wide");
    expect(CUT_SHOTS.has("goalKick")).toBe(true);
    expect(CUT_SHOTS.has("main")).toBe(false);
  });
});
