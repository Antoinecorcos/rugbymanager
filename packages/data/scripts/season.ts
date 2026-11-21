/**
 * Simulates real league seasons with the database and checks the match engine's calibration.
 * Usage: pnpm --filter @ovalie/data season [TOP14|PROD2] [seasons]
 */
import { TARGETS } from "@ovalie/engine";
import { readDatabase } from "../src/io.js";
import { seasonCalibration, simulateLeagueSeason } from "../src/season.js";

const league = (process.argv[2] ?? "TOP14").toUpperCase();
const seasons = Number(process.argv[3] ?? 5);
const clubs = readDatabase().filter((d) => d.club.league === league);
if (!clubs.length) throw new Error(`Aucun club pour ${league}`);

const one = simulateLeagueSeason(clubs, "saison-exemple");
console.log(`\n=== ${league} — une saison régulière simulée ===\n`);
console.log(`${"".padEnd(4)}${"Club".padEnd(28)}${"J".padStart(3)}${"G".padStart(4)}${"N".padStart(3)}${"P".padStart(4)}${"Pour".padStart(6)}${"Contre".padStart(7)}${"B".padStart(4)}${"Pts".padStart(5)}`);
one.table.forEach((r, i) =>
  console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(28)}${String(r.played).padStart(3)}${String(r.won).padStart(4)}${String(r.drawn).padStart(3)}${String(r.lost).padStart(4)}${String(r.pointsFor).padStart(6)}${String(r.pointsAgainst).padStart(7)}${String(r.bonus).padStart(4)}${String(r.points).padStart(5)}`),
);

const { report, averageRank } = seasonCalibration(clubs, seasons);
console.log(`\n=== Classement moyen sur ${seasons} saisons ===`);
[...averageRank].sort((a, b) => a[1] - b[1]).forEach(([id, r]) => console.log(`${r.toFixed(1).padStart(5)}  ${clubs.find((c) => c.club.id === id)!.club.name}`));
console.log(`\n=== Indicateurs (${seasons * clubs.length * (clubs.length - 1)} matchs) ===`);
let ok = 0;
for (const [key, t] of Object.entries(TARGETS)) {
  const v = report[key as keyof typeof TARGETS];
  const inRange = v >= t.min && v <= t.max;
  if (inRange) ok++;
  console.log(`${(inRange ? "✓ " : "✗ ") + t.label.padEnd(34)}${v.toFixed(2).padStart(10)}   [${t.min} – ${t.max}]`);
}
console.log(`\n${ok}/${Object.keys(TARGETS).length} indicateurs dans la cible.`);
