import { useEffect, useState } from "react";
import { game, useWorld } from "../game/client";
import { inboxItems, manager } from "../game/selectors";
import { PageHeader, Panel, Segmented } from "../ui/components";
import { NewsList } from "../ui/widgets";

type Filter = "all" | "club" | "medical" | "international" | "competitions";

export function InboxScreen() {
  const w = useWorld();
  // Keep the unread highlight of this visit, then mark everything as read.
  const [unreadFrom] = useState(() => manager(w).newsRead);
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => {
    if (manager(w).newsRead < w.news.length) void game.updateManager({ newsRead: w.news.length });
  }, [w.news.length]);

  const items = inboxItems(w).filter(({ item }) => {
    if (filter === "all") return true;
    if (filter === "club") return item.topic === "club" || item.topic === "discipline";
    if (filter === "medical") return item.topic === "medical";
    if (filter === "international") return item.topic === "international";
    return !["club", "discipline", "medical", "international"].includes(item.topic);
  });
  return (
    <>
      <PageHeader kicker="Messages et actualités" title="Boîte de réception" />
      <Panel
        title={`${items.length} message${items.length > 1 ? "s" : ""}`}
        actions={
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tout" },
              { value: "club", label: "Club" },
              { value: "medical", label: "Médical" },
              { value: "international", label: "Sélections" },
              { value: "competitions", label: "Compétitions" },
            ]}
          />
        }
      >
        <NewsList items={items} unreadFrom={unreadFrom} />
      </Panel>
    </>
  );
}
