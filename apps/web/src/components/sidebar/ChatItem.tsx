import { memo } from "react";
import { MessageCircle } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { useAuthStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";

export const ChatItem = memo(function ChatItem({
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
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);
  const isUnread = useUIStore((s: { unreadChatIds: Record<string, boolean> }) => !!s.unreadChatIds[id]);

  const otherMember = members?.find((member) => member.user.id !== currentUserId);
  const displayName = name ?? (type === "dm" ? (otherMember?.user.name ?? "Direct Message") : "Group Chat");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={displayName}>
        <div className="relative">
          <MessageCircle size={16} className="opacity-50" />
          {isUnread && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          )}
        </div>
        <span className={isUnread ? "font-semibold" : ""}>{displayName}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
