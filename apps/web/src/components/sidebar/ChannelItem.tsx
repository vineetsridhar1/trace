import { MessageSquare, Code } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useEntityField } from "../../stores/entity";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";

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
    isDragging,
  } = useDraggable({
    id: `channel:${id}`,
    data: { type: "channel", id, groupId: groupId ?? null },
  });

  return (
    <div
      ref={setNodeRef}
      style={isDragging ? { opacity: 0, pointerEvents: "none" } : undefined}
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
