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
    originalRef.current = {
      topLevel: [...topLevelItems],
      groups: Object.fromEntries(
        Object.entries(channelIdsByGroup).map(([k, v]) => [k, [...v]])
      ),
    };
    setActiveTopLevel([...topLevelItems]);
    setActiveGroupChannels(
      Object.fromEntries(
        Object.entries(channelIdsByGroup).map(([k, v]) => [k, [...v]])
      )
    );
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

    const activeContainer = findContainer({
      sortableId: activeId,
      topLevelItems: activeTopLevel,
      channelIdsByGroup: activeGroupChannels,
    });

    // Determine the over container
    let overContainer: string | null = null;

    // Check if overId is a container itself (group-container:xxx or top-level)
    if (overId === TOP_LEVEL_CONTAINER) {
      overContainer = TOP_LEVEL_CONTAINER;
    } else if (overId.startsWith("group-container:")) {
      overContainer = overId;
    } else {
      overContainer = findContainer({
        sortableId: overId,
        topLevelItems: activeTopLevel,
        channelIdsByGroup: activeGroupChannels,
      });
    }

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // Moving between containers
    const channelId = activeParsed.id;
    const nextTopLevel = [...activeTopLevel];
    const nextGroups = Object.fromEntries(
      Object.entries(activeGroupChannels).map(([k, v]) => [k, [...v]])
    );

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
    const { patch } = useEntityStore.getState();
    const updates: Array<Promise<unknown>> = [];

    for (const [index, item] of items.entries()) {
      if (item.kind === "channel") {
        const channel = channelsById[item.id];
        if (channel?.groupId === null && (channel?.position ?? -1) === index) continue;
        patch("channels", item.id, { groupId: null, position: index } as Partial<Channel>);
        updates.push(
          client.mutation(MOVE_CHANNEL_MUTATION, {
            input: { channelId: item.id, groupId: null, position: index },
          }).toPromise()
        );
      } else {
        const group = channelGroupsById[item.id];
        if (!group || (group.position ?? -1) === index) continue;
        patch("channelGroups", item.id, { position: index } as Partial<ChannelGroup>);
        updates.push(
          client.mutation(UPDATE_CHANNEL_GROUP_POSITION_MUTATION, {
            id: item.id, input: { position: index },
          }).toPromise()
        );
      }
    }

    await Promise.all(updates);
  }

  async function persistGroupOrder(groupId: string, nextChannelIds: string[]) {
    const { patch } = useEntityStore.getState();
    nextChannelIds.forEach((id, index) => {
      patch("channels", id, { groupId, position: index } as Partial<Channel>);
    });
    await client.mutation(REORDER_CHANNELS_MUTATION, {
      input: { groupId, channelIds: nextChannelIds },
    }).toPromise();
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const dragging = dragItem;

    setDragItem(null);

    if (!over || !activeOrgId || !activeTopLevel || !activeGroupChannels) {
      setActiveTopLevel(null);
      setActiveGroupChannels(null);
      originalRef.current = null;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeParsed = parseSortableId(activeId);
    if (!activeParsed) {
      setActiveTopLevel(null);
      setActiveGroupChannels(null);
      originalRef.current = null;
      return;
    }

    // Handle same-container reorder
    const activeContainer = findContainer({
      sortableId: activeId,
      topLevelItems: activeTopLevel,
      channelIdsByGroup: activeGroupChannels,
    });

    let overContainer: string | null = null;
    if (overId === TOP_LEVEL_CONTAINER) {
      overContainer = TOP_LEVEL_CONTAINER;
    } else if (overId.startsWith("group-container:")) {
      overContainer = overId;
    } else {
      overContainer = findContainer({
        sortableId: overId,
        topLevelItems: activeTopLevel,
        channelIdsByGroup: activeGroupChannels,
      });
    }

    if (activeContainer && activeContainer === overContainer && activeId !== overId) {
      if (activeContainer === TOP_LEVEL_CONTAINER) {
        const oldIndex = activeTopLevel.findIndex((i) =>
          activeParsed.type === "channel"
            ? i.kind === "channel" && i.id === activeParsed.id
            : i.kind === "group" && i.id === activeParsed.id
        );
        const overParsed = parseSortableId(overId);
        const newIndex = overParsed
          ? activeTopLevel.findIndex((i) =>
              overParsed.type === "channel"
                ? i.kind === "channel" && i.id === overParsed.id
                : i.kind === "group" && i.id === overParsed.id
            )
          : -1;
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(activeTopLevel, oldIndex, newIndex);
          setActiveTopLevel(reordered);
          // Persist
          const orig = originalRef.current;
          setActiveTopLevel(null);
          setActiveGroupChannels(null);
          originalRef.current = null;
          await persistTopLevelOrder(reordered);
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
              const nextGroups = { ...activeGroupChannels, [groupId]: reordered };
              setActiveGroupChannels(nextGroups);
              setActiveTopLevel(null);
              setActiveGroupChannels(null);
              originalRef.current = null;
              await persistGroupOrder(groupId, reordered);
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

    setActiveTopLevel(null);
    setActiveGroupChannels(null);
    originalRef.current = null;

    if (!orig) return;

    // Persist all changes
    const promises: Promise<unknown>[] = [];

    // Persist top-level order
    promises.push(persistTopLevelOrder(finalTopLevel));

    // Persist any group that changed
    for (const [groupId, channelIds] of Object.entries(finalGroups)) {
      const origIds = orig.groups[groupId] ?? [];
      if (JSON.stringify(channelIds) !== JSON.stringify(origIds)) {
        promises.push(persistGroupOrder(groupId, channelIds));
      }
    }
    // Check for groups that had items removed (now empty or different)
    for (const [groupId, origIds] of Object.entries(orig.groups)) {
      if (!(groupId in finalGroups) && origIds.length > 0) {
        promises.push(persistGroupOrder(groupId, []));
      }
    }

    await Promise.all(promises);
  }, [dragItem, activeOrgId, activeTopLevel, activeGroupChannels, channelsById, channelGroupsById]);

  const handleDragCancel = useCallback(() => {
    setDragItem(null);
    setActiveTopLevel(null);
    setActiveGroupChannels(null);
    originalRef.current = null;
  }, []);

  /** Custom collision that prefers items inside groups */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    // First try pointer-within for precise targeting
    const pw = pointerWithin(args);
    if (pw.length > 0) return pw;
    // Fall back to closest center
    return closestCenter(args);
  }, []);

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
