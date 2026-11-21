import {
  ALL_ATTRIBUTES,
  HIDDEN_ATTRIBUTES,
  POSITIONS,
  type AttributeKey,
  type HiddenAttribute,
  type Player,
  type Position,
} from "@ovalie/engine";
import { z } from "zod";

const rating = z.number().int().min(1).max(20);

const attributesShape = Object.fromEntries(ALL_ATTRIBUTES.map((k) => [k, rating])) as Record<AttributeKey, typeof rating>;
const hiddenShape = Object.fromEntries(HIDDEN_ATTRIBUTES.map((k) => [k, rating])) as Record<HiddenAttribute, typeof rating>;

export const positionSchema = z.enum(POSITIONS);

export const playerSchema = z
  .object({
    id: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nationality: z.string().length(3),
    secondNationality: z.string().length(3).optional(),
    heightCm: z.number().int().min(160).max(220),
    weightKg: z.number().int().min(60).max(160),
    positions: z.record(positionSchema, rating).refine((p) => Object.keys(p).length > 0, "au moins un poste"),
    attributes: z.object(attributesShape).strict(),
    hidden: z.object(hiddenShape).strict(),
    currentAbility: z.number().int().min(1).max(200).optional(),
    potentialAbility: z.number().int().min(1).max(200).optional(),
  })
  .strict() satisfies z.ZodType<Player>;

/** Contract information (M6 will extend this). */
export const contractSchema = z.object({
  clubId: z.string(),
  /** ISO date; unknown for most real players (M6 will estimate it). */
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Gross yearly salary in euros, if known/estimated. */
  salaryEur: z.number().nonnegative().optional(),
  /** French JIFF status (homegrown). */
  jiff: z.boolean().optional(),
});

export const stadiumSchema = z.object({
  name: z.string(),
  city: z.string(),
  capacity: z.number().int().positive(),
});

export const leagueSchema = z.enum(["TOP14", "PROD2", "NATIONALE", "PREM", "URC", "OTHER"]);

export const clubSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(2).max(4),
  country: z.string().length(3),
  league: leagueSchema,
  city: z.string().optional(),
  colors: z.tuple([z.string(), z.string()]),
  stadium: stadiumSchema,
  /** Annual budget in euros (estimate). */
  budgetEur: z.number().nonnegative().optional(),
  /** Reputation 1–200 (FM style). */
  reputation: z.number().int().min(1).max(200),
  founded: z.number().int().optional(),
  honours: z.array(z.object({ competition: z.string(), seasons: z.array(z.string()) })).default([]),
  president: z.string().optional(),
  headCoach: z.string().optional(),
  /** Final position last season. */
  previousRank: z.object({ league: leagueSchema, rank: z.number().int().positive() }).optional(),
  sources: z.record(z.string(), z.string()).optional(),
});

/** How a player's level was obtained (see docs/05-donnees-reelles.md). */
export const ratingBreakdownSchema = z.object({
  club: z.number(),
  international: z.number(),
  age: z.number(),
  clubStrength: z.number(),
  estimate: z.number(),
  override: z.number().optional(),
  level: z.number(),
  evidence: z.number().min(0).max(1),
});

/** Real-world facts kept next to the game player (caps, origin, data quality). */
export const playerInfoSchema = z.object({
  caps: z.number().int().nonnegative().optional(),
  homegrown: z.boolean().optional(),
  previousClub: z.string().optional(),
  arrivalYear: z.number().int().optional(),
  /** Position group as published by the league. */
  positionGroup: z.string(),
  /** Fictional player generated to complete a squad whose real roster is unknown (Nationale). */
  generated: z.boolean().optional(),
  /** Fields that were estimated rather than read from a source (birthDate, heightCm, weightKg, jiff). */
  estimated: z.array(z.string()).default([]),
  rating: ratingBreakdownSchema,
  sources: z.record(z.string(), z.string()).default({}),
});

export const squadEntrySchema = z.object({
  player: playerSchema,
  contract: contractSchema,
  shirtNumber: z.number().int().positive().optional(),
  info: playerInfoSchema.optional(),
});

/** One club of the game database with its senior squad. */
export const clubDatabaseSchema = z.object({
  club: clubSchema,
  squad: z.array(squadEntrySchema),
});

/** Manual corrections applied on top of the rating pipeline (packages/data/overrides/). */
export const playerOverrideSchema = z
  .object({
    level: z.number().min(1).max(20).optional(),
    potential: z.number().min(1).max(20).optional(),
    primary: positionSchema.optional(),
    positions: z.record(positionSchema, rating).optional(),
    attributes: z.object(attributesShape).partial().strict().optional(),
    heightCm: z.number().int().optional(),
    weightKg: z.number().int().optional(),
    note: z.string().optional(),
  })
  .strict();
export const clubOverrideSchema = z
  .object({
    colors: z.tuple([z.string(), z.string()]).optional(),
    reputation: z.number().int().min(1).max(200).optional(),
    note: z.string().optional(),
  })
  .strict();

export type Club = z.infer<typeof clubSchema>;
export type League = z.infer<typeof leagueSchema>;
export type PlayerInfo = z.infer<typeof playerInfoSchema>;
export type RatingBreakdown = z.infer<typeof ratingBreakdownSchema>;
export type ClubDatabase = z.infer<typeof clubDatabaseSchema>;
export type PlayerOverride = z.infer<typeof playerOverrideSchema>;
export type ClubOverride = z.infer<typeof clubOverrideSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type SquadEntry = z.infer<typeof squadEntrySchema>;
export type PositionCode = Position;
