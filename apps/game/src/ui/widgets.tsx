/** Game-specific building blocks shared by several screens. */
import { leagueTable, type Fixture, type NewsItem, type TableRow, type World } from "@ovalie/engine";
import { AlertCircle, Bandage, Flag, Gavel, Megaphone, Trophy, Users } from "lucide-react";
import { dateShort, fullName, stageFr } from "../game/format";
import { href, navigate } from "../game/router";
import { competitionShort, myClubId, teamName, teamShort, viewOf, venueLetter } from "../game/selectors";
import { Badge, ClubCrest, ResultChip } from "./components";

export const PlayerLink = ({ w, id, short }: { w: World; id: string; short?: boolean }) => {
  const ps = w.players[id];
  if (!ps) return <span className="faint">—</span>;
  const n = short ? `${ps.player.firstName.charAt(0)}. ${ps.player.lastName}` : fullName(ps.player);
  if (ps.virtual) return <span>{n}</span>;
  return (
    <a className="link" href={href("joueur", id)} onClick={(e) => e.stopPropagation()}>
      {n}
    </a>
  );
};

export const ClubLink = ({ w, id, short, crest }: { w: World; id: string; short?: boolean; crest?: boolean }) => {
  const c = w.clubs[id];
  const label = short ? teamShort(w, id) : teamName(w, id);
  if (!c) return <span>{label}</span>;
  return (
    <a className="link club-link" href={href("club", id)} onClick={(e) => e.stopPropagation()}>
      {crest && <ClubCrest colors={c.colors} label={c.shortName} size={18} />}
      <span className={id === myClubId(w) ? "is-me-text" : undefined}>{label}</span>
    </a>
  );
};

export const CompBadge = ({ id }: { id: string }) => <Badge tone="outline">{competitionShort(id)}</Badge>;

/** One fixture of the manager's club: date, competition, venue, opponent, score. */
export function FixtureRow({ w, f, showDate = true }: { w: World; f: Fixture; showDate?: boolean }) {
  const v = viewOf(w, f);
  const report = !!w.reports?.[f.id];
  return (
    <div className={`fixture-row${report ? " is-clickable" : ""}`} onClick={report ? () => navigate("match", f.id) : undefined}>
      {showDate && <span className="fixture-row__date">{dateShort(f.date)}</span>}
      <CompBadge id={f.competitionId} />
      <span className="fixture-row__stage faint">{stageFr(f.stage)}</span>
      <span className="fixture-row__venue" title={v.fixture.neutral ? "Terrain neutre" : v.home ? "Domicile" : "Extérieur"}>
        {venueLetter(v)}
      </span>
      <span className="fixture-row__opp">
        <ClubLink w={w} id={v.opponent} crest />
      </span>
      <span className="fixture-row__score">
        {v.score ? (
          <>
            <ResultChip outcome={v.outcome!} />
            <b className="num">
              {v.score[0]}-{v.score[1]}
            </b>
          </>
        ) : (
          <span className="faint">à jouer</span>
        )}
      </span>
    </div>
  );
}

const NEWS_ICON: Record<string, JSX.Element> = {
  medical: <Bandage size={15} />,
  international: <Flag size={15} />,
  discipline: <Gavel size={15} />,
  club: <Megaphone size={15} />,
};

export function NewsList({ items, unreadFrom, limit }: { items: { item: NewsItem; index: number }[]; unreadFrom?: number; limit?: number }) {
  const list = [...items].reverse().slice(0, limit);
  if (!list.length) return <div className="empty">Aucune actualité pour l'instant.</div>;
  return (
    <ul className="list news">
      {list.map(({ item, index }) => (
        <li key={index} className={`news__item${unreadFrom !== undefined && index >= unreadFrom ? " is-unread" : ""}${item.importance === 3 ? " is-major" : ""}`}>
          <span className="news__icon">{NEWS_ICON[item.topic] ?? (item.importance === 3 ? <Trophy size={15} /> : item.topic.includes("cup") ? <Trophy size={15} /> : <AlertCircle size={15} />)}</span>
          <span className="news__text">{item.text}</span>
          <span className="news__date faint">{dateShort(item.date)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Table bands of a domestic league (qualification, access match, relegation). */
export function bandOf(comp: string, rank: number, size: number): string | undefined {
  if (comp === "top14" || comp === "prod2" || comp === "nationale") {
    if (rank <= 2) return "band-top";
    if (rank <= 6) return "band-play";
    if (comp === "nationale") return undefined;
    if (rank === size - 1) return "band-access";
    if (rank === size) return "band-down";
  }
  if (comp === "prem" && rank <= 4) return "band-top";
  if (comp === "urc" && rank <= 8) return "band-top";
  return undefined;
}

export function LeagueTable({ w, comp, rows, highlight, compact, around }: { w: World; comp: string; rows?: TableRow[]; highlight?: string; compact?: boolean; around?: number }) {
  const table = rows ?? leagueTable(w, comp);
  let shown = table.map((r, i) => ({ r, rank: i + 1 }));
  if (around !== undefined && highlight) {
    const i = table.findIndex((r) => r.team === highlight);
    const from = Math.max(0, Math.min(table.length - around, i - Math.floor(around / 2)));
    shown = shown.slice(from, from + around);
  }
  return (
    <div className="table-wrap">
      <table className="table table--dense">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Club</th>
            <th style={{ textAlign: "right" }} title="Joués">
              J
            </th>
            <th style={{ textAlign: "right" }} title="Gagnés">
              G
            </th>
            {!compact && (
              <th style={{ textAlign: "right" }} title="Nuls">
                N
              </th>
            )}
            <th style={{ textAlign: "right" }} title="Perdus">
              P
            </th>
            {!compact && (
              <th style={{ textAlign: "right" }} title="Points marqués et encaissés">
                Pour / contre
              </th>
            )}
            <th style={{ textAlign: "right" }} title="Différence de points">
              Diff
            </th>
            {!compact && (
              <th style={{ textAlign: "right" }} title="Bonus offensifs + défensifs">
                B
              </th>
            )}
            <th style={{ textAlign: "right" }} title="Points au classement">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ r, rank }) => (
            <tr key={r.team} className={[r.team === highlight ? "is-me" : "", bandOf(comp, rank, table.length) ?? ""].join(" ")}>
              <td className="num faint">{rank}</td>
              <td>
                <ClubLink w={w} id={r.team} crest />
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {r.played}
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {r.won}
              </td>
              {!compact && (
                <td className="num" style={{ textAlign: "right" }}>
                  {r.drawn}
                </td>
              )}
              <td className="num" style={{ textAlign: "right" }}>
                {r.lost}
              </td>
              {!compact && (
                <td className="num faint" style={{ textAlign: "right" }}>
                  {r.pointsFor} / {r.pointsAgainst}
                </td>
              )}
              <td className="num" style={{ textAlign: "right" }}>
                {r.pointsFor - r.pointsAgainst > 0 ? "+" : ""}
                {r.pointsFor - r.pointsAgainst}
              </td>
              {!compact && (
                <td className="num faint" style={{ textAlign: "right" }}>
                  {r.offensiveBonus + r.defensiveBonus}
                </td>
              )}
              <td className="num" style={{ textAlign: "right" }}>
                <b>{r.points}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

