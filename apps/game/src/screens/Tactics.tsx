import { Copy, RotateCcw } from "lucide-react";
import { DEFAULT_TACTICS, TACTIC_LABEL_FR, type Tactics, type TacticalPlan } from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { href, useRoute } from "../game/router";
import { manager, myNextFixture, teamName, viewOf } from "../game/selectors";
import { Badge, Button, PageHeader, Panel, Segmented, Tabs } from "../ui/components";

type Key = keyof Tactics;

/** What each instruction does in the match engine (packages/engine/src/match/engine.ts). */
export const TACTIC_INFO: Record<Key, { title: string; group: string; effects: Record<string, string> }> = {
  attackShape: {
    title: "Animation offensive",
    group: "Attaque",
    effects: {
      tight: "68 % des courses au près : on use la défense par les avants, peu de risques mais peu de franchissements.",
      balanced: "56 % des courses au près, le reste au large.",
      wide: "56 % des courses au large : une passe de plus par action, franchissements plus fréquents sur les extérieurs, un peu plus d'en-avant.",
    },
  },
  kickingGame: {
    title: "Jeu au pied",
    group: "Attaque",
    effects: {
      possession: "On garde le ballon : 55 % de jeu au pied dans ses 22 mètres, presque jamais dans le camp adverse.",
      balanced: "76 % de jeu au pied dans ses 22 mètres, 30 % entre les 22 et la ligne médiane.",
      territory: "On occupe : 87 % de jeu au pied dans ses 22 mètres, 44 % jusqu'à la ligne médiane.",
      pressure: "Chandelles et box kicks : deux fois plus de ballons hauts à disputer pour récupérer le ballon.",
    },
  },
  tempo: {
    title: "Tempo",
    group: "Attaque",
    effects: {
      slow: "Rucks plus lents : la défense adverse se replace, on joue davantage au pied.",
      normal: "Rythme standard.",
      fast: "Rucks plus rapides : plus de ballons rapides qui désorganisent la défense et créent des brèches.",
    },
  },
  offloadRisk: {
    title: "Passes après contact",
    group: "Attaque",
    effects: {
      low: "Offload tenté 5 % du temps : on sécurise le ballon (conseillé sous la pluie).",
      normal: "Offload tenté 11 % du temps.",
      high: "Offload tenté 20 % du temps : plus de continuité, mais plus d'en-avant.",
    },
  },
  defenceSystem: {
    title: "Système défensif",
    group: "Défense",
    effects: {
      drift: "Défense glissée : 25 % de franchissements en moins au large et moins de hors-jeu, mais moins de plaquages offensifs.",
      balanced: "Compromis entre montée et glissement.",
      rush: "Montée rapide : plus de plaquages dominants et d'interceptions, mais 55 % de hors-jeu en plus et des brèches au large quand elle est battue.",
    },
  },
  breakdownContest: {
    title: "Contestation des rucks",
    group: "Défense",
    effects: {
      fillLine: "On remplit la ligne : peu de grattages, moins de pénalités, défense mieux organisée.",
      selective: "On conteste quand un gratteur est bien placé.",
      commit: "On conteste chaque ruck : 60 % de grattages en plus et des ballons adverses ralentis, mais plus de pénalités concédées.",
    },
  },
  lineoutDefence: {
    title: "Touche adverse",
    group: "Conquête",
    effects: {
      contest: "On saute pour contester leurs lancers.",
      sack: "On ne saute pas : la défense du maul est renforcée dès la réception.",
    },
  },
  lineoutAttack: {
    title: "Nos touches",
    group: "Conquête",
    effects: {
      offTheTop: "Ballon porté rapide : maul dans 8 % des touches, ballon vite donné aux trois-quarts.",
      balanced: "Maul dans 22 % des touches, beaucoup plus près de la ligne adverse.",
      maul: "Maul dans 40 % des touches, presque toujours dans les 22 adverses.",
    },
  },
  scrumIntent: {
    title: "Intention en mêlée",
    group: "Conquête",
    effects: {
      quickBall: "Ballon vite sorti : on limite les pénalités subies en mêlée.",
      balanced: "Mêlée standard.",
      penalty: "Pousser pour la pénalité : un peu plus de puissance et plus de pénalités obtenues, au prix d'un ballon lent.",
    },
  },
};

const GROUPS = ["Attaque", "Défense", "Conquête"];
const KEYS = Object.keys(TACTIC_INFO) as Key[];

export function TacticsScreen() {
  const w = useWorld();
  const m = manager(w);
  const next = myNextFixture(w);
  const editing = Number(useRoute().query.get("plan") ?? m.activePlan);
  const planIdx = Math.min(editing, m.plans.length - 1);
  const plan = m.plans[planIdx]!;
  const nextPlan = next ? m.plans[m.matchPlans[next.id] ?? m.activePlan] : undefined;

  const save = (plans: TacticalPlan[], activePlan = m.activePlan) => void game.updateManager({ plans, activePlan });
  const setTactic = <K extends Key>(k: K, v: Tactics[K]) => save(m.plans.map((p, i) => (i === planIdx ? { ...p, tactics: { ...p.tactics, [k]: v } } : p)));
  const rename = (name: string) => save(m.plans.map((p, i) => (i === planIdx ? { ...p, name } : p)));
  const select = (i: number) => {
    location.hash = `${href("tactique")}?plan=${i}`;
  };

  return (
    <>
      <PageHeader
        kicker="Plans de jeu"
        title="Tactique"
        actions={
          next && (
            <span className="muted">
              Prochain match contre <b>{teamName(w, viewOf(w, next).opponent)}</b> : <Badge tone="accent">{nextPlan?.name}</Badge>{" "}
              <a className="link" href={href("preparation")}>
                changer
              </a>
            </span>
          )
        }
      />
      <Tabs value={String(planIdx)} onChange={(v) => select(Number(v))} tabs={m.plans.map((p, i) => ({ value: String(i), label: <>{p.name}{i === m.activePlan && <Badge tone="accent">par défaut</Badge>}</> }))} />
      <Panel
        title="Réglages du plan"
        actions={
          <>
            <input className="input" aria-label="Nom du plan" value={plan.name} onChange={(e) => rename(e.target.value)} maxLength={40} style={{ width: 260 }} />
            {planIdx !== m.activePlan && (
              <Button size="sm" variant="primary" onClick={() => save(m.plans, planIdx)}>
                Plan par défaut
              </Button>
            )}
            <Button size="sm" icon={<Copy size={14} />} onClick={() => save(m.plans.map((p, i) => (i === (planIdx === 0 ? 1 : 0) ? { ...p, tactics: { ...plan.tactics } } : p)))} title="Copier ces réglages dans l'autre plan">
              Copier vers l'autre plan
            </Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => save(m.plans.map((p, i) => (i === planIdx ? { ...p, tactics: { ...DEFAULT_TACTICS } } : p)))}>
              Réinitialiser
            </Button>
          </>
        }
      >
        <div className="tactics">
          {GROUPS.map((g) => (
            <div key={g} className="tactics__group">
              <h3 className="attr-col__title">{g}</h3>
              {KEYS.filter((k) => TACTIC_INFO[k].group === g).map((k) => {
                const labels = TACTIC_LABEL_FR[k] as Record<string, string>;
                const value = plan.tactics[k] as string;
                return (
                  <div key={k} className="tactic">
                    <div className="tactic__head">
                      <b>{TACTIC_INFO[k].title}</b>
                      {value !== (DEFAULT_TACTICS[k] as string) && <Badge tone="accent">modifié</Badge>}
                    </div>
                    <Segmented size="sm" ariaLabel={TACTIC_INFO[k].title} value={value} onChange={(v) => setTactic(k, v as Tactics[typeof k])} options={Object.entries(labels).map(([v, label]) => ({ value: v, label, title: TACTIC_INFO[k].effects[v] }))} />
                    <p className="tactic__effect">{TACTIC_INFO[k].effects[value]}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
      <p className="faint">
        Les décisions sur pénalité (but, touche, mêlée, jouer vite) suivent pour l'instant la recommandation du staff ; vous les prendrez en direct avec le match 2D (M5).
      </p>
    </>
  );
}
