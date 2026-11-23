/**
 * Imports the corrections exported by the in-game editor into the database overrides.
 * Usage: pnpm --filter @ovalie/data import-edits <corrections.json>
 * Then rebuild the database: pnpm --filter @ovalie/data build-db
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { editsFileSchema, mergeEdits } from "../src/edits.js";
import { OVERRIDES_DIR, readDatabase } from "../src/io.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage : pnpm --filter @ovalie/data import-edits <corrections.json>");
  process.exit(1);
}
const edits = editsFileSchema.parse(JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8")));
const known = new Set(readDatabase().flatMap((d) => d.squad.map((e) => e.player.id)));
const clubs = new Set(readDatabase().map((d) => d.club.id));
for (const id of Object.keys(edits.players)) if (!known.has(id)) console.warn(`! joueur inconnu dans la base : ${id} (ignoré)`);
for (const id of Object.keys(edits.clubs)) if (!clubs.has(id)) console.warn(`! club inconnu dans la base : ${id} (ignoré)`);
const players = Object.fromEntries(Object.entries(edits.players).filter(([id]) => known.has(id)));
const clubFixes = Object.fromEntries(Object.entries(edits.clubs).filter(([id]) => clubs.has(id)));

for (const [name, fixes] of [["players.json", players], ["clubs.json", clubFixes]] as const) {
  const path = join(OVERRIDES_DIR, name);
  const current = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  const merged = mergeEdits(current, fixes);
  writeFileSync(path, JSON.stringify(merged, null, 1) + "\n");
  console.log(`${name} : ${Object.keys(fixes).length} correction(s) importée(s).`);
}
console.log("Reconstruisez la base : pnpm --filter @ovalie/data build-db");
