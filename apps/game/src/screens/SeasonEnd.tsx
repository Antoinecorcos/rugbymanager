/** End of season (M6c): the president's verdict, honours, promotions, job offers and the move to next season. */
import { useState } from "react";
import { finalLeagueRank, formatEuros, leagueTable, playerLevel, seasonEndYear, seasonSummary, type JobOffer, type World } from "@ovalie/engine";
import { ArrowRight, Briefcase, LogIn, LogOut, Trophy } from "lucide-react";
import { game, useWorld } from "../game/client";
import { fullName, LEAGUE_LABEL, ordinal } from "../game/format";
import { href, navigate } from "../game/router";
import { myClub, myClubId, myLeagueId, teamName } from "../game/selectors";
import { Badge, Button, ClubCrest, Empty, KeyValues, PageHeader, Panel } from "../ui/components";
import { LeagueTable } from "../ui/widgets";
import { OfferDialog } from "../ui/offer";

const TIERS = ["NATIONALE2", "NATIONALE", "PROD2", "TOP14"];

export function SeasonEndScreen() {
  const w = useWorld();
  const s = seasonSummary(w);
  const me = myClubId(w);
  const league = myLeagueId(w);
  const over = w.date > w.calendar.end;
  const rank = (over ? finalLeagueRank(w, me) : undefined) ?? leagueTable(w, league).findIndex((r) => r.team === me) + 1;
  const myTitles = s.competitions.filter((c) => c.champion === me);
  const move = s.movements.find((m) => m.club === me);
  const record = w.history?.find((h) => h.season === w.season)?.manager;
  const next = `${seasonEndYear(w)}-${seasonEndYear(w) + 1}`;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const nextSeason = async () => {
    setBusy(true);
    const r = await game.act({ type: "nextSeason" });
    setBusy(false);
    if (r.error) setMsg(r.error);
    else navigate("boite");
  };

  return (
    <>
      <PageHeader
        kicker={`Saison ${w.season}`}
        title="Bilan de la saison"
        actions={
          over && (
            <Button variant="primary" size="lg" onClick={() => void nextSeason()} disabled={busy} icon={<ArrowRight size={18} />}>
              {busy ? "Préparation de la saison…" : `Passer à la saison ${next}`}
            </Button>
          )
        }
      >
        <p className="muted">
          {myClub(w).name} termine {ordinal(rank)}
          {over ? "" : " de la saison régulière (provisoire)"}.
          {myTitles.length ? ` Titre${myTitles.length > 1 ? "s" : ""} : ${myTitles.map((c) => c.name).join(", ")} !` : ""}
          {move ? ` ${TIERS.indexOf(move.to) > TIERS.indexOf(move.from) ? "Montée" : "Descente"} : ${LEAGUE_LABEL[move.from] ?? move.from} → ${LEAGUE_LABEL[move.to] ?? move.to} (${move.reason}).` : ""}
        </p>
        {msg && <p className="text-critical">{msg}</p>}
      </PageHeader>
      {over && (
        <div className="grid grid--main-side">
          <Panel title="Le président">
            {record?.verdict ? (
              <>
                <p>
                  <Badge tone={record.met ? "good" : "critical"}>{record.met ? "✓ Objectif atteint" : "✗ Objectif manqué"}</Badge> {record.verdict}
                </p>
                <KeyValues
                  items={[
                    ["Objectif", record.objective ?? "—"],
                    ["Classement retenu", record.rank ? ordinal(record.rank) : "—"],
                    ["Confiance du président", `${Math.round(record.confidence ?? 0)}/100`],
                    ["Votre réputation", `${Math.round(record.reputation ?? 0)}/100`],
                    ["JIFF par feuille", record.jiffAverage !== undefined ? `${String(record.jiffAverage).replace(".", ",")}${record.jiffPenalty ? ` · sanction : −${record.jiffPenalty} points la saison prochaine` : ""}` : "—"],
                  ]}
                />
              </>
            ) : (
              <Empty>Le président rendra son verdict à la fin de la saison.</Empty>
            )}
          </Panel>
          <JobOffers w={w} offers={w.manager!.offers ?? []} />
        </div>
      )}
      {over && <Summer w={w} />}
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
                  <b>{teamName(w, m.club)}</b> <span className="faint">{LEAGUE_LABEL[m.from] ?? m.from} → {LEAGUE_LABEL[m.to] ?? m.to} · {m.reason}</span>
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
    </>
  );
}

/** What happens on 1 July: agreed arrivals, departures, contracts ending. */
function Summer({ w }: { w: World }) {
  const me = myClubId(w);
  const end = seasonEndYear(w);
  const deals = (w.transfers ?? []).filter((t) => !t.done && t.kind !== "renewal");
  const arrivals = deals.filter((t) => t.to === me);
  const leaving = new Set(deals.filter((t) => t.from === me).map((t) => t.playerId));
  const expiring = (w.squads[me] ?? [])
    .map((id) => w.players[id]!)
    .filter((ps) => ps.contract && ps.contract.expires <= end && !leaving.has(ps.player.id))
    .sort((a, b) => playerLevel(b.player) - playerLevel(a.player));
  const [renew, setRenew] = useState<string | null>(null);
  const name = (id: string) => (w.players[id] ? fullName(w.players[id]!.player) : id);
  return (
    <Panel title="Au 1er juillet" subtitle="Les accords de la saison prennent effet ; les contrats non prolongés se terminent. Vous pouvez encore prolonger vos joueurs depuis l'écran Recrutement.">
      <div className="grid grid--3">
        <div>
          <h4 className="row">
            <LogIn size={15} /> Arrivées ({arrivals.length})
          </h4>
          {arrivals.length ? (
            <ul className="list">
              {arrivals.map((t) => (
                <li key={t.id}>
                  <a href={href("joueur", t.playerId)}>{name(t.playerId)}</a> <span className="faint">{t.from ? `de ${teamName(w, t.from)}` : "libre"} · {formatEuros(t.contract.salary)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Aucune arrivée prévue.</Empty>
          )}
        </div>
        <div>
          <h4 className="row">
            <LogOut size={15} /> Départs signés ({leaving.size})
          </h4>
          {leaving.size ? (
            <ul className="list">
              {deals
                .filter((t) => t.from === me)
                .map((t) => (
                  <li key={t.id}>
                    {name(t.playerId)} <span className="faint">→ {teamName(w, t.to)}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty>Aucun départ signé.</Empty>
          )}
        </div>
        <div>
          <h4 className="row">
            <LogOut size={15} /> Fins de contrat ({expiring.length})
          </h4>
          {expiring.length ? (
            <ul className="list">
              {expiring.map((ps) => (
                <li key={ps.player.id} className="row">
                  <span style={{ flex: 1 }}>
                    <a href={href("joueur", ps.player.id)}>{fullName(ps.player)}</a> <span className="faint">{ps.contract!.joker ? "joker" : "partira libre"}</span>
                  </span>
                  {!ps.contract!.joker && (
                    <Button size="sm" variant="ghost" onClick={() => setRenew(ps.player.id)}>
                      Prolonger
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Tous les contrats courent au-delà de juin.</Empty>
          )}
        </div>
      </div>
      {renew && <OfferDialog w={w} playerId={renew} onClose={() => setRenew(null)} />}
    </Panel>
  );
}

/** Offers from other clubs (end of season, or after a dismissal). */
export function JobOffers({ w, offers, title = "Offres d'emploi" }: { w: World; offers: JobOffer[]; title?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = async (o: JobOffer) => {
    const club = w.clubs[o.clubId]!;
    if (!window.confirm(`Accepter l'offre de ${club.name} ? Vous quitterez ${w.clubs[w.manager!.clubId]!.name}.`)) return;
    setBusy(true);
    const r = await game.act({ type: "acceptJob", clubId: o.clubId });
    setBusy(false);
    setMsg(r.error ?? r.message ?? null);
    if (!r.error) navigate("boite");
  };
  const valid = offers.filter((o) => o.until >= w.date);
  return (
    <Panel title={title} subtitle={msg ?? `Votre réputation : ${Math.round(w.manager!.reputation ?? 0)}/100. Les clubs vous contactent selon votre réputation et leur standing.`}>
      {valid.length ? (
        <ul className="list">
          {valid.map((o) => {
            const club = w.clubs[o.clubId]!;
            return (
              <li key={o.clubId} className="row">
                <ClubCrest colors={club.colors} label={club.shortName} size={28} />
                <div style={{ flex: 1 }}>
                  <b>{club.name}</b> <span className="faint">· {LEAGUE_LABEL[club.league] ?? club.league}</span>
                  <div className="faint">Objectif : {o.objective.toLowerCase()} · offre valable jusqu'au {o.until.split("-").reverse().join("/")}</div>
                </div>
                <Button size="sm" variant="secondary" disabled={busy} icon={<Briefcase size={14} />} onClick={() => void accept(o)}>
                  Accepter
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>Aucun club ne vous a contacté.</Empty>
      )}
    </Panel>
  );
}
