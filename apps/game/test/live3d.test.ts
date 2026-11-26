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

describe("3D breakdown", () => {
  const ruckFrame = (t: number, outcome = "fast") => {
    const p = none();
    p[0][5] = { x: 50.8, y: 30 }; // tackled (6)
    p[0][6] = { x: 50.5, y: 29.7 }; // cleaner (7)
    p[0][3] = { x: 50, y: 30.5 }; // cleaner (4)
    p[0][8] = { x: 49.1, y: 30.3 }; // scrum-half
    p[1][6] = { x: 50.4, y: 30 }; // jackal
    p[1][9] = { x: 53, y: 34 }; // defender in the line
    const roles = { tackled: { side: 0 as const, slot: 6 }, cleaners: [{ side: 0 as const, slot: 7 }, { side: 0 as const, slot: 4 }], jackal: { side: 1 as const, slot: 7 }, scrumHalf: { side: 0 as const, slot: 9 }, outcome };
    return frame(p, { x: 50, y: 30 }, { kind: "ruck", t, roles });
  };

  it("shows the tackled player placing the ball, the jackal on it, then the clean-out and the scrum-half", () => {
    const early = playerGestures(ruckFrame(0.3), still());
    expect(early[0][5]!.kind).toBe("place");
    expect(early[1][6]!.kind).toBe("jackal");
    expect(early[1][9]!.kind).toBe("ready");
    const late = playerGestures(ruckFrame(0.75), still());
    expect(late[0][6]!.kind).toBe("cleanout");
    expect(late[0][3]!.kind).toBe("cleanout");
    expect(late[1][6]!.kind).toBe("cleanedOut");
    expect(late[0][8]!.kind).toBe("dig");
    expect(playerGestures(ruckFrame(0.95), still())[0][8]!.kind).toBe("pass");
  });

  it("keeps the jackal on the ball when he wins it", () => {
    const g = playerGestures(ruckFrame(0.8, "turnover"), still());
    expect(g[1][6]!.kind).toBe("jackal");
    expect(g[0][8]!.kind).not.toBe("dig");
  });
});

describe("3D movement", () => {
  it("carries momentum from one action to the next, never overshoots and jumps only when far", async () => {
    const { follow, newFollower } = await import("../src/live3d/motion");
    const f = newFollower();
    follow(f, 0, 0, 0.24, 1 / 60);
    // The target moves in steps (one per action, stopping at each), like the playback.
    let minSpeed = Infinity;
    for (let frame = 0; frame < 240; frame++) {
      const target = Math.min(20, Math.floor(frame / 30) * 2.5 + ((frame % 30) / 30) ** 2 * 2.5);
      follow(f, target, 0, 0.24, 1 / 60);
      if (frame > 20 && frame < 200) minSpeed = Math.min(minSpeed, Math.abs(f.vx));
      expect(f.x).toBeLessThanOrEqual(20 + 1e-6);
    }
    expect(minSpeed).toBeGreaterThan(1.5); // no stop between two actions
    follow(f, 60, 10, 0.24, 1 / 60);
    expect([f.x, f.y]).toEqual([60, 10]);
  });
});
