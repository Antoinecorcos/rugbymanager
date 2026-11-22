/**
 * Imports the real 2026-2027 calendar into packages/data/calendar/2026-2027.json:
 *  - Top 14 and Pro D2: official LNR calendar, round by round (dates, fixtures, knock-out dates);
 *  - PREM, URC, Champions Cup, Challenge Cup, Nations Championship, Six Nations: en.wikipedia
 *    ({{rugbybox}} fixtures: date, home, away, venue);
 *  - Nationale: no dated calendar is published → generated (double round robin on Saturdays).
 * Results already played in the real world are NOT imported: the game starts on 1 July 2026.
 *
 * Usage: pnpm --filter @ovalie/data import:calendar
 */
import { generateLeagueSchedule, type CupSchedule, type InternationalSchedule, type IsoDate, type LeagueSchedule, type ScheduledMatch, type ScheduledRound, type SeasonCalendar } from "@ovalie/engine";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_ROOT, readDatabase } from "../../src/io.js";
import { seasonCalendarSchema } from "../../src/calendar.js";
import { fetchText } from "./http.js";
import { nameKey, plainText, templateParams } from "./text.js";
import { wikitexts } from "./wikipedia-fr.js";
import { EN_API } from "./wikipedia-en.js";

const SEASON = "2026-2027";
const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
/** "25 September 2026", "25 September", "samedi 05 septembre" → ISO (season years 2026/2027). */
function parseDate(s: string): IsoDate | undefined {
  const t = nameKey(plainText(s));
  const m = /(\d{1,2}) ([a-z]+)(?: (\d{4}))?/.exec(t) ?? /([a-z]+) (\d{1,2}),? (\d{4})/.exec(t);
  if (!m) return undefined;
  let day: number, mon: number | undefined, year: number | undefined;
  if (/^\d/.test(m[1]!)) {
    day = Number(m[1]);
    mon = MONTHS[m[2]!];
    year = m[3] ? Number(m[3]) : undefined;
  } else {
    mon = MONTHS[m[1]!];
    day = Number(m[2]);
    year = Number(m[3]);
  }
  if (!mon) return undefined;
  // Season 2026-27: July–December 2026, January–June 2027 (also fixes year typos in sources).
  void year;
  year = mon >= 7 ? 2026 : 2027;
  return `${year}-${pad(mon)}-${pad(day)}`;
}

// ------------------------------------------------------------ team names → ids

const db = readDatabase();
const aliases = new Map<string, string>();
const addAlias = (name: string | undefined, id: string) => {
  if (name) aliases.set(nameKey(name.replace(/^en:/, "")), id);
};
for (const d of db) {
  for (const n of [d.club.id, d.club.name, d.club.shortName, d.club.city, d.club.sources?.wikipedia]) addAlias(n, d.club.id);
}
const EXTRA: Record<string, string> = {
  "Stade Toulousain": "toulouse", Toulouse: "toulouse", "Union Bordeaux Bègles": "bordeaux-begles", "Bordeaux Bègles": "bordeaux-begles", "Bordeaux-Bègles": "bordeaux-begles",
  "Stade Français": "paris", "Stade Français Paris": "paris", "Racing 92": "racing-92", Racing: "racing-92", Clermont: "clermont", "ASM Clermont Auvergne": "clermont",
  "Stade Rochelais": "la-rochelle", "La Rochelle": "la-rochelle", Toulon: "toulon", "RC Toulon": "toulon", "RC Toulonnais": "toulon", Castres: "castres", "Castres Olympique": "castres",
  Pau: "pau", "Section Paloise": "pau", Montpellier: "montpellier", "Montpellier Hérault Rugby": "montpellier", Lyon: "lyon", "Lyon OU": "lyon", Bayonne: "bayonne",
  "Aviron Bayonnais": "bayonne", Perpignan: "perpignan", "USA Perpignan": "perpignan", Vannes: "vannes", "RC Vannes": "vannes",
  "Harlequin F.C.": "harlequins", "Saracens F.C.": "saracens", "Leicester Tigers": "leicester-tigers", Tigers: "leicester-tigers", Leicester: "leicester-tigers", "Gloucester Rugby": "gloucester",
  "Newcastle Falcons": "newcastle-red-bulls", Newcastle: "newcastle-red-bulls", Northampton: "northampton-saints", Sale: "sale-sharks", Exeter: "exeter-chiefs", Bristol: "bristol-bears",
  "Dragons RFC": "dragons", "Ospreys (rugby union)": "ospreys", "Edinburgh Rugby": "edinburgh", "Zebre Parma": "zebre", Zebre: "zebre", "Ulster Rugby": "ulster", "Munster Rugby": "munster",
  "Leinster Rugby": "leinster", "Connacht Rugby": "connacht", "Cardiff Rugby": "cardiff", "Benetton Rugby": "benetton", "Bulls (rugby union)": "bulls", "Sharks (rugby union)": "sharks",
  "Stormers": "stormers", "Lions (United Rugby Championship)": "lions", "Glasgow Warriors": "glasgow-warriors", Glasgow: "glasgow-warriors", "Black Lion (rugby union)": "black-lion",
  "Cheetahs (rugby union)": "cheetahs", Cheetahs: "cheetahs", "Black Lion": "black-lion", "Scarlets": "scarlets",
};
for (const [k, v] of Object.entries(EXTRA)) addAlias(k, v);

const unknown = new Set<string>();
function clubId(cell: string): string {
  const link = /\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/.exec(cell);
  for (const cand of [link?.[1], link?.[2], plainText(cell)]) {
    const id = cand ? aliases.get(nameKey(cand)) : undefined;
    if (id) return id;
  }
  unknown.add(plainText(cell) || cell);
  return "?";
}

const NATION: Record<string, string> = { IRE: "IRL", IRL: "IRL", ENG: "ENG", SCO: "SCO", WAL: "WAL", ITA: "ITA", FRA: "FRA", NZL: "NZL", RSA: "RSA", AUS: "AUS", ARG: "ARG", FIJ: "FIJ", JPN: "JPN", GEO: "GEO", SAM: "SAM", TGA: "TGA", TON: "TGA" };
function nationId(cell: string): string {
  const m = /\{\{\s*ru(?:-rt)?\s*\|\s*([A-Z]{3})/.exec(cell);
  const code = m ? NATION[m[1]!] : undefined;
  if (!code) unknown.add(cell);
  return code ?? "?";
}

// ------------------------------------------------------------ wikitext rugbyboxes

interface Box {
  section: string;
  date?: IsoDate;
  home: string;
  away: string;
  venue?: string;
}

/** All {{rugbybox…}} of a page with the nearest section headings ("Pool 1 > Round 2"). */
function rugbyboxes(text: string): Box[] {
  const out: Box[] = [];
  const headings: { at: number; level: number; title: string }[] = [...text.matchAll(/^(==+)\s*([^=\n]+?)\s*\1\s*$/gm)].map((m) => ({ at: m.index!, level: m[1]!.length, title: m[2]! }));
  for (const m of text.matchAll(/\{\{\s*rugbybox/gi)) {
    const params = templateParams(text.slice(m.index!), /\{\{\s*rugbybox[^|]*/i);
    if (!params) continue;
    const stack: string[] = [];
    for (const h of headings.filter((x) => x.at < m.index!)) {
      stack.length = h.level - 2;
      stack[h.level - 2] = h.title;
    }
    out.push({
      section: stack.filter(Boolean).join(" > "),
      date: parseDate(params["date"] ?? ""),
      home: params["home"] ?? params["team1"] ?? "",
      away: params["away"] ?? params["team2"] ?? "",
      venue: params["stadium"] ? plainText(params["stadium"]).split(",")[0] : undefined,
    });
  }
  return out;
}

const roundOf = (section: string): number | undefined => {
  const m = /Round (\d+)/i.exec(section);
  return m ? Number(m[1]) : undefined;
};

function toRounds(boxes: Box[], team: (cell: string) => string): ScheduledRound[] {
  const rounds = new Map<number, ScheduledMatch[]>();
  for (const b of boxes) {
    const r = roundOf(b.section);
    if (r === undefined || !b.date) continue;
    const list = rounds.get(r) ?? [];
    const m: ScheduledMatch = { date: b.date, home: team(b.home), away: team(b.away) };
    if (b.venue) m.venue = b.venue;
    list.push(m);
    rounds.set(r, list);
  }
  return [...rounds].sort((a, b) => a[0] - b[0]).map(([round, matches]) => ({ round, matches }));
}

/** First date of the boxes whose section matches. */
const stageDate = (boxes: Box[], re: RegExp): IsoDate | undefined =>
  boxes.filter((b) => re.test(b.section) && b.date).map((b) => b.date!).sort()[0];

/** Compact fixture tables: "| 4 July 2026 || {{ru-rt|NZL}} || score || {{ru|FRA}} || venue". */
function compactFixtures(text: string): Box[] {
  const out: Box[] = [];
  const headings = [...text.matchAll(/^(==+)\s*([^=\n]+?)\s*\1\s*$/gm)].map((m) => ({ at: m.index!, title: m[2]! }));
  for (const m of text.matchAll(/^\|[^\n]*?(\d{1,2} [A-Z][a-z]+ \d{4})\s*\|\|([^\n]*)$/gm)) {
    const cells = m[2]!.split("||");
    const nations = cells.filter((c) => /\{\{\s*ru(-rt)?\s*\|/.test(c));
    if (nations.length < 2) continue;
    const section = headings.filter((h) => h.at < m.index!).at(-1)?.title ?? "";
    out.push({ section, date: parseDate(m[1]!), home: nations[0]!, away: nations[1]!, venue: plainText(cells.at(-1) ?? "").split(",")[0] });
  }
  return out;
}

// ------------------------------------------------------------ LNR

interface LnrWeek {
  slug: string;
  name: string;
  number: number;
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");

async function lnrLeague(site: "top14" | "prod2", id: string): Promise<LeagueSchedule> {
  const base = `https://${site}.lnr.fr/calendrier-et-resultats/${SEASON}`;
  const first = await fetchText(`${base}/j1`);
  // Weeks of the 2026-27 edition (regular rounds + knock-out weeks).
  const season = JSON.parse(decode(/:current-season='([^']*)'/.exec(first)![1]!)) as { id: number };
  const filters = JSON.parse(decode(/:filter-list='([^']*)'/.exec(first)![1]!)) as { weeks: Record<string, LnrWeek[]> };
  const weeks = filters.weeks[String(season.id)] ?? [];
  const rounds: ScheduledRound[] = [];
  const knockout: Record<string, IsoDate> = {};
  for (const w of weeks) {
    const html = await fetchText(`${base}/${w.slug}`);
    const cur = JSON.parse(decode(/:current-week='([^']*)'/.exec(html)![1]!)) as { overridden_starts_at?: string; starts_at: string; ends_at: string; overridden_ends_at?: string };
    // Week boundaries are published in UTC at 22:00 the day before (Paris midnight).
    const weekStart = new Date(new Date(cur.overridden_starts_at ?? cur.starts_at).getTime() + 3 * 3600000).toISOString().slice(0, 10);
    const body = html.slice(html.indexOf('class="calendar-results'));
    const matches: ScheduledMatch[] = [];
    let date: IsoDate | undefined;
    const re = /calendar-results__fixture-date[^>]*>([^<]*)<|<a\s+href="https:\/\/[a-z0-9]+\.lnr\.fr\/club\/([a-z0-9-]+)"[^>]*club-line__name/g;
    let clubs: string[] = [];
    for (const m of body.matchAll(re)) {
      if (m[1] !== undefined) date = parseDate(m[1]);
      else if (m[2]) {
        clubs.push(m[2]);
        if (clubs.length === 2) {
          matches.push({ date: date ?? weekStart, home: clubs[0]!, away: clubs[1]! });
          clubs = [];
        }
      }
    }
    if (/^j\d+$/.test(w.slug)) rounds.push({ round: w.number, matches });
    else {
      const key = /barrage/.test(w.slug) ? "barrages" : /demi/.test(w.slug) ? "demiFinales" : /finale/.test(w.slug) ? "finale" : /access/.test(w.slug) ? "access" : w.slug;
      knockout[key] = matches[0]?.date ?? nextSaturdayOrSame(weekStart);
    }
  }
  return { id, rounds: rounds.sort((a, b) => a.round - b.round), knockout };
}

function nextSaturdayOrSame(d: IsoDate): IsoDate {
  const day = new Date(`${d}T00:00:00Z`).getUTCDay();
  return new Date(Date.parse(`${d}T00:00:00Z`) + ((6 - day + 7) % 7) * 86400000).toISOString().slice(0, 10);
}

// ------------------------------------------------------------ main

async function main() {
  const top14 = await lnrLeague("top14", "top14");
  const prod2 = await lnrLeague("prod2", "prod2");

  const pages = await wikitexts(
    [
      "2026–27 Premiership Rugby",
      "2026–27 United Rugby Championship",
      "2026–27 European Rugby Champions Cup pool stage",
      "2026–27 EPCR Challenge Cup pool stage",
      "2026–27 European Rugby Champions Cup",
      "2026–27 EPCR Challenge Cup",
      "2026–27 European Rugby Champions Cup knockout stage",
      "2026–27 EPCR Challenge Cup knockout stage",
      "2026 Nations Championship",
      "2027 Six Nations Championship",
    ],
    EN_API,
  );
  const page = (t: string) => pages.get(t)?.text ?? "";

  const premBoxes = rugbyboxes(page("2026–27 Premiership Rugby"));
  const prem: LeagueSchedule = {
    id: "prem",
    rounds: toRounds(premBoxes, clubId),
    knockout: { demiFinales: stageDate(premBoxes, /Semi/i) ?? "2027-06-05", finale: stageDate(premBoxes, /Final$|> Final/) ?? "2027-06-19" },
  };
  const urcBoxes = rugbyboxes(page("2026–27 United Rugby Championship"));
  const urc: LeagueSchedule = {
    id: "urc",
    rounds: toRounds(urcBoxes, clubId),
    knockout: { quarts: stageDate(urcBoxes, /Quarter/i) ?? "2027-05-29", demiFinales: stageDate(urcBoxes, /Semi/i) ?? "2027-06-05", finale: stageDate(urcBoxes, /> Final$/) ?? "2027-06-12" },
  };

  const cup = (id: string, poolPage: string, mainPages: string[], defaults: Record<string, IsoDate>, finalVenue: string): CupSchedule => {
    const boxes = rugbyboxes(page(poolPage));
    const pools = new Map<string, Set<string>>();
    const rounds = new Map<number, ScheduledMatch[]>();
    for (const b of boxes) {
      const pool = /Pool (\d+)/.exec(b.section)?.[1];
      const r = roundOf(b.section);
      if (!pool || r === undefined || !b.date) continue;
      const m: ScheduledMatch = { date: b.date, home: clubId(b.home), away: clubId(b.away) };
      if (b.venue) m.venue = b.venue;
      (rounds.get(r) ?? rounds.set(r, []).get(r)!).push(m);
      const set = pools.get(pool) ?? pools.set(pool, new Set()).get(pool)!;
      set.add(m.home).add(m.away);
    }
    const ko = mainPages.flatMap((p) => rugbyboxes(page(p)));
    return {
      id,
      pools: [...pools].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => [...s]),
      rounds: [...rounds].sort((a, b) => a[0] - b[0]).map(([round, matches]) => ({ round, matches })),
      knockout: {
        huitiemes: (stageDate(ko, /Round of 16/i) ?? defaults.huitiemes)!,
        quarts: (stageDate(ko, /Quarter/i) ?? defaults.quarts)!,
        demiFinales: (stageDate(ko, /Semi/i) ?? defaults.demiFinales)!,
        finale: (stageDate(ko, /^(?!.*Semi)(?!.*Quarter).*Final/i) ?? defaults.finale)!,
      },
      finalVenue,
    };
  };
  // Knock-out dates from EPCR's published calendar when the pages have no fixtures yet.
  const championsCup = cup("champions-cup", "2026–27 European Rugby Champions Cup pool stage", ["2026–27 European Rugby Champions Cup", "2026–27 European Rugby Champions Cup knockout stage"], { huitiemes: "2027-04-03", quarts: "2027-04-10", demiFinales: "2027-05-01", finale: "2027-05-22" }, "OL Stadium, Lyon");
  const challengeCup = cup("challenge-cup", "2026–27 EPCR Challenge Cup pool stage", ["2026–27 EPCR Challenge Cup", "2026–27 EPCR Challenge Cup knockout stage"], { huitiemes: "2027-04-03", quarts: "2027-04-10", demiFinales: "2027-05-01", finale: "2027-05-21" }, "OL Stadium, Lyon");

  const ncBoxes = rugbyboxes(page("2026 Nations Championship"));
  const nations: InternationalSchedule = {
    id: "nations-championship",
    groups: [
      ["ENG", "FRA", "IRL", "ITA", "SCO", "WAL"],
      ["ARG", "AUS", "FIJ", "JPN", "NZL", "RSA"],
    ],
    rounds: toRounds(compactFixtures(page("2026 Nations Championship")).filter((b) => /^Round \d/.test(b.section)), nationId),
    finals: [/Nations Championship Final/, /Third place/, /Fifth place/, /Seventh place/, /Ninth place/, /Eleventh place/].map((re) => stageDate(ncBoxes, re) ?? "2026-11-28"),
    finalsVenue: "Twickenham Stadium",
  };
  const sixNations: InternationalSchedule = {
    id: "six-nations",
    groups: [["ENG", "FRA", "IRL", "ITA", "SCO", "WAL"]],
    rounds: toRounds(rugbyboxes(page("2027 Six Nations Championship")), nationId),
  };

  // Nationale: generated, on the Pro D2 weekends (the FFR publishes no dated calendar here).
  const nationaleClubs = db.filter((d) => d.club.league === "NATIONALE").map((d) => d.club.id).sort();
  const nationale = generateLeagueSchedule("nationale", nationaleClubs, "2026-09-05", ["2026-10-31", "2026-12-26", "2027-01-02", "2027-02-20", "2027-03-20"]);

  const all = [...prod2.rounds, ...top14.rounds].flatMap((r) => r.matches.map((m) => m.date));
  const calendar: SeasonCalendar = {
    season: SEASON,
    start: "2026-07-01",
    end: "2027-06-30",
    leagues: [top14, prod2, nationale, prem, urc],
    cups: [championsCup, challengeCup],
    internationals: [nations, sixNations],
    windows: [
      // Squads gather about a week before the first test and are released the day after the last one.
      { id: "tests-juillet", name: "Tests de juillet", start: "2026-07-01", end: windowEnd(nations, 1, 3), nations: "*" },
      { id: "tests-novembre", name: "Tests de novembre", start: addDaysIso(windowStart(nations, 4, 6), -7), end: addDaysIso(nations.finals!.slice().sort().at(-1)!, 1), nations: "*" },
      { id: "six-nations", name: "Tournoi des Six Nations", start: addDaysIso(windowStart(sixNations, 1, 5), -10), end: windowEnd(sixNations, 1, 5), nations: ["ENG", "FRA", "IRL", "ITA", "SCO", "WAL", "GEO", "ESP", "POR", "ROU", "BEL", "NED"] },
    ],
  };
  void all;
  const parsed = seasonCalendarSchema.parse(calendar);
  mkdirSync(join(DATA_ROOT, "calendar"), { recursive: true });
  writeFileSync(join(DATA_ROOT, "calendar", `${SEASON}.json`), JSON.stringify(parsed, null, 1) + "\n");

  for (const l of calendar.leagues) console.log(`${l.id.padEnd(22)} ${l.rounds.length} journées, ${l.rounds.reduce((a, r) => a + r.matches.length, 0)} matchs, ${l.rounds[0]?.matches[0]?.date} → ${l.rounds.at(-1)?.matches[0]?.date}, phases finales ${JSON.stringify(l.knockout)}`);
  for (const c of calendar.cups) console.log(`${c.id.padEnd(22)} ${c.pools.length} poules (${c.pools.map((p) => p.length).join("/")}), ${c.rounds.reduce((a, r) => a + r.matches.length, 0)} matchs, ${JSON.stringify(c.knockout)}`);
  for (const i of calendar.internationals) console.log(`${i.id.padEnd(22)} ${i.rounds.length} journées, ${i.rounds.reduce((a, r) => a + r.matches.length, 0)} matchs, finales ${i.finals?.join(", ") ?? "-"}`);
  if (unknown.size) console.log("Noms non reconnus :", [...unknown].join(" | "));
}

const addDaysIso = (d: IsoDate, n: number): IsoDate => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function windowStart(s: InternationalSchedule, from: number, to: number): IsoDate {
  return s.rounds.filter((r) => r.round >= from && r.round <= to).flatMap((r) => r.matches.map((m) => m.date)).sort()[0]!;
}

function windowEnd(s: InternationalSchedule, from: number, to: number): IsoDate {
  const dates = s.rounds.filter((r) => r.round >= from && r.round <= to).flatMap((r) => r.matches.map((m) => m.date)).sort();
  const last = dates.at(-1) ?? "2026-07-19";
  return new Date(Date.parse(`${last}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
