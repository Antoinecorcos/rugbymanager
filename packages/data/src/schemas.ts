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
  /** ISO date. */
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

export const clubSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(2).max(4),
  country: z.string().length(3),
  league: z.enum(["TOP14", "PROD2", "NATIONALE", "PREM", "URC", "OTHER"]),
  colors: z.tuple([z.string(), z.string()]),
  stadium: stadiumSchema,
  /** Annual budget in euros (estimate). */
  budgetEur: z.number().nonnegative().optional(),
  /** Reputation 1–200 (FM style). */
  reputation: z.number().int().min(1).max(200),
  founded: z.number().int().optional(),
  honours: z.array(z.object({ competition: z.string(), seasons: z.array(z.string()) })).default([]),
});

export const squadEntrySchema = z.object({
  player: playerSchema,
  contract: contractSchema,
  shirtNumber: z.number().int().positive().optional(),
});

export type Club = z.infer<typeof clubSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type SquadEntry = z.infer<typeof squadEntrySchema>;
export type PositionCode = Position;
