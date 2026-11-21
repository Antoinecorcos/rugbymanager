/**
 * Simulates one match and prints the commentary + statistics.
 * Usage: pnpm sim [seed] [--all]   (--all prints every commented event, not only highlights)
 */
import { commentaryFr, formatClock, playerDisplayName, simulateMatch, type TeamStats } from "../src/index.js";
import { makeSetup, makeTeams, nameResolver } from "./common.js";

const seed = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "demo";
const all = process.argv.includes("--all");
const [home, away] = makeTeams(`teams-${seed}`, 13.2, 12.8);
const result = simulateMatch(makeSetup(home, away, seed));
const name = nameResolver([home, away]);
const teamName = (s: 0 | 1) => (s === 0 ? home.name : away.name);

console.log(`\n=== ${home.name} vs ${away.name} (graine "${seed}") ===\n`);
for (const e of result.events) {
  if (!all && e.importance < 2 && !["penalty", "substitution", "lineout", "scrum", "maul", "ruckTurnover"].includes(e.type)) continue;
  const line = commentaryFr(e, { teamName, playerName: name });
  if (!line) continue;
  console.log(`${formatClock(e.t).padStart(7)}  [${e.score[0]}-${e.score[1]}]  ${line}`);
}

const [h, a] = result.teamStats;
const row = (label: string, f: (s: TeamStats) => string | number) => console.log(`${label.padEnd(28)}${String(f(h)).padStart(10)}${String(f(a)).padStart(10)}`);
console.log(`\n=== Score final : ${home.shortName} ${result.score[0]} - ${result.score[1]} ${away.shortName} ===`);
console.log(`Points de classement : ${result.competitionPoints[0]} - ${result.competitionPoints[1]}\n`);
console.log(`${"".padEnd(28)}${home.shortName.padStart(10)}${away.shortName.padStart(10)}`);
row("Essais", (s) => s.tries);
row("Transformations", (s) => `${s.conversionsMade}/${s.conversionsAttempted}`);
row("Pénalités réussies", (s) => `${s.penaltyGoalsMade}/${s.penaltyGoalsAttempted}`);
row("Drops", (s) => `${s.dropGoalsMade}/${s.dropGoalsAttempted}`);
row("Possession", (s) => `${Math.round((s.possessionSeconds / Math.max(1, h.possessionSeconds + a.possessionSeconds)) * 100)}%`);
row("Occupation", (s) => `${Math.round((s.territorySeconds / Math.max(1, h.territorySeconds + a.territorySeconds)) * 100)}%`);
row("Courses", (s) => s.carries);
row("Mètres gagnés", (s) => Math.round(s.metres));
row("Franchissements", (s) => s.lineBreaks);
row("Défenseurs battus", (s) => s.defendersBeaten);
row("Offloads", (s) => s.offloads);
row("Plaquages réussis / manqués", (s) => `${s.tacklesMade}/${s.tacklesMissed}`);
row("Rucks gagnés / perdus", (s) => `${s.rucksWon}/${s.rucksLost}`);
row("Rucks rapides (<3 s)", (s) => `${Math.round((s.fastRucks / Math.max(1, s.rucksWon)) * 100)}%`);
row("Turnovers gagnés", (s) => s.turnoversWon);
row("Touches gagnées / lancées", (s) => `${s.lineoutsWon}/${s.lineoutsThrown}`);
row("Touches volées", (s) => s.lineoutSteals);
row("Mêlées gagnées / introduites", (s) => `${s.scrumsWon}/${s.scrumsFed}`);
row("Pénalités de mêlée obtenues", (s) => s.scrumPenaltiesWon);
row("Mauls", (s) => s.mauls);
row("Pénalités concédées", (s) => s.penaltiesConceded);
row("Cartons jaunes / rouges", (s) => `${s.yellowCards}/${s.redCards}`);
row("Jeu au pied (nombre / m)", (s) => `${s.kicksInPlay}/${Math.round(s.kickMetres)}`);
row("En-avant / fautes de main", (s) => s.handlingErrors);
row("Entrées dans les 22", (s) => s.entries22);
row("Points par entrée 22", (s) => (s.pointsFrom22 / Math.max(1, s.entries22)).toFixed(1));
console.log(`\nTemps de jeu effectif : ${Math.round(result.ballInPlaySeconds / 60)} min — durée totale ${formatClock(result.totalSeconds)}`);

console.log(`\n=== Notes des joueurs ===`);
for (const [side, team] of [[0, home], [1, away]] as const) {
  const best = [...result.playerStats[side]].sort((x, y) => y.rating - x.rating).slice(0, 5);
  console.log(`${team.name} : ` + best.map((ps) => `${playerDisplayName(team.players.find((p) => p.id === ps.playerId)!)} ${ps.rating}`).join(", "));
}
if (result.injuries.length) {
  console.log(`\nBlessures : ` + result.injuries.map((i) => `${name(i.playerId)} (${i.type}, ~${i.days} j)`).join(", "));
}
