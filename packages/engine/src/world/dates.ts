/** Calendar dates as ISO strings (YYYY-MM-DD), computed in UTC to stay deterministic. */
export type IsoDate = string;

const toUtc = (d: IsoDate): number => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromUtc = (t: number): IsoDate => new Date(t).toISOString().slice(0, 10);

export const addDays = (d: IsoDate, n: number): IsoDate => fromUtc(toUtc(d) + n * 86400000);
export const daysBetween = (a: IsoDate, b: IsoDate): number => Math.round((toUtc(b) - toUtc(a)) / 86400000);
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (d: IsoDate): number => new Date(toUtc(d)).getUTCDay();
/** Next date (inclusive) falling on the given weekday. */
export const nextWeekday = (d: IsoDate, day: number): IsoDate => addDays(d, (day - weekday(d) + 7) % 7);

/** Age in full years on a date. */
export function ageOn(birthDate: IsoDate, on: IsoDate): number {
  let a = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (on.slice(5) < birthDate.slice(5)) a--;
  return a;
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
/** "samedi 5 septembre 2026" */
export const formatDateFr = (d: IsoDate): string => `${DAYS_FR[weekday(d)]} ${Number(d.slice(8, 10))} ${MONTHS_FR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
