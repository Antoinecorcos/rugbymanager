/** State of the game world: JSON-serialisable (future save games), advanced day by day. */
import type { BonusRules } from "../domain/match-setup.js";
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
}
