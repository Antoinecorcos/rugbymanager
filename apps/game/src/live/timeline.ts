/**
 * Playback of a live match (pure, testable in Node): how long each action is shown, and which
 * actions are shown at all in the highlight modes (GDD §4.3).
 */
import type { EventType, MatchEvent, PlayStep } from "@ovalie/engine";

export type ViewMode = "full" | "extended" | "key" | "result";

export const VIEW_MODES: readonly { value: ViewMode; label: string; title: string }[] = [
  { value: "full", label: "Match complet", title: "Toutes les actions" },
  { value: "extended", label: "Temps forts", title: "Les actions qui mènent aux faits de jeu importants" },
  { value: "key", label: "Moments clés", title: "Essais, franchissements, cartons, points au pied" },
  { value: "result", label: "Sans images", title: "Le match défile sans animation (les décisions restent à vous)" },
];

/** Events that make an action worth showing, by mode. */
const KEY_EVENTS = new Set<EventType>(["try", "tryDisallowed", "lineBreak", "interception", "yellowCard", "redCard", "penaltyGoal", "dropGoal", "fiftyTwentyTwo", "captainOverride", "heldUp", "kickCompetition"]);
const EXTENDED_EVENTS = new Set<EventType>([...KEY_EVENTS, "penalty", "ruckTurnover", "maul", "scrum", "lineout", "injury", "hia", "kickRegathered", "offload", "knockOn", "conversion"]);

/** Number of actions shown before a highlight (the build-up). */
export const LEAD_UP = 4;

export function isHighlight(step: PlayStep, events: (i: number) => MatchEvent | undefined, mode: ViewMode): boolean {
  if (mode === "full") return true;
  if (mode === "result") return false;
  const set = mode === "key" ? KEY_EVENTS : EXTENDED_EVENTS;
  for (let i = step.ev[0]; i < step.ev[1]; i++) {
    const e = events(i);
    if (!e || !set.has(e.type)) continue;
    // Routine set pieces only count in the extended mode when something happens.
    if (mode === "extended" && (e.type === "scrum" || e.type === "lineout") && e.importance < 1) continue;
    return true;
  }
  return false;
}

/** Animation phases of an action, in milliseconds at speed ×1. */
export interface StepTiming {
  /** Players walking to a set-piece formation (dead time). */
  setup: number;
  /** The action itself. */
  action: number;
}

const BASE: Record<PlayStep["kind"], [number, number]> = {
  carry: [0, 950],
  ruck: [0, 420],
  maul: [0, 1500],
  kick: [0, 1500],
  dropGoal: [0, 1300],
  contest: [0, 650],
  receive: [0, 650],
  scrum: [900, 900],
  lineout: [800, 700],
  penalty: [0, 900],
  penaltyKick: [700, 1500],
  tap: [0, 600],
  interception: [0, 1300],
  try: [0, 1700],
  conversion: [1000, 1500],
  kickoff: [1000, 1500],
  dropout: [800, 1400],
  break: [0, 1500],
};

export function stepTiming(step: PlayStep, speed: number): StepTiming {
  const [setup, action] = BASE[step.kind] ?? [0, 800];
  // Long carries (line breaks) and slow rucks take a little longer to show.
  let a = action;
  if (step.kind === "carry") a += Math.min(1400, Math.abs(step.to[0] - step.from[0]) * 45 + Math.abs(step.to[1] - step.from[1]) * 12);
  if (step.kind === "ruck") a += Math.max(0, step.live - 3) * 120;
  return { setup: setup / speed, action: a / speed };
}

/** Clock shown during an action at progress p (0..1). */
export const clockAt = (step: PlayStep, p: number): number => step.t + step.dur * Math.max(0, Math.min(1, p));

export function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}'${String(s).padStart(2, "0")}`;
}

export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
