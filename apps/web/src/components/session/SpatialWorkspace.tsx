import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import {
  MAX_SPATIAL_COLUMNS,
  activateSpatialTab,
  balanceSpatialGroups,
  countSpatialColumnsInRow,
  countSpatialRegions,
  createSpatialLayout,
  dockSpatialTab,
  focusSpatialGroup,
  getSpatialAxisSpan,
  insertSpatialTab,
  replaceSpatialTab,
  isSpatialLayout,
  moveSpatialTab,
  normalizeSpatialLayout,
  setSpatialSplitRatio,
  syncSpatialTabs,
  type SpatialEdge,
  type SpatialLayout,
  type SpatialNode,
  type SpatialRowPosition,
  type SpatialTabGroup,
} from "./spatial-workspace-layout";

export interface SpatialWorkspaceTab {
  id: string;
  label: string;
  icon: ReactNode;
  status?: "live" | "changed" | "attention";
  closable?: boolean;
  minContentWidth?: number;
}

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

interface TabRailDropData {
  type: "tab-rail";
  groupId: string;
  targetIndex: number;
  targetTabId?: string;
}

type HorizontalDragDirection = "left" | "right" | null;

const edgeLabels: Record<SpatialEdge, string> = {
  left: "Add column on left",
  right: "Add column on right",
  top: "Split into top row",
  bottom: "Split into bottom row",
};

const tabRailSpring = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 } as const;

const centerDragOverlayOnCursor: Modifier = ({
  activatorEvent,
  overlayNodeRect,
  over,
  transform,
}) => {
  if (!activatorEvent || !overlayNodeRect) return transform;
  if (!("clientX" in activatorEvent) || !("clientY" in activatorEvent)) return transform;
  if (
    typeof activatorEvent.clientX !== "number" ||
    typeof activatorEvent.clientY !== "number"
  ) {
    return transform;
  }
  const pointerCenterY =
    transform.y + activatorEvent.clientY - overlayNodeRect.top;
  const railCenterY =
    over && isTabRailDropData(over.data.current)
      ? over.rect.top + over.rect.height / 2 - overlayNodeRect.top
      : pointerCenterY;
  return {
    ...transform,
    x:
      transform.x +
      activatorEvent.clientX -
      overlayNodeRect.left -
      overlayNodeRect.width / 2,
    y: railCenterY - overlayNodeRect.height / 2,
  };
};

const dragOverlayModifiers = [centerDragOverlayOnCursor];

function spatialCollisionDetection(
  args: Parameters<CollisionDetection>[0],
  direction: HorizontalDragDirection,
) {
  const collisions = pointerWithin(args);
  if (direction && args.pointerCoordinates) {
    const draggedTabWidth = args.active.rect.current.initial?.width ?? 0;
    const leadingEdgeX =
      args.pointerCoordinates.x + (direction === "right" ? draggedTabWidth / 2 : -draggedTabWidth / 2);
    const leadingEdgeCollisions = pointerWithin({
      ...args,
      pointerCoordinates: { x: leadingEdgeX, y: args.pointerCoordinates.y },
    });
    const leadingTabCollision = leadingEdgeCollisions.find(
      (collision) =>
        String(collision.id).startsWith("tab-target:") &&
        String(collision.id) !== `tab-target:${String(args.active.id)}`,
    );
    if (leadingTabCollision) return [leadingTabCollision];
  }
  const tabCollision = collisions.find((collision) =>
    String(collision.id).startsWith("tab-target:"),
  );
  if (tabCollision) return [tabCollision];
  const railCollision = collisions.find((collision) => String(collision.id).startsWith("tab-rail:"));
  if (railCollision) return [railCollision];
  const snapCollision = collisions.find((collision) => String(collision.id).startsWith("snap:"));
  return snapCollision ? [snapCollision] : collisions;
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
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const tabIdsKey = tabIds.join("\u0000");
  const tabReplacementsKey = Object.entries(tabReplacements)
    .map(([source, replacement]) => `${source}\u0000${replacement}`)
    .join("\u0001");
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const [layout, setLayout] = useState(() => readLayout(persistenceKey, tabIds, preferredActiveTabId));
  const previousPreferredActiveTabIdRef = useRef(preferredActiveTabId);
  const previousForegroundTabIdRef = useRef<string | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const dragStartLayoutRef = useRef<SpatialLayout | null>(null);
  const lastDragPointerXRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<HorizontalDragDirection>(null);
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => spatialCollisionDetection(args, dragDirectionRef.current),
    [],
  );
  const [resizingSplitId, setResizingSplitId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    const preferredTabChanged =
      previousPreferredActiveTabIdRef.current !== preferredActiveTabId;
    previousPreferredActiveTabIdRef.current = preferredActiveTabId;
    const foregroundTabChanged = previousForegroundTabIdRef.current !== foregroundTabId;
    previousForegroundTabIdRef.current = foregroundTabId ?? null;
    const requestedTabId =
      foregroundTabChanged && foregroundTabId
        ? foregroundTabId
        : preferredTabChanged
          ? preferredActiveTabId
          : null;
    setLayout((current) => {
      const replaced = Object.entries(tabReplacements).reduce(
        (next, [source, replacement]) => replaceSpatialTab(next, source, replacement),
        current,
      );
      return syncSpatialTabs(
        replaced,
        tabIds,
        requestedTabId,
      );
    });
  }, [foregroundTabId, preferredActiveTabId, tabIdsKey, tabReplacementsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(persistenceKey, JSON.stringify(layout));
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [layout, persistenceKey]);

  const overlayVisible = draggedTabId !== null || resizingSplitId !== null;
  useEffect(() => {
    onOverlayVisibilityChange?.(overlayVisible);
  }, [onOverlayVisibilityChange, overlayVisible]);

  useEffect(
    () => () => {
      onOverlayVisibilityChange?.(false);
    },
    [onOverlayVisibilityChange],
  );

  const regionCount = countSpatialRegions(layout.root);
  const compact = regionCount > 2;

  const handleActivate = useCallback(
    (groupId: string, tabId: string) => {
      setLayout((current) => activateSpatialTab(current, groupId, tabId));
      onActivateTab(tabId);
    },
    [onActivateTab],
  );

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const pointerX = getDragPointerX(event);
    if (pointerX !== null) {
      const previousPointerX = lastDragPointerXRef.current;
      if (previousPointerX !== null && Math.abs(pointerX - previousPointerX) >= 1) {
        dragDirectionRef.current = pointerX > previousPointerX ? "right" : "left";
      }
      lastDragPointerXRef.current = pointerX;
    }
    const move = getTabRailMove(event, dragDirectionRef.current);
    if (!move) return;
    setLayout((current) =>
      moveSpatialTab(current, move.tabId, move.groupId, move.targetIndex, true),
    );
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedTabId(null);
    const dragDirection = dragDirectionRef.current;
    dragDirectionRef.current = null;
    lastDragPointerXRef.current = null;
    const tabId = String(event.active.id);
    const over = event.over;
    if (!over) {
      if (dragStartLayoutRef.current) setLayout(dragStartLayoutRef.current);
      dragStartLayoutRef.current = null;
      return;
    }
    const overId = String(over.id);

    const [kind, targetId, edge] = overId.split(":");
    if (kind === "snap" && isSpatialRowPosition(targetId) && isSpatialEdge(edge)) {
      setLayout((current) => dockSpatialTab(current, tabId, edge, targetId));
      dragStartLayoutRef.current = null;
      return;
    }
    const move = getTabRailMove(event, dragDirection);
    if (move) {
      setLayout((current) =>
        moveSpatialTab(current, move.tabId, move.groupId, move.targetIndex),
      );
    } else if (dragStartLayoutRef.current) {
      setLayout(dragStartLayoutRef.current);
    }
    dragStartLayoutRef.current = null;
  }, []);

  const handleDragCancel = useCallback(() => {
    setDraggedTabId(null);
    dragDirectionRef.current = null;
    lastDragPointerXRef.current = null;
    if (dragStartLayoutRef.current) setLayout(dragStartLayoutRef.current);
    dragStartLayoutRef.current = null;
  }, []);

  const handleResizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((current) => setSpatialSplitRatio(current, splitId, ratio));
  }, []);

  const handleFocusPanel = useCallback((groupId: string) => {
    setLayout((current) =>
      current.focusedGroupId ? focusSpatialGroup(current, groupId) : current,
    );
  }, []);

  const handleTogglePanelFocus = useCallback((groupId: string) => {
    setLayout((current) =>
      current.focusedGroupId
        ? balanceSpatialGroups(current)
        : focusSpatialGroup(current, groupId),
    );
  }, []);

  const handleNewTab = useCallback(
    (groupId: string) => {
      const tabId = onNewTab(groupId);
      setLayout((current) => insertSpatialTab(current, tabId, groupId));
    },
    [onNewTab],
  );

  const draggedTab = draggedTabId ? tabById.get(draggedTabId) : null;
  const hasVerticalSplit = layout.root.type === "split" && layout.root.direction === "vertical";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active, activatorEvent }) => {
        dragStartLayoutRef.current = layout;
        dragDirectionRef.current = null;
        lastDragPointerXRef.current = getActivatorClientX(activatorEvent);
        setDraggedTabId(String(active.id));
      }}
      onDragMove={handleDragMove}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-deep">
        <SpatialNodeView
          node={layout.root}
          tabById={tabById}
          compact={compact}
          dragging={draggedTabId !== null}
          focusedMode={!!layout.focusedGroupId}
          resizing={resizingSplitId !== null}
          onActivate={handleActivate}
          onCloseTab={onCloseTab}
          onFocusPanel={handleFocusPanel}
          onNewTab={handleNewTab}
          onResizeSplit={handleResizeSplit}
          onResizeStart={setResizingSplitId}
          onResizeEnd={() => setResizingSplitId(null)}
          onTogglePanelFocus={handleTogglePanelFocus}
          renderTab={renderTab}
        />
        {draggedTabId ? (
          <SpatialWorkspaceSnapTargets
            hasVerticalSplit={hasVerticalSplit}
            canAddFullColumn={
              countSpatialColumnsInRow(layout.root, "full") < MAX_SPATIAL_COLUMNS
            }
            canAddTopColumn={
              countSpatialColumnsInRow(layout.root, "top") < MAX_SPATIAL_COLUMNS
            }
            canAddBottomColumn={
              countSpatialColumnsInRow(layout.root, "bottom") < MAX_SPATIAL_COLUMNS
            }
          />
        ) : null}
      </div>

      <DragOverlay
        modifiers={dragOverlayModifiers}
        dropAnimation={{ duration: 160, easing: "cubic-bezier(.16,1,.3,1)" }}
      >
        {draggedTab ? <DraggedTab tab={draggedTab} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function SpatialNodeView({
  node,
  tabById,
  compact,
  dragging,
  focusedMode,
  resizing,
  onActivate,
  onCloseTab,
  onFocusPanel,
  onNewTab,
  onResizeSplit,
  onResizeStart,
  onResizeEnd,
  onTogglePanelFocus,
  renderTab,
}: {
  node: SpatialNode;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  focusedMode: boolean;
  resizing: boolean;
  onActivate: (groupId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onFocusPanel: (groupId: string) => void;
  onNewTab: (groupId: string) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onResizeStart: (splitId: string) => void;
  onResizeEnd: () => void;
  onTogglePanelFocus: (groupId: string) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}) {
  if (node.type === "group") {
    return (
      <SpatialRegion
        group={node}
        tabById={tabById}
        compact={compact}
        dragging={dragging}
        focusedMode={focusedMode}
        onActivate={onActivate}
        onCloseTab={onCloseTab}
        onFocusPanel={onFocusPanel}
        onNewTab={onNewTab}
        onTogglePanelFocus={onTogglePanelFocus}
        renderTab={renderTab}
      />
    );
  }

  const firstSpan = getSpatialAxisSpan(node.children[0], node.direction);
  const secondSpan = getSpatialAxisSpan(node.children[1], node.direction);
  const ratio = node.ratio ?? firstSpan / (firstSpan + secondSpan);

  return (
    <div
      className={cn(
        "relative grid min-h-0 min-w-0 flex-1 gap-px bg-border",
        !resizing && "transition-[grid-template-columns,grid-template-rows] duration-200 ease-out",
      )}
      style={
        node.direction === "horizontal"
          ? { gridTemplateColumns: `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)` }
          : { gridTemplateRows: `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)` }
      }
    >
      {node.children.map((child) => (
        <SpatialNodeView
          key={child.id}
          node={child}
          tabById={tabById}
          compact={compact}
          dragging={dragging}
          focusedMode={focusedMode}
          resizing={resizing}
          onActivate={onActivate}
          onCloseTab={onCloseTab}
          onFocusPanel={onFocusPanel}
          onNewTab={onNewTab}
          onResizeSplit={onResizeSplit}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
          onTogglePanelFocus={onTogglePanelFocus}
          renderTab={renderTab}
        />
      ))}
      <SpatialResizeHandle
        splitId={node.id}
        direction={node.direction}
        ratio={ratio}
        onResize={onResizeSplit}
        onResizeStart={onResizeStart}
        onResizeEnd={onResizeEnd}
      />
    </div>
  );
}

function SpatialResizeHandle({
  splitId,
  direction,
  ratio,
  onResize,
  onResizeStart,
  onResizeEnd,
}: {
  splitId: string;
  direction: "horizontal" | "vertical";
  ratio: number;
  onResize: (splitId: string, ratio: number) => void;
  onResizeStart: (splitId: string) => void;
  onResizeEnd: () => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cleanupRef.current?.();
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const container = event.currentTarget.parentElement;
      if (!container) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = container.getBoundingClientRect();
      const axisSize = direction === "horizontal" ? bounds.width : bounds.height;
      if (axisSize <= 0) return;

      cleanupRef.current?.();
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      onResizeStart(splitId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const position =
          direction === "horizontal"
            ? moveEvent.clientX - bounds.left
            : moveEvent.clientY - bounds.top;
        const minimumRatio = Math.min(0.45, 48 / axisSize);
        const nextRatio = Math.max(minimumRatio, Math.min(1 - minimumRatio, position / axisSize));
        onResize(splitId, nextRatio);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
        window.removeEventListener("blur", stopResizing);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        cleanupRef.current = null;
      };
      const stopResizing = () => {
        cleanup();
        onResizeEnd();
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing);
      window.addEventListener("pointercancel", stopResizing);
      window.addEventListener("blur", stopResizing);
    },
    [direction, onResize, onResizeEnd, onResizeStart, splitId],
  );

  return (
    <div
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(ratio * 100)}
      onPointerDown={handlePointerDown}
      className={cn(
        "app-region-no-drag group absolute z-30 touch-none select-none",
        direction === "horizontal"
          ? "inset-y-0 w-2 -translate-x-1/2 cursor-col-resize"
          : "inset-x-0 h-2 -translate-y-1/2 cursor-row-resize",
      )}
      style={direction === "horizontal" ? { left: `${ratio * 100}%` } : { top: `${ratio * 100}%` }}
    >
      <div
        className={cn(
          "absolute bg-transparent transition-colors group-hover:bg-blue-400/70",
          direction === "horizontal" ? "inset-y-0 left-1/2 w-px" : "inset-x-0 top-1/2 h-px",
        )}
      />
    </div>
  );
}

function SpatialRegion({
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
}: {
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
}) {
  const { setNodeRef: setRailNodeRef, isOver: isRailOver } = useDroppable({
    id: `tab-rail:${group.id}`,
    data: { type: "tab-rail", groupId: group.id, targetIndex: group.tabIds.length },
  });
  const activeTabId = group.activeTabId ?? group.tabIds[0] ?? null;
  const minContentWidth = activeTabId
    ? (tabById.get(activeTabId)?.minContentWidth ?? 448)
    : 448;

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      aria-label="Workspace region"
      onPointerDownCapture={focusedMode ? () => onFocusPanel(group.id) : undefined}
    >
      <div
        className={cn(
          "app-region-drag relative z-10 flex shrink-0 items-end border-b border-border bg-surface-mid px-2",
          compact ? "h-10" : "h-11",
        )}
      >
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

function SpatialTabButton({
  tab,
  groupId,
  targetIndex,
  active,
  compact,
  onActivate,
  onClose,
  onDoubleClick,
}: {
  tab: SpatialWorkspaceTab;
  groupId: string;
  targetIndex: number;
  active: boolean;
  compact: boolean;
  onActivate: () => void;
  onClose: () => void;
  onDoubleClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    isDragging,
  } = useDraggable({ id: tab.id });
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: `tab-target:${tab.id}`,
    data: { type: "tab-rail", groupId, targetIndex, targetTabId: tab.id },
  });
  const setNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDraggableNodeRef(node);
      setDroppableNodeRef(node);
    },
    [setDraggableNodeRef, setDroppableNodeRef],
  );

  return (
    <motion.div
      layout="position"
      layoutId={`spatial-tab-${tab.id}`}
      transition={tabRailSpring}
      className="shrink-0"
    >
      <div
        ref={setNodeRef}
        className={cn(
          "group mb-0 flex shrink-0 items-center rounded-t-lg border-b-2 transition-[background-color,border-color,color,opacity]",
          compact ? "h-8 max-w-40" : "h-9 max-w-56",
          active
            ? "border-blue-400 bg-background text-foreground"
            : "border-transparent text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground",
          isDragging && "opacity-0",
          isOver && !isDragging && "ring-1 ring-inset ring-blue-400/70",
        )}
      >
        <button
          type="button"
          onClick={onActivate}
          onDoubleClick={onDoubleClick}
          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 overflow-hidden py-2 pl-3 active:cursor-grabbing"
          title={tab.label}
          aria-current={active ? "page" : undefined}
          {...listeners}
          {...attributes}
        >
          <span className="shrink-0 text-muted-foreground">{tab.icon}</span>
          <span className={cn("truncate font-medium", compact ? "text-[10px]" : "text-xs")}>
            {tab.label}
          </span>
          {tab.status ? (
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                tab.status === "live" && "bg-emerald-400",
                tab.status === "changed" && "bg-blue-400",
                tab.status === "attention" && "bg-amber-400",
              )}
            />
          ) : null}
        </button>
        {tab.closable !== false ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-surface-hover group-hover:opacity-70 focus:opacity-100"
            aria-label={`Close ${tab.label}`}
          >
            <X size={11} />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

function SpatialWorkspaceSnapTargets({
  hasVerticalSplit,
  canAddFullColumn,
  canAddTopColumn,
  canAddBottomColumn,
}: {
  hasVerticalSplit: boolean;
  canAddFullColumn: boolean;
  canAddTopColumn: boolean;
  canAddBottomColumn: boolean;
}) {
  if (hasVerticalSplit) {
    return (
      <>
        <SpatialRowSnapTargets position="top" canAddColumn={canAddTopColumn} />
        <SpatialRowSnapTargets position="bottom" canAddColumn={canAddBottomColumn} />
      </>
    );
  }
  return <SpatialRowSnapTargets position="full" canAddColumn={canAddFullColumn} canAddRow />;
}

function SpatialRowSnapTargets({
  position,
  canAddColumn,
  canAddRow = false,
}: {
  position: SpatialRowPosition;
  canAddColumn: boolean;
  canAddRow?: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute z-40"
      style={workspaceSnapTargetBounds(position)}
    >
      {canAddColumn
        ? (["left", "right"] as const).map((edge) => (
            <SpatialSnapTarget key={edge} rowPosition={position} edge={edge} />
          ))
        : null}
      {canAddRow
        ? (["top", "bottom"] as const).map((edge) => (
            <SpatialSnapTarget key={edge} rowPosition={position} edge={edge} />
          ))
        : null}
    </div>
  );
}

function workspaceSnapTargetBounds(position: SpatialRowPosition) {
  if (position === "top") {
    return { left: "0.5rem", right: "0.5rem", top: "0.5rem", height: "calc(50% - 0.5rem)" };
  }
  if (position === "bottom") {
    return { left: "0.5rem", right: "0.5rem", bottom: "0.5rem", height: "calc(50% - 0.5rem)" };
  }
  return { inset: "0.5rem" };
}

function SpatialSnapTarget({
  rowPosition,
  edge,
}: {
  rowPosition: SpatialRowPosition;
  edge: SpatialEdge;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `snap:${rowPosition}:${edge}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "pointer-events-auto absolute rounded-xl border transition-[background-color,border-color,opacity] duration-150",
        edge === "left" && "inset-y-0 left-0 w-[32%]",
        edge === "right" && "inset-y-0 right-0 w-[32%]",
        edge === "top" && "inset-x-[33%] top-0 h-[32%]",
        edge === "bottom" && "inset-x-[33%] bottom-0 h-[32%]",
        isOver
          ? "border-blue-400 bg-blue-500/25 opacity-100 shadow-[inset_0_0_0_1px_rgb(96_165_250/.15)]"
          : "border-transparent bg-transparent opacity-0",
      )}
      aria-label={edgeLabels[edge]}
    >
      {isOver ? (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-blue-400/30 bg-slate-950/80 px-2.5 py-1.5 text-[10px] font-medium text-blue-200 shadow-xl">
          {edgeLabels[edge]}
        </span>
      ) : null}
    </div>
  );
}

function DraggedTab({ tab }: { tab: SpatialWorkspaceTab }) {
  return (
    <div className="flex size-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-foreground shadow-2xl shadow-black/60">
      <span className="text-muted-foreground">{tab.icon}</span>
      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
      {tab.status ? <span className="size-1.5 rounded-full bg-emerald-400" /> : null}
    </div>
  );
}

function readLayout(
  key: string,
  tabIds: string[],
  preferredActiveTabId?: string | null,
) {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isSpatialLayout(parsed)) {
          return syncSpatialTabs(normalizeSpatialLayout(parsed), tabIds, preferredActiveTabId);
        }
      }
    } catch {
      // Fall through to a clean layout.
    }
  }
  return createSpatialLayout(tabIds, preferredActiveTabId);
}

function isSpatialEdge(value: string): value is SpatialEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom";
}

function isSpatialRowPosition(value: string): value is SpatialRowPosition {
  return value === "full" || value === "top" || value === "bottom";
}

function isTabRailDropData(value: unknown): value is TabRailDropData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    data.type === "tab-rail" &&
    typeof data.groupId === "string" &&
    typeof data.targetIndex === "number" &&
    (data.targetTabId === undefined || typeof data.targetTabId === "string")
  );
}

function getTabRailMove(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
  direction: HorizontalDragDirection,
) {
  const over = event.over;
  if (!over) return null;
  const dropData: unknown = over.data.current;
  if (!isTabRailDropData(dropData)) return null;

  const tabId = String(event.active.id);
  if (dropData.targetTabId === tabId) return null;
  let targetIndex = dropData.targetIndex;
  if (dropData.targetTabId) {
    const pointerX = getDragPointerX(event);
    if (pointerX !== null) {
      const draggedTabWidth = event.active.rect.current.initial?.width ?? 0;
      const targetMidpoint = over.rect.left + over.rect.width / 2;
      const insertAfter =
        direction === "right"
          ? pointerX + draggedTabWidth / 2 > targetMidpoint
          : direction === "left"
            ? pointerX - draggedTabWidth / 2 >= targetMidpoint
            : pointerX > targetMidpoint;
      if (insertAfter) targetIndex += 1;
    }
  }
  return { tabId, groupId: dropData.groupId, targetIndex };
}

function getDragPointerX(event: DragMoveEvent | DragOverEvent | DragEndEvent) {
  const activatorClientX = getActivatorClientX(event.activatorEvent);
  return activatorClientX === null ? null : activatorClientX + event.delta.x;
}

function getActivatorClientX(event: Event) {
  if (!("clientX" in event) || typeof event.clientX !== "number") return null;
  return event.clientX;
}
