/** Detailed positions from the (coarse) league position group and textual hints. */
import { POSITION_BODY, type Position } from "@ovalie/engine";
import type { RawPlayer } from "../raw.js";

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Positions allowed by each LNR position group (and generic English/French labels). */
const GROUPS: [RegExp, Position[]][] = [
  [/^hookers?$|^talonneurs?$/, ["HK"]],
  [/^props?$|^piliers?$/, ["LH", "TH"]],
  [/1(ere|re)? ?ligne|front row|props?|hookers?/, ["LH", "HK", "TH"]],
  [/2(eme|e)? ?ligne|locks?\b|second row/, ["LO"]],
  [/3(eme|e)? ?ligne|back row|flankers?|number (8|eight)/, ["BF", "OF", "N8"]],
  [/demis? de melee|scrum-?hal(f|ves)/, ["SH"]],
  [/demis? d.ouverture|fly-?hal(f|ves)|first five/, ["FH"]],
  [/centres?|centers?/, ["IC", "OC"]],
  [/ailiers?|wings?\b|wingers?/, ["WG"]],
  [/arrieres?|full-?backs?/, ["FB"]],
  [/back three/, ["WG", "FB"]],
  [/utility backs?|backs?$/, ["FH", "IC", "OC", "WG", "FB"]],
];

/** Hint phrases, most specific first. Each phrase maps to candidate positions. */
const HINTS: [RegExp, Position[]][] = [
  [/piliers? gauches?|loose-?head/, ["LH"]],
  [/piliers? droits?|tight-?head/, ["TH"]],
  [/talonneurs?|hooker/, ["HK"]],
  [/piliers?|props?\b/, ["LH", "TH"]],
  [/deuxiemes? lignes?|2e lignes?|locks?\b/, ["LO"]],
  [/troisiemes? lignes? centres?|3e lignes? centres?|number (8|eight)|numero 8/, ["N8"]],
  [/troisiemes? lignes? ailes?|3e lignes? ailes?|flankers?|openside|blindside/, ["BF", "OF"]],
  [/troisiemes? lignes?|3e lignes?|back row/, ["BF", "OF", "N8"]],
  [/demis? de melee|scrum-?hal(f|ves)/, ["SH"]],
  [/demis? d.ouverture|ouvreur|fly-?hal(f|ves)/, ["FH"]],
  [/premiers? centres?|inside centre/, ["IC"]],
  [/seconds? centres?|deuxiemes? centres?|outside centre/, ["OC"]],
  [/centres?|centers?/, ["IC", "OC"]],
  [/ailiers?|wings?\b|wingers?/, ["WG"]],
  [/arrieres?|full-?backs?/, ["FB"]],
];

function hintPositions(text: string): Position[][] {
  // A hint can list several positions: "Arrière, demi d'ouverture". Keep their order.
  const out: Position[][] = [];
  for (const part of strip(text).split(/,|\/| et | ou |;/)) {
    const found = HINTS.find(([re]) => re.test(part));
    if (found) out.push(found[1]);
  }
  return out;
}

export interface PositionResult {
  primary: Position;
  familiarity: Partial<Record<Position, number>>;
}

export function resolvePositions(p: Pick<RawPlayer, "positionGroup" | "positionHints" | "weightKg" | "heightCm">): PositionResult {
  // League group label ("1ère ligne", "Props") or a full position label ("Deuxièmes lignes").
  const fromLabel = hintPositions(p.positionGroup).flat();
  const group = GROUPS.find(([re]) => re.test(strip(p.positionGroup)))?.[1] ?? (fromLabel.length ? [...new Set(fromLabel)] : undefined);
  const hinted = p.positionHints.flatMap(hintPositions);
  const allowed = group ?? [...new Set(hinted.flat())];
  if (!allowed.length) throw new Error(`Unknown position group "${p.positionGroup}"`);

  // Ordered candidates: hints restricted to the group (most specific hint wins), then the group itself.
  const ranked: Position[][] = hinted.map((h) => h.filter((x) => allowed.includes(x))).filter((h) => h.length);
  const primaryChoices = ranked[0] ?? allowed;
  const primary = disambiguate(primaryChoices, p);
  const familiarity: Partial<Record<Position, number>> = { [primary]: 19 };
  const add = (pos: Position, v: number) => {
    if ((familiarity[pos] ?? 0) < v) familiarity[pos] = v;
  };
  // Other positions named in hints (in or out of the group): known secondary positions.
  for (const h of hinted) for (const pos of h) if (pos !== primary) add(pos, h.length === 1 ? 15 : 13);
  // Natural cover inside a family.
  const cover: Partial<Record<Position, [Position, number][]>> = {
    BF: [["OF", 16], ["N8", 12]],
    OF: [["BF", 16], ["N8", 11]],
    N8: [["BF", 14]],
    IC: [["OC", 15]],
    OC: [["IC", 15], ["WG", 10]],
    WG: [["FB", 12]],
    FB: [["WG", 13]],
    LH: [["TH", 8]],
    TH: [["LH", 8]],
    LO: [["BF", 8]],
  };
  for (const [pos, v] of cover[primary] ?? []) add(pos, v);
  // Props named on both sides keep a real familiarity on each.
  return { primary, familiarity };
}

/** Picks one position among candidates using morphology (props side, hooker, 6/7, 12/13). */
function disambiguate(c: Position[], p: Pick<RawPlayer, "weightKg" | "heightCm">): Position {
  if (c.length === 1) return c[0]!;
  const w = p.weightKg ?? 0;
  const h = p.heightCm ?? 0;
  const set = new Set(c);
  if (set.has("HK") && w > 0 && w < 112) return "HK";
  if (set.has("LH") && set.has("TH")) return w >= 123 ? "TH" : "LH";
  if (set.has("BF") && set.has("OF")) {
    if (set.has("N8") && w >= 115) return "N8";
    return w > 0 && (w <= 107 || h <= 188) ? "OF" : "BF";
  }
  if (set.has("IC") && set.has("OC")) return w >= 98 ? "IC" : "OC";
  return c[0]!;
}

/** Position-average morphology (used when a player's height/weight is unknown). */
export function typicalBody(pos: Position): { heightCm: number; weightKg: number } {
  const [h, w] = POSITION_BODY[pos];
  return { heightCm: h, weightKg: w };
}
