/**
 * Gestures of the 30 players in the 3D view (M7). Pure and deterministic: from the frame shown
 * (positions, ball, current action) and each player's velocity, it says what every player is
 * doing — running, binding in a scrum, jumping or lifting in a lineout, clearing a ruck, tackling,
 * kicking, passing, diving for the line… — and where he faces. The renderer turns this into a pose.
 * Like the spatial layer, it only illustrates the simulation.
 */
import type { Vec } from "@ovalie/engine";
import type { Frame } from "../live/renderer";

export type GestureKind =
  | "idle"
  | "run"
  | "carry"
  | "scrum"
  | "jump"
  | "lift"
  | "throw"
  | "ruck"
  | "grounded"
  | "maul"
  | "tackle"
  | "tackled"
  | "kick"
  | "pass"
  | "catch"
  | "dive"
  | "celebrate"
  // Breakdown (M8): the jackal over the ball, the clean-out drive, the jackal driven off,
  // the tackled player placing the ball back, the scrum-half digging it out, the defensive stance.
  | "jackal"
  | "cleanout"
  | "cleanedOut"
  | "place"
  | "dig"
  | "ready";

export interface Gesture {
  kind: GestureKind;
  /** Progress or intensity of the gesture, 0..1 (running: speed / 8 m/s). */
  amount: number;
  /** Direction faced, as an angle in the pitch plane: atan2(dy, dx) (0 = towards x = 100). */
  face: number;
}

export type Velocities = [(Vec | null)[], (Vec | null)[]];
export type Gestures = [(Gesture | null)[], (Gesture | null)[]];

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x);
/** Direction of attack of a side as an angle (side 0 attacks towards x = 100). */
export const attackAngle = (side: 0 | 1) => (side === 0 ? 0 : Math.PI);
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const isForward = (slot: number) => slot <= 8;

/** Player of a side nearest to a point (optionally among some slots), with his distance. */
function nearest(players: (Vec | null)[], p: Vec, filter: (slot: number) => boolean = () => true): { slot: number; d: number } | undefined {
  let best: { slot: number; d: number } | undefined;
  players.forEach((q, i) => {
    if (!q || !filter(i + 1)) return;
    const d = dist(q, p);
    if (!best || d < best.d) best = { slot: i + 1, d };
  });
  return best;
}

/** Actions during which the ball is in open play (ready stance of the players waiting). */
const OPEN_PLAY = new Set(["carry", "ruck", "maul", "receive", "contest", "tap", "interception"]);

/** Gestures of every player for a frame. `velocities` in metres per second (null = unknown). */
export function playerGestures(frame: Frame, velocities: Velocities): Gestures {
  const ball = frame.ball;
  const out: Gestures = [[], []];
  // Base: run or stand, facing the way they move or the ball.
  for (const side of [0, 1] as const) {
    frame.players[side].forEach((p, i) => {
      if (!p) return void (out[side][i] = null);
      const v = velocities[side][i];
      const speed = v ? Math.hypot(v.x, v.y) : 0;
      out[side][i] = speed > 1.4 ? { kind: "run", amount: clamp01(speed / 8), face: Math.atan2(v!.y, v!.x) } : { kind: "idle", amount: 0, face: dist(p, ball) > 0.5 ? angleTo(p, ball) : attackAngle(side) };
    });
  }
  const set = (side: 0 | 1, slot: number, kind: GestureKind, amount: number, face?: number) => {
    const g = out[side][slot - 1];
    if (g) out[side][slot - 1] = { kind, amount: clamp01(amount), face: face ?? g.face };
  };
  const pos = (side: 0 | 1, slot: number) => frame.players[side][slot - 1] ?? undefined;

  // The ball carrier runs with the ball in his arms.
  const c = frame.carrier;
  if (c && frame.height < 0.6) {
    const g = out[c.side][c.slot - 1];
    if (g) set(c.side, c.slot, "carry", Math.max(0.35, g.kind === "run" ? g.amount : 0), g.kind === "run" ? g.face : attackAngle(c.side));
  }

  const a = frame.action;
  if (!a) return out;
  const att = a.side;
  const def: 0 | 1 = att === 0 ? 1 : 0;
  const live = a.phase === "action";
  const t = a.phase === "setup" ? 0 : a.phase === "done" ? 1 : a.t;

  // Ball in open play: players standing near it wait in a ready stance (defenders lower).
  if (OPEN_PLAY.has(a.kind)) {
    for (const side of [0, 1] as const)
      frame.players[side].forEach((p, i) => {
        const g = out[side][i];
        if (p && g?.kind === "idle" && dist(p, ball) < 28) out[side][i] = { kind: "ready", amount: side === def ? 1 : 0.55, face: g.face };
      });
  }
  const roles = a.roles;
  const role = (r: { side: 0 | 1; slot: number } | undefined, kind: GestureKind, amount: number, face?: number) => r && set(r.side, r.slot, kind, amount, face);

  switch (a.kind) {
    case "scrum": {
      for (const side of [0, 1] as const)
        frame.players[side].forEach((p, i) => {
          if (p && isForward(i + 1) && dist(p, ball) < 4.5) set(side, i + 1, "scrum", a.phase === "setup" ? smooth(a.t) : 1, attackAngle(side));
        });
      const nine = pos(att, 9);
      if (nine && live && t > 0.7) set(att, 9, "pass", (t - 0.7) / 0.3, attackAngle(att));
      break;
    }
    case "lineout": {
      // Players in the line face the thrower's touchline.
      const touchFace = a.from.y < 35 ? -Math.PI / 2 : Math.PI / 2;
      for (const side of [0, 1] as const)
        frame.players[side].forEach((p, i) => {
          if (p && isForward(i + 1) && i + 1 !== 2 && Math.abs(p.x - a.from.x) < 3) set(side, i + 1, "idle", 0, touchFace);
        });
      if (!live && a.phase !== "done") {
        const thrower = nearest(frame.players[att], a.from);
        if (thrower && thrower.d < 3) set(att, thrower.slot, "throw", 0, -touchFace);
        break;
      }
      const lift = Math.sin(Math.PI * clamp01(t * 1.25));
      const jumper = nearest(frame.players[att], a.to, (s) => s >= 4 && s <= 8);
      if (jumper) {
        set(att, jumper.slot, "jump", lift, touchFace);
        const jp = pos(att, jumper.slot)!;
        frame.players[att].forEach((p, i) => {
          if (p && i + 1 !== jumper.slot && isForward(i + 1) && i + 1 !== 2 && dist(p, jp) < 2.2) set(att, i + 1, "lift", lift, touchFace);
        });
      }
      const rival = nearest(frame.players[def], a.to, (s) => s >= 4 && s <= 8);
      if (rival && rival.d < 3) set(def, rival.slot, "jump", lift * 0.8, touchFace);
      const thrower = nearest(frame.players[att], a.from);
      if (thrower && thrower.d < 3 && t < 0.35) set(att, thrower.slot, "throw", t / 0.35, -touchFace);
      break;
    }
    case "ruck": {
      if (!roles) break;
      const won = roles.outcome !== "turnover" && roles.outcome !== "penalty";
      // Tackled player: on the ground, ball placed back towards his team.
      role(roles.tackled, "place", 1, attackAngle(att));
      // Tackler: still down beside the ball, then back on his feet.
      if (t < 0.35) role(roles.tackler, "grounded", 0.8);
      // Jackal: on his feet over the ball, hands on it, until the clean-out hits (or he wins it).
      if (roles.jackal) {
        if (t < 0.42 || !won) role(roles.jackal, "jackal", won ? Math.min(1, t * 3.5) : 1, attackAngle(def));
        else role(roles.jackal, "cleanedOut", 1 - (t - 0.42) / 0.58, attackAngle(def));
      }
      // Cleaners: arrive low, then drive over the ball.
      roles.cleaners.forEach((c, k) => {
        if (t >= 0.3 + k * 0.12) role(c, "cleanout", Math.min(1, (t - 0.3 - k * 0.12) * 4), attackAngle(att));
      });
      // Scrum-half: at the base, digs the ball out, then passes to the open side.
      if (roles.scrumHalf && won) {
        const open = ball.y < 35 ? Math.PI / 2 : -Math.PI / 2;
        if (t > 0.86) role(roles.scrumHalf, "pass", (t - 0.86) / 0.14, attackAngle(att) + (open - attackAngle(att)) * 0.5);
        else if (t > 0.62) role(roles.scrumHalf, "dig", Math.min(1, (t - 0.62) * 5), attackAngle(att));
      }
      break;
    }
    case "maul": {
      for (const side of [0, 1] as const)
        frame.players[side].forEach((p, i) => {
          if (p && isForward(i + 1) && dist(p, ball) < 3.2) set(side, i + 1, "maul", 1, attackAngle(side === att ? att : def));
        });
      break;
    }
    case "carry":
    case "interception": {
      if (!live) break;
      // Tackle at the end of the carry; a beaten tackler dives and misses.
      const tackler = roles?.tackler;
      const cp = c ? pos(c.side, c.slot) : undefined;
      if (tackler && roles?.missedTackle) {
        if (t > 0.35) role(tackler, "tackle", Math.min(1, (t - 0.35) * 3));
      } else if (tackler && cp && t > 0.74) {
        const k = (t - 0.74) / 0.26;
        role(tackler, "tackle", k, angleTo(pos(tackler.side, tackler.slot)!, cp));
        if (c) set(c.side, c.slot, "tackled", k);
      } else if (!tackler && c && cp && t > 0.78) {
        const near = nearest(frame.players[c.side === 0 ? 1 : 0], cp);
        if (near && near.d < 2.6) {
          const k = (t - 0.78) / 0.22;
          set(c.side, c.slot, "tackled", k);
          set(c.side === 0 ? 1 : 0, near.slot, "tackle", k, angleTo(pos(c.side === 0 ? 1 : 0, near.slot)!, cp));
        }
      }
      break;
    }
    case "kick":
    case "dropGoal":
    case "penaltyKick":
    case "conversion":
    case "kickoff":
    case "dropout": {
      if (!c) break;
      const face = angleTo(a.from, a.to);
      if (a.phase === "setup") set(c.side, c.slot, "idle", 0, face);
      else if (t < 0.4) set(c.side, c.slot, "kick", t / 0.4, face);
      break;
    }
    case "receive":
    case "contest": {
      const catcher = nearest(frame.players[att], a.to);
      if (catcher && catcher.d < 2 && t < 0.6) set(att, catcher.slot, a.kind === "contest" ? "jump" : "catch", Math.sin(Math.PI * clamp01(t / 0.6)));
      if (a.kind === "contest") {
        const rival = nearest(frame.players[def], a.to);
        if (rival && rival.d < 3 && t < 0.6) set(def, rival.slot, "jump", 0.8 * Math.sin(Math.PI * clamp01(t / 0.6)));
      }
      break;
    }
    case "try": {
      if (c) {
        if (a.phase === "done") set(c.side, c.slot, "celebrate", 1, attackAngle(c.side) + Math.PI);
        else if (live && t > 0.55) set(c.side, c.slot, "dive", (t - 0.55) / 0.45, attackAngle(c.side));
      }
      if (a.phase === "done" || t > 0.9)
        frame.players[att].forEach((p, i) => {
          if (p && (!c || i + 1 !== c.slot) && dist(p, ball) < 22) set(att, i + 1, "celebrate", 1, angleTo(p, ball));
        });
      break;
    }
    default:
      break;
  }
  return out;
}

/** Velocities from two successive frames (metres per second). */
export function velocitiesBetween(prev: Frame | undefined, next: Frame, dtMs: number): Velocities {
  const out: Velocities = [[], []];
  for (const side of [0, 1] as const)
    next.players[side].forEach((p, i) => {
      const q = prev?.players[side][i];
      out[side][i] = p && q && dtMs > 0 ? { x: ((p.x - q.x) * 1000) / dtMs, y: ((p.y - q.y) * 1000) / dtMs } : null;
    });
  return out;
}
