/** Design system components (docs/07-interface.md). Plain React + CSS classes from styles/ui.css. */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Ban, Bandage, BedDouble, CheckCircle2, ChevronDown, ChevronUp, Flag, Star, StarHalf } from "lucide-react";
import type { AvailabilityStatus } from "@ovalie/engine";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ layout

export function Panel(props: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean; subtitle?: ReactNode }) {
  return (
    <section className={cx("panel", props.flush && "panel--flush", props.className)}>
      {(props.title || props.actions) && (
        <header className="panel__head">
          <div>
            {props.title && <h2 className="panel__title">{props.title}</h2>}
            {props.subtitle && <div className="panel__subtitle">{props.subtitle}</div>}
          </div>
          {props.actions && <div className="panel__actions">{props.actions}</div>}
        </header>
      )}
      <div className="panel__body">{props.children}</div>
    </section>
  );
}

export function PageHeader(props: { title: ReactNode; kicker?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {props.kicker && <div className="page-head__kicker">{props.kicker}</div>}
        <h1 className="page-head__title">{props.title}</h1>
        {props.children}
      </div>
      {props.actions && <div className="page-head__actions">{props.actions}</div>}
    </header>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} className="kv__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ controls

export function Button(props: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; disabled?: boolean; icon?: ReactNode; title?: string; type?: "button" | "submit" }) {
  return (
    <button type={props.type ?? "button"} className={cx("btn", `btn--${props.variant ?? "secondary"}`, `btn--${props.size ?? "md"}`)} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.icon}
      <span>{props.children}</span>
    </button>
  );
}

export function Segmented<T extends string>(props: { value: T; options: readonly { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm" | "md"; ariaLabel?: string }) {
  return (
    <div className={cx("seg", props.size === "sm" && "seg--sm")} role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === props.value} className={cx("seg__opt", o.value === props.value && "is-on")} onClick={() => props.onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>(props: { value: T; tabs: readonly { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <nav className="tabs" role="tablist">
      {props.tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === props.value} className={cx("tabs__tab", t.value === props.value && "is-on")} onClick={() => props.onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="tabs__count">{t.count}</span>}
        </button>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ small data

export const Badge = ({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warning" | "critical" | "outline"; title?: string }) => (
  <span className={cx("badge", `badge--${tone}`)} title={title}>
    {children}
  </span>
);

const STATUS: Record<AvailabilityStatus, { icon: ReactNode; tone: string; short: string }> = {
  available: { icon: <CheckCircle2 size={13} />, tone: "good", short: "Dispo." },
  injured: { icon: <Bandage size={13} />, tone: "critical", short: "Blessé" },
  suspended: { icon: <Ban size={13} />, tone: "critical", short: "Suspendu" },
  duty: { icon: <Flag size={13} />, tone: "warning", short: "Sélection" },
  rest: { icon: <BedDouble size={13} />, tone: "neutral", short: "Repos" },
};

/** Availability with an icon and a label (never colour alone). */
export function StatusPill({ status, label, compact }: { status: AvailabilityStatus; label?: string; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={cx("status", `status--${s.tone}`)} title={label}>
      {s.icon}
      {!compact && <span>{s.short}</span>}
    </span>
  );
}

export function Stars({ value, potential, size = 13 }: { value: number; potential?: number; size?: number }) {
  const cells = [];
  for (let i = 1; i <= 5; i++) {
    const full = value >= i;
    const half = !full && value >= i - 0.5;
    const pot = potential !== undefined && !full && !half && potential >= i - 0.5;
    cells.push(
      <span key={i} className={cx("stars__cell", (full || half) && "is-on", pot && "is-pot")}>
        {half ? <StarHalf size={size} fill="currentColor" strokeWidth={1.5} /> : <Star size={size} fill={full ? "currentColor" : "none"} strokeWidth={1.5} />}
      </span>,
    );
  }
  return (
    <span className="stars" aria-label={`Niveau ${value} sur 5${potential !== undefined ? `, potentiel ${potential}` : ""}`} title={`Niveau ${String(value).replace(".", ",")}/5${potential !== undefined ? ` · potentiel ${String(potential).replace(".", ",")}/5` : ""}`}>
      {cells}
    </span>
  );
}

/** Attribute value 1–20: the number in ink, a magnitude bar behind it, bold from 16. */
export function AttrValue({ value, label }: { value: number; label?: string }) {
  return (
    <span className={cx("attr", value >= 16 && "attr--top", value <= 6 && "attr--low")} title={label ? `${label} : ${value}/20` : `${value}/20`}>
      <span className="attr__bar" style={{ width: `${(value / 20) * 100}%` }} />
      <span className="attr__num">{value}</span>
    </span>
  );
}

/** Freshness 0–100 as a thin gauge with its value; tired players get a warning icon. */
export function Freshness({ value }: { value: number }) {
  const v = Math.round(value);
  const tone = v < 55 ? "critical" : v < 75 ? "warning" : "good";
  return (
    <span className="fresh" title={`Fraîcheur ${v} %`}>
      <span className="fresh__track">
        <span className={cx("fresh__fill", `fresh__fill--${tone}`)} style={{ width: `${v}%` }} />
      </span>
      <span className="fresh__num">{v}</span>
      {v < 55 && <AlertTriangle size={12} className="fresh__warn" aria-label="fatigué" />}
    </span>
  );
}

export function ClubCrest({ colors, label, size = 32 }: { colors?: readonly [string, string]; label: string; size?: number }) {
  const [a, b] = colors ?? ["#3a4350", "#aeb6c2"];
  const id = useMemo(() => `crest-${Math.random().toString(36).slice(2)}`, []);
  return (
    <svg className="crest" width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d="M20 1 L38 7 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V7 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="46" fill={a} />
        <path d="M0 0 H20 V46 H0 Z" fill={b} opacity="0.92" />
      </g>
      <path d="M20 1 L38 7 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V7 Z" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="1.5" />
      <text x="20" y="27" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize={label.length > 3 ? 12 : 14} fill="#fff" stroke="rgb(0 0 0 / 0.55)" strokeWidth="2.4" paintOrder="stroke">
        {label}
      </text>
    </svg>
  );
}

/** Result letter: V / N / D with text, colour as a second cue. */
export const ResultChip = ({ outcome, title }: { outcome: "V" | "N" | "D"; title?: string }) => (
  <span className={cx("result", outcome === "V" ? "result--win" : outcome === "D" ? "result--loss" : "result--draw")} title={title}>
    {outcome}
  </span>
);

// ------------------------------------------------------------------ comparisons and charts

/**
 * Two-team comparison of one measure: our bar grows left, theirs right, both values printed
 * (direct labels: identity never relies on colour alone).
 */
export function CompareRow({ label, ours, theirs, format = (v) => String(v), max, higherIsBetter = true, title }: { label: ReactNode; ours: number; theirs: number; format?: (v: number) => string; max?: number; higherIsBetter?: boolean; title?: string }) {
  const m = max ?? Math.max(ours, theirs, 1e-9);
  const better = ours === theirs ? 0 : (ours > theirs) === higherIsBetter ? 1 : -1;
  return (
    <div className="cmp" title={title}>
      <span className={cx("cmp__val", better > 0 && "is-best")}>{format(ours)}</span>
      <span className="cmp__track cmp__track--us">
        <span className="cmp__bar cmp__bar--us" style={{ width: `${Math.min(100, (ours / m) * 100)}%` }} />
      </span>
      <span className="cmp__label">{label}</span>
      <span className="cmp__track">
        <span className="cmp__bar cmp__bar--them" style={{ width: `${Math.min(100, (theirs / m) * 100)}%` }} />
      </span>
      <span className={cx("cmp__val", "cmp__val--them", better < 0 && "is-best")}>{format(theirs)}</span>
    </div>
  );
}

export function CompareLegend({ ours, theirs }: { ours: string; theirs: string }) {
  return (
    <div className="cmp-legend">
      <span>
        <i className="swatch swatch--us" /> {ours}
      </span>
      <span>
        {theirs} <i className="swatch swatch--them" />
      </span>
    </div>
  );
}

/** Horizontal room for the side labels of the radar. */
const RADAR_PAD = 56;

/** Radar of attribute families (values 1–20). The values are also listed beside it. */
export function Radar({ axes, size = 240 }: { axes: { label: string; value: number }[]; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const c = size / 2;
  const r = size / 2 - 36;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * r * (v / 20), c + Math.sin(a) * r * (v / 20)] as const;
  };
  const poly = axes.map((ax, i) => pt(i, ax.value).join(",")).join(" ");
  return (
    <svg className="radar" width={size + 2 * RADAR_PAD} height={size} viewBox={`${-RADAR_PAD} 0 ${size + 2 * RADAR_PAD} ${size}`} role="img" aria-label={axes.map((a) => `${a.label} ${a.value.toFixed(1)}`).join(", ")}>
      {[5, 10, 15, 20].map((v) => (
        <polygon key={v} points={axes.map((_, i) => pt(i, v).join(",")).join(" ")} className="radar__grid" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 20);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} className="radar__axis" />;
      })}
      <polygon points={poly} className="radar__area" />
      {axes.map((ax, i) => {
        const [x, y] = pt(i, ax.value);
        const [lx, ly] = pt(i, 23);
        const anchor = lx < c - 6 ? "end" : lx > c + 6 ? "start" : "middle";
        return (
          <g key={ax.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x} cy={y} r={12} fill="transparent" />
            <circle cx={x} cy={y} r={hover === i ? 5 : 3.5} className="radar__dot" />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className={cx("radar__label", hover === i && "is-hover")}>
              {ax.label}
            </text>
            {hover === i && (
              <text x={x} y={y - 12} textAnchor="middle" className="radar__value">
                {ax.value.toFixed(1).replace(".", ",")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ table

export interface Column<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  /** Sort value; absent = not sortable. */
  sort?: (row: T) => number | string;
  align?: "left" | "right" | "center";
  width?: number | string;
  title?: string;
}

export function DataTable<T>(props: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; defaultSort?: { key: string; dir: 1 | -1 }; rowClass?: (r: T) => string | undefined; dense?: boolean }) {
  const [sort, setSort] = useState(props.defaultSort);
  const rows = useMemo(() => {
    const col = props.columns.find((c) => c.key === sort?.key);
    if (!col?.sort || !sort) return props.rows;
    const f = col.sort;
    return [...props.rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * sort.dir;
    });
  }, [props.rows, props.columns, sort]);
  return (
    <div className="table-wrap">
      <table className={cx("table", props.dense && "table--dense")}>
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width, textAlign: c.align ?? "left" }}
                className={cx(c.sort && "is-sortable", sort?.key === c.key && "is-sorted")}
                onClick={c.sort ? () => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((-s.dir) as 1 | -1) : props.rows[0] !== undefined && typeof c.sort!(props.rows[0]) === "number" ? -1 : 1 })) : undefined}
                title={c.title}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
              >
                {c.label}
                {sort?.key === c.key && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={props.rowKey(r)} className={cx(props.onRowClick && "is-clickable", props.rowClass?.(r))} onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}>
              {props.columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? "left" }}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
