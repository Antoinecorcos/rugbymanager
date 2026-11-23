/**
 * In-game editor (M8), in the spirit of Football Manager's: the player can correct a player or a
 * club of his career. Every change is validated, the world is marked as edited (shown on the
 * save), and corrections to real players and clubs are kept in the format of the database
 * overrides (packages/data/overrides), so that they can be exported and fed back into the real
 * database (`pnpm --filter @ovalie/data import-edits <fichier>`).
 */
import { ALL_ATTRIBUTES, HIDDEN_ATTRIBUTES, type AttributeKey, type HiddenAttribute } from "../domain/attributes.js";
import { POSITIONS, type Position } from "../domain/positions.js";
import { clamp } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { seasonEndYear } from "./contracts.js";
import { humanOf } from "./human.js";
import { joinClub } from "./market.js";
import type { SquadStatus, World } from "./types.js";

export interface PlayerEdit {
  firstName?: string;
  lastName?: string;
  nationality?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  /** Level 1–20: every attribute moves by the same amount, current ability follows. */
  level?: number;
  /** Potential 1–20. */
  potential?: number;
  attributes?: Partial<Record<AttributeKey, number>>;
  hidden?: Partial<Record<HiddenAttribute, number>>;
  /** Familiarity 1–20 per position (0 removes the position). */
  positions?: Partial<Record<Position, number>>;
  caps?: number;
  jiff?: boolean;
  /** Club: an id to move him there now, null to release him. */
  clubId?: string | null;
  contract?: { salary?: number; expires?: number; status?: SquadStatus };
  heal?: boolean;
  morale?: number;
  trust?: number;
}

export interface ClubEdit {
  name?: string;
  shortName?: string;
  colors?: [string, string];
  reputation?: number;
  budgetEur?: number;
  capacity?: number;
  stadium?: string;
  president?: string;
  /** Manager's club only. */
  balance?: number;
  wageBudget?: number;
  transferBudget?: number;
}

/** Corrections in the format of the database overrides. */
export interface PlayerCorrection {
  level?: number;
  potential?: number;
  primary?: Position;
  positions?: Partial<Record<Position, number>>;
  attributes?: Partial<Record<AttributeKey, number>>;
  heightCm?: number;
  weightKg?: number;
  note?: string;
}
export interface ClubCorrection {
  colors?: [string, string];
  reputation?: number;
  note?: string;
}
export interface EditLog {
  players: Record<string, PlayerCorrection>;
  clubs: Record<string, ClubCorrection>;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const rating = (v: number) => Math.round(clamp(v, 1, 20));
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isColour = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
/** Real database player (not generated, virtual, academy or free-agent filler). */
const isReal = (w: World, id: string) => {
  const ps = w.players[id];
  return !!ps && !ps.virtual && !ps.profile?.generated && !/^(gen-|aca-|libre-|nat-)/.test(id);
};

function log(w: World): EditLog {
  w.edits ??= { players: {}, clubs: {} };
  w.edited = true;
  return w.edits;
}

/** Applies an edit to a player. Returns an error (French) or null. */
export function editPlayer(w: World, id: string, e: PlayerEdit): string | null {
  const ps = w.players[id];
  if (!ps) return "Joueur introuvable.";
  const p = ps.player;
  // Validation first: nothing is changed when something is wrong.
  if (e.firstName !== undefined && !e.firstName.trim()) return "Le prénom ne peut pas être vide.";
  if (e.lastName !== undefined && !e.lastName.trim()) return "Le nom ne peut pas être vide.";
  if (e.nationality !== undefined && !/^[A-Z]{3}$/.test(e.nationality)) return "Nationalité : code à trois lettres (FRA, NZL…).";
  if (e.birthDate !== undefined && (!isDate(e.birthDate) || e.birthDate > w.date)) return "Date de naissance invalide.";
  if (e.level !== undefined && !(e.level >= 1 && e.level <= 20)) return "Le niveau va de 1 à 20.";
  if (e.potential !== undefined && !(e.potential >= 1 && e.potential <= 20)) return "Le potentiel va de 1 à 20.";
  if (e.clubId && !w.clubs[e.clubId]) return "Club inconnu.";
  if (e.contract?.expires !== undefined && e.contract.expires < seasonEndYear(w)) return `Le contrat doit aller au moins jusqu'en juin ${seasonEndYear(w)}.`;
  if (e.contract?.salary !== undefined && !(e.contract.salary >= 0)) return "Salaire invalide.";
  if (e.positions) {
    const next = { ...p.positions };
    for (const [pos, v] of Object.entries(e.positions) as [Position, number][]) {
      if (!POSITIONS.includes(pos)) return `Poste inconnu : ${pos}.`;
      if (v > 0) next[pos] = rating(v);
      else delete next[pos];
    }
    if (!Object.keys(next).length) return "Le joueur doit avoir au moins un poste.";
  }
  if (e.clubId === w.manager?.clubId && ps.clubId !== e.clubId && ps.academy) return "Intégrez ce joueur depuis le centre de formation.";

  const fix = isReal(w, id) ? (log(w).players[id] ??= {}) : (log(w), undefined);
  if (e.firstName !== undefined) p.firstName = e.firstName.trim();
  if (e.lastName !== undefined) p.lastName = e.lastName.trim();
  if (e.nationality !== undefined) p.nationality = e.nationality;
  if (e.birthDate !== undefined) p.birthDate = e.birthDate;
  if (e.heightCm !== undefined) {
    p.heightCm = Math.round(clamp(e.heightCm, 150, 220));
    if (fix) fix.heightCm = p.heightCm;
  }
  if (e.weightKg !== undefined) {
    p.weightKg = Math.round(clamp(e.weightKg, 60, 160));
    if (fix) fix.weightKg = p.weightKg;
  }
  if (e.attributes) {
    const before = mean(p.attributes);
    for (const [k, v] of Object.entries(e.attributes) as [AttributeKey, number][]) if (ALL_ATTRIBUTES.includes(k)) p.attributes[k] = rating(v);
    // Current ability follows the average of the attributes.
    if (p.currentAbility) p.currentAbility = Math.round(clamp(p.currentAbility + (mean(p.attributes) - before) * 10, 10, 200));
    if (fix) fix.attributes = { ...fix.attributes, ...Object.fromEntries(Object.keys(e.attributes).map((k) => [k, p.attributes[k as AttributeKey]])) };
  }
  if (e.level !== undefined) {
    const delta = e.level - playerLevel(p);
    for (const k of ALL_ATTRIBUTES) p.attributes[k] = rating(p.attributes[k] + delta);
    p.currentAbility = Math.round(e.level * 10);
    if ((p.potentialAbility ?? 0) < p.currentAbility) p.potentialAbility = p.currentAbility;
    if (fix) {
      fix.level = round1(e.level);
      delete fix.attributes;
    }
  }
  if (e.potential !== undefined) {
    p.potentialAbility = Math.max(Math.round(e.potential * 10), p.currentAbility ?? 0);
    if (fix) fix.potential = round1(p.potentialAbility / 10);
  }
  if (e.hidden) for (const [k, v] of Object.entries(e.hidden) as [HiddenAttribute, number][]) if (HIDDEN_ATTRIBUTES.includes(k)) p.hidden[k] = rating(v);
  if (e.positions) {
    for (const [pos, v] of Object.entries(e.positions) as [Position, number][]) {
      if (v > 0) p.positions[pos] = rating(v);
      else delete p.positions[pos];
    }
    if (fix) {
      fix.positions = { ...p.positions };
      fix.primary = (Object.entries(p.positions).sort((a, b) => b[1] - a[1])[0]![0]) as Position;
    }
  }
  if (e.caps !== undefined) ps.caps = Math.max(0, Math.round(e.caps));
  if (e.jiff !== undefined) ps.profile = { ...ps.profile, jiff: e.jiff, jiffEstimated: false };
  if (e.heal) {
    delete ps.injury;
    if (ps.medical) delete ps.medical.fragileUntil;
  }

  // Club: move now (pending moves are cancelled) or release.
  if (e.clubId !== undefined && e.clubId !== (ps.clubId ?? null)) {
    w.transfers = (w.transfers ?? []).filter((t) => t.done || t.playerId !== id);
    if (ps.academy) {
      for (const list of Object.values(w.academies ?? {})) if (list.includes(id)) list.splice(list.indexOf(id), 1);
      delete ps.academy;
    }
    if (e.clubId) {
      const end = seasonEndYear(w);
      joinClub(w, ps, e.clubId, { clubId: e.clubId, salary: ps.contract?.salary ?? 50_000, expires: Math.max(end, ps.contract?.expires ?? end + 1), estimated: false });
    } else {
      const sq = ps.clubId ? w.squads[ps.clubId] : undefined;
      if (sq?.includes(id)) sq.splice(sq.indexOf(id), 1);
      delete ps.clubId;
      delete ps.contract;
      delete ps.human;
      if (!w.freeAgents?.includes(id)) (w.freeAgents ??= []).push(id);
    }
  }
  if (e.contract && ps.contract) {
    if (e.contract.salary !== undefined) ps.contract.salary = Math.round(e.contract.salary / 1000) * 1000;
    if (e.contract.expires !== undefined) ps.contract.expires = Math.round(e.contract.expires);
    if (e.contract.status) ps.contract.status = e.contract.status;
    ps.contract.estimated = false;
  }
  if (ps.clubId && ps.clubId === w.manager?.clubId) {
    const h = humanOf(w, ps);
    if (e.morale !== undefined) h.morale = Math.round(clamp(e.morale, 0, 100));
    if (e.trust !== undefined) h.trust = Math.round(clamp(e.trust, 0, 100));
    if (e.contract?.status) h.status = e.contract.status;
  }
  if (fix && !Object.keys(fix).length) delete w.edits!.players[id];
  return null;
}

/** Applies an edit to a club. Returns an error (French) or null. */
export function editClub(w: World, id: string, e: ClubEdit): string | null {
  const c = w.clubs[id];
  if (!c) return "Club inconnu.";
  if (e.name !== undefined && !e.name.trim()) return "Le nom ne peut pas être vide.";
  if (e.shortName !== undefined && !e.shortName.trim()) return "Le nom court ne peut pas être vide.";
  if (e.colors && !e.colors.every(isColour)) return "Couleurs : format #RRGGBB.";
  if (e.reputation !== undefined && !(e.reputation >= 1 && e.reputation <= 200)) return "La réputation va de 1 à 200.";
  if (e.budgetEur !== undefined && !(e.budgetEur >= 0)) return "Budget invalide.";
  const mine = id === w.manager?.clubId;
  if ((e.balance !== undefined || e.wageBudget !== undefined || e.transferBudget !== undefined) && !mine) return "Les comptes ne sont tenus que pour votre club.";

  const real = !c.generated;
  const fix = real ? (log(w).clubs[id] ??= {}) : (log(w), undefined);
  if (e.name !== undefined) c.name = e.name.trim();
  if (e.shortName !== undefined) c.shortName = e.shortName.trim().slice(0, 14);
  if (e.colors) {
    c.colors = [e.colors[0].toLowerCase(), e.colors[1].toLowerCase()];
    if (fix) fix.colors = c.colors;
  }
  if (e.reputation !== undefined) {
    c.reputation = Math.round(e.reputation);
    if (fix) fix.reputation = c.reputation;
  }
  if (e.budgetEur !== undefined) c.budgetEur = Math.round(e.budgetEur / 100_000) * 100_000;
  if (e.capacity !== undefined) c.capacity = Math.round(clamp(e.capacity, 500, 100_000));
  if (e.stadium !== undefined && e.stadium.trim()) c.stadium = e.stadium.trim();
  if (e.president !== undefined && e.president.trim()) {
    c.president = e.president.trim();
    if (mine && w.manager?.board) w.manager.board.president = c.president;
  }
  const f = c.finances;
  if (f) {
    if (e.balance !== undefined) f.balance = Math.round(e.balance);
    if (e.wageBudget !== undefined) f.wageBudget = Math.max(0, Math.round(e.wageBudget / 1000) * 1000);
    if (e.transferBudget !== undefined) f.transferBudget = Math.max(0, Math.round(e.transferBudget / 1000) * 1000);
  }
  if (fix && !Object.keys(fix).length) delete w.edits!.clubs[id];
  return null;
}

const mean = (a: Record<string, number>) => {
  const v = Object.values(a);
  return v.reduce((s, x) => s + x, 0) / v.length;
};

/** Corrections to export, in the format of packages/data/overrides (with a note). */
export function editsAsOverrides(w: World): EditLog {
  const out: EditLog = { players: {}, clubs: {} };
  for (const [id, fix] of Object.entries(w.edits?.players ?? {})) out.players[id] = { ...fix, note: fix.note ?? `Corrigé avec l'éditeur (${w.date})` };
  for (const [id, fix] of Object.entries(w.edits?.clubs ?? {})) out.clubs[id] = { ...fix, note: fix.note ?? `Corrigé avec l'éditeur (${w.date})` };
  return out;
}
