/**
 * Smooth movement of the players in the 3D view (M8). The playback gives a target position per
 * frame, eased action by action, so every player stopped at the end of each action and set off
 * again at the next one. Each player now follows his target with a critically damped spring: he
 * keeps his momentum from one action to the next, never overshoots, and jumps only when the target
 * is far away (highlights that skip actions, a substitution).
 */

export interface Follower {
  x: number;
  y: number;
  vx: number;
  vy: number;
  placed: boolean;
}

export const newFollower = (): Follower => ({ x: 0, y: 0, vx: 0, vy: 0, placed: false });

/** One axis of a critically damped spring (exact for constant targets, stable for any dt). */
export function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number): [number, number] {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * exp, (velocity - omega * temp) * exp];
}

/** Moves a follower towards a target (metres, seconds). Teleports beyond `snap` metres. */
export function follow(f: Follower, tx: number, ty: number, smoothTime: number, dt: number, snap = 14): void {
  if (!f.placed || Math.hypot(tx - f.x, ty - f.y) > snap) {
    Object.assign(f, { x: tx, y: ty, vx: 0, vy: 0, placed: true });
    return;
  }
  [f.x, f.vx] = smoothDamp(f.x, tx, f.vx, smoothTime, dt);
  [f.y, f.vy] = smoothDamp(f.y, ty, f.vy, smoothTime, dt);
}
