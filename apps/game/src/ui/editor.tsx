/** Editor dialogs (M8): correct a player or a club of the career. Changes go through the worker. */
import { useState } from "react";
import {
  ATTRIBUTE_LABEL_FR,
  HIDDEN_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  POSITION_LABEL_FR,
  POSITIONS,
  STATUS_FR,
  TECHNICAL_ATTRIBUTES,
  playerLevel,
  seasonEndYear,
  type AttributeKey,
  type ClubEdit,
  type HiddenAttribute,
  type PlayerEdit,
  type Position,
  type SquadStatus,
  type World,
} from "@ovalie/engine";
import { game } from "../game/client";
import { fullName, LEAGUE_LABEL } from "../game/format";
import { Button } from "./components";
import { Shell } from "./offer";

const HIDDEN_FR: Record<HiddenAttribute, string> = {
  adaptability: "Adaptabilité",
  ambition: "Ambition",
  bigMatches: "Grands matchs",
  consistency: "Régularité",
  injuryProneness: "Fragilité",
  loyalty: "Loyauté",
  professionalism: "Professionnalisme",
  temperament: "Tempérament",
};

const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

function Field({ label, children, id }: { label: string; children: React.ReactNode; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

type Msg = { tone: "good" | "critical"; text: string } | null;
interface FormProps {
  msg: Msg;
  setMsg: (m: Msg) => void;
  /** After a successful save: the form is rebuilt from the updated world. */
  saved: () => void;
}

/** Player editor. */
export function PlayerEditor(props: { w: World; playerId: string; onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  return <PlayerForm key={version} {...props} msg={msg} setMsg={setMsg} saved={() => setVersion((v) => v + 1)} />;
}

/** Club editor. */
export function ClubEditor(props: { w: World; clubId: string; onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  return <ClubForm key={version} {...props} msg={msg} setMsg={setMsg} saved={() => setVersion((v) => v + 1)} />;
}

function PlayerForm({ w, playerId, onClose, msg, setMsg, saved }: { w: World; playerId: string; onClose: () => void } & FormProps) {
  const ps = w.players[playerId]!;
  const p = ps.player;
  const [first, setFirst] = useState(p.firstName);
  const [last, setLast] = useState(p.lastName);
  const [nat, setNat] = useState(p.nationality);
  const [birth, setBirth] = useState(p.birthDate);
  const [height, setHeight] = useState(String(p.heightCm));
  const [weight, setWeight] = useState(String(p.weightKg));
  const [level, setLevel] = useState(playerLevel(p).toFixed(1));
  const [potential, setPotential] = useState(((p.potentialAbility ?? p.currentAbility ?? playerLevel(p) * 10) / 10).toFixed(1));
  const [attrs, setAttrs] = useState<Record<AttributeKey, number>>({ ...p.attributes });
  const [hidden, setHidden] = useState<Record<HiddenAttribute, number>>({ ...p.hidden });
  const [positions, setPositions] = useState<Partial<Record<Position, number>>>({ ...p.positions });
  const [caps, setCaps] = useState(String(ps.caps));
  const [jiff, setJiff] = useState(!!ps.profile?.jiff);
  const [club, setClub] = useState(ps.clubId ?? "");
  const [salary, setSalary] = useState(ps.contract ? String(Math.round(ps.contract.salary / 1000)) : "");
  const [expires, setExpires] = useState(ps.contract ? String(ps.contract.expires) : String(seasonEndYear(w) + 1));
  const [status, setStatus] = useState<SquadStatus | "">(ps.contract?.status ?? "");
  const mine = ps.clubId === w.manager?.clubId;

  const save = async () => {
    const edit: PlayerEdit = {};
    if (first !== p.firstName) edit.firstName = first;
    if (last !== p.lastName) edit.lastName = last;
    if (nat !== p.nationality) edit.nationality = nat.toUpperCase();
    if (birth !== p.birthDate) edit.birthDate = birth;
    if (num(height) !== p.heightCm) edit.heightCm = num(height)!;
    if (num(weight) !== p.weightKg) edit.weightKg = num(weight)!;
    const changedAttrs = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => v !== p.attributes[k as AttributeKey]));
    if (Object.keys(changedAttrs).length) edit.attributes = changedAttrs;
    const lv = num(level);
    if (lv !== undefined && Math.abs(lv - playerLevel(p)) >= 0.05 && !edit.attributes) edit.level = lv;
    const pot = num(potential);
    if (pot !== undefined && Math.abs(pot * 10 - (p.potentialAbility ?? 0)) >= 0.5) edit.potential = pot;
    const changedHidden = Object.fromEntries(Object.entries(hidden).filter(([k, v]) => v !== p.hidden[k as HiddenAttribute]));
    if (Object.keys(changedHidden).length) edit.hidden = changedHidden;
    const posEdit = Object.fromEntries(POSITIONS.filter((pos) => (positions[pos] ?? 0) !== (p.positions[pos] ?? 0)).map((pos) => [pos, positions[pos] ?? 0]));
    if (Object.keys(posEdit).length) edit.positions = posEdit;
    if (num(caps) !== ps.caps) edit.caps = num(caps) ?? 0;
    if (jiff !== !!ps.profile?.jiff) edit.jiff = jiff;
    if (club !== (ps.clubId ?? "")) edit.clubId = club || null;
    if (club) {
      const contract: NonNullable<PlayerEdit["contract"]> = {};
      if (salary && num(salary)! * 1000 !== ps.contract?.salary) contract.salary = num(salary)! * 1000;
      if (expires && num(expires) !== ps.contract?.expires) contract.expires = num(expires)!;
      if (status && status !== ps.contract?.status) contract.status = status;
      if (Object.keys(contract).length) edit.contract = contract;
    }
    if (!Object.keys(edit).length) return setMsg({ tone: "good", text: "Aucun changement." });
    const r = await game.act({ type: "editPlayer", playerId, edit });
    setMsg(r.error ? { tone: "critical", text: r.error } : { tone: "good", text: `${first} ${last} : modifications enregistrées.` });
    if (!r.error) saved();
  };

  const attrGrid = (title: string, keys: readonly AttributeKey[]) => (
    <fieldset className="editor__group">
      <legend>{title}</legend>
      {keys.map((k) => (
        <label key={k} className="editor__attr">
          <span>{ATTRIBUTE_LABEL_FR[k]}</span>
          <input className="input input--num" type="number" min={1} max={20} value={attrs[k]} onChange={(e) => setAttrs({ ...attrs, [k]: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
        </label>
      ))}
    </fieldset>
  );

  return (
    <Shell title={`Éditer : ${fullName(p)}`} onClose={onClose}>
      <div className="editor">
        <div className="grid grid--3">
          <Field label="Prénom" id="ed-first">
            <input id="ed-first" className="input" value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label="Nom" id="ed-last">
            <input id="ed-last" className="input" value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
          <Field label="Nationalité (code)" id="ed-nat">
            <input id="ed-nat" className="input" value={nat} maxLength={3} onChange={(e) => setNat(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Date de naissance" id="ed-birth">
            <input id="ed-birth" className="input" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </Field>
          <Field label="Taille (cm)" id="ed-h">
            <input id="ed-h" className="input" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
          <Field label="Poids (kg)" id="ed-w">
            <input id="ed-w" className="input" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Field label="Niveau (1 à 20)" id="ed-level">
            <input id="ed-level" className="input" type="number" step={0.1} min={1} max={20} value={level} onChange={(e) => setLevel(e.target.value)} />
          </Field>
          <Field label="Potentiel (1 à 20)" id="ed-pot">
            <input id="ed-pot" className="input" type="number" step={0.1} min={1} max={20} value={potential} onChange={(e) => setPotential(e.target.value)} />
          </Field>
          <Field label="Sélections" id="ed-caps">
            <input id="ed-caps" className="input" type="number" min={0} value={caps} onChange={(e) => setCaps(e.target.value)} />
          </Field>
        </div>
        <label className="row">
          <input type="checkbox" checked={jiff} onChange={(e) => setJiff(e.target.checked)} /> Joueur issu des filières de formation (JIFF)
        </label>
        <p className="faint">Changer le niveau décale tous les attributs d'autant. Pour un réglage fin, modifiez les attributs un par un (le niveau suit leur moyenne).</p>
        <div className="grid grid--3">
          {attrGrid("Technique", TECHNICAL_ATTRIBUTES)}
          {attrGrid("Mental", MENTAL_ATTRIBUTES)}
          {attrGrid("Physique", PHYSICAL_ATTRIBUTES)}
        </div>
        <div className="grid grid--2">
          <fieldset className="editor__group">
            <legend>Postes (familiarité, 0 = aucun)</legend>
            {POSITIONS.map((pos) => (
              <label key={pos} className="editor__attr">
                <span>{POSITION_LABEL_FR[pos]}</span>
                <input className="input input--num" type="number" min={0} max={20} value={positions[pos] ?? 0} onChange={(e) => setPositions({ ...positions, [pos]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />
              </label>
            ))}
          </fieldset>
          <fieldset className="editor__group">
            <legend>Personnalité (cachée en jeu)</legend>
            {HIDDEN_ATTRIBUTES.map((k) => (
              <label key={k} className="editor__attr">
                <span>{HIDDEN_FR[k] ?? k}</span>
                <input className="input input--num" type="number" min={1} max={20} value={hidden[k]} onChange={(e) => setHidden({ ...hidden, [k]: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
              </label>
            ))}
          </fieldset>
        </div>
        <fieldset className="editor__group">
          <legend>Club et contrat</legend>
          <div className="grid grid--2">
            <Field label="Club" id="ed-club">
              <select id="ed-club" className="select" value={club} onChange={(e) => setClub(e.target.value)}>
                <option value="">Sans club (joueur libre)</option>
                {Object.values(w.clubs)
                  .filter((c) => c.league !== "NATIONALE2")
                  .sort((a, b) => a.league.localeCompare(b.league) || a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({LEAGUE_LABEL[c.league] ?? c.league})
                    </option>
                  ))}
              </select>
            </Field>
            {club && (
              <>
                <Field label="Salaire annuel (k€)" id="ed-salary">
                  <input id="ed-salary" className="input" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} />
                </Field>
                <Field label="Fin de contrat (juin)" id="ed-exp">
                  <input id="ed-exp" className="input" type="number" min={seasonEndYear(w)} value={expires} onChange={(e) => setExpires(e.target.value)} />
                </Field>
                <Field label="Statut promis" id="ed-status">
                  <select id="ed-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as SquadStatus)}>
                    <option value="">—</option>
                    {(Object.keys(STATUS_FR) as SquadStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_FR[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
          {club !== (ps.clubId ?? "") && <p className="faint">Le transfert est immédiat ; un accord déjà signé pour la saison prochaine est annulé.</p>}
        </fieldset>
        {ps.injury && (
          <Button size="sm" variant="secondary" onClick={() => void game.act({ type: "editPlayer", playerId, edit: { heal: true } }).then((r) => setMsg(r.error ? { tone: "critical", text: r.error } : { tone: "good", text: "Blessure soignée." }))}>
            Soigner la blessure
          </Button>
        )}
        {mine && <p className="faint">Joueur de votre effectif : son moral et sa confiance ne se modifient pas ici, ils dépendent de vos décisions.</p>}
      </div>
      {msg && (
        <div className={`banner banner--${msg.tone}`} role="status">
          {msg.text}
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
        <Button variant="primary" onClick={() => void save()}>
          Enregistrer
        </Button>
      </div>
    </Shell>
  );
}

function ClubForm({ w, clubId, onClose, msg, setMsg, saved }: { w: World; clubId: string; onClose: () => void } & FormProps) {
  const c = w.clubs[clubId]!;
  const mine = clubId === w.manager?.clubId;
  const [name, setName] = useState(c.name);
  const [short, setShort] = useState(c.shortName);
  const [c1, setC1] = useState(c.colors?.[0] ?? "#333333");
  const [c2, setC2] = useState(c.colors?.[1] ?? "#ffffff");
  const [rep, setRep] = useState(String(c.reputation));
  const [budget, setBudget] = useState(c.budgetEur ? String(Math.round(c.budgetEur / 1e5) / 10) : "");
  const [capacity, setCapacity] = useState(String(c.capacity ?? ""));
  const [stadium, setStadium] = useState(c.stadium ?? "");
  const [president, setPresident] = useState(c.president ?? "");
  const f = c.finances;
  const [balance, setBalance] = useState(f ? String(Math.round(f.balance / 1000)) : "");
  const [wage, setWage] = useState(f ? String(Math.round(f.wageBudget / 1000)) : "");
  const [transfer, setTransfer] = useState(f ? String(Math.round(f.transferBudget / 1000)) : "");

  const save = async () => {
    const edit: ClubEdit = {};
    if (name !== c.name) edit.name = name;
    if (short !== c.shortName) edit.shortName = short;
    if (c1 !== c.colors?.[0] || c2 !== c.colors?.[1]) edit.colors = [c1, c2];
    if (num(rep) !== c.reputation) edit.reputation = num(rep)!;
    if (budget && Math.round(num(budget)! * 1e6) !== c.budgetEur) edit.budgetEur = Math.round(num(budget)! * 1e6);
    if (capacity && num(capacity) !== c.capacity) edit.capacity = num(capacity)!;
    if (stadium !== (c.stadium ?? "")) edit.stadium = stadium;
    if (president !== (c.president ?? "")) edit.president = president;
    if (f) {
      if (num(balance)! * 1000 !== Math.round(f.balance / 1000) * 1000) edit.balance = num(balance)! * 1000;
      if (num(wage)! * 1000 !== Math.round(f.wageBudget / 1000) * 1000) edit.wageBudget = num(wage)! * 1000;
      if (num(transfer)! * 1000 !== Math.round(f.transferBudget / 1000) * 1000) edit.transferBudget = num(transfer)! * 1000;
    }
    if (!Object.keys(edit).length) return setMsg({ tone: "good", text: "Aucun changement." });
    const r = await game.act({ type: "editClub", clubId, edit });
    setMsg(r.error ? { tone: "critical", text: r.error } : { tone: "good", text: `${name} : modifications enregistrées.` });
    if (!r.error) saved();
  };

  return (
    <Shell title={`Éditer : ${c.name}`} onClose={onClose}>
      <div className="editor">
        <div className="grid grid--2">
          <Field label="Nom" id="ec-name">
            <input id="ec-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Nom court" id="ec-short">
            <input id="ec-short" className="input" value={short} maxLength={14} onChange={(e) => setShort(e.target.value)} />
          </Field>
          <Field label="Couleur principale" id="ec-c1">
            <input id="ec-c1" className="input" type="color" value={c1} onChange={(e) => setC1(e.target.value)} />
          </Field>
          <Field label="Couleur secondaire" id="ec-c2">
            <input id="ec-c2" className="input" type="color" value={c2} onChange={(e) => setC2(e.target.value)} />
          </Field>
          <Field label="Réputation (1 à 200)" id="ec-rep">
            <input id="ec-rep" className="input" type="number" min={1} max={200} value={rep} onChange={(e) => setRep(e.target.value)} />
          </Field>
          <Field label="Budget (M€)" id="ec-budget">
            <input id="ec-budget" className="input" type="number" step={0.1} min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label="Stade" id="ec-stadium">
            <input id="ec-stadium" className="input" value={stadium} onChange={(e) => setStadium(e.target.value)} />
          </Field>
          <Field label="Capacité" id="ec-cap">
            <input id="ec-cap" className="input" type="number" min={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <Field label="Président" id="ec-pres">
            <input id="ec-pres" className="input" value={president} onChange={(e) => setPresident(e.target.value)} />
          </Field>
        </div>
        {mine && f && (
          <fieldset className="editor__group">
            <legend>Comptes de votre club (k€)</legend>
            <div className="grid grid--3">
              <Field label="Trésorerie" id="ec-bal">
                <input id="ec-bal" className="input" type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </Field>
              <Field label="Budget salarial" id="ec-wage">
                <input id="ec-wage" className="input" type="number" min={0} value={wage} onChange={(e) => setWage(e.target.value)} />
              </Field>
              <Field label="Budget de recrutement" id="ec-transfer">
                <input id="ec-transfer" className="input" type="number" min={0} value={transfer} onChange={(e) => setTransfer(e.target.value)} />
              </Field>
            </div>
          </fieldset>
        )}
      </div>
      {msg && (
        <div className={`banner banner--${msg.tone}`} role="status">
          {msg.text}
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
        <Button variant="primary" onClick={() => void save()}>
          Enregistrer
        </Button>
      </div>
    </Shell>
  );
}
