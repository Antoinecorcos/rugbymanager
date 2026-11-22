/** Staff (GDD §6.3): who works with the manager and what each of them influences. */
import { STAFF_ATTRIBUTE_FR, STAFF_ROLE_FR, type StaffAttributes, type StaffRole } from "@ovalie/engine";
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
        subtitle="Les adjoints ne figurent pas dans la base réelle : ils sont fictifs, avec une qualité à la mesure du club. Recrutement et départs du staff : M6b."
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
    </>
  );
}
