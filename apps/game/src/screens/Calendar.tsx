import { useState } from "react";
import { useWorld } from "../game/client";
import { monthLabel } from "../game/format";
import { competitionShort, myFixtures } from "../game/selectors";
import { PageHeader, Panel, Segmented } from "../ui/components";
import { FixtureRow } from "../ui/widgets";

export function CalendarScreen() {
  const w = useWorld();
  const all = myFixtures(w);
  const comps = [...new Set(all.map((f) => f.competitionId))];
  const [comp, setComp] = useState("all");
  const list = all.filter((f) => comp === "all" || f.competitionId === comp);
  const months = new Map<string, typeof list>();
  for (const f of list) {
    const k = f.date.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), f]);
  }
  const windows = w.calendar.windows.filter((win) => win.nations === "*" || win.nations.includes("FRA"));
  const played = all.filter((f) => f.result).length;
  return (
    <>
      <PageHeader
        kicker={`${played} match${played > 1 ? "s" : ""} joué${played > 1 ? "s" : ""} sur ${all.length} programmés`}
        title="Calendrier"
        actions={<Segmented size="sm" value={comp} onChange={setComp} options={[{ value: "all", label: "Toutes" }, ...comps.map((c) => ({ value: c, label: competitionShort(c) }))]} />}
      />
      <p className="faint" style={{ margin: 0 }}>
        Fenêtres internationales (absences des internationaux, « doublons ») : {windows.map((x) => x.name).join(" · ")}. Les phases finales s'ajoutent au calendrier au fil de la saison.
      </p>
      <div className="calendar">
        {[...months].map(([k, fs]) => {
          const win = windows.find((x) => x.start.slice(0, 7) <= k && x.end.slice(0, 7) >= k);
          return (
            <Panel key={k} title={monthLabel(`${k}-01`)} subtitle={win ? `Fenêtre internationale : ${win.name}` : undefined}>
              {fs.map((f) => (
                <FixtureRow key={f.id} w={w} f={f} />
              ))}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
