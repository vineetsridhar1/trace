import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { gql } from "@urql/core";
import type { Channel, ChannelGroup } from "@trace/gql";
import { Folder, Hash } from "lucide-react";
import { useChannelDnd, topLevelSortableIds } from "../../hooks/useChannelDnd";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { client } from "../../lib/urql";
import { ChannelGroupSection } from "./ChannelGroupSection";
import { SidebarChannelSection } from "./SidebarChannelSection";
import { Skeleton } from "../ui/skeleton";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";

const DELETE_GROUP_MUTATION = gql`
  mutation DeleteChannelGroup($id: ID!) {
    deleteChannelGroup(id: $id)
  }
`;

export interface SidebarChannelTreeProps {
  activeChannelId: string | null;
  activeSessionGroupId: string | null;
  activeOrgId: string | null;
  allChannelIds: string[];
  channelGroupsById: Record<string, ChannelGroup>;
  channelIdsByGroup: Record<string, string[]>;
  channelsById: Record<string, Channel>;
  channelsLoading: boolean;
  groupIds: string[];
  onAddChannel: (groupId: string) => void;
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
  onDragActiveChange?: (active: boolean) => void;
  topLevelItems: TopLevelItem[];
}

export function SidebarChannelTree({
  activeChannelId,
  activeSessionGroupId,
  activeOrgId,
  allChannelIds,
  channelGroupsById,
  channelIdsByGroup,
  channelsById,
  channelsLoading,
  groupIds,
  onAddChannel,
  onChannelClick,
  onSessionClick,
  onDragActiveChange,
  topLevelItems,
}: SidebarChannelTreeProps) {
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
  } = useChannelDnd({
    activeOrgId,
    topLevelItems,
    channelIdsByGroup,
    channelsById,
    channelGroupsById,
  });

  if (channelsLoading) {
    return (
      <SidebarMenu>
        {Array.from({ length: 4 }).map((_, index) => (
          <SidebarMenuItem key={index}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-[60%]" />
            </div>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  const topLevelIds = topLevelSortableIds(currentTopLevel);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(event) => {
          handleDragStart(event);
          onDragActiveChange?.(true);
        }}
        onDragOver={handleDragOver}
        onDragEnd={(event) => {
          handleDragEnd(event);
          onDragActiveChange?.(false);
        }}
        onDragCancel={() => {
          handleDragCancel();
          onDragActiveChange?.(false);
        }}
      >
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          <div className="py-2">
            {currentTopLevel.map((item: TopLevelItem) =>
              item.kind === "channel" ? (
                <SidebarChannelSection
                  key={`channel:${item.id}`}
                  channelId={item.id}
                  groupId={null}
                  isChannelActive={item.id === activeChannelId}
                  hasActiveSession={activeSessionGroupId !== null}
                  onChannelClick={onChannelClick}
                  onSessionClick={onSessionClick}
                />
              ) : (
                <ChannelGroupSection
                  key={`group:${item.id}`}
                  id={item.id}
                  channelIds={currentGroupChannels[item.id] ?? []}
                  activeChannelId={activeChannelId}
                  activeSessionGroupId={activeSessionGroupId}
                  onAddChannel={onAddChannel}
                  onChannelClick={onChannelClick}
                  onSessionClick={onSessionClick}
                  onDeleteGroup={(groupId) =>
                    client.mutation(DELETE_GROUP_MUTATION, { id: groupId }).toPromise()
                  }
                />
              ),
            )}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {dragItem ? (
            <div className="flex h-10 min-w-0 items-center gap-2 overflow-hidden rounded-[18px] border border-white/10 bg-black/70 px-4 text-sm text-white shadow-lg">
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

      {allChannelIds.length === 0 && groupIds.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-foreground">No channels yet</p>
      )}
    </>
  );
}
