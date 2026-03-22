import { useCallback } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { ChannelItem } from "./ChannelItem";
import { SidebarMenu } from "../ui/sidebar";
import { cn } from "../../lib/utils";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import type { ChannelGroup } from "@trace/gql";
import { groupContainerId, groupSortableIds } from "../../hooks/useChannelDnd";

const UPDATE_GROUP_MUTATION = gql`
  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {
    updateChannelGroup(id: $id, input: $input) {
      id
    }
  }
`;

interface ChannelGroupSectionProps {
  id: string;
  channelIds: string[];
  activeChannelId: string | null;
  onChannelClick: (id: string) => void;
  onAddChannel: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

export function ChannelGroupSection({
  id,
  channelIds,
  activeChannelId,
  onChannelClick,
  onAddChannel,
  onDeleteGroup,
}: ChannelGroupSectionProps) {
  const name = useEntityField("channelGroups", id, "name");
  const collapsed = useEntityField("channelGroups", id, "isCollapsed") ?? false;

  const toggleCollapse = useCallback(() => {
    const next = !collapsed;
    useEntityStore.getState().patch("channelGroups", id, { isCollapsed: next } as Partial<ChannelGroup>);
    client.mutation(UPDATE_GROUP_MUTATION, { id, input: { isCollapsed: next } }).toPromise();
  }, [collapsed, id]);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isThisDragging,
  } = useSortable({
    id: `group:${id}`,
    data: { type: "group", id },
  });

  // Droppable for the group body (so channels can be dragged into it)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: groupContainerId(id),
    data: { type: "group-container", groupId: id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isThisDragging ? 0.4 : undefined,
  };

  const sortableIds = groupSortableIds(channelIds);

  return (
    <div
      ref={setSortableRef}
      style={style}
      className="rounded-md transition-colors"
    >
      <div
        className="flex items-center justify-between pr-1 group/group-header"
        {...attributes}
        {...listeners}
      >
        <button
          className="flex flex-1 items-center gap-0.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          onClick={toggleCollapse}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChevronRight
            size={14}
            className={cn(
              "shrink-0 transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          />
          <span className="truncate">{name}</span>
          <span className="ml-1 text-[10px] text-muted-foreground/60">{channelIds.length}</span>
        </button>
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover/group-header:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            title="Add channel to group"
            onClick={() => onAddChannel(id)}
          >
            <Plus size={14} />
          </button>
          <button
            className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            title="Delete group"
            onClick={() => onDeleteGroup(id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div
          ref={setDropRef}
          className={cn(
            "ml-3 border-l border-border/60 pl-2 rounded-md transition-colors",
            isOver && !isThisDragging && "bg-blue-500/10 ring-1 ring-blue-500/50"
          )}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {channelIds.map((channelId) => (
              <SidebarMenu key={channelId}>
                <ChannelItem
                  id={channelId}
                  isActive={channelId === activeChannelId}
                  onClick={() => onChannelClick(channelId)}
                  groupId={id}
                />
              </SidebarMenu>
            ))}
          </SortableContext>
          {channelIds.length === 0 && (
            <p className="px-4 py-1 text-xs text-muted-foreground/60 italic">No channels</p>
          )}
        </div>
      )}
    </div>
  );
}
