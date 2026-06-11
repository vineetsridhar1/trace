import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellContextMenuEvent, GridApi } from "ag-grid-community";
import { toast } from "sonner";
import { useUIStore, type UIState } from "../../stores/ui";
import { ArchiveSessionGroupDialog } from "../session/ArchiveSessionGroupDialog";
import { motion } from "framer-motion";
import { client } from "../../lib/urql";
import { applyOptimisticPatch } from "../../lib/optimistic-entity";
import {
  RENAME_SESSION_GROUP_MUTATION,
  UPDATE_SESSION_GROUP_VISIBILITY_MUTATION,
  useAuthStore,
  type AuthState,
} from "@trace/client-core";
import type { SessionGroupRenameContext } from "./session-group-rename-context";
import type { SessionGridRow, SessionGroupRow } from "./sessions-table-types";
import { FILTER_STORAGE_KEY_PREFIX, isSessionStatusHeaderRow } from "./sessions-table-types";
import { applySessionsColumnMode, SESSION_COLUMN_IDS } from "./sessions-table-columns";
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
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const [archiveTarget, setArchiveTarget] = useState<{
    id: string;
    name: string;
    sessionCount: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<SessionRowContextMenuState | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);

  const filteredGroups = useSessionGroupRows(channelId);
  const { gridRows, onFilterModelChanged, onToggleStatusGroup } = useSessionStatusGrouping(
    filteredGroups,
    currentUserId,
  );

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

  const handleRename = useCallback((group: SessionGroupRow) => {
    setRenamingGroupId(group.id);
  }, []);

  const handleRenameCancel = useCallback(() => {
    setRenamingGroupId(null);
  }, []);

  const handleRenameSubmit = useCallback((group: SessionGroupRow, name: string) => {
    const trimmed = name.trim();
    setRenamingGroupId(null);
    if (!trimmed || trimmed === group.name.trim()) return;

    const rollback = applyOptimisticPatch("sessionGroups", group.id, { name: trimmed });
    void client
      .mutation(RENAME_SESSION_GROUP_MUTATION, { id: group.id, name: trimmed })
      .toPromise()
      .then((result) => {
        if (!result.error) return;
        rollback();
        toast.error("Failed to rename workspace", { description: result.error.message });
      })
      .catch((error: unknown) => {
        rollback();
        toast.error("Failed to rename workspace", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
      });
  }, []);

  const handleUpdateVisibility = useCallback(
    (group: SessionGroupRow, visibility: "public" | "private") => {
      if (group.visibility === visibility) return;
      const rollback = applyOptimisticPatch("sessionGroups", group.id, { visibility });
      void client
        .mutation(UPDATE_SESSION_GROUP_VISIBILITY_MUTATION, { id: group.id, visibility })
        .toPromise()
        .then((result) => {
          if (!result.error) return;
          rollback();
          toast.error("Failed to update workspace visibility", {
            description: result.error.message,
          });
        })
        .catch((error: unknown) => {
          rollback();
          toast.error("Failed to update workspace visibility", {
            description: error instanceof Error ? error.message : "Please try again.",
          });
        });
    },
    [],
  );

  const renameContext = useMemo<SessionGroupRenameContext>(
    () => ({
      renamingGroupId,
      onRenameCancel: handleRenameCancel,
      onRenameSubmit: handleRenameSubmit,
    }),
    [handleRenameCancel, handleRenameSubmit, renamingGroupId],
  );

  useEffect(() => {
    gridApiRef.current?.refreshCells({
      columns: [SESSION_COLUMN_IDS.compactSummary, SESSION_COLUMN_IDS.name],
      force: true,
    });
  }, [renamingGroupId]);

  const handleCellContextMenu = useCallback((event: CellContextMenuEvent<SessionGridRow>) => {
    const row = event.data;
    if (!row || isSessionStatusHeaderRow(row)) return;

    if (event.event instanceof MouseEvent) {
      event.event.preventDefault();
      setContextMenu({
        row,
        x: Math.max(8, Math.min(event.event.clientX, window.innerWidth - 184)),
        y: Math.max(8, Math.min(event.event.clientY, window.innerHeight - 184)),
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
    renameContext,
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
          currentUserId={currentUserId}
          onRename={handleRename}
          onUpdateVisibility={handleUpdateVisibility}
        />
      )}
    </div>
  );
}
