/**
 * Imports the Nationale (3rd division, FFR) clubs and the squads published on fr.wikipedia
 * into packages/data/raw/nationale/. Clubs without a published squad get an empty squad:
 * the build step completes it with generated players (GDD §2.1, « sinon complétés »).
 *
 * Usage: pnpm --filter @ovalie/data import:nationale
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_ROOT, readRawSquads, serialiseRawSquad } from "../../src/io.js";
import { rawSquadSchema, type RawClub, type RawPlayer, type RawSquad } from "../../src/raw.js";
import { slugify } from "./text.js";
import { parseClubSquad, parseParticipants, parsePlayerInfobox, squadColors, wikitext, wikitexts } from "./wikipedia-fr.js";

const SEASON = "2026-2027";
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = join(DATA_ROOT, "raw/nationale");

/** Short ids and names (the Wikipedia labels are long official names). */
const CLUBS: Record<string, { id: string; name: string; shortName: string }> = {
  "Stade montois rugby": { id: "mont-de-marsan", name: "Stade montois", shortName: "SMR" },
  "Union sportive carcassonnaise XV": { id: "carcassonne", name: "US Carcassonne", shortName: "USC" },
  "Sporting Club albigeois": { id: "albi", name: "SC Albi", shortName: "SCA" },
  "Stade olympique de Chambéry rugby": { id: "chambery", name: "SO Chambéry", shortName: "SOC" },
  "Rugby Club Massy Essonne": { id: "massy", name: "RC Massy Essonne", shortName: "RCME" },
  "Club athlétique Périgueux Dordogne": { id: "perigueux", name: "CA Périgueux", shortName: "CAP" },
  "Rouen Normandie Rugby": { id: "rouen", name: "Rouen Normandie Rugby", shortName: "RNR" },
  "Union sportive bressane Pays de l'Ain": { id: "bourg-en-bresse", name: "US Bressane", shortName: "USB" },
  "Club sportif Bourgoin-Jallieu rugby": { id: "bourgoin-jallieu", name: "CS Bourgoin-Jallieu", shortName: "CSBJ" },
  "Rugby Club Suresnes Hauts-de-Seine": { id: "suresnes", name: "RC Suresnes", shortName: "RCS" },
  "Rennes Étudiants Club rugby": { id: "rennes", name: "Rennes EC", shortName: "REC" },
  "Olympique marcquois rugby": { id: "marcq-en-baroeul", name: "Olympique marcquois", shortName: "OMR" },
  "Rugby Club Orléans": { id: "orleans", name: "RC Orléans", shortName: "RCO" },
  "Club sportif de Vienne rugby": { id: "vienne", name: "CS Vienne", shortName: "CSV" },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const usedIds = new Set(readRawSquads().filter((s) => s.club.league !== "NATIONALE").flatMap((s) => s.players.map((p) => p.id)));
  const parts = parseParticipants((await wikitext(`Championnat de France de rugby à XV de Nationale ${SEASON}`)) ?? "");
  const pages = await wikitexts(parts.map((p) => p.article));
  for (const part of parts) {
    const ref = CLUBS[part.article] ?? { id: slugify(part.label), name: part.label, shortName: part.label.slice(0, 3).toUpperCase() };
    const page = pages.get(part.article);
    const squad = page ? parseClubSquad(page.text, SEASON) : [];
    const boxes = await wikitexts(squad.map((s) => s.article).filter((a): a is string => !!a));
    const players: RawPlayer[] = squad.map((w) => {
      const ib = w.article ? boxes.get(w.article) : undefined;
      const box = ib && /Infobox Rugbyman/i.test(ib.text) ? parsePlayerInfobox(ib.text) : {};
      const words = w.name.split(" ");
      let id = slugify(w.name);
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(w.name)}-${n}`;
      usedIds.add(id);
      const p: RawPlayer = {
        id,
        firstName: words[0]!,
        lastName: words.slice(1).join(" ") || words[0]!,
        birthDate: w.birthDate ?? box.birthDate,
        nationality: w.nationality ?? "FRA",
        heightCm: box.heightCm,
        weightKg: box.weightKg,
        positionGroup: w.sectionLabel ?? box.position ?? "?",
        positionHints: [box.position].filter((x): x is string => !!x),
        caps: w.caps ?? box.caps,
        capped: w.capped || (w.caps ?? box.caps ?? 0) > 0 || undefined,
        sevens: w.sevens,
        homegrown: w.homegrown,
        previousClub: w.previousClub,
        arrivalYear: w.arrivalYear,
        career: [],
        sources: { wikipedia: ib?.title, wikidata: ib?.qid },
      };
      return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as RawPlayer;
    });
    const club: RawClub = {
      id: ref.id,
      name: ref.name,
      shortName: ref.shortName,
      league: "NATIONALE",
      country: "FRA",
      city: part.city,
      stadium: { name: part.stadium ?? "?", city: part.city, capacity: part.capacity },
      headCoach: part.headCoach,
      budgetEur: part.budgetEur,
      previousRank: part.previousRank,
      colors: page ? squadColors(page.text, SEASON) : undefined,
      sources: { wikipedia: part.article },
    };
    const raw: RawSquad = rawSquadSchema.parse({ club, importedAt: TODAY, players });
    writeFileSync(join(OUT, `${ref.id}.json`), serialiseRawSquad(raw));
    console.log(`${ref.id.padEnd(18)} ${String(players.length).padStart(3)} joueurs (Wikipédia)${players.length ? "" : " → effectif à compléter"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
