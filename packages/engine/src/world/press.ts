/**
 * Pre-match press conference (GDD §6.8). Three questions chosen from the context (form, opponent,
 * absences, objectives, a key player); each answer has a tone. The answers move the team's morale
 * for the match a little, a player's morale when he is named, and the president's confidence; a
 * headline goes to the news.
 */
import { clamp, Rng } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { strengthRanks } from "./board.js";
import { humanOf } from "./human.js";
import { leagueTable } from "./competitions.js";
import type { Fixture, World } from "./types.js";

export type PressTone = "confident" | "humble" | "combative" | "evasive";

export interface PressAnswer {
  id: string;
  label: string;
  tone: PressTone;
  /** Named player: praise or criticism. */
  player?: { id: string; delta: number };
}

export interface PressQuestion {
  id: string;
  text: string;
  answers: PressAnswer[];
}

const lastResults = (w: World, clubId: string) =>
  w.fixtures.filter((f) => f.result && (f.home === clubId || f.away === clubId) && !w.competitions[f.competitionId]?.kind.startsWith("inter")).slice(-3);

/** The three questions of the press conference before a fixture of the manager's club. */
export function pressQuestions(w: World, f: Fixture): PressQuestion[] {
  const m = w.manager!;
  const me = m.clubId;
  const oppId = f.home === me ? f.away : f.home;
  const opp = w.clubs[oppId];
  const rng = new Rng(`${w.seed}:${f.id}:press`);
  const qs: PressQuestion[] = [];
  const results = lastResults(w, me);
  const wins = results.filter((r) => r.result!.winner === (r.home === me ? 0 : 1)).length;
  if (results.length >= 2 && wins === 0)
    qs.push({ id: "slump", text: "Trois matchs sans victoire : la crise guette-t-elle ?", answers: [
      { id: "a", label: "« Ce groupe a du caractère, la victoire va revenir. »", tone: "confident" },
      { id: "b", label: "« Nous devons nous remettre en question, moi le premier. »", tone: "humble" },
      { id: "c", label: "« Je ne parlerai pas de crise. »", tone: "evasive" },
    ] });
  else if (wins >= 2)
    qs.push({ id: "form", text: "L'équipe reste sur une bonne série. Jusqu'où peut-elle aller ?", answers: [
      { id: "a", label: "« On ne se fixe aucune limite. »", tone: "confident" },
      { id: "b", label: "« On reste humbles, chaque match est un piège. »", tone: "humble" },
      { id: "c", label: "« On ne regarde que le prochain match. »", tone: "evasive" },
    ] });
  if (opp) {
    const league = w.clubs[me]!.league;
    const ranks = opp.league === league ? strengthRanks(w, league) : [];
    const stronger = ranks.length ? ranks.indexOf(oppId) < ranks.indexOf(me) : opp.reputation > w.clubs[me]!.reputation;
    qs.push({ id: "opponent", text: `${opp.name} ${stronger ? "part favori" : "semble à votre portée"}. Quel est votre état d'esprit ?`, answers: [
      { id: "a", label: stronger ? "« On va chez eux pour gagner. »" : "« On veut les trois points, point final. »", tone: "confident" },
      { id: "b", label: stronger ? "« C'est une grande équipe, on va tout donner. »" : "« Aucun match n'est facile dans ce championnat. »", tone: "humble" },
      { id: "c", label: "« Leur tête d'affiche, on va lui faire vivre un après-midi compliqué. »", tone: "combative" },
    ] });
  }
  const squad = (w.squads[me] ?? []).map((id) => w.players[id]!).filter((ps) => ps.human);
  const star = squad.sort((a, b) => playerLevel(b.player) - playerLevel(a.player))[rng.int(0, 4)];
  if (star) {
    const name = `${star.player.firstName} ${star.player.lastName}`;
    qs.push({ id: "player", text: `On a trouvé ${name} un peu en dedans dernièrement. Votre avis ?`, answers: [
      { id: "a", label: `« ${star.player.lastName} est un joueur majeur, je n'ai aucun doute. »`, tone: "confident", player: { id: star.player.id, delta: 5 } },
      { id: "b", label: "« Il peut faire mieux, il le sait. »", tone: "combative", player: { id: star.player.id, delta: -6 } },
      { id: "c", label: "« Je ne commente pas les individualités. »", tone: "evasive" },
    ] });
  }
  const table = w.competitions[w.clubs[me]!.league.toLowerCase()] ? leagueTable(w, w.clubs[me]!.league.toLowerCase()) : [];
  if (qs.length < 3 && table.length)
    qs.push({ id: "objective", text: `${m.board?.president ?? "Le président"} attend beaucoup cette saison. Ressentez-vous la pression ?`, answers: [
      { id: "a", label: "« La pression, c'est un privilège. »", tone: "confident" },
      { id: "b", label: "« On avance étape par étape. »", tone: "humble" },
      { id: "c", label: "« Je ne travaille pas pour les journalistes. »", tone: "combative" },
    ] });
  return qs.slice(0, 3);
}

/**
 * Applies the answers: team morale for this match (−0.03..+0.04), the named player's morale,
 * the president's confidence; publishes a headline. Returns the headline.
 */
export function answerPress(w: World, f: Fixture, answers: Record<string, string>): string {
  const m = w.manager!;
  const qs = pressQuestions(w, f);
  let morale = 0;
  let confidence = 0;
  let headline = "";
  for (const q of qs) {
    const a = q.answers.find((x) => x.id === answers[q.id]);
    if (!a) continue;
    if (a.tone === "confident") morale += 0.012;
    if (a.tone === "humble") confidence += 0.4;
    if (a.tone === "combative") {
      morale += 0.015;
      confidence -= 0.6;
    }
    if (a.tone === "evasive") confidence -= 0.2;
    if (a.player) {
      const ps = w.players[a.player.id];
      if (ps) {
        const h = humanOf(w, ps);
        h.morale = Math.round(clamp(h.morale + a.player.delta, 5, 100));
        h.trust = Math.round(clamp(h.trust + Math.sign(a.player.delta) * 3, 0, 100));
      }
    }
    if (!headline || a.tone === "combative") headline = `${m.profile.name} : ${a.label.replace(/^« |»$/g, "").trim()}`;
  }
  (m.press ??= {})[f.id] = Math.round(clamp(morale, -0.03, 0.04) * 1000) / 1000;
  if (m.board) m.board.confidence = clamp(m.board.confidence + confidence, 0, 100);
  if (headline) w.news.push({ date: w.date, topic: "press", clubs: [m.clubId], text: `Conférence de presse — ${headline}`, importance: 1 });
  return headline;
}
