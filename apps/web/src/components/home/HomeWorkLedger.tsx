import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui";
import { HomeLedgerHeader } from "./HomeLedgerHeader";
import { HomeWorkRow } from "./HomeWorkRow";
import type { HomeWorkItem } from "./home-work-data";
import {
  buildLedgerEntries,
  countWorkFilters,
  HOME_WORK_FILTERS,
  matchesWorkFilter,
  type WorkFilter,
} from "./home-ledger";

export function HomeWorkLedger({ items }: { items: HomeWorkItem[] }) {
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const [descending, setDescending] = useState(true);
  const setActivePage = useUIStore((state) => state.setActivePage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => countWorkFilters(items), [items]);
  const filtered = useMemo(
    () =>
      [...items]
        .filter((item) => matchesWorkFilter(item.kind, filter))
        .sort((a, b) => {
          const difference = new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime();
          return descending ? difference : -difference;
        }),
    [descending, filter, items],
  );
  const entries = useMemo(() => buildLedgerEntries(filtered, expanded), [expanded, filtered]);
  const visibleItemCount = entries.filter((entry) => entry.type === "item").length;
  const hiddenCount = filtered.length - visibleItemCount;
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (entries[index]?.type === "header" ? 32 : 48),
    overscan: 6,
  });

  return (
    <section className="mx-auto mt-9 w-full max-w-[1020px]">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-[13px] font-semibold text-[var(--th-heading)]">Your work</h2>
        <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto">
          {HOME_WORK_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                filter === option.id
                  ? "border-transparent bg-white/10 text-[var(--th-heading)]"
                  : "border-[var(--th-edge)] text-[var(--th-muted)] hover:text-[var(--th-primary)]",
              )}
            >
              {option.label} {counts[option.id]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDescending((value) => !value)}
            className="flex items-center gap-1 text-[11px] text-[var(--th-muted)] hover:text-foreground"
          >
            Updated {descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="hidden text-[11px] text-[var(--th-muted)] hover:text-foreground sm:block"
          >
            Browse all →
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--th-edge)] bg-[var(--th-surface)]">
        {entries.length === 0 ? (
          <div className="flex h-28 items-center justify-center text-xs text-[var(--th-muted)]">
            No work matches this filter.
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="no-scrollbar overflow-y-auto"
            style={{ height: Math.min(virtualizer.getTotalSize(), expanded ? 480 : 420) }}
          >
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index];
                return (
                  <div
                    key={entry.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {entry.type === "header" ? (
                      <HomeLedgerHeader
                        bucket={entry.bucket}
                        count={entry.count}
                        onInbox={() => setActivePage("inbox")}
                      />
                    ) : (
                      <HomeWorkRow item={entry.item} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex h-9 w-full items-center justify-center gap-1 border-t border-[var(--th-edge)] text-[11.5px] text-[var(--th-muted)] hover:bg-white/[0.025] hover:text-foreground"
          >
            Show {hiddenCount} more
            <ChevronDown className="size-3" />
          </button>
        )}
      </div>
    </section>
  );
}
