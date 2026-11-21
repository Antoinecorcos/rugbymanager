/** Rugby union positions. Shirt numbers 4/5 share LO and 11/14 share WG. */
export const POSITIONS = [
  "LH", // 1 loosehead prop
  "HK", // 2 hooker
  "TH", // 3 tighthead prop
  "LO", // 4-5 lock
  "BF", // 6 blindside flanker
  "OF", // 7 openside flanker
  "N8", // 8 number eight
  "SH", // 9 scrum-half
  "FH", // 10 fly-half
  "IC", // 12 inside centre
  "OC", // 13 outside centre
  "WG", // 11-14 wing
  "FB", // 15 fullback
] as const;

export type Position = (typeof POSITIONS)[number];

export const SHIRT_POSITION: Readonly<Record<number, Position>> = {
  1: "LH",
  2: "HK",
  3: "TH",
  4: "LO",
  5: "LO",
  6: "BF",
  7: "OF",
  8: "N8",
  9: "SH",
  10: "FH",
  11: "WG",
  12: "IC",
  13: "OC",
  14: "WG",
  15: "FB",
};

export const POSITION_LABEL_FR: Readonly<Record<Position, string>> = {
  LH: "Pilier gauche",
  HK: "Talonneur",
  TH: "Pilier droit",
  LO: "Deuxième ligne",
  BF: "3e ligne aile (6)",
  OF: "3e ligne aile (7)",
  N8: "Numéro 8",
  SH: "Demi de mêlée",
  FH: "Demi d'ouverture",
  IC: "Premier centre",
  OC: "Second centre",
  WG: "Ailier",
  FB: "Arrière",
};

const FORWARDS: ReadonlySet<Position> = new Set(["LH", "HK", "TH", "LO", "BF", "OF", "N8"]);
const FRONT_ROW: ReadonlySet<Position> = new Set(["LH", "HK", "TH"]);
const BACK_ROW: ReadonlySet<Position> = new Set(["BF", "OF", "N8"]);

export const isForward = (p: Position): boolean => FORWARDS.has(p);
export const isFrontRow = (p: Position): boolean => FRONT_ROW.has(p);
export const isBackRow = (p: Position): boolean => BACK_ROW.has(p);
export const shirtIsForward = (shirt: number): boolean => shirt >= 1 && shirt <= 8;
