import { DndContext, DragOverlay } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { MAX_SPATIAL_COLUMNS, countSpatialColumnsInRow } from "./spatial-workspace-layout";
import { dragOverlayModifiers } from "./spatial-workspace-drag";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { DraggedSpatialTab } from "./DraggedSpatialTab";
import { SpatialWorkspaceSnapTargets } from "./SpatialWorkspaceSnapTargets";
import { SpatialWorkspaceTree } from "./SpatialWorkspaceTree";
import { useSpatialWorkspaceController } from "./useSpatialWorkspaceController";

export type { SpatialWorkspaceTab } from "./spatial-workspace-types";

interface SpatialWorkspaceProps {
  persistenceKey: string;
  tabs: SpatialWorkspaceTab[];
  preferredActiveTabId?: string | null;
  foregroundTabId?: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (groupId: string) => string;
  tabReplacements?: Record<string, string>;
  onOverlayVisibilityChange?: (visible: boolean) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}
export function SpatialWorkspace({
  persistenceKey,
  tabs,
  preferredActiveTabId,
  foregroundTabId,
  onActivateTab,
  onCloseTab,
  onNewTab,
  tabReplacements = {},
  onOverlayVisibilityChange,
  renderTab,
}: SpatialWorkspaceProps) {
  const controller = useSpatialWorkspaceController({
    persistenceKey,
    tabs,
    preferredActiveTabId,
    foregroundTabId,
    tabReplacements,
    onActivateTab,
    onNewTab,
    onOverlayVisibilityChange,
  });

  return (
    <DndContext
      sensors={controller.sensors}
      collisionDetection={controller.collisionDetection}
      onDragStart={controller.handleDragStart}
      onDragMove={controller.handleDragMove}
      onDragCancel={controller.handleDragCancel}
      onDragEnd={controller.handleDragEnd}
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-deep">
        <SpatialWorkspaceTree
          node={controller.layout.root}
          tabById={controller.tabById}
          compact={controller.compact}
          dragging={controller.draggedTabId !== null}
          focusedMode={!!controller.layout.focusedGroupId}
          resizing={controller.resizingSplitId !== null}
          onActivate={controller.handleActivate}
          onCloseTab={onCloseTab}
          onFocusPanel={controller.handleFocusPanel}
          onNewTab={controller.handleNewTab}
          onResizeSplit={controller.handleResizeSplit}
          onResizeStart={controller.setResizingSplitId}
          onResizeEnd={() => controller.setResizingSplitId(null)}
          onTogglePanelFocus={controller.handleTogglePanelFocus}
          renderTab={renderTab}
        />
        {controller.draggedTabId ? (
          <SpatialWorkspaceSnapTargets
            hasVerticalSplit={controller.hasVerticalSplit}
            canAddFullColumn={
              countSpatialColumnsInRow(controller.layout.root, "full") < MAX_SPATIAL_COLUMNS
            }
            canAddTopColumn={
              countSpatialColumnsInRow(controller.layout.root, "top") < MAX_SPATIAL_COLUMNS
            }
            canAddBottomColumn={
              countSpatialColumnsInRow(controller.layout.root, "bottom") < MAX_SPATIAL_COLUMNS
            }
          />
        ) : null}
      </div>
      <DragOverlay
        modifiers={dragOverlayModifiers}
        dropAnimation={{ duration: 160, easing: "cubic-bezier(.16,1,.3,1)" }}
      >
        {controller.draggedTab ? <DraggedSpatialTab tab={controller.draggedTab} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
