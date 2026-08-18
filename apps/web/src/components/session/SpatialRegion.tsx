import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { SpatialTabGroup } from "./spatial-workspace-layout";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { SpatialTabButton } from "./SpatialTabButton";

interface SpatialRegionProps {
  group: SpatialTabGroup;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  focusedMode: boolean;
  onActivate: (groupId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onFocusPanel: (groupId: string) => void;
  onNewTab: (groupId: string) => void;
  onTogglePanelFocus: (groupId: string) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}

export function SpatialRegion({
  group,
  tabById,
  compact,
  dragging,
  focusedMode,
  onActivate,
  onCloseTab,
  onFocusPanel,
  onNewTab,
  onTogglePanelFocus,
  renderTab,
}: SpatialRegionProps) {
  const { setNodeRef: setRailNodeRef, isOver: isRailOver } = useDroppable({
    id: `tab-rail:${group.id}`,
    data: { type: "tab-rail", groupId: group.id, targetIndex: group.tabIds.length },
  });
  const activeTabId = group.activeTabId ?? group.tabIds[0] ?? null;
  const minContentWidth = activeTabId ? (tabById.get(activeTabId)?.minContentWidth ?? 448) : 448;

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      aria-label="Workspace region"
      onPointerDownCapture={focusedMode ? () => onFocusPanel(group.id) : undefined}
    >
      <div className={cn(
        "app-region-drag relative z-10 flex shrink-0 items-end border-b border-border bg-surface-mid px-2",
        compact ? "h-10" : "h-11",
      )}>
        <div
          ref={setRailNodeRef}
          className={cn(
            "app-region-no-drag no-scrollbar flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pr-32 transition-colors",
            dragging && isRailOver && "bg-blue-500/10",
          )}
        >
          {group.tabIds.map((tabId, index) => {
            const tab = tabById.get(tabId);
            if (!tab) return null;
            return (
              <SpatialTabButton
                key={tabId}
                tab={tab}
                groupId={group.id}
                targetIndex={index}
                active={tabId === activeTabId}
                compact={compact}
                onActivate={() => onActivate(group.id, tabId)}
                onClose={() => onCloseTab(tabId)}
                onDoubleClick={() => onTogglePanelFocus(group.id)}
              />
            );
          })}
          <button
            type="button"
            onClick={() => onNewTab(group.id)}
            className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="New tab"
            title="New tab (⌘T)"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="h-full overflow-hidden" style={{ minWidth: minContentWidth }}>
          {activeTabId ? renderTab(activeTabId, compact) : null}
        </div>
      </div>
    </section>
  );
}

