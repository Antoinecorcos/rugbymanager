/** Scraper for the official LNR websites (top14.lnr.fr, prod2.lnr.fr). */
import type { CareerSeason } from "../../src/raw.js";
import { fetchText } from "./http.js";
import { nationFromFrenchName, titleCaseSurname } from "./text.js";

export type LnrSite = "top14" | "prod2";

const decode = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const text = (html: string): string => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export async function listClubs(site: LnrSite): Promise<string[]> {
  const html = await fetchText(`https://${site}.lnr.fr/clubs`);
  const re = new RegExp(`href="https://${site}\\.lnr\\.fr/club/([a-z0-9-]+)"`, "g");
  return [...new Set([...html.matchAll(re)].map((m) => m[1]!))].sort();
}

export interface LnrClubInfo {
  slug: string;
  name: string;
  president?: string;
  founded?: number;
  stadiumName?: string;
  stadiumCapacity?: number;
  stadiumAddress?: string;
}

export async function clubInfo(site: LnrSite, slug: string): Promise<LnrClubInfo> {
  const html = await fetchText(`https://${site}.lnr.fr/club/${slug}/informations`);
  const t = text(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, ""));
  const after = (label: string, until: string[]): string | undefined => {
    const i = t.indexOf(label);
    if (i < 0) return undefined;
    let rest = t.slice(i + label.length).trim();
    for (const u of until) {
      const j = rest.indexOf(u);
      if (j >= 0) rest = rest.slice(0, j);
    }
    return rest.trim() || undefined;
  };
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? slug;
  const name = decode(title).replace(/^Informations générales\s*/, "").replace(/\s*[-|].*$/, "").trim();
  const cap = after("Capacité :", ["places"]);
  const president = after("Président :", ["E-mail", "Téléphone", "Fondé", "Adresse"]);
  return {
    slug,
    name,
    president: president ? normaliseUpperName(president) : undefined,
    founded: Number(after("Fondé en :", [" "])) || undefined,
    stadiumName: after("Nom :", ["Capacité"]),
    stadiumCapacity: cap ? Number(cap.replace(/\D/g, "")) || undefined : undefined,
    stadiumAddress: after("Adresse du stade :", ["Les avantages", "Bon plan"]),
  };
}

export interface LnrSquadEntry {
  url: string;
  lnrId: number;
  slug: string;
  displayName: string;
  positionGroup: string;
}

export async function squad(site: LnrSite, slug: string): Promise<LnrSquadEntry[]> {
  const html = await fetchText(`https://${site}.lnr.fr/club/${slug}/effectif-staff`);
  const out: LnrSquadEntry[] = [];
  const re = /<a href="(https:\/\/[a-z0-9]+\.lnr\.fr\/joueur\/(\d+)-([a-z0-9-]+))" class="player-block[\s\S]*?player-block__name">([^<]*)<\/p>\s*<p class="player-block__position">([^<]*)<\/p>/g;
  for (const m of html.matchAll(re)) {
    out.push({ url: m[1]!, lnrId: Number(m[2]), slug: m[3]!, displayName: decode(m[4]!).trim(), positionGroup: decode(m[5]!).trim() });
  }
  // The page lists each player once; guard against duplicates anyway.
  return [...new Map(out.map((e) => [e.lnrId, e])).values()];
}

export interface LnrPlayer {
  firstName: string;
  lastName: string;
  heightCm?: number;
  weightKg?: number;
  age?: number;
  nationality?: string;
  nationalityLabel?: string;
  position?: string;
  career: CareerSeason[];
}

export async function player(url: string): Promise<LnrPlayer> {
  const html = await fetchText(url);
  const attrs = [...html.matchAll(/<span class="player-infos__attribute">([\s\S]*?)<\/span>/g)].map((m) => ({
    raw: m[1]!,
    text: text(m[1]!),
  }));
  let heightCm: number | undefined;
  let weightKg: number | undefined;
  let age: number | undefined;
  let nationalityLabel: string | undefined;
  for (const a of attrs) {
    const h = /(\d)m(\d{2})/.exec(a.text);
    if (a.raw.includes("icon--profil") && h) heightCm = Number(h[1]) * 100 + Number(h[2]);
    else if (a.raw.includes("icon--weight")) weightKg = Number(a.text.replace(/\D/g, "")) || undefined;
    else if (a.raw.includes("icon--birthday")) age = Number(a.text.replace(/\D/g, "")) || undefined;
    else if (a.raw.includes("attribute-flag")) nationalityLabel = a.text;
  }
  const nameHtml = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
  const { firstName, lastName } = splitLnrName(text(nameHtml));
  const position = /player-infos__position[^>]*>([^<]*)</.exec(html)?.[1];
  const rowsAttr = /<history-season-list\s+:rows="([^"]*)"/.exec(html)?.[1];
  const career: CareerSeason[] = [];
  if (rowsAttr) {
    const rows = JSON.parse(decode(rowsAttr)) as {
      season: string;
      competition: string;
      club: { name: string };
      matchesPlayed: number;
      minutesPlayed: number;
      points: number;
      tries: number;
      penalties: number;
      drops: number;
      yellowCards: number;
      redCards: number;
    }[];
    for (const r of rows) {
      career.push({
        season: r.season,
        competition: r.competition,
        club: r.club?.name ?? "?",
        matches: r.matchesPlayed ?? 0,
        minutes: r.minutesPlayed ?? 0,
        points: r.points ?? 0,
        tries: r.tries ?? 0,
        penalties: r.penalties ?? 0,
        drops: r.drops ?? 0,
        yellowCards: r.yellowCards ?? 0,
        redCards: r.redCards ?? 0,
      });
    }
  }
  return {
    firstName,
    lastName,
    heightCm,
    weightKg,
    age,
    nationalityLabel,
    nationality: nationalityLabel ? nationFromFrenchName(nationalityLabel) : undefined,
    position: position ? decode(position).trim() : undefined,
    career,
  };
}

/** "Antoine DUPONT" → { Antoine, Dupont }; surname = trailing upper-case words. */
export function splitLnrName(full: string): { firstName: string; lastName: string } {
  const words = full.trim().split(/\s+/);
  let k = words.length;
  while (k > 1 && isUpper(words[k - 1]!)) k--;
  if (k === words.length) k = words.length - 1; // no upper-case word: last word is the surname
  return { firstName: words.slice(0, k).join(" "), lastName: titleCaseSurname(words.slice(k).join(" ")) };
}

const isUpper = (w: string): boolean => /\p{Lu}/u.test(w) && w === w.toUpperCase();

function normaliseUpperName(s: string): string {
  const { firstName, lastName } = splitLnrName(s);
  return `${firstName} ${lastName}`.trim();
}
