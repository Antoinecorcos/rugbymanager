/**
 * Competition formats 2026-2027: knock-out stages generated when the previous stage is complete,
 * outcomes (champion, ranking, promotion, relegation) set when a competition ends.
 */
import { TOP14_BONUS, type BonusRules } from "../domain/match-setup.js";
import type { IsoDate } from "./dates.js";
import { computeTable, type TableRow } from "./standings.js";
import type { CompetitionState, Fixture, World } from "./types.js";

export const TRIES4_BONUS: BonusRules = { offensive: "tries4", defensiveMargin: 7 };

/** Name and bonus rules of each competition (2026-27 rules). */
export const COMPETITION_INFO: Record<string, { name: string; bonus: BonusRules }> = {
  top14: { name: "Top 14", bonus: TOP14_BONUS },
  prod2: { name: "Pro D2", bonus: TOP14_BONUS },
  nationale: { name: "Nationale", bonus: TOP14_BONUS },
  prem: { name: "PREM", bonus: TRIES4_BONUS },
  urc: { name: "United Rugby Championship", bonus: TRIES4_BONUS },
  "champions-cup": { name: "Champions Cup", bonus: { offensive: "margin3", defensiveMargin: 7 } },
  "challenge-cup": { name: "Challenge Cup", bonus: { offensive: "margin3", defensiveMargin: 7 } },
  "nations-championship": { name: "Nations Championship", bonus: TRIES4_BONUS },
  "six-nations": { name: "Tournoi des Six Nations", bonus: TRIES4_BONUS },
  "world-cup": { name: "Coupe du monde", bonus: TRIES4_BONUS },
};

/** Neutral venues of the finals. */
const FINAL_VENUE: Record<string, string> = {
  top14: "Stade de France, Saint-Denis",
  prod2: "Terrain neutre",
  nationale: "Terrain neutre",
  prem: "Allianz Stadium, Twickenham",
};

// ------------------------------------------------------------------ helpers

export const fixturesOf = (w: World, comp: string, stage?: (s: string) => boolean): Fixture[] =>
  w.fixtures.filter((f) => f.competitionId === comp && (!stage || stage(f.stage)));

const isRound = (s: string) => /^J\d+$/.test(s);
const played = (list: Fixture[]) => list.length > 0 && list.every((f) => f.result);
export const winnerOf = (f: Fixture): string => (f.result!.winner === 1 ? f.away : f.home);
export const loserOf = (f: Fixture): string => (f.result!.winner === 1 ? f.home : f.away);

/** Regular-season (or pool) table of a competition. */
export function leagueTable(w: World, comp: string, teams?: string[], stage: (s: string) => boolean = isRound): TableRow[] {
  const c = w.competitions[comp]!;
  return computeTable(teams ?? c.teams, fixturesOf(w, comp, stage), stage === isRound ? c.adjustments : undefined);
}

/** Adds a knock-out fixture (never in the past: a late stage is played on the current day). */
function addFixture(w: World, c: CompetitionState, stage: string, date: IsoDate, home: string, away: string, extra: Partial<Fixture> = {}): Fixture {
  const f: Fixture = { id: `${c.id}:${stage}:${home}-${away}`, competitionId: c.id, stage, date: date < w.date ? w.date : date, home, away, knockout: true, ...extra };
  w.fixtures.push(f);
  return f;
}

function generate(c: CompetitionState, stage: string): boolean {
  if (c.generatedStages.includes(stage)) return false;
  c.generatedStages.push(stage);
  return true;
}

function news(w: World, topic: string, clubs: string[], text: string, importance: 1 | 2 | 3 = 2): void {
  w.news.push({ date: w.date, topic, clubs, text, importance });
}

const nameOf = (w: World, id: string): string => w.clubs[id]?.name ?? NATION_NAME_FR[id] ?? id;

export const NATION_NAME_FR: Record<string, string> = {
  FRA: "France", ENG: "Angleterre", IRL: "Irlande", SCO: "Écosse", WAL: "Pays de Galles", ITA: "Italie", NZL: "Nouvelle-Zélande",
  RSA: "Afrique du Sud", AUS: "Australie", ARG: "Argentine", FIJ: "Fidji", JPN: "Japon", GEO: "Géorgie", SAM: "Samoa", TGA: "Tonga",
  ESP: "Espagne", POR: "Portugal", ROU: "Roumanie", URU: "Uruguay", USA: "États-Unis", CAN: "Canada", CHI: "Chili", NAM: "Namibie", BEL: "Belgique", NED: "Pays-Bas",
  HKG: "Hong Kong", ZIM: "Zimbabwe",
};

// ------------------------------------------------------------------ progression

/** Generates due knock-out fixtures and closes finished competitions. Idempotent. */
export function progressCompetitions(w: World): void {
  for (const id of ["nationale", "prod2", "top14"]) if (w.competitions[id]) progressFrenchLeague(w, id);
  if (w.competitions.prem) progressTopN(w, "prem", 4);
  if (w.competitions.urc) progressTopN(w, "urc", 8);
  if (w.competitions["champions-cup"] && w.competitions["challenge-cup"]) progressEurope(w);
  if (w.competitions["nations-championship"]) progressNationsChampionship(w);
  if (w.competitions["six-nations"]) progressSixNations(w);
  if (w.competitions["world-cup"]) progressWorldCup(w);
}

/** Top 14, Pro D2, Nationale: top 6 (barrages 3v6 / 4v5, semis, final) + access matches. */
function progressFrenchLeague(w: World, id: string): void {
  const c = w.competitions[id]!;
  const regular = fixturesOf(w, id, isRound);
  if (!played(regular)) return;
  const table = leagueTable(w, id);
  const rank = table.map((r) => r.team);
  const ko = c.knockout;
  if (generate(c, "barrage")) {
    news(w, id, rank, `${c.name} : fin de la saison régulière. ${nameOf(w, rank[0]!)} termine en tête devant ${nameOf(w, rank[1]!)}.`, 2);
    addFixture(w, c, "barrage", ko.barrages!, rank[2]!, rank[5]!);
    addFixture(w, c, "barrage", ko.barrages!, rank[3]!, rank[4]!);
  }
  const barrages = fixturesOf(w, id, (s) => s === "barrage");
  if (played(barrages) && generate(c, "demi")) {
    const w36 = winnerOf(barrages[0]!);
    const w45 = winnerOf(barrages[1]!);
    const neutral = id === "top14";
    addFixture(w, c, "demi", ko.demiFinales!, rank[0]!, w45, { neutral });
    addFixture(w, c, "demi", ko.demiFinales!, rank[1]!, w36, { neutral });
  }
  const semis = fixturesOf(w, id, (s) => s === "demi");
  if (played(semis) && generate(c, "finale")) {
    const [a, b] = semis.map(winnerOf) as [string, string];
    const [home, away] = rank.indexOf(a) <= rank.indexOf(b) ? [a, b] : [b, a];
    addFixture(w, c, "finale", ko.finale!, home, away, { neutral: true, venue: FINAL_VENUE[id] });
  }
  // Access matches: Top 14 13th v Pro D2 runner-up; Pro D2 15th v Nationale runner-up.
  const below = id === "top14" ? "prod2" : id === "prod2" ? "nationale" : undefined;
  const lower = below && w.competitions[below] ? below : undefined;
  const accessRank = id === "top14" ? 12 : 14;
  const lowerFinal = lower ? fixturesOf(w, lower, (s) => s === "finale")[0] : undefined;
  if (lower && lowerFinal?.result && ko.access && generate(c, "access")) {
    addFixture(w, c, "access", ko.access, rank[accessRank]!, loserOf(lowerFinal), { venue: w.clubs[rank[accessRank]!]?.stadium });
  }
  const final = fixturesOf(w, id, (s) => s === "finale")[0];
  const access = fixturesOf(w, id, (s) => s === "access")[0];
  const accessDone = !lower || (access?.result !== undefined);
  if (final?.result && accessDone && !c.outcome) {
    const champion = winnerOf(final);
    // Nationale: no relegation in 2026-27 (the league grows to 16 clubs), then the last two go down to Nationale 2.
    const relegated = id !== "nationale" ? [rank[rank.length - 1]!] : w.season === "2026-2027" ? [] : rank.slice(-2);
    const notes: string[] = [];
    if (access) {
      const keep = winnerOf(access) === rank[accessRank];
      if (!keep) relegated.push(rank[accessRank]!);
      notes.push(`Access match : ${nameOf(w, access.home)} ${access.result!.score[0]}-${access.result!.score[1]} ${nameOf(w, access.away)}`);
    }
    if (id === "nationale" && w.season === "2026-2027") notes.push("Pas de relégation en 2026-2027 (passage de la Nationale à 16 clubs).");
    c.outcome = { champion, runnerUp: loserOf(final), ranking: rank, relegated, notes };
    const label = id === "top14" ? "Champion de France ! Le Bouclier de Brennus" : `Champion de ${c.name}`;
    news(w, id, [champion], `${label} pour ${nameOf(w, champion)}, vainqueur de ${nameOf(w, loserOf(final))} en finale (${final.result.score[0]}-${final.result.score[1]}).`, 3);
  }
}

/** PREM (top 4) and URC (top 8): seeded knock-out, home advantage to the better seed. */
function progressTopN(w: World, id: string, n: 4 | 8): void {
  const c = w.competitions[id]!;
  const regular = fixturesOf(w, id, isRound);
  if (!played(regular)) return;
  const rank = leagueTable(w, id).map((r) => r.team);
  const seed = (t: string) => rank.indexOf(t);
  const byseed = (a: string, b: string): [string, string] => (seed(a) <= seed(b) ? [a, b] : [b, a]);
  if (n === 4 && generate(c, "demi")) {
    addFixture(w, c, "demi", c.knockout.demiFinales!, rank[0]!, rank[3]!);
    addFixture(w, c, "demi", c.knockout.demiFinales!, rank[1]!, rank[2]!);
  }
  if (n === 8) {
    if (generate(c, "quart")) for (const [a, b] of [[0, 7], [3, 4], [1, 6], [2, 5]] as const) addFixture(w, c, "quart", c.knockout.quarts!, rank[a]!, rank[b]!);
    const quarts = fixturesOf(w, id, (s) => s === "quart");
    if (played(quarts) && generate(c, "demi")) {
      const q = quarts.map(winnerOf);
      addFixture(w, c, "demi", c.knockout.demiFinales!, ...byseed(q[0]!, q[1]!));
      addFixture(w, c, "demi", c.knockout.demiFinales!, ...byseed(q[2]!, q[3]!));
    }
  }
  const semis = fixturesOf(w, id, (s) => s === "demi");
  if (played(semis) && generate(c, "finale")) {
    const [home, away] = byseed(winnerOf(semis[0]!), winnerOf(semis[1]!));
    // PREM final at Twickenham; URC final hosted by the better seed.
    addFixture(w, c, "finale", c.knockout.finale!, home, away, id === "prem" ? { neutral: true, venue: FINAL_VENUE.prem } : { venue: w.clubs[home]?.stadium });
  }
  const final = fixturesOf(w, id, (s) => s === "finale")[0];
  if (final?.result && !c.outcome) {
    c.outcome = { champion: winnerOf(final), runnerUp: loserOf(final), ranking: rank };
    news(w, id, [winnerOf(final)], `${nameOf(w, winnerOf(final))} remporte le titre en ${c.name} (${final.result.score[0]}-${final.result.score[1]} face à ${nameOf(w, loserOf(final))}).`, 2);
  }
}

/** EPCR: pools → 16 seeds → round of 16 (1v16…8v9), fixed bracket, final in Lyon. */
function progressEurope(w: World): void {
  const cc = w.competitions["champions-cup"]!;
  const ch = w.competitions["challenge-cup"]!;
  const ccPools = fixturesOf(w, cc.id, (s) => s.startsWith("poule"));
  const chPools = fixturesOf(w, ch.id, (s) => s.startsWith("poule"));
  if (!played(ccPools) || !played(chPools)) return;
  if (generate(cc, "huitieme")) {
    const tables = cc.groups!.map((g) => leagueTable(w, cc.id, g, (s) => s.startsWith("poule")));
    const byLevel = (k: number) => tables.map((t) => t[k]!).sort(compareSeed);
    const rest = tables.flatMap((t) => t.slice(3)).sort(compareSeed);
    cc.seeds = [...byLevel(0), ...byLevel(1), ...byLevel(2), ...rest.slice(0, 4)].map((r) => r.team);
    const dropped = rest.slice(4, 8).map((r) => r.team);
    const chTables = ch.groups!.map((g) => leagueTable(w, ch.id, g, (s) => s.startsWith("poule")));
    const chByLevel = (k: number) => chTables.map((t) => t[k]!).sort(compareSeed);
    ch.seeds = [...chByLevel(0), ...chByLevel(1), ...chByLevel(2), ...chByLevel(3)].map((r) => r.team).concat(dropped);
    ch.teams = [...new Set([...ch.teams, ...dropped])];
    generate(ch, "huitieme");
    for (const c of [cc, ch]) {
      for (let i = 0; i < 8; i++) addFixture(w, c, "huitieme", c.knockout.huitiemes!, c.seeds![i]!, c.seeds![15 - i]!);
    }
    news(w, cc.id, cc.seeds, `Champions Cup : les huitièmes de finale sont connus. ${nameOf(w, cc.seeds[0]!)} est la tête de série n°1.`, 2);
  }
  for (const c of [cc, ch]) progressBracket(w, c);
}

const compareSeed = (a: TableRow, b: TableRow) =>
  b.points - a.points || b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) || b.triesFor - a.triesFor || a.team.localeCompare(b.team);

/** Quarter-finals: W(1v16) v W(8v9), W(4v13) v W(5v12), W(2v15) v W(7v10), W(3v14) v W(6v11). */
function progressBracket(w: World, c: CompetitionState, finalVenue?: string): void {
  const seeds = c.seeds!;
  const seedOf = (t: string) => seeds.indexOf(t);
  const order = (a: string, b: string): [string, string] => (seedOf(a) <= seedOf(b) ? [a, b] : [b, a]);
  const r16 = fixturesOf(w, c.id, (s) => s === "huitieme");
  if (played(r16) && generate(c, "quart")) {
    const winner = (seed: number) => winnerOf(r16.find((f) => f.home === seeds[seed])!);
    for (const [a, b] of [[0, 7], [3, 4], [1, 6], [2, 5]] as const) addFixture(w, c, "quart", c.knockout.quarts!, ...order(winner(a), winner(b)));
  }
  const qf = fixturesOf(w, c.id, (s) => s === "quart");
  if (played(qf) && generate(c, "demi")) {
    addFixture(w, c, "demi", c.knockout.demiFinales!, ...order(winnerOf(qf[0]!), winnerOf(qf[3]!)));
    addFixture(w, c, "demi", c.knockout.demiFinales!, ...order(winnerOf(qf[1]!), winnerOf(qf[2]!)));
  }
  const sf = fixturesOf(w, c.id, (s) => s === "demi");
  if (played(sf) && generate(c, "finale")) {
    const venue = finalVenue ?? w.calendar.cups.find((x) => x.id === c.id)?.finalVenue;
    addFixture(w, c, "finale", c.knockout.finale!, ...order(winnerOf(sf[0]!), winnerOf(sf[1]!)), { neutral: true, venue });
  }
  const final = fixturesOf(w, c.id, (s) => s === "finale")[0];
  if (final?.result && !c.outcome && c.kind === "cup") {
    c.outcome = { champion: winnerOf(final), runnerUp: loserOf(final), ranking: seeds };
    const city = final.venue?.split(", ")[1] ?? "Lyon";
    news(w, c.id, [winnerOf(final), loserOf(final)], `${nameOf(w, winnerOf(final))} remporte la ${c.name} à ${city} (${final.result.score[0]}-${final.result.score[1]} contre ${nameOf(w, loserOf(final))}) !`, 3);
  }
}

/** Two conferences of six; placement finals 1v1 … 6v6 at Twickenham. */
function progressNationsChampionship(w: World): void {
  const c = w.competitions["nations-championship"]!;
  const regular = fixturesOf(w, c.id, isRound);
  if (!played(regular)) return;
  const tables = c.groups!.map((g) => leagueTable(w, c.id, g).map((r) => r.team));
  const dates = w.calendar.internationals.find((x) => x.id === c.id)?.finals ?? [];
  const labels = ["finale", "place-3", "place-5", "place-7", "place-9", "place-11"];
  if (generate(c, "finales")) {
    labels.forEach((label, k) => addFixture(w, c, label, dates[k] ?? w.date, tables[0]![k]!, tables[1]![k]!, { neutral: true, venue: "Twickenham Stadium" }));
  }
  const finals = labels.map((l) => fixturesOf(w, c.id, (s) => s === l)[0]!);
  if (finals.every((f) => f.result) && !c.outcome) {
    const ranking = finals.flatMap((f) => [winnerOf(f), loserOf(f)]);
    c.outcome = { champion: ranking[0], runnerUp: ranking[1], ranking };
    news(w, c.id, [], `${nameOf(w, ranking[0]!)} remporte le Nations Championship en battant ${nameOf(w, ranking[1]!)} à Twickenham.`, 2);
  }
}

/** Six Nations: single table, Grand Slam bonus (+3), Triple Crown, Wooden Spoon. */
function progressSixNations(w: World): void {
  const c = w.competitions["six-nations"]!;
  const all = fixturesOf(w, c.id);
  if (!played(all) || c.outcome) return;
  const base = computeTable(c.teams, all);
  const slam = base.find((r) => r.won === 5)?.team;
  const table = computeTable(c.teams, all, slam ? { [slam]: 3 } : {});
  const ranking = table.map((r) => r.team);
  const notes: string[] = [];
  if (slam) notes.push(`Grand Chelem : ${nameOf(w, slam)}`);
  const home = ["ENG", "IRL", "SCO", "WAL"];
  const crown = home.find((n) => home.filter((o) => o !== n).every((o) => all.some((f) => (f.home === n && f.away === o) || (f.home === o && f.away === n) ? winnerOf(f) === n && f.result!.winner !== null : false)));
  if (crown) notes.push(`Triple Couronne : ${nameOf(w, crown)}`);
  notes.push(`Cuillère de bois : ${nameOf(w, ranking.at(-1)!)}`);
  c.outcome = { champion: ranking[0], runnerUp: ranking[1], ranking, notes };
  news(w, c.id, [], `${nameOf(w, ranking[0]!)} remporte le Tournoi des Six Nations${slam === ranking[0] ? " avec le Grand Chelem" : ""}.`, 3);
}

/**
 * Rugby World Cup: six pools of four, the 12 first two and the four best thirds in the round of 16
 * (no rematch of a pool), then a fixed bracket, a bronze final and the final. Players of
 * eliminated nations go back to their clubs.
 */
function progressWorldCup(w: World): void {
  const c = w.competitions["world-cup"]!;
  const pools = fixturesOf(w, c.id, (s) => s.startsWith("poule"));
  if (!played(pools)) return;
  const poolOf = (t: string) => c.groups!.findIndex((g) => g.includes(t));
  if (generate(c, "huitieme")) {
    const tables = c.groups!.map((g) => leagueTable(w, c.id, g, (s) => s.startsWith("poule")));
    const level = (k: number) => tables.map((t) => t[k]!).sort(compareSeed);
    const thirds = level(2).slice(0, 4);
    const seeds = [...level(0), ...level(1), ...thirds].map((r) => r.team);
    // No rematch of a pool in the round of 16: swap opponents when needed.
    for (let i = 0; i < 8; i++) {
      if (poolOf(seeds[i]!) !== poolOf(seeds[15 - i]!)) continue;
      for (let j = 0; j < 8; j++) {
        if (j === i) continue;
        const a = seeds[15 - i]!;
        const b = seeds[15 - j]!;
        if (poolOf(seeds[i]!) !== poolOf(b) && poolOf(seeds[j]!) !== poolOf(a)) {
          seeds[15 - i] = b;
          seeds[15 - j] = a;
          break;
        }
      }
    }
    c.seeds = seeds;
    for (let i = 0; i < 8; i++) addFixture(w, c, "huitieme", c.knockout.huitiemes!, seeds[i]!, seeds[15 - i]!, { neutral: true });
    const out = c.teams.filter((t) => !seeds.includes(t));
    for (const n of out) releaseNation(w, n);
    news(w, c.id, [], `Coupe du monde : fin des poules. ${out.includes("FRA") ? "La France est éliminée." : `Qualifiés pour les huitièmes : ${seeds.map((t) => nameOf(w, t)).join(", ")}.`}`, out.includes("FRA") ? 3 : 2);
  }
  const venue = w.calendar.internationals.find((x) => x.id === c.id)?.finalsVenue;
  const before = new Set(fixturesOf(w, c.id, (s) => !s.startsWith("poule")).map((f) => f.id));
  progressBracket(w, c, venue);
  for (const f of w.fixtures) if (f.competitionId === c.id && !before.has(f.id)) f.neutral = true;
  // Losers of each knock-out round go home (semi-finalists play the bronze final).
  for (const f of fixturesOf(w, c.id, (s) => s === "huitieme" || s === "quart")) if (f.result) releaseNation(w, loserOf(f));
  const sf = fixturesOf(w, c.id, (s) => s === "demi");
  if (played(sf) && generate(c, "petite-finale")) {
    addFixture(w, c, "petite-finale", c.knockout.petiteFinale ?? c.knockout.finale!, loserOf(sf[0]!), loserOf(sf[1]!), { neutral: true, venue });
  }
  const bronze = fixturesOf(w, c.id, (s) => s === "petite-finale")[0];
  const final = fixturesOf(w, c.id, (s) => s === "finale")[0];
  if (bronze?.result) for (const t of [bronze.home, bronze.away]) releaseNation(w, t);
  if (final?.result && bronze?.result && !c.outcome) {
    const champion = winnerOf(final);
    c.outcome = { champion, runnerUp: loserOf(final), ranking: [champion, loserOf(final), winnerOf(bronze), loserOf(bronze)], notes: [`Troisième : ${nameOf(w, winnerOf(bronze))}`] };
    for (const t of [final.home, final.away]) releaseNation(w, t);
    news(w, c.id, [], `${nameOf(w, champion)} est championne du monde ! Victoire ${Math.max(...final.result.score)}-${Math.min(...final.result.score)} contre ${nameOf(w, loserOf(final))} en finale.`, 3);
  }
}

/** The players of an eliminated nation leave the national team today (once). */
function releaseNation(w: World, nation: string): void {
  if (!generate(w.competitions["world-cup"]!, `sortie-${nation}`)) return;
  for (const ps of Object.values(w.players)) if (ps.duty?.nation === nation && ps.duty.until > w.date) ps.duty.until = w.date;
}
