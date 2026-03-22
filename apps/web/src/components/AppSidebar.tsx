import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import type { Channel, ChannelGroup, Chat, Repo, InboxItem } from "@trace/gql";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  DragOverlay,
  type DragStartEvent,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { cn } from "../lib/utils";
import { useAuthStore } from "../stores/auth";
import { useEntityStore, useEntityIds } from "../stores/entity";
import type { EntityTableMap } from "../stores/entity";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
import { Hash } from "lucide-react";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { UserMenu } from "./sidebar/UserMenu";
import { ChannelItem } from "./sidebar/ChannelItem";
import { ChatItem } from "./sidebar/ChatItem";
import { ChannelGroupSection } from "./sidebar/ChannelGroupSection";
import { CreateChannelDialog } from "./sidebar/CreateChannelDialog";
import { CreateChatDialog } from "./sidebar/CreateChatDialog";
import { PeekOverlay } from "./sidebar/PeekOverlay";
import { InboxButton } from "./sidebar/InboxButton";
import { Skeleton } from "./ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

const CHANNELS_QUERY = gql`
  query Channels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
      position
      groupId
    }
  }
`;

const CHANNEL_GROUPS_QUERY = gql`
  query ChannelGroups($organizationId: ID!) {
    channelGroups(organizationId: $organizationId) {
      id
      name
      position
      isCollapsed
    }
  }
`;

const REPOS_QUERY = gql`
  query Repos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
      webhookActive
    }
  }
`;

const CHATS_QUERY = gql`
  query Chats($organizationId: ID!) {
    chats(organizationId: $organizationId) {
      id
      type
      name
      members {
        user {
          id
          name
          avatarUrl
        }
        joinedAt
      }
      createdAt
      updatedAt
    }
  }
`;

const INBOX_ITEMS_QUERY = gql`
  query InboxItems($organizationId: ID!) {
    inboxItems(organizationId: $organizationId) {
      id
      itemType
      status
      title
      summary
      payload
      userId
      sourceType
      sourceId
      createdAt
      resolvedAt
    }
  }
`;

const MOVE_CHANNEL_MUTATION = gql`
  mutation MoveChannel($input: MoveChannelInput!) {
    moveChannel(input: $input) {
      id
    }
  }
`;

const UPDATE_CHANNEL_GROUP_POSITION_MUTATION = gql`
  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {
    updateChannelGroup(id: $id, input: $input) {
      id
    }
  }
`;

const REORDER_CHANNELS_MUTATION = gql`
  mutation ReorderChannels($input: ReorderChannelsInput!) {
    reorderChannels(input: $input) {
      id
    }
  }
`;

const TOP_LEVEL_GAP_PREFIX = "top-level-gap:";
const GROUP_GAP_PREFIX = "group-gap:";

type TopLevelItem =
  | { kind: "channel"; id: string; position: number }
  | { kind: "group"; id: string; position: number };

function isTopLevelGapId(id: string | number) {
  return String(id).startsWith(TOP_LEVEL_GAP_PREFIX);
}

function isGroupGapId(id: string | number) {
  return String(id).startsWith(GROUP_GAP_PREFIX);
}

/** Prefer specific group targets; only use insertion gaps when the pointer is actually on a gap. */
const customCollision: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  const gapPointer = pw.filter((collision) => isTopLevelGapId(collision.id) || isGroupGapId(collision.id));
  if (gapPointer.length > 0) return gapPointer;
  const nonGapPointer = pw.filter((collision) => !isTopLevelGapId(collision.id) && !isGroupGapId(collision.id));
  if (nonGapPointer.length > 0) return nonGapPointer;
  if (pw.length > 0) return pw;

  return rectIntersection(args).filter((collision) => !isTopLevelGapId(collision.id) && !isGroupGapId(collision.id));
};

function TopLevelDropIndicator({
  index,
  isDragging,
}: {
  index: number;
  isDragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${TOP_LEVEL_GAP_PREFIX}${index}`,
    data: { type: "top-level-gap", index },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative z-10 h-2 -my-1 overflow-visible"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-full transition-all",
          isDragging
            ? isOver
              ? "h-0.5 bg-blue-500 opacity-100"
              : "h-px bg-border/80 opacity-100"
            : "h-px bg-transparent opacity-0"
        )}
      />
    </div>
  );
}

const DELETE_GROUP_MUTATION = gql`
  mutation DeleteChannelGroup($id: ID!) {
    deleteChannelGroup(id: $id)
  }
`;

export function AppSidebar() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const refreshTick = useUIStore((s) => s.refreshTick);
  const channelsById = useEntityStore((s) => s.channels);
  const channelGroupsById = useEntityStore((s) => s.channelGroups);
  const [peeking, setPeeking] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);
  const [dragChannelName, setDragChannelName] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const { state } = useSidebar();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNELS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.channels) {
      const fetched = result.data.channels as Array<Channel & { id: string }>;
      upsertMany("channels", fetched);
    }
    setChannelsLoading(false);
  }, [activeOrgId, upsertMany]);

  const fetchChannelGroups = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNEL_GROUPS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.channelGroups) {
      upsertMany("channelGroups", result.data.channelGroups as Array<ChannelGroup & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  const fetchRepos = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(REPOS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.repos) {
      upsertMany("repos", result.data.repos as Array<Repo & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  const fetchChats = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHATS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.chats) {
      upsertMany("chats", result.data.chats as Array<Chat & { id: string }>);
    }
    setChatsLoading(false);
  }, [activeOrgId, upsertMany]);

  const fetchInboxItems = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(INBOX_ITEMS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.inboxItems) {
      upsertMany("inboxItems", result.data.inboxItems as Array<InboxItem & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    fetchChannels();
    fetchChannelGroups();
    fetchChats();
    fetchRepos();
    fetchInboxItems();
  }, [fetchChannels, fetchChannelGroups, fetchChats, fetchRepos, fetchInboxItems, refreshTick]);

  // Close peek when sidebar gets pinned open
  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  const chatIds = useEntityIds("chats");

  // Channels sorted by position
  const allChannelIds = useEntityIds(
    "channels",
    undefined,
    (a, b) => {
      const ac = a as EntityTableMap["channels"];
      const bc = b as EntityTableMap["channels"];
      return (ac.position ?? 0) - (bc.position ?? 0);
    },
  );

  // Groups sorted by position
  const groupIds = useEntityIds(
    "channelGroups",
    undefined,
    (a, b) => {
      const ag = a as EntityTableMap["channelGroups"];
      const bg = b as EntityTableMap["channelGroups"];
      return (ag.position ?? 0) - (bg.position ?? 0);
    },
  );

  // Derive grouped channel ids plus the mixed top-level sequence of groups and ungrouped channels.
  const { channelIdsByGroup, topLevelItems } = useMemo(() => {
    const byGroup: Record<string, string[]> = {};
    const items: TopLevelItem[] = [];

    for (const id of allChannelIds) {
      const channel = channelsById[id];
      if (!channel) continue;
      const gId = (channel as Channel & { groupId?: string | null }).groupId;
      if (gId) {
        if (!byGroup[gId]) byGroup[gId] = [];
        byGroup[gId].push(id);
      } else {
        items.push({ kind: "channel", id, position: channel.position ?? 0 });
      }
    }

    for (const id of groupIds) {
      const group = channelGroupsById[id];
      if (!group) continue;
      items.push({ kind: "group", id, position: group.position ?? 0 });
    }

    items.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      if (a.kind !== b.kind) return a.kind === "channel" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return { channelIdsByGroup: byGroup, topLevelItems: items };
  }, [allChannelIds, groupIds, channelsById, channelGroupsById]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type: string; id: string } | undefined;
    if (data?.type === "channel") {
      const channels = useEntityStore.getState().channels;
      const channel = channels[data.id];
      setDragChannelName((channel as Channel | undefined)?.name ?? null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) {
      setDragOverGroupId(null);
      return;
    }

    const overData = over.data.current as { type: string; groupId?: string; index?: number } | undefined;
    if (overData?.type === "group" && overData.groupId) {
      setDragOverGroupId(overData.groupId);
    } else {
      setDragOverGroupId(null);
    }
  }

  async function persistTopLevelOrder(nextTopLevelItems: TopLevelItem[]) {
    const { patch } = useEntityStore.getState();
    const updates: Array<Promise<unknown>> = [];

    for (const [index, item] of nextTopLevelItems.entries()) {
      if (item.kind === "channel") {
        const channel = channelsById[item.id];
        if (!channel) continue;
        const currentGroupId = (channel as Channel & { groupId?: string | null }).groupId ?? null;
        const currentPosition = channel.position ?? 0;
        if (currentGroupId === null && currentPosition === index) continue;

        patch("channels", item.id, { groupId: null, position: index } as Partial<Channel>);
        updates.push(
          client.mutation(MOVE_CHANNEL_MUTATION, {
            input: { channelId: item.id, groupId: null, position: index },
          }).toPromise()
        );
        continue;
      }

      const group = channelGroupsById[item.id];
      if (!group) continue;
      const currentPosition = group.position ?? 0;
      if (currentPosition === index) continue;

      patch("channelGroups", item.id, { position: index } as Partial<ChannelGroup>);
      updates.push(
        client.mutation(UPDATE_CHANNEL_GROUP_POSITION_MUTATION, {
          id: item.id,
          input: { position: index },
        }).toPromise()
      );
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
    setDragChannelName(null);
    setDragOverGroupId(null);

    const { active, over } = event;
    if (!over || !activeOrgId) return;

    const activeData = active.data.current as { type: string; id: string; groupId?: string | null } | undefined;
    const overData = over.data.current as { type: string; groupId?: string; index?: number } | undefined;

    if (activeData?.type !== "channel") return;

    const channelId = activeData.id;
    const sourceGroupId = activeData.groupId ?? null;

    if (overData?.type === "top-level-gap") {
      const insertIndex = Math.max(0, Math.min(overData.index ?? topLevelItems.length, topLevelItems.length));
      const withoutDragged = topLevelItems.filter((item) => !(item.kind === "channel" && item.id === channelId));
      const nextTopLevelItems = [
        ...withoutDragged.slice(0, insertIndex),
        { kind: "channel", id: channelId, position: insertIndex } satisfies TopLevelItem,
        ...withoutDragged.slice(insertIndex),
      ];
      await Promise.all([
        persistTopLevelOrder(nextTopLevelItems),
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
      const nextTargetChannels = [
        ...targetWithoutDragged.slice(0, insertIndex),
        channelId,
        ...targetWithoutDragged.slice(insertIndex),
      ];

      await Promise.all([
        persistGroupOrder(targetGroupId, nextTargetChannels),
        ...(sourceGroupId && sourceGroupId !== targetGroupId
          ? [persistGroupOrder(sourceGroupId, (channelIdsByGroup[sourceGroupId] ?? []).filter((id) => id !== channelId))]
          : []),
      ]);
      return;
    }

    // Dropped on a group
    if (overData?.type === "group") {
      const targetGroupId = overData.groupId ?? null;
      if (sourceGroupId === targetGroupId) return;
      if (!targetGroupId) return;

      const { patch } = useEntityStore.getState();
      const targetChannels = channelIdsByGroup[targetGroupId] ?? [];
      const position = targetChannels.length;
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

  function handleAddChannelToGroup(groupId: string) {
    setCreateForGroupId(groupId);
    setCreateDialogOpen(true);
  }

  function handleAddChannelOrGroup() {
    setCreateForGroupId(null);
    setCreateDialogOpen(true);
  }

  async function handleDeleteGroup(groupId: string) {
    await client.mutation(DELETE_GROUP_MUTATION, { id: groupId }).toPromise();
  }

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-none">
        <SidebarHeader className="h-12 p-0 border-b border-border">
          <OrgSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <InboxButton />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <div className="flex items-center justify-between pr-1">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Channels
              </SidebarGroupLabel>
              <CreateChannelDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                defaultGroupId={createForGroupId}
                onTriggerClick={handleAddChannelOrGroup}
              />
            </div>
            <SidebarGroupContent>
              {channelsLoading ? (
                <SidebarMenu>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <Skeleton className="h-4 w-4 rounded shrink-0" />
                        <Skeleton className="h-3.5 w-[60%]" />
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={customCollision}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <div className="py-2">
                    {topLevelItems.length > 0 && (
                      <>
                        <TopLevelDropIndicator index={0} isDragging={dragChannelName !== null} />
                        {topLevelItems.map((item, index) => (
                          <Fragment key={`${item.kind}:${item.id}`}>
                            {item.kind === "channel" ? (
                              <SidebarMenu>
                                <ChannelItem
                                  id={item.id}
                                  isActive={item.id === activeChannelId}
                                  onClick={() => setActiveChannelId(item.id)}
                                  groupId={null}
                                />
                              </SidebarMenu>
                            ) : (
                              <ChannelGroupSection
                                id={item.id}
                                channelIds={channelIdsByGroup[item.id] ?? []}
                                activeChannelId={activeChannelId}
                                onChannelClick={setActiveChannelId}
                                onAddChannel={handleAddChannelToGroup}
                                onDeleteGroup={handleDeleteGroup}
                                isDropTarget={dragOverGroupId === item.id}
                                isDragging={dragChannelName !== null}
                              />
                            )}
                            <TopLevelDropIndicator index={index + 1} isDragging={dragChannelName !== null} />
                          </Fragment>
                        ))}
                      </>
                    )}
                  </div>

                  <DragOverlay dropAnimation={null}>
                    {dragChannelName ? (
                      <div className="flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-sidebar-accent px-2 text-sm text-sidebar-accent-foreground shadow-lg">
                        <Hash size={16} className="opacity-50" />
                        <span className="truncate">{dragChannelName}</span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
              {!channelsLoading && allChannelIds.length === 0 && groupIds.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No channels yet</p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <div className="flex items-center justify-between pr-1">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Direct Messages
              </SidebarGroupLabel>
              <CreateChatDialog />
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {chatsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <Skeleton className="h-4 w-4 rounded shrink-0" />
                        <Skeleton className="h-3.5 w-[55%]" />
                      </div>
                    </SidebarMenuItem>
                  ))
                ) : (
                  chatIds.map((id) => (
                    <ChatItem
                      key={id}
                      id={id}
                      isActive={id === activeChatId}
                      onClick={() => setActiveChatId(id)}
                    />
                  ))
                )}
              </SidebarMenu>
              {!chatsLoading && chatIds.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No conversations yet</p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-0 border-t border-border">
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-2" onMouseEnter={() => setPeeking(true)} />
      )}

      <PeekOverlay
        visible={peeking && state === "collapsed"}
        channelIds={allChannelIds}
        activeChannelId={activeChannelId}
        onChannelClick={setActiveChannelId}
        onMouseLeave={() => setPeeking(false)}
      />
    </>
  );
}
