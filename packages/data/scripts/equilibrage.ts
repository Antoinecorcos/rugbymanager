/**
 * Balancing report (M8): plays several seasons on the real database, for several seeds, with a
 * manager whose staff picks the teams, and measures what should stay realistic and stable:
 * match statistics against the real Top 14, the spread of titles, the level and age of the
 * leagues over the seasons, player development, injuries, the market, the manager's board and
 * finances.
 * Usage: pnpm equilibrage [graines=3] [saisons=3] [club=pau]
 */
import {
  addDays,
  advanceTo,
  ageOn,
  closeSeason,
  playerLevel,
  startCareer,
  startNextSeason,
  type World,
} from "@ovalie/engine";
import { readCalendar, readDatabase } from "../src/io.js";
import { worldFromDatabase } from "../src/world.js";

const seeds = Number(process.argv[2] ?? 3);
const seasons = Number(process.argv[3] ?? 3);
const clubId = process.argv[4] ?? "pau";
const db = readDatabase();

const REAL = { points: 49.7, tries: 5.66, homeWin: 66, draws: 2.3, offBonus: 0.34, defBonus: 0.32 };
const fmt = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

interface Row {
  seed: string;
  season: string;
  points: number;
  tries: number;
  homeWin: number;
  draws: number;
  offBonus: number;
  defBonus: number;
  champions: Record<string, string>;
  strength: Record<string, number>;
  top10: number;
  age: number;
  old: number;
  devYoung: number;
  devPrime: number;
  devOld: number;
  injuries: number;
  manager: string;
}

function leagueStrength(w: World, league: string): number {
  const clubs = Object.values(w.clubs).filter((c) => c.league === league);
  return mean(clubs.map((c) => mean((w.squads[c.id] ?? []).map((id) => playerLevel(w.players[id]!.player)).sort((a, b) => b - a).slice(0, 23))));
}

function matchStats(w: World, comp: string) {
  const list = w.fixtures.filter((f) => f.competitionId === comp && /^J\d+$/.test(f.stage) && f.result);
  const n = Math.max(1, list.length);
  let points = 0, tries = 0, home = 0, draws = 0, off = 0, def = 0;
  for (const f of list) {
    const r = f.result!;
    points += r.score[0] + r.score[1];
    tries += r.tries[0] + r.tries[1];
    if (r.winner === 0) home++;
    if (r.winner === null) draws++;
    off += (r.bonus[0].offensive ? 1 : 0) + (r.bonus[1].offensive ? 1 : 0);
    def += (r.bonus[0].defensive ? 1 : 0) + (r.bonus[1].defensive ? 1 : 0);
  }
  return { points: points / n, tries: tries / n, homeWin: (100 * home) / n, draws: (100 * draws) / n, offBonus: off / n, defBonus: def / n };
}

const rows: Row[] = [];
const t0 = Date.now();
for (let s = 0; s < seeds; s++) {
  const seed = `equilibrage-${s + 1}`;
  const w = worldFromDatabase(db, readCalendar(), seed);
  startCareer(w, { name: "Staff", nationality: "FRA", start: "bigClub" }, clubId);
  for (let k = 0; k < seasons; k++) {
    const startCa = new Map(Object.values(w.players).filter((p) => p.clubId && !p.virtual).map((p) => [p.player.id, { ca: playerLevel(p.player), age: ageOn(p.player.birthDate, w.date) }]));
    const strength = Object.fromEntries(["TOP14", "PROD2", "NATIONALE", "PREM", "URC"].map((l) => [l, leagueStrength(w, l)]));
    const pros = Object.values(w.players).filter((p) => p.clubId && !p.virtual && ["TOP14", "PROD2", "NATIONALE"].includes(w.clubs[p.clubId]!.league));
    const top10 = mean(Object.values(w.players).filter((p) => p.clubId && !p.virtual).map((p) => playerLevel(p.player)).sort((a, b) => b - a).slice(0, 10));
    const ages = pros.map((p) => ageOn(p.player.birthDate, w.date));
    advanceTo(w, addDays(w.calendar.end, 1));
    const m = matchStats(w, "top14");
    const dev = (lo: number, hi: number) =>
      mean(
        [...startCa]
          .filter(([id, x]) => x.age >= lo && x.age <= hi && w.players[id])
          .map(([id, x]) => playerLevel(w.players[id]!.player) - x.ca),
      );
    const champions = Object.fromEntries(Object.values(w.competitions).filter((c) => c.outcome?.champion).map((c) => [c.id, w.clubs[c.outcome!.champion!]?.shortName ?? c.outcome!.champion!]));
    const injuries = w.news.filter((n) => n.topic === "medical").length;
    const record = closeSeason(w).manager;
    const mgr = w.manager!;
    const fin = w.clubs[mgr.clubId]!.finances;
    const manager = mgr.dismissed
      ? `licencié (${mgr.dismissed.date})`
      : `${record?.rank ?? "?"}e/${record?.target ?? "?"} ${record?.met ? "✓" : "✗"} conf. ${Math.round(record?.confidence ?? 0)} réput. ${Math.round(record?.reputation ?? 0)} tréso. ${fin ? fmt(fin.balance / 1e6) : "?"} M€`;
    rows.push({ seed, season: w.season, ...m, champions, strength, top10, age: mean(ages), old: (100 * ages.filter((a) => a >= 34).length) / ages.length, devYoung: dev(17, 21), devPrime: dev(22, 29), devOld: dev(30, 40), injuries, manager });
    console.log(`${seed} ${w.season} terminé (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (mgr.dismissed || k === seasons - 1) break;
    startNextSeason(w);
  }
}

console.log(`\n=== Matchs du Top 14 (saison régulière), réel 2021-2026 : ${REAL.points} pts, ${REAL.tries} essais, ${REAL.homeWin} % victoires à domicile, ${REAL.draws} % nuls, bonus ${REAL.offBonus} / ${REAL.defBonus} ===`);
for (const r of rows) console.log(`${r.seed} ${r.season} : ${fmt(r.points)} pts, ${fmt(r.tries, 2)} essais, ${fmt(r.homeWin, 0)} % dom., ${fmt(r.draws)} % nuls, bonus ${fmt(r.offBonus, 2)} / ${fmt(r.defBonus, 2)}`);
console.log("\n=== Palmarès ===");
for (const r of rows) console.log(`${r.seed} ${r.season} : ${Object.entries(r.champions).map(([c, t]) => `${c} ${t}`).join(", ")}`);
console.log("\n=== Niveau (23 meilleurs, moyenne des clubs) et âge des effectifs français ===");
for (const r of rows) console.log(`${r.seed} ${r.season} : ${Object.entries(r.strength).map(([l, v]) => `${l} ${fmt(v, 2)}`).join(", ")} · top 10 mondial ${fmt(r.top10, 2)} · âge moyen ${fmt(r.age)} · 34 ans et + ${fmt(r.old)} %`);
console.log("\n=== Progression sur la saison (niveau, échelle 1-20) et blessures longues ===");
for (const r of rows) console.log(`${r.seed} ${r.season} : ≤ 21 ans ${fmt(r.devYoung, 2)} · 22-29 ans ${fmt(r.devPrime, 2)} · 30 ans et + ${fmt(r.devOld, 2)} · blessures ≥ 4 semaines ${r.injuries}`);
console.log(`\n=== Manager (${clubId}, composition par le staff) ===`);
for (const r of rows) console.log(`${r.seed} ${r.season} : ${r.manager}`);
console.log(`\nTerminé en ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
