/** Targeted instructions (GDD §5) and automatic penalty rules: shared by the preparation and the live match. */
import { DEFAULT_PENALTY_RULES, type PenaltyRule, type Player, type TargetedInstructions } from "@ovalie/engine";
import { shortName } from "../game/format";
import { Segmented } from "./components";

const attr = (p: Player, k: keyof Player["attributes"]) => p.attributes[k];

/** Opposing players with the attribute that matters for each instruction (weakest first). */
export function TargetsEditor(props: { opponents: { player: Player; shirt: number }[]; value: TargetedInstructions | undefined; onChange: (t: TargetedInstructions | undefined) => void }) {
  const t = props.value ?? {};
  const set = (patch: Partial<TargetedInstructions>) => {
    const next: TargetedInstructions = { ...t, ...patch };
    for (const k of Object.keys(next) as (keyof TargetedInstructions)[]) if (next[k] === undefined || next[k] === false) delete next[k];
    props.onChange(Object.keys(next).length ? next : undefined);
  };
  const byShirt = (shirts: number[]) => props.opponents.filter((o) => shirts.includes(o.shirt));
  const tacklers = [...props.opponents].filter((o) => o.shirt <= 15).sort((a, b) => attr(a.player, "tackling") - attr(b.player, "tackling"));
  const backThree = byShirt([11, 14, 15]).sort((a, b) => attr(a.player, "highBall") - attr(b.player, "highBall"));
  const prop = (shirt: number) => byShirt([shirt])[0]?.player;
  const lh = prop(1);
  const th = prop(3);

  return (
    <div className="stack instructions">
      <label className="field">
        <span className="field__label">Attaquer un défenseur</span>
        <select className="select" value={t.carryAt ?? ""} onChange={(e) => set({ carryAt: e.target.value || undefined })}>
          <option value="">— Aucun —</option>
          {tacklers.map((o) => (
            <option key={o.player.id} value={o.player.id}>
              {o.shirt}. {shortName(o.player)} — plaquage {attr(o.player, "tackling")}/20
            </option>
          ))}
        </select>
        <span className="field__help">Nos porteurs de balle le prennent pour cible : payant s'il plaque mal, coûteux s'il plaque bien.</span>
      </label>
      <label className="field">
        <span className="field__label">Jouer au pied sur</span>
        <select className="select" value={t.kickAt ?? ""} onChange={(e) => set({ kickAt: e.target.value || undefined })}>
          <option value="">— Personne en particulier —</option>
          {backThree.map((o) => (
            <option key={o.player.id} value={o.player.id}>
              {o.shirt}. {shortName(o.player)} — jeu aérien {attr(o.player, "highBall")}/20
            </option>
          ))}
        </select>
        <span className="field__help">Nos chandelles et nos longs coups de pied le visent : il doit réceptionner.</span>
      </label>
      <div className="field">
        <span className="field__label">Cibler en mêlée</span>
        <Segmented
          size="sm"
          ariaLabel="Pilier ciblé en mêlée"
          value={t.scrumAt ?? "none"}
          onChange={(v) => set({ scrumAt: v === "none" ? undefined : v })}
          options={[
            { value: "none", label: "Non" },
            { value: "LH", label: lh ? `Pilier gauche (${attr(lh, "scrummaging")})` : "Pilier gauche" },
            { value: "TH", label: th ? `Pilier droit (${attr(th, "scrummaging")})` : "Pilier droit" },
          ]}
        />
        <span className="field__help">Notre pilier face à lui pèse sur toute la mêlée : à choisir là où le duel nous est favorable.</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!t.lineoutPressure} onChange={(e) => set({ lineoutPressure: e.target.checked || undefined })} />
        <span>
          <b>Contester leurs touches au fond</b>
          <span className="field__help">Plus de ballons volés, mais leur maul est plus difficile à arrêter quand ils gagnent la touche.</span>
        </span>
      </label>
    </div>
  );
}

/** The manager's rules merged with the ready-made ones (same ids). */
export function rulesOf(rules: PenaltyRule[] | undefined): PenaltyRule[] {
  const mine = new Map((rules ?? []).map((r) => [r.id, r]));
  return DEFAULT_PENALTY_RULES.map((r) => ({ ...r, enabled: mine.get(r.id)?.enabled ?? false }));
}

export function PenaltyRulesEditor(props: { rules: PenaltyRule[] | undefined; onChange: (rules: PenaltyRule[]) => void }) {
  const rules = rulesOf(props.rules);
  return (
    <div className="stack">
      <p className="faint" style={{ margin: 0 }}>
        À chaque pénalité, le match s'arrête et vous avez 10 secondes pour choisir ; sans réponse, le conseil du staff s'applique. Les règles cochées décident à votre place, sans pause.
      </p>
      {rules.map((r) => (
        <label key={r.id} className="check">
          <input type="checkbox" checked={r.enabled} onChange={(e) => props.onChange(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))} />
          <span>{r.label}</span>
        </label>
      ))}
    </div>
  );
}
