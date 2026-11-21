import type { Player } from "./player.js";
import type { Tactics } from "./tactics.js";

/**
 * A team as it takes the field: 23 players in shirt order
 * (index 0 = shirt 1 ... index 14 = shirt 15, index 15..22 = bench 16..23).
 */
export interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
  players: Player[];
  tactics: Tactics;
  captainId: string;
  goalKickerId: string;
  /** Coach ↔ captain trust, 0..1. Low trust can make the captain ignore a penalty call. */
  captainTrust: number;
  /** "human" teams get decision requests (penalties); "ai" teams decide automatically. */
  controller: "ai" | "human";
  /** Team morale 0..1 (0.5 = neutral). */
  morale?: number;
}

export interface RefereeProfile {
  id: string;
  name: string;
  /** 0..1 — how often breakdown offences are penalised. */
  breakdownStrictness: number;
  /** 0..1 — how often scrums end in penalties rather than resets. */
  scrumStrictness: number;
  /** 0..1 — readiness to show cards. */
  cardStrictness: number;
}

export type Weather = "dry" | "wet" | "windy";

export interface MatchSetup {
  home: MatchTeam;
  away: MatchTeam;
  referee: RefereeProfile;
  weather: Weather;
  seed: number | string;
  /** Knock-out match: draws go to extra time. */
  knockout?: boolean;
  /** Bonus point rules for the competition. */
  bonus?: BonusRules;
}

export interface BonusRules {
  /** Offensive bonus: "tries4" = 4 tries or more; "margin3" = 3 tries more than opponent. */
  offensive: "tries4" | "margin3" | "margin3Win";
  /** Defensive bonus if losing by <= this margin. */
  defensiveMargin: number;
}

export const TOP14_BONUS: BonusRules = { offensive: "margin3", defensiveMargin: 5 };
export const CHAMPIONS_CUP_BONUS: BonusRules = { offensive: "margin3Win", defensiveMargin: 7 };

export const DEFAULT_REFEREE: RefereeProfile = {
  id: "ref-default",
  name: "Arbitre",
  breakdownStrictness: 0.5,
  scrumStrictness: 0.5,
  cardStrictness: 0.5,
};
