import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateSpatialTab,
  balanceSpatialGroups,
  createSpatialLayout,
  focusSpatialGroup,
  getSpatialGroups,
  insertSpatialTab,
  isSpatialLayout,
  joinSpatialGroup,
  normalizeSpatialLayout,
  replaceSpatialTab,
  setSpatialSplitRatio,
  splitSpatialGroup,
  syncSpatialTabs,
  type SpatialLayout,
} from "./spatial-workspace-layout";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { useSpatialWorkspaceDrag } from "./useSpatialWorkspaceDrag";
import { useRegisterCommands } from "../../hooks/useRegisterCommands";
import type { RegisteredCommand } from "../../stores/command-registry";
import { requestBrowserAddressFocus } from "./browser-address-focus";

interface SpatialWorkspaceControllerOptions {
  persistenceKey: string;
  tabs: SpatialWorkspaceTab[];
  preferredActiveTabId?: string | null;
  foregroundTabId?: string | null;
  tabReplacements: Record<string, string>;
  onTabReplacementsApplied?: (sourceTabIds: string[]) => void;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
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
  onCloseTab,
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
  const activeGroupIdRef = useRef<string | null>(null);
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
      activeGroupIdRef.current = groupId;
      onActivateTab(tabId);
    },
    [onActivateTab],
  );

  const handleResizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((current) => setSpatialSplitRatio(current, splitId, ratio));
  }, []);
  const handleFocusPanel = useCallback((groupId: string) => {
    activeGroupIdRef.current = groupId;
    setLayout((current) =>
      current.focusedGroupId ? focusSpatialGroup(current, groupId) : current,
    );
  }, []);
  const handleTogglePanelFocus = useCallback((groupId: string) => {
    activeGroupIdRef.current = groupId;
    setLayout((current) =>
      current.focusedGroupId ? balanceSpatialGroups(current) : focusSpatialGroup(current, groupId),
    );
  }, []);
  const handleNewTab = useCallback(
    (groupId: string) => {
      const tabId = onNewTab(groupId);
      setLayout((current) => insertSpatialTab(current, tabId, groupId));
      activeGroupIdRef.current = groupId;
    },
    [onNewTab],
  );
  const handleSplit = useCallback(() => {
    const activeGroup = getActiveGroup(layoutRef.current, activeGroupIdRef.current);
    if (!activeGroup) return;
    const tabId = onNewTab(activeGroup.id);
    setLayout((current) => {
      activeGroupIdRef.current = `region-${current.nextGroupNumber}`;
      return splitSpatialGroup(current, activeGroup.id, tabId);
    });
  }, [onNewTab]);
  const handleJoin = useCallback(() => {
    setLayout((current) => {
      const activeGroup = getActiveGroup(current, activeGroupIdRef.current);
      return activeGroup ? joinSpatialGroup(current, activeGroup.id) : current;
    });
  }, []);
  const handleToggleActiveGroupFocus = useCallback(() => {
    setLayout((current) => {
      const activeGroup = getActiveGroup(current, activeGroupIdRef.current);
      if (!activeGroup) return current;
      return current.focusedGroupId
        ? balanceSpatialGroups(current)
        : focusSpatialGroup(current, activeGroup.id);
    });
  }, []);
  const handleFocusActiveBrowserAddress = useCallback(() => {
    const activeTabId = getActiveGroup(
      layoutRef.current,
      activeGroupIdRef.current,
    )?.activeTabId;
    if (activeTabId?.startsWith("draft:")) requestBrowserAddressFocus(activeTabId);
  }, []);
  const handleFocusGroup = useCallback(
    (index: number) => {
      const group = getSpatialGroups(layoutRef.current.root)[index];
      const tabId = group?.activeTabId;
      if (!group || !tabId) return;
      handleActivate(group.id, tabId);
    },
    [handleActivate],
  );
  const handleCycleTab = useCallback(
    (direction: 1 | -1) => {
      const groups = getSpatialGroups(layoutRef.current.root);
      const tabIds = groups.flatMap((group) => group.tabIds);
      const activeTabId = getActiveGroup(layoutRef.current, activeGroupIdRef.current)?.activeTabId;
      const currentIndex = activeTabId ? tabIds.indexOf(activeTabId) : -1;
      const tabId = tabIds[(currentIndex + direction + tabIds.length) % tabIds.length];
      const group = groups.find((candidate) => candidate.tabIds.includes(tabId));
      if (group && tabId) handleActivate(group.id, tabId);
    },
    [handleActivate],
  );

  const workspaceCommands = useMemo<RegisteredCommand[]>(
    () => [
      {
        id: "session.close-tab",
        title: "Close tab",
        group: "Workspace",
        run: () => {
          const tabId = getActiveGroup(
            layoutRef.current,
            activeGroupIdRef.current,
          )?.activeTabId;
          if (tabId) onCloseTab(tabId);
        },
        shortcut: { key: "w", mod: true },
      },
      {
        id: "workspace.new-tab",
        title: "New workspace tab",
        group: "Workspace",
        run: () => {
          const activeGroup = getActiveGroup(layoutRef.current, activeGroupIdRef.current);
          if (activeGroup) handleNewTab(activeGroup.id);
        },
        shortcut: { key: "t", mod: true },
      },
      {
        id: "workspace.split-pane",
        title: "Split active pane",
        group: "Workspace",
        run: handleSplit,
        shortcut: { key: "\\", code: "Backslash", mod: true },
      },
      {
        id: "workspace.join-pane",
        title: "Join active pane",
        group: "Workspace",
        run: handleJoin,
        shortcut: { key: "\\", code: "Backslash", mod: true, shift: true },
      },
      {
        id: "workspace.toggle-spotlight",
        title: "Toggle pane spotlight",
        group: "Workspace",
        run: handleToggleActiveGroupFocus,
        shortcut: { key: "Enter", mod: true, shift: true },
      },
      {
        id: "workspace.next-tab",
        title: "Next workspace tab",
        group: "Workspace",
        run: () => handleCycleTab(1),
        shortcut: { key: "Tab", ctrl: true },
      },
      {
        id: "workspace.previous-tab",
        title: "Previous workspace tab",
        group: "Workspace",
        run: () => handleCycleTab(-1),
        shortcut: { key: "Tab", ctrl: true, shift: true },
      },
      ...[1, 2, 3, 4].map((groupNumber) => ({
        id: `workspace.focus-group-${groupNumber}`,
        title: `Focus tab group ${groupNumber}`,
        group: "Workspace",
        run: () => handleFocusGroup(groupNumber - 1),
        shortcut: { key: String(groupNumber), mod: true },
      })),
      {
        id: "workspace.focus-browser-address",
        title: "Focus browser address",
        group: "Workspace",
        run: handleFocusActiveBrowserAddress,
        shortcut: { key: "l", mod: true },
      },
    ],
    [
      handleCycleTab,
      onCloseTab,
      handleFocusActiveBrowserAddress,
      handleFocusGroup,
      handleJoin,
      handleNewTab,
      handleSplit,
      handleToggleActiveGroupFocus,
    ],
  );
  useRegisterCommands(workspaceCommands);

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
    handleSplit,
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

function getActiveGroup(layout: SpatialLayout, activeGroupId: string | null) {
  const groups = getSpatialGroups(layout.root);
  return groups.find((group) => group.id === activeGroupId) ?? groups[0];
}
