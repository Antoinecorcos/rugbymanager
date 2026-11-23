/**
 * Live match (M5): the TV view of the pitch, the scoreboard, commentary, live statistics, the
 * manager's controls (substitutions, tactics, targeted instructions, penalty rules) and the
 * penalty decision with a 10-second countdown.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Flag, Pause, Play, Maximize2, Minimize2, X, Timer, Repeat, ArrowRight, Box, Square } from "lucide-react";
import {
  commentaryFr,
  TACTIC_LABEL_FR,
  type LiveChunk,
  type LiveInfo,
  type LiveSnapshot,
  type MatchEvent,
  type PenaltyDecisionRequest,
  type PenaltyOption,
  TEAM_TALK_FR,
  type TeamTalk,
  type PenaltyRule,
  type Tactics,
  type TargetedInstructions,
  type TeamStats,
} from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { clubAccent, contrast, fmt1, stageFr, WEATHER_FR } from "../game/format";
import { navigate } from "../game/router";
import { competitionName } from "../game/selectors";
import { LivePlayer } from "../live/player";
import { PitchRenderer, type LiveView, type TeamColours } from "../live/renderer";
import type { CameraMode } from "../live3d/director";
import { formatClock, VIEW_MODES, type ViewMode } from "../live/timeline";
import { Badge, Button, ClubCrest, CompareLegend, CompareRow, Segmented, Tabs } from "../ui/components";
import { PenaltyRulesEditor, rulesOf, TargetsEditor } from "../ui/instructions";
import { TACTIC_INFO } from "./Tactics";

const DECISION_SECONDS = 10;
const CHOICE_FR: Record<PenaltyOption, string> = { goal: "Prendre les points", touch: "Jouer la touche", scrum: "Choisir la mêlée", tap: "Jouer vite (à la main)" };
const CHOICE_SHORT: Record<PenaltyOption, string> = { goal: "les points", touch: "la touche", scrum: "la mêlée", tap: "jouer vite" };

/* ------------------------------------------------------------------ colours */

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const dist = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
const inkOn = (fill: string) => (contrast(fill, "#ffffff") >= contrast(fill, "#0b0d10") ? "#ffffff" : "#0b0d10");

/** Kit colours of both teams, keeping them distinguishable on the grass and from each other. */
export function kitColours(home: [string, string], away: [string, string]): [TeamColours, TeamColours] {
  const grass = "#22633a";
  const pick = (c: [string, string], avoid?: string) => {
    let fill = dist(c[0], grass) < 90 && dist(c[1], grass) >= 90 ? c[1] : c[0];
    if (avoid && dist(fill, avoid) < 120) fill = dist(c[1], avoid) >= 120 ? c[1] : dist("#ffffff", avoid) > 200 ? "#ffffff" : "#111418";
    return fill;
  };
  const h = pick(home);
  const a = pick(away, h);
  const ring = (fill: string, c: [string, string]) => (dist(fill, c[1]) > 60 ? c[1] : inkOn(fill));
  return [
    { fill: h, ink: inkOn(h), ring: ring(h, home) },
    { fill: a, ink: inkOn(a), ring: ring(a, away) },
  ];
}

/* ------------------------------------------------------------------ screen */

interface LiveState {
  info: LiveInfo;
  player: LivePlayer;
}

export function LiveMatchScreen() {
  const w = useWorld();
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    game
      .liveStart()
      .then(({ info, snapshot }) => {
        if (!cancelled) setState({ info, player: new LivePlayer(snapshot) });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <div className="live live--message">
        <p>{error}</p>
        <Button onClick={() => navigate("preparation")}>Retour à la préparation</Button>
      </div>
    );
  if (!state) return <div className="live live--message">Les équipes entrent sur le terrain…</div>;
  return <LiveMatch info={state.info} player={state.player} w={w} />;
}

function usePlayback(player: LivePlayer) {
  return useSyncExternalStore(
    (l) => player.subscribe(l),
    () => player.view,
  );
}

function LiveMatch({ info, player, w }: { info: LiveInfo; player: LivePlayer; w: ReturnType<typeof useWorld> }) {
  const host = useRef<HTMLDivElement>(null);
  const view = usePlayback(player);
  const [mode, setModeState] = useState<ViewMode>("extended");
  const [speed, setSpeedState] = useState(1);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [decision, setDecision] = useState<PenaltyDecisionRequest | null>(null);
  const [finished, setFinished] = useState(false);
  const [control, setControl] = useState<LiveSnapshot>(view.snapshot!);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"comment" | "stats" | "players" | "orders">("comment");
  const [ending, setEnding] = useState(false);
  const rendererRef = useRef<LiveView | null>(null);
  const [view3d, setView3d] = useState(readView3d);
  const [camera, setCamera] = useState<CameraMode>("tv");
  const fetching = useRef(false);
  const flags = useRef({ decision: false, finished: false, halfTime: false });
  const [halfTime, setHalfTime] = useState<[number, number] | null>(null);
  const mine = info.side;
  const theirs = mine === 0 ? 1 : 0;
  const colours = useMemo(() => kitColours(info.teams[0].colors, info.teams[1].colors), [info]);

  const say = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 3500);
  };

  const ingest = (chunk: LiveChunk) => {
    player.push(chunk);
    setControl(chunk.snapshot);
    for (const a of chunk.autoDecisions) say(`Règle appliquée (${formatClock(a.clock)}) : ${CHOICE_SHORT[a.choice]} — « ${a.rule} ».`);
    if (chunk.decision) {
      flags.current.decision = true;
      player.sourceDone = true;
      setDecision(chunk.decision);
    }
    if (chunk.halfTime) {
      flags.current.halfTime = true;
      player.sourceDone = true;
      setHalfTime(chunk.halfTime.score);
    }
    if (chunk.finished) {
      flags.current.finished = true;
      player.sourceDone = true;
      setFinished(true);
    }
  };

  // Keep the playback fed with actions from the worker.
  useEffect(() => {
    const pump = async () => {
      if (fetching.current || flags.current.decision || flags.current.finished || flags.current.halfTime) return;
      const want = player.mode === "full" ? 8 : 16;
      if (player.mode !== "result" && player.backlog >= want) return;
      fetching.current = true;
      try {
        ingest(await game.liveNext(player.mode === "full" ? 10 : 40));
      } catch (e) {
        say(e instanceof Error ? e.message : String(e));
      } finally {
        fetching.current = false;
      }
    };
    const id = window.setInterval(pump, 60);
    void pump();
    return () => window.clearInterval(id);
  }, [player]);

  // Pitch renderer: 3D (Three.js, loaded on demand) or 2D (PixiJS).
  useEffect(() => {
    let r: LiveView | null = null;
    let alive = true;
    const make = async (): Promise<LiveView> => {
      if (view3d) {
        try {
          const m = await import("../live3d/renderer3d");
          if (m.webglAvailable()) {
            const three = await m.Match3DRenderer.create(host.current!, {
              colours,
              clubColours: [info.teams[0].colors, info.teams[1].colors],
              weather: info.weather,
              boards: competitionName(w, info.competitionId),
            });
            three.setCamera(camera);
            return three;
          }
        } catch (e) {
          console.warn("Vue 3D indisponible", e);
        }
        say("Vue 3D indisponible sur cet appareil : affichage en 2D.");
        setView3d(false);
      }
      return PitchRenderer.create(host.current!, colours);
    };
    void make().then((created) => {
      if (!alive) return created.destroy();
      r = created;
      rendererRef.current = created;
      created.setFollow(follow);
      let shownLineup: unknown = null;
      created.onTick((ms) => {
        player.tick(ms);
        // Shirt numbers follow the players on the field (substitutions, cards).
        const lineup = player.view.lineup;
        if (lineup !== shownLineup) {
          shownLineup = lineup;
          for (const side of [0, 1] as const) {
            const on = lineup[side].map((id) => (id ? info.teams[side].players.find((p) => p.id === id) : undefined));
            created.setNumbers(side, on.map((p) => p?.shirt ?? null), on.map((p) => p?.short ?? null));
          }
        }
        created.render(player.currentFrame());
      });
    });
    return () => {
      alive = false;
      r?.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, colours, info, view3d]);

  useEffect(() => rendererRef.current?.setFollow(follow), [follow]);
  useEffect(() => {
    const r = rendererRef.current as (LiveView & { setCamera?: (m: CameraMode) => void }) | null;
    r?.setCamera?.(camera);
  }, [camera]);
  const toggleView = () => {
    const next = !view3d;
    writeView3d(next);
    setView3d(next);
  };

  const setMode = (m: ViewMode) => {
    player.mode = m;
    setModeState(m);
  };
  const setSpeed = (s: number) => {
    player.speed = s;
    setSpeedState(s);
  };
  const togglePause = () => {
    player.paused = !player.paused;
    setPaused(player.paused);
  };

  const decide = async (choice: PenaltyOption, byStaff = false) => {
    if (!decision) return;
    setDecision(null);
    flags.current.decision = false;
    player.sourceDone = false;
    if (byStaff) say(`Temps écoulé : le staff choisit ${CHOICE_SHORT[choice]}.`);
    fetching.current = true;
    try {
      ingest(await game.liveDecide(choice));
    } finally {
      fetching.current = false;
    }
  };

  const showDecision = decision && view.caughtUp;
  const showEnd = finished && view.caughtUp;
  const showHalfTime = !!halfTime && view.caughtUp && !decision;

  const halfTimeTalk = async (talk: TeamTalk) => {
    setHalfTime(null);
    const reaction = await game.liveHalfTime(talk);
    say(`Causerie (${TEAM_TALK_FR[talk].label}) : ${reaction}`);
    flags.current.halfTime = false;
    player.sourceDone = false;
  };

  const finish = async () => {
    setEnding(true);
    try {
      const r = await game.liveFinish();
      if (r.playedFixtureId) navigate("match", r.playedFixtureId);
    } finally {
      setEnding(false);
    }
  };

  const leave = async () => {
    if (!finished && !window.confirm("Quitter le direct ? Le staff termine le match à votre place (ses choix sur pénalité, remplacements prévus).")) return;
    await finish();
  };

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of info.teams) for (const p of t.players) m.set(p.id, p.short);
    return m;
  }, [info]);
  const ctx = useMemo(() => ({ teamName: (s: 0 | 1) => info.teams[s].name, playerName: (id: string | undefined) => (id ? (names.get(id) ?? "") : "") }), [info, names]);
  const shownEvents = useMemo(() => player.events.slice(0, view.shownEvents), [view.shownEvents, player]);
  const lastLines = useMemo(() => {
    const out: { e: MatchEvent; text: string }[] = [];
    for (let i = shownEvents.length - 1; i >= 0 && out.length < 2; i--) {
      const e = shownEvents[i]!;
      if (e.importance < 1) continue;
      const text = commentaryFr(e, ctx);
      if (text) out.push({ e, text });
    }
    return out.reverse();
  }, [shownEvents, ctx]);

  const snap = view.snapshot ?? control;
  const accent = clubAccent(w.clubs[info.teams[mine].id]?.colors);

  return (
    <div className="live" style={{ ["--accent" as string]: accent.accent, ["--accent-ink" as string]: accent.ink }}>
      <header className="live__bar">
        <div className="live__comp">
          <Flag size={16} color="var(--accent)" />
          <span>
            {competitionName(w, info.competitionId)} · {stageFr(info.stage)}
          </span>
          <span className="faint">
            {WEATHER_FR[info.weather] ?? info.weather} · Arbitre : {info.referee.name}
          </span>
        </div>
        <div className="scoreboard" aria-live="polite">
          <div className="scoreboard__team">
            <span className="scoreboard__name">{info.teams[0].name}</span>
            <ClubCrest colors={info.teams[0].colors} label={info.teams[0].shortName} size={34} />
          </div>
          <div className="scoreboard__score">
            <b>{view.score[0]}</b>
            <span>–</span>
            <b>{view.score[1]}</b>
          </div>
          <div className="scoreboard__team scoreboard__team--away">
            <ClubCrest colors={info.teams[1].colors} label={info.teams[1].shortName} size={34} />
            <span className="scoreboard__name">{info.teams[1].name}</span>
          </div>
          <div className="scoreboard__clock">
            <Timer size={14} /> {formatClock(view.clock)} <span className="faint">{view.period >= 3 ? "prol." : view.period === 2 ? "2e MT" : "1re MT"}</span>
          </div>
        </div>
        <div className="live__controls">
          <Segmented size="sm" ariaLabel="Mode d'affichage" value={mode} onChange={setMode} options={VIEW_MODES.map((m) => ({ value: m.value, label: m.label, title: m.title }))} />
          <Segmented
            size="sm"
            ariaLabel="Vitesse"
            value={String(speed)}
            onChange={(v) => setSpeed(Number(v))}
            options={[
              { value: "1", label: "×1" },
              { value: "2", label: "×2" },
              { value: "4", label: "×4" },
            ]}
          />
          <Button size="sm" variant="secondary" onClick={togglePause} icon={paused ? <Play size={14} /> : <Pause size={14} />} title={paused ? "Reprendre" : "Pause"}>
            {paused ? "Reprendre" : "Pause"}
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleView} icon={view3d ? <Square size={14} /> : <Box size={14} />} title={view3d ? "Passer à la vue 2D (plus légère)" : "Passer à la vue 3D"}>
            {view3d ? "Vue 2D" : "Vue 3D"}
          </Button>
          {view3d && follow && (
            <select className="select select--sm" value={camera} onChange={(e) => setCamera(e.target.value as CameraMode)} aria-label="Caméra">
              <option value="tv">Réalisation TV</option>
              <option value="high">Caméra haute</option>
            </select>
          )}
          <Button size="sm" variant="ghost" onClick={() => setFollow((f) => !f)} icon={follow ? <Maximize2 size={14} /> : <Minimize2 size={14} />} title={follow ? "Voir tout le terrain" : "Suivre le ballon"}>
            {follow ? "Terrain entier" : "Suivre le jeu"}
          </Button>
          <Button size="sm" variant="ghost" onClick={leave} icon={<X size={14} />} disabled={ending} title="Le staff termine le match">
            Quitter
          </Button>
        </div>
      </header>

      <div className="live__body">
        <div className="live__pitch">
          <div ref={host} className="live__canvas" />
          {lastLines.length > 0 && (
            <div className="live__ticker">
              {lastLines.map(({ e, text }, i) => (
                <div key={`${e.t}-${i}`} className={`ticker__line${e.importance >= 2 ? " is-key" : ""}`}>
                  <span className="ticker__time">{formatClock(e.t)}</span> {text}
                </div>
              ))}
            </div>
          )}
          {toast && <div className="live__toast" role="status">{toast}</div>}
          {showDecision && decision && <DecisionModal req={decision} info={info} onChoose={decide} />}
          {showHalfTime && halfTime && (
            <div className="live__modal" role="dialog" aria-modal="true" aria-labelledby="ht-title">
              <div className="modal-card decision">
                <div className="modal-card__kicker">Mi-temps · {info.teams[0].shortName} {halfTime[0]} – {halfTime[1]} {info.teams[1].shortName}</div>
                <h2 id="ht-title">Causerie de mi-temps</h2>
                <div className="decision__options">
                  {(Object.keys(TEAM_TALK_FR) as TeamTalk[]).map((t, i) => (
                    <button key={t} className="decision__option" onClick={() => void halfTimeTalk(t)} title={TEAM_TALK_FR[t].help}>
                      <span className="decision__key">{i + 1}</span>
                      <span className="decision__label">{TEAM_TALK_FR[t].label}</span>
                      <span className="decision__meta">{TEAM_TALK_FR[t].help}</span>
                    </button>
                  ))}
                </div>
                <div className="faint decision__foot">L'effet dépend du score et du tempérament du groupe. Le match reprend après votre choix.</div>
              </div>
            </div>
          )}
          {showEnd && (
            <div className="live__modal">
              <div className="modal-card">
                <div className="modal-card__kicker">Coup de sifflet final</div>
                <div className="modal-card__score">
                  {info.teams[0].shortName} <b>{view.score[0]}</b> – <b>{view.score[1]}</b> {info.teams[1].shortName}
                </div>
                <Button variant="primary" size="lg" onClick={finish} disabled={ending} icon={<ArrowRight size={16} />}>
                  {ending ? "Enregistrement…" : "Voir le compte rendu"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="live__side">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "comment", label: "Direct" },
              { value: "stats", label: "Stats" },
              { value: "players", label: "Joueurs" },
              { value: "orders", label: "Consignes" },
            ]}
          />
          <div className="live__side-body">
            {tab === "comment" && <Commentary events={shownEvents} ctx={ctx} mine={mine} />}
            {tab === "stats" && <LiveStats ours={snap.teams[mine].stats} theirs={snap.teams[theirs].stats} names={[info.teams[mine].name, info.teams[theirs].name]} />}
            {tab === "players" && <PlayersPanel info={info} snap={snap} control={control} setControl={setControl} say={say} />}
            {tab === "orders" && <OrdersPanel info={info} control={control} setControl={setControl} w={w} lineup={view.lineup} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ decision */

function DecisionModal({ req, info, onChoose }: { req: PenaltyDecisionRequest; info: LiveInfo; onChoose: (c: PenaltyOption, byStaff?: boolean) => void }) {
  const [left, setLeft] = useState(DECISION_SECONDS);
  const done = useRef(false);
  const choose = (c: PenaltyOption, byStaff = false) => {
    if (done.current) return;
    done.current = true;
    onChoose(c, byStaff);
  };
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      const l = DECISION_SECONDS - (performance.now() - start) / 1000;
      setLeft(Math.max(0, l));
      if (l <= 0) choose(req.recommended, true);
    }, 100);
    return () => window.clearInterval(id);
  }, [req]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      const opt = req.options[i];
      if (opt) choose(opt);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);
  const toLine = 100 - req.advance;
  const diff = req.score[req.side] - req.score[req.side === 0 ? 1 : 0];
  return (
    <div className="live__modal" role="dialog" aria-modal="true" aria-labelledby="penalty-title">
      <div className="modal-card decision">
        <div className="decision__head">
          <div>
            <div className="modal-card__kicker">
              {formatClock(req.clock)} · {diff === 0 ? "égalité" : diff > 0 ? `devant de ${diff}` : `menés de ${-diff}`}
            </div>
            <h2 id="penalty-title">Pénalité pour {info.teams[req.side].name}</h2>
            <div className="faint">À {toLine} m de l'en-but adverse{req.goalProbability > 0.05 ? ` · réussite au pied estimée ${Math.round(req.goalProbability * 100)} %` : ""}</div>
          </div>
          <div className="countdown" aria-label={`${Math.ceil(left)} secondes`}>
            <svg viewBox="0 0 40 40" aria-hidden>
              <circle cx="20" cy="20" r="17" className="countdown__track" />
              <circle cx="20" cy="20" r="17" className="countdown__arc" style={{ strokeDashoffset: `${(1 - left / DECISION_SECONDS) * 106.8}` }} />
            </svg>
            <b>{Math.ceil(left)}</b>
          </div>
        </div>
        <div className="decision__options">
          {req.options.map((o, i) => (
            <button key={o} className={`decision__option${o === req.recommended ? " is-recommended" : ""}`} onClick={() => choose(o)}>
              <span className="decision__key">{i + 1}</span>
              <span className="decision__label">{CHOICE_FR[o]}</span>
              {o === "goal" && <span className="decision__meta">{Math.round(req.goalProbability * 100)} %</span>}
              {o === req.recommended && <Badge tone="accent">Conseil du staff</Badge>}
            </button>
          ))}
        </div>
        <div className="faint decision__foot">Sans réponse, le conseil du staff s'applique. Touches 1 à {req.options.length}.</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function Commentary({ events, ctx, mine }: { events: MatchEvent[]; ctx: Parameters<typeof commentaryFr>[1]; mine: 0 | 1 }) {
  const lines = useMemo(() => {
    const out: { e: MatchEvent; text: string; i: number }[] = [];
    events.forEach((e, i) => {
      if (e.importance < 1) return;
      const text = commentaryFr(e, ctx);
      if (text) out.push({ e, text, i });
    });
    return out.reverse().slice(0, 120);
  }, [events, ctx]);
  if (!lines.length) return <div className="faint">Le match va commencer.</div>;
  return (
    <ol className="commentary">
      {lines.map(({ e, text, i }) => (
        <li key={i} className={`commentary__line${e.importance >= 2 ? " is-key" : ""}${e.side === undefined ? "" : e.side === mine ? " is-us" : " is-them"}`}>
          <span className="commentary__time">{formatClock(e.t)}</span>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}

function LiveStats({ ours, theirs, names }: { ours: TeamStats; theirs: TeamStats; names: [string, string] }) {
  const pct = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50);
  const rows: [string, number, number, ((v: number) => string)?, boolean?][] = [
    ["Possession (%)", pct(ours.possessionSeconds, theirs.possessionSeconds), pct(theirs.possessionSeconds, ours.possessionSeconds), (v) => `${v} %`],
    ["Occupation (%)", pct(ours.territorySeconds, theirs.territorySeconds), pct(theirs.territorySeconds, ours.territorySeconds), (v) => `${v} %`],
    ["Mètres gagnés", Math.round(ours.metres), Math.round(theirs.metres)],
    ["Courses", ours.carries, theirs.carries],
    ["Franchissements", ours.lineBreaks, theirs.lineBreaks],
    ["Défenseurs battus", ours.defendersBeaten, theirs.defendersBeaten],
    ["Plaquages réussis", ours.tacklesMade, theirs.tacklesMade],
    ["Plaquages manqués", ours.tacklesMissed, theirs.tacklesMissed, undefined, false],
    ["Rucks rapides (%)", pct(ours.fastRucks, ours.rucksWon - ours.fastRucks), pct(theirs.fastRucks, theirs.rucksWon - theirs.fastRucks), (v) => `${v} %`],
    ["Turnovers gagnés", ours.turnoversWon, theirs.turnoversWon],
    ["Touches gagnées", ours.lineoutsWon, theirs.lineoutsWon],
    ["Mêlées gagnées", ours.scrumsWon, theirs.scrumsWon],
    ["Pénalités concédées", ours.penaltiesConceded, theirs.penaltiesConceded, undefined, false],
    ["Fautes de main", ours.handlingErrors, theirs.handlingErrors, undefined, false],
    ["Coups de pied", ours.kicksInPlay, theirs.kicksInPlay],
  ];
  return (
    <div className="stack">
      <CompareLegend ours={names[0]} theirs={names[1]} />
      {rows.map(([label, a, b, format, higher]) => (
        <CompareRow key={label} label={label} ours={a} theirs={b} format={format ?? ((v) => String(v))} higherIsBetter={higher ?? true} />
      ))}
      <div className="faint">
        Cartons : {ours.yellowCards} J / {ours.redCards} R — {theirs.yellowCards} J / {theirs.redCards} R
      </div>
    </div>
  );
}

function conditionTone(c: number): string {
  return c >= 75 ? "good" : c >= 60 ? "warning" : "critical";
}

function PlayersPanel({ info, snap, control, setControl, say }: { info: LiveInfo; snap: LiveSnapshot; control: LiveSnapshot; setControl: (s: LiveSnapshot) => void; say: (t: string) => void }) {
  const side = info.side;
  const team = info.teams[side];
  const live = snap.teams[side];
  const ctl = control.teams[side];
  const [incoming, setIncoming] = useState<string | null>(null);
  const players = team.players.map((p) => ({ p, s: live.players[p.id]! })).filter((x) => x.s);
  const field = players.filter((x) => x.s.state === "field").sort((a, b) => (a.s.slot ?? 0) - (b.s.slot ?? 0));
  const bench = players.filter((x) => x.s.state === "bench" && ctl.players[x.p.id]?.state === "bench");
  const away = players.filter((x) => x.s.state === "binned" || x.s.state === "off");
  const pendingOn = new Set(ctl.pendingSubs.map((s) => s.onId));
  const name = (id: string) => team.players.find((p) => p.id === id)?.short ?? id;

  const replace = async (offId: string) => {
    if (!incoming) return;
    const r = await game.liveSub(offId, incoming);
    setControl(r.snapshot);
    setIncoming(null);
    if (r.error) say(r.error);
    else say(`Changement demandé : ${name(incoming)} pour ${name(offId)} (au prochain arrêt de jeu).`);
  };
  const autoSubs = async (on: boolean) => setControl((await game.liveAutoSubs(on)).snapshot);
  const cancel = async (onId: string) => setControl((await game.liveCancelSub(onId)).snapshot);

  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={ctl.autoSubs} onChange={(e) => void autoSubs(e.target.checked)} />
        <span>
          <b>Remplacements prévus par le staff</b>
          <span className="field__help">Décochez pour faire tous les changements vous-même (les blessés restent remplacés).</span>
        </span>
      </label>
      {ctl.pendingSubs.length > 0 && (
        <div className="pending">
          {ctl.pendingSubs.map((s) => (
            <div key={s.onId} className="pending__row">
              <Repeat size={14} /> {name(s.onId)} ← {name(s.offId)} <span className="faint">au prochain arrêt</span>
              <button className="link" onClick={() => void cancel(s.onId)}>
                Annuler
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="section-title">Sur le terrain{incoming ? ` — qui sort pour ${name(incoming)} ?` : ""}</div>
      <ul className="roster">
        {field.map(({ p, s }) => (
          <li key={p.id} className={`roster__row${incoming ? " is-target" : ""}`} onClick={() => incoming && void replace(p.id)} role={incoming ? "button" : undefined} tabIndex={incoming ? 0 : undefined}>
            <span className="roster__num">{p.shirt}</span>
            <span className="roster__name">
              {p.short}
              {p.id === team.captainId && <span className="roster__tag">C</span>}
              {s.yellows > 0 && <span className="card card--yellow" title="Carton jaune" />}
            </span>
            <span className={`meter meter--${conditionTone(s.condition)}`} title={`Condition ${s.condition} %`}>
              <span style={{ width: `${s.condition}%` }} />
            </span>
            <span className="roster__val">{s.condition}%</span>
          </li>
        ))}
      </ul>
      <div className="section-title">Banc</div>
      <ul className="roster">
        {bench.map(({ p }) => (
          <li key={p.id} className={`roster__row${incoming === p.id ? " is-selected" : ""}`}>
            <span className="roster__num">{p.shirt}</span>
            <span className="roster__name">
              {p.short} <span className="faint">{p.position}</span>
            </span>
            {pendingOn.has(p.id) ? (
              <span className="faint">demandé</span>
            ) : (
              <button className="link" onClick={() => setIncoming(incoming === p.id ? null : p.id)}>
                {incoming === p.id ? "Annuler" : "Faire entrer"}
              </button>
            )}
          </li>
        ))}
        {bench.length === 0 && <li className="faint">Plus de remplaçant disponible.</li>}
      </ul>
      {away.length > 0 && (
        <>
          <div className="section-title">Hors du terrain</div>
          <ul className="roster">
            {away.map(({ p, s }) => (
              <li key={p.id} className="roster__row">
                <span className="roster__num">{p.shirt}</span>
                <span className="roster__name">{p.short}</span>
                <span className="faint">{s.state === "binned" ? (s.binKind === "hia" ? "protocole commotion" : s.binKind === "red20" ? "rouge (20 min)" : `exclu jusqu'à ${formatClock(s.returnAt ?? 0)}`) : "sorti"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function OrdersPanel({ info, control, setControl, w, lineup }: { info: LiveInfo; control: LiveSnapshot; setControl: (s: LiveSnapshot) => void; w: ReturnType<typeof useWorld>; lineup: LivePlayer["view"]["lineup"] }) {
  const side = info.side;
  const ctl = control.teams[side];
  const m = w.manager!;
  const [rules, setRules] = useState<PenaltyRule[]>(rulesOf(m.penaltyRules));
  const theirSide = side === 0 ? 1 : 0;
  const opponents = (lineup[theirSide] ?? [])
    .map((id, i) => (id ? { player: w.players[id]?.player, shirt: i + 1 } : null))
    .filter((o): o is { player: NonNullable<typeof o>["player"] & object; shirt: number } => !!o && !!o.player);

  const setTactic = async (key: keyof Tactics, value: string) => setControl((await game.liveTactics({ ...ctl.tactics, [key]: value } as Tactics)).snapshot);
  const applyPlan = async (i: number) => setControl((await game.liveTactics({ ...m.plans[i]!.tactics })).snapshot);
  const setTargets = async (t: TargetedInstructions | undefined) => setControl((await game.liveTargets(t)).snapshot);
  const saveRules = async (r: PenaltyRule[]) => {
    setRules(r);
    await game.liveRules(r);
  };

  return (
    <div className="stack">
      <div className="row row--wrap">
        {m.plans.map((p, i) => (
          <Button key={i} size="sm" variant="secondary" onClick={() => void applyPlan(i)}>
            Passer au {p.name}
          </Button>
        ))}
      </div>
      {(Object.keys(TACTIC_INFO) as (keyof Tactics)[]).map((key) => (
        <div key={key} className="field">
          <span className="field__label">{TACTIC_INFO[key].title}</span>
          <Segmented
            size="sm"
            ariaLabel={TACTIC_INFO[key].title}
            value={ctl.tactics[key] as string}
            onChange={(v) => void setTactic(key, v)}
            options={Object.entries(TACTIC_LABEL_FR[key] as Record<string, string>).map(([value, label]) => ({ value, label, title: TACTIC_INFO[key].effects[value] }))}
          />
        </div>
      ))}
      <div className="section-title">Consignes ciblées</div>
      <TargetsEditor opponents={opponents} value={ctl.targets} onChange={(t) => void setTargets(t)} />
      <div className="section-title">Décisions sur pénalité</div>
      <PenaltyRulesEditor rules={rules} onChange={(r) => void saveRules(r)} />
      <div className="faint">
        Arbitre : {info.referee.name} — profil estimé {fmt1(info.referee.breakdownStrictness * 10)}/10 au sol, {fmt1(info.referee.cardStrictness * 10)}/10 sur les cartons.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 2D / 3D preference */

const VIEW_KEY = "ovalie:vue3d";
function readView3d(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeView3d(on: boolean): void {
  try {
    localStorage.setItem(VIEW_KEY, on ? "1" : "0");
  } catch {
    /* préférence non enregistrée */
  }
}
