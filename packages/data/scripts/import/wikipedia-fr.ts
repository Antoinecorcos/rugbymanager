/** fr.wikipedia.org: season participants, club squad tables and player infoboxes. */
import { fetchJson } from "./http.js";
import { firstLink, nationFromFrenchName, nationFromWikiCode, parseWikiDate, parseWikiTable, plainText, stripRefs, templateParams } from "./text.js";

const API = "https://fr.wikipedia.org/w/api.php";

interface QueryResponse {
  query?: {
    pages: { title: string; missing?: boolean; revisions?: { slots: { main: { content: string } } }[]; pageprops?: { wikibase_item?: string } }[];
    redirects?: { from: string; to: string }[];
    normalized?: { from: string; to: string }[];
  };
}

/** Fetches the wikitext of many pages (50 per request). Keys are the requested titles. */
export async function wikitexts(titles: string[], api = API): Promise<Map<string, { title: string; text: string; qid?: string }>> {
  const out = new Map<string, { title: string; text: string; qid?: string }>();
  const unique = [...new Set(titles)];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions|pageprops",
      rvprop: "content",
      rvslots: "main",
      ppprop: "wikibase_item",
      titles: batch.join("|"),
      redirects: "1",
      format: "json",
      formatversion: "2",
    });
    const res = await fetchJson<QueryResponse>(`${api}?${params}`);
    const alias = new Map<string, string>();
    for (const n of res.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of res.query?.redirects ?? []) alias.set(r.from, r.to);
    const resolve = (t: string): string => {
      let cur = t;
      for (let k = 0; k < 4 && alias.has(cur); k++) cur = alias.get(cur)!;
      return cur;
    };
    const byTitle = new Map(res.query?.pages.filter((p) => !p.missing && p.revisions).map((p) => [p.title, p]) ?? []);
    for (const t of batch) {
      const p = byTitle.get(resolve(t));
      if (p) out.set(t, { title: p.title, text: p.revisions![0]!.slots.main.content, qid: p.pageprops?.wikibase_item });
    }
  }
  return out;
}

export async function wikitext(title: string, api = API): Promise<string | undefined> {
  return (await wikitexts([title], api)).get(title)?.text;
}

// ---------------------------------------------------------------- season participants

export interface SeasonParticipant {
  article: string;
  label: string;
  budgetEur?: number;
  previousRank?: { league: "TOP14" | "PROD2" | "NATIONALE"; rank: number };
  headCoach?: string;
  stadium?: string;
  city?: string;
  capacity?: number;
}

/** Parses the "Participants" table of a Top 14 / Pro D2 season article. */
export function parseParticipants(text: string): SeasonParticipant[] {
  const i = text.search(/==+\s*(Participants|Clubs participants|Équipes participantes)\s*==+/);
  if (i < 0) return [];
  const start = text.indexOf("{|", i);
  const end = text.indexOf("\n|}", start);
  const rows = parseWikiTable(text.slice(start, end));
  const header = rows.find((r) => r.header)?.cells.map((c) => plainText(c).toLowerCase()) ?? [];
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cBudget = col(/budget/);
  const cRank = col(/classement/);
  const cCoach = col(/entra[iî]neur/);
  const cStadium = col(/^stade/);
  const cCap = col(/capacit/);
  const out: SeasonParticipant[] = [];
  for (const r of rows.filter((r) => !r.header)) {
    if (r.cells.length < 4) continue;
    const link = firstLink(r.cells[0]!.replace(/\{\{Tri\|[^}]*\}\}/g, ""));
    if (!link) continue;
    const p: SeasonParticipant = { article: link.target, label: link.label };
    if (cBudget >= 0) {
      const b = Number(plainText(r.cells[cBudget] ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
      if (b > 0) p.budgetEur = Math.round(b * 1e6);
    }
    if (cRank >= 0) {
      const tri = /\{\{Tri\|(\d)(\d\d)/.exec(r.cells[cRank] ?? "");
      const league = ({ "1": "TOP14", "2": "PROD2", "3": "NATIONALE" } as const)[tri?.[1] as "1" | "2" | "3"];
      if (tri && league) p.previousRank = { league, rank: Number(tri[2]) };
    }
    if (cCoach >= 0) {
      const l = firstLink(r.cells[cCoach] ?? "");
      if (l) p.headCoach = l.label;
    }
    if (cStadium >= 0) {
      const links = [...(r.cells[cStadium] ?? "").matchAll(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g)].map((m) => m[1]!.trim());
      p.stadium = links[0];
      if (links.length > 1) p.city = links[links.length - 1];
    }
    if (cCap >= 0) {
      const c = stripRefs(r.cells[cCap] ?? "").replace(/\{\{(formatnum|unité)\|(\d+)[^}]*\}\}/g, "$2").replace(/[^\d]/g, "");
      if (c) p.capacity = Number(c);
    }
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- club squads

export interface WikiSquadPlayer {
  name: string;
  article?: string;
  birthDate?: string;
  nationality?: string;
  caps?: number;
  /** Capped by the senior national team (count unknown). */
  capped?: boolean;
  sevens?: boolean;
  homegrown?: boolean;
  onLoan?: boolean;
  previousClub?: string;
  arrivalYear?: number;
  sectionLabel?: string;
  contractUntil?: number;
  jiff?: boolean;
}

/** Finds and parses the current squad (2026-2027) of a club article. */
export function parseClubSquad(text: string, season = "2026-2027"): WikiSquadPlayer[] {
  const reff = parseReffSquad(text, season);
  if (reff.length) return reff;
  const start = locateSquadTable(text, season);
  if (start < 0) return [];
  return parseSquadTable(text.slice(start, text.indexOf("\n|}", start)));
}

/** Club colours as used to style the squad table header: [background, text]. */
export function squadColors(text: string, season = "2026-2027"): [string, string] | undefined {
  const reffAt = text.search(new RegExp(`\\{\\{Reff début[^}]*saison=${season}`));
  const reff = reffAt >= 0 ? text.slice(reffAt, reffAt + 900) : undefined;
  if (reff) {
    const fond = /fond\s*=\s*(#[0-9A-Fa-f]{3,6})/.exec(reff)?.[1];
    const texte = /texte2?\s*=\s*(#[0-9A-Fa-f]{3,6})/.exec(reff)?.[1];
    if (fond) return [fond.toUpperCase(), (texte ?? "#FFFFFF").toUpperCase()];
  }
  const start = locateSquadTable(text, season);
  if (start < 0) return undefined;
  const head = text.slice(start, start + 1500);
  const bg = /background(?:-color)?\s*:\s*(#[0-9A-Fa-f]{3,6})/.exec(head)?.[1];
  const fg = /(?:^|[;"\s])color\s*:\s*(#[0-9A-Fa-f]{3,6})/.exec(head)?.[1];
  if (!bg) return undefined;
  const norm = (c: string) => (c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c).toUpperCase();
  return [norm(bg), norm(fg ?? "#FFFFFF")];
}

function locateSquadTable(text: string, season: string): number {
  // Candidate tables: wikitables with a "Naissance" header, ranked by how clearly they are the current squad.
  const candidates: { score: number; start: number }[] = [];
  const tableRe = /\{\|[^\n]*wikitable/g;
  for (const m of text.matchAll(tableRe)) {
    const start = m.index!;
    const head = text.slice(start, start + 2500);
    if (!/!\s*[^\n]*Naissance/i.test(head) || !/!\s*[^\n]*Nom/.test(head)) continue;
    const before = text.slice(Math.max(0, start - 600), start);
    const heading = [...before.matchAll(/^==+([^=\n]+)==+\s*$/gm)].pop()?.[1] ?? "";
    const caption = /\|\+([^\n]*)/.exec(head)?.[1] ?? "";
    let score = 0;
    if (heading.includes(season) || caption.includes(season)) score += 10;
    if (/actuel/i.test(heading)) score += 6;
    if (/effectif/i.test(heading)) score += 3;
    if (/20\d\d-20\d\d/.test(heading + caption) && !(heading + caption).includes(season)) score -= 20;
    candidates.push({ score, start });
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const best = candidates[0];
  return best && best.score >= 0 ? best.start : -1;
}

function parseSquadTable(table: string): WikiSquadPlayer[] {
  const rows = parseWikiTable(table);
  const header = rows.find((r) => r.header && r.cells.length >= 4)?.cells.map((c) => plainText(c).toLowerCase()) ?? [];
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cName = Math.max(0, col(/^nom/));
  const cBirth = col(/naissance/);
  const cNat = col(/nationalit/);
  const cCaps = col(/s[ée]lection|international/);
  const cPrev = col(/club pr[ée]c[ée]dent|dernier club|ancien club/);
  const cArr = col(/arriv[ée]e/);
  let section: string | undefined;
  const out: WikiSquadPlayer[] = [];
  for (const r of rows) {
    if (r.header) {
      if (r.cells.length === 1) section = plainText(r.cells[0]!);
      continue;
    }
    if (r.cells.length < 4) continue;
    const nameCell = r.cells[cName] ?? "";
    const link = firstLink(nameCell);
    const name = link?.label ?? plainText(nameCell);
    if (!name) continue;
    const p: WikiSquadPlayer = { name, article: link?.target, sectionLabel: section };
    if (cBirth >= 0) p.birthDate = parseWikiDate(r.cells[cBirth] ?? "");
    if (cNat >= 0) p.nationality = parseNation(r.cells[cNat] ?? "");
    if (cCaps >= 0) Object.assign(p, parseCaps(r.cells[cCaps] ?? "", p.nationality));
    if (cPrev >= 0) {
      const prev = r.cells[cPrev] ?? "";
      p.homegrown = /form[ée] au club/i.test(prev);
      p.onLoan = /\{\{\s*pr[êe]t/i.test(prev);
      const l = firstLink(prev);
      p.previousClub = p.homegrown ? undefined : (l?.label ?? (plainText(prev) || undefined));
    }
    if (cArr >= 0) {
      const y = /(19|20)\d\d/.exec(plainText(r.cells[cArr] ?? ""));
      if (y) p.arrivalYear = Number(y[0]);
    }
    out.push(p);
  }
  return out;
}

/** {{Reff joueur|prénom=…|nom=…|pos=P|jour=…|mois=…|an=…|nat=France|sel=…|ancien club=…|contrat=2027|JIFF={{Fait}}}} */
function parseReffSquad(text: string, season: string): WikiSquadPlayer[] {
  const startIdx = text.search(new RegExp(`\\{\\{Reff début[^}]*saison=${season}`));
  if (startIdx < 0) return [];
  const endIdx = text.indexOf("{{Reff fin", startIdx);
  const block = text.slice(startIdx, endIdx > 0 ? endIdx : undefined);
  const out: WikiSquadPlayer[] = [];
  const POS: Record<string, string> = { P: "Pilier", T: "Talonneur", "2L": "Deuxième ligne", "3L": "Troisième ligne", "3LA": "Troisième ligne aile", "3LC": "Troisième ligne centre", DM: "Demi de mêlée", DO: "Demi d'ouverture", C: "Centre", A: "Ailier", AR: "Arrière" };
  let idx = 0;
  while ((idx = block.indexOf("{{Reff joueur", idx)) >= 0) {
    const params = templateParams(block.slice(idx), /\{\{Reff joueur/);
    idx += 10;
    if (!params) continue;
    const first = plainText(params["prénom"] ?? "");
    const last = plainText(params["nom"] ?? "");
    if (!last) continue;
    const pad = (s: string | undefined) => String(Number(s)).padStart(2, "0");
    const p: WikiSquadPlayer = {
      name: `${first} ${last}`.trim(),
      article: params["lien"] ? plainText(params["lien"]) : `${first} ${last}`.trim(),
      sectionLabel: POS[(params["pos"] ?? "").toUpperCase()] ?? params["pos"],
      nationality: nationFromFrenchName(plainText(params["nat"] ?? "")),
    };
    if (params["an"] && params["mois"] && params["jour"]) p.birthDate = `${params["an"]}-${pad(params["mois"])}-${pad(params["jour"])}`;
    Object.assign(p, parseCaps(params["sel"] ?? "", p.nationality));
    const prev = params["ancien club"] ?? "";
    p.homegrown = /form[ée] au club/i.test(prev);
    p.onLoan = /pr[êe]t/i.test(prev + (params["note"] ?? ""));
    p.previousClub = p.homegrown ? undefined : firstLink(prev)?.label ?? (plainText(prev) || undefined);
    const c = Number(params["contrat"]);
    if (c > 2000) p.contractUntil = c;
    if (params["jiff"]) p.jiff = /fait|oui/i.test(params["jiff"]);
    out.push(p);
  }
  return out;
}

function parseNation(cell: string): string | undefined {
  const t = /\{\{\s*([A-Za-z]{2,3}(?:-d)?)(?:\s+rugby[^}]*)?\s*\}\}/.exec(cell);
  if (t) return nationFromWikiCode(t[1]!);
  const d = /\{\{\s*Drapeau(?:au)?\|([^|}]+)/i.exec(cell);
  if (d) return nationFromFrenchName(d[1]!);
  const named = /\{\{\s*([^|{}]+?)\s*(?:\|[^{}]*)?\}\}/.exec(cell);
  if (named) {
    const n = nationFromFrenchName(named[1]!.replace(/ rugby$/i, ""));
    if (n) return n;
  }
  return nationFromFrenchName(plainText(cell));
}

/** "[[Équipe de France de rugby à XV|28 (0)]]", "{{FRA-d}}", "{{France -20 rugby}}", "à sept"… */
function parseCaps(cell: string, nationality?: string): Partial<WikiSquadPlayer> {
  const c = stripRefs(cell);
  const out: Partial<WikiSquadPlayer> = {};
  if (/sept|VII|\b7\b/i.test(c)) out.sevens = true;
  const num = /\|\s*(\d+)\s*(?:\(\s*\d+\s*\))?\s*\]\]/.exec(c) ?? /^\s*(\d+)\s*(?:\(\s*\d+\s*\))?\s*$/.exec(plainText(c));
  if (num && !/-\s*\d\d/.test(c)) out.caps = Number(num[1]);
  // Senior flag template (e.g. {{FRA-d}}, {{Géorgie rugby}}) without age-grade mention means capped.
  else if (/\{\{\s*[A-Z]{3}-d\s*\}\}/.test(c) || (/\{\{[^}]*rugby\s*\}\}/.test(c) && !/-\s*\d\d/.test(c) && !/sept/i.test(c))) out.capped = true;
  if (out.caps === 0) delete out.caps;
  void nationality;
  return out;
}

// ---------------------------------------------------------------- player infobox

export interface WikiPlayerInfo {
  position?: string;
  heightCm?: number;
  weightKg?: number;
  birthDate?: string;
  caps?: number;
}

export function parsePlayerInfobox(text: string): WikiPlayerInfo {
  const p = templateParams(text, /\{\{\s*Infobox Rugbyman/i);
  if (!p) return {};
  const out: WikiPlayerInfo = {};
  const pos = p["position (rugby à xv)"] ?? p["position"] ?? p["poste"];
  if (pos) out.position = plainText(pos.replace(/<br\s*\/?>/g, ", "));
  const h = p["taille"];
  if (h) {
    const m = /m\s*=\s*([\d.,]+)/.exec(h) ?? /([12][.,]\d{2})\s*m/.exec(h) ?? /(\d{3})\s*cm/.exec(h);
    if (m) {
      const v = Number(m[1]!.replace(",", "."));
      out.heightCm = Math.round(v < 3 ? v * 100 : v);
    }
  }
  const w = p["poids"];
  if (w) {
    const m = /(\d{2,3})/.exec(plainText(w.replace(/\{\{(?:unité|poids)\|(\d+)[^}]*\}\}/g, "$1 ")));
    if (m) out.weightKg = Number(m[1]);
  }
  if (p["date de naissance"]) out.birthDate = parseWikiDate(p["date de naissance"]);
  // National team lines are aligned with "matchs points nationale" lines.
  const teams = (p["équipe nationale"] ?? "").split(/<br\s*\/?>/i);
  const caps = stripRefs(p["matchs points nationale"] ?? "").split(/<br\s*\/?>/i);
  teams.forEach((team, i) => {
    if (!team.trim() || /-\s*\d\d|sept|7s|universitaire|barbarian|xv\b.*pr[ée]sident|A\b|\bA rugby/i.test(team)) return;
    const m = /(\d+)/.exec(caps[i] ?? "");
    if (m) out.caps = Number(m[1]);
  });
  return out;
}
