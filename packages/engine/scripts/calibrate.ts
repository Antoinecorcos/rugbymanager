/**
 * Runs many matches between Top 14-level synthetic teams and compares averages with real targets.
 * Usage: pnpm calibrate [matches]
 */
import { runCalibration, TARGETS } from "../src/match/calibration.js";

const n = Number(process.argv[2] ?? 400);
const t0 = Date.now();
const report = runCalibration(n);
const ms = Date.now() - t0;
console.log(`\nCalibrage sur ${n} matchs (${(ms / n).toFixed(1)} ms/match)\n`);
console.log(`${"Indicateur (total par match)".padEnd(36)}${"Moyenne".padStart(10)}   Cible`);
let ok = 0;
for (const [key, target] of Object.entries(TARGETS)) {
  const v = report[key as keyof typeof TARGETS];
  const inRange = v >= target.min && v <= target.max;
  if (inRange) ok++;
  console.log(`${(inRange ? "✓ " : "✗ ") + target.label.padEnd(34)}${v.toFixed(2).padStart(10)}   [${target.min} – ${target.max}]`);
}
console.log(`\n${ok}/${Object.keys(TARGETS).length} indicateurs dans la cible.`);
