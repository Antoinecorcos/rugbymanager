/** Negotiation with a player's agent (M6b): pre-contract, buyout, medical joker or renewal. */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  agentDemand,
  dealTerms,
  interestIn,
  payrollWith,
  salaryCap,
  STATUS_FR,
  type NegotiationResult,
  type SquadStatus,
  type TransferKind,
  type World,
} from "@ovalie/engine";
import { game } from "../game/client";
import { formatMoney, fullName } from "../game/format";
import { Badge, Button, KeyValues } from "./components";

export const DEAL_FR: Record<TransferKind, string> = {
  preContract: "Pré-contrat (arrivée le 1er juillet)",
  buyout: "Rachat de contrat (arrivée le 1er juillet)",
  medicalJoker: "Joker médical (arrivée immédiate, jusqu'à la fin de la saison)",
  worldCupJoker: "Joker Coupe du monde (arrivée immédiate, jusqu'à la fin du tournoi)",
  renewal: "Prolongation de contrat",
};

export function OfferDialog({ w, playerId, onClose }: { w: World; playerId: string; onClose: () => void }) {
  const ps = w.players[playerId]!;
  const m = w.manager!;
  const club = w.clubs[m.clubId]!;
  const terms = useMemo(() => dealTerms(w, playerId), [w, playerId]);
  const demand = useMemo(() => agentDemand(w, ps, m.clubId), [w, playerId]);
  const interest = useMemo(() => interestIn(w, ps, m.clubId), [w, playerId]);
  const neg = w.negotiations?.[playerId];
  const shown = neg?.demand ?? demand;
  const [salary, setSalary] = useState(Math.round(shown.salary / 1000));
  const [years, setYears] = useState(shown.years);
  const [status, setStatus] = useState<SquadStatus>(shown.status);
  const [result, setResult] = useState<NegotiationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if ("error" in terms)
    return (
      <Shell title={fullName(ps.player)} onClose={onClose}>
        <p>{terms.error}</p>
      </Shell>
    );

  const joker = terms.kind === "medicalJoker" || terms.kind === "worldCupJoker";
  const total = payrollWith(w, playerId, salary * 1000, terms.kind);
  const cap = salaryCap(w, m.clubId);
  const fin = club.finances;
  const agentFee = Math.round((salary * 1000 * 0.08) / 1000) * 1000;
  const submit = async () => {
    setBusy(true);
    const r = await game.act({ type: "offer", playerId, offer: { salary: salary * 1000, years: joker ? 1 : years, status } });
    setBusy(false);
    setError(r.error);
    setResult(r.negotiation ?? null);
    const d = r.negotiation?.demand;
    if (d && r.negotiation?.outcome !== "accepted") {
      setSalary(Math.round(d.salary / 1000));
      setYears(d.years);
      setStatus(d.status);
    }
  };
  const interestLabel = interest.score >= 0.7 ? "Très intéressé" : interest.score >= 0.45 ? "Intéressé" : interest.score >= 0.25 ? "Hésitant" : "Pas intéressé";

  return (
    <Shell title={`${terms.kind === "renewal" ? "Prolonger" : "Recruter"} ${fullName(ps.player)}`} onClose={onClose}>
      <div className="stack">
        <KeyValues
          items={[
            ["Type d'accord", DEAL_FR[terms.kind]],
            ...(terms.fee ? [["Indemnité au club", formatMoney(terms.fee)] as [string, string]] : []),
            ["Contrat actuel", ps.contract ? `${formatMoney(ps.contract.salary)} par an jusqu'en ${ps.contract.expires}${ps.contract.estimated ? " (estimé)" : ""}` : "sans club"],
            ["Disposition", <span key="i">
              <Badge tone={interest.score >= 0.45 ? "good" : interest.score >= 0.25 ? "warning" : "critical"}>{interestLabel}</Badge>
              {interest.reasons.length > 0 && <span className="faint"> — {interest.reasons.join(", ")}</span>}
            </span>],
            ["Exigences de l'agent", `${formatMoney(shown.salary)} par an, ${shown.years} an${shown.years > 1 ? "s" : ""}, statut « ${STATUS_FR[shown.status]} »`],
            ...(neg?.rounds ? [["Tours de négociation", `${neg.rounds} / 3`] as [string, string]] : []),
          ]}
        />
        <div className="offer-form">
          <label className="field">
            <span className="field__label">Salaire annuel (k€)</span>
            <input className="input" type="number" min={10} step={5} value={salary} onChange={(e) => setSalary(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="field">
            <span className="field__label">Durée</span>
            <select className="select" value={years} onChange={(e) => setYears(Number(e.target.value))}>
              {(joker ? [1] : [1, 2, 3, 4, 5]).map((y) => (
                <option key={y} value={y}>
                  {terms.kind === "medicalJoker" ? "Fin de saison" : terms.kind === "worldCupJoker" ? "Fin de la Coupe du monde" : `${y} an${y > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Statut promis</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as SquadStatus)}>
              {(Object.keys(STATUS_FR) as SquadStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_FR[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <KeyValues
          items={[
            [joker ? "Masse salariale cette saison" : "Masse salariale la saison prochaine", <span key="p" className={total > (fin?.wageBudget ?? Infinity) || total > cap ? "text-critical" : undefined}>{formatMoney(total)}</span>],
            ["Budget salarial / salary cap", `${fin ? formatMoney(fin.wageBudget) : "—"} / ${Number.isFinite(cap) ? formatMoney(cap) : "pas de plafond"}`],
            ["Indemnité et commission d'agent", `${formatMoney(terms.fee + agentFee)} (budget de recrutement : ${fin ? formatMoney(fin.transferBudget) : "—"})`],
          ]}
        />
        {error && <div className="banner banner--critical" role="alert">{error}</div>}
        {result && <div className={`banner ${result.outcome === "accepted" ? "banner--good" : "banner--warning"}`} role="status">{result.text}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            {result?.outcome === "accepted" ? "Fermer" : "Annuler"}
          </Button>
          {result?.outcome !== "accepted" && (
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              Faire l'offre
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
