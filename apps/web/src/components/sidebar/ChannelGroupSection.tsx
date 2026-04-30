import { useCallback } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "@trace/client-core";
import { SidebarChannelSection } from "./SidebarChannelSection";
import { cn } from "../../lib/utils";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { applyOptimisticPatch } from "../../lib/optimistic-entity";
import { groupContainerId, groupSortableIds } from "../../hooks/useChannelDnd";

const UPDATE_GROUP_MUTATION = gql`
  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {
    updateChannelGroup(id: $id, input: $input) {
      id
    }
  }
`;

export interface ChannelGroupSectionProps {
  key?: React.Key;
  id: string;
  channelIds: string[];
  activeChannelId: string | null;
  activeSessionGroupId: string | null;
  onAddChannel: (groupId: string) => void;
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

export function ChannelGroupSection({
  id,
  channelIds,
  activeChannelId,
  activeSessionGroupId,
  onAddChannel,
  onChannelClick,
  onSessionClick,
  onDeleteGroup,
}: ChannelGroupSectionProps) {
  const name = useEntityField("channelGroups", id, "name");
  const collapsed = useEntityField("channelGroups", id, "isCollapsed") ?? false;

  const toggleCollapse = useCallback(() => {
    const next = !collapsed;
    const rollback = applyOptimisticPatch("channelGroups", id, { isCollapsed: next });
    client
      .mutation(UPDATE_GROUP_MUTATION, { id, input: { isCollapsed: next } })
      .toPromise()
      .then((result: { error?: unknown }) => {
        if (result.error) throw result.error;
      })
      .catch((error: unknown) => {
        rollback();
        console.error("Failed to update channel group collapse:", error);
      });
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
    <div ref={setSortableRef} style={style} className="rounded-md py-1 transition-colors">
      <div
        className="flex items-center justify-between pr-1 group/group-header"
        {...attributes}
        {...listeners}
      >
        <button
          className="flex flex-1 items-center gap-1 px-0 py-1 text-[15px] font-medium text-white/35 transition-colors hover:text-white/70"
          onClick={toggleCollapse}
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
        >
          <ChevronRight
            size={14}
            className={cn("shrink-0 transition-transform duration-200", !collapsed && "rotate-90")}
          />
          <span className="truncate">{name}</span>
          <span className="ml-1 text-[10px] text-muted-foreground/60">{channelIds.length}</span>
        </button>
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover/group-header:opacity-100 transition-opacity"
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
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
            "rounded-md transition-colors",
            isOver && !isThisDragging && "bg-blue-500/10 ring-1 ring-blue-500/50",
          )}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {channelIds.map((channelId) => (
              <SidebarChannelSection
                key={channelId}
                channelId={channelId}
                groupId={id}
                isChannelActive={channelId === activeChannelId}
                hasActiveSession={activeSessionGroupId !== null}
                onChannelClick={onChannelClick}
                onSessionClick={onSessionClick}
              />
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
