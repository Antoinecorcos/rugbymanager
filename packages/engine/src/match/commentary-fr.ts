import type { MatchEvent } from "./types.js";

/** Resolves ids into display names / team names for commentary. */
export interface CommentaryContext {
  teamName: (side: 0 | 1) => string;
  playerName: (id: string | undefined) => string;
}

const pick = <T,>(arr: readonly T[], seed: number): T => arr[Math.abs(seed) % arr.length]!;

export function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}'${s.toString().padStart(2, "0")}`;
}

/** French commentary line for an event, or null when the event is not worth a line. */
export function commentaryFr(e: MatchEvent, ctx: CommentaryContext): string | null {
  const team = e.side !== undefined ? ctx.teamName(e.side) : "";
  const opp = e.side !== undefined ? ctx.teamName(e.side === 0 ? 1 : 0) : "";
  const p = ctx.playerName(e.playerId);
  const o = ctx.playerName(e.otherPlayerId);
  const d = e.detail ?? {};
  const seed = e.t + (e.x ?? 0) * 7;
  switch (e.type) {
    case "kickoff":
      return d.start ? `Coup d'envoi ! C'est ${team} qui donne le coup d'envoi.` : `Renvoi de ${team}${p ? ` par ${p}` : ""}.`;
    case "lineBreak":
      return pick(
        [
          `${p} perce la défense de ${opp} ! ${e.value} mètres de course !`,
          `Franchissement de ${p} ! La défense est prise de vitesse (${e.value} m).`,
          `${p} trouve l'intervalle et file ! (${e.value} m)`,
        ],
        seed,
      );
    case "offload":
      return e.importance > 0 ? `Superbe offload de ${p} pour ${o} !` : null;
    case "knockOn":
      return d.highBall ? `${p} relâche le ballon haut, en-avant.` : d.offload ? `Offload tenté par ${p}... manqué, en-avant !` : pick([`En-avant de ${p}.`, `${p} échappe le ballon, en-avant.`, `Ballon perdu par ${p} au contact.`], seed);
    case "forwardPass":
      return `Passe en avant sifflée contre ${team}.`;
    case "interception":
      return `INTERCEPTION de ${p} pour ${team} !`;
    case "ruckTurnover":
      return d.ripped ? `${p} arrache le ballon dans le contact pour ${team} !` : d.penalty ? `${p} gratte le ballon ! Pénalité pour ${team}.` : `Ballon récupéré au sol par ${p} pour ${team} !`;
    case "penalty": {
      const reason = String(d.reason ?? "faute");
      return p ? `Pénalité pour ${team} : ${reason.toLowerCase()}, faute de ${p}.` : `Pénalité pour ${team} : ${reason.toLowerCase()}.`;
    }
    case "penaltyDecision":
      if (e.importance === 0) return null;
      return `Décision du banc de ${team} : ${choiceFr(String(d.choice))}.`;
    case "captainOverride":
      return `Le capitaine ${p} ignore la consigne (${choiceFr(String(d.coachChoice))}) et choisit ${choiceFr(String(d.captainChoice))} !`;
    case "penaltyGoal":
      return d.made ? `${p} passe la pénalité (${d.distance} m). +3 pour ${team}.` : `${p} manque la pénalité (${d.distance} m).`;
    case "dropGoal":
      return d.made ? `DROP de ${p} ! +3 pour ${team} !` : `Tentative de drop de ${p}... à côté.`;
    case "kickToTouch":
      if (d.endOfHalf) return `${p} envoie le ballon en touche, c'est terminé pour cette période.`;
      if (d.penalty) return e.value && e.value > 0 ? `${p} trouve la touche (${e.value} m gagnés).` : `${p} trouve la touche près de la ligne adverse.`;
      if (d.onTheFull) return `${p} trouve la touche directement hors des 22 — retour au point de frappe.`;
      return e.value ? `Dégagement de ${p} en touche (${e.value} m).` : null;
    case "fiftyTwentyTwo":
      return `50:22 de ${p} ! La touche est pour ${team} !`;
    case "kick":
      if (d.kind === "grubber") return `Petit coup de pied rasant de ${p} dans le dos de la défense.`;
      if (d.kind === "crossfield") return `Coup de pied par-dessus vers l'aile de ${p} !`;
      if (d.kind === "chip") return `Petite chandelle de ${p} par-dessus le rideau.`;
      if (d.kind === "box") return e.importance > 0 ? `Box kick de ${p}.` : null;
      return null;
    case "kickRegathered":
      return `Ballon récupéré par ${p} pour ${team} !`;
    case "lineout":
      if (d.result === "stolen") return `Touche volée par ${p} pour ${team} !`;
      if (d.result === "notStraight") return `Lancer pas droit de ${p}, mêlée pour ${opp}.`;
      return null;
    case "maul":
      if (d.result === "penaltyTry") return `Le maul est écroulé illégalement : ESSAI DE PÉNALITÉ pour ${team} !`;
      if (d.result === "penalty") return `Le maul de ${team} avance, la défense l'écroule : pénalité.`;
      if (d.result === "try") return `Le maul de ${team} est irrésistible !`;
      return null;
    case "scrum":
      if (d.result === "penalty") return pick([`Domination en mêlée de ${team}, pénalité !`, `La mêlée de ${team} prend le dessus et obtient la pénalité.`], seed);
      if (d.result === "againstTheHead") return `Ballon volé sur introduction adverse par ${team} !`;
      return null;
    case "try": {
      if (d.how === "penaltyTry") return `ESSAI DE PÉNALITÉ pour ${team} (7 points).`;
      const how: Record<string, string> = {
        breakaway: `${p} va au bout de son effort ! ESSAI pour ${team} !`,
        support: `${p} est à la réception et aplatit ! ESSAI pour ${team} !`,
        pickAndGo: `${p} s'écroule dans l'en-but après une série de pick-and-go ! ESSAI pour ${team} !`,
        wide: `Le ballon file sur l'aile, ${p} aplatit ! ESSAI pour ${team} !`,
        maul: `${p} aplatit au bout du maul ! ESSAI pour ${team} !`,
        interception: `${p} file seul à l'essai après l'interception !`,
        grubber: `${p} plonge sur le ballon dans l'en-but ! ESSAI pour ${team} !`,
        crossfield: `${p} capte la transversale et aplatit ! ESSAI pour ${team} !`,
        chip: `${p} récupère la petite chandelle et marque ! ESSAI pour ${team} !`,
      };
      return how[String(d.how)] ?? `ESSAI de ${p} pour ${team} !`;
    }
    case "tryDisallowed":
      return `Après consultation de la vidéo, l'essai de ${p} est refusé !`;
    case "heldUp":
      return `${p} est tenu au-dessus de l'en-but ! Renvoi depuis l'en-but pour la défense.`;
    case "conversion":
      return d.made ? `Transformation réussie par ${p}.` : `${p} manque la transformation.`;
    case "teamWarning":
      return `L'arbitre appelle le capitaine de ${team} : trop de fautes répétées, la prochaine sera sanctionnée d'un carton.`;
    case "yellowCard": {
      const why = d.reason === "cumul" ? " pour cumul de fautes" : d.reason === "repeat" ? " pour fautes répétées" : d.reason === "professional" ? " pour faute volontaire" : "";
      return `CARTON JAUNE pour ${p} (${team})${why} ! 10 minutes d'exclusion.`;
    }
    case "redCard":
      return d.twentyMinutes ? `CARTON ROUGE (20 minutes) pour ${p} (${team}) !` : `CARTON ROUGE définitif pour ${p} (${team}) !`;
    case "cardReturn":
      return d.red20 ? `${team} retrouve ses 15 joueurs : ${p} remplace le joueur expulsé.` : `${p} fait son retour sur le terrain.`;
    case "substitution":
      return o ? `Changement ${team} : ${p} remplace ${o}.` : `Entrée de ${p} pour ${team}.`;
    case "injury":
      return `${p} se blesse (${d.type}) et doit quitter le terrain.`;
    case "hia":
      return `${p} sort pour un protocole commotion (HIA).${o ? ` ${o} le remplace temporairement.` : ""}`;
    case "hiaReturn":
      return d.passed ? `${p} a passé le protocole commotion et revient sur le terrain.` : `${p} ne reviendra pas : protocole commotion échoué.`;
    case "uncontestedScrums":
      return `Plus de première ligne disponible pour ${team} : mêlées simulées.`;
    case "dropout":
      return d.from === 0 ? `Renvoi depuis l'en-but pour ${team}.` : `Renvoi aux 22 mètres pour ${team}.`;
    case "halfTime":
      return `MI-TEMPS.`;
    case "extraTime":
      return d.start ? `Égalité ! Prolongations.` : `Fin de la première période des prolongations.`;
    case "kickCompetition":
      return `Séance de tirs au but remportée par ${team} !`;
    case "fullTime":
      return `COUP DE SIFFLET FINAL !`;
    default:
      return null;
  }
}

function choiceFr(c: string): string {
  return { goal: "les points (pénalité)", touch: "la touche", scrum: "la mêlée", tap: "jouer à la main" }[c] ?? c;
}
