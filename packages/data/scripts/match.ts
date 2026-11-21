/**
 * Simulates one commented match between two real clubs of the database.
 * Usage: pnpm --filter @ovalie/data match <club domicile> <club extérieur> [graine]
 * e.g.   pnpm --filter @ovalie/data match toulouse bordeaux-begles
 */
import { commentaryFr, DEFAULT_REFEREE, formatClock, playerDisplayName, simulateMatch, TOP14_BONUS } from "@ovalie/engine";
import { readDatabase } from "../src/io.js";
import { matchTeamFor } from "../src/season.js";

const [homeId = "toulouse", awayId = "bordeaux-begles", seed = "demo"] = process.argv.slice(2);
const db = readDatabase();
const find = (id: string) => db.find((d) => d.club.id === id) ?? (() => { throw new Error(`Club inconnu : ${id} (ex. ${db.slice(0, 5).map((d) => d.club.id).join(", ")}…)`); })();
const [home, away] = [matchTeamFor(find(homeId)), matchTeamFor(find(awayId))];
const res = simulateMatch({ home, away, referee: DEFAULT_REFEREE, weather: "dry", seed, bonus: TOP14_BONUS });
const names = new Map([...home.players, ...away.players].map((p) => [p.id, playerDisplayName(p)]));
const ctx = { teamName: (s: 0 | 1) => (s === 0 ? home.name : away.name), playerName: (id: string | undefined) => (id ? (names.get(id) ?? "?") : "") };

console.log(`\n=== ${home.name} – ${away.name} ===`);
for (const [team, label] of [[home, "Domicile"], [away, "Extérieur"]] as const) {
  console.log(`${label} : ${team.players.slice(0, 15).map((p, i) => `${i + 1}. ${playerDisplayName(p)}`).join(", ")}`);
}
console.log("");
for (const e of res.events) {
  if (e.importance < 2) continue;
  const line = commentaryFr(e, ctx);
  if (line) console.log(`${formatClock(e.t).padStart(7)}  [${e.score[0]}-${e.score[1]}]  ${line}`);
}
console.log(`\nScore final : ${home.shortName} ${res.score[0]} - ${res.score[1]} ${away.shortName} (essais ${res.teamStats[0].tries}-${res.teamStats[1].tries})`);
for (const [side, team] of [[0, home], [1, away]] as const) {
  const best = [...res.playerStats[side]].sort((a, b) => b.rating - a.rating).slice(0, 3);
  console.log(`${team.name} : ${best.map((ps) => `${names.get(ps.playerId)} ${ps.rating}`).join(", ")}`);
}
