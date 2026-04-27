import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DefaultMenuItem,
  GetContextMenuItemsParams,
  GridApi,
  MenuItemDef,
} from "ag-grid-community";
import { useUIStore, type UIState } from "../../stores/ui";
import { ArchiveSessionGroupDialog } from "../session/ArchiveSessionGroupDialog";
import { motion } from "framer-motion";
import type { SessionGridRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX } from "./sessions-table-types";
import { applySessionsColumnMode } from "./sessions-table-columns";
import { SessionsGridTable } from "./SessionsGridTable";
import { useCompactTableMode } from "./useCompactTableMode";
import { useSessionsGridOptions } from "./useSessionsGridOptions";
import { useSessionGroupRows } from "./useSessionGroupRows";
import { useSessionStatusGrouping } from "./useSessionStatusGrouping";
import { useSessionsGridTable } from "./useSessionsGridTable";

export function SessionsTable({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi<SessionGridRow> | null>(null);
  const { fadeControls, isCompact } = useCompactTableMode(containerRef);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const [archiveTarget, setArchiveTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);

  const filteredGroups = useSessionGroupRows(channelId);
  const { gridRows, onFilterModelChanged, onToggleStatusGroup } =
    useSessionStatusGrouping(filteredGroups);

  useEffect(() => {
    useSessionsGridTable.getState().setRows(gridRows);
  }, [gridRows]);

  const applyColumnMode = useCallback(
    (api: GridApi<SessionGridRow>) => {
      applySessionsColumnMode(api, isCompact);
    },
    [isCompact],
  );

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    applyColumnMode(api);
  }, [applyColumnMode]);

  const getContextMenuItems = useCallback(
    (
      params: GetContextMenuItemsParams<SessionGridRow>,
    ): (DefaultMenuItem | MenuItemDef<SessionGridRow>)[] => {
      if (!params.node?.data || "_isStatusHeader" in params.node.data) return [];
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
          name: "Archive Workspace",
          action: () => {
            setArchiveTarget({
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

  const agGridOptions = useSessionsGridOptions({
    channelId,
    filterStorageKey,
    getContextMenuItems,
    isCompact,
    onFilterModelChanged,
    onGridReady: (event) => {
      gridApiRef.current = event.api;
      applyColumnMode(event.api);
    },
    onToggleStatusGroup,
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
      {archiveTarget && (
        <ArchiveSessionGroupDialog
          groupId={archiveTarget.id}
          groupName={archiveTarget.name}
          open={true}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
        />
      )}
    </div>
  );
}
