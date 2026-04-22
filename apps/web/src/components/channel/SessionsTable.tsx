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
import type { SessionGroupRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX } from "./sessions-table-types";
import { applySessionsColumnMode } from "./sessions-table-columns";
import { SessionsGridTable } from "./SessionsGridTable";
import { useCompactTableMode } from "./useCompactTableMode";
import { useSessionsGridOptions } from "./useSessionsGridOptions";
import { useSessionGroupRows } from "./useSessionGroupRows";
import { useSessionsGridTable } from "./useSessionsGridTable";

export function SessionsTable({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi<SessionGroupRow> | null>(null);
  const { fadeControls, isCompact } = useCompactTableMode(containerRef);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const [archiveTarget, setArchiveTarget] = useState<{
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
