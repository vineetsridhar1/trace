import { useState } from "react";
import { ChevronRight, Plus, GripVertical, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "../../stores/entity";
import { ChannelItem } from "./ChannelItem";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";
import { cn } from "../../lib/utils";

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
  const isCollapsed = useEntityField("channelGroups", id, "isCollapsed");
  const [collapsed, setCollapsed] = useState(isCollapsed ?? false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group:${id}`,
    data: { type: "group", id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center justify-between pr-1 group/group-header">
        <button
          className="flex flex-1 items-center gap-0.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronRight
            size={14}
            className={cn(
              "shrink-0 transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          />
          <span className="truncate">{name}</span>
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/group-header:opacity-100 transition-opacity">
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
          <div
            className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </div>
        </div>
      </div>
      {!collapsed && (
        <SidebarMenu>
          {channelIds.map((channelId) => (
            <ChannelItem
              key={channelId}
              id={channelId}
              isActive={channelId === activeChannelId}
              onClick={() => onChannelClick(channelId)}
            />
          ))}
          {channelIds.length === 0 && (
            <p className="px-4 py-1 text-xs text-muted-foreground/60 italic">No channels</p>
          )}
        </SidebarMenu>
      )}
    </div>
  );
}
