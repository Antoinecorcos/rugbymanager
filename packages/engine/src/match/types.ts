import type { TargetedInstructions } from "../domain/match-setup.js";
import type { Position } from "../domain/positions.js";
import type { Tactics } from "../domain/tactics.js";

export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export type EventType =
  | "kickoff"
  | "carry"
  | "lineBreak"
  | "offload"
  | "knockOn"
  | "forwardPass"
  | "interception"
  | "ruckTurnover"
  | "penalty"
  | "penaltyDecision"
  | "captainOverride"
  | "penaltyGoal"
  | "dropGoal"
  | "kick"
  | "kickToTouch"
  | "fiftyTwentyTwo"
  | "kickCaught"
  | "kickRegathered"
  | "lineout"
  | "maul"
  | "scrum"
  | "try"
  | "tryDisallowed"
  | "heldUp"
  | "conversion"
  | "yellowCard"
  | "redCard"
  | "cardReturn"
  | "substitution"
  | "injury"
  | "hia"
  | "hiaReturn"
  | "uncontestedScrums"
  | "dropout"
  | "halfTime"
  | "fullTime"
  | "extraTime"
  | "kickCompetition";

export interface MatchEvent {
  /** Match clock in seconds (0..4800, more in extra time). */
  t: number;
  period: number;
  type: EventType;
  side?: Side;
  playerId?: string;
  otherPlayerId?: string;
  /** Ball position, metres from the home try line (0..100). */
  x?: number;
  /** Lateral position, 0..70. */
  y?: number;
  value?: number;
  detail?: Record<string, string | number | boolean>;
  score: [number, number];
  /** 2 = key moment (highlights), 1 = normal, 0 = detail. */
  importance: 0 | 1 | 2;
}

export type PenaltyOption = "goal" | "touch" | "scrum" | "tap";

export interface PenaltyDecisionRequest {
  kind: "penalty";
  side: Side;
  /** Metres from the deciding team's own try line. */
  advance: number;
  goalProbability: number;
  options: PenaltyOption[];
  recommended: PenaltyOption;
  score: [number, number];
  clock: number;
}

export interface TeamStats {
  points: number;
  tries: number;
  conversionsMade: number;
  conversionsAttempted: number;
  penaltyGoalsMade: number;
  penaltyGoalsAttempted: number;
  dropGoalsMade: number;
  dropGoalsAttempted: number;
  carries: number;
  metres: number;
  lineBreaks: number;
  defendersBeaten: number;
  offloads: number;
  passes: number;
  tacklesMade: number;
  tacklesMissed: number;
  turnoversWon: number;
  rucksWon: number;
  rucksLost: number;
  fastRucks: number;
  ruckSpeedTotal: number;
  mauls: number;
  maulMetres: number;
  lineoutsThrown: number;
  lineoutsWon: number;
  lineoutSteals: number;
  scrumsFed: number;
  scrumsWon: number;
  scrumPenaltiesWon: number;
  penaltiesConceded: number;
  freeKicksConceded: number;
  yellowCards: number;
  redCards: number;
  kicksInPlay: number;
  kickMetres: number;
  fiftyTwentyTwos: number;
  handlingErrors: number;
  entries22: number;
  pointsFrom22: number;
  possessionSeconds: number;
  territorySeconds: number;
  injuries: number;
  hias: number;
}

export interface PlayerMatchStats {
  playerId: string;
  shirt: number;
  position: Position;
  minutes: number;
  started: boolean;
  carries: number;
  metres: number;
  lineBreaks: number;
  defendersBeaten: number;
  offloads: number;
  passes: number;
  tacklesMade: number;
  tacklesMissed: number;
  turnoversWon: number;
  tries: number;
  points: number;
  kicks: number;
  goalKicksMade: number;
  goalKicksMissed: number;
  lineoutWins: number;
  handlingErrors: number;
  penaltiesConceded: number;
  yellowCards: number;
  redCards: number;
  finalCondition: number;
  rating: number;
}

export interface MatchInjury {
  playerId: string;
  side: Side;
  type: string;
  /** Expected days out. */
  days: number;
  concussion: boolean;
}

export interface MatchResult {
  score: [number, number];
  tries: [number, number];
  winner: Side | null;
  /** Competition points earned (win/draw + bonuses), using the setup bonus rules. */
  competitionPoints: [number, number];
  bonus: [{ offensive: boolean; defensive: boolean }, { offensive: boolean; defensive: boolean }];
  teamStats: [TeamStats, TeamStats];
  playerStats: [PlayerMatchStats[], PlayerMatchStats[]];
  events: MatchEvent[];
  injuries: MatchInjury[];
  ballInPlaySeconds: number;
  totalSeconds: number;
  decidedBy?: "extraTime" | "tries" | "kickCompetition";
}

export const emptyTeamStats = (): TeamStats => ({
  points: 0, tries: 0, conversionsMade: 0, conversionsAttempted: 0, penaltyGoalsMade: 0,
  penaltyGoalsAttempted: 0, dropGoalsMade: 0, dropGoalsAttempted: 0, carries: 0, metres: 0,
  lineBreaks: 0, defendersBeaten: 0, offloads: 0, passes: 0, tacklesMade: 0, tacklesMissed: 0,
  turnoversWon: 0, rucksWon: 0, rucksLost: 0, fastRucks: 0, ruckSpeedTotal: 0, mauls: 0,
  maulMetres: 0, lineoutsThrown: 0, lineoutsWon: 0, lineoutSteals: 0, scrumsFed: 0, scrumsWon: 0,
  scrumPenaltiesWon: 0, penaltiesConceded: 0, freeKicksConceded: 0, yellowCards: 0, redCards: 0,
  kicksInPlay: 0, kickMetres: 0, fiftyTwentyTwos: 0, handlingErrors: 0, entries22: 0,
  pointsFrom22: 0, possessionSeconds: 0, territorySeconds: 0, injuries: 0, hias: 0,
});

/* ------------------------------------------------------------------ */
/* Play-by-play trace (live view)                                      */
/* ------------------------------------------------------------------ */

export type PlayKind =
  | "kickoff"
  | "dropout"
  | "kick"
  | "contest"
  | "receive"
  | "carry"
  | "ruck"
  | "maul"
  | "scrum"
  | "lineout"
  | "penalty"
  | "penaltyKick"
  | "tap"
  | "dropGoal"
  | "interception"
  | "try"
  | "conversion"
  | "break";

/**
 * One action of the match as the live view shows it. The trace is recorded without drawing any
 * random number: turning it on never changes a match.
 */
export interface PlayStep {
  kind: PlayKind;
  /** Clock at the start of the action (seconds). */
  t: number;
  /** Clock seconds spent until the next action (stoppages included). */
  dur: number;
  /** Ball-in-play seconds within `dur`. */
  live: number;
  /** Team in possession / acting. */
  side: Side;
  /** Ball position at the start and end (x 0..100 from the home try line, y 0..70). */
  from: [number, number];
  to: [number, number];
  /** Ball carrier, kicker, thrower, scorer… */
  playerId?: string;
  /** Carry: close or wide; kick: kick type; scrum/lineout: result; penaltyKick: choice. */
  detail?: string;
  /** Defensive organisation (0..1) when the action starts. */
  defOrg: number;
  /** Events produced during the action: indexes [start, end) in the events array. */
  ev: [number, number];
  score: [number, number];
  period: number;
  /** Players on the field per shirt slot 1..15 (null = empty), present when it changed. */
  lineup?: [(string | null)[], (string | null)[]];
}

export interface LivePlayerState {
  /** Where the player is. */
  state: "field" | "bench" | "binned" | "off";
  /** Match condition 0..100. */
  condition: number;
  minutes: number;
  yellows: number;
  /** Shirt slot 1..15 when on the field. */
  slot?: number;
  /** Sin-bin / HIA: clock time of return. */
  returnAt?: number;
  binKind?: "yellow" | "red20" | "hia";
}

export interface LiveTeamSnapshot {
  stats: TeamStats;
  tactics: Tactics;
  targets?: TargetedInstructions;
  autoSubs: boolean;
  pendingSubs: { offId: string; onId: string }[];
  players: Record<string, LivePlayerState>;
}

export interface LiveSnapshot {
  clock: number;
  period: number;
  score: [number, number];
  finished: boolean;
  teams: [LiveTeamSnapshot, LiveTeamSnapshot];
}
