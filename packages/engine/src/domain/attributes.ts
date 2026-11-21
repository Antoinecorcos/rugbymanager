/** Player attributes on a 1–20 scale (FM style). */

export const TECHNICAL_ATTRIBUTES = [
  "passing",
  "kicking", // territorial kicking in open play (distance + accuracy)
  "tacticalKicking", // box kicks, chips, grubbers, cross-kicks, 50:22
  "goalKicking",
  "highBall", // catching kicks / restarts
  "handling",
  "tackling",
  "jackal", // stealing at the breakdown
  "rucking", // cleaning out / securing ruck ball
  "scrummaging",
  "lineoutThrowing",
  "lineoutJumping",
  "maul",
  "offloading",
  "footwork", // evasion, beating a defender
] as const;

export const MENTAL_ATTRIBUTES = [
  "decisions",
  "vision",
  "anticipation",
  "composure",
  "concentration",
  "leadership",
  "discipline",
  "aggression",
  "bravery",
  "workRate",
  "positioning",
  "communication",
  "flair",
] as const;

export const PHYSICAL_ATTRIBUTES = [
  "pace",
  "acceleration",
  "strength",
  "stamina",
  "contactResilience",
  "agility",
  "balance",
  "jumping",
  "recovery",
] as const;

export const HIDDEN_ATTRIBUTES = [
  "consistency",
  "bigMatches",
  "professionalism",
  "ambition",
  "loyalty",
  "temperament",
  "injuryProneness",
  "adaptability",
] as const;

export type TechnicalAttribute = (typeof TECHNICAL_ATTRIBUTES)[number];
export type MentalAttribute = (typeof MENTAL_ATTRIBUTES)[number];
export type PhysicalAttribute = (typeof PHYSICAL_ATTRIBUTES)[number];
export type HiddenAttribute = (typeof HIDDEN_ATTRIBUTES)[number];
export type AttributeKey = TechnicalAttribute | MentalAttribute | PhysicalAttribute;

export const ALL_ATTRIBUTES: readonly AttributeKey[] = [
  ...TECHNICAL_ATTRIBUTES,
  ...MENTAL_ATTRIBUTES,
  ...PHYSICAL_ATTRIBUTES,
];

export type Attributes = Record<AttributeKey, number>;
export type HiddenAttributes = Record<HiddenAttribute, number>;

export const ATTRIBUTE_LABEL_FR: Readonly<Record<AttributeKey | HiddenAttribute, string>> = {
  passing: "Passe",
  kicking: "Jeu au pied (occupation)",
  tacticalKicking: "Jeu au pied tactique",
  goalKicking: "Buteur",
  highBall: "Jeu aérien",
  handling: "Manipulation",
  tackling: "Plaquage",
  jackal: "Grattage",
  rucking: "Nettoyage / ruck",
  scrummaging: "Mêlée",
  lineoutThrowing: "Lancer en touche",
  lineoutJumping: "Saut en touche",
  maul: "Maul",
  offloading: "Offload",
  footwork: "Appuis / feinte",
  decisions: "Décisions",
  vision: "Vision du jeu",
  anticipation: "Anticipation",
  composure: "Sang-froid",
  concentration: "Concentration",
  leadership: "Leadership",
  discipline: "Discipline",
  aggression: "Agressivité",
  bravery: "Courage",
  workRate: "Activité",
  positioning: "Placement",
  communication: "Communication",
  flair: "Flair",
  pace: "Vitesse",
  acceleration: "Accélération",
  strength: "Puissance",
  stamina: "Endurance",
  contactResilience: "Résistance aux contacts",
  agility: "Agilité",
  balance: "Équilibre",
  jumping: "Détente",
  recovery: "Récupération",
  consistency: "Régularité",
  bigMatches: "Grands matchs",
  professionalism: "Professionnalisme",
  ambition: "Ambition",
  loyalty: "Loyauté",
  temperament: "Tempérament",
  injuryProneness: "Fragilité",
  adaptability: "Adaptabilité",
};
