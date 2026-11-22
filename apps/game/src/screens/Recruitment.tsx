/** Recruitment (GDD §6.4): search and scouting, offers, agreed deals, the manager's contracts. */
import { useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import {
  ageOn,
  askingSalary,
  knowledgeOf,
  LEAGUE_APPEAL,
  naturalPosition,
  pendingDeal,
  perceivedLevel,
  playerLevel,
  POSITIONS,
  POSITION_LABEL_FR,
  seasonEndYear,
  STATUS_FR,
  type PlayerState,
  type World,
} from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { dateShort, fmt1, formatMoney, fullName, LEAGUE_LABEL, POSITION_ORDER, POSITION_SHORT_FR } from "../game/format";
import { href } from "../game/router";
import { myClubId, squadOf } from "../game/selectors";
import { Badge, Button, DataTable, Empty, PageHeader, Panel, Tabs, type Column } from "../ui/components";
import { DEAL_FR, OfferDialog } from "../ui/offer";
import { MoraleBadge } from "../ui/human";

type Tab = "search" | "scouting" | "deals" | "contracts";

export function RecruitmentScreen() {
  const w = useWorld();
  const [tab, setTab] = useState<Tab>("search");
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const scouting = Object.entries(w.scouting ?? {});
  const scout = async (id: string) => setMsg((await game.act({ type: "scout", playerId: id })).error ?? "Supervision lancée : rapport dans une à deux semaines.");
  const mine = myClubId(w);
  const deals = (w.transfers ?? []).filter((t) => t.to === mine || t.from === mine);

  return (
    <>
      <PageHeader kicker="Marché des transferts" title="Recrutement" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "search", label: "Recherche" },
          { value: "scouting", label: "Supervisions", count: scouting.filter(([, s]) => s.reportOn).length },
          { value: "deals", label: "Accords", count: deals.length },
          { value: "contracts", label: "Mes contrats" },
        ]}
      />
      {msg && <div className="banner" role="status">{msg}</div>}
      {tab === "search" && <SearchPanel w={w} onOffer={setOfferFor} onScout={scout} />}
      {tab === "scouting" && <ScoutingPanel w={w} onOffer={setOfferFor} />}
      {tab === "deals" && <DealsPanel w={w} />}
      {tab === "contracts" && <ContractsPanel w={w} onOffer={setOfferFor} />}
      {offerFor && <OfferDialog w={w} playerId={offerFor} onClose={() => setOfferFor(null)} />}
    </>
  );
}

/** Perceived level, as a value or a range when the player is not well known. */
export function LevelGuess({ w, id }: { w: World; id: string }) {
  const p = perceivedLevel(w, id);
  if (p.knowledge >= 0.99) return <b className="num">{fmt1(p.level)}</b>;
  return (
    <span className="num" title={`Estimation du staff (connaissance ${Math.round(p.knowledge * 100)} %)`}>
      {fmt1(p.low)}–{fmt1(p.high)}
    </span>
  );
}

function clubLabel(w: World, ps: PlayerState) {
  if (!ps.clubId) return <Badge>Libre</Badge>;
  const c = w.clubs[ps.clubId]!;
  return (
    <span>
      {c.name} <span className="faint">{LEAGUE_LABEL[c.league] ?? c.league}</span>
    </span>
  );
}

function SearchPanel({ w, onOffer, onScout }: { w: World; onOffer: (id: string) => void; onScout: (id: string) => void }) {
  const mine = myClubId(w);
  const end = seasonEndYear(w);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("");
  const [league, setLeague] = useState("");
  const [maxAge, setMaxAge] = useState(40);
  const [expiring, setExpiring] = useState(true);
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return Object.values(w.players)
      .filter((ps) => !ps.virtual && !ps.academy && ps.clubId !== mine)
      .filter((ps) => !pos || naturalPosition(ps.player) === pos)
      .filter((ps) => !league || (league === "FREE" ? !ps.clubId : ps.clubId && w.clubs[ps.clubId]?.league === league))
      .filter((ps) => ageOn(ps.player.birthDate, w.date) <= maxAge)
      .filter((ps) => !expiring || !ps.clubId || (ps.contract?.expires ?? end) <= end)
      .filter((ps) => !text || fullName(ps.player).toLowerCase().includes(text))
      .sort((a, b) => perceivedLevel(w, b.player.id).level - perceivedLevel(w, a.player.id).level)
      .slice(0, 80);
  }, [w, q, pos, league, maxAge, expiring]);

  const columns: Column<PlayerState>[] = [
    { key: "name", label: "Joueur", render: (ps) => <a className="link" href={href("joueur", ps.player.id)}><b>{fullName(ps.player)}</b></a>, sort: (ps) => ps.player.lastName },
    { key: "pos", label: "Poste", render: (ps) => POSITION_SHORT_FR[naturalPosition(ps.player)], sort: (ps) => POSITION_ORDER.indexOf(naturalPosition(ps.player)) },
    { key: "age", label: "Âge", render: (ps) => ageOn(ps.player.birthDate, w.date), sort: (ps) => ageOn(ps.player.birthDate, w.date), align: "right" },
    { key: "nat", label: "Nat.", render: (ps) => ps.player.nationality, sort: (ps) => ps.player.nationality },
    { key: "club", label: "Club", render: (ps) => clubLabel(w, ps), sort: (ps) => (ps.clubId ? (LEAGUE_APPEAL[w.clubs[ps.clubId]!.league] ?? 0) : -1) },
    { key: "level", label: "Niveau", title: "Estimation du staff : une fourchette tant que le joueur n'est pas supervisé", render: (ps) => <LevelGuess w={w} id={ps.player.id} />, sort: (ps) => perceivedLevel(w, ps.player.id).level, align: "right" },
    { key: "contract", label: "Contrat", render: (ps) => { const d = pendingDeal(w, ps.player.id); return d ? <Badge tone="warning">Engagé avec {w.clubs[d.to]?.shortName}</Badge> : ps.contract ? `${ps.contract.expires}` : "—"; }, sort: (ps) => ps.contract?.expires ?? 0 },
    { key: "ask", label: "Demande", title: "Salaire annuel demandé par l'agent pour venir chez vous", render: (ps) => formatMoney(askingSalary(w, ps, mine)), sort: (ps) => askingSalary(w, ps, mine), align: "right" },
    {
      key: "act",
      label: "",
      render: (ps) => (
        <span className="row" onClick={(e) => e.stopPropagation()}>
          {knowledgeOf(w, ps.player.id) < 0.99 && !w.scouting?.[ps.player.id]?.reportOn && (
            <Button size="sm" variant="ghost" onClick={() => onScout(ps.player.id)}>
              Superviser
            </Button>
          )}
          {w.scouting?.[ps.player.id]?.reportOn && <span className="faint">supervision…</span>}
          {!pendingDeal(w, ps.player.id) && (
            <Button size="sm" variant="secondary" onClick={() => onOffer(ps.player.id)}>
              Négocier
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <Panel flush title={`${rows.length} joueurs`} subtitle="Pré-contrats pour la saison prochaine, rachats de contrat, joker médical en cas de blessure longue">
      <div className="filters">
        <label className="field">
          <span className="field__label">Nom</span>
          <span className="row"><SearchIcon size={14} aria-hidden /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" /></span>
        </label>
        <label className="field">
          <span className="field__label">Poste</span>
          <select className="select" value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">Tous</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL_FR[p]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Championnat</span>
          <select className="select" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Tous</option>
            {["TOP14", "PROD2", "NATIONALE", "PREM", "URC"].map((l) => <option key={l} value={l}>{LEAGUE_LABEL[l] ?? l}</option>)}
            <option value="FREE">Joueurs libres</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Âge maximum</span>
          <input className="input" type="number" min={17} max={40} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} style={{ width: 90 }} />
        </label>
        <label className="check">
          <input type="checkbox" checked={expiring} onChange={(e) => setExpiring(e.target.checked)} />
          <span>Contrat qui se termine en juin</span>
        </label>
      </div>
      {rows.length ? <DataTable rows={rows} columns={columns} rowKey={(ps) => ps.player.id} defaultSort={{ key: "level", dir: -1 }} dense /> : <Empty>Aucun joueur ne correspond.</Empty>}
    </Panel>
  );
}

function ScoutingPanel({ w, onOffer }: { w: World; onOffer: (id: string) => void }) {
  const rows = Object.entries(w.scouting ?? {}).map(([id, s]) => ({ ps: w.players[id]!, s })).filter((r) => r.ps);
  if (!rows.length) return <Panel><Empty>Aucune supervision. Lancez-en depuis la recherche ou la fiche d'un joueur.</Empty></Panel>;
  return (
    <Panel flush title="Supervisions" subtitle="Un rapport complet révèle le niveau exact, les attributs et le potentiel">
      <DataTable
        rows={rows}
        rowKey={(r) => r.ps.player.id}
        defaultSort={{ key: "state", dir: 1 }}
        columns={[
          { key: "name", label: "Joueur", render: (r) => <a className="link" href={href("joueur", r.ps.player.id)}>{fullName(r.ps.player)}</a>, sort: (r) => r.ps.player.lastName },
          { key: "club", label: "Club", render: (r) => clubLabel(w, r.ps) },
          { key: "state", label: "État", render: (r) => (r.s.reportOn ? `Rapport le ${dateShort(r.s.reportOn)}` : "Rapport reçu"), sort: (r) => r.s.reportOn ?? "" },
          { key: "level", label: "Niveau", render: (r) => <LevelGuess w={w} id={r.ps.player.id} />, align: "right" },
          { key: "pot", label: "Potentiel", render: (r) => { const p = perceivedLevel(w, r.ps.player.id).potential; return p ? fmt1(p) : "?"; }, align: "right" },
          { key: "act", label: "", render: (r) => (!pendingDeal(w, r.ps.player.id) ? <Button size="sm" variant="secondary" onClick={() => onOffer(r.ps.player.id)}>Négocier</Button> : null) },
        ]}
      />
    </Panel>
  );
}

function DealsPanel({ w }: { w: World }) {
  const mine = myClubId(w);
  const deals = (w.transfers ?? []).filter((t) => t.to === mine || t.from === mine).sort((a, b) => b.agreedOn.localeCompare(a.agreedOn));
  const approaches = Object.entries(w.approaches ?? {}).filter(([id]) => w.players[id]?.clubId === mine && !pendingDeal(w, id));
  return (
    <div className="stack">
      {approaches.length > 0 && (
        <Panel title="Vos joueurs convoités" subtitle="Leur contrat se termine en juin : prolongez-les pour les garder">
          <ul className="list">
            {approaches.map(([id, a]) => (
              <li key={id} className="row" style={{ justifyContent: "space-between" }}>
                <a className="link" href={href("joueur", id)}>{fullName(w.players[id]!.player)}</a>
                <span className="faint">{w.clubs[a.club]?.name} · depuis le {dateShort(a.date)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel flush title="Accords">
        {deals.length ? (
          <DataTable
            rows={deals}
            rowKey={(t) => t.id}
            defaultSort={{ key: "date", dir: -1 }}
            columns={[
              { key: "date", label: "Date", render: (t) => dateShort(t.agreedOn), sort: (t) => t.agreedOn },
              { key: "name", label: "Joueur", render: (t) => <a className="link" href={href("joueur", t.playerId)}>{fullName(w.players[t.playerId]!.player)}</a> },
              { key: "dir", label: "Sens", render: (t) => (t.kind === "renewal" ? <Badge>Prolongation</Badge> : t.to === mine ? <Badge tone="good">Arrivée</Badge> : <Badge tone="warning">Départ vers {w.clubs[t.to]?.name}</Badge>) },
              { key: "kind", label: "Accord", render: (t) => <span className="muted">{DEAL_FR[t.kind]}</span> },
              { key: "sal", label: "Salaire", render: (t) => formatMoney(t.contract.salary), align: "right" },
              { key: "fee", label: "Indemnité", render: (t) => (t.fee ? formatMoney(t.fee) : "—"), align: "right" },
              { key: "until", label: "Jusqu'en", render: (t) => t.contract.expires, align: "right" },
            ]}
          />
        ) : (
          <Empty>Aucun accord pour l'instant.</Empty>
        )}
      </Panel>
    </div>
  );
}

function ContractsPanel({ w, onOffer }: { w: World; onOffer: (id: string) => void }) {
  const end = seasonEndYear(w);
  const rows = squadOf(w, myClubId(w));
  const columns: Column<PlayerState>[] = [
    { key: "name", label: "Joueur", render: (ps) => <a className="link" href={href("joueur", ps.player.id)}><b>{fullName(ps.player)}</b></a>, sort: (ps) => ps.player.lastName },
    { key: "pos", label: "Poste", render: (ps) => POSITION_SHORT_FR[naturalPosition(ps.player)], sort: (ps) => POSITION_ORDER.indexOf(naturalPosition(ps.player)) },
    { key: "age", label: "Âge", render: (ps) => ageOn(ps.player.birthDate, w.date), sort: (ps) => ageOn(ps.player.birthDate, w.date), align: "right" },
    { key: "level", label: "Niveau", render: (ps) => fmt1(playerLevel(ps.player)), sort: (ps) => playerLevel(ps.player), align: "right" },
    { key: "morale", label: "Moral", render: (ps) => (ps.human ? <MoraleBadge value={ps.human.morale} compact /> : null), sort: (ps) => ps.human?.morale ?? 0 },
    { key: "status", label: "Statut", render: (ps) => (ps.human ? STATUS_FR[ps.human.status] : ""), sort: (ps) => ps.human?.status ?? "" },
    { key: "salary", label: "Salaire", render: (ps) => <span title={ps.contract?.estimated ? "Estimé" : undefined}>{ps.contract ? formatMoney(ps.contract.salary) : "—"}{ps.contract?.estimated ? <span className="faint"> (est.)</span> : null}</span>, sort: (ps) => ps.contract?.salary ?? 0, align: "right" },
    {
      key: "end",
      label: "Fin de contrat",
      render: (ps) => {
        const d = pendingDeal(w, ps.player.id);
        if (d) return <Badge tone="critical">Part à {w.clubs[d.to]?.shortName}</Badge>;
        const e = ps.contract?.expires ?? end;
        return e <= end ? <Badge tone="warning">{ps.contract?.joker ? "Joker, fin de saison" : `Juin ${e}`}</Badge> : <span>Juin {e}</span>;
      },
      sort: (ps) => ps.contract?.expires ?? 0,
    },
    {
      key: "act",
      label: "",
      render: (ps) =>
        pendingDeal(w, ps.player.id) ? null : (
          <span onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant={(ps.contract?.expires ?? end) <= end ? "secondary" : "ghost"} onClick={() => onOffer(ps.player.id)}>
              Prolonger
            </Button>
          </span>
        ),
    },
  ];
  return (
    <Panel flush title="Contrats de l'effectif" subtitle="Les salaires des joueurs réels sont estimés ; les échéances sont réelles quand le club les publie">
      <DataTable rows={rows} columns={columns} rowKey={(ps) => ps.player.id} defaultSort={{ key: "end", dir: 1 }} dense />
    </Panel>
  );
}
