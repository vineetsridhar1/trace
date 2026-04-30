import { Inbox } from "lucide-react";
import { useEntityIds } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import type { InboxItemStatus } from "@trace/gql";
import { cn } from "../../lib/utils";

export function InboxButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActivePage = useUIStore((s) => s.setActivePage);

  const activeIds = useEntityIds(
    "inboxItems",
    (item) => (item.status as InboxItemStatus) === "active",
  );
  const count = activeIds.length;

  return (
    <button
      type="button"
      onClick={() => setActivePage("inbox")}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        activePage === "inbox"
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
      )}
    >
      <Inbox size={16} />
      <span>Inbox</span>
      {count > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
          {count}
        </span>
      )}
    </button>
  );
}
