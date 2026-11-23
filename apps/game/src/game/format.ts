/** Display helpers (French labels, stars, money, dates, club accent colour). */
import { ageOn, NATION_NAME_FR, playerLevel, type Player, type Position, type World } from "@ovalie/engine";

export const POSITION_SHORT_FR: Record<Position, string> = {
  LH: "PG",
  HK: "TAL",
  TH: "PD",
  LO: "2L",
  BF: "3L6",
  OF: "3L7",
  N8: "N°8",
  SH: "DM",
  FH: "DO",
  IC: "1C",
  OC: "2C",
  WG: "AIL",
  FB: "ARR",
};

export const POSITION_ORDER: Position[] = ["LH", "HK", "TH", "LO", "BF", "OF", "N8", "SH", "FH", "IC", "OC", "WG", "FB"];

export const LEAGUE_LABEL: Record<string, string> = {
  TOP14: "Top 14",
  PROD2: "Pro D2",
  NATIONALE: "Nationale",
  NATIONALE2: "Nationale 2",
  PREM: "PREM",
  URC: "URC",
  OTHER: "Invité",
};

export const COMPETITION_SHORT: Record<string, string> = {
  top14: "Top 14",
  prod2: "Pro D2",
  nationale: "Nationale",
  prem: "PREM",
  urc: "URC",
  "champions-cup": "Champions Cup",
  "challenge-cup": "Challenge Cup",
  "nations-championship": "Nations Ch.",
  "six-nations": "Six Nations",
  "world-cup": "Coupe du monde",
};

const MORE_NATIONS: Record<string, string> = {
  ZIM: "Zimbabwe", KEN: "Kenya", HKG: "Hong Kong", GER: "Allemagne", RUS: "Russie", COK: "Îles Cook", SUI: "Suisse", MAR: "Maroc",
  CIV: "Côte d'Ivoire", SEN: "Sénégal", ALG: "Algérie", TUN: "Tunisie", BRA: "Brésil", PAR: "Paraguay", ZAM: "Zambie", MDG: "Madagascar",
  KOR: "Corée du Sud", POL: "Pologne", SWE: "Suède", CZE: "Tchéquie", LTU: "Lituanie", UKR: "Ukraine", MLT: "Malte", ISR: "Israël",
  CMR: "Cameroun", GHA: "Ghana", UGA: "Ouganda", HUN: "Hongrie", AUT: "Autriche", DEN: "Danemark", NOR: "Norvège", FIN: "Finlande",
  CRO: "Croatie", SRB: "Serbie", BUL: "Bulgarie", MEX: "Mexique", COL: "Colombie", VEN: "Venezuela", PER: "Pérou", PNG: "Papouasie",
  NIU: "Niue", TAH: "Tahiti", NCL: "Nouvelle-Calédonie", WLF: "Wallis-et-Futuna", REU: "La Réunion", GUF: "Guyane", MRI: "Maurice",
};
export const nationName = (code: string): string => NATION_NAME_FR[code] ?? MORE_NATIONS[code] ?? code;

/** Level (1–20) as FM-style stars, 0.5 to 5 (≈ 0.5 for a Nationale reserve, 5 for a world-class player). */
export const levelStars = (level: number): number => Math.max(0.5, Math.min(5, Math.round(((level - 8) / 9) * 5 * 2) / 2));
export const playerStars = (p: Player): { current: number; potential: number } => ({
  current: levelStars(playerLevel(p)),
  potential: levelStars((p.potentialAbility ?? p.currentAbility ?? 100) / 10),
});

export const fullName = (p: Pick<Player, "firstName" | "lastName">): string => `${p.firstName} ${p.lastName}`;
export const shortName = (p: Pick<Player, "firstName" | "lastName">): string => `${p.firstName.charAt(0)}. ${p.lastName}`;
export const ageIn = (w: World, p: Player): number => ageOn(p.birthDate, w.date);

export const formatMoney = (eur: number): string =>
  eur >= 1e6 ? `${(eur / 1e6).toFixed(1).replace(".", ",")} M€` : `${Math.round(eur / 1e3)} k€`;

const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
/** "sam. 5 sept." */
export const dateShort = (d: string): string => `${DAYS_SHORT[weekdayOf(d)]} ${Number(d.slice(8, 10))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}`;
/** "5 sept. 2026" */
export const dateMedium = (d: string): string => `${Number(d.slice(8, 10))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const monthLabel = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** 1 → "1er", 2 → "2e". */
export const ordinal = (n: number): string => `${n}${n === 1 ? "er" : "e"}`;

export const fmt1 = (v: number): string => v.toFixed(1).replace(".", ",");
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n > 1 ? many : one}`;

// ------------------------------------------------------------------ colours

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
};
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const toHex = (rgb: number[]) => "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");
const mixWhite = (hex: string, t: number) => toHex(hexToRgb(hex).map((c) => c + (1 - c) * t));
const saturation = (hex: string) => {
  const c = hexToRgb(hex);
  return Math.max(...c) - Math.min(...c);
};

/**
 * Accent colour for the dark interface from the club colours: the more colourful of the two,
 * lightened until it reaches 3:1 against the surface (Toulouse red stays red, a black-and-white club gets white).
 */
export function clubAccent(colors: readonly [string, string] | undefined, surface = "#161a20"): { accent: string; ink: string } {
  const [a, b] = colors ?? ["#3987e5", "#ffffff"];
  let accent = saturation(a) >= 0.25 || saturation(b) < 0.25 ? a : b;
  if (saturation(accent) < 0.25) accent = luminance(a) > luminance(b) ? a : b;
  for (let t = 0.1; contrast(accent, surface) < 3 && t <= 1; t += 0.1) accent = mixWhite(accent, t);
  // Button text on the accent must reach 4.5:1 (mid-tones reach it with neither ink): lighten a little more.
  const inkContrast = (c: string) => Math.max(contrast(c, "#0b0d10"), contrast(c, "#ffffff"));
  for (let i = 0; inkContrast(accent) < 4.5 && i < 10; i++) accent = mixWhite(accent, 0.08);
  const ink = contrast(accent, "#0b0d10") >= contrast(accent, "#ffffff") ? "#0b0d10" : "#ffffff";
  return { accent, ink };
}

const STAGE_FR: Record<string, string> = { barrage: "Barrage", demi: "Demi-finale", finale: "Finale", access: "Match d'accession", huitieme: "Huitième de finale", quart: "Quart de finale", "petite-finale": "Match pour la 3e place", "place-3": "Match pour la 3e place" };
/** "J12" → "12e journée", "poule-2-J3" → "Poule 2 · J3", "demi" → "Demi-finale". */
export function stageFr(stage: string): string {
  const j = /^J(\d+)$/.exec(stage);
  if (j) return `${j[1]}${j[1] === "1" ? "re" : "e"} journée`;
  const p = /^poule-(\d+)-J(\d+)$/.exec(stage);
  if (p) return `Poule ${p[1]} · J${p[2]}`;
  return STAGE_FR[stage] ?? stage.replace(/^finale-(\d+)$/, "Finale de classement ($1)");
}

export const WEATHER_FR: Record<string, string> = { dry: "Temps sec", wet: "Pluie", windy: "Vent" };
