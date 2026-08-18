import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateSpatialTab,
  balanceSpatialGroups,
  createSpatialLayout,
  focusSpatialGroup,
  insertSpatialTab,
  isSpatialLayout,
  normalizeSpatialLayout,
  replaceSpatialTab,
  setSpatialSplitRatio,
  syncSpatialTabs,
  type SpatialLayout,
} from "./spatial-workspace-layout";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { useSpatialWorkspaceDrag } from "./useSpatialWorkspaceDrag";

interface SpatialWorkspaceControllerOptions {
  persistenceKey: string;
  tabs: SpatialWorkspaceTab[];
  preferredActiveTabId?: string | null;
  foregroundTabId?: string | null;
  tabReplacements: Record<string, string>;
  onTabReplacementsApplied?: (sourceTabIds: string[]) => void;
  onActivateTab: (tabId: string) => void;
  onNewTab: (groupId: string) => string;
  onOverlayVisibilityChange?: (visible: boolean) => void;
}

export function useSpatialWorkspaceController({
  persistenceKey,
  tabs,
  preferredActiveTabId,
  foregroundTabId,
  tabReplacements,
  onTabReplacementsApplied,
  onActivateTab,
  onNewTab,
  onOverlayVisibilityChange,
}: SpatialWorkspaceControllerOptions) {
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const tabIdsKey = tabIds.join("\u0000");
  const tabReplacementsKey = Object.entries(tabReplacements)
    .map(([source, replacement]) => `${source}\u0000${replacement}`)
    .join("\u0001");
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const [layout, setLayout] = useState(() =>
    readLayout(persistenceKey, tabIds, preferredActiveTabId),
  );
  const layoutRef = useRef(layout);
  const [resizingSplitId, setResizingSplitId] = useState<string | null>(null);
  const previousPreferredActiveTabIdRef = useRef(preferredActiveTabId);
  const previousForegroundTabIdRef = useRef<string | null>(null);
  const drag = useSpatialWorkspaceDrag(layout, setLayout);

  useEffect(() => {
    const preferredTabChanged = previousPreferredActiveTabIdRef.current !== preferredActiveTabId;
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
      return syncSpatialTabs(replaced, tabIds, requestedTabId);
    });
    // A replacement is a one-shot instruction. Reporting it back lets the
    // producer drop it, so the map does not grow for the life of the session
    // and every later sync does not replay the whole history.
    const applied = Object.keys(tabReplacements);
    if (applied.length > 0) onTabReplacementsApplied?.(applied);
    // tabIds/tabReplacements are read through their serialized keys so that a
    // new array or object identity alone does not re-run the sync.
  }, [
    foregroundTabId,
    onTabReplacementsApplied,
    preferredActiveTabId,
    tabIdsKey,
    tabReplacementsKey,
  ]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(
    () => () => {
      persistLayout(persistenceKey, layoutRef.current);
    },
    [persistenceKey],
  );

  // Panel resizing drives setLayout from pointermove, so persisting on every
  // layout change would serialize and write the whole tree once per frame.
  // Hold the write until the drag settles.
  useEffect(() => {
    if (resizingSplitId !== null) return;
    persistLayout(persistenceKey, layout);
  }, [layout, persistenceKey, resizingSplitId]);

  const overlayVisible = drag.draggedTabId !== null || resizingSplitId !== null;
  useEffect(() => {
    onOverlayVisibilityChange?.(overlayVisible);
  }, [onOverlayVisibilityChange, overlayVisible]);
  useEffect(() => () => onOverlayVisibilityChange?.(false), [onOverlayVisibilityChange]);

  const handleActivate = useCallback(
    (groupId: string, tabId: string) => {
      setLayout((current) => activateSpatialTab(current, groupId, tabId));
      onActivateTab(tabId);
    },
    [onActivateTab],
  );

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
      current.focusedGroupId ? balanceSpatialGroups(current) : focusSpatialGroup(current, groupId),
    );
  }, []);
  const handleNewTab = useCallback(
    (groupId: string) => {
      const tabId = onNewTab(groupId);
      setLayout((current) => insertSpatialTab(current, tabId, groupId));
    },
    [onNewTab],
  );

  return {
    collisionDetection: drag.collisionDetection,
    compact: countRegions(layout.root) > 2,
    draggedTab: drag.draggedTabId ? (tabById.get(drag.draggedTabId) ?? null) : null,
    draggedTabId: drag.draggedTabId,
    handleActivate,
    handleDragCancel: drag.handleDragCancel,
    handleDragEnd: drag.handleDragEnd,
    handleDragMove: drag.handleDragMove,
    handleDragStart: drag.handleDragStart,
    handleFocusPanel,
    handleNewTab,
    handleResizeSplit,
    handleTogglePanelFocus,
    hasVerticalSplit: layout.root.type === "split" && layout.root.direction === "vertical",
    layout,
    resizingSplitId,
    sensors: drag.sensors,
    setResizingSplitId,
    tabById,
  };
}

function readLayout(key: string, tabIds: string[], preferredActiveTabId?: string | null) {
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

function persistLayout(key: string, layout: SpatialLayout) {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // Persistence is optional when browser storage is unavailable.
  }
}

function countRegions(node: SpatialLayout["root"]): number {
  return node.type === "group"
    ? 1
    : countRegions(node.children[0]) + countRegions(node.children[1]);
}
