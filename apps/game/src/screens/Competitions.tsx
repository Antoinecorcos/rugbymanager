import { useMemo, useState } from "react";
import { computeTable, fixturesOf, type CompetitionState, type World } from "@ovalie/engine";
import { useWorld } from "../game/client";
import { dateShort, fullName, stageFr } from "../game/format";
import { navigate } from "../game/router";
import { competitionShort, myClubId, myLeagueId, teamName } from "../game/selectors";
import { Badge, Empty, PageHeader, Panel, Segmented, Tabs } from "../ui/components";
import { ClubLink, LeagueTable, PlayerLink } from "../ui/widgets";

const KO_LABEL: Record<string, string> = {
  barrages: "Barrages",
  access: "Match d'accession",
  demiFinales: "Demi-finales",
  finale: "Finale",
  quarts: "Quarts de finale",
  huitiemes: "Huitièmes de finale",
  petiteFinale: "Match pour la 3e place",
};

const ORDER = ["top14", "prod2", "nationale", "champions-cup", "challenge-cup", "prem", "urc", "world-cup", "nations-championship", "six-nations"];

function Scorers({ w, comp }: { w: World; comp: string }) {
  const [key, setKey] = useState<"tries" | "points">("tries");
  const rows = useMemo(
    () =>
      Object.values(w.players)
        .filter((ps) => (ps.stats[comp]?.[key] ?? 0) > 0)
        .sort((a, b) => b.stats[comp]![key] - a.stats[comp]![key] || a.stats[comp]!.minutes - b.stats[comp]!.minutes)
        .slice(0, 10),
    [w, comp, key],
  );
  return (
    <Panel
      title="Meilleurs marqueurs"
      actions={
        <Segmented
          size="sm"
          value={key}
          onChange={setKey}
          options={[
            { value: "tries", label: "Essais" },
            { value: "points", label: "Points" },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <Empty>Pas encore de points marqués.</Empty>
      ) : (
        <ol className="scorers">
          {rows.map((ps) => (
            <li key={ps.player.id}>
              <span className="scorers__name">
                <PlayerLink w={w} id={ps.player.id} />
                <span className="faint"> · {ps.clubId ? teamName(w, ps.clubId) : ps.duty?.nation ?? ""}</span>
              </span>
              <b className="num">{ps.stats[comp]![key]}</b>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Results({ w, c }: { w: World; c: CompetitionState }) {
  const all = fixturesOf(w, c.id);
  const stages = [...new Set(all.map((f) => f.stage))];
  const current = all.find((f) => !f.result)?.stage ?? stages.at(-1) ?? "";
  const [stage, setStage] = useState(current);
  const list = all.filter((f) => f.stage === (stages.includes(stage) ? stage : current));
  const me = myClubId(w);
  return (
    <Panel
      title="Résultats et programme"
      actions={
        <select className="select" value={stages.includes(stage) ? stage : current} onChange={(e) => setStage(e.target.value)} aria-label="Journée">
          {stages.map((s) => (
            <option key={s} value={s}>
              {stageFr(s)}
            </option>
          ))}
        </select>
      }
    >
      <ul className="list">
        {list.map((f) => {
          const mine = f.home === me || f.away === me;
          return (
            <li key={f.id} className={`other-result${mine ? " is-mine" : ""}${mine && w.reports?.[f.id] ? " is-clickable" : ""}`} onClick={mine && w.reports?.[f.id] ? () => navigate("match", f.id) : undefined}>
              <span className="faint other-result__date">{dateShort(f.date)}</span>
              <ClubLink w={w} id={f.home} crest />
              <b className="num">{f.result ? `${f.result.score[0]}-${f.result.score[1]}` : "–"}</b>
              <ClubLink w={w} id={f.away} crest />
              {f.result?.decidedBy && <Badge>{f.result.decidedBy === "extraTime" ? "a.p." : "t.a.b."}</Badge>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Knockouts({ w, c }: { w: World; c: CompetitionState }) {
  const ko = fixturesOf(w, c.id).filter((f) => f.knockout);
  if (!ko.length) {
    const dates = Object.entries(c.knockout);
    return dates.length ? (
      <Panel title="Phases finales">
        <ul className="list">
          {dates.map(([k, d]) => (
            <li key={k} className="row">
              <span className="faint">{dateShort(d)}</span> {KO_LABEL[k] ?? k}
            </li>
          ))}
        </ul>
      </Panel>
    ) : null;
  }
  return (
    <Panel title="Phases finales">
      <ul className="list">
        {ko.map((f) => (
          <li key={f.id} className="other-result">
            <Badge tone="outline">{stageFr(f.stage)}</Badge>
            <ClubLink w={w} id={f.home} crest />
            <b className="num">{f.result ? `${f.result.score[0]}-${f.result.score[1]}` : dateShort(f.date)}</b>
            <ClubLink w={w} id={f.away} crest />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CompetitionsScreen({ competitionId }: { competitionId?: string }) {
  const w = useWorld();
  const ids = ORDER.filter((id) => w.competitions[id]);
  const id = competitionId && w.competitions[competitionId] ? competitionId : myLeagueId(w);
  const c = w.competitions[id]!;
  const me = myClubId(w);
  const isRound = (s: string) => /^J\d+$/.test(s) || /^poule-\d+-J\d+$/.test(s);
  return (
    <>
      <PageHeader kicker="Classements et résultats" title={c.name}>
        {c.outcome?.champion && (
          <div className="muted" style={{ marginTop: 4 }}>
            Champion : <b>{teamName(w, c.outcome.champion)}</b>
            {c.outcome.notes?.length ? ` — ${c.outcome.notes.join(" ; ")}` : ""}
          </div>
        )}
        {c.adjustments && Object.keys(c.adjustments).length > 0 && (
          <div className="muted" style={{ marginTop: 4 }}>
            Pénalités au classement :{" "}
            {Object.entries(c.adjustments)
              .map(([t, pts]) => `${teamName(w, t)} ${pts > 0 ? "+" : ""}${pts} pts (règle JIFF)`)
              .join(", ")}
          </div>
        )}
      </PageHeader>
      <Tabs value={id} onChange={(v) => navigate("competitions", v)} tabs={ids.map((x) => ({ value: x, label: competitionShort(x) }))} />
      <div className="grid grid--main-side">
        <div className="stack">
          {c.groups ? (
            <div className={c.groups.length > 2 ? "grid grid--2" : "stack"}>
              {c.groups.map((g, i) => (
                <Panel key={i} title={c.id === "world-cup" ? `Poule ${"ABCDEF"[i]}` : c.kind === "international" ? `Conférence ${i + 1}` : `Poule ${i + 1}`} flush>
                  <LeagueTable w={w} comp={c.id} rows={computeTable(g, fixturesOf(w, c.id, isRound))} highlight={me} compact={c.groups!.length > 2} />
                </Panel>
              ))}
            </div>
          ) : (
            <Panel title="Saison régulière" flush subtitle={c.id === "top14" ? "1-2 : demi-finales directes · 3-6 : barrages · 13e : access match · 14e : relégué" : c.id === "prod2" ? "1-2 : demi-finales · 3-6 : barrages · 15e : barrage d'accession · 16e : relégué" : c.id === "nationale" && w.season !== "2026-2027" ? "1-2 : demi-finales · 3-6 : barrages · 15e et 16e : relégués en Nationale 2" : undefined}>
              <LeagueTable w={w} comp={c.id} highlight={me} />
            </Panel>
          )}
          <Results w={w} c={c} />
        </div>
        <div className="stack">
          <Knockouts w={w} c={c} />
          <Scorers w={w} comp={c.id} />
        </div>
      </div>
    </>
  );
}

