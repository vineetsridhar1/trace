import { useMemo } from "react";
import { Circle, Loader2 } from "lucide-react";
import { navigateToSessionGroup, useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";
import type { SessionGroupRow } from "./sessions-table-types";
import { collapsedByDefault, statusGroupOrder } from "./sessions-table-types";

export function CompactSessionsList({
  channelId,
  rows,
}: {
  channelId: string;
  rows: SessionGroupRow[];
}) {
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);

  const grouped = useMemo(() => {
    const groups: Record<string, SessionGroupRow[]> = {};
    for (const row of rows) {
      const status = row.status ?? "active";
      if (!groups[status]) groups[status] = [];
      groups[status].push(row);
    }
    return Object.entries(groups).sort(
      ([a], [b]) => (statusGroupOrder[a] ?? 99) - (statusGroupOrder[b] ?? 99),
    );
  }, [rows]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {grouped.map(([status, items]) => {
        const color = statusColor[status] ?? "text-muted-foreground";
        const label = statusLabel[status] ?? status;
        const hasReviewAndActive =
          status === "in_review" && items.some((item) => item.reviewAndActive);
        return (
          <div key={status}>
            <div className={`flex items-center gap-2 px-3 py-2 ${color}`}>
              {hasReviewAndActive ? (
                <Loader2 size={12} className="shrink-0 animate-spin" />
              ) : (
                <Circle size={8} className="shrink-0 fill-current" />
              )}
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">
                {items.length}
              </span>
            </div>
            {!collapsedByDefault.has(status) &&
              items.map((row) => {
                const rowColor = statusColor[row.status ?? "active"];
                const isActive = row.id === activeSessionGroupId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted ${isActive ? "bg-muted" : ""}`}
                    onClick={() => {
                      const latestSessionId = row.latestSession?.id ?? null;
                      navigateToSessionGroup(channelId, row.id, latestSessionId);
                    }}
                  >
                    {row.reviewAndActive ? (
                      <Loader2
                        size={10}
                        className={`shrink-0 animate-spin ${rowColor}`}
                      />
                    ) : (
                      <Circle
                        size={7}
                        className={`shrink-0 fill-current ${rowColor}`}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(
                        row._lastMessageAt ?? row.updatedAt ?? row.createdAt,
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
