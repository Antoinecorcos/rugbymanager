/**
 * "Raw facts" layer: what the import pipeline collected from public sources,
 * before any rating. Committed under packages/data/raw/ so that it can be reviewed and corrected.
 */
import { z } from "zod";

export const LEAGUES = ["TOP14", "PROD2", "NATIONALE", "PREM", "URC", "OTHER"] as const;
type League = (typeof LEAGUES)[number];

export const careerSeasonSchema = z.object({
  season: z.string(), // "2025-2026"
  competition: z.string(), // "TOP 14", "PRO D2"…
  club: z.string(),
  matches: z.number().int().nonnegative(),
  minutes: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  tries: z.number().int().nonnegative(),
  penalties: z.number().int().nonnegative(),
  drops: z.number().int().nonnegative(),
  yellowCards: z.number().int().nonnegative(),
  redCards: z.number().int().nonnegative(),
});
export type CareerSeason = z.infer<typeof careerSeasonSchema>;

export const rawPlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().optional(),
  /** Age as published by the league (used when the birth date is unknown). */
  age: z.number().int().optional(),
  nationality: z.string().length(3),
  heightCm: z.number().int().optional(),
  weightKg: z.number().int().optional(),
  /** Position group as published by the source ("1ère ligne", "Centre"…). */
  positionGroup: z.string(),
  /** Detailed position labels found (Wikipedia section / infobox), most specific first. */
  positionHints: z.array(z.string()).default([]),
  /** Senior international caps for `nationality` (if known). */
  caps: z.number().int().nonnegative().optional(),
  /** Capped by the senior national team (count may be unknown). */
  capped: z.boolean().optional(),
  /** Played rugby sevens internationally. */
  sevens: z.boolean().optional(),
  /** Trained at the current club ("Formé au club"). */
  homegrown: z.boolean().optional(),
  previousClub: z.string().optional(),
  arrivalYear: z.number().int().optional(),
  /** French JIFF status when published by a source. */
  jiff: z.boolean().optional(),
  /** Contract end year when published by a source. */
  contractUntil: z.number().int().optional(),
  /** Came back from a loan spell ("{{prêt}} Club" in the previous-club column). */
  backFromLoan: z.boolean().optional(),
  career: z.array(careerSeasonSchema).default([]),
  sources: z.object({ lnr: z.string().optional(), wikipedia: z.string().optional(), wikidata: z.string().optional() }).default({}),
});
export type RawPlayer = z.infer<typeof rawPlayerSchema>;

export const rawClubSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  league: z.enum(LEAGUES),
  country: z.string().length(3),
  city: z.string().optional(),
  stadium: z.object({ name: z.string(), city: z.string().optional(), capacity: z.number().int().positive().optional() }),
  founded: z.number().int().optional(),
  president: z.string().optional(),
  headCoach: z.string().optional(),
  budgetEur: z.number().nonnegative().optional(),
  /** Final rank last season (league + position). */
  previousRank: z.object({ league: z.enum(LEAGUES), rank: z.number().int().positive() }).optional(),
  /**
   * Level (1–20 scale) of the players generated when the real squad is unknown
   * (invited European clubs such as Black Lion or the Cheetahs). Defaults to the league level.
   */
  levelHint: z.number().optional(),
  /** Club colours (hex), taken from the source squad table styling when available. */
  colors: z.tuple([z.string(), z.string()]).optional(),
  sources: z.object({ lnr: z.string().optional(), wikipedia: z.string().optional() }).default({}),
});
export type RawClub = z.infer<typeof rawClubSchema>;

export const rawSquadSchema = z.object({
  club: rawClubSchema,
  /** ISO date of the import. */
  importedAt: z.string(),
  players: z.array(rawPlayerSchema),
});
export type RawSquad = z.infer<typeof rawSquadSchema>;
