import { Fragment } from "react";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { gql } from "@urql/core";
import type { Channel, ChannelGroup } from "@trace/gql";
import { Folder, Hash } from "lucide-react";
import { useChannelDnd, customCollision, TOP_LEVEL_GAP_PREFIX } from "../../hooks/useChannelDnd";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { ChannelGroupSection } from "./ChannelGroupSection";
import { ChannelItem } from "./ChannelItem";
import { Skeleton } from "../ui/skeleton";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";

const DELETE_GROUP_MUTATION = gql`
  mutation DeleteChannelGroup($id: ID!) {
    deleteChannelGroup(id: $id)
  }
`;

function TopLevelDropIndicator({ index, isDragging }: { index: number; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${TOP_LEVEL_GAP_PREFIX}${index}`,
    data: { type: "top-level-gap", index },
  });

  return (
    <div ref={setNodeRef} className="relative z-10 h-2 -my-1 overflow-visible">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-full transition-all",
          isDragging
            ? isOver
              ? "h-0.5 bg-blue-500 opacity-100"
              : "h-px bg-border/80 opacity-100"
            : "h-px bg-transparent opacity-0",
        )}
      />
    </div>
  );
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
  topLevelItems,
}: {
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
  topLevelItems: TopLevelItem[];
}) {
  const {
    dragItem,
    dragOverGroupId,
    sensors,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
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

  const isDragging = dragItem !== null;

  return (
    <>
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
              <TopLevelDropIndicator index={0} isDragging={isDragging} />
              {topLevelItems.map((item, index) => (
                <Fragment key={`${item.kind}:${item.id}`}>
                  {item.kind === "channel" ? (
                    <SidebarMenu>
                      <ChannelItem
                        id={item.id}
                        isActive={item.id === activeChannelId}
                        onClick={() => onChannelClick(item.id)}
                        groupId={null}
                      />
                    </SidebarMenu>
                  ) : (
                    <ChannelGroupSection
                      id={item.id}
                      channelIds={channelIdsByGroup[item.id] ?? []}
                      activeChannelId={activeChannelId}
                      onChannelClick={onChannelClick}
                      onAddChannel={onAddChannel}
                      onDeleteGroup={(groupId) =>
                        client.mutation(DELETE_GROUP_MUTATION, { id: groupId }).toPromise()
                      }
                      isDropTarget={dragOverGroupId === item.id}
                      isDragging={isDragging}
                    />
                  )}
                  <TopLevelDropIndicator index={index + 1} isDragging={isDragging} />
                </Fragment>
              ))}
            </>
          )}
        </div>

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

