import { useState, useRef, useCallback } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  closestCenter,
  type CollisionDetection,
  pointerWithin,
  getFirstCollision,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useEntityStore } from "../stores/entity";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
import type { TopLevelItem } from "./useSidebarData";
import { applyOptimisticPatches } from "../lib/optimistic-entity";

const MOVE_CHANNEL_MUTATION = gql`
  mutation MoveChannel($input: MoveChannelInput!) {
    moveChannel(input: $input) { id }
  }
`;

const UPDATE_CHANNEL_GROUP_POSITION_MUTATION = gql`
  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {
    updateChannelGroup(id: $id, input: $input) { id }
  }
`;

const REORDER_CHANNELS_MUTATION = gql`
  mutation ReorderChannels($input: ReorderChannelsInput!) {
    reorderChannels(input: $input) { id }
  }
`;

/** Container IDs */
export const TOP_LEVEL_CONTAINER = "top-level";
export function groupContainerId(groupId: string) {
  return `group-container:${groupId}`;
}

/** Extract sortable item IDs from top-level items */
export function topLevelSortableIds(items: TopLevelItem[]): string[] {
  return items.map((item) =>
    item.kind === "channel" ? `channel:${item.id}` : `group:${item.id}`
  );
}

/** Extract sortable item IDs for a group's channels */
export function groupSortableIds(channelIds: string[]): string[] {
  return channelIds.map((id) => `channel:${id}`);
}

/** Parse a sortable ID back to type + entity ID */
export function parseSortableId(sortableId: string): { type: "channel" | "group"; id: string } | null {
  if (sortableId.startsWith("channel:")) return { type: "channel", id: sortableId.slice(8) };
  if (sortableId.startsWith("group:")) return { type: "group", id: sortableId.slice(6) };
  return null;
}

export interface DragItemState {
  type: "channel" | "group";
  id: string;
  name: string;
}

/** Find which container a sortable ID belongs to */
function findContainer({
  sortableId,
  topLevelItems,
  channelIdsByGroup,
}: {
  sortableId: string;
  topLevelItems: TopLevelItem[];
  channelIdsByGroup: Record<string, string[]>;
}): string | null {
  const parsed = parseSortableId(sortableId);
  if (!parsed) return null;

  // Check if it's a top-level item
  const isTopLevel = topLevelItems.some(
    (item) =>
      (parsed.type === "channel" && item.kind === "channel" && item.id === parsed.id) ||
      (parsed.type === "group" && item.kind === "group" && item.id === parsed.id)
  );
  if (isTopLevel) return TOP_LEVEL_CONTAINER;

  // Check groups
  if (parsed.type === "channel") {
    for (const [groupId, ids] of Object.entries(channelIdsByGroup)) {
      if (ids.includes(parsed.id)) return groupContainerId(groupId);
    }
  }

  return null;
}

/** Resolve container for a sortable/container ID, handling container IDs directly */
function resolveContainer(
  id: string,
  topLevelItems: TopLevelItem[],
  channelIdsByGroup: Record<string, string[]>,
): string | null {
  if (id === TOP_LEVEL_CONTAINER) return TOP_LEVEL_CONTAINER;
  if (id.startsWith("group-container:")) return id;
  return findContainer({ sortableId: id, topLevelItems, channelIdsByGroup });
}

/** Deep-copy group channel lists */
function cloneGroups(groups: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, [...v]]));
}

export function useChannelDnd({
  activeOrgId,
  topLevelItems,
  channelIdsByGroup,
  channelsById,
  channelGroupsById,
}: {
  activeOrgId: string | null;
  topLevelItems: TopLevelItem[];
  channelIdsByGroup: Record<string, string[]>;
  channelsById: Record<string, Channel>;
  channelGroupsById: Record<string, ChannelGroup>;
}) {
  const [dragItem, setDragItem] = useState<DragItemState | null>(null);

  // Track the items during a drag for cross-container moves
  const [activeTopLevel, setActiveTopLevel] = useState<TopLevelItem[] | null>(null);
  const [activeGroupChannels, setActiveGroupChannels] = useState<Record<string, string[]> | null>(null);

  // Snapshot the original positions before drag for reverting on cancel
  const originalRef = useRef<{
    topLevel: TopLevelItem[];
    groups: Record<string, string[]>;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // The current items (either mid-drag state or source of truth)
  const currentTopLevel = activeTopLevel ?? topLevelItems;
  const currentGroupChannels = activeGroupChannels ?? channelIdsByGroup;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseSortableId(String(event.active.id));
    if (!parsed) return;

    if (parsed.type === "channel") {
      const channel = useEntityStore.getState().channels[parsed.id];
      setDragItem({ type: "channel", id: parsed.id, name: channel?.name ?? "Channel" });
    } else {
      const group = useEntityStore.getState().channelGroups[parsed.id];
      setDragItem({ type: "group", id: parsed.id, name: group?.name ?? "Group" });
    }

    // Snapshot current state
    const snapshotTopLevel = [...topLevelItems];
    const snapshotGroups = cloneGroups(channelIdsByGroup);
    originalRef.current = { topLevel: snapshotTopLevel, groups: snapshotGroups };
    setActiveTopLevel([...snapshotTopLevel]);
    setActiveGroupChannels(cloneGroups(snapshotGroups));
  }, [topLevelItems, channelIdsByGroup]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !activeTopLevel || !activeGroupChannels) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeParsed = parseSortableId(activeId);
    if (!activeParsed) return;

    // Groups can only reorder at top level, not move into other groups
    if (activeParsed.type === "group") return;

    const activeContainer = resolveContainer(activeId, activeTopLevel, activeGroupChannels);
    const overContainer = resolveContainer(overId, activeTopLevel, activeGroupChannels);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // Moving between containers
    const channelId = activeParsed.id;
    const nextTopLevel = [...activeTopLevel];
    const nextGroups = cloneGroups(activeGroupChannels);

    // Remove from source
    if (activeContainer === TOP_LEVEL_CONTAINER) {
      const idx = nextTopLevel.findIndex((i) => i.kind === "channel" && i.id === channelId);
      if (idx !== -1) nextTopLevel.splice(idx, 1);
    } else {
      const srcGroupId = activeContainer.replace("group-container:", "");
      const srcList = nextGroups[srcGroupId];
      if (srcList) {
        const idx = srcList.indexOf(channelId);
        if (idx !== -1) srcList.splice(idx, 1);
      }
    }

    // Add to destination
    if (overContainer === TOP_LEVEL_CONTAINER) {
      // Find insertion index based on overId
      const overParsed = parseSortableId(overId);
      let insertIdx = nextTopLevel.length;
      if (overParsed) {
        const overIdx = nextTopLevel.findIndex(
          (i) =>
            (overParsed.type === "channel" && i.kind === "channel" && i.id === overParsed.id) ||
            (overParsed.type === "group" && i.kind === "group" && i.id === overParsed.id)
        );
        if (overIdx !== -1) insertIdx = overIdx;
      }
      nextTopLevel.splice(insertIdx, 0, { kind: "channel", id: channelId, position: insertIdx });
    } else {
      const destGroupId = overContainer.replace("group-container:", "");
      if (!nextGroups[destGroupId]) nextGroups[destGroupId] = [];
      const destList = nextGroups[destGroupId];
      // Find insertion index
      const overParsed = parseSortableId(overId);
      let insertIdx = destList.length;
      if (overParsed?.type === "channel") {
        const overIdx = destList.indexOf(overParsed.id);
        if (overIdx !== -1) insertIdx = overIdx;
      }
      destList.splice(insertIdx, 0, channelId);
    }

    setActiveTopLevel(nextTopLevel);
    setActiveGroupChannels(nextGroups);
  }, [activeTopLevel, activeGroupChannels]);

  async function persistTopLevelOrder(items: TopLevelItem[]) {
    const optimisticPatches: Array<{
      type: "channels" | "channelGroups";
      id: string;
      data: Partial<Channel> | Partial<ChannelGroup>;
    }> = [];
    const updates: Array<Promise<unknown>> = [];

    for (const [index, item] of items.entries()) {
      if (item.kind === "channel") {
        const channel = channelsById[item.id];
        if (channel?.groupId === null && (channel?.position ?? -1) === index) continue;
        optimisticPatches.push({
          type: "channels",
          id: item.id,
          data: { groupId: null, position: index } as Partial<Channel>,
        });
        updates.push(
          client.mutation(MOVE_CHANNEL_MUTATION, {
            input: { channelId: item.id, groupId: null, position: index },
          }).toPromise()
        );
      } else {
        const group = channelGroupsById[item.id];
        if (!group || (group.position ?? -1) === index) continue;
        optimisticPatches.push({
          type: "channelGroups",
          id: item.id,
          data: { position: index } as Partial<ChannelGroup>,
        });
        updates.push(
          client.mutation(UPDATE_CHANNEL_GROUP_POSITION_MUTATION, {
            id: item.id, input: { position: index },
          }).toPromise()
        );
      }
    }

    const rollback = applyOptimisticPatches(optimisticPatches);
    try {
      const results = await Promise.all(updates);
      for (const result of results as Array<{ error?: unknown }>) {
        if (result?.error) throw result.error;
      }
    } catch (error) {
      rollback();
      throw error;
    }
  }

  async function persistGroupOrder(groupId: string, nextChannelIds: string[]) {
    const rollback = applyOptimisticPatches(
      nextChannelIds.map((id, index) => ({
        type: "channels" as const,
        id,
        data: { groupId, position: index } as Partial<Channel>,
      })),
    );

    try {
      const result = await client.mutation(REORDER_CHANNELS_MUTATION, {
        input: { groupId, channelIds: nextChannelIds },
      }).toPromise();
      if (result.error) throw result.error;
    } catch (error) {
      rollback();
      throw error;
    }
  }

  const clearDragState = useCallback(() => {
    setDragItem(null);
    setActiveTopLevel(null);
    setActiveGroupChannels(null);
    originalRef.current = null;
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !activeOrgId || !activeTopLevel || !activeGroupChannels) {
      clearDragState();
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeParsed = parseSortableId(activeId);
    if (!activeParsed) {
      clearDragState();
      return;
    }

    const activeContainer = resolveContainer(activeId, activeTopLevel, activeGroupChannels);
    const overContainer = resolveContainer(overId, activeTopLevel, activeGroupChannels);

    // Same-container reorder
    if (activeContainer && activeContainer === overContainer && activeId !== overId) {
      if (activeContainer === TOP_LEVEL_CONTAINER) {
        const oldIndex = activeTopLevel.findIndex((i: TopLevelItem) =>
          activeParsed.type === "channel"
            ? i.kind === "channel" && i.id === activeParsed.id
            : i.kind === "group" && i.id === activeParsed.id
        );
        const overParsed = parseSortableId(overId);
        const newIndex = overParsed
          ? activeTopLevel.findIndex((i: TopLevelItem) =>
              overParsed.type === "channel"
                ? i.kind === "channel" && i.id === overParsed.id
                : i.kind === "group" && i.id === overParsed.id
            )
          : -1;
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(activeTopLevel, oldIndex, newIndex);
          try {
            await persistTopLevelOrder(reordered);
          } catch (error) {
            console.error("Failed to persist top-level channel order:", error);
          } finally {
            clearDragState();
          }
          return;
        }
      } else {
        const groupId = activeContainer.replace("group-container:", "");
        const list = activeGroupChannels[groupId] ?? [];
        if (activeParsed.type === "channel") {
          const overParsed = parseSortableId(overId);
          if (overParsed?.type === "channel") {
            const oldIndex = list.indexOf(activeParsed.id);
            const newIndex = list.indexOf(overParsed.id);
            if (oldIndex !== -1 && newIndex !== -1) {
              const reordered = arrayMove(list, oldIndex, newIndex);
              try {
                await persistGroupOrder(groupId, reordered);
              } catch (error) {
                console.error("Failed to persist grouped channel order:", error);
              } finally {
                clearDragState();
              }
              return;
            }
          }
        }
      }
    }

    // Cross-container move was already handled in onDragOver
    // Just persist the current state
    const finalTopLevel = activeTopLevel;
    const finalGroups = activeGroupChannels;
    const orig = originalRef.current;

    if (!orig) {
      clearDragState();
      return;
    }

    // Persist all changes
    const promises: Promise<unknown>[] = [];

    // Only persist top-level if it actually changed
    if (JSON.stringify(topLevelSortableIds(finalTopLevel)) !== JSON.stringify(topLevelSortableIds(orig.topLevel))) {
      promises.push(persistTopLevelOrder(finalTopLevel));
    }

    // Persist any group that changed
    for (const [groupId, channelIds] of Object.entries(finalGroups) as Array<[string, string[]]>) {
      const origIds = orig.groups[groupId] ?? [];
      if (JSON.stringify(channelIds) !== JSON.stringify(origIds)) {
        promises.push(persistGroupOrder(groupId, channelIds));
      }
    }
    // Check for groups that had items removed (now empty or different)
    for (const [groupId, origIds] of Object.entries(orig.groups) as Array<[string, string[]]>) {
      if (!(groupId in finalGroups) && origIds.length > 0) {
        promises.push(persistGroupOrder(groupId, []));
      }
    }

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error("Failed to persist channel drag operation:", error);
    } finally {
      clearDragState();
    }
  }, [activeOrgId, activeTopLevel, activeGroupChannels, channelsById, channelGroupsById, clearDragState]);

  const handleDragCancel = clearDragState;

  /** Custom collision detection for nested sortable containers.
   *
   *  pointerWithin sorts ascending by intersection-ratio, so the largest
   *  droppable (the group wrapper) wins over individual channel items.
   *  When a channel is being dragged over a group we drill into the group
   *  to find the closest channel item — this makes both cross-container
   *  moves and within-group reordering work correctly.
   */
  const collisionDetection: CollisionDetection = useCallback((args: {
    active: { id: string | number };
    collisionRect: DOMRect;
    droppableRects: Map<string | number, DOMRect>;
    droppableContainers: Array<{ id: string | number }>;
    pointerCoordinates: { x: number; y: number } | null;
  }) => {
    const pw = pointerWithin(args as unknown as Parameters<typeof pointerWithin>[0]);
    if (pw.length === 0) return closestCenter(args as unknown as Parameters<typeof closestCenter>[0]);

    const overId = getFirstCollision(pw, "id");
    if (overId == null) return closestCenter(args as unknown as Parameters<typeof closestCenter>[0]);

    const overIdStr = String(overId);
    const activeParsed = parseSortableId(String(args.active.id));

    // When a channel is dragged over a group area, resolve to the closest
    // channel inside that group (or the container itself if the group is empty).
    //
    // We only drill into a group when the pointer is actually over the group
    // body (droppable).  The droppable ref lives on the body div, so
    // "group-container:xxx" only appears in pointerWithin results when the
    // pointer is over the body.  If only "group:xxx" (the sortable outer div)
    // is hit — e.g. the pointer is over the header — we return it as-is so
    // handleDragOver sees a top-level item and can move the channel OUT.
    if (activeParsed?.type === "channel") {
      const pointerOverBody = (groupId: string) =>
        pw.some((c: { id: string | number }) => String(c.id) === groupContainerId(groupId));

      let targetGroupId: string | null = null;

      if (overIdStr.startsWith("group-container:")) {
        targetGroupId = overIdStr.replace("group-container:", "");
      } else if (overIdStr.startsWith("group:")) {
        const gid = overIdStr.replace("group:", "");
        // Only drill in when the pointer is over the body droppable
        if (pointerOverBody(gid)) {
          targetGroupId = gid;
        }
        // Otherwise fall through — return group:xxx as a top-level hit
      }

      if (targetGroupId) {
        const groupChannels =
          (activeGroupChannels ?? channelIdsByGroup)[targetGroupId] ?? [];

        if (groupChannels.length > 0) {
          const channelSortableIds = groupChannels.map((id: string) => `channel:${id}`);
          const filteredContainers = args.droppableContainers.filter((c: { id: string | number }) =>
            channelSortableIds.includes(String(c.id))
          );
          const closest = closestCenter({ ...args, droppableContainers: filteredContainers } as unknown as Parameters<typeof closestCenter>[0]);
          if (closest.length > 0) return closest;
        }

        // Empty group — return the container so handleDragOver can move into it
        return [{ id: groupContainerId(targetGroupId) }];
      }
    }

    return [{ id: overId }];
  }, [activeGroupChannels, channelIdsByGroup]);

  return {
    dragItem,
    sensors,
    currentTopLevel,
    currentGroupChannels,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
