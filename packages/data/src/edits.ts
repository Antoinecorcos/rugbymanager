/**
 * Corrections exported by the in-game editor (M8) → database overrides. The editor writes them in
 * the override format; this merges them into packages/data/overrides (validated by the schemas).
 */
import { z } from "zod";
import { clubOverrideSchema, playerOverrideSchema, type ClubOverride, type PlayerOverride } from "./schemas.js";

export const editsFileSchema = z.object({
  format: z.literal("ovalie-manager-corrections"),
  players: z.record(z.string(), playerOverrideSchema),
  clubs: z.record(z.string(), clubOverrideSchema),
});
export type EditsFile = z.infer<typeof editsFileSchema>;

/** Merges corrections into existing overrides (a correction replaces the fields it sets). */
export function mergeEdits<T extends PlayerOverride | ClubOverride>(current: Record<string, unknown>, edits: Record<string, T>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [id, fix] of Object.entries(edits)) {
    const prev = (out[id] ?? {}) as Record<string, unknown>;
    out[id] = { ...prev, ...fix };
  }
  return out;
}
