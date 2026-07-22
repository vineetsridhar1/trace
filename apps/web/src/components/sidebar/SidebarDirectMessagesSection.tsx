import { ChatItem } from "./ChatItem";
import { CreateChatDialog } from "./CreateChatDialog";
import { Skeleton } from "../ui/skeleton";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";

export interface SidebarDirectMessagesSectionProps {
  activeChatId: string | null;
  chatIds: string[];
  chatsLoading: boolean;
  onChatClick: (id: string) => void;
}

export function SidebarDirectMessagesSection({
  activeChatId,
  chatIds,
  chatsLoading,
  onChatClick,
}: SidebarDirectMessagesSectionProps) {
  return (
    <div className="mt-4">
      <div className="group/direct-messages-header flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          People
        </span>
        <div className="opacity-70 transition-opacity group-hover/direct-messages-header:opacity-100">
          <CreateChatDialog />
        </div>
      </div>

      <SidebarMenu className="mt-1">
        {chatsLoading
          ? Array.from({ length: 3 }).map((_, index) => (
              <SidebarMenuItem key={index}>
                <div className="flex items-center gap-2 px-4 py-1.5">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-[55%]" />
                    <Skeleton className="h-2.5 w-[75%]" />
                  </div>
                </div>
              </SidebarMenuItem>
            ))
          : chatIds.map((id) => (
              <ChatItem
                key={id}
                id={id}
                isActive={id === activeChatId}
                onClick={() => onChatClick(id)}
              />
            ))}
      </SidebarMenu>

      {!chatsLoading && chatIds.length === 0 && (
        <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet</p>
      )}
    </div>
  );
}
