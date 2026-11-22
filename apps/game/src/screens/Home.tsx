import { CloudRain, Crosshair, Shirt, Sun, Wind } from "lucide-react";
import { availability, daysBetween, fixtureWeather, formatDateFr, STATUS_FR, type World } from "@ovalie/engine";
import { MoraleBadge } from "../ui/human";
import { useWorld } from "../game/client";
import { dateShort, stageFr, WEATHER_FR } from "../game/format";
import { href, navigate } from "../game/router";
import { competitionName, inboxItems, manager, myClub, myClubId, myFixtures, myLeagueId, myNextFixture, squadOf, teamName, unreadCount, venueLabel, viewOf } from "../game/selectors";
import { Badge, Button, ClubCrest, PageHeader, Panel, ResultChip, StatusPill } from "../ui/components";
import { FixtureRow, LeagueTable, NewsList, PlayerLink } from "../ui/widgets";

export const WeatherIcon = ({ weather }: { weather: string }) => (weather === "wet" ? <CloudRain size={16} /> : weather === "windy" ? <Wind size={16} /> : <Sun size={16} />);

function NextMatch({ w }: { w: World }) {
  const f = myNextFixture(w);
  if (!f) return <Panel title="Prochain match">Aucun match programmé.</Panel>;
  const v = viewOf(w, f);
  const opp = w.clubs[v.opponent];
  const club = myClub(w);
  const days = daysBetween(w.date, f.date);
  const weather = fixtureWeather(w, f);
  const left = v.home || f.neutral ? club : opp;
  const right = v.home || f.neutral ? opp : club;
  return (
    <Panel title="Prochain match" actions={<Badge tone="accent">{days === 0 ? "Aujourd'hui" : days === 1 ? "Demain" : `Dans ${days} jours`}</Badge>}>
      <div className="next-match">
        <div className="next-match__meta">
          <b>{competitionName(w, f.competitionId)}</b> · {stageFr(f.stage)} · {formatDateFr(f.date)}
        </div>
        <div className="next-match__teams">
          <div className="next-match__team">
            <ClubCrest colors={left?.colors} label={left?.shortName ?? "?"} size={54} />
            <span>{left?.name}</span>
          </div>
          <span className="next-match__vs display">contre</span>
          <div className="next-match__team">
            <ClubCrest colors={right?.colors} label={right?.shortName ?? "?"} size={54} />
            <span>{right?.name}</span>
          </div>
        </div>
        <div className="next-match__foot">
          <span className="muted">
            {venueLabel(v)}
            {f.venue ? ` · ${f.venue}` : v.home && club.stadium ? ` · ${club.stadium}` : !v.home && opp?.stadium ? ` · ${opp.stadium}` : ""}
          </span>
          <span className="row muted" title="Prévision de l'analyste">
            <WeatherIcon weather={weather} /> {WEATHER_FR[weather]}
          </span>
        </div>
        <div className="row row--wrap">
          <Button variant="primary" icon={<Crosshair size={16} />} onClick={() => navigate("preparation")}>
            Préparer le match
          </Button>
          <Button icon={<Shirt size={16} />} onClick={() => navigate("composition")}>
            Composition
          </Button>
          <span className="faint" style={{ marginLeft: "auto" }}>
            {manager(w).selection.auto ? "Composition : choisie par le staff" : "Composition : la vôtre"}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function LastResult({ w }: { w: World }) {
  const played = myFixtures(w).filter((f) => f.result);
  const f = played.at(-1);
  if (!f) return null;
  const v = viewOf(w, f);
  return (
    <Panel title="Dernier résultat" actions={w.reports?.[f.id] && <a className="link" href={href("match", f.id)}>Compte rendu</a>}>
      <div className="last-result">
        <ResultChip outcome={v.outcome!} />
        <span className="last-result__score display num nowrap">
          {v.score![0]} - {v.score![1]}
        </span>
        <span>
          contre <b>{teamName(w, v.opponent)}</b>
          <br />
          <span className="faint">
            {competitionName(w, f.competitionId)} · {dateShort(f.date)}
          </span>
        </span>
      </div>
    </Panel>
  );
}

function SquadStatus({ w }: { w: World }) {
  const squad = squadOf(w, myClubId(w));
  const groups = { injured: [] as string[], suspended: [] as string[], duty: [] as string[] };
  for (const ps of squad) {
    const a = availability(ps, w.date);
    if (a.status === "injured" || a.status === "suspended" || a.status === "duty") groups[a.status].push(ps.player.id);
  }
  const tired = squad.filter((ps) => ps.freshness < 60).length;
  const absent = [...groups.injured, ...groups.suspended, ...groups.duty];
  return (
    <Panel title="État de l'effectif" actions={<a className="link" href={href("effectif")}>Effectif</a>}>
      <div className="squad-status">
        <div>
          <b className="display">{squad.length - absent.length}</b>
          <span>disponibles</span>
        </div>
        <div>
          <b className="display">{groups.injured.length}</b>
          <span>blessés</span>
        </div>
        <div>
          <b className="display">{groups.duty.length}</b>
          <span>en sélection</span>
        </div>
        <div>
          <b className="display">{groups.suspended.length}</b>
          <span>suspendus</span>
        </div>
        <div>
          <b className="display">{tired}</b>
          <span>fatigués</span>
        </div>
      </div>
      {absent.length > 0 && (
        <ul className="list">
          {absent.slice(0, 6).map((id) => {
            const a = availability(w.players[id]!, w.date);
            return (
              <li key={id} className="row">
                <StatusPill status={a.status} label={a.label} compact />
                <PlayerLink w={w} id={id} />
                <span className="faint" style={{ marginLeft: "auto" }}>
                  {a.label.replace(/^[^(]*\(/, "").replace(/\)$/, "")}
                  {a.until ? ` · jusqu'au ${dateShort(a.until)}` : ""}
                </span>
              </li>
            );
          })}
          {absent.length > 6 && <li className="faint">… et {absent.length - 6} autres</li>}
        </ul>
      )}
    </Panel>
  );
}

/** Dressing room (M6a): average morale and the players who are not happy. */
function DressingRoom({ w }: { w: World }) {
  const squad = squadOf(w, myClubId(w)).filter((ps) => ps.human);
  if (!squad.length) return null;
  const avg = Math.round(squad.reduce((s, ps) => s + ps.human!.morale, 0) / squad.length);
  const unhappy = squad.filter((ps) => ps.human!.morale < 45).sort((a, b) => a.human!.morale - b.human!.morale);
  const promises = squad.filter((ps) => ps.human!.promises.some((p) => !p.outcome)).length;
  return (
    <Panel title="Vestiaire" actions={<a className="link" href={href("effectif")}>Moral des joueurs</a>}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>Moral du groupe</span>
        <MoraleBadge value={avg} />
      </div>
      {promises > 0 && <p className="faint" style={{ margin: "6px 0 0" }}>{promises} promesse{promises > 1 ? "s" : ""} de temps de jeu en cours.</p>}
      {unhappy.length > 0 ? (
        <ul className="list" style={{ marginTop: 8 }}>
          {unhappy.slice(0, 5).map((ps) => (
            <li key={ps.player.id} className="row">
              <MoraleBadge value={ps.human!.morale} compact />
              <PlayerLink w={w} id={ps.player.id} />
              <span className="faint" style={{ marginLeft: "auto" }}>{STATUS_FR[ps.human!.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint" style={{ marginBottom: 0 }}>Personne ne fait la tête.</p>
      )}
    </Panel>
  );
}

export function HomeScreen() {
  const w = useWorld();
  const club = myClub(w);
  const upcoming = myFixtures(w).filter((f) => !f.result).slice(0, 6);
  const league = myLeagueId(w);
  const unread = unreadCount(w);
  return (
    <>
      <PageHeader kicker={`Saison ${w.season}`} title="Accueil" />
      <div className="grid grid--main-side">
        <div className="stack">
          <NextMatch w={w} />
          <div className={myFixtures(w).some((f) => f.result) ? "grid grid--2" : "stack"}>
            <LastResult w={w} />
            <Panel title={competitionName(w, league)} flush actions={<a className="link" href={href("competitions", league)}>Classement complet</a>}>
              <LeagueTable w={w} comp={league} highlight={club.id} compact around={7} />
            </Panel>
          </div>
          <Panel title="Prochains matchs" actions={<a className="link" href={href("calendrier")}>Calendrier</a>}>
            {upcoming.map((f) => (
              <FixtureRow key={f.id} w={w} f={f} />
            ))}
          </Panel>
        </div>
        <div className="stack">
          <SquadStatus w={w} />
          <DressingRoom w={w} />
          <Panel title="Boîte de réception" actions={<a className="link" href={href("boite")}>{unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout voir"}</a>}>
            <NewsList items={inboxItems(w)} unreadFrom={manager(w).newsRead} limit={6} />
          </Panel>
        </div>
      </div>
    </>
  );
}
