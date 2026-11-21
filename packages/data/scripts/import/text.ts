/** Text helpers shared by the importers: name normalisation, nationalities, wikitext. */

export const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Lowercase ASCII key for fuzzy name comparisons. */
export const nameKey = (s: string): string =>
  stripAccents(s)
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const slugify = (s: string): string => nameKey(s).replace(/ /g, "-");

/** "DE LA FUENTE" → "de la Fuente", "O'CONNOR" → "O'Connor", "MCLEOD" → "McLeod". */
export function titleCaseSurname(s: string): string {
  const particles = new Set(["de", "du", "des", "la", "le", "van", "von", "der", "den", "da", "di", "dos"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i, all) => {
      if (i < all.length - 1 && particles.has(w)) return w;
      return w
        .split("-")
        .map((part) =>
          part
            .split("'")
            .map((p) => (p.startsWith("mc") && p.length > 2 ? "Mc" + p.charAt(2).toUpperCase() + p.slice(3) : p.charAt(0).toUpperCase() + p.slice(1)))
            .join("'"),
        )
        .join("-");
    })
    .join(" ");
}

/**
 * Rugby nation codes (World Rugby style: ENG/SCO/WAL/IRL separated, RSA for South Africa).
 * Keys: French country names (LNR flags) and the code templates used on fr.wikipedia.
 */
const NATION_BY_FR_NAME: Record<string, string> = {
  france: "FRA", "nouvelle-zelande": "NZL", "afrique du sud": "RSA", angleterre: "ENG", ecosse: "SCO",
  "pays de galles": "WAL", galles: "WAL", irlande: "IRL", fidji: "FIJ", samoa: "SAM", tonga: "TGA",
  georgie: "GEO", argentine: "ARG", australie: "AUS", italie: "ITA", espagne: "ESP", portugal: "POR",
  roumanie: "ROU", uruguay: "URU", "etats-unis": "USA", "etats unis": "USA", canada: "CAN", japon: "JPN",
  belgique: "BEL", namibie: "NAM", chili: "CHI", russie: "RUS", allemagne: "GER", "pays-bas": "NED",
  suisse: "SUI", zimbabwe: "ZIM", kenya: "KEN", bresil: "BRA", "cote d'ivoire": "CIV", "cote divoire": "CIV",
  senegal: "SEN", maroc: "MAR", tunisie: "TUN", algerie: "ALG", cameroun: "CMR", madagascar: "MAD",
  "hong kong": "HKG", "coree du sud": "KOR", pologne: "POL", croatie: "CRO", ukraine: "UKR", lituanie: "LTU",
  "republique tcheque": "CZE", tchequie: "CZE", suede: "SWE", luxembourg: "LUX", moldavie: "MDA",
  "republique democratique du congo": "COD", congo: "CGO", "rd congo": "COD", gabon: "GAB", togo: "TOG",
  "burkina faso": "BFA", mali: "MLI", guinee: "GUI", nigeria: "NGR", ghana: "GHA", zambie: "ZAM", ouganda: "UGA",
  "nouvelle-caledonie": "NCL", "wallis-et-futuna": "WLF", "polynesie francaise": "PYF", tahiti: "PYF",
  "royaume-uni": "ENG", "iles cook": "COK", "papouasie-nouvelle-guinee": "PNG", paraguay: "PAR", colombie: "COL",
  bresilien: "BRA", mexique: "MEX", israel: "ISR", inde: "IND", chine: "CHN", sri: "SRI", haiti: "HAI",
  armenie: "ARM", "trinite-et-tobago": "TTO", jamaique: "JAM", "afrique du sud ": "RSA", maurice: "MRI",
  "ile maurice": "MRI", comores: "COM", "cap-vert": "CPV", benin: "BEN", angola: "ANG", mauritanie: "MTN",
  centrafrique: "CAF", "guinee equatoriale": "GEQ", tchad: "CHA", niger: "NIG", kazakhstan: "KAZ",
  autriche: "AUT", danemark: "DEN", norvege: "NOR", finlande: "FIN", hongrie: "HUN", serbie: "SRB",
  slovenie: "SLO", lettonie: "LAT", grece: "GRE", malte: "MLT", turquie: "TUR", "nouvelle zelande": "NZL",
};

/** fr.wikipedia flag templates ({{FRA}}, {{ECO}}, {{GAL}}, {{NZ rugby}}…) → rugby codes. */
const NATION_BY_WIKI_CODE: Record<string, string> = {
  FRA: "FRA", NZL: "NZL", NZ: "NZL", AFS: "RSA", RSA: "RSA", ZAF: "RSA", ENG: "ENG", ANG: "ENG", ECO: "SCO",
  SCO: "SCO", GAL: "WAL", WAL: "WAL", IRL: "IRL", FID: "FIJ", FIJ: "FIJ", SAM: "SAM", WSM: "SAM", TON: "TGA",
  TGA: "TGA", GEO: "GEO", ARG: "ARG", AUS: "AUS", ITA: "ITA", ESP: "ESP", POR: "POR", PRT: "POR", ROU: "ROU",
  URU: "URU", URY: "URU", USA: "USA", CAN: "CAN", JPN: "JPN", JAP: "JPN", BEL: "BEL", NAM: "NAM", CHI: "CHI",
  CHL: "CHI", RUS: "RUS", ALL: "GER", DEU: "GER", GER: "GER", NED: "NED", NLD: "NED", SUI: "SUI", CHE: "SUI",
  ZIM: "ZIM", ZWE: "ZIM", KEN: "KEN", BRA: "BRA", CIV: "CIV", SEN: "SEN", MAR: "MAR", TUN: "TUN", ALG: "ALG",
  DZA: "ALG", CMR: "CMR", MAD: "MAD", MDG: "MAD", HKG: "HKG", KOR: "KOR", POL: "POL", CRO: "CRO", HRV: "CRO",
  UKR: "UKR", LTU: "LTU", CZE: "CZE", SWE: "SWE", LUX: "LUX", MDA: "MDA", COD: "COD", CGO: "CGO", COG: "CGO",
  GAB: "GAB", TOG: "TOG", TGO: "TOG", NCL: "NCL", WLF: "WLF", PYF: "PYF", COK: "COK", PNG: "PNG", PAR: "PAR",
  PRY: "PAR", COL: "COL", MEX: "MEX", ISR: "ISR", MRI: "MRI", MUS: "MRI", AUT: "AUT", DEN: "DEN", DNK: "DEN",
  NOR: "NOR", HUN: "HUN", SRB: "SRB", GRE: "GRE", GRC: "GRE", TUR: "TUR", ARM: "ARM", KAZ: "KAZ", NGA: "NGR",
  NGR: "NGR", GHA: "GHA", ZAM: "ZAM", ZMB: "ZAM", UGA: "UGA", BFA: "BFA", MLI: "MLI", GUI: "GUI", GIN: "GUI",
  BEN: "BEN", CPV: "CPV", COM: "COM", HAI: "HAI", HTI: "HAI", CHN: "CHN", IND: "IND", SRI: "SRI", LKA: "SRI",
  MLT: "MLT", SVN: "SLO", SLO: "SLO", LAT: "LAT", LVA: "LAT", FIN: "FIN",
};

export function nationFromFrenchName(name: string): string | undefined {
  return NATION_BY_FR_NAME[stripAccents(name).toLowerCase().trim()];
}

export function nationFromWikiCode(code: string): string | undefined {
  const c = code.toUpperCase().replace(/-D$/, "").replace(/ RUGBY.*$/, "").trim();
  return NATION_BY_WIKI_CODE[c];
}

/** Tier-one rugby nations (international caps weigh more). */
export const TIER_ONE = new Set(["FRA", "ENG", "IRL", "SCO", "WAL", "ITA", "RSA", "NZL", "AUS", "ARG"]);
/** Strong tier-two nations. */
export const TIER_TWO = new Set(["FIJ", "SAM", "TGA", "GEO", "JPN", "URU", "USA", "CAN", "ESP", "POR", "ROU", "CHI", "NAM"]);

// ---------- wikitext ----------

/** Removes <ref>…</ref>, comments, and {{efn}}/{{note}} footnotes. */
export function stripRefs(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>/]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{(efn|note|Note|NB|refnec|Référence nécessaire)[^{}]*\}\}/g, "");
}

/** Plain text of a wikitext fragment: links → label, templates removed. */
export function plainText(s: string): string {
  let t = stripRefs(s);
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, "");
  return t.replace(/'''?/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** First [[link]] target and label in a fragment. */
export function firstLink(s: string): { target: string; label: string } | undefined {
  const m = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/.exec(s);
  if (!m) return undefined;
  return { target: m[1]!.trim(), label: (m[2] ?? m[1]!).trim() };
}

/** Parses {{date|15|9|1993…}} / {{date|15|septembre|1993}} / {{date de naissance|1993|9|15}} → ISO date. */
export function parseWikiDate(s: string): string | undefined {
  const months: Record<string, number> = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
    "1er": 1,
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = /\{\{\s*date(?: de naissance)?(?:-)?\s*\|\s*(1er|\d{1,2})\s*\|\s*([^|}]+?)\s*\|\s*(\d{4})/i.exec(s);
  if (m) {
    const day = m[1] === "1er" ? 1 : Number(m[1]);
    const monRaw = stripAccents(m[2]!).toLowerCase();
    const mon = /^\d+$/.test(monRaw) ? Number(monRaw) : months[monRaw];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(day)}`;
  }
  m = /\{\{\s*date(?: de naissance)?\s*\|\s*(1er|\d{1,2})\s+([a-zéûA-Z]+)\s+(\d{4})/i.exec(s);
  if (m) {
    const mon = months[stripAccents(m[2]!).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(m[1] === "1er" ? 1 : Number(m[1]))}`;
  }
  m = /\{\{\s*(?:date de naissance|naissance|birth date and age|birth date)[^|]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = /(1er|\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i.exec(plainText(s));
  if (m) {
    const mon = months[stripAccents(m[2]!).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(m[1] === "1er" ? 1 : Number(m[1]))}`;
  }
  return undefined;
}

/** Splits a MediaWiki table into rows of cells (handles "||" inline cells and header rows "!"). */
export function parseWikiTable(table: string): { header: boolean; cells: string[] }[] {
  const rows: { header: boolean; cells: string[] }[] = [];
  for (const chunk of table.split(/\n\|-[^\n]*/)) {
    const lines = chunk.split("\n").filter((l) => /^[|!]/.test(l) && !/^\{\|/.test(l) && !/^\|\}/.test(l) && !/^\|\+/.test(l));
    if (!lines.length) continue;
    const header = lines[0]!.startsWith("!");
    const cells: string[] = [];
    for (const line of lines) {
      const body = line.slice(1);
      const parts = line.startsWith("!") ? splitCells(body, "!!").flatMap((c) => splitCells(c, "||")) : splitCells(body, "||");
      for (const p of parts) cells.push(dropCellAttributes(p).trim());
    }
    rows.push({ header, cells });
  }
  return rows;
}

/** Splits on a separator while ignoring separators inside [[…]] and {{…}}. */
function splitCells(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if ((two === "]]" || two === "}}") && depth > 0) {
      depth--;
      cur += two;
      i++;
      continue;
    }
    if (depth === 0 && s.startsWith(sep, i)) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
      continue;
    }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

/** `style="…" | content` → `content` (only when the first top-level "|" precedes content). */
function dropCellAttributes(cell: string): string {
  let depth = 0;
  for (let i = 0; i < cell.length; i++) {
    const two = cell.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      i++;
    } else if ((two === "]]" || two === "}}") && depth > 0) {
      depth--;
      i++;
    } else if (depth === 0 && cell[i] === "|") {
      const attrs = cell.slice(0, i);
      if (/^\s*([a-z-]+\s*=\s*("[^"]*"|\S+)\s*)+$/i.test(attrs)) return cell.slice(i + 1);
      return cell;
    }
  }
  return cell;
}

/** Extracts a template's named parameters (top-level only). */
export function templateParams(src: string, name: RegExp): Record<string, string> | undefined {
  const m = name.exec(src);
  if (!m) return undefined;
  let i = m.index + 2;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const two = src.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      i += 2;
    } else if (two === "}}" || two === "]]") {
      depth--;
      i += 2;
    } else i++;
  }
  const body = src.slice(start, i - 2);
  const params: Record<string, string> = {};
  for (const part of splitCells(body, "|").slice(1)) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return params;
}
