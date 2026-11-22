import { clubForm, leagueTable, playerLevel, type World } from "@ovalie/engine";
import { useWorld } from "../game/client";
import { fmt1, formatMoney, ordinal, LEAGUE_LABEL, levelStars, nationName } from "../game/format";
import { href } from "../game/router";
import { manager, myClubId, squadOf, teamName } from "../game/selectors";
import { Badge, ClubCrest, KeyValues, PageHeader, Panel, ResultChip, Stars } from "../ui/components";
import { ClubLink, FixtureRow, PlayerLink } from "../ui/widgets";

/** Indicative board objective from the club's strength rank in its league (the real board arrives with M6). */
function objective(w: World, clubId: string): string {
  const club = w.clubs[clubId]!;
  const strength = (id: string) => {
    const lv = squadOf(w, id).map((ps) => playerLevel(ps.player)).sort((a, b) => b - a).slice(0, 23);
    return lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length);
  };
  const rank = Object.values(w.clubs)
    .filter((c) => c.league === club.league)
    .map((c) => ({ id: c.id, s: strength(c.id) }))
    .sort((a, b) => b.s - a.s)
    .findIndex((x) => x.id === clubId) + 1;
  if (club.league === "TOP14") return rank <= 2 ? "Jouer le titre" : rank <= 6 ? "Se qualifier pour les phases finales" : rank <= 11 ? "Finir dans la première moitié" : "Assurer le maintien";
  if (club.league === "PROD2") return rank <= 2 ? "Monter en Top 14" : rank <= 6 ? "Se qualifier pour les phases finales" : "Assurer le maintien";
  return rank <= 2 ? "Monter en Pro D2" : rank <= 6 ? "Se qualifier pour les phases finales" : "Progresser au classement";
}

export function ClubScreen({ clubId }: { clubId?: string }) {
  const w = useWorld();
  const id = clubId && w.clubs[clubId] ? clubId : myClubId(w);
  const c = w.clubs[id]!;
  const mine = id === myClubId(w);
  const squad = squadOf(w, id);
  const best = [...squad].sort((a, b) => playerLevel(b.player) - playerLevel(a.player)).slice(0, 5);
  const lv = squad.map((ps) => playerLevel(ps.player)).sort((a, b) => b - a).slice(0, 23);
  const strength = lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length);
  const league = c.league.toLowerCase();
  const table = w.competitions[league] ? leagueTable(w, league) : [];
  const rank = table.findIndex((r) => r.team === id) + 1;
  const fixtures = w.fixtures.filter((f) => f.home === id || f.away === id);
  const internationals = squad.filter((ps) => ps.caps > 0).length;
  const foreign = squad.filter((ps) => ps.player.nationality !== c.country).length;
  return (
    <>
      <PageHeader kicker={LEAGUE_LABEL[c.league] ?? c.league} title={c.name} actions={<a className="btn btn--secondary btn--md" href={href("effectif", ...(mine ? [] : [id]))}>Voir l'effectif</a>}>
        <div className="row muted" style={{ marginTop: 4 }}>
          <ClubCrest colors={c.colors} label={c.shortName} size={22} />
          {c.city && <span>{c.city}</span>}
          {c.founded && <span>· fondé en {c.founded}</span>}
          {mine && <Badge tone="accent">Votre club</Badge>}
        </div>
      </PageHeader>
      <div className="grid grid--3">
        <Panel title="Le club">
          <KeyValues
            items={[
              ["Stade", c.stadium ?? "—"],
              ["Capacité", c.capacity ? `${c.capacity.toLocaleString("fr-FR")} places` : "—"],
              ["Président", c.president ?? "—"],
              ["Manager", c.headCoach ?? "—"],
              ["Budget", c.budgetEur ? formatMoney(c.budgetEur) : "non publié"],
              ["Saison 2025-26", c.previousRank ? `${ordinal(c.previousRank.rank)} de ${LEAGUE_LABEL[c.previousRank.league] ?? c.previousRank.league}` : "—"],
            ]}
          />
        </Panel>
        <Panel title="Effectif">
          <KeyValues
            items={[
              ["Joueurs", String(squad.length)],
              ["Niveau des 23 meilleurs", <span key="s" className="row"><Stars value={levelStars(strength)} /> {fmt1(strength)}</span>],
              ["Internationaux", String(internationals)],
              ["Joueurs étrangers", `${foreign} (${Math.round((100 * foreign) / Math.max(1, squad.length))} %)`],
            ]}
          />
          <h3 className="attr-col__title" style={{ marginTop: 14 }}>Meilleurs joueurs</h3>
          <ul className="list">
            {best.map((ps) => (
              <li key={ps.player.id} className="row">
                <PlayerLink w={w} id={ps.player.id} />
                <span className="faint">{nationName(ps.player.nationality)}</span>
                <span style={{ marginLeft: "auto" }}>
                  <Stars value={levelStars(playerLevel(ps.player))} size={11} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Saison en cours">
          <KeyValues
            items={[
              ["Classement", rank ? `${ordinal(rank)} de ${LEAGUE_LABEL[c.league]}` : "—"],
              ["Forme", <span key="f" className="row">{clubForm(w, id).map((l) => <ResultChip key={l.fixtureId} outcome={l.outcome} title={`${teamName(w, l.opponent)} ${l.for}-${l.against}`} />)}</span>],
              ...(mine ? [["Objectif (indicatif)", objective(w, id)] as [string, string]] : []),
            ]}
          />
          {mine && <p className="faint" style={{ marginBottom: 0 }}>Les attentes du président, la confiance et les finances arrivent avec la gestion du club (M6). Manager depuis le {manager(w).since.split("-").reverse().join("/")}.</p>}
        </Panel>
      </div>
      <Panel title="Matchs de la saison">
        {mine
          ? fixtures.map((f) => <FixtureRow key={f.id} w={w} f={f} />)
          : fixtures.map((f) => (
              <div key={f.id} className="other-result">
                <span className="faint other-result__date">{f.date.split("-").reverse().join("/")}</span>
                <ClubLink w={w} id={f.home} crest />
                <b className="num">{f.result ? `${f.result.score[0]}-${f.result.score[1]}` : "–"}</b>
                <ClubLink w={w} id={f.away} crest />
              </div>
            ))}
      </Panel>
    </>
  );
}
