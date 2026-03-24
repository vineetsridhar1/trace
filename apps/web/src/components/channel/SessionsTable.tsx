import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Loader2 } from "lucide-react";
import type {
  FilterChangedEvent,
  GetContextMenuItemsParams,
  GridReadyEvent,
  ICellRendererParams,
  IsGroupOpenByDefaultParams,
  MenuItemDef,
} from "ag-grid-community";
import { navigateToSessionGroup } from "../../stores/ui";
import { sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";
import { AnimatePresence, motion } from "framer-motion";
import type { SessionGroupRow } from "./sessions-table-types";
import { COMPACT_BREAKPOINT, FILTER_STORAGE_KEY_PREFIX, collapsedByDefault, sessionStatusGroupOrder } from "./sessions-table-types";
import { SessionsGridTable, useSessionsGridTable } from "./sessions-table-columns";
import { useSessionGroupRows } from "./useSessionGroupRows";
import { CompactSessionsList } from "./CompactSessionsList";

export function SessionsTable({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);

  const filteredGroups = useSessionGroupRows(channelId);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < COMPACT_BREAKPOINT);
      }
    });
    observer.observe(el);
    setIsCompact(el.getBoundingClientRect().width < COMPACT_BREAKPOINT);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    useSessionsGridTable.getState().setRows(filteredGroups);
  }, [filteredGroups]);

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams<SessionGroupRow>): (MenuItemDef<SessionGroupRow> | string)[] => {
      if (!params.node?.data) return [];
      const group = params.node.data;
      const sessionId = group.latestSession?.id;
      return [
        {
          name: "Copy Workspace Link",
          action: () => {
            const path = sessionId
              ? `/c/${channelId}/g/${group.id}/s/${sessionId}`
              : `/c/${channelId}/g/${group.id}`;
            navigator.clipboard.writeText(`${window.location.origin}${path}`);
          },
        },
        "separator",
        {
          name: "Delete Workspace",
          cssClasses: ["text-destructive"],
          action: () => {
            setDeleteTarget({
              id: group.id,
              name: group.name,
              sessionCount: group._sessionCount,
            });
          },
        },
      ];
    },
    [channelId],
  );

  const filterStorageKey = `${FILTER_STORAGE_KEY_PREFIX}${channelId}`;

  const agGridOptions = useGridOptions({ channelId, filterStorageKey, getContextMenuItems });

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      <AnimatePresence mode="wait">
        {isCompact ? (
          <motion.div
            key="compact"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <CompactSessionsList channelId={channelId} rows={filteredGroups} />
          </motion.div>
        ) : (
          <motion.div
            key="table"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <SessionsGridTable className="h-full" agGridOptions={agGridOptions} />
          </motion.div>
        )}
      </AnimatePresence>
      {deleteTarget && (
        <DeleteSessionGroupDialog
          groupId={deleteTarget.id}
          groupName={deleteTarget.name}
          sessionCount={deleteTarget.sessionCount}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function useGridOptions({
  channelId,
  filterStorageKey,
  getContextMenuItems,
}: {
  channelId: string;
  filterStorageKey: string;
  getContextMenuItems: (params: GetContextMenuItemsParams<SessionGroupRow>) => (MenuItemDef<SessionGroupRow> | string)[];
}) {
  return {
    onRowClicked: (event: {
      node: { group?: boolean; expanded?: boolean; setExpanded: (v: boolean) => void };
      data?: SessionGroupRow;
    }) => {
      if (event.node.group) {
        event.node.setExpanded(!event.node.expanded);
        return;
      }
      const latestSessionId = event.data?.latestSession?.id ?? null;
      if (event.data?.id) {
        navigateToSessionGroup(channelId, event.data.id, latestSessionId);
      }
    },
    onGridReady: (event: GridReadyEvent<SessionGroupRow>) => {
      try {
        const saved = localStorage.getItem(filterStorageKey);
        if (saved) {
          event.api.setFilterModel(JSON.parse(saved));
        }
      } catch {
        // ignore corrupt data
      }
    },
    onFilterChanged: (event: FilterChangedEvent<SessionGroupRow>) => {
      const model = event.api.getFilterModel();
      if (Object.keys(model).length === 0) {
        localStorage.removeItem(filterStorageKey);
      } else {
        localStorage.setItem(filterStorageKey, JSON.stringify(model));
      }
    },
    rowHeight: 40,
    headerHeight: 32,
    suppressCellFocus: true,
    getContextMenuItems,
    getRowHeight: (params: { node: { group?: boolean } }) => {
      if (params.node.group) return 40;
      return undefined;
    },
    groupDisplayType: "groupRows" as const,
    isGroupOpenByDefault: (params: IsGroupOpenByDefaultParams<SessionGroupRow>) => {
      return !collapsedByDefault.has(params.key ?? "");
    },
    groupRowRendererParams: {
      suppressCount: true,
      innerRenderer: (params: ICellRendererParams<SessionGroupRow>) => {
        const status = params.value as string;
        const color = sessionStatusColor[status] ?? "text-muted-foreground";
        const label = sessionStatusLabel[status] ?? status;
        const count = params.node.allChildrenCount ?? 0;
        const hasActive = params.node.allLeafChildren?.some(
          (child) => child.data?.displayAgentStatus === "active",
        );
        return (
          <div className={`flex items-center gap-2 ${color}`}>
            {hasActive ? (
              <Loader2 size={12} className="shrink-0 animate-spin" />
            ) : (
              <Circle size={8} className="shrink-0 fill-current" />
            )}
            <span className="text-sm font-semibold">{label}</span>
            <span className="text-xs text-muted-foreground">{count}</span>
          </div>
        );
      },
    },
    initialGroupOrderComparator: (params: {
      nodeA: { key?: string | null };
      nodeB: { key?: string | null };
    }) => {
      const a = sessionStatusGroupOrder[params.nodeA.key ?? ""] ?? 99;
      const b = sessionStatusGroupOrder[params.nodeB.key ?? ""] ?? 99;
      return a - b;
    },
  };
}
