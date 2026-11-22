import { useMemo, useState } from "react";
import { AlertTriangle, Crown, Target, UserCheck, Wand2, XCircle } from "lucide-react";
import {
  availability,
  lineupIssues,
  naturalPosition,
  playerLevel,
  POSITION_LABEL_FR,
  selectionScore,
  slotPosition,
  staffLineup,
  staffSelection,
  type BenchSplit,
  type MatchdaySelection,
  type PlayerState,
  type World,
} from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { dateShort, fmt1, playerStars, POSITION_SHORT_FR, shortName } from "../game/format";
import { href } from "../game/router";
import { manager, myClubId, myNextFixture, squadOf, teamName, viewOf } from "../game/selectors";
import { Badge, Button, Freshness, PageHeader, Panel, Segmented, Stars, StatusPill } from "../ui/components";
import { Pitch, PitchSlot } from "../ui/pitch";

const famTier = (fam: number) => (fam >= 18 ? 4 : fam >= 14 ? 3 : fam >= 10 ? 2 : fam >= 6 ? 1 : 0);

/** The 23 to display: the manager's own, or what the staff would pick on match day. */
function displayed(w: World, d: string, knockout: boolean): MatchdaySelection {
  const sel = manager(w).selection;
  if (!sel.auto && sel.lineup.length === 23) return sel;
  const t = staffSelection(w, myClubId(w), d, { bench: sel.bench, knockout });
  return { auto: true, bench: sel.bench, lineup: t.players.map((p) => p.id), captainId: t.captainId, goalKickerId: t.goalKickerId };
}

export function LineupScreen() {
  const w = useWorld();
  const clubId = myClubId(w);
  const next = myNextFixture(w);
  const d = next?.date ?? w.date;
  const sel = displayed(w, d, !!next?.knockout);
  const manual = !sel.auto;
  const [slot, setSlot] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<{ shirt?: number; playerId?: string } | null>(null);
  const issues = useMemo(() => lineupIssues(w, clubId, sel, d), [w, sel, d]);
  const squad = squadOf(w, clubId);
  const shirtOf = new Map(sel.lineup.map((p, i) => [p, i + 1]));
  const errorsBySlot = new Map(issues.filter((i) => i.shirt && i.level === "error").map((i) => [i.shirt!, i.text]));

  const save = (s: MatchdaySelection) => void game.updateManager({ selection: s });
  const takeOver = (base = sel) => save({ ...base, auto: false });
  /** Puts a player in a shirt; if he already has a shirt, the two swap. */
  const assign = (shirt: number, playerId: string) => {
    const lineup = [...sel.lineup];
    const from = lineup.indexOf(playerId);
    const prev = lineup[shirt - 1]!;
    lineup[shirt - 1] = playerId;
    if (from >= 0) lineup[from] = prev;
    takeOver({ ...sel, lineup });
  };
  const swap = (a: number, b: number) => {
    const lineup = [...sel.lineup];
    [lineup[a - 1], lineup[b - 1]] = [lineup[b - 1]!, lineup[a - 1]!];
    takeOver({ ...sel, lineup });
  };
  const onPlayer = (pid: string) => {
    if (slot !== null) {
      assign(slot, pid);
      setSlot(null);
    } else if (shirtOf.has(pid)) setSlot(shirtOf.get(pid)!);
  };
  const dropOn = (shirt: number) => {
    if (dragFrom?.shirt) swap(dragFrom.shirt, shirt);
    else if (dragFrom?.playerId) assign(shirt, dragFrom.playerId);
    setDragFrom(null);
  };

  const slotPos = slot ? slotPosition(slot, sel.bench) : undefined;
  const listed = [...squad].sort((a, b) =>
    slotPos ? selectionScore(b.player, slotPos) - selectionScore(a.player, slotPos) : (shirtOf.get(a.player.id) ?? 99) - (shirtOf.get(b.player.id) ?? 99) || playerLevel(b.player) - playerLevel(a.player),
  );
  const starters = sel.lineup.slice(0, 15).map((p) => w.players[p]).filter((p): p is PlayerState => !!p);

  const Card = ({ shirt }: { shirt: number }) => {
    const ps = w.players[sel.lineup[shirt - 1] ?? ""];
    const pos = slotPosition(shirt, sel.bench);
    const fam = ps ? (ps.player.positions[pos] ?? 1) : 0;
    const err = errorsBySlot.get(shirt);
    return (
      <div
        className={`shirt${slot === shirt ? " is-selected" : ""}${err ? " has-error" : ""}`}
        draggable={!!ps}
        onDragStart={() => setDragFrom({ shirt })}
        title={err ?? (ps ? `${POSITION_LABEL_FR[pos]} — familiarité ${fam}/20` : POSITION_LABEL_FR[pos])}
      >
        <span className="shirt__num display">{shirt}</span>
        <span className="shirt__name">{ps ? shortName(ps.player) : "—"}</span>
        <span className="shirt__meta">
          <span className={`fam-chip fam-chip--${famTier(fam)}`}>{POSITION_SHORT_FR[pos]}</span>
          {ps && sel.captainId === ps.player.id && <Crown size={12} aria-label="capitaine" />}
          {ps && sel.goalKickerId === ps.player.id && <Target size={12} aria-label="buteur" />}
          {err && <XCircle size={12} className="shirt__err" aria-label="problème" />}
          {ps && ps.freshness < 60 && <AlertTriangle size={12} className="shirt__warn" aria-label="fatigué" />}
        </span>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        kicker={next ? `${dateShort(next.date)} · ${teamName(w, viewOf(w, next).opponent)}` : "Composition"}
        title="Composition du match"
        actions={
          <>
            <Segmented
              value={manual ? "manual" : "staff"}
              onChange={(v) => (v === "staff" ? save({ ...manager(w).selection, auto: true }) : takeOver())}
              options={[
                { value: "staff", label: "Le staff choisit", title: "Le staff compose l'équipe avant chaque match (rotation, fatigue, absences)" },
                { value: "manual", label: "Je choisis", title: "Votre 23 est conservé de match en match ; les absents sont remplacés par le staff" },
              ]}
            />
            <Button icon={<Wand2 size={16} />} onClick={() => save(staffLineup(w, clubId, d, sel.bench, !!next?.knockout))} title="Remplace votre 23 par la proposition du staff pour le prochain match">
              Proposition du staff
            </Button>
          </>
        }
      />

      {!manual && (
        <div className="notice notice--info">
          <UserCheck size={16} />
          <span>
            Le staff choisit l'équipe : voici le 23 qu'il alignerait. Modifiez un joueur (clic ou glisser-déposer) pour prendre la main ; votre composition sera alors conservée d'un match à l'autre.
          </span>
        </div>
      )}

      <div className="grid lineup-grid">
        <Panel
          title="XV de départ"
          actions={
            <Segmented
              size="sm"
              ariaLabel="Composition du banc"
              value={sel.bench}
              onChange={(b: BenchSplit) => (manual ? save({ ...sel, bench: b }) : save({ ...manager(w).selection, bench: b }))}
              options={[
                { value: "5-3", label: "Banc 5-3", title: "5 avants, 3 arrières" },
                { value: "6-2", label: "6-2", title: "6 avants, 2 arrières" },
                { value: "7-1", label: "7-1", title: "7 avants, 1 arrière (« bomb squad »)" },
              ]}
            />
          }
        >
          <Pitch height={620}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((shirt) => (
              <PitchSlot key={shirt} shirt={shirt} onClick={() => setSlot(slot === shirt ? null : shirt)} onDrop={() => dropOn(shirt)}>
                <Card shirt={shirt} />
              </PitchSlot>
            ))}
          </Pitch>
          <div className="bench">
            <div className="bench__title faint">Remplaçants</div>
            <div className="bench__slots">
              {Array.from({ length: 8 }, (_, i) => i + 16).map((shirt) => (
                <div key={shirt} className="bench__slot" onClick={() => setSlot(slot === shirt ? null : shirt)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(shirt)} role="button" tabIndex={0}>
                  <Card shirt={shirt} />
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Rôles">
            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="captain">
                  <Crown size={12} /> Capitaine
                </label>
                <select id="captain" className="select" value={sel.captainId ?? ""} onChange={(e) => takeOver({ ...sel, captainId: e.target.value })}>
                  {starters.map((ps) => (
                    <option key={ps.player.id} value={ps.player.id}>
                      {shortName(ps.player)} (leadership {ps.player.attributes.leadership})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="kicker">
                  <Target size={12} /> Buteur
                </label>
                <select id="kicker" className="select" value={sel.goalKickerId ?? ""} onChange={(e) => takeOver({ ...sel, goalKickerId: e.target.value })}>
                  {[...starters]
                    .sort((a, b) => b.player.attributes.goalKicking - a.player.attributes.goalKicking)
                    .map((ps) => (
                      <option key={ps.player.id} value={ps.player.id}>
                        {shortName(ps.player)} (buteur {ps.player.attributes.goalKicking})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </Panel>

          <Panel title="Contrôles" subtitle={issues.length ? `${issues.length} point${issues.length > 1 ? "s" : ""} à vérifier` : undefined}>
            {issues.length === 0 ? (
              <div className="row status--good">
                <UserCheck size={16} /> Feuille de match valide : 6 premières lignes, tous les joueurs disponibles.
              </div>
            ) : (
              <ul className="list">
                {issues.map((i, k) => (
                  <li key={k} className="row" style={{ alignItems: "flex-start" }}>
                    {i.level === "error" ? <XCircle size={15} className="status--critical" /> : <AlertTriangle size={15} className="status--warning" />}
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            flush
            title={slot ? `Choisir le n° ${slot} — ${POSITION_LABEL_FR[slotPos!]}` : "Effectif"}
            subtitle={slot ? "Trié par adéquation au poste · cliquez pour placer (échange si déjà sur la feuille)" : "Cliquez un numéro sur le terrain, puis un joueur — ou glissez-le"}
            actions={slot && <Button size="sm" variant="ghost" onClick={() => setSlot(null)}>Annuler</Button>}
          >
            <div className="pick-list">
              {listed.map((ps) => {
                const av = availability(ps, d);
                const pos = slotPos ?? naturalPosition(ps.player);
                const fam = ps.player.positions[pos] ?? 1;
                const shirt = shirtOf.get(ps.player.id);
                const out = av.status !== "available" && av.status !== "rest";
                return (
                  <div key={ps.player.id} className={`pick${out ? " is-out" : ""}${shirt ? " is-picked" : ""}`} draggable onDragStart={() => setDragFrom({ playerId: ps.player.id })} onClick={() => onPlayer(ps.player.id)} role="button" tabIndex={0}>
                    <span className="pick__shirt">{shirt ? <Badge tone={shirt <= 15 ? "accent" : "neutral"}>{shirt}</Badge> : null}</span>
                    <span className={`fam-chip fam-chip--${famTier(fam)}`} title={`${POSITION_LABEL_FR[pos]} : ${fam}/20`}>
                      {POSITION_SHORT_FR[slotPos ? pos : naturalPosition(ps.player)]}
                    </span>
                    <span className="pick__name">
                      <a className="link" href={href("joueur", ps.player.id)} onClick={(e) => e.stopPropagation()}>
                        {shortName(ps.player)}
                      </a>
                    </span>
                    <Stars value={playerStars(ps.player).current} size={11} />
                    <span className="faint num" title="Niveau sur 20">
                      {fmt1(playerLevel(ps.player))}
                    </span>
                    <Freshness value={ps.freshness} />
                    <StatusPill status={av.status} label={av.label} compact />
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
