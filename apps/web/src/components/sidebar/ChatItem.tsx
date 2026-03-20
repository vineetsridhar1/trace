import { MessageCircle } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";

export function ChatItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = useEntityField("chats", id, "name");
  const type = useEntityField("chats", id, "type");

  // For DMs, we'd ideally show the other user's name.
  // For now, fall back to "Direct Message" if no name.
  const displayName = name ?? (type === "dm" ? "Direct Message" : "Group Chat");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={displayName}>
        <MessageCircle size={16} className="opacity-50" />
        <span>{displayName}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
