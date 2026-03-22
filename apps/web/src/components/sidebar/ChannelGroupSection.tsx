import { useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { useEntityField } from "../../stores/entity";
import { ChannelItem } from "./ChannelItem";
import { SidebarMenu } from "../ui/sidebar";
import { cn } from "../../lib/utils";

interface ChannelGroupSectionProps {
  id: string;
  channelIds: string[];
  activeChannelId: string | null;
  onChannelClick: (id: string) => void;
  onAddChannel: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  isDropTarget?: boolean;
}

export function ChannelGroupSection({
  id,
  channelIds,
  activeChannelId,
  onChannelClick,
  onAddChannel,
  onDeleteGroup,
  isDropTarget = false,
}: ChannelGroupSectionProps) {
  const name = useEntityField("channelGroups", id, "name");
  const storedCollapsed = useEntityField("channelGroups", id, "isCollapsed");
  const [collapsed, setCollapsed] = useState(storedCollapsed ?? false);

  const { setNodeRef, isOver } = useDroppable({
    id: `group:${id}`,
    data: { type: "group", groupId: id },
  });

  const showDropHighlight = isDropTarget || isOver;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-all",
        showDropHighlight && "bg-blue-500/10 ring-1 ring-blue-500/50"
      )}
    >
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
          <span className="ml-1 text-[10px] text-muted-foreground/60">{channelIds.length}</span>
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
        </div>
      </div>
      {!collapsed && (
        <div className="ml-3 border-l border-border/60 pl-2">
          <SidebarMenu>
            {channelIds.map((channelId) => (
              <ChannelItem
                key={channelId}
                id={channelId}
                isActive={channelId === activeChannelId}
                onClick={() => onChannelClick(channelId)}
                groupId={id}
              />
            ))}
            {channelIds.length === 0 && (
              <p className="px-4 py-1 text-xs text-muted-foreground/60 italic">No channels</p>
            )}
          </SidebarMenu>
        </div>
      )}
    </div>
  );
}
