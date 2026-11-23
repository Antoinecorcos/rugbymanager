/** Zod schema of the season calendar files (packages/data/calendar/<season>.json). */
import type { SeasonCalendar } from "@ovalie/engine";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const match = z.object({ date, home: z.string(), away: z.string(), neutral: z.boolean().optional(), venue: z.string().optional() });
const round = z.object({ round: z.number().int().positive(), matches: z.array(match) });

export const seasonCalendarSchema = z.object({
  season: z.string(),
  start: date,
  end: date,
  leagues: z.array(z.object({ id: z.string(), rounds: z.array(round), knockout: z.record(z.string(), date) })),
  cups: z.array(z.object({ id: z.string(), pools: z.array(z.array(z.string())), rounds: z.array(round), knockout: z.record(z.string(), date), finalVenue: z.string().optional() })),
  internationals: z.array(
    z.object({ id: z.string(), groups: z.array(z.array(z.string())), rounds: z.array(round), finals: z.array(date).optional(), finalsVenue: z.string().optional(), knockout: z.record(z.string(), date).optional() }),
  ),
  windows: z.array(z.object({ id: z.string(), name: z.string(), start: date, end: date, nations: z.union([z.array(z.string()), z.literal("*")]) })),
}) satisfies z.ZodType<SeasonCalendar>;
