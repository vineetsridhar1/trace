import { useMemo } from "react";
import { useEntityIds } from "../../stores/entity";
import type { InboxItemStatus } from "@trace/gql";
import { InboxItemRow } from "./InboxItemRow";
import { Inbox } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";

const MAX_RESOLVED = 20;

export function InboxView() {
  const activeIds = useEntityIds(
    "inboxItems",
    (item) => (item.status as InboxItemStatus) === "active",
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const allResolvedIds = useEntityIds(
    "inboxItems",
    (item) => (item.status as InboxItemStatus) !== "active",
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const resolvedIds = useMemo(() => allResolvedIds.slice(0, MAX_RESOLVED), [allResolvedIds]);

  const isEmpty = activeIds.length === 0 && resolvedIds.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <Inbox size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Inbox</h2>
        {activeIds.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
            {activeIds.length}
          </span>
        )}
        <ConnectionStatus />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Inbox size={40} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">All caught up</p>
          </div>
        ) : (
          <>
            {activeIds.map((id) => (
              <InboxItemRow key={id} id={id} />
            ))}

            {resolvedIds.length > 0 && (
              <>
                {activeIds.length > 0 && (
                  <div className="px-4 py-2">
                    <div className="border-t border-border" />
                  </div>
                )}
                <div className="px-4 pb-1 pt-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    Recent
                  </span>
                </div>
                {resolvedIds.map((id) => (
                  <InboxItemRow key={id} id={id} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
