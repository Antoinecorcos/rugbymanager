import { useMemo, useState } from "react";
import { availability, isForward, naturalPosition, playerLevel, POSITION_LABEL_FR, type PlayerState, type World } from "@ovalie/engine";
import { useWorld } from "../game/client";
import { ageIn, fmt1, fullName, nationName, playerStars, POSITION_ORDER, POSITION_SHORT_FR } from "../game/format";
import { href, navigate } from "../game/router";
import { manager, myClubId, squadOf } from "../game/selectors";
import { Badge, DataTable, Freshness, PageHeader, Panel, Segmented, Stars, StatusPill, type Column } from "../ui/components";

/** Club-competition totals of a player this season (internationals counted apart). */
export function clubTotals(w: World, ps: PlayerState) {
  const t = { appearances: 0, starts: 0, minutes: 0, tries: 0, points: 0, yellow: 0, red: 0, caps: 0 };
  for (const [comp, s] of Object.entries(ps.stats)) {
    if (w.competitions[comp]?.kind === "international") {
      t.caps += s.caps;
      continue;
    }
    t.appearances += s.appearances;
    t.starts += s.starts;
    t.minutes += s.minutes;
    t.tries += s.tries;
    t.points += s.points;
    t.yellow += s.yellowCards;
    t.red += s.redCards;
  }
  return t;
}

type Group = "all" | "fwd" | "back";

export function SquadScreen({ clubId }: { clubId?: string }) {
  const w = useWorld();
  const id = clubId ?? myClubId(w);
  const mine = id === myClubId(w);
  const club = w.clubs[id]!;
  const [group, setGroup] = useState<Group>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const sel = manager(w).selection;
  const shirtOf = useMemo(() => new Map(mine && !sel.auto ? sel.lineup.map((p, i) => [p, i + 1]) : []), [mine, sel]);

  const rows = squadOf(w, id).filter((ps) => {
    const fwd = isForward(naturalPosition(ps.player));
    if (group === "fwd" && !fwd) return false;
    if (group === "back" && fwd) return false;
    if (onlyAvailable && availability(ps, w.date).status !== "available") return false;
    return true;
  });

  const columns: Column<PlayerState>[] = [
    ...(mine && !sel.auto
      ? [{ key: "shirt", label: "N°", title: "Numéro sur la feuille de match", render: (ps: PlayerState) => (shirtOf.get(ps.player.id) ? <Badge tone={shirtOf.get(ps.player.id)! <= 15 ? "accent" : "neutral"}>{shirtOf.get(ps.player.id)}</Badge> : null), sort: (ps: PlayerState) => shirtOf.get(ps.player.id) ?? 99, align: "center" as const, width: 44 }]
      : []),
    {
      key: "pos",
      label: "Poste",
      render: (ps) => {
        const pos = naturalPosition(ps.player);
        const others = Object.entries(ps.player.positions)
          .filter(([p, v]) => p !== pos && v >= 14)
          .map(([p]) => POSITION_SHORT_FR[p as keyof typeof POSITION_SHORT_FR]);
        return (
          <span title={POSITION_LABEL_FR[pos]}>
            <b>{POSITION_SHORT_FR[pos]}</b>
            {others.length > 0 && <span className="faint"> · {others.join(", ")}</span>}
          </span>
        );
      },
      sort: (ps) => POSITION_ORDER.indexOf(naturalPosition(ps.player)) * 100 - playerLevel(ps.player),
      width: 110,
    },
    { key: "name", label: "Nom", render: (ps) => <a className="link" href={href("joueur", ps.player.id)}><b>{fullName(ps.player)}</b></a>, sort: (ps) => ps.player.lastName },
    { key: "age", label: "Âge", render: (ps) => ageIn(w, ps.player), sort: (ps) => ageIn(w, ps.player), align: "right" },
    { key: "nat", label: "Nat.", render: (ps) => <span title={nationName(ps.player.nationality)}>{ps.player.nationality}</span>, sort: (ps) => ps.player.nationality },
    { key: "morph", label: "Taille · poids", render: (ps) => <span className="muted">{ps.player.heightCm} cm · {ps.player.weightKg} kg</span>, sort: (ps) => ps.player.weightKg, align: "right" },
    {
      key: "level",
      label: "Niveau",
      title: "Niveau actuel (étoiles pleines) et potentiel (étoiles sombres)",
      render: (ps) => {
        const s = playerStars(ps.player);
        return <Stars value={s.current} potential={s.potential} />;
      },
      sort: (ps) => playerLevel(ps.player),
    },
    { key: "fresh", label: "Fraîcheur", render: (ps) => <Freshness value={ps.freshness} />, sort: (ps) => ps.freshness },
    {
      key: "status",
      label: "État",
      render: (ps) => {
        const a = availability(ps, w.date);
        return <StatusPill status={a.status} label={a.label} />;
      },
      sort: (ps) => ["available", "rest", "duty", "suspended", "injured"].indexOf(availability(ps, w.date).status),
    },
    { key: "caps", label: "Sél.", title: "Sélections internationales (début de saison + cette saison)", render: (ps) => ps.caps + clubTotals(w, ps).caps || <span className="faint">0</span>, sort: (ps) => ps.caps + clubTotals(w, ps).caps, align: "right" },
    { key: "apps", label: "Matchs", title: "Matchs joués en club cette saison (titularisations)", render: (ps) => { const t = clubTotals(w, ps); return <span>{t.appearances} <span className="faint">({t.starts})</span></span>; }, sort: (ps) => clubTotals(w, ps).appearances, align: "right" },
    { key: "min", label: "Min.", render: (ps) => clubTotals(w, ps).minutes, sort: (ps) => clubTotals(w, ps).minutes, align: "right" },
    { key: "tries", label: "Essais", render: (ps) => clubTotals(w, ps).tries || <span className="faint">0</span>, sort: (ps) => clubTotals(w, ps).tries, align: "right" },
    { key: "pts", label: "Pts", render: (ps) => clubTotals(w, ps).points || <span className="faint">0</span>, sort: (ps) => clubTotals(w, ps).points, align: "right" },
  ];

  const avg = rows.length ? rows.reduce((a, ps) => a + playerLevel(ps.player), 0) / rows.length : 0;
  return (
    <>
      <PageHeader kicker={mine ? "Votre effectif" : club.name} title={mine ? "Effectif" : `Effectif — ${club.name}`} actions={mine && <a className="btn btn--secondary btn--md" href={href("composition")}>Composition du match</a>} />
      <Panel
        flush
        title={`${rows.length} joueurs`}
        subtitle={`Niveau moyen ${fmt1(avg)} / 20`}
        actions={
          <>
            <Segmented
              size="sm"
              value={group}
              onChange={setGroup}
              options={[
                { value: "all", label: "Tous" },
                { value: "fwd", label: "Avants" },
                { value: "back", label: "Arrières" },
              ]}
            />
            <label className="row faint" style={{ fontSize: "var(--fs-sm)" }}>
              <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Disponibles
            </label>
          </>
        }
      >
        <DataTable rows={rows} columns={columns} rowKey={(ps) => ps.player.id} onRowClick={(ps) => navigate("joueur", ps.player.id)} defaultSort={{ key: "pos", dir: 1 }} rowClass={(ps) => (availability(ps, w.date).status === "available" || availability(ps, w.date).status === "rest" ? undefined : "is-dim")} />
      </Panel>
    </>
  );
}
