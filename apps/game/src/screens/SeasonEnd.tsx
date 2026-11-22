import { leagueTable, seasonSummary } from "@ovalie/engine";
import { Trophy } from "lucide-react";
import { useWorld } from "../game/client";
import { ordinal } from "../game/format";
import { myClub, myClubId, myLeagueId, teamName } from "../game/selectors";
import { Empty, PageHeader, Panel } from "../ui/components";
import { LeagueTable } from "../ui/widgets";

const TIERS = ["NATIONALE", "PROD2", "TOP14"];

export function SeasonEndScreen() {
  const w = useWorld();
  const s = seasonSummary(w);
  const me = myClubId(w);
  const league = myLeagueId(w);
  const rank = leagueTable(w, league).findIndex((r) => r.team === me) + 1;
  const myTitles = s.competitions.filter((c) => c.champion === me);
  const move = s.movements.find((m) => m.club === me);
  return (
    <>
      <PageHeader kicker={`Saison ${w.season}`} title="Bilan de la saison">
        <p className="muted">
          {myClub(w).name} termine {ordinal(rank)} de la saison régulière.
          {myTitles.length ? ` Titre${myTitles.length > 1 ? "s" : ""} : ${myTitles.map((c) => c.name).join(", ")} !` : ""}
          {move ? ` ${TIERS.indexOf(move.to) > TIERS.indexOf(move.from) ? "Montée" : "Descente"} : ${move.from} → ${move.to} (${move.reason}).` : ""}
        </p>
      </PageHeader>
      <div className="grid grid--main-side">
        <Panel title="Palmarès">
          {s.competitions.filter((c) => c.champion).length === 0 ? (
            <Empty>La saison n'est pas terminée.</Empty>
          ) : (
            <ul className="list">
              {s.competitions
                .filter((c) => c.champion)
                .map((c) => (
                  <li key={c.id} className="row">
                    <Trophy size={16} color={c.champion === me ? "var(--accent)" : "var(--text-3)"} />
                    <b>{c.name}</b>
                    <span>{teamName(w, c.champion!)}</span>
                    <span className="faint">(finaliste : {teamName(w, c.runnerUp ?? "")})</span>
                    {c.topPointScorers[0] && <span className="faint" style={{ marginLeft: "auto" }}>Meilleur réalisateur : {c.topPointScorers[0].name} ({c.topPointScorers[0].value} pts)</span>}
                  </li>
                ))}
            </ul>
          )}
        </Panel>
        <Panel title="Montées et descentes">
          {s.movements.length ? (
            <ul className="list">
              {s.movements.map((m) => (
                <li key={m.club}>
                  <b>{teamName(w, m.club)}</b> <span className="faint">{m.from} → {m.to} · {m.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>À venir.</Empty>
          )}
        </Panel>
      </div>
      <Panel title="Classement final" flush>
        <LeagueTable w={w} comp={league} highlight={me} />
      </Panel>
      <p className="faint">La saison 2027-2028 (montées et descentes appliquées, vieillissement, Coupe du monde 2027) sera jouable dans une prochaine étape.</p>
    </>
  );
}
