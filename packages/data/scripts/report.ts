/** Human-readable summaries of the database (team strength, best players). */
import { playerLevel, selectMatchTeam, teamStrength } from "@ovalie/engine";
import type { ClubDatabase } from "../src/schemas.js";

export function printStrengthTable(dbs: ClubDatabase[]): void {
  const rows = dbs.map((d) => {
    const team = selectMatchTeam(d.squad.map((e) => e.player), { id: d.club.id, name: d.club.name, shortName: d.club.shortName });
    const s = teamStrength(team);
    const best = [...d.squad].sort((a, b) => playerLevel(b.player) - playerLevel(a.player)).slice(0, 3);
    return { d, s, best };
  });
  rows.sort((a, b) => a.d.club.league.localeCompare(b.d.club.league) || b.s.xv - a.s.xv);
  console.log(`${"Club".padEnd(28)}${"Ligue".padEnd(7)}${"XV".padStart(6)}${"23".padStart(6)}  Effectif  Meilleurs joueurs`);
  for (const { d, s, best } of rows) {
    console.log(
      `${d.club.name.padEnd(28)}${d.club.league.padEnd(7)}${s.xv.toFixed(2).padStart(6)}${s.matchday.toFixed(2).padStart(6)}  ${String(d.squad.length).padStart(8)}  ` +
        best.map((e) => `${e.player.firstName.charAt(0)}. ${e.player.lastName} ${playerLevel(e.player).toFixed(1)}`).join(", "),
    );
  }
}
