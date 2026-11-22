/**
 * Live match of the manager's club (M5): the match is simulated action by action while the
 * interface shows it, with the manager's decisions (penalties, substitutions, tactics, targeted
 * instructions). When it ends, it is recorded in the world exactly like a simulated fixture.
 */
import type { MatchTeam, TargetedInstructions } from "../domain/match-setup.js";
import type { Tactics } from "../domain/tactics.js";
import { MatchSimulation } from "../match/engine.js";
import type { LiveSnapshot, MatchEvent, PenaltyDecisionRequest, PenaltyOption, PlayStep, Side } from "../match/types.js";
import { playMatchDay } from "./manager.js";
import type { Referee } from "./referees.js";
import { fixtureReferee } from "./referees.js";
import { prepareFixture, type PreparedFixture } from "./simulate.js";
import type { Fixture, World } from "./types.js";

/* ------------------------------------------------------------------ penalty rules */

/**
 * An automatic penalty decision. All the conditions present must hold; the first matching rule
 * of the list wins. Without a matching rule, the manager decides (10 s, then the staff's advice).
 */
export interface PenaltyRule {
  id: string;
  /** French label shown in the interface ("Dans notre moitié : touche"). */
  label: string;
  choice: PenaltyOption;
  enabled: boolean;
  /** Distance from our own try line (metres): the penalty must be at least / at most this far. */
  minAdvance?: number;
  maxAdvance?: number;
  /** Minimum probability of a successful kick at goal (0..1). */
  minGoalChance?: number;
  /** Our score minus theirs must be within [minDiff, maxDiff]. */
  minDiff?: number;
  maxDiff?: number;
  /** Match minute range. */
  fromMinute?: number;
  toMinute?: number;
}

/** Ready-made rules offered by the interface (disabled until the manager turns them on). */
export const DEFAULT_PENALTY_RULES: readonly PenaltyRule[] = [
  { id: "own-half-touch", label: "Dans notre moitié de terrain : la touche", choice: "touch", enabled: false, maxAdvance: 50 },
  { id: "easy-goal", label: "Tir facile (70 % de réussite ou plus) : les points", choice: "goal", enabled: false, minGoalChance: 0.7 },
  { id: "five-metres-touch", label: "Dans les 22 adverses, menés de 4 à 7 points : la touche", choice: "touch", enabled: false, minAdvance: 78, minDiff: -7, maxDiff: -4 },
  { id: "late-lead-goal", label: "Dernier quart d'heure, devant au score : les points si possible", choice: "goal", enabled: false, minDiff: 1, fromMinute: 65, minGoalChance: 0.5 },
];

/** First enabled rule matching a penalty decision request, if any. */
export function matchPenaltyRule(rules: readonly PenaltyRule[] | undefined, req: PenaltyDecisionRequest): PenaltyRule | undefined {
  if (!rules) return undefined;
  const diff = req.score[req.side] - req.score[req.side === 0 ? 1 : 0];
  const minute = req.clock / 60;
  return rules.find(
    (r) =>
      r.enabled &&
      req.options.includes(r.choice) &&
      (r.minAdvance === undefined || req.advance >= r.minAdvance) &&
      (r.maxAdvance === undefined || req.advance <= r.maxAdvance) &&
      (r.minGoalChance === undefined || req.goalProbability >= r.minGoalChance) &&
      (r.minDiff === undefined || diff >= r.minDiff) &&
      (r.maxDiff === undefined || diff <= r.maxDiff) &&
      (r.fromMinute === undefined || minute >= r.fromMinute) &&
      (r.toMinute === undefined || minute <= r.toMinute),
  );
}

/* ------------------------------------------------------------------ session */

export interface LivePlayerInfo {
  id: string;
  name: string;
  /** Short name for the pitch ("A. Dupont"). */
  short: string;
  shirt: number;
  /** Natural position code. */
  position: string;
}

export interface LiveTeamInfo {
  id: string;
  name: string;
  shortName: string;
  colors: [string, string];
  players: LivePlayerInfo[];
  captainId: string;
  goalKickerId: string;
}

export interface LiveInfo {
  fixtureId: string;
  competitionId: string;
  stage: string;
  /** Side of the manager's club. */
  side: Side;
  teams: [LiveTeamInfo, LiveTeamInfo];
  referee: Pick<Referee, "id" | "name" | "nation" | "breakdownStrictness" | "scrumStrictness" | "cardStrictness">;
  weather: string;
  venue?: string;
}

export interface LiveChunk {
  steps: PlayStep[];
  /** Events of these steps (indexes in `steps[].ev` are global: subtract `eventOffset`). */
  events: MatchEvent[];
  eventOffset: number;
  snapshot: LiveSnapshot;
  /** The match waits for the manager's penalty decision. */
  decision?: PenaltyDecisionRequest;
  /** Decisions taken automatically by a rule during this chunk. */
  autoDecisions: { clock: number; choice: PenaltyOption; rule: string }[];
  finished: boolean;
}

const shortName = (first: string, last: string) => `${first.charAt(0)}. ${last}`;

export class LiveSession {
  readonly fixture: Fixture;
  readonly prepared: PreparedFixture;
  readonly side: Side;
  private sim: MatchSimulation;
  private stepCursor = 0;
  private eventCursor = 0;
  private rules: readonly PenaltyRule[];

  constructor(w: World) {
    const m = w.manager;
    if (!m) throw new Error("Aucune carrière en cours");
    const f = w.fixtures.find((x) => x.date === w.date && !x.result && (x.home === m.clubId || x.away === m.clubId));
    if (!f) throw new Error("Pas de match aujourd'hui");
    this.fixture = f;
    this.prepared = prepareFixture(w, f);
    this.side = f.home === m.clubId ? 0 : 1;
    const mine: MatchTeam = { ...(this.side === 0 ? this.prepared.setup.home : this.prepared.setup.away), controller: "human" };
    if (this.side === 0) this.prepared.setup.home = mine;
    else this.prepared.setup.away = mine;
    this.rules = m.penaltyRules ?? [];
    this.sim = new MatchSimulation(this.prepared.setup, { trace: true });
    if (m.autoSubs === false) this.sim.setAutoSubstitutions(this.side, false);
  }

  info(w: World): LiveInfo {
    const team = (t: MatchTeam): LiveTeamInfo => {
      const club = w.clubs[t.id];
      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        colors: club?.colors ?? ["#3987e5", "#ffffff"],
        players: t.players.map((p, i) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, short: shortName(p.firstName, p.lastName), shirt: i + 1, position: Object.entries(p.positions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "" })),
        captainId: t.captainId,
        goalKickerId: t.goalKickerId,
      };
    };
    const ref = fixtureReferee(w, this.fixture);
    const info: LiveInfo = {
      fixtureId: this.fixture.id,
      competitionId: this.fixture.competitionId,
      stage: this.fixture.stage,
      side: this.side,
      teams: [team(this.prepared.setup.home), team(this.prepared.setup.away)],
      referee: { id: ref.id, name: ref.name, nation: ref.nation, breakdownStrictness: ref.breakdownStrictness, scrumStrictness: ref.scrumStrictness, cardStrictness: ref.cardStrictness },
      weather: this.prepared.setup.weather,
    };
    if (this.fixture.venue) info.venue = this.fixture.venue;
    return info;
  }

  get finished(): boolean {
    return this.sim.isFinished();
  }

  get pendingDecision(): PenaltyDecisionRequest | null {
    return this.sim.pendingDecision;
  }

  /**
   * Simulates the next part of the match: at least `seconds` of match clock, stopping early on a
   * penalty decision for the manager or at the end of the match.
   */
  next(seconds = 12): LiveChunk {
    const auto: LiveChunk["autoDecisions"] = [];
    const start = this.sim.getClock();
    while (!this.sim.isFinished()) {
      const req = this.sim.pendingDecision;
      if (req) {
        const rule = matchPenaltyRule(this.rules, req);
        if (!rule) break;
        auto.push({ clock: req.clock, choice: rule.choice, rule: rule.label });
        this.sim.submitPenaltyDecision(rule.choice);
        continue;
      }
      this.sim.step();
      // A new decision is checked against the rules at the top of the loop.
      if (!this.sim.pendingDecision && this.sim.getClock() - start >= seconds && this.sim.getTrace().length > this.stepCursor) break;
    }
    return this.chunk(auto);
  }

  /** Answers the pending penalty decision, then simulates the next part. */
  decide(choice: PenaltyOption, seconds = 12): LiveChunk {
    if (this.sim.pendingDecision) this.sim.submitPenaltyDecision(choice);
    return this.next(seconds);
  }

  /** Penalty rules changed during the match. */
  setRules(rules: readonly PenaltyRule[]): void {
    this.rules = rules.map((r) => ({ ...r }));
  }

  setTactics(tactics: Tactics): LiveSnapshot {
    this.sim.setTactics(this.side, tactics);
    return this.sim.snapshot();
  }

  setTargets(targets: TargetedInstructions | undefined): LiveSnapshot {
    this.sim.setTargets(this.side, targets);
    return this.sim.snapshot();
  }

  setAutoSubs(on: boolean): LiveSnapshot {
    this.sim.setAutoSubstitutions(this.side, on);
    return this.sim.snapshot();
  }

  /** Returns an error message, or null when the substitution is scheduled. */
  substitute(offId: string, onId: string): string | null {
    return this.sim.requestSubstitution(this.side, offId, onId);
  }

  cancelSubstitution(onId: string): LiveSnapshot {
    this.sim.cancelSubstitution(this.side, onId);
    return this.sim.snapshot();
  }

  snapshot(): LiveSnapshot {
    return this.sim.snapshot();
  }

  /** Plays the rest of the match (pending decisions: staff's advice) and records it in the world. */
  finish(w: World): Fixture {
    const result = this.sim.run();
    const played = playMatchDay(w, { [this.fixture.id]: { prepared: this.prepared, result } });
    if (!played) throw new Error("Le match n'a pas pu être enregistré");
    return played;
  }

  private chunk(autoDecisions: LiveChunk["autoDecisions"]): LiveChunk {
    const trace = this.sim.getTrace();
    const steps = trace.slice(this.stepCursor);
    this.stepCursor = trace.length;
    const all = this.sim.getEvents();
    const end = steps.length ? steps[steps.length - 1]!.ev[1] : this.eventCursor;
    const events = all.slice(this.eventCursor, end);
    const chunk: LiveChunk = { steps, events, eventOffset: this.eventCursor, snapshot: this.sim.snapshot(), autoDecisions, finished: this.sim.isFinished() };
    this.eventCursor = end;
    if (this.sim.pendingDecision) chunk.decision = this.sim.pendingDecision;
    return chunk;
  }
}
