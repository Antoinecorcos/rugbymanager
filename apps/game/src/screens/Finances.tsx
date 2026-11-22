/** Finances (GDD §6.5): accounts, salary cap, JIFF, budgets, ledger and requests to the president. */
import { useState } from "react";
import { EXPENSE_FR, jiffProjection, nextSeasonPayroll, payroll, REVENUE_FR, salaryCap, seasonForecast, type ExpenseKind, type RevenueKind } from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { dateShort, formatMoney } from "../game/format";
import { myClub } from "../game/selectors";
import { Button, Empty, KeyValues, PageHeader, Panel } from "../ui/components";
import { Gauge } from "../ui/human";

export function FinancesScreen() {
  const w = useWorld();
  const club = myClub(w);
  const f = club.finances;
  const [answer, setAnswer] = useState<string | null>(null);
  if (!f) return <Empty>Pas de comptes pour ce club.</Empty>;
  const pay = payroll(w, club.id);
  const next = nextSeasonPayroll(w, club.id);
  const cap = salaryCap(w, club.id);
  const forecast = seasonForecast(w) ?? 0;
  const jiff = jiffProjection(w);
  const totalIn = Object.values(f.revenue).reduce((a, b) => a + b, 0);
  const totalOut = Object.values(f.expense).reduce((a, b) => a + b, 0);
  const ask = async (kind: "wages" | "transfers") => setAnswer((await game.act({ type: "boardRequest", kind })).message ?? null);
  const capText = (v: number) => (Number.isFinite(cap) ? `${Math.round((v / cap) * 100)} % du salary cap (${formatMoney(cap)})` : "pas de salary cap dans ce championnat");

  return (
    <>
      <PageHeader kicker={club.name} title="Finances" />
      <div className="kpis">
        <div className="kpi">
          <div className="kpi__label">Trésorerie</div>
          <div className={`kpi__value ${f.balance < 0 ? "text-critical" : ""}`}>{formatMoney(f.balance)}</div>
          <div className="kpi__sub">Budget annuel {club.budgetEur ? formatMoney(club.budgetEur) : "estimé"}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Prévision de fin de saison</div>
          <div className={`kpi__value ${forecast < 0 ? "text-critical" : "text-good"}`}>{forecast >= 0 ? "+" : "−"}{formatMoney(Math.abs(forecast))}</div>
          <div className="kpi__sub">Résultat net attendu</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Masse salariale</div>
          <div className="kpi__value">{formatMoney(pay)}</div>
          <div className="kpi__sub">Budget accordé : {formatMoney(f.wageBudget)}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Budget de recrutement</div>
          <div className="kpi__value">{formatMoney(f.transferBudget)}</div>
          <div className="kpi__sub">Rachats, agents, indemnités</div>
        </div>
      </div>

      <div className="grid grid--main-side">
        <div className="stack">
          <Panel title="Saison en cours" subtitle="Recettes et dépenses depuis le 1er juillet">
            <div className="grid grid--2">
              <table className="table table--dense">
                <thead>
                  <tr>
                    <th>Recettes</th>
                    <th style={{ textAlign: "right" }}>{formatMoney(totalIn)}</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(REVENUE_FR) as RevenueKind[]).map((k) => (
                    <tr key={k}>
                      <td>{REVENUE_FR[k]}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatMoney(f.revenue[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="table table--dense">
                <thead>
                  <tr>
                    <th>Dépenses</th>
                    <th style={{ textAlign: "right" }}>{formatMoney(totalOut)}</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(EXPENSE_FR) as ExpenseKind[]).map((k) => (
                    <tr key={k}>
                      <td>{EXPENSE_FR[k]}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatMoney(f.expense[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint" style={{ marginBottom: 0 }}>
              Budget réel du club réparti en postes estimés. Le budget prévisionnel est à l'équilibre : affluences, primes de phases finales et recrutement font la différence.
            </p>
          </Panel>
          <Panel flush title="Dernières opérations">
            {f.ledger.length ? (
              <div className="table-wrap">
                <table className="table table--dense">
                  <tbody>
                    {[...f.ledger].reverse().slice(0, 30).map((l, i) => (
                      <tr key={i}>
                        <td className="faint" style={{ width: 90 }}>{dateShort(l.date)}</td>
                        <td>{l.label}</td>
                        <td className={`num ${l.amount < 0 ? "" : "text-good"}`} style={{ textAlign: "right" }}>
                          {l.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(l.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Aucune opération pour l'instant.</Empty>
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Salary cap">
            <div className="stack">
              {Number.isFinite(cap) && <Gauge value={(pay / cap) * 100} label="Cette saison" kind="plain" />}
              <KeyValues
                items={[
                  ["Cette saison", `${formatMoney(pay)} — ${capText(pay)}`],
                  ["Saison prochaine (contrats en cours, départs et arrivées actés)", `${formatMoney(next)} — ${capText(next)}`],
                ]}
              />
              <p className="faint" style={{ margin: 0 }}>Salaires estimés : les rémunérations réelles ne sont pas publiques.</p>
            </div>
          </Panel>
          {jiff && (
            <Panel title="Quota JIFF">
              <p style={{ marginTop: 0 }}>{jiff.text}</p>
              <p className="faint" style={{ marginBottom: 0 }}>Calculé sur vos feuilles de match de championnat ({w.jiffLog?.sheets ?? 0} jusqu'ici).</p>
            </Panel>
          )}
          <Panel title={`Demandes au président`}>
            <div className="stack">
              <div className="row row--wrap">
                <Button size="sm" variant="secondary" onClick={() => void ask("wages")}>
                  Augmenter le budget salarial
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void ask("transfers")}>
                  Augmenter le budget de recrutement
                </Button>
              </div>
              {answer && <div className="reply" role="status">{answer}</div>}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
