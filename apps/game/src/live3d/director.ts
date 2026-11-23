/**
 * TV direction of the 3D view (M7). Pure: from the frame shown it picks a camera shot, like a
 * rugby broadcast — the main camera high in the stand following play, a tighter low angle for
 * scrums, mauls and lineouts, the camera behind the kicker for shots at goal, a low angle at the
 * try line. It never looks at actions not shown yet.
 *
 * World coordinates (metres): X along the pitch (X = x − 50), Z across (Z = y − 35), Y up. The
 * main camera stands on the y = 70 touchline side (TV gantry above the low stand), so the pitch reads
 * left to right like the 2D view.
 */
import type { Frame } from "../live/renderer";

export type CameraMode = "tv" | "high" | "wide";
export type Vec3 = [number, number, number];

export interface Shot {
  /** Shot name: a change of shot between two "cut" shots is a cut, not a camera move. */
  name: "main" | "wide" | "high" | "tight" | "lineout" | "goalKick" | "tryLine";
  position: Vec3;
  target: Vec3;
  /** Vertical field of view (degrees). */
  fov: number;
}

/** Shots taken by another camera (a change to or from them is a cut). */
export const CUT_SHOTS: ReadonlySet<Shot["name"]> = new Set(["tight", "lineout", "goalKick", "tryLine"]);

export const toWorld = (x: number, y: number, h = 0): Vec3 => [x - 50, h, y - 35];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function shotFor(mode: CameraMode, frame: Frame): Shot {
  const b = frame.ball;
  const [bx, , bz] = toWorld(b.x, b.y);
  if (mode === "wide") return { name: "wide", position: [0, 62, 78], target: [0, 0, -3], fov: 44 };
  if (mode === "high") return { name: "high", position: [clamp(bx, -48, 48), 34, bz + 30], target: [clamp(bx, -50, 50), 0, bz - 6], fov: 46 };

  const a = frame.action;
  const main = (): Shot => {
    const lift = frame.height > 3 ? Math.min(10, frame.height) : 0;
    return { name: "main", position: [clamp(bx * 0.9, -46, 46), 19 + lift * 0.5, 57], target: [clamp(bx, -54, 54), lift * 0.45, bz * 0.5 - 1], fov: lift > 0 ? 27 : 21 };
  };
  if (!a) return main();
  const d = a.side === 0 ? 1 : -1;
  // Cut to a set-piece camera once the players are (almost) in place.
  const settled = a.phase === "action" || (a.phase === "setup" && a.t > 0.55);
  switch (a.kind) {
    case "scrum":
    case "maul":
      if (settled) return { name: "tight", position: [bx - d * 6, 6.5, bz + 15], target: [bx, 0.7, bz], fov: 38 };
      break;
    case "lineout": {
      if (!settled) break;
      const [, , tz] = toWorld(a.from.x, a.from.y);
      const toward = tz < 0 ? 1 : -1; // from the field towards the touchline
      return { name: "lineout", position: [bx - d * 13, 7.5, tz + toward * 24], target: [bx, 2.2, tz + toward * 8], fov: 40 };
    }
    case "conversion":
    case "dropGoal":
    case "penaltyKick": {
      const goal = a.kind !== "penaltyKick" || a.detail === "goal";
      if (!goal || a.phase === "done") break;
      const [tx, , tz] = toWorld(a.from.x, a.from.y);
      const postX = a.side === 0 ? 50 : -50;
      const dx = postX - tx;
      const dz = 0 - tz;
      const len = Math.hypot(dx, dz) || 1;
      return { name: "goalKick", position: [tx - (dx / len) * 9, 2.8, tz - (dz / len) * 9], target: [postX, 4.5, 0], fov: 30 };
    }
    case "try": {
      if (a.phase === "action" && a.t < 0.35) break;
      const lineX = a.side === 0 ? 50 : -50;
      return { name: "tryLine", position: [lineX - d * 17, 4.5, bz + (bz > 20 ? -18 : 20)], target: [lineX - d * 2, 1.2, bz], fov: 34 };
    }
    default:
      break;
  }
  return main();
}
