import { useState, useEffect } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "../lib/utils";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
import { Hash, Folder } from "lucide-react";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { UserMenu } from "./sidebar/UserMenu";
import { ChannelItem } from "./sidebar/ChannelItem";
import { ChatItem } from "./sidebar/ChatItem";
import { ChannelGroupSection } from "./sidebar/ChannelGroupSection";
import { CreateChannelDialog } from "./sidebar/CreateChannelDialog";
import { BrowseChannelsDialog } from "./sidebar/BrowseChannelsDialog";
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
import { useSidebarData } from "../hooks/useSidebarData";
import { useChannelDnd, topLevelSortableIds } from "../hooks/useChannelDnd";

const DELETE_GROUP_MUTATION = gql`
  mutation DeleteChannelGroup($id: ID!) {
    deleteChannelGroup(id: $id)
  }
`;

export function AppSidebar() {
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const { state } = useSidebar();

  const [peeking, setPeeking] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);

  const {
    activeOrgId,
    channelsLoading,
    chatsLoading,
    chatIds,
    allChannelIds,
    groupIds,
    channelIdsByGroup,
    topLevelItems,
    channelsById,
    channelGroupsById,
  } = useSidebarData();

  const {
    dragItem,
    sensors,
    currentTopLevel,
    currentGroupChannels,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useChannelDnd({ activeOrgId, topLevelItems, channelIdsByGroup, channelsById, channelGroupsById });

  // Close peek when sidebar gets pinned open
  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  const isDragging = dragItem !== null;
  const topLevelIds = topLevelSortableIds(currentTopLevel);

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
              <div className="flex items-center gap-0.5">
                <BrowseChannelsDialog />
                <CreateChannelDialog
                  open={createDialogOpen}
                  onOpenChange={setCreateDialogOpen}
                  defaultGroupId={createForGroupId}
                  onTriggerClick={() => { setCreateForGroupId(null); setCreateDialogOpen(true); }}
                />
              </div>
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
                  collisionDetection={collisionDetection}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
                    <div className="py-2">
                      {currentTopLevel.map((item) =>
                        item.kind === "channel" ? (
                          <SidebarMenu key={`channel:${item.id}`}>
                            <ChannelItem
                              id={item.id}
                              isActive={item.id === activeChannelId}
                              onClick={() => setActiveChannelId(item.id)}
                              groupId={null}
                            />
                          </SidebarMenu>
                        ) : (
                          <ChannelGroupSection
                            key={`group:${item.id}`}
                            id={item.id}
                            channelIds={currentGroupChannels[item.id] ?? []}
                            activeChannelId={activeChannelId}
                            onChannelClick={setActiveChannelId}
                            onAddChannel={(gid) => { setCreateForGroupId(gid); setCreateDialogOpen(true); }}
                            onDeleteGroup={(gid) => client.mutation(DELETE_GROUP_MUTATION, { id: gid }).toPromise()}
                          />
                        )
                      )}
                    </div>
                  </SortableContext>

                  <DragOverlay dropAnimation={null}>
                    {dragItem ? (
                      <div className="flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-sidebar-accent px-2 text-sm text-sidebar-accent-foreground shadow-lg">
                        {dragItem.type === "channel" ? (
                          <Hash size={16} className="opacity-50" />
                        ) : (
                          <Folder size={16} className="opacity-50" />
                        )}
                        <span className="truncate">{dragItem.name}</span>
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
