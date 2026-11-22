/** Half-pitch formation diagram: shirts 1–15 in a standard attacking shape (forwards at the top). */
import type { ReactNode } from "react";

/** Slot centres in percent of the pitch box (x across, y down). */
export const SLOT_XY: Record<number, [number, number]> = {
  1: [35, 8],
  2: [50, 8],
  3: [65, 8],
  4: [42, 20],
  5: [58, 20],
  6: [23, 26],
  7: [77, 26],
  8: [50, 33],
  9: [42, 46],
  10: [27, 56],
  12: [42, 64],
  13: [58, 71],
  11: [10, 79],
  14: [90, 79],
  15: [50, 91],
};

export function Pitch({ children, className, height = 520 }: { children: ReactNode; className?: string; height?: number }) {
  return (
    <div className={`pitch ${className ?? ""}`} style={{ height }}>
      <svg className="pitch__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <rect x="1" y="1" width="98" height="98" rx="1.5" />
        <line x1="1" y1="22" x2="99" y2="22" />
        <line x1="1" y1="52" x2="99" y2="52" strokeDasharray="1.5 1.5" />
        <line x1="1" y1="84" x2="99" y2="84" />
        <line x1="6" y1="1" x2="6" y2="99" strokeDasharray="0.8 2.2" />
        <line x1="94" y1="1" x2="94" y2="99" strokeDasharray="0.8 2.2" />
      </svg>
      {children}
    </div>
  );
}

export function PitchSlot({ shirt, children, className, onClick, onDrop, title }: { shirt: number; children: ReactNode; className?: string; onClick?: () => void; onDrop?: (e: React.DragEvent) => void; title?: string }) {
  const [x, y] = SLOT_XY[shirt]!;
  return (
    <div
      className={`pitch__slot ${className ?? ""}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={onClick}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      title={title}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      {children}
    </div>
  );
}
