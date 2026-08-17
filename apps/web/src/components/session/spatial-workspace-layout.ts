export type SpatialEdge = "left" | "right" | "top" | "bottom";
export type SpatialLayoutPreset =
  | "single"
  | "columns"
  | "three-columns"
  | "four-columns"
  | "rows";

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

export function getSpatialAxisSpan(
  node: SpatialNode,
  direction: SpatialSplit["direction"],
): number {
  if (node.type === "group" || node.direction !== direction) return 1;
  return (
    getSpatialAxisSpan(node.children[0], direction) +
    getSpatialAxisSpan(node.children[1], direction)
  );
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

export function insertSpatialTab(
  layout: SpatialLayout,
  tabId: string,
  targetGroupId: string,
): SpatialLayout {
  const sourceGroup = getSpatialGroups(layout.root).find((group) => group.tabIds.includes(tabId));
  if (sourceGroup) return moveSpatialTab(layout, tabId, targetGroupId);
  if (!findSpatialGroup(layout.root, targetGroupId)) return layout;

  return {
    ...layout,
    root: mapGroups(layout.root, (group) =>
      group.id === targetGroupId
        ? { ...group, tabIds: [...group.tabIds, tabId], activeTabId: tabId }
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
  edge: SpatialEdge,
): SpatialLayout {
  const sourceGroup = getSpatialGroups(layout.root).find((group) => group.tabIds.includes(tabId));
  if (!sourceGroup) return layout;

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
  let remainingGroups = getSpatialGroups(collapseEmptyGroups(withoutTab) ?? newGroup).filter(
    (group) => group.id !== newGroup.id,
  );
  if (remainingGroups.length === 0) return layout;

  if (!horizontal) {
    remainingGroups = [mergeSpatialGroups(remainingGroups)];
  } else if (remainingGroups.length >= MAX_SPATIAL_REGIONS) {
    return layout;
  }

  const groups = newFirst ? [newGroup, ...remainingGroups] : [...remainingGroups, newGroup];
  const nextRoot = createFlatSpatialSplit(
    groups,
    horizontal ? "horizontal" : "vertical",
    layout.nextSplitNumber,
  );

  return {
    root: nextRoot,
    nextGroupNumber: layout.nextGroupNumber + 1,
    nextSplitNumber: layout.nextSplitNumber + groups.length - 1,
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

  const requestedRegions = Math.min(
    preset === "four-columns" ? 4 : preset === "three-columns" ? 3 : 2,
    tabIds.length,
  );
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
  root = createFlatSpatialSplit(
    groups,
    preset === "rows" ? "vertical" : "horizontal",
    layout.nextSplitNumber,
  );

  return {
    root,
    nextGroupNumber: layout.nextGroupNumber + groupsCreated,
    nextSplitNumber: layout.nextSplitNumber + groups.length - 1,
  };
}

export function normalizeSpatialLayout(layout: SpatialLayout): SpatialLayout {
  const groups = getSpatialGroups(layout.root);
  if (groups.length < 2) return layout;
  if (layout.root.type === "split" && layout.root.direction === "vertical") {
    return applySpatialLayoutPreset(layout, "rows");
  }
  const preset: SpatialLayoutPreset =
    groups.length >= 4 ? "four-columns" : groups.length === 3 ? "three-columns" : "columns";
  return applySpatialLayoutPreset(layout, preset);
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

function createFlatSpatialSplit(
  groups: SpatialTabGroup[],
  direction: SpatialSplit["direction"],
  firstSplitNumber: number,
): SpatialNode {
  if (groups.length === 1) return groups[0];
  let root: SpatialNode = groups[groups.length - 1];
  for (let index = groups.length - 2; index >= 0; index -= 1) {
    root = createSplit(firstSplitNumber + groups.length - 2 - index, direction, groups[index], root);
  }
  return root;
}

function mergeSpatialGroups(groups: SpatialTabGroup[]): SpatialTabGroup {
  const tabIds = groups.flatMap((group) => group.tabIds);
  const requestedActiveTabId = groups.find((group) => group.activeTabId)?.activeTabId;
  return {
    ...groups[0],
    tabIds,
    activeTabId: resolveActiveTab(tabIds, requestedActiveTabId),
  };
}
