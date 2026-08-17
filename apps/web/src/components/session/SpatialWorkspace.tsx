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
  type CollisionDetection,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Columns2, Columns3, Grid2X2, LayoutGrid, Plus, Rows2, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
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
  MAX_SPATIAL_REGIONS,
  activateSpatialTab,
  applySpatialLayoutPreset,
  countSpatialRegions,
  createSpatialLayout,
  dockSpatialTab,
  getSpatialAxisSpan,
  insertSpatialTab,
  isSpatialLayout,
  moveSpatialTab,
  syncSpatialTabs,
  type SpatialEdge,
  type SpatialLayoutPreset,
  type SpatialNode,
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

const edgeLabels: Record<SpatialEdge, string> = {
  left: "Create left region",
  right: "Create right region",
  top: "Create top region",
  bottom: "Create bottom region",
};

const spatialCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedTabId(null);
    const tabId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId) return;

    const [kind, groupId, edge] = overId.split(":");
    if (kind === "snap" && isSpatialEdge(edge)) {
      setLayout((current) => dockSpatialTab(current, tabId, groupId, edge));
      return;
    }
    if (kind === "region") {
      setLayout((current) => moveSpatialTab(current, tabId, groupId));
    }
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={spatialCollisionDetection}
      onDragStart={({ active }) => setDraggedTabId(String(active.id))}
      onDragCancel={() => setDraggedTabId(null)}
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
                  icon={Rows2}
                  label="Two rows"
                  onClick={() => handleLayoutPreset("rows")}
                />
                <LayoutPresetItem
                  icon={Grid2X2}
                  label="Four regions"
                  onClick={() => handleLayoutPreset("grid")}
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
          canSplit={regionCount < MAX_SPATIAL_REGIONS}
          onActivate={handleActivate}
          onCloseTab={onCloseTab}
          onNewTab={handleNewTab}
          renderTab={renderTab}
        />
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(.16,1,.3,1)" }}>
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
  canSplit,
  onActivate,
  onCloseTab,
  onNewTab,
  renderTab,
}: {
  node: SpatialNode;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  canSplit: boolean;
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
        canSplit={canSplit}
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
          canSplit={canSplit}
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
  canSplit,
  onActivate,
  onCloseTab,
  onNewTab,
  renderTab,
}: {
  group: SpatialTabGroup;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  canSplit: boolean;
  onActivate: (groupId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (groupId: string) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `region:${group.id}` });
  const activeTabId = group.activeTabId ?? group.tabIds[0] ?? null;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
        isOver && dragging && "ring-1 ring-inset ring-blue-400/60",
      )}
      aria-label="Workspace region"
    >
      <div
        className={cn(
          "app-region-drag relative z-10 flex shrink-0 items-end border-b border-border bg-surface-mid px-2",
          compact ? "h-10" : "h-11",
        )}
      >
        <div className="app-region-no-drag no-scrollbar flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pr-32">
          {group.tabIds.map((tabId) => {
            const tab = tabById.get(tabId);
            if (!tab) return null;
            return (
              <SpatialTabButton
                key={tabId}
                tab={tab}
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

      {dragging ? (
        <SpatialSnapTargets groupId={group.id} canSplit={canSplit} groupIsOver={isOver} />
      ) : null}
    </section>
  );
}

function SpatialTabButton({
  tab,
  active,
  compact,
  onActivate,
  onClose,
}: {
  tab: SpatialWorkspaceTab;
  active: boolean;
  compact: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: tab.id });

  return (
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
  );
}

function SpatialSnapTargets({
  groupId,
  canSplit,
  groupIsOver,
}: {
  groupId: string;
  canSplit: boolean;
  groupIsOver: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-2 z-30">
      {canSplit
        ? (["left", "right", "top", "bottom"] as const).map((edge) => (
            <SpatialSnapTarget key={edge} groupId={groupId} edge={edge} />
          ))
        : null}
      <div
        className={cn(
          "absolute inset-[34%] flex items-center justify-center rounded-xl border text-center text-[10px] font-medium transition-colors",
          groupIsOver
            ? "border-blue-400 bg-blue-500/25 text-blue-100 shadow-[inset_0_0_0_1px_rgb(96_165_250/.15)]"
            : "border-border/70 bg-surface-mid/75 text-muted-foreground",
        )}
      >
        Add to this tab group
      </div>
    </div>
  );
}

function SpatialSnapTarget({ groupId, edge }: { groupId: string; edge: SpatialEdge }) {
  const { setNodeRef, isOver } = useDroppable({ id: `snap:${groupId}:${edge}` });
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
        if (isSpatialLayout(parsed)) return syncSpatialTabs(parsed, tabIds, preferredActiveTabId);
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
