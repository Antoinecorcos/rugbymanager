/** Messages between the interface (main thread) and the game worker, which owns the world. */
import type { ContinueResult, ManagerProfile, ManagerState, World } from "@ovalie/engine";

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
export type ManagerPatch = Partial<Pick<ManagerState, "plans" | "activePlan" | "matchPlans" | "selection" | "newsRead">>;

export type Request =
  | { kind: "catalogue" }
  | { kind: "saveInfo" }
  | { kind: "load" }
  | { kind: "newGame"; profile: ManagerProfile; clubId: string; seed: string }
  | { kind: "continue" }
  | { kind: "playMatch" }
  | { kind: "updateManager"; patch: ManagerPatch }
  | { kind: "deleteSave" };

export type Response =
  | { kind: "catalogue"; clubs: CatalogueClub[] }
  | { kind: "saveInfo"; info: SaveInfo | null }
  | { kind: "world"; world: World | null; stop?: ContinueResult; playedFixtureId?: string }
  | { kind: "ok" }
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
