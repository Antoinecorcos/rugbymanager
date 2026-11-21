/**
 * Real per-match averages of the Top 14 regular seasons, from the standings tables
 * of fr.wikipedia ({{Cls_Rugby}} rows: wins, draws, tries, bonus points, points for).
 * Used to check the match-engine calibration targets. Usage: pnpm --filter @ovalie/data real-stats
 */
import { templateParams } from "./import/text.js";
import { wikitext } from "./import/wikipedia-fr.js";

const SEASONS = ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"];
// Pro D2 articles use a different standings layout (plain wikitable): not parsed yet.
const LEAGUES = [{ name: "Top 14", title: (s: string) => `Championnat de France de rugby à XV ${s}` }];

for (const league of LEAGUES) {
  console.log(`\n=== ${league.name} (saison régulière) ===`);
  console.log(`${"Saison".padEnd(11)}${"Matchs".padStart(7)}${"Points".padStart(8)}${"Essais".padStart(8)}${"BO".padStart(7)}${"BD".padStart(7)}${"Nuls %".padStart(8)}`);
  const tot = { m: 0, p: 0, t: 0, bo: 0, bd: 0, n: 0 };
  for (const season of SEASONS) {
    const text = await wikitext(league.title(season));
    if (!text) continue;
    const i = text.indexOf("{{Classement début Rugby");
    if (i < 0) continue;
    const block = text.slice(i, text.indexOf("{{Classement fin", i));
    const rows = block.split("{{Cls_Rugby").slice(1).map((r) => templateParams("{{Cls_Rugby" + r, /\{\{Cls_Rugby/)!);
    const sum = (k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const games = (sum("v") + sum("n") + sum("d")) / 2;
    if (!games || !sum("em")) continue;
    const s = { m: games, p: sum("pp"), t: sum("em"), bo: sum("bo"), bd: sum("bd"), n: sum("n") / 2 };
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += s[k];
    console.log(`${season.padEnd(11)}${String(games).padStart(7)}${(s.p / games).toFixed(1).padStart(8)}${(s.t / games).toFixed(2).padStart(8)}${(s.bo / games).toFixed(2).padStart(7)}${(s.bd / games).toFixed(2).padStart(7)}${((100 * s.n) / games).toFixed(1).padStart(8)}`);
  }
  console.log(`${"Moyenne".padEnd(11)}${String(tot.m).padStart(7)}${(tot.p / tot.m).toFixed(1).padStart(8)}${(tot.t / tot.m).toFixed(2).padStart(8)}${(tot.bo / tot.m).toFixed(2).padStart(7)}${(tot.bd / tot.m).toFixed(2).padStart(7)}${((100 * tot.n) / tot.m).toFixed(1).padStart(8)}`);
}
