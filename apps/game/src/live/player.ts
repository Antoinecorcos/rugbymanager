/**
 * Playback of the live match: queues the actions received from the worker, animates them on the
 * pitch (or skips them in the highlight modes) and tells the screen what has been shown.
 */
import { lineupAfter, stepPoses, type LiveChunk, type LiveSnapshot, type Lineup, type MatchEvent, type PlayStep, type StepPoses, type Vec } from "@ovalie/engine";
import type { Frame } from "./renderer";
import { clockAt, isHighlight, LEAD_UP, smooth, stepTiming, type ViewMode } from "./timeline";

export interface PlaybackView {
  /** Index (in the global step list) of the last action fully shown. */
  shownStep: number;
  clock: number;
  period: number;
  score: [number, number];
  /** Number of events shown (global index). */
  shownEvents: number;
  /** Latest statistics snapshot that does not reveal unseen actions. */
  snapshot: LiveSnapshot | null;
  /** Lineup currently on the pitch (player ids per slot). */
  lineup: Lineup;
  /** Every received action has been shown. */
  caughtUp: boolean;
}

type Players = [(Vec | null)[], (Vec | null)[]];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const lerpPlayers = (a: Players, b: Players, t: number): Players =>
  [0, 1].map((s) => b[s as 0 | 1].map((q, i) => (q && a[s as 0 | 1][i] ? lerpVec(a[s as 0 | 1][i]!, q, t) : q))) as Players;

export class LivePlayer {
  readonly steps: PlayStep[] = [];
  readonly events: MatchEvent[] = [];
  /** Snapshot to apply once a given step has been shown (index → snapshot). */
  private snapshots: { after: number; snapshot: LiveSnapshot }[] = [];
  private lineup: Lineup = [[], []];
  private cursor = 0;
  private phase: "setup" | "action" = "setup";
  private elapsed = 0;
  private current: { poses: StepPoses; start: Players; startBall: Vec; timing: { setup: number; action: number }; lineup: Lineup } | null = null;
  private lastPlayers: Players = [[], []];
  private lastBall: Vec = { x: 50, y: 35 };
  mode: ViewMode = "extended";
  speed = 1;
  paused = false;
  view: PlaybackView = { shownStep: -1, clock: 0, period: 1, score: [0, 0], shownEvents: 0, snapshot: null, lineup: [[], []], caughtUp: true };
  /** The source has no more actions to give until something happens (decision, end). */
  sourceDone = false;
  private listeners = new Set<() => void>();
  private frame: Frame = { players: [[], []], ball: { x: 50, y: 35 }, height: 0 };

  constructor(initial: LiveSnapshot) {
    this.view.snapshot = initial;
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  push(chunk: LiveChunk): void {
    chunk.events.forEach((e, k) => (this.events[chunk.eventOffset + k] = e));
    for (const s of chunk.steps) this.steps.push(s);
    this.snapshots.push({ after: this.steps.length - 1, snapshot: chunk.snapshot });
    this.view = { ...this.view, caughtUp: this.cursor >= this.steps.length };
  }

  /** Actions received but not shown yet. */
  get backlog(): number {
    return this.steps.length - this.cursor;
  }

  currentFrame(): Frame {
    return this.frame;
  }

  private event = (i: number): MatchEvent | undefined => this.events[i];

  /** Should step `i` be animated in the current mode? (needs LEAD_UP actions of look-ahead). */
  private shouldAnimate(i: number): boolean {
    if (this.mode === "full") return true;
    if (this.mode === "result") return false;
    for (let j = i; j <= i + LEAD_UP && j < this.steps.length; j++) if (isHighlight(this.steps[j]!, this.event, this.mode)) return true;
    return false;
  }

  /** Enough look-ahead to decide, or the source cannot give more. */
  private canDecide(i: number): boolean {
    return this.mode === "full" || this.sourceDone || i + LEAD_UP < this.steps.length;
  }

  /** Advances the playback by `ms` of real time. */
  tick(ms: number): void {
    if (this.paused) return;
    let budget = ms;
    let skipped = 0;
    while (budget > 0 || skipped > 0) {
      if (!this.current) {
        if (this.cursor >= this.steps.length || !this.canDecide(this.cursor)) break;
        if (!this.shouldAnimate(this.cursor)) {
          this.skip();
          skipped++;
          if (skipped > 400) break;
          continue;
        }
        this.begin();
      }
      skipped = 0;
      const c = this.current!;
      const total = this.phase === "setup" ? c.timing.setup : c.timing.action;
      const left = total - this.elapsed;
      if (budget < left) {
        this.elapsed += budget;
        budget = 0;
        this.draw();
        break;
      }
      budget -= left;
      if (this.phase === "setup") {
        this.phase = "action";
        this.elapsed = 0;
        continue;
      }
      this.elapsed = total;
      this.draw();
      this.complete();
    }
    if (skipped > 0) this.notify();
  }

  private poses(i: number, lineup: Lineup): StepPoses {
    return stepPoses(this.steps[i]!, lineup, i);
  }

  private begin(): void {
    const i = this.cursor;
    const step = this.steps[i]!;
    const lineup = lineupAfter(this.lineup, step);
    const poses = this.poses(i, lineup);
    const timing = stepTiming(step, this.speed);
    const start: Players = this.lastPlayers[0].length ? this.lastPlayers : (poses.setup ?? poses.end).players;
    this.current = { poses, start, startBall: this.lastBall, timing, lineup };
    this.phase = poses.setup && timing.setup > 0 ? "setup" : "action";
    this.elapsed = 0;
    if (this.lineup !== lineup) {
      this.lineup = lineup;
      this.view = { ...this.view, lineup };
      this.notify();
    }
  }

  /** Jumps over an action (highlight modes): positions snap to its end. */
  private skip(): void {
    const i = this.cursor;
    const step = this.steps[i]!;
    this.lineup = lineupAfter(this.lineup, step);
    const poses = this.poses(i, this.lineup);
    this.lastPlayers = poses.end.players;
    this.lastBall = poses.end.ball;
    this.frame = { players: poses.end.players, ball: poses.end.ball, height: 0 };
    this.finishStep(i);
  }

  private draw(): void {
    const c = this.current!;
    const { poses } = c;
    const total = this.phase === "setup" ? c.timing.setup : c.timing.action;
    const t = total > 0 ? Math.min(1, this.elapsed / total) : 1;
    if (this.phase === "setup") {
      const s = smooth(t);
      this.frame = { players: lerpPlayers(c.start, poses.setup!.players, s), ball: lerpVec(c.startBall, poses.ball.from, s), height: 0 };
    } else {
      const from = poses.setup?.players ?? c.start;
      const s = smooth(t);
      const players = lerpPlayers(from, poses.end.players, s);
      const b = poses.ball;
      let ball: Vec;
      if (b.via) ball = t < 0.35 ? lerpVec(b.from, b.via, smooth(t / 0.35)) : lerpVec(b.via, b.to, smooth((t - 0.35) / 0.65));
      else ball = lerpVec(b.from, b.to, poses.inAir ? t : s);
      const height = poses.inAir ? 4 * b.height * t * (1 - t) : 0;
      // The ball carrier runs with the ball; a kicker stays on his spot while the ball flies.
      if (poses.carrier) {
        const list = players[poses.carrier.side];
        if (list[poses.carrier.slot - 1]) list[poses.carrier.slot - 1] = poses.inAir ? lerpVec(b.from, poses.end.players[poses.carrier.side][poses.carrier.slot - 1] ?? b.from, smooth(Math.max(0, t - 0.25) / 0.75)) : ball;
      }
      this.frame = poses.carrier ? { players, ball, height, carrier: poses.carrier } : { players, ball, height };
    }
    const step = this.steps[this.cursor]!;
    const fullT = this.phase === "setup" ? 0 : t;
    const clock = clockAt(step, fullT);
    if (Math.floor(clock) !== Math.floor(this.view.clock)) {
      this.view = { ...this.view, clock, period: step.period };
      this.notify();
    }
  }

  private complete(): void {
    const c = this.current!;
    this.lastPlayers = c.poses.end.players;
    this.lastBall = c.poses.end.ball;
    this.current = null;
    this.finishStep(this.cursor);
    this.notify();
  }

  private finishStep(i: number): void {
    const step = this.steps[i]!;
    this.cursor = i + 1;
    let snapshot = this.view.snapshot;
    while (this.snapshots.length && this.snapshots[0]!.after <= i) snapshot = this.snapshots.shift()!.snapshot;
    this.view = {
      shownStep: i,
      clock: step.t + step.dur,
      period: step.period,
      score: step.score,
      shownEvents: step.ev[1],
      snapshot,
      lineup: this.lineup,
      caughtUp: this.cursor >= this.steps.length,
    };
  }

  /** Shows everything received at once (e.g. "Sans images", or before a decision). */
  flush(): void {
    while (this.cursor < this.steps.length) {
      this.current = null;
      this.skip();
    }
    this.notify();
  }
}
