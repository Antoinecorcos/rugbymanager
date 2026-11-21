/**
 * Imports the PREM (England) and URC (Ireland, Scotland, Wales, Italy, South Africa) squads
 * for 2026-27 from en.wikipedia.org into packages/data/raw/{prem,urc}/.
 * These leagues are simulated in the background (GDD §2.1): squads are real, levels are
 * estimated from caps, age and club appearances (no official minute-level statistics).
 *
 * Usage: pnpm --filter @ovalie/data import:en
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_ROOT, readRawSquads, serialiseRawSquad } from "../../src/io.js";
import { rawSquadSchema, type RawClub, type RawPlayer, type RawSquad } from "../../src/raw.js";
import { slugify } from "./text.js";
import { careerFromInfobox, EN_API, parseEnInfobox, parseEnSquad, parseTeams } from "./wikipedia-en.js";
import { wikitext, wikitexts } from "./wikipedia-fr.js";

const SEASON_START = 2026;
const TODAY = new Date().toISOString().slice(0, 10);

/** World Rugby style codes used by the {{RU squad player}} template → our codes. */
const NAT: Record<string, string> = { IRE: "IRL", IRL: "IRL", SCO: "SCO", WAL: "WAL", ENG: "ENG", RSA: "RSA", ITA: "ITA", NZL: "NZL", AUS: "AUS", ARG: "ARG", FIJ: "FIJ", SAM: "SAM", TGA: "TGA", TON: "TGA", GEO: "GEO", JPN: "JPN", USA: "USA", CAN: "CAN", FRA: "FRA", URU: "URU", ESP: "ESP", POR: "POR", NAM: "NAM", ZIM: "ZIM", NED: "NED", GER: "GER", BEL: "BEL", ROU: "ROU", CHI: "CHI", KEN: "KEN", HKG: "HKG", COK: "COK", SUI: "SUI", RUS: "RUS", BRA: "BRA" };

const LEAGUES = [
  { league: "PREM" as const, dir: "prem", competition: "PREM", season: "2026–27 Premiership Rugby", country: "ENG" },
  { league: "URC" as const, dir: "urc", competition: "URC", season: "2026–27 United Rugby Championship", country: "" },
];

/** Country of URC teams (the teams table lists it, but a fixed map is simpler and stable). */
const URC_COUNTRY: Record<string, string> = {
  benetton: "ITA", zebre: "ITA", bulls: "RSA", lions: "RSA", sharks: "RSA", stormers: "RSA", cardiff: "WAL", dragons: "WAL", ospreys: "WAL", scarlets: "WAL",
  connacht: "IRL", leinster: "IRL", munster: "IRL", ulster: "IRL", edinburgh: "SCO", "glasgow-warriors": "SCO",
};
const SHORT: Record<string, string> = { leinster: "LNS", leicester: "LEI", "glasgow-warriors": "GLA", "bristol-bears": "BRI", "exeter-chiefs": "EXE", "northampton-saints": "NOR", "sale-sharks": "SAL" };

async function main() {
  // Player ids are global: keep clear of the ids already used by the other leagues.
  const usedIds = new Set(readRawSquads().filter((s) => s.club.league !== "PREM" && s.club.league !== "URC").flatMap((s) => s.players.map((p) => p.id)));
  for (const L of LEAGUES) {
    const teams = parseTeams((await wikitext(L.season, EN_API)) ?? "");
    console.log(`${L.league}: ${teams.length} équipes`);
    mkdirSync(join(DATA_ROOT, "raw", L.dir), { recursive: true });
    const pages = await wikitexts(teams.map((t) => t.article), EN_API);
    for (const t of teams) {
      const id = slugify(t.label.replace(/ Rugby$| R\.?F\.?C\.?$/, ""));
      const page = pages.get(t.article);
      const squad = page ? parseEnSquad(page.text) : [];
      const isBio = (t: string | undefined) => !!t && /\{\{\s*Infobox rugby (?:union )?biography/i.test(t);
      const infos = await wikitexts(squad.map((s) => s.article).filter((a): a is string => !!a), EN_API);
      // Homonyms: retry with the usual disambiguation suffixes.
      const retry = squad.filter((s) => s.article && !isBio(infos.get(s.article)?.text)).map((s) => s.name);
      const second = await wikitexts([...retry.map((n) => `${n} (rugby union)`), ...retry.map((n) => `${n} (rugby player)`)], EN_API);
      const players: RawPlayer[] = [];
      for (const s of squad) {
        let ib = s.article ? infos.get(s.article) : undefined;
        if (!isBio(ib?.text)) ib = [second.get(`${s.name} (rugby union)`), second.get(`${s.name} (rugby player)`)].find((x) => isBio(x?.text));
        const info = ib ? parseEnInfobox(ib.text) : {};
        let pid = slugify(s.name);
        for (let n = 2; usedIds.has(pid); n++) pid = `${slugify(s.name)}-${n}`;
        usedIds.add(pid);
        const words = s.name.split(" ");
        const p: RawPlayer = {
          id: pid,
          firstName: words[0]!,
          lastName: words.slice(1).join(" ") || words[0]!,
          birthDate: info.birthDate,
          age: !info.birthDate && s.bornYear ? SEASON_START - s.bornYear : undefined,
          nationality: NAT[s.nationality] ?? (s.nationality.length === 3 ? s.nationality : "ENG"),
          heightCm: info.heightCm,
          weightKg: info.weightKg,
          positionGroup: s.section,
          positionHints: [info.position].filter((x): x is string => !!x),
          caps: info.caps,
          capped: s.capped || (info.caps ?? 0) > 0 || undefined,
          career: careerFromInfobox(info, L.competition, SEASON_START),
          sources: { wikipedia: ib ? `en:${ib.title}` : undefined, wikidata: ib?.qid },
        };
        players.push(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as RawPlayer);
      }
      const club: RawClub = {
        id,
        name: t.label,
        shortName: SHORT[id] ?? t.label.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase(),
        league: L.league,
        country: L.league === "PREM" ? "ENG" : (URC_COUNTRY[id] ?? "IRL"),
        city: t.city,
        stadium: { name: t.stadium ?? "?", city: t.city, capacity: t.capacity },
        headCoach: t.coach,
        previousRank: t.previousRank ? { league: L.league, rank: t.previousRank } : undefined,
        sources: { wikipedia: `en:${t.article}` },
      };
      const raw: RawSquad = rawSquadSchema.parse({ club, importedAt: TODAY, players });
      writeFileSync(join(DATA_ROOT, "raw", L.dir, `${id}.json`), serialiseRawSquad(raw));
      const withInfo = players.filter((p) => p.sources.wikipedia).length;
      console.log(`  ${id.padEnd(20)} ${String(players.length).padStart(3)} joueurs, ${withInfo} fiches, taille ${players.filter((p) => p.heightCm).length}, poids ${players.filter((p) => p.weightKg).length}, naissance ${players.filter((p) => p.birthDate).length}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
