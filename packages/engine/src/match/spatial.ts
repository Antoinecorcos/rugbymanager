/**
 * Spatial layer (M5, reused by the 3D view in M7): turns each play-by-play step into plausible
 * positions for the 30 players and the ball. It only *illustrates* the simulation — it never
 * feeds back into it — and is fully deterministic (no random numbers, jitter from a hash).
 *
 * Coordinates: x = metres from the home try line (0..100, in-goals down to -10 / up to 110),
 * y = metres from the left touchline (0..70). The home side (0) attacks towards x = 100.
 */
import type { PlayStep, Side } from "./types.js";

export interface Vec {
  x: number;
  y: number;
}

/** Positions of the 15 shirt slots of each team (null = slot empty: sin-bin, red card…). */
export interface Pose {
  players: [(Vec | null)[], (Vec | null)[]];
  ball: Vec;
}

/** A player of one side, by shirt slot (1..15). */
export interface SlotRef {
  side: Side;
  slot: number;
}

/**
 * Who does what at a tackle and a ruck (World Rugby law 15): the tackled player on the ground
 * places the ball back, the tackler rolls away, the first defender on his feet over the ball
 * contests it (jackal), the first attackers clean him out, and the scrum-half plays the ball
 * from the base of the ruck.
 */
export interface BreakdownRoles {
  tackled?: SlotRef;
  tackler?: SlotRef;
  cleaners: SlotRef[];
  jackal?: SlotRef;
  scrumHalf?: SlotRef;
  /** Ruck: fast, normal, slow, turnover or penalty. */
  outcome?: string;
  /** Carry: the tackler was beaten (line break, defender beaten). */
  missedTackle?: boolean;
}

/** Positions of some players at a moment inside the action (the others go straight to the end). */
export interface MidPose {
  /** Share of the action (0..1) when these positions are reached. */
  at: number;
  players: [(Vec | null)[], (Vec | null)[]];
}

export interface StepPoses {
  /** Formation taken during the dead time before the action (set pieces, restarts). */
  setup?: Pose;
  /** Intermediate positions of the players who move twice (ruck: the jackal arrives, then is cleaned out). */
  mid?: MidPose;
  /** Tackle and ruck roles (carry, ruck). */
  roles?: BreakdownRoles;
  /** Positions when the action ends. */
  end: Pose;
  /** Ball flight / run: from → (via) → to, with the apex height in metres (0 = on the ground / in hand). */
  ball: { from: Vec; to: Vec; via?: Vec; height: number };
  /** Player holding / kicking the ball during the action (follows the ball while it is carried). */
  carrier?: { side: Side; slot: number };
  /** The ball travels in the air (kick) rather than in hand. */
  inAir: boolean;
}

export type Lineup = [(string | null)[], (string | null)[]];

const X_MIN = -9;
const X_MAX = 109;
const Y_MIN = 1.2;
const Y_MAX = 68.8;

const clampX = (x: number) => Math.max(X_MIN, Math.min(X_MAX, x));
const clampY = (y: number) => Math.max(Y_MIN, Math.min(Y_MAX, y));
const v = (x: number, y: number): Vec => ({ x: clampX(x), y: clampY(y) });

/** Deterministic pseudo-random value in [-1, 1] from integers. */
function jitter(a: number, b: number, c: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const dirOf = (side: Side) => (side === 0 ? 1 : -1);
const otherSide = (s: Side): Side => (s === 0 ? 1 : 0);

/** Height of the apex of a kick, by kick type. */
const KICK_HEIGHT: Record<string, number> = {
  box: 17,
  upAndUnder: 21,
  long: 15,
  touch: 11,
  fiftyTwentyTwo: 9,
  grubber: 0.4,
  chip: 7,
  crossfield: 13,
  kickoff: 16,
  dropout: 15,
  goal: 11,
  dropGoal: 9,
};

type Slots = (Vec | null)[];

/** Half the gap between the uprights (5.6 m apart) and the height of the crossbar (metres). */
export const POSTS_HALF_WIDTH = 2.8;
export const CROSSBAR_HEIGHT = 3;

/**
 * Flight of a kick at goal, aimed from the outcome the engine recorded: through the middle of
 * the posts and over the bar when it went over; wide of an upright when it missed, or short of
 * the line from far out. Deterministic (hash of the step index), it never draws a number.
 * The ball flies in a straight line in the pitch plane: `to` is set beyond the line so that it
 * crosses the line at the aimed point, high enough to clear the bar.
 */
export function goalKickFlight(att: Side, tee: Vec, made: boolean | undefined, seed: number, apex: number): { to: Vec; height: number; crossY: number; short: boolean } {
  const d = dirOf(att);
  const line = att === 0 ? 100 : 0;
  const dist = Math.max(1, Math.abs(line - tee.x));
  if (made === false && dist > 38 && jitter(seed, 31, 1) > 0.2) {
    // Not enough distance: the ball comes down in front of the posts.
    const crossY = 35 + jitter(seed, 31, 2) * 2;
    const k = (dist - 2 - Math.abs(jitter(seed, 31, 3)) * 5) / dist;
    return { to: v(tee.x + (line - tee.x) * k, tee.y + (crossY - tee.y) * k), height: apex * 0.8, crossY, short: true };
  }
  const crossY =
    made === false
      ? 35 + (jitter(seed, 31, 4) >= 0 ? 1 : -1) * (POSTS_HALF_WIDTH + 0.8 + Math.abs(jitter(seed, 31, 5)) * 3)
      : 35 + (made ? jitter(seed, 31, 6) * (POSTS_HALF_WIDTH - 1.2) : 0);
  // The ball carries on about 9 m beyond the line before coming down.
  const len = Math.hypot(line - tee.x, crossY - tee.y);
  const k = (len + 9) / len;
  // Height when crossing the line: at least 4.5 m, above the bar.
  const at = 1 / k;
  const height = Math.max(apex, 4.5 / (4 * at * (1 - at)));
  return { to: v(tee.x + (line - tee.x) * k, tee.y + (crossY - tee.y) * k), height, crossY, short: false };
}


/** Puts each shirt slot (1..15) at a position, hiding the empty slots of the lineup. */
function place(lineup: (string | null)[], at: (shirt: number) => Vec): Slots {
  const out: Slots = [];
  for (let shirt = 1; shirt <= 15; shirt++) out.push(lineup[shirt - 1] ? at(shirt) : null);
  return out;
}

/** Open side: the wider side of the field from the ball. */
const openSign = (y: number) => (y < 35 ? 1 : -1);

/** Attacking shape around a breakdown at `b`. `ruck`: two forwards bound over the ball. */
function attackShape(side: Side, b: Vec, ruck: boolean, seed: number, lineup: (string | null)[]): Slots {
  const d = dirOf(side);
  const o = openSign(b.y);
  const space = o > 0 ? Y_MAX - b.y : b.y - Y_MIN;
  const s = Math.min(1, space / 40); // compress the backline near a touchline
  const openWing = o > 0 ? 14 : 11;
  const blindWing = o > 0 ? 11 : 14;
  const pos: Record<number, [number, number]> = {
    9: [-1.6, 0.6 * o],
    // Pods: 1-3-3-1 shape.
    1: ruck ? [-0.7, -0.8] : [-3.2, o * 6.5],
    3: ruck ? [-0.7, 0.8] : [-3.4, o * 8],
    2: [-3.6, o * 9.5],
    4: [-4, o * 16 * s],
    5: [-4.2, o * 17.5 * s],
    6: [-3, -o * 5],
    7: [-4.4, o * 19 * s],
    8: [-3.2, -o * 7],
    10: [-6.5, o * 10 * s],
    12: [-8, o * 16 * s],
    13: [-9.5, o * 23 * s],
    [openWing]: [-10.5, o * 31 * s],
    [blindWing]: [-8, -o * Math.min(14, (o > 0 ? b.y - Y_MIN : Y_MAX - b.y) - 2)],
    15: [-14, o * 18 * s],
  };
  return place(lineup, (shirt) => {
    const [dx, dy] = pos[shirt]!;
    return v(b.x + d * dx + jitter(seed, shirt, 1) * 0.6, b.y + dy + jitter(seed, shirt, 2) * 0.8);
  });
}

/** Defensive line facing an attack at `b` (attacking side `att`). Low organisation = a ragged line. */
function defenceShape(att: Side, b: Vec, org: number, seed: number, lineup: (string | null)[], rush = false): Slots {
  const d = dirOf(att); // the defence stands on the +d side of the ball
  const o = openSign(b.y);
  const openSpace = o > 0 ? Y_MAX - b.y : b.y - Y_MIN;
  const blindSpace = o > 0 ? b.y - Y_MIN : Y_MAX - b.y;
  const openOrder = [2, 4, 6, 10, 12, 13, o > 0 ? 14 : 11];
  const blindAll = [5, 7, 8, o > 0 ? 11 : 14];
  // Near a touchline there is no room on the blind side: those defenders form a second line.
  const blindRoom = Math.max(0, Math.min(blindAll.length, Math.floor((blindSpace - 2) / 3.5)));
  const blindOrder = blindAll.slice(0, blindRoom);
  const cover = blindAll.slice(blindRoom);
  const gapOpen = Math.min(4.8, (openSpace - 2) / openOrder.length);
  const gapBlind = blindRoom ? Math.min(4.5, (blindSpace - 2) / blindRoom) : 0;
  const scatter = Math.max(0, 1 - org);
  const at: Record<number, [number, number]> = {
    1: [1.2, -o * 1.6],
    3: [1.2, o * 1.6],
    9: [4.5, o * 3],
    // Fullback deeper when the attack is still in its own half (kick threat).
    15: [(att === 0 ? b.x : 100 - b.x) < 50 ? 22 : 13, o * 7],
  };
  openOrder.forEach((shirt, k) => (at[shirt] = [1.5 + (rush ? -Math.min(2.2, k * 0.45) : k * 0.25), o * (3.5 + gapOpen * (k + 1))]));
  blindOrder.forEach((shirt, k) => (at[shirt] = [1.5 + k * 0.3, -o * Math.min(blindSpace - 1, 2.5 + gapBlind * (k + 1))]));
  cover.forEach((shirt, k) => (at[shirt] = [6 + k * 2.5, o * (6 + k * gapOpen * 2.2)]));
  return place(lineup, (shirt) => {
    const [dx, dy] = at[shirt]!;
    // Disorganised defence: players trail behind and leave gaps.
    const lag = scatter * (4 + 6 * Math.abs(jitter(seed, shirt, 3)));
    return v(b.x + d * (dx + lag) + jitter(seed, shirt, 4) * 0.5, b.y + dy + jitter(seed, shirt, 5) * (0.8 + scatter * 4));
  });
}

/** Team spread to field a kick landing at `l`. */
function receiveShape(side: Side, l: Vec, seed: number, lineup: (string | null)[], catcherSlot?: number): Slots {
  const d = dirOf(side); // receiving side attacks towards +d, so its own half is on the -d side
  return place(lineup, (shirt) => {
    if (shirt === catcherSlot) return v(l.x, l.y);
    const back = shirt >= 9;
    const k = shirt * 7.3;
    return v(l.x - d * (back ? 2 + (shirt % 3) * 4 : -6 - (shirt % 4) * 3) + jitter(seed, shirt, 6) * 3, l.y + ((k % 50) - 25) * (back ? 1 : 0.8) + jitter(seed, shirt, 7) * 3);
  });
}

/** Kick chase: a line a few metres short of the landing spot. */
function chaseShape(side: Side, l: Vec, seed: number, lineup: (string | null)[], depth = 6, chaserSlot?: number): Slots {
  const d = dirOf(side);
  return place(lineup, (shirt) => {
    if (shirt === chaserSlot) return v(l.x - d * 1, l.y + 0.8);
    const y = Y_MIN + 3 + ((shirt * 4.6) % 63);
    const behind = shirt === 9 || shirt === 10 || shirt === 15 ? 12 : 0;
    return v(l.x - d * (depth + behind + Math.abs(jitter(seed, shirt, 8)) * 4), y + jitter(seed, shirt, 9) * 2);
  });
}

function scrumShape(side: Side, b: Vec, feeding: boolean, lineup: (string | null)[]): Slots {
  const d = dirOf(side);
  const o = openSign(b.y);
  const sgn = side === 0 ? 1 : -1; // loosehead on the left of each pack
  const pack: Record<number, [number, number]> = {
    1: [-0.6, -1.1 * sgn],
    2: [-0.6, 0],
    3: [-0.6, 1.1 * sgn],
    4: [-1.8, -0.55 * sgn],
    5: [-1.8, 0.55 * sgn],
    6: [-1.6, -1.8 * sgn],
    7: [-1.6, 1.8 * sgn],
    8: [-2.8, 0],
    9: feeding ? [-0.4, -2.6 * o] : [0.2, -2.6 * o],
    10: [-8, o * 7],
    12: [-8.5, o * 13],
    13: [-9, o * 19],
    [o > 0 ? 14 : 11]: [-9.5, o * 27],
    [o > 0 ? 11 : 14]: [-8.5, -o * 10],
    15: [-16, o * 9],
  };
  return place(lineup, (shirt) => {
    const [dx, dy] = pack[shirt]!;
    return v(b.x + d * dx, b.y + dy);
  });
}

function lineoutShape(side: Side, throwing: boolean, b: Vec, lineup: (string | null)[]): Slots {
  const d = dirOf(side);
  const touch = b.y < 35 ? 0 : 70;
  const s = touch === 0 ? 1 : -1;
  const order = [1, 4, 3, 5, 6, 8, 7];
  const at: Record<number, [number, number]> = {};
  order.forEach((shirt, i) => (at[shirt] = [-0.6, s * (6 + i * 1.4)]));
  at[2] = throwing ? [0, 0] : [-2, s * 3];
  at[9] = [-1.8, s * 17];
  at[10] = [-10, s * 21];
  at[12] = [-10.5, s * 27];
  at[13] = [-11, s * 33];
  at[touch === 0 ? 14 : 11] = [-11.5, s * 44];
  at[touch === 0 ? 11 : 14] = [-12, s * 4];
  at[15] = [-19, s * 34];
  return place(lineup, (shirt) => {
    const [dx, dy] = at[shirt]!;
    return v(b.x + d * dx, touch + s * Math.abs(dy));
  });
}

/** Forwards bound in a maul around `b`; backs in line behind. */
function maulShape(side: Side, attacking: boolean, b: Vec, seed: number, lineup: (string | null)[]): Slots {
  const d = dirOf(side);
  const base = attacking ? attackShape(side, b, false, seed, lineup) : defenceShape(otherSide(side), b, 0.9, seed, lineup);
  return base.map((p, i) => {
    const shirt = i + 1;
    if (!p || shirt > 8) return p;
    const row = Math.floor((shirt - 1) / 3);
    return v(b.x - d * (attacking ? 0.6 + row * 0.9 : -0.6 - row * 0.9), b.y + (((shirt - 1) % 3) - 1) * 0.9 + jitter(seed, shirt, 10) * 0.3);
  });
}

/** Kick-off alignment: kickers on halfway, receivers spread in their half. */
function kickoffSetup(kicking: Side, lineup: Lineup, b: Vec): Pose {
  const dk = dirOf(kicking);
  const kick = place(lineup[kicking], (shirt) => (shirt === 10 ? v(b.x - dk * 1.5, b.y) : v(b.x - dk * 0.5, Y_MIN + 3 + ((shirt * 4.6) % 63))));
  const recv = otherSide(kicking);
  const rec = place(lineup[recv], (shirt) => {
    const fwd = shirt <= 8;
    return v(b.x + dk * (fwd ? 14 + (shirt % 3) * 4 : 32 + (shirt % 3) * 7), Y_MIN + 6 + ((shirt * 7.7) % 57));
  });
  const players: [Slots, Slots] = kicking === 0 ? [kick, rec] : [rec, kick];
  return { players, ball: b };
}

/** Penalty: attackers around the mark, defenders retreated 10 metres. */
function penaltyShape(att: Side, b: Vec, seed: number, lineup: Lineup): Pose {
  const d = dirOf(att);
  const a = place(lineup[att], (shirt) => v(b.x - d * (2 + (shirt % 5) * 1.5), b.y + ((shirt * 9.1) % 30) - 15 + jitter(seed, shirt, 11)));
  const def = defenceShape(att, v(b.x + d * 9, b.y), 1, seed, lineup[otherSide(att)]);
  return { players: att === 0 ? [a, def] : [def, a], ball: b };
}

/** Goal kick (conversion / penalty): kicker at the tee, teammates behind, opponents under the posts or behind the kicker. */
function goalKickSetup(att: Side, tee: Vec, kickerSlot: number | undefined, lineup: Lineup, conversion: boolean): Pose {
  const d = dirOf(att);
  const line = att === 0 ? 100 : 0;
  const a = place(lineup[att], (shirt) => (shirt === kickerSlot ? v(tee.x - d * 1.2, tee.y) : v(tee.x - d * (8 + (shirt % 4) * 2), 10 + ((shirt * 4.1) % 50))));
  const def = place(lineup[otherSide(att)], (shirt) =>
    conversion ? v(line + d * 2, 18 + ((shirt * 2.3) % 34)) : v(tee.x + d * (10 + (shirt % 5) * 3), 8 + ((shirt * 4.3) % 54)),
  );
  return { players: att === 0 ? [a, def] : [def, a], ball: tee };
}

/** Try: the scorer in the in-goal, team-mates running to him, defenders behind the line. */
function tryShape(att: Side, b: Vec, scorer: number | undefined, seed: number, lineup: Lineup): Pose {
  const d = dirOf(att);
  const line = att === 0 ? 100 : 0;
  const a = place(lineup[att], (shirt) => (shirt === scorer ? v(b.x, b.y) : v(b.x - d * (3 + Math.abs(jitter(seed, shirt, 12)) * 9), b.y + jitter(seed, shirt, 13) * 12)));
  const def = place(lineup[otherSide(att)], (shirt) => v(line + d * (1 + Math.abs(jitter(seed, shirt, 14)) * 3), 22 + ((shirt * 1.8) % 26)));
  return { players: att === 0 ? [a, def] : [def, a], ball: b };
}

const slotOf = (lineup: (string | null)[], id: string | undefined): number | undefined => {
  if (!id) return undefined;
  const i = lineup.indexOf(id);
  return i >= 0 ? i + 1 : undefined;
};

const both = (att: Side, a: Slots, d: Slots): [Slots, Slots] => (att === 0 ? [a, d] : [d, a]);

/**
 * Poses of a play step. `lineup` = players on the field (shirt slots 1..15) at that moment.
 * `index` is any integer specific to the step (its index in the trace) to vary the jitter.
 */
export function stepPoses(step: PlayStep, lineup: Lineup, index: number): StepPoses {
  const att = step.side;
  const def = otherSide(att);
  const d = dirOf(att);
  const from = v(step.from[0], step.from[1]);
  const to = v(step.to[0], step.to[1]);
  const seed = index;
  const carrierSlot = slotOf(lineup[att], step.playerId);
  const carrier = carrierSlot ? { side: att, slot: carrierSlot } : undefined;
  const withCarrier = (r: StepPoses): StepPoses => (carrier && !r.carrier ? { ...r, carrier } : r);
  const ground = (f: Vec, t: Vec, via?: Vec) => (via ? { from: f, to: t, via, height: 0 } : { from: f, to: t, height: 0 });

  switch (step.kind) {
    case "carry": {
      const wide = step.detail?.startsWith("wide");
      const a = attackShape(att, to, false, seed, lineup[att]);
      if (carrierSlot) a[carrierSlot - 1] = to;
      const df = defenceShape(att, to, step.defOrg, seed, lineup[def], false);
      // The tackler meets the carrier at the end of the carry.
      const tacklerSlot = slotOf(lineup[def], step.tackler);
      // Carry outcome (close/wide:break|beat|dominant|tackle): beaten defenders are left behind.
      const missed = /:(break|beat)$/.test(step.detail ?? "");
      if (tacklerSlot) df[tacklerSlot - 1] = missed ? v(to.x - d * 4, to.y + 1.3) : v(to.x + d * 0.75, to.y + 0.35);
      const via = wide ? v(from.x - d * 4, to.y) : undefined;
      const roles: BreakdownRoles = { cleaners: [], ...(carrier && !missed ? { tackled: carrier } : {}), ...(tacklerSlot ? { tackler: { side: def, slot: tacklerSlot } } : {}) };
      if (missed) roles.missedTackle = true;
      return withCarrier({ end: { players: both(att, a, df), ball: to }, ball: ground(from, to, via), inAir: false, roles });
    }
    case "ruck":
      return ruckPoses(step, lineup, seed, from, to, carrierSlot);
    case "tap":
    case "interception": {
      const a = attackShape(att, to, false, seed, lineup[att]);
      const df = defenceShape(att, to, step.defOrg, seed, lineup[def]);
      if (step.kind === "interception" && carrierSlot) a[carrierSlot - 1] = to;
      return withCarrier({ end: { players: both(att, a, df), ball: to }, ball: ground(from, to), inAir: false });
    }
    case "maul": {
      const a = maulShape(att, true, to, seed, lineup[att]);
      const df = maulShape(def, false, to, seed, lineup[def]);
      return { end: { players: both(att, a, df), ball: to }, ball: ground(from, to), inAir: false };
    }
    case "kick":
    case "dropGoal": {
      if (step.kind === "dropGoal") {
        const flight = goalKickFlight(att, from, step.made, seed, KICK_HEIGHT.dropGoal!);
        // Players follow up towards the posts (the in-field end of the flight).
        const toward = v(Math.max(1, Math.min(99, flight.to.x)), Math.max(2, Math.min(68, flight.to.y)));
        const a = chaseShape(att, toward, seed, lineup[att], 7);
        const df = receiveShape(def, toward, seed, lineup[def]);
        return withCarrier({ end: { players: both(att, a, df), ball: flight.to }, ball: { from, to: flight.to, height: flight.height }, inAir: true });
      }
      const type = step.detail ?? "long";
      const a = chaseShape(att, to, seed, lineup[att], type === "grubber" || type === "chip" ? 2 : 7);
      const df = receiveShape(def, to, seed, lineup[def]);
      return withCarrier({ end: { players: both(att, a, df), ball: to }, ball: { from, to, height: KICK_HEIGHT[type] ?? 12 }, inAir: true });
    }
    case "kickoff":
    case "dropout": {
      const setup = kickoffSetup(att, lineup, from);
      const a = chaseShape(att, to, seed, lineup[att], 3);
      const df = receiveShape(def, to, seed, lineup[def], 4);
      return withCarrier({ setup, end: { players: both(att, a, df), ball: to }, ball: { from, to, height: KICK_HEIGHT[step.kind] ?? 15 }, inAir: true });
    }
    case "contest":
    case "receive": {
      // `side` is the team that ends up with the ball.
      const a = receiveShape(att, to, seed, lineup[att], carrierSlot);
      const df = chaseShape(def, to, seed, lineup[def], step.kind === "contest" ? 1.5 : 8);
      return withCarrier({ end: { players: both(att, a, df), ball: to }, ball: ground(to, to), inAir: false });
    }
    case "scrum": {
      const a = scrumShape(att, to, true, lineup[att]);
      const df = scrumShape(def, to, false, lineup[def]);
      const pose: Pose = { players: both(att, a, df), ball: to };
      return { setup: pose, end: pose, ball: ground(to, to), inAir: false };
    }
    case "lineout": {
      const b = v(from.x, from.y);
      const a = lineoutShape(att, true, b, lineup[att]);
      const df = lineoutShape(def, false, b, lineup[def]);
      const setup: Pose = { players: both(att, a, df), ball: b };
      const catchAt = v(b.x, (b.y < 35 ? 0 : 70) + (b.y < 35 ? 1 : -1) * 10);
      return { setup, end: { players: setup.players, ball: catchAt }, ball: { from: b, to: catchAt, height: 4 }, inAir: true };
    }
    case "penalty": {
      const pose = penaltyShape(att, to, seed, lineup);
      return { end: pose, ball: ground(from, to), inAir: false };
    }
    case "penaltyKick": {
      if (step.detail === "goal") {
        const setup = goalKickSetup(att, from, carrierSlot, lineup, false);
        const flight = goalKickFlight(att, from, step.made, seed, KICK_HEIGHT.goal!);
        return withCarrier({ setup, end: { players: setup.players, ball: flight.to }, ball: { from, to: flight.to, height: flight.height }, inAir: true });
      }
      const setup = penaltyShape(att, from, seed, lineup);
      return withCarrier({ setup, end: { players: setup.players, ball: to }, ball: { from, to, height: KICK_HEIGHT.touch! }, inAir: true });
    }
    case "conversion": {
      const line = att === 0 ? 100 : 0;
      const angle = Math.abs(from.y - 35) / 35;
      const tee = v(line - d * (12 + angle * 14), from.y);
      const setup = goalKickSetup(att, tee, carrierSlot, lineup, true);
      const flight = goalKickFlight(att, tee, step.made, seed, KICK_HEIGHT.goal!);
      return withCarrier({ setup, end: { players: setup.players, ball: flight.to }, ball: { from: tee, to: flight.to, height: flight.height }, inAir: true });
    }
    case "try": {
      const spot = v(att === 0 ? 101.5 : -1.5, to.y);
      const pose = tryShape(att, spot, carrierSlot, seed, lineup);
      return withCarrier({ end: pose, ball: ground(from, spot), inAir: false });
    }
    case "break":
    default: {
      // Half-time / full-time: teams gather in their own half.
      const gather = (s: Side): Slots => place(lineup[s], (shirt) => v(50 - dirOf(s) * (8 + (shirt % 5) * 3), 20 + ((shirt * 2.1) % 30)));
      return { end: { players: [gather(0), gather(1)], ball: v(50, 35) }, ball: ground(from, v(50, 35)), inAir: false };
    }
  }
}

/** First slot of a list that is on the field and not excluded. */
const firstOf = (lineup: (string | null)[], prefs: number[], not: (number | undefined)[]): number | undefined =>
  prefs.find((s) => lineup[s - 1] && !not.includes(s));

/**
 * Ruck (law 15). The tackled player lies just ahead of the ball, which he has placed back towards
 * his team; the tackler rolls away. The first defender on his feet is over the ball (jackal) when
 * the first two attackers arrive: they drive over the ball and push him off — unless he wins the
 * ball (turnover, holding-on penalty). The scrum-half reaches the base of the ruck to play the ball;
 * the defence sets its line behind the offside line (hindmost point of the ruck).
 */
function ruckPoses(step: PlayStep, lineup: Lineup, seed: number, from: Vec, b: Vec, tackledSlot: number | undefined): StepPoses {
  const att = step.side;
  const def = otherSide(att);
  const d = dirOf(att);
  const o = openSign(b.y);
  const a = attackShape(att, b, false, seed, lineup[att]);
  const df = defenceShape(att, b, step.defOrg, seed, lineup[def]);
  const won = step.detail !== "turnover" && step.detail !== "penalty";
  const cleaners = (step.support ?? []).map((id) => slotOf(lineup[att], id)).filter((sl): sl is number => !!sl && sl !== tackledSlot);
  for (const sl of [6, 7, 8, 4, 5, 1, 3, 2]) {
    if (cleaners.length >= 2) break;
    if (lineup[att][sl - 1] && sl !== tackledSlot && !cleaners.includes(sl)) cleaners.push(sl);
  }
  const jackal = slotOf(lineup[def], step.contest) ?? firstOf(lineup[def], [7, 6, 8, 2], []);
  const nine = firstOf(lineup[att], [9, 10, 15], [tackledSlot, ...cleaners]);
  const midA: (Vec | null)[] = lineup[att].map(() => null);
  const midD: (Vec | null)[] = lineup[def].map(() => null);
  const set = (list: (Vec | null)[], slot: number | undefined, p: Vec) => {
    if (slot && lineup[list === a || list === midA ? att : def][slot - 1]) list[slot - 1] = p;
  };
  // Tackled player on the ground, ball placed behind him.
  set(a, tackledSlot, v(b.x + d * 0.8, b.y + 0.15));
  set(midA, tackledSlot, v(b.x + d * 0.8, b.y + 0.15));
  // Cleaners: arriving at the moment the jackal is on the ball, then driving over it.
  const [c1, c2] = cleaners;
  set(midA, c1, v(b.x - d * 0.7, b.y - 0.35));
  set(midA, c2, v(b.x - d * 1.6, b.y + 0.55));
  set(a, c1, v(b.x + d * (won ? 0.85 : 0.05), b.y - 0.3));
  set(a, c2, v(b.x + d * (won ? 0.45 : -0.35), b.y + 0.5));
  // Jackal: over the ball on his own side, then driven off (or he wins it).
  set(midD, jackal, v(b.x + d * 0.4, b.y));
  set(df, jackal, won ? v(b.x + d * 2.2, b.y + 0.9 * o) : v(b.x + d * 0.35, b.y + 0.1));
  // Tackler: on the ground beside the ball, rolling away, then back on his side.
  const tacklerSlot = slotOf(lineup[def], step.tackler);
  if (tacklerSlot && tacklerSlot !== jackal) {
    // He rolls clear to the side of the ruck before getting back on his feet.
    set(midD, tacklerSlot, v(b.x + d * 0.9, b.y - 1.9 * o));
    set(df, tacklerSlot, v(b.x + d * 2.4, b.y - 3 * o));
  }
  // Scrum-half: on his way, then at the base of the ruck.
  set(midA, nine, v(b.x - d * 3.5, b.y + 2 * o));
  set(a, nine, v(b.x - d * 0.9, b.y + 0.35 * o));
  // No other defender inside the ruck: the line stands behind the offside line.
  const offside = b.x + d * 1.4;
  df.forEach((p, i) => {
    if (!p || i + 1 === jackal || i + 1 === tacklerSlot) return;
    if ((p.x - offside) * d < 0) df[i] = v(offside + d * (0.4 + Math.abs(jackitter(seed, i))), p.y);
  });
  const roles: BreakdownRoles = { cleaners: cleaners.slice(0, 2).map((slot) => ({ side: att, slot })) };
  if (tackledSlot) roles.tackled = { side: att, slot: tackledSlot };
  if (jackal) roles.jackal = { side: def, slot: jackal };
  if (tacklerSlot && tacklerSlot !== jackal) roles.tackler = { side: def, slot: tacklerSlot };
  if (nine) roles.scrumHalf = { side: att, slot: nine };
  if (step.detail) roles.outcome = step.detail;
  return {
    end: { players: both(att, a, df), ball: b },
    mid: { at: 0.4, players: both(att, midA, midD) },
    ball: { from, to: b, height: 0 },
    inAir: false,
    roles,
  };
}

const jackitter = (seed: number, i: number) => jitter(seed, i + 1, 21) * 0.6;

/** Lineup after a step (steps carry the lineup only when it changes). */
export function lineupAfter(previous: Lineup, step: PlayStep): Lineup {
  return step.lineup ? [step.lineup[0].slice(), step.lineup[1].slice()] : previous;
}
