import { useMemo, useState } from "react";
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
  abilityTrend,
  daysBetween,
  EXPECTED_STARTS,
  formOf,
  injuryRisk,
  REACTION_FR,
  STATUS_FR,
  TALK_FR,
  TRAINING_FR,
  type SquadStatus,
  type TalkKind,
  type TalkResult,
} from "@ovalie/engine";
import { game } from "../game/client";
import { Gauge, MoraleBadge, RiskBadge, Sparkline, Trend } from "../ui/human";
import { OfferDialog } from "../ui/offer";
import { knowledgeOf, pendingDeal, perceivedLevel } from "@ovalie/engine";
import { formatMoney, levelStars } from "../game/format";

const hashUnit = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
import { Button } from "../ui/components";
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
  const [offer, setOffer] = useState(false);
  const [scoutMsg, setScoutMsg] = useState<string | null>(null);
  if (!ps) return <Empty>Joueur introuvable.</Empty>;
  const p = ps.player;
  const club = ps.clubId ? w.clubs[ps.clubId] : undefined;
  const knowledge = knowledgeOf(w, playerId);
  const unknown = knowledge < 0.99;
  const perceived = perceivedLevel(w, playerId);
  const real = playerStars(p);
  const stars = unknown ? { current: levelStars(perceived.level), potential: levelStars(perceived.level) } : real;
  /** Attribute as the staff sees it: exact when the player is known, an estimate otherwise. */
  const shown = (k: AttributeKey) => (unknown ? Math.max(1, Math.min(20, Math.round(p.attributes[k] + (hashUnit(`${w.seed}:${playerId}:${k}`) * 2 - 1) * (1 - knowledge) * 4))) : p.attributes[k]);

  const av = availability(ps, w.date);
  const totals = clubTotals(w, ps);
  const est = new Set(ps.profile?.estimated ?? []);
  const radar = FAMILIES.map((f) => ({ label: f.label, value: f.keys.reduce((a, k) => a + shown(k), 0) / f.keys.length }));
  const comps = Object.entries(ps.stats).sort((a, b) => b[1].minutes - a[1].minutes);

  const attrCol = (title: string, keys: readonly AttributeKey[]) => (
    <div className="attr-col">
      <h3 className="attr-col__title">{title}</h3>
      {keys.map((k) => (
        <div key={k} className="attr-row">
          <span>{ATTRIBUTE_LABEL_FR[k]}</span>
          <AttrValue value={shown(k)} label={ATTRIBUTE_LABEL_FR[k]} />
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
        <Panel
          title="Attributs"
          subtitle={unknown ? `Estimations du staff (connaissance ${Math.round(knowledge * 100)} %) : supervisez-le pour des notes exactes` : "Notes de 1 à 20"}
          className="player-grid__attrs"
          actions={
            unknown && !w.scouting?.[playerId]?.reportOn ? (
              <Button size="sm" variant="secondary" onClick={async () => setScoutMsg((await game.act({ type: "scout", playerId })).error ?? "Supervision lancée.")}>
                Superviser
              </Button>
            ) : w.scouting?.[playerId]?.reportOn ? (
              <span className="faint">Rapport attendu le {dateMedium(w.scouting[playerId]!.reportOn!)}</span>
            ) : undefined
          }
        >
          {scoutMsg && <p className="faint">{scoutMsg}</p>}
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

        <div className="player-grid__wide grid grid--3">
          {ps.human && ps.clubId === myClubId(w) && <RelationPanel w={w} ps={ps} />}
          {(ps.clubId === myClubId(w) || ps.academy) && <DevelopmentPanel w={w} ps={ps} />}
          <MedicalPanel w={w} ps={ps} />
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

        <Panel
          title="Contrat et parcours"
          actions={
            !ps.virtual && !ps.academy && !pendingDeal(w, playerId) ? (
              <Button size="sm" variant="secondary" onClick={() => setOffer(true)}>
                {ps.clubId === myClubId(w) ? "Prolonger" : "Négocier"}
              </Button>
            ) : undefined
          }
        >
          <KeyValues
            items={[
              ["Club", club?.name ?? "—"],
              ["Arrivée au club", ps.profile?.arrivalYear ? String(ps.profile.arrivalYear) : "inconnue"],
              ["Club précédent", ps.profile?.previousClub ?? (ps.profile?.homegrown ? "formé au club" : "inconnu")],
              ["Statut JIFF", ps.profile?.jiff === undefined ? "inconnu" : ps.profile.jiff ? `oui${ps.profile.jiffEstimated ? " (estimé)" : ""}` : "non"],
              ["Contrat", ps.contract ? `jusqu'en juin ${ps.contract.expires}${ps.contract.joker ? " (joker médical)" : ""}` : "sans club"],
              ["Salaire annuel", ps.contract ? `${formatMoney(ps.contract.salary)}${ps.contract.estimated ? " (estimé)" : ""}` : "—"],
              ...(pendingDeal(w, playerId) ? [["Saison prochaine", `engagé avec ${w.clubs[pendingDeal(w, playerId)!.to]?.name ?? "?"}`] as [string, string]] : []),
            ]}
          />
        </Panel>

        <Panel title="D'où vient sa note ?" subtitle="Le niveau est expliqué composante par composante">
          {unknown ? <Empty>Détail connu une fois le joueur supervisé.</Empty> : <RatingExplain ps={ps} />}
        </Panel>
        {offer && <OfferDialog w={w} playerId={playerId} onClose={() => setOffer(false)} />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ M6a panels */

function RelationPanel({ w, ps }: { w: World; ps: PlayerState }) {
  const h = ps.human!;
  const [reply, setReply] = useState<TalkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const talkedThisWeek = !!h.lastTalk && daysBetween(h.lastTalk, w.date) < 7;
  const pending = h.promises.find((p) => !p.outcome);
  const recent = h.recent.filter((r) => r.available).slice(-6);
  const starts = recent.filter((r) => r.started).length;

  const talk = async (kind: TalkKind) => {
    const r = await game.act({ type: "talk", playerId: ps.player.id, talk: kind });
    setError(r.error);
    setReply(r.talk ?? null);
  };
  const setStatus = async (status: SquadStatus) => {
    const r = await game.act({ type: "status", playerId: ps.player.id, status });
    setError(r.error);
  };

  return (
    <Panel title="Relation avec le manager" subtitle="Moral, confiance et temps de jeu attendu">
      <div className="stack">
        <Gauge value={h.morale} label="Moral" />
        <Gauge value={h.trust} label="Confiance en vous" kind="trust" />
        <KeyValues
          items={[
            [
              "Statut",
              <select key="s" className="select" value={h.status} onChange={(e) => void setStatus(e.target.value as SquadStatus)} aria-label="Statut dans l'effectif">
                {(Object.keys(STATUS_FR) as SquadStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_FR[st]} (titulaire {Math.round(EXPECTED_STARTS[st] * 100)} % du temps)
                  </option>
                ))}
              </select>,
            ],
            ["Temps de jeu récent", recent.length ? `${starts} titularisation${starts > 1 ? "s" : ""} sur ${recent.length} matchs où il était disponible` : "pas encore de match"],
            ["Forme (notes récentes)", recent.some((r) => r.rating !== undefined) ? fmt1(formOf(h)) : "—"],
            ...(pending ? [["Promesse en cours", `${pending.started}/${pending.starts} titularisations (sur ${pending.window} matchs)`] as [string, string]] : []),
          ]}
        />
        <div>
          <div className="field__label" style={{ marginBottom: 6 }}>
            Lui parler {talkedThisWeek && <span className="faint">— déjà fait cette semaine</span>}
          </div>
          <div className="talks">
            {(Object.keys(TALK_FR) as TalkKind[]).map((k) => (
              <Button key={k} size="sm" variant="secondary" disabled={talkedThisWeek || (k === "promise" && !!pending)} title={TALK_FR[k].help} onClick={() => void talk(k)}>
                {TALK_FR[k].label}
              </Button>
            ))}
          </div>
          {error && <p className="faint">{error}</p>}
          {reply && (
            <div className="reply" role="status">
              <div className="reply__who">
                {fullName(ps.player)} · <MoraleBadge value={h.morale} compact /> {REACTION_FR[reply.reaction]} ({reply.morale >= 0 ? "+" : ""}
                {reply.morale} moral, {reply.trust >= 0 ? "+" : ""}
                {reply.trust} confiance)
              </div>
              « {reply.reply} »
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DevelopmentPanel({ w, ps }: { w: World; ps: PlayerState }) {
  const history = (ps.dev?.history ?? []).map((h) => h.ca);
  if (ps.player.currentAbility) history.push(ps.player.currentAbility);
  const focus = ps.dev?.focus ?? "none";
  return (
    <Panel title="Progression" subtitle={ps.academy ? "Centre de formation" : `Entraînement individuel : ${TRAINING_FR.individual[focus]}${focus === "position" && ps.dev?.learning ? ` (${POSITION_LABEL_FR[ps.dev.learning]})` : ""}`}>
      <div className="stack">
        <Sparkline values={history.map((v) => v / 10)} />
        <KeyValues
          items={[
            ["Sur un mois", <Trend key="t" delta={abilityTrend(ps, w.date)} />],
            ["Niveau actuel", `${fmt1((ps.player.currentAbility ?? 0) / 10)} / 20`],
          ]}
        />
        {!ps.academy && (
          <a className="link" href={href("entrainement")}>
            Régler l'entraînement individuel
          </a>
        )}
      </div>
    </Panel>
  );
}

function MedicalPanel({ w, ps }: { w: World; ps: PlayerState }) {
  const history = ps.medical?.history ?? [];
  const risk = injuryRisk(ps, w.date);
  return (
    <Panel title="Dossier médical">
      <KeyValues
        items={[
          ["Risque de blessure", <RiskBadge key="r" level={risk.level} reasons={risk.reasons} />],
          ["Commotions (carrière)", String(ps.medical?.concussions ?? 0)],
          ...(ps.medical?.fragileUntil && ps.medical.fragileUntil > w.date ? [["Retour accéléré", `fragile jusqu'au ${dateMedium(ps.medical.fragileUntil)}`] as [string, string]] : []),
        ]}
      />
      {history.length ? (
        <ul className="list" style={{ marginTop: 8 }}>
          {[...history].reverse().slice(0, 6).map((h, i) => (
            <li key={i} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                {h.type}
                {h.training ? <span className="faint"> (entraînement)</span> : null}
              </span>
              <span className="faint">
                {dateMedium(h.from)} · {h.days} j
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint" style={{ marginBottom: 0 }}>
          Aucune blessure cette saison.
        </p>
      )}
    </Panel>
  );
}
