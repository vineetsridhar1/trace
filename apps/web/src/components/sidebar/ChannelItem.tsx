import { Hash, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "../../stores/entity";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";

export function ChannelItem({
  id,
  isActive,
  onClick,
  draggable = false,
  groupId,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
  draggable?: boolean;
  groupId?: string | null;
}) {
  const name = useEntityField("channels", id, "name");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `channel:${id}`,
    data: { type: "channel", id, groupId },
    disabled: !draggable,
  });

  const style = draggable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const content = (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={name ?? ""}>
        {draggable && (
          <div
            className="shrink-0 text-muted-foreground/50 cursor-grab active:cursor-grabbing opacity-0 group-hover/menu-item:opacity-100 transition-opacity"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={12} />
          </div>
        )}
        <Hash size={16} className="opacity-50" />
        <span>{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  if (!draggable) return content;

  return (
    <div ref={setNodeRef} style={style}>
      {content}
    </div>
  );
}

/** Channel item for the peek overlay (no SidebarMenuButton dependency) */
export function PeekChannelItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = useEntityField("channels", id, "name");

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
        isActive
          ? "bg-surface-elevated text-foreground"
          : "text-muted-foreground hover:bg-surface-elevated/50 hover:text-foreground"
      }`}
    >
      <Hash size={16} className="shrink-0 opacity-50" />
      <span className="truncate">{name}</span>
    </button>
  );
}
