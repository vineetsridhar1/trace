import { memo } from "react";
import { useAuthStore, useEntityField } from "@trace/client-core";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { cn } from "../../lib/utils";
import { formatRelativeTime } from "../chat/message-utils";
import { sidebarRootLeftEdgeRowClass } from "./sidebarItemStyles";

export const ChatItem = memo(function ChatItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const members = useEntityField("chats", id, "members");
  const lastMessage = useEntityField("chats", id, "lastMessage");
  const lastMessageAt = useEntityField("chats", id, "lastMessageAt");
  const unreadCount = useEntityField("chats", id, "viewerUnreadCount") ?? 0;
  const currentUserId = useAuthStore((state) => state.user?.id);
  const otherMember = members?.find((member) => member.user.id !== currentUserId)?.user;
  const displayName = otherMember?.name ?? "Direct Message";
  const preview = lastMessage
    ? lastMessage.deletedAt
      ? "Message deleted"
      : `${lastMessage.parentMessageId ? "Reply: " : ""}${lastMessage.text || "New message"}`
    : "Start a conversation";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={onClick}
        tooltip={displayName}
        className={cn(
          "h-auto cursor-pointer gap-2 py-1.5 text-foreground hover:bg-white/10 data-[active=true]:bg-white/10 data-[active=true]:text-foreground",
          sidebarRootLeftEdgeRowClass,
          "pl-4",
        )}
      >
        {otherMember?.avatarUrl ? (
          <img src={otherMember.avatarUrl} alt="" className="size-7 shrink-0 rounded-full" />
        ) : (
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate text-sm", unreadCount > 0 && "font-semibold")}>
              {displayName}
            </span>
            {lastMessageAt && (
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {formatRelativeTime(lastMessageAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">{preview}</span>
            {unreadCount > 0 && (
              <span className="ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
