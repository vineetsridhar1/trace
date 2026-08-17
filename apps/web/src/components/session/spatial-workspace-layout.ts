export type SpatialEdge = "left" | "right" | "top" | "bottom";
export type SpatialRowPosition = "full" | "top" | "bottom";
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
  ratio?: number;
  children: [SpatialNode, SpatialNode];
}

export type SpatialNode = SpatialTabGroup | SpatialSplit;

export interface SpatialLayout {
  root: SpatialNode;
  nextGroupNumber: number;
  nextSplitNumber: number;
}

export const MAX_SPATIAL_COLUMNS = 4;

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

export function setSpatialSplitRatio(
  layout: SpatialLayout,
  splitId: string,
  ratio: number,
): SpatialLayout {
  const nextRatio = Math.max(0.02, Math.min(0.98, ratio));
  const root = mapSpatialNodes(layout.root, (node) =>
    node.type === "split" && node.id === splitId ? { ...node, ratio: nextRatio } : node,
  );
  return root === layout.root ? layout : { ...layout, root };
}

export function getSpatialRowPositionForTab(
  node: SpatialNode,
  tabId: string,
): SpatialRowPosition | null {
  if (node.type !== "split" || node.direction !== "vertical") {
    return getSpatialGroups(node).some((group) => group.tabIds.includes(tabId)) ? "full" : null;
  }
  if (getSpatialGroups(node.children[0]).some((group) => group.tabIds.includes(tabId))) {
    return "top";
  }
  if (getSpatialGroups(node.children[1]).some((group) => group.tabIds.includes(tabId))) {
    return "bottom";
  }
  return null;
}

export function countSpatialColumnsInRow(
  node: SpatialNode,
  position: SpatialRowPosition,
): number {
  if (node.type !== "split" || node.direction !== "vertical") {
    return position === "full" ? countSpatialRegions(node) : 0;
  }
  if (position === "top") return countSpatialRegions(node.children[0]);
  if (position === "bottom") return countSpatialRegions(node.children[1]);
  return 0;
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
  targetRowPosition?: SpatialRowPosition,
): SpatialLayout {
  const sourceGroup = getSpatialGroups(layout.root).find((group) => group.tabIds.includes(tabId));
  if (!sourceGroup) return layout;

  const horizontal = edge === "left" || edge === "right";
  if (horizontal) {
    const sourceRowPosition = getSpatialRowPositionForTab(layout.root, tabId);
    const destination = targetRowPosition ?? sourceRowPosition;
    if (!destination) return layout;

    const withoutTab = removeTabFromSpatialNode(layout.root, sourceGroup.id, tabId);
    const targetRow = getSpatialRow(withoutTab, destination);
    if (!targetRow) return layout;
    const collapsedTargetRow = collapseEmptyGroups(targetRow);
    if (!collapsedTargetRow) return layout;
    const remainingGroups = getSpatialGroups(collapsedTargetRow);
    if (remainingGroups.length >= MAX_SPATIAL_COLUMNS) return layout;

    const newGroup = createSpatialGroup(layout.nextGroupNumber, tabId);
    const groups = edge === "left" ? [newGroup, ...remainingGroups] : [...remainingGroups, newGroup];
    const nextTargetRow = createFlatSpatialSplit(groups, "horizontal", layout.nextSplitNumber);
    const nextRoot = collapseEmptyGroups(
      replaceSpatialRowAtPosition(withoutTab, destination, nextTargetRow),
    );
    if (!nextRoot) return layout;
    return {
      root: nextRoot,
      nextGroupNumber: layout.nextGroupNumber + 1,
      nextSplitNumber: layout.nextSplitNumber + groups.length - 1,
    };
  }

  if (layout.root.type === "split" && layout.root.direction === "vertical") return layout;

  const withoutTab = removeTabFromSpatialNode(layout.root, sourceGroup.id, tabId);
  const remainingRoot = collapseEmptyGroups(withoutTab);
  if (!remainingRoot) return layout;
  const newGroup = createSpatialGroup(layout.nextGroupNumber, tabId);
  const newFirst = edge === "top";
  const children: [SpatialNode, SpatialNode] = newFirst
    ? [newGroup, remainingRoot]
    : [remainingRoot, newGroup];
  const nextRoot = createSplit(
    layout.nextSplitNumber,
    "vertical",
    children[0],
    children[1],
  );

  return {
    root: nextRoot,
    nextGroupNumber: layout.nextGroupNumber + 1,
    nextSplitNumber: layout.nextSplitNumber + 1,
  };
}

export function moveSpatialTab(
  layout: SpatialLayout,
  tabId: string,
  targetGroupId: string,
  targetIndex?: number,
  preserveEmptySource = false,
): SpatialLayout {
  const sourceGroup = getSpatialGroups(layout.root).find((group) => group.tabIds.includes(tabId));
  const targetGroup = findSpatialGroup(layout.root, targetGroupId);
  if (!sourceGroup || !targetGroup) return layout;
  const sourceIndex = sourceGroup.tabIds.indexOf(tabId);
  let insertionIndex = targetIndex ?? targetGroup.tabIds.length;
  if (sourceGroup.id === targetGroup.id) {
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    const nextIds = sourceGroup.tabIds.filter((id) => id !== tabId);
    const clampedIndex = Math.max(0, Math.min(insertionIndex, nextIds.length));
    nextIds.splice(clampedIndex, 0, tabId);
    if (nextIds.every((id, index) => id === sourceGroup.tabIds[index])) {
      if (preserveEmptySource) return layout;
      const collapsedRoot = collapseEmptyGroups(layout.root);
      return collapsedRoot ? { ...layout, root: collapsedRoot } : layout;
    }
    const root = mapGroups(layout.root, (group) =>
        group.id === sourceGroup.id ? { ...group, tabIds: nextIds, activeTabId: tabId } : group,
      );
    return { ...layout, root: preserveEmptySource ? root : (collapseEmptyGroups(root) ?? root) };
  }

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
      const nextIds = group.tabIds.filter((id) => id !== tabId);
      const clampedIndex = Math.max(0, Math.min(insertionIndex, nextIds.length));
      nextIds.splice(clampedIndex, 0, tabId);
      return {
        ...group,
        tabIds: nextIds,
        activeTabId: tabId,
      };
    }
    return group;
  });
  if (!preserveEmptySource) {
    root = collapseEmptyGroups(root) ?? createSpatialLayout([tabId], tabId).root;
  }
  return { ...layout, root };
}

export function applySpatialLayoutPreset(
  layout: SpatialLayout,
  preset: SpatialLayoutPreset,
): SpatialLayout {
  const currentGroups = getSpatialGroups(layout.root);
  const tabIds = currentGroups.flatMap((group) => group.tabIds);
  const preferredActiveTabId = currentGroups.find((group) => group.activeTabId)?.activeTabId;
  if (preset === "single") {
    return createSpatialLayout(tabIds, preferredActiveTabId);
  }
  if (tabIds.length < 2) return layout;

  if (preset === "rows") {
    if (layout.root.type === "split" && layout.root.direction === "vertical") {
      return normalizeSpatialLayout(layout);
    }
    return dockSpatialTab(layout, preferredActiveTabId ?? tabIds[tabIds.length - 1], "bottom");
  }

  if (layout.root.type === "split" && layout.root.direction === "vertical") {
    const topLayout: SpatialLayout = {
      root: layout.root.children[0],
      nextGroupNumber: layout.nextGroupNumber,
      nextSplitNumber: layout.nextSplitNumber,
    };
    if (getSpatialGroups(topLayout.root).flatMap((group) => group.tabIds).length < 2) return layout;
    const arrangedTop = applySpatialLayoutPreset(topLayout, preset);
    return {
      root: { ...layout.root, children: [arrangedTop.root, layout.root.children[1]] },
      nextGroupNumber: arrangedTop.nextGroupNumber,
      nextSplitNumber: arrangedTop.nextSplitNumber,
    };
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

  const root = createFlatSpatialSplit(groups, "horizontal", layout.nextSplitNumber);

  return {
    root,
    nextGroupNumber: layout.nextGroupNumber + groupsCreated,
    nextSplitNumber: layout.nextSplitNumber + groups.length - 1,
  };
}

export function normalizeSpatialLayout(layout: SpatialLayout): SpatialLayout {
  if (isConstrainedSpatialLayout(layout.root)) return layout;
  if (layout.root.type === "split" && layout.root.direction === "vertical") {
    const topGroups = constrainSpatialRowGroups(getSpatialGroups(layout.root.children[0]));
    const bottomGroups = constrainSpatialRowGroups(getSpatialGroups(layout.root.children[1]));
    const top = createFlatSpatialSplit(topGroups, "horizontal", layout.nextSplitNumber);
    const bottom = createFlatSpatialSplit(
      bottomGroups,
      "horizontal",
      layout.nextSplitNumber + Math.max(0, topGroups.length - 1),
    );
    return {
      root: { ...layout.root, children: [top, bottom] },
      nextGroupNumber: layout.nextGroupNumber,
      nextSplitNumber:
        layout.nextSplitNumber +
        Math.max(0, topGroups.length - 1) +
        Math.max(0, bottomGroups.length - 1),
    };
  }
  const groups = constrainSpatialRowGroups(getSpatialGroups(layout.root));
  return {
    root: createFlatSpatialSplit(groups, "horizontal", layout.nextSplitNumber),
    nextGroupNumber: layout.nextGroupNumber,
    nextSplitNumber: layout.nextSplitNumber + Math.max(0, groups.length - 1),
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
    (candidate.ratio === undefined ||
      (typeof candidate.ratio === "number" &&
        Number.isFinite(candidate.ratio) &&
        candidate.ratio > 0 &&
        candidate.ratio < 1)) &&
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

function mapSpatialNodes(
  node: SpatialNode,
  mapper: (node: SpatialNode) => SpatialNode,
): SpatialNode {
  const mappedChildren =
    node.type === "split"
      ? {
          ...node,
          children: [
            mapSpatialNodes(node.children[0], mapper),
            mapSpatialNodes(node.children[1], mapper),
          ] as [SpatialNode, SpatialNode],
        }
      : node;
  return mapper(mappedChildren);
}

function removeTabFromSpatialNode(
  node: SpatialNode,
  sourceGroupId: string,
  tabId: string,
): SpatialNode {
  return mapGroups(node, (group) => {
    if (group.id !== sourceGroupId) return group;
    const nextIds = group.tabIds.filter((id) => id !== tabId);
    return {
      ...group,
      tabIds: nextIds,
      activeTabId: resolveActiveTab(nextIds, group.activeTabId === tabId ? null : group.activeTabId),
    };
  });
}

function getSpatialRow(
  root: SpatialNode,
  position: SpatialRowPosition,
): SpatialNode | null {
  if (root.type !== "split" || root.direction !== "vertical") {
    return position === "full" ? root : null;
  }
  if (position === "top") return root.children[0];
  if (position === "bottom") return root.children[1];
  return null;
}

function replaceSpatialRowAtPosition(
  root: SpatialNode,
  position: SpatialRowPosition,
  replacement: SpatialNode,
): SpatialNode {
  if (root.type !== "split" || root.direction !== "vertical") {
    return position === "full" ? replacement : root;
  }
  if (position === "top") return { ...root, children: [replacement, root.children[1]] };
  if (position === "bottom") return { ...root, children: [root.children[0], replacement] };
  return root;
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
    ratio:
      getSpatialAxisSpan(first, direction) /
      (getSpatialAxisSpan(first, direction) + getSpatialAxisSpan(second, direction)),
    children: [first, second],
  };
}

function createSpatialGroup(number: number, tabId: string): SpatialTabGroup {
  return {
    type: "group",
    id: `region-${number}`,
    tabIds: [tabId],
    activeTabId: tabId,
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

function constrainSpatialRowGroups(groups: SpatialTabGroup[]): SpatialTabGroup[] {
  const constrained = groups.slice(0, MAX_SPATIAL_COLUMNS).map((group) => ({
    ...group,
    tabIds: [...group.tabIds],
  }));
  if (groups.length <= MAX_SPATIAL_COLUMNS) return constrained;
  const overflow = mergeSpatialGroups(groups.slice(MAX_SPATIAL_COLUMNS));
  const last = constrained[constrained.length - 1];
  last.tabIds.push(...overflow.tabIds);
  last.activeTabId = resolveActiveTab(last.tabIds, last.activeTabId);
  return constrained;
}

function isConstrainedSpatialLayout(root: SpatialNode): boolean {
  if (root.type === "split" && root.direction === "vertical") {
    return root.children.every(
      (row) => isFlatSpatialRow(row) && countSpatialRegions(row) <= MAX_SPATIAL_COLUMNS,
    );
  }
  return isFlatSpatialRow(root) && countSpatialRegions(root) <= MAX_SPATIAL_COLUMNS;
}

function isFlatSpatialRow(node: SpatialNode): boolean {
  if (node.type === "group") return true;
  return node.direction === "horizontal" && node.children.every(isFlatSpatialRow);
}
