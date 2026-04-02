import { useMemo } from "react";
import { Circle } from "lucide-react";
import { navigateToSessionGroup, useUIStore, type UIState } from "../../stores/ui";
import { sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import { timeAgo, cn } from "../../lib/utils";
import type { SessionGroupRow } from "./sessions-table-types";
import { collapsedByDefault, sessionStatusGroupOrder } from "./sessions-table-types";

function CompactSessionRow({
  row,
  channelId,
  status,
}: {
  key?: string | number;
  row: SessionGroupRow;
  channelId: string;
  status: string;
}) {
  const isActive = useUIStore((s: UIState) => s.activeSessionGroupId === row.id);
  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionGroupDoneBadges[row.id]);
  const rowColor = sessionStatusColor[status] ?? "text-muted-foreground";

  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted ${isActive ? "bg-muted" : ""}`}
      onClick={() => {
        const latestSessionId = row.latestSession?.id ?? null;
        navigateToSessionGroup(channelId, row.id, latestSessionId);
      }}
    >
      <span className={cn("relative shrink-0 inline-flex items-center justify-center", rowColor)} style={{ width: 8, height: 8 }}>
        <AgentStatusIcon
          agentStatus={row.displayAgentStatus}
          size={8}
        />
        {hasDoneBadge && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
        )}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-sm text-foreground", hasDoneBadge && "font-semibold")}>
        {row.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {timeAgo(
          row._lastMessageAt ?? row.updatedAt ?? row.createdAt,
        )}
      </span>
    </button>
  );
}

export function CompactSessionsList({
  channelId,
  rows,
}: {
  channelId: string;
  rows: SessionGroupRow[];
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, SessionGroupRow[]> = {};
    for (const row of rows) {
      const status = row.displaySessionStatus ?? "in_progress";
      if (!groups[status]) groups[status] = [];
      groups[status].push(row);
    }
    return Object.entries(groups).sort(
      ([a], [b]) => (sessionStatusGroupOrder[a] ?? 99) - (sessionStatusGroupOrder[b] ?? 99),
    );
  }, [rows]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {grouped.map(([status, items]: [string, SessionGroupRow[]]) => {
        const color = sessionStatusColor[status] ?? "text-muted-foreground";
        const label = sessionStatusLabel[status] ?? status;
        return (
          <div key={status}>
            <div className={`flex items-center gap-2 px-3 py-2 ${color}`}>
              <Circle size={6} className="shrink-0 fill-current" />
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">
                {items.length}
              </span>
            </div>
            {!collapsedByDefault.has(status) &&
              items.map((row: SessionGroupRow) => (
                <CompactSessionRow
                  key={row.id}
                  row={row}
                  channelId={channelId}
                  status={status}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
