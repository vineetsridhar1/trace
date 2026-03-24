import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Circle, Loader2 } from "lucide-react";
import type {
  DefaultMenuItem,
  FilterChangedEvent,
  GetContextMenuItemsParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  IsGroupOpenByDefaultParams,
  MenuItemDef,
} from "ag-grid-community";
import { navigateToSessionGroup, useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";
import { motion, useAnimationControls } from "framer-motion";
import type { SessionGroupRow } from "./sessions-table-types";
import { COMPACT_BREAKPOINT, FILTER_STORAGE_KEY_PREFIX, collapsedByDefault, statusGroupOrder } from "./sessions-table-types";
import {
  applySessionsColumnMode,
  SessionsGridTable,
  useSessionsGridTable,
} from "./sessions-table-columns";
import { useSessionGroupRows } from "./useSessionGroupRows";

export function SessionsTable({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi<SessionGroupRow> | null>(null);
  const { fadeControls, isCompact } = useCompactTableMode(containerRef);
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);

  const filteredGroups = useSessionGroupRows(channelId);

  useEffect(() => {
    useSessionsGridTable.getState().setRows(filteredGroups);
  }, [filteredGroups]);

  const applyColumnMode = useCallback((api: GridApi<SessionGroupRow>) => {
    applySessionsColumnMode(api, isCompact);
  }, [isCompact]);

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    applyColumnMode(api);
  }, [applyColumnMode]);

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams<SessionGroupRow>): (DefaultMenuItem | MenuItemDef<SessionGroupRow>)[] => {
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

  const agGridOptions = useGridOptions({
    channelId,
    filterStorageKey,
    getContextMenuItems,
    isCompact,
    onGridReady: (event) => {
      gridApiRef.current = event.api;
      applyColumnMode(event.api);
    },
  });
  const selectedRowIds = activeSessionGroupId ? [activeSessionGroupId] : undefined;

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      <motion.div
        className="h-full"
        layout
        initial={{ opacity: 1 }}
        animate={fadeControls}
        transition={{ duration: 0.12 }}
      >
        <SessionsGridTable
          className={isCompact ? "sessions-grid-compact h-full" : "h-full"}
          agGridOptions={agGridOptions}
          selectedRowIds={selectedRowIds}
        />
      </motion.div>
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

function useCompactTableMode(containerRef: RefObject<HTMLDivElement | null>) {
  const hasMeasuredRef = useRef(false);
  const hasAnimatedModeRef = useRef(false);
  const [isCompact, setIsCompact] = useState(false);
  const fadeControls = useAnimationControls();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateCompact = (width: number) => {
      setIsCompact(width < COMPACT_BREAKPOINT);
      if (!hasMeasuredRef.current) {
        hasMeasuredRef.current = true;
        fadeControls.set({ opacity: 1 });
      }
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateCompact(entry.contentRect.width);
      }
    });

    observer.observe(el);
    updateCompact(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [containerRef, fadeControls]);

  useEffect(() => {
    if (!hasMeasuredRef.current) return;
    if (!hasAnimatedModeRef.current) {
      hasAnimatedModeRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      fadeControls.set({ opacity: 0 });
      await fadeControls.start({ opacity: 1, transition: { duration: 0.12 } });
    })();

    return () => {
      cancelled = true;
    };
  }, [fadeControls, isCompact]);

  return { fadeControls, isCompact };
}

function useGridOptions({
  channelId,
  filterStorageKey,
  getContextMenuItems,
  isCompact,
  onGridReady,
}: {
  channelId: string;
  filterStorageKey: string;
  getContextMenuItems: (params: GetContextMenuItemsParams<SessionGroupRow>) => (DefaultMenuItem | MenuItemDef<SessionGroupRow>)[];
  isCompact: boolean;
  onGridReady?: (event: GridReadyEvent<SessionGroupRow>) => void;
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
      onGridReady?.(event);
    },
    onFilterChanged: (event: FilterChangedEvent<SessionGroupRow>) => {
      const model = event.api.getFilterModel();
      if (Object.keys(model).length === 0) {
        localStorage.removeItem(filterStorageKey);
      } else {
        localStorage.setItem(filterStorageKey, JSON.stringify(model));
      }
    },
    rowHeight: isCompact ? 68 : 40,
    headerHeight: isCompact ? 36 : 32,
    suppressCellFocus: true,
    getContextMenuItems,
    getRowHeight: (params: { node: { group?: boolean } }) => {
      if (params.node.group) return isCompact ? 36 : 40;
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
        const color = statusColor[status] ?? "text-muted-foreground";
        const label = statusLabel[status] ?? status;
        const count = params.node.allChildrenCount ?? 0;
        const hasReviewAndActive = status === "in_review"
          && params.node.allLeafChildren?.some((child) => child.data?.reviewAndActive);
        return (
          <div className={`flex items-center gap-2 ${color}`}>
            {hasReviewAndActive ? (
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
      const a = statusGroupOrder[params.nodeA.key ?? ""] ?? 99;
      const b = statusGroupOrder[params.nodeB.key ?? ""] ?? 99;
      return a - b;
    },
  };
}
