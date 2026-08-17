export type SpatialEdge = "left" | "right" | "top" | "bottom";
export type SpatialLayoutPreset = "single" | "columns" | "rows" | "grid";

export interface SpatialTabGroup {
  type: "group";
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

export interface SpatialSplit {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  children: [SpatialNode, SpatialNode];
}

export type SpatialNode = SpatialTabGroup | SpatialSplit;

export interface SpatialLayout {
  root: SpatialNode;
  nextGroupNumber: number;
  nextSplitNumber: number;
}

export const MAX_SPATIAL_REGIONS = 4;

export function createSpatialLayout(tabIds: string[], activeTabId?: string | null): SpatialLayout {
  return {
    root: {
      type: "group",
      id: "region-1",
      tabIds,
      activeTabId: resolveActiveTab(tabIds, activeTabId),
    },
    nextGroupNumber: 2,
    nextSplitNumber: 1,
  };
}

export function countSpatialRegions(node: SpatialNode): number {
  if (node.type === "group") return 1;
  return countSpatialRegions(node.children[0]) + countSpatialRegions(node.children[1]);
}

export function getSpatialGroups(node: SpatialNode): SpatialTabGroup[] {
  if (node.type === "group") return [node];
  return [...getSpatialGroups(node.children[0]), ...getSpatialGroups(node.children[1])];
}

export function findSpatialGroup(node: SpatialNode, groupId: string): SpatialTabGroup | null {
  if (node.type === "group") return node.id === groupId ? node : null;
  return findSpatialGroup(node.children[0], groupId) ?? findSpatialGroup(node.children[1], groupId);
}

export function activateSpatialTab(
  layout: SpatialLayout,
  groupId: string,
  tabId: string,
): SpatialLayout {
  return {
    ...layout,
    root: mapGroups(layout.root, (group) =>
      group.id === groupId && group.tabIds.includes(tabId)
        ? { ...group, activeTabId: tabId }
        : group,
    ),
  };
}

export function syncSpatialTabs(
  layout: SpatialLayout,
  tabIds: string[],
  preferredActiveTabId?: string | null,
): SpatialLayout {
  const available = new Set(tabIds);
  const assigned = new Set<string>();
  let root = mapGroups(layout.root, (group) => {
    const nextIds = group.tabIds.filter((id) => available.has(id) && !assigned.has(id));
    nextIds.forEach((id) => assigned.add(id));
    return {
      ...group,
      tabIds: nextIds,
      activeTabId: resolveActiveTab(nextIds, group.activeTabId),
    };
  });

  const missing = tabIds.filter((id) => !assigned.has(id));
  if (missing.length > 0) {
    const firstGroup = getSpatialGroups(root)[0];
    root = mapGroups(root, (group) =>
      group.id === firstGroup.id
        ? {
            ...group,
            tabIds: [...group.tabIds, ...missing],
            activeTabId: resolveActiveTab(
              [...group.tabIds, ...missing],
              preferredActiveTabId ?? group.activeTabId,
            ),
          }
        : group,
    );
  }

  root = collapseEmptyGroups(root) ?? createSpatialLayout(tabIds, preferredActiveTabId).root;
  return { ...layout, root };
}

export function dockSpatialTab(
  layout: SpatialLayout,
  tabId: string,
  targetGroupId: string,
  edge: SpatialEdge,
): SpatialLayout {
  if (countSpatialRegions(layout.root) >= MAX_SPATIAL_REGIONS) return layout;
  const sourceGroup = getSpatialGroups(layout.root).find((group) => group.tabIds.includes(tabId));
  const targetGroup = findSpatialGroup(layout.root, targetGroupId);
  if (!sourceGroup || !targetGroup) return layout;

  const withoutTab = mapGroups(layout.root, (group) => {
    if (group.id !== sourceGroup.id) return group;
    const nextIds = group.tabIds.filter((id) => id !== tabId);
    return {
      ...group,
      tabIds: nextIds,
      activeTabId: resolveActiveTab(nextIds, group.activeTabId === tabId ? null : group.activeTabId),
    };
  });

  const newGroup: SpatialTabGroup = {
    type: "group",
    id: `region-${layout.nextGroupNumber}`,
    tabIds: [tabId],
    activeTabId: tabId,
  };
  const horizontal = edge === "left" || edge === "right";
  const newFirst = edge === "left" || edge === "top";
  const nextRoot = replaceGroup(withoutTab, targetGroupId, (currentTarget) => ({
    type: "split",
    id: `split-${layout.nextSplitNumber}`,
    direction: horizontal ? "horizontal" : "vertical",
    children: newFirst ? [newGroup, currentTarget] : [currentTarget, newGroup],
  }));

  return {
    root: collapseEmptyGroups(nextRoot) ?? newGroup,
    nextGroupNumber: layout.nextGroupNumber + 1,
    nextSplitNumber: layout.nextSplitNumber + 1,
  };
}

export function moveSpatialTab(
  layout: SpatialLayout,
  tabId: string,
  targetGroupId: string,
): SpatialLayout {
  const sourceGroup = getSpatialGroups(layout.root).find((group) => group.tabIds.includes(tabId));
  const targetGroup = findSpatialGroup(layout.root, targetGroupId);
  if (!sourceGroup || !targetGroup) return layout;
  if (sourceGroup.id === targetGroup.id) return activateSpatialTab(layout, targetGroupId, tabId);

  let root = mapGroups(layout.root, (group) => {
    if (group.id === sourceGroup.id) {
      const nextIds = group.tabIds.filter((id) => id !== tabId);
      return {
        ...group,
        tabIds: nextIds,
        activeTabId: resolveActiveTab(nextIds, group.activeTabId === tabId ? null : group.activeTabId),
      };
    }
    if (group.id === targetGroup.id) {
      return {
        ...group,
        tabIds: group.tabIds.includes(tabId) ? group.tabIds : [...group.tabIds, tabId],
        activeTabId: tabId,
      };
    }
    return group;
  });
  root = collapseEmptyGroups(root) ?? createSpatialLayout([tabId], tabId).root;
  return { ...layout, root };
}

export function applySpatialLayoutPreset(
  layout: SpatialLayout,
  preset: SpatialLayoutPreset,
): SpatialLayout {
  const currentGroups = getSpatialGroups(layout.root);
  const tabIds = currentGroups.flatMap((group) => group.tabIds);
  const preferredActiveTabId = currentGroups.find((group) => group.activeTabId)?.activeTabId;
  if (preset === "single" || tabIds.length < 2) {
    return createSpatialLayout(tabIds, preferredActiveTabId);
  }

  const requestedRegions = Math.min(preset === "grid" ? 4 : 2, tabIds.length);
  const groups = currentGroups.map((group) => ({
    ...group,
    tabIds: [...group.tabIds],
  }));

  if (groups.length > requestedRegions) {
    const retainedGroups = groups.slice(0, requestedRegions);
    const overflowTabs = groups.slice(requestedRegions).flatMap((group) => group.tabIds);
    const lastGroup = retainedGroups[retainedGroups.length - 1];
    lastGroup.tabIds.push(...overflowTabs);
    lastGroup.activeTabId = resolveActiveTab(lastGroup.tabIds, lastGroup.activeTabId);
    groups.splice(0, groups.length, ...retainedGroups);
  }

  let groupsCreated = 0;
  while (groups.length < requestedRegions) {
    const source = [...groups]
      .filter((group) => group.tabIds.length > 1)
      .sort((left, right) => right.tabIds.length - left.tabIds.length)[0];
    if (!source) break;
    const movedTabId = source.activeTabId ?? source.tabIds[source.tabIds.length - 1];
    source.tabIds = source.tabIds.filter((tabId) => tabId !== movedTabId);
    source.activeTabId = resolveActiveTab(source.tabIds, null);
    groups.push({
      type: "group",
      id: `region-${layout.nextGroupNumber + groupsCreated}`,
      tabIds: [movedTabId],
      activeTabId: movedTabId,
    });
    groupsCreated += 1;
  }

  let root: SpatialNode;
  if (preset === "columns") {
    root = createSplit(layout.nextSplitNumber, "horizontal", groups[0], groups[1]);
  } else if (preset === "rows") {
    root = createSplit(layout.nextSplitNumber, "vertical", groups[0], groups[1]);
  } else if (groups.length === 2) {
    root = createSplit(layout.nextSplitNumber, "horizontal", groups[0], groups[1]);
  } else if (groups.length === 3) {
    const right = createSplit(layout.nextSplitNumber + 1, "vertical", groups[1], groups[2]);
    root = createSplit(layout.nextSplitNumber, "horizontal", groups[0], right);
  } else {
    const left = createSplit(layout.nextSplitNumber + 1, "vertical", groups[0], groups[2]);
    const right = createSplit(layout.nextSplitNumber + 2, "vertical", groups[1], groups[3]);
    root = createSplit(layout.nextSplitNumber, "horizontal", left, right);
  }

  return {
    root,
    nextGroupNumber: layout.nextGroupNumber + groupsCreated,
    nextSplitNumber: layout.nextSplitNumber + groups.length - 1,
  };
}

export function isSpatialLayout(value: unknown): value is SpatialLayout {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nextGroupNumber === "number" &&
    typeof candidate.nextSplitNumber === "number" &&
    isSpatialNode(candidate.root)
  );
}

function isSpatialNode(value: unknown): value is SpatialNode {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "group") {
    return (
      typeof candidate.id === "string" &&
      Array.isArray(candidate.tabIds) &&
      candidate.tabIds.every((id) => typeof id === "string") &&
      (candidate.activeTabId === null || typeof candidate.activeTabId === "string")
    );
  }
  return (
    candidate.type === "split" &&
    typeof candidate.id === "string" &&
    (candidate.direction === "horizontal" || candidate.direction === "vertical") &&
    Array.isArray(candidate.children) &&
    candidate.children.length === 2 &&
    candidate.children.every(isSpatialNode)
  );
}

function resolveActiveTab(tabIds: string[], requested?: string | null): string | null {
  return requested && tabIds.includes(requested) ? requested : (tabIds[0] ?? null);
}

function mapGroups(node: SpatialNode, mapper: (group: SpatialTabGroup) => SpatialTabGroup): SpatialNode {
  if (node.type === "group") return mapper(node);
  return {
    ...node,
    children: [mapGroups(node.children[0], mapper), mapGroups(node.children[1], mapper)],
  };
}

function replaceGroup(
  node: SpatialNode,
  groupId: string,
  replacement: (group: SpatialTabGroup) => SpatialNode,
): SpatialNode {
  if (node.type === "group") return node.id === groupId ? replacement(node) : node;
  return {
    ...node,
    children: [
      replaceGroup(node.children[0], groupId, replacement),
      replaceGroup(node.children[1], groupId, replacement),
    ],
  };
}

function collapseEmptyGroups(node: SpatialNode): SpatialNode | null {
  if (node.type === "group") return node.tabIds.length > 0 ? node : null;
  const first = collapseEmptyGroups(node.children[0]);
  const second = collapseEmptyGroups(node.children[1]);
  if (!first) return second;
  if (!second) return first;
  return { ...node, children: [first, second] };
}

function createSplit(
  number: number,
  direction: SpatialSplit["direction"],
  first: SpatialNode,
  second: SpatialNode,
): SpatialSplit {
  return {
    type: "split",
    id: `split-${number}`,
    direction,
    children: [first, second],
  };
}
