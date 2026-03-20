import { MessageCircle } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
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
  const members = useEntityField("chats", id, "members") as
    | Array<{ user: { id: string; name: string } }>
    | undefined;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const otherMember = members?.find((member) => member.user.id !== currentUserId);
  const displayName = name ?? (type === "dm" ? (otherMember?.user.name ?? "Direct Message") : "Group Chat");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={displayName}>
        <MessageCircle size={16} className="opacity-50" />
        <span>{displayName}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
