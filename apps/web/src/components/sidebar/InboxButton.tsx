import { Inbox } from "lucide-react";
import { useAuthStore, useEntityIds } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import type { InboxItemStatus } from "@trace/gql";
import { cn } from "../../lib/utils";

export function InboxButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActivePage = useUIStore((s) => s.setActivePage);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const activeIds = useEntityIds(
    "inboxItems",
    (item) => item.userId === currentUserId && (item.status as InboxItemStatus) === "active",
  );
  const count = activeIds.length;

  return (
    <button
      type="button"
      onClick={() => setActivePage("inbox")}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium transition-colors",
        activePage === "inbox"
          ? "bg-white/[0.1] text-foreground shadow-sm shadow-black/20"
          : "text-foreground/80 hover:bg-white/[0.07] hover:text-foreground",
      )}
    >
      <Inbox size={16} className="text-muted-foreground" />
      <span>Inbox</span>
      {count > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
          {count}
        </span>
      )}
    </button>
  );
}
