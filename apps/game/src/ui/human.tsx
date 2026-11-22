/** Small widgets for the human side of the squad (M6a): morale, trust, risk, ability trend. */
import { Angry, ArrowDownRight, ArrowRight, ArrowUpRight, Frown, Laugh, Meh, ShieldAlert, ShieldCheck, Smile } from "lucide-react";
import { moraleLabel, RISK_FR, trustLabel, type RiskLevel } from "@ovalie/engine";

const tone = (v: number) => (v >= 65 ? "good" : v >= 45 ? "neutral" : v >= 30 ? "warning" : "critical");

/** Morale: always an icon and a label (design rule). */
export function MoraleBadge({ value, compact }: { value: number; compact?: boolean }) {
  const Icon = value >= 80 ? Laugh : value >= 65 ? Smile : value >= 45 ? Meh : value >= 30 ? Frown : Angry;
  return (
    <span className={`mood mood--${tone(value)}`} title={`Moral : ${moraleLabel(value)} (${value}/100)`}>
      <Icon size={15} aria-hidden />
      {!compact && <span>{moraleLabel(value)}</span>}
    </span>
  );
}

/** A 0–100 gauge with its label. */
export function Gauge({ value, label, kind = "morale" }: { value: number; label: string; kind?: "morale" | "trust" | "plain" }) {
  const text = kind === "trust" ? trustLabel(value) : kind === "morale" ? moraleLabel(value) : `${Math.round(value)}`;
  return (
    <div className="gauge" title={`${label} : ${text} (${Math.round(value)}/100)`}>
      <div className="gauge__head">
        <span>{label}</span>
        <b>{text}</b>
      </div>
      <div className={`meter meter--${tone(value) === "neutral" ? "warning" : tone(value) === "warning" ? "serious" : tone(value)}`}>
        <span style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function RiskBadge({ level, reasons }: { level: RiskLevel; reasons?: string[] }) {
  const Icon = level === "low" ? ShieldCheck : ShieldAlert;
  return (
    <span className={`mood mood--${level === "low" ? "good" : level === "moderate" ? "warning" : "critical"}`} title={reasons?.length ? reasons.join(", ") : undefined}>
      <Icon size={15} aria-hidden />
      <span>{RISK_FR[level]}</span>
    </span>
  );
}

/** Change of level over the last month (current ability points / 10). */
export function Trend({ delta }: { delta: number }) {
  if (delta === 0) return <span className="trend faint" title="Stable sur un mois"><ArrowRight size={14} aria-hidden /> stable</span>;
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`trend trend--${up ? "up" : "down"}`} title={`${up ? "Progression" : "Baisse"} sur un mois`}>
      <Icon size={14} aria-hidden /> {up ? "+" : "−"}
      {(Math.abs(delta) / 10).toFixed(1).replace(".", ",")}
    </span>
  );
}

/** Tiny line chart of the level month after month. */
export function Sparkline({ values, width = 220, height = 48 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="faint">Historique disponible après un mois.</span>;
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / (max - min)) * height}`).join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Évolution du niveau">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
