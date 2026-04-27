import type {
  DefaultMenuItem,
  FilterChangedEvent,
  GetContextMenuItemsParams,
  GridReadyEvent,
  MenuItemDef,
} from "ag-grid-community";
import { navigateToSessionGroup } from "../../stores/ui";
import { SessionStatusHeaderRow } from "./SessionStatusHeaderRow";
import type { SessionGridRow } from "./sessions-table-types";
import { isSessionStatusHeaderRow } from "./sessions-table-types";

export function useSessionsGridOptions({
  channelId,
  filterStorageKey,
  getContextMenuItems,
  isCompact,
  onGridReady,
  onFilterModelChanged,
  onToggleStatusGroup,
}: {
  channelId: string;
  filterStorageKey: string;
  getContextMenuItems: (params: GetContextMenuItemsParams<SessionGridRow>) => (DefaultMenuItem | MenuItemDef<SessionGridRow>)[];
  isCompact: boolean;
  onGridReady?: (event: GridReadyEvent<SessionGridRow>) => void;
  onFilterModelChanged: (model: Record<string, unknown> | null) => void;
  onToggleStatusGroup: (status: string) => void;
}) {
  return {
    onRowClicked: (event: { data?: SessionGridRow }) => {
      if (isSessionStatusHeaderRow(event.data)) {
        onToggleStatusGroup(event.data._status);
        return;
      }
      const latestSessionId = event.data?.latestSession?.id ?? null;
      if (event.data?.id) {
        navigateToSessionGroup(channelId, event.data.id, latestSessionId);
      }
    },
    onGridReady: (event: GridReadyEvent<SessionGridRow>) => {
      try {
        const saved = localStorage.getItem(filterStorageKey);
        if (saved) {
          const model = JSON.parse(saved) as Record<string, unknown>;
          event.api.setFilterModel(model);
          onFilterModelChanged(model);
        }
      } catch {
        // ignore corrupt data
      }
      onGridReady?.(event);
    },
    onFilterChanged: (event: FilterChangedEvent<SessionGridRow>) => {
      const model = event.api.getFilterModel();
      if (Object.keys(model).length === 0) {
        localStorage.removeItem(filterStorageKey);
        onFilterModelChanged(null);
      } else {
        localStorage.setItem(filterStorageKey, JSON.stringify(model));
        onFilterModelChanged(model);
      }
    },
    rowHeight: isCompact ? 68 : 40,
    headerHeight: isCompact ? 36 : 32,
    suppressCellFocus: true,
    getContextMenuItems,
    isFullWidthRow: (params: { rowNode: { data?: SessionGridRow } }) =>
      isSessionStatusHeaderRow(params.rowNode.data),
    fullWidthCellRenderer: (params: { data?: SessionGridRow }) => {
      if (!isSessionStatusHeaderRow(params.data)) return null;
      return <SessionStatusHeaderRow row={params.data} />;
    },
    getRowHeight: (params: { data?: SessionGridRow }) => {
      if (isSessionStatusHeaderRow(params.data)) return isCompact ? 36 : 40;
      return undefined;
    },
  };
}
