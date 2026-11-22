/** Staff (GDD §6.3): who works with the manager and what each of them influences. */
import { useState } from "react";
import { STAFF_ATTRIBUTE_FR, STAFF_ROLE_FR, staffQuality, staffWage, type StaffAttributes, type StaffRole } from "@ovalie/engine";
import { game } from "../game/client";
import { formatMoney } from "../game/format";
import { Button } from "../ui/components";
import { useWorld } from "../game/client";
import { myClub } from "../game/selectors";
import { Badge, Empty, PageHeader, Panel } from "../ui/components";

const ROLE_EFFECT: Record<StaffRole, string> = {
  assistant: "Progression générale des joueurs.",
  forwards: "Automatismes de conquête (mêlée, touche, maul).",
  backs: "Automatismes offensifs et jeu au pied.",
  defence: "Automatismes défensifs.",
  fitness: "Condition physique en match.",
  physio: "Durée des absences sur blessure.",
  doctor: "Durée des absences sur blessure.",
  analyst: "Rapports sur l'adversaire.",
  youth: "Qualité des jeunes de la journée des espoirs.",
};

const KEY: Record<StaffRole, keyof StaffAttributes> = {
  assistant: "coaching",
  forwards: "coaching",
  backs: "coaching",
  defence: "coaching",
  fitness: "fitness",
  physio: "medical",
  doctor: "medical",
  analyst: "analysis",
  youth: "youth",
};

export function StaffScreen() {
  const w = useWorld();
  const club = myClub(w);
  const staff = club.staff ?? [];
  return (
    <>
      <PageHeader kicker={club.name} title="Staff" />
      <Panel
        flush
        title={`${staff.length + 1} membres`}
        subtitle="Les adjoints ne figurent pas dans la base réelle : ils sont fictifs, avec une qualité à la mesure du club."
      >
        {staff.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fonction</th>
                  <th>Nom</th>
                  <th style={{ textAlign: "right" }}>Âge</th>
                  <th>Point fort</th>
                  <th>Attributs</th>
                  <th>Influence</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Manager</td>
                  <td>
                    <b>{w.manager!.profile.name}</b>
                  </td>
                  <td />
                  <td colSpan={3} className="faint">
                    Vous.
                  </td>
                </tr>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td>{STAFF_ROLE_FR[s.role]}</td>
                    <td>
                      <b>{s.name}</b> {s.generated && <Badge title="Membre du staff fictif">fictif</Badge>}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {s.age}
                    </td>
                    <td>
                      {STAFF_ATTRIBUTE_FR[KEY[s.role]]} <b className="num">{s.attributes[KEY[s.role]]}</b>/20
                    </td>
                    <td>
                      <span className="staff-attrs">
                        {(Object.keys(STAFF_ATTRIBUTE_FR) as (keyof StaffAttributes)[]).map((k) => (
                          <span key={k}>
                            {STAFF_ATTRIBUTE_FR[k]} <b>{s.attributes[k]}</b>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="muted">{ROLE_EFFECT[s.role]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Pas de staff pour ce club.</Empty>
        )}
      </Panel>
      <StaffMarket />
    </>
  );
}

function StaffMarket() {
  const w = useWorld();
  const club = myClub(w);
  const [role, setRole] = useState<StaffRole>("forwards");
  const [msg, setMsg] = useState<string | null>(null);
  const current = club.staff?.find((s) => s.role === role);
  const candidates = (w.staffMarket ?? []).filter((s) => s.role === role).sort((a, b) => staffQuality(b) - staffQuality(a));
  const hire = async (id: string, name: string) => {
    if (!window.confirm(`Engager ${name} ? ${current ? `${current.name} quittera le club (indemnité : trois mois de salaire).` : ""}`)) return;
    const r = await game.act({ type: "hireStaff", staffId: id });
    setMsg(r.error ?? `${name} rejoint votre staff.`);
  };
  return (
    <Panel
      flush
      title="Recruter un membre du staff"
      subtitle={msg ?? `Titulaire actuel : ${current ? `${current.name} (${staffQuality(current)}/20, ${formatMoney(current.wage ?? 0)} par an)` : "aucun"}. L'indemnité de départ est prise sur le budget de recrutement.`}
      actions={
        <select className="select" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} aria-label="Fonction">
          {(Object.keys(STAFF_ROLE_FR) as StaffRole[]).map((r) => (
            <option key={r} value={r}>
              {STAFF_ROLE_FR[r]}
            </option>
          ))}
        </select>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th style={{ textAlign: "right" }}>Âge</th>
              <th>Point fort</th>
              <th style={{ textAlign: "right" }}>Salaire demandé</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b> <Badge title="Membre du staff fictif">fictif</Badge>
                </td>
                <td className="num" style={{ textAlign: "right" }}>{s.age}</td>
                <td>
                  {STAFF_ATTRIBUTE_FR[KEY[s.role]]} <b className="num">{staffQuality(s)}</b>/20
                </td>
                <td className="num" style={{ textAlign: "right" }}>{formatMoney(staffWage(s, club.league))}</td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => void hire(s.id, s.name)}>
                    Engager
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
