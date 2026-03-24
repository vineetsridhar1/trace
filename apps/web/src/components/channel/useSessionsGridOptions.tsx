import type {
  DefaultMenuItem,
  FilterChangedEvent,
  GetContextMenuItemsParams,
  GridReadyEvent,
  ICellRendererParams,
  IsGroupOpenByDefaultParams,
  MenuItemDef,
} from "ag-grid-community";
import { navigateToSessionGroup } from "../../stores/ui";
import { SessionStatusGroupLabel } from "./SessionStatusGroupLabel";
import type { SessionGroupRow } from "./sessions-table-types";
import { collapsedByDefault, sessionStatusGroupOrder } from "./sessions-table-types";

export function useSessionsGridOptions({
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
        const count = params.node.allChildrenCount ?? 0;
        return (
          <SessionStatusGroupLabel
            count={count}
            status={status}
          />
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
