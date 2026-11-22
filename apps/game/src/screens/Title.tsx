import { useEffect, useMemo, useState } from "react";
import { Flag, GraduationCap, Landmark, Play, Trash2 } from "lucide-react";
import type { CareerStart } from "@ovalie/engine";
import { game } from "../game/client";
import { clubAccent, dateMedium, ordinal, formatMoney, LEAGUE_LABEL, levelStars, nationName } from "../game/format";
import type { CatalogueClub, SaveInfo } from "../game/protocol";
import { navigate } from "../game/router";
import { Button, ClubCrest, Segmented, Stars } from "../ui/components";

const NATIONALITIES = ["FRA", "ENG", "IRL", "SCO", "WAL", "ITA", "NZL", "RSA", "AUS", "ARG", "FIJ", "GEO", "SAM", "TGA", "ESP", "POR", "ROU", "URU", "USA", "CAN", "JPN"];
const SEED_WORDS = ["brennus", "ovalie", "mêlée", "essai", "chandelle", "drop", "touche", "maul", "grattage", "cadrage", "relance", "bouclier"];

/** What the board expects, from the club's strength rank in its league (shown before choosing). */
export function expectation(c: CatalogueClub, rank: number): string {
  if (c.league === "TOP14") return rank <= 2 ? "Jouer le titre" : rank <= 6 ? "Phases finales" : rank <= 11 ? "Milieu de tableau" : "Maintien";
  if (c.league === "PROD2") return rank <= 2 ? "Montée en Top 14" : rank <= 6 ? "Phases finales" : rank <= 13 ? "Milieu de tableau" : "Maintien";
  return rank <= 2 ? "Montée en Pro D2" : rank <= 6 ? "Phases finales" : "Progresser";
}

export function TitleScreen() {
  const [clubs, setClubs] = useState<CatalogueClub[] | null>(null);
  const [save, setSave] = useState<SaveInfo | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("FRA");
  const [start, setStart] = useState<CareerStart>("bigClub");
  const [league, setLeague] = useState("TOP14");
  const [clubId, setClubId] = useState<string>();
  const [seed, setSeed] = useState(() => `${SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]}-${Math.floor(Math.random() * 1000)}`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    game.catalogue().then(setClubs, (e) => setError(String(e)));
    game.saveInfo().then(setSave, () => setSave(null));
  }, []);
  useEffect(() => setLeague(start === "bigClub" ? "TOP14" : "PROD2"), [start]);

  const ranked = useMemo(() => {
    const list = (clubs ?? []).filter((c) => c.league === league).sort((a, b) => b.strength - a.strength);
    return list.map((c, i) => ({ c, rank: i + 1 }));
  }, [clubs, league]);
  const chosen = clubs?.find((c) => c.id === clubId);
  const preview = clubAccent(chosen?.colors);

  const begin = async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      await game.newGame({ name: name.trim() || "Le manager", nationality, start }, clubId, seed.trim() || "ovalie");
      navigate("accueil");
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  };
  const resume = async () => {
    setLoading(true);
    await game.load().catch((e) => setError(String(e)));
    setLoading(false);
    navigate("accueil");
  };

  return (
    <div className="title" style={{ ["--accent" as string]: preview.accent, ["--accent-ink" as string]: preview.ink }}>
      <section className="title__hero">
        <div className="title__brand">
          <Flag size={30} color="var(--accent)" />
          <span>
            Ovalie <b>Manager</b>
          </span>
        </div>
        <p className="title__pitch">
          Top 14, Pro D2, Nationale et coupes d'Europe. Les vrais effectifs 2026-2027, le vrai calendrier, les doublons. La partie commence le <b>mercredi 1er juillet 2026</b>.
        </p>
        {save && (
          <div className="title__save">
            <div>
              <div className="faint">Partie en cours</div>
              <div className="title__save-club">{save.clubName}</div>
              <div className="muted">
                {save.managerName} · {dateMedium(save.date)}
              </div>
            </div>
            <div className="row">
              <Button variant="primary" size="lg" onClick={resume} disabled={loading} icon={<Play size={18} />}>
                Reprendre
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (confirm("Supprimer la partie sauvegardée ?")) {
                    await game.deleteSave();
                    setSave(null);
                  }
                }}
                icon={<Trash2 size={16} />}
                title="Supprimer la sauvegarde"
              >
                Supprimer
              </Button>
            </div>
          </div>
        )}
        <p className="faint title__note">Jeu non commercial. Données réelles collectées en novembre 2026, notes estimées par le pipeline de notation (voir la fiche de chaque joueur).</p>
      </section>

      <section className="title__form">
        <h1 className="page-head__title">Nouvelle carrière</h1>
        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="mgr-name">Nom du manager</label>
            <input id="mgr-name" className="input" value={name} placeholder="Votre nom" onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="mgr-nat">Nationalité</label>
            <select id="mgr-nat" className="select" value={nationality} onChange={(e) => setNationality(e.target.value)}>
              {NATIONALITIES.map((n) => (
                <option key={n} value={n}>
                  {nationName(n)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="title__starts" role="radiogroup" aria-label="Départ de carrière">
          <button type="button" role="radio" aria-checked={start === "noDiploma"} className={`start-card${start === "noDiploma" ? " is-on" : ""}`} onClick={() => setStart("noDiploma")}>
            <GraduationCap size={22} />
            <b>Sans diplôme</b>
            <span>Réputation minimale. Un club de Pro D2 ou de Nationale vous fait confiance.</span>
          </button>
          <button type="button" role="radio" aria-checked={start === "bigClub"} className={`start-card${start === "bigClub" ? " is-on" : ""}`} onClick={() => setStart("bigClub")}>
            <Landmark size={22} />
            <b>Gros club</b>
            <span>Un passé de coach reconnu. Choisissez librement un club du Top 14.</span>
          </button>
        </div>

        {start === "noDiploma" && (
          <Segmented
            value={league}
            onChange={setLeague}
            options={[
              { value: "PROD2", label: "Pro D2" },
              { value: "NATIONALE", label: "Nationale" },
            ]}
          />
        )}

        <div className="club-pick" role="listbox" aria-label="Clubs">
          {!clubs && <div className="empty">Chargement de la base…</div>}
          {ranked.map(({ c, rank }) => (
            <button key={c.id} type="button" role="option" aria-selected={clubId === c.id} className={`club-pick__item${clubId === c.id ? " is-on" : ""}`} onClick={() => setClubId(c.id)}>
              <ClubCrest colors={c.colors} label={c.shortName} size={30} />
              <span className="club-pick__name">
                <b>{c.name}</b>
                <span className="faint">
                  {c.stadium}
                  {c.previousRank ? ` · ${ordinal(c.previousRank.rank)} de ${LEAGUE_LABEL[c.previousRank.league]} en 2025-26` : ""}
                </span>
              </span>
              <span className="club-pick__meta">
                <Stars value={levelStars(c.strength)} size={12} />
                <span className="faint">{expectation(c, rank)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="title__foot">
          <div className="field" style={{ width: 200 }}>
            <label htmlFor="seed" title="La même graine rejoue exactement la même saison">
              Graine du monde
            </label>
            <input id="seed" className="input" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </div>
          <div className="spacer" />
          {chosen && (
            <div className="muted title__chosen">
              {chosen.name}
              {chosen.budgetEur ? ` · budget ${formatMoney(chosen.budgetEur)}` : ""} · {chosen.squadSize} joueurs
            </div>
          )}
          <Button variant="primary" size="lg" disabled={!clubId || loading} onClick={begin} icon={<Play size={18} />}>
            {loading ? "Création du monde…" : "Commencer la carrière"}
          </Button>
        </div>
        {error && <div className="notice notice--error">{error}</div>}
      </section>
    </div>
  );
}
