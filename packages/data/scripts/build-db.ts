/**
 * Builds the game database (packages/data/db) from raw facts + overrides, then prints a summary.
 * Usage: pnpm --filter @ovalie/data build-db
 */
import { buildDatabase } from "../src/rating/build.js";
import { DATABASE_REFERENCE_DATE, DATABASE_SEASON, readOverrides, readRawSquads, writeDatabase } from "../src/io.js";
import { printStrengthTable } from "./report.js";

const overrides = readOverrides();
const dbs = buildDatabase(readRawSquads(), {
  season: DATABASE_SEASON,
  referenceDate: DATABASE_REFERENCE_DATE,
  playerOverrides: overrides.players,
  clubOverrides: overrides.clubs,
});
const known = new Set(dbs.flatMap((d) => d.squad.map((e) => e.player.id)));
for (const id of Object.keys(overrides.players)) if (!known.has(id)) console.warn(`! override for unknown player "${id}"`);
writeDatabase(dbs);
console.log(`${dbs.length} clubs, ${dbs.reduce((a, d) => a + d.squad.length, 0)} joueurs écrits dans packages/data/db/\n`);
printStrengthTable(dbs);
