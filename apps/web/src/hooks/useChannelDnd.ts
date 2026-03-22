import { useState } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
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

export const TOP_LEVEL_GAP_PREFIX = "top-level-gap:";
export const GROUP_GAP_PREFIX = "group-gap:";

export function isTopLevelGapId(id: string | number) {
  return String(id).startsWith(TOP_LEVEL_GAP_PREFIX);
}

export function isGroupGapId(id: string | number) {
  return String(id).startsWith(GROUP_GAP_PREFIX);
}

/** Prefer gap targets when the pointer is over one; fall back to group body targets. */
export const customCollision: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  const gapPointer = pw.filter((c) => isTopLevelGapId(c.id) || isGroupGapId(c.id));
  if (gapPointer.length > 0) return gapPointer;
  const nonGapPointer = pw.filter((c) => !isTopLevelGapId(c.id) && !isGroupGapId(c.id));
  if (nonGapPointer.length > 0) return nonGapPointer;
  if (pw.length > 0) return pw;
  return rectIntersection(args).filter((c) => !isTopLevelGapId(c.id) && !isGroupGapId(c.id));
};

export interface DragItemState {
  type: "channel" | "group";
  name: string;
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
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type: string; id: string } | undefined;
    if (data?.type === "channel") {
      const channel = useEntityStore.getState().channels[data.id];
      setDragItem({ type: "channel", name: channel?.name ?? "Channel" });
    } else if (data?.type === "group") {
      const group = useEntityStore.getState().channelGroups[data.id];
      setDragItem({ type: "group", name: group?.name ?? "Group" });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) { setDragOverGroupId(null); return; }
    const overData = over.data.current as { type: string; groupId?: string } | undefined;
    if (overData?.type === "group" && overData.groupId) {
      setDragOverGroupId(overData.groupId);
    } else {
      setDragOverGroupId(null);
    }
  }

  async function persistTopLevelOrder(nextItems: TopLevelItem[]) {
    const { patch } = useEntityStore.getState();
    const updates: Array<Promise<unknown>> = [];

    for (const [index, item] of nextItems.entries()) {
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

  async function handleDragEnd(event: DragEndEvent) {
    setDragItem(null);
    setDragOverGroupId(null);

    const { active, over } = event;
    if (!over || !activeOrgId) return;

    const activeData = active.data.current as { type: string; id: string; groupId?: string | null } | undefined;
    const overData = over.data.current as { type: string; groupId?: string; index?: number } | undefined;

    // Group drag: reorder in top-level list
    if (activeData?.type === "group" && overData?.type === "top-level-gap") {
      const groupId = activeData.id;
      const insertIndex = Math.max(0, Math.min(overData.index ?? topLevelItems.length, topLevelItems.length));
      const withoutDragged = topLevelItems.filter((item) => !(item.kind === "group" && item.id === groupId));
      const next = [
        ...withoutDragged.slice(0, insertIndex),
        { kind: "group", id: groupId, position: insertIndex } satisfies TopLevelItem,
        ...withoutDragged.slice(insertIndex),
      ];
      await persistTopLevelOrder(next);
      return;
    }

    // Channel drag
    if (activeData?.type !== "channel") return;
    const channelId = activeData.id;
    const sourceGroupId = activeData.groupId ?? null;

    if (overData?.type === "top-level-gap") {
      const insertIndex = Math.max(0, Math.min(overData.index ?? topLevelItems.length, topLevelItems.length));
      const withoutDragged = topLevelItems.filter((item) => !(item.kind === "channel" && item.id === channelId));
      const next = [
        ...withoutDragged.slice(0, insertIndex),
        { kind: "channel", id: channelId, position: insertIndex } satisfies TopLevelItem,
        ...withoutDragged.slice(insertIndex),
      ];
      await Promise.all([
        persistTopLevelOrder(next),
        ...(sourceGroupId
          ? [persistGroupOrder(sourceGroupId, (channelIdsByGroup[sourceGroupId] ?? []).filter((id) => id !== channelId))]
          : []),
      ]);
      return;
    }

    if (overData?.type === "group-gap" && overData.groupId) {
      const targetGroupId = overData.groupId;
      const targetWithoutDragged = (channelIdsByGroup[targetGroupId] ?? []).filter((id) => id !== channelId);
      const insertIndex = Math.max(0, Math.min(overData.index ?? targetWithoutDragged.length, targetWithoutDragged.length));
      const nextTarget = [
        ...targetWithoutDragged.slice(0, insertIndex),
        channelId,
        ...targetWithoutDragged.slice(insertIndex),
      ];
      await Promise.all([
        persistGroupOrder(targetGroupId, nextTarget),
        ...(sourceGroupId && sourceGroupId !== targetGroupId
          ? [persistGroupOrder(sourceGroupId, (channelIdsByGroup[sourceGroupId] ?? []).filter((id) => id !== channelId))]
          : []),
      ]);
      return;
    }

    // Dropped on a group body
    if (overData?.type === "group") {
      const targetGroupId = overData.groupId ?? null;
      if (sourceGroupId === targetGroupId || !targetGroupId) return;

      const { patch } = useEntityStore.getState();
      const position = (channelIdsByGroup[targetGroupId] ?? []).length;
      patch("channels", channelId, { groupId: targetGroupId, position } as Partial<Channel>);

      await Promise.all([
        client.mutation(MOVE_CHANNEL_MUTATION, {
          input: { channelId, groupId: targetGroupId, position },
        }).toPromise(),
        ...(sourceGroupId
          ? [persistGroupOrder(sourceGroupId, (channelIdsByGroup[sourceGroupId] ?? []).filter((id) => id !== channelId))]
          : []),
      ]);
    }
  }

  return {
    dragItem,
    dragOverGroupId,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
