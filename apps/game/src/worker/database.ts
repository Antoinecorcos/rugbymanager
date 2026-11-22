/** The bundled game database and 2026-27 calendar (loaded in the worker only). */
import type { ClubDatabase } from "@ovalie/data";
import type { SeasonCalendar } from "@ovalie/engine";
import calendarJson from "../../../../packages/data/calendar/2026-2027.json";

// Validated by the data package's tests (schemas, build up to date): no need to re-parse with Zod here.
const files = import.meta.glob<ClubDatabase>("../../../../packages/data/db/**/*.json", { eager: true, import: "default" });

export const DATABASE: ClubDatabase[] = Object.keys(files)
  .sort()
  .map((k) => files[k]!);

export const CALENDAR = calendarJson as unknown as SeasonCalendar;
