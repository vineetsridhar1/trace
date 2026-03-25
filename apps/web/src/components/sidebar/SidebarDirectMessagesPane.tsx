import { ChatItem } from "./ChatItem";
import { CreateChatDialog } from "./CreateChatDialog";
import { Skeleton } from "../ui/skeleton";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";
export interface SidebarDirectMessagesPaneProps {
  activeChatId: string | null;
  chatIds: string[];
  chatsLoading: boolean;
  onChatClick: (id: string) => void;
}

export function SidebarDirectMessagesPane({
  activeChatId,
  chatIds,
  chatsLoading,
  onChatClick,
}: SidebarDirectMessagesPaneProps) {

  return (
    <section className="flex h-full min-w-full max-w-full shrink-0 snap-start flex-col overflow-hidden">
      <div className="mt-2 flex h-[49px] shrink-0 items-center justify-between border-b border-border/70 px-3">
        <p className="truncate text-sm font-semibold text-sidebar-foreground">Direct Messages</p>
        <CreateChatDialog />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <SidebarMenu>
          {chatsLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <SidebarMenuItem key={index}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="h-4 w-4 shrink-0 rounded" />
                  <Skeleton className="h-3.5 w-[55%]" />
                </div>
              </SidebarMenuItem>
            ))
          ) : (
            chatIds.map((id) => (
              <ChatItem
                key={id}
                id={id}
                isActive={id === activeChatId}
                onClick={() => onChatClick(id)}
              />
            ))
          )}
        </SidebarMenu>

        {!chatsLoading && chatIds.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No conversations yet</p>
        )}
      </div>
    </section>
  );
}
