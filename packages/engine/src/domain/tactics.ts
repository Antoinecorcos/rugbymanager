/** Team tactics used by the match engine. Labels are French for the UI. */

export type AttackShape = "tight" | "balanced" | "wide";
export type KickingGame = "possession" | "balanced" | "territory" | "pressure";
export type Tempo = "slow" | "normal" | "fast";
export type OffloadRisk = "low" | "normal" | "high";
export type DefenceSystem = "drift" | "balanced" | "rush";
export type BreakdownContest = "fillLine" | "selective" | "commit";
export type LineoutDefence = "contest" | "sack";
export type LineoutAttack = "offTheTop" | "balanced" | "maul";
export type ScrumIntent = "quickBall" | "balanced" | "penalty";

export interface Tactics {
  attackShape: AttackShape;
  kickingGame: KickingGame;
  tempo: Tempo;
  offloadRisk: OffloadRisk;
  defenceSystem: DefenceSystem;
  breakdownContest: BreakdownContest;
  lineoutDefence: LineoutDefence;
  lineoutAttack: LineoutAttack;
  scrumIntent: ScrumIntent;
}

export const DEFAULT_TACTICS: Readonly<Tactics> = {
  attackShape: "balanced",
  kickingGame: "balanced",
  tempo: "normal",
  offloadRisk: "normal",
  defenceSystem: "balanced",
  breakdownContest: "selective",
  lineoutDefence: "contest",
  lineoutAttack: "balanced",
  scrumIntent: "balanced",
};

export const TACTIC_LABEL_FR = {
  attackShape: { tight: "Jeu au près", balanced: "Équilibré", wide: "Jeu au large" },
  kickingGame: {
    possession: "Conservation",
    balanced: "Équilibré",
    territory: "Occupation",
    pressure: "Jeu au pied de pression",
  },
  tempo: { slow: "Lent", normal: "Normal", fast: "Rapide" },
  offloadRisk: { low: "Prudent", normal: "Normal", high: "Offloads fréquents" },
  defenceSystem: { drift: "Glissée", balanced: "Équilibrée", rush: "Montée rapide (rush)" },
  breakdownContest: {
    fillLine: "Remplir la ligne",
    selective: "Sélectif",
    commit: "Contester chaque ruck",
  },
  lineoutDefence: { contest: "Contester", sack: "Ne pas sauter, défendre le maul" },
  lineoutAttack: { offTheTop: "Ballon porté rapide", balanced: "Équilibré", maul: "Maul" },
  scrumIntent: { quickBall: "Ballon rapide", balanced: "Équilibré", penalty: "Pousser pour la pénalité" },
} as const;
