/**
 * Plays the 2026-27 season from the game's start date (1 July 2026).
 * Usage: pnpm saison [graine] [--jusqua AAAA-MM-JJ] [--club <id>]
 *   pnpm saison                       → whole season, honours and tables
 *   pnpm saison demo --jusqua 2026-11-30 --club toulouse
 */
import {
  advanceTo,
  addDays,
  formatDateFr,
  leagueTable,
  NATION_NAME_FR,
  seasonSummary,
  stageLabel,
  type World,
} from "@ovalie/engine";
import { readCalendar, readDatabase } from "../src/io.js";
import { worldFromDatabase } from "../src/world.js";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seed = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "ovalie";
const until = opt("--jusqua");
const clubId = opt("--club");

const t0 = Date.now();
const w: World = worldFromDatabase(readDatabase(), readCalendar(), seed);
console.log(`\n=== Saison ${w.season} — début de partie le ${formatDateFr(w.date)} (graine « ${seed} ») ===`);
console.log(`${Object.keys(w.clubs).length} clubs, ${Object.values(w.players).filter((p) => !p.virtual).length} joueurs, ${w.fixtures.length} matchs au calendrier avant les phases finales.`);
const end = until ?? addDays(w.calendar.end, 1);
advanceTo(w, end);
console.log(`Simulation jusqu'au ${formatDateFr(addDays(w.date, -1))} en ${((Date.now() - t0) / 1000).toFixed(1)} s.\n`);

const name = (id: string) => w.clubs[id]?.name ?? NATION_NAME_FR[id] ?? id;

function printTable(comp: string, title: string) {
  const t = leagueTable(w, comp);
  if (!t.some((r) => r.played)) return;
  console.log(`--- ${title} ---`);
  console.log(`${"".padEnd(4)}${"Club".padEnd(28)}${"J".padStart(3)}${"G".padStart(4)}${"N".padStart(3)}${"P".padStart(4)}${"Diff".padStart(6)}${"B".padStart(4)}${"Pts".padStart(5)}`);
  t.forEach((r, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${name(r.team).padEnd(28)}${String(r.played).padStart(3)}${String(r.won).padStart(4)}${String(r.drawn).padStart(3)}${String(r.lost).padStart(4)}${String(r.pointsFor - r.pointsAgainst).padStart(6)}${String(r.offensiveBonus + r.defensiveBonus).padStart(4)}${String(r.points).padStart(5)}`),
  );
  console.log("");
}

const summary = seasonSummary(w);
const finished = summary.competitions.filter((c) => c.champion);
if (finished.length) {
  console.log("=== Palmarès ===");
  for (const c of finished) {
    console.log(`${c.name.padEnd(26)} ${name(c.champion!)} (finaliste : ${name(c.runnerUp ?? "")})${c.notes?.length ? " — " + c.notes.join(" ; ") : ""}`);
  }
  console.log("");
}
if (summary.movements.length) {
  console.log("=== Montées et descentes pour 2027-2028 ===");
  for (const m of summary.movements) console.log(`${name(m.club).padEnd(28)} ${m.from} → ${m.to} (${m.reason})`);
  console.log("");
}
printTable("top14", "Top 14 — saison régulière");
printTable("prod2", "Pro D2 — saison régulière");
if (!clubId) {
  printTable("nationale", "Nationale — saison régulière");
}

const t14 = summary.competitions.find((c) => c.id === "top14");
if (t14?.topTryScorers.length) {
  console.log("=== Top 14 : meilleurs marqueurs ===");
  console.log("Essais : " + t14.topTryScorers.map((s) => `${s.name} (${s.team}) ${s.value}`).join(", "));
  console.log("Points : " + t14.topPointScorers.map((s) => `${s.name} (${s.team}) ${s.value}`).join(", ") + "\n");
}
const top14Clubs = new Set(w.competitions.top14?.teams ?? []);
const dbl = Object.entries(summary.doublons.byClub).filter(([c]) => top14Clubs.has(c)).sort((a, b) => b[1] - a[1]);
console.log(`=== Doublons ===\n${summary.doublons.matches} matchs de club joués sans des internationaux (${summary.doublons.missingPlayers} absences au total).`);
console.log("Top 14, absences cumulées : " + dbl.map(([c, n]) => `${w.clubs[c]!.shortName} ${n}`).join(", ") + "\n");
console.log(`Blessures longues (≥ 4 semaines) : ${summary.injuries.long}\n`);

if (clubId) {
  const club = w.clubs[clubId];
  if (!club) throw new Error(`Club inconnu : ${clubId}`);
  console.log(`=== ${club.name} : calendrier et résultats ===`);
  for (const f of w.fixtures.filter((x) => x.home === clubId || x.away === clubId)) {
    const comp = w.competitions[f.competitionId]!;
    const opp = f.home === clubId ? f.away : f.home;
    const where = f.neutral ? "N" : f.home === clubId ? "D" : "E";
    const r = f.result;
    const score = r ? `${r.score[f.home === clubId ? 0 : 1]}-${r.score[f.home === clubId ? 1 : 0]}` : "à jouer";
    const missing = r ? r.missingInternationals[f.home === clubId ? 0 : 1] : 0;
    console.log(`${f.date}  ${comp.name.padEnd(18)} ${stageLabel(f.stage).padEnd(18)} ${where} ${name(opp).padEnd(28)} ${score.padEnd(8)}${missing ? ` (${missing} internationaux absents)` : ""}`);
  }
  console.log(`\n=== ${club.name} : actualités ===`);
  for (const n of w.news.filter((x) => x.clubs.includes(clubId)).slice(-25)) console.log(`${n.date}  ${n.text}`);
}
