import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { gql } from "@urql/core";
import type { Channel, ChannelGroup } from "@trace/gql";
import { Folder, Hash } from "lucide-react";
import { useChannelDnd, topLevelSortableIds } from "../../hooks/useChannelDnd";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { client } from "../../lib/urql";
import { ChannelGroupSection } from "./ChannelGroupSection";
import { ChannelItem } from "./ChannelItem";
import { Skeleton } from "../ui/skeleton";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";

const DELETE_GROUP_MUTATION = gql`
  mutation DeleteChannelGroup($id: ID!) {
    deleteChannelGroup(id: $id)
  }
`;

export interface SidebarChannelTreeProps {
  activeChannelId: string | null;
  activeOrgId: string | null;
  allChannelIds: string[];
  channelGroupsById: Record<string, ChannelGroup>;
  channelIdsByGroup: Record<string, string[]>;
  channelsById: Record<string, Channel>;
  channelsLoading: boolean;
  groupIds: string[];
  onAddChannel: (groupId: string) => void;
  onChannelClick: (id: string) => void;
  onDragActiveChange?: (active: boolean) => void;
  topLevelItems: TopLevelItem[];
}

export function SidebarChannelTree({
  activeChannelId,
  activeOrgId,
  allChannelIds,
  channelGroupsById,
  channelIdsByGroup,
  channelsById,
  channelsLoading,
  groupIds,
  onAddChannel,
  onChannelClick,
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
  } = useChannelDnd({ activeOrgId, topLevelItems, channelIdsByGroup, channelsById, channelGroupsById });

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
                <SidebarMenu key={`channel:${item.id}`}>
                  <ChannelItem
                    id={item.id}
                    isActive={item.id === activeChannelId}
                    onClick={() => onChannelClick(item.id)}
                    groupId={null}
                  />
                </SidebarMenu>
              ) : (
                <ChannelGroupSection
                  key={`group:${item.id}`}
                  id={item.id}
                  channelIds={currentGroupChannels[item.id] ?? []}
                  activeChannelId={activeChannelId}
                  onAddChannel={onAddChannel}
                  onChannelClick={onChannelClick}
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

      {allChannelIds.length === 0 && groupIds.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">No channels yet</p>
      )}
    </>
  );
}
