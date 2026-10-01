import { useMemo } from "react";
import type { ReviewThread } from "@trace/gql";
import { cn } from "../../../lib/utils";
import type { ReviewThreadFilter } from "../../../stores/review-ui";
import { ReviewOutboxThread } from "./ReviewOutboxThread";

const FILTERS: { id: ReviewThreadFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "private", label: "Private" },
  { id: "selected", label: "Selected" },
  { id: "delivered", label: "Delivered" },
];

function matchesFilter(thread: ReviewThread, filter: ReviewThreadFilter): boolean {
  if (filter === "private") return thread.deliveryStatus === "trace_only";
  if (filter === "selected") return thread.deliveryStatus === "selected";
  if (filter === "delivered") return thread.deliveryStatus === "delivered";
  return true;
}

export function ReviewThreadsTab({
  threads,
  filter,
  onFilter,
  onOpen,
}: {
  threads: ReviewThread[];
  filter: ReviewThreadFilter;
  onFilter(next: ReviewThreadFilter): void;
  onOpen(thread: ReviewThread): void;
}) {
  const counts = useMemo(
    () => ({
      all: threads.length,
      private: threads.filter((thread) => thread.deliveryStatus === "trace_only").length,
      selected: threads.filter((thread) => thread.deliveryStatus === "selected").length,
      delivered: threads.filter((thread) => thread.deliveryStatus === "delivered").length,
    }),
    [threads],
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, ReviewThread[]>();
    for (const thread of threads.filter((candidate) => matchesFilter(candidate, filter))) {
      const key = thread.anchor?.filePath ?? "General";
      groups.set(key, [...(groups.get(key) ?? []), thread]);
    }
    return [...groups.entries()];
  }, [filter, threads]);

  return (
    <>
      <div className="flex shrink-0 flex-wrap gap-1.5 px-3.5 pb-1 pt-3 text-[11.5px] font-medium">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilter(item.id)}
            aria-pressed={filter === item.id}
            className={cn(
              "rounded-xl px-2.5 py-1",
              filter === item.id
                ? "bg-[#262626] text-[#ededef]"
                : "border border-[#262626] text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.id !== "all" ? ` ${counts[item.id]}` : ""}
          </button>
        ))}
      </div>
      {grouped.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4 text-center">
          <span className="text-[13px] font-medium text-[#ededef]">No threads here</span>
          <span className="text-[11.5px] leading-[1.5] text-muted-foreground">
            Select lines in the diff and choose Comment. Nothing leaves Trace until you send it.
          </span>
        </div>
      ) : (
        <div className="native-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3.5 py-2.5">
          {grouped.map(([path, group]) => (
            <div key={path} className="flex flex-col gap-1.5">
              <span className="truncate px-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                {path}
              </span>
              {group.map((thread) => (
                <ReviewOutboxThread key={thread.id} thread={thread} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
