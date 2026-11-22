/** Messages between the interface (main thread) and the game worker, which owns the world. */
import type { NegotiationResult, Offer, ContinueResult, IndividualFocus, Position, SquadStatus, TalkKind, TalkResult, TeamTalk, TrainingPlan, PenaltyRule, LiveChunk, LiveInfo, LiveSnapshot, ManagerProfile, ManagerState, PenaltyOption, Tactics, TargetedInstructions, World } from "@ovalie/engine";

/** Club shown on the new-game screen. */
export interface CatalogueClub {
  id: string;
  name: string;
  shortName: string;
  league: string;
  colors: [string, string];
  city?: string;
  stadium: string;
  capacity: number;
  budgetEur?: number;
  reputation: number;
  previousRank?: { league: string; rank: number };
  /** Average level of the best 23 (1–20). */
  strength: number;
  squadSize: number;
}

export interface SaveInfo {
  clubName: string;
  managerName: string;
  date: string;
  savedAt: string;
}

/** Fields of the manager state the interface may change. */
export type ManagerPatch = Partial<Pick<ManagerState, "plans" | "activePlan" | "matchPlans" | "selection" | "newsRead" | "matchTargets" | "penaltyRules" | "autoSubs" | "teamTalks">>;

/** Manager actions on the squad (M6a). */
export type GameAction =
  | { type: "talk"; playerId: string; talk: TalkKind }
  | { type: "status"; playerId: string; status: SquadStatus }
  | { type: "training"; plan: TrainingPlan }
  | { type: "individual"; playerId: string; focus: IndividualFocus; learning?: Position }
  | { type: "rushBack"; playerId: string }
  | { type: "promote"; playerId: string }
  | { type: "release"; playerId: string }
  | { type: "scout"; playerId: string }
  | { type: "offer"; playerId: string; offer: Offer }
  | { type: "boardRequest"; kind: "wages" | "transfers" }
  | { type: "press"; fixtureId: string; answers: Record<string, string> }
  | { type: "hireStaff"; staffId: string };

export type Request =
  | { kind: "catalogue" }
  | { kind: "saveInfo" }
  | { kind: "load" }
  | { kind: "newGame"; profile: ManagerProfile; clubId: string; seed: string }
  | { kind: "continue" }
  | { kind: "playMatch" }
  | { kind: "updateManager"; patch: ManagerPatch }
  | { kind: "deleteSave" }
  // Live match (M5): the worker owns the running match.
  | { kind: "liveStart" }
  | { kind: "liveNext"; seconds?: number }
  | { kind: "liveDecide"; choice: PenaltyOption }
  | { kind: "liveTactics"; tactics: Tactics }
  | { kind: "liveTargets"; targets: TargetedInstructions | undefined }
  | { kind: "liveAutoSubs"; on: boolean }
  | { kind: "liveRules"; rules: PenaltyRule[] }
  | { kind: "liveSub"; offId: string; onId: string }
  | { kind: "liveCancelSub"; onId: string }
  | { kind: "liveFinish" }
  | { kind: "liveHalfTime"; talk: TeamTalk }
  | { kind: "action"; action: GameAction }
  | { kind: "liveAbort" };

export type Response =
  | { kind: "catalogue"; clubs: CatalogueClub[] }
  | { kind: "saveInfo"; info: SaveInfo | null }
  | { kind: "world"; world: World | null; stop?: ContinueResult; playedFixtureId?: string }
  | { kind: "ok" }
  | { kind: "liveStart"; info: LiveInfo; snapshot: LiveSnapshot }
  | { kind: "liveChunk"; chunk: LiveChunk }
  | { kind: "liveSnapshot"; snapshot: LiveSnapshot; error?: string | null }
  | { kind: "liveHalfTime"; reaction: string }
  | { kind: "action"; world: World; error: string | null; talk?: TalkResult; negotiation?: NegotiationResult; message?: string }
  | { kind: "error"; message: string };

export interface Envelope<T> {
  id: number;
  body: T;
}

/** Progress notification while "Continuer" runs (one per simulated day). */
export interface Progress {
  id: -1;
  progress: { date: string };
}
