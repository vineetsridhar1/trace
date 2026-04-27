import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntityIds } from "@trace/client-core";
import type { InboxItemStatus } from "@trace/gql";
import { InboxItemRow } from "./InboxItemRow";
import { Inbox } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";

const MAX_RESOLVED = 20;

/** Sentinel types for section dividers inside the virtual list */
type VirtualItem =
  | { kind: "active"; id: string }
  | { kind: "divider" }
  | { kind: "resolved-header" }
  | { kind: "resolved"; id: string };

export function InboxView() {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Build a flat virtual item list with dividers
  const items: VirtualItem[] = useMemo(() => {
    const result: VirtualItem[] = [];
    for (const id of activeIds) result.push({ kind: "active", id });
    if (resolvedIds.length > 0) {
      if (activeIds.length > 0) result.push({ kind: "divider" });
      result.push({ kind: "resolved-header" });
      for (const id of resolvedIds) result.push({ kind: "resolved", id });
    }
    return result;
  }, [activeIds, resolvedIds]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => {
      const item = items[index];
      if (item.kind === "divider") return 24;
      if (item.kind === "resolved-header") return 32;
      return 64;
    },
    overscan: 5,
    getItemKey: (index: number) => {
      const item = items[index];
      if (item.kind === "divider") return "__divider__";
      if (item.kind === "resolved-header") return "__resolved-header__";
      return item.id;
    },
    measureElement: (element: Element) => element.getBoundingClientRect().height,
  });

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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Inbox size={40} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">All caught up</p>
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer
              .getVirtualItems()
              .map((virtualRow: { key: React.Key; index: number; start: number }) => {
                const item = items[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {item.kind === "divider" ? (
                      <div className="px-4 py-2">
                        <div className="border-t border-border" />
                      </div>
                    ) : item.kind === "resolved-header" ? (
                      <div className="px-4 pb-1 pt-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                          Recent
                        </span>
                      </div>
                    ) : (
                      <InboxItemRow id={item.id} />
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
