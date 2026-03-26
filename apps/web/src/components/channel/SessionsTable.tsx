import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DefaultMenuItem,
  GetContextMenuItemsParams,
  GridApi,
  MenuItemDef,
} from "ag-grid-community";
import { Circle, Loader2 } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { DeleteSessionGroupDialog } from "../session/DeleteSessionGroupDialog";
import { motion } from "framer-motion";
import type { SessionGroupRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX } from "./sessions-table-types";
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

  const handleLoadMerged = useCallback(async () => {
    if (!onLoadMerged || mergedLoaded) return;
    setLoadingMerged(true);
    await onLoadMerged();
    setLoadingMerged(false);
  }, [onLoadMerged, mergedLoaded]);

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
      {!mergedLoaded && onLoadMerged && (
        <button
          type="button"
          onClick={handleLoadMerged}
          disabled={loadingMerged}
          className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2 text-sm text-emerald-400 hover:bg-surface-elevated disabled:opacity-50"
        >
          {loadingMerged ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Circle size={6} className="shrink-0 fill-current" />
          )}
          <span className="font-semibold">Show Merged Workspaces</span>
        </button>
      )}
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
