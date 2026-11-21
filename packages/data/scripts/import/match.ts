/** Matching people across sources by name (and age when available). */
import { nameKey } from "./text.js";

export interface NameCandidate {
  name: string;
  birthYear?: number;
}

const tokens = (s: string): string[] =>
  nameKey(s)
    .replace(/\bmac /g, "mc")
    .split(" ")
    .filter(Boolean);

/** Usual surname (last word, or last two words joined) found in the official name. */
export function surnameMatch(official: string, usual: string): boolean {
  const A = tokens(official);
  const B = tokens(usual);
  if (!A.length || B.length < 2) return false;
  const joinedA = A.join("");
  const last = B[B.length - 1]!;
  const lastTwo = B.slice(-2).join("");
  return (last.length >= 4 && A.includes(last)) || (lastTwo.length >= 6 && joinedA.includes(lastTwo)) || (last.length >= 6 && joinedA.includes(last));
}

/**
 * Score how likely `a` (official, possibly full legal name) and `b` (usual name) are the same person.
 * 0 = no match. Higher is better.
 */
export function nameScore(official: string, usual: string): number {
  const A = tokens(official);
  const B = tokens(usual);
  if (!A.length || !B.length) return 0;
  const a = A.join(" ");
  const b = B.join(" ");
  if (a === b) return 100;
  const setA = new Set(A);
  const inA = B.filter((t) => setA.has(t)).length;
  if (inA === B.length) return 80 + B.length; // usual name ⊆ legal name
  const setB = new Set(B);
  if (A.every((t) => setB.has(t))) return 75;
  // Same surname (last token of the usual name present) + same first initial.
  const lastB = B[B.length - 1]!;
  if (setA.has(lastB) && A[0]![0] === B[0]![0]) return 60;
  // Compound surname written without spaces / hyphen differences.
  if (a.replace(/ /g, "") === b.replace(/ /g, "")) return 90;
  if (setA.has(lastB) && inA >= 1) return 30;
  return 0;
}

/** Greedy one-to-one assignment by descending score. Returns index pairs [official, usual]. */
export function assign(official: NameCandidate[], usual: NameCandidate[], minScore = 55): Map<number, number> {
  const pairs: { i: number; j: number; s: number }[] = [];
  official.forEach((o, i) =>
    usual.forEach((u, j) => {
      let s = nameScore(o.name, u.name);
      const sameAge = o.birthYear !== undefined && u.birthYear !== undefined && Math.abs(o.birthYear - u.birthYear) <= 1;
      // Legal vs usual first name ("Daniel" Tupou = "Taniela" Tupou): accept on surname + birth year.
      if (s < minScore && sameAge && surnameMatch(o.name, u.name)) s = minScore + 2;
      if (s <= 0) return;
      if (o.birthYear && u.birthYear) {
        if (!sameAge) s -= 50;
        else s += 5;
      }
      if (s >= minScore) pairs.push({ i, j, s });
    }),
  );
  pairs.sort((x, y) => y.s - x.s);
  const out = new Map<number, number>();
  const usedJ = new Set<number>();
  for (const p of pairs) {
    if (out.has(p.i) || usedJ.has(p.j)) continue;
    out.set(p.i, p.j);
    usedJ.add(p.j);
  }
  return out;
}
