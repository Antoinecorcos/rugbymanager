/** en.wikipedia.org: PREM / URC team lists, club squads ({{RU squad player}}) and player infoboxes. */
import type { CareerSeason } from "../../src/raw.js";
import { firstLink, parseWikiTable, plainText, stripRefs, templateParams } from "./text.js";

export const EN_API = "https://en.wikipedia.org/w/api.php";

export interface EnTeam {
  article: string;
  label: string;
  coach?: string;
  stadium?: string;
  capacity?: number;
  /** "4th, Runner-up" → 4 */
  previousRank?: number;
  city?: string;
}

/** Parses the "Teams" table of a 2026–27 PREM / URC season article. */
export function parseTeams(text: string): EnTeam[] {
  const i = text.search(/==\s*Teams\s*==/);
  if (i < 0) return [];
  const start = text.indexOf("{|", i);
  const rows = parseWikiTable(text.slice(start, text.indexOf("\n|}", start)));
  const header = rows.find((r) => r.header)?.cells.map((c) => plainText(c).toLowerCase()) ?? [];
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cCoach = col(/coach|director/);
  const cStadium = col(/stadium/);
  const cCap = col(/capacity/);
  const cRank = col(/position|last season/);
  const cCity = col(/city|area/);
  const out: EnTeam[] = [];
  for (const r of rows.filter((x) => !x.header && x.cells.length >= 4)) {
    const link = firstLink(r.cells[0]!);
    if (!link) continue;
    const t: EnTeam = { article: link.target, label: link.label };
    if (cCoach >= 0) t.coach = firstLink(r.cells[cCoach] ?? "")?.label;
    if (cStadium >= 0) t.stadium = firstLink(r.cells[cStadium] ?? "")?.label ?? (plainText(r.cells[cStadium] ?? "") || undefined);
    if (cCap >= 0) {
      const raw = stripRefs(r.cells[cCap] ?? "").replace(/\{\{sort\|[^|]*\|([^}]*)\}\}/, "$1");
      const n = Number(plainText(raw).replace(/[^\d]/g, ""));
      if (n > 0) t.capacity = n;
    }
    if (cRank >= 0) {
      const m = /(\d+)(st|nd|rd|th)/.exec(plainText(r.cells[cRank] ?? ""));
      if (m) t.previousRank = Number(m[1]);
    }
    if (cCity >= 0) t.city = firstLink(r.cells[cCity] ?? "")?.label;
    out.push(t);
  }
  return out;
}

export interface EnSquadPlayer {
  name: string;
  article?: string;
  nationality: string;
  section: string;
  capped: boolean;
  captain: boolean;
  bornYear?: number;
}

/** First senior (non-academy) {{Rugby union squad start}} block of a club article. */
export function parseEnSquad(text: string): EnSquadPlayer[] {
  let idx = 0;
  while ((idx = text.indexOf("{{Rugby union squad start", idx)) >= 0) {
    const head = text.slice(idx, idx + 300);
    const end = text.indexOf("{{Rugby union squad end", idx);
    const block = text.slice(idx, end > 0 ? end : undefined);
    idx += 20;
    if (/academy|women|sevens|\bA\b squad/i.test(head)) continue;
    const out: EnSquadPlayer[] = [];
    let section = "";
    for (const line of block.split("\n")) {
      const sec = /^'''([^']+)'''/.exec(line.trim());
      if (sec) {
        section = sec[1]!.trim();
        continue;
      }
      if (!/\{\{\s*RU squad player/i.test(line)) continue;
      const params = templateParams(line, /\{\{\s*RU squad player/i);
      // Positional parameters: |NAT|Name|…
      const positional = line
        .replace(/^.*?\{\{\s*RU squad player\s*\|/i, "")
        .split("|")
        .filter((p) => !p.includes("="));
      const nat = (positional[0] ?? "").trim().toUpperCase();
      const name = plainText((positional[1] ?? "").replace(/\}\}.*$/, ""));
      if (!name) continue;
      out.push({
        name,
        article: params?.["link"] ? plainText(params["link"]) : params?.["nolink"] ? undefined : name,
        nationality: nat,
        section,
        capped: /^y/i.test(params?.["cap"] ?? ""),
        captain: /^y/i.test(params?.["captain"] ?? params?.["c"] ?? ""),
        bornYear: Number(params?.["born"]) || undefined,
      });
    }
    if (out.length >= 20) return out;
  }
  return [];
}

export interface EnPlayerInfo {
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  position?: string;
  caps?: number;
  /** Senior national team named in the infobox. */
  capsTeam?: string;
  /** Appearances for the current club and since when (club career → usage proxy). */
  currentClub?: { since: number; apps: number; points: number; club: string };
}

/** First integer of an infobox value, ignoring references and footnotes. */
const firstInt = (v: string | undefined): number => {
  const m = /\d+/.exec(plainText(stripRefs(v ?? "")));
  return m ? Number(m[0]) : 0;
};

export function parseEnInfobox(text: string): EnPlayerInfo {
  const p = templateParams(text, /\{\{\s*Infobox rugby (?:union )?biography/i);
  if (!p) return {};
  const out: EnPlayerInfo = {};
  const bd = /(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/.exec(p["birth_date"] ?? "");
  if (bd) out.birthDate = `${bd[1]}-${bd[2]!.padStart(2, "0")}-${bd[3]!.padStart(2, "0")}`;
  const h = p["height"] ?? "";
  const hm = /(?:convert\|)?\s*([12]\.\d{1,2})\s*\|?\s*m\b/.exec(h) ?? /m\s*=\s*([12]\.\d{1,2})/.exec(h);
  const hcm = /(\d{3})\s*\|?\s*cm/.exec(h);
  if (hm) out.heightCm = Math.round(Number(hm[1]) * 100);
  else if (hcm) out.heightCm = Number(hcm[1]);
  const w = p["weight"] ?? "";
  const wk = /(\d{2,3})\s*\|?\s*kg/.exec(w);
  const wst = /(\d{1,2})\s*\|?\s*st\s*\|?\s*(\d{1,2})?\s*\|?\s*lb/.exec(w);
  const wlb = /(\d{3})\s*\|?\s*lb/.exec(w);
  if (wk) out.weightKg = Number(wk[1]);
  else if (wst) out.weightKg = Math.round((Number(wst[1]) * 14 + Number(wst[2] ?? 0)) * 0.4536);
  else if (wlb) out.weightKg = Math.round(Number(wlb[1]) * 0.4536);
  if (p["position"]) out.position = plainText(p["position"].replace(/<br\s*\/?>/g, ", "));
  for (let i = 1; i <= 12; i++) {
    const team = p[`rep_team${i}`] ?? p[`nationalteam${i}`];
    if (!team) continue;
    const label = plainText(team);
    if (/U\d\d|under|\bA\b|XV\b|sevens|7s|Lions|Barbarians|Emerging|Saxons|Wolfhounds|Pumas?\b.*A|Selection|Development|Classic|Universit/i.test(label)) continue;
    const caps = firstInt(p[`rep_caps${i}`] ?? p[`nationalcaps${i}`]);
    if (caps > 0) {
      out.caps = caps;
      out.capsTeam = label;
    }
  }
  // Current club: the last open-ended "years" entry ("2019–").
  for (let i = 1; i <= 15; i++) {
    const years = plainText(p[`years${i}`] ?? "");
    const m = /((?:19|20)\d\d)\s*[–-]\s*$/.exec(years);
    if (!m) continue;
    const club = plainText(p[`clubs${i}`] ?? "");
    if (/loan/i.test(club)) continue;
    out.currentClub = {
      since: Number(m[1]),
      apps: firstInt(p[`apps${i}`] ?? p[`caps${i}`]),
      points: firstInt(p[`points${i}`]),
      club,
    };
  }
  return out;
}

/**
 * Converts the infobox's current-club record into one synthetic career line per season
 * (apps spread evenly), so that the same level model can use it. Minutes are estimated at
 * 60 per appearance; `competition` is the domestic league.
 */
export function careerFromInfobox(info: EnPlayerInfo, competition: string, currentSeasonStart: number): CareerSeason[] {
  const c = info.currentClub;
  if (!c || c.apps <= 0) return [];
  const seasons = Math.max(1, currentSeasonStart - c.since + 0.4); // current season ≈ 40 % played
  const perSeason = Math.min(32, c.apps / seasons);
  const out: CareerSeason[] = [];
  for (let y = currentSeasonStart - 2; y <= currentSeasonStart; y++) {
    if (y < c.since) continue;
    const share = y === currentSeasonStart ? 0.4 : 1;
    const matches = Math.round(perSeason * share);
    out.push({ season: `${y}-${y + 1}`, competition, club: c.club, matches, minutes: matches * 60, points: 0, tries: 0, penalties: 0, drops: 0, yellowCards: 0, redCards: 0 });
  }
  return out;
}
