import type { AttributeKey } from "../domain/attributes.js";
import { TOP14_BONUS, type MatchSetup, type MatchTeam, type TargetedInstructions } from "../domain/match-setup.js";
import type { Player } from "../domain/player.js";
import type { Tactics } from "../domain/tactics.js";
import { isBackRow, isForward, isFrontRow, SHIRT_POSITION, type Position } from "../domain/positions.js";
import { clamp, Rng } from "../rng.js";
import { computeRatings } from "./ratings.js";
import {
  emptyTeamStats,
  other,
  type EventType,
  type LivePlayerState,
  type LiveSnapshot,
  type LiveTeamSnapshot,
  type MatchEvent,
  type PlayKind,
  type PlayStep,
  type MatchInjury,
  type MatchResult,
  type PenaltyDecisionRequest,
  type PenaltyOption,
  type PlayerMatchStats,
  type Side,
  type TeamStats,
} from "./types.js";

/* ------------------------------------------------------------------ */
/* Internal state                                                      */
/* ------------------------------------------------------------------ */

interface FieldPlayer {
  p: Player;
  shirt: number;
  /** Position currently played (slot position). */
  pos: Position;
  condition: number;
  /** Day form multiplier offset (≈ -0.06..0.06). */
  form: number;
  yellows: number;
  /** Start of the current stint on the field (null when off). */
  onAt: number | null;
  /** Seconds played in previous stints. */
  secs: number;
  everOn: boolean;
  started: boolean;
}

interface Binned {
  fp: FieldPlayer;
  slot: number;
  returnAt: number;
  kind: "yellow" | "red20" | "hia";
  /** For HIA: the temporary replacement. */
  temp?: FieldPlayer;
}

interface TeamState {
  side: Side;
  team: MatchTeam;
  slots: (FieldPlayer | null)[];
  bench: FieldPlayer[];
  all: Map<string, FieldPlayer>;
  binned: Binned[];
  stats: TeamStats;
  ps: Map<string, PlayerMatchStats>;
  /** Times of penalties conceded inside own 22 (repeated infringement → card). */
  pens22: number[];
  /** Planned substitution minute per bench player id. */
  subPlan: Map<string, number>;
  /** Bench player ids who already went off (cannot return, except front row/HIA rules). */
  replacedIds: Set<string>;
}

type RuckQuality = "fast" | "normal" | "slow";

type Restart =
  | { kind: "kickoff"; side: Side }
  | { kind: "openPlay"; side: Side; quality: RuckQuality; afterKick?: boolean }
  | { kind: "scrum"; side: Side; x: number }
  | { kind: "lineout"; side: Side; x: number }
  | { kind: "penalty"; side: Side; x: number; y: number }
  | { kind: "dropout22"; side: Side }
  | { kind: "dropoutGoalLine"; side: Side }
  | { kind: "conversion"; side: Side; y: number; scorerId: string };

/** Reasons the ball became dead. Some of them do not end a half when time is up. */
type DeadReason = "knockOn" | "touch" | "score" | "penalty" | "scrumAwarded" | "goalLineDropout" | "dropout22" | "other";

const HALF = 40 * 60;
/** From this clock time (seconds, second half) close games tighten. */
const LATE_GAME = 60 * 60;
/** Effort bonus of the side trailing by 1–12 points late in the game. */
const CLOSE_GAME_PUSH = 0.03;
const ET_HALF = 10 * 60;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Training unit of each attribute (team automatisms). */
const UNIT_OF: Partial<Record<AttributeKey, "setPiece" | "attack" | "defence" | "kicking">> = {
  scrummaging: "setPiece", lineoutThrowing: "setPiece", lineoutJumping: "setPiece", maul: "setPiece",
  passing: "attack", handling: "attack", offloading: "attack", footwork: "attack", vision: "attack",
  tackling: "defence", positioning: "defence", jackal: "defence", anticipation: "defence",
  kicking: "kicking", tacticalKicking: "kicking", goalKicking: "kicking", highBall: "kicking",
};

const weightScore = (kg: number) => clamp(1 + ((kg - 70) / 65) * 19, 1, 20);
const heightScore = (cm: number) => clamp(1 + ((cm - 172) / 38) * 19, 1, 20);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const CLOSE_CARRY_WEIGHTS: Partial<Record<Position, number>> = {
  N8: 3, BF: 2.2, OF: 1.6, LO: 1.6, LH: 1.3, TH: 1.3, HK: 1.4, IC: 1.0, SH: 0.25, FH: 0.15, OC: 0.4,
};
const WIDE_CARRY_WEIGHTS: Partial<Record<Position, number>> = {
  IC: 1.6, OC: 2.0, WG: 2.6, FB: 1.6, FH: 0.7, BF: 0.45, N8: 0.45, OF: 0.35, LO: 0.15, HK: 0.15,
};

export interface MatchOptions {
  /**
   * Synchronous handler for penalty decisions of human-controlled teams.
   * If absent, `step()` pauses and exposes `pendingDecision` (interactive mode),
   * while `run()` falls back to the staff recommendation.
   */
  decisionHandler?: (req: PenaltyDecisionRequest) => PenaltyOption;
  /** Records the play-by-play trace used by the live view (no effect on the simulation). */
  trace?: boolean;
}

export class MatchSimulation {
  readonly setup: MatchSetup;
  private rng: Rng;
  private teams: [TeamState, TeamState];
  private events: MatchEvent[] = [];
  private injuries: MatchInjury[] = [];
  private score: [number, number] = [0, 0];

  /** Absolute match clock in seconds. */
  private clock = 0;
  private period = 1;
  private periodEnd = HALF;
  private ballInPlay = 0;
  private finished = false;
  private next: Restart;
  /** Ball position (metres from home try line) and lateral position. */
  private x = 50;
  private y = 35;
  /** Defensive organisation of the defending team, 0..1. */
  private defOrg = 1;
  private phase = 0;
  /** Side that kicked off the match. */
  private firstKicker: Side;
  /** Possession bookkeeping for 22 entries. */
  private in22: [boolean, boolean] = [false, false];
  private entryScoreMark: [number, number] = [0, 0];
  private decidedBy: MatchResult["decidedBy"];

  pendingDecision: PenaltyDecisionRequest | null = null;
  private options: MatchOptions;

  /* Live view / coach controls. */
  private traceSteps: PlayStep[] = [];
  private cur: { step: PlayStep; ballInPlay: number } | null = null;
  private evCursor = 0;
  private lineupSig = "";
  private pendingSubs: { side: Side; offId: string; onId: string }[] = [];
  private autoSubs: [boolean, boolean] = [true, true];

  constructor(setup: MatchSetup, options: MatchOptions = {}) {
    this.setup = setup;
    this.options = options;
    this.rng = new Rng(setup.seed);
    this.teams = [this.initTeam(0, setup.home), this.initTeam(1, setup.away)];
    this.firstKicker = this.rng.chance(0.5) ? 0 : 1;
    this.next = { kind: "kickoff", side: this.firstKicker };
    this.emit("kickoff", { side: this.firstKicker, importance: 2, detail: { start: true } });
  }

  /* ------------------------------ Setup ----------------------------- */

  private initTeam(side: Side, team: MatchTeam): TeamState {
    if (team.players.length < 15) throw new Error(`${team.name}: at least 15 players required`);
    const mk = (p: Player, shirt: number, started: boolean): FieldPlayer => {
      const consistency = p.hidden.consistency;
      return {
        p,
        shirt,
        pos: SHIRT_POSITION[shirt] ?? bestPosition(p),
        condition: 100,
        form: clamp(this.rng.normal(0, 0.012 + (20 - consistency) * 0.0025), -0.08, 0.08),
        yellows: 0,
        onAt: started ? 0 : null,
        secs: 0,
        everOn: started,
        started,
      };
    };
    const slots: FieldPlayer[] = team.players.slice(0, 15).map((p, i) => mk(p, i + 1, true));
    const bench = team.players.slice(15, 23).map((p, i) => mk(p, 16 + i, false));
    const all = new Map<string, FieldPlayer>();
    const ps = new Map<string, PlayerMatchStats>();
    for (const fp of [...slots, ...bench]) {
      all.set(fp.p.id, fp);
      ps.set(fp.p.id, emptyPlayerStats(fp));
    }
    const ts: TeamState = {
      side,
      team,
      slots,
      bench,
      all,
      binned: [],
      stats: emptyTeamStats(),
      ps,
      pens22: [],
      subPlan: new Map(),
      replacedIds: new Set(),
    };
    this.planSubs(ts);
    return ts;
  }

  /** AI substitution plan: front row ~50', other forwards ~58', backs ~65'. */
  private planSubs(ts: TeamState): void {
    const forwardsOnBench = ts.bench.filter((b) => isForward(bestPosition(b.p))).length;
    const bomb = forwardsOnBench >= 6;
    for (const b of ts.bench) {
      const pos = bestPosition(b.p);
      let minute: number;
      if (isFrontRow(pos)) minute = (bomb ? 44 : 48) + this.rng.int(0, 8);
      else if (isForward(pos)) minute = (bomb ? 48 : 54) + this.rng.int(0, 10);
      else if (pos === "SH") minute = 58 + this.rng.int(0, 8);
      else minute = 60 + this.rng.int(0, 12);
      ts.subPlan.set(b.p.id, minute);
    }
  }

  /* ------------------------------ Public API ------------------------ */

  isFinished(): boolean {
    return this.finished;
  }

  /** Runs the whole match. Human decisions fall back to the handler or the recommendation. */
  run(): MatchResult {
    while (!this.finished) {
      if (this.pendingDecision) this.submitPenaltyDecision(this.pendingDecision.recommended);
      this.step();
    }
    return this.result();
  }

  /** Advances the simulation by one action. Returns new events produced. */
  step(): MatchEvent[] {
    if (this.finished || this.pendingDecision) return [];
    const before = this.events.length;
    this.processRestart(this.next);
    // The last action of a restart is complete: close it so that the trace matches the state.
    this.flushStep();
    return this.events.slice(before);
  }

  /** Resolves a pending human penalty decision. */
  submitPenaltyDecision(choice: PenaltyOption): MatchEvent[] {
    const req = this.pendingDecision;
    if (!req) return [];
    this.pendingDecision = null;
    const before = this.events.length;
    this.executePenalty(req, choice, true);
    this.flushStep();
    return this.events.slice(before);
  }

  getEvents(): readonly MatchEvent[] {
    return this.events;
  }

  getScore(): [number, number] {
    return [...this.score] as [number, number];
  }

  /* ------------------------------ Live control ---------------------- */

  /** Play-by-play steps recorded so far (with `options.trace`). */
  getTrace(): readonly PlayStep[] {
    return this.traceSteps;
  }

  getClock(): number {
    return this.clock;
  }

  getPeriod(): number {
    return this.period;
  }

  /** Changes a team's tactics from the next action on. */
  setTactics(side: Side, tactics: Tactics): void {
    const ts = this.teams[side];
    ts.team = { ...ts.team, tactics: { ...tactics } };
  }

  /** Changes a team's morale (0..1), e.g. after a half-time team talk. */
  setMorale(side: Side, morale: number): void {
    const ts = this.teams[side];
    ts.team = { ...ts.team, morale: clamp(morale, 0, 1) };
  }

  getMorale(side: Side): number {
    return this.teams[side].team.morale ?? 0.5;
  }

  /** Changes a team's targeted instructions from the next action on. */
  setTargets(side: Side, targets: TargetedInstructions | undefined): void {
    const ts = this.teams[side];
    const team: MatchTeam = { ...ts.team };
    if (targets && Object.values(targets).some((v) => v !== undefined && v !== false)) team.targets = { ...targets };
    else delete team.targets;
    ts.team = team;
  }

  /** Staff-planned substitutions on (default) or off (manual changes only; injuries are still covered). */
  setAutoSubstitutions(side: Side, on: boolean): void {
    this.autoSubs[side] = on;
  }

  /**
   * Asks for a substitution, made at the next stoppage. Returns an error message (French) when the
   * change is not allowed, null otherwise.
   */
  requestSubstitution(side: Side, offId: string, onId: string): string | null {
    const ts = this.teams[side];
    const on = ts.bench.find((b) => b.p.id === onId);
    if (!on || ts.replacedIds.has(onId)) return "Ce joueur n'est pas disponible sur le banc.";
    const off = this.onField(ts).find((fp) => fp.p.id === offId);
    if (!off) return "Ce joueur n'est pas sur le terrain.";
    const slot = ts.slots.indexOf(off);
    const pos = SHIRT_POSITION[slot + 1]!;
    if (isFrontRow(pos) && (on.p.positions[pos] ?? 1) < 10) return "Un poste de première ligne doit être tenu par un spécialiste.";
    if (this.pendingSubs.some((s) => s.side === side && (s.onId === onId || s.offId === offId))) return "Ce changement est déjà demandé.";
    this.pendingSubs.push({ side, offId, onId });
    return null;
  }

  cancelSubstitution(side: Side, onId: string): void {
    this.pendingSubs = this.pendingSubs.filter((s) => !(s.side === side && s.onId === onId));
  }

  /** State of the match for the live view: score, stats, players' condition and whereabouts. */
  snapshot(): LiveSnapshot {
    const team = (ts: TeamState): LiveTeamSnapshot => {
      const players: Record<string, LivePlayerState> = {};
      for (const fp of ts.all.values()) {
        const secs = fp.secs + (fp.onAt !== null ? this.clock - fp.onAt : 0);
        const slot = ts.slots.indexOf(fp);
        const bin = ts.binned.find((b) => b.fp === fp);
        let state: LivePlayerState["state"];
        if (slot >= 0) state = "field";
        else if (bin) state = "binned";
        else if (ts.bench.includes(fp) && !ts.replacedIds.has(fp.p.id)) state = "bench";
        else state = "off";
        const lp: LivePlayerState = { state, condition: Math.round(fp.condition), minutes: Math.floor(secs / 60), yellows: fp.yellows };
        if (slot >= 0) lp.slot = slot + 1;
        if (bin) {
          lp.returnAt = bin.returnAt;
          lp.binKind = bin.kind;
        }
        players[fp.p.id] = lp;
      }
      const snap: LiveTeamSnapshot = {
        stats: { ...ts.stats },
        tactics: { ...ts.team.tactics },
        autoSubs: this.autoSubs[ts.side],
        pendingSubs: this.pendingSubs.filter((p) => p.side === ts.side).map(({ offId, onId }) => ({ offId, onId })),
        players,
      };
      if (ts.team.targets) snap.targets = { ...ts.team.targets };
      return snap;
    };
    return { clock: Math.round(this.clock), period: this.period, score: [this.score[0], this.score[1]], finished: this.finished, teams: [team(this.teams[0]), team(this.teams[1])] };
  }

  private targets(side: Side): TargetedInstructions | undefined {
    return this.teams[side].team.targets;
  }

  /* ------------------------------ Trace ----------------------------- */

  /** Starts a new play-by-play action (closing the previous one). Never draws random numbers. */
  private begin(kind: PlayKind, side: Side, playerId?: string, detail?: string): void {
    if (!this.options.trace) return;
    this.flushStep();
    // Time spent between two actions (e.g. an infringement before the next action) goes to the previous one.
    const last = this.traceSteps[this.traceSteps.length - 1];
    if (last && this.clock > last.t + last.dur) last.dur = Math.round((this.clock - last.t) * 10) / 10;
    const step: PlayStep = {
      kind,
      t: Math.round(this.clock * 10) / 10,
      dur: 0,
      live: 0,
      side,
      from: [round1(this.x), round1(this.y)],
      to: [round1(this.x), round1(this.y)],
      defOrg: Math.round(this.defOrg * 100) / 100,
      ev: [this.evCursor, this.evCursor],
      score: [this.score[0], this.score[1]],
      period: this.period,
    };
    if (playerId) step.playerId = playerId;
    if (detail) step.detail = detail;
    const lineup = this.teams.map((ts) => ts.slots.map((fp) => fp?.p.id ?? null)) as [(string | null)[], (string | null)[]];
    const sig = lineup.map((l) => l.join(",")).join("|");
    if (sig !== this.lineupSig) {
      this.lineupSig = sig;
      step.lineup = lineup;
    }
    this.cur = { step, ballInPlay: this.ballInPlay };
  }

  /** Adds information to the current action (outcome known later). */
  private annotate(patch: Partial<Pick<PlayStep, "playerId" | "detail" | "side">>): void {
    if (this.cur) Object.assign(this.cur.step, patch);
  }

  private flushStep(): void {
    if (!this.cur) return;
    const s = this.cur.step;
    s.dur = Math.round((this.clock - s.t) * 10) / 10;
    s.live = Math.round((this.ballInPlay - this.cur.ballInPlay) * 10) / 10;
    s.to = [round1(this.x), round1(this.y)];
    s.ev = [this.evCursor, this.events.length];
    this.evCursor = this.events.length;
    s.score = [this.score[0], this.score[1]];
    this.traceSteps.push(s);
    this.cur = null;
  }

  /* ------------------------------ Core loop ------------------------- */

  private processRestart(r: Restart): void {
    if (r.kind !== "openPlay" && r.kind !== "conversion") this.atStoppage();
    switch (r.kind) {
      case "kickoff":
        return this.kickoff(r.side);
      case "openPlay":
        return this.openPlay(r.side, r.quality, r.afterKick ?? false);
      case "scrum":
        return this.scrum(r.side, r.x);
      case "lineout":
        return this.lineout(r.side, r.x);
      case "penalty":
        return this.penalty(r.side, r.x, r.y);
      case "dropout22":
        return this.dropout(r.side, 22);
      case "dropoutGoalLine":
        return this.dropout(r.side, 0);
      case "conversion":
        return this.conversion(r.side, r.y, r.scorerId);
    }
  }

  /** Ball becomes dead: decides whether the period ends, otherwise schedules the restart. */
  private ballDead(nextRestart: Restart, reason: DeadReason): void {
    const continues = reason === "penalty" || nextRestart.kind === "conversion";
    if (this.clock >= this.periodEnd && !continues) {
      this.endPeriod();
      return;
    }
    this.next = nextRestart;
  }

  private endPeriod(): void {
    const [h, a] = this.score;
    if (this.period === 1 || this.period === 3) {
      this.emit(this.period === 1 ? "halfTime" : "extraTime", { importance: 2 });
      this.begin("break", 0);
      this.period += 1;
      this.clock = Math.max(this.clock, this.periodEnd);
      this.periodEnd = this.clock + (this.period === 2 ? HALF : ET_HALF);
      // Half-time recovery.
      for (const ts of this.teams)
        for (const fp of this.onField(ts)) fp.condition = Math.min(100, fp.condition + (this.period === 2 ? 9 : 4));
      const kicker: Side = this.period === 2 ? other(this.firstKicker) : this.firstKicker;
      this.next = { kind: "kickoff", side: kicker };
      return;
    }
    if (this.period === 2 && this.setup.knockout && h === a) {
      this.emit("extraTime", { importance: 2, detail: { start: true } });
      this.period = 3;
      this.clock = this.periodEnd;
      this.periodEnd = this.clock + ET_HALF;
      this.decidedBy = "extraTime";
      this.next = { kind: "kickoff", side: this.firstKicker };
      return;
    }
    if (this.period === 4 && h === a) {
      const [th, ta] = [this.teams[0].stats.tries, this.teams[1].stats.tries];
      if (th !== ta) {
        this.decidedBy = "tries";
      } else {
        this.decidedBy = "kickCompetition";
        const k0 = this.bestOnField(this.teams[0], (fp) => this.attr(fp, "goalKicking"));
        const k1 = this.bestOnField(this.teams[1], (fp) => this.attr(fp, "goalKicking"));
        const p0 = sigmoid(((k0 ? this.attr(k0, "goalKicking") : 10) - (k1 ? this.attr(k1, "goalKicking") : 10)) * 0.3);
        const w: Side = this.rng.chance(p0) ? 0 : 1;
        this.emit("kickCompetition", { side: w, importance: 2 });
        this.kickCompWinner = w;
      }
    }
    this.finished = true;
    this.emit("fullTime", { importance: 2 });
    this.begin("break", 0);
    this.flushStep();
  }

  private kickCompWinner: Side | null = null;

  /* ------------------------------ Clock & fatigue ------------------- */

  /**
   * Advances the clock. `inPlay` seconds count as ball-in-play and drain fatigue;
   * `attacking` gets possession time.
   */
  private tick(seconds: number, inPlay: boolean, attacking?: Side): void {
    this.clock += seconds;
    if (inPlay) {
      this.ballInPlay += seconds;
      if (attacking !== undefined) {
        this.teams[attacking].stats.possessionSeconds += seconds;
        const adv = this.adv(attacking);
        if (adv > 50) this.teams[attacking].stats.territorySeconds += seconds;
        else this.teams[other(attacking)].stats.territorySeconds += seconds;
      }
      for (const ts of this.teams) {
        // Fitness automatisms (training): fresher for longer.
        const fit = ts.team.sharpness?.fitness;
        const fitF = fit === undefined ? 1 : 1 - (fit - 0.5) * 0.3;
        for (const fp of this.onField(ts)) {
          const base = isForward(fp.pos) ? 0.0135 : 0.0105;
          const staminaF = (1.35 - (this.raw(fp, "stamina") / 20) * 0.7) * fitF;
          fp.condition = Math.max(20, fp.condition - seconds * base * staminaF);
        }
      }
    } else {
      for (const ts of this.teams) {
        for (const fp of this.onField(ts)) {
          fp.condition = Math.min(100, fp.condition + seconds * 0.0035 * (0.6 + this.raw(fp, "recovery") / 25));
        }
      }
    }
  }

  private exert(fp: FieldPlayer | null | undefined, amount: number): void {
    if (!fp) return;
    const staminaF = 1.3 - (this.raw(fp, "stamina") / 20) * 0.6;
    fp.condition = Math.max(20, fp.condition - amount * staminaF);
  }

  /* ------------------------------ Attributes ------------------------ */

  private raw(fp: FieldPlayer, key: AttributeKey): number {
    return fp.p.attributes[key];
  }

  /** Effective attribute: base × fatigue × form × position familiarity × home/morale. */
  private attr(fp: FieldPlayer, key: AttributeKey): number {
    const base = fp.p.attributes[key];
    const fatigue = 0.74 + 0.26 * (fp.condition / 100);
    const fam = fp.p.positions[fp.pos] ?? 1;
    const famF = 0.82 + 0.18 * (fam / 20);
    const side = this.sideOf(fp);
    const team = this.teams[side].team;
    const home = side === 0 && !this.setup.neutral ? 1.035 : 1;
    const morale = 1 + ((team.morale ?? 0.5) - 0.5) * 0.1;
    const unit = UNIT_OF[key];
    const sharp = unit && team.sharpness?.[unit] !== undefined ? 1 + (team.sharpness[unit]! - 0.5) * 0.1 : 1;
    // Scoreboard effect: a big lead brings some complacency, a big deficit some desperation.
    const lead = this.score[side] - this.score[other(side)];
    let scoreF = lead > 12 ? 1 - Math.min(0.05, (lead - 12) * 0.004) : lead < -12 ? 1 + Math.min(0.025, (-lead - 12) * 0.002) : 1;
    // Last quarter of a close game: the trailing side chases the win (or the losing bonus), the leader manages.
    if (this.period === 2 && this.clock > LATE_GAME && lead !== 0 && Math.abs(lead) <= 12) scoreF *= lead < 0 ? 1 + CLOSE_GAME_PUSH : 1 - CLOSE_GAME_PUSH / 2;
    return base * fatigue * (1 + fp.form) * famF * home * morale * sharp * scoreF;
  }

  private sideOf(fp: FieldPlayer): Side {
    return this.teams[0].all.has(fp.p.id) ? 0 : 1;
  }

  /* ------------------------------ Field helpers --------------------- */

  /** Metres from own try line for a side. */
  private adv(side: Side, x = this.x): number {
    return side === 0 ? x : 100 - x;
  }

  private abs(side: Side, adv: number): number {
    return side === 0 ? adv : 100 - adv;
  }

  private onField(ts: TeamState): FieldPlayer[] {
    return ts.slots.filter((s): s is FieldPlayer => s !== null);
  }

  private count(side: Side): number {
    return this.onField(this.teams[side]).length;
  }

  private slotPlayer(ts: TeamState, shirt: number): FieldPlayer | null {
    return ts.slots[shirt - 1] ?? null;
  }

  private bestOnField(ts: TeamState, score: (fp: FieldPlayer) => number): FieldPlayer | null {
    let best: FieldPlayer | null = null;
    let bs = -Infinity;
    for (const fp of this.onField(ts)) {
      const s = score(fp);
      if (s > bs) {
        bs = s;
        best = fp;
      }
    }
    return best;
  }

  private pickWeighted(ts: TeamState, weights: Partial<Record<Position, number>>, extra?: (fp: FieldPlayer) => number): FieldPlayer | null {
    const items: [FieldPlayer, number][] = this.onField(ts).map((fp) => [fp, (weights[fp.pos] ?? 0.05) * (extra ? extra(fp) : 1)]);
    if (items.length === 0) return null;
    return this.rng.weighted(items);
  }

  /** Player in shirt slot, or the closest substitute for that role. */
  private roleplayer(ts: TeamState, shirt: number, fallback: Partial<Record<Position, number>>): FieldPlayer | null {
    return this.slotPlayer(ts, shirt) ?? this.pickWeighted(ts, fallback);
  }

  private scrumHalf(ts: TeamState) {
    return this.roleplayer(ts, 9, { SH: 5, FH: 2, WG: 1, FB: 1 });
  }
  private flyHalf(ts: TeamState) {
    return this.roleplayer(ts, 10, { FH: 5, FB: 2, IC: 2, SH: 1 });
  }
  private fullback(ts: TeamState) {
    return this.roleplayer(ts, 15, { FB: 5, WG: 3, OC: 1 });
  }
  private hooker(ts: TeamState) {
    return this.roleplayer(ts, 2, { HK: 5, LH: 1, TH: 1, BF: 1 });
  }

  /* ------------------------------ Events ---------------------------- */

  private emit(
    type: EventType,
    e: Partial<Omit<MatchEvent, "t" | "type" | "score" | "period">> & { importance: 0 | 1 | 2 },
  ): void {
    this.events.push({
      t: Math.round(this.clock),
      period: this.period,
      type,
      x: e.x ?? Math.round(this.x),
      y: e.y ?? Math.round(this.y),
      score: [this.score[0], this.score[1]],
      ...e,
    });
  }

  private pstat(fp: FieldPlayer | null | undefined): PlayerMatchStats | null {
    if (!fp) return null;
    return this.teams[this.sideOf(fp)].ps.get(fp.p.id) ?? null;
  }

  /* ------------------------------ Stoppages ------------------------- */

  /** Called when the ball is dead before a restart: returns from sin-bin, HIA, substitutions. */
  private atStoppage(): void {
    for (const ts of this.teams) {
      // Sin-bin / HIA returns.
      for (const b of [...ts.binned]) {
        if (this.clock < b.returnAt) continue;
        ts.binned.splice(ts.binned.indexOf(b), 1);
        if (b.kind === "yellow") {
          if (ts.slots[b.slot] === null) ts.slots[b.slot] = b.fp;
          else this.placeAnywhere(ts, b.fp);
          this.emit("cardReturn", { side: ts.side, playerId: b.fp.p.id, importance: 1 });
        } else if (b.kind === "red20") {
          const repl = this.findReplacement(ts, b.fp.pos, true);
          if (repl) {
            this.bringOn(ts, repl, b.slot);
            this.emit("cardReturn", { side: ts.side, playerId: repl.p.id, importance: 1, detail: { red20: true } });
          }
        } else if (b.kind === "hia") {
          const passed = this.rng.chance(0.62);
          if (passed) {
            const slotIdx = b.temp ? ts.slots.indexOf(b.temp) : b.slot;
            if (b.temp && slotIdx >= 0) {
              // The temporary replacement returns to the bench.
              this.goOff(b.temp);
              ts.slots[slotIdx] = b.fp;
              ts.bench.push(b.temp);
            } else if (ts.slots[b.slot] === null) ts.slots[b.slot] = b.fp;
            this.goOn(b.fp);
            this.emit("hiaReturn", { side: ts.side, playerId: b.fp.p.id, importance: 1, detail: { passed: true } });
          } else {
            ts.replacedIds.add(b.fp.p.id);
            this.injuries.push({ playerId: b.fp.p.id, side: ts.side, type: "Commotion cérébrale", days: 12 + this.rng.int(0, 16), concussion: true });
            this.emit("hiaReturn", { side: ts.side, playerId: b.fp.p.id, importance: 2, detail: { passed: false } });
            if (!b.temp && ts.slots[b.slot] === null) {
              const repl = this.findReplacement(ts, b.fp.pos, false);
              if (repl) this.bringOn(ts, repl, b.slot, b.fp);
            }
          }
        }
      }
      this.manualSubstitutions(ts);
      if (this.autoSubs[ts.side]) this.aiSubstitutions(ts);
      this.checkFrontRow(ts);
    }
  }

  private goOn(fp: FieldPlayer): void {
    if (fp.onAt === null) fp.onAt = this.clock;
    fp.everOn = true;
  }

  private goOff(fp: FieldPlayer): void {
    if (fp.onAt !== null) {
      fp.secs += this.clock - fp.onAt;
      fp.onAt = null;
    }
  }

  private placeAnywhere(ts: TeamState, fp: FieldPlayer): void {
    const idx = ts.slots.indexOf(null);
    if (idx >= 0) ts.slots[idx] = fp;
  }

  private findReplacement(ts: TeamState, pos: Position, anyIfNone: boolean): FieldPlayer | null {
    const fam = (b: FieldPlayer) => b.p.positions[pos] ?? 1;
    const candidates = ts.bench.filter((b) => !ts.replacedIds.has(b.p.id));
    if (candidates.length === 0) return null;
    const sameGroup = candidates.filter((b) => isForward(bestPosition(b.p)) === isForward(pos));
    // Front row slots must be filled by front-row specialists when possible.
    if (isFrontRow(pos)) {
      const fr = candidates.filter((b) => fam(b) >= 12);
      if (fr.length) return fr.sort((a, b) => fam(b) - fam(a))[0]!;
      return anyIfNone ? (sameGroup[0] ?? candidates[0] ?? null) : null;
    }
    // Keep front-row specialists for front-row duty when another option exists.
    const nonFr = sameGroup.filter((b) => !isFrontRow(bestPosition(b.p)));
    const pool = nonFr.length ? nonFr : sameGroup.length ? sameGroup : anyIfNone ? candidates : [];
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => fam(b) - fam(a))[0]!;
  }

  private bringOn(ts: TeamState, fp: FieldPlayer, slot: number, replaced?: FieldPlayer): void {
    ts.bench.splice(ts.bench.indexOf(fp), 1);
    fp.pos = SHIRT_POSITION[slot + 1]!;
    this.goOn(fp);
    ts.slots[slot] = fp;
    if (replaced) {
      this.goOff(replaced);
      ts.replacedIds.add(replaced.p.id);
    }
    this.emit("substitution", { side: ts.side, playerId: fp.p.id, otherPlayerId: replaced?.p.id, importance: 1 });
  }

  private manualSubstitutions(ts: TeamState): void {
    const mine = this.pendingSubs.filter((s) => s.side === ts.side);
    if (!mine.length) return;
    this.pendingSubs = this.pendingSubs.filter((s) => s.side !== ts.side);
    for (const req of mine) {
      const on = ts.bench.find((b) => b.p.id === req.onId);
      const off = this.onField(ts).find((fp) => fp.p.id === req.offId);
      if (!on || !off || ts.replacedIds.has(on.p.id)) continue;
      this.bringOn(ts, on, ts.slots.indexOf(off), off);
    }
  }

  private aiSubstitutions(ts: TeamState): void {
    const minute = this.clock / 60;
    for (const b of [...ts.bench]) {
      if (ts.replacedIds.has(b.p.id) || b.everOn) continue;
      const planned = ts.subPlan.get(b.p.id) ?? 99;
      const fam = (fp: FieldPlayer) => b.p.positions[fp.pos] ?? 1;
      // Who could this bench player replace?
      const targets = this.onField(ts).filter((fp) => fam(fp) >= 12 && fp.started);
      if (targets.length === 0) continue;
      const tired = targets.sort((a, c) => a.condition - c.condition)[0]!;
      const due = minute >= planned || (tired.condition < 52 && minute >= 35);
      if (!due) continue;
      // Do not take off someone fresher than the bench player is worth.
      if (minute < planned && tired.condition > 60) continue;
      this.bringOn(ts, b, ts.slots.indexOf(tired), tired);
    }
  }

  /** Uncontested scrums when a front-row slot cannot be filled by a specialist. */
  private checkFrontRow(ts: TeamState): void {
    for (const shirt of [1, 2, 3]) {
      const fp = ts.slots[shirt - 1];
      const pos = SHIRT_POSITION[shirt]!;
      if (fp && (fp.p.positions[pos] ?? 1) >= 10) continue;
      // Try to bring on a front-row specialist in place of a back-rower/lock.
      const fr = ts.bench.find((b) => !ts.replacedIds.has(b.p.id) && (b.p.positions[pos] ?? 1) >= 12);
      if (fr) {
        if (fp === null) {
          const victim = this.onField(ts).filter((f) => isBackRow(f.pos) || f.pos === "LO").sort((a, b) => a.condition - b.condition)[0];
          if (victim) {
            const vIdx = ts.slots.indexOf(victim);
            this.goOff(victim);
            ts.replacedIds.add(victim.p.id);
            ts.slots[vIdx] = null;
            this.bringOn(ts, fr, shirt - 1);
            continue;
          }
        } else {
          this.bringOn(ts, fr, shirt - 1, fp);
          continue;
        }
      }
      if (!this.uncontested) {
        this.uncontested = true;
        this.emit("uncontestedScrums", { side: ts.side, importance: 1 });
      }
    }
  }

  private uncontested = false;

  /* ------------------------------ Discipline ------------------------ */

  private awardPenalty(
    to: Side,
    offender: FieldPlayer | null,
    reason: string,
    opts: { foulPlay?: boolean; professional?: boolean } = {},
  ): void {
    const offSide = other(to);
    const ots = this.teams[offSide];
    ots.stats.penaltiesConceded += 1;
    const ps = this.pstat(offender);
    if (ps) ps.penaltiesConceded += 1;
    this.y = clamp(this.y + this.rng.normal(0, 6), 5, 65);
    this.emit("penalty", { side: to, playerId: offender?.p.id, importance: 1, detail: { reason } });

    // Cards
    const advOff = this.adv(offSide);
    if (advOff < 25) ots.pens22.push(this.clock);
    ots.pens22 = ots.pens22.filter((t) => this.clock - t < 900);
    let pCard = 0;
    if (opts.foulPlay) pCard += 0.42;
    if (opts.professional) pCard += 0.3;
    if (advOff < 25 && ots.pens22.length >= 3) pCard += 0.35;
    pCard *= 0.55 + this.setup.referee.cardStrictness * 0.9;
    if (offender && this.rng.chance(pCard)) {
      const severe = opts.foulPlay && this.rng.chance(0.1);
      const permanent = opts.foulPlay && this.rng.chance(0.015);
      if (permanent) this.card(ots, offender, "red");
      else if (severe || offender.yellows >= 1) this.card(ots, offender, "red20");
      else this.card(ots, offender, "yellow");
      ots.pens22 = [];
    }
    this.ballDead({ kind: "penalty", side: to, x: this.x, y: this.y }, "penalty");
  }

  private card(ts: TeamState, fp: FieldPlayer, kind: "yellow" | "red20" | "red"): void {
    const slot = ts.slots.indexOf(fp);
    if (slot < 0) return;
    const ps = this.pstat(fp);
    ts.slots[slot] = null;
    if (kind === "yellow") {
      fp.yellows += 1;
      ts.stats.yellowCards += 1;
      if (ps) ps.yellowCards += 1;
      ts.binned.push({ fp, slot, returnAt: this.clock + 600, kind: "yellow" });
      this.emit("yellowCard", { side: ts.side, playerId: fp.p.id, importance: 2 });
    } else {
      ts.stats.redCards += 1;
      if (ps) ps.redCards += 1;
      this.goOff(fp);
      ts.replacedIds.add(fp.p.id);
      if (kind === "red20") ts.binned.push({ fp, slot, returnAt: this.clock + 1200, kind: "red20" });
      this.emit("redCard", { side: ts.side, playerId: fp.p.id, importance: 2, detail: { twentyMinutes: kind === "red20" } });
    }
  }

  /* ------------------------------ Injuries -------------------------- */

  private contactRisk(fp: FieldPlayer | null, intensity: number): void {
    if (!fp) return;
    const ts = this.teams[this.sideOf(fp)];
    const resil = this.raw(fp, "contactResilience");
    const prone = fp.p.hidden.injuryProneness;
    const tired = fp.condition < 60 ? 1.5 : 1;
    const fragile = ts.team.fragile?.includes(fp.p.id) ? 2.2 : 1;
    const pInj = 0.0026 * fragile * intensity * (1 + (12 - resil) * 0.05) * (0.6 + prone / 25) * tired;
    const pHia = 0.0013 * intensity;
    if (this.rng.chance(pHia)) {
      this.hia(ts, fp);
      return;
    }
    if (this.rng.chance(pInj)) this.injure(ts, fp);
  }

  private hia(ts: TeamState, fp: FieldPlayer): void {
    const slot = ts.slots.indexOf(fp);
    if (slot < 0) return;
    ts.stats.hias += 1;
    ts.slots[slot] = null;
    this.goOff(fp);
    const temp = this.findReplacement(ts, fp.pos, true) ?? undefined;
    if (temp) {
      ts.bench.splice(ts.bench.indexOf(temp), 1);
      temp.pos = fp.pos;
      this.goOn(temp);
      ts.slots[slot] = temp;
    }
    ts.binned.push({ fp, slot, returnAt: this.clock + 720, kind: "hia", temp });
    this.emit("hia", { side: ts.side, playerId: fp.p.id, otherPlayerId: temp?.p.id, importance: 2 });
  }

  private injure(ts: TeamState, fp: FieldPlayer): void {
    const slot = ts.slots.indexOf(fp);
    if (slot < 0) return;
    ts.stats.injuries += 1;
    const [type, days] = this.rng.weighted<[string, number]>([
      [["Contusion", this.rng.int(3, 10)], 30],
      [["Entorse de la cheville", this.rng.int(10, 35)], 14],
      [["Lésion aux ischio-jambiers", this.rng.int(14, 42)], 14],
      [["Blessure à l'épaule", this.rng.int(21, 90)], 10],
      [["Entorse du genou (LCM)", this.rng.int(28, 70)], 8],
      [["Rupture du ligament croisé", this.rng.int(180, 280)], 2],
      [["Fracture de la main", this.rng.int(28, 50)], 5],
      [["Blessure aux cervicales", this.rng.int(14, 60)], 3],
      [["Lésion au mollet", this.rng.int(10, 30)], 12],
    ]);
    this.injuries.push({ playerId: fp.p.id, side: ts.side, type, days, concussion: false });
    this.emit("injury", { side: ts.side, playerId: fp.p.id, importance: 2, detail: { type, days } });
    ts.slots[slot] = null;
    this.goOff(fp);
    ts.replacedIds.add(fp.p.id);
    const repl = this.findReplacement(ts, fp.pos, true);
    if (repl) this.bringOn(ts, repl, slot, fp);
    this.tick(this.rng.int(40, 120), false);
  }

  /* ------------------------------ Scoring --------------------------- */

  private addPoints(side: Side, pts: number): void {
    this.score[side] += pts;
    this.teams[side].stats.points += pts;
    if (this.in22[side]) this.teams[side].stats.pointsFrom22 += pts;
  }

  private markEntry(att: Side): void {
    const adv = this.adv(att);
    if (adv >= 78 && !this.in22[att]) {
      this.in22[att] = true;
      this.teams[att].stats.entries22 += 1;
    } else if (adv < 70) {
      this.in22[att] = false;
    }
  }

  private changePossession(): void {
    this.in22 = [false, false];
    this.phase = 0;
  }

  private tryScored(att: Side, scorer: FieldPlayer | null, how: string): void {
    this.begin("try", att, scorer?.p.id, how);
    // TMO review on some tries.
    if (this.rng.chance(0.07)) {
      this.tick(70, false);
      if (this.rng.chance(0.22)) {
        this.emit("tryDisallowed", { side: att, playerId: scorer?.p.id, importance: 2 });
        this.changePossession();
        this.x = this.abs(att, 95);
        this.ballDead({ kind: "scrum", side: other(att), x: this.x }, "scrumAwarded");
        return;
      }
    }
    const ts = this.teams[att];
    ts.stats.tries += 1;
    const ps = this.pstat(scorer);
    if (ps) {
      ps.tries += 1;
      ps.points += 5;
    }
    this.addPoints(att, 5);
    this.x = this.abs(att, 100);
    this.emit("try", { side: att, playerId: scorer?.p.id, importance: 2, detail: { how } });
    this.changePossession();
    this.next = { kind: "conversion", side: att, y: this.y, scorerId: scorer?.p.id ?? "" };
  }

  private goalKicker(ts: TeamState): FieldPlayer | null {
    const designated = this.onField(ts).find((fp) => fp.p.id === ts.team.goalKickerId);
    return designated ?? this.bestOnField(ts, (fp) => this.attr(fp, "goalKicking"));
  }

  private conversion(att: Side, y: number, _scorerId: string): void {
    const ts = this.teams[att];
    const kicker = this.goalKicker(ts);
    this.begin("conversion", att, kicker?.p.id);
    const angle = Math.abs(y - 35) / 35;
    const gk = kicker ? this.attr(kicker, "goalKicking") : 8;
    const wind = this.setup.weather === "windy" ? 0.08 : this.setup.weather === "wet" ? 0.03 : 0;
    const p = clamp(0.33 + (gk - 10) * 0.045 + (1 - angle) * 0.42 - wind - this.pressure(att, kicker), 0.12, 0.97);
    ts.stats.conversionsAttempted += 1;
    const made = this.rng.chance(p);
    const ps = this.pstat(kicker);
    if (made) {
      ts.stats.conversionsMade += 1;
      this.addPoints(att, 2);
      if (ps) {
        ps.points += 2;
        ps.goalKicksMade += 1;
      }
    } else if (ps) ps.goalKicksMissed += 1;
    this.tick(this.rng.int(55, 85), false);
    this.emit("conversion", { side: att, playerId: kicker?.p.id, importance: 2, detail: { made, difficulty: Math.round(angle * 100) } });
    this.x = 50;
    this.y = 35;
    this.ballDead({ kind: "kickoff", side: other(att) }, "score");
  }

  /** Pressure on a kicker in tight, late situations (reduced by composure / big-match temperament). */
  private pressure(side: Side, kicker: FieldPlayer | null): number {
    if (!kicker) return 0;
    const diff = this.score[side] - this.score[other(side)];
    const late = this.clock > this.periodEnd - 600 && this.period >= 2;
    if (!late || Math.abs(diff) > 7) return 0;
    return Math.max(0, (14 - this.raw(kicker, "composure")) * 0.006 + (12 - kicker.p.hidden.bigMatches) * 0.003);
  }

  /** Probability of a successful kick at goal from the current spot. */
  private goalProbability(side: Side, kicker: FieldPlayer | null): number {
    const dist = 100 - this.adv(side) + 2;
    const angle = Math.abs(this.y - 35) / 35;
    const gk = kicker ? this.attr(kicker, "goalKicking") : 8;
    const wind = this.setup.weather === "windy" ? 0.08 : this.setup.weather === "wet" ? 0.03 : 0;
    const effDist = dist + angle * 12;
    return clamp(1.0 - Math.max(0, effDist - 18) * 0.0175 + (gk - 14) * 0.035 - wind - this.pressure(side, kicker), 0.02, 0.97);
  }

  /* ------------------------------ Kick-off & restarts --------------- */

  private kickoff(kicking: Side): void {
    this.changePossession();
    this.x = 50;
    this.y = 35;
    const kts = this.teams[kicking];
    const rts = this.teams[other(kicking)];
    const kicker = this.flyHalf(kts);
    this.begin("kickoff", kicking, kicker?.p.id);
    this.emit("kickoff", { side: kicking, playerId: kicker?.p.id, importance: 1 });
    this.tick(4, true, kicking);
    if (this.rng.chance(0.035)) {
      // Not 10 metres / out on the full → scrum to receivers at halfway.
      this.ballDead({ kind: "scrum", side: other(kicking), x: 50 }, "other");
      return;
    }
    const contestable = this.rng.chance(0.68);
    if (contestable) {
      this.x = this.abs(kicking, 50 + this.rng.int(10, 16));
      this.contestHighBall(kicking, kicker, 0.14, false);
    } else {
      this.x = this.abs(kicking, 50 + this.rng.int(28, 42));
      this.receiveKick(kicking, kicker);
    }
  }

  private dropout(side: Side, from: 0 | 22): void {
    this.changePossession();
    const ts = this.teams[side];
    const kicker = this.flyHalf(ts);
    this.x = this.abs(side, from);
    this.y = 35;
    this.begin("dropout", side, kicker?.p.id);
    this.emit("dropout", { side, playerId: kicker?.p.id, importance: 1, detail: { from } });
    this.tick(3, true, side);
    if (this.rng.chance(0.2)) {
      this.x = this.abs(side, from + 15);
      this.contestHighBall(side, kicker, 0.2, false);
    } else {
      this.x = this.abs(side, clamp(from + 30 + (kicker ? this.attr(kicker, "kicking") : 10) * 1.1 + this.rng.normal(0, 5), 30, 75));
      this.receiveKick(side, kicker);
    }
  }

  /* ------------------------------ Kicks in play --------------------- */

  /**
   * A contestable kick lands at `this.x`. The kicking team's chaser competes with a receiver.
   * `base` = base regain probability.
   */
  private contestHighBall(kicking: Side, kicker: FieldPlayer | null, base: number, fromPlay: boolean): void {
    const kts = this.teams[kicking];
    const rts = this.teams[other(kicking)];
    const chaser = this.pickWeighted(kts, fromPlay ? { WG: 3, FB: 1, OC: 1, BF: 0.5 } : { LO: 3, BF: 2, N8: 1, WG: 1 });
    const kickAt = this.targets(kicking)?.kickAt;
    const receiver = this.pickWeighted(rts, fromPlay ? { FB: 3, WG: 2, SH: 0.4 } : { LO: 3, BF: 2, N8: 1.5, FB: 0.5 }, fromPlay && kickAt ? (fp) => (fp.p.id === kickAt ? 6 : 1) : undefined);
    this.begin("contest", other(kicking), receiver?.p.id);
    const air = (fp: FieldPlayer | null) =>
      fp ? this.attr(fp, "highBall") * 0.5 + this.attr(fp, "jumping") * 0.2 + heightScore(fp.p.heightCm) * 0.15 + this.attr(fp, "bravery") * 0.15 : 5;
    const accuracy = kicker ? (this.attr(kicker, "tacticalKicking") - 12) * 0.015 : 0;
    const pRegain = clamp(base + (air(chaser) - air(receiver)) * 0.03 + accuracy, 0.04, 0.6);
    const pKnock = clamp(0.035 + (12 - (receiver ? this.attr(receiver, "highBall") : 8)) * 0.006 + (this.setup.weather === "wet" ? 0.03 : 0), 0.01, 0.15);
    this.tick(this.rng.range(3, 5), true, kicking);
    if (this.rng.chance(pRegain)) {
      this.emit("kickRegathered", { side: kicking, playerId: chaser?.p.id, importance: 1 });
      this.annotate({ side: kicking, playerId: chaser?.p.id, detail: "regathered" });
      this.exert(chaser, 1);
      this.defOrg = 0.5;
      this.changePossession();
      this.ruck(kicking, chaser, { dominant: false, isolated: false });
      return;
    }
    if (this.rng.chance(pKnock)) {
      this.teams[other(kicking)].stats.handlingErrors += 1;
      const ps = this.pstat(receiver);
      if (ps) ps.handlingErrors += 1;
      this.emit("knockOn", { side: other(kicking), playerId: receiver?.p.id, importance: 1, detail: { highBall: true } });
      this.ballDead({ kind: "scrum", side: kicking, x: this.x }, "knockOn");
      return;
    }
    // Caught and tackled quickly by the chase.
    this.emit("kickCaught", { side: other(kicking), playerId: receiver?.p.id, importance: 0 });
    this.changePossession();
    const tackler = chaser ?? this.pickWeighted(kts, { WG: 1 });
    this.registerTackle(kts, tackler, true);
    this.contactRisk(receiver, 1.2);
    this.defOrg = 0.75;
    this.ruck(other(kicking), receiver, { dominant: this.rng.chance(0.3), isolated: true });
  }

  /** Long kick fielded by the back three: they may counter-attack or kick back. */
  private receiveKick(kicking: Side, kicker: FieldPlayer | null): void {
    const recv = other(kicking);
    const rts = this.teams[recv];
    const kickAt = this.targets(kicking)?.kickAt;
    const receiver = this.pickWeighted(rts, { FB: 4, WG: 2, FH: 0.5 }, kickAt ? (fp) => (fp.p.id === kickAt ? 6 : 1) : undefined);
    this.begin("receive", recv, receiver?.p.id);
    this.tick(this.rng.range(4, 6), true, kicking);
    const pKnock = clamp(0.02 + (12 - (receiver ? this.attr(receiver, "highBall") : 8)) * 0.005 + (this.setup.weather === "wet" ? 0.025 : 0), 0.005, 0.1);
    if (this.rng.chance(pKnock)) {
      rts.stats.handlingErrors += 1;
      const ps = this.pstat(receiver);
      if (ps) ps.handlingErrors += 1;
      this.emit("knockOn", { side: recv, playerId: receiver?.p.id, importance: 1, detail: { highBall: true } });
      this.ballDead({ kind: "scrum", side: kicking, x: this.x }, "knockOn");
      return;
    }
    this.emit("kickCaught", { side: recv, playerId: receiver?.p.id, importance: 0 });
    this.changePossession();
    void kicker;
    // Kick chase quality determines how organised the kicking team is.
    const kts = this.teams[kicking];
    const chase = this.onField(kts).reduce((s, fp) => s + this.attr(fp, "workRate") + this.attr(fp, "pace"), 0) / Math.max(1, this.count(kicking) * 2);
    this.defOrg = clamp(0.45 + (chase - 11) * 0.04, 0.25, 0.8);
    this.next = { kind: "openPlay", side: recv, quality: "normal", afterKick: true };
  }

  /* ------------------------------ Open play ------------------------- */

  private openPlay(att: Side, quality: RuckQuality, afterKick: boolean): void {
    const ts = this.teams[att];
    const tac = ts.team.tactics;
    const adv = this.adv(att);
    const diff = this.score[att] - this.score[other(att)];
    const late = this.period >= 2 && this.periodEnd - this.clock < 420;
    const timeUp = this.clock >= this.periodEnd;
    this.phase += 1;
    this.markEntry(att);

    // End of half: team ahead kicks the ball dead.
    if (timeUp && (diff > 0 || this.period === 1) && adv < 75 && !(this.period === 1 && adv > 60)) {
      const kicker = this.flyHalf(ts) ?? this.scrumHalf(ts);
      this.begin("kick", att, kicker?.p.id, "touch");
      this.y = this.y < 35 ? 0 : 70;
      this.emit("kickToTouch", { side: att, playerId: kicker?.p.id, importance: 1, detail: { endOfHalf: true } });
      this.ballDead({ kind: "lineout", side: other(att), x: this.x }, "touch");
      return;
    }

    // Drop goal attempts: late and close, within range.
    const fh = this.flyHalf(ts);
    if (fh && adv >= 58 && this.phase >= 2) {
      const behindOrLevel = diff <= 0 && diff >= -3;
      const pDrop = late && behindOrLevel ? 0.28 : this.period >= 2 && this.periodEnd - this.clock < 180 && diff >= -2 && diff <= 2 ? 0.2 : 0.0025;
      if (this.rng.chance(pDrop) && this.attr(fh, "kicking") >= 9) return this.dropGoal(att, fh);
    }

    // Kick or run?
    let pKick = this.kickProbability(tac.kickingGame, adv);
    if (quality === "slow") pKick *= 1.6;
    if (quality === "fast") pKick *= 0.75;
    if (this.phase > 8) pKick *= 1.25;
    if (afterKick) pKick *= adv < 40 ? 1.7 : 1.1;
    if (late && diff < 0) pKick *= adv < 22 ? 0.6 : 0.25;
    if (late && diff > 0 && diff <= 7) pKick *= 1.3;
    if (this.count(att) < this.count(other(att))) pKick *= 1.2;
    if (this.rng.chance(clamp(pKick, 0, 0.92))) return this.kickInPlay(att, adv, quality);

    // Carry: close or wide.
    let closeShare = tac.attackShape === "tight" ? 0.68 : tac.attackShape === "wide" ? 0.44 : 0.56;
    if (adv >= 94) closeShare = 0.85;
    else if (adv >= 85) closeShare += 0.12;
    if (quality === "fast" && this.defOrg < 0.6) closeShare -= 0.1;
    const mode = this.rng.chance(clamp(closeShare, 0.2, 0.92)) ? "close" : "wide";
    this.carry(att, mode, quality);
  }

  private kickProbability(game: string, adv: number): number {
    const table: Record<string, [number, number, number, number]> = {
      possession: [0.55, 0.16, 0.055, 0.02],
      balanced: [0.76, 0.3, 0.12, 0.03],
      territory: [0.87, 0.44, 0.17, 0.035],
      pressure: [0.83, 0.42, 0.19, 0.04],
    };
    const t = table[game] ?? table.balanced!;
    if (adv < 22) return t[0];
    if (adv < 50) return t[1];
    if (adv < 78) return t[2];
    return t[3];
  }

  private carry(att: Side, mode: "close" | "wide", quality: RuckQuality): void {
    const ats = this.teams[att];
    const dside = other(att);
    const dts = this.teams[dside];
    const tac = ats.team.tactics;
    const dtac = dts.team.tactics;
    const wet = this.setup.weather === "wet";
    const sh = this.scrumHalf(ats);

    // Defensive offside / line speed infringements.
    const defDisc = this.teamAvg(dts, "discipline");
    const pOffside = 0.0115 * (dtac.defenceSystem === "rush" ? 1.55 : dtac.defenceSystem === "drift" ? 0.8 : 1) * (quality === "fast" ? 1.35 : 1) * (1 + (12 - defDisc) * 0.05) * (0.7 + this.setup.referee.breakdownStrictness * 0.6) * (dside === 1 ? 1.15 : 0.87);
    if (this.rng.chance(pOffside)) {
      const off = this.pickWeighted(dts, { BF: 1, OF: 1, IC: 1, OC: 1, LO: 1, WG: 0.6 });
      this.tick(2, true, att);
      this.awardPenalty(att, off, "Hors-jeu", { professional: this.adv(att) > 85 && this.rng.chance(0.4) });
      return;
    }

    const carrier = this.pickWeighted(ats, mode === "close" ? CLOSE_CARRY_WEIGHTS : WIDE_CARRY_WEIGHTS);
    if (!carrier) return;
    this.begin("carry", att, carrier.p.id, mode);
    const cps = this.pstat(carrier);
    let passes = 1;
    if (mode === "wide") {
      passes = this.rng.int(2, 4) + (tac.attackShape === "wide" ? 1 : 0);
      // Handling errors along the line.
      const passer = this.flyHalf(ats);
      const passQ = passer ? this.attr(passer, "passing") : 10;
      const pErr = clamp(0.0085 * passes + (13 - passQ) * 0.002 + (13 - this.attr(carrier, "handling")) * 0.002 + (wet ? 0.015 : 0) + (dtac.defenceSystem === "rush" ? 0.006 : 0), 0.004, 0.09);
      if (this.rng.chance(pErr)) {
        this.tick(this.rng.range(3, 5), true, att);
        if (dtac.defenceSystem === "rush" && this.rng.chance(0.18)) return this.interception(dside);
        if (this.rng.chance(0.12)) {
          this.emit("forwardPass", { side: att, playerId: carrier.p.id, importance: 1 });
        } else {
          ats.stats.handlingErrors += 1;
          if (cps) cps.handlingErrors += 1;
          this.emit("knockOn", { side: att, playerId: carrier.p.id, importance: 1 });
        }
        this.ballDead({ kind: "scrum", side: dside, x: this.x }, "knockOn");
        return;
      }
    }
    ats.stats.passes += passes;
    const shps = this.pstat(sh);
    if (shps) shps.passes += 1;

    // Contest: carrier vs tackler.
    const carryAt = this.targets(att)?.carryAt;
    const tackler = this.pickWeighted(
      dts,
      mode === "close" ? { BF: 2, OF: 2, N8: 1.5, LO: 1.8, LH: 1.2, TH: 1.2, HK: 1.4, FH: 0.6, SH: 0.4, IC: 0.8 } : { OC: 2, IC: 1.8, WG: 2, FB: 1, FH: 1, OF: 0.8, BF: 0.6 },
      carryAt ? (fp) => (fp.p.id === carryAt ? 5 : 1) : undefined,
    );
    if (!tackler) return;
    const tps = this.pstat(tackler);
    const atk =
      mode === "close"
        ? this.attr(carrier, "strength") * 0.32 + weightScore(carrier.p.weightKg) * 0.18 + this.attr(carrier, "balance") * 0.15 + this.attr(carrier, "footwork") * 0.15 + this.attr(carrier, "acceleration") * 0.2
        : this.attr(carrier, "pace") * 0.33 + this.attr(carrier, "footwork") * 0.25 + this.attr(carrier, "agility") * 0.14 + this.attr(carrier, "acceleration") * 0.14 + this.attr(carrier, "balance") * 0.14;
    const def =
      this.attr(tackler, "tackling") * 0.45 + this.attr(tackler, "strength") * 0.15 + this.attr(tackler, "positioning") * 0.15 + weightScore(tackler.p.weightKg) * 0.1 + this.attr(tackler, "anticipation") * 0.15;
    const d = atk - def;
    const missing = Math.max(0, 15 - this.count(dside)) - Math.max(0, 15 - this.count(att));
    const disorg = clamp(1 - this.defOrg + missing * 0.12, 0, 1.2);
    const rush = dtac.defenceSystem === "rush";
    const drift = dtac.defenceSystem === "drift";
    const vision = (sh ? this.attr(sh, "vision") : 10) * 0.5 + (this.flyHalf(ats) ? this.attr(this.flyHalf(ats)!, "vision") : 10) * 0.5;

    let pBreak = (mode === "close" ? 0.0095 : 0.021) + (mode === "close" ? 0.026 : 0.06) * disorg + 0.0035 * d + (vision - 12) * 0.0015;
    if (mode === "wide" && drift) pBreak *= 0.75;
    if (rush) pBreak *= mode === "wide" ? 1.25 : 1.05;
    pBreak = clamp(pBreak, 0.003, 0.3);
    let pDom = clamp(0.13 - 0.008 * d + (rush ? 0.05 : 0) - disorg * 0.05, 0.02, 0.35);
    let pBeat = clamp(0.1 + 0.008 * d + 0.07 * disorg + (rush && mode === "wide" ? 0.03 : 0), 0.02, 0.4);
    const r = this.rng.next();
    const adv0 = this.adv(att);
    let gain: number;
    let outcome: "break" | "beat" | "dominant" | "tackle";
    if (r < pBreak) outcome = "break";
    else if (r < pBreak + pBeat) outcome = "beat";
    else if (r < pBreak + pBeat + pDom) outcome = "dominant";
    else outcome = "tackle";
    this.annotate({ detail: `${mode}:${outcome}` });
    void pDom;
    void pBeat;

    ats.stats.carries += 1;
    if (cps) cps.carries += 1;
    this.exert(carrier, mode === "close" ? 1.1 : 0.8);
    this.exert(tackler, 0.9);

    // Foul play (high tackle) by the tackler.
    const pFoul = 0.0042 * (1 + (this.raw(tackler, "aggression") - this.raw(tackler, "discipline")) / 18) * (1 + (12 - this.attr(tackler, "tackling")) * 0.05);
    if (this.rng.chance(pFoul)) {
      this.tick(this.rng.range(3, 6), true, att);
      this.contactRisk(carrier, 3);
      this.awardPenalty(att, tackler, "Plaquage haut", { foulPlay: true });
      return;
    }

    let defendersBeaten = 0;
    switch (outcome) {
      case "break":
        gain = this.rng.range(12, 30) + Math.max(0, d) * 2;
        defendersBeaten = this.rng.int(1, 2);
        break;
      case "beat":
        gain = this.rng.range(3, 10) + Math.max(0, d) * 0.6;
        defendersBeaten = 1;
        break;
      case "dominant":
        gain = this.rng.range(-2, 0.8);
        break;
      default:
        gain = clamp(this.rng.normal(2.6 + d * 0.16 + (mode === "wide" ? 0.6 : 0), 1.6), -0.5, 8);
    }
    if (outcome !== "break" && outcome !== "beat") {
      dts.stats.tacklesMade += 1;
      if (tps) tps.tacklesMade += 1;
      // Assist tackle (double tackles are the norm in close-quarter rugby).
      if (this.rng.chance(mode === "close" ? 0.62 : 0.35)) {
        const helper = this.pickWeighted(dts, { BF: 1.5, OF: 1.5, LO: 1.4, N8: 1, LH: 1, TH: 1, HK: 1, IC: 0.7, FH: 0.4 }, (fp) => (fp === tackler ? 0 : 1));
        const hps = this.pstat(helper);
        dts.stats.tacklesMade += 1;
        if (hps) hps.tacklesMade += 1;
        this.exert(helper, 0.5);
      }
    } else {
      dts.stats.tacklesMissed += defendersBeaten;
      if (tps) tps.tacklesMissed += 1;
      ats.stats.defendersBeaten += defendersBeaten;
      if (cps) cps.defendersBeaten += defendersBeaten;
      // A covering defender eventually makes the tackle.
      dts.stats.tacklesMade += 1;
      const cover = this.pickWeighted(dts, { FB: 2, WG: 2, OF: 1, OC: 1 });
      const cvps = this.pstat(cover);
      if (cvps) cvps.tacklesMade += 1;
    }

    // Lateral movement.
    this.y = clamp(mode === "wide" ? this.rng.chance(0.5) ? this.rng.range(6, 22) : this.rng.range(48, 64) : this.y + this.rng.normal(0, 5), 3, 67);

    const remaining = 100 - adv0;
    const duration = mode === "close" ? this.rng.range(3.5, 6) : this.rng.range(5, 9) + gain * 0.12;
    this.tick(duration, true, att);

    // Line break: can it reach the line?
    if (outcome === "break") {
      ats.stats.lineBreaks += 1;
      if (cps) cps.lineBreaks += 1;
      this.emit("lineBreak", { side: att, playerId: carrier.p.id, importance: 2, value: Math.round(Math.min(gain, remaining)) });
      if (gain >= remaining || remaining < 22) {
        const fb = this.fullback(dts);
        const cover = fb ? this.attr(fb, "pace") * 0.6 + this.attr(fb, "positioning") * 0.4 : 8;
        const pCaught = clamp(0.42 + (cover - this.attr(carrier, "pace")) * 0.04 + (remaining > 40 ? 0.2 : 0), 0.12, 0.85);
        if (!this.rng.chance(pCaught)) {
          this.gainMetres(att, carrier, remaining);
          this.tryScored(att, carrier, "breakaway");
          return;
        }
        // Caught close to the line, support may still finish.
        const caughtAt = Math.min(adv0 + gain, 97 - this.rng.range(0, 6));
        this.gainMetres(att, carrier, caughtAt - adv0);
        if (this.adv(att) >= 88 && this.rng.chance(0.38 + (this.attr(carrier, "offloading") - 12) * 0.02)) {
          const support = this.pickWeighted(ats, { WG: 2, FB: 1.5, OF: 1.5, OC: 1, SH: 1 }, (fp) => (fp === carrier ? 0 : 1));
          ats.stats.offloads += 1;
          if (cps) cps.offloads += 1;
          this.emit("offload", { side: att, playerId: carrier.p.id, otherPlayerId: support?.p.id, importance: 1 });
          this.gainMetres(att, support, 100 - this.adv(att));
          this.tryScored(att, support, "support");
          return;
        }
        this.defOrg = 0.08;
        this.ruck(att, carrier, { dominant: false, isolated: true });
        return;
      }
      this.gainMetres(att, carrier, gain);
      this.defOrg = 0.12;
      this.ruck(att, carrier, { dominant: false, isolated: this.rng.chance(0.4) });
      return;
    }

    // Defence is compressed close to its own line: harder to make metres.
    if (remaining < 12) gain *= mode === "close" ? 0.55 : 0.7;
    // Normal carries near the line.
    if (adv0 + gain >= 100) {
      // Over the line from close range: may be held up.
      const pHeld = mode === "close" ? clamp(0.46 - d * 0.02, 0.25, 0.65) : 0.15;
      if (this.rng.chance(pHeld)) {
        this.gainMetres(att, carrier, remaining - 0.5);
        this.emit("heldUp", { side: att, playerId: carrier.p.id, importance: 1 });
        this.changePossession();
        this.ballDead({ kind: "dropoutGoalLine", side: dside }, "goalLineDropout");
        return;
      }
      this.gainMetres(att, carrier, remaining);
      this.tryScored(att, carrier, mode === "close" ? "pickAndGo" : "wide");
      return;
    }

    this.gainMetres(att, carrier, gain);
    this.contactRisk(carrier, outcome === "dominant" ? 1.6 : 1);
    this.contactRisk(tackler, 1);

    // Ball ripped in contact (choke tackle / steal while upright).
    if (outcome === "dominant" || outcome === "tackle") {
      const ripper = this.rng.chance(0.5) ? tackler : this.pickWeighted(dts, { OF: 2, BF: 1.5, LO: 1.5, N8: 1, HK: 1 });
      const pRip = clamp(0.012 + (ripper ? (this.attr(ripper, "strength") + this.attr(ripper, "jackal") - 26) * 0.0015 : 0) + (outcome === "dominant" ? 0.015 : 0), 0.004, 0.05);
      if (ripper && this.rng.chance(pRip)) {
        dts.stats.turnoversWon += 1;
        const rps = this.pstat(ripper);
        if (rps) rps.turnoversWon += 1;
        this.emit("ruckTurnover", { side: dside, playerId: ripper.p.id, importance: 1, detail: { ripped: true } });
        this.changePossession();
        this.defOrg = 0.55;
        this.next = { kind: "openPlay", side: dside, quality: "normal" };
        return;
      }
    }

    // Knock-on in contact.
    const pKnock = clamp(0.0145 + (13 - this.attr(carrier, "handling")) * 0.0017 + (wet ? 0.012 : 0) + (outcome === "dominant" ? 0.012 : 0), 0.003, 0.07);
    if (this.rng.chance(pKnock)) {
      ats.stats.handlingErrors += 1;
      if (cps) cps.handlingErrors += 1;
      this.emit("knockOn", { side: att, playerId: carrier.p.id, importance: 1 });
      this.ballDead({ kind: "scrum", side: dside, x: this.x }, "knockOn");
      return;
    }

    // Offload in the tackle.
    if (outcome !== "dominant") {
      const base = tac.offloadRisk === "high" ? 0.2 : tac.offloadRisk === "low" ? 0.05 : 0.11;
      const pTry = base * (this.attr(carrier, "offloading") / 13) * (outcome === "beat" ? 1.6 : 1);
      if (this.rng.chance(pTry)) {
        const success = clamp(0.74 + (this.attr(carrier, "offloading") - 12) * 0.022 - (wet ? 0.08 : 0), 0.4, 0.95);
        if (this.rng.chance(success)) {
          ats.stats.offloads += 1;
          if (cps) cps.offloads += 1;
          const support = this.pickWeighted(ats, mode === "close" ? CLOSE_CARRY_WEIGHTS : WIDE_CARRY_WEIGHTS, (fp) => (fp === carrier ? 0 : 1));
          this.emit("offload", { side: att, playerId: carrier.p.id, otherPlayerId: support?.p.id, importance: 0 });
          this.defOrg = clamp(this.defOrg - 0.3, 0.05, 1);
          this.next = { kind: "openPlay", side: att, quality: "fast" };
          this.phase -= 1; // same phase continues
          return;
        }
        ats.stats.handlingErrors += 1;
        if (cps) cps.handlingErrors += 1;
        this.emit("knockOn", { side: att, playerId: carrier.p.id, importance: 1, detail: { offload: true } });
        this.ballDead({ kind: "scrum", side: dside, x: this.x }, "knockOn");
        return;
      }
    }

    if (outcome === "beat") this.defOrg = clamp(this.defOrg - 0.2, 0.05, 1);
    this.registerTackleExertion(dts);
    this.ruck(att, carrier, { dominant: outcome === "dominant", isolated: mode === "wide" && this.rng.chance(0.25) });
  }

  private registerTackleExertion(dts: TeamState): void {
    const helper = this.pickWeighted(dts, { BF: 1, OF: 1, LO: 1, N8: 1 });
    this.exert(helper, 0.4);
  }

  private registerTackle(dts: TeamState, tackler: FieldPlayer | null, made: boolean): void {
    if (!tackler) return;
    const ps = this.pstat(tackler);
    if (made) {
      dts.stats.tacklesMade += 1;
      if (ps) ps.tacklesMade += 1;
    } else {
      dts.stats.tacklesMissed += 1;
      if (ps) ps.tacklesMissed += 1;
    }
  }

  private gainMetres(att: Side, fp: FieldPlayer | null, metres: number): void {
    const adv0 = this.adv(att);
    const newAdv = clamp(adv0 + metres, 0.5, 100);
    const real = newAdv - adv0;
    this.x = this.abs(att, newAdv);
    this.teams[att].stats.metres += Math.max(0, real);
    const ps = this.pstat(fp);
    if (ps) ps.metres += Math.max(0, real);
    this.markEntry(att);
  }

  private teamAvg(ts: TeamState, key: AttributeKey): number {
    const f = this.onField(ts);
    return f.reduce((s, fp) => s + this.attr(fp, key), 0) / Math.max(1, f.length);
  }

  private interception(by: Side): void {
    const ts = this.teams[by];
    const fp = this.pickWeighted(ts, { OC: 2, IC: 1.5, WG: 2, FB: 0.5 });
    this.begin("interception", by, fp?.p.id);
    ts.stats.turnoversWon += 1;
    const ps = this.pstat(fp);
    if (ps) ps.turnoversWon += 1;
    this.emit("interception", { side: by, playerId: fp?.p.id, importance: 2 });
    this.changePossession();
    const remaining = 100 - this.adv(by);
    const pScore = clamp(0.55 - remaining * 0.006 + (fp ? (this.attr(fp, "pace") - 13) * 0.03 : 0), 0.05, 0.8);
    if (this.rng.chance(pScore)) {
      this.tick(remaining / 8, true, by);
      this.gainMetres(by, fp, remaining);
      this.tryScored(by, fp, "interception");
      return;
    }
    this.gainMetres(by, fp, this.rng.range(15, Math.max(16, remaining - 5)));
    this.tick(6, true, by);
    this.defOrg = 0.1;
    this.ruck(by, fp, { dominant: false, isolated: true });
  }

  /* ------------------------------ Breakdown ------------------------- */

  private ruck(att: Side, carrier: FieldPlayer | null, ctx: { dominant: boolean; isolated: boolean }): void {
    this.begin("ruck", att, carrier?.p.id);
    const ats = this.teams[att];
    const dside = other(att);
    const dts = this.teams[dside];
    const ref = this.setup.referee;
    const contestMode = dts.team.tactics.breakdownContest;
    const contestF = contestMode === "commit" ? 1.6 : contestMode === "fillLine" ? 0.45 : 1;

    const supporters = [0, 1].map(() => this.pickWeighted(ats, { LH: 1.2, TH: 1.2, HK: 1.3, LO: 1.6, BF: 1.4, OF: 1.6, N8: 1.3, IC: 0.4, OC: 0.2 }, (fp) => (fp === carrier ? 0.1 : this.attr(fp, "workRate") / 12)));
    const support =
      supporters.reduce((s, fp) => s + (fp ? this.attr(fp, "rucking") * 0.5 + this.attr(fp, "strength") * 0.25 + this.attr(fp, "workRate") * 0.25 : 6), 0) / 2;
    const jackaler = this.pickWeighted(dts, { OF: 3, BF: 1.6, N8: 1.2, HK: 1.2, IC: 0.5, LO: 0.4 }, (fp) => (this.attr(fp, "jackal") / 12) ** 2);
    const threat = jackaler ? this.attr(jackaler, "jackal") * 0.6 + this.attr(jackaler, "strength") * 0.2 + this.attr(jackaler, "anticipation") * 0.2 : 6;
    for (const s of supporters) this.exert(s, 0.45);
    this.exert(jackaler, contestF * 0.4);

    const pTurn = clamp(0.042 * contestF * Math.exp((threat - support) * 0.065) * (ctx.dominant ? 1.9 : 1) * (ctx.isolated ? 1.7 : 1) * (0.75 + ref.breakdownStrictness * 0.5), 0.004, 0.35);
    const defDisc = jackaler ? this.attr(jackaler, "discipline") : 10;
    const pAttPen = clamp(0.023 * (contestMode === "commit" ? 1.4 : contestMode === "fillLine" ? 0.7 : 1) * (0.6 + ref.breakdownStrictness * 0.8) * (1 + (12 - defDisc) * 0.04) * (dside === 1 ? 1.15 : 0.87), 0.003, 0.08);
    const r = this.rng.next();

    if (r < pTurn) {
      // Turnover: holding-on penalty or clean steal.
      dts.stats.turnoversWon += 1;
      ats.stats.rucksLost += 1;
      const jps = this.pstat(jackaler);
      if (jps) jps.turnoversWon += 1;
      this.tick(this.rng.range(2, 4), true, att);
      if (this.rng.chance(0.55)) {
        this.emit("ruckTurnover", { side: dside, playerId: jackaler?.p.id, importance: 1, detail: { penalty: true } });
        this.awardPenalty(dside, carrier, "Ballon non lâché");
        return;
      }
      this.emit("ruckTurnover", { side: dside, playerId: jackaler?.p.id, importance: 1 });
      this.changePossession();
      this.defOrg = 0.45;
      this.next = { kind: "openPlay", side: dside, quality: "normal" };
      return;
    }
    if (r < pTurn + pAttPen) {
      this.tick(this.rng.range(2, 4), true, att);
      const professional = this.adv(att) > 78 && this.rng.chance(0.5);
      this.awardPenalty(att, jackaler, this.rng.pick(["Mains au sol dans le ruck", "Hors-jeu au ruck", "Joueur pas sur ses appuis", "Entrée sur le côté"]), { professional });
      return;
    }
    // Attacking-side infringement at the ruck (sealing off, not releasing...).
    if (this.rng.chance(0.014 * (0.6 + ref.breakdownStrictness * 0.8) * (att === 1 ? 1.12 : 0.9))) {
      this.tick(this.rng.range(2, 4), true, att);
      const off = supporters[0] ?? carrier;
      this.awardPenalty(dside, off, this.rng.pick(["Plongeon sur le ruck", "Ballon non libéré", "Obstruction"]));
      return;
    }

    // Ball retained.
    const tempo = ats.team.tactics.tempo;
    const sh = this.scrumHalf(ats);
    const shSpeed = sh ? (this.attr(sh, "passing") + this.attr(sh, "decisions")) / 2 : 9;
    const speed = clamp(
      this.rng.normal(3.3 - (support - 12) * 0.1 + (contestF - 1) * 0.9 + (ctx.dominant ? 1.1 : 0) - (tempo === "fast" ? 0.45 : tempo === "slow" ? -0.6 : 0) - (shSpeed - 12) * 0.06, 0.95),
      1.6,
      9,
    );
    ats.stats.rucksWon += 1;
    ats.stats.ruckSpeedTotal += speed;
    if (speed < 3) ats.stats.fastRucks += 1;
    const quality: RuckQuality = speed < 3 ? "fast" : speed > 5 ? "slow" : "normal";
    if (quality === "fast") this.defOrg = Math.max(0.18, this.defOrg - (contestMode === "commit" ? 0.24 : 0.17));
    else if (quality === "normal") this.defOrg = Math.min(1, this.defOrg * 0.92 + 0.08);
    else this.defOrg = Math.min(1, this.defOrg + 0.28);
    this.tick(speed, true, att);
    this.next = { kind: "openPlay", side: att, quality };
  }

  /* ------------------------------ Kicking in play ------------------- */

  private kickInPlay(att: Side, adv: number, quality: RuckQuality): void {
    const ats = this.teams[att];
    const tac = ats.team.tactics;
    const pressure = tac.kickingGame === "pressure";
    type KickType = "box" | "touch" | "long" | "upAndUnder" | "grubber" | "crossfield" | "chip" | "fiftyTwentyTwo";
    let type: KickType;
    if (adv < 22) type = this.rng.weighted<KickType>([["box", pressure ? 0.55 : 0.28], ["touch", 0.5], ["long", 0.22]]);
    else if (adv < 50) type = this.rng.weighted<KickType>([["touch", 0.18], ["long", 0.36], ["box", pressure ? 0.4 : 0.18], ["upAndUnder", pressure ? 0.2 : 0.1], ["fiftyTwentyTwo", 0.1]]);
    else if (adv < 78) type = this.rng.weighted<KickType>([["long", 0.3], ["upAndUnder", pressure ? 0.35 : 0.2], ["grubber", 0.2], ["touch", 0.18], ["chip", 0.08]]);
    else type = this.rng.weighted<KickType>([["grubber", 0.4], ["crossfield", 0.35], ["chip", 0.25]]);
    void quality;

    const kicker = type === "box" ? this.scrumHalf(ats) : this.rng.weighted<FieldPlayer | null>([[this.flyHalf(ats), 0.7], [this.fullback(ats), 0.2], [this.scrumHalf(ats), 0.1]]);
    this.begin("kick", att, kicker?.p.id, type);
    const kps = this.pstat(kicker);
    if (kps) kps.kicks += 1;
    ats.stats.kicksInPlay += 1;
    const kick = kicker ? this.attr(kicker, "kicking") : 8;
    const tact = kicker ? this.attr(kicker, "tacticalKicking") : 8;
    const windy = this.setup.weather === "windy";
    this.exert(kicker, 0.2);
    const dside = other(att);

    const land = (metres: number) => {
      const newAdv = clamp(adv + metres, 2, 99);
      ats.stats.kickMetres += Math.max(0, newAdv - adv);
      this.x = this.abs(att, newAdv);
      return newAdv;
    };

    switch (type) {
      case "touch": {
        const dist = clamp(this.rng.normal(24 + kick * 0.9 - (windy ? 4 : 0), 6), 8, 55);
        const outOnFull = adv >= 22 && this.rng.chance(0.03 + (14 - kick) * 0.006);
        this.tick(this.rng.range(4, 7), true, att);
        if (outOnFull) {
          this.emit("kickToTouch", { side: att, playerId: kicker?.p.id, importance: 1, detail: { onTheFull: true } });
          this.ballDead({ kind: "lineout", side: dside, x: this.x }, "touch");
          return;
        }
        const missTouch = this.rng.chance(0.08 + (12 - tact) * 0.008);
        land(dist);
        this.y = this.rng.chance(0.5) ? 0 : 70;
        if (missTouch) {
          this.y = this.rng.range(8, 62);
          this.emit("kick", { side: att, playerId: kicker?.p.id, importance: 0, value: Math.round(dist), detail: { kind: "touchMissed" } });
          return this.receiveKick(att, kicker);
        }
        this.emit("kickToTouch", { side: att, playerId: kicker?.p.id, importance: 1, value: Math.round(dist) });
        this.changePossession();
        this.ballDead({ kind: "lineout", side: dside, x: this.x }, "touch");
        return;
      }
      case "fiftyTwentyTwo": {
        this.tick(this.rng.range(5, 8), true, att);
        const pOk = clamp(0.16 + (tact - 12) * 0.03 + (kick - 12) * 0.015, 0.03, 0.45);
        if (adv < 50 && this.rng.chance(pOk)) {
          land(clamp(78 - adv + this.rng.range(2, 15), 30, 70));
          this.y = this.rng.chance(0.5) ? 0 : 70;
          ats.stats.fiftyTwentyTwos += 1;
          this.emit("fiftyTwentyTwo", { side: att, playerId: kicker?.p.id, importance: 2 });
          this.ballDead({ kind: "lineout", side: att, x: this.x }, "touch");
          return;
        }
        land(clamp(this.rng.normal(30 + kick, 6), 15, 55));
        this.y = this.rng.range(10, 60);
        this.emit("kick", { side: att, playerId: kicker?.p.id, importance: 0, detail: { kind: "long" } });
        return this.receiveKick(att, kicker);
      }
      case "long": {
        const dist = clamp(this.rng.normal(30 + kick * 1.1 - (windy ? 5 : 0), 7), 15, 65);
        this.tick(this.rng.range(4, 6), true, att);
        land(dist);
        this.y = this.rng.range(10, 60);
        this.emit("kick", { side: att, playerId: kicker?.p.id, importance: 0, value: Math.round(dist), detail: { kind: "long" } });
        if (this.adv(att) >= 98) {
          // Into the in-goal and dead: 22 drop-out to the defence.
          this.changePossession();
          return this.ballDead({ kind: "dropout22", side: dside }, "dropout22");
        }
        if (this.rng.chance(0.18)) {
          // Bounces into touch.
          this.changePossession();
          this.y = this.rng.chance(0.5) ? 0 : 70;
          return this.ballDead({ kind: "lineout", side: dside, x: this.x }, "touch");
        }
        return this.receiveKick(att, kicker);
      }
      case "box":
      case "upAndUnder": {
        const dist = type === "box" ? clamp(this.rng.normal(14 + tact * 0.6, 4), 8, 30) : clamp(this.rng.normal(18 + tact * 0.8, 5), 10, 40);
        land(dist);
        this.emit("kick", { side: att, playerId: kicker?.p.id, importance: 0, value: Math.round(dist), detail: { kind: type } });
        return this.contestHighBall(att, kicker, type === "box" ? 0.24 : 0.28, true);
      }
      case "grubber":
      case "chip":
      case "crossfield": {
        this.tick(this.rng.range(3, 6), true, att);
        const toLine = 100 - adv;
        const finisher = this.pickWeighted(ats, type === "crossfield" ? { WG: 5, FB: 1 } : { WG: 2, OC: 2, FB: 1.5, IC: 1, FH: 0.5 });
        const skill = tact * 0.6 + (finisher ? this.attr(finisher, type === "crossfield" ? "highBall" : "pace") * 0.4 : 8);
        let pSuccess = clamp(0.2 + (skill - 12) * 0.03 + (1 - this.defOrg) * 0.15, 0.05, 0.55);
        if (type === "crossfield") pSuccess *= 0.9;
        this.emit("kick", { side: att, playerId: kicker?.p.id, importance: 1, detail: { kind: type } });
        if (this.rng.chance(pSuccess)) {
          this.y = type === "crossfield" ? (this.rng.chance(0.5) ? 5 : 65) : this.rng.range(15, 55);
          if (toLine <= 22 && this.rng.chance(0.62)) {
            this.gainMetres(att, finisher, toLine);
            this.tryScored(att, finisher, type);
            return;
          }
          this.gainMetres(att, finisher, Math.min(toLine - 2, this.rng.range(8, 18)));
          this.defOrg = 0.2;
          this.emit("kickRegathered", { side: att, playerId: finisher?.p.id, importance: 1 });
          return this.ruck(att, finisher, { dominant: false, isolated: true });
        }
        // Defence gathers.
        land(Math.min(toLine + 3, this.rng.range(6, 20)));
        this.changePossession();
        if (this.adv(att) >= 99) {
          // Grounded in-goal by the defence → 22 drop-out.
          return this.ballDead({ kind: "dropout22", side: dside }, "dropout22");
        }
        this.defOrg = 0.5;
        this.next = { kind: "openPlay", side: dside, quality: "normal", afterKick: true };
        return;
      }
    }
  }

  private dropGoal(att: Side, kicker: FieldPlayer): void {
    const ts = this.teams[att];
    const dist = 100 - this.adv(att) + 8;
    const p = clamp(0.7 - Math.max(0, dist - 22) * 0.022 + (this.attr(kicker, "kicking") - 14) * 0.03 - this.pressure(att, kicker), 0.05, 0.85);
    ts.stats.dropGoalsAttempted += 1;
    this.begin("dropGoal", att, kicker.p.id);
    this.tick(3, true, att);
    const made = this.rng.chance(p);
    const ps = this.pstat(kicker);
    if (made) {
      ts.stats.dropGoalsMade += 1;
      this.addPoints(att, 3);
      if (ps) ps.points += 3;
      this.emit("dropGoal", { side: att, playerId: kicker.p.id, importance: 2, detail: { made: true } });
      this.changePossession();
      this.ballDead({ kind: "kickoff", side: other(att) }, "score");
      return;
    }
    this.emit("dropGoal", { side: att, playerId: kicker.p.id, importance: 2, detail: { made: false } });
    this.changePossession();
    this.ballDead({ kind: "dropout22", side: other(att) }, "dropout22");
  }

  /* ------------------------------ Penalties ------------------------- */

  private penalty(side: Side, x: number, y: number): void {
    // Law: a penalty awarded within 5 m of the goal line is taken on the 5 m line.
    this.x = this.abs(side, clamp(this.adv(side, x), 5, 95));
    this.y = clamp(y, 5, 65);
    this.begin("penalty", side);
    this.changePossession();
    const ts = this.teams[side];
    const adv = this.adv(side);
    const kicker = this.goalKicker(ts);
    const pGoal = adv >= 45 ? this.goalProbability(side, kicker) : 0;
    const options: PenaltyOption[] = ["touch", "scrum", "tap"];
    if (pGoal > 0.05) options.unshift("goal");
    const recommended = this.aiPenaltyChoice(side, pGoal);
    const req: PenaltyDecisionRequest = {
      kind: "penalty",
      side,
      advance: Math.round(adv),
      goalProbability: Math.round(pGoal * 100) / 100,
      options,
      recommended,
      score: [this.score[0], this.score[1]],
      clock: Math.round(this.clock),
    };
    this.tick(this.rng.range(15, 30), false);
    if (ts.team.controller === "human") {
      if (this.options.decisionHandler) {
        this.executePenalty(req, this.options.decisionHandler(req), true);
      } else {
        this.pendingDecision = req;
      }
      return;
    }
    this.executePenalty(req, recommended, false);
  }

  private aiPenaltyChoice(side: Side, pGoal: number): PenaltyOption {
    const adv = this.adv(side);
    const diff = this.score[side] - this.score[other(side)];
    const remaining = this.period >= 2 ? this.periodEnd - this.clock : 9999;
    const ts = this.teams[side];
    const attacking = ts.team.tactics.lineoutAttack === "maul";
    if (this.clock >= this.periodEnd && diff > 0 && this.period >= 2) return "touch"; // kick it dead
    if (remaining < 300 && diff < -3 && diff >= -7) return adv > 60 ? "touch" : "tap";
    if (remaining < 300 && diff >= -3 && diff <= 0 && pGoal > 0.45) return "goal";
    if (remaining < 600 && diff < -7) return adv > 55 ? "touch" : "tap";
    if (adv >= 90 && !(remaining < 600 && diff >= -3 && diff <= 0)) {
      // Five metres out: teams back their maul or scrum far more than the posts.
      return this.rng.weighted<PenaltyOption>([["touch", attacking ? 0.55 : 0.45], ["scrum", 0.25], ["goal", 0.25], ["tap", 0.05]]);
    }
    if (pGoal >= 0.62) {
      if (adv > 78 && this.rng.chance(attacking ? 0.5 : 0.3)) return "touch";
      if (adv > 92 && this.rng.chance(0.12)) return "scrum";
      return "goal";
    }
    if (pGoal >= 0.48 && this.rng.chance(0.55)) return "goal";
    if (adv > 88 && this.rng.chance(0.12)) return "scrum";
    if (this.rng.chance(0.04)) return "tap";
    return "touch";
  }

  private executePenalty(req: PenaltyDecisionRequest, choice: PenaltyOption, human: boolean): void {
    const side = req.side;
    const ts = this.teams[side];
    let final = choice;
    if (human) {
      this.emit("penaltyDecision", { side, importance: 1, detail: { choice, recommended: req.recommended } });
      // Captain may ignore the coach when trust is low.
      const captain = this.onField(ts).find((fp) => fp.p.id === ts.team.captainId);
      if (captain) {
        const trust = clamp(ts.team.captainTrust, 0, 1);
        const temperament = (20 - captain.p.hidden.temperament) / 20;
        const lead = this.raw(captain, "leadership") / 20;
        const lateF = this.period >= 2 && this.periodEnd - this.clock < 600 ? 1.6 : 1;
        const pOverride = clamp(Math.max(0, 0.5 - trust) * 0.11 * (0.5 + temperament) * (0.6 + lead) * lateF, 0, 0.06);
        if (pOverride > 0 && this.rng.chance(pOverride)) {
          const captainChoice = req.options.find((o) => o !== choice && (o === req.recommended || o === "touch")) ?? choice;
          if (captainChoice !== choice) {
            final = captainChoice;
            this.emit("captainOverride", { side, playerId: captain.p.id, importance: 2, detail: { coachChoice: choice, captainChoice } });
          }
        }
      }
    } else {
      this.emit("penaltyDecision", { side, importance: 0, detail: { choice } });
    }
    if (!req.options.includes(final)) final = "touch";

    const adv = this.adv(side);
    switch (final) {
      case "goal": {
        const kicker = this.goalKicker(ts);
        this.begin("penaltyKick", side, kicker?.p.id, "goal");
        const p = this.goalProbability(side, kicker);
        ts.stats.penaltyGoalsAttempted += 1;
        this.tick(this.rng.range(45, 70), false);
        const made = this.rng.chance(p);
        const ps = this.pstat(kicker);
        if (made) {
          ts.stats.penaltyGoalsMade += 1;
          this.addPoints(side, 3);
          if (ps) {
            ps.points += 3;
            ps.goalKicksMade += 1;
          }
          this.emit("penaltyGoal", { side, playerId: kicker?.p.id, importance: 2, detail: { made: true, distance: Math.round(100 - adv) } });
          this.ballDead({ kind: "kickoff", side: other(side) }, "score");
        } else {
          if (ps) ps.goalKicksMissed += 1;
          this.emit("penaltyGoal", { side, playerId: kicker?.p.id, importance: 2, detail: { made: false, distance: Math.round(100 - adv) } });
          this.ballDead({ kind: "dropout22", side: other(side) }, "dropout22");
        }
        return;
      }
      case "touch": {
        const kicker = this.flyHalf(ts) ?? this.goalKicker(ts);
        this.begin("penaltyKick", side, kicker?.p.id, "touch");
        if (this.clock >= this.periodEnd && this.score[side] > this.score[other(side)] && this.period >= 2) {
          this.emit("kickToTouch", { side, playerId: kicker?.p.id, importance: 1, detail: { endOfHalf: true } });
          this.endPeriod();
          return;
        }
        const k = kicker ? this.attr(kicker, "kicking") : 9;
        const gain = clamp(this.rng.normal(18 + k * 0.9, 6), 5, 50);
        const newAdv = Math.min(95, adv + gain);
        this.x = this.abs(side, newAdv);
        this.y = this.rng.chance(0.5) ? 0 : 70;
        this.tick(this.rng.range(20, 35), false);
        this.emit("kickToTouch", { side, playerId: kicker?.p.id, importance: 1, value: Math.round(newAdv - adv), detail: { penalty: true } });
        // Kicked to touch from a penalty: the lineout is played even after time.
        this.next = { kind: "lineout", side, x: this.x };
        return;
      }
      case "scrum":
        this.next = { kind: "scrum", side, x: this.x };
        return;
      case "tap":
        this.begin("tap", side, this.scrumHalf(ts)?.p.id);
        this.defOrg = 0.55;
        this.tick(3, false);
        this.next = { kind: "openPlay", side, quality: "fast" };
        return;
    }
  }

  /* ------------------------------ Set pieces ------------------------ */

  private scrumPower(ts: TeamState): number {
    if (this.uncontested) return 0;
    let total = 0;
    const weights: Record<number, number> = { 1: 1.6, 2: 1.2, 3: 1.8, 4: 0.7, 5: 0.7, 6: 0.35, 7: 0.3, 8: 0.4 };
    for (let shirt = 1; shirt <= 8; shirt++) {
      const fp = ts.slots[shirt - 1];
      const w = weights[shirt]!;
      if (!fp) {
        total += w * 4; // missing forward replaced by a back
        continue;
      }
      const tech = this.attr(fp, "scrummaging");
      const str = this.attr(fp, "strength");
      const mass = weightScore(fp.p.weightKg);
      let v = tech * 0.45 + str * 0.3 + mass * 0.25;
      // Props out of their side lose a lot.
      if (shirt === 1 || shirt === 3) {
        const fam = fp.p.positions[SHIRT_POSITION[shirt]!] ?? 1;
        if (fam < 15) v *= 0.65 + 0.35 * (fam / 20);
      }
      total += w * v;
    }
    return total / 7.05;
  }

  /** Bonus of a team that targets one opposing prop at scrum time (positive = advantage). */
  private propDuel(us: TeamState, them: TeamState): number {
    const target = us.team.targets?.scrumAt;
    if (!target || this.uncontested) return 0;
    const mine = us.slots[target === "TH" ? 0 : 2];
    const theirs = them.slots[target === "TH" ? 2 : 0];
    if (!mine || !theirs) return 0;
    const q = (fp: FieldPlayer) => this.attr(fp, "scrummaging") * 0.55 + this.attr(fp, "strength") * 0.3 + weightScore(fp.p.weightKg) * 0.15;
    return (q(mine) - q(theirs)) * 0.18;
  }

  private scrum(feed: Side, x: number): void {
    this.changePossession();
    this.x = clamp(x, 5, 95);
    this.y = clamp(this.y, 15, 55);
    this.begin("scrum", feed);
    const fts = this.teams[feed];
    const dside = other(feed);
    const dts = this.teams[dside];
    fts.stats.scrumsFed += 1;
    for (let shirt = 1; shirt <= 8; shirt++) {
      this.exert(fts.slots[shirt - 1], shirt <= 3 ? 1.6 : 0.8);
      this.exert(dts.slots[shirt - 1], shirt <= 3 ? 1.6 : 0.8);
    }
    this.tick(this.rng.range(35, 55), false);

    if (this.uncontested) {
      fts.stats.scrumsWon += 1;
      this.emit("scrum", { side: feed, importance: 0, detail: { result: "uncontested" } });
      this.defOrg = 0.85;
      this.next = { kind: "openPlay", side: feed, quality: "normal" };
      return;
    }

    const pa = this.scrumPower(fts) * (fts.team.tactics.scrumIntent === "penalty" ? 1.02 : 1);
    const pd = this.scrumPower(dts);
    // Targeted scrum: one prop duel weighs on the whole scrum (can backfire).
    const d = pa - pd + this.propDuel(fts, dts) - this.propDuel(dts, fts);
    const ref = this.setup.referee;
    // Resets.
    let resets = 0;
    while (resets < 2 && this.rng.chance(0.24)) {
      resets += 1;
      this.tick(this.rng.range(25, 40), false);
    }
    const penaltyIntent = (fts.team.tactics.scrumIntent === "penalty" ? 0.05 : fts.team.tactics.scrumIntent === "quickBall" ? -0.04 : 0) + (dts.team.tactics.scrumIntent === "penalty" ? 0.04 : 0);
    const pPen = clamp(0.21 + Math.abs(d) * 0.03 + penaltyIntent + (ref.scrumStrictness - 0.5) * 0.1 + resets * 0.06, 0.05, 0.6);
    const pFree = 0.035;
    const pAgainst = clamp(0.015 + Math.max(0, -d) * 0.02, 0.005, 0.12);
    const r = this.rng.next();
    if (r < pPen) {
      // Penalty goes to the dominant pack (slight bias to the feeding side and home side).
      const pFeedWins = sigmoid(d * 0.45 + 0.15 + (feed === 0 ? 0.18 : -0.18));
      const winner: Side = this.rng.chance(pFeedWins) ? feed : dside;
      const loser = this.teams[other(winner)];
      const culprit = this.rng.weighted<FieldPlayer | null>([[loser.slots[0] ?? null, 1], [loser.slots[2] ?? null, 1.3], [loser.slots[1] ?? null, 0.4]]);
      this.teams[winner].stats.scrumPenaltiesWon += 1;
      if (winner === feed) fts.stats.scrumsWon += 1;
      this.emit("scrum", { side: winner, importance: 1, detail: { result: "penalty", feed, resets } });
      this.awardPenalty(winner, culprit, "Mêlée : effondrement / poussée en travers");
      return;
    }
    if (r < pPen + pFree) {
      const winner: Side = this.rng.chance(0.5) ? feed : dside;
      this.teams[other(winner)].stats.freeKicksConceded += 1;
      this.emit("scrum", { side: winner, importance: 0, detail: { result: "freeKick", feed } });
      this.defOrg = 0.7;
      this.next = { kind: "openPlay", side: winner, quality: "normal" };
      return;
    }
    if (r < pPen + pFree + pAgainst) {
      dts.stats.turnoversWon += 1;
      this.emit("scrum", { side: dside, importance: 1, detail: { result: "againstTheHead", feed } });
      this.defOrg = 0.75;
      this.next = { kind: "openPlay", side: dside, quality: "normal" };
      return;
    }
    fts.stats.scrumsWon += 1;
    this.emit("scrum", { side: feed, importance: 0, detail: { result: "won", resets } });
    // Scrum strike plays: defence is set but the backline has space.
    this.defOrg = d > 1 ? 0.7 : 0.82;
    this.next = { kind: "openPlay", side: feed, quality: d > 1 ? "fast" : "normal" };
  }

  private lineout(throwing: Side, x: number): void {
    this.changePossession();
    const adv = clamp(this.adv(throwing, x), 5, 95);
    this.x = this.abs(throwing, adv);
    this.y = this.y < 35 ? 0 : 70;
    const tts = this.teams[throwing];
    this.begin("lineout", throwing, this.hooker(tts)?.p.id);
    const dside = other(throwing);
    const dts = this.teams[dside];
    tts.stats.lineoutsThrown += 1;
    this.tick(this.rng.range(18, 30), false);

    const hooker = this.hooker(tts);
    const thr = hooker ? this.attr(hooker, "lineoutThrowing") : 6;
    const jumperScore = (fp: FieldPlayer) => this.attr(fp, "lineoutJumping") * 0.5 + heightScore(fp.p.heightCm) * 0.3 + this.attr(fp, "jumping") * 0.2;
    const jumpers = (ts: TeamState) =>
      this.onField(ts)
        .filter((fp) => isForward(fp.pos) && !isFrontRow(fp.pos))
        .sort((a, b) => jumperScore(b) - jumperScore(a));
    const aj = jumpers(tts);
    const dj = jumpers(dts);
    const ja = aj.length ? (jumperScore(aj[0]!) + (aj[1] ? jumperScore(aj[1]) : 8)) / 2 : 6;
    const jd = dj.length ? (jumperScore(dj[0]!) + (dj[1] ? jumperScore(dj[1]) : 8)) / 2 : 6;
    const contest = dts.team.tactics.lineoutDefence === "contest";
    const caller = aj[0] ? this.attr(aj[0], "decisions") : 10;

    const pNotStraight = clamp(0.022 + (13 - thr) * 0.005 + (this.setup.weather === "windy" ? 0.015 : 0), 0.005, 0.1);
    const pressure = contest && !!dts.team.targets?.lineoutPressure;
    const pSteal = contest ? clamp(0.065 + (jd - ja) * 0.015 + (13 - thr) * 0.007 - (caller - 12) * 0.004 + (pressure ? (jd >= ja ? 0.04 : 0.015) : 0), 0.015, 0.34) : 0.018;
    const pPenAtt = 0.03; // defence infringes (obstruction on jumper, early contact)
    const pPenDef = 0.025; // attack infringes (obstruction in maul set-up etc.)
    const r = this.rng.next();

    if (r < pNotStraight) {
      this.emit("lineout", { side: throwing, playerId: hooker?.p.id, importance: 1, detail: { result: "notStraight" } });
      this.ballDead({ kind: "scrum", side: dside, x: this.x }, "scrumAwarded");
      return;
    }
    if (r < pNotStraight + pSteal) {
      dts.stats.lineoutSteals += 1;
      dts.stats.turnoversWon += 1;
      const stealer = dj[0] ?? null;
      const sps = this.pstat(stealer);
      if (sps) sps.lineoutWins += 1;
      this.emit("lineout", { side: dside, playerId: stealer?.p.id, otherPlayerId: hooker?.p.id, importance: 1, detail: { result: "stolen" } });
      this.defOrg = 0.6;
      this.next = { kind: "openPlay", side: dside, quality: "normal" };
      return;
    }
    if (r < pNotStraight + pSteal + pPenAtt) {
      this.emit("lineout", { side: throwing, importance: 0, detail: { result: "penaltyWon" } });
      return this.awardPenalty(throwing, dj[0] ?? null, "Obstruction en touche");
    }
    if (r < pNotStraight + pSteal + pPenAtt + pPenDef) {
      this.emit("lineout", { side: throwing, importance: 0, detail: { result: "penaltyConceded" } });
      return this.awardPenalty(dside, aj[1] ?? aj[0] ?? null, "Obstruction en touche");
    }

    tts.stats.lineoutsWon += 1;
    const catcher = aj[this.rng.int(0, Math.min(2, aj.length - 1))] ?? null;
    const cps = this.pstat(catcher);
    if (cps) cps.lineoutWins += 1;
    this.emit("lineout", { side: throwing, playerId: catcher?.p.id, otherPlayerId: hooker?.p.id, importance: 0, detail: { result: "won" } });

    const pref = tts.team.tactics.lineoutAttack;
    let pMaul = pref === "maul" ? 0.4 : pref === "offTheTop" ? 0.08 : 0.22;
    if (adv >= 78) pMaul += pref === "offTheTop" ? 0.35 : 0.55;
    else if (adv >= 60) pMaul += 0.1;
    else if (adv < 30) pMaul *= 0.4;
    if (this.rng.chance(clamp(pMaul, 0, 0.9))) return this.maul(throwing, hooker, pressure);
    this.defOrg = 0.78;
    this.next = { kind: "openPlay", side: throwing, quality: "fast" };
  }

  private maulPower(ts: TeamState): number {
    let s = 0;
    let n = 0;
    for (let shirt = 1; shirt <= 8; shirt++) {
      const fp = ts.slots[shirt - 1];
      if (!fp) continue;
      s += this.attr(fp, "maul") * 0.4 + this.attr(fp, "strength") * 0.35 + weightScore(fp.p.weightKg) * 0.25;
      n += 1;
    }
    return n ? (s / n) * (0.75 + n / 32) : 5;
  }

  private maul(att: Side, hooker: FieldPlayer | null, defenceJumped = false): void {
    this.begin("maul", att, hooker?.p.id);
    const ats = this.teams[att];
    const dside = other(att);
    const dts = this.teams[dside];
    ats.stats.mauls += 1;
    const pa = this.maulPower(ats);
    // Defenders who went up to contest the throw are late to set against the maul.
    const pd = this.maulPower(dts) + (dts.team.tactics.lineoutDefence === "sack" ? 1.2 : 0) - (defenceJumped ? 0.9 : 0);
    const d = pa - pd;
    let metres = 0;
    for (let step = 0; step < 3; step++) {
      const g = clamp(this.rng.normal(1.9 + d * 0.5, 2), -1, 9);
      metres += g;
      this.tick(this.rng.range(3, 5), true, att);
      for (let shirt = 1; shirt <= 8; shirt++) {
        this.exert(ats.slots[shirt - 1], 0.5);
        this.exert(dts.slots[shirt - 1], 0.5);
      }
      const advNow = this.adv(att) + metres;
      if (advNow >= 100) {
        // Maul try, usually finished by the hooker.
        this.gainMetres(att, hooker, 100 - this.adv(att));
        ats.stats.maulMetres += Math.max(0, metres);
        this.emit("maul", { side: att, importance: 1, value: Math.round(metres), detail: { result: "try" } });
        this.tryScored(att, hooker, "maul");
        return;
      }
      // Illegal collapse by the defence (penalty, maybe penalty try).
      if (this.rng.chance(clamp(0.055 + Math.max(0, d) * 0.02, 0.02, 0.15))) {
        this.gainMetres(att, null, Math.max(0, metres));
        ats.stats.maulMetres += Math.max(0, metres);
        const culprit = this.pickWeighted(dts, { LO: 2, BF: 1, N8: 1, LH: 1, TH: 1 });
        if (this.adv(att) >= 95 && this.rng.chance(0.4)) {
          dts.stats.penaltiesConceded += 1;
          this.emit("maul", { side: att, importance: 1, detail: { result: "penaltyTry" } });
          if (culprit) this.card(dts, culprit, "yellow");
          ats.stats.tries += 1;
          this.addPoints(att, 7);
          this.emit("try", { side: att, importance: 2, detail: { how: "penaltyTry" } });
          this.changePossession();
          this.tick(60, false);
          this.x = 50;
          this.ballDead({ kind: "kickoff", side: dside }, "score");
          return;
        }
        this.emit("maul", { side: att, importance: 1, value: Math.round(metres), detail: { result: "penalty" } });
        return this.awardPenalty(att, culprit, "Maul écroulé");
      }
      if (d < -1 && this.rng.chance(0.25)) break; // maul stopped
    }
    this.gainMetres(att, hooker, Math.max(0, metres));
    ats.stats.maulMetres += Math.max(0, metres);
    this.emit("maul", { side: att, importance: 0, value: Math.round(metres), detail: { result: metres > 1 ? "advance" : "stopped" } });
    if (metres <= 0.5 && this.rng.chance(0.3)) {
      // Held up maul → turnover scrum.
      this.ballDead({ kind: "scrum", side: dside, x: this.x }, "scrumAwarded");
      return;
    }
    this.defOrg = metres > 4 ? 0.5 : 0.85;
    this.next = { kind: "openPlay", side: att, quality: metres > 3 ? "fast" : "slow" };
  }

  /* ------------------------------ Result ---------------------------- */

  result(): MatchResult {
    const [h, a] = this.score;
    let winner: Side | null = h > a ? 0 : a > h ? 1 : null;
    if (winner === null && this.decidedBy === "tries") winner = this.teams[0].stats.tries > this.teams[1].stats.tries ? 0 : 1;
    if (winner === null && this.decidedBy === "kickCompetition") winner = this.kickCompWinner;

    const rules = this.setup.bonus ?? TOP14_BONUS;
    const bonus = ([0, 1] as Side[]).map((s) => {
      const t = this.teams[s].stats.tries;
      const ot = this.teams[other(s)].stats.tries;
      const won = this.score[s] > this.score[other(s)];
      const offensive = rules.offensive === "tries4" ? t >= 4 : rules.offensive === "margin3" ? t - ot >= 3 : won && t - ot >= 3;
      const margin = this.score[other(s)] - this.score[s];
      const defensive = margin > 0 && margin <= rules.defensiveMargin;
      return { offensive, defensive };
    }) as MatchResult["bonus"];
    const competitionPoints = ([0, 1] as Side[]).map((s) => {
      const base = h === a ? 2 : this.score[s] > this.score[other(s)] ? 4 : 0;
      return base + (bonus[s].offensive ? 1 : 0) + (bonus[s].defensive ? 1 : 0);
    }) as [number, number];

    const playerStats = this.teams.map((ts) => {
      const list: PlayerMatchStats[] = [];
      for (const fp of ts.all.values()) {
        const ps = ts.ps.get(fp.p.id)!;
        if (!fp.everOn) continue;
        const secs = fp.secs + (fp.onAt !== null ? this.clock - fp.onAt : 0);
        ps.minutes = Math.round(secs / 60);
        ps.finalCondition = Math.round(fp.condition);
        ps.position = fp.pos;
        list.push(ps);
      }
      return list;
    }) as [PlayerMatchStats[], PlayerMatchStats[]];
    computeRatings(playerStats, this.score);

    return {
      score: [h, a],
      tries: [this.teams[0].stats.tries, this.teams[1].stats.tries],
      winner,
      competitionPoints,
      bonus,
      teamStats: [this.teams[0].stats, this.teams[1].stats],
      playerStats,
      events: this.events,
      injuries: this.injuries,
      ballInPlaySeconds: Math.round(this.ballInPlay),
      totalSeconds: Math.round(this.clock),
      decidedBy: this.decidedBy,
    };
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function bestPosition(p: Player): Position {
  let best: Position = "LO";
  let v = -1;
  for (const [pos, f] of Object.entries(p.positions) as [Position, number][]) {
    if (f > v) {
      v = f;
      best = pos;
    }
  }
  return best;
}

function emptyPlayerStats(fp: FieldPlayer): PlayerMatchStats {
  return {
    playerId: fp.p.id, shirt: fp.shirt, position: fp.pos, minutes: 0, started: fp.started, carries: 0,
    metres: 0, lineBreaks: 0, defendersBeaten: 0, offloads: 0, passes: 0, tacklesMade: 0,
    tacklesMissed: 0, turnoversWon: 0, tries: 0, points: 0, kicks: 0, goalKicksMade: 0,
    goalKicksMissed: 0, lineoutWins: 0, handlingErrors: 0, penaltiesConceded: 0, yellowCards: 0,
    redCards: 0, finalCondition: 100, rating: 6,
  };
}

/** Convenience: simulate a full match headlessly. */
export function simulateMatch(setup: MatchSetup, options?: MatchOptions): MatchResult {
  return new MatchSimulation(setup, options).run();
}
