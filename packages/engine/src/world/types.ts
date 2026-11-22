/** State of the game world: JSON-serialisable (future save games), advanced day by day. */
import type { AttributeKey } from "../domain/attributes.js";
import type { BonusRules } from "../domain/match-setup.js";
import type { Position } from "../domain/positions.js";
import type { Player } from "../domain/player.js";
import type { ManagerState, MatchReport } from "./manager.js";
import type { SeasonCalendar } from "./calendar.js";
import type { IsoDate } from "./dates.js";

export interface WorldClub {
  id: string;
  name: string;
  shortName: string;
  /** Domestic league (TOP14, PROD2, NATIONALE, PREM, URC, OTHER). */
  league: string;
  country: string;
  reputation: number;
  stadium?: string;
  /** Display metadata (interface): primary and secondary colours, city, stadium capacity… */
  colors?: [string, string];
  city?: string;
  capacity?: number;
  budgetEur?: number;
  president?: string;
  headCoach?: string;
  founded?: number;
  /** Final league position last season. */
  previousRank?: { league: string; rank: number };
  /** Coaching, medical and academy staff (M6a; fictional except the head coach). */
  staff?: StaffMember[];
  /** Weekly training plan (AI clubs keep the balanced default). */
  training?: TrainingPlan;
  /** Team automatisms per unit, 0..1 (0.5 = neutral), built by the training focus. */
  sharpness?: Sharpness;
  /** Club morale 0..100 (AI clubs; the manager's club uses its players' morale). */
  morale?: number;
}

/* ------------------------------------------------------------------ M6a: staff, training */

export type StaffRole = "assistant" | "forwards" | "backs" | "defence" | "fitness" | "physio" | "doctor" | "analyst" | "youth";

export interface StaffAttributes {
  coaching: number;
  tactics: number;
  motivation: number;
  fitness: number;
  medical: number;
  youth: number;
  analysis: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  nationality: string;
  age: number;
  attributes: StaffAttributes;
  /** Fictional staff member (real assistants are not in the database). */
  generated: boolean;
}

export type TrainingIntensity = "light" | "normal" | "intense";
export type TrainingFocus = "balanced" | "setPiece" | "attack" | "defence" | "kicking" | "fitness" | "recovery";
export type ContactLevel = "low" | "normal" | "high";

export interface TrainingPlan {
  intensity: TrainingIntensity;
  focus: TrainingFocus;
  contact: ContactLevel;
}

export type SharpnessUnit = "setPiece" | "attack" | "defence" | "kicking" | "fitness";
export type Sharpness = Record<SharpnessUnit, number>;

/* ------------------------------------------------------------------ M6a: players */

export type SquadStatus = "star" | "starter" | "rotation" | "backup" | "prospect";

export interface PlayingTimePromise {
  madeOn: IsoDate;
  /** Starts required among the next `window` club matches he is available for. */
  starts: number;
  window: number;
  /** Progress since the promise. */
  matches: number;
  started: number;
  deadline: IsoDate;
  outcome?: "kept" | "broken";
}

export interface ClubMatchRecord {
  date: IsoDate;
  available: boolean;
  started: boolean;
  minutes: number;
  rating?: number;
}

/** Relationship with the manager (players of the manager's club). */
export interface PlayerHuman {
  /** Morale 0..100. */
  morale: number;
  /** Trust in the manager 0..100 (captain: low trust → he may ignore a penalty call). */
  trust: number;
  status: SquadStatus;
  promises: PlayingTimePromise[];
  /** Last individual talk. */
  lastTalk?: IsoDate;
  /** Last club matches (playing time, ratings), most recent last. */
  recent: ClubMatchRecord[];
  /** Last "unhappy" warning sent to the inbox. */
  lastComplaint?: IsoDate;
}

export interface InjuryRecord {
  type: string;
  from: IsoDate;
  days: number;
  concussion: boolean;
  training?: boolean;
}

export interface MedicalRecord {
  history: InjuryRecord[];
  /** Concussions in the career (escalating stand-downs). */
  concussions: number;
  /** Rushed back from injury: higher injury risk until this date. */
  fragileUntil?: IsoDate;
}

export type IndividualFocus = "none" | "technical" | "mental" | "physical" | "position";

/** Development bookkeeping (fractional progress until an attribute moves by one point). */
export interface PlayerDevelopment {
  progress: Partial<Record<AttributeKey, number>>;
  /** Fraction of a current-ability point. */
  caAcc: number;
  /** Current ability on the first Monday of each month. */
  history: { date: IsoDate; ca: number }[];
  focus?: IndividualFocus;
  /** Position being learnt (individual focus "position"). */
  learning?: Position;
  learningAcc?: number;
  /** Minutes played per match date, last 5 weeks (match experience). */
  minutes: { date: IsoDate; minutes: number }[];
}

/** Real-world facts about a player shown by the interface (from the database `info` block). */
export interface PlayerProfile {
  shirtNumber?: number;
  /** French JIFF status (homegrown), and whether it is an estimate. */
  jiff?: boolean;
  jiffEstimated?: boolean;
  homegrown?: boolean;
  previousClub?: string;
  arrivalYear?: number;
  /** Fictional player completing a squad. */
  generated?: boolean;
  /** Fields estimated rather than read from a source (birthDate, heightCm, weightKg, jiff). */
  estimated?: string[];
  /** Explainable rating: components of the level (club, international, age, club strength, override) and evidence 0–1. */
  rating?: Record<string, number>;
}

export interface PlayerSeasonStats {
  appearances: number;
  starts: number;
  minutes: number;
  tries: number;
  points: number;
  yellowCards: number;
  redCards: number;
  /** International caps won this season. */
  caps: number;
}

export interface PlayerState {
  player: Player;
  /** Club id; undefined for virtual national-team players (nations whose players are not in the database). */
  clubId?: string;
  /** Senior caps at the start of the game (eligibility, call-ups). */
  caps: number;
  /** Freshness 0–100: drops with minutes played (contacts), recovers daily. Low freshness → rotation. */
  freshness: number;
  injury?: { type: string; until: IsoDate; concussion: boolean };
  suspension?: { until: IsoDate; reason: string };
  /** Called up by his national team until this date. */
  duty?: { nation: string; until: IsoDate };
  /** Consecutive club matches started (rotation: rested after `ROTATION.maxStreak`). */
  startStreak: number;
  /** Mandatory rest (back from international duty) until this date, except knock-out matches. */
  restUntil?: IsoDate;
  /** Yellow cards since the last accumulation ban. */
  yellowCount: number;
  /** Season statistics per competition id. */
  stats: Record<string, PlayerSeasonStats>;
  /** Fictional player of a national team pool (NZL, AUS, JPN… whose players play outside the database). */
  virtual?: boolean;
  profile?: PlayerProfile;
  /** In the club's academy (centre de formation), not in the professional squad. */
  academy?: boolean;
  /** Relationship with the manager (manager's club only). */
  human?: PlayerHuman;
  medical?: MedicalRecord;
  dev?: PlayerDevelopment;
}

export interface FixtureResult {
  score: [number, number];
  tries: [number, number];
  /** 0 = home, 1 = away. */
  winner: 0 | 1 | null;
  competitionPoints: [number, number];
  bonus: [{ offensive: boolean; defensive: boolean }, { offensive: boolean; defensive: boolean }];
  decidedBy?: "extraTime" | "tries" | "kickCompetition";
  /** Players unavailable because of international duty (doublons), per side. */
  missingInternationals: [number, number];
  /** Best player of the match (id). */
  playerOfTheMatch?: string;
}

export interface Fixture {
  id: string;
  competitionId: string;
  /** "J12", "barrage", "demi", "finale", "access", "poule-2-J3", "huitieme", "quart"… */
  stage: string;
  date: IsoDate;
  home: string;
  away: string;
  neutral?: boolean;
  venue?: string;
  knockout?: boolean;
  result?: FixtureResult;
}

export type CompetitionKind = "league" | "cup" | "international";

export interface CompetitionState {
  id: string;
  name: string;
  kind: CompetitionKind;
  /** Participants (club ids or nation codes). */
  teams: string[];
  /** Pools / conferences (cups, Nations Championship). */
  groups?: string[][];
  bonus: BonusRules;
  /** Knock-out stage dates from the calendar. */
  knockout: Record<string, IsoDate>;
  /** Stages already generated (to generate each knock-out round once). */
  generatedStages: string[];
  /** Knock-out seeding (cups: 16 seeds, best first). */
  seeds?: string[];
  /** Final outcome when finished. */
  outcome?: CompetitionOutcome;
}

export interface CompetitionOutcome {
  champion?: string;
  runnerUp?: string;
  /** Regular season / pool ranking (league table order). */
  ranking?: string[];
  promoted?: string[];
  relegated?: string[];
  /** Free text notes ("Grand Chelem", "maintien après l'access match"…). */
  notes?: string[];
}

export interface NewsItem {
  date: IsoDate;
  /** competition id, "transfer", "medical", "international"… */
  topic: string;
  /** Related club ids (for each club's inbox). */
  clubs: string[];
  text: string;
  importance: 1 | 2 | 3;
}

export interface World {
  seed: string;
  season: string;
  date: IsoDate;
  calendar: SeasonCalendar;
  clubs: Record<string, WorldClub>;
  players: Record<string, PlayerState>;
  /** Squad of each club (player ids). */
  squads: Record<string, string[]>;
  /** Candidates of each nation that may be called up (player ids, best first is not required). */
  nationPools: Record<string, string[]>;
  competitions: Record<string, CompetitionState>;
  fixtures: Fixture[];
  news: NewsItem[];
  /** The human manager's career (absent in pure simulations). */
  manager?: ManagerState;
  /** Full match reports of the manager's matches, by fixture id. */
  reports?: Record<string, MatchReport>;
  /** Academy players of each club (ids, not in `squads`). */
  academies?: Record<string, string[]>;
  /** Version of the world extensions (save migration). */
  version?: number;
}
