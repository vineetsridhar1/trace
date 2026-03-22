import { useState, useEffect, useCallback, useMemo } from "react";
import type { Channel, ChannelGroup, Chat, Repo, InboxItem } from "@trace/gql";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useAuthStore } from "../stores/auth";
import { useEntityStore, useEntityIds } from "../stores/entity";
import type { EntityTableMap } from "../stores/entity";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
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

const REORDER_GROUPS_MUTATION = gql`
  mutation ReorderChannelGroups($input: ReorderChannelGroupsInput!) {
    reorderChannelGroups(input: $input) {
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
  const [peeking, setPeeking] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { state } = useSidebar();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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

  // Derive ungrouped channels and channel-to-group mapping
  const { ungroupedChannelIds, channelIdsByGroup } = useMemo(() => {
    const channels = useEntityStore.getState().channels;
    const byGroup: Record<string, string[]> = {};
    const ungrouped: string[] = [];

    for (const id of allChannelIds) {
      const channel = channels[id];
      if (!channel) continue;
      const gId = (channel as Channel & { groupId?: string | null }).groupId;
      if (gId) {
        if (!byGroup[gId]) byGroup[gId] = [];
        byGroup[gId].push(id);
      } else {
        ungrouped.push(id);
      }
    }

    return { ungroupedChannelIds: ungrouped, channelIdsByGroup: byGroup };
  }, [allChannelIds]);

  const sortableGroupIds = useMemo(() => groupIds.map((id) => `group:${id}`), [groupIds]);

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !activeOrgId) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Group reorder
    if (activeId.startsWith("group:") && overId.startsWith("group:")) {
      const fromGroupId = activeId.replace("group:", "");
      const toGroupId = overId.replace("group:", "");
      const newOrder = [...groupIds];
      const fromIndex = newOrder.indexOf(fromGroupId);
      const toIndex = newOrder.indexOf(toGroupId);
      if (fromIndex === -1 || toIndex === -1) return;
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, fromGroupId);

      // Optimistic update
      const { patch } = useEntityStore.getState();
      newOrder.forEach((id, i) => patch("channelGroups", id, { position: i } as Partial<ChannelGroup>));

      await client.mutation(REORDER_GROUPS_MUTATION, {
        input: { organizationId: activeOrgId, groupIds: newOrder },
      }).toPromise();
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
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  {/* Ungrouped channels */}
                  {ungroupedChannelIds.length > 0 && (
                    <SidebarMenu>
                      {ungroupedChannelIds.map((id) => (
                        <ChannelItem
                          key={id}
                          id={id}
                          isActive={id === activeChannelId}
                          onClick={() => setActiveChannelId(id)}
                        />
                      ))}
                    </SidebarMenu>
                  )}

                  {/* Groups */}
                  <SortableContext items={sortableGroupIds} strategy={verticalListSortingStrategy}>
                    {groupIds.map((groupId) => (
                      <ChannelGroupSection
                        key={groupId}
                        id={groupId}
                        channelIds={channelIdsByGroup[groupId] ?? []}
                        activeChannelId={activeChannelId}
                        onChannelClick={setActiveChannelId}
                        onAddChannel={handleAddChannelToGroup}
                        onDeleteGroup={handleDeleteGroup}
                      />
                    ))}
                  </SortableContext>

                  <DragOverlay>
                    {activeDragId?.startsWith("group:") ? (
                      <div className="rounded-md bg-surface-elevated px-2 py-1 text-xs font-semibold text-muted-foreground shadow-md">
                        Moving group...
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
