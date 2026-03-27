import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DefaultMenuItem,
  GetContextMenuItemsParams,
  GridApi,
  MenuItemDef,
} from "ag-grid-community";
import { useUIStore } from "../../stores/ui";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";
import { motion } from "framer-motion";
import type { SessionGroupRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX, MERGED_PLACEHOLDER_ID } from "./sessions-table-types";
import { applySessionsColumnMode } from "./sessions-table-columns";
import { SessionsGridTable } from "./SessionsGridTable";
import { useCompactTableMode } from "./useCompactTableMode";
import { useSessionsGridOptions } from "./useSessionsGridOptions";
import { useSessionGroupRows } from "./useSessionGroupRows";
import { useSessionsGridTable } from "./useSessionsGridTable";

export function SessionsTable({
  channelId,
  onLoadMerged,
  mergedLoaded,
}: {
  channelId: string;
  onLoadMerged?: () => Promise<void>;
  mergedLoaded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi<SessionGroupRow> | null>(null);
  const { fadeControls, isCompact } = useCompactTableMode(containerRef);
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);

  const [loadingMerged, setLoadingMerged] = useState(false);

  const filteredGroups = useSessionGroupRows(channelId);

  // If merged data hasn't been loaded yet, inject a hidden placeholder row so
  // the ag-grid "Merged" group header is always visible and expandable.
  const hasMergedRows = useMemo(
    () => filteredGroups.some((r) => r.displaySessionStatus === "merged"),
    [filteredGroups],
  );

  const rowsWithPlaceholder = useMemo(() => {
    // Real merged rows exist — no placeholder needed.
    if (hasMergedRows) return filteredGroups;
    // Still loading — keep the placeholder so the group header stays visible.
    if (loadingMerged) {
      return [
        ...filteredGroups,
        {
          id: MERGED_PLACEHOLDER_ID,
          name: "Loading…",
          displaySessionStatus: "merged",
          displayAgentStatus: "idle",
          _sessionCount: 0,
        } as SessionGroupRow,
      ];
    }
    // Fetch finished with no merged rows — drop the placeholder.
    if (mergedLoaded) return filteredGroups;
    // Haven't fetched yet — show the expandable placeholder.
    return [
      ...filteredGroups,
      {
        id: MERGED_PLACEHOLDER_ID,
        name: "Expand to load merged workspaces",
        displaySessionStatus: "merged",
        displayAgentStatus: "idle",
        _sessionCount: 0,
      } as SessionGroupRow,
    ];
  }, [filteredGroups, mergedLoaded, hasMergedRows, loadingMerged]);

  useEffect(() => {
    useSessionsGridTable.getState().setRows(rowsWithPlaceholder);
  }, [rowsWithPlaceholder]);

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

  const handleLoadMerged = useCallback(async () => {
    if (!onLoadMerged || mergedLoaded || loadingMerged) return;
    setLoadingMerged(true);
    await onLoadMerged();
    setLoadingMerged(false);
  }, [onLoadMerged, mergedLoaded, loadingMerged]);

  const agGridOptions = useSessionsGridOptions({
    channelId,
    filterStorageKey,
    getContextMenuItems,
    isCompact,
    onLoadMerged: handleLoadMerged,
    mergedLoaded: mergedLoaded ?? false,
    onGridReady: (event) => {
      gridApiRef.current = event.api;
      applyColumnMode(event.api);
    },
  });
  const selectedRowIds = activeSessionGroupId ? [activeSessionGroupId] : undefined;

  return (
    <div ref={containerRef} className="relative flex h-full flex-col overflow-hidden">
      <motion.div
        className="min-h-0 flex-1"
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
