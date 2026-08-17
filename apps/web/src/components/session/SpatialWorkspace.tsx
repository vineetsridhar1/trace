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
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Columns2, Columns3, Columns4, LayoutGrid, Plus, Rows2, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  MAX_SPATIAL_COLUMNS,
  activateSpatialTab,
  applySpatialLayoutPreset,
  countSpatialColumnsInRow,
  countSpatialRegions,
  createSpatialLayout,
  dockSpatialTab,
  getSpatialAxisSpan,
  insertSpatialTab,
  isSpatialLayout,
  moveSpatialTab,
  normalizeSpatialLayout,
  syncSpatialTabs,
  type SpatialEdge,
  type SpatialLayoutPreset,
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
}

interface SpatialWorkspaceProps {
  persistenceKey: string;
  tabs: SpatialWorkspaceTab[];
  preferredActiveTabId?: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (groupId: string) => string;
  onOverlayVisibilityChange?: (visible: boolean) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}

interface TabRailDropData {
  type: "tab-rail";
  groupId: string;
  targetIndex: number;
  targetTabId?: string;
}

const edgeLabels: Record<SpatialEdge, string> = {
  left: "Add column on left",
  right: "Add column on right",
  top: "Split into top row",
  bottom: "Split into bottom row",
};

const tabRailSpring = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 } as const;

const centerDragOverlayOnCursor: Modifier = ({
  activatorEvent,
  activeNodeRect,
  overlayNodeRect,
  transform,
}) => {
  if (!activatorEvent || !activeNodeRect || !overlayNodeRect) return transform;
  if (!("clientX" in activatorEvent) || !("clientY" in activatorEvent)) return transform;
  if (
    typeof activatorEvent.clientX !== "number" ||
    typeof activatorEvent.clientY !== "number"
  ) {
    return transform;
  }
  return {
    ...transform,
    x:
      transform.x +
      activatorEvent.clientX -
      activeNodeRect.left -
      overlayNodeRect.width / 2,
    y:
      transform.y +
      activatorEvent.clientY -
      activeNodeRect.top -
      overlayNodeRect.height / 2,
  };
};

const dragOverlayModifiers = [centerDragOverlayOnCursor];

const spatialCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const activeTabTargetId = `tab-target:${String(args.active.id)}`;
  const tabCollision = collisions.find(
    (collision) =>
      String(collision.id).startsWith("tab-target:") &&
      String(collision.id) !== activeTabTargetId,
  );
  if (tabCollision) return [tabCollision];
  const railCollision = collisions.find((collision) => String(collision.id).startsWith("tab-rail:"));
  if (railCollision) return [railCollision];
  const snapCollision = collisions.find((collision) => String(collision.id).startsWith("snap:"));
  return snapCollision ? [snapCollision] : collisions;
};

export function SpatialWorkspace({
  persistenceKey,
  tabs,
  preferredActiveTabId,
  onActivateTab,
  onCloseTab,
  onNewTab,
  onOverlayVisibilityChange,
  renderTab,
}: SpatialWorkspaceProps) {
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const tabIdsKey = tabIds.join("\u0000");
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const [layout, setLayout] = useState(() => readLayout(persistenceKey, tabIds, preferredActiveTabId));
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const dragStartLayoutRef = useRef<SpatialLayout | null>(null);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    setLayout((current) => syncSpatialTabs(current, tabIds, preferredActiveTabId));
  }, [preferredActiveTabId, tabIdsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(persistenceKey, JSON.stringify(layout));
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [layout, persistenceKey]);

  const overlayVisible = draggedTabId !== null || layoutMenuOpen;
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
    const move = getTabRailMove(event);
    if (!move) return;
    setLayout((current) =>
      moveSpatialTab(current, move.tabId, move.groupId, move.targetIndex, true),
    );
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedTabId(null);
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
    const move = getTabRailMove(event);
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
    if (dragStartLayoutRef.current) setLayout(dragStartLayoutRef.current);
    dragStartLayoutRef.current = null;
  }, []);

  const handleLayoutPreset = useCallback((preset: SpatialLayoutPreset) => {
    setLayout((current) => applySpatialLayoutPreset(current, preset));
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
      collisionDetection={spatialCollisionDetection}
      onDragStart={({ active }) => {
        dragStartLayoutRef.current = layout;
        setDraggedTabId(String(active.id));
      }}
      onDragMove={handleDragMove}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-deep">
        <div className="pointer-events-none absolute right-3 top-1.5 z-40 flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-surface-mid/95 px-1.5 shadow-lg shadow-black/20 backdrop-blur">
          <span className="px-1 text-[10px] text-muted-foreground">
            {regionCount} {regionCount === 1 ? "region" : "regions"}
          </span>
          <DropdownMenu open={layoutMenuOpen} onOpenChange={setLayoutMenuOpen}>
            <DropdownMenuTrigger
              className="pointer-events-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              aria-label="Choose workspace layout"
              title="Choose workspace layout"
            >
              <LayoutGrid size={12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Arrange tabs</DropdownMenuLabel>
                <LayoutPresetItem
                  icon={Square}
                  label="Single region"
                  onClick={() => handleLayoutPreset("single")}
                />
                <LayoutPresetItem
                  icon={Columns2}
                  label="Two columns"
                  onClick={() => handleLayoutPreset("columns")}
                />
                <LayoutPresetItem
                  icon={Columns3}
                  label="Three columns"
                  onClick={() => handleLayoutPreset("three-columns")}
                />
                <LayoutPresetItem
                  icon={Columns4}
                  label="Four columns"
                  onClick={() => handleLayoutPreset("four-columns")}
                />
                <LayoutPresetItem
                  icon={Rows2}
                  label="Two rows"
                  onClick={() => handleLayoutPreset("rows")}
                />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <SpatialNodeView
          node={layout.root}
          tabById={tabById}
          compact={compact}
          dragging={draggedTabId !== null}
          onActivate={handleActivate}
          onCloseTab={onCloseTab}
          onNewTab={handleNewTab}
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

function LayoutPresetItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Square;
  label: string;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick} className="gap-2 py-1.5 text-xs">
      <Icon size={13} />
      {label}
    </DropdownMenuItem>
  );
}

function SpatialNodeView({
  node,
  tabById,
  compact,
  dragging,
  onActivate,
  onCloseTab,
  onNewTab,
  renderTab,
}: {
  node: SpatialNode;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  onActivate: (groupId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (groupId: string) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}) {
  if (node.type === "group") {
    return (
      <SpatialRegion
        group={node}
        tabById={tabById}
        compact={compact}
        dragging={dragging}
        onActivate={onActivate}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        renderTab={renderTab}
      />
    );
  }

  const firstSpan = getSpatialAxisSpan(node.children[0], node.direction);
  const secondSpan = getSpatialAxisSpan(node.children[1], node.direction);

  return (
    <div
      className="grid min-h-0 min-w-0 flex-1 gap-px bg-border"
      style={
        node.direction === "horizontal"
          ? { gridTemplateColumns: `${firstSpan}fr ${secondSpan}fr` }
          : { gridTemplateRows: `${firstSpan}fr ${secondSpan}fr` }
      }
    >
      {node.children.map((child) => (
        <SpatialNodeView
          key={child.id}
          node={child}
          tabById={tabById}
          compact={compact}
          dragging={dragging}
          onActivate={onActivate}
          onCloseTab={onCloseTab}
          onNewTab={onNewTab}
          renderTab={renderTab}
        />
      ))}
    </div>
  );
}

function SpatialRegion({
  group,
  tabById,
  compact,
  dragging,
  onActivate,
  onCloseTab,
  onNewTab,
  renderTab,
}: {
  group: SpatialTabGroup;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  onActivate: (groupId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (groupId: string) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}) {
  const { setNodeRef: setRailNodeRef, isOver: isRailOver } = useDroppable({
    id: `tab-rail:${group.id}`,
    data: { type: "tab-rail", groupId: group.id, targetIndex: group.tabIds.length },
  });
  const activeTabId = group.activeTabId ?? group.tabIds[0] ?? null;

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      aria-label="Workspace region"
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

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTabId ? renderTab(activeTabId, compact) : null}
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
}: {
  tab: SpatialWorkspaceTab;
  groupId: string;
  targetIndex: number;
  active: boolean;
  compact: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    transform,
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
        style={{ transform: CSS.Translate.toString(transform) }}
        className={cn(
          "group mb-0 flex shrink-0 items-center rounded-t-lg border-b-2 transition-[background-color,border-color,color,opacity]",
          compact ? "h-8 max-w-40" : "h-9 max-w-56",
          active
            ? "border-blue-400 bg-background text-foreground"
            : "border-transparent text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground",
          isDragging && "opacity-20",
          isOver && !isDragging && "ring-1 ring-inset ring-blue-400/70",
        )}
      >
        <button
          type="button"
          onClick={onActivate}
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
          : "border-transparent bg-blue-500/5 opacity-30",
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
    <div className="flex h-9 w-48 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-foreground shadow-2xl shadow-black/60">
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

function getTabRailMove(event: DragMoveEvent | DragOverEvent | DragEndEvent) {
  const over = event.over;
  if (!over) return null;
  const dropData: unknown = over.data.current;
  if (!isTabRailDropData(dropData)) return null;

  const tabId = String(event.active.id);
  if (dropData.targetTabId === tabId) return null;
  let targetIndex = dropData.targetIndex;
  if (dropData.targetTabId) {
    const activeRect = event.active.rect.current.translated;
    if (
      activeRect &&
      activeRect.left + activeRect.width / 2 > over.rect.left + over.rect.width / 2
    ) {
      targetIndex += 1;
    }
  }
  return { tabId, groupId: dropData.groupId, targetIndex };
}
