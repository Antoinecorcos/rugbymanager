import { useMemo } from "react";
import {
  ATTRIBUTE_LABEL_FR,
  availability,
  MENTAL_ATTRIBUTES,
  naturalPosition,
  PHYSICAL_ATTRIBUTES,
  POSITION_LABEL_FR,
  SHIRT_POSITION,
  TECHNICAL_ATTRIBUTES,
  type AttributeKey,
  type Player,
  type PlayerState,
  type Position,
  type World,
} from "@ovalie/engine";
import { useWorld } from "../game/client";
import { ageIn, dateMedium, fmt1, fullName, nationName, playerStars, POSITION_SHORT_FR } from "../game/format";
import { href } from "../game/router";
import { competitionName, myClubId } from "../game/selectors";
import { AttrValue, Badge, ClubCrest, Empty, Freshness, KeyValues, PageHeader, Panel, Radar, Stars, StatusPill } from "../ui/components";
import { Pitch, PitchSlot } from "../ui/pitch";
import { clubTotals } from "./Squad";

/** Attribute families of the radar (GDD §8: "attributs sur un radar par famille"). */
const FAMILIES: { label: string; keys: AttributeKey[] }[] = [
  { label: "Jeu à la main", keys: ["passing", "handling", "offloading"] },
  { label: "Évitement", keys: ["footwork", "agility", "balance"] },
  { label: "Vitesse", keys: ["pace", "acceleration"] },
  { label: "Défense", keys: ["tackling", "positioning", "anticipation"] },
  { label: "Jeu au sol", keys: ["jackal", "rucking", "workRate"] },
  { label: "Conquête", keys: ["scrummaging", "lineoutJumping", "maul"] },
  { label: "Jeu au pied", keys: ["kicking", "tacticalKicking", "goalKicking"] },
  { label: "Physique", keys: ["strength", "stamina", "contactResilience"] },
  { label: "Mental", keys: ["decisions", "composure", "concentration"] },
];

/** Personality as the staff describes it (from hidden attributes, never shown as numbers). */
function personality(p: Player): string[] {
  const h = p.hidden;
  const out: string[] = [];
  if (h.professionalism >= 16) out.push("Très professionnel");
  else if (h.professionalism <= 6) out.push("Peu rigoureux");
  if (h.temperament <= 6) out.push("Tempérament volcanique");
  else if (h.temperament >= 16) out.push("Calme en toutes circonstances");
  if (h.bigMatches >= 16) out.push("Homme des grands rendez-vous");
  if (h.consistency >= 16) out.push("Très régulier");
  else if (h.consistency <= 6) out.push("Irrégulier");
  if (h.ambition >= 16) out.push("Ambitieux");
  if (h.loyalty >= 16) out.push("Attaché à son club");
  if (h.injuryProneness >= 15) out.push("Corps fragile");
  if (h.adaptability >= 16) out.push("S'adapte vite");
  return out.length ? out : ["Rien de particulier selon le staff"];
}

const RATING_PARTS: [string, string][] = [
  ["club", "Temps de jeu en club (3 saisons)"],
  ["international", "Sélections internationales"],
  ["age", "Âge (progression ou déclin)"],
  ["clubStrength", "Force du club"],
];

function RatingExplain({ ps }: { ps: PlayerState }) {
  const r = ps.profile?.rating;
  if (!r) return <Empty>Note sans détail (joueur généré).</Empty>;
  const sign = (v: number) => (v >= 0 ? "+" : "−") + fmt1(Math.abs(v));
  return (
    <>
      <KeyValues
        items={[
          ...RATING_PARTS.filter(([k]) => r[k] !== undefined).map(([k, label]) => [label, k === "club" ? fmt1(r[k]!) : sign(r[k]!)] as [string, string]),
          ["Estimation du pipeline", fmt1(r.estimate ?? r.level ?? 0)],
          ...(r.override !== undefined ? [["Ajustement manuel (joueur majeur)", fmt1(r.override)] as [string, string]] : []),
          ["Niveau retenu", <b key="l">{fmt1(r.level ?? 0)} / 20</b>],
        ]}
      />
      <p className="faint" style={{ marginBottom: 0 }}>
        Fiabilité de la note : <b>{Math.round((r.evidence ?? 0) * 100)} %</b> (part fondée sur des minutes réellement jouées). Voir docs/05-donnees-reelles.md.
      </p>
    </>
  );
}

function PositionsPitch({ p }: { p: Player }) {
  return (
    <Pitch height={300} className="pitch--mini">
      {Object.entries(SHIRT_POSITION).map(([shirt, pos]) => {
        const fam = p.positions[pos] ?? 1;
        const tier = fam >= 18 ? 4 : fam >= 14 ? 3 : fam >= 10 ? 2 : fam >= 6 ? 1 : 0;
        return (
          <PitchSlot key={shirt} shirt={Number(shirt)} title={`${POSITION_LABEL_FR[pos]} : ${fam}/20`}>
            <span className={`fam-dot fam-dot--${tier}`}>{POSITION_SHORT_FR[pos]}</span>
          </PitchSlot>
        );
      })}
    </Pitch>
  );
}

function averageMorph(w: World, pos: Position): { h: number; kg: number } {
  let h = 0;
  let kg = 0;
  let n = 0;
  for (const ps of Object.values(w.players)) {
    if (ps.virtual || naturalPosition(ps.player) !== pos) continue;
    h += ps.player.heightCm;
    kg += ps.player.weightKg;
    n++;
  }
  return { h: Math.round(h / Math.max(1, n)), kg: Math.round(kg / Math.max(1, n)) };
}

export function PlayerScreen({ playerId }: { playerId: string }) {
  const w = useWorld();
  const ps = w.players[playerId];
  const pos = ps ? naturalPosition(ps.player) : "FH";
  const avg = useMemo(() => averageMorph(w, pos), [w.date, pos]);
  if (!ps) return <Empty>Joueur introuvable.</Empty>;
  const p = ps.player;
  const club = ps.clubId ? w.clubs[ps.clubId] : undefined;
  const stars = playerStars(p);
  const av = availability(ps, w.date);
  const totals = clubTotals(w, ps);
  const est = new Set(ps.profile?.estimated ?? []);
  const radar = FAMILIES.map((f) => ({ label: f.label, value: f.keys.reduce((a, k) => a + p.attributes[k], 0) / f.keys.length }));
  const comps = Object.entries(ps.stats).sort((a, b) => b[1].minutes - a[1].minutes);

  const attrCol = (title: string, keys: readonly AttributeKey[]) => (
    <div className="attr-col">
      <h3 className="attr-col__title">{title}</h3>
      {keys.map((k) => (
        <div key={k} className="attr-row">
          <span>{ATTRIBUTE_LABEL_FR[k]}</span>
          <AttrValue value={p.attributes[k]} label={ATTRIBUTE_LABEL_FR[k]} />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        kicker={
          club ? (
            <a className="link row" href={href(club.id === myClubId(w) ? "effectif" : "club", ...(club.id === myClubId(w) ? [] : [club.id]))}>
              <ClubCrest colors={club.colors} label={club.shortName} size={16} /> {club.name}
            </a>
          ) : (
            "Sélection nationale"
          )
        }
        title={fullName(p)}
      >
        <div className="player-head">
          <Badge tone="accent">{POSITION_LABEL_FR[pos]}</Badge>
          <span>{ageIn(w, p)} ans</span>
          <span className="faint">né le {dateMedium(p.birthDate)}{est.has("birthDate") ? " (estimé)" : ""}</span>
          <span>{nationName(p.nationality)}{p.secondNationality ? ` / ${nationName(p.secondNationality)}` : ""}</span>
          <span>{ps.caps + totals.caps} sélection{ps.caps + totals.caps > 1 ? "s" : ""}</span>
          <Stars value={stars.current} potential={stars.potential} size={15} />
          <StatusPill status={av.status} label={av.label} />
          {ps.profile?.jiff && <Badge title={ps.profile.jiffEstimated ? "Statut estimé (formé au club, nationalité ou arrivée avant 20 ans)" : undefined}>JIFF{ps.profile.jiffEstimated ? " (est.)" : ""}</Badge>}
          {ps.profile?.generated && <Badge tone="warning" title="Effectif réel inconnu : joueur fictif de complément">Joueur généré</Badge>}
        </div>
      </PageHeader>

      <div className="grid player-grid">
        <Panel title="Attributs" subtitle="Notes de 1 à 20" className="player-grid__attrs">
          <div className="attr-cols">
            {attrCol("Technique", TECHNICAL_ATTRIBUTES)}
            {attrCol("Mental", MENTAL_ATTRIBUTES)}
            {attrCol("Physique", PHYSICAL_ATTRIBUTES)}
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Profil par famille">
            <div className="radar-wrap">
              <Radar axes={radar} size={250} />
              <ul className="radar-values">
                {radar.map((r) => (
                  <li key={r.label}>
                    <span>{r.label}</span>
                    <b className="num">{fmt1(r.value)}</b>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
          <Panel title="Postes" subtitle="Familiarité : plus c'est foncé, plus il est à l'aise">
            <PositionsPitch p={p} />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Santé et forme">
            <KeyValues
              items={[
                ["État", <StatusPill key="s" status={av.status} label={av.label} />],
                ["Détail", av.label],
                ...(av.until ? [["Retour prévu", dateMedium(av.until)] as [string, string]] : []),
                ["Fraîcheur", <Freshness key="f" value={ps.freshness} />],
                ["Titularisations de suite", String(ps.startStreak)],
              ]}
            />
          </Panel>
          <Panel title="Morphologie">
            <KeyValues
              items={[
                ["Taille", `${p.heightCm} cm${est.has("heightCm") ? " (estimée)" : ""} · moy. du poste ${avg.h} cm`],
                ["Poids", `${p.weightKg} kg${est.has("weightKg") ? " (estimé)" : ""} · moy. du poste ${avg.kg} kg`],
              ]}
            />
          </Panel>
          <Panel title="Personnalité" subtitle="D'après le staff">
            <div className="row row--wrap">
              {personality(p).map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Saison en cours" flush>
          {comps.length ? (
            <div className="table-wrap">
              <table className="table table--dense">
                <thead>
                  <tr>
                    <th>Compétition</th>
                    <th style={{ textAlign: "right" }}>Matchs</th>
                    <th style={{ textAlign: "right" }}>Titu.</th>
                    <th style={{ textAlign: "right" }}>Min.</th>
                    <th style={{ textAlign: "right" }}>Essais</th>
                    <th style={{ textAlign: "right" }}>Points</th>
                    <th style={{ textAlign: "right" }} title="Cartons jaunes / rouges">
                      Cartons
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map(([c, s]) => (
                    <tr key={c}>
                      <td>{competitionName(w, c)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{s.appearances}</td>
                      <td className="num" style={{ textAlign: "right" }}>{s.starts}</td>
                      <td className="num" style={{ textAlign: "right" }}>{s.minutes}</td>
                      <td className="num" style={{ textAlign: "right" }}>{s.tries}</td>
                      <td className="num" style={{ textAlign: "right" }}>{s.points}</td>
                      <td className="num" style={{ textAlign: "right" }}>{s.yellowCards} / {s.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Pas encore de match joué cette saison.</Empty>
          )}
        </Panel>

        <Panel title="Contrat et parcours">
          <KeyValues
            items={[
              ["Club", club?.name ?? "—"],
              ["Arrivée au club", ps.profile?.arrivalYear ? String(ps.profile.arrivalYear) : "inconnue"],
              ["Club précédent", ps.profile?.previousClub ?? (ps.profile?.homegrown ? "formé au club" : "inconnu")],
              ["Statut JIFF", ps.profile?.jiff === undefined ? "inconnu" : ps.profile.jiff ? `oui${ps.profile.jiffEstimated ? " (estimé)" : ""}` : "non"],
              ["Contrat et salaire", <span key="c" className="faint">estimés avec la gestion du club (M6)</span>],
            ]}
          />
        </Panel>

        <Panel title="D'où vient sa note ?" subtitle="Le niveau est expliqué composante par composante">
          <RatingExplain ps={ps} />
        </Panel>
      </div>
    </>
  );
}
