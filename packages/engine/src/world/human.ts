/**
 * The human side of the manager's squad (GDD §6.1): morale, trust in the manager, squad status,
 * individual talks, playing-time promises and team talks. AI clubs only keep a club morale that
 * follows their results. Everything is deterministic (seeded by world seed, date and player).
 *
 * Personality (hidden attributes): ambition (wants to play), professionalism (takes criticism),
 * temperament (high = even-tempered, low = volatile).
 */
import { clamp, Rng } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { addDays, ageOn, daysBetween, type IsoDate } from "./dates.js";
import type { ClubMatchRecord, Fixture, PlayerHuman, PlayerState, SquadStatus, World } from "./types.js";

export const STATUS_FR: Record<SquadStatus, string> = {
  star: "Indispensable",
  starter: "Titulaire",
  rotation: "Rotation",
  backup: "Remplaçant",
  prospect: "Espoir",
};

/** Share of the club matches (while available) a player expects to start. */
export const EXPECTED_STARTS: Record<SquadStatus, number> = { star: 0.8, starter: 0.6, rotation: 0.35, backup: 0.12, prospect: 0.05 };

const STATUS_RANK: Record<SquadStatus, number> = { star: 4, starter: 3, rotation: 2, backup: 1, prospect: 0 };

export function moraleLabel(m: number): string {
  return m >= 80 ? "Excellent" : m >= 65 ? "Bon" : m >= 45 ? "Correct" : m >= 30 ? "Faible" : "Très faible";
}
export function trustLabel(t: number): string {
  return t >= 75 ? "Totale" : t >= 55 ? "Bonne" : t >= 40 ? "Mitigée" : t >= 25 ? "Faible" : "Rompue";
}

const best = (ps: PlayerState) => Object.entries(ps.player.positions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LO";
const SLOTS: Record<string, number> = { LO: 2, WG: 2 };

/** Status the squad would give each player: rank at his position, age, level within the club. */
export function defaultStatuses(w: World, clubId: string): Record<string, SquadStatus> {
  const squad = (w.squads[clubId] ?? []).map((id) => w.players[id]!).filter(Boolean);
  const byPos = new Map<string, PlayerState[]>();
  for (const ps of squad) {
    const pos = best(ps);
    byPos.set(pos, [...(byPos.get(pos) ?? []), ps]);
  }
  const levels = squad.map((ps) => playerLevel(ps.player)).sort((a, b) => b - a);
  const starLine = levels[3] ?? 99;
  const out: Record<string, SquadStatus> = {};
  for (const [pos, list] of byPos) {
    const slots = SLOTS[pos] ?? 1;
    list.sort((a, b) => playerLevel(b.player) - playerLevel(a.player));
    list.forEach((ps, r) => {
      const young = ageOn(ps.player.birthDate, w.date) <= 21;
      let st: SquadStatus;
      if (r < slots) st = playerLevel(ps.player) >= starLine ? "star" : "starter";
      else if (r < slots * 2) st = young ? "prospect" : "rotation";
      else st = young ? "prospect" : "backup";
      out[ps.player.id] = st;
    });
  }
  return out;
}

/** Relationship state of a player of the manager's club (created on first use). */
export function humanOf(w: World, ps: PlayerState): PlayerHuman {
  if (!ps.human) {
    const rng = new Rng(`${w.seed}:human:${ps.player.id}`);
    ps.human = {
      morale: Math.round(clamp(rng.normal(66, 8), 35, 90)),
      trust: Math.round(clamp(rng.normal(60, 6), 40, 80)),
      status: (ps.clubId && defaultStatuses(w, ps.clubId)[ps.player.id]) || "rotation",
      promises: [],
      recent: [],
    };
  }
  return ps.human;
}

/** Initialises the manager's squad relationships (idempotent). */
export function initSquadRelations(w: World): void {
  const m = w.manager;
  if (!m) return;
  const statuses = defaultStatuses(w, m.clubId);
  for (const id of w.squads[m.clubId] ?? []) {
    const ps = w.players[id];
    if (!ps) continue;
    const fresh = !ps.human;
    const h = humanOf(w, ps);
    if (fresh && statuses[id]) h.status = statuses[id]!;
  }
}

/* ------------------------------------------------------------------ team morale in matches */

/** Morale of a 23 for the match engine (0..1, 0.5 = neutral). */
export function teamMorale(w: World, clubId: string, playerIds: readonly string[]): number {
  if (clubId !== w.manager?.clubId) return clamp((w.clubs[clubId]?.morale ?? 60) / 100 - 0.1, 0.25, 0.75);
  const vals = playerIds.map((id) => w.players[id]?.human?.morale).filter((v): v is number => v !== undefined);
  if (!vals.length) return 0.5;
  // Morale settles around 62: that is neutral (0.5) for the engine.
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length / 100 - 0.12, 0.2, 0.8);
}

/** Captain's trust in the manager (0..1) for the penalty decisions. */
export const captainTrust = (w: World, captainId: string): number => (w.players[captainId]?.human?.trust ?? 70) / 100;

/* ------------------------------------------------------------------ after a club match */

/** Records a played club match for the human side: playing time, ratings, promises, morale. */
export function afterClubMatch(w: World, f: Fixture, clubId: string, played: { playerId: string; started: boolean; minutes: number; rating: number }[], won: boolean | null, margin: number): void {
  const club = w.clubs[clubId];
  // AI clubs: morale follows results.
  if (club && clubId !== w.manager?.clubId) {
    const m = club.morale ?? 60;
    club.morale = Math.round(clamp(m + (won === null ? 0 : won ? 5 + Math.min(4, margin / 8) : -5 - Math.min(4, margin / 8)), 30, 90));
    return;
  }
  const byId = new Map(played.map((p) => [p.playerId, p]));
  for (const id of w.squads[clubId] ?? []) {
    const ps = w.players[id];
    if (!ps) continue;
    const h = humanOf(w, ps);
    const p = byId.get(id);
    const available = !(ps.injury && ps.injury.until > f.date) && !(ps.suspension && ps.suspension.until > f.date) && !(ps.duty && ps.duty.until >= f.date);
    const rec: ClubMatchRecord = { date: f.date, available: available || !!p, started: !!p?.started, minutes: p?.minutes ?? 0 };
    if (p && p.minutes > 0) rec.rating = p.rating;
    h.recent.push(rec);
    if (h.recent.length > 8) h.recent.shift();
    // Result and personal performance move morale straight away.
    let delta = won === null ? 0 : won ? 2.5 : -2.5;
    if (p && p.minutes >= 20) delta += clamp((p.rating - 6.3) * 2.2, -4, 5);
    h.morale = Math.round(clamp(h.morale + delta, 5, 100));
    for (const pr of h.promises) {
      if (pr.outcome || !rec.available) continue;
      pr.matches += 1;
      if (rec.started) pr.started += 1;
    }
  }
}

/* ------------------------------------------------------------------ weekly */

const nameOf = (ps: PlayerState) => `${ps.player.firstName} ${ps.player.lastName}`;

/** Every Monday: playing time vs status, promises, morale drift, AI clubs' morale back to normal. */
export function weeklyHuman(w: World): void {
  const d = w.date;
  for (const club of Object.values(w.clubs)) if (club.morale !== undefined) club.morale = Math.round(club.morale + (60 - club.morale) * 0.15);
  const m = w.manager;
  if (!m) return;
  for (const id of w.squads[m.clubId] ?? []) {
    const ps = w.players[id];
    if (!ps) continue;
    const h = humanOf(w, ps);
    const p = ps.player.hidden;
    let dm = (62 - h.morale) * 0.08;
    let dt = (55 - h.trust) * 0.02;
    const avail = h.recent.filter((r) => r.available).slice(-6);
    if (avail.length >= 3) {
      const share = avail.filter((r) => r.started).length / avail.length;
      const gap = share - EXPECTED_STARTS[h.status];
      const ambition = 0.6 + (p.ambition / 20) * 0.8;
      if (gap < -0.15) {
        dm += clamp(gap * 10 * ambition, -6, 0);
        dt += clamp(gap * 3 * ambition, -3, 0);
      } else if (gap >= 0) dt += 0.6;
    }
    if (ps.injury && ps.injury.until > d && p.professionalism < 12) dm -= 0.8;
    h.morale = Math.round(clamp(h.morale + dm, 5, 100));
    h.trust = Math.round(clamp(h.trust + dt, 0, 100));

    for (const pr of h.promises) {
      if (pr.outcome) continue;
      if (pr.started >= pr.starts) {
        pr.outcome = "kept";
        h.trust = Math.round(clamp(h.trust + 12, 0, 100));
        h.morale = Math.round(clamp(h.morale + 6, 5, 100));
        w.news.push({ date: d, topic: "squad", clubs: [m.clubId], text: `${nameOf(ps)} apprécie que vous ayez tenu parole sur son temps de jeu.`, importance: 1 });
      } else if (pr.matches - pr.started > pr.window - pr.starts || d > pr.deadline) {
        pr.outcome = "broken";
        h.trust = Math.round(clamp(h.trust - 20, 0, 100));
        h.morale = Math.round(clamp(h.morale - 12, 5, 100));
        w.news.push({ date: d, topic: "squad", clubs: [m.clubId], text: `${nameOf(ps)} estime que vous n'avez pas tenu votre promesse de temps de jeu. Sa confiance en vous est entamée.`, importance: 2 });
      }
    }
    h.promises = h.promises.filter((pr) => !pr.outcome || daysBetween(pr.madeOn, d) < 120);

    const important = STATUS_RANK[h.status] >= STATUS_RANK.rotation;
    if (h.morale < 35 && important && (!h.lastComplaint || daysBetween(h.lastComplaint, d) >= 30)) {
      h.lastComplaint = d;
      w.news.push({ date: d, topic: "squad", clubs: [m.clubId], text: `${nameOf(ps)} n'est pas heureux (moral ${moraleLabel(h.morale).toLowerCase()}) et souhaite vous parler de sa situation.`, importance: 2 });
    }
  }
}

/* ------------------------------------------------------------------ status */

export function setStatus(w: World, playerId: string, status: SquadStatus): string | null {
  const ps = w.players[playerId];
  const m = w.manager;
  if (!ps || !m || ps.clubId !== m.clubId) return "Joueur introuvable dans votre club.";
  const h = humanOf(w, ps);
  if (h.status === status) return null;
  const diff = STATUS_RANK[status] - STATUS_RANK[h.status];
  const ambition = 0.6 + (ps.player.hidden.ambition / 20) * 0.8;
  if (diff > 0) {
    h.morale = Math.round(clamp(h.morale + 4 * diff, 5, 100));
    h.trust = Math.round(clamp(h.trust + 2 * diff, 0, 100));
  } else {
    h.morale = Math.round(clamp(h.morale + 5 * diff * ambition, 5, 100));
    h.trust = Math.round(clamp(h.trust + 4 * diff * ambition, 0, 100));
    if (diff <= -2) w.news.push({ date: w.date, topic: "squad", clubs: [m.clubId], text: `${nameOf(ps)} encaisse mal d'être rétrogradé « ${STATUS_FR[status]} ».`, importance: 2 });
  }
  h.status = status;
  return null;
}

/* ------------------------------------------------------------------ individual talks */

export type TalkKind = "praise" | "encourage" | "criticise" | "promise" | "patience";

export const TALK_FR: Record<TalkKind, { label: string; help: string }> = {
  praise: { label: "Féliciter", help: "Efficace quand il est en forme ; sonne faux après de mauvais matchs." },
  encourage: { label: "Encourager", help: "Remonte le moral d'un joueur qui doute." },
  criticise: { label: "Critiquer ses performances", help: "Peut piquer un professionnel au vif… ou braquer un tempérament sanguin." },
  promise: { label: "Promettre du temps de jeu", help: "Titulaire dans au moins 3 de ses 5 prochains matchs disponibles. Une promesse non tenue coûte cher." },
  patience: { label: "Lui demander d'être patient", help: "Un joueur peu ambitieux apprécie la franchise ; un ambitieux l'accepte mal." },
};

export type Reaction = "delighted" | "pleased" | "neutral" | "annoyed" | "angry";
export const REACTION_FR: Record<Reaction, string> = { delighted: "Ravi", pleased: "Content", neutral: "Indifférent", annoyed: "Agacé", angry: "Furieux" };

export interface TalkResult {
  reaction: Reaction;
  /** What the player answers (French). */
  reply: string;
  morale: number;
  trust: number;
}

/** Average rating of the last club matches played (form), or 6.3 without matches. */
export function formOf(h: PlayerHuman): number {
  const r = h.recent.map((x) => x.rating).filter((x): x is number => x !== undefined).slice(-3);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 6.3;
}

const REPLIES: Record<Reaction, string[]> = {
  delighted: ["Merci coach, ça me touche vraiment. Je ne vais rien lâcher.", "Ça fait du bien à entendre. Vous pouvez compter sur moi."],
  pleased: ["Merci, je vais continuer à bosser.", "Entendu coach."],
  neutral: ["D'accord.", "Si vous le dites…"],
  annoyed: ["Je ne suis pas sûr de mériter ça.", "On n'a pas la même lecture de la situation."],
  angry: ["Vous plaisantez ? Je ne l'accepte pas.", "Je n'ai pas envie d'en parler maintenant."],
};

/** An individual talk with a player of the manager's club (once a week per player). */
export function talkToPlayer(w: World, playerId: string, kind: TalkKind): TalkResult | { error: string } {
  const ps = w.players[playerId];
  const m = w.manager;
  if (!ps || !m || ps.clubId !== m.clubId) return { error: "Joueur introuvable dans votre club." };
  const h = humanOf(w, ps);
  if (h.lastTalk && daysBetween(h.lastTalk, w.date) < 7) return { error: "Vous lui avez déjà parlé cette semaine." };
  const p = ps.player.hidden;
  const form = formOf(h);
  const rng = new Rng(`${w.seed}:${w.date}:talk:${playerId}:${kind}`);
  let dm = 0;
  let dt = 0;
  switch (kind) {
    case "praise":
      if (form >= 6.8) [dm, dt] = [6, 3];
      else if (form < 6) [dm, dt] = [0, -3];
      else [dm, dt] = [3, 1];
      break;
    case "encourage":
      [dm, dt] = h.morale < 50 ? [7, 2] : [2, 1];
      break;
    case "criticise":
      if (form >= 6.6) [dm, dt] = [-10, -8];
      else if (p.professionalism >= 14) [dm, dt] = [3, 2];
      else if (p.temperament <= 8) [dm, dt] = [-9, -6];
      else [dm, dt] = [-3, 0];
      break;
    case "promise": {
      if (h.promises.some((x) => !x.outcome)) return { error: "Une promesse est déjà en cours avec ce joueur." };
      h.promises.push({ madeOn: w.date, starts: 3, window: 5, matches: 0, started: 0, deadline: addDays(w.date, 50) });
      [dm, dt] = h.trust >= 40 ? [8, 4] : [2, 0];
      break;
    }
    case "patience":
      [dm, dt] = p.ambition >= 14 ? [-6, -2] : [-1, 2];
      break;
  }
  const f = 0.7 + rng.next() * 0.6;
  dm = Math.round(dm * f);
  dt = Math.round(dt * f);
  h.morale = Math.round(clamp(h.morale + dm, 5, 100));
  h.trust = Math.round(clamp(h.trust + dt, 0, 100));
  h.lastTalk = w.date;
  const score = dm + dt;
  const reaction: Reaction = score >= 8 ? "delighted" : score >= 3 ? "pleased" : score > -3 ? "neutral" : score > -10 ? "annoyed" : "angry";
  return { reaction, reply: rng.pick(REPLIES[reaction]), morale: dm, trust: dt };
}

/* ------------------------------------------------------------------ team talks */

export type TeamTalk = "none" | "calm" | "motivate" | "demand" | "noPressure";

export const TEAM_TALK_FR: Record<TeamTalk, { label: string; help: string }> = {
  none: { label: "Pas de causerie", help: "On laisse les joueurs dans leur bulle." },
  calm: { label: "Calme et confiant", help: "Rassure le groupe ; idéal quand on mène." },
  motivate: { label: "Motivant", help: "Fait monter l'envie ; souvent payant quand on est mené." },
  demand: { label: "Exigeant", help: "Met la pression : efficace contre la suffisance des favoris, risqué avec un groupe nerveux." },
  noPressure: { label: "Sans pression", help: "Libère un outsider ; peut endormir un favori." },
};

export interface TeamTalkContext {
  /** Our strength advantage, about −1 (big underdog) to +1 (big favourite). */
  favourite: number;
  /** Half-time: our score minus theirs. */
  halfTimeDiff?: number;
  /** Average temperament of the 15 (high = even-tempered). */
  temperament: number;
}

/** Effect of a team talk on the team's morale for the match (−0.08..+0.1) and the dressing-room reaction. */
export function teamTalkEffect(talk: TeamTalk, ctx: TeamTalkContext): { delta: number; reaction: string } {
  if (talk === "none") return { delta: 0, reaction: "Les joueurs se concentrent entre eux." };
  let table: Record<Exclude<TeamTalk, "none">, number>;
  if (ctx.halfTimeDiff !== undefined) {
    const diff = ctx.halfTimeDiff;
    table =
      diff > 7 ? { calm: 0.07, demand: 0.03, motivate: 0.01, noPressure: -0.05 }
      : diff < -7 ? { motivate: 0.08, demand: ctx.temperament >= 11 ? 0.05 : -0.04, calm: -0.03, noPressure: 0.02 }
      : { motivate: 0.06, demand: 0.04, calm: 0.03, noPressure: 0.0 };
  } else {
    table =
      ctx.favourite > 0.3 ? { demand: 0.08, calm: 0.04, motivate: 0.02, noPressure: -0.05 }
      : ctx.favourite < -0.3 ? { noPressure: 0.08, motivate: 0.06, calm: 0.02, demand: -0.04 }
      : { motivate: 0.06, calm: 0.03, demand: 0.03, noPressure: 0 };
  }
  const delta = table[talk];
  const reaction =
    delta >= 0.06 ? "Les joueurs sont gonflés à bloc !"
    : delta >= 0.03 ? "Le message passe bien."
    : delta > -0.01 ? "Les joueurs écoutent sans réaction particulière."
    : "Le discours tombe à plat, certains joueurs semblent tendus.";
  return { delta, reaction };
}
