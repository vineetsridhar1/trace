import { useCallback, useEffect, useRef, useState } from "react";
import type { CellContextMenuEvent, GridApi } from "ag-grid-community";
import { useUIStore, type UIState } from "../../stores/ui";
import { ArchiveSessionGroupDialog } from "../session/ArchiveSessionGroupDialog";
import { motion } from "framer-motion";
import type { SessionGridRow, SessionGroupRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX, isSessionStatusHeaderRow } from "./sessions-table-types";
import { applySessionsColumnMode } from "./sessions-table-columns";
import { SessionRowContextMenu, type SessionRowContextMenuState } from "./SessionRowContextMenu";
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
  const [contextMenu, setContextMenu] = useState<SessionRowContextMenuState | null>(null);

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

  const handleCopyLink = useCallback(
    (group: SessionGroupRow) => {
      const sessionId = group.latestSession?.id;
      const path = sessionId
        ? `/c/${channelId}/g/${group.id}/s/${sessionId}`
        : `/c/${channelId}/g/${group.id}`;
      void navigator.clipboard.writeText(`${window.location.origin}${path}`);
    },
    [channelId],
  );

  const handleArchive = useCallback((group: SessionGroupRow) => {
    setArchiveTarget({
      id: group.id,
      name: group.name,
      sessionCount: group._sessionCount,
    });
  }, []);

  const handleCellContextMenu = useCallback((event: CellContextMenuEvent<SessionGridRow>) => {
    const row = event.data;
    if (!row || isSessionStatusHeaderRow(row)) return;

    if (event.event instanceof MouseEvent) {
      event.event.preventDefault();
      setContextMenu({
        row,
        x: Math.max(8, Math.min(event.event.clientX, window.innerWidth - 184)),
        y: Math.max(8, Math.min(event.event.clientY, window.innerHeight - 148)),
      });
    }
  }, []);

  const filterStorageKey = `${FILTER_STORAGE_KEY_PREFIX}${channelId}`;

  const agGridOptions = useSessionsGridOptions({
    channelId,
    filterStorageKey,
    isCompact,
    onCellContextMenu: handleCellContextMenu,
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
      {contextMenu && (
        <SessionRowContextMenu
          menu={contextMenu}
          onArchive={handleArchive}
          onClose={() => setContextMenu(null)}
          onCopyLink={handleCopyLink}
        />
      )}
    </div>
  );
}
