import { MessageSquare, Code } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "../../stores/entity";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";
import { cn } from "../../lib/utils";

function ChannelIcon({ type, className }: { type: string | undefined; className?: string }) {
  if (type === "text") return <MessageSquare size={16} className={className} />;
  return <Code size={16} className={className} />;
}

export function ChannelItem({
  id,
  isActive,
  onClick,
  groupId,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
  groupId?: string | null;
}) {
  const name = useEntityField("channels", id, "name");
  const type = useEntityField("channels", id, "type");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `channel:${id}`,
    data: { type: "channel", id, groupId: groupId ?? null },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <SidebarMenuItem>
        <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={name ?? ""}>
          <ChannelIcon type={type} className="opacity-50" />
          <span>{name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </div>
  );
}

/** Channel item for the peek overlay (no drag) */
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
  const type = useEntityField("channels", id, "type");

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
        isActive
          ? "bg-surface-elevated text-foreground"
          : "text-muted-foreground hover:bg-surface-elevated/50 hover:text-foreground"
      )}
    >
      <ChannelIcon type={type} className="shrink-0 opacity-50" />
      <span className="truncate">{name}</span>
    </button>
  );
}
